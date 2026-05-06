import {expect, test} from '@playwright/test';

test('terminal landing renders command interface', async ({page}) => {
  await page.goto('/protocol-do-not-jump/');
  await expect(page.getByText('DEAD-SPACE NODE M-41')).toBeVisible();
  await expect(page.getByText('[WARNING] THIS NODE IS DECOMMISSIONED')).toBeVisible();
  await page.mouse.click(20, 20);
  await expect(page.getByText("[ACCESS CORE CANON FILES]")).toBeVisible();
  await expect(page.getByText(":: TODAY'S PRIORITY LEAK ::")).toBeVisible();
});

test('core document keeps terminal viewer styling', async ({page}) => {
  await page.goto('/protocol-do-not-jump/docs/core-lore/astra-nox-leak-tartarus');
  await expect(page.getByRole('heading', {name: /\[LEAKED\] Astra-Nox/})).toBeVisible();
  const articlePanel = page.locator('.theme-doc-markdown');
  await expect(articlePanel).toHaveCSS('border-top-color', 'rgba(0, 229, 255, 0.42)');
});

test('contribution desk renders core workflow controls', async ({page}) => {
  await page.goto('/protocol-do-not-jump/contribute');
  await expect(page.getByRole('heading', {name: 'Lore Wiki'})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Process'})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Submit PR'})).toBeVisible();
  await expect(page.getByRole('textbox', {name: 'Draft Markdown'})).toBeVisible();
});
