import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createFaviconUrl,
  fetchPageTitle,
  fetchPageTitleFor,
  fetchRecognizedPageInfo,
  hasNativePageInfoBridge,
  lookupCommonSiteTitle,
  nativeRecognitionConcurrency,
  request,
} from '../api.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('createFaviconUrl', () => {
  it('按域名生成 Google favicon 地址', () => {
    expect(createFaviconUrl('https://example.com/path?q=1')).toBe(
      'https://www.google.com/s2/favicons?domain=example.com&sz=128',
    );
  });

  it('可用自定义尺寸', () => {
    expect(createFaviconUrl('https://sub.example.org/a', 64)).toBe(
      'https://www.google.com/s2/favicons?domain=sub.example.org&sz=64',
    );
  });
});

describe('request', () => {
  it('超时后 abort', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        reject(options.signal.reason ?? new DOMException('Aborted', 'AbortError'));
      });
    }));

    const pending = request('https://example.com', { timeout: 50 });
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });
});

describe('fetchPageTitle', () => {
  it('解析 title 并解码 HTML 实体', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({
        contents: '<html><head><title>Foo &amp; Bar</title></head></html>',
      }),
    }));

    await expect(fetchPageTitle('https://example.com')).resolves.toBe('Foo & Bar');
  });
});

describe('网页 / 原生识别分叉', () => {
  afterEach(() => {
    delete window.Android;
    delete window.__onNativePageInfo;
    delete window.__nativePageInfoPending;
  });

  it('常见站走字典，不打代理', async () => {
    expect(lookupCommonSiteTitle('https://www.baidu.com/s')).toBe('百度');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(fetchPageTitleFor('https://github.com/foo')).resolves.toBe('GitHub');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('没有原生桥时并发仍是 5', () => {
    expect(hasNativePageInfoBridge(window)).toBe(false);
    expect(nativeRecognitionConcurrency(window)).toBe(5);
  });

  it('有原生桥时走回调结果，并发改为 2', async () => {
    window.Android = {
      fetchPageInfo(_url, requestId) {
        queueMicrotask(() => {
          window.__onNativePageInfo(requestId, JSON.stringify({
            title: '真实标题',
            icon: 'data:image/png;base64,aaa',
          }));
        });
      },
    };

    expect(hasNativePageInfoBridge(window)).toBe(true);
    expect(nativeRecognitionConcurrency(window)).toBe(2);
    await expect(fetchPageTitleFor('https://example.com', window)).resolves.toBe('真实标题');
    await expect(fetchRecognizedPageInfo('https://example.com', window)).resolves.toEqual({
      title: '真实标题',
      icon: 'data:image/png;base64,aaa',
    });
  });

  it('本地路径不调用原生桥', async () => {
    const fetchPageInfo = vi.fn();
    window.Android = { fetchPageInfo };
    await expect(fetchRecognizedPageInfo('file:///C:/page.html', window)).resolves.toEqual({
      title: '',
      icon: '',
    });
    expect(fetchPageInfo).not.toHaveBeenCalled();
  });

  it('原生失败时回退网页方案', async () => {
    window.Android = {
      fetchPageInfo() {
        throw new Error('bridge down');
      },
    };
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      json: async () => ({
        contents: '<html><head><title>代理标题</title></head></html>',
      }),
    }));
    await expect(fetchPageTitleFor('https://example.org/a', window)).resolves.toBe('代理标题');
  });
});
