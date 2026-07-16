const ALL_ORIGINS_ENDPOINT = 'https://api.allorigins.win/get?url=';

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
    if (!data?.contents) return '';

    const titleMatch = data.contents.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!titleMatch?.[1]) return '';

    const decoder = document.createElement('textarea');
    decoder.innerHTML = titleMatch[1].trim();
    return decoder.value;
}

export function createFaviconUrl(pageUrl, size = 128) {
    const domain = new URL(pageUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}