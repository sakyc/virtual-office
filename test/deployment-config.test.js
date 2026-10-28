import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('deployment runs one non-cluster worker on loopback port 3101, not occupied 3001', () => {
  const config = createRequire(import.meta.url)('../deploy/ecosystem.config.cjs');
  const app = config.apps[0];
  assert.equal(config.apps.length, 1);
  assert.equal(app.instances, 1);
  assert.equal(app.exec_mode, 'fork');
  assert.equal(app.env.HOST, '127.0.0.1');
  assert.equal(app.env.PORT, '3101');
  assert.match(read('server/index.js'), /app\.listen\(PORT, process\.env\.HOST \|\| '0\.0\.0\.0'/);
  assert.match(read('server/index.js'), /app\.set\('trust proxy', 'loopback'\)/);
});
test('Apache host templates isolate public catalog from app and preserve HTTPS proxy context', () => {
  const landing = read('deploy/apache/landing-https.conf');
  const app = read('deploy/apache/app-https.conf');
  assert.match(landing, /ProxyPassMatch \^\/api\/plans\$/);
  assert.match(landing, /RequestHeader unset Cookie/);
  assert.match(landing, /Header always unset Set-Cookie/);
  assert.match(landing, /\[R=404,L\]/);
  for (const conf of [landing, app]) {
    assert.match(conf, /ProxyRequests Off/);
    assert.match(conf, /ProxyAddHeaders Off/);
    assert.match(conf, /X-Forwarded-Proto "https"/);
    assert.match(conf, /X-Forwarded-For "expr=%\{REMOTE_ADDR\}"/);
    assert.doesNotMatch(conf, /:3001/);
  }
  assert.match(app, /timeout=300/);
});
