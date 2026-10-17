const { test, expect } = require('@playwright/test');
const { PNG_RECEIPT } = require('../fixtures.cjs');

async function createJourney(page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Traveler demo', exact: true }).click();
  await page.getByRole('link', { name: 'Plan a trip', exact: true }).click();
  await page.getByLabel('Destination', { exact: true }).fill('AI Chicago journey');
  await page.getByLabel('Start date', { exact: true }).fill('2027-05-01');
  await page.getByLabel('End date', { exact: true }).fill('2027-05-03');
  await page.getByLabel('Purpose', { exact: true }).fill('AI course demonstration');
  await page.getByLabel('Budget (USD)', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Submit trip', exact: true }).click();
  const card = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'AI Chicago journey', exact: true }) })
    .last();
  await card.getByRole('link', { name: 'View journey', exact: true }).click();
  await expect(page).toHaveURL(/\/trips\/\d+$/);
  return new URL(page.url()).pathname;
}

test('AI draft can be reviewed, selected and saved; receipt extraction and budget insights use saved data', async ({
  page,
}, testInfo) => {
  const journey = await createJourney(page);
  await page.getByRole('tab', { name: /^Itinerary/ }).click();
  await page.getByRole('button', { name: 'Plan with AI', exact: true }).click();
  await page
    .getByLabel('What would make this trip yours?', { exact: true })
    .fill('Museums, local food and time to relax.');
  await page.getByLabel('Travel pace', { exact: true }).selectOption('relaxed');
  await page.getByRole('button', { name: 'Generate plan', exact: true }).click();
  await expect(page.getByText('DRAFT · NOT SAVED', { exact: true })).toBeVisible();
  await expect(page.locator('.itinerary-entry')).toHaveCount(0);
  await page
    .locator('.ai-draft-card')
    .first()
    .getByLabel('Title', { exact: true })
    .fill('My museum morning');
  await page.getByRole('checkbox', { name: 'Include activity 3', exact: true }).uncheck();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('ai-planner-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Add selected activities', exact: true }).click();
  await expect(page.locator('.itinerary-entry')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'My museum morning', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: /^Itinerary/ }).click();
  await expect(page.locator('.itinerary-entry')).toHaveCount(2);
  await page.getByRole('tab', { name: 'Activity', exact: true }).click();
  await expect(page.getByText('Added reviewed AI itinerary items', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.goto(journey);
  await page.getByRole('button', { name: 'Owner demo', exact: true }).click();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await page.getByRole('button', { name: 'Approve trip', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.goto(journey);
  await page.getByRole('button', { name: 'Traveler demo', exact: true }).click();
  await page.getByRole('link', { name: 'Add expense', exact: true }).click();
  await page.getByLabel('Amount (USD)', { exact: true }).fill('90');
  await page.getByLabel('Description', { exact: true }).fill('AI receipt original');
  await page.getByRole('button', { name: 'Save expense', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: 'AI receipt original' });
  const chooser = page.waitForEvent('filechooser');
  await row.getByRole('button', { name: /Add receipt / }).click();
  await (
    await chooser
  ).setFiles({ name: 'sample.png', mimeType: 'image/png', buffer: PNG_RECEIPT });
  await row.getByRole('button', { name: /^Scan receipt / }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: 'Smart Receipt Scan', exact: true }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Scan receipt', exact: true }).click();
  await expect(dialog.getByLabel('Amount (USD)', { exact: true })).toHaveValue('12.5');
  await expect(row).toContainText('$90.00');
  await dialog.getByLabel('Amount (USD)', { exact: true }).fill('14.25');
  await dialog.getByLabel('Description', { exact: true }).fill('My reviewed lunch');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('ai-receipt-mobile.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Apply reviewed details', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'My reviewed lunch' })).toContainText(
    '$14.25',
  );
  await page.goto(journey);
  await page.getByRole('tab', { name: 'Expenses', exact: true }).click();
  await page.getByRole('button', { name: 'Explain my budget', exact: true }).click();
  await expect(page.locator('.ai-insights')).toContainText('$14.25');
  await expect(page.locator('.ai-insights')).toContainText('$85.75');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: testInfo.outputPath('ai-budget-desktop.png'), fullPage: true });
});

test('unconfigured AI shows a clear state and leaves manual itinerary creation available', async ({
  page,
}) => {
  await page.route('**/api/ai/status', (route) =>
    route.fulfill({ json: { available: false, provider: 'OpenAI' } }),
  );
  await createJourney(page);
  await page.getByRole('tab', { name: /^Itinerary/ }).click();
  await page.getByRole('button', { name: 'Plan with AI', exact: true }).click();
  await expect(page.getByText(/AI is not connected yet/)).toBeVisible();
  await page.getByLabel('What would make this trip yours?', { exact: true }).fill('Museums');
  await expect(page.getByRole('button', { name: 'Generate plan', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Manual activity without AI');
  await page.getByRole('button', { name: 'Save item', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Manual activity without AI', exact: true }),
  ).toBeVisible();
});
