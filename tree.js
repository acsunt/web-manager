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

export function sortNodesByPin(nodes) {
    if (!Array.isArray(nodes)) return nodes;
    const pinned = nodes.filter((node) => node.isPinned);
    const unpinned = nodes.filter((node) => !node.isPinned);
    nodes.length = 0;
    nodes.push(...pinned, ...unpinned);
    nodes.forEach((node) => {
        if (node.children) sortNodesByPin(node.children);
    });
    return nodes;
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
