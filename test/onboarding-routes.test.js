import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify, validateOnboardingPayload } from '../server/auth/onboarding-routes.js';

test('onboarding payload normalizes names and generates a deterministic organization slug', () => {
  assert.deepEqual(validateOnboardingPayload({ organizationName: '  Studio  KreaTif  ', workspaceName: ' Tim Utama ', teamSize: '6-20' }), {
    organizationName: 'Studio KreaTif', organizationSlug: 'studio-kreatif', workspaceName: 'Tim Utama', clientName: '', clientBrief: '', teamSize: '6-20',
  });
  assert.equal(slugify('Kreasi & Co.'), 'kreasi-co');
});

test('onboarding rejects missing required names and unrecognized team sizes', () => {
  assert.throws(() => validateOnboardingPayload({ workspaceName: 'Main' }), { status: 400 });
  assert.throws(() => validateOnboardingPayload({ organizationName: 'Acme', workspaceName: 'Main', teamSize: 'many' }), { status: 400 });
});
