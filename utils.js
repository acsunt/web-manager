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

export function isOpenableUrl(url = '') {
    const trimmed = String(url || '').trim();
    return /^https?:\/\//i.test(trimmed) || /^file:\/\//i.test(trimmed);
}

export function httpUrlsOf(node) {
    return normalizeUrls(node)
        .map((item) => (item?.url || '').trim())
        .filter((url) => /^https?:\/\//i.test(url));
}

export function openableUrlsOf(node) {
    return normalizeUrls(node)
        .map((item) => (item?.url || '').trim())
        .filter((url) => isOpenableUrl(url));
}

export function collectOpenablePages(nodes) {
    const pages = [];
    const walk = (list) => {
        if (!Array.isArray(list)) return;
        list.forEach((node) => {
            if (node?.type === 'page') {
                const urls = openableUrlsOf(node);
                if (urls.length > 0) pages.push({ title: node.name || urls[0], url: urls[0], urls });
            } else if (node?.type === 'category') {
                walk(node.children);
            }
        });
    };
    walk(nodes);
    return pages;
}

export const SEARCH_HISTORY_KEY = 'webManagerSearchHistory';
export const SEARCH_HISTORY_LIMIT = 20;

export function parseSearchHistory(raw) {
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!Array.isArray(parsed)) return [];
        const seen = new Set();
        const list = [];
        parsed.forEach((item) => {
            const query = String(item ?? '').trim();
            if (!query) return;
            const key = query.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            list.push(query);
        });
        return list;
    } catch {
        return [];
    }
}

export function rememberSearchQuery(history, query, limit = SEARCH_HISTORY_LIMIT) {
    const q = String(query ?? '').trim();
    const list = parseSearchHistory(history);
    const max = Number.isInteger(limit) && limit > 0 ? limit : SEARCH_HISTORY_LIMIT;
    if (!q) return list.slice(0, max);
    const lower = q.toLowerCase();
    return [q, ...list.filter((item) => item.toLowerCase() !== lower)].slice(0, max);
}

export function sanitizeData(nodes) {
    if (!Array.isArray(nodes)) return [];

    nodes.forEach((node) => {
        if (Object.prototype.hasOwnProperty.call(node, 'isPinned')) {
            node.isPinned = !!node.isPinned;
        }
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

export const DEFAULT_LIST_COLUMN_MODE = 3;
export const DEFAULT_ICON_COLUMN_MODE = 0;

export function parseColumnMode(value, fallback) {
    const n = parseInt(value, 10);
    if (Number.isInteger(n) && n >= 0 && n <= 8) return n;
    return fallback;
}

export function resolveColumnModes(storage = {}) {
    const hasList = storage.listColumnMode != null;
    const hasIcon = storage.iconColumnMode != null;
    const legacy = storage.columnMode != null
        ? parseColumnMode(storage.columnMode, null)
        : null;

    return {
        listColumnMode: hasList
            ? parseColumnMode(storage.listColumnMode, DEFAULT_LIST_COLUMN_MODE)
            : (legacy ?? DEFAULT_LIST_COLUMN_MODE),
        iconColumnMode: hasIcon
            ? parseColumnMode(storage.iconColumnMode, DEFAULT_ICON_COLUMN_MODE)
            : DEFAULT_ICON_COLUMN_MODE,
        clearLegacyColumnMode: storage.columnMode != null,
    };
}