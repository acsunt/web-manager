import { describe, expect, it } from 'vitest';
import {
  normalizeUrls,
  countPages,
  countTotalPages,
  httpUrlsOf,
  collectOpenablePages,
  sanitizeData,
  isLocalUrl,
  isOpenableUrl,
  normalizeWebUrl,
  escapeHtml,
  parseSearchHistory,
  rememberSearchQuery,
  resolveColumnModes,
} from '../utils.js';

describe('normalizeUrls', () => {
  it('只用 url 时补成 urls 数组', () => {
    expect(normalizeUrls({ url: 'https://a.com' })).toEqual([
      { url: 'https://a.com', name: '' },
    ]);
  });

  it('只用 urls 时原样返回', () => {
    const urls = [{ url: 'https://a.com', name: 'A' }];
    expect(normalizeUrls({ urls })).toBe(urls);
  });

  it('url 和 urls 都空时返回空数组', () => {
    expect(normalizeUrls({ url: '', urls: [] })).toEqual([]);
    expect(normalizeUrls({})).toEqual([]);
  });

  it('空节点或 undefined 返回空数组', () => {
    expect(normalizeUrls(null)).toEqual([]);
    expect(normalizeUrls(undefined)).toEqual([]);
  });
});

describe('countPages', () => {
  it('单页计 1', () => {
    expect(countPages({ type: 'page', name: 'A' })).toBe(1);
  });

  it('嵌套分类累计子网页', () => {
    const tree = {
      type: 'category',
      name: '根',
      children: [
        { type: 'page', name: 'P1' },
        {
          type: 'category',
          name: '子分类',
          children: [
            { type: 'page', name: 'P2' },
            { type: 'page', name: 'P3' },
          ],
        },
      ],
    };
    expect(countPages(tree)).toBe(3);
  });

  it('分类无 children 计 0', () => {
    expect(countPages({ type: 'category', name: '空' })).toBe(0);
    expect(countPages({ type: 'category', name: '空', children: null })).toBe(0);
  });
});

describe('countTotalPages', () => {
  it('多根节点累计网页数', () => {
    const nodes = [
      { type: 'page', name: 'P1' },
      {
        type: 'category',
        name: 'C1',
        children: [{ type: 'page', name: 'P2' }],
      },
    ];
    expect(countTotalPages(nodes)).toBe(2);
  });

  it('非数组返回 0', () => {
    expect(countTotalPages(null)).toBe(0);
    expect(countTotalPages(undefined)).toBe(0);
    expect(countTotalPages({ type: 'page' })).toBe(0);
  });
});

describe('httpUrlsOf', () => {
  it('只保留 http/https', () => {
    expect(httpUrlsOf({
      urls: [
        { url: 'https://a.com' },
        { url: 'file:///C:/a.html' },
        { url: 'http://b.com' },
        { url: 'C:\\local.html' },
      ],
    })).toEqual(['https://a.com', 'http://b.com']);
  });
});

describe('collectOpenablePages', () => {
  it('收集分类及子分类里可打开的网络和本地网页', () => {
    const pages = collectOpenablePages([
      {
        type: 'category',
        name: '工作',
        children: [
          { type: 'page', name: 'A', url: 'https://a.com' },
          {
            type: 'category',
            name: '子分类',
            children: [
              { type: 'page', name: 'B', urls: [{ url: 'https://b.com' }, { url: 'https://b2.com' }] },
              { type: 'page', name: '本地', url: 'file:///C:/x.html' },
            ],
          },
        ],
      },
      { type: 'page', name: '根网页', url: 'https://root.com' },
    ]);
    expect(pages).toEqual([
      { title: 'A', url: 'https://a.com', urls: ['https://a.com'] },
      { title: 'B', url: 'https://b.com', urls: ['https://b.com', 'https://b2.com'] },
      { title: '本地', url: 'file:///C:/x.html', urls: ['file:///C:/x.html'] },
      { title: '根网页', url: 'https://root.com', urls: ['https://root.com'] },
    ]);
  });

  it('没有可打开网址时返回空数组', () => {
    expect(collectOpenablePages(null)).toEqual([]);
    expect(collectOpenablePages([{ type: 'page', name: '本地', url: 'D:\\a.html' }])).toEqual([]);
  });
});

describe('isOpenableUrl', () => {
  it('http 和 file:// 可打开，盘符路径不可打开', () => {
    expect(isOpenableUrl('https://a.com')).toBe(true);
    expect(isOpenableUrl('file:///storage/emulated/0/Android/data/com.webmanager.app/files/Download/a.html')).toBe(true);
    expect(isOpenableUrl('D:\\a.html')).toBe(false);
  });
});

