import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  createDefaultAppData,
  ensureValidCurrentWorkspace,
  ensureWorkspaceGroups,
  getCurrentWorkspaceTree,
  migratePersistedAppData,
  applySelectiveClear,
  collectSelectiveClearPages,
  collectSelectiveClearUrls,
  groupPagesByWorkspace,
  removeWorkspaceGroup,
  removeWorkspacesByIds,
} from '../workspace.js';

const legacyArray = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/legacy-array.json'), 'utf8'),
);

function sampleAppData() {
  return {
    workspaces: [
      { id: 'ws_a', name: '工作', group: '办公', data: [{ id: 'p1', type: 'page', name: '文档' }] },
      { id: 'ws_b', name: '生活', group: '个人', data: [] },
      { id: 'ws_c', name: '未分组', group: '', data: [{ id: 'p2', type: 'page', name: '其它' }] },
    ],
    workspaceGroups: ['办公', '个人'],
    currentId: 'ws_a',
  };
}

describe('createDefaultAppData', () => {
  it('无存档时创建默认主页', () => {
    expect(createDefaultAppData(1700000000000)).toEqual({
      workspaces: [{ id: 'ws_1700000000000', name: '主页', group: '', data: [] }],
      workspaceGroups: [],
      currentId: 'ws_1700000000000',
    });
  });
});

describe('migratePersistedAppData', () => {
  it('旧格式数组能迁成 workspaces', () => {
    const { appData, didMigrateLegacyArray } = migratePersistedAppData(JSON.stringify(legacyArray), 111);
    expect(didMigrateLegacyArray).toBe(true);
    expect(appData.currentId).toBe('ws_111');
    expect(appData.workspaceGroups).toEqual([]);
    expect(appData.workspaces).toEqual([
      { id: 'ws_111', name: '主页', group: '', data: legacyArray },
    ]);
  });

  it('损坏 JSON / 非数组非对象时回退默认数据', () => {
    expect(migratePersistedAppData('{', 222).appData).toEqual(createDefaultAppData(222));
    expect(migratePersistedAppData('null', 223).appData).toEqual(createDefaultAppData(223));
    expect(migratePersistedAppData('42', 224).appData).toEqual(createDefaultAppData(224));
    expect(migratePersistedAppData('"hello"', 225).appData).toEqual(createDefaultAppData(225));
    expect(migratePersistedAppData(JSON.stringify({ theme: 'minimal' }), 226).appData).toEqual(createDefaultAppData(226));
    expect(migratePersistedAppData(null, 227).appData).toEqual(createDefaultAppData(227));
    expect(migratePersistedAppData('', 228).didMigrateLegacyArray).toBe(false);
  });

  it('currentId 指向不存在的主页时，切到第一个', () => {
    const { appData } = migratePersistedAppData(JSON.stringify({
      workspaces: sampleAppData().workspaces,
      workspaceGroups: ['办公', '个人'],
      currentId: 'ws_missing',
    }));
    expect(appData.currentId).toBe('ws_a');
    expect(appData.workspaces.map((ws) => ws.id)).toEqual(['ws_a', 'ws_b', 'ws_c']);
  });

  it('缺 workspaceGroups 时按已有 group 补齐', () => {
    const { appData } = migratePersistedAppData(JSON.stringify({
      workspaces: sampleAppData().workspaces,
      currentId: 'ws_b',
    }));
    expect(appData.workspaceGroups).toEqual(['办公', '个人']);
    expect(appData.currentId).toBe('ws_b');
  });
});

describe('ensureWorkspaceGroups', () => {
  it('已有 workspaceGroups 时不覆盖', () => {
    const appData = { workspaces: sampleAppData().workspaces, workspaceGroups: ['办公'], currentId: 'ws_a' };
    ensureWorkspaceGroups(appData);
    expect(appData.workspaceGroups).toEqual(['办公']);
  });
});

