import { describe, expect, it } from 'vitest';
import {
  canCategoryDrop,
  cleanDuplicateIds,
  collectSelfAndDescendantIds,
  deleteNode,
  findNode,
  findParent,
  getAllPages,
  collectPagesFromWorkspaces,
  collectSelectiveClearTree,
  flattenSelectiveClearNodes,
  filterSelectiveClearTree,
  deleteNodesByIds,
  insertByOrderedPeers,
  insertIntoPinZone,
  nodesForDisplay,
  reorderWithinPinZone,
} from '../tree.js';

function sampleTree() {
  return [
    {
      id: 'cat-root',
      type: 'category',
      name: '工作',
      children: [
        { id: 'page-1', type: 'page', name: '文档' },
        {
          id: 'cat-nested',
          type: 'category',
          name: '子分类',
          children: [{ id: 'page-2', type: 'page', name: '深层网页' }],
        },
      ],
    },
    { id: 'page-root', type: 'page', name: '根网页' },
  ];
}

describe('findNode', () => {
  it('能找到根节点', () => {
    const tree = sampleTree();
    expect(findNode('page-root', tree)).toMatchObject({ name: '根网页' });
  });

  it('能找到深层子节点', () => {
    const tree = sampleTree();
    expect(findNode('page-2', tree)).toMatchObject({ name: '深层网页' });
  });

  it('找不到返回 null', () => {
    expect(findNode('missing', sampleTree())).toBeNull();
    expect(findNode('page-1', null)).toBeNull();
  });
});

describe('findParent', () => {
  it('根节点的父级为 null', () => {
    expect(findParent('cat-root', sampleTree())).toBeNull();
    expect(findParent('page-root', sampleTree())).toBeNull();
  });

  it('子节点返回父分类', () => {
    const tree = sampleTree();
    expect(findParent('page-1', tree)).toMatchObject({ id: 'cat-root' });
    expect(findParent('page-2', tree)).toMatchObject({ id: 'cat-nested' });
  });

  it('找不到返回 undefined', () => {
    expect(findParent('missing', sampleTree())).toBeUndefined();
    expect(findParent('page-1', null)).toBeUndefined();
  });
});

describe('deleteNode', () => {
  it('删除叶子后兄弟还在', () => {
    const tree = sampleTree();
    expect(deleteNode('page-1', tree)).toBe(true);
    expect(findNode('page-1', tree)).toBeNull();
    expect(findNode('cat-nested', tree)).toMatchObject({ name: '子分类' });
    expect(tree[1]).toMatchObject({ id: 'page-root' });
  });

  it('删除分类会连同子树一起去掉', () => {
    const tree = sampleTree();
    expect(deleteNode('cat-nested', tree)).toBe(true);
    expect(findNode('cat-nested', tree)).toBeNull();
    expect(findNode('page-2', tree)).toBeNull();
    expect(findNode('page-1', tree)).toMatchObject({ name: '文档' });
  });

  it('找不到时返回 false 且不改树', () => {
    const tree = sampleTree();
    expect(deleteNode('missing', tree)).toBe(false);
    expect(tree).toEqual(sampleTree());
  });
});

describe('deleteNodesByIds', () => {
  it('按 id 批量删除网页，保留未勾选的分类和网页', () => {
    const tree = sampleTree();
    expect(deleteNodesByIds(tree, ['page-1', 'page-root'])).toBe(2);
    expect(findNode('page-1', tree)).toBeNull();
    expect(findNode('page-root', tree)).toBeNull();
    expect(findNode('cat-nested', tree)).toMatchObject({ name: '子分类' });
    expect(findNode('page-2', tree)).toMatchObject({ name: '深层网页' });
  });
});

describe('collectPagesFromWorkspaces', () => {
  it('收集各主页网页，并带上主页标签和网址', () => {
    const rows = collectPagesFromWorkspaces([
      { id: 'ws_a', name: '工作', group: '办公', data: sampleTree() },
      { id: 'ws_b', name: '生活', group: '', data: [{ id: 'p3', type: 'page', name: '笔记', url: 'file:///x.html' }] },
    ]);
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ wsId: 'ws_a', wsLabel: '办公/工作', id: 'page-1', name: '文档' }),
      expect.objectContaining({ wsId: 'ws_b', wsLabel: '生活', id: 'p3', url: 'file:///x.html' }),
    ]));
  });
});