describe('search history', () => {
  it('解析并去重搜索历史', () => {
    expect(parseSearchHistory('["百度","百度"," github "]')).toEqual(['百度', 'github']);
    expect(parseSearchHistory('not-json')).toEqual([]);
  });

  it('新搜索插到最前并限制条数', () => {
    expect(rememberSearchQuery(['旧', 'github'], ' GitHub ', 3)).toEqual(['GitHub', '旧']);
    expect(rememberSearchQuery(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b']);
  });
});

describe('sanitizeData', () => {
  it('分类缺 children 时补 []', () => {
    const nodes = [{ type: 'category', name: '空分类' }];
    const result = sanitizeData(nodes);
    expect(result[0].children).toEqual([]);
    expect(result).toBe(nodes);
  });

  it('深层嵌套分类也会补 children', () => {
    const nodes = [
      {
        type: 'category',
        name: '外层',
        children: [
          { type: 'category', name: '内层' },
          { type: 'page', name: '网页' },
        ],
      },
    ];
    sanitizeData(nodes);
    expect(nodes[0].children[0].children).toEqual([]);
    expect(nodes[0].children[1].children).toBeUndefined();
  });

  it('传入非数组返回 []', () => {
    expect(sanitizeData(null)).toEqual([]);
    expect(sanitizeData(undefined)).toEqual([]);
    expect(sanitizeData({ type: 'category' })).toEqual([]);
  });

  it('导入时保留并归一化 isPinned，缺标记的不补', () => {
    const nodes = [
      { type: 'page', name: '置顶页', isPinned: true },
      { type: 'page', name: '普通页' },
      {
        type: 'category',
        name: '分类',
        isPinned: 'yes',
        children: [{ type: 'page', name: '子页', isPinned: 0 }],
      },
    ];
    sanitizeData(nodes);
    expect(nodes[0].isPinned).toBe(true);
    expect(nodes[1].isPinned).toBeUndefined();
    expect(nodes[2].isPinned).toBe(true);
    expect(nodes[2].children[0].isPinned).toBe(false);
  });
});

describe('isLocalUrl', () => {
  it('识别 file://', () => {
    expect(isLocalUrl('file:///C:/notes/a.html')).toBe(true);
  });

  it('识别盘符反斜杠路径', () => {
    expect(isLocalUrl('C:\\docs\\a.html')).toBe(true);
  });

  it('识别盘符正斜杠路径', () => {
    expect(isLocalUrl('D:/sites/index.html')).toBe(true);
  });

  it('普通 http 不是本地路径', () => {
    expect(isLocalUrl('http://example.com')).toBe(false);
    expect(isLocalUrl('https://example.com/a')).toBe(false);
  });
});

describe('normalizeWebUrl', () => {
  it('无协议时补 https://', () => {
    expect(normalizeWebUrl('example.com/a')).toBe('https://example.com/a');
  });

  it('已有协议不改', () => {
    expect(normalizeWebUrl('http://example.com')).toBe('http://example.com');
    expect(normalizeWebUrl('https://example.com')).toBe('https://example.com');
  });

  it('本地路径不乱补协议', () => {
    expect(normalizeWebUrl('C:\\docs\\a.html')).toBe('C:\\docs\\a.html');
    expect(normalizeWebUrl('file:///C:/a.html')).toBe('file:///C:/a.html');
  });

  it('空白返回空', () => {
    expect(normalizeWebUrl('')).toBe('');
    expect(normalizeWebUrl('   ')).toBe('');
  });
});

describe('escapeHtml', () => {
  it('转义 < > & " \'', () => {
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('>')).toBe('&gt;');
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('"')).toBe('&quot;');
    expect(escapeHtml("'")).toBe('&#39;');
  });

  it('组合用户字符串按字面量转义', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;',
    );
    expect(escapeHtml(`a&b<"c"'d>`)).toBe('a&amp;b&lt;&quot;c&quot;&#39;d&gt;');
  });

  it('空值返回空字符串', () => {
    expect(escapeHtml('')).toBe('');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('resolveColumnModes', () => {
  it('无本地记录时：列表 3 列，图标自动', () => {
    expect(resolveColumnModes({})).toEqual({
      listColumnMode: 3,
      iconColumnMode: 0,
      clearLegacyColumnMode: false,
    });
  });

  it('分别记住列表和图标列数', () => {
    expect(resolveColumnModes({
      listColumnMode: '4',
      iconColumnMode: '6',
    })).toEqual({
      listColumnMode: 4,
      iconColumnMode: 6,
      clearLegacyColumnMode: false,
    });
  });

  it('旧的单一列数只迁到列表，图标保持自动', () => {
    expect(resolveColumnModes({ columnMode: '5' })).toEqual({
      listColumnMode: 5,
      iconColumnMode: 0,
      clearLegacyColumnMode: true,
    });
  });

  it('已有分项记录时忽略旧的单一列数', () => {
    expect(resolveColumnModes({
      columnMode: '2',
      listColumnMode: '3',
      iconColumnMode: '0',
    })).toEqual({
      listColumnMode: 3,
      iconColumnMode: 0,
      clearLegacyColumnMode: true,
    });
  });

  it('非法值回退默认', () => {
    expect(resolveColumnModes({
      listColumnMode: 'abc',
      iconColumnMode: '9',
    })).toEqual({
      listColumnMode: 3,
      iconColumnMode: 0,
      clearLegacyColumnMode: false,
    });
  });
});
