import { collectPagesFromWorkspaces, findNode } from './tree.js';

export function createDefaultAppData(now = Date.now()) {
    const id = 'ws_' + now;
    return {
        workspaces: [{ id, name: '主页', group: '', data: [] }],
        workspaceGroups: [],
        currentId: id,
    };
}

export function getCurrentWorkspaceTree(appData) {
    if (!appData || !Array.isArray(appData.workspaces)) return [];
    const ws = appData.workspaces.find((w) => w.id === appData.currentId);
    if (ws) return ws.data;
    return [];
}

export function ensureWorkspaceGroups(appData) {
    if (!appData || appData.workspaceGroups) return appData;
    appData.workspaceGroups = [];
    if (!Array.isArray(appData.workspaces)) return appData;
    appData.workspaces.forEach((w) => {
        if (w.group && !appData.workspaceGroups.includes(w.group)) {
            appData.workspaceGroups.push(w.group);
        }
    });
    return appData;
}

export function ensureValidCurrentWorkspace(appData, now = Date.now()) {
    if (!appData || !Array.isArray(appData.workspaces) || appData.workspaces.length === 0) {
        return createDefaultAppData(now);
    }
    ensureWorkspaceGroups(appData);
    if (!appData.workspaces.find((w) => w.id === appData.currentId)) {
        appData.currentId = appData.workspaces[0].id;
    }
    return appData;
}

export function removeWorkspacesByIds(appData, ids, now = Date.now()) {
    const idList = Array.isArray(ids) ? ids : [ids];
    if (!appData || !Array.isArray(appData.workspaces)) return createDefaultAppData(now);
    appData.workspaces = appData.workspaces.filter((w) => !idList.includes(w.id));
    return ensureValidCurrentWorkspace(appData, now);
}

export function removeWorkspaceGroup(appData, groupName, now = Date.now()) {
    if (!appData || !Array.isArray(appData.workspaces)) return createDefaultAppData(now);
    appData.workspaces = appData.workspaces.filter((ws) => ws.group !== groupName);
    if (Array.isArray(appData.workspaceGroups)) {
        appData.workspaceGroups = appData.workspaceGroups.filter((g) => g !== groupName);
    }
    return ensureValidCurrentWorkspace(appData, now);
}

export function resetAppData(now = Date.now()) {
    return createDefaultAppData(now);
}

export function groupPagesByWorkspace(pages) {
    const groups = new Map();
    (Array.isArray(pages) ? pages : []).forEach((page) => {
        if (!page || page.wsId == null) return;
        const key = String(page.wsId);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(page);
    });
    return groups;
}

function pageKey(wsId, id) {
    return `${String(wsId)}:${String(id)}`;
}

function collectSelectedPageIds(appData, selected) {
    const items = Array.isArray(selected) ? selected : [];
    const ids = new Set();
    const markWorkspace = (wsId) => {
        const ws = appData?.workspaces?.find((entry) => String(entry.id) === String(wsId));
        collectPagesFromWorkspaces(ws ? [ws] : []).forEach((page) => ids.add(pageKey(page.wsId, page.id)));
    };
    items.forEach((item) => {
        if (!item) return;
        if (item.type === 'group') {
            const groupName = String(item.id || '');
            (appData?.workspaces || [])
                .filter((ws) => String(ws.group || '') === groupName)
                .forEach((ws) => markWorkspace(ws.id));
            return;
        }
        if (item.type === 'workspace' && item.wsId != null) {
            markWorkspace(item.wsId);
            return;
        }
        if (item.wsId == null || item.id == null) return;
        const ws = appData?.workspaces?.find((entry) => String(entry.id) === String(item.wsId));
        if (!ws) return;
        if (item.type === 'page') {
            ids.add(pageKey(item.wsId, item.id));
            return;
        }
        if (item.type === 'category') {
            const node = findNode(item.id, ws.data);
            collectPagesFromWorkspaces([{ ...ws, data: node?.children || [] }]).forEach((page) => {
                ids.add(pageKey(item.wsId, page.id));
            });
        }
    });
    return ids;
}

export function collectSelectiveClearPages(appData, selected) {
    const ids = collectSelectedPageIds(appData, selected);
    return collectPagesFromWorkspaces(appData?.workspaces).filter((page) => ids.has(pageKey(page.wsId, page.id)));
}

export function collectSelectiveClearUrls(appData, selected) {
    const urls = [];
    const seen = new Set();
    collectSelectiveClearPages(appData, selected).forEach((page) => {
        (Array.isArray(page?.urls) ? page.urls : []).forEach((url) => {
            if (!url || seen.has(url)) return;
            seen.add(url);
            urls.push(url);
        });
    });
    return urls;
}

export function applySelectiveClear(appData, selected) {
    return collectSelectiveClearPages(appData, selected);
}

export const SITE_DATA_CLEAR_TYPES_KEY = 'webManagerSiteDataClearTypes';

export function defaultSiteDataClearTypes() {
    return { localStorage: true, indexedDB: false, cookie: false };
}

export function normalizeSiteDataClearTypes(raw) {
    const defaults = defaultSiteDataClearTypes();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaults;
    return {
        localStorage: raw.localStorage === true,
        indexedDB: raw.indexedDB === true,
        cookie: raw.cookie === true,
    };
}

export function parseSiteDataClearTypes(raw) {
    if (raw == null || raw === '') return defaultSiteDataClearTypes();
    try {
        return normalizeSiteDataClearTypes(typeof raw === 'string' ? JSON.parse(raw) : raw);
    } catch {
        return defaultSiteDataClearTypes();
    }
}

export function readSiteDataClearTypes(storage) {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store || typeof store.getItem !== 'function') return defaultSiteDataClearTypes();
    try {
        const raw = store.getItem(SITE_DATA_CLEAR_TYPES_KEY);
        if (raw == null || raw === '') return defaultSiteDataClearTypes();
        return parseSiteDataClearTypes(raw);
    } catch {
        return defaultSiteDataClearTypes();
    }
}

export function writeSiteDataClearTypes(types, storage) {
    const next = normalizeSiteDataClearTypes(types);
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (store && typeof store.setItem === 'function') {
        try { store.setItem(SITE_DATA_CLEAR_TYPES_KEY, JSON.stringify(next)); } catch { /* 配额满时仍返回当前勾选 */ }
    }
    return next;
}

export function hasSiteDataClearType(types) {
    const next = normalizeSiteDataClearTypes(types);
    return next.localStorage || next.indexedDB || next.cookie;
}

export function siteDataClearTypeSummary(types) {
    const next = normalizeSiteDataClearTypes(types);
    const names = [];
    if (next.localStorage) names.push('localStorage');
    if (next.indexedDB) names.push('IndexedDB');
    if (next.cookie) names.push('cookie');
    return names.join('、');
}

export function migratePersistedAppData(raw, now = Date.now()) {
    if (raw == null || raw === '') {
        return { appData: createDefaultAppData(now), didMigrateLegacyArray: false };
    }

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return { appData: createDefaultAppData(now), didMigrateLegacyArray: false };
    }

    if (Array.isArray(parsed)) {
        const id = 'ws_' + now;
        return {
            appData: {
                workspaces: [{ id, name: '主页', group: '', data: parsed }],
                workspaceGroups: [],
                currentId: id,
            },
            didMigrateLegacyArray: true,
        };
    }

    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.workspaces)) {
        return { appData: createDefaultAppData(now), didMigrateLegacyArray: false };
    }

    ensureWorkspaceGroups(parsed);
    return {
        appData: ensureValidCurrentWorkspace(parsed, now),
        didMigrateLegacyArray: false,
    };
}
