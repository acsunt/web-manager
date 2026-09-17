import { describe, expect, it, vi, afterEach } from 'vitest';
import { applySafeAreaInsets, collectInlineHandlerNames, copyTextToClipboard, defaultThemeScale, openExternalUrl, registerInlineHandlers, syncNativeSystemBars } from '../ui.js';

describe('collectInlineHandlerNames', () => {
  it('能从一段 HTML 抽出 onclick 函数名', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <button onclick="toggleEditMode()">管理</button>
      <input onchange="doSomething(1)">
      <div oninput="notACall">忽略</div>
    `;

    const names = collectInlineHandlerNames(root);
    expect(names.has('toggleEditMode')).toBe(true);
    expect(names.has('doSomething')).toBe(true);
    expect(names.has('notACall')).toBe(false);
  });
});

describe('registerInlineHandlers', () => {
  afterEach(() => {
    delete window.toggleEditMode;
    delete window.jumpToNode;
  });

  it('给定含 onclick 的 HTML，handler 表覆盖这些名字，且注册过程不调用 eval', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <button onclick="toggleEditMode()">管理</button>
      <div onclick="jumpToNode(1, 'ws1')">搜索结果</div>
    `;
    const names = collectInlineHandlerNames(root);
    const handlers = {
      toggleEditMode: () => 'edit',
      jumpToNode: () => 'jump',
    };

    expect([...names].every((name) => name in handlers)).toBe(true);

    const evalSpy = vi.spyOn(globalThis, 'eval');
    registerInlineHandlers(handlers, names);
    expect(evalSpy).not.toHaveBeenCalled();
    evalSpy.mockRestore();

    expect(window.toggleEditMode).toBe(handlers.toggleEditMode);
    expect(window.jumpToNode).toBe(handlers.jumpToNode);
  });

  it('表里缺了 HTML 用到的名字时启动会 warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registerInlineHandlers({ toggleEditMode() {} }, new Set(['toggleEditMode', 'missingHandler']));
    expect(warnSpy).toHaveBeenCalledWith('未找到界面事件函数: missingHandler');
    warnSpy.mockRestore();
  });
});

describe('downloadBlob', () => {
  afterEach(() => {
    delete window.Android;
  });

  it('网页没有原生桥时走 a.download', async () => {
    const { downloadBlob } = await import('../ui.js');
    const click = vi.fn();
    const originalCreate = document.createElement.bind(document);
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = originalCreate(tag);
      if (tag === 'a') el.click = click;
      return el;
    });
    const createObjectURL = vi.fn(() => 'blob:test');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    await downloadBlob(new Blob(['hi'], { type: 'text/plain' }), 'a.txt');
    expect(click).toHaveBeenCalled();
    createSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('APK 有 saveFile 时把文件交给原生', async () => {
    const { downloadBlob } = await import('../ui.js');
    window.Android = { saveFile: vi.fn() };
    const blob = {
      type: 'text/plain',
      arrayBuffer: async () => new Uint8Array([104, 105]).buffer,
    };
    await downloadBlob(blob, 'a.txt');
    expect(window.Android.saveFile).toHaveBeenCalled();
    expect(window.Android.saveFile.mock.calls[0][2]).toBe('a.txt');
  });

  it('APK 有分块保存时不走单次 saveFile，避免大文件撑爆 JS 桥', async () => {
    const { downloadBlob } = await import('../ui.js');
    const chunks = [];
    window.Android = {
      beginSaveFile: vi.fn(() => true),
      appendSaveFile: vi.fn((chunk) => { chunks.push(chunk); return true; }),
      finishSaveFile: vi.fn(() => true),
      saveFile: vi.fn(),
    };
    const bytes = new Uint8Array(300 * 1024);
    bytes.set([1, 2, 3], 0);
    bytes.set([4, 5, 6], bytes.length - 3);
    const blob = {
      type: 'application/zip',
      arrayBuffer: async () => bytes.buffer,
    };
    await downloadBlob(blob, 'backup.zip');
    expect(window.Android.beginSaveFile).toHaveBeenCalledWith('application/zip', 'backup.zip');
    expect(window.Android.appendSaveFile.mock.calls.length).toBeGreaterThan(1);
    expect(window.Android.finishSaveFile).toHaveBeenCalled();
    expect(window.Android.saveFile).not.toHaveBeenCalled();
    const binary = chunks.map((chunk) => atob(chunk)).join('');
    expect(binary.length).toBe(bytes.length);
    expect(binary.charCodeAt(0)).toBe(1);
    expect(binary.charCodeAt(binary.length - 1)).toBe(6);
  });
});

