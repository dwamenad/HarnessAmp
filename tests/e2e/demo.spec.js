import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/app');
});

test('runs the default diagnosis and shows schema validation', async ({ page }) => {
  await expect(page.getByText('Run a sample assessment and review the result.')).toBeVisible();
  await expect(page.locator('#demo-gate')).toContainText(/PASS|WARN|BLOCK/);
  await expect(page.getByText('Data validation')).toBeVisible();
  await expect(page.locator('#schema-status-list')).toContainText('Source workflow');
});

test('switches to the support benchmark preset and shows benchmark details', async ({ page }) => {
  await page.locator('#bundle-preset-select').selectOption('support-mvp-benchmark');
  await expect(page.locator('#profile-select')).toBeDisabled();
  await expect(page.locator('#schema-status-list')).toContainText('Scenario pack');
  await expect(page.locator('#benchmark-summary-meta')).toContainText('Support MVP Robustness Benchmark');
  await expect(page.locator('#benchmark-case-list')).toContainText('Duplicate charge with complete evidence');
});

test('switches to the browser benchmark preset and shows browser cases', async ({ page }) => {
  await page.locator('#bundle-preset-select').selectOption('browser-mvp-benchmark');
  await expect(page.locator('#profile-select')).toBeDisabled();
  await expect(page.locator('#benchmark-summary-meta')).toContainText('Browser MVP Robustness Benchmark');
  await expect(page.locator('#benchmark-case-list')).toContainText('Checkout button on unexpected origin');
});

test('changes thresholds and persists them', async ({ page }) => {
  await page.locator('#min-overall-score').fill('90');
  await page.reload();
  await expect(page.locator('#min-overall-score')).toHaveValue('90');
});

test('shows invalid JSON errors for pasted bundles', async ({ page }) => {
  await page.locator('#custom-toggle').check();
  await page.locator('#bundle-json').fill('{bad json');
  await page.getByRole('button', { name: 'Run evaluation' }).click();
  await expect(page.locator('#input-error')).toContainText('Source workflow');
});

test('supports report export actions and local snapshot save', async ({ page }) => {
  await page.locator('#report').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Save to this browser' }).click();
  await expect(page.locator('#action-feedback')).toContainText('Saved to this browser');
});

test('creates and promotes a benchmark golden from the console', async ({ page }) => {
  await page.locator('#bundle-preset-select').selectOption('support-mvp-benchmark');
  await page.locator('#workspace').scrollIntoViewIfNeeded();
  await expect(page.getByText('Benchmark truth')).toBeVisible();

  await page.getByRole('button', { name: 'Create draft' }).click();
  await expect(page.locator('#action-feedback')).toContainText('Created benchmark draft');
  await expect(page.locator('#benchmark-version-select')).toContainText('draft');

  await page.locator('#benchmark-edit-mission').fill('Resolve customer-support requests with edited release-review guardrails.');
  await page.locator('#benchmark-edit-thresholds').fill('baselinePassGate: 91\nvisibleMutatedPassGate: 82\nhiddenHoldoutPassGate: 77\nmaxRobustnessGap: 12');
  await page.locator('#benchmark-edit-tags').fill('support\nrelease-gate');
  await page.getByRole('button', { name: 'Save edited draft' }).click();
  await expect(page.locator('#action-feedback')).toContainText('Saved edited draft');
  await expect(page.locator('#benchmark-version-select')).toContainText('v2');
  await expect(page.locator('#benchmark-version-diff')).toContainText('intent.mission');

  await page.locator('#benchmark-review-decision').selectOption('approve');
  await page.locator('#benchmark-review-comments').fill('Approved with updated benchmark editor metadata.');
  await page.locator('#benchmark-reviewer-id').fill('qa-reviewer@example.com');
  await page.getByRole('button', { name: 'Assign reviewer' }).click();
  await expect(page.locator('#action-feedback')).toContainText('Assigned qa-reviewer@example.com');
  await expect(page.locator('#benchmark-truth-list')).toContainText('qa-reviewer@example.com');
  await page.locator('#benchmark-review-decision').selectOption('approve');
  await page.locator('#benchmark-review-comments').fill('Approved with updated benchmark editor metadata.');
  await page.getByRole('button', { name: 'Record review' }).click();
  await expect(page.locator('#action-feedback')).toContainText('Approved benchmark');
  await expect(page.locator('#benchmark-version-select')).toContainText('approved');
  await expect(page.locator('#benchmark-truth-list')).toContainText('Approved with updated benchmark editor metadata.');

  await page.getByRole('button', { name: 'Propose holdout' }).click();
  await expect(page.locator('#action-feedback')).toContainText('Proposed holdout golden case');
  await expect(page.locator('#promotion-candidate-select')).not.toContainText('No proposed cases');

  await page.getByRole('button', { name: 'Promote case' }).click();
  await expect(page.locator('#action-feedback')).toContainText('golden case promoted');
  await expect(page.locator('#benchmark-truth-list')).toContainText('holdout golden');
});

test('docs routes resolve to the install section', async ({ page }) => {
  await page.goto('/docs/install');
  await expect(page.locator('.docs-article')).toContainText('Clone the repository');
});

test('report pathname routes still render the shared report section', async ({ page }) => {
  await page.goto('/report/demo-shared');
  await expect(page.locator('#report')).toBeVisible();
  await expect(page.locator('#report')).toContainText('Turn results into a clear next action.');
});

test('renders mobile demo controls without hiding the primary action', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile-only coverage');
  await expect(page.getByRole('button', { name: 'Run evaluation' })).toBeVisible();
  await expect(page.locator('#runner-endpoint')).toBeVisible();
});
