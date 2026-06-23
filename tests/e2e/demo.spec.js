import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/app');
});

test('public site funnels into the console while keeping sandbox and docs reachable', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Open console' }).first()).toHaveAttribute('href', '/dashboard');
  await expect(page.getByRole('link', { name: 'View seeded demo' }).first()).toHaveAttribute('href', '/app#demo');
  await expect(page.getByRole('link', { name: 'Adapter contract' }).first()).toHaveAttribute('href', '/docs/adapters/adapter-contract');
  await expect(page.getByText('Connect the agent you operate.')).toBeVisible();
  await expect(page.getByText('Reports that explain the gate.')).toBeVisible();
  await expect(page.getByText('How teams use it')).toHaveCount(0);
});

test('dashboard stays operational instead of explaining placeholder route states', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByText('Release readiness')).toBeVisible();
  await expect(page.getByText('Recent Runs')).toBeVisible();
  await expect(page.getByText('Open Critical Failures')).toBeVisible();
  await expect(page.getByText('CI Gate Status')).toBeVisible();
  await expect(page.getByText('Governance')).toBeVisible();
  await expect(page.getByText('Top blocker')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open evidence' }).first()).toHaveAttribute('href', /\/failures\//);
  await expect(page.getByText('Operational states')).toHaveCount(0);
  await expect(page.getByText('Loading and error states')).toHaveCount(0);
});

test('reports keep seeded samples labeled after the route cleanup', async ({ page }) => {
  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: 'Reports', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Run reports' })).toBeVisible();
  await expect(page.getByText('Loading HarnessAmp')).toHaveCount(0);
  await page.locator('.ha-report-export summary').first().click();
  await expect(page.getByRole('button', { name: 'Print HTML' }).first()).toBeVisible();
  await expect(page.getByText('seeded sample').first()).toBeVisible();
});

test('targets route cold-loads without the bootstrap loading screen', async ({ page }) => {
  await page.goto('/targets');
  await expect(page.getByRole('heading', { name: 'Execution Targets' }).first()).toBeVisible();
  await expect(page.getByText('Canonical readiness surface for release evidence.')).toBeVisible();
  await expect(page.getByText('Loading HarnessAmp')).toHaveCount(0);
  await expect(page.getByText('Preparing the console')).toHaveCount(0);
});

test('run routes cold-load without the bootstrap loading screen', async ({ page }) => {
  await page.goto('/runs/new');
  await expect(page.getByRole('heading', { name: 'New Run', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Configure Run' })).toBeVisible();
  await expect(page.getByText('Loading HarnessAmp')).toHaveCount(0);
  await expect(page.getByText('Preparing the console')).toHaveCount(0);

  await page.goto('/runs/run-healthguard-2419/summary');
  await expect(page.getByRole('heading', { name: 'Run Summary', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'HealthGuard Standard Summary' })).toBeVisible();
  await expect(page.getByText('Loading HarnessAmp')).toHaveCount(0);
});

test('failure routes cold-load without the bootstrap loading screen', async ({ page }) => {
  await page.goto('/failures');
  await expect(page.getByRole('heading', { name: 'Failures', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Failure Queue' })).toBeVisible();
  await expect(page.getByText('Loading HarnessAmp')).toHaveCount(0);

  await page.goto('/failures/fail-redflag-017');
  await expect(page.getByRole('heading', { name: 'Failure Evidence', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Escalate red flags' })).toBeVisible();
  await expect(page.getByText('Loading HarnessAmp')).toHaveCount(0);
});

test('runs the default diagnosis and shows schema validation', async ({ page }) => {
  await expect(page.getByText('Sample data first. Real execution when connected.')).toBeVisible();
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
  await page.getByText('Advanced setup').click();
  await page.locator('#min-overall-score').fill('90');
  await page.reload();
  await page.getByText('Advanced setup').click();
  await expect(page.locator('#min-overall-score')).toHaveValue('90');
});

test('shows invalid JSON errors for pasted bundles', async ({ page }) => {
  await page.getByText('Advanced setup').click();
  await page.locator('#custom-toggle').check();
  await page.locator('#bundle-json').fill('{bad json');
  await page.getByRole('button', { name: 'Run benchmark' }).click();
  await expect(page.locator('#input-error')).toContainText('Source workflow');
});

test('supports report export actions and local snapshot save', async ({ page }) => {
  await page.locator('#report').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Save to this browser' }).click();
  await expect(page.locator('#action-feedback')).toContainText('Saved to this browser');
});

test('keeps the sandbox focused and hands off to the console', async ({ page }) => {
  await expect(page.locator('#demo > .section__intro .eyebrow')).toHaveText('Product preview');
  await expect(page.getByText('Demo vs real execution')).toBeVisible();
  await expect(page.getByText('Worker-backed run lifecycle')).toBeVisible();
  await expect(page.getByText(/Default thresholds:/)).toBeVisible();
  await expect(page.getByText('Ready to operate real runs?')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open console' }).last()).toHaveAttribute('href', '/dashboard');
  await expect(page.locator('#workspace')).toHaveCount(0);
  await expect(page.locator('#docs-preview')).toHaveCount(0);
});

test('console exposes operational destinations after the sandbox handoff', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('link', { name: 'Start Run' })).toHaveAttribute('href', '/runs/new');
  await expect(page.locator('.ha-nav').getByRole('link', { name: /Reports/ })).toHaveAttribute('href', '/reports');
  await expect(page.locator('.ha-nav').getByRole('link', { name: /Failures/ })).toHaveAttribute('href', '/failures');
});

test('new run page treats benchmarks as the release-gate source', async ({ page }) => {
  await page.goto('/runs/new');
  await expect(page.locator('#run-benchmark-select')).toBeVisible();
  await expect(page.getByText('Versioned benchmark', { exact: true })).toBeVisible();
  await expect(page.getByText('Gate preview')).toBeVisible();
  await expect(page.getByText('Harness readiness')).toBeVisible();
  await expect(page.getByText('read-only registry')).toBeVisible();
  await expect(page.getByText('Preflight')).toBeVisible();
  await expect(page.getByText('Expected artifacts')).toBeVisible();
  await expect(page.getByText('BenchmarkResult')).toBeVisible();
  await expect(page.getByText('Sample run')).toBeVisible();
  await expect(page.getByLabel('Full benchmark')).toBeVisible();
  await expect(page.locator('#run-agent-version')).toBeVisible();
  await expect(page.getByText('CI slug')).toBeVisible();
  await expect(page.locator('#copy-benchmark-slug')).toBeEnabled();
});

test('compare page exposes benchmark-aware baseline context', async ({ page }) => {
  await page.goto('/compare');
  await expect(page.getByText('Benchmark result baseline')).toBeVisible();
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
  await expect(page.getByRole('button', { name: 'Run benchmark' })).toBeVisible();
  await page.getByText('Advanced setup').click();
  await expect(page.locator('#runner-endpoint')).toBeVisible();
});
