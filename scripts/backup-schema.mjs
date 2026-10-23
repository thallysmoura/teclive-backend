import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
if (!process.env.DATABASE_URL && existsSync(resolve(root, '.env'))) process.loadEnvFile(resolve(root, '.env'));
const url = new URL(process.env.DATABASE_URL ?? '');
const database = decodeURIComponent(url.pathname.slice(1));
if (!['localhost', '127.0.0.1'].includes(url.hostname) || database !== 'eugestor') throw new Error('O backup deve usar somente o banco local eugestor.');
const user = decodeURIComponent(url.username);
const container = process.env.PG_CONTAINER ?? 'eugestor-postgres';
function docker(args, input) {
  try {
    return execFileSync('docker', ['exec', ...(input ? ['-i'] : []), container, ...args], { encoding: 'utf8', input, maxBuffer: 10 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch { throw new Error(`Falha no comando PostgreSQL: ${args[0]}. Nenhuma credencial foi exibida.`); }
}
const dumpArgs = ['pg_dump', '-U', user, '-d', database, '--schema-only', '--no-owner', '--no-privileges'];
const sql = docker(dumpArgs).trimEnd() + '\n';
if (/^(INSERT INTO|COPY .* FROM stdin|CREATE ROLE|ALTER ROLE|CREATE USER)\b/m.test(sql)) throw new Error('O snapshot deve conter apenas estrutura, sem registros ou usuários do banco.');
const tables = [...sql.matchAll(/^CREATE TABLE public\.([^\s(]+)/gm)].map((match) => match[1]).sort();
if (!tables.includes('users') || !tables.includes('access_logs') || !tables.includes('notifications')) throw new Error('Snapshot incompleto.');
let verified = false;
if (process.argv.includes('--verify')) {
  const temporaryDatabase = `eugestor_schema_check_${randomBytes(6).toString('hex')}`;
  docker(['createdb', '-U', user, temporaryDatabase]);
  try {
    docker(['psql', '-X', '-U', user, '-d', temporaryDatabase, '--set=ON_ERROR_STOP=1', '--single-transaction'], sql);
    const restored = docker(['pg_dump', '-U', user, '-d', temporaryDatabase, '--schema-only', '--no-owner', '--no-privileges']);
    // PostgreSQL can expand varchar[] -> text[] casts into casts on each literal on restore.
    // Normalize that equivalent representation and pg_dump's per-run safety token.
    const normalize = (value) => value
      .replace(/^\\(?:un)?restrict .*$/gm, '')
      .replace(/^-- Dumped .*$/gm, '')
      .replace(/\(\(ARRAY\[([^\n]*?)\]\)::text\[\]\)/g, (_match, literals) => `(ARRAY[${literals.replace(/('(?:''|[^'])*'::character varying)/g, '($1)::text')}])`)
      .replace(/\r/g, '').trim();
    if (normalize(restored) !== normalize(sql)) throw new Error('A estrutura restaurada difere do snapshot.');
    verified = true;
  } finally { docker(['dropdb', '-U', user, temporaryDatabase]); }
}
const target = resolve(root, 'database');
mkdirSync(target, { recursive: true });
writeFileSync(resolve(target, 'schema.sql'), sql, 'utf8');
writeFileSync(resolve(target, 'schema.metadata.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  database, tool: docker(['pg_dump', '--version']).trim(),
  schemaOnly: true, dataIncluded: false, credentialsIncluded: false,
  restoreVerified: verified, tables, sha256: createHash('sha256').update(sql).digest('hex'),
}, null, 2) + '\n');
console.log(`Estrutura salva em database/schema.sql: ${tables.length} tabelas; restauração verificada: ${verified ? 'sim' : 'não'}. Sem dados de usuários ou credenciais.`);
