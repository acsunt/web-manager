import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatGithubReleaseBody, formatReleaseNotes, parseReleaseNotes, validateReleaseNotes } from '../scripts/release-notes.mjs';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('Release 说明', () => {
  it('解析分段标题和列表', () => {
    const buckets = parseReleaseNotes(`feat: 网页与 APK 并行

新增
- Android 壳
- npm run apk

优化
- 状态栏透明

修复
- 识别失败时回退网页方案
`);
    expect(buckets.新增).toEqual(['Android 壳', 'npm run apk']);
    expect(buckets.优化).toEqual(['状态栏透明']);
    expect(buckets.修复).toEqual(['识别失败时回退网页方案']);
  });

  it('解析「新增 xxx」单行写法', () => {
    const buckets = parseReleaseNotes('新增 Android 壳和 npm run apk\n优化 状态栏透明\n修复 单文件打包白屏');
    expect(buckets.新增).toEqual(['Android 壳和 npm run apk']);
    expect(buckets.优化).toEqual(['状态栏透明']);
    expect(buckets.修复).toEqual(['单文件打包白屏']);
  });

  it('没有三类段落时检查失败', () => {
    expect(() => validateReleaseNotes('feat: bump version to v13.0.12')).toThrow('新增 / 优化 / 修复');
  });

  it('格式化成 GitHub Release Markdown', () => {
    const md = formatReleaseNotes({
      新增: ['Android 壳'],
      优化: [],
      修复: ['单文件打包白屏'],
    });
    expect(md).toBe('## 新增\n\n- Android 壳\n\n## 修复\n\n- 单文件打包白屏');
  });

  it('GitHub 正文带上 HTML 和 APK 下载说明', () => {
    const body = formatGithubReleaseBody('新增 Android 壳\n修复 白屏', {
      online: 'wan-v13.0.14-yes.html',
      offline: 'wan-v13.0.14-no.html',
      apk: 'web-manager-v13.0.14.apk',
    });
    expect(body).toContain('## 新增');
    expect(body).toContain('## 修复');
    expect(body).toContain('web-manager-v13.0.14.apk');
  });
});

describe('Release 工作流', () => {
  it('GitHub 只打包 HTML，APK 由本地上传', () => {
    const workflow = readFileSync(join(rootDir, '.github/workflows/release-single-html.yml'), 'utf8');
    expect(workflow).toContain('npm run build');
    expect(workflow).not.toContain('npm run apk');
    expect(workflow).not.toContain('setup-android');
    expect(workflow).toContain('scripts/release-notes.mjs');
    expect(workflow).toContain('wan-v${VERSION}-yes.html');
  });

  it('本地 APK 脚本清旧产物并上传 Release', () => {
    const src = readFileSync(join(rootDir, 'scripts/build-apk.js'), 'utf8');
    expect(src).toContain("join(androidDir, 'gradlew')");
    expect(src).toContain('cleanDistArtifacts');
    expect(src).toContain('uploadApkToRelease');
    expect(src).not.toContain('gradle-8.14.3-all');
  });
});
