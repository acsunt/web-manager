import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFaviconUrl, fetchPageTitle, request } from '../api.js';

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
