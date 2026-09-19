import { applyCredentialEdit, credentialsEqual, parseCredentials, snapshotCredential } from './password-store.js';
import { isNativeApp, showToast } from './ui.js';
import { escapeHtml } from './utils.js';

const drafts = new Map();

function nativePasswords() {
    if (!isNativeApp() || typeof window.Android?.getSavedPasswords !== 'function') return [];
    try {
        return parseCredentials(window.Android.getSavedPasswords());
    } catch {
        return [];
    }
}

function persistPasswords(list) {
    if (typeof window.Android?.saveSavedPasswords !== 'function') return false;
    try {
        window.Android.saveSavedPasswords(JSON.stringify(list));
        return true;
    } catch {
        return false;
    }
}

function rowDraft(card) {
    return {
        id: card?.dataset?.id || '',
        website: card?.querySelector('.pwd-website')?.value ?? '',
        username: card?.querySelector('.pwd-username')?.value ?? '',
        password: card?.querySelector('.pwd-password')?.value ?? '',
    };
}

function setActionsVisible(card, visible) {
    const actions = card?.querySelector('.pwd-actions');
    if (actions) actions.hidden = !visible;
}

function bindPasswordManagerList(listEl) {
    if (!listEl || listEl.dataset.bound === '1') return;
    listEl.dataset.bound = '1';
    listEl.addEventListener('input', (event) => {
        const card = event.target.closest('.pwd-card');
        if (!card) return;
        const id = card.dataset.id;
        const original = drafts.get(id);
        if (!original) return;
        setActionsVisible(card, !credentialsEqual(original, rowDraft(card)));
    });
    listEl.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-pwd-act]');
        const card = event.target.closest('.pwd-card');
        if (!btn || !card) return;
        if (btn.dataset.pwdAct === 'save') savePasswordDraft(card.dataset.id);
        if (btn.dataset.pwdAct === 'cancel') cancelPasswordDraft(card.dataset.id);
    });
}

export function renderPasswordManager() {
    const listEl = document.getElementById('passwordManagerList');
    const emptyEl = document.getElementById('passwordManagerEmpty');
    if (!listEl) return;
    bindPasswordManagerList(listEl);
    drafts.clear();
    const list = nativePasswords();
    if (emptyEl) emptyEl.style.display = list.length ? 'none' : 'block';
    listEl.innerHTML = list.map((item) => {
        drafts.set(item.id, snapshotCredential(item));
        return `<div class="pwd-card" data-id="${escapeHtml(item.id)}">
            <label>网站</label>
            <input class="form-control pwd-website" value="${escapeHtml(item.website)}" autocomplete="off">
            <label>账号</label>
            <input class="form-control pwd-username" value="${escapeHtml(item.username)}" autocomplete="off">
            <label>密码</label>
            <input class="form-control pwd-password" value="${escapeHtml(item.password)}" autocomplete="off">
            <div class="pwd-actions" hidden>
                <button type="button" class="btn" data-pwd-act="cancel">取消</button>
                <button type="button" class="btn primary" data-pwd-act="save">保存</button>
            </div>
        </div>`;
    }).join('');
}

export function openPasswordManager() {
    if (!isNativeApp()) return;
    document.getElementById('toolsModal')?.classList.remove('active');
    renderPasswordManager();
    document.getElementById('passwordManagerModal')?.classList.add('active');
}

function cardById(id) {
    const value = String(id ?? '');
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
        return document.querySelector(`.pwd-card[data-id="${CSS.escape(value)}"]`);
    }
    return [...document.querySelectorAll('.pwd-card')].find((el) => el.dataset.id === value) || null;
}

export function savePasswordDraft(id) {
    const card = cardById(id);
    if (!card) return;
    const draft = rowDraft(card);
    if (!draft.website.trim() || !draft.username.trim()) {
        showToast('网站和账号不能为空');
        return;
    }
    const next = applyCredentialEdit(nativePasswords(), id, draft);
    if (!persistPasswords(next)) {
        showToast('保存失败');
        return;
    }
    drafts.set(id, snapshotCredential(draft));
    setActionsVisible(card, false);
    showToast('已保存');
}

export function cancelPasswordDraft(id) {
    const card = cardById(id);
    const original = drafts.get(id);
    if (!card || !original) return;
    const website = card.querySelector('.pwd-website');
    const username = card.querySelector('.pwd-username');
    const password = card.querySelector('.pwd-password');
    if (website) website.value = original.website;
    if (username) username.value = original.username;
    if (password) password.value = original.password;
    setActionsVisible(card, false);
}
