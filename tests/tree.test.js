import { describe, expect, it } from 'vitest';
import {
  cleanDuplicateIds,
  collectSelfAndDescendantIds,
  deleteNode,
  findNode,
  findParent,
  getAllPages,
  sortNodesByPin,
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

describe('sortNodesByPin', () => {
  it('置顶节点始终在前，并递归处理子树', () => {
    const tree = [
      {
        id: 'a',
        name: 'A',
        children: [
          { id: 'a2', name: 'A2' },
          { id: 'a1', name: 'A1', isPinned: true },
        ],
      },
      { id: 'b', name: 'B', isPinned: true },
    ];

    sortNodesByPin(tree);

    expect(tree.map((node) => node.id)).toEqual(['b', 'a']);
    expect(tree[1].children.map((node) => node.id)).toEqual(['a1', 'a2']);
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
