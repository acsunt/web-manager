import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readVersion, versionCodeFrom } from '../scripts/build-apk.js';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(rootDir, 'index.html'), 'utf8');
const gradle = readFileSync(join(rootDir, 'android', 'app', 'build.gradle'), 'utf8');
const theme = readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'res', 'values', 'themes.xml'), 'utf8');
const titleVersion = html.match(/<title>[^<]*\bv(\d+\.\d+\.\d+)\b/)[1];

describe('APK 版本号', () => {
  it('versionName 与网页标题数字部分相同', () => {
    expect(readVersion()).toBe(titleVersion);
  });

  it('versionCode 随 PATCH 递增', () => {
    expect(versionCodeFrom('13.0.11')).toBe(130011);
    expect(versionCodeFrom('13.0.12')).toBe(130012);
  });

  it('Gradle 直接读 index.html 标题，不回退 0.0.0', () => {
    expect(gradle).toContain('../index.html');
    expect(gradle).toContain('appVersionName = versionMatcher.group(1)');
    expect(gradle).not.toContain("getProperty('versionName', '0.0.0')");
  });

  it('系统栏颜色透明，页面可以画到状态栏和导航栏后面', () => {
    expect(theme).toContain('android:statusBarColor">@android:color/transparent');
    expect(theme).toContain('android:navigationBarColor">@android:color/transparent');
  });
});
