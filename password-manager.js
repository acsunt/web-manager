import { applyCredentialEdit, credentialsEqual, parseCredentials, removeCredentials, snapshotCredential } from './password-store.js';
import { isNativeApp, showToast } from './ui.js';
import { escapeHtml } from './utils.js';

const drafts = new Map();
let selecting = false;

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
        title: card?.querySelector('.pwd-title-input')?.value ?? card?.dataset?.title ?? '',
        username: card?.querySelector('.pwd-username')?.value ?? '',
        password: card?.querySelector('.pwd-password')?.value ?? '',
    };
}

function fieldHtml(label, className, value) {
    const filled = String(value ?? '');
    return `<label>${label}</label>
        <div class="pwd-input-wrap">
            <input class="form-control ${className}" value="${escapeHtml(filled)}" autocomplete="off">
            <button type="button" class="pwd-clear-btn" data-pwd-act="clear" aria-label="清空"${filled ? '' : ' hidden'}>&times;</button>
        </div>`;
}

function syncClearButtons(card) {
    card?.querySelectorAll('.pwd-input-wrap').forEach((wrap) => {
        const input = wrap.querySelector('input');
        const btn = wrap.querySelector('.pwd-clear-btn');
        if (btn) btn.hidden = !String(input?.value ?? '');
    });
}

function setActionsVisible(card, visible) {
    const actions = card?.querySelector('.pwd-actions');
    if (actions) actions.hidden = !visible;
}

function selectedIds() {
    return [...document.querySelectorAll('.pwd-select:checked')].map((el) => el.closest('.pwd-card')?.dataset.id).filter(Boolean);
}

function syncSelectUi() {
    const modal = document.getElementById('passwordManagerModal');
    if (modal) modal.classList.toggle('pwd-selecting', selecting);
    const toggleBtn = document.getElementById('pwdSelectToggleBtn');
    if (toggleBtn) toggleBtn.textContent = selecting ? '取消' : '多选';
    const count = selectedIds().length;
    const deleteBtn = document.getElementById('pwdDeleteSelectedBtn');
    if (deleteBtn) {
        deleteBtn.hidden = !selecting;
        deleteBtn.disabled = count === 0;
        deleteBtn.textContent = count ? `删除选中(${count})` : '删除选中';
    }
    document.querySelectorAll('.pwd-card').forEach((card) => {
        card.classList.toggle('pwd-checked', !!card.querySelector('.pwd-select:checked'));
    });
}

function setSelecting(on) {
    selecting = !!on;
    if (!selecting) {
        document.querySelectorAll('.pwd-select').forEach((el) => { el.checked = false; });
        document.querySelectorAll('.pwd-card.editing').forEach((card) => exitEdit(card, true));
    }
    syncSelectUi();
}

function enterEdit(card) {
    if (!card || selecting) return;
    document.querySelectorAll('.pwd-card.editing').forEach((other) => {
        if (other !== card) exitEdit(other, true);
    });
    card.classList.add('editing');
    setActionsVisible(card, false);
}

function exitEdit(card, restore = false) {
    if (!card) return;
    if (restore) cancelPasswordDraft(card.dataset.id);
    card.classList.remove('editing');
    setActionsVisible(card, false);
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
        syncClearButtons(card);
        setActionsVisible(card, card.classList.contains('editing') && !credentialsEqual(original, rowDraft(card)));
    });
    listEl.addEventListener('change', (event) => {
        if (event.target.classList.contains('pwd-select')) syncSelectUi();
    });
    listEl.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-pwd-act]');
        const card = event.target.closest('.pwd-card');
        if (!card) return;
        if (btn) {
            if (btn.dataset.pwdAct === 'clear') {
                const input = btn.closest('.pwd-input-wrap')?.querySelector('input');
                if (input) {
                    input.value = '';
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.focus();
                }
                return;
            }
            if (btn.dataset.pwdAct === 'edit') enterEdit(card);
            if (btn.dataset.pwdAct === 'save') savePasswordDraft(card.dataset.id);
            if (btn.dataset.pwdAct === 'cancel') exitEdit(card, true);
            if (btn.dataset.pwdAct === 'delete') deletePassword(card.dataset.id);
            return;
        }
        if (selecting && event.target.type !== 'checkbox') {
            const cb = card.querySelector('.pwd-select');
            if (cb) {
                cb.checked = !cb.checked;
                syncSelectUi();
            }
        }
    });
}

