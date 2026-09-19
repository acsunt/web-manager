export function stripWww(host = '') {
    return String(host || '').trim().toLowerCase().replace(/^www\./, '');
}

export function normalizeWebsite(value = '') {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    try {
        const withScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed) ? trimmed : `https://${trimmed}`;
        const url = new URL(withScheme);
        const host = String(url.hostname || '').trim().toLowerCase();
        return host || trimmed;
    } catch {
        return trimmed.replace(/^https?:\/\//i, '').split('/')[0].trim().toLowerCase();
    }
}

export function originsMatch(savedWebsite, pageUrl) {
    const saved = stripWww(normalizeWebsite(savedWebsite));
    const page = stripWww(normalizeWebsite(pageUrl));
    return !!saved && !!page && saved === page;
}

export function parseCredentials(raw) {
    let parsed = raw;
    if (typeof raw === 'string') {
        try { parsed = JSON.parse(raw); } catch { return []; }
    }
    if (!Array.isArray(parsed)) return [];
    const list = [];
    const seen = new Set();
    parsed.forEach((item, index) => {
        if (!item || typeof item !== 'object') return;
        const website = String(item.website ?? '').trim();
        const username = String(item.username ?? item.account ?? '').trim();
        const password = String(item.password ?? '');
        if (!website && !username && !password) return;
        let id = String(item.id ?? '').trim();
        if (!id || seen.has(id)) id = `p_${index}_${Date.now()}`;
        seen.add(id);
        list.push({
            id,
            website,
            username,
            password,
            updatedAt: Number(item.updatedAt) || 0,
        });
    });
    return list;
}

export function serializeCredentials(list) {
    return JSON.stringify(parseCredentials(list));
}

export function snapshotCredential(entry) {
    return {
        id: String(entry?.id ?? ''),
        website: String(entry?.website ?? ''),
        username: String(entry?.username ?? ''),
        password: String(entry?.password ?? ''),
    };
}

export function credentialsEqual(a, b) {
    return snapshotCredential(a).website === snapshotCredential(b).website
        && snapshotCredential(a).username === snapshotCredential(b).username
        && snapshotCredential(a).password === snapshotCredential(b).password;
}

export function matchCredentials(list, pageUrl, typed = '') {
    const q = String(typed ?? '').trim().toLowerCase();
    return parseCredentials(list)
        .filter((item) => originsMatch(item.website, pageUrl))
        .filter((item) => {
            if (!q) return true;
            return item.username.toLowerCase().includes(q) || item.website.toLowerCase().includes(q);
        })
        .slice(0, 8);
}

export function upsertCapturedLogin(list, { url, username, password } = {}) {
    const next = parseCredentials(list);
    const user = String(username ?? '').trim();
    const pass = String(password ?? '');
    const website = normalizeWebsite(url);
    if (!website || !user || !pass) return next;
    const index = next.findIndex((item) => originsMatch(item.website, website) && item.username === user);
    const now = Date.now();
    if (index >= 0) {
        next[index] = { ...next[index], website, username: user, password: pass, updatedAt: now };
        return next;
    }
    next.push({
        id: `p_${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        website,
        username: user,
        password: pass,
        updatedAt: now,
    });
    return next;
}

export function applyCredentialEdit(list, id, draft) {
    const next = parseCredentials(list);
    const website = String(draft?.website ?? '').trim();
    const username = String(draft?.username ?? '').trim();
    const password = String(draft?.password ?? '');
    if (!id || !website || !username) return next;
    return next.map((item) => {
        if (item.id !== id) return item;
        return {
            ...item,
            website,
            username,
            password,
            updatedAt: Date.now(),
        };
    });
}
