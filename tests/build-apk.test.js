import { existsSync, readFileSync } from 'node:fs';
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

  it('仓库带 Gradle Wrapper，本地打包不必另装 Gradle', () => {
    expect(existsSync(join(rootDir, 'android', 'gradlew'))).toBe(true);
    expect(existsSync(join(rootDir, 'android', 'gradlew.bat'))).toBe(true);
    expect(existsSync(join(rootDir, 'android', 'gradle', 'wrapper', 'gradle-wrapper.jar'))).toBe(true);
  });

  it('Wrapper 使用本机已有的 gradle-8.14.3-all，不另下 bin 发行包', () => {
    const wrapper = readFileSync(join(rootDir, 'android', 'gradle', 'wrapper', 'gradle-wrapper.properties'), 'utf8');
    const apkScript = readFileSync(join(rootDir, 'scripts', 'build-apk.js'), 'utf8');
    expect(wrapper).toContain('gradle-8.14.3-all.zip');
    expect(wrapper).not.toContain('gradle-8.14.3-bin.zip');
    expect(apkScript).toContain('gradle-8.14.3-all');
  });

  it('本地打包默认输出 dist/', () => {
    const apkScript = readFileSync(join(rootDir, 'scripts', 'build-apk.js'), 'utf8');
    const htmlScript = readFileSync(join(rootDir, 'scripts', 'build-single-html.js'), 'utf8');
    expect(apkScript).toContain("join(rootDir, 'dist')");
    expect(apkScript).toContain('web-manager-v${version}.apk');
    expect(htmlScript).toContain("join(rootDir, 'dist')");
    expect(htmlScript).toContain('dist/${onlineName}');
    expect(htmlScript).toContain('dist/${offlineName}');
  });

  it('离线依赖从 vendor/ 读取，不在打包时下载', () => {
    const htmlScript = readFileSync(join(rootDir, 'scripts', 'build-single-html.js'), 'utf8');
    expect(htmlScript).toContain('loadOfflineVendor');
    expect(htmlScript).not.toContain('正在下载离线依赖');
  });

  it('APK 复制走原生剪贴板，不依赖 file:// 下的 Clipboard API', () => {
    const main = readFileSync(join(rootDir, 'main.js'), 'utf8');
    const ui = readFileSync(join(rootDir, 'ui.js'), 'utf8');
    const bridge = readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'java', 'com', 'webmanager', 'app', 'PageInfoBridge.java'), 'utf8');
    expect(bridge).toContain('public boolean copyText(String text)');
    expect(bridge).toContain('ClipboardManager');
    expect(ui).toContain('window.Android?.copyText');
    expect(main).toContain('copyTextToClipboard');
    expect(main).not.toContain('navigator.clipboard.writeText');
  });

  it('APK 打开网页留在应用内独立层，返回键先关掉网页', () => {
    const main = readFileSync(join(rootDir, 'main.js'), 'utf8');
    const layout = readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'res', 'layout', 'activity_main.xml'), 'utf8');
    const bridge = readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'java', 'com', 'webmanager', 'app', 'PageInfoBridge.java'), 'utf8');
    const activity = readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'java', 'com', 'webmanager', 'app', 'MainActivity.java'), 'utf8');
    const dialog = readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'java', 'com', 'webmanager', 'app', 'JsDialog.java'), 'utf8');
    const tabs = readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'java', 'com', 'webmanager', 'app', 'BrowserTabsController.java'), 'utf8');
    expect(layout).toContain('pageTopInset');
    expect(layout).toContain('pageBottomInset');
    expect(layout).toContain('pageWebHost');
    expect(layout).toContain('refreshBtn');
    expect(layout).toContain('tabStrip');
    expect(layout).toContain('restoreTabsBtn');
    expect(layout).toContain('categoryBtn');
    expect(layout).toContain('显示分类');
    expect(activity).toContain('refreshPageChrome(');
    expect(activity).toContain('samplePageColors(');
    expect(activity).toContain('PixelCopy.request');
    expect(activity).toContain('applyPageChromeColors(');
    expect(activity).toContain('browserBar.setBackgroundColor(pageBottomColor)');
    expect(activity).toContain('setOnScrollChangeListener');
    expect(activity).toContain('postVisualStateCallback');
    expect(activity).toContain('WebManagerChrome');
    expect(activity).toContain('browserBar.setPadding');
    expect(tabs).toContain('applyChromeColors(');
    expect(tabs).toContain('tintBarButtons()');
    expect(tabs).toContain('toggleGroupsVisible(');
    expect(tabs).toContain('showGroupManager(');
    expect(tabs).toContain('toggleAllGroupsCollapsed(');
    expect(readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'res', 'layout', 'sheet_browser_tabs.xml'), 'utf8')).toContain('id="@+id/sheetManageGroups"');
    expect(readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'res', 'layout', 'sheet_browser_tabs.xml'), 'utf8')).toContain('id="@+id/sheetCollapseAll"');
    expect(readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'res', 'layout', 'sheet_browser_groups.xml'), 'utf8')).toContain('id="@+id/manageGroupList"');
    expect(readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'res', 'layout', 'item_browser_manage_group.xml'), 'utf8')).toContain('id="@+id/manageGroupHandle"');
    expect(bridge).toContain('public boolean openUrl(String url)');
    expect(bridge).toContain('public boolean openUrls(String json)');
    expect(activity).toContain('boolean openUrl(String url)');
    expect(activity).toContain('boolean openUrls(String json)');
    expect(activity).toContain('applyPageInsets()');
    expect(activity).toContain('setInsetSize(pageTopInset');
    expect(activity).toContain('tabs.handleBack()');
    expect(activity).toContain('JsChromeClient');
    expect(tabs).toContain('MAX_TABS = 12');
    expect(tabs).toContain('refreshActive()');
    expect(tabs).toContain('deleteGroup(');
    expect(tabs).toContain('promptRenameGroup(');
    expect(tabs).toContain('reorderGroups(');
    expect(tabs).toContain('reorderTabs(');
    expect(tabs).toContain('toggleSelectVisible(');
    expect(tabs).toContain('toggleGroupCollapsed(');
    expect(tabs).toContain('confirmCloseGroup(');
    expect(tabs).toContain('closeGroupTabs(');
    expect(tabs).toContain('sheetSearch');
    expect(tabs).toContain('target.startsWith("file://")');
    expect(activity).toContain('target.startsWith("file://")');
    expect(activity).toContain('setAllowFileAccessFromFileURLs(true)');
    expect(readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'res', 'layout', 'sheet_browser_tabs.xml'), 'utf8')).toContain('id="@+id/sheetSearch"');
    expect(readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'res', 'layout', 'sheet_browser_tabs.xml'), 'utf8')).toContain('id="@+id/sheetSelectAll"');
    expect(readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'res', 'layout', 'item_browser_sheet_tab.xml'), 'utf8')).toContain('id="@+id/sheetTabHandle"');
    expect(readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'res', 'layout', 'item_browser_sheet_group.xml'), 'utf8')).toContain('id="@+id/sheetGroupToggle"');
    expect(readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'res', 'drawable', 'ic_browser_move.xml'), 'utf8')).toContain('h-8l-2,-2H4');
    expect(main).toContain('rememberSearchQuery');
    expect(main).toContain('handleSearchKeydown');
    expect(html).toContain('onkeydown="handleSearchKeydown(event)"');
    expect(readFileSync(join(rootDir, 'style.css'), 'utf8')).toContain('-webkit-touch-callout: none');
    expect(bridge).toContain('public void alert(String message)');
    expect(bridge).toContain('public boolean confirm(String message)');
    expect(dialog).not.toContain('网页显示');
    expect(main).toContain('installNativeDialogs');
    expect(main).toContain('window.Android.openUrl');
    expect(main).toContain('window.Android.openUrls');
    expect(main).toContain('batchOpenSelected');
    expect(main).toContain('openCategoryPages');
    expect(main).toContain("window.open(url, '_blank')");
    expect(main).toContain('window.location.href = url');
    expect(html).toContain('onclick="batchOpenSelected()"');
    expect(html).toContain('id="openPagesMenuItem"');
  });

  it('APK 导出分块写文件，并支持多选导入', () => {
    const ui = readFileSync(join(rootDir, 'ui.js'), 'utf8');
    const bridge = readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'java', 'com', 'webmanager', 'app', 'PageInfoBridge.java'), 'utf8');
    const activity = readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'java', 'com', 'webmanager', 'app', 'MainActivity.java'), 'utf8');
    expect(bridge).toContain('public boolean beginSaveFile');
    expect(bridge).toContain('public boolean appendSaveFile');
    expect(bridge).toContain('public boolean finishSaveFile');
    expect(ui).toContain('beginSaveFile');
    expect(ui).toContain('NATIVE_SAVE_CHUNK_BYTES');
    expect(activity).toContain('EXTRA_ALLOW_MULTIPLE');
    expect(activity).toContain('getClipData()');
  });

  it('分类新增编辑不显示识别名称，HTML 与 APK 共用同一源码', () => {
    const main = readFileSync(join(rootDir, 'main.js'), 'utf8');
    expect(html).toContain('id="recognizedNameGroup"');
    expect(html).toMatch(/id="recognizedNameGroup"[^>]*style="display: none;/);
    expect(main).toContain("recognizedGroup.style.display = type === 'page' ? 'block' : 'none'");
    expect(main).toContain("recognizedGroup.style.display = node.type === 'page' ? 'block' : 'none'");
    expect(main).toContain("currentType === 'page' && autoOverwrite && recognizedRaw");
    expect(readFileSync(join(rootDir, 'scripts', 'build-apk.js'), 'utf8')).toContain('copyHtmlIntoAssets');
  });
});
