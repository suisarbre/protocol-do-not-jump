import {expect, test} from '@playwright/test';

test('terminal landing renders command interface', async ({page}) => {
  await page.goto('/protocol-do-not-jump/');
  await expect(page.getByText('DEAD-SPACE NODE M-41')).toBeVisible();
  await expect(page.getByText('[WARNING] THIS NODE IS DECOMMISSIONED')).toBeVisible();
  await expect(page.getByText("[ACCESS CORE CANON FILES]")).toBeVisible({timeout: 12000});
});

test('contribution desk renders core workflow controls', async ({page}) => {
  await page.goto('/protocol-do-not-jump/contribute');
  await expect(page.getByRole('heading', {name: 'Lore Wiki'})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Process'})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Submit PR'})).toBeVisible();
  await expect(page.getByRole('textbox', {name: 'Draft Markdown'})).toBeVisible();
});
