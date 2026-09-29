// Runs the backend API and the frontend dev server together; Ctrl+C stops both.
// Starts the project's PostgreSQL first when it is not running (see ensure-db.mjs).
import { spawn } from 'node:child_process';
import { ensureDatabase } from './ensure-db.mjs';

if (!(await ensureDatabase())) console.log('[db] Continuing without a database: the API will report errors until PostgreSQL is running.');

const apps = [
  { name: 'api', dir: 'backend', color: '\x1b[36m' },
  { name: 'web', dir: 'frontend', color: '\x1b[35m' },
];

const children = apps.map(({ name, dir, color }) => {
  // One command string (no args array) so Windows' shell resolution of npm.cmd is warning-free.
  const child = spawn('npm run dev', { cwd: dir, shell: true, env: process.env });
  const prefix = `${color}[${name}]\x1b[0m `;
  const pipe = (stream, out) =>
    stream.on('data', (buf) => {
      for (const line of buf.toString().split(/\r?\n/)) if (line.trim()) out.write(prefix + line + '\n');
    });
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    console.log(`${prefix}exited with code ${code}`);
    shutdown(code ?? 0);
  });
  return child;
});

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const c of children) if (c.exitCode === null) c.kill();
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('Starting API on http://localhost:4000 and app on http://localhost:5173 ...');
