import { fetchPageTitleFor, fetchRecognizedPageInfo, nativeRecognitionConcurrency } from './api.js';
import {
    canCategoryDrop,
    collectSelfAndDescendantIds as collectSelfAndDescendantIdsInTree,
    cleanDuplicateIds,
    deleteNode as deleteNodeInTree,
    findNode as findNodeInTree,
    findParent as findParentInTree,
    collectPagesFromWorkspaces,
    collectSelectiveClearTree,
    filterSelectiveClearTree,
    getAllPages,
    insertByOrderedPeers,
    insertIntoPinZone,
    nodesForDisplay,
    reorderWithinPinZone,
} from './tree.js';
import { applySafeAreaInsets, collectInlineHandlerNames, copyTextToClipboard, defaultThemeScale, downloadBlob, installNativeDialogs, isNativeApp, onSelectiveClearCheckChange, registerInlineHandlers, setSelectiveClearChecked, showToast, syncNativeSystemBars } from './ui.js';
import { collectOpenablePages, countPages, countTotalPages, escapeHtml, htmlFileTitle, isHtmlFile, looksLikeBookmarkHtml, HIDE_ICONS_STORAGE_KEY, normalizeUrls, parseBookmarkHtml, parseHideIconsPref, parseSearchHistory, rememberSearchQuery, resolveColumnModes, sanitizeData, SEARCH_HISTORY_KEY, stripIconFieldsFromTree } from './utils.js';
import {
    createDefaultAppData as createDefaultAppDataInWorkspace,
    ensureWorkspaceGroups,
    getCurrentWorkspaceTree,
    collectSelectiveClearPages,
    defaultSiteDataClearTypes,
    hasSiteDataClearType,
    migratePersistedAppData,
    normalizeSiteDataClearTypes,
    readSiteDataClearTypes,
    removeWorkspaceGroup,
    removeWorkspacesByIds,
    resetAppData,
    siteDataClearTypeSummary,
    writeSiteDataClearTypes,
} from './workspace.js';

let appData = { workspaces: [], workspaceGroups: [], currentId: '' };
let data = []; 

let isEditMode = false;
let longPressTimer;
let activeContextNodeId = null;
let activeContextNodeType = null;
let isLongPressTriggered = false;
let isUrlVisible = false;

let isNoteVisible = false;
let isOpenCurrentTab = false; 
let isAutoRefresh = false; 

let isAllExpanded = false;
let isCountVisible = false; 
let cropper = null;
let iconCropper = null;

let isAdding = false;
let currentEditId = null;
let addType = null;
let alignState = 0;

let listColumnMode = 3; 
let iconColumnMode = 0; 

let isSortingMode = false;
let sortableInstances = [];

let isWsManageMode = false; 
let isWsSortGroupMode = false;
let isWsSortItemMode = false;
let isWsBatchMode = false;
let wsSortable = null;
let wsGroupSortables = [];
let wsColMode = 3; 

let isExportBatchMode = false;
let exportSelectedId = null;

let isUrlSortMode = false;
let urlSortable = null;

let isBadgeVisible = false; 
let isLocalTagVisible = false;
let isTestMode = false; 

let isIconMode = false;
let hideIcons = true;
let iconShape = 'square';

let toolbarSortable = null;
let isToolbarSorting = false;
let toolbarColMode = 3; 

let lastAppliedCustomCode = null;

let hoverExpandTimer = null;
let hoverExpandTarget = null;
let dragTimer = null;
let treeDragState = null;
let treeDragGhost = null;
let treeDragIndicator = null;

window.isCheckPaused = false;
window.isCheckAborted = false;
window.currentCheckProgress = '';

const DEFAULT_TOOLBAR_CONFIG = [
    { id: 'editModeBtn', name: '管理', show: true }, { id: 'addCatBtn', name: '新增分类', show: true }, { id: 'addPageBtn', name: '新增网页', show: false }, 
    { id: 'toolsBtn', name: '工具箱', show: true }, { id: 'clearBtn', name: '清空数据', show: true }, { id: 'themeBtn', name: '主题设置', show: true }, 
    { id: 'countToggleBtn', name: '数量统计', show: true }, 
    { id: 'localTagToggleBtn', name: '类型标记', show: false }, { id: 'urlToggleBtn', name: '显示网址', show: true }, 
    { id: 'noteToggleBtn', name: '显示备注', show: true }, { id: 'badgeToggleBtn', name: '多网址标记', show: false }, { id: 'testModeBtn', name: '测试模式', show: true }, 
    { id: 'alignToggleBtn', name: '对齐方式', show: true }, { id: 'targetToggleBtn', name: '新标签页', show: true }, 
    { id: 'autoRefreshToggleBtn', name: '本地刷新', show: true }, 
    { id: 'iconGlobalConfigBtn', name: '图标设置', show: true }, 
    { id: 'ioBtn', name: '导入导出', show: true },
    { id: 'browserWidgetBtn', name: '浏览器部件', show: false },
    { id: 'toolbarEditBtn', name: '自定义工具栏', show: true }
];
let toolbarConfig = [...DEFAULT_TOOLBAR_CONFIG];
const DEFAULT_CSS_TEMPLATE = `/* 基础 CSS 示例 (安全版) */\nbody {\n    /* --bg-color: #f2f4f6; */\n}\n`;

const DEFAULT_THEME_CONFIG = { darkMode: false, customCss: '', presets: {}, lockedImg: true, lockedContent: true, systemTextSize: true, textScale: 1, uiScale: 1, day: { theme: 'minimal', bgType: 'none', bgValue: '', bgBlur: 0, bgOpacity: 1.0, bgOverlay: 0.0, contentTransparency: 0, contentMask: 0 }, night: { theme: 'minimal', bgType: 'none', bgValue: '', bgBlur: 0, bgOpacity: 1.0, bgOverlay: 0.0, contentTransparency: 0, contentMask: 0 } };
function createDefaultThemeConfig() { return { ...DEFAULT_THEME_CONFIG, ...defaultThemeScale() }; }
let themeConfig = createDefaultThemeConfig();

// ================= 全局拖拽与悬停监听 =================
document.addEventListener('touchmove', (e) => {
    if (isSortingMode || document.body.classList.contains('is-dragging')) {
        if (e.touches && e.touches.length > 0) { handleHoverExpand(e.touches[0].clientX, e.touches[0].clientY); }
    }
    if (treeDragState) {
        const touch = e.touches[0];
        if (!treeDragState.triggered) {
            if (Math.abs(touch.clientX - treeDragState.startX) > 10 || Math.abs(touch.clientY - treeDragState.startY) > 10) { clearTimeout(dragTimer); treeDragState = null; }
        } else { e.preventDefault(); updateCategoryDrag(touch); }
    }
}, {passive: false});

document.addEventListener('mousemove', (e) => {
    if (isSortingMode || document.body.classList.contains('is-dragging')) { handleHoverExpand(e.clientX, e.clientY); }
    if (treeDragState) {
        if (!treeDragState.triggered) {
            if (Math.abs(e.clientX - treeDragState.startX) > 10 || Math.abs(e.clientY - treeDragState.startY) > 10) { clearTimeout(dragTimer); treeDragState = null; }
        } else { e.preventDefault(); updateCategoryDrag(e); }
    }
});

function handleDragEnd() {
    if (dragTimer) clearTimeout(dragTimer);
    if (treeDragState && treeDragState.triggered) { endCategoryDrag(); } else { treeDragState = null; }
}

document.addEventListener('touchend', handleDragEnd);
document.addEventListener('touchcancel', handleDragEnd);
document.addEventListener('mouseup', handleDragEnd);

function handleHoverExpand(clientX, clientY) {
    if (treeDragGhost) treeDragGhost.style.display = 'none'; 
    let el = document.elementFromPoint(clientX, clientY);
    if (treeDragGhost) treeDragGhost.style.display = 'block';
    
    if (!el) return;
    let header = el.closest('.category-header');
    
    if (header) {
        if (hoverExpandTarget !== header) {
            clearTimeout(hoverExpandTimer); hoverExpandTarget = header;
            hoverExpandTimer = setTimeout(() => {
                let block = header.closest('.category-block');
                if (block && block.classList.contains('collapsed')) {
                    if ("vibrate" in navigator) navigator.vibrate(20);
                    let toggle = header.querySelector('.toggle-icon'); if (toggle) toggle.style.transform = '';
                    block.classList.remove('collapsed');
                    let childrenCont = block.querySelector(':scope > .children-container'); if (childrenCont) childrenCont.style.display = 'block';
                    let nodeId = block.dataset.id; let node = findNode(nodeId); if (node) node.collapsed = false; save(); 
                }
            }, 600); 
        }
    } else { clearTimeout(hoverExpandTimer); hoverExpandTarget = null; }
}

function initCategoryDrag(touch) {
    if ("vibrate" in navigator) navigator.vibrate(50);
    document.body.classList.add('is-dragging');
    
    let originalEl = treeDragState.element;
    treeDragGhost = originalEl.cloneNode(true);
    treeDragGhost.style.position = 'fixed'; treeDragGhost.style.zIndex = 9999; treeDragGhost.style.opacity = 0.9; treeDragGhost.style.pointerEvents = 'none'; treeDragGhost.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)'; treeDragGhost.style.width = originalEl.offsetWidth + 'px';
    document.body.appendChild(treeDragGhost);
    originalEl.style.opacity = 0.3; 

    if (!treeDragIndicator) {
        treeDragIndicator = document.createElement('div'); treeDragIndicator.id = 'tree-drag-indicator';
        treeDragIndicator.innerHTML = `
            <div id="tree-indicator-line" style="position:absolute; height:2px; background-color:var(--primary-color); width:100vw; box-shadow:0 0 4px var(--primary-color);"></div>
            <div id="tree-indicator-dot" style="position:absolute; left:-4px; top:-4px; width:10px; height:10px; border-radius:50%; background-color:var(--primary-color);"></div>
            <div id="tree-indicator-vertical-1" style="position:fixed; top:0; left:33.33vw; width:0; height:100vh; border-left:2px dashed var(--primary-color); opacity:0.4;"></div>
            <div id="tree-indicator-vertical-2" style="position:fixed; top:0; left:66.66vw; width:0; height:100vh; border-left:2px dashed var(--primary-color); opacity:0.4;"></div>
        `;
        treeDragIndicator.style.position = 'fixed'; treeDragIndicator.style.top = '0'; treeDragIndicator.style.left = '0'; treeDragIndicator.style.width = '100%'; treeDragIndicator.style.height = '100%'; treeDragIndicator.style.pointerEvents = 'none'; treeDragIndicator.style.zIndex = 10000;
        document.body.appendChild(treeDragIndicator);
    }
    treeDragIndicator.style.display = 'none'; 
    updateCategoryDrag(touch);
}

function updateCategoryDrag(touch) {
    if (!treeDragGhost) return;
    treeDragGhost.style.left = (touch.clientX - 20) + 'px'; treeDragGhost.style.top = (touch.clientY - 20) + 'px';
    
    let threshold = 80; let scrollSpeed = 0;
    if (touch.clientY < threshold) scrollSpeed = -15; else if (touch.clientY > window.innerHeight - threshold) scrollSpeed = 15;
    
    if (scrollSpeed !== 0) {
        if (!treeDragState.scrollInterval) treeDragState.scrollInterval = setInterval(() => { window.scrollBy(0, scrollSpeed); }, 20);
    } else {
        if (treeDragState.scrollInterval) { clearInterval(treeDragState.scrollInterval); treeDragState.scrollInterval = null; }
    }

    treeDragIndicator.style.display = 'none';
    treeDragGhost.style.display = 'none';
    let targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
    treeDragGhost.style.display = 'block';
    
    if (!targetEl) return;
    let hoverHeader = targetEl.closest('.category-header');
    if (!hoverHeader) { let catBlock = targetEl.closest('.category-block'); if (catBlock) hoverHeader = catBlock.querySelector('.category-header'); }
    
    if (hoverHeader) {
        let hoverBlock = hoverHeader.closest('.category-block');
        if (treeDragState.element.contains(hoverBlock)) return; 

        let rect = hoverHeader.getBoundingClientRect(); let relY = touch.clientY - rect.top;
        let third = window.innerWidth / 3;
        let mode = ''; let targetLevel = parseInt(hoverBlock.dataset.level || '0'); let lineY = 0; let lineX = 0;

        if (relY < rect.height / 2) { mode = 'before'; lineY = rect.top; lineX = rect.left; } 
        else {
            lineY = rect.bottom;
            if (touch.clientX < third) { mode = 'after-parent'; lineX = rect.left - 20; if (targetLevel === 0) { mode = 'after'; lineX = rect.left; } } 
            else if (touch.clientX < third * 2) { mode = 'after'; lineX = rect.left; } 
            else { mode = 'inside'; lineX = rect.left + 20; }
        }

        const dragNode = findNode(treeDragState.id);
        const targetNode = findNode(hoverBlock.dataset.id);
        if (!canCategoryDrop(mode, dragNode, targetNode)) {
            treeDragIndicator.style.display = 'none';
            treeDragState.targetMode = null; treeDragState.targetId = null;
            return;
        }

        treeDragIndicator.style.display = 'block';
        let line = treeDragIndicator.querySelector('#tree-indicator-line'); let dot = treeDragIndicator.querySelector('#tree-indicator-dot');
        line.style.top = lineY + 'px'; line.style.left = lineX + 'px';
        dot.style.top = (lineY - 4) + 'px'; dot.style.left = (lineX - 4) + 'px';

        treeDragState.targetMode = mode; treeDragState.targetId = hoverBlock.dataset.id;
    } else {
        treeDragState.targetMode = null; treeDragState.targetId = null;
    }
}

function endCategoryDrag() {
    document.body.classList.remove('is-dragging');
    if (treeDragState.scrollInterval) clearInterval(treeDragState.scrollInterval);
    if (treeDragGhost) { treeDragGhost.remove(); treeDragGhost = null; }
    if (treeDragIndicator) { treeDragIndicator.style.display = 'none'; }
    if (treeDragState.element) { treeDragState.element.style.opacity = ''; }

    let mode = treeDragState.targetMode; let targetId = treeDragState.targetId; let dragId = treeDragState.id;
    if (mode && targetId && targetId != dragId) {
        let dragNode = findNode(dragId); let targetNode = findNode(targetId);
        if (dragNode && targetNode && canCategoryDrop(mode, dragNode, targetNode)) {
            let nodeData = JSON.parse(JSON.stringify(dragNode)); deleteNode(dragId);
            const targetAfterDelete = findNode(targetId);
            if (mode === 'before' || mode === 'after') {
                let parent = findParent(targetId); let list = parent ? parent.children : data;
                const zone = list.filter(n => !!n.isPinned === !!nodeData.isPinned);
                const targetZoneIndex = zone.findIndex(n => n.id == targetId);
                if (targetZoneIndex > -1) {
                    const insertIndex = mode === 'before' ? targetZoneIndex : targetZoneIndex + 1;
                    insertIntoPinZone(list, nodeData, insertIndex);
                }
            }
            else if (mode === 'inside') {
                if (!targetAfterDelete.children) targetAfterDelete.children = [];
                insertIntoPinZone(targetAfterDelete.children, nodeData, 0);
                targetAfterDelete.collapsed = false;
            }
            else if (mode === 'after-parent') {
                let parent = findParent(targetId);
                if (parent) {
                    let grandParent = findParent(parent.id); let list = grandParent ? grandParent.children : data;
                    const zone = list.filter(n => !!n.isPinned === !!nodeData.isPinned);
                    const parentZoneIndex = zone.findIndex(n => n.id == parent.id);
                    insertIntoPinZone(list, nodeData, parentZoneIndex > -1 ? parentZoneIndex + 1 : zone.length);
                } else {
                    let list = data;
                    const zone = list.filter(n => !!n.isPinned === !!nodeData.isPinned);
                    const targetZoneIndex = zone.findIndex(n => n.id == targetId);
                    insertIntoPinZone(list, nodeData, targetZoneIndex > -1 ? targetZoneIndex + 1 : zone.length);
                }
            }
            save(); renderTree(); showToast("分类层级修改成功", 1000);
        }
    }
    treeDragState = null;
}
// ========================================================

// ================= 应用初始化与旧数据迁移 =================
// 入口职责：恢复持久化数据、兼容旧版本结构、应用界面偏好，最后统一渲染。
function revealApp() {
    document.body.style.opacity = '1';
    document.documentElement.style.removeProperty('scroll-behavior');
}

function init() {
    installNativeDialogs();
    document.body.style.opacity = '0';
    try {
        const saved = localStorage.getItem('webManagerDataProMax');
        const loaded = migratePersistedAppData(saved);
        appData = loaded.appData;
        if (loaded.didMigrateLegacyArray) save();

        updateDataPointer(); cleanDuplicates();

        const resolvedColumns = resolveColumnModes({
            columnMode: localStorage.getItem('columnMode'),
            listColumnMode: localStorage.getItem('listColumnMode'),
            iconColumnMode: localStorage.getItem('iconColumnMode'),
        });
        listColumnMode = resolvedColumns.listColumnMode;
        iconColumnMode = resolvedColumns.iconColumnMode;
        if (resolvedColumns.clearLegacyColumnMode) {
            localStorage.setItem('listColumnMode', listColumnMode);
            localStorage.removeItem('columnMode');
        }

        wsColMode = localStorage.getItem('wsColMode') !== null ? parseInt(localStorage.getItem('wsColMode')) : 3; updateWsColBtn();
        toolbarColMode = localStorage.getItem('toolbarColMode') !== null ? parseInt(localStorage.getItem('toolbarColMode')) : 3;
        
        const savedAlignState = localStorage.getItem('alignState');
        if (savedAlignState !== null) { alignState = parseInt(savedAlignState, 10); } else if (localStorage.getItem('alignLeft') === 'true') { alignState = 1; }
        applyAlignState(document.getElementById('alignToggleBtn'));

        const isToolbarCollapsed = localStorage.getItem('toolbarCollapsed') === 'true';
        if (isToolbarCollapsed) { const toolbar = document.getElementById('mainToolbar'); const btn = document.getElementById('toolbarToggleBtn'); toolbar.classList.add('collapsed'); if(btn) btn.innerHTML = '<i class="fas fa-angle-down"></i> 展开工具栏'; }
        
        const savedNoteVisible = localStorage.getItem('noteVisible');
        if (savedNoteVisible === 'true') { isNoteVisible = true; document.getElementById('noteToggleBtn').classList.add('active'); } else { isNoteVisible = false; document.body.classList.add('hide-notes'); document.getElementById('noteToggleBtn').classList.remove('active'); }
        const savedCountVisible = localStorage.getItem('countVisible');
        if (savedCountVisible === 'true') { isCountVisible = true; document.body.classList.add('show-counts'); document.getElementById('countToggleBtn').classList.add('active'); }
        const savedOpenCurrent = localStorage.getItem('isOpenCurrentTab');
        if (savedOpenCurrent === 'true') { isOpenCurrentTab = true; document.getElementById('targetToggleBtn').classList.add('active'); } else { isOpenCurrentTab = false; document.getElementById('targetToggleBtn').classList.remove('active'); }
        const savedAutoRefresh = localStorage.getItem('autoRefreshVisible');
        if (savedAutoRefresh === 'true') { isAutoRefresh = true; const btn = document.getElementById('autoRefreshToggleBtn'); if(btn) btn.classList.add('active'); } else { isAutoRefresh = false; const btn = document.getElementById('autoRefreshToggleBtn'); if(btn) btn.classList.remove('active'); }
        const savedBadgeVisible = localStorage.getItem('badgeVisible');
        if (savedBadgeVisible === 'true') { isBadgeVisible = true; document.body.classList.add('show-badges'); document.getElementById('badgeToggleBtn').classList.add('active'); }
        const savedLocalTagVisible = localStorage.getItem('localTagVisible');
        if (savedLocalTagVisible === 'true') { isLocalTagVisible = true; const btn = document.getElementById('localTagToggleBtn'); if (btn) btn.classList.add('active'); document.body.classList.remove('hide-local-tags'); } else { isLocalTagVisible = false; document.body.classList.add('hide-local-tags'); const btn = document.getElementById('localTagToggleBtn'); if (btn) btn.classList.remove('active'); }

        isIconMode = localStorage.getItem('webManagerIconMode') === 'true';
        hideIcons = parseHideIconsPref(localStorage.getItem(HIDE_ICONS_STORAGE_KEY));
        iconShape = localStorage.getItem('webManagerIconShape') || 'square';
        applyHideIconsMode();
        applyIconMode();
        applyColumnMode();

        loadThemeConfig(); applyThemeSettings(); initToolbar();
        applySiteDataClearTypeChecks();
        if (isNativeApp()) document.body.classList.add('native-app');
        renderTree(); document.body.classList.add('hide-urls');
        consumeNativeImport();
        
        const savedScroll = localStorage.getItem('lastScrollPosition');
        if(savedScroll) { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, parseInt(savedScroll)); }
        requestAnimationFrame(revealApp);
    } catch (e) {
        console.error(e);
        revealApp();
    }
}

function createDefaultAppData() { return createDefaultAppDataInWorkspace(); }

function updateDataPointer() { data = getCurrentWorkspaceTree(appData); }

function initToolbar() {
    const savedConfig = localStorage.getItem('webManagerToolbarConfig');
    if (savedConfig) {
        try {
            const parsed = JSON.parse(savedConfig);
            const idMap = new Map(parsed.map(i => [i.id, i]));
            const merged = [];
            parsed.forEach(item => { if(DEFAULT_TOOLBAR_CONFIG.find(d => d.id === item.id)) merged.push(item); });
            DEFAULT_TOOLBAR_CONFIG.forEach(def => {
                if (idMap.has(def.id)) return;
                if (def.id === 'browserWidgetBtn') {
                    const ioIndex = merged.findIndex(item => item.id === 'ioBtn');
                    merged.splice(ioIndex >= 0 ? ioIndex + 1 : merged.length, 0, def);
                    return;
                }
                merged.push(def);
            });
            toolbarConfig = merged;
        } catch (e) { toolbarConfig = [...DEFAULT_TOOLBAR_CONFIG]; }
    }
    renderToolbar();
}

function isBrowserWidgetItem(item) {
    return item && item.id === 'browserWidgetBtn';
}

function isBrowserWidgetEnabled() {
    return !!toolbarConfig.find(item => isBrowserWidgetItem(item) && item.show);
}

function syncBrowserChrome() {
    if (!isNativeApp() || typeof window.Android?.setBrowserChromeVisible !== 'function') return;
    try { window.Android.setBrowserChromeVisible(isBrowserWidgetEnabled()); } catch (e) { /* 网页没有原生桥 */ }
}

function isIconFeatureItem(item) {
    return item && item.id === 'iconGlobalConfigBtn';
}

function renderToolbar() {
    const container = document.getElementById('toolbarBtnRow');
    const frag = document.createDocumentFragment();
    toolbarConfig.forEach(item => {
        if (isBrowserWidgetItem(item)) return;
        const btn = document.getElementById(item.id);
        if (btn) {
            const show = item.show && !(hideIcons && isIconFeatureItem(item));
            btn.style.display = show ? '' : 'none';
            frag.appendChild(btn);
        }
    });
    container.appendChild(frag);
    syncBrowserChrome();
}

function toggleToolbarColMode() { toolbarColMode = (toolbarColMode % 3) + 1; localStorage.setItem('toolbarColMode', toolbarColMode); updateToolbarColBtn(); const list = document.getElementById('toolbarConfigList'); list.className = 'toolbar-config-list cols-' + toolbarColMode; if (isToolbarSorting) { list.classList.add('toolbar-sort-active'); } }
function updateToolbarColBtn() { document.getElementById('toolbarColBtn').innerHTML = toolbarColMode + '列'; }

function openToolbarEditModal() {
    const list = document.getElementById('toolbarConfigList');
    list.innerHTML = ''; list.className = 'toolbar-config-list cols-' + toolbarColMode; updateToolbarColBtn();
    toolbarConfig.forEach(item => {
        if (isBrowserWidgetItem(item) && !isNativeApp()) return;
        if (hideIcons && isIconFeatureItem(item)) return;
        const div = document.createElement('div');
        div.className = 'toolbar-config-item'; div.dataset.id = item.id;
        div.onclick = function(e) { if(isToolbarSorting) return; if (e.target.type !== 'checkbox') { const cb = div.querySelector('.toolbar-config-checkbox'); cb.checked = !cb.checked; saveToolbarCheckboxState(); } };
        div.innerHTML = `<input type="checkbox" class="toolbar-config-checkbox" ${item.show ? 'checked' : ''} onchange="saveToolbarCheckboxState()"> <span class="toolbar-config-name">${item.name}</span>`;
        list.appendChild(div);
    });
    const hideIconsToggle = document.getElementById('hideIconsToggle');
    if (hideIconsToggle) hideIconsToggle.checked = hideIcons;
    isToolbarSorting = false; document.getElementById('toolbarSortStartBtn').style.display = 'flex'; document.getElementById('toolbarSortActions').style.display = 'none'; list.classList.remove('toolbar-sort-active');
    if (toolbarSortable) { toolbarSortable.destroy(); toolbarSortable = null; }
    document.getElementById('toolbarEditModal').classList.add('active');
}

function saveToolbarCheckboxState() { if (isToolbarSorting) return; const list = document.getElementById('toolbarConfigList'); Array.from(list.children).forEach(div => { const id = div.dataset.id; const show = div.querySelector('input').checked; const item = toolbarConfig.find(t => t.id === id); if (item) item.show = show; }); localStorage.setItem('webManagerToolbarConfig', JSON.stringify(toolbarConfig)); renderToolbar(); }
function startToolbarSort() { isToolbarSorting = true; const list = document.getElementById('toolbarConfigList'); list.classList.add('toolbar-sort-active'); document.getElementById('toolbarSortStartBtn').style.display = 'none'; document.getElementById('toolbarSortActions').style.display = 'flex'; toolbarSortable = new Sortable(list, { animation: 150 }); }
function confirmToolbarSort() {
    const list = document.getElementById('toolbarConfigList');
    const newConfig = [];
    Array.from(list.children).forEach(div => {
        const id = div.dataset.id;
        const show = div.querySelector('input').checked;
        const original = toolbarConfig.find(t => t.id === id) || DEFAULT_TOOLBAR_CONFIG.find(t => t.id === id);
        if (original) { newConfig.push({ id: id, name: original.name, show: show }); }
    });
    const widget = toolbarConfig.find(isBrowserWidgetItem);
    if (widget && !newConfig.find(isBrowserWidgetItem)) {
        const ioIndex = newConfig.findIndex(item => item.id === 'ioBtn');
        newConfig.splice(ioIndex >= 0 ? ioIndex + 1 : Math.max(0, newConfig.length - 1), 0, widget);
    }
    const iconItem = toolbarConfig.find(isIconFeatureItem);
    if (iconItem && !newConfig.find(isIconFeatureItem)) {
        const autoIndex = newConfig.findIndex(item => item.id === 'autoRefreshToggleBtn');
        newConfig.splice(autoIndex >= 0 ? autoIndex + 1 : Math.max(0, newConfig.length - 1), 0, iconItem);
    }
    toolbarConfig = newConfig;
    localStorage.setItem('webManagerToolbarConfig', JSON.stringify(toolbarConfig));
    renderToolbar();
    cancelToolbarSort(false);
    showToast("工具栏顺序已保存");
}
function cancelToolbarSort(resetList = true) { isToolbarSorting = false; const list = document.getElementById('toolbarConfigList'); list.classList.remove('toolbar-sort-active'); if (toolbarSortable) { toolbarSortable.destroy(); toolbarSortable = null; } document.getElementById('toolbarSortStartBtn').style.display = 'flex'; document.getElementById('toolbarSortActions').style.display = 'none'; if (resetList) openToolbarEditModal(); }
function toggleBadgeDisplay(btn) { isBadgeVisible = !isBadgeVisible; if (isBadgeVisible) { document.body.classList.add('show-badges'); btn.classList.add('active'); } else { document.body.classList.remove('show-badges'); btn.classList.remove('active'); } localStorage.setItem('badgeVisible', isBadgeVisible); }
function toggleLocalTagDisplay(btn) { isLocalTagVisible = !isLocalTagVisible; if (isLocalTagVisible) { document.body.classList.remove('hide-local-tags'); btn.classList.add('active'); } else { document.body.classList.add('hide-local-tags'); btn.classList.remove('active'); } localStorage.setItem('localTagVisible', isLocalTagVisible); }
function toggleTestMode(btn) { isTestMode = !isTestMode; if (isTestMode) { btn.classList.add('active'); showToast('已开启链接测试模式'); } else { btn.classList.remove('active'); showToast('链接测试模式已关闭'); } }

