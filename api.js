const ALL_ORIGINS_ENDPOINT = 'https://api.allorigins.win/get?url=';
const NATIVE_FETCH_TIMEOUT_MS = 15000;

export const COMMON_SITES_DICTIONARY = {
    baidu: '百度', taobao: '淘宝', jd: '京东', qq: '腾讯',
    bilibili: '哔哩哔哩', weibo: '新浪微博', zhihu: '知乎',
    douyin: '抖音', github: 'GitHub', '163': '网易',
    sohu: '搜狐', smzdm: '什么值得买', xiaohongshu: '小红书',
    alipay: '支付宝', gitee: '码云', csdn: 'CSDN',
    youtube: 'YouTube', google: 'Google', microsoft: '微软',
    apple: 'Apple', twitter: 'Twitter', facebook: 'Facebook', tiktok: 'TikTok'
};

function decodeHtmlTitle(raw) {
    const decoder = document.createElement('textarea');
    decoder.innerHTML = String(raw || '').trim();
    return decoder.value;
}

function titleFromHtml(html) {
    if (!html) return '';
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!titleMatch?.[1]) return '';
    return decodeHtmlTitle(titleMatch[1]);
}

export function isHttpUrl(url) {
    return /^https?:\/\//i.test(String(url || '').trim());
}

export function isLocalPathUrl(url) {
    const value = String(url || '').trim();
    return /^file:\/\//i.test(value) || /^[a-zA-Z]:[\\/]/.test(value);
}

export function lookupCommonSiteTitle(url) {
    let domain = '';
    try { domain = new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return ''; }
    for (const key in COMMON_SITES_DICTIONARY) {
        if (domain === key || domain.startsWith(key + '.') || domain.includes('.' + key + '.')) {
            return COMMON_SITES_DICTIONARY[key];
        }
    }
    return '';
}

export function domainFallbackTitle(url) {
    let domain = '';
    try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
    const first = domain.split('.')[0];
    return first ? first.charAt(0).toUpperCase() + first.slice(1) : '';
}

function ensureNativePageInfoCallback(win) {
    if (typeof win.__onNativePageInfo === 'function') return;
    win.__nativePageInfoPending = Object.create(null);
    win.__onNativePageInfo = function onNativePageInfo(id, payload) {
        const pending = win.__nativePageInfoPending?.[id];
        if (!pending) return;
        delete win.__nativePageInfoPending[id];
        pending.resolve(payload);
    };
}

export function getNativePageInfoBridge(win = typeof window !== 'undefined' ? window : undefined) {
    const native = win?.Android;
    if (!native || typeof native.fetchPageInfo !== 'function') return null;

    return (url) => new Promise((resolve, reject) => {
        ensureNativePageInfoCallback(win);
        const requestId = 'npi_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
        const timer = setTimeout(() => {
            delete win.__nativePageInfoPending[requestId];
            try { native.cancelPageInfo?.(requestId); } catch (e) { /* 壳未实现取消也无妨 */ }
            const error = new Error('原生识别超时');
            error.name = 'AbortError';
            reject(error);
        }, NATIVE_FETCH_TIMEOUT_MS);

        win.__nativePageInfoPending[requestId] = {
            resolve: (payload) => {
                clearTimeout(timer);
                resolve(payload);
            },
            reject: (error) => {
                clearTimeout(timer);
                reject(error);
            },
        };

        try {
            native.fetchPageInfo(url, requestId);
        } catch (error) {
            delete win.__nativePageInfoPending[requestId];
            clearTimeout(timer);
            reject(error);
        }
    });
}

export function hasNativePageInfoBridge(win = typeof window !== 'undefined' ? window : undefined) {
    return Boolean(getNativePageInfoBridge(win));
}

export function nativeRecognitionConcurrency(win = typeof window !== 'undefined' ? window : undefined) {
    return hasNativePageInfoBridge(win) ? 2 : 5;
}

