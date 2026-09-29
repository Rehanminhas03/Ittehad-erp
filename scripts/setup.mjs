// One-time local setup (no Docker). Requires a running PostgreSQL 16+ and its superuser login.
//   npm run setup
//   PG_SUPERUSER_URL=postgres://postgres:secret@127.0.0.1:5432/postgres npm run setup
// Steps: install dependencies -> create roles/databases (idempotent) -> write backend/.env if
// missing -> build the schema from scratch and seed.
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const superUrl = process.env.PG_SUPERUSER_URL ?? 'postgres://postgres:postgres@127.0.0.1:5433/postgres';
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' });

console.log('1/4 Installing dependencies...');
run('npm install', path.join(root, 'backend'));
run('npm install', path.join(root, 'frontend'));

console.log('2/4 Creating database roles and databases...');
const pg = createRequire(path.join(root, 'backend', 'package.json'))('pg');
const client = new pg.Client({ connectionString: superUrl });
await client.connect();
const exists = async (sql, v) => (await client.query(sql, [v])).rowCount > 0;
if (!(await exists('select 1 from pg_roles where rolname = $1', 'dms'))) await client.query("create role dms login password 'dms' createdb");
if (!(await exists('select 1 from pg_roles where rolname = $1', 'dms_app'))) await client.query("create role dms_app login password 'dms_app'");
for (const db of ['dms', 'dms_test']) {
  if (!(await exists('select 1 from pg_database where datname = $1', db))) await client.query(`create database ${db} owner dms`);
  await client.query(`grant connect on database ${db} to dms_app`);
}
await client.end();

console.log('3/4 Writing backend/.env (if missing) and pointing .env/.env.test at this server...');
const envPath = path.join(root, 'backend', '.env');
if (!existsSync(envPath)) copyFileSync(path.join(root, 'backend', '.env.example'), envPath);
const { hostname, port } = new URL(superUrl);
const server = `${hostname}:${port || 5432}`;
for (const file of [envPath, path.join(root, 'backend', '.env.test')]) {
  // Rewrites the host:port of every postgres:// URL in the file.
  writeFileSync(file, readFileSync(file, 'utf8').replace(/(postgres:\/\/[^@\s]+@)[^/\s]+\//g, `$1${server}/`));
}

console.log('4/4 Building the database from the models and seeding...');
run('npm run db:fresh', path.join(root, 'backend'));

console.log('\nDone. Start everything with:  npm run dev');
console.log('Then open http://localhost:5173 and sign in as admin@dms.local / Admin@12345');