describe('collectSelectiveClearTree', () => {
  it('按主页分类、主页、分类、网页分层，方便分级删除勾选', () => {
    const tree = collectSelectiveClearTree([
      { id: 'ws_a', name: '工作', group: '办公', data: sampleTree() },
      { id: 'ws_b', name: '生活', group: '', data: [{ id: 'p3', type: 'page', name: '笔记' }] },
    ], ['办公']);
    expect(tree[0]).toMatchObject({ type: 'group', name: '办公' });
    expect(tree[0].children[0]).toMatchObject({ type: 'workspace', id: 'ws_a', name: '工作' });
    expect(tree[1]).toMatchObject({ type: 'group', name: '未分类' });
    expect(tree[1].children[0]).toMatchObject({ type: 'workspace', id: 'ws_b', name: '生活' });
    const work = tree[0].children[0];
    expect(work.children[0]).toMatchObject({ type: 'category', id: 'cat-root', name: '工作' });
    expect(work.children[0].children).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'page', id: 'page-1', name: '文档' }),
      expect.objectContaining({ type: 'category', id: 'cat-nested', name: '子分类' }),
    ]));
  });
});

describe('flattenSelectiveClearNodes', () => {
  it('可按主页、分类或网页展平，方便分级删除快速勾选', () => {
    const tree = collectSelectiveClearTree([
      { id: 'ws_a', name: '工作', group: '办公', data: sampleTree() },
      { id: 'ws_b', name: '生活', group: '', data: [{ id: 'p3', type: 'page', name: '笔记' }] },
    ], ['办公']);
    expect(flattenSelectiveClearNodes(tree, 'workspace').map((node) => node.id)).toEqual(['ws_a', 'ws_b']);
    expect(flattenSelectiveClearNodes(tree, 'category').map((node) => node.id)).toEqual(['cat-root', 'cat-nested']);
    expect(flattenSelectiveClearNodes(tree, 'page').map((node) => node.id)).toEqual(['page-1', 'page-2', 'page-root', 'p3']);
    expect(flattenSelectiveClearNodes(tree, 'workspace')[0].children).toEqual([]);
  });
});

describe('filterSelectiveClearTree', () => {
  it('按名称搜索，保留匹配节点及其祖先', () => {
    const tree = collectSelectiveClearTree([{ id: 'ws_a', name: '工作', group: '办公', data: sampleTree() }], ['办公']);
    const filtered = filterSelectiveClearTree(tree, '深层');
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({ type: 'group', name: '办公' });
    expect(filtered[0].children[0].children[0].children).toEqual([
      expect.objectContaining({ type: 'category', id: 'cat-nested' }),
    ]);
    expect(filtered[0].children[0].children[0].children[0].children).toEqual([
      expect.objectContaining({ type: 'page', id: 'page-2', name: '深层网页' }),
    ]);
  });
});

