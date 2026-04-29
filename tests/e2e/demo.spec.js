import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/#demo');
});

test('runs the default diagnosis and shows schema validation', async ({ page }) => {
  await expect(page.getByText('Load a sample harness. Choose risk. Run mutations.')).toBeVisible();
  await expect(page.locator('#demo-gate')).toContainText(/PASS|WARN|BLOCK/);
  await expect(page.getByText('Schema validation')).toBeVisible();
  await expect(page.locator('#schema-status-list')).toContainText('Harness bundle');
});

test('changes thresholds and persists them', async ({ page }) => {
  await page.locator('#min-overall-score').fill('90');
  await page.reload();
  await expect(page.locator('#min-overall-score')).toHaveValue('90');
});

test('shows invalid JSON errors for pasted bundles', async ({ page }) => {
  await page.locator('#custom-toggle').check();
  await page.locator('#bundle-json').fill('{bad json');
  await page.getByRole('button', { name: 'Run diagnosis' }).click();
  await expect(page.locator('#input-error')).toContainText('Harness bundle');
});

test('supports report export actions and local snapshot save', async ({ page }) => {
  await page.locator('#report').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Save report snapshot' }).click();
  await expect(page.locator('#action-feedback')).toContainText('Saved report snapshot');
});

test('renders mobile demo controls without hiding the primary action', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile-only coverage');
  await expect(page.getByRole('button', { name: 'Run diagnosis' })).toBeVisible();
  await expect(page.locator('#runner-endpoint')).toBeVisible();
});