function parseNativePageInfo(raw) {
    if (raw == null || raw === false) return null;
    if (typeof raw === 'string') {
        const text = raw.trim();
        if (!text) return { title: '', icon: '' };
        try {
            return parseNativePageInfo(JSON.parse(text));
        } catch (e) {
            return { title: text, icon: '' };
        }
    }
    if (typeof raw === 'object') {
        return {
            title: String(raw.title || raw.name || '').trim(),
            icon: String(raw.icon || raw.customIcon || '').trim(),
        };
    }
    return null;
}

export async function fetchNativePageInfo(url, win = typeof window !== 'undefined' ? window : undefined) {
    const bridge = getNativePageInfoBridge(win);
    if (!bridge) return null;
    if (!isHttpUrl(url) || isLocalPathUrl(url)) return { title: '', icon: '' };

    const result = await bridge(url);
    return parseNativePageInfo(result);
}

export async function request(url, { timeout = 4000, ...options } = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        if (options.mode !== 'no-cors' && !response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response;
    } finally {
        clearTimeout(timeoutId);
    }
}

export async function fetchJson(url, options = {}) {
    const response = await request(url, options);
    return await response.json();
}

export function fetchProxyJson(targetUrl, options) {
    return fetchJson(`${ALL_ORIGINS_ENDPOINT}${encodeURIComponent(targetUrl)}`, options);
}

export async function fetchPageTitle(targetUrl, options) {
    const data = await fetchProxyJson(targetUrl, options);
    return titleFromHtml(data?.contents);
}

export async function fetchWebPageTitle(url, options) {
    const known = lookupCommonSiteTitle(url);
    if (known) return known;
    try {
        const title = await fetchPageTitle(url, options);
        if (title) return title;
    } catch (e) { /* 静默失败，继续兜底 */ }
    return domainFallbackTitle(url);
}

export async function fetchPageTitleFor(url, win = typeof window !== 'undefined' ? window : undefined) {
    if (hasNativePageInfoBridge(win)) {
        try {
            const native = await fetchNativePageInfo(url, win);
            if (native?.title) return native.title;
        } catch (e) { /* 原生失败回退网页方案 */ }
    }
    return fetchWebPageTitle(url);
}

export async function fetchWebPageIcon(url) {
    if (!isHttpUrl(url) || isLocalPathUrl(url)) return '';
    let domain = '';
    try { domain = new URL(url).hostname; } catch (e) { return ''; }
    if (!domain) return '';
    const faviconUrl = createFaviconUrl(url);
    const iowenUrl = `https://api.iowen.cn/favicon/${domain}`;
    try {
        const data = await fetchProxyJson(faviconUrl, { timeout: 4000 });
        if (data?.contents?.startsWith('data:image')) return data.contents;
        return faviconUrl;
    } catch (e) {
        return iowenUrl;
    }
}

export async function fetchPageIconFor(url, win = typeof window !== 'undefined' ? window : undefined) {
    if (hasNativePageInfoBridge(win)) {
        try {
            const native = await fetchNativePageInfo(url, win);
            if (native?.icon) return native.icon;
        } catch (e) { /* 原生失败回退网页方案 */ }
    }
    return fetchWebPageIcon(url);
}

export async function fetchRecognizedPageInfo(url, win = typeof window !== 'undefined' ? window : undefined) {
    if (hasNativePageInfoBridge(win)) {
        try {
            const native = await fetchNativePageInfo(url, win);
            if (native && (native.title || native.icon)) {
                return {
                    title: native.title,
                    icon: native.icon || await fetchWebPageIcon(url),
                };
            }
        } catch (e) { /* 原生失败回退网页方案 */ }
    }
    const [title, icon] = await Promise.all([
        fetchWebPageTitle(url),
        fetchWebPageIcon(url),
    ]);
    return { title, icon };
}

export function createFaviconUrl(pageUrl, size = 128) {
    const domain = new URL(pageUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}