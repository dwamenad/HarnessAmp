import assert from 'node:assert/strict';
import { test } from 'node:test';

import { signSessionPayload, verifySessionPayload } from '../api/_auth.js';

test('session payloads round-trip through signing', () => {
  const token = signSessionPayload({
    userId: 'user_123',
    currentWorkspaceId: 'ws_123',
    exp: Math.floor(Date.now() / 1000) + 60,
  });

  const payload = verifySessionPayload(token);
  assert.equal(payload.userId, 'user_123');
  assert.equal(payload.currentWorkspaceId, 'ws_123');
});

test('tampered session payloads fail verification', () => {
  const token = signSessionPayload({
    userId: 'user_123',
    currentWorkspaceId: 'ws_123',
    exp: Math.floor(Date.now() / 1000) + 60,
  });

  const tampered = `${token.slice(0, -2)}aa`;
  assert.equal(verifySessionPayload(tampered), null);
});
