// Makes sure the project's PostgreSQL is running before the app starts (`npm run dev`, `npm run db:start`).
// Reads the server address from backend/.env (DATABASE_URL). When nothing answers there and the
// server is on this machine, starts the project's own PostgreSQL data folder on that port with
// pg_ctl. It never starts or stops any other PostgreSQL server.
//
// Defaults fit this project's Windows install; override with environment variables if needed:
//   PG_CTL  path to pg_ctl        (default %LOCALAPPDATA%\pgsql\bin\pg_ctl.exe)
//   PG_DATA the data folder       (default %LOCALAPPDATA%\pgdata16)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

/** host / port of DATABASE_URL in backend/.env, or null when it cannot be read. */
export function databaseAddress(envFile = path.join(root, 'backend', '.env')) {
  if (!existsSync(envFile)) return null;
  const line = readFileSync(envFile, 'utf8').match(/^\s*DATABASE_URL\s*=\s*(\S+)/m);
  if (!line) return null;
  try {
    const url = new URL(line[1]);
    return { host: url.hostname, port: Number(url.port || 5432) };
  } catch {
    return null;
  }
}

/** Whether something accepts TCP connections on host:port. */
export function isListening(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

/** Starts the project's PostgreSQL when it is not running. Returns true when the database answers. */
export async function ensureDatabase({ log = console.log, envFile } = {}) {
  const addr = databaseAddress(envFile);
  if (!addr) {
    log('[db] backend/.env has no DATABASE_URL yet (run `npm run setup` once).');
    return false;
  }
  if (await isListening(addr.host, addr.port)) return true;
  if (!LOCAL_HOSTS.has(addr.host)) {
    log(`[db] PostgreSQL at ${addr.host}:${addr.port} is not answering, and it is not on this machine — start it there.`);
    return false;
  }

  const local = process.env.LOCALAPPDATA ?? '';
  const pgCtl = process.env.PG_CTL ?? path.join(local, 'pgsql', 'bin', process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl');
  const dataDir = process.env.PG_DATA ?? path.join(local, 'pgdata16');
  if (!existsSync(pgCtl) || !existsSync(path.join(dataDir, 'PG_VERSION'))) {
    log(`[db] PostgreSQL is not running on port ${addr.port}, and pg_ctl or its data folder was not found.`);
    log('[db] Start it yourself, or set PG_CTL and PG_DATA to your install.');
    return false;
  }

  log(`[db] PostgreSQL is not running on port ${addr.port} — starting it (${dataDir})...`);
  try {
    // -w waits until it accepts connections; a leftover lock file from a crash is handled by pg_ctl.
    // No pipes: on Windows the server inherits them and the call would never return. Its messages go to the log.
    execFileSync(pgCtl, ['-D', dataDir, '-l', `${dataDir}.log`, '-o', `-p ${addr.port}`, '-w', '-t', '60', 'start'], { stdio: 'ignore', windowsHide: true });
  } catch (e) {
    log(`[db] Could not start PostgreSQL (exit code ${e.status ?? '?'}).`);
    log(`[db] See the log: ${dataDir}.log`);
    return false;
  }
  const ok = await isListening(addr.host, addr.port);
  log(ok ? `[db] PostgreSQL is running on port ${addr.port}.` : `[db] PostgreSQL still does not answer on port ${addr.port}; see ${dataDir}.log`);
  return ok;
}

// `npm run db:start`; also runs before `npm run dev` in backend/ (`--soft`: warn but let the server start).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const ok = await ensureDatabase();
  if (ok) console.log('[db] Ready.');
  else if (process.argv.includes('--soft')) console.log('[db] Continuing without a database: logins and pages will fail until PostgreSQL is running.');
  process.exit(ok || process.argv.includes('--soft') ? 0 : 1);
}
