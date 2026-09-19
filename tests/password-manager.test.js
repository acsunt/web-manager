import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelPasswordDraft, openPasswordManager, savePasswordDraft } from '../password-manager.js';

function mountManager() {
  document.body.innerHTML = `
    <div id="toast-notification"></div>
    <div id="passwordManagerModal" class="modal">
      <div id="passwordManagerEmpty"></div>
      <div id="passwordManagerList"></div>
    </div>
  `;
}

describe('password-manager', () => {
  beforeEach(() => {
    mountManager();
    window.Android = {
      getSavedPasswords: () => JSON.stringify([
        { id: 'p1', website: 'example.com', username: 'alice', password: 'old' },
      ]),
      saveSavedPasswords: vi.fn(() => true),
    };
  });

  afterEach(() => {
    delete window.Android;
    document.body.innerHTML = '';
  });

  it('APK 下打开后能看见对应网站的账号密码', () => {
    openPasswordManager();
    const modal = document.getElementById('passwordManagerModal');
    expect(modal.classList.contains('active')).toBe(true);
    const card = document.querySelector('.pwd-card');
    expect(card.querySelector('.pwd-website').value).toBe('example.com');
    expect(card.querySelector('.pwd-username').value).toBe('alice');
    expect(card.querySelector('.pwd-password').value).toBe('old');
    expect(card.querySelector('.pwd-actions').hidden).toBe(true);
  });

  it('编辑后点保存才写入，点取消还原', () => {
    openPasswordManager();
    const card = document.querySelector('.pwd-card');
    const website = card.querySelector('.pwd-website');
    const username = card.querySelector('.pwd-username');
    const password = card.querySelector('.pwd-password');
    website.value = 'new.com';
    username.value = 'bob';
    password.value = 'secret';
    website.dispatchEvent(new Event('input', { bubbles: true }));
    expect(card.querySelector('.pwd-actions').hidden).toBe(false);

    cancelPasswordDraft('p1');
    expect(website.value).toBe('example.com');
    expect(username.value).toBe('alice');
    expect(password.value).toBe('old');
    expect(window.Android.saveSavedPasswords).not.toHaveBeenCalled();

    website.value = 'new.com';
    username.value = 'bob';
    password.value = 'secret';
    savePasswordDraft('p1');
    expect(window.Android.saveSavedPasswords).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(window.Android.saveSavedPasswords.mock.calls[0][0]);
    expect(saved[0]).toEqual(expect.objectContaining({
      website: 'new.com',
      username: 'bob',
      password: 'secret',
    }));
    expect(card.querySelector('.pwd-actions').hidden).toBe(true);
  });

  it('网页没有原生桥时不打开', () => {
    delete window.Android;
    openPasswordManager();
    expect(document.getElementById('passwordManagerModal').classList.contains('active')).toBe(false);
    expect(document.querySelector('.pwd-card')).toBeNull();
  });
});
