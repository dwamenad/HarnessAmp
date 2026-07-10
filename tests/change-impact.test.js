import assert from 'node:assert/strict';
import test from 'node:test';

import { buildChangeImpactSnapshot } from '../src/console/lib/change-impact.js';

test('change impact snapshot groups tool changes into release-relevant impact', () => {
  const snapshot = buildChangeImpactSnapshot();
  assert.equal(snapshot.summary.totalChanges, 3);
  assert.equal(snapshot.summary.blockingChanges, 1);
  assert.equal(snapshot.summary.affectedAgents, 3);
  assert.equal(snapshot.summary.releaseReady, false);
  assert.equal(snapshot.dependencyNodes.some((node) => node.status === 'broken'), true);
});

test('change impact snapshot tolerates incomplete optional change fields', () => {
  const snapshot = buildChangeImpactSnapshot([{ id: 'new-tool', status: 'compatible' }]);
  assert.equal(snapshot.summary.totalChanges, 1);
  assert.equal(snapshot.summary.affectedWorkflows, 0);
  assert.equal(snapshot.summary.releaseReady, true);
});
