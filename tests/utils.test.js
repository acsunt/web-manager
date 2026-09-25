import { describe, expect, it } from 'vitest';
import {
  normalizeUrls,
  countPages,
  countTotalPages,
  httpUrlsOf,
  collectOpenablePages,
  sanitizeData,
  looksLikeBookmarkHtml,
  isHtmlFile,
  htmlFileTitle,
  parseBookmarkHtml,
  isLocalUrl,
  isFileProtocolUrl,
  convertUriText,
  collectFileProtocolPages,
  convertPageFileUrls,
  replaceFileUrlPackage,
  convertPageFilePackage,
  isOpenableUrl,
  normalizeWebUrl,
  escapeHtml,
  parseSearchHistory,
  rememberSearchQuery,
  resolveColumnModes,
  parseHideIconsPref,
  stripIconFieldsFromTree,
  stripRedundantUrlFromTree,
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

describe('parseBookmarkHtml', () => {
  it('能解析 Netscape 书签分类和网页', () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL>
<DT><H3>工作</H3>
<DL>
<DT><A HREF="https://a.com">A站</A>
<DT><A HREF="https://b.com">B &amp; 站</A>
</DL>
<DT><A HREF="https://c.com">C站</A>
</DL>`;
    expect(parseBookmarkHtml(html)).toEqual([
      {
        type: 'category',
        name: '工作',
        children: [
          {
            type: 'page',
            name: 'A站',
            url: 'https://a.com',
            urls: [{ url: 'https://a.com', name: '' }],
            collapsed: false,
          },
          {
            type: 'page',
            name: 'B & 站',
            url: 'https://b.com',
            urls: [{ url: 'https://b.com', name: '' }],
            collapsed: false,
          },
        ],
        collapsed: false,
      },
      {
        type: 'page',
        name: 'C站',
        url: 'https://c.com',
        urls: [{ url: 'https://c.com', name: '' }],
        collapsed: false,
      },
    ]);
  });

  it('普通 HTML 链接也能导入，并跳过 javascript', () => {
    const html = '<html><a href="https://x.com">X</a><a href="javascript:void(0)">skip</a></html>';
    expect(parseBookmarkHtml(html)).toEqual([
      {
        type: 'page',
        name: 'X',
        url: 'https://x.com',
        urls: [{ url: 'https://x.com', name: '' }],
        collapsed: false,
      },
    ]);
  });

  it('按扩展名或内容识别 HTML 书签', () => {
    expect(looksLikeBookmarkHtml('', 'bookmarks.html')).toBe(true);
    expect(looksLikeBookmarkHtml('', 'notes.htm', 'text/plain')).toBe(true);
    expect(looksLikeBookmarkHtml('<a href="https://a.com">A</a></a>', '', 'text/html')).toBe(true);
    expect(looksLikeBookmarkHtml('{"workspaces":[]}', 'backup.json')).toBe(false);
  });
});

describe('isHtmlFile / htmlFileTitle', () => {
  it('按扩展名和 MIME 识别 HTML', () => {
    expect(isHtmlFile('notes.html')).toBe(true);
    expect(isHtmlFile('page.HTM')).toBe(true);
    expect(isHtmlFile('a.bin', 'text/html')).toBe(true);
    expect(isHtmlFile('backup.json', 'application/json')).toBe(false);
  });

  it('从文件名去掉扩展名作为网页名称', () => {
    expect(htmlFileTitle('我的主页.html')).toBe('我的主页');
    expect(htmlFileTitle('C:\\\\docs\\\\a.htm')).toBe('a');
    expect(htmlFileTitle('')).toBe('本地网页');
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

describe('处理 file:/// 本地网页', () => {
  it('只认 file:/// 开头', () => {
    expect(isFileProtocolUrl('file:///C:/notes/a.html')).toBe(true);
    expect(isFileProtocolUrl('C:\\docs\\a.html')).toBe(false);
    expect(isFileProtocolUrl('https://example.com')).toBe(false);
  });

  it('转中文和转原始互相还原', () => {
    const raw = 'file:///C:/笔记/a b.html';
    const encoded = convertUriText(raw, 'encode');
    expect(encoded).not.toBe(raw);
    expect(convertUriText(encoded, 'decode')).toBe(raw);
  });

  it('收集全部主页里 file:/// 网页并原地转换', () => {
    const page = { type: 'page', id: 'p1', url: 'file:///C:/%E7%AC%94%E8%AE%B0.html', urls: [{ url: 'file:///C:/%E7%AC%94%E8%AE%B0.html', name: '' }] };
    const skipped = { type: 'page', id: 'p2', url: 'https://example.com' };
    const workspaces = [{ id: 'ws', data: [page, { type: 'category', children: [skipped] }] }];
    expect(collectFileProtocolPages(workspaces)).toEqual([page]);
    expect(convertPageFileUrls(page, 'decode')).toBe(true);
    expect(page.url).toBe('file:///C:/笔记.html');
    expect(page.urls[0].url).toBe('file:///C:/笔记.html');
    expect(skipped.url).toBe('https://example.com');
  });

  it('转包名只替换 data/ 和 files/ 之间的包名', () => {
    const raw = 'file:///storage/emulated/0/Android/data/com.old.app/files/Download/笔记.html';
    expect(replaceFileUrlPackage(raw, 'com.webmanager.app')).toBe(
      'file:///storage/emulated/0/Android/data/com.webmanager.app/files/Download/笔记.html',
    );
    expect(replaceFileUrlPackage(raw, 'com.yjllq.kitp')).toContain('/data/com.yjllq.kitp/files/');
    expect(replaceFileUrlPackage(raw, 'com.yjllq.kito')).toContain('/data/com.yjllq.kito/files/');
    expect(replaceFileUrlPackage(raw, 'com.yjllq.chrome.beta')).toContain('/data/com.yjllq.chrome.beta/files/');
    expect(replaceFileUrlPackage('https://example.com/data/com.old.app/files/a.html', 'com.webmanager.app'))
      .toBe('https://example.com/data/com.old.app/files/a.html');
    expect(replaceFileUrlPackage('file:///C:/notes/a.html', 'com.webmanager.app')).toBe('file:///C:/notes/a.html');
  });

  it('转包名会改网页及其备用地址', () => {
    const page = {
      type: 'page',
      url: 'file:///storage/emulated/0/Android/data/com.old.app/files/a.html',
      urls: [{ url: 'file:///storage/emulated/0/Android/data/com.old.app/files/b.html', name: '' }],
    };
    expect(convertPageFilePackage(page, 'com.yjllq.kito')).toBe(true);
    expect(page.url).toContain('/data/com.yjllq.kito/files/');
    expect(page.urls[0].url).toContain('/data/com.yjllq.kito/files/');
    expect(convertPageFilePackage(page, 'com.yjllq.kito')).toBe(false);
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

describe('parseHideIconsPref', () => {
  it('缺省或空值默认隐藏图标', () => {
    expect(parseHideIconsPref(null)).toBe(true);
    expect(parseHideIconsPref('')).toBe(true);
    expect(parseHideIconsPref(undefined)).toBe(true);
  });

  it('只有显式 false 才显示图标功能', () => {
    expect(parseHideIconsPref('false')).toBe(false);
    expect(parseHideIconsPref('true')).toBe(true);
  });
});

describe('stripIconFieldsFromTree', () => {
  it('导出时去掉图标和识别名称，不改原树', () => {
    const tree = [{
      type: 'category',
      name: '分类',
      children: [{
        type: 'page',
        name: '网页',
        url: 'https://a.com',
        iconType: 'custom',
        customIcon: 'data:image/png;base64,aaa',
        recognizedName: '识别名',
      }],
    }];
    expect(stripIconFieldsFromTree(tree)).toEqual([{
      type: 'category',
      name: '分类',
      children: [{
        type: 'page',
        name: '网页',
        url: 'https://a.com',
      }],
    }]);
    expect(tree[0].children[0].iconType).toBe('custom');
    expect(tree[0].children[0].recognizedName).toBe('识别名');
  });
});

describe('stripRedundantUrlFromTree', () => {
  it('有 urls 时去掉多余的 url，不改原树', () => {
    const tree = [{
      type: 'category',
      name: '分类',
      children: [{
        type: 'page',
        name: '网页',
        url: 'https://a.com',
        urls: [{ url: 'https://a.com', name: '' }, { url: 'https://b.com', name: '备用' }],
      }],
    }];
    expect(stripRedundantUrlFromTree(tree)).toEqual([{
      type: 'category',
      name: '分类',
      children: [{
        type: 'page',
        name: '网页',
        urls: [{ url: 'https://a.com', name: '' }, { url: 'https://b.com', name: '备用' }],
      }],
    }]);
    expect(tree[0].children[0].url).toBe('https://a.com');
  });

  it('只有旧 url 字段时原样保留', () => {
    expect(stripRedundantUrlFromTree([{
      type: 'page',
      name: '旧页',
      url: 'https://legacy.com',
    }])).toEqual([{
      type: 'page',
      name: '旧页',
      url: 'https://legacy.com',
    }]);
  });

  it('urls 为空时仍保留 url', () => {
    expect(stripRedundantUrlFromTree([{
      type: 'page',
      name: '网页',
      url: 'https://a.com',
      urls: [],
    }])).toEqual([{
      type: 'page',
      name: '网页',
      url: 'https://a.com',
      urls: [],
    }]);
  });
});
