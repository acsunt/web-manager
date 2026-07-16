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

export function downloadBlob(blob, filename) {
    const link = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
}

export function registerWindowHandlers(handlers) {
    Object.assign(window, handlers);
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