describe('getCurrentWorkspaceTree', () => {
  it('返回当前主页的树；找不到时返回空数组', () => {
    expect(getCurrentWorkspaceTree(sampleAppData())).toEqual([{ id: 'p1', type: 'page', name: '文档' }]);
    expect(getCurrentWorkspaceTree({ workspaces: sampleAppData().workspaces, currentId: 'missing' })).toEqual([]);
    expect(getCurrentWorkspaceTree(null)).toEqual([]);
  });
});

describe('ensureValidCurrentWorkspace / removeWorkspacesByIds', () => {
  it('删除当前主页后 currentId 更新', () => {
    const next = removeWorkspacesByIds(sampleAppData(), ['ws_a']);
    expect(next.currentId).toBe('ws_b');
    expect(next.workspaces.map((ws) => ws.id)).toEqual(['ws_b', 'ws_c']);
    expect(getCurrentWorkspaceTree(next)).toEqual([]);
  });

  it('删光全部主页后重建「主页」', () => {
    const next = removeWorkspacesByIds(sampleAppData(), ['ws_a', 'ws_b', 'ws_c'], 333);
    expect(next).toEqual(createDefaultAppData(333));
    expect(next.workspaces[0].name).toBe('主页');
  });

  it('workspaces 为空时同样重建默认主页', () => {
    const next = ensureValidCurrentWorkspace({ workspaces: [], workspaceGroups: ['办公'], currentId: 'ws_a' }, 444);
    expect(next).toEqual(createDefaultAppData(444));
  });
});

describe('groupPagesByWorkspace', () => {
  it('按主页 id 分组，方便分级删除', () => {
    const grouped = groupPagesByWorkspace([
      { wsId: 'ws_a', id: 'p1' },
      { wsId: 'ws_b', id: 'p2' },
      { wsId: 'ws_a', id: 'p3' },
    ]);
    expect([...grouped.keys()]).toEqual(['ws_a', 'ws_b']);
    expect(grouped.get('ws_a').map((page) => page.id)).toEqual(['p1', 'p3']);
  });
});

describe('applySelectiveClear', () => {
  it('勾选主页、分类或网页时收集对应网页，不删书签树', () => {
    const appData = sampleAppData();
    appData.workspaces[0].data = [
      { id: 'cat-1', type: 'category', name: '分类', children: [{ id: 'p1', type: 'page', name: '文档', url: 'https://a.example/doc' }] },
      { id: 'p2', type: 'page', name: '笔记', url: 'https://a.example/note' },
    ];
    const pages = applySelectiveClear(appData, [
      { type: 'category', wsId: 'ws_a', id: 'cat-1' },
      { type: 'page', wsId: 'ws_c', id: 'p2' },
    ]);
    expect(pages.map((page) => page.id)).toEqual(['p1', 'p2']);
    expect(appData.workspaces.find((ws) => ws.id === 'ws_a').data.map((node) => node.id)).toEqual(['cat-1', 'p2']);
    expect(collectSelectiveClearPages(appData, [{ type: 'workspace', wsId: 'ws_a', id: 'ws_a' }]).map((page) => page.id)).toEqual(['p1', 'p2']);
    expect(collectSelectiveClearUrls(appData, [{ type: 'group', id: '办公' }])).toEqual([
      'https://a.example/doc',
      'https://a.example/note',
    ]);
    expect(collectSelectiveClearPages(appData, [{ type: 'page', wsId: 'ws_a', id: 'p2' }]).map((page) => page.id)).toEqual(['p2']);
  });
});

describe('removeWorkspaceGroup', () => {
  it('删光分组下全部主页后重建「主页」', () => {
    const appData = {
      workspaces: [
        { id: 'ws_a', name: '工作', group: '办公', data: [] },
        { id: 'ws_b', name: '备份', group: '办公', data: [] },
      ],
      workspaceGroups: ['办公'],
      currentId: 'ws_a',
    };
    const next = removeWorkspaceGroup(appData, '办公', 555);
    expect(next).toEqual(createDefaultAppData(555));
  });
});
