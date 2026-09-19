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

function decodeHtmlEntities(value) {
    return String(value ?? '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripHtmlTags(value) {
    return decodeHtmlEntities(String(value ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function attrValue(attrs, name) {
    const source = String(attrs ?? '');
    const quoted = source.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
    if (quoted) return decodeHtmlEntities(quoted[2] ?? quoted[3] ?? '').trim();
    const bare = source.match(new RegExp(`${name}\\s*=\\s*([^\\s>]+)`, 'i'));
    return decodeHtmlEntities(bare ? bare[1] : '').trim();
}

function isBookmarkHref(href) {
    const url = String(href || '').trim();
    if (!url) return false;
    return !/^(javascript:|data:|place:|chrome:|about:)/i.test(url);
}

function bookmarkPage(name, href) {
    const url = String(href || '').trim();
    const title = String(name || '').trim() || url;
    return {
        type: 'page',
        name: title,
        url,
        urls: [{ url, name: '' }],
        collapsed: false,
    };
}

function parseGenericHtmlLinks(html) {
    const pages = [];
    const seen = new Set();
    const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = re.exec(html))) {
        const href = attrValue(match[1], 'href');
        if (!isBookmarkHref(href) || seen.has(href)) continue;
        seen.add(href);
        pages.push(bookmarkPage(stripHtmlTags(match[2]), href));
    }
    return pages;
}

export function isHtmlFile(filename = '', mime = '') {
    const name = String(filename || '').toLowerCase();
    const type = String(mime || '').toLowerCase();
    return name.endsWith('.html') || name.endsWith('.htm') || type.includes('html') || type.includes('xhtml');
}

export function htmlFileTitle(filename = '') {
    const name = String(filename || '').replace(/\\/g, '/').split('/').pop() || '';
    return name.replace(/\.(html|htm)$/i, '').trim() || '本地网页';
}

export function looksLikeBookmarkHtml(html, filename = '', mime = '') {
    const name = String(filename || '').toLowerCase();
    const type = String(mime || '').toLowerCase();
    if (name.endsWith('.html') || name.endsWith('.htm') || type.includes('html')) return true;
    const source = String(html || '');
    if (!source.trim()) return false;
    return /netscape-bookmark-file/i.test(source) || (/<a\b[^>]*href\s*=/i.test(source) && /<\/a>/i.test(source));
}

export function parseBookmarkHtml(html) {
    const source = String(html || '');
    if (!source.trim()) return [];

    const root = { children: [] };
    const stack = [root];
    const re = /<DT\s*>\s*<H3\b([^>]*)>([\s\S]*?)<\/H3>|<DT\s*>\s*<A\b([^>]*)>([\s\S]*?)<\/A>|<\/DL\b[^>]*>/gi;
    let match;
    let found = false;
    while ((match = re.exec(source))) {
        found = true;
        const token = match[0].replace(/\s+/g, '').toUpperCase();
        if (token.startsWith('</DL')) {
            if (stack.length > 1) stack.pop();
            continue;
        }
        if (match[2] != null) {
            const name = stripHtmlTags(match[2]) || '未命名分类';
            const category = { type: 'category', name, children: [], collapsed: false };
            stack[stack.length - 1].children.push(category);
            stack.push(category);
            continue;
        }
        const href = attrValue(match[3], 'HREF');
        if (!isBookmarkHref(href)) continue;
        stack[stack.length - 1].children.push(bookmarkPage(stripHtmlTags(match[4]), href));
    }
    if (found && root.children.length > 0) return root.children;
    return parseGenericHtmlLinks(source);
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
export const HIDE_ICONS_STORAGE_KEY = 'webManagerHideIcons';
export const ICON_FEATURE_FIELDS = ['iconType', 'customIcon', 'recognizedName'];

export function parseHideIconsPref(value) {
    if (value == null || value === '') return true;
    return String(value) !== 'false';
}

export function stripIconFieldsFromTree(nodes) {
    if (!Array.isArray(nodes)) return [];
    return nodes.map((node) => {
        if (!node || typeof node !== 'object') return node;
        const next = { ...node };
        ICON_FEATURE_FIELDS.forEach((key) => { delete next[key]; });
        if (Array.isArray(next.children)) next.children = stripIconFieldsFromTree(next.children);
        return next;
    });
}

export function stripRedundantUrlFromTree(nodes) {
    if (!Array.isArray(nodes)) return [];
    return nodes.map((node) => {
        if (!node || typeof node !== 'object') return node;
        const next = { ...node };
        if (Array.isArray(next.urls) && next.urls.length > 0) delete next.url;
        if (Array.isArray(next.children)) next.children = stripRedundantUrlFromTree(next.children);
        return next;
    });
}

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