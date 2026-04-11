import { expect, test } from '@playwright/test';

const DEMO_USERNAME = 'demo-ranger';
const DEMO_PASSWORD = 'ThornwritheDemo!2026';

test('first session can login, create a character, and reach play', async ({ page }) => {
  await page.goto('/');

  const loginCard = page.getByRole('region', { name: /login card/i });
  await loginCard.getByLabel(/username/i).fill(DEMO_USERNAME);
  await loginCard.getByLabel(/password/i).fill(DEMO_PASSWORD);
  await loginCard.getByRole('button', { name: /enter the briar march/i }).click();

  await expect(page).toHaveURL(/\/create-character$/);

  const characterName = `E2E${Date.now().toString().slice(-6)}`;
  await page.getByLabel(/character name/i).fill(characterName);
  await page.getByRole('button', { name: /^create character$/i }).click();

  await expect(page.getByRole('heading', { name: /thornwrithe field interface/i })).toBeVisible();
  await expect.poll(() => page.url()).toContain('/play');
  await expect(page.getByText(/world synced/i)).toBeVisible();
});
