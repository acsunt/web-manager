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
        const title = String(item.title ?? '').trim();
        const username = String(item.username ?? item.account ?? '').trim();
        const password = String(item.password ?? '');
        if (!website && !username && !password) return;
        let id = String(item.id ?? '').trim();
        if (!id || seen.has(id)) id = `p_${index}_${Date.now()}`;
        seen.add(id);
        list.push({
            id,
            website,
            title,
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

export function exportCredentialsDocument(list) {
    return JSON.stringify({
        type: 'web_manager_passwords',
        version: '1.0',
        passwords: parseCredentials(list),
    }, null, 2);
}

export function importCredentialsDocument(raw, existing = []) {
    let parsed = raw;
    if (typeof raw === 'string') {
        try { parsed = JSON.parse(raw); } catch { return { ok: false, error: '不是有效的 JSON 文件' }; }
    }
    let incoming = [];
    if (Array.isArray(parsed)) incoming = parseCredentials(parsed);
    else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.passwords)) incoming = parseCredentials(parsed.passwords);
    else return { ok: false, error: '文件里没有密码数据' };
    if (!incoming.length) return { ok: false, error: '文件里没有可导入的密码' };

    const next = parseCredentials(existing);
    let added = 0;
    let updated = 0;
    incoming.forEach((item) => {
        const index = next.findIndex((row) => originsMatch(row.website, item.website) && row.username === item.username);
        if (index >= 0) {
            next[index] = {
                ...next[index],
                website: item.website || next[index].website,
                title: item.title || next[index].title,
                username: item.username,
                password: item.password,
                updatedAt: Date.now(),
            };
            updated += 1;
            return;
        }
        next.push({
            ...item,
            id: `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
            updatedAt: Date.now(),
        });
        added += 1;
    });
    return { ok: true, list: next, added, updated };
}

export function snapshotCredential(entry) {
    return {
        id: String(entry?.id ?? ''),
        website: String(entry?.website ?? ''),
        title: String(entry?.title ?? ''),
        username: String(entry?.username ?? ''),
        password: String(entry?.password ?? ''),
    };
}

export function credentialsEqual(a, b) {
    return snapshotCredential(a).website === snapshotCredential(b).website
        && snapshotCredential(a).title === snapshotCredential(b).title
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

export function upsertCapturedLogin(list, { url, title, username, password } = {}) {
    const next = parseCredentials(list);
    const user = String(username ?? '').trim();
    const pass = String(password ?? '');
    const website = normalizeWebsite(url);
    const pageTitle = String(title ?? '').trim();
    if (!website || !user || !pass) return next;
    const index = next.findIndex((item) => originsMatch(item.website, website) && item.username === user);
    const now = Date.now();
    if (index >= 0) {
        next[index] = {
            ...next[index],
            website,
            title: pageTitle || next[index].title || '',
            username: user,
            password: pass,
            updatedAt: now,
        };
        return next;
    }
    next.push({
        id: `p_${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        website,
        title: pageTitle,
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
            title: String(draft?.title ?? item.title ?? '').trim(),
            username,
            password,
            updatedAt: Date.now(),
        };
    });
}

export function removeCredentials(list, ids) {
    const idSet = new Set((Array.isArray(ids) ? ids : [ids]).map((id) => String(id ?? '')).filter(Boolean));
    if (!idSet.size) return parseCredentials(list);
    return parseCredentials(list).filter((item) => !idSet.has(item.id));
}
