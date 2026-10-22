import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

test('office bridge only accepts same-origin tenant workload messages', () => {
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(source, /event\.origin !== location\.origin/);
  assert.match(source, /virtual-office:worker-loads/);
  assert.match(source, /Number\(worker\.activeJobs\) > 0 \? 'working' : 'idle'/);
});

test('React office host sends only worker summary payload to same-origin iframe', () => {
  const source = readFileSync(new URL('../src/react/main.jsx', import.meta.url), 'utf8');
  assert.match(source, /postMessage\(\{ type: 'virtual-office:worker-loads', workers: body\.workers \}, window\.location\.origin\)/);
  assert.match(source, /fetch\('\/api\/dashboard\/workers'/);
});