function openLinkPreviewModal(node) {
    const urls = normalizeUrls(node);
    const listContainer = document.getElementById('linkPreviewList');
    const modalTitle = document.getElementById('previewModalTitle');
    listContainer.innerHTML = ''; modalTitle.innerText = `链接列表: ${node.name}`;
    if (urls.length === 0) { listContainer.innerHTML = '<div style="padding:15px; text-align:center; color:#999;">无链接</div>'; } else {
        urls.forEach((u, idx) => {
            const li = document.createElement('div'); li.className = 'preview-link-item';
            li.onclick = () => { handleUrlOpen(u.url, isOpenCurrentTab); };
            const nameText = u.name ? u.name : (idx === 0 ? '主链接' : `链接 ${idx + 1}`);
            li.innerHTML = `<div class="preview-link-info"><div class="preview-link-name">${nameText}</div><div class="preview-link-url">${u.url}</div></div><i class="fas fa-external-link-alt preview-link-arrow"></i>`;
            listContainer.appendChild(li);
        });
    }
    document.getElementById('linkPreviewModal').classList.add('active');
}

function setRowToTop(btn) { const row = btn.closest('.url-row'); const container = document.getElementById('urlListContainer'); if (row.previousElementSibling) { container.prepend(row); showToast('已置顶并设为默认网址', 1000); } }

function keepOnlyThisRow(btn) { 
    const row = btn.closest('.url-row'); 
    const container = document.getElementById('urlListContainer'); 
    Array.from(container.children).forEach(child => { if (child !== row) { child.remove(); } }); 
    showToast('已仅保留当前网址', 1000); 
}

function addUrlRow(urlVal = '', nameVal = '') {
    const container = document.getElementById('urlListContainer'); const row = document.createElement('div'); row.className = 'url-row';
    row.innerHTML = `<i class="fas fa-bars url-row-handle"></i><div class="url-copy-group"><i class="fas fa-heading url-copy-icon" onclick="copyRowName(this)" title="复制名称"></i><i class="fas fa-link url-copy-icon" onclick="copyRowUrl(this)" title="复制链接"></i></div><div class="url-row-inputs"><input type="text" class="form-control url-name-input" placeholder="名称(可选)" value="${nameVal}" style="padding:4px 8px; font-size:calc(12px * var(--text-scale, 1)); height:26px;"><input type="text" class="form-control url-value-input" placeholder="网址 https://..." value="${urlVal}" style="padding:6px 8px; font-size:calc(13px * var(--text-scale, 1));"></div><div style="display:flex; flex-direction:column; align-items:center; gap:2px;"><i class="fas fa-arrow-up url-row-btn" style="color:var(--primary-color); margin-top:0; padding:2px;" onclick="setRowToTop(this)" title="置顶为默认网址"></i><i class="fas fa-filter url-row-btn" style="color:#28a745; margin-top:0; padding:2px;" onclick="keepOnlyThisRow(this)" title="仅保留当前网址(删除其他)"></i><i class="fas fa-minus-circle url-row-btn" style="margin-top:0; padding:2px;" onclick="removeUrlRow(this)" title="删除"></i></div>`;
    container.appendChild(row);
}

async function copyRowName(btn) {
    const row = btn.closest('.url-row');
    const input = row.querySelector('.url-name-input');
    if (!input || !input.value) return showToast('名称为空', 1000);
    const ok = await copyTextToClipboard(input.value);
    showToast(ok ? '名称已复制' : '复制失败', 1000);
}
async function copyRowUrl(btn) {
    const row = btn.closest('.url-row');
    const input = row.querySelector('.url-value-input');
    if (!input || !input.value) return showToast('链接为空', 1000);
    const ok = await copyTextToClipboard(input.value);
    showToast(ok ? '链接已复制' : '复制失败', 1000);
}

async function copyPageInfoFromModal() {
    const name = document.getElementById('editName').value.trim(); const note = document.getElementById('editNote').value.trim();
    let text = `📄 ${name}\n`;
    const rows = document.querySelectorAll('#urlListContainer .url-row');
    rows.forEach(row => { const u = row.querySelector('.url-value-input').value.trim(); const n = row.querySelector('.url-name-input').value.trim(); if(u) text += `    🔗 ${u}${n ? ' ('+n+')' : ''}\n`; });
    if (note) text += `    🗒️ ${note.replace(/\n/g, '\n    ')}\n`;
    const ok = await copyTextToClipboard(text);
    showToast(ok ? '信息已完整复制' : '复制失败');
}

function openParsePasteModal() { document.getElementById('parsePasteText').value = ''; document.getElementById('parsePasteModal').classList.add('active'); setTimeout(() => document.getElementById('parsePasteText').focus(), 100); }
function confirmParsePaste() {
    const text = document.getElementById('parsePasteText').value; if(!text.trim()) return;
    let name = '', note = '', urls = [], isParsingNote = false;
    const lines = text.split('\n');
    
    lines.forEach(line => {
        const t = line.trim(); if (!t) return;
        if (t.startsWith('📄')) { name = t.replace('📄', '').trim(); isParsingNote = false; } 
        else if (t.startsWith('🔗')) {
            let urlVal = t.replace('🔗', '').trim(); let urlName = '';
            // 支持“🔗 URL (名称)”以及“🔗 URL 名称”两种导出文本格式。
            const match = urlVal.match(/^(.*?)\s+\(([^)]+)\)$/);
            if(match) { urlVal = match[1].trim(); urlName = match[2].trim(); } 
            else if (urlVal.includes(' ')) {
                const parts = urlVal.split(/\s+/);
                urlVal = parts.shift();
                urlName = parts.join(' ').replace(/^\((.*)\)$/, '$1').trim();
            }
            if(urlVal) urls.push({url: urlVal, name: urlName}); isParsingNote = false;
        } else if (t.startsWith('🗒️')) { note = t.replace('🗒️', '').trim(); isParsingNote = true; } 
        else {
            if (isParsingNote) note += '\n' + t;
            else if (t.startsWith('http')) {
                let urlVal = t; let urlName = ''; const match = urlVal.match(/^(http\S+)\s*(.*)$/);
                if (match) { urlVal = match[1]; let rawName = match[2].trim(); if(rawName.startsWith('(') && rawName.endsWith(')')) rawName = rawName.slice(1,-1); urlName = rawName; }
                urls.push({url: urlVal, name: urlName});
            } else if (!name) name = t; 
        }
    });
    
    if (name) document.getElementById('editName').value = name;
    if (note) document.getElementById('editNote').value = note;
    if (urls.length > 0) { document.getElementById('urlListContainer').innerHTML = ''; urls.forEach(u => addUrlRow(u.url, u.name)); }
    closeModal('parsePasteModal'); showToast('智能填充成功');
}

function bindInteraction(element, node, type, url){
    let startX,startY,isMoving=false;
    element.addEventListener('touchstart',(e)=>{
        if(isSortingMode) {
            if (type === 'category' && !e.target.closest('.cat-btn')) {
                const touch = e.touches[0];
                treeDragState = { id: node.id, startX: touch.clientX, startY: touch.clientY, triggered: false, element: element.closest('.category-block') };
                dragTimer = setTimeout(() => { if(treeDragState) { treeDragState.triggered = true; initCategoryDrag(touch); } }, 300);
            }
            return; 
        }
        if(e.target.type==='checkbox'||e.target.closest('.cat-btn')||e.target.closest('.expand-urls-btn')||e.target.closest('.sub-link-item')||e.target.closest('.url-copy-icon'))return;
        startX=e.touches[0].clientX; startY=e.touches[0].clientY; isMoving=false; isLongPressTriggered=false;
        longPressTimer=setTimeout(()=>{ if(!isMoving&&!document.body.classList.contains('is-dragging')&&!isSortingMode){ isLongPressTriggered=true; const selection = window.getSelection && window.getSelection(); if (selection && selection.removeAllRanges) selection.removeAllRanges(); showContextMenu(startX,startY,node.id,type); } },600);
    },{passive:false});
    
    element.addEventListener('mousedown',(e)=>{
        if(isSortingMode) {
            if (type === 'category' && !e.target.closest('.cat-btn')) {
                treeDragState = { id: node.id, startX: e.clientX, startY: e.clientY, triggered: false, element: element.closest('.category-block') };
                dragTimer = setTimeout(() => { if(treeDragState) { treeDragState.triggered = true; initCategoryDrag(e); } }, 300);
            }
            return; 
        }
    });

    element.addEventListener('touchmove',(e)=>{ if(!startX)return; const moveX=e.touches[0].clientX; const moveY=e.touches[0].clientY; if(Math.abs(moveX-startX)>10||Math.abs(moveY-startY)>10){ isMoving=true; clearTimeout(longPressTimer); } },{passive:false});
    element.addEventListener('touchend',()=>{clearTimeout(longPressTimer);});
    element.addEventListener('contextmenu',(e)=>{ if(isSortingMode) return; e.preventDefault(); showContextMenu(e.clientX,e.clientY,node.id,type); });
    element.addEventListener('click',(e)=>{
        if(isLongPressTriggered||isSortingMode)return;
        if(isEditMode && type === 'page') {
            e.preventDefault(); const cb = element.querySelector('.item-checkbox');
            if (cb && e.target !== cb && !e.target.closest('.cat-btn') && !e.target.closest('.expand-urls-btn') && !e.target.closest('.sub-link-item') && !e.target.closest('.url-copy-icon')) { cb.checked = !cb.checked; updateSelectedCount(); } return;
        }
        if(e.target.type==='checkbox'||e.target.closest('.cat-btn')||e.target.closest('.expand-urls-btn')||e.target.closest('.sub-link-item')||e.target.closest('.url-copy-icon'))return;
        
        if(type==='category'){
            const container=element.parentElement;container.classList.toggle('collapsed');node.collapsed=container.classList.contains('collapsed');const toggle=container.querySelector('.toggle-icon');if(toggle)toggle.style.transform=node.collapsed?'rotate(-90deg)':'';const childCont=container.querySelector('.children-container');if(childCont)childCont.style.display=node.collapsed?'none':'block';save();
        } else if(type==='page'){
            e.preventDefault(); const urls = normalizeUrls(node); if (isTestMode && urls.length > 0) return openLinkPreviewModal(node);
            if(!url) return; 
            handleUrlOpen(url, isOpenCurrentTab);
        }
    });
}

function handleUrlOpen(url, inCurrentTab) {
    if (!url) return;
    if (window.Android && typeof window.Android.openUrl === 'function') {
        window.Android.openUrl(url);
        return;
    }
    if (inCurrentTab) { window.location.href = url; } else { window.open(url, '_blank'); }
}

function openPagesInApp(pages, groupName) {
    if (!isNativeApp() || typeof window.Android?.openUrls !== 'function') return false;
    const list = Array.isArray(pages) ? pages.filter((page) => page?.url) : [];
    if (list.length === 0) {
        showToast('没有可打开的网页');
        return true;
    }
    window.Android.openUrls(JSON.stringify({
        group: groupName || '',
        pages: list.map((page) => ({ title: page.title || '', url: page.url })),
    }));
    return true;
}

function openCategoryPages(id) {
    const node = findNode(id);
    if (!node || node.type !== 'category') return;
    if (!openPagesInApp(collectOpenablePages([node]), node.name)) {
        showToast('仅 APK 支持一次打开多个网页');
    }
}

function batchOpenSelected() {
    const checks = document.querySelectorAll('.item-checkbox:checked');
    if (checks.length === 0) return showToast('请先勾选要打开的网页或分类');
    const pages = [];
    const seen = new Set();
    checks.forEach((cb) => {
        const node = findNode(cb.dataset.id);
        if (!node) return;
        collectOpenablePages(node.type === 'category' ? [node] : [node]).forEach((page) => {
            if (seen.has(page.url)) return;
            seen.add(page.url);
            pages.push(page);
        });
    });
    if (!openPagesInApp(pages, pages.length > 1 ? '多选打开' : '')) {
        showToast('仅 APK 支持一次打开多个网页');
    }
}

function updatePositionOptions() {
    const isInside = document.querySelector('input[name="relPosition"][value="inside"]').checked;
    const insideModeEl = document.getElementById('insidePositionMode');
    if (isInside) { insideModeEl.style.opacity = '1'; insideModeEl.style.pointerEvents = 'auto'; } else { insideModeEl.style.opacity = '0.4'; insideModeEl.style.pointerEvents = 'none'; }
}

// ====== 图标编辑相关函数 ======
function toggleImgPanel() {
    const typeRadios = document.querySelectorAll('input[name="iconType"]');
    let isCustom = false;
    typeRadios.forEach(r => { if(r.value === 'custom' && r.checked) isCustom = true; });
    if(!isCustom) {
        document.querySelector('input[name="iconType"][value="custom"]').checked = true;
        updateIconPreview();
    }
    const panel = document.getElementById('imgUrlPanel');
    panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
}