describe('openExternalUrl', () => {
  afterEach(() => {
    delete window.Android;
    vi.restoreAllMocks();
  });

  it('APK 有 openUrl 时交给系统浏览器，不走 window.open', () => {
    window.Android = { openUrl: vi.fn(() => true) };
    const open = vi.spyOn(window, 'open').mockImplementation(() => ({}));
    expect(openExternalUrl('https://example.com')).toBe(true);
    expect(window.Android.openUrl).toHaveBeenCalledWith('https://example.com');
    expect(open).not.toHaveBeenCalled();
  });

  it('APK 当前页打开也走系统浏览器，避免 WebView 离开应用页', () => {
    window.Android = { openUrl: vi.fn(() => true) };
    expect(openExternalUrl('https://example.com', { currentTab: true })).toBe(true);
    expect(window.Android.openUrl).toHaveBeenCalledWith('https://example.com');
  });

  it('网页新标签走 window.open', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => ({}));
    expect(openExternalUrl('https://example.com')).toBe(true);
    expect(open).toHaveBeenCalledWith('https://example.com', '_blank');
  });
});

describe('applySafeAreaInsets', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--safe-top');
    document.documentElement.style.removeProperty('--safe-right');
    document.documentElement.style.removeProperty('--safe-bottom');
    document.documentElement.style.removeProperty('--safe-left');
  });

  it('把系统栏高度写进 CSS 变量', () => {
    applySafeAreaInsets({ top: 24, right: 0, bottom: 48, left: 0 });
    expect(document.documentElement.style.getPropertyValue('--safe-top')).toBe('24px');
    expect(document.documentElement.style.getPropertyValue('--safe-bottom')).toBe('48px');
  });
});

describe('defaultThemeScale', () => {
  afterEach(() => {
    delete window.Android;
  });

  it('网页默认跟系统字号、界面大小 100%', () => {
    expect(defaultThemeScale()).toEqual({ systemTextSize: true, textScale: 1, uiScale: 1 });
  });

  it('APK 默认关掉系统字号、界面大小 85%', () => {
    window.Android = {};
    expect(defaultThemeScale()).toEqual({ systemTextSize: false, textScale: 1, uiScale: 0.85 });
  });
});

describe('copyTextToClipboard', () => {
  afterEach(() => {
    delete window.Android;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete document.execCommand;
  });

  it('APK 有 copyText 时走原生剪贴板', async () => {
    window.Android = { copyText: vi.fn(() => true) };
    await expect(copyTextToClipboard('分类名')).resolves.toBe(true);
    expect(window.Android.copyText).toHaveBeenCalledWith('分类名');
  });

  it('网页走 Clipboard API', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await expect(copyTextToClipboard('网页名')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('网页名');
  });

  it('Clipboard API 失败时回退 execCommand', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => { throw new Error('denied'); }) } });
    document.execCommand = vi.fn(() => true);
    await expect(copyTextToClipboard('兜底')).resolves.toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('copy');
  });

  it('全部失败时返回 false', async () => {
    vi.stubGlobal('navigator', {});
    document.execCommand = vi.fn(() => { throw new Error('no copy'); });
    await expect(copyTextToClipboard('失败')).resolves.toBe(false);
  });
});

describe('syncNativeSystemBars', () => {
  afterEach(() => {
    delete window.Android;
  });

  it('网页没有原生桥时不抛错', () => {
    expect(() => syncNativeSystemBars(true)).not.toThrow();
  });

  it('夜间模式让系统栏用浅色图标', () => {
    window.Android = { setSystemBarsAppearance: vi.fn() };
    syncNativeSystemBars(true);
    expect(window.Android.setSystemBarsAppearance).toHaveBeenCalledWith(false);
  });

  it('日间模式让系统栏用深色图标', () => {
    window.Android = { setSystemBarsAppearance: vi.fn() };
    syncNativeSystemBars(false);
    expect(window.Android.setSystemBarsAppearance).toHaveBeenCalledWith(true);
  });
});
