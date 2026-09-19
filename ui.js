export function showToast(message, duration = 2000) {
    const toast = document.getElementById('toast-notification');
    if (!toast) return;

    toast.innerHTML = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
}

export function closeDialog(id) {
    document.getElementById(id)?.classList.remove('active');
}

const NATIVE_SAVE_CHUNK_BYTES = 256 * 1024;

function bytesToBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

export async function downloadBlob(blob, filename) {
    const android = typeof window !== 'undefined' ? window.Android : undefined;
    if (android && typeof android.beginSaveFile === 'function' && typeof android.appendSaveFile === 'function' && typeof android.finishSaveFile === 'function') {
        const buffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const mime = blob.type || 'application/octet-stream';
        try {
            android.beginSaveFile(mime, filename);
            for (let offset = 0; offset < bytes.length; offset += NATIVE_SAVE_CHUNK_BYTES) {
                const chunk = bytes.subarray(offset, Math.min(offset + NATIVE_SAVE_CHUNK_BYTES, bytes.length));
                const ok = android.appendSaveFile(bytesToBase64(chunk));
                if (ok === false) throw new Error('appendSaveFile failed');
            }
            android.finishSaveFile();
            return;
        } catch (e) {
            try { android.cancelSaveFile?.(); } catch (ignored) { /* 取消失败不影响网页回退 */ }
        }
    }
    if (android && typeof android.saveFile === 'function') {
        const buffer = await blob.arrayBuffer();
        window.Android.saveFile(bytesToBase64(new Uint8Array(buffer)), blob.type || 'application/octet-stream', filename);
        return;
    }

    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
}

export function applySafeAreaInsets(insets = {}) {
    const root = document.documentElement;
    if (!root?.style) return;
    const toPx = (value) => `${Math.max(0, Number(value) || 0)}px`;
    root.style.setProperty('--safe-top', toPx(insets.top));
    root.style.setProperty('--safe-right', toPx(insets.right));
    root.style.setProperty('--safe-bottom', toPx(insets.bottom));
    root.style.setProperty('--safe-left', toPx(insets.left));
}

export function isNativeApp() {
    return typeof window !== 'undefined' && typeof window.Android === 'object' && window.Android !== null;
}

export function installNativeDialogs() {
    if (typeof window === 'undefined' || typeof window.Android?.alert !== 'function') return;
    window.alert = (message) => {
        window.Android.alert(message == null ? '' : String(message));
    };
    window.confirm = (message) => {
        return !!window.Android.confirm(message == null ? '' : String(message));
    };
    window.prompt = (message, defaultValue) => {
        const result = window.Android.prompt(message == null ? '' : String(message), defaultValue == null ? '' : String(defaultValue));
        return result == null ? null : String(result);
    };
}

export async function copyTextToClipboard(text) {
    const value = text == null ? '' : String(text);
    if (typeof window !== 'undefined' && typeof window.Android?.copyText === 'function') {
        try {
            const ok = window.Android.copyText(value);
            if (ok !== false) return true;
        } catch (e) { /* 网页没有原生桥 */ }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(value);
            return true;
        } catch (e) { /* APK file:// WebView 常不支持 Clipboard API */ }
    }
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    try {
        return !!document.execCommand('copy');
    } catch (e) {
        return false;
    } finally {
        ta.remove();
    }
}

export function defaultThemeScale() {
    if (isNativeApp()) {
        return { systemTextSize: false, textScale: 1, uiScale: 1 };
    }
    return { systemTextSize: true, textScale: 1, uiScale: 1 };
}

export function syncNativeSystemBars(darkMode) {
    if (typeof window === 'undefined' || typeof window.Android?.setSystemBarsAppearance !== 'function') return;
    try {
        window.Android.setSystemBarsAppearance(!darkMode);
    } catch (e) { /* 网页没有原生桥 */ }
}

export function registerWindowHandlers(handlers) {
    Object.assign(window, handlers);
}

export function warnMissingInlineHandlers(handlers, expectedNames = new Set()) {
    expectedNames.forEach((name) => {
        if (name in handlers) return;
        if (typeof window[name] !== 'undefined') return;
        console.warn(`未找到界面事件函数: ${name}`);
    });
}

export function registerInlineHandlers(handlers, expectedNames = new Set()) {
    registerWindowHandlers(handlers);
    warnMissingInlineHandlers(handlers, expectedNames);
}

export function setSelectiveClearChecked(checkbox, checked) {
    if (!checkbox) return;
    checkbox.checked = checked;
    checkbox.indeterminate = false;
}

export function childSelectiveClearChecks(checkbox) {
    const row = checkbox?.closest('.selective-clear-row');
    const nest = row?.querySelector(':scope > .selective-clear-children');
    return nest ? Array.from(nest.querySelectorAll('.selective-clear-check')) : [];
}

export function parentSelectiveClearCheck(checkbox) {
    const row = checkbox?.closest('.selective-clear-row');
    const parentRow = row?.parentElement?.closest('.selective-clear-row');
    return parentRow?.querySelector(':scope > label .selective-clear-check') || null;
}

export function syncSelectiveClearAncestors(checkbox) {
    let parent = parentSelectiveClearCheck(checkbox);
    while (parent) {
        const children = childSelectiveClearChecks(parent);
        const checkedCount = children.filter((cb) => cb.checked).length;
        if (parent.checked && checkedCount < children.length) parent.checked = false;
        parent.indeterminate = !parent.checked && checkedCount > 0;
        parent = parentSelectiveClearCheck(parent);
    }
}

export function onSelectiveClearCheckChange(checkbox) {
    if (!checkbox) return;
    childSelectiveClearChecks(checkbox).forEach((child) => setSelectiveClearChecked(child, checkbox.checked));
    checkbox.indeterminate = false;
    syncSelectiveClearAncestors(checkbox);
}

export function collectInlineHandlerNames(root = document) {
    const eventAttributes = ['onclick', 'onchange', 'oninput', 'onblur', 'onfocus', 'onmousedown', 'onkeydown'];
    const names = new Set();

    root.querySelectorAll('*').forEach((element) => {
        eventAttributes.forEach((attribute) => {
            const source = element.getAttribute(attribute);
            const match = source?.match(/^\s*([A-Za-z_$][\w$]*)\s*\(/);
            if (match) names.add(match[1]);
        });
    });
    return names;
}