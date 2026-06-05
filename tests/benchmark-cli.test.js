import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const supportPackPath = 'examples/benchmarks/support-mvp/benchmark-pack.json';

test('benchmark CLI imports, edits, reviews, diffs, and exports lifecycle documents', () => {
  const directory = mkdtempSync(join(tmpdir(), 'harnessamp-benchmark-cli-'));
  const lifecyclePath = join(directory, 'lifecycle.json');
  const editedLifecyclePath = join(directory, 'lifecycle-edited.json');
  const reviewedLifecyclePath = join(directory, 'lifecycle-reviewed.json');
  const exportedPackPath = join(directory, 'approved-pack.json');
  const editsPath = join(directory, 'edits.json');

  const imported = runCli(['benchmark', 'import', supportPackPath, '--out', lifecyclePath, '--source', 'cli-test']);
  assert.equal(imported.status, 0, imported.stderr);
  const lifecycle = JSON.parse(readFileSync(lifecyclePath, 'utf8'));
  assert.equal(lifecycle.format, 'harnessamp.benchmark.lifecycle.v1');
  assert.equal(lifecycle.versions.length, 1);
  assert.equal(lifecycle.versions[0].status, 'draft');

  writeFileSync(editsPath, JSON.stringify({
    tagsText: 'support\nrelease-gate\ncli',
    metadataJson: JSON.stringify({ owner: 'cli-test' }),
    thresholdsText: 'baselinePassGate: 93\nvisibleMutatedPassGate: 83\nhiddenHoldoutPassGate: 78\nmaxRobustnessGap: 11',
  }, null, 2));

  const edited = runCli(['benchmark', 'edit', lifecyclePath, '--edits', editsPath, '--out', editedLifecyclePath]);
  assert.equal(edited.status, 0, edited.stderr);
  const editSummary = JSON.parse(edited.stdout);
  assert.equal(editSummary.version, 2);
  assert.equal(editSummary.diff.fieldChangeCount, 3);
  const editedLifecycle = JSON.parse(readFileSync(editedLifecyclePath, 'utf8'));
  assert.equal(editedLifecycle.versions.length, 2);
  assert.deepEqual(editedLifecycle.versions[1].pack.tags, ['support', 'release-gate', 'cli']);

  const reviewed = runCli([
    'benchmark',
    'review',
    editedLifecyclePath,
    '--decision',
    'approve',
    '--comments',
    'Approved from CLI test.',
    '--out',
    reviewedLifecyclePath,
  ]);
  assert.equal(reviewed.status, 0, reviewed.stderr);
  const reviewedLifecycle = JSON.parse(readFileSync(reviewedLifecyclePath, 'utf8'));
  assert.equal(reviewedLifecycle.versions[1].status, 'approved');
  assert.equal(reviewedLifecycle.reviews[0].comments, 'Approved from CLI test.');

  const diff = runCli(['benchmark', 'diff', lifecyclePath, reviewedLifecyclePath]);
  assert.equal(diff.status, 0, diff.stderr);
  const diffBody = JSON.parse(diff.stdout);
  assert.equal(diffBody.summary.fieldChangeCount, 3);

  const exported = runCli(['benchmark', 'export', reviewedLifecyclePath, '--version', 'approved', '--out', exportedPackPath]);
  assert.equal(exported.status, 0, exported.stderr);
  const exportedPack = JSON.parse(readFileSync(exportedPackPath, 'utf8'));
  assert.deepEqual(exportedPack.tags, ['support', 'release-gate', 'cli']);
  assert.equal(exportedPack.benchmark.summary.baselinePassGate, 93);
});

function runCli(args) {
  return spawnSync(process.execPath, ['scripts/harnessamp.mjs', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}
