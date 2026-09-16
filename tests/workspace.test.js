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
