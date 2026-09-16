export function normalizeUrls(node) {
    if (Array.isArray(node?.urls) && node.urls.length > 0) return node.urls;
    if (node?.url) return [{ url: node.url, name: '' }];
    return [];
}

export function countPages(node) {
    if (node?.type === 'page') return 1;
    if (!Array.isArray(node?.children)) return 0;
    return node.children.reduce((total, child) => total + countPages(child), 0);
}

export function countTotalPages(nodes) {
    if (!Array.isArray(nodes)) return 0;
    return nodes.reduce((total, node) => total + countPages(node), 0);
}

export function sanitizeData(nodes) {
    if (!Array.isArray(nodes)) return [];

    nodes.forEach((node) => {
        if (node.type !== 'category') return;
        if (!Array.isArray(node.children)) node.children = [];
        sanitizeData(node.children);
    });
    return nodes;
}

export function isLocalUrl(url = '') {
    return /^file:\/\//i.test(url) || /^[a-zA-Z]:[\\/]/.test(url);
}

export function normalizeWebUrl(url = '') {
    const trimmed = url.trim();
    if (!trimmed || /^https?:\/\//i.test(trimmed) || isLocalUrl(trimmed)) return trimmed;
    return `https://${trimmed}`;
}

export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}