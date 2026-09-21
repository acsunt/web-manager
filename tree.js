export function findNode(id, list) {
    if (!Array.isArray(list)) return null;
    for (const node of list) {
        if (node.id == id) return node;
        if (node.children) {
            const found = findNode(id, node.children);
            if (found) return found;
        }
    }
    return null;
}

export function findParent(id, list, parent = null) {
    if (!Array.isArray(list)) return undefined;
    for (const node of list) {
        if (node.id == id) return parent;
        if (node.children) {
            const found = findParent(id, node.children, node);
            if (found !== undefined) return found;
        }
    }
    return undefined;
}

export function deleteNode(id, list) {
    if (!Array.isArray(list)) return false;
    for (let i = 0; i < list.length; i++) {
        if (list[i].id == id) {
            list.splice(i, 1);
            return true;
        }
        if (list[i].children && deleteNode(id, list[i].children)) return true;
    }
    return false;
}

export function deleteNodesByIds(list, ids) {
    const idSet = new Set((Array.isArray(ids) ? ids : [ids]).map((id) => String(id)));
    if (!Array.isArray(list) || idSet.size === 0) return 0;
    let removed = 0;
    for (let i = list.length - 1; i >= 0; i--) {
        if (idSet.has(String(list[i].id))) {
            list.splice(i, 1);
            removed++;
            continue;
        }
        if (list[i].children) removed += deleteNodesByIds(list[i].children, ids);
    }
    return removed;
}

export function nodesForDisplay(nodes) {
    if (!Array.isArray(nodes)) return [];
    const pinned = [];
    const unpinned = [];
    nodes.forEach((node) => {
        if (node && node.isPinned) pinned.push(node);
        else unpinned.push(node);
    });
    return pinned.concat(unpinned);
}

export function reorderWithinPinZone(list, orderedIds) {
    if (!Array.isArray(list) || !Array.isArray(orderedIds)) return list;
    const zoneIds = orderedIds.map(String);
    const zoneSet = new Set(zoneIds);
    const idToNode = new Map(list.map((node) => [String(node.id), node]));
    for (const id of zoneIds) {
        if (!idToNode.has(id)) return list;
    }
    const slotCount = list.filter((node) => zoneSet.has(String(node.id))).length;
    if (slotCount !== zoneIds.length) return list;
    let i = 0;
    for (let index = 0; index < list.length; index++) {
        if (zoneSet.has(String(list[index].id))) {
            list[index] = idToNode.get(zoneIds[i++]);
        }
    }
    return list;
}

export function insertIntoPinZone(list, node, indexInZone = 0) {
    if (!Array.isArray(list) || !node) return list;
    const zonePinned = !!node.isPinned;
    const existingZone = list.filter((item) => !!item.isPinned === zonePinned);
    const parsedIndex = Number(indexInZone);
    const zoneIndex = Number.isFinite(parsedIndex) ? Math.max(0, parsedIndex) : 0;
    let insertAt;
    if (existingZone.length === 0) {
        insertAt = zonePinned ? 0 : list.length;
    } else if (zoneIndex <= 0) {
        insertAt = list.indexOf(existingZone[0]);
    } else if (zoneIndex >= existingZone.length) {
        insertAt = list.indexOf(existingZone[existingZone.length - 1]) + 1;
    } else {
        insertAt = list.indexOf(existingZone[zoneIndex]);
    }
    list.splice(insertAt, 0, node);
    return list;
}

export function insertByOrderedPeers(list, node, orderedPeerIds) {
    if (!Array.isArray(list) || !node) return list;
    const ids = Array.isArray(orderedPeerIds) ? orderedPeerIds.map(String) : [];
    const nodeId = String(node.id);
    const pos = ids.indexOf(nodeId);
    if (pos > 0) {
        const afterIndex = list.findIndex((item) => String(item.id) === ids[pos - 1]);
        if (afterIndex > -1) {
            list.splice(afterIndex + 1, 0, node);
            return list;
        }
    }
    if (pos >= 0 && pos < ids.length - 1) {
        const beforeIndex = list.findIndex((item) => String(item.id) === ids[pos + 1]);
        if (beforeIndex > -1) {
            list.splice(beforeIndex, 0, node);
            return list;
        }
    }
    const pinZone = list.filter((item) => !!item.isPinned === !!node.isPinned);
    return insertIntoPinZone(list, node, node.isPinned ? 0 : pinZone.length);
}

export function canCategoryDrop(mode, dragNode, targetNode) {
    if (!dragNode || !targetNode) return false;
    if (mode === 'inside' || mode === 'after-parent') return true;
    if (mode === 'before' || mode === 'after') return !!dragNode.isPinned === !!targetNode.isPinned;
    return false;
}

