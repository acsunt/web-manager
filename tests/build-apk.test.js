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

  it('分别打包 32 位和 64 位 APK', () => {
    expect(gradle).toContain("include 'armeabi-v7a', 'arm64-v8a'");
    expect(gradle).toContain('universalApk false');
    expect(gradle).toContain("abi == 'armeabi-v7a'");
    expect(gradle).toContain("abi == 'arm64-v8a'");
    expect(gradle).toContain("jniLibs.srcDirs = ['src/main/jniLibs']");
    expect(gradle).not.toContain('abiFilters');
    expect(gradle).not.toContain('externalNativeBuild');
    expect(existsSync(join(rootDir, 'android', 'app', 'src', 'main', 'cpp', 'native-lib.c'))).toBe(true);
    expect(existsSync(join(rootDir, 'android', 'app', 'src', 'main', 'jniLibs', 'armeabi-v7a', 'libwebmanager.so'))).toBe(true);
    expect(existsSync(join(rootDir, 'android', 'app', 'src', 'main', 'jniLibs', 'arm64-v8a', 'libwebmanager.so'))).toBe(true);
    const native = readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'cpp', 'native-lib.c'), 'utf8');
    expect(native).toContain('Java_com_webmanager_app_MainActivity_nativeAbi');
    const so32 = readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'jniLibs', 'armeabi-v7a', 'libwebmanager.so'));
    const so64 = readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'jniLibs', 'arm64-v8a', 'libwebmanager.so'));
    expect(so32.length).toBeGreaterThan(1000);
    expect(so64.length).toBeGreaterThan(1000);
    expect(so32.length).not.toBe(so64.length);
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
    expect(apkScript).toContain('web-manager-v${version}-32.apk');
    expect(apkScript).toContain('web-manager-v${version}-64.apk');
    expect(apkScript).toContain('buildNative');
    expect(apkScript).toContain('libwebmanager.so');
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
    expect(activity).toContain('tabs.setAppDarkMode(!light)');
    expect(activity).toContain('setOnScrollChangeListener');
    expect(activity).toContain('postVisualStateCallback');
    expect(activity).toContain('WebManagerChrome');
    expect(activity).toContain('browserBar.setPadding');
    expect(tabs).toContain('applyChromeColors(');
    expect(tabs).toContain('setAppDarkMode(');
    expect(tabs).toContain('applySheetChrome(');
    expect(tabs).toContain('JsDialogThemeDark');
    expect(tabs).toContain('tintBarButtons()');
    expect(tabs).toContain('toggleGroupsVisible(');
    expect(tabs).toContain('showGroupManager(');
    expect(tabs).toContain('toggleAllGroupsCollapsed(');
    expect(readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'res', 'layout', 'sheet_browser_tabs.xml'), 'utf8')).toContain('id="@+id/sheetManageGroups"');
    expect(readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'res', 'layout', 'sheet_browser_tabs.xml'), 'utf8')).toContain('id="@+id/sheetCollapseAll"');
    expect(readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'res', 'layout', 'sheet_browser_tabs.xml'), 'utf8')).toContain('id="@+id/sheetHeading"');
    expect(readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'res', 'layout', 'sheet_browser_groups.xml'), 'utf8')).toContain('id="@+id/manageGroupList"');
    expect(readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'res', 'layout', 'sheet_browser_groups.xml'), 'utf8')).toContain('id="@+id/manageGroupHeading"');
    expect(readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'res', 'values', 'styles.xml'), 'utf8')).toContain('JsDialogThemeDark');
    expect(readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'res', 'layout', 'item_browser_manage_group.xml'), 'utf8')).toContain('id="@+id/manageGroupHandle"');
    expect(bridge).toContain('public boolean openUrl(String url)');
    expect(bridge).toContain('public boolean openUrls(String json)');
    expect(activity).toContain('boolean openUrl(String url)');
    expect(activity).toContain('boolean openUrls(String json)');
    expect(activity).toContain('applyPageInsets()');
    expect(activity).toContain('setInsetSize(pageTopInset');
    expect(activity).toContain('tabs.handleBack()');
    expect(activity).toContain('JsChromeClient');
    expect(tabs).toContain('MAX_TABS = 50');
    expect(tabs).toContain('persistState()');
    expect(tabs).toContain('persistFullState()');
    expect(tabs).toContain('restoreState()');
    expect(tabs).toContain('setChromeVisible(');
    expect(tabs).toContain('saveWebViewState(');
    expect(tabs).toContain('restoreWebViewState(');
    expect(tabs).toContain('restoreViewState(');
    expect(tabs).toContain('updateViewState(');
    expect(tabs).toContain('pendingViewRestore');
    expect(activity).toContain('onViewState(');
    expect(activity).toContain('tabs.restoreViewState(view)');
    expect(main).toContain('importBookmarkHtml');
    expect(main).toContain('parseBookmarkHtml');
    expect(activity).toContain('handleIncomingIntent(');
    expect(activity).toContain('Intent.EXTRA_STREAM');
    expect(activity).toContain('setBrowserChromeVisible(');
    expect(activity).toContain('consumeImportFile(');
    expect(activity).toContain('copyHtmlToLocalFile(');
    expect(activity).toContain('imported-html');
    expect(activity).toContain('clearAppCache(');
    expect(activity).toContain('clearBrowserSession(');
    expect(bridge).toContain('public void setBrowserChromeVisible(boolean visible)');
    expect(bridge).toContain('public String consumeImportFile()');
    expect(bridge).toContain('public void clearAppCache()');
    expect(bridge).toContain('public void clearBrowserSession()');
    expect(main).toContain('importLocalHtmlPage');
    expect(main).toContain('clearRuntimeCache');
    expect(main).toContain('confirmClearSiteData');
    expect(main).toContain('openSelectiveClearModal');
    expect(main).toContain('filterSelectiveClearList');
    expect(main).toContain('onSelectiveClearCheckChange');
    expect(main).not.toContain("note: '由外部 HTML 导入'");
    expect(html).toContain('onclick="clearRuntimeCache()"');
    expect(html).toContain('onclick="confirmClearSiteData()"');
    expect(html).toContain('id="selectiveClearModal"');
    expect(html).toContain('id="selectiveClearSearch"');
    expect(html).toContain('selective-clear-modal');
    expect(html).toContain('class="selective-clear-hint"');
    expect(html).toContain('class="modal-actions"');
    expect(activity).toContain('System.loadLibrary("webmanager")');
    expect(bridge).toContain('public String getNativeAbi()');
    expect(readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'res', 'layout', 'sheet_browser_tabs.xml'), 'utf8')).toContain('id="@+id/sheetPinSelected"');
    expect(readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'res', 'layout', 'item_browser_sheet_tab.xml'), 'utf8')).toContain('id="@+id/sheetPin"');
    expect(readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'res', 'layout', 'item_browser_tab.xml'), 'utf8')).toContain('id="@+id/tabPin"');
    expect(main).toContain("id: 'browserWidgetBtn'");
    expect(main).toContain("name: '浏览器部件'");
    expect(main).toContain('consumeNativeImport');
    expect(main).toContain('importBackupFile');
    expect(main).toContain('setBrowserChromeVisible');
    expect(html).toContain('onclick="batchOpenSelected()"');
    expect(tabs).toContain('refreshActive()');
    expect(tabs).toContain('deleteGroup(');
    expect(tabs).toContain('promptRenameGroup(');
    expect(tabs).toContain('reorderGroups(');
    expect(tabs).toContain('reorderTabs(');
    expect(tabs).toContain('toggleSelectMode(');
    expect(tabs).toContain('toggleSortMode(');
    expect(tabs).toContain('reopenGroupTabs(');
    expect(tabs).toContain('closedPages');
    expect(readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'res', 'layout', 'sheet_browser_tabs.xml'), 'utf8')).toContain('id="@+id/sheetSelectMode"');
    expect(readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'res', 'layout', 'sheet_browser_tabs.xml'), 'utf8')).toContain('id="@+id/sheetSortMode"');
    expect(readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'res', 'layout', 'item_browser_sheet_tab.xml'), 'utf8')).toContain('id="@+id/sheetDelete"');
    expect(readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'res', 'layout', 'item_browser_sheet_group.xml'), 'utf8')).toContain('id="@+id/sheetGroupClose"');
    expect(readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'res', 'layout', 'item_browser_manage_group.xml'), 'utf8')).toContain('id="@+id/manageGroupOpen"');
    expect(tabs).toContain('toggleGroupCollapsed(');
    expect(tabs).toContain('confirmCloseGroup(');
    expect(tabs).toContain('closeGroupTabs(');
    expect(tabs).toContain('togglePinTab(');
    expect(tabs).toContain('togglePinTabs(');
    expect(tabs).toContain('obj.put("pinned"');
    expect(tabs).toContain('clearRuntimeCache()');
    expect(tabs).toContain('clearSession()');
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
    const manifest = readFileSync(join(rootDir, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
    expect(bridge).toContain('public boolean beginSaveFile');
    expect(bridge).toContain('public boolean appendSaveFile');
    expect(bridge).toContain('public boolean finishSaveFile');
    expect(ui).toContain('beginSaveFile');
    expect(ui).toContain('NATIVE_SAVE_CHUNK_BYTES');
    expect(activity).toContain('EXTRA_ALLOW_MULTIPLE');
    expect(activity).toContain('getClipData()');
    expect(activity).toContain('ACTION_OPEN_DOCUMENT');
    expect(activity).toContain('ACTION_GET_CONTENT');
    expect(activity).toContain('VERSION_CODES.Q');
    expect(activity).toContain('safeChooserMime');
    expect(activity).toContain('image/*');
    expect(activity).not.toContain('Intent.EXTRA_MIME_TYPES');
    expect(activity).not.toContain('fileChooserParams.createIntent()');
    expect(manifest).toContain('android.intent.action.GET_CONTENT');
    expect(manifest).toContain('android.intent.action.OPEN_DOCUMENT');
    expect(manifest).toContain('android.intent.action.VIEW');
    expect(manifest).toContain('android.intent.action.SEND');
    expect(manifest).toContain('android:launchMode="singleTask"');
    expect(manifest).toContain('application/json');
    expect(manifest).toContain('application/zip');
    expect(manifest).toContain('text/html');
    expect(manifest).toContain('.*\\\\.html');
    expect(manifest).toContain('.*\\\\.htm');
    expect(html).toContain('accept=".json,.zip,.html,.htm,text/html"');
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
