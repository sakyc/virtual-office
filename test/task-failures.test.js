import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyTaskFailure, readTaskFailure, storedTaskFailure } from '../shared/task-failures.js';
import { generateWorkspaceTask } from '../server/workspace-tasks.js';
import { loadWorkspaceJobs } from '../server/dashboard-routes.js';

test('failure categories distinguish FX, balance, identity, provider, output and storage without exposing raw details', () => {
  const cases = [
    [{ code: 'AI_BILLING_FX_UNAVAILABLE' }, 'provider', 'FX_UNAVAILABLE'],
    [{ code: 'INSUFFICIENT_AI_BALANCE' }, 'provider', 'BALANCE_INSUFFICIENT'],
    [{ code: 'ACTIVE_SUBSCRIPTION_REQUIRED' }, 'provider', 'SUBSCRIPTION_REQUIRED'],
    [{ code: 'AI_BILLING_ACCESS_DENIED' }, 'provider', 'ACCESS_EXPIRED'],
    [{ code: 'AI_BILLING_PRICING_REQUIRED' }, 'provider', 'MODEL_UNAVAILABLE'],
    [{ status: 401 }, 'provider', 'PROVIDER_AUTH'], [{ status: 404 }, 'provider', 'PROVIDER_MODEL'],
    [{ status: 429 }, 'provider', 'PROVIDER_BUSY'], [{ status: 529 }, 'provider', 'PROVIDER_BUSY'],
    [{ name: 'APIConnectionTimeoutError' }, 'provider', 'PROVIDER_CONNECTION'],
    [{ status: 503 }, 'provider', 'PROVIDER_UNAVAILABLE'],
    [{ code: 'TASK_OUTPUT_TRUNCATED' }, 'generation', 'OUTPUT_TRUNCATED'],
    [{ code: 'TASK_OUTPUT_INVALID' }, 'generation', 'OUTPUT_INVALID'],
    [{ code: 'AI_USAGE_UNAVAILABLE' }, 'provider', 'BILLING_UNRESOLVED'],
    [{ code: 'ER_BAD_FIELD_ERROR' }, 'save', 'STORAGE_FAILED'],
    [{ status: 403 }, 'access', 'ACCESS_EXPIRED'], [{ code: 'ER_CONNECTION_LOST' }, 'access', 'UNKNOWN'], [{}, '', 'UNKNOWN'],
  ];
  for (const [error, phase, code] of cases) {
    error.message = 'PRIVATE prompt SQL password sk-secret';
    assert.equal(classifyTaskFailure(error, phase).code, code);
    const stored = storedTaskFailure(error, phase);
    assert.doesNotMatch(stored, /PRIVATE|password|sk-secret/);
    assert.equal(readTaskFailure(stored).code, code);
    assert.doesNotMatch(readTaskFailure(stored).message, /PRIVATE|password|sk-secret/);
  }
  for (const raw of ['old generic error', '{"taskFailure":"<script>private</script>"}', '{"message":"secret"}', null]) assert.equal(readTaskFailure(raw).code, 'UNKNOWN');
});

test('task generation preserves safe billing/provider failure codes and makes no retry', async () => {
  const task = { model: 'model', maxTokens: 1000, title: 'Draft', agent: { name: 'QA', role: 'Writer', instructions: '' } };
  for (const [error, code] of [[{ code: 'AI_BILLING_FX_UNAVAILABLE', status: 503 }, 'FX_UNAVAILABLE'], [{ status: 401 }, 'PROVIDER_AUTH'], [{ name: 'APIConnectionError' }, 'PROVIDER_CONNECTION']]) {
    let calls = 0;
    await assert.rejects(generateWorkspaceTask({ task, apiClient: { messages: { async create() { calls++; throw Object.assign(Error('PRIVATE'), error); } } } }), failure => classifyTaskFailure(failure).code === code);
    assert.equal(calls, 1);
  }
  for (const [reply, code] of [[{ stop_reason: 'max_tokens' }, 'OUTPUT_TRUNCATED'], [{ content: [{ type: 'text', text: 'not JSON' }] }, 'OUTPUT_INVALID'], [{ content: [{ type: 'text', text: '{"fields":[]}' }] }, 'OUTPUT_INVALID']]) {
    await assert.rejects(generateWorkspaceTask({ task, apiClient: { messages: { async create() { return reply; } } } }), failure => classifyTaskFailure(failure).code === code);
  }
});

test('jobs API exposes whitelist reason, never stored arbitrary messages, and leaves historical failures unknown', async () => {
  const rows = [{ id: 1, status: 'failed', error: '{"taskFailure":"FX_UNAVAILABLE","message":"PRIVATE"}' }, { id: 2, status: 'failed', error: 'PRIVATE historic exception' }, { id: 3, status: 'done', error: 'PRIVATE' }];
  const jobs = await loadWorkspaceJobs({ execute: async () => [rows] }, 1);
  assert.equal(jobs[0].failure.code, 'FX_UNAVAILABLE'); assert.equal(jobs[1].failure.code, 'UNKNOWN'); assert.equal(jobs[2].failure, undefined);
  assert.doesNotMatch(JSON.stringify(jobs), /PRIVATE/);
});