function updateIconPreview() {
    const type = document.querySelector('input[name="iconType"]:checked').value;
    const img = document.getElementById('mainIcon');
    const letter = document.getElementById('letterIcon');
    const blank = document.getElementById('blankIcon');
    
    img.style.display = 'none';
    letter.style.display = 'none';
    blank.style.display = 'none';
    letter.innerHTML = '';
    
    const placeholderSvg = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjY2NjIiBzdHJva2Utd2lkdGg9IjIiPjxyZWN0IHg9IjMiIHk9IjMiIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgcng9IjIiIHJ5PSIyIi8+PC9zdmc+';

    if (type === 'custom') {
        img.style.display = 'block';
        const customData = document.getElementById('customIconData').value;
        img.src = customData || placeholderSvg;
    } else if (type === 'traditional') {
        letter.style.display = 'flex';
        const urlInputs = document.querySelectorAll('#urlListContainer .url-value-input');
        let mainUrl = urlInputs.length > 0 ? urlInputs[0].value.trim() : '';
        const isLocal = mainUrl.toLowerCase().startsWith('file://') || /^[a-zA-Z]:[\\/]/.test(mainUrl);
        const iconClass = isLocal ? 'fa-file-alt' : 'fa-globe';
        letter.style.backgroundColor = 'var(--input-bg)';
        letter.style.color = 'var(--text-secondary)';
        letter.innerHTML = `<i class="fas ${iconClass}"></i>`;
    } else if (type === 'letter' || type === 'urlLetter') {
        letter.style.display = 'flex';
        let char = '?';
        if (type === 'letter') {
            let name = document.getElementById('editName').value.trim() || '?';
            char = name.charAt(0).toUpperCase();
        } else {
            const urlInputs = document.querySelectorAll('#urlListContainer .url-value-input');
            let mainUrl = urlInputs.length > 0 ? urlInputs[0].value.trim() : '';
            let domainStr = mainUrl.replace(/^https?:\/\//i, '').replace(/^file:\/\//i, '');
            char = domainStr.charAt(0).toUpperCase() || '?';
        }
        let bgColors = ['#f56a00', '#7265e6', '#ffbf00', '#00a2ae', '#1890ff', '#eb2f96', '#52c41a'];
        let charCode = char.charCodeAt(0) || 0;
        letter.style.backgroundColor = bgColors[charCode % bgColors.length];
        letter.style.color = 'white';
        letter.innerText = char;
    } else if (type === 'blank') {
        blank.style.display = 'block';
    } else {
        img.style.display = 'block';
        const urlInputs = document.querySelectorAll('#urlListContainer .url-value-input');
        let mainUrl = urlInputs.length > 0 ? urlInputs[0].value.trim() : '';
        let domain = '';
        try {
            if(!/^https?:\/\//i.test(mainUrl) && mainUrl) mainUrl = 'http://' + mainUrl;
            domain = new URL(mainUrl).hostname;
        } catch(e){}
        img.src = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128` : placeholderSvg;
        img.onerror = () => { img.src = placeholderSvg; };
    }
}

document.getElementById('editName').addEventListener('input', () => {
    const type = document.querySelector('input[name="iconType"]:checked').value;
    if(type === 'letter') updateIconPreview();
});

document.getElementById('urlListContainer').addEventListener('input', (e) => {
    if (e.target.classList.contains('url-value-input')) {
        const type = document.querySelector('input[name="iconType"]:checked').value;
        if(type === 'urlLetter' || type === 'traditional' || type === 'auto') updateIconPreview();
    }
});

async function fetchPageInfo() {
    if (hideIcons) return;
    const urlInputs = document.querySelectorAll('#urlListContainer .url-value-input');
    if(urlInputs.length === 0) return;
    let targetUrl = urlInputs[0].value.trim();
    if(!targetUrl) return showToast('请先输入网址');
    if (!/^https?:\/\//i.test(targetUrl) && !/^file:\/\//i.test(targetUrl) && !/^[a-zA-Z]:[\\/]/.test(targetUrl)) {
        targetUrl = 'http://' + targetUrl;
        urlInputs[0].value = targetUrl;
    }

    const btn = document.getElementById('fetchInfoBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 识别中';
    btn.disabled = true;

    const autoRadio = document.querySelector('input[name="iconType"][value="auto"]');
    if (autoRadio.checked) updateIconPreview();

    try {
        const recognized = await fetchRecognizedPageInfo(targetUrl);
        const title = recognized?.title || '';
        const recognizedInput = document.getElementById('editRecognizedName');
        if (title && recognizedInput) {
            recognizedInput.value = title;
            if(document.querySelector('input[name="iconType"]:checked').value === 'letter') updateIconPreview();
            showToast('标题已填入「识别到的名称」');
        }
        const iconType = document.querySelector('input[name="iconType"]:checked')?.value;
        if (recognized?.icon && (iconType === 'auto' || iconType === 'custom')) {
            document.getElementById('customIconData').value = recognized.icon;
            if (iconType === 'auto') {
                const customRadio = document.querySelector('input[name="iconType"][value="custom"]');
                if (customRadio) customRadio.checked = true;
            }
            updateIconPreview();
        }
    } catch (error) {
        if (error.name === 'AbortError') showToast('获取标题超时');
        else console.log('拉取标题失败(CORS或无内容)', error);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function startUrlCrop() {
    const imgUrl = document.getElementById('customImgUrl').value.trim();
    if(!imgUrl) return showToast("请先输入图片链接");
    
    const modal = document.getElementById('iconCropModal');
    const image = document.getElementById('iconCropImage');
    image.crossOrigin = "anonymous";
    image.src = imgUrl;
    modal.classList.add('active');
    
    image.onload = () => {
        if (iconCropper) { iconCropper.destroy(); }
        iconCropper = new Cropper(image, {
            aspectRatio: 1, viewMode: 1, dragMode: 'move', autoCropArea: 1, restore: false, guides: false, center: false, highlight: false, cropBoxMovable: true, cropBoxResizable: true, toggleDragModeOnDblclick: false,
        });
    };
    image.onerror = () => {
        showToast("图片加载失败！检查链接或跨域权限。");
        closeModal('iconCropModal');
    };
}

function confirmIconCrop() {
    if (!iconCropper) return;
    const canvas = iconCropper.getCroppedCanvas();
    try {
        const base64 = canvas.toDataURL('image/png');
        document.getElementById('customIconData').value = base64;
        document.getElementById('imgUrlPanel').style.display = 'none';
        document.querySelector('input[name="iconType"][value="custom"]').checked = true;
        updateIconPreview();
        closeModal('iconCropModal');
    } catch (e) {
        alert("裁剪失败：所选图床禁止前端直接导出图片(跨域污染)。");
    }
}

function getIconHtml(node) {
    let type = node.iconType || 'auto';
    let urls = normalizeUrls(node);
    let mainUrl = urls.length > 0 ? urls[0].url : '';
    let name = node.name || '?';
    
    let bgColors = ['#f56a00', '#7265e6', '#ffbf00', '#00a2ae', '#1890ff', '#eb2f96', '#52c41a'];
    const placeholderSvg = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjY2NjIiBzdHJva2Utd2lkdGg9IjIiPjxyZWN0IHg9IjMiIHk9IjMiIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgcng9IjIiIHJ5PSIyIi8+PC9zdmc+';

    let html = '';
    if (type === 'custom' && node.customIcon) {
        html = `<img src="${node.customIcon}" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='${placeholderSvg}'">`;
    } else if (type === 'traditional') {
        const isLocal = mainUrl.toLowerCase().startsWith('file://') || /^[a-zA-Z]:[\\/]/.test(mainUrl);
        const iconClass = isLocal ? 'fa-file-alt' : 'fa-globe';
        html = `<div style="width:100%; height:100%; background:var(--card-bg); display:flex; align-items:center; justify-content:center; color:var(--text-secondary); font-size:24px;"><i class="fas ${iconClass}"></i></div>`;
    } else if (type === 'letter' || type === 'urlLetter') {
        let char = '?';
        if (type === 'letter') {
            char = name.charAt(0).toUpperCase();
        } else {
            let domainStr = mainUrl.replace(/^https?:\/\//i, '').replace(/^file:\/\//i, '');
            char = domainStr.charAt(0).toUpperCase() || '?';
        }
        let charCode = char.charCodeAt(0) || 0;
        let bgColor = bgColors[charCode % bgColors.length];
        html = `<div style="width:100%; height:100%; background-color:${bgColor}; color:white; display:flex; align-items:center; justify-content:center;">${char}</div>`;
    } else if (type === 'blank') {
        html = `<div style="width:100%; height:100%; background:var(--card-bg); border:1px solid var(--border-color); border-radius:inherit;"></div>`;
    } else {
        let domain = '';
        try {
            if(!/^https?:\/\//i.test(mainUrl) && mainUrl) mainUrl = 'http://' + mainUrl;
            domain = new URL(mainUrl).hostname;
        } catch(e) {}
        let imgSrc = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128` : placeholderSvg;
        html = `<img src="${imgSrc}" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='${placeholderSvg}'">`;
    }
    return `<div class="page-icon-wrapper">${html}</div>`;
}

// ====== 图标设置相关 ======
function openIconGlobalModal() {
    if (hideIcons) return;
    document.querySelector(`input[name="globalIconShape"][value="${iconShape}"]`).checked = true;
    document.querySelectorAll('input[name="batchIconType"]').forEach(r => {
        r.onchange = (e) => {
            document.getElementById('batchIconUrlGroup').style.display = e.target.value === 'custom' ? 'block' : 'none';
        };
    });
    document.getElementById('iconGlobalModal').classList.add('active');
}

function setGlobalIconShape(shape) {
    iconShape = shape;
    localStorage.setItem('webManagerIconShape', iconShape);
    applyIconMode();
}

function applyBatchIconType() {
    const target = document.querySelector('input[name="batchIconTarget"]:checked').value;
    const type = document.querySelector('input[name="batchIconType"]:checked').value;
    const url = document.getElementById('batchIconUrlInput').value.trim();
    if (type === 'custom' && !url) { return showToast("请输入图床链接"); }

    let count = 0;
    appData.workspaces.forEach(ws => {
        function traverse(nodes) {
            nodes.forEach(n => {
                if (n.type === 'page') {
                    let currentType = n.iconType || 'auto';
                    let shouldModify = false;

                    if (target === 'all') {
                        shouldModify = true;
                    } else {
                        if (currentType !== 'auto') shouldModify = true;
                    }

                    if (shouldModify) {
                        n.iconType = type;
                        if (type === 'custom') {
                            n.customIcon = url;
                        } else {
                            n.customIcon = '';
                        }
                        count++;
                    }
                }
                if (n.children) traverse(n.children);
            });
        }
        if (ws.data) traverse(ws.data);
    });

    save();
    renderTree();
    showToast(`已成功修改 ${count} 个网页的图标配置`);
    closeModal('iconGlobalModal');
}

// ================= 名称识别共享逻辑 =================
// 真正分叉在 api.js：有原生桥走 WebView，没有就走字典 + allorigins。

function resolveBatchNameTemplate(template, index) {
    if (!template) return '';
    return String(template).replace(/%d/g, String(index));
}

async function applyBatchIconName() {
    const target = document.querySelector('input[name="batchIconNameTarget"]:checked').value;
    const source = document.querySelector('input[name="batchIconNameSource"]:checked').value;
    const manualName = document.getElementById('batchIconManualNameInput').value.trim();

    if (source === 'manual' && !manualName) {
        return showToast('请输入要统一填写的名称');
    }

    const targets = [];
    appData.workspaces.forEach(ws => {
        function traverse(nodes) {
            nodes.forEach(n => {
                if (n.type !== 'page') {
                    if (n.children) traverse(n.children);
                    return;
                }
                const currentType = n.iconType || 'auto';
                if (target === 'all' || currentType !== 'auto') {
                    targets.push(n);
                }
            });
        }
        if (ws.data) traverse(ws.data);
    });

    if (targets.length === 0) return showToast('未找到符合条件的网页');

    if (source === 'none') {
        targets.forEach(n => { delete n.recognizedName; });
        save();
        renderTree();
        showToast(`已清空 ${targets.length} 个网页的识别名称`);
        closeModal('iconGlobalModal');
        return;
    }

    closeModal('iconGlobalModal');
    const reportModal = document.getElementById('reportModal');
    const listEl = document.getElementById('reportList');
    const summaryEl = document.getElementById('reportSummary');
    document.getElementById('reportTitle').innerText = '批量统一修改名称显示';
    const copyBtn = document.getElementById('copyReportBtn');
    if (copyBtn) copyBtn.style.display = 'none';
    const pauseBtn = document.getElementById('pauseReportBtn');
    window.isCheckPaused = false;
    window.isCheckAborted = false;
    window.currentCheckProgress = '';
    if (pauseBtn) {
        pauseBtn.style.display = source === 'recognize' ? 'inline-block' : 'none';
        pauseBtn.className = 'fas fa-pause';
        pauseBtn.style.color = '';
    }
    listEl.innerHTML = '';
    summaryEl.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 正在处理 (0/${targets.length})...`;
    reportModal.classList.add('active');

    const esc = (s) => String(s == null ? '' : s).replace(/[<>]/g, c => ({ '<': '&lt;', '>': '&gt;' })[c]);

    let successCount = 0;
    let failCount = 0;
    let index = 0;
    const total = targets.length;
    const CONCURRENCY = nativeRecognitionConcurrency();

    async function worker() {
        while (index < total) {
            if (window.isCheckAborted) break;
            while (window.isCheckPaused && !window.isCheckAborted) { await new Promise(r => setTimeout(r, 300)); }
            if (window.isCheckAborted) break;
            const i = index++;
            const page = targets[i];
            const finalName = resolveBatchNameTemplate(manualName, i + 1);
            const li = document.createElement('li');
            li.className = 'report-item icon-result-item';

            if (source === 'manual') {
                page.name = finalName;
                delete page.recognizedName;
                successCount++;
                li.innerHTML =
                    '<div class="icon-result-info">' +
                        '<div class="report-recognized-title" style="font-size:calc(13px * var(--text-scale, 1)); color:var(--primary-color); font-weight:600;">' + esc(finalName) + '</div>' +
                        '<div class="report-loc" style="color:var(--text-color);">' + esc(page.name) + '</div>' +
                        '<div style="font-size:calc(11px * var(--text-scale, 1));color:#999;margin-top:2px;"><span class="report-badge badge-success">已写入</span></div>' +
                    '</div>';
            } else {
                const urls = normalizeUrls(page);
                let mainUrl = urls.length > 0 ? urls[0].url.trim() : '';
                if (!mainUrl) {
                    failCount++;
                    li.innerHTML =
                        '<div class="icon-result-info">' +
                            '<div class="report-loc">' + esc(page.name || '(无名称)') + '</div>' +
                            '<div style="font-size:calc(11px * var(--text-scale, 1));color:#999;margin-top:2px;"><span class="report-badge badge-error">失败</span> 无可用网址</div>' +
                        '</div>';
                    listEl.appendChild(li);
                    summaryEl.innerHTML = `正在处理 (${successCount + failCount}/${total})...`;
                    continue;
                }
                if (!/^https?:\/\//i.test(mainUrl)) mainUrl = 'http://' + mainUrl;
                try {
                    const recognized = await fetchPageTitleFor(mainUrl);
                    if (recognized) {
                        page.recognizedName = recognized;
                        successCount++;
                        li.innerHTML =
                            '<div class="icon-result-info">' +
                                '<div class="report-recognized-title" style="font-size:calc(13px * var(--text-scale, 1)); color:var(--primary-color); font-weight:600;">' + esc(recognized) + '</div>' +
                                '<div class="report-loc" style="color:var(--text-color);">' + esc(page.name || '(无名称)') + '</div>' +
                                '<div class="report-url" style="color:var(--primary-color); margin-top:2px;">' + esc(mainUrl) + '</div>' +
                                '<div style="font-size:calc(11px * var(--text-scale, 1));color:#999;margin-top:2px;"><span class="report-badge badge-success">已识别</span></div>' +
                            '</div>';
                    } else {
                        failCount++;
                        li.innerHTML =
                            '<div class="icon-result-info">' +
                                '<div class="report-loc">' + esc(page.name || '(无名称)') + '</div>' +
                                '<div class="report-url" style="color:#dc3545; margin-top:2px;">' + esc(mainUrl) + '</div>' +
                                '<div style="font-size:calc(11px * var(--text-scale, 1));color:#999;margin-top:2px;"><span class="report-badge badge-error">失败</span> 未能识别</div>' +
                            '</div>';
                    }
                } catch (e) {
                    failCount++;
                    li.innerHTML =
                        '<div class="icon-result-info">' +
                            '<div class="report-loc">' + esc(page.name || '(无名称)') + '</div>' +
                            '<div class="report-url" style="color:#dc3545; margin-top:2px;">' + esc(mainUrl) + '</div>' +
                            '<div style="font-size:calc(11px * var(--text-scale, 1));color:#999;margin-top:2px;"><span class="report-badge badge-error">失败</span> ' + esc(e.message || e.name || '') + '</div>' +
                        '</div>';
                }
            }
            listEl.appendChild(li);
            summaryEl.innerHTML = `正在处理 (${successCount + failCount}/${total})...`;
        }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
    save();
    renderTree();
    summaryEl.innerHTML = `<i class="fas fa-check-circle" style="color:#28a745;"></i> 处理完成：成功 ${successCount}，失败 ${failCount}`;
}

// ================= 网页与分类的保存流程 =================
// 新增和编辑共用此入口：先规范化网址并检查重复，再更新树结构和持久化数据。
function saveData(){
    const recognizedRaw = hideIcons ? '' : (document.getElementById('editRecognizedName')?.value || '').trim();
    const autoOverwrite = !hideIcons && document.getElementById('autoTitleCheck')?.checked;
    const nameRaw = document.getElementById('editName').value;
    const note=document.getElementById('editNote').value; const parentId=document.getElementById('selectedParentId').value;
    const relPos = document.querySelector('input[name="relPosition"]:checked').value; const addToTop = (document.querySelector('input[name="insidePos"]:checked').value === 'top'); const editPos = document.querySelector('input[name="editPos"]:checked') ? document.querySelector('input[name="editPos"]:checked').value : 'keep';
    
    let currentType = isAdding ? addType : document.getElementById('editType').value;
    if (!isAdding && !currentType) { const n = findNode(currentEditId); if (n) currentType = n.type; }
    const name = (currentType === 'page' && autoOverwrite && recognizedRaw) ? recognizedRaw : nameRaw;

    let newUrls = [];
    let iconType = 'auto', customIcon = '';
    if (currentType === 'page') {
        document.querySelectorAll('#urlListContainer .url-row').forEach(row => {
            let u = row.querySelector('.url-value-input').value.trim(); let n = row.querySelector('.url-name-input').value.trim();
            if (u) { if(!/^https?:\/\//i.test(u)&&!/^file:\/\//i.test(u)&&!/^[a-zA-Z]:[\\/]/.test(u)){u='https://'+u;} newUrls.push({ url: u, name: n }); }
        });
        if (newUrls.length === 0) return alert('请至少填写一个有效的网址');
        
        if (!hideIcons) {
            iconType = document.querySelector('input[name="iconType"]:checked').value;
            customIcon = document.getElementById('customIconData').value;
        }
    }

    if (newUrls.length > 0) {
        let allPages = [];
        appData.workspaces.forEach(ws => {
           const wsPages = getAllPages(ws.data);
           const wsDispName = ws.group ? `${ws.group}/${ws.name}` : ws.name;
           wsPages.forEach(p => p.wsName = wsDispName);
           allPages = allPages.concat(wsPages);
        });

        const duplicates = [];
        const seenInNewUrls = new Set();
        newUrls.forEach(newEntry => {
            const normNewUrl = newEntry.url.replace(/\/$/,'').toLowerCase(); 
            if (seenInNewUrls.has(normNewUrl)) duplicates.push({ newUrl: newEntry.url, matchName: document.getElementById('editName').value || '当前网页', matchPath: '当前网页 (内部重复)', wsName: '当前编辑' });
            seenInNewUrls.add(normNewUrl);
            allPages.forEach(p => {
                if (!isAdding && String(p.id) === String(currentEditId)) return;
                const pUrls = normalizeUrls(p);
                pUrls.forEach(pu => { if (pu.url && pu.url.replace(/\/$/,'').toLowerCase() === normNewUrl) { duplicates.push({ newUrl: newEntry.url, matchName: p.name, matchPath: p.path || '根目录', wsName: p.wsName }); } });
            });
        });

        if (duplicates.length > 0) {
            let msg = "⚠️ 检测到重复网址：\n"; duplicates.forEach(d => { msg += `- ${d.newUrl}\n  已存在于: [${d.wsName}] ${d.matchPath} / ${d.matchName}\n`; });
            msg += "\n是否继续保存？"; if (!confirm(msg)) return;
        }
    }

    let changeMsg = '';
    if(isAdding){
        let targetList = data; let insertIndex = -1;
        if (addType === 'page' && !parentId) {
            let uncatNode = data.find(n => n.type === 'category' && n.name === '未分类');
            if (!uncatNode) { uncatNode = { id: Date.now() + Math.random(), type: 'category', name: '未分类', children: [], collapsed: false }; data.push(uncatNode); }
            targetList = uncatNode.children;
        } else if(parentId){
            if (relPos === 'inside') { const p = findNode(parentId); if(p) targetList = p.children; } else {
                const pNode = findParent(parentId);
                if (pNode === null) targetList = data; else if (pNode !== undefined) targetList = pNode.children;
                insertIndex = targetList.findIndex(n => n.id == parentId);
            }
        }
        
        const newNode = {
            id:Date.now(), type:addType, name:name, children:addType==='category'?[]:undefined,
            urls:addType==='page'?newUrls:undefined, url:addType==='page'?(newUrls.length>0?newUrls[0].url:'') : undefined,
            note:addType==='page'?note:undefined, isPinned:false, collapsed:false
        };
        if (!hideIcons && addType==='page') {
            newNode.iconType = iconType;
            newNode.customIcon = customIcon;
            if (recognizedRaw) newNode.recognizedName = recognizedRaw;
        }
        if (insertIndex !== -1) { if (relPos === 'before') targetList.splice(insertIndex, 0, newNode); else targetList.splice(insertIndex + 1, 0, newNode); } else { if (addToTop) targetList.unshift(newNode); else targetList.push(newNode); }
        changeMsg = addType==='page' ? `已保存 (新增 ${newUrls.length} 个网址)` : '分类已添加';
    } else {
        const node=findNode(currentEditId);
        if(node){
            const oldUrls = normalizeUrls(node); const oldJson = JSON.stringify(oldUrls); node.name=name;
            if(node.type==='page'){
                node.urls = newUrls; node.url = newUrls.length > 0 ? newUrls[0].url : ''; node.note = note;
                if (!hideIcons) {
                    node.iconType = iconType; node.customIcon = customIcon;
                    node.recognizedName = recognizedRaw || undefined;
                }
                const newJson = JSON.stringify(newUrls);
                if (oldJson !== newJson) changeMsg = (newUrls.length !== oldUrls.length) ? `网址数量变化: ${oldUrls.length} -> ${newUrls.length}` : '网址更新成功'; else changeMsg = '修改已保存';
            } else { changeMsg = '已保存'; }

            const currentParent=findParent(currentEditId); const currentParentId=currentParent?currentParent.id:'';
            if(String(currentParentId)!==String(parentId)){
                const nodeData=JSON.parse(JSON.stringify(node));
                if(deleteNode(currentEditId)){
                    let targetList=data;
                     if (node.type === 'page' && !parentId) {
                        let uncatNode = data.find(n => n.type === 'category' && n.name === '未分类');
                        if (!uncatNode) { uncatNode = { id: Date.now() + Math.random(), type: 'category', name: '未分类', children: [], collapsed: false }; data.push(uncatNode); }
                        targetList = uncatNode.children;
                     } else if(parentId){ const p=findNode(parentId); if(p)targetList=p.children; }
                    
                    if (editPos === 'bottom') targetList.push(nodeData); else targetList.unshift(nodeData);
                    changeMsg = '已移动并保存';
                }else{alert('移动失败：无法定位原数据，请刷新页面重试');return;}
            } else if (editPos === 'top' || editPos === 'bottom') {
                const nodeData = JSON.parse(JSON.stringify(node));
                if (deleteNode(currentEditId)) {
                    let targetList = data;
                    if (parentId) { const p = findNode(parentId); if (p) targetList = p.children; } 
                    if (editPos === 'top') targetList.unshift(nodeData); else targetList.push(nodeData);
                    if(changeMsg === '修改已保存' || changeMsg === '已保存') changeMsg = '已保存并调整位置'; else changeMsg += '，并调整了位置';
                }
            }
        }
    }
    save(); renderTree(); closeModal('editModal'); showToast(changeMsg);
}

function loadSearchHistory() {
    return parseSearchHistory(localStorage.getItem(SEARCH_HISTORY_KEY));
}

function persistSearchHistory(list) {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(parseSearchHistory(list)));
}

function rememberCurrentSearch(query) {
    const next = rememberSearchQuery(loadSearchHistory(), query);
    persistSearchHistory(next);
    return next;
}

function renderSearchHistory() {
    const resultsDiv = document.getElementById('searchResults');
    if (!resultsDiv) return;
    const history = loadSearchHistory();
    document.body.classList.add('search-mode');
    resultsDiv.innerHTML = '';
    if (history.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'search-item search-history-empty';
        empty.textContent = '暂无搜索历史';
        resultsDiv.appendChild(empty);
    } else {
        history.forEach((query) => {
            const item = document.createElement('div');
            item.className = 'search-item search-history-item';
            const icon = document.createElement('i');
            icon.className = 'fas fa-clock-rotate-left';
            icon.style.color = '#999';
            const text = document.createElement('span');
            text.className = 'search-history-query';
            text.textContent = query;
            item.append(icon, text);
            item.addEventListener('mousedown', (e) => e.preventDefault());
            item.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                applySearchHistory(query);
            });
            resultsDiv.appendChild(item);
        });
    }
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'search-history-clear';
    clearBtn.textContent = '清空搜索历史';
    clearBtn.addEventListener('mousedown', (e) => e.preventDefault());
    clearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearSearchHistory();
    });
    resultsDiv.appendChild(clearBtn);
}

function applySearchHistory(query) {
    const input = document.getElementById('searchInput');
    if (!input) return;
    input.value = query;
    input.focus();
    rememberCurrentSearch(query);
    handleSearchInput(query);
}

function clearSearchHistory() {
    persistSearchHistory([]);
    renderSearchHistory();
}

function handleSearchInput(val){
    const resultsDiv = document.getElementById('searchResults'); const clearBtn = document.getElementById('searchClearBtn');
    if(val) { clearBtn.style.display = 'block'; document.body.classList.add('search-focus'); } else { clearBtn.style.display = 'none'; }
    if(!String(val || '').trim()){
        document.body.classList.add('search-focus');
        renderSearchHistory();
        return;
    }
    document.body.classList.add('search-mode');
    const q=val.toLowerCase(); const matches=[];
    
    function searchRec(nodes, path, wsName, wsId) {
        nodes.forEach(n => {
            const matchName = n.name.toLowerCase().includes(q);
            let matchedSubItem = null;
            if (n.type === 'page') {
                 const urls = normalizeUrls(n);
                 matchedSubItem = urls.find(u => (u.url && u.url.toLowerCase().includes(q)) || (u.name && u.name.toLowerCase().includes(q)));
            }
            const matchNote = n.type === 'page' && n.note && n.note.toLowerCase().includes(q);
            if (matchName || matchedSubItem || matchNote) { matches.push({node: n, path: path, subMatch: matchedSubItem, wsName: wsName, wsId: wsId}); }
            if (n.children) { searchRec(n.children, path ? path + ' > ' + n.name : n.name, wsName, wsId); }
        });
    }

    appData.workspaces.forEach(ws => {
        const wsDispName = ws.group ? `${ws.group}/${ws.name}` : ws.name;
        searchRec(ws.data, '', wsDispName, ws.id);
    });

    resultsDiv.innerHTML = '';
    if(matches.length>0){
        matches.forEach(m => {
            const item = document.createElement('div');
            item.className = 'search-item';
            item.addEventListener('click', () => jumpToNode(m.node.id, m.wsId));

            const title = document.createElement('div');
            title.style.cssText = 'font-weight:600;font-size:calc(14px * var(--text-scale, 1));margin-bottom:2px;display:flex;align-items:center;gap:6px;';
            const icon = document.createElement('i');
            if (m.node.type === 'category') { icon.className = 'fas fa-folder'; icon.style.color = '#ffd43b'; }
            else if (m.node.url || (m.node.urls && m.node.urls.length)) { icon.className = 'fas fa-globe'; icon.style.color = '#007bff'; }
            else { icon.className = 'fas fa-file-lines'; }
            const nameText = document.createElement('span');
            nameText.textContent = String(m.node.name || '').replace(/\n/g, ' ');
            title.append(icon, nameText);

            const pathRow = document.createElement('div');
            pathRow.className = 'search-item-path';
            pathRow.style.cssText = 'display:flex; align-items:center; width:100%;';
            const pathSpan = document.createElement('span');
            pathSpan.style.flexShrink = '0';
            const folderIcon = document.createElement('i');
            folderIcon.className = 'fas fa-folder-open';
            const wsLabel = document.createElement('span');
            wsLabel.style.cssText = 'font-weight:bold;color:var(--primary-color);';
            wsLabel.textContent = `[${m.wsName}]`;
            pathSpan.append(folderIcon, document.createTextNode(' '), wsLabel, document.createTextNode(' ' + (m.path || '根目录')));
            const spacer = document.createElement('div');
            spacer.style.flexGrow = '1';
            pathRow.append(pathSpan, spacer);

            const urls = normalizeUrls(m.node);
            const mainUrl = urls.length > 0 ? urls[0].url : '';
            if (m.node.type === 'page' && mainUrl) {
                const urlPreview = document.createElement('span');
                urlPreview.className = 'search-url-preview';
                urlPreview.style.cssText = 'margin-left:auto;color:#aaa;font-family:monospace; margin-right:5px;';
                urlPreview.textContent = mainUrl;
                pathRow.appendChild(urlPreview);
            }
            item.append(title, pathRow);

            if (m.subMatch) {
                const sub = document.createElement('div');
                sub.className = 'search-sub-match';
                const subIcon = document.createElement('i');
                subIcon.className = 'fas fa-link';
                subIcon.style.cssText = 'font-size:calc(10px * var(--text-scale, 1));margin-right:4px;';
                const strong = document.createElement('strong');
                strong.textContent = m.subMatch.name || '链接';
                sub.append(subIcon, document.createTextNode('匹配: '), strong, document.createTextNode(' - ' + (m.subMatch.url || '')));
                item.appendChild(sub);
            }
            if (m.node.type === 'page' && m.node.note) {
                const note = document.createElement('div');
                note.className = 'search-note-preview';
                const noteIcon = document.createElement('i');
                noteIcon.className = 'fas fa-sticky-note';
                noteIcon.style.cssText = 'font-size:calc(10px * var(--text-scale, 1)); margin-right:4px; opacity:0.7;';
                note.append(noteIcon, document.createTextNode(m.node.note));
                item.appendChild(note);
            }
            resultsDiv.appendChild(item);
        });
    }else{ resultsDiv.innerHTML='<div class="search-item" style="color:#999; cursor:default; text-align:center;">无搜索结果</div>'; }
}

function toggleWsColMode() { wsColMode = (wsColMode % 3) + 1; localStorage.setItem('wsColMode', wsColMode); renderWorkspaceList(); updateWsColBtn(); }

function updateWsColBtn() {
    const btn = document.getElementById('wsColBtn');
    if (wsColMode === 1) { btn.innerHTML = '<i class="fas fa-columns"></i> 1列'; btn.classList.add('active'); } 
    else if (wsColMode === 2) { btn.innerHTML = '<i class="fas fa-table-columns"></i> 2列'; btn.classList.add('active'); } 
    else { btn.innerHTML = '<i class="fas fa-table"></i> 3列'; btn.classList.remove('active'); }
}

function openWorkspaceModal() { 
    isWsManageMode = false; isWsSortGroupMode = false; isWsSortItemMode = false; isWsBatchMode = false; 
    document.getElementById('wsManageBtn').classList.remove('active'); 
    document.getElementById('wsSortCatBtn').classList.remove('active'); 
    document.getElementById('wsSortItemBtn').classList.remove('active'); 
    document.getElementById('wsEditToggleBtn').classList.remove('active'); 
    document.getElementById('workspaceList').classList.remove('ws-manage-active', 'ws-sort-group-active', 'ws-sort-item-active', 'ws-batch-active'); 
    document.getElementById('wsSelectAllBox').checked = false; 
    document.querySelector('.ws-batch-bar').style.display = 'none';
    renderWorkspaceList(); 
    document.getElementById('workspaceModal').classList.add('active'); 
}

function toggleWsSortMode(type) { 
    const isCat = type === 'group';
    const btnCat = document.getElementById('wsSortCatBtn');
    const btnItem = document.getElementById('wsSortItemBtn');
    const list = document.getElementById('workspaceList');

    if (isCat) { if (isWsSortGroupMode) { isWsSortGroupMode = false; } else { isWsSortGroupMode = true; isWsSortItemMode = false; isWsManageMode = false; isWsBatchMode = false; } } 
    else { if (isWsSortItemMode) { isWsSortItemMode = false; } else { isWsSortItemMode = true; isWsSortGroupMode = false; isWsManageMode = false; isWsBatchMode = false; } }

    document.getElementById('wsManageBtn').classList.remove('active');
    document.getElementById('wsEditToggleBtn').classList.remove('active');
    list.classList.remove('ws-manage-active', 'ws-batch-active');
    document.querySelector('.ws-batch-bar').style.display = 'none';

    if (isWsSortGroupMode || isWsSortItemMode) {
        if(isWsSortGroupMode) { list.classList.add('ws-sort-group-active'); list.classList.remove('ws-sort-item-active'); }
        if(isWsSortItemMode) { list.classList.add('ws-sort-item-active'); list.classList.remove('ws-sort-group-active'); }
    } else {
        list.classList.remove('ws-sort-group-active', 'ws-sort-item-active');
        if (wsSortable) { wsSortable.destroy(); wsSortable = null; } 
        if (wsGroupSortables && wsGroupSortables.length > 0) { wsGroupSortables.forEach(s => s.destroy()); wsGroupSortables = []; }
    }
    
    if (isWsSortGroupMode) { btnCat.classList.add('active'); } else { btnCat.classList.remove('active'); }
    if (isWsSortItemMode) { btnItem.classList.add('active'); } else { btnItem.classList.remove('active'); }
    
    renderWorkspaceList(); 
    if (isWsSortGroupMode) initWsSortable('group');
    if (isWsSortItemMode) initWsSortable('item');
}

function toggleWsEditMode() { 
    isWsBatchMode = !isWsBatchMode; const list = document.getElementById('workspaceList'); const btn = document.getElementById('wsEditToggleBtn'); 
    if (isWsBatchMode) { 
        isWsManageMode = false; isWsSortGroupMode = false; isWsSortItemMode = false; 
        document.getElementById('wsManageBtn').classList.remove('active'); 
        document.getElementById('wsSortCatBtn').classList.remove('active');
        document.getElementById('wsSortItemBtn').classList.remove('active');
        list.classList.remove('ws-manage-active', 'ws-sort-group-active', 'ws-sort-item-active'); 
        if (wsSortable) { wsSortable.destroy(); wsSortable = null; } 
        if (wsGroupSortables.length > 0){ wsGroupSortables.forEach(s=>s.destroy()); wsGroupSortables=[]; }
        list.classList.add('ws-batch-active'); btn.classList.add('active'); 
        document.querySelector('.ws-batch-bar').style.display = 'flex';
    } else { 
        list.classList.remove('ws-batch-active'); btn.classList.remove('active'); 
        document.querySelectorAll('.ws-checkbox').forEach(cb => cb.checked = false); 
        document.getElementById('wsSelectAllBox').checked = false; 
        document.querySelector('.ws-batch-bar').style.display = 'none';
    } 
    renderWorkspaceList(); 
}

function toggleCheckPause() {
    window.isCheckPaused = !window.isCheckPaused;
    const btn = document.getElementById('pauseReportBtn');
    if(window.isCheckPaused) {
        btn.className = 'fas fa-play'; btn.style.color = 'var(--primary-color)';
        document.getElementById('reportSummary').innerHTML = `<span style="color:#ffc107"><i class="fas fa-pause-circle"></i> 已暂停任务 (${window.currentCheckProgress})</span>`;
        if (window.currentReportData && window.currentReportData.length > 0) document.getElementById('copyReportBtn').style.display = 'inline-block';
    } else {
        btn.className = 'fas fa-pause'; btn.style.color = '';
        document.getElementById('reportSummary').innerHTML = `<i class="fas fa-spinner fa-spin"></i> 正在处理中 (${window.currentCheckProgress})...`;
    }
}

function closeReportModal() {
    window.isCheckAborted = true;
    try { window.Android?.cancelAllPageInfo?.(); } catch (e) { /* 网页没有原生桥 */ }
    closeModal('reportModal');
}

async function copyReportContent() {
    if (!window.currentReportData || window.currentReportData.length === 0) return showToast("无内容可复制");
    const grouped = {};
    window.currentReportData.forEach(item => { const pathInfo = item.path || '默认分类'; if (!grouped[pathInfo]) grouped[pathInfo] = []; grouped[pathInfo].push(item); });
    let textArray = [];
    for (const path in grouped) {
        textArray.push(path);
        grouped[path].forEach(item => { textArray.push(item.name); textArray.push(item.url); textArray.push(""); });
    }
    let text = textArray.join('\n').replace(/\n\n\n/g, '\n\n').trim();
    const ok = await copyTextToClipboard(text);
    showToast(ok ? "报告组合内容已复制到剪贴板" : "复制失败", 1500);
}

function initWsSortable(type) { 
    if (wsSortable) { wsSortable.destroy(); wsSortable = null; } 
    if (wsGroupSortables && wsGroupSortables.length > 0) { wsGroupSortables.forEach(s => s.destroy()); wsGroupSortables = []; }
    if (type === 'group') {
        const list = document.getElementById('workspaceList'); 
        wsSortable = new Sortable(list, { animation: 150, handle: '.ws-group-header', onStart: function() { document.body.classList.add('is-dragging'); }, onEnd: function(evt) { document.body.classList.remove('is-dragging'); saveWorkspaceOrder(); } }); 
    } else if (type === 'item') {
        document.querySelectorAll('.ws-group-items').forEach(itemsContainer => { wsGroupSortables.push(new Sortable(itemsContainer, { group: 'shared-workspaces', animation: 150, onStart: function() { document.body.classList.add('is-dragging'); }, onEnd: function(evt) { document.body.classList.remove('is-dragging'); saveWorkspaceOrder(); } })); });
    }
}

function saveWorkspaceOrder() {
    const newWorkspaces = []; appData.workspaceGroups = [];
    document.querySelectorAll('.ws-group-wrap').forEach(wrap => {
        const groupName = wrap.dataset.group; if (groupName && groupName !== '') appData.workspaceGroups.push(groupName);
        wrap.querySelectorAll('.workspace-item').forEach(item => { const id = item.dataset.id; const ws = appData.workspaces.find(w => w.id === id); if (ws) { ws.group = groupName === '' ? '' : groupName; newWorkspaces.push(ws); } });
    });
    appData.workspaces.forEach(ws => { if (!newWorkspaces.find(nW => nW.id === ws.id)) newWorkspaces.push(ws); });
    appData.workspaces = newWorkspaces; save(); 
}

function toggleWsManageMode() {
    isWsManageMode = !isWsManageMode; const btn = document.getElementById('wsManageBtn'); const list = document.getElementById('workspaceList');
    if (isWsManageMode) {
        isWsSortGroupMode = false; isWsSortItemMode = false; isWsBatchMode = false; 
        document.getElementById('wsSortCatBtn').classList.remove('active'); document.getElementById('wsSortItemBtn').classList.remove('active'); document.getElementById('wsEditToggleBtn').classList.remove('active'); 
        list.classList.remove('ws-sort-group-active', 'ws-sort-item-active', 'ws-batch-active'); document.querySelector('.ws-batch-bar').style.display = 'none';
        if (wsSortable) { wsSortable.destroy(); wsSortable = null; } if (wsGroupSortables && wsGroupSortables.length > 0) { wsGroupSortables.forEach(s => s.destroy()); wsGroupSortables = []; }
        btn.classList.add('active'); list.classList.add('ws-manage-active');
    } else { btn.classList.remove('active'); list.classList.remove('ws-manage-active'); }
    renderWorkspaceList();
}

function renderWorkspaceList() { 
    const container = document.getElementById('workspaceList'); 
    container.innerHTML = ''; container.className = 'workspace-list'; container.classList.add(`ws-col-${wsColMode}`);
    if(isWsManageMode) container.classList.add('ws-manage-active');
    if(isWsSortGroupMode) container.classList.add('ws-sort-group-active'); 
    if(isWsSortItemMode) container.classList.add('ws-sort-item-active'); 
    if(isWsBatchMode) container.classList.add('ws-batch-active'); 

    ensureWorkspaceGroups(appData);

    let totalPages = 0; let totalCats = 0;
    appData.workspaces.forEach(w => {
        let pages = 0; let cats = 0;
        function countRec(nodes){ nodes.forEach(n => { if(n.type === 'page') pages++; else if(n.type === 'category'){ cats++; countRec(n.children); } }); }
        if(w.data) countRec(w.data); totalPages += pages; totalCats += cats;
    });
    
    let totalWsGroups = appData.workspaceGroups ? appData.workspaceGroups.length : 0;
    const wsModalHeader = document.querySelector('#workspaceModal .modal-header span');
    if(wsModalHeader) { wsModalHeader.innerHTML = `主页管理 <span style="font-size:calc(14px * var(--text-scale, 1)); font-weight:normal; margin-left:5px;">(总计: 网页 ${totalPages}, 分类 ${totalCats}, 主页分类 ${totalWsGroups})</span>`; }

    const groupsMap = {}; appData.workspaceGroups.forEach(g => { groupsMap[g] = []; }); groupsMap[''] = [];
    appData.workspaces.forEach(ws => { const g = ws.group || ''; if(!groupsMap[g]) { groupsMap[g] = []; if (g !== '') appData.workspaceGroups.push(g); } groupsMap[g].push(ws); });

    const renderGroup = (g, items, isUncat) => {
        if (isUncat && items.length === 0) return; 

        const wrap = document.createElement('div'); wrap.className = 'ws-group-wrap'; wrap.dataset.group = g;
        const header = document.createElement('div'); header.className = 'ws-group-header';
        const titleSpan = document.createElement('span'); const grpCount = items.length;
        titleSpan.innerHTML = isUncat ? `<i class="fas fa-folder" style="color: #cbd5e1; margin-right: 8px;"></i> 未分类 <span class="ws-group-count-badge">(${grpCount})</span>` : `<i class="fas fa-folder" style="color: #ffd43b; margin-right: 8px;"></i> ${g} <span class="ws-group-count-badge">(${grpCount})</span>`;
        titleSpan.style.flexGrow = '1'; header.appendChild(titleSpan);

        if (isWsManageMode && !isUncat) {
            const editBtn = document.createElement('i'); editBtn.className = 'fas fa-pen'; editBtn.style.cursor = 'pointer'; editBtn.style.padding = '5px'; editBtn.title = '重命名分类'; editBtn.onclick = () => renameWorkspaceGroup(g);
            const delBtn = document.createElement('i'); delBtn.className = 'fas fa-trash'; delBtn.style.cursor = 'pointer'; delBtn.style.color = '#dc3545'; delBtn.style.padding = '5px'; delBtn.title = '删除分类及内部资料'; delBtn.onclick = () => deleteWorkspaceGroup(g);
            header.append(editBtn, delBtn);
        }
        wrap.appendChild(header);

        const itemsContainer = document.createElement('div'); itemsContainer.className = 'ws-group-items';
        items.forEach(ws => { 
            const el = document.createElement('div'); el.className = 'workspace-item' + (ws.id === appData.currentId ? ' active' : ''); el.dataset.id = ws.id; 
            const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.className = 'ws-checkbox'; checkbox.value = ws.id; 
            const nameSpan = document.createElement('div'); nameSpan.className = 'workspace-name'; const wsCount = countTotalPages(ws.data);
            nameSpan.innerHTML = `<span class="workspace-name-text">${ws.name}</span><span class="ws-count-badge">(${wsCount})</span>`;
            
            const actions = document.createElement('div'); actions.className = 'workspace-actions'; 
            const grpBtn = document.createElement('button'); grpBtn.className = 'ws-btn'; grpBtn.innerHTML = '<i class="fas fa-folder-open"></i>'; grpBtn.title = '移动主页分类'; grpBtn.onclick = (e) => { e.stopPropagation(); changeWorkspaceGroup(ws.id); }; 
            const delBtn = document.createElement('button'); delBtn.className = 'ws-btn'; delBtn.innerHTML = '<i class="fas fa-trash-can"></i>'; delBtn.title = '删除该主页'; delBtn.style.color = '#dc3545'; delBtn.style.borderColor = 'rgba(220,53,69,0.3)'; delBtn.onclick = (e) => { e.stopPropagation(); deleteWorkspace(ws.id); }; 
            actions.append(grpBtn, delBtn);

            el.onclick = (e) => { if(e.target.closest('.ws-btn') || e.target.closest('.ws-checkbox')) return; if (isWsManageMode) renameWorkspace(ws.id); else if(!isWsSortGroupMode && !isWsSortItemMode && !isWsBatchMode) switchWorkspace(ws.id); }; 
            el.append(checkbox, nameSpan, actions); itemsContainer.appendChild(el); 
        }); 
        wrap.appendChild(itemsContainer); container.appendChild(wrap);
    };
    appData.workspaceGroups.forEach(g => { renderGroup(g, groupsMap[g], false); }); renderGroup('', groupsMap[''], true);
}

function openQuickAddWsModal() {
    document.getElementById('qaWorkspaceName').value = ''; document.getElementById('qaGroupName').value = ''; document.getElementById('qaComboGroupName').value = ''; document.getElementById('qaComboWorkspaceName').value = '';
    document.getElementById('quickAddWsModal').classList.add('active'); setTimeout(() => document.getElementById('qaWorkspaceName').focus(), 100);
}

function qaCreateWorkspace() {
    const rawVal = document.getElementById('qaWorkspaceName').value.trim() || '新主页'; const newId = 'ws_' + Date.now(); 
    appData.workspaces.push({ id: newId, name: rawVal, group: '', data: [] }); save(); closeModal('quickAddWsModal'); showToast(`已创建主页: ${escapeHtml(rawVal)}`); renderWorkspaceList(); 
}
function qaCreateGroup() {
    const name = document.getElementById('qaGroupName').value.trim(); if (!name) return showToast('请输入主页分类名称');
    if (!appData.workspaceGroups) appData.workspaceGroups = [];
    if (!appData.workspaceGroups.includes(name)) { appData.workspaceGroups.push(name); save(); renderWorkspaceList(); showToast("主页分类已创建"); closeModal('quickAddWsModal'); } else { showToast("该主页分类已存在"); }
}
function qaCreateCombo() {
    const gName = document.getElementById('qaComboGroupName').value.trim(); const wName = document.getElementById('qaComboWorkspaceName').value.trim() || '新主页';
    if (!gName) return showToast('请输入主页分类名称');
    if (!appData.workspaceGroups) appData.workspaceGroups = []; if (!appData.workspaceGroups.includes(gName)) { appData.workspaceGroups.push(gName); }
    const newId = 'ws_' + Date.now(); appData.workspaces.push({ id: newId, name: wName, group: gName, data: [] }); save(); showToast(`已创建组合: [${escapeHtml(gName)}] ${escapeHtml(wName)}`); renderWorkspaceList(); closeModal('quickAddWsModal');
}

function changeWorkspaceGroup(id) { const ws = appData.workspaces.find(w => w.id === id); if (!ws) return; openWsGroupSelectModal(id, false); }
function openWsGroupSelectModal(id, isBatch = false) { document.getElementById('wsGroupTargetId').value = id; document.getElementById('wsGroupIsBatch').value = isBatch; document.getElementById('wsGroupSearchInput').value = ''; renderWsGroupList(''); document.getElementById('wsGroupSelectModal').classList.add('active'); }

function renderWsGroupList(filter = '') {
    const list = document.getElementById('wsGroupList'); list.innerHTML = ''; const q = filter.trim().toLowerCase();
    if (!q || '未分类'.includes(q)) {
        let item = document.createElement('div'); item.className = 'export-item'; item.innerHTML = `<i class="fas fa-folder" style="color: #cbd5e1; margin-right: 8px;"></i> 未分类`; item.onclick = () => { document.getElementById('wsGroupSearchInput').value = '未分类'; }; list.appendChild(item);
    }
    let groups = appData.workspaceGroups || [];
    groups.forEach(g => {
        if (!q || g.toLowerCase().includes(q)) {
            let item = document.createElement('div'); item.className = 'export-item'; item.innerHTML = `<i class="fas fa-folder" style="color: #ffd43b; margin-right: 8px;"></i> ${g}`; item.onclick = () => { document.getElementById('wsGroupSearchInput').value = g; }; list.appendChild(item);
        }
    });
}

function confirmChangeWsGroup() {
    let newVal = document.getElementById('wsGroupSearchInput').value.trim(); if (newVal === '未分类') newVal = ''; 
    const isBatch = document.getElementById('wsGroupIsBatch').value === 'true';
    if (!appData.workspaceGroups) appData.workspaceGroups = []; if (newVal && !appData.workspaceGroups.includes(newVal)) { appData.workspaceGroups.push(newVal); }
    
    if (isBatch) {
        const checked = document.querySelectorAll('.ws-checkbox:checked'); checked.forEach(cb => { const ws = appData.workspaces.find(w => w.id === cb.value); if (ws) ws.group = newVal; }); document.getElementById('wsSelectAllBox').checked = false;
    } else { const id = document.getElementById('wsGroupTargetId').value; const ws = appData.workspaces.find(w => w.id === id); if (ws) ws.group = newVal; }
    save(); renderWorkspaceList(); closeModal('wsGroupSelectModal'); showToast("主页分类已修改生效");
}

function renameWorkspaceGroup(oldName) {
    const newName = prompt(`将分类文件夹 "${oldName}" 重命名为:`, oldName);
    if (newName && newName.trim() && newName.trim() !== oldName) { const parsed = newName.trim(); const idx = appData.workspaceGroups.indexOf(oldName); if (idx !== -1) appData.workspaceGroups[idx] = parsed; appData.workspaces.forEach(ws => { if (ws.group === oldName) ws.group = parsed; }); save(); renderWorkspaceList(); }
}

function deleteWorkspaceGroup(gName) {
    if (confirm(`【危险警告】\n\n确定要删除分类 "${gName}" 吗？\n注意：这会删除此分类下的 「所有主页及其包含数据」！`)) {
        appData = removeWorkspaceGroup(appData, gName);
        updateDataPointer();
        save(); renderTree(); renderWorkspaceList(); showToast("大分类及内容已删除");
    }
}

function switchWorkspace(id) { 
    if (id === appData.currentId) return; 
    const currentWs = appData.workspaces.find(w => w.id === appData.currentId); 
    if (currentWs) { currentWs.data = data; } 
    appData.currentId = id; 
    updateDataPointer(); 
    save(); 
    
    // 重置展开折叠状态显示
    isAllExpanded = false;
    const expandBtn = document.getElementById('expandToggleBtn');
    if(expandBtn) expandBtn.innerHTML = '<i class="fas fa-expand-arrows-alt"></i> <span>全部展开</span>';

    renderWorkspaceList(); 
    renderTree(); 
    const targetWs = appData.workspaces.find(w => w.id === id); 
    showToast(`已切换到：<strong style="color:#ffc107">${escapeHtml(targetWs.group ? targetWs.group + '/' : '')}${escapeHtml(targetWs.name)}</strong>`); 
    closeModal('workspaceModal'); 
}
function renameWorkspace(id) { const ws = appData.workspaces.find(w => w.id === id); if (!ws) return; const newName = prompt("为其赋予一个新的主页名字:", ws.name); if (newName && newName.trim() !== "") { ws.name = newName.trim(); save(); renderWorkspaceList(); } }
function deleteWorkspace(id) { const ws = appData.workspaces.find(w => w.id === id); if (confirm(`确定要删除主页 "${ws.name}" 及其所有数据吗？此操作不可撤销。`)) { const isCurrent = (id === appData.currentId); appData = removeWorkspacesByIds(appData, [id]); updateDataPointer(); save(); if (isCurrent || appData.workspaces.length === 1) { renderTree(); } renderWorkspaceList(); showToast("主页已被删除"); } }

function wsToggleSelectAll(checkbox) { document.querySelectorAll('.ws-checkbox').forEach(cb => cb.checked = checkbox.checked); }
function wsBatchChangeGroup() { const checked = document.querySelectorAll('.ws-checkbox:checked'); if (checked.length === 0) return alert('请先勾选需要操作的主页'); openWsGroupSelectModal('', true); }
function wsBatchDelete() { const checked = document.querySelectorAll('.ws-checkbox:checked'); if (checked.length === 0) return alert('请先选择要删除主页'); if (confirm(`确定删除这 ${checked.length} 个主页吗？`)) { const idsToDelete = Array.from(checked).map(cb => cb.value); appData = removeWorkspacesByIds(appData, idsToDelete); updateDataPointer(); save(); renderTree(); renderWorkspaceList(); document.getElementById('wsSelectAllBox').checked = false; showToast("批量删除成功"); } }

function initSliderDistractionFree() { const sliders = ['themeAlphaRange', 'textMaskRange', 'bgBlurRange', 'bgOpacityRange', 'bgOverlayRange', 'textScaleRange', 'uiScaleRange']; sliders.forEach(id => { const el = document.getElementById(id); if(el) { const startAdjust = () => { document.body.classList.add('is-adjusting'); const container = el.closest('.adjust-container'); if(container) container.classList.add('adjust-active'); }; const endAdjust = () => { document.body.classList.remove('is-adjusting'); const container = el.closest('.adjust-container'); if(container) container.classList.remove('adjust-active'); }; el.addEventListener('mousedown', startAdjust); el.addEventListener('touchstart', startAdjust, {passive: true}); el.addEventListener('mouseup', endAdjust); el.addEventListener('touchend', endAdjust); } }); }
function loadThemeConfig() { const savedTheme = localStorage.getItem('webManagerThemeConfig'); if (!savedTheme) { themeConfig = createDefaultThemeConfig(); return; } try { const parsed = JSON.parse(savedTheme); if (parsed.day === undefined) { themeConfig = { ...createDefaultThemeConfig(), darkMode: parsed.darkMode || false, customCss: parsed.customCss || '', presets: parsed.presets || {}, day: { theme: parsed.theme || 'minimal', bgType: parsed.bgType || 'none', bgValue: parsed.bgValue || '', bgBlur: parsed.bgBlur || 0, bgOpacity: parsed.bgOpacity !== undefined ? parsed.bgOpacity : 1, bgOverlay: parsed.bgOverlay || 0, contentTransparency: parsed.contentTransparency || 0, contentMask: parsed.contentMask || 0 }, night: { theme: parsed.theme || 'minimal', bgType: parsed.bgType || 'none', bgValue: parsed.bgValue || '', bgBlur: 0, bgOpacity: 1, bgOverlay: 0, contentTransparency: 0, contentMask: 0 } }; saveThemeConfig(); } else { themeConfig = { ...createDefaultThemeConfig(), ...parsed }; if (parsed.bgValue && (!themeConfig.day.bgValue)) { themeConfig.day.bgType = parsed.bgType || 'none'; themeConfig.day.bgValue = parsed.bgValue; themeConfig.night.bgType = parsed.bgType || 'none'; themeConfig.night.bgValue = parsed.bgValue; delete themeConfig.bgType; delete themeConfig.bgValue; } if (themeConfig.lockedImg === undefined) { themeConfig.lockedImg = themeConfig.locked !== undefined ? themeConfig.locked : true; themeConfig.lockedContent = themeConfig.locked !== undefined ? themeConfig.locked : true; } if (!themeConfig.day.theme) themeConfig.day.theme = themeConfig.theme || 'minimal'; if (!themeConfig.night.theme) themeConfig.night.theme = themeConfig.theme || 'minimal'; } } catch(e) { console.error(e); themeConfig = createDefaultThemeConfig(); } }
function cleanDuplicates() { if (!data) return; if (cleanDuplicateIds(data)) save(); }
function toggleToolbar() { const toolbar = document.getElementById('mainToolbar'); const btn = document.getElementById('toolbarToggleBtn'); toolbar.classList.toggle('collapsed'); const isCollapsed = toolbar.classList.contains('collapsed'); btn.innerHTML = isCollapsed ? '<i class="fas fa-angle-down"></i> 展开工具栏' : '<i class="fas fa-angle-up"></i> 折叠'; localStorage.setItem('toolbarCollapsed', isCollapsed); }
function openToolsModal() { applySiteDataClearTypeChecks(); document.getElementById('toolsModal').classList.add('active'); }
function toggleThemeLock(type) { if (type === 'img') { themeConfig.lockedImg = !themeConfig.lockedImg; } else if (type === 'content') { themeConfig.lockedContent = !themeConfig.lockedContent; } updateLockUI(); saveThemeConfig(); }

function updateLockUI() { const lockImgBtn = document.getElementById('lockImgBtn'); const lockContentBtn = document.getElementById('lockContentBtn'); const imgInputs = [ document.getElementById('bgBlurRange'), document.getElementById('bgOpacityRange'), document.getElementById('bgOverlayRange') ]; const contentInputs = [ document.getElementById('themeAlphaRange'), document.getElementById('textMaskRange') ]; if (themeConfig.lockedImg) { lockImgBtn.innerHTML = '<i class="fas fa-lock"></i>'; lockImgBtn.classList.add('locked'); lockImgBtn.title = "点击解锁"; imgInputs.forEach(r => r.disabled = true); } else { lockImgBtn.innerHTML = '<i class="fas fa-lock-open"></i>'; lockImgBtn.classList.remove('locked'); lockImgBtn.title = "点击锁定"; imgInputs.forEach(r => r.disabled = false); } if (themeConfig.lockedContent) { lockContentBtn.innerHTML = '<i class="fas fa-lock"></i>'; lockContentBtn.classList.add('locked'); lockContentBtn.title = "点击解锁"; contentInputs.forEach(r => r.disabled = true); } else { lockContentBtn.innerHTML = '<i class="fas fa-lock-open"></i>'; lockContentBtn.classList.remove('locked'); lockContentBtn.title = "点击锁定"; contentInputs.forEach(r => r.disabled = false); } }

function exportThemeSettings() { const configToExport = JSON.parse(JSON.stringify(themeConfig)); const hasDayImg = configToExport.day.bgType === 'image' && configToExport.day.bgValue && configToExport.day.bgValue.startsWith('data:image'); const hasNightImg = configToExport.night.bgType === 'image' && configToExport.night.bgValue && configToExport.night.bgValue.startsWith('data:image'); const includePresets = document.getElementById('exportIncludePresets').checked; if (hasDayImg || hasNightImg || includePresets) { const zip = new JSZip(); if (hasDayImg) { const mimeMatch = configToExport.day.bgValue.match(/data:([^;]+);/); const ext = (mimeMatch && mimeMatch[1] === 'image/png') ? 'png' : 'jpg'; const filename = `bg_day.${ext}`; zip.file(filename, configToExport.day.bgValue.split(',')[1], {base64: true}); configToExport.day.bgValue = filename; } if (hasNightImg) { const mimeMatch = configToExport.night.bgValue.match(/data:([^;]+);/); const ext = (mimeMatch && mimeMatch[1] === 'image/png') ? 'png' : 'jpg'; const filename = `bg_night.${ext}`; zip.file(filename, configToExport.night.bgValue.split(',')[1], {base64: true}); configToExport.night.bgValue = filename; } if (includePresets && configToExport.presets && Object.keys(configToExport.presets).length > 0) { const presetsMeta = {}; const cssFolder = zip.folder("presets/css"); const htmlFolder = zip.folder("presets/html"); Object.keys(configToExport.presets).forEach(presetName => { const content = configToExport.presets[presetName]; const isHtml = content.trim().startsWith('<'); if (isHtml) { htmlFolder.file(`${presetName}.html`, content); presetsMeta[presetName] = { type: 'html', file: `presets/html/${presetName}.html` }; } else { cssFolder.file(`${presetName}.css`, content); presetsMeta[presetName] = { type: 'css', file: `presets/css/${presetName}.css` }; } }); zip.file("presets.json", JSON.stringify(presetsMeta, null, 2)); delete configToExport.presets; } zip.file("theme_config.json", JSON.stringify(configToExport, null, 2)); zip.generateAsync({type:"blob"}).then(function(content) { downloadBlob(content, "web_manager_theme.zip"); }); } else { const blob = new Blob([JSON.stringify(configToExport, null, 2)], {type: "application/json"}); downloadBlob(blob, "web_manager_theme.json"); } }

function openThemeModal() { document.getElementById('darkModeToggle').checked = themeConfig.darkMode; const input = document.getElementById('customCssInput'); if(!input.value.trim()) input.value = themeConfig.customCss || DEFAULT_CSS_TEMPLATE; updateBgPreviewUI(); updateSliderValuesFromConfig(); updateBgAdjustment(); updateLockUI(); document.getElementById('themeModal').classList.add('active'); }
function updateSliderValuesFromConfig() { const mode = themeConfig.darkMode ? 'night' : 'day'; const settings = themeConfig[mode]; document.getElementById('bgBlurRange').value = settings.bgBlur; document.getElementById('bgOpacityRange').value = settings.bgOpacity; document.getElementById('bgOverlayRange').value = settings.bgOverlay; document.getElementById('themeAlphaRange').value = settings.contentTransparency; document.getElementById('textMaskRange').value = settings.contentMask; if (themeConfig.systemTextSize) { document.getElementById('systemTextScaleCheck').checked = true; document.getElementById('textScaleRange').disabled = true; document.getElementById('uiScaleRange').disabled = true; document.getElementById('textScaleRange').value = 100; document.getElementById('uiScaleRange').value = 100; document.getElementById('textScaleDisplay').innerText = '100%'; document.getElementById('uiScaleDisplay').innerText = '100%'; } else { document.getElementById('systemTextScaleCheck').checked = false; document.getElementById('textScaleRange').disabled = false; document.getElementById('uiScaleRange').disabled = false; const textVal = Math.round((themeConfig.textScale || 1) * 100); document.getElementById('textScaleRange').value = textVal; document.getElementById('textScaleDisplay').innerText = textVal + '%'; const uiVal = Math.round((themeConfig.uiScale || 1) * 100); document.getElementById('uiScaleRange').value = uiVal; document.getElementById('uiScaleDisplay').innerText = uiVal + '%'; } const hint = document.getElementById('themeModeHint'); hint.innerText = themeConfig.darkMode ? '当前配置：夜间模式风格' : '当前配置：日间模式风格'; hint.style.color = themeConfig.darkMode ? '#4dabf7' : '#e67700'; document.querySelectorAll('.theme-option').forEach(el => el.classList.remove('active')); const currentTheme = settings.theme || 'minimal'; const activeEl = document.getElementById('theme-' + currentTheme); if(activeEl) activeEl.classList.add('active'); }
function toggleSystemTextScale() { const isChecked = document.getElementById('systemTextScaleCheck').checked; const textRange = document.getElementById('textScaleRange'); const uiRange = document.getElementById('uiScaleRange'); if (isChecked) { textRange.disabled = true; uiRange.disabled = true; textRange.value = 100; uiRange.value = 100; document.getElementById('textScaleDisplay').innerText = '100%'; document.getElementById('uiScaleDisplay').innerText = '100%'; document.documentElement.style.setProperty('--text-scale', 1); document.documentElement.style.setProperty('--ui-scale', 1); themeConfig.textScale = 1; themeConfig.uiScale = 1; themeConfig.systemTextSize = true; } else { textRange.disabled = false; uiRange.disabled = false; themeConfig.systemTextSize = false; } saveThemeConfig(); }
function updateTextScale() { const range = document.getElementById('textScaleRange'); const val = range.value; document.getElementById('textScaleDisplay').innerText = val + '%'; document.documentElement.style.setProperty('--text-scale', val / 100); themeConfig.textScale = val / 100; document.getElementById('systemTextScaleCheck').checked = false; themeConfig.systemTextSize = false; document.getElementById('uiScaleRange').disabled = false; if(window.saveBgTimer) clearTimeout(window.saveBgTimer); window.saveBgTimer = setTimeout(saveThemeConfig, 500); }
function updateUiScale() { const range = document.getElementById('uiScaleRange'); const val = range.value; document.getElementById('uiScaleDisplay').innerText = val + '%'; document.documentElement.style.setProperty('--ui-scale', val / 100); themeConfig.uiScale = val / 100; document.getElementById('systemTextScaleCheck').checked = false; themeConfig.systemTextSize = false; document.getElementById('textScaleRange').disabled = false; if(window.saveBgTimer) clearTimeout(window.saveBgTimer); window.saveBgTimer = setTimeout(saveThemeConfig, 500); }

function importThemeSettings(input) { 
    const file = input.files[0]; if (!file) return; 
    const handleConfig = (newConfig) => { 
        if (Array.isArray(newConfig) || (newConfig.type && (newConfig.type === 'category' || newConfig.type === 'page')) || newConfig.children) { showToast("❌ 这是网页数据，不是主题文件！", 2500); input.value = ''; return; } 
        if(confirm('确定要覆盖当前的主题设置吗？')) { 
            if (!newConfig.day) newConfig.day = { ...DEFAULT_THEME_CONFIG.day }; if (!newConfig.night) newConfig.night = { ...DEFAULT_THEME_CONFIG.night }; 
            themeConfig = { ...createDefaultThemeConfig(), ...newConfig }; saveThemeConfig(); applyThemeSettings(); showToast("主题导入成功", 1000); closeModal('themeModal'); 
        } 
    }; 
    if (file.name.toLowerCase().endsWith('.zip')) { 
        JSZip.loadAsync(file).then(function(zip) { 
            const presetPromises = []; 
            zip.forEach(function (relativePath, zipEntry) { 
                if (relativePath.startsWith('css_presets/') && relativePath.endsWith('.css') && !zipEntry.dir) { presetPromises.push(zipEntry.async("string").then(cssContent => { const presetName = relativePath.replace('css_presets/', '').replace('.css', ''); return { name: presetName, content: cssContent }; })); } 
            }); 
            return zip.file("theme_config.json").async("string").then(function(jsonStr) { 
                const config = JSON.parse(jsonStr); const promises = []; 
                if (config.day && config.day.bgType === 'image' && config.day.bgValue && !config.day.bgValue.startsWith('data:')) { promises.push(zip.file(config.day.bgValue).async("base64").then(b64 => { const ext = config.day.bgValue.split('.').pop().toLowerCase(); const mime = ext === 'png' ? 'image/png' : 'image/jpeg'; config.day.bgValue = `data:${mime};base64,${b64}`; })); } 
                if (config.night && config.night.bgType === 'image' && config.night.bgValue && !config.night.bgValue.startsWith('data:')) { promises.push(zip.file(config.night.bgValue).async("base64").then(b64 => { const ext = config.night.bgValue.split('.').pop().toLowerCase(); const mime = ext === 'png' ? 'image/png' : 'image/jpeg'; config.night.bgValue = `data:${mime};base64,${b64}`; })); } 
                const presetsFile = zip.file("presets.json");
                if (presetsFile) {
                     const p = presetsFile.async("string").then(presetsJson => {
                         const presetsMeta = JSON.parse(presetsJson); const filePromises = [];
                         Object.keys(presetsMeta).forEach(name => {
                             const meta = presetsMeta[name]; const filePath = meta.file || meta; 
                             const fileEntry = zip.file(filePath); if (fileEntry) { filePromises.push(fileEntry.async("string").then(content => { return { name: name, content: content }; })); }
                         }); return Promise.all(filePromises);
                     }); promises.push(p);
                }
                return Promise.all(promises).then((results) => {
                     const loadedPresets = []; results.forEach(res => { if (Array.isArray(res)) loadedPresets.push(...res); });
                     return Promise.all(presetPromises).then(oldPresets => { loadedPresets.push(...oldPresets); if (!config.presets) config.presets = {}; loadedPresets.forEach(p => { config.presets[p.name] = p.content; }); return config; });
                }); 
            }); 
        }).then(handleConfig).catch(function(err) { alert('主题包读取失败: ' + err); }); 
    } else { 
        const reader = new FileReader(); reader.onload = function(e) { try { const config = JSON.parse(e.target.result); handleConfig(config); } catch(err) { alert('配置文件解析失败，请确保是有效的 JSON 文件。'); } }; reader.readAsText(file); 
    } input.value = ''; 
}

function updateBgPreviewUI() { const mode = themeConfig.darkMode ? 'night' : 'day'; const settings = themeConfig[mode]; const previewImg = document.getElementById('bgPreviewImage'); const previewText = document.querySelector('.bg-preview-text'); const urlInput = document.getElementById('bgUrlInput'); if (settings.bgType === 'none' || !settings.bgValue) { previewImg.style.backgroundImage = 'none'; previewText.style.display = 'block'; urlInput.value = ''; } else { previewImg.style.backgroundImage = `url("${settings.bgValue}")`; previewText.style.display = 'none'; if (settings.bgType === 'url') urlInput.value = settings.bgValue; else urlInput.value = ''; } }
function updateBgAdjustment() { const mode = themeConfig.darkMode ? 'night' : 'day'; const settings = themeConfig[mode]; settings.bgBlur = document.getElementById('bgBlurRange').value; settings.bgOpacity = document.getElementById('bgOpacityRange').value; settings.bgOverlay = document.getElementById('bgOverlayRange').value; settings.contentTransparency = document.getElementById('themeAlphaRange').value; settings.contentMask = document.getElementById('textMaskRange').value; document.getElementById('blurValDisplay').innerText = settings.bgBlur + 'px'; document.getElementById('opacityValDisplay').innerText = Math.round(settings.bgOpacity * 100) + '%'; document.getElementById('overlayValDisplay').innerText = Math.round(settings.bgOverlay * 100) + '%'; document.getElementById('themeAlphaDisplay').innerText = settings.contentTransparency + '%'; document.getElementById('textMaskDisplay').innerText = settings.contentMask + '%'; applyThemeSettings(); const previewImg = document.getElementById('bgPreviewImage'); const previewOverlay = document.getElementById('bgPreviewOverlay'); if (previewImg) { previewImg.style.filter = `blur(${settings.bgBlur}px)`; previewImg.style.opacity = settings.bgOpacity; } if (previewOverlay) { const overlayBaseColor = getComputedStyle(document.body).getPropertyValue('--bg-overlay-color').trim(); previewOverlay.style.backgroundColor = `rgba(${overlayBaseColor}, ${settings.bgOverlay})`; } if(window.saveBgTimer) clearTimeout(window.saveBgTimer); window.saveBgTimer = setTimeout(saveThemeConfig, 500); }
function resetBgParams() { const mode = themeConfig.darkMode ? 'night' : 'day'; const currentTheme = themeConfig[mode].theme; themeConfig[mode] = { ...DEFAULT_THEME_CONFIG[mode], theme: currentTheme }; updateSliderValuesFromConfig(); updateBgAdjustment(); updateBgPreviewUI(); }

async function copyCss() {
    const text = document.getElementById('customCssInput').value;
    if (!text) return showToast('CSS 内容为空', 1000);
    const ok = await copyTextToClipboard(text);
    showToast(ok ? 'CSS 已复制' : '复制失败', 1000);
}
function downloadCurrentCss() { const css = document.getElementById('customCssInput').value; if (!css) return alert("当前 CSS 内容为空"); const blob = new Blob([css], {type: "text/css"}); let filename = "custom_style.css"; const presetName = document.getElementById('presetNameInput').value.trim(); if (presetName) { filename = `custom_style_${presetName}.css`; } downloadBlob(blob, filename); }
function downloadAllCssPresets() { const keys = Object.keys(themeConfig.presets); if (keys.length === 0) return alert("没有保存的预设"); const zip = new JSZip(); keys.forEach(name => { zip.file(name + ".css", themeConfig.presets[name]); }); zip.generateAsync({type:"blob"}).then(function(content) { downloadBlob(content, "css_presets.zip"); }); }

function importCustomCodeFile(input) {
    if (!input.files || input.files.length === 0) return;
    const isBatch = input.files.length > 1;
    if (isBatch) {
         let loadedCount = 0; const promises = [];
         Array.from(input.files).forEach(file => {
             const name = file.name.replace(/\.(css|txt|html|js)$/i, '');
             const p = new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = function(e) { themeConfig.presets[name] = e.target.result; loadedCount++; resolve(); };
                reader.readAsText(file);
            }); promises.push(p);
         });
         Promise.all(promises).then(() => { saveThemeConfig(); updatePresetDropdown(); showToast(`已批量导入 ${loadedCount} 个代码预设`); input.value = ''; });
         return;
    }

    const file = input.files[0];
    if (file.name.toLowerCase().endsWith('.zip')) {
        JSZip.loadAsync(file).then(function(zip) {
            let count = 0; const promises = [];
            zip.forEach(function (relativePath, zipEntry) {
                if (!zipEntry.dir && (zipEntry.name.endsWith('.css') || zipEntry.name.endsWith('.txt') || zipEntry.name.endsWith('.html') || zipEntry.name.endsWith('.js'))) {
                    const promise = zipEntry.async("string").then(function (content) { const fileName = zipEntry.name.split('/').pop(); const name = fileName.replace(/\.(css|txt|html|js)$/i, ''); themeConfig.presets[name] = content; count++; });
                    promises.push(promise);
                }
            });
            Promise.all(promises).then(() => { saveThemeConfig(); updatePresetDropdown(); showToast(`已导入 ${count} 个代码预设`); input.value = ''; });
        }).catch(function(err) { alert("ZIP 读取失败: " + err); input.value = ''; });
    } else {
        const reader = new FileReader();
        reader.onload = function(e) { document.getElementById('customCssInput').value = e.target.result; const potentialName = file.name.replace(/\.(css|txt|html|js)$/i, ''); if (!potentialName.startsWith('custom_style')) { document.getElementById('presetNameInput').value = potentialName; } showToast("代码已加载到编辑器"); input.value = ''; };
        reader.readAsText(file);
    }
}

function clearAllCssPresets() { if (Object.keys(themeConfig.presets).length === 0) return showToast("没有可清除的预设"); if (confirm("确定要清空所有已保存的代码预设吗？")) { themeConfig.presets = {}; saveThemeConfig(); updatePresetDropdown(); showToast("所有预设已清空"); } }
function setTheme(themeName) { document.body.style.transition = 'none'; const mode = themeConfig.darkMode ? 'night' : 'day'; themeConfig[mode].theme = themeName; document.querySelectorAll('.theme-option').forEach(el => el.classList.remove('active')); document.getElementById('theme-' + themeName).classList.add('active'); applyThemeSettings(); saveThemeConfig(); updateBgAdjustment(); setTimeout(() => { document.body.style.transition = ''; }, 50); }
function toggleDarkMode() { themeConfig.darkMode = document.getElementById('darkModeToggle').checked; applyThemeSettings(); saveThemeConfig(); updateSliderValuesFromConfig(); updateBgAdjustment(); updateBgPreviewUI(); }

function applyThemeSettings() { 
    document.body.style.transition = 'none';
    document.body.classList.remove('theme-minimal', 'theme-neumorphism', 'theme-glass', 'dark-mode'); 
    if (themeConfig.darkMode) { document.body.classList.add('dark-mode'); document.body.style.backgroundColor = '#121212'; } 
    else { document.body.style.backgroundColor = ''; }

    const mode = themeConfig.darkMode ? 'night' : 'day'; const settings = themeConfig[mode]; const currentTheme = settings.theme || 'minimal'; 
    if (currentTheme !== 'minimal') document.body.classList.add('theme-' + currentTheme); 
    
    const codeContent = themeConfig.customCss || ''; const styleTag = document.getElementById('custom-css-style'); const layerRoot = document.getElementById('custom-layer-root');
    if (codeContent !== lastAppliedCustomCode) {
        lastAppliedCustomCode = codeContent; styleTag.textContent = ''; layerRoot.innerHTML = '';
        if (codeContent.trim().startsWith('<')) {
            requestAnimationFrame(() => {
                layerRoot.innerHTML = codeContent;
                const scripts = layerRoot.querySelectorAll("script");
                scripts.forEach(oldScript => { const newScript = document.createElement("script"); Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value)); newScript.appendChild(document.createTextNode(oldScript.innerHTML)); if (oldScript.parentNode) { oldScript.parentNode.replaceChild(newScript, oldScript); } });
            });
        } else { styleTag.textContent = codeContent; }
    }

    const root = document.documentElement; 
    const textScale = themeConfig.systemTextSize ? 1 : (themeConfig.textScale || 1); const uiScale = themeConfig.systemTextSize ? 1 : (themeConfig.uiScale || 1);
    root.style.setProperty('--text-scale', textScale); root.style.setProperty('--ui-scale', uiScale);

    if (settings.bgType !== 'none' && settings.bgValue) { root.style.setProperty('--bg-image', `url("${settings.bgValue}")`); } else { root.style.setProperty('--bg-image', 'none'); } 
    root.style.setProperty('--bg-blur', settings.bgBlur + 'px'); root.style.setProperty('--bg-img-opacity', settings.bgOpacity); root.style.setProperty('--bg-overlay-alpha', settings.bgOverlay); 
    let r, g, b; if (themeConfig.darkMode) { r = 30; g = 30; b = 30; } else { r = 252; g = 252; b = 252; } 
    const transVal = parseFloat(settings.contentTransparency || 0); const mainAlpha = 1 - (transVal / 100); const maskVal = parseFloat(settings.contentMask || 0); const maskAlpha = maskVal / 100; 
    root.style.setProperty('--theme-base-rgb', `${r}, ${g}, ${b}`); root.style.setProperty('--theme-bg-alpha', mainAlpha); root.style.setProperty('--text-mask-alpha', maskAlpha); 
    if (currentTheme === 'glass') { if (transVal >= 100) { document.body.style.setProperty('--backdrop-filter', 'none'); } else { const dynamicBlur = 12 * (1 - (transVal / 100)); document.body.style.setProperty('--backdrop-filter', `blur(${dynamicBlur}px)`); } } else { document.body.style.removeProperty('--backdrop-filter', 'none'); } 
    if (transVal > 0) { const rgba = `rgba(${r}, ${g}, ${b}, ${mainAlpha})`; document.body.style.setProperty('--card-bg', rgba); document.body.style.setProperty('--root-cat-bg', rgba); document.body.style.setProperty('--root-header-bg', rgba); document.body.style.setProperty('--sub-cat-header-bg', rgba); document.body.style.setProperty('--input-bg', rgba); } else { document.body.style.removeProperty('--card-bg'); document.body.style.removeProperty('--root-cat-bg'); document.body.style.removeProperty('--root-header-bg'); document.body.style.removeProperty('--sub-cat-header-bg'); document.body.style.removeProperty('--input-bg'); } 
    syncNativeSystemBars(!!themeConfig.darkMode);
    
    setTimeout(() => { if (!document.body.classList.contains('is-dragging')) { document.body.style.transition = ''; } }, 50);
}

function saveThemeConfig() { try { localStorage.setItem('webManagerThemeConfig', JSON.stringify(themeConfig)); } catch (e) { if (e.name === 'QuotaExceededError') alert('主题保存失败：存储空间不足。请尽量使用图片链接(URL)代替本地上传。'); } }
function handleBgUpload(input) { if (input.files && input.files[0]) { const file = input.files[0]; const reader = new FileReader(); reader.onload = function(e) { openCropperModal(e.target.result); input.value = ''; }; reader.readAsDataURL(file); } }
function openCropperModal(imageSrc) { const image = document.getElementById('cropperImage'); image.src = imageSrc; document.getElementById('cropperModal').classList.add('active'); if (cropper) cropper.destroy(); cropper = new Cropper(image, { viewMode: 1, dragMode: 'move', autoCropArea: 1, restore: false, guides: true, center: true, highlight: false, cropBoxMovable: true, cropBoxResizable: true, toggleDragModeOnDblclick: false, aspectRatio: window.innerWidth / window.innerHeight, }); }
function confirmCrop() { if (!cropper) return; const canvas = cropper.getCroppedCanvas({ maxWidth: 1280, maxHeight: 1280, imageSmoothingQuality: 'medium' }); const base64 = canvas.toDataURL('image/jpeg', 0.5); const mode = themeConfig.darkMode ? 'night' : 'day'; themeConfig[mode].bgType = 'image'; themeConfig[mode].bgValue = base64; applyThemeSettings(); saveThemeConfig(); updateBgPreviewUI(); updateBgAdjustment(); closeModal('cropperModal'); }
function applyBgUrl() { const url = document.getElementById('bgUrlInput').value.trim(); if (url) { const mode = themeConfig.darkMode ? 'night' : 'day'; themeConfig[mode].bgType = 'url'; themeConfig[mode].bgValue = url; applyThemeSettings(); saveThemeConfig(); updateBgPreviewUI(); updateBgAdjustment(); } }
function clearBackground() { document.getElementById('clearBgOptionsModal').classList.add('active'); }

function performClearBg(type) { 
    if (type === 'image') { 
        const mode = themeConfig.darkMode ? 'night' : 'day'; themeConfig[mode].bgType = 'none'; themeConfig[mode].bgValue = ''; showToast(`已清空 ${themeConfig.darkMode ? '夜间' : '日间'} 模式背景图`, 1500); 
    } else if (type === 'all') { 
        if(confirm('确定要将主题恢复为默认设置吗？')) { 
            const keepPresets = !document.getElementById('clearPresetsCheckbox').checked; let existingPresets = {}; if (keepPresets) existingPresets = JSON.parse(JSON.stringify(themeConfig.presets));
            themeConfig = createDefaultThemeConfig(); themeConfig.presets = existingPresets; 
            document.getElementById('darkModeToggle').checked = false; document.getElementById('customCssInput').value = DEFAULT_CSS_TEMPLATE; updatePresetDropdown(); showToast("主题已初始化", 1500); 
        } else { return; } 
    } applyThemeSettings(); saveThemeConfig(); updateBgPreviewUI(); updateSliderValuesFromConfig(); updateBgAdjustment(); closeModal('clearBgOptionsModal'); 
}

// ================= 主页数据的选择性清理 =================
function clearAllData() {
    const list = document.getElementById('clearWorkspaceList');
    const selectAll = document.getElementById('clearSelectAllBox');
    list.innerHTML = '';
    if (selectAll) {
        selectAll.checked = false;
        selectAll.indeterminate = false;
    }

    if (appData.workspaces.length === 0) {
        list.innerHTML = '<div style="color:#999; text-align:center; padding:10px;">无数据</div>';
    } else {
        appData.workspaces.forEach(ws => {
            const div = document.createElement('div');
            div.className = 'checkbox-item';
            div.innerHTML = `<label><input type="checkbox" class="ws-clear-check" value="${ws.id}" onchange="updateClearSelectAllState()"> [${ws.group || '未分类'}] ${ws.name}</label>`;
            list.appendChild(div);
        });
    }
    document.getElementById('clearDataOptionsModal').classList.add('active');
}
function toggleSelectAllClear(checkbox) { document.querySelectorAll('.ws-clear-check').forEach(cb => cb.checked = checkbox.checked); }
function updateClearSelectAllState() {
    const selectAll = document.getElementById('clearSelectAllBox');
    if (!selectAll) return;

    const workspaceChecks = Array.from(document.querySelectorAll('.ws-clear-check'));
    const selectedCount = workspaceChecks.filter(checkbox => checkbox.checked).length;
    selectAll.checked = workspaceChecks.length > 0 && selectedCount === workspaceChecks.length;
    selectAll.indeterminate = selectedCount > 0 && selectedCount < workspaceChecks.length;
}
function performClearSelectedWorkspaces() { const checks = document.querySelectorAll('.ws-clear-check:checked'); if (checks.length === 0) { alert("请先勾选需要删除的主页"); return; } if (confirm(`确定要删除这 ${checks.length} 个主页吗？`)) { const idsToDelete = Array.from(checks).map(c => c.value); appData = removeWorkspacesByIds(appData, idsToDelete); updateDataPointer(); save(); renderTree(); renderWorkspaceList(); showToast("选定主页已删除"); closeModal('clearDataOptionsModal'); } }
function performClearData(type) { if (type === 'all') { if (confirm("确定要完全初始化系统吗？\n这将删除所有的资料、主页归属并重置所有主题参数。")) { resetSiteData(false); showToast("系统已完全重置", 1500); } } closeModal('clearDataOptionsModal'); }

function clearRuntimeCache() {
    closeModal('toolsModal');
    try { if (typeof window.Android?.clearAppCache === 'function') window.Android.clearAppCache(); } catch (e) {}
    showToast('已清除临时缓存，书签网页未改动', 1800);
}

function resetSiteData(keepTheme = false) {
    appData = resetAppData();
    data = appData.workspaces[0].data;
    save();
    if (!keepTheme) {
        themeConfig = createDefaultThemeConfig();
        saveThemeConfig();
        applyThemeSettings();
        const darkToggle = document.getElementById('darkModeToggle');
        if (darkToggle) darkToggle.checked = false;
        updateSliderValuesFromConfig();
        updateBgPreviewUI();
    }
    try { if (typeof window.Android?.clearBrowserSession === 'function') window.Android.clearBrowserSession(); } catch (e) {}
    renderTree();
    renderWorkspaceList();
}

function currentSiteDataClearTypesFromDom(source) {
    const root = source?.closest?.('.site-data-clear-types');
    if (!root) return readSiteDataClearTypes();
    const types = defaultSiteDataClearTypes();
    types.localStorage = false;
    types.indexedDB = false;
    types.cookie = false;
    root.querySelectorAll('.site-clear-type').forEach((cb) => {
        const key = cb.dataset.type;
        if (key) types[key] = !!cb.checked;
    });
    return normalizeSiteDataClearTypes(types);
}

function applySiteDataClearTypeChecks(types = readSiteDataClearTypes()) {
    const next = normalizeSiteDataClearTypes(types);
    document.querySelectorAll('.site-data-clear-types .site-clear-type').forEach((cb) => {
        const key = cb.dataset.type;
        if (key && Object.prototype.hasOwnProperty.call(next, key)) cb.checked = !!next[key];
    });
}

function onSiteDataClearTypeChange(checkbox) {
    applySiteDataClearTypeChecks(writeSiteDataClearTypes(currentSiteDataClearTypesFromDom(checkbox)));
}

function confirmClearSiteData() {
    const types = readSiteDataClearTypes();
    if (!hasSiteDataClearType(types)) return alert('请先勾选要清理的数据类型');
    const pages = collectPagesFromWorkspaces(appData.workspaces);
    if (!uniquePageUrls(pages).length) return alert('当前没有可清理的网页站点数据');
    const summary = siteDataClearTypeSummary(types);
    if (!confirm(`确定清空全部书签网页的 ${summary} 吗？\n书签会保留，只清打开网页本身带的数据。`)) return;
    if (!confirm('再次确认：此操作不可撤销。')) return;
    const cleared = clearSelectedPageSiteData(pages, types);
    closeModal('toolsModal');
    showToast(`已清理 ${cleared} 个网页的 ${summary}`, 1800);
}

function visibleSelectiveClearChecks() {
    return Array.from(document.querySelectorAll('.selective-clear-check')).filter((cb) => cb.closest('.selective-clear-row')?.style.display !== 'none');
}

function renderSelectiveClearList() {
    const list = document.getElementById('selectiveClearList');
    const selectAll = document.getElementById('selectiveClearSelectAll');
    if (!list) return;
    const query = document.getElementById('selectiveClearSearch')?.value || '';
    const tree = filterSelectiveClearTree(collectSelectiveClearTree(appData.workspaces, appData.workspaceGroups), query);
    list.innerHTML = '';
    if (!tree.length) {
        list.innerHTML = `<div style="color:#999; text-align:center; padding:10px;">${query.trim() ? '无匹配项' : '暂无可清理的数据'}</div>`;
        if (selectAll) {
            selectAll.checked = false;
            selectAll.indeterminate = false;
        }
        updateSelectiveClearSubmitLabel();
        return;
    }
    const walk = (nodes, parent) => {
        nodes.forEach((node) => {
            const row = document.createElement('div');
            row.className = `selective-clear-row selective-clear-${node.type}`;
            if (node.type === 'group' && !node.id) row.classList.add('is-uncat');
            const icon = node.type === 'group' || node.type === 'category' ? 'fa-folder' : (node.type === 'workspace' ? 'fa-house' : 'fa-file');
            row.innerHTML = `<label><input type="checkbox" class="selective-clear-check" data-type="${escapeHtml(node.type)}" data-ws-id="${escapeHtml(String(node.wsId))}" data-id="${escapeHtml(String(node.id))}" onchange="handleSelectiveClearCheckChange(this)"> <i class="fas ${icon}"></i> ${escapeHtml(node.name)}</label>`;
            parent.appendChild(row);
            if (node.children && node.children.length) {
                const nest = document.createElement('div');
                nest.className = 'selective-clear-children';
                row.appendChild(nest);
                walk(node.children, nest);
            }
        });
    };
    walk(tree, list);
    updateSelectiveClearSelectAllState();
}

function openSelectiveClearModal() {
    closeModal('toolsModal');
    const search = document.getElementById('selectiveClearSearch');
    if (search) search.value = '';
    applySiteDataClearTypeChecks();
    renderSelectiveClearList();
    document.getElementById('selectiveClearModal').classList.add('active');
}

function filterSelectiveClearList() {
    renderSelectiveClearList();
}

function selectedSelectiveClearItems() {
    return Array.from(document.querySelectorAll('.selective-clear-check:checked')).map((cb) => ({
        type: cb.dataset.type,
        wsId: cb.dataset.wsId,
        id: cb.dataset.id,
    }));
}

function selectedSelectiveClearPages() {
    return collectSelectiveClearPages(appData, selectedSelectiveClearItems());
}

function updateSelectiveClearSubmitLabel() {
    const btn = document.getElementById('selectiveClearSubmitBtn');
    if (!btn) return;
    const count = selectedSelectiveClearPages().length;
    btn.innerHTML = count > 0
        ? `<i class="fas fa-broom"></i> 清理选中（${count} 个网页）`
        : '<i class="fas fa-broom"></i> 清理选中';
}

function handleSelectiveClearCheckChange(checkbox) {
    onSelectiveClearCheckChange(checkbox);
    updateSelectiveClearSelectAllState();
}

function toggleSelectAllSelectiveClear(checkbox) {
    visibleSelectiveClearChecks().forEach((cb) => setSelectiveClearChecked(cb, checkbox.checked));
    updateSelectiveClearSelectAllState();
}

function updateSelectiveClearSelectAllState() {
    const selectAll = document.getElementById('selectiveClearSelectAll');
    if (!selectAll) return;
    const checks = visibleSelectiveClearChecks();
    const selectedCount = checks.filter((cb) => cb.checked).length;
    selectAll.checked = checks.length > 0 && selectedCount === checks.length;
    selectAll.indeterminate = selectedCount > 0 && selectedCount < checks.length;
    updateSelectiveClearSubmitLabel();
}

function uniquePageUrls(pages) {
    const urls = [];
    const seen = new Set();
    (Array.isArray(pages) ? pages : []).forEach((page) => {
        const list = Array.isArray(page?.urls) && page.urls.length
            ? page.urls
            : (page?.url ? [page.url] : []);
        list.forEach((raw) => {
            const url = String(raw || '').trim();
            if (!url || seen.has(url) || !/^https?:\/\//i.test(url)) return;
            seen.add(url);
            urls.push(url);
        });
    });
    return urls;
}

function clearSelectedPageSiteData(pages, types = readSiteDataClearTypes()) {
    const urls = uniquePageUrls(pages);
    const next = normalizeSiteDataClearTypes(types);
    if (!urls.length || !hasSiteDataClearType(next)) return 0;
    if (typeof window.Android?.clearPageSiteData !== 'function') return pages.length;
    try {
        window.Android.clearPageSiteData(JSON.stringify({ urls, types: next }));
    } catch (e) { /* 无原生桥时仍按勾选网页数提示 */ }
    return pages.length;
}

function performSelectiveClearPages() {
    const types = readSiteDataClearTypes();
    if (!hasSiteDataClearType(types)) return alert('请先勾选要清理的数据类型');
    const pages = selectedSelectiveClearPages();
    if (pages.length === 0) return alert('请先勾选需要清理本地数据的主页、分类或网页');
    if (!uniquePageUrls(pages).length) return alert('选中项没有可清理的网页站点数据');
    const summary = siteDataClearTypeSummary(types);
    if (!confirm(`确定清理选中的 ${pages.length} 个网页的 ${summary} 吗？\n书签会保留，清的是打开网页本身带的数据。`)) return;
    const cleared = clearSelectedPageSiteData(pages, types);
    closeModal('selectiveClearModal');
    showToast(`已清理 ${cleared} 个网页的 ${summary}`, 1800);
}

// ================= 树形视图渲染 =================
// 数据是唯一状态源；每次变更后从 data 重建 DOM，避免界面顺序与持久化结构脱节。
function renderTree(){const root=document.getElementById('tree-root');root.innerHTML='';if(!data){return;}const rootContainer=document.createElement('div');rootContainer.className='children-container';rootContainer.dataset.id='root';nodesForDisplay(data).forEach(node=>rootContainer.appendChild(createNodeEl(node,0)));root.appendChild(rootContainer);updateSelectedCount();initSortable();updateTotalCountDisplay();}
function updateTotalCountDisplay(){ const total = data ? countPages({children:data}) : 0; const floatDisplay = document.getElementById('totalFloatingCount'); if(floatDisplay) floatDisplay.innerText = `共 ${total} 个网页`; const btn = document.getElementById('countToggleBtn'); btn.innerHTML = `<i class="fas fa-hashtag"></i>`; }
function createNodeEl(node,level=0){
    if(node.type==='category'){
        const container=document.createElement('div');
        container.className='category-block';
        container.dataset.id=node.id;
        container.dataset.type='category';
        container.dataset.level=level;
        if(node.collapsed)container.classList.add('collapsed');
        
        const header=document.createElement('div');
        header.className='category-header';
        if(node.isPinned){ if(level===0)header.style.borderLeft="4px solid #ffc107"; else header.style.borderLeft="3px solid #ffc107"; }
        header.id='node-'+node.id;
        bindInteraction(header,node,'category');
        
        const toggle=document.createElement('span');
        toggle.className='toggle-icon';
        toggle.innerHTML='<i class="fas fa-chevron-down"></i>';
        toggle.style.width='24px'; toggle.style.textAlign='center'; toggle.style.transition='transform 0.2s'; toggle.style.color='var(--text-secondary)'; toggle.style.marginRight='5px';
        if(node.collapsed)toggle.style.transform='rotate(-90deg)';
        
        const checkbox=document.createElement('input');
        checkbox.type='checkbox'; checkbox.className='item-checkbox'; checkbox.dataset.id=node.id; checkbox.dataset.type='category';
        checkbox.onclick=(e)=>{e.stopPropagation();}; checkbox.onchange=updateSelectedCount;
        
        const nameSpan=document.createElement('span');
        nameSpan.style.flexGrow='1'; nameSpan.style.marginLeft='5px'; nameSpan.style.fontWeight='600';
        const nameText=document.createElement('span');
        nameText.className='cat-name-text';
        nameText.textContent=node.name;
        const countSpan=document.createElement('span');
        countSpan.className='cat-count';
        countSpan.textContent=`(${countPages(node)})`;
        nameSpan.append(nameText, countSpan);
        if(node.isPinned){
            const pin=document.createElement('i');
            pin.className='fas fa-thumbtack';
            pin.style.fontSize='calc(12px * var(--text-scale, 1))';
            pin.style.color='#ffc107';
            nameSpan.append(' ', pin);
        }
        
        const actions=document.createElement('div');
        actions.className='cat-actions'; actions.style.marginLeft='auto'; actions.style.gap='8px';
        
        const addPageBtn=document.createElement('div');
        addPageBtn.className='cat-btn'; addPageBtn.innerHTML='<i class="fas fa-file-circle-plus"></i>';
        addPageBtn.onclick=(e)=>{e.stopPropagation();openAddModal('page',node.id,'inside');};
        
        const addCatBtn=document.createElement('div');
        addCatBtn.className='cat-btn'; addCatBtn.innerHTML='<i class="fas fa-folder-plus"></i>';
        addCatBtn.onclick=(e)=>{e.stopPropagation();openAddModal('category',node.id,'inside');};

        actions.append(addCatBtn,addPageBtn);
        if (isNativeApp()) {
            const openBtn=document.createElement('div');
            openBtn.className='cat-btn native-open-btn';
            openBtn.innerHTML='<i class="fas fa-up-right-from-square"></i>';
            openBtn.title='打开该分类所有网页';
            openBtn.onclick=(e)=>{e.stopPropagation();openCategoryPages(node.id);};
            actions.append(openBtn);
        }
        header.append(toggle,checkbox,nameSpan,actions); container.appendChild(header);
        
        const childrenCont=document.createElement('div');
        childrenCont.className='children-container'; childrenCont.dataset.id=node.id;
        if(node.collapsed)childrenCont.style.display='none';
        
        const displayChildren=nodesForDisplay(node.children||[]);
        const subCats=displayChildren.filter(c=>c.type==='category');
        const pages=displayChildren.filter(c=>c.type==='page');
        subCats.forEach(c=>childrenCont.appendChild(createNodeEl(c,level+1)));
        
        if(pages.length>0||subCats.length===0){
            const pinnedPages=pages.filter(p=>p.isPinned);
            const unpinnedPages=pages.filter(p=>!p.isPinned);
            const appendPageGrid=(zonePages, pinZone)=>{
                const pageGrid=document.createElement('div');
                pageGrid.className='pages-container';
                pageGrid.dataset.parentId=node.id;
                pageGrid.dataset.pinZone=pinZone;
                zonePages.forEach(p=>pageGrid.appendChild(createNodeEl(p,level+1)));
                childrenCont.appendChild(pageGrid);
            };
            if (pinnedPages.length>0 || isSortingMode) appendPageGrid(pinnedPages, 'pinned');
            if (unpinnedPages.length>0 || pinnedPages.length===0 || isSortingMode) appendPageGrid(unpinnedPages, 'unpinned');
        }
        container.appendChild(childrenCont);
        return container;
    } else { 
        const card=document.createElement('div'); 
        card.className='page-card'; card.dataset.id=node.id; card.dataset.type='page'; card.id='node-'+node.id; 
        if(node.isPinned && !(isIconMode && !hideIcons)) card.style.backgroundColor="var(--highlight-color, #fffbf0)"; 
        
        const urls = normalizeUrls(node); 
        const mainUrl = urls.length > 0 ? urls[0].url : ''; 
        bindInteraction(card, node, 'page', mainUrl); 
        
        const header=document.createElement('div'); 
        header.className = 'page-card-header'; 
        
        const checkbox=document.createElement('input'); 
        checkbox.type='checkbox'; checkbox.className='item-checkbox'; checkbox.dataset.id=node.id; checkbox.dataset.type='page'; 
        checkbox.onclick=(e)=>e.stopPropagation(); checkbox.onchange=updateSelectedCount; 

        if (isIconMode && !hideIcons) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = getIconHtml(node);
            header.appendChild(tempDiv.firstChild);
        }
        
        const nameDiv=document.createElement('div'); 
        nameDiv.className='page-name'; 
        if (urls.length > 0) {
            const isLocal = mainUrl.toLowerCase().startsWith('file://') || /^[a-zA-Z]:[\\/]/.test(mainUrl);
            const typeBadge = document.createElement('span');
            typeBadge.className = isLocal ? 'url-type-badge badge-local' : 'url-type-badge badge-web';
            typeBadge.textContent = isLocal ? '本地' : '网络';
            nameDiv.appendChild(typeBadge);
        }
        const pageNameText=document.createElement('span');
        pageNameText.className='page-name-text';
        pageNameText.textContent=node.name;
        nameDiv.appendChild(pageNameText);
        if(node.isPinned){
            const pin=document.createElement('i');
            pin.className='fas fa-thumbtack';
            pin.style.fontSize='calc(10px * var(--text-scale, 1))';
            pin.style.color='#ffc107';
            nameDiv.append(' ', pin);
        }
        if(urls.length > 1){
            const multiBadge=document.createElement('span');
            multiBadge.className='multi-url-badge';
            multiBadge.textContent=String(urls.length);
            nameDiv.append(' ', multiBadge);
        }
        header.append(checkbox, nameDiv); 
        
        if (urls.length > 1) { 
            const expandBtn = document.createElement('i'); expandBtn.className = 'fas fa-chevron-down expand-urls-btn'; 
            expandBtn.onclick = (e) => { e.stopPropagation(); e.preventDefault(); expandBtn.classList.toggle('expanded'); const subContainer = card.querySelector('.sub-links-container'); if (subContainer) { subContainer.style.display = subContainer.style.display === 'block' ? 'none' : 'block'; } }; card.appendChild(expandBtn); 
        } 
        
        if(node.note){ const noteDiv=document.createElement('div'); noteDiv.className='page-note'; noteDiv.innerText=node.note; card.appendChild(noteDiv); } 
        const urlDiv=document.createElement('div'); urlDiv.className='page-url'; urlDiv.innerText=mainUrl; urlDiv.title=mainUrl; 
        card.insertBefore(header,card.firstChild); card.appendChild(urlDiv); 
        
        if(urls.length > 1) { 
            const subContainer = document.createElement('div'); subContainer.className = 'sub-links-container'; 
            urls.forEach((u, idx) => { 
                const item = document.createElement('div'); item.className = 'sub-link-item'; 
                let iconClass = 'fas fa-link'; if (idx === 0) iconClass = 'fas fa-star'; 
                let displayName = u.name || `链接 ${idx + 1}`; if (idx === 0 && !u.name) displayName = "主链接"; 
                const isLocal = u.url.toLowerCase().startsWith('file://') || /^[a-zA-Z]:[\\/]/.test(u.url);
                const subIcon = document.createElement('i');
                subIcon.className = `${iconClass} sub-link-icon`;
                const typeBadge = document.createElement('span');
                typeBadge.className = isLocal ? 'url-type-badge badge-local' : 'url-type-badge badge-web';
                typeBadge.style.marginRight = '6px';
                typeBadge.textContent = isLocal ? '本地' : '网络';
                const nameEl = document.createElement('div');
                nameEl.style.cssText = 'flex-grow:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
                nameEl.textContent = displayName;
                item.append(subIcon, document.createTextNode(' '), typeBadge, document.createTextNode(' '), nameEl); 
                item.title = u.url; 
                item.onclick = (e) => { e.stopPropagation(); e.preventDefault(); handleUrlOpen(u.url, isOpenCurrentTab); }; 
                subContainer.appendChild(item); 
            }); card.appendChild(subContainer); 
        } return card; 
    }
}

function toggleExpandAll(){isAllExpanded=!isAllExpanded;const btn=document.getElementById('expandToggleBtn');if(isAllExpanded){btn.innerHTML='<i class="fas fa-compress-arrows-alt"></i> <span>全部折叠</span>';}else{btn.innerHTML='<i class="fas fa-expand-arrows-alt"></i> <span>全部展开</span>';}function setCollapse(nodes,collapsed){nodes.forEach(n=>{if(n.type==='category'){n.collapsed=collapsed;if(n.children)setCollapse(n.children,collapsed);}});}setCollapse(data,!isAllExpanded);save();renderTree();}
function toggleSortMode() { isSortingMode = !isSortingMode; const btn = document.getElementById('sortModeBtn'); if (isSortingMode) { btn.classList.add('active'); showToast("已开启拖拽排序"); } else { btn.classList.remove('active'); showToast("拖拽排序已关闭"); } renderTree(); }

function openColModeMenu(btn) {
    const menu = document.getElementById('colModeMenu');
    if(menu.style.display === 'block') { menu.style.display = 'none'; return; }

    const rect = btn.getBoundingClientRect();
    const menuWidth = 80; 
    let leftPos = rect.left + (rect.width / 2) - (menuWidth / 2);
    
    if (leftPos < 10) leftPos = 10;
    if (leftPos + menuWidth > window.innerWidth - 10) leftPos = window.innerWidth - menuWidth - 10;

    menu.style.left = leftPos + 'px';
    menu.style.top = (rect.bottom + 5) + 'px';
    menu.style.display = 'block'; 
    menu.style.zIndex = '3000';
    
    const closeMenu = (e) => {
        if (!menu.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
            menu.style.display = 'none'; document.removeEventListener('click', closeMenu);
        }
    }; setTimeout(() => document.addEventListener('click', closeMenu), 0);
}

function toggleNoteDisplay(btn){isNoteVisible=!isNoteVisible;if(isNoteVisible){document.body.classList.remove('hide-notes');btn.classList.add('active');}else{document.body.classList.add('hide-notes');btn.classList.remove('active');} localStorage.setItem('noteVisible',isNoteVisible);}
function toggleOpenTarget(btn){ isOpenCurrentTab=!isOpenCurrentTab; if(isOpenCurrentTab){ btn.classList.add('active'); showToast("已开启：当前页打开"); }else{ btn.classList.remove('active'); showToast("已恢复：新标签页打开 (默认)"); } localStorage.setItem('isOpenCurrentTab',isOpenCurrentTab); }
function toggleAutoRefresh(btn) { isAutoRefresh = !isAutoRefresh; if (isAutoRefresh) { btn.classList.add('active'); showToast("已开启：本地路径自动刷新防白屏"); } else { btn.classList.remove('active'); showToast("已关闭：本地路径自动刷新"); } localStorage.setItem('autoRefreshVisible', isAutoRefresh); }
function toggleCountDisplay(btn){isCountVisible=!isCountVisible;if(isCountVisible){document.body.classList.add('show-counts');btn.classList.add('active');}else{document.body.classList.remove('show-counts');btn.classList.remove('active');}updateTotalCountDisplay();localStorage.setItem('countVisible',isCountVisible);}
function toggleUrlDisplay(btn){isUrlVisible=!isUrlVisible;if(isUrlVisible){document.body.classList.remove('hide-urls');btn.classList.add('active');}else{document.body.classList.add('hide-urls');btn.classList.remove('active');} }
function handleSearchFocus() { document.body.classList.add('search-focus'); const val = document.getElementById('searchInput').value; handleSearchInput(val); }
function handleSearchBlur() { setTimeout(() => { document.body.classList.remove('search-focus'); }, 200); }
function handleSearchKeydown(e) { if (e.key === 'Enter') { e.preventDefault(); rememberCurrentSearch(e.target.value); } }
function clearSearch() { const input = document.getElementById('searchInput'); input.value = ''; input.focus(); handleSearchInput(''); }
function jumpToNode(id, wsId){ rememberCurrentSearch(document.getElementById('searchInput')?.value); if (wsId && wsId !== appData.currentId) { switchWorkspace(wsId); } document.body.classList.remove('search-mode'); document.body.classList.remove('search-focus'); document.getElementById('searchResults').innerHTML = ''; document.getElementById('searchInput').value = ''; document.getElementById('searchClearBtn').style.display='none'; let parent=findParent(id); while(parent){parent.collapsed=false;parent=findParent(parent.id);} save(); renderTree(); setTimeout(()=>{ const el=document.getElementById('node-'+id); if(el){ el.scrollIntoView({behavior:"smooth", block:"center"}); el.classList.add('highlight-node'); setTimeout(()=>{ el.classList.remove('highlight-node'); }, 2000); } },100); }

function initSortable(){ 
    sortableInstances.forEach(instance => { try { instance.destroy(); } catch (e) { /* 旧实例已随 DOM 移除 */ } });
    sortableInstances = []; 
    const makeOps = (pinZone) => ({
        animation:150, delay:300, delayOnTouchOnly:true, ghostClass:'sortable-ghost', dragClass:'sortable-drag', disabled: !isSortingMode,
        scroll: true, scrollSensitivity: 80, scrollSpeed: 15, bubbleScroll: true,
        group: pinZone === 'pinned' ? 'pinned-pages' : 'unpinned-pages',
        onStart:function(){ document.body.classList.add('is-dragging'); if(longPressTimer)clearTimeout(longPressTimer); }, 
        onEnd:function(evt){ syncPageSortFromDom(evt); document.body.classList.remove('is-dragging'); } 
    });
    document.querySelectorAll('.pages-container').forEach(el=>{
        const pinZone = el.dataset.pinZone === 'pinned' ? 'pinned' : 'unpinned';
        sortableInstances.push(new Sortable(el, makeOps(pinZone)));
    });
}

function syncPageSortFromDom(evt){
    const toEl = evt?.to;
    if (!toEl || !toEl.classList.contains('pages-container')) { renderTree(); return; }
    const parentId = toEl.dataset.parentId;
    const parent = parentId ? findNode(parentId) : null;
    const destList = parent ? parent.children : data;
    if (!Array.isArray(destList)) { renderTree(); return; }
    const wantPinned = toEl.dataset.pinZone === 'pinned';
    const visibleIds = Array.from(toEl.querySelectorAll('.page-card')).map(card => String(card.dataset.id));
    const dragId = evt.item && evt.item.dataset.id;
    const dragNode = dragId ? findNode(dragId) : null;
    if (dragNode && !!dragNode.isPinned !== wantPinned) { renderTree(); return; }
    const fromEl = evt.from;
    if (fromEl === toEl) {
        reorderWithinPinZone(destList, visibleIds);
    } else if (dragNode) {
        deleteNode(dragId);
        insertByOrderedPeers(destList, dragNode, visibleIds);
    }
    save();
    renderTree();
}

function collectSelfAndDescendantIds(id){
    return collectSelfAndDescendantIdsInTree(id, data);
}

function getExcludedCategoryIds(inputId){
    const ids = new Set();
    if(inputId === 'delMoveTargetId' && window.deletingCategoryId){
        collectSelfAndDescendantIds(window.deletingCategoryId).forEach(id => ids.add(id));
    }
    if(inputId === 'selectedMoveTargetId' && window.singleMoveId){
        const node = findNode(window.singleMoveId);
        if(node && node.type === 'category') collectSelfAndDescendantIds(window.singleMoveId).forEach(id => ids.add(id));
    }
    if(inputId === 'batchDelMoveTargetId' && window.batchNonEmptyCats){
        window.batchNonEmptyCats.forEach(cat => collectSelfAndDescendantIds(cat.id).forEach(id => ids.add(id)));
    }
    return ids;
}

function isExcludedMoveTarget(wsId, catId, inputId){
    if(!catId) return false;
    if(wsId && wsId !== appData.currentId) return false;
    return getExcludedCategoryIds(inputId).has(String(catId));
}

function handleCategorySearch(val,dropdownId,hiddenInputId,displayInputId){
    document.getElementById(hiddenInputId).value=''; const list=document.getElementById(dropdownId); list.innerHTML='';
    const clearBtn = document.querySelector(`i[onclick*="${hiddenInputId}"]`);
    if(!val.trim()){ list.style.display='none'; if(clearBtn) clearBtn.style.display='none'; return; }
    if(clearBtn) clearBtn.style.display='block';
    const matches=[];
    const keyword = val.toLowerCase();

    function findCats(nodes, wsName, wsId, pathPrefix = "") {
        nodes.forEach(n => {
            if(n.type === 'category') {
                const excluded = isExcludedMoveTarget(wsId, n.id, hiddenInputId);
                if(!excluded){
                    const fullName = `[${wsName}] ${pathPrefix}${n.name}`;
                    if(n.name.toLowerCase().includes(keyword) || wsName.toLowerCase().includes(keyword)) { matches.push({ id: n.id, name: fullName, wsId: wsId }); }
                    if(n.children) findCats(n.children, wsName, wsId, pathPrefix + n.name + " > ");
                }
            }
        });
    }

    appData.workspaces.forEach(ws => { const wsDispName = ws.group ? `${ws.group}/${ws.name}` : ws.name; if (wsDispName.toLowerCase().includes(keyword) || '根目录'.includes(keyword) || 'root'.includes(keyword)) { matches.unshift({ id: '', name: `[${wsDispName}] 根目录`, wsId: ws.id }); } findCats(ws.data, wsDispName, ws.id); });

    if(matches.length > 0){
        matches.forEach(m => {
            const item=document.createElement('div'); item.className='dropdown-item'; item.style.padding='8px 10px'; item.style.cursor='pointer'; item.style.fontSize='calc(13px * var(--text-scale, 1))';
            const folderIcon=document.createElement('i'); folderIcon.className='fas fa-folder'; folderIcon.style.cssText='color:#ffd43b;margin-right:5px;';
            item.append(folderIcon, document.createTextNode(' ' + m.name));
            item.onclick=()=>{ document.getElementById(hiddenInputId).value = `${m.wsId}|${m.id}`; document.getElementById(displayInputId).value = m.name; list.style.display='none'; }; list.appendChild(item);
        }); list.style.display='block';
    } else { list.style.display='none'; }
}

function clearCategoryInput(displayInputId,hiddenInputId,dropdownId){document.getElementById(displayInputId).value='';document.getElementById(hiddenInputId).value='';document.getElementById(dropdownId).style.display='none';document.querySelector(`i[onclick*="${hiddenInputId}"]`).style.display='none';}

function openTreeSelectModal(targetInputId, displayInputId){
    const container=document.getElementById('treeSelectContent'); container.innerHTML='';
    appData.workspaces.forEach(ws => {
        const isCurrent = ws.id === appData.currentId; const wsDispName = ws.group ? `${ws.group}/${ws.name}` : ws.name;
        const wsHeader = document.createElement('div'); wsHeader.className = 'tree-ws-header'; wsHeader.innerText = wsDispName + (isCurrent ? ' (当前)' : ''); container.appendChild(wsHeader);

        const rootDiv=document.createElement('div'); rootDiv.className='tree-select-item'; rootDiv.style.padding='8px'; rootDiv.style.cursor='pointer'; rootDiv.style.borderRadius='4px'; rootDiv.style.marginBottom='2px'; rootDiv.style.display='flex'; rootDiv.style.alignItems='center'; rootDiv.innerHTML=`<i class="fas fa-home" style="margin-right:8px;"></i> 根目录`;
        rootDiv.onclick=()=>{ document.getElementById(targetInputId).value = `${ws.id}|`; document.getElementById(displayInputId).value = `[${wsDispName}] 根目录`; closeModal('treeSelectModal'); };
        container.appendChild(rootDiv);

        function buildTreeHtml(nodes, level) {
            nodes.forEach(node => {
                if (node.type === 'category') {
                    if (isExcludedMoveTarget(ws.id, node.id, targetInputId)) return;

                    const div=document.createElement('div'); div.className='tree-select-item'; div.style.padding='8px'; div.style.cursor='pointer'; div.style.borderRadius='4px'; div.style.marginBottom='2px'; div.style.display='flex'; div.style.alignItems='center'; div.style.paddingLeft=(level*20+10)+'px';
                    const folderIcon=document.createElement('i'); folderIcon.className='fas fa-folder'; folderIcon.style.cssText='margin-right:8px;color:#ffd43b;';
                    div.append(folderIcon, document.createTextNode(' ' + node.name));
                    div.onclick=()=>{ document.getElementById(targetInputId).value = `${ws.id}|${node.id}`; document.getElementById(displayInputId).value = `[${wsDispName}] ${node.name}`; closeModal('treeSelectModal'); };
                    container.appendChild(div); if(node.children) buildTreeHtml(node.children, level+1);
                }
            });
        }
        buildTreeHtml(ws.data, 0);
    });
    document.getElementById('treeSelectModal').classList.add('active');
}

function toggleExportList() {
    const list = document.getElementById('exportWorkspaceList'); const btn = document.getElementById('toggleExportListBtn');
    if (list.style.display === 'none') { list.style.display = 'block'; btn.innerHTML = '<i class="fas fa-chevron-up"></i> 折叠'; } else { list.style.display = 'none'; btn.innerHTML = '<i class="fas fa-chevron-down"></i> 展开'; }
}

function openImportExportModal(){ 
    isExportBatchMode = false; exportSelectedId = appData.currentId; 
    const btn = document.getElementById('exportBatchToggleBtn'); const selectAllContainer = document.getElementById('exportSelectAllContainer'); 
    btn.classList.remove('active'); btn.innerText = "多选模式"; selectAllContainer.style.display = 'none'; 
    
    const list = document.getElementById('exportWorkspaceList'); const toggleBtn = document.getElementById('toggleExportListBtn');
    list.style.display = 'none'; toggleBtn.innerHTML = '<i class="fas fa-chevron-down"></i> 展开';

    renderExportList(); updateExportPreview(); 
    document.getElementById('ioText').value=''; document.getElementById('ioModal').classList.add('active'); 
}

function toggleExportBatchMode() { 
    isExportBatchMode = !isExportBatchMode; 
    const btn = document.getElementById('exportBatchToggleBtn'); const selectAllContainer = document.getElementById('exportSelectAllContainer'); const list = document.getElementById('exportWorkspaceList'); const toggleBtn = document.getElementById('toggleExportListBtn');

    if (isExportBatchMode) { 
        btn.classList.add('active'); btn.innerText = "退出多选"; selectAllContainer.style.display = 'flex'; list.style.display = 'block'; toggleBtn.innerHTML = '<i class="fas fa-chevron-up"></i> 折叠';
    } else { 
        btn.classList.remove('active'); btn.innerText = "多选模式"; selectAllContainer.style.display = 'none'; 
        if (!appData.workspaces.find(w => w.id === exportSelectedId)) { exportSelectedId = appData.currentId; } 
    } 
    renderExportList(); updateExportPreview(); 
}

function toggleExportSelectAll(cb) { if (!isExportBatchMode) return; document.querySelectorAll('.export-checkbox').forEach(box => { box.checked = cb.checked; }); updateExportPreview(); }

function renderExportList() { 
    const list = document.getElementById('exportWorkspaceList'); list.innerHTML = ''; 
    const grouped = {}; appData.workspaceGroups.forEach(g => grouped[g] = []); grouped[''] = [];
    appData.workspaces.forEach(ws => { let g = ws.group || ''; if(!grouped[g]) grouped[g] = []; grouped[g].push(ws); });

    const addItems = (g, items, isUncat) => {
        if(isUncat && items.length === 0) return;
        const gName = isUncat ? '未分类' : g;
        const head = document.createElement('div'); head.style.padding = '8px 10px'; head.style.fontWeight = 'bold'; head.style.backgroundColor = 'var(--bg-color)'; head.style.fontSize = 'calc(13px * var(--text-scale, 1))'; head.innerText = gName; list.appendChild(head);

        items.forEach(ws => {
            const div = document.createElement('div'); div.className = 'export-item'; 
            if (isExportBatchMode) { 
                const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.className = 'export-checkbox'; checkbox.value = ws.id; 
                if (ws.id === appData.currentId) checkbox.checked = true; checkbox.onchange = () => updateExportPreview(); checkbox.onclick = (e) => e.stopPropagation(); 
                div.appendChild(checkbox); const span = document.createElement('span'); span.innerText = ws.name; div.appendChild(span); div.onclick = () => { checkbox.checked = !checkbox.checked; updateExportPreview(); }; 
            } else { 
                if (ws.id === exportSelectedId) div.classList.add('active'); div.innerText = ws.name; div.onclick = () => { exportSelectedId = ws.id; renderExportList(); updateExportPreview(); }; 
            } 
            list.appendChild(div);
        });
    };
    appData.workspaceGroups.forEach(g => addItems(g, grouped[g], false)); addItems('', grouped[''], true);
}

function generateTextExport(nodes,level=0){ let str=""; const indent="    ".repeat(level); nodes.forEach(node=>{ const safeName=node.name.replace(/\n/g,'\\n'); if(node.type==='category'){ str+=`${indent}📂 ${safeName}\n`; if(node.children&&node.children.length>0){ str+=generateTextExport(node.children,level+1); } }else{ str+=`${indent}📄 ${safeName}\n`; const urls = normalizeUrls(node); urls.forEach(u => { str+=`${indent}🔗 ${u.url} ${u.name ? '('+u.name+')' : ''}\n`; }); if(node.note){ const safeNote=node.note.replace(/\n/g,'\\n'); str+=`${indent}🗒️ ${safeNote}\n`; } } }); return str; }
function generatePathExport(nodes,pathPrefix=""){ let result=""; let currentPath=pathPrefix; const pages=nodes.filter(n=>n.type==='page'); if(pages.length>0&&currentPath){ result+=currentPath+"\n"; pages.forEach(p=>{ const safeName=p.name.replace(/\n/g,'\\n'); result+=safeName+"\n"; const urls = normalizeUrls(p); urls.forEach(u => { result += u.url + (u.name ? ` | ${u.name}` : '') + "\n"; }); if(p.note){result+="🗒️ "+p.note.replace(/\n/g,'\\n')+"\n";} }); result+="\n"; } const cats=nodes.filter(n=>n.type==='category'); cats.forEach(c=>{ const safeName=c.name.replace(/\n/g,'\\n'); const newPath=currentPath?(currentPath+" > "+safeName):safeName; result+=generatePathExport(c.children,newPath); }); return result; }

function updateExportPreview(){ const format=document.querySelector('input[name="exportFormat"]:checked').value; let fullText = ""; if (isExportBatchMode) { const checks = document.querySelectorAll('.export-checkbox:checked'); checks.forEach(c => { const ws = appData.workspaces.find(w => w.id === c.value); if(ws) { const wsDispName = ws.group ? `${ws.group}/${ws.name}` : ws.name; fullText += `=== 主页: ${wsDispName} ===\n`; fullText += (format === 'tree' ? generateTextExport(ws.data) : generatePathExport(ws.data)); fullText += "\n"; } }); } else { const ws = appData.workspaces.find(w => w.id === exportSelectedId); if (ws) { const wsDispName = ws.group ? `${ws.group}/${ws.name}` : ws.name; fullText = `=== 主页: ${wsDispName} ===\n`; fullText += (format === 'tree' ? generateTextExport(ws.data) : generatePathExport(ws.data)); fullText += "\n"; } } document.getElementById('exportTextArea').value = fullText; }
async function copyExportText(){
    const text = document.getElementById('exportTextArea').value;
    if (!text) return showToast("内容为空", 1000);
    const ok = await copyTextToClipboard(text);
    showToast(ok ? "已复制" : "复制失败", 1000);
}

function exportJsonFile(isAll = false){ 
    let ids = []; 
    if (isAll) { ids = appData.workspaces.map(w => w.id); } 
    else if (isExportBatchMode) { const checks = document.querySelectorAll('.export-checkbox:checked'); ids = Array.from(checks).map(c=>c.value); } 
    else { if (exportSelectedId) ids = [exportSelectedId]; } 
    
    if (ids.length === 0) return alert("请至少选择一个主页进行导出"); 
    let workspacesToExport = ids.map(id => appData.workspaces.find(w => w.id === id)).filter(Boolean);
    const treeJson = (nodes) => JSON.stringify(hideIcons ? stripIconFieldsFromTree(nodes) : nodes, null, 2);
    
    if (ids.length === 1) { 
        const ws = workspacesToExport[0]; const wsCount = countTotalPages(ws.data); const wsDispName = ws.group ? `${ws.group}_${ws.name}`.replace(/\//g, '_') : ws.name;
        const content = treeJson(ws.data); const blob = new Blob([content], {type: "application/json"}); downloadBlob(blob, `${wsDispName} (${wsCount}).json`); 
    } else { 
        const zip = new JSZip(); let groupOrder = appData.workspaceGroups || []; let existingGroupsInExport = [...new Set(workspacesToExport.map(w => w.group || ''))];
        existingGroupsInExport.sort((a,b) => { if (a === '') return -1; if (b === '') return 1; const idxA = groupOrder.indexOf(a); const idxB = groupOrder.indexOf(b); if (idxA!==-1 && idxB!==-1) return idxA - idxB; if (idxA!==-1) return -1; if (idxB!==-1) return 1; return a.localeCompare(b); });
        let groupFolderMap = {}; existingGroupsInExport.forEach((grp, idx) => { if (grp === '') groupFolderMap[grp] = '000_未分类'; else { const paddedGroupIdx = String(idx + 1).padStart(3, '0'); groupFolderMap[grp] = `${paddedGroupIdx}_${grp.replace(/\//g, '_')}`; } });
        workspacesToExport.sort((a, b) => { const indexA = appData.workspaces.findIndex(w => w.id === a.id); const indexB = appData.workspaces.findIndex(w => w.id === b.id); return indexA - indexB; });
        let wsIndexMap = {}; let totalOverallCount = 0; 
        workspacesToExport.forEach(ws => {
            const g = ws.group || ''; if (wsIndexMap[g] === undefined) wsIndexMap[g] = 0; const wsCount = countTotalPages(ws.data); totalOverallCount += wsCount; 
            const wsDispName = ws.name.replace(/\//g, '_'); const content = treeJson(ws.data); const paddedIndex = String(wsIndexMap[g]).padStart(3, '0'); const folderName = groupFolderMap[g];
            zip.folder(folderName).file(`${paddedIndex}_${wsDispName} (${wsCount}).json`, content); wsIndexMap[g]++;
        }); 
        zip.generateAsync({type:"blob"}).then(function(content) { downloadBlob(content, `workspaces_backup_trees (${totalOverallCount}页).zip`); }); 
    } 
}


async function copyInput(id,btn){
    const el=document.getElementById(id);
    if(!el||!el.value) return;
    const ok = await copyTextToClipboard(el.value);
    if(ok){
        const icon=btn.querySelector('i');
        if(!icon) return;
        const originalClass=icon.className;
        icon.className='fas fa-check';
        setTimeout(()=>icon.className=originalClass,1000);
        return;
    }
    showToast('复制失败', 1000);
}
function clearInput(id){document.getElementById(id).value='';document.getElementById(id).focus();}


function checkDuplicates(){
    closeModal('toolsModal'); let allPages = [];
    appData.workspaces.forEach(ws => { const wsPages = getAllPages(ws.data); const wsDispName = ws.group ? `${ws.group}/${ws.name}` : ws.name; wsPages.forEach(p => p.fullPath = `[${wsDispName}] ${p.path}`); allPages = allPages.concat(wsPages); });

    const urlMap={};
    allPages.forEach(p=>{ const urls=normalizeUrls(p); urls.forEach(u=>{ if(!u.url)return; const link=u.url.trim().replace(/\/$/,'').toLowerCase(); if(!urlMap[link])urlMap[link]=[]; urlMap[link].push({ page: p, subMatch: u }); }); });

    const duplicates=Object.keys(urlMap).filter(u=>urlMap[u].length>1); const listEl=document.getElementById('reportList'); listEl.innerHTML='';
    document.getElementById('copyReportBtn').style.display = 'none';
    
    if(duplicates.length===0){ document.getElementById('reportSummary').innerHTML='<span style="color:#28a745"><i class="fas fa-check-circle"></i> 未发现重复网页</span>'; } 
    else {
        document.getElementById('reportSummary').innerHTML=`<span style="color:#dc3545"><i class="fas fa-exclamation-triangle"></i> 发现 ${duplicates.length} 组重复网址</span>`;
        duplicates.forEach(u=>{
            const items=urlMap[u]; const li=document.createElement('li'); li.className='report-item'; let locHtml='';
            items.forEach(item=>{ const subNameStr = item.subMatch.name ? ` <span style="color:#999; font-size:12px;">(${item.subMatch.name})</span>` : ''; locHtml+=`<div class="report-loc"><i class="fas fa-folder-open"></i> ${item.page.fullPath} / <strong>${item.page.name}</strong>${subNameStr}</div>`; });
            li.innerHTML=`<div class="report-url">${u}</div>${locHtml}`; listEl.appendChild(li);
        });
    }
    document.getElementById('reportTitle').innerText='重复网页检测 (全站)'; document.getElementById('reportModal').classList.add('active');
}

async function checkLinks(){
    closeModal('toolsModal'); let pages = [];
    appData.workspaces.forEach(ws => { const wsPages = getAllPages(ws.data); const wsDispName = ws.group ? `${ws.group}/${ws.name}` : ws.name; wsPages.forEach(p => p.path = `[${wsDispName}] ${p.path || '根目录'}`); pages = pages.concat(wsPages); });

    const listEl=document.getElementById('reportList'); listEl.innerHTML=''; document.getElementById('reportTitle').innerText='链接有效性检测 (全站)';
    document.getElementById('copyReportBtn').style.display = 'none';
    
    const pauseBtn = document.getElementById('pauseReportBtn');
    if(pauseBtn) { pauseBtn.style.display = 'inline-block'; pauseBtn.className = 'fas fa-pause'; pauseBtn.style.color = ''; }
    
    window.currentReportData = [];
    window.isCheckPaused = false;
    window.isCheckAborted = false;
    window.currentCheckProgress = '';
    
    let errorCount=0, checkedCount=0;
    const validPages = pages.filter(p=>{const urls=normalizeUrls(p);return urls.some(u=>u.url&&!u.url.startsWith('file://')&&!/^[a-zA-Z]:[\\/]/.test(u.url));});
    const total = validPages.length;
    
    document.getElementById('reportSummary').innerHTML=`<i class="fas fa-spinner fa-spin"></i> 正在检测中 (0/${total})...`; document.getElementById('reportModal').classList.add('active');
    
    const groupElements = {};

    for(let i=0; i<validPages.length; i++) {
        if (window.isCheckAborted) break;
        
        while(window.isCheckPaused && !window.isCheckAborted) { await new Promise(r => setTimeout(r, 300)); }
        if (window.isCheckAborted) break;

        const page = validPages[i]; const urls=normalizeUrls(page);
        for(const u of urls){
            if(!u.url||u.url.startsWith('file://')||/^[a-zA-Z]:[\\/]/.test(u.url))continue;
            let status='check', msg='';
            try{ await request(u.url, { mode: 'no-cors', method: 'HEAD', timeout: 6000 }); status='success'; }
            catch(e){ status='error'; msg='连接超时/拒绝访问/跨域限制'; errorCount++; }
            
            checkedCount++; window.currentCheckProgress = `${checkedCount}/${total}`;
            
            if(!window.isCheckPaused) { document.getElementById('reportSummary').innerHTML=`<i class="fas fa-spinner fa-spin"></i> 正在检测中 (${window.currentCheckProgress})...`; }
            
            if(status!=='success'){
                const cleanName = page.name + (u.name ? ` (${u.name})` : '');
                window.currentReportData.push({ name: cleanName, url: u.url, path: page.path });
                
                if (!groupElements[page.path]) {
                    const groupTitle = document.createElement('div'); groupTitle.className = 'report-group-title'; groupTitle.innerHTML = `<i class="fas fa-folder-open"></i> ${page.path}`;
                    listEl.appendChild(groupTitle); groupElements[page.path] = true;
                }

                const li=document.createElement('li'); li.className='report-item'; const badgeClass=status==='error'?'badge-error':'badge-warn';
                const subNameStr = u.name ? ` <span style="color:#999; font-size:12px;">(${u.name})</span>` : '';
                li.innerHTML=`<div class="report-url" style="color:${status==='error'?'#dc3545':'#333'}; margin-bottom:4px;">${u.url}</div><div class="report-loc" style="font-weight:bold; color:var(--text-color);">${page.name}${subNameStr}</div><div style="font-size:calc(11px * var(--text-scale, 1));color:#999;margin-top:2px;"><span class="report-badge ${badgeClass}" style="margin-right:5px;">可能失效</span>${msg}</div>`;
                listEl.appendChild(li);
            }
        }
    }

    if(pauseBtn) pauseBtn.style.display = 'none';
    if (window.isCheckAborted) return;
    
    if(errorCount===0){ 
        document.getElementById('reportSummary').innerHTML=`<span style="color:#28a745"><i class="fas fa-check-circle"></i> 检测完成，未发现明显死链</span>`; 
        listEl.innerHTML='<li class="report-item" style="text-align:center;color:#999; border:none;">所有网络链接似乎都可正常访问<br><small>(注: 已跳过本地文件检测)</small></li>'; 
    } else { 
        document.getElementById('reportSummary').innerHTML=`检测完成，发现 <strong style="color:#dc3545">${errorCount}</strong> 个潜在问题链接`; 
        document.getElementById('copyReportBtn').style.display = 'inline-block'; 
    }
}

function menuAction(action){
    hideContextMenu(); const id=activeContextNodeId; const node=findNode(id); if(!node)return;
    if(action==='openPages'){ openCategoryPages(id); }
    else if(action==='pin'){ node.isPinned=!node.isPinned; save(); renderTree(); }
    else if(action==='edit'){
        isAdding=false; currentEditId=id; document.getElementById('modalTitle').innerText='编辑'; document.getElementById('editType').value = node.type;
        document.getElementById('editName').value=node.name; document.getElementById('editNote').value=node.note||'';
        const recognizedInput = document.getElementById('editRecognizedName');
        if (recognizedInput) recognizedInput.value = node.recognizedName || '';
        document.getElementById('autoTitleCheck').checked = false;
        document.getElementById('urlGroup').style.display=node.type==='page'?'block':'none'; document.getElementById('noteGroup').style.display=node.type==='page'?'block':'none';
        document.getElementById('parentSelectGroup').style.display='block'; document.getElementById('parentDropdownList').style.display='none';
        
        document.getElementById('iconEditGroup').style.display=(!hideIcons && node.type==='page')?'block':'none';
        const recognizedGroup = document.getElementById('recognizedNameGroup');
        if (recognizedGroup) recognizedGroup.style.display = (!hideIcons && node.type === 'page') ? 'block' : 'none';
        if(!hideIcons && node.type === 'page') {
            const iType = node.iconType || 'auto';
            const matchedRadio = document.querySelector(`input[name="iconType"][value="${iType}"]`);
            if(matchedRadio) matchedRadio.checked = true;
            else document.querySelector('input[name="iconType"][value="auto"]').checked = true;
            
            document.getElementById('customIconData').value = node.customIcon || '';
            document.getElementById('imgUrlPanel').style.display = 'none';
            updateIconPreview();
        }

        document.getElementById('relativePositionGroup').style.display='none'; 
        const editPosGrp = document.getElementById('editPositionGroup');
        if(editPosGrp) { editPosGrp.style.display='flex'; const keepRadio = editPosGrp.querySelector('input[name="editPos"][value="keep"]'); if (keepRadio) keepRadio.checked = true; }

        isUrlSortMode = false; document.getElementById('urlSortToggleBtn').classList.remove('active'); document.getElementById('urlListContainer').classList.remove('sort-active'); 
        if(urlSortable) { urlSortable.destroy(); urlSortable = null; } 
        
        const container = document.getElementById('urlListContainer'); container.innerHTML = ''; 
        if (node.type === 'page') { const urls = normalizeUrls(node); if (urls.length === 0) addUrlRow(); else urls.forEach(u => addUrlRow(u.url, u.name)); } 
        
        const parent=findParent(id);
        if(parent){ document.getElementById('selectedParentId').value=parent.id; document.getElementById('parentSearchInput').value=parent.name; }
        else{ document.getElementById('selectedParentId').value=''; document.getElementById('parentSearchInput').value='根目录'; }
        
        document.getElementById('editModal').classList.add('active'); 
    }else if(action==='move'){
        window.singleMoveId=id; document.getElementById('selectedMoveTargetId').value=''; document.getElementById('moveSearchInput').value=''; document.getElementById('moveDropdownList').style.display='none'; document.getElementById('moveModal').classList.add('active');
    }else if(action==='delete'){
        if(node.type==='category' && node.children && node.children.length>0){
            // 仅当分类里有真实网页（非空叶子节点）时才走二次确认；否则直接 confirm 删除即可。
            const pageCount = countTotalPages(node.children);
            if(pageCount > 0){
                window.deletingCategoryId=id;
                document.getElementById('deleteCategoryId').value=id;
                document.getElementById('delMoveInput').value='';
                document.getElementById('delMoveTargetId').value='';
                const delList = document.getElementById('delMoveDropdownList');
                if(delList) delList.style.display='none';
                const clearBtn = document.querySelector('i[onclick*="delMoveTargetId"]');
                if(clearBtn) clearBtn.style.display='none';
                const titleEl = document.getElementById('deleteCategoryTitle');
                if(titleEl) titleEl.innerText = '删除分类';
                document.getElementById('deleteCategoryModal').classList.add('active');
            } else {
                if(confirm(`分类 "${node.name}" 内没有网页，确认删除该分类吗？`)){ deleteNode(id); save(); renderTree(); }
            }
        }else{
            if(confirm(`确定删除 "${node.name}" 吗？`)){ deleteNode(id); save(); renderTree(); }
        }
    }
}

function confirmMove(){
    const rawTargetId = document.getElementById('selectedMoveTargetId').value;
    const idsToMove = window.singleMoveId ? [window.singleMoveId] : Array.from(document.querySelectorAll('.item-checkbox:checked')).map(c=>c.dataset.id);
    if(idsToMove.length === 0) return;

    let targetWsId = null, targetCatId = null;
    if (rawTargetId && rawTargetId.includes('|')) { const parts = rawTargetId.split('|'); targetWsId = parts[0]; targetCatId = parts[1]; } else { targetWsId = appData.currentId; targetCatId = ''; }

    const targetWs = appData.workspaces.find(w => w.id === targetWsId); if (!targetWs) return alert('目标主页不存在');
    let targetList = targetWs.data;
    if (targetCatId) { const targetNode = findNode(targetCatId, targetWs.data); if (targetNode) targetList = targetNode.children; else return alert('目标分类不存在'); }

    const nodesToMove = [];
    idsToMove.forEach(id => {
        if (String(id) === String(targetCatId)) return; 
        const node = findNode(id, data); 
        if (node) { const nodeData = JSON.parse(JSON.stringify(node)); if (deleteNode(id, data)) nodesToMove.push(nodeData); }
    });

    if (nodesToMove.length > 0) {
        targetList.push(...nodesToMove); save(); renderTree(); 
        const wsDispName = targetWs.group ? `${targetWs.group}/${targetWs.name}` : targetWs.name;
        const wsName = targetWs.id === appData.currentId ? '当前主页' : wsDispName;
        showToast(`已移动 ${nodesToMove.length} 项到 [${wsName}]`);
    }
    closeModal('moveModal'); window.singleMoveId = null; cancelSelection();
}

function confirmDeleteCategory(mode){
    const id = document.getElementById('deleteCategoryId').value; const node = findNode(id); if(!node) return;
    if(mode === 'all'){
        if(confirm('确定删除该分类及其所有子内容吗？此操作不可恢复。')){ deleteNode(id); save(); renderTree(); closeModal('deleteCategoryModal'); showToast('已删除分类及其内容'); }
        return;
    }
    if(mode === 'move'){
        const rawTargetId = document.getElementById('delMoveTargetId').value;
        if(!rawTargetId){ return showToast('请先选择目标位置'); }

        // 解析目标位置（支持跨主页：格式 "wsId|catId"，空 catId 表示根）。
        let targetWsId = appData.currentId, targetCatId = '';
        if(rawTargetId.includes('|')){ const parts = rawTargetId.split('|'); targetWsId = parts[0]; targetCatId = parts[1]; }
        const targetWs = appData.workspaces.find(w => w.id === targetWsId); if(!targetWs) return showToast('目标主页不存在');

        if(isExcludedMoveTarget(targetWsId, targetCatId, 'delMoveTargetId')){
            return showToast('不能将内容移动到当前分类或其子分类中');
        }

        let targetList = targetWs.data;
        if(targetCatId){ const targetNode = findNode(targetCatId, targetWs.data); if(!targetNode) return showToast('目标分类不存在'); targetList = targetNode.children; }

        if(node.children && node.children.length > 0){
            const childrenToMove = JSON.parse(JSON.stringify(node.children));
            targetList.push(...childrenToMove);
            node.children = [];
        }
        deleteNode(id); save(); renderTree(); closeModal('deleteCategoryModal'); window.deletingCategoryId = null;
        const wsName = targetWs.id === appData.currentId ? '当前主页' : (targetWs.group ? `${targetWs.group}/${targetWs.name}` : targetWs.name);
        showToast(`已移动内容到 [${wsName}] 并删除分类`);
    }
}

function openAddModal(type, preSelectedParentId=null, relativePos='inside', preset=null) {
    isAdding=true; addType=type; document.getElementById('modalTitle').innerText=type==='category'?'新增分类':'新增网页'; document.getElementById('editName').value=preset?.name || ''; document.getElementById('editNote').value=preset?.note || ''; document.getElementById('urlGroup').style.display=type==='page'?'block':'none'; document.getElementById('noteGroup').style.display=type==='page'?'block':'none';
    const recognizedInput = document.getElementById('editRecognizedName');
    if (recognizedInput) recognizedInput.value = '';
    document.getElementById('autoTitleCheck').checked = false;
    const recognizedGroup = document.getElementById('recognizedNameGroup');
    if (recognizedGroup) recognizedGroup.style.display = (!hideIcons && type === 'page') ? 'block' : 'none';
    
    document.getElementById('iconEditGroup').style.display=(!hideIcons && type==='page')?'block':'none';
    if(!hideIcons && type === 'page') {
        document.querySelector('input[name="iconType"][value="auto"]').checked = true;
        document.getElementById('customIconData').value = '';
        document.getElementById('imgUrlPanel').style.display = 'none';
        updateIconPreview();
    }

    const container = document.getElementById('urlListContainer'); container.innerHTML = ''; isUrlSortMode = false; document.getElementById('urlSortToggleBtn').classList.remove('active'); document.getElementById('urlListContainer').classList.remove('sort-active'); 
    if(urlSortable) { urlSortable.destroy(); urlSortable = null; } 
    if (type === 'page') addUrlRow(preset?.url || '', preset?.urlName || ''); 
    
    document.getElementById('parentSelectGroup').style.display='block'; document.getElementById('parentDropdownList').style.display='none'; 
    const relGroup = document.getElementById('relativePositionGroup'), siblingGroup = document.getElementById('siblingPositionGroup'), relInsideLabel = document.getElementById('relInsideLabel'), editPosGrp = document.getElementById('editPositionGroup');
    if(editPosGrp) editPosGrp.style.display='none';

    if(type === 'page'){
        relGroup.style.display = 'flex'; siblingGroup.style.display = 'none'; relInsideLabel.style.display = 'none'; 
        const insideRadio = document.querySelector('input[name="relPosition"][value="inside"]'); if(insideRadio) insideRadio.checked = true; updatePositionOptions();
    } else {
        relGroup.style.display = 'flex'; siblingGroup.style.display = 'flex'; relInsideLabel.style.display = 'block';
        const relRadios = relGroup.querySelectorAll('input[type="radio"][name="relPosition"]'); relRadios.forEach(r => { if(r.value === relativePos) r.checked = true; }); updatePositionOptions();
    }
    
    if(preSelectedParentId){ const parent=findNode(preSelectedParentId); if(parent){ document.getElementById('selectedParentId').value=parent.id; document.getElementById('parentSearchInput').value=parent.name; } }
    else{ document.getElementById('selectedParentId').value=''; document.getElementById('parentSearchInput').value=''; }
    const bottomRadio = document.querySelector('input[name="insidePos"][value="bottom"]'); if(bottomRadio) bottomRadio.checked = true;
    document.getElementById('editModal').classList.add('active'); 
}

function openBatchAddUrlModal() { document.getElementById('batchUrlText').value = ''; document.getElementById('batchAddUrlModal').classList.add('active'); setTimeout(() => document.getElementById('batchUrlText').focus(), 100); }
function confirmBatchAddUrls() {
    const text = document.getElementById('batchUrlText').value; const lines = text.split('\n'); let validLines = [];
    lines.forEach(line => { let processedLine = line.replace(/[\(\[\{【「（].*?[\)\]\}】」）]/g, '').trim(); if(processedLine && (processedLine.startsWith('http') || processedLine.startsWith('www') || processedLine.includes('.') || /^[a-zA-Z]:[\\/]/.test(processedLine) || processedLine.startsWith('file://'))) validLines.push(processedLine); });
    if (validLines.length > 0) {
        const rows = document.querySelectorAll('#urlListContainer .url-row'); let startIdx = 0;
        if(rows.length === 1) { const row = rows[0]; const name = row.querySelector('.url-name-input').value.trim(); const url = row.querySelector('.url-value-input').value.trim(); if(!name && !url) { row.querySelector('.url-value-input').value = validLines[0]; startIdx = 1; } }
        for(let i = startIdx; i < validLines.length; i++) addUrlRow(validLines[i], '');
        showToast(`已批量添加 ${validLines.length} 个网址`);
    } else { showToast('未检测到有效网址'); } closeModal('batchAddUrlModal');
}

function removeUrlRow(btn) { const container = document.getElementById('urlListContainer'); if (container.children.length > 1) { btn.parentElement.parentElement.remove(); } else { const row = btn.parentElement.parentElement; row.querySelector('.url-name-input').value = ''; row.querySelector('.url-value-input').value = ''; } }
function toggleUrlSortMode() { isUrlSortMode = !isUrlSortMode; const btn = document.getElementById('urlSortToggleBtn'); const container = document.getElementById('urlListContainer'); if (isUrlSortMode) { btn.classList.add('active'); container.classList.add('sort-active'); urlSortable = new Sortable(container, { handle: '.url-row-handle', animation: 150 }); } else { btn.classList.remove('active'); container.classList.remove('sort-active'); if(urlSortable) { urlSortable.destroy(); urlSortable = null; } } }
function batchPin(){
    const checks=document.querySelectorAll('.item-checkbox:checked');
    if(checks.length===0)return alert('请选择要操作的内容');
    const nodes=Array.from(checks).map(c=>findNode(c.dataset.id)).filter(Boolean);
    const shouldPin=nodes.some(node=>!node.isPinned);
    nodes.forEach(node=>{ node.isPinned=shouldPin; });
    save();renderTree();cancelSelection();
}
async function batchCopy(){
    const checks=document.querySelectorAll('.item-checkbox:checked');
    if(checks.length===0)return alert('请选择要复制的内容');
    const ids=Array.from(checks).map(c=>c.dataset.id);
    const topLevelSelected=[];
    ids.forEach(id=>{const p=findParent(id);if(p&&ids.includes(String(p.id)))return;topLevelSelected.push(findNode(id));});
    const text=generateTextExport(topLevelSelected);
    const ok = await copyTextToClipboard(text);
    if(ok) alert('已复制');
    else showToast('复制失败', 1000);
}

function batchSelectSiblings(){
    const checks = document.querySelectorAll('.item-checkbox:checked');
    if(checks.length===0) return showToast('请先勾选一个网页');
    checks.forEach(cb => {
        const card = cb.closest('.page-card'); const catHeader = cb.closest('.category-header');
        if(card) {
            const childrenCont = card.closest('.children-container');
            if (childrenCont) childrenCont.querySelectorAll(':scope > .pages-container .item-checkbox').forEach(sibling => sibling.checked = true);
        } else if(catHeader) {
            const block = catHeader.closest('.category-block');
            const container = block ? block.parentElement : null;
            if(container) container.querySelectorAll(':scope > .category-block > .category-header .item-checkbox').forEach(sibling => sibling.checked = true);
        }
    }); updateSelectedCount();
}

function openBatchMoveModal(){if(document.querySelectorAll('.item-checkbox:checked').length===0)return alert('请先选择');window.singleMoveId=null;document.getElementById('selectedMoveTargetId').value='';document.getElementById('moveSearchInput').value='';document.getElementById('moveDropdownList').style.display='none';document.getElementById('moveModal').classList.add('active');}
function batchDelete(){const checks=document.querySelectorAll('.item-checkbox:checked');if(checks.length===0)return;const ids=Array.from(checks).map(c=>c.dataset.id);let hasNonEmptyCat=false;let nonEmptyCats=[];ids.forEach(id=>{const node=findNode(id);if(node&&node.type==='category'&&node.children&&node.children.length>0){hasNonEmptyCat=true;nonEmptyCats.push(node);}});if(!hasNonEmptyCat){if(confirm(`确定删除这 ${checks.length} 项吗？`)){ids.forEach(id=>deleteNode(id));save();renderTree();cancelSelection();}}else{window.batchDeleteIds=ids;window.batchNonEmptyCats=nonEmptyCats;document.getElementById('batchDelMoveInput').value='';document.getElementById('batchDelMoveTargetId').value='';document.getElementById('batchDeleteModal').classList.add('active');}}

function confirmBatchDelete(mode){
    const ids = window.batchDeleteIds; if(!ids) return;
    if(mode === 'all'){
        if(confirm('确定删除所有选中项（包括分类内的所有内容）吗？')){ ids.forEach(id => deleteNode(id)); save(); renderTree(); cancelSelection(); closeModal('batchDeleteModal'); }
    } else if(mode === 'emptyOnly'){
        let deletedCount = 0;
        ids.forEach(id => { const node = findNode(id); if(node){ if(node.type === 'page' || (node.type === 'category' && (!node.children || node.children.length === 0))){ deleteNode(id); deletedCount++; } } });
        save(); renderTree(); cancelSelection(); closeModal('batchDeleteModal'); alert(`已删除 ${deletedCount} 项，保留了非空分类。`);
    } else if(mode === 'move'){
        const rawTargetId = document.getElementById('batchDelMoveTargetId').value; let targetWsId = appData.currentId, targetCatId = '';
        if (rawTargetId && rawTargetId.includes('|')) { const parts = rawTargetId.split('|'); targetWsId = parts[0]; targetCatId = parts[1]; }
        const targetWs = appData.workspaces.find(w => w.id === targetWsId); if (!targetWs) return alert('目标位置无效');
        let targetList = targetWs.data;
        if (targetCatId) { const targetNode = findNode(targetCatId, targetWs.data); if (targetNode) targetList = targetNode.children; }
        window.batchNonEmptyCats.forEach(cat => { if(cat.children && cat.children.length > 0){ const childrenToMove = JSON.parse(JSON.stringify(cat.children)); targetList.push(...childrenToMove); cat.children = []; } });
        ids.forEach(id => deleteNode(id)); save(); renderTree(); cancelSelection(); closeModal('batchDeleteModal'); showToast('内容已移动并删除');
    }
}

function toggleEditMode() { 
    isEditMode = !isEditMode; 
    document.body.classList.toggle('edit-mode', isEditMode); 
    document.getElementById('editModeBtn').classList.toggle('active', isEditMode); 
    if (!isEditMode) cancelSelection(); 
}

function findNode(id, list = data) { return findNodeInTree(id, list); }
function findParent(id, list = data, parent = null) { return findParentInTree(id, list, parent); }
function deleteNode(id, list = data) { return deleteNodeInTree(id, list); }
function updateSelectedCount(){const count=document.querySelectorAll('.item-checkbox:checked').length;document.getElementById('selectedCount').innerText=`已选 ${count}`;}
function toggleSelectAll(cb){document.querySelectorAll('.item-checkbox').forEach(c=>c.checked=cb.checked);updateSelectedCount();}
function cancelSelection(){document.querySelectorAll('.item-checkbox').forEach(c=>c.checked=false);document.getElementById('selectAllBox').checked=false;updateSelectedCount();}
function closeModal(id){ if (id === 'toolbarEditModal' && isToolbarSorting) confirmToolbarSort(); document.getElementById(id).classList.remove('active'); if (id === 'deleteCategoryModal') window.deletingCategoryId = null; }
function showContextMenu(x,y,id,type){if(navigator.vibrate)navigator.vibrate(50);activeContextNodeId=id;activeContextNodeType=type;const menu=document.getElementById('contextMenu');const overlay=document.getElementById('menuOverlay');const pinItem=document.getElementById('pinMenuItem');const openItem=document.getElementById('openPagesMenuItem');const node=findNode(id);if(pinItem){pinItem.innerHTML=node&&node.isPinned?'<i class="fas fa-thumbtack"></i> 取消置顶':'<i class="fas fa-thumbtack"></i> 置顶';}if(openItem){openItem.style.display=isNativeApp()&&type==='category'?'flex':'none';}const winW=window.innerWidth,winH=window.innerHeight;if(x+150>winW)x=winW-160;if(y+200>winH)y=winH-210;menu.style.left=x+'px';menu.style.top=y+'px';menu.style.display='block';overlay.style.display='block';}
function hideContextMenu(){document.getElementById('contextMenu').style.display='none';document.getElementById('menuOverlay').style.display='none';}
document.addEventListener('click',function(e){if(!e.target.closest('.search-wrapper') && !e.target.closest('#searchResults')){document.getElementById('searchResults').innerHTML = ''; document.body.classList.remove('search-mode'); document.body.classList.remove('search-focus'); document.getElementById('searchClearBtn').style.display='none';} if(!e.target.closest('.form-input-group')){['parentDropdownList','moveDropdownList','delMoveDropdownList','batchDelMoveDropdownList'].forEach(id=>{const list=document.getElementById(id);if(list)list.style.display='none';});}});
window.addEventListener('scroll', function() { if(window.scrollSaveTimeout) clearTimeout(window.scrollSaveTimeout); window.scrollSaveTimeout = setTimeout(function() { localStorage.setItem('lastScrollPosition', window.scrollY); }, 200); });

function save() { localStorage.setItem('webManagerDataProMax', JSON.stringify(appData)); }

function setColumnMode(val) { 
    if (isIconMode && !hideIcons) {
        iconColumnMode = val;
        localStorage.setItem('iconColumnMode', iconColumnMode);
    } else {
        listColumnMode = val; 
        localStorage.setItem('listColumnMode', listColumnMode);
    }
    applyColumnMode(); 
    document.getElementById('colModeMenu').style.display = 'none'; 
}

function applyColumnMode() { 
    const btn = document.getElementById('colModeBtn'); 
    document.body.classList.remove('col-mode-auto', 'col-mode-1', 'col-mode-2', 'col-mode-3', 'col-mode-4', 'col-mode-5', 'col-mode-6', 'col-mode-7', 'col-mode-8'); 
    
    let currentMode = (isIconMode && !hideIcons) ? iconColumnMode : listColumnMode;

    if (currentMode >= 1 && currentMode <= 8) { 
        document.body.classList.add(`col-mode-${currentMode}`); 
        btn.innerHTML = `<i class="fas fa-columns"></i> <span>${currentMode}列</span>`; 
        btn.classList.add('active'); 
    } else { 
        document.body.classList.add('col-mode-auto');
        btn.innerHTML = '<i class="fas fa-table-columns"></i> <span>自动</span>'; 
        btn.classList.remove('active'); 
    } 
}

function toggleIconMode() {
    if (hideIcons) return;
    isIconMode = !isIconMode;
    localStorage.setItem('webManagerIconMode', isIconMode);
    applyIconMode();
    applyColumnMode(); 
    renderTree(); 
}

function cycleTextAlign(btn){
    alignState=(alignState+1)%3;
    applyAlignState(btn);
    localStorage.setItem('alignState',alignState);
}

function applyAlignState(btn){
    document.body.classList.remove('align-left','align-right');
    const icon=btn.querySelector('i');
    if(alignState===1){
        document.body.classList.add('align-left');
        icon.className='fas fa-align-left';
        btn.classList.add('active');
    }else if(alignState===2){
        document.body.classList.add('align-right');
        icon.className='fas fa-align-right';
        btn.classList.add('active');
    }else{
        icon.className='fas fa-align-center';
        btn.classList.remove('active');
    }
}

function applyIconMode() {
    const btn = document.getElementById('iconModeBtn');
    const showIconMode = isIconMode && !hideIcons;
    if (showIconMode) {
        document.body.classList.add('icon-mode');
        if (btn) btn.classList.add('active');
    } else {
        document.body.classList.remove('icon-mode');
        if (btn) btn.classList.remove('active');
    }
    if (iconShape === 'circle' && !hideIcons) {
        document.body.classList.add('icon-shape-circle');
    } else {
        document.body.classList.remove('icon-shape-circle');
    }
}

function applyHideIconsMode() {
    if (hideIcons) document.body.classList.add('hide-icons');
    else document.body.classList.remove('hide-icons');
    const hideIconsToggle = document.getElementById('hideIconsToggle');
    if (hideIconsToggle) hideIconsToggle.checked = hideIcons;
    const exportHint = document.getElementById('exportFileHint');
    if (exportHint) {
        exportHint.textContent = hideIcons
            ? '(支持导出 JSON 或 ZIP 结构目录打包)'
            : '(支持导出 JSON 或 ZIP 结构目录打包，或单独的图标配置)';
    }
    renderToolbar();
    applyIconMode();
    applyColumnMode();
}

function toggleHideIcons(checked) {
    hideIcons = !!checked;
    localStorage.setItem(HIDE_ICONS_STORAGE_KEY, String(hideIcons));
    applyHideIconsMode();
    renderTree();
    if (document.getElementById('toolbarEditModal')?.classList.contains('active')) {
        openToolbarEditModal();
    }
    const editModal = document.getElementById('editModal');
    if (editModal?.classList.contains('active')) {
        const type = isAdding ? addType : document.getElementById('editType').value;
        const show = !hideIcons && type === 'page';
        document.getElementById('iconEditGroup').style.display = show ? 'block' : 'none';
        const recognizedGroup = document.getElementById('recognizedNameGroup');
        if (recognizedGroup) recognizedGroup.style.display = show ? 'block' : 'none';
        if (show && type === 'page') updateIconPreview();
    }
}

function updatePresetDropdown() {
    const select = document.getElementById('cssPresetSelect');
    if (!select) return;
    select.innerHTML = '<option value="">-- 选择预设 --</option>';
    if (themeConfig.presets) {
        Object.keys(themeConfig.presets).forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        });
    }
}

function applyCustomCssFromInput() {
    themeConfig.customCss = document.getElementById('customCssInput').value;
    applyThemeSettings();
    saveThemeConfig();
    showToast("自定义代码已应用");
}

function saveCssPreset() {
    const name = document.getElementById('presetNameInput').value.trim();
    const content = document.getElementById('customCssInput').value;
    if (!name) return showToast("请输入预设名称");
    if (!content) return showToast("代码内容为空");
    if (!themeConfig.presets) themeConfig.presets = {};
    themeConfig.presets[name] = content;
    saveThemeConfig();
    updatePresetDropdown();
    document.getElementById('cssPresetSelect').value = name;
    showToast("预设已保存");
}

function loadCssPreset() {
    const name = document.getElementById('cssPresetSelect').value;
    if (name && themeConfig.presets[name]) {
        document.getElementById('customCssInput').value = themeConfig.presets[name];
        document.getElementById('presetNameInput').value = name;
    }
}

function deleteCssPreset() {
    const name = document.getElementById('cssPresetSelect').value;
    if (!name) return showToast("请先选择一个预设");
    if (confirm(`确定删除预设 "${name}" 吗？`)) {
        delete themeConfig.presets[name];
        saveThemeConfig();
        updatePresetDropdown();
        document.getElementById('customCssInput').value = '';
        document.getElementById('presetNameInput').value = '';
        showToast("预设已删除");
    }
}

// ==== 覆盖重写的方法 (修复和增强功能) ====

function exportIconSettings() {
    if (hideIcons) return;
    let iconData = [];
    appData.workspaces.forEach(ws => {
        function traverse(nodes) {
            nodes.forEach(n => {
                if (n.type === 'page' && n.iconType) {
                    iconData.push({ id: n.id, iconType: n.iconType, customIcon: n.customIcon });
                }
                if (n.children) traverse(n.children);
            });
        }
        if (ws.data) traverse(ws.data);
    });

    const exportObj = {
        type: 'web_manager_icon_settings',
        version: '1.0',
        globalIconShape: iconShape,
        icons: iconData
    };

    const blob = new Blob([JSON.stringify(exportObj, null, 2)], {type: "application/json"});
    downloadBlob(blob, "icon_settings.json");
    showToast("图标配置已导出");
}

// ================= 数据导入入口 =================
// 根据 JSON、ZIP、主题包和图标配置的特征分流，避免把不同类型文件误写入主页数据。
function consumeNativeImport() {
    if (!isNativeApp() || typeof window.Android?.consumeImportFile !== 'function') return;
    let payload = '';
    try { payload = window.Android.consumeImportFile(); } catch (e) { return; }
    if (!payload) return;
    try {
        const parsed = JSON.parse(payload);
        importNativeBackup(parsed.name, parsed.mime, parsed.base64, parsed.fileUrl);
    } catch (e) {
        showToast('外部文件读取失败', 1500);
    }
}

function importNativeBackup(filename, mime, base64, fileUrl) {
    if (isHtmlFile(filename, mime) && fileUrl) {
        importLocalHtmlPage(filename, fileUrl);
        return;
    }
    if (!base64) return;
    try {
        const binary = atob(String(base64));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const lowerName = String(filename || '').toLowerCase();
        const type = mime
            || (lowerName.endsWith('.zip') ? 'application/zip'
                : (isHtmlFile(filename, mime) ? 'text/html' : 'application/json'));
        const blob = new Blob([bytes], { type });
        blob.name = filename || 'import.json';
        importBackupFile(blob);
    } catch (e) {
        showToast('外部文件导入失败', 1500);
    }
}

function importLocalHtmlPage(filename, fileUrl) {
    const url = String(fileUrl || '').trim();
    if (!url) {
        showToast('本地 HTML 路径无效', 1500);
        return;
    }
    openAddModal('page', null, 'inside', {
        name: htmlFileTitle(filename),
        url,
        note: '',
    });
    if (typeof window.Android?.openUrl === 'function') window.Android.openUrl(url);
    showToast('已打开本地 HTML，可保存为新增网页', 1800);
}

function importFromFile(input) {
    const file = input && input.files ? input.files[0] : input;
    if (!file) return;
    importBackupFile(file);
    if (input && input.value !== undefined) input.value = '';
}

function importBackupFile(file) {
    if (!file) return;
    const fileName = String(file.name || '').toLowerCase();
    const fileType = String(file.type || '').toLowerCase();
    if (fileName.endsWith('.html') || fileName.endsWith('.htm') || fileType.includes('html')) {
        const reader = new FileReader();
        reader.onload = function(e) { importBookmarkHtml(e.target.result); };
        reader.readAsText(file);
        return;
    }
    if (fileName.endsWith('.zip') || fileType.includes('zip')) { 
        JSZip.loadAsync(file).then(function(zip) { 
            if (zip.file("theme_config.json")) return showToast("❌ 这是主题包，请去主题设置导入！", 3000); 
            const promises = []; 
            zip.forEach(function (relativePath, zipEntry) { 
                if (zipEntry.name.endsWith('.json')) { 
                    const promise = zipEntry.async("string").then(function (content) { 
                        try { 
                            const json = JSON.parse(content); 
                            if (Array.isArray(json)) { 
                                let sortIndex = 9999; let name = zipEntry.name.split('/').pop().replace('.json', ''); const match = name.match(/^(\d+)_(.+)$/); 
                                if (match) { sortIndex = parseInt(match[1], 10); name = match[2]; } if(name.includes('_ws_')) name = name.split('_ws_')[0]; 
                                const cleanName = name.replace(/ \(\d+\)$/, '');
                                let group = ''; const pathParts = zipEntry.name.split('/'); if (pathParts.length > 1) { let folderName = pathParts[0]; const fMatch = folderName.match(/^\d+_(.+)$/); if (fMatch) folderName = fMatch[1]; if (folderName !== '未分类') group = folderName; }
                                const newWs = { id: 'ws_' + Date.now() + Math.random().toString(36).substr(2, 5), name: cleanName, group: group, data: sanitizeData(json) }; 
                                return { ws: newWs, index: sortIndex }; 
                            } 
                        } catch (e) { console.error("解析失败:", zipEntry.name); } return null; 
                    }); promises.push(promise); 
                } 
            }); 
            Promise.all(promises).then((results) => { 
                const validResults = results.filter(r => r !== null); 
                if (validResults.length > 0) { 
                    validResults.sort((a, b) => a.index - b.index); 
                    const isOnlyDefaultEmpty = appData.workspaces.length === 1 && (appData.workspaces[0].name === '主页' || appData.workspaces[0].name === '新主页') && appData.workspaces[0].data.length === 0;
                    let doOverwrite = isOnlyDefaultEmpty ? true : confirm(`检测到包含 ${validResults.length} 个主页的备份。\n\n点击【确定】将彻底清空当前所有主页并覆盖！\n点击【取消】将向现有系统中追加合并。`);
                    if (doOverwrite) { appData.workspaces = []; appData.workspaceGroups = []; }
                    validResults.forEach(item => { if (item.ws.group && (!appData.workspaceGroups || !appData.workspaceGroups.includes(item.ws.group))) { if (!appData.workspaceGroups) appData.workspaceGroups = []; appData.workspaceGroups.push(item.ws.group); } appData.workspaces.push(item.ws); }); 
                    save(); if (doOverwrite || !appData.currentId || !appData.workspaces.find(w => w.id === appData.currentId)) { appData.currentId = appData.workspaces[0].id; } 
                    updateDataPointer(); renderTree(); showToast(doOverwrite ? "成功覆盖并导入备份" : `成功追加导入 ${validResults.length} 个新主页`); closeModal('ioModal'); 
                } else { alert("ZIP 文件中未找到有效的 JSON 数据"); } 
            }); 
        }).catch(function(err) { alert("ZIP 读取失败: " + err); }); 
        return; 
    } 
    
    const reader = new FileReader(); 
    reader.onload = function(e) { 
        const content = e.target.result; 
        try { 
            const jsonData = JSON.parse(content); 
            if (jsonData.theme !== undefined && jsonData.day !== undefined) { showToast("❌ 格式错误：这是主题配置文件！", 2500); return; } 
            
            if (jsonData.type === 'web_manager_icon_settings') {
                if (jsonData.globalIconShape) setGlobalIconShape(jsonData.globalIconShape);
                if (jsonData.icons && Array.isArray(jsonData.icons)) {
                    const iconMap = {}; jsonData.icons.forEach(i => iconMap[i.id] = i); let count = 0;
                    appData.workspaces.forEach(ws => {
                        function traverse(nodes) {
                            nodes.forEach(n => {
                                if (n.type === 'page' && iconMap[n.id]) { n.iconType = iconMap[n.id].iconType; n.customIcon = iconMap[n.id].customIcon; count++; }
                                if (n.children) traverse(n.children);
                            });
                        }
                        if (ws.data) traverse(ws.data);
                    });
                    save(); renderTree(); showToast(`成功导入 ${count} 个图标配置`); closeModal('ioModal');
                }
                return;
            }

            if (jsonData.workspaces && Array.isArray(jsonData.workspaces)) { 
                const isOnlyDefaultEmpty = appData.workspaces.length === 1 && (appData.workspaces[0].name === '主页' || appData.workspaces[0].name === '新主页') && appData.workspaces[0].data.length === 0;
                let doOverwrite = isOnlyDefaultEmpty ? true : confirm(`检测到包含 ${jsonData.workspaces.length} 个主页的完整备份。\n\n点击【确定】将彻底清空当前所有主页并完全覆盖！\n点击【取消】将向现有系统中追加合并。`);
                if (doOverwrite) { appData.workspaces = []; appData.workspaceGroups = []; }
                if (jsonData.workspaceGroups) { jsonData.workspaceGroups.forEach(g => { if(!appData.workspaceGroups.includes(g)) appData.workspaceGroups.push(g); }); }
                jsonData.workspaces.forEach(ws => { ws.data = sanitizeData(ws.data); ws.id = 'ws_' + Date.now() + Math.random().toString(36).substr(2,5); if (ws.group === undefined) ws.group = ''; if (ws.group && !appData.workspaceGroups.includes(ws.group)) appData.workspaceGroups.push(ws.group); appData.workspaces.push(ws); }); 
                
                if (doOverwrite) appData.currentId = appData.workspaces[0].id;
                save(); updateDataPointer(); renderTree(); showToast(doOverwrite ? "主页数据已覆盖导入" : "主页数据已追加合并", 1500); closeModal('ioModal'); 
            } 
            else { 
                const cleaned = sanitizeData(jsonData); 
                if (data && data.length > 0) { if(confirm("当前主页已有数据。点击【确定】彻底覆盖当前数据，点击【取消】追加到末尾。")) data = cleaned; else data = data.concat(cleaned); } else { data = cleaned; } 
                const currentWs = appData.workspaces.find(w => w.id === appData.currentId);
                if (currentWs) currentWs.data = data;
                cleanDuplicates(); save(); renderTree(); showToast("数据已导入当前主页", 1500); closeModal('ioModal'); 
            } 
        } catch(jsonErr) {
            if (looksLikeBookmarkHtml(content, fileName, fileType)) {
                importBookmarkHtml(content);
                return;
            }
            alert('文本格式导入暂时只支持标准 JSON 或 HTML 书签');
        }
    }; reader.readAsText(file); 
}

function stampImportedIds(nodes, seed) {
    let nextId = Number(seed) || Date.now();
    const walk = (list) => {
        if (!Array.isArray(list)) return;
        list.forEach((node) => {
            node.id = nextId++;
            if (node.children) walk(node.children);
        });
    };
    walk(nodes);
    return nodes;
}

function importBookmarkHtml(content) {
    const nodes = stampImportedIds(sanitizeData(parseBookmarkHtml(content)));
    if (!nodes.length) {
        showToast('未从 HTML 中识别到书签', 2000);
        return;
    }
    if (data && data.length > 0) {
        if (confirm('当前主页已有数据。点击【确定】彻底覆盖当前数据，点击【取消】追加到末尾。')) data = nodes;
        else data = data.concat(nodes);
    } else {
        data = nodes;
    }
    const currentWs = appData.workspaces.find(w => w.id === appData.currentId);
    if (currentWs) currentWs.data = data;
    cleanDuplicates(); save(); renderTree(); showToast('已从 HTML 导入书签', 1500); closeModal('ioModal');
}

// ================= 全站图标并发识别 =================
// 使用固定数量 worker 控制请求并发；暂停和终止状态由报告窗口统一管理。
async function checkAllIcons() {
    if (hideIcons) return;
    closeModal('toolsModal');
    let pages = [];
    appData.workspaces.forEach(ws => { 
        const wsPages = getAllPages(ws.data); 
        const wsDispName = ws.group ? `${ws.group}/${ws.name}` : ws.name; 
        wsPages.forEach(p => p.path = `[${wsDispName}] ${p.path || '根目录'}`); 
        pages = pages.concat(wsPages); 
    });

    const targetPages = pages.filter(p => {
        if ((p.iconType && p.iconType !== 'auto')) return false;
        const urls = normalizeUrls(p);
        if (urls.length === 0) return false;
        const mainUrl = urls[0].url.trim();
        if (/^file:\/\//i.test(mainUrl) || /^[a-zA-Z]:[\\/]/.test(mainUrl)) return false;
        return true;
    });
    
    if (targetPages.length === 0) {
        showToast("未找到需要识别图标的网络网页");
        return;
    }

    const listEl=document.getElementById('reportList'); 
    listEl.innerHTML=''; 
    document.getElementById('reportTitle').innerText='图标一键识别 (全站)';
    document.getElementById('copyReportBtn').style.display = 'none';
    
    const pauseBtn = document.getElementById('pauseReportBtn');
    if(pauseBtn) { pauseBtn.style.display = 'inline-block'; pauseBtn.className = 'fas fa-pause'; pauseBtn.style.color = ''; }
    
    window.currentReportData = [];
    window.isCheckPaused = false;
    window.isCheckAborted = false;
    window.currentCheckProgress = '';
    
    let successCount = 0;
    let failCount = 0;
    const total = targetPages.length;
    
    document.getElementById('reportSummary').innerHTML=`<i class="fas fa-spinner fa-spin"></i> 正在识别中 (0/${total})...`;
    document.getElementById('reportModal').classList.add('active');

    const placeholderSvg = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#cccccc" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>');

    const esc = (s) => String(s == null ? '' : s).replace(/[<>]/g, c => ({ '<': '&lt;', '>': '&gt;' })[c]);

    function appendIconResult(rec) {
        const li = document.createElement('li');
        li.className = 'report-item icon-result-item';
        const badge = rec.status === 'success'
            ? '<span class="report-badge badge-success" style="margin-right:5px;">已识别</span>'
            : '<span class="report-badge badge-error" style="margin-right:5px;">失败</span>';
        const safeTitle = esc(rec.title);
        const safeName = esc(rec.pageName);
        const safeUrl = esc(rec.mainUrl);
        const titleLine = rec.title && rec.title !== rec.pageName
            ? '<div class="report-recognized-title" style="font-size:calc(13px * var(--text-scale, 1)); color:var(--primary-color); font-weight:600; margin-bottom:2px;">' + safeTitle + '</div>'
            : '';
        const urlColor = rec.status === 'success' ? 'var(--primary-color)' : '#dc3545';
        li.innerHTML =
            '<div class="icon-result-row">' +
                '<div class="icon-result-thumb"><img src="' + rec.iconSrc + '" onerror="this.onerror=null;this.src=\'' + placeholderSvg + '\'"></div>' +
                '<div class="icon-result-info">' +
                    titleLine +
                    '<div class="report-loc" style="font-weight:bold; color:var(--text-color);">' + safeName + '</div>' +
                    '<div class="report-url" style="color:' + urlColor + '; margin-top:2px;">' + safeUrl + '</div>' +
                    '<div style="font-size:calc(11px * var(--text-scale, 1));color:#999;margin-top:2px;">' + badge + (rec.msg || '') + '</div>' +
                '</div>' +
            '</div>';
        listEl.appendChild(li);
    }

    const CONCURRENCY = nativeRecognitionConcurrency();
    let index = 0;
    
    async function worker() {
        while (index < total) {
            if (window.isCheckAborted) break;
            while(window.isCheckPaused && !window.isCheckAborted) { await new Promise(r => setTimeout(r, 300)); }
            if (window.isCheckAborted) break;

            const i = index++;
            const page = targetPages[i]; 
            const urls = normalizeUrls(page);
            let mainUrl = urls[0].url.trim();
            
            if(!/^https?:\/\//i.test(mainUrl)){
                mainUrl = 'http://' + mainUrl;
            }

            let domain = '';
            try { domain = new URL(mainUrl).hostname; } catch(e) {}

            let status = 'error';
            let msg = '';
            let detectedTitle = '';

            if (domain) {
                const recognized = await fetchRecognizedPageInfo(mainUrl);
                detectedTitle = recognized?.title || '';
                if (recognized?.icon) {
                    page.iconType = 'custom';
                    page.customIcon = recognized.icon;
                    status = 'success';
                    successCount++;
                } else {
                    failCount++;
                    msg = '未能识别图标';
                }
                if (detectedTitle && detectedTitle.length <= 12) {
                    page.name = detectedTitle;
                }
            } else {
                failCount++;
                msg = '无效的URL无法识别';
            }

            window.currentCheckProgress = `${successCount + failCount}/${total}`;

            if (!window.isCheckPaused) {
                document.getElementById('reportSummary').innerHTML = `<i class="fas fa-spinner fa-spin"></i> 正在识别中 (${window.currentCheckProgress})...`;
            }

            appendIconResult({
                mainUrl,
                iconSrc: page.customIcon || placeholderSvg,
                title: detectedTitle,
                pageName: page.name,
                status,
                msg,
            });
        }
    }

    const workers = [];
    for(let i=0; i<CONCURRENCY; i++) workers.push(worker());
    await Promise.all(workers);

    if(pauseBtn) pauseBtn.style.display = 'none';
    if (window.isCheckAborted) return;
    
    save();
    renderTree();
    
    document.getElementById('reportSummary').innerHTML=`<span style="color:#28a745"><i class="fas fa-check-circle"></i> 识别完成</span> <br><span style="font-size:13px; font-weight:normal;">成功: ${successCount} 个，失败: ${failCount} 个，已固化为图床链接。</span>`;
}

// 模块作用域不会自动暴露函数；用显式表注册 HTML 内联事件，不再按名字 eval。
const inlineHandlers = {
    toggleEditMode,
    openAddModal,
    openToolsModal,
    clearAllData,
    openThemeModal,
    toggleCountDisplay,
    toggleLocalTagDisplay,
    toggleUrlDisplay,
    toggleNoteDisplay,
    toggleBadgeDisplay,
    toggleTestMode,
    cycleTextAlign,
    toggleOpenTarget,
    toggleAutoRefresh,
    openIconGlobalModal,
    openImportExportModal,
    openToolbarEditModal,
    handleSearchInput,
    handleSearchFocus,
    handleSearchBlur,
    handleSearchKeydown,
    clearSearch,
    applySearchHistory,
    clearSearchHistory,
    toggleExpandAll,
    toggleSortMode,
    toggleIconMode,
    toggleHideIcons,
    openWorkspaceModal,
    openColModeMenu,
    toggleToolbar,
    toggleSelectAll,
    batchSelectSiblings,
    batchOpenSelected,
    batchPin,
    batchCopy,
    openBatchMoveModal,
    batchDelete,
    hideContextMenu,
    menuAction,
    setColumnMode,
    copyPageInfoFromModal,
    openParsePasteModal,
    closeModal,
    toggleImgPanel,
    updateIconPreview,
    startUrlCrop,
    fetchPageInfo,
    toggleUrlSortMode,
    addUrlRow,
    openBatchAddUrlModal,
    copyInput,
    clearInput,
    handleCategorySearch,
    clearCategoryInput,
    openTreeSelectModal,
    updatePositionOptions,
    saveData,
    confirmIconCrop,
    setGlobalIconShape,
    applyBatchIconType,
    applyBatchIconName,
    confirmParsePaste,
    confirmBatchAddUrls,
    toggleToolbarColMode,
    startToolbarSort,
    confirmToolbarSort,
    cancelToolbarSort,
    confirmMove,
    confirmDeleteCategory,
    confirmBatchDelete,
    openQuickAddWsModal,
    toggleWsColMode,
    toggleWsManageMode,
    toggleWsSortMode,
    toggleWsEditMode,
    wsToggleSelectAll,
    wsBatchChangeGroup,
    wsBatchDelete,
    renderWsGroupList,
    confirmChangeWsGroup,
    qaCreateWorkspace,
    qaCreateGroup,
    qaCreateCombo,
    toggleExportList,
    toggleExportBatchMode,
    toggleExportSelectAll,
    updateExportPreview,
    copyExportText,
    exportJsonFile,
    exportIconSettings,
    importFromFile,
    consumeNativeImport,
    performClearBg,
    performClearSelectedWorkspaces,
    performClearData,
    clearRuntimeCache,
    confirmClearSiteData,
    onSiteDataClearTypeChange,
    openSelectiveClearModal,
    filterSelectiveClearList,
    handleSelectiveClearCheckChange,
    toggleSelectAllSelectiveClear,
    updateSelectiveClearSelectAllState,
    performSelectiveClearPages,
    exportThemeSettings,
    importThemeSettings,
    toggleDarkMode,
    setTheme,
    toggleSystemTextScale,
    updateTextScale,
    updateUiScale,
    toggleThemeLock,
    updateBgAdjustment,
    handleBgUpload,
    clearBackground,
    applyBgUrl,
    resetBgParams,
    loadCssPreset,
    deleteCssPreset,
    clearAllCssPresets,
    downloadCurrentCss,
    downloadAllCssPresets,
    importCustomCodeFile,
    copyCss,
    saveCssPreset,
    applyCustomCssFromInput,
    checkDuplicates,
    checkLinks,
    checkAllIcons,
    toggleCheckPause,
    copyReportContent,
    closeReportModal,
    confirmCrop,
    toggleSelectAllClear,
    saveToolbarCheckboxState,
    copyRowName,
    copyRowUrl,
    setRowToTop,
    keepOnlyThisRow,
    removeUrlRow,
    jumpToNode,
    updateClearSelectAllState,
    applySafeAreaInsets,
    cropper: {
        reset() { cropper?.reset(); },
    },
};
const expectedInlineHandlerNames = collectInlineHandlerNames();
[
    'saveToolbarCheckboxState',
    'copyRowName',
    'copyRowUrl',
    'setRowToTop',
    'keepOnlyThisRow',
    'removeUrlRow',
    'jumpToNode',
    'updateClearSelectAllState',
    'updateSelectiveClearSelectAllState',
    'handleSelectiveClearCheckChange',
].forEach((name) => expectedInlineHandlerNames.add(name));
registerInlineHandlers(inlineHandlers, expectedInlineHandlerNames);

// 页面依赖和事件均已注册后，再执行唯一初始化入口。
init();
