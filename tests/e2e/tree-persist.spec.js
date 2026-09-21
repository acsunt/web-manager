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

test('分类新增和编辑不显示识别到的名称', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#workspaceBtn')).toBeVisible();

  await page.locator('#addCatBtn').click();
  await expect(page.locator('#editModal.active')).toBeVisible();
  await expect(page.locator('#recognizedNameGroup')).toBeHidden();
  await expect(page.locator('#urlGroup')).toBeHidden();
  await page.locator('#editName').fill('仅分类');
  await saveEditModal(page);
  await expect(page.locator('.category-header', { hasText: '仅分类' })).toBeVisible();

  await page.locator('.category-header', { hasText: '仅分类' }).click({ button: 'right' });
  await page.locator('#contextMenu').getByText('编辑', { exact: true }).click();
  await expect(page.locator('#editModal.active')).toBeVisible();
  await expect(page.locator('#recognizedNameGroup')).toBeHidden();
  await page.locator('#editModal.active .close-modal-btn').click();
  await expect(page.locator('#editModal.active')).toHaveCount(0);

  const category = page.locator('.category-block').filter({ has: page.locator('.category-header', { hasText: '仅分类' }) });
  await category.locator('.cat-btn').nth(1).click();
  await expect(page.locator('#editModal.active')).toBeVisible();
  await expect(page.locator('#recognizedNameGroup')).toBeHidden();
  await expect(page.locator('#iconEditGroup')).toBeHidden();
  await expect(page.locator('#fetchInfoBtn')).toBeHidden();
});

test('隐藏图标默认开启，取消后相关功能才出现，本地图标数据仍保留', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('webManagerHideIcons', 'false');
  });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#workspaceBtn')).toBeVisible();
  await expect(page.locator('#iconModeBtn')).toBeVisible();
  await expect(page.locator('#iconGlobalConfigBtn')).toBeVisible();

  await page.locator('#addCatBtn').click();
  await page.locator('#editName').fill('图标分类');
  await saveEditModal(page);

  const category = page.locator('.category-block').filter({ has: page.locator('.category-header', { hasText: '图标分类' }) });
  await category.locator('.cat-btn').nth(1).click();
  await expect(page.locator('#editModal.active')).toBeVisible();
  await expect(page.locator('#recognizedNameGroup')).toBeVisible();
  await expect(page.locator('#iconEditGroup')).toBeVisible();
  await expect(page.locator('#fetchInfoBtn')).toBeVisible();
  await page.locator('#editName').fill('图标网页');
  await page.locator('.url-value-input').fill('https://example.com/icon');
  await page.locator('input[name="iconType"][value="letter"]').check();
  await page.locator('#editRecognizedName').fill('识别标题');
  await saveEditModal(page);

  const storedWithIcons = await storedTree(page);
  expect(storedWithIcons[0].children[0]).toEqual(expect.objectContaining({
    name: '图标网页',
    iconType: 'letter',
    recognizedName: '识别标题',
  }));

  await page.locator('#toolbarEditBtn').click();
  await expect(page.locator('#toolbarEditModal.active')).toBeVisible();
  await expect(page.locator('#toolbarCheckedCount')).toBeVisible();
  await expect(page.locator('#toolbarCheckedCount')).toHaveText(/\(\d+个\)/);
  await expect(page.locator('#toolbarApkSection')).toBeHidden();
  await expect(page.locator('#toolbarConfigList [data-id="toolbarEditBtn"]')).toHaveClass(/toolbar-config-locked/);
  await expect(page.locator('#toolbarConfigList [data-id="toolbarEditBtn"] input')).toHaveCount(0);
  await expect(page.locator('#toolbarConfigList')).toContainText('图标设置');
  await page.locator('#hideIconsToggle').uncheck();
  await expect(page.locator('#hideIconsToggle')).not.toBeChecked();
  await page.locator('#hideIconsToggle').check();
  await expect(page.locator('#iconModeBtn')).toBeHidden();
  await expect(page.locator('#iconGlobalConfigBtn')).toBeHidden();
  await expect(page.locator('#toolbarConfigList')).not.toContainText('图标设置');
  await page.locator('#toolbarEditModal.active .close-modal-btn').click();

  await page.locator('#toolsBtn').click();
  await expect(page.locator('#toolsModal.active')).toBeVisible();
  await expect(page.locator('#checkAllIconsBtn')).toBeHidden();
  await expect(page.locator('#passwordManagerBtn')).toBeHidden();
  await expect(page.locator('#toolsApkSection')).toBeHidden();
  await page.locator('#toolsModal.active .close-modal-btn').click();

  await page.locator('#ioBtn').click();
  await expect(page.locator('#ioModal.active')).toBeVisible();
  await expect(page.locator('#exportIconSettingsRow')).toBeHidden();
  await page.locator('#ioModal.active .close-modal-btn').click();

  await page.locator('.page-card', { hasText: '图标网页' }).click({ button: 'right' });
  await page.locator('#contextMenu').getByText('编辑', { exact: true }).click();
  await expect(page.locator('#editModal.active')).toBeVisible();
  await expect(page.locator('#recognizedNameGroup')).toBeHidden();
  await expect(page.locator('#iconEditGroup')).toBeHidden();
  await page.locator('#editName').fill('图标网页改名');
  await saveEditModal(page);

  const storedAfterHide = await storedTree(page);
  expect(storedAfterHide[0].children[0]).toEqual(expect.objectContaining({
    name: '图标网页改名',
    iconType: 'letter',
    recognizedName: '识别标题',
  }));
});

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
