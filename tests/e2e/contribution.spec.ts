import {expect, test} from '@playwright/test';

test('contribution desk renders core workflow controls', async ({page}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', {name: 'Lore Wiki'})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Process'})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Submit PR'})).toBeVisible();
  await expect(page.getByRole('textbox', {name: 'Draft Markdown'})).toBeVisible();
});
