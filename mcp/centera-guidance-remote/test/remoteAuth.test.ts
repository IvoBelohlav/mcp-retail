import test from 'node:test';
import assert from 'node:assert/strict';

import { verifyBearerToken } from '../src/remoteAuth.ts';

test('verifyBearerToken: accepts correct token (expected)', async () => {
  const res = await verifyBearerToken({ requiredToken: 'abc' }, 'abc');
  assert.ok(res);
  assert.equal(res?.token, 'abc');
});

test('verifyBearerToken: rejects missing token (edge)', async () => {
  const res = await verifyBearerToken({ requiredToken: 'abc' }, undefined);
  assert.equal(res, undefined);
});

test('verifyBearerToken: rejects wrong token (error)', async () => {
  const res = await verifyBearerToken({ requiredToken: 'abc' }, 'nope');
  assert.equal(res, undefined);
});
