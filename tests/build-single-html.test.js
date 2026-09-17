import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { replaceOnce } from '../scripts/html-inline.js';
import { requiredVendorFiles } from '../scripts/offline-vendor.js';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('replaceOnce', () => {
  it('按字面量替换，不把 $& 当成 replace 特殊符', () => {
    const source = 'BEFORE<script type="module" src="./main.js"></script>AFTER';
    const search = '<script type="module" src="./main.js"></script>';
    const replacement = '<script>\nA&&(B=1);$&&($.x=1);\n</script>';
    const out = replaceOnce(source, search, replacement, 'main.js 模块引用');
    expect(out).toBe('BEFORE<script>\nA&&(B=1);$&&($.x=1);\n</script>AFTER');
    expect(out).not.toContain('src="./main.js"');
  });

  it('找不到目标时抛错', () => {
    expect(() => replaceOnce('abc', 'zzz', 'n', '标签')).toThrow('找不到 标签');
  });
});

describe('离线依赖', () => {
  it('vendor/ 已有 Font Awesome / Cropper / Sortable / JSZip', () => {
    for (const path of requiredVendorFiles()) {
      expect(existsSync(path), path).toBe(true);
    }
  });

  it('打包脚本从本地 vendor 读取，不现下 CDN', () => {
    const src = readFileSync(join(rootDir, 'scripts', 'build-single-html.js'), 'utf8');
    expect(src).toContain('loadOfflineVendor');
    expect(src).not.toContain('fetchText');
    expect(src).not.toContain('正在下载离线依赖');
  });
});