export function cleanDuplicateIds(nodes) {
    const seen = new Set();
    let isModified = false;

    function traverse(list) {
        if (!Array.isArray(list)) return;
        list.forEach((node) => {
            if (!node.id || seen.has(String(node.id))) {
                node.id = Date.now() + Math.random();
                isModified = true;
            }
            seen.add(String(node.id));
            if (node.children) traverse(node.children);
        });
    }

    traverse(nodes);
    return isModified;
}

export function collectSelfAndDescendantIds(id, list) {
    const ids = new Set();
    const node = findNode(id, list);
    if (!node) return ids;
    ids.add(String(id));
    (function walk(children) {
        if (!children) return;
        children.forEach((child) => {
            ids.add(String(child.id));
            if (child.children) walk(child.children);
        });
    })(node.children);
    return ids;
}

export function getAllPages(nodes, path = '') {
    if (!Array.isArray(nodes)) return [];
    let pages = [];
    nodes.forEach((node) => {
        const currentPath = path ? `${path} > ${node.name}` : node.name;
        if (node.type === 'page') {
            pages.push({ ...node, path: path || '根目录' });
        } else if (node.children) {
            pages = pages.concat(getAllPages(node.children, currentPath));
        }
    });
    return pages;
}

export function collectPagesFromWorkspaces(workspaces) {
    if (!Array.isArray(workspaces)) return [];
    const rows = [];
    workspaces.forEach((ws) => {
        const wsLabel = ws?.group ? `${ws.group}/${ws.name}` : (ws?.name || '未命名主页');
        getAllPages(ws?.data).forEach((page) => {
            const urls = Array.isArray(page.urls) && page.urls.length > 0
                ? page.urls
                : (page.url ? [{ url: page.url, name: '' }] : []);
            rows.push({
                wsId: ws.id,
                wsLabel,
                id: page.id,
                name: page.name || '未命名网页',
                path: page.path || '根目录',
                url: (urls[0] && urls[0].url) || '',
                urls: urls.map((item) => String(item?.url || '').trim()).filter(Boolean),
            });
        });
    });
    return rows;
}

function collectSelectiveClearNodes(nodes, wsId) {
    if (!Array.isArray(nodes)) return [];
    return nodes.map((node) => {
        if (node?.type === 'category') {
            return {
                type: 'category',
                key: `cat:${wsId}:${node.id}`,
                wsId,
                id: node.id,
                name: node.name || '未命名分类',
                children: collectSelectiveClearNodes(node.children, wsId),
            };
        }
        return {
            type: 'page',
            key: `page:${wsId}:${node.id}`,
            wsId,
            id: node.id,
            name: node.name || '未命名网页',
            children: [],
        };
    });
}

export function collectSelectiveClearTree(workspaces, workspaceGroups = []) {
    const list = Array.isArray(workspaces) ? workspaces : [];
    const groups = [];
    (Array.isArray(workspaceGroups) ? workspaceGroups : []).forEach((g) => {
        if (g && !groups.includes(g)) groups.push(g);
    });
    const groupsMap = {};
    groups.forEach((g) => { groupsMap[g] = []; });
    groupsMap[''] = [];
    list.forEach((ws) => {
        const g = ws.group || '';
        if (g && !groups.includes(g)) {
            groups.push(g);
            groupsMap[g] = [];
        }
        groupsMap[g].push(ws);
    });
    const toWorkspaceNode = (ws) => ({
        type: 'workspace',
        key: `ws:${ws.id}`,
        wsId: ws.id,
        id: ws.id,
        name: ws?.name || '未命名主页',
        children: collectSelectiveClearNodes(ws?.data, ws.id),
    });
    const out = groups.map((g) => ({
        type: 'group',
        key: `group:${g}`,
        wsId: '',
        id: g,
        name: g,
        children: (groupsMap[g] || []).map(toWorkspaceNode),
    }));
    if ((groupsMap[''] || []).length) {
        out.push({
            type: 'group',
            key: 'group:',
            wsId: '',
            id: '',
            name: '未分类',
            children: groupsMap[''].map(toWorkspaceNode),
        });
    }
    return out;
}

export function flattenSelectiveClearNodes(tree, type) {
    const out = [];
    const walk = (nodes) => {
        (Array.isArray(nodes) ? nodes : []).forEach((node) => {
            if (node?.type === type) out.push({ ...node, children: [] });
            walk(node?.children);
        });
    };
    walk(tree);
    return out;
}

export function filterSelectiveClearTree(tree, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return Array.isArray(tree) ? tree : [];
    const filterNodes = (nodes) => {
        const out = [];
        (Array.isArray(nodes) ? nodes : []).forEach((node) => {
            const selfMatch = String(node?.name || '').toLowerCase().includes(q);
            const children = selfMatch ? (node.children || []) : filterNodes(node.children);
            if (selfMatch || children.length) {
                out.push({ ...node, children });
            }
        });
        return out;
    };
    return filterNodes(tree);
}
