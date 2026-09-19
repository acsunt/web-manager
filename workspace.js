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
