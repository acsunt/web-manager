import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelPasswordDraft, deletePassword, deleteSelectedPasswords, openPasswordManager, savePasswordDraft, togglePasswordSelectMode } from '../password-manager.js';

function mountManager() {
  document.body.innerHTML = `
    <div id="toast-notification"></div>
    <div id="passwordManagerModal" class="modal">
      <div id="pwdManagerToolbar">
        <button type="button" id="pwdSelectToggleBtn">多选</button>
        <button type="button" id="pwdDeleteSelectedBtn" hidden>删除选中</button>
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
  };
}

describe('password-manager', () => {
  beforeEach(() => {
    mountManager();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockStore([
      { id: 'p1', website: 'example.com', username: 'alice', password: 'old' },
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
    expect(card.querySelector('.pwd-title').textContent).toBe('example.com');
    expect(card.querySelector('.pwd-sub').textContent).toBe('example.com');
    expect(card.querySelector('.pwd-username').value).toBe('alice');
    expect(card.querySelector('.pwd-password').value).toBe('old');
    expect(card.querySelector('.pwd-actions').hidden).toBe(true);
  });

  it('点编辑后才改账号密码，保存写入，取消还原', () => {
    openPasswordManager();
    const card = document.querySelector('.pwd-card');
    card.querySelector('[data-pwd-act="edit"]').click();
    expect(card.classList.contains('editing')).toBe(true);
    const website = card.querySelector('.pwd-website');
    const username = card.querySelector('.pwd-username');
    const password = card.querySelector('.pwd-password');
    website.value = 'new.com';
    username.value = 'neo';
    password.value = 'secret';
    website.dispatchEvent(new Event('input', { bubbles: true }));
    expect(card.querySelector('.pwd-actions').hidden).toBe(false);

    cancelPasswordDraft('p1');
    expect(website.value).toBe('example.com');
    expect(username.value).toBe('alice');
    expect(password.value).toBe('old');
    expect(window.Android.saveSavedPasswords).not.toHaveBeenCalled();

    website.value = 'new.com';
    username.value = 'neo';
    password.value = 'secret';
    savePasswordDraft('p1');
    expect(window.Android.saveSavedPasswords).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(window.Android.saveSavedPasswords.mock.calls[0][0]);
    expect(saved[0]).toEqual(expect.objectContaining({
      website: 'new.com',
      username: 'neo',
      password: 'secret',
    }));
    expect(card.classList.contains('editing')).toBe(false);
    expect(card.querySelector('.pwd-title').textContent).toBe('new.com');
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
  });

  it('网页没有原生桥时不打开', () => {
    delete window.Android;
    openPasswordManager();
    expect(document.getElementById('passwordManagerModal').classList.contains('active')).toBe(false);
    expect(document.querySelector('.pwd-card')).toBeNull();
  });
});
