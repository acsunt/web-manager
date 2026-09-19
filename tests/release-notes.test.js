import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatGithubReleaseBody, formatReleaseNotes, parseReleaseNotes, previousVersionTag, validateReleaseNotes } from '../scripts/release-notes.mjs';

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

  it('GitHub 说明只取当前版本相对上一 PATCH 的提交，不沿用本地旧 tag', () => {
    expect(previousVersionTag('13.0.30')).toBe('v13.0.29');
    expect(previousVersionTag('13.0.1')).toBe('v13.0.0');
    expect(previousVersionTag('13.0.0')).toBe('');
    const src = readFileSync(join(rootDir, 'scripts/release-notes.mjs'), 'utf8');
    expect(src).toContain('previousVersionTag(readTitleVersion())');
    expect(src).toContain('git fetch origin tag ${tag} --no-tags');
    expect(src).not.toContain('git describe --tags --abbrev=0 HEAD^');
  });

  it('GitHub 正文带上 HTML 和 APK 下载说明', () => {
    const body = formatGithubReleaseBody('新增 Android 壳\n修复 白屏', {
      online: 'wan-v13.0.14-yes.html',
      offline: 'wan-v13.0.14-no.html',
      apk32: 'web-manager-v13.0.14-32.apk',
      apk64: 'web-manager-v13.0.14-64.apk',
    });
    expect(body).toContain('## 新增');
    expect(body).toContain('## 修复');
    expect(body).toContain('web-manager-v13.0.14-32.apk');
    expect(body).toContain('web-manager-v13.0.14-64.apk');
  });
});

describe('Release 工作流', () => {
  it('GitHub 不再打包 HTML，产物由本地 npm run apk 上传', () => {
    const upload = readFileSync(join(rootDir, 'scripts/upload-apk.js'), 'utf8');
    expect(upload).toContain('wan-v${version}-yes.html');
    expect(upload).toContain('wan-v${version}-no.html');
    expect(upload).toContain('web-manager-v${version}-32.apk');
    expect(upload).toContain('web-manager-v${version}-64.apk');
    expect(upload).toContain("['release', 'create'");
    expect(upload).toContain('uploadDistToRelease');
  });

  it('本地 APK 脚本顺带打包 HTML，并使用本机已有的 gradle-8.14.3-all', () => {
    const src = readFileSync(join(rootDir, 'scripts/build-apk.js'), 'utf8');
    const wrapper = readFileSync(join(rootDir, 'android/gradle/wrapper/gradle-wrapper.properties'), 'utf8');
    expect(src).toContain("join(androidDir, 'gradlew')");
    expect(src).toContain('build-single-html.js');
    expect(src).toContain('cleanDistArtifacts');
    expect(src).toContain('uploadDistToRelease');
    expect(src).toContain('gradle-8.14.3-all');
    expect(wrapper).toContain('gradle-8.14.3-all.zip');
    expect(wrapper).not.toContain('gradle-8.14.3-bin.zip');
  });
});
