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

export async function downloadBlob(blob, filename) {
    if (typeof window !== 'undefined' && typeof window.Android?.saveFile === 'function') {
        const buffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        window.Android.saveFile(btoa(binary), blob.type || 'application/octet-stream', filename);
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

export function collectInlineHandlerNames(root = document) {
    const eventAttributes = ['onclick', 'onchange', 'oninput', 'onblur', 'onfocus'];
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