describe('nodesForDisplay', () => {
  it('只排显示顺序，不改原数组，且两边保持相对顺序', () => {
    const tree = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B', isPinned: true },
      { id: 'c', name: 'C' },
      { id: 'd', name: 'D', isPinned: true },
    ];

    expect(nodesForDisplay(tree).map((node) => node.id)).toEqual(['b', 'd', 'a', 'c']);
    expect(tree.map((node) => node.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('根层分类和网页混排时，也只按置顶区分，不按类型重排', () => {
    const tree = [
      { id: 'page-plain', type: 'page' },
      { id: 'cat-pinned', type: 'category', isPinned: true },
      { id: 'page-pinned', type: 'page', isPinned: true },
      { id: 'cat-plain', type: 'category' },
    ];
    expect(nodesForDisplay(tree).map((node) => node.id)).toEqual([
      'cat-pinned',
      'page-pinned',
      'page-plain',
      'cat-plain',
    ]);
    expect(tree.map((node) => node.id)).toEqual([
      'page-plain',
      'cat-pinned',
      'page-pinned',
      'cat-plain',
    ]);
  });

  it('非数组返回空数组', () => {
    expect(nodesForDisplay(null)).toEqual([]);
    expect(nodesForDisplay(undefined)).toEqual([]);
  });
});

describe('reorderWithinPinZone', () => {
  it('只在同类槽位里换序，另一区相对位置不变', () => {
    const tree = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B', isPinned: true },
      { id: 'c', name: 'C' },
      { id: 'd', name: 'D', isPinned: true },
    ];

    reorderWithinPinZone(tree, ['d', 'b']);
    expect(tree.map((node) => node.id)).toEqual(['a', 'd', 'c', 'b']);

    reorderWithinPinZone(tree, ['c', 'a']);
    expect(tree.map((node) => node.id)).toEqual(['c', 'd', 'a', 'b']);
  });

  it('id 对不上时不改数组', () => {
    const tree = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B', isPinned: true },
    ];
    reorderWithinPinZone(tree, ['missing']);
    expect(tree.map((node) => node.id)).toEqual(['a', 'b']);
  });
});

describe('insertIntoPinZone', () => {
  it('置顶项插到已有置顶区，不会挤到普通区', () => {
    const tree = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B', isPinned: true },
      { id: 'c', name: 'C' },
    ];
    insertIntoPinZone(tree, { id: 'x', name: 'X', isPinned: true }, 0);
    expect(tree.map((node) => node.id)).toEqual(['a', 'x', 'b', 'c']);
  });

  it('普通项插到普通区末尾', () => {
    const tree = [
      { id: 'b', name: 'B', isPinned: true },
      { id: 'a', name: 'A' },
    ];
    insertIntoPinZone(tree, { id: 'c', name: 'C' }, 1);
    expect(tree.map((node) => node.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('insertByOrderedPeers', () => {
  it('按显示邻居插回数据里的同类槽位', () => {
    const tree = [
      { id: 'cat', name: '分类', type: 'category' },
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B', isPinned: true },
    ];
    insertByOrderedPeers(tree, { id: 'c', name: 'C' }, ['c', 'a']);
    expect(tree.map((node) => node.id)).toEqual(['cat', 'c', 'a', 'b']);
  });
});

describe('canCategoryDrop', () => {
  it('同级前后只能在同一置顶区', () => {
    const pinned = { id: 'p', isPinned: true };
    const plain = { id: 'n' };
    expect(canCategoryDrop('before', pinned, pinned)).toBe(true);
    expect(canCategoryDrop('after', pinned, plain)).toBe(false);
    expect(canCategoryDrop('inside', pinned, plain)).toBe(true);
    expect(canCategoryDrop('after-parent', plain, pinned)).toBe(true);
  });
});

describe('cleanDuplicateIds', () => {
  it('缺 id、重复 id 会生成新 id，且同树内唯一', () => {
    const tree = [
      { id: 'keep', name: '保留' },
      { id: 'dup', name: '重复1' },
      {
        id: 'dup',
        name: '重复2',
        children: [
          { name: '缺 id' },
          { id: 'keep', name: '再次重复' },
        ],
      },
    ];

    expect(cleanDuplicateIds(tree)).toBe(true);

    const ids = [];
    (function walk(nodes) {
      nodes.forEach((node) => {
        ids.push(String(node.id));
        if (node.children) walk(node.children);
      });
    })(tree);

    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
    expect(tree[0].id).toBe('keep');
    expect(tree[1].id).toBe('dup');
    expect(tree[2].id).not.toBe('dup');
    expect(tree[2].children[0].id).toBeTruthy();
    expect(tree[2].children[1].id).not.toBe('keep');
  });
});

describe('collectSelfAndDescendantIds', () => {
  it('包含自己和全部后代', () => {
    const ids = collectSelfAndDescendantIds('cat-root', sampleTree());
    expect(ids).toEqual(new Set(['cat-root', 'page-1', 'cat-nested', 'page-2']));
  });
});

describe('getAllPages', () => {
  it('能带出路径，分类本身不进结果', () => {
    const pages = getAllPages(sampleTree());
    expect(pages.map((page) => ({ name: page.name, path: page.path }))).toEqual([
      { name: '文档', path: '工作' },
      { name: '深层网页', path: '工作 > 子分类' },
      { name: '根网页', path: '根目录' },
    ]);
    expect(pages.some((page) => page.type === 'category')).toBe(false);
  });
});
