import { expect, test } from '@playwright/test';

async function storedTree(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('webManagerDataProMax');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed?.workspaces?.[0]?.data || [];
  });
}

async function saveEditModal(page) {
  await page.locator('#editModal.active').getByRole('button', { name: '保存' }).click();
  await expect(page.locator('#editModal.active')).toHaveCount(0);
}

test('打开、置顶、删除后刷新，结构仍正确', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());

  await page.goto('/index.html');
  await expect(page.locator('#workspaceBtn')).toBeVisible();
  await expect(page.locator('#tree-root')).toBeVisible();

  await page.locator('#workspaceBtn').click();
  await expect(page.locator('#workspaceModal.active .workspace-name-text')).toHaveText('主页');
  await page.locator('#workspaceModal .close-modal-btn').click();
  await expect(page.locator('#workspaceModal.active')).toHaveCount(0);

  await page.locator('#addCatBtn').click();
  await page.locator('#editName').fill('阶段1分类');
  await saveEditModal(page);
  await expect(page.locator('.category-header', { hasText: '阶段1分类' })).toBeVisible();

  const category = page.locator('.category-block').filter({ has: page.locator('.category-header', { hasText: '阶段1分类' }) });
  await category.locator('.cat-btn').nth(1).click();
  await page.locator('#editName').fill('阶段1网页');
  await page.locator('.url-value-input').fill('https://example.com/stage-1');
  await saveEditModal(page);
  await expect(page.locator('.page-card', { hasText: '阶段1网页' })).toBeVisible();

  await page.locator('.category-header', { hasText: '阶段1分类' }).click({ button: 'right' });
  await page.locator('#contextMenu').getByText('置顶', { exact: true }).click();
  await expect(page.locator('.category-header', { hasText: '阶段1分类' }).locator('.fa-thumbtack')).toBeVisible();

  await page.reload();
  await expect(page.locator('.category-header', { hasText: '阶段1分类' }).locator('.fa-thumbtack')).toBeVisible();
  await expect(page.locator('.page-card', { hasText: '阶段1网页' })).toBeVisible();
  await expect(await storedTree(page)).toEqual([
    expect.objectContaining({
      type: 'category',
      name: '阶段1分类',
      isPinned: true,
      children: [
        expect.objectContaining({
          type: 'page',
          name: '阶段1网页',
          url: 'https://example.com/stage-1',
        }),
      ],
    }),
  ]);

  await page.locator('#editModeBtn').click();
  await page.locator('.page-card', { hasText: '阶段1网页' }).locator('.item-checkbox').check();
  await page.locator('.batch-bar').getByRole('button', { name: '删除' }).click();
  await expect(page.locator('.page-card', { hasText: '阶段1网页' })).toHaveCount(0);

  await page.reload();
  await expect(page.locator('.category-header', { hasText: '阶段1分类' }).locator('.fa-thumbtack')).toBeVisible();
  await expect(page.locator('.page-card', { hasText: '阶段1网页' })).toHaveCount(0);
  await expect(await storedTree(page)).toEqual([
    expect.objectContaining({
      type: 'category',
      name: '阶段1分类',
      isPinned: true,
      children: [],
    }),
  ]);
});