export function renderPasswordManager() {
    const listEl = document.getElementById('passwordManagerList');
    const emptyEl = document.getElementById('passwordManagerEmpty');
    if (!listEl) return;
    bindPasswordManagerList(listEl);
    drafts.clear();
    setSelecting(false);
    const list = nativePasswords();
    if (emptyEl) emptyEl.style.display = list.length ? 'none' : 'block';
    const toolbar = document.getElementById('pwdManagerToolbar');
    if (toolbar) toolbar.hidden = list.length === 0;
    listEl.innerHTML = list.map((item) => {
        drafts.set(item.id, snapshotCredential(item));
        const heading = item.title || item.website || '未填写网站';
        return `<div class="pwd-card" data-id="${escapeHtml(item.id)}" data-title="${escapeHtml(item.title || '')}">
            <div class="pwd-card-head">
                <label class="pwd-select-wrap"><input type="checkbox" class="pwd-select"></label>
                <div class="pwd-summary">
                    <div class="pwd-title">${escapeHtml(heading)}</div>
                    <div class="pwd-sub">${escapeHtml(item.website)}</div>
                </div>
                <button type="button" class="btn small pwd-edit-btn" data-pwd-act="edit">编辑</button>
                <button type="button" class="btn small danger pwd-delete-btn" data-pwd-act="delete">删除</button>
            </div>
            <div class="pwd-fields">
                ${fieldHtml('标题', 'pwd-title-input', item.title || '')}
                ${fieldHtml('网站', 'pwd-website', item.website)}
                ${fieldHtml('账号', 'pwd-username', item.username)}
                ${fieldHtml('密码', 'pwd-password', item.password)}
                <div class="pwd-actions" hidden>
                    <button type="button" class="btn" data-pwd-act="cancel">取消</button>
                    <button type="button" class="btn primary" data-pwd-act="save">保存</button>
                </div>
            </div>
        </div>`;
    }).join('');
    syncSelectUi();
}

export function openPasswordManager() {
    if (!isNativeApp()) return;
    document.getElementById('toolsModal')?.classList.remove('active');
    renderPasswordManager();
    document.getElementById('passwordManagerModal')?.classList.add('active');
}

export function togglePasswordSelectMode() {
    setSelecting(!selecting);
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
    card.dataset.title = draft.title || '';
    const title = card.querySelector('.pwd-title');
    const sub = card.querySelector('.pwd-sub');
    if (title) title.textContent = draft.title || draft.website || '未填写网站';
    if (sub) sub.textContent = draft.website;
    syncClearButtons(card);
    card.classList.remove('editing');
    setActionsVisible(card, false);
    showToast('已保存');
}

export function cancelPasswordDraft(id) {
    const card = cardById(id);
    const original = drafts.get(id);
    if (!card || !original) return;
    const title = card.querySelector('.pwd-title-input');
    const website = card.querySelector('.pwd-website');
    const username = card.querySelector('.pwd-username');
    const password = card.querySelector('.pwd-password');
    if (title) title.value = original.title;
    if (website) website.value = original.website;
    if (username) username.value = original.username;
    if (password) password.value = original.password;
    syncClearButtons(card);
    setActionsVisible(card, false);
}

export function deletePassword(id) {
    if (!id) return;
    if (!confirm('确定删除这条密码吗？')) return;
    deletePasswords([id]);
}

export function deleteSelectedPasswords() {
    const ids = selectedIds();
    if (!ids.length) return;
    if (!confirm(`确定删除选中的 ${ids.length} 条密码吗？`)) return;
    deletePasswords(ids);
}

function deletePasswords(ids) {
    const next = removeCredentials(nativePasswords(), ids);
    if (!persistPasswords(next)) {
        showToast('删除失败');
        return;
    }
    showToast(ids.length > 1 ? `已删除 ${ids.length} 条` : '已删除');
    renderPasswordManager();
}
