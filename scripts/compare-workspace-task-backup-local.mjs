// Read-only data comparison for the already-applied 015 migration. Never restores a dump.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { migrationConnectionOptions, connectApprovedNonProduction } from '../server/migrations/database.js';

function inserts(source, after) {
  const tables = {};
  for (const line of source.split(/\r?\n/)) {
    const match = /^INSERT INTO `([a-z0-9_]+)` VALUES (.*);$/.exec(line);
    if (!match || match[1] === 'schema_migrations') continue;
    const table = match[1], values = match[2]; let quoted = false, start = -1, fields = [], fieldStart = 0;
    for (let i = 0; i < values.length; i++) {
      const char = values[i];
      if (quoted && char === '\\') { i++; continue; }
      if (char === "'") { quoted = !quoted; continue; }
      if (quoted) continue;
      if (char === '(') { start = i; fieldStart = i + 1; fields = []; }
      else if (char === ',' && start >= 0) { fields.push(values.slice(fieldStart, i)); fieldStart = i + 1; }
      else if (char === ')' && start >= 0) {
        fields.push(values.slice(fieldStart, i));
        if (after && table === 'jobs') assert.equal(fields.pop(), 'NULL', 'NEW_REQUEST_KEY_NOT_NULL');
        (tables[table] ||= []).push(fields.join(',')); start = -1;
      }
    }
    assert.equal(quoted, false); assert.equal(start, -1);
  }
  return Object.fromEntries(Object.entries(tables).sort().map(([table, rows]) => [table, rows.sort()]));
}
let c;
try {
  assert.equal(process.argv[2], '--confirm-non-production');
  const original = process.argv[3]; assert.match(original || '', /^D:[/\\]VetendCode[/\\]database-backups[/\\]virtual-office-before-015-[a-zA-Z0-9]+[/\\]before-015\.sql$/);
  const options = migrationConnectionOptions(); assert.equal(options.database, 'virtual_office'); assert.equal(options.port, 3306); assert.notEqual(process.env.NODE_ENV, 'production'); assert(['127.0.0.1','localhost','::1'].includes(options.host));
  c = await connectApprovedNonProduction(); const [[target]] = await c.execute('SELECT DATABASE() AS db, @@datadir AS datadir'); assert.equal(target.db, 'virtual_office'); assert.match(target.datadir.replaceAll('\\','/'), /^C:\/laragon\/data\/mysql-8\//i);
  const directory = await mkdtemp('D:/VetendCode/database-backups/virtual-office-after015-verification-'), after = directory + '/after-015.sql';
  await new Promise((resolve, reject) => { const child = spawn('C:/laragon/bin/mysql/mysql-8.0.30-winx64/bin/mysqldump.exe', ['--host='+options.host,'--port='+options.port,'--user='+options.user,'--single-transaction','--skip-lock-tables','--no-tablespaces','--set-gtid-purged=OFF','--column-statistics=0','--hex-blob','--result-file='+after,options.database], { env: { ...process.env, MYSQL_PWD: options.password }, windowsHide:true,stdio:'ignore' }); child.once('error',()=>reject(Error('DUMP_FAILED'))); child.once('exit',code=>code===0?resolve():reject(Error('DUMP_FAILED'))); });
  const previous = inserts(await readFile(original,'utf8'), false), current = inserts(await readFile(after,'utf8'), true);
  const differences = [...new Set([...Object.keys(previous),...Object.keys(current)])].filter(table=>JSON.stringify(previous[table])!==JSON.stringify(current[table]));
  console.log(JSON.stringify({ original, after, comparedTablesWithRows:Object.keys(previous).length, differences, existingRowsUnchanged:differences.length===0, ignoredNewColumn:'jobs.request_key=NULL', schemaHistoryExcluded:true }));
  assert.deepEqual(differences, []);
} catch(error) { console.error(JSON.stringify({failed:true,code:error.code||'BACKUP_DATA_COMPARISON_FAILED'}));process.exitCode=1; }
finally { await c?.end(); }
