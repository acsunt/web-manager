import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelPasswordDraft, deletePassword, deleteSelectedPasswords, openPasswordManager, savePasswordDraft, togglePasswordSelectAll, togglePasswordSelectMode } from '../password-manager.js';

function mountManager() {
  document.body.innerHTML = `
    <div id="toast-notification"></div>
    <div id="passwordManagerModal" class="modal">
      <div id="pwdManagerToolbar">
        <button type="button" id="pwdSelectToggleBtn">多选</button>
        <button type="button" id="pwdDeleteSelectedBtn" hidden>删除选中</button>
        <button type="button" id="pwdSelectAllBtn" hidden>全选</button>
      </div>
      <div id="passwordManagerEmpty"></div>
      <div id="passwordManagerList"></div>
    </div>
  `;
}

function mockStore(list) {
  let saved = list;
  window.Android = {
    getSavedPasswords: () => JSON.stringify(saved),
    saveSavedPasswords: vi.fn((json) => {
      saved = JSON.parse(json);
      return true;
    }),
    copyText: vi.fn(() => true),
  };
}

describe('password-manager', () => {
  beforeEach(() => {
    mountManager();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockStore([
      { id: 'p1', website: 'example.com', title: 'Example Site', username: 'alice', password: 'old' },
      { id: 'p2', website: 'other.com', username: 'bob', password: 'two' },
    ]);
  });

  afterEach(() => {
    delete window.Android;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('APK 下打开后默认只显示网站，不进入编辑', () => {
    openPasswordManager();
    const modal = document.getElementById('passwordManagerModal');
    expect(modal.classList.contains('active')).toBe(true);
    const card = document.querySelector('.pwd-card');
    expect(card.classList.contains('editing')).toBe(false);
    expect(card.querySelector('.pwd-title').textContent).toBe('Example Site');
    expect(card.querySelector('.pwd-sub').textContent).toBe('example.com');
    expect(card.querySelector('.pwd-title-input').value).toBe('Example Site');
    expect(card.querySelector('.pwd-username').value).toBe('alice');
    expect(card.querySelector('.pwd-password').value).toBe('old');
    expect(card.querySelector('.pwd-actions').hidden).toBe(true);
    expect(card.querySelector('.pwd-delete-btn')).not.toBeNull();
    expect(card.querySelector('.pwd-actions .pwd-delete-btn')).not.toBeNull();
    expect(document.getElementById('pwdDeleteSelectedBtn').hidden).toBe(true);
  });

  it('点编辑后才改账号密码，保存写入，取消还原', () => {
    openPasswordManager();
    const card = document.querySelector('.pwd-card');
    card.querySelector('[data-pwd-act="edit"]').click();
    expect(card.classList.contains('editing')).toBe(true);
    const title = card.querySelector('.pwd-title-input');
    const website = card.querySelector('.pwd-website');
    const username = card.querySelector('.pwd-username');
    const password = card.querySelector('.pwd-password');
    title.value = '新标题';
    website.value = 'new.com';
    username.value = 'neo';
    password.value = 'secret';
    website.dispatchEvent(new Event('input', { bubbles: true }));
    expect(card.querySelector('.pwd-actions').hidden).toBe(false);
    const actions = card.querySelector('.pwd-actions');
    expect(actions.firstElementChild.classList.contains('pwd-delete-btn')).toBe(true);
    expect(actions.querySelector('[data-pwd-act="cancel"]')).not.toBeNull();

    cancelPasswordDraft('p1');
    expect(title.value).toBe('Example Site');
    expect(website.value).toBe('example.com');
    expect(username.value).toBe('alice');
    expect(password.value).toBe('old');
    expect(window.Android.saveSavedPasswords).not.toHaveBeenCalled();

    title.value = '新标题';
    website.value = 'new.com';
    username.value = 'neo';
    password.value = 'secret';
    savePasswordDraft('p1');
    expect(window.Android.saveSavedPasswords).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(window.Android.saveSavedPasswords.mock.calls[0][0]);
    expect(saved[0]).toEqual(expect.objectContaining({
      title: '新标题',
      website: 'new.com',
      username: 'neo',
      password: 'secret',
    }));
    expect(card.classList.contains('editing')).toBe(false);
    expect(card.querySelector('.pwd-title').textContent).toBe('新标题');
  });

  it('编辑时输入框右侧小叉可清空内容', () => {
    openPasswordManager();
    const card = document.querySelector('.pwd-card');
    card.querySelector('[data-pwd-act="edit"]').click();
    const username = card.querySelector('.pwd-username');
    const wrap = username.closest('.pwd-input-wrap');
    const clearBtn = wrap.querySelector('.pwd-clear-btn');
    expect(wrap.querySelector('.pwd-copy-btn')).not.toBeNull();
    expect(clearBtn.hidden).toBe(false);
    clearBtn.click();
    expect(username.value).toBe('');
    expect(clearBtn.hidden).toBe(true);
    expect(card.querySelector('.pwd-actions').hidden).toBe(false);
  });

  it('编辑时输入框右侧复制按钮写入剪贴板', async () => {
    openPasswordManager();
    const card = document.querySelector('.pwd-card');
    card.querySelector('[data-pwd-act="edit"]').click();
    const fields = ['.pwd-title-input', '.pwd-website', '.pwd-username', '.pwd-password'];
    fields.forEach((selector) => {
      expect(card.querySelector(selector).closest('.pwd-input-wrap').querySelector('.pwd-copy-btn')).not.toBeNull();
    });
    const username = card.querySelector('.pwd-username');
    username.closest('.pwd-input-wrap').querySelector('.pwd-copy-btn').click();
    await Promise.resolve();
    expect(window.Android.copyText).toHaveBeenCalledWith('alice');
  });

  it('可以单条删除', () => {
    openPasswordManager();
    deletePassword('p1');
    expect(window.Android.saveSavedPasswords).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(window.Android.saveSavedPasswords.mock.calls[0][0]);
    expect(saved.map((item) => item.id)).toEqual(['p2']);
    expect(document.querySelectorAll('.pwd-card')).toHaveLength(1);
  });

  it('多选后可以批量删除，取消退出多选', () => {
    openPasswordManager();
    togglePasswordSelectMode();
    expect(document.getElementById('passwordManagerModal').classList.contains('pwd-selecting')).toBe(true);
    expect(document.getElementById('pwdDeleteSelectedBtn').hidden).toBe(false);
    expect(document.getElementById('pwdSelectAllBtn').hidden).toBe(false);
    expect(document.getElementById('pwdSelectAllBtn').textContent).toBe('全选');
    document.querySelectorAll('.pwd-select').forEach((el) => { el.checked = true; });
    document.querySelector('.pwd-select').dispatchEvent(new Event('change', { bubbles: true }));
    deleteSelectedPasswords();
    expect(window.Android.saveSavedPasswords).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.Android.saveSavedPasswords.mock.calls[0][0])).toEqual([]);

    openPasswordManager();
    togglePasswordSelectMode();
    togglePasswordSelectMode();
    expect(document.getElementById('passwordManagerModal').classList.contains('pwd-selecting')).toBe(false);
    expect(document.getElementById('pwdSelectToggleBtn').textContent).toBe('多选');
    expect(document.getElementById('pwdDeleteSelectedBtn').hidden).toBe(true);
    expect(document.getElementById('pwdSelectAllBtn').hidden).toBe(true);
  });

  it('多选后全选会勾上全部，再点取消全选', () => {
    openPasswordManager();
    togglePasswordSelectMode();
    togglePasswordSelectAll();
    expect([...document.querySelectorAll('.pwd-select')].every((el) => el.checked)).toBe(true);
    expect(document.getElementById('pwdSelectAllBtn').textContent).toBe('取消全选');
    expect(document.getElementById('pwdDeleteSelectedBtn').textContent).toBe('删除选中(2)');
    togglePasswordSelectAll();
    expect([...document.querySelectorAll('.pwd-select')].every((el) => !el.checked)).toBe(true);
    expect(document.getElementById('pwdSelectAllBtn').textContent).toBe('全选');
  });

  it('网页没有原生桥时不打开', () => {
    delete window.Android;
    openPasswordManager();
    expect(document.getElementById('passwordManagerModal').classList.contains('active')).toBe(false);
    expect(document.querySelector('.pwd-card')).toBeNull();
  });
});
