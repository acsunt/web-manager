package com.webmanager.app;

import android.app.Dialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.PorterDuff;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Parcel;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.DragEvent;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Set;
import java.util.UUID;

final class BrowserTabsController {
    static final int MAX_TABS = 50;
    static final String UNGROUPED = "";

    private final MainActivity activity;
    private final FrameLayout host;
    private final LinearLayout groupStrip;
    private final LinearLayout tabStrip;
    private final LinearLayout tabOverflowStrip;
    private final HorizontalScrollView groupScroll;
    private final HorizontalScrollView tabOverflowScroll;
    private final ImageButton categoryBtn;
    private final ImageButton homeBtn;
    private final ImageButton refreshBtn;
    private final ImageButton desktopBtn;
    private final ImageButton pagesBtn;
    private final View tabsBtn;
    private final TextView tabsCount;
    private final View restoreBtn;
    private final View browserBar;
    private final LayoutInflater inflater;

    private final List<Group> groups = new ArrayList<>();
    private final List<Tab> tabs = new ArrayList<>();
    private final Set<String> selectedIds = new HashSet<>();
    private final Set<String> collapsedGroupIds = new HashSet<>();
    private String activeTabId;
    private String activeGroupId = UNGROUPED;
    private Dialog sheetDialog;
    private Dialog groupDialog;
    private boolean groupsVisible;
    private boolean chromeVisible;
    private boolean pagesVisible;
    private boolean extrasVisible = true;
    private boolean restoring;
    private String sheetQuery = "";
    private boolean selectMode;
    private boolean sortMode;
    private boolean appDarkMode;
    private int chromeColor = 0;
    private int chromeText = Color.parseColor("#2C3E50");
    private int chromeMuted = Color.parseColor("#8A97A5");
    private int chromeChip = Color.parseColor("#F3F5F7");
    private int chromeChipActive = Color.parseColor("#E8F2FF");
    private int chromeAccent = Color.parseColor("#007BFF");
    private static final String DRAG_GROUP = "browser-group";
    private static final String DRAG_TAB = "browser-tab";
    private static final int SHEET_TEXT_LIGHT = Color.parseColor("#2C3E50");
    private static final int SHEET_TEXT_DARK = Color.parseColor("#E0E0E0");
    private static final int SHEET_MUTED_LIGHT = Color.parseColor("#8A97A5");
    private static final int SHEET_MUTED_DARK = Color.parseColor("#A0A0A0");
    private static final int SHEET_ACCENT_LIGHT = Color.parseColor("#007BFF");
    private static final int SHEET_ACCENT_DARK = Color.parseColor("#4DABF7");
    private static final int SHEET_SURFACE_LIGHT = Color.WHITE;
    private static final int SHEET_SURFACE_DARK = Color.parseColor("#2C2C2C");
    private static final int SHEET_INPUT_LIGHT = Color.parseColor("#F3F5F7");
    private static final int SHEET_INPUT_DARK = Color.parseColor("#1E1E1E");
    private static final int SHEET_DANGER = Color.parseColor("#DC3545");
    private static final String PREFS = "browser_tabs";
    private static final String PREF_STATE = "state";
    private static final String PREF_CHROME = "chromeVisible";
    private static final String PREF_PAGES = "pagesVisible";
    private static final String PREF_EXTRAS = "extrasVisible";
    private static final String STATE_DIR = "browser_tab_state";
    private static final String DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    BrowserTabsController(MainActivity activity) {
        this.activity = activity;
        this.host = activity.findViewById(R.id.pageWebHost);
        this.groupStrip = activity.findViewById(R.id.groupStrip);
        this.tabStrip = activity.findViewById(R.id.tabStrip);
        this.tabOverflowStrip = activity.findViewById(R.id.tabOverflowStrip);
        this.groupScroll = activity.findViewById(R.id.groupScroll);
        this.tabOverflowScroll = activity.findViewById(R.id.tabOverflowScroll);
        this.categoryBtn = activity.findViewById(R.id.categoryBtn);
        this.homeBtn = activity.findViewById(R.id.homeBtn);
        this.refreshBtn = activity.findViewById(R.id.refreshBtn);
        this.desktopBtn = activity.findViewById(R.id.desktopBtn);
        this.pagesBtn = activity.findViewById(R.id.pagesBtn);
        this.tabsBtn = activity.findViewById(R.id.tabsBtn);
        this.tabsCount = activity.findViewById(R.id.tabsCount);
        this.restoreBtn = activity.findViewById(R.id.restoreTabsBtn);
        this.browserBar = activity.findViewById(R.id.browserBar);
        this.inflater = LayoutInflater.from(activity);
        if (homeBtn != null) homeBtn.setOnClickListener(v -> hideOverlay());
        if (refreshBtn != null) refreshBtn.setOnClickListener(v -> refreshActive());
        if (tabsBtn != null) {
            tabsBtn.setOnClickListener(v -> showSheet());
            tabsBtn.setOnLongClickListener(v -> {
                toggleExtrasVisible();
                return true;
            });
        }
        if (categoryBtn != null) categoryBtn.setOnClickListener(v -> toggleGroupsVisible());
        if (desktopBtn != null) desktopBtn.setOnClickListener(v -> toggleDesktopActive());
        if (pagesBtn != null) pagesBtn.setOnClickListener(v -> togglePagesVisible());
        if (restoreBtn != null) restoreBtn.setOnClickListener(v -> restoreOverlay());
        SharedPreferences prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        chromeVisible = prefs.getBoolean(PREF_CHROME, false);
        pagesVisible = prefs.getBoolean(PREF_PAGES, false);
        extrasVisible = prefs.getBoolean(PREF_EXTRAS, true);
        applyChromeVisible();
        applyExtrasVisible();
    }

    boolean hasTabs() {
        return !tabs.isEmpty();
    }

    boolean openUrl(String url, String title) {
        return openPages("", singletonPages(title, url));
    }

    boolean openUrls(String json) {
        try {
            JSONObject obj = json == null || json.trim().isEmpty() ? new JSONObject() : new JSONObject(json);
            String group = obj.optString("group", "");
            JSONArray pages = obj.optJSONArray("pages");
            List<PageSpec> specs = new ArrayList<>();
            if (pages != null) {
                for (int i = 0; i < pages.length(); i++) {
                    JSONObject page = pages.optJSONObject(i);
                    if (page == null) continue;
                    specs.add(new PageSpec(page.optString("title", ""), page.optString("url", "")));
                }
            }
            return openPages(group, specs);
        } catch (Exception ignored) {
            return false;
        }
    }

    boolean openPages(String groupName, List<PageSpec> specs) {
        List<PageSpec> valid = new ArrayList<>();
        if (specs != null) {
            for (PageSpec spec : specs) {
                if (spec == null) continue;
                String url = normalizeUrl(spec.url);
                if (url == null) continue;
                valid.add(new PageSpec(spec.title, url));
            }
        }
        if (valid.isEmpty()) return false;

        String groupId = UNGROUPED;
        if (groupName != null && !groupName.trim().isEmpty()) {
            groupId = ensureGroup(groupName.trim());
        }
        int opened = 0;
        Tab last = null;
        for (PageSpec spec : valid) {
            Tab existing = findTabByUrl(spec.url, groupId);
            if (existing != null) {
                last = existing;
                continue;
            }
            if (tabs.size() >= MAX_TABS) break;
            last = addTab(spec.title, spec.url, groupId);
            opened++;
        }
        if (last == null) return false;
        activeGroupId = groupId;
        showTab(last.id);
        if (opened == 0 && valid.size() > 1) {
            toast("这些网页已经打开");
        } else if (opened < valid.size()) {
            toast("最多同时打开 " + MAX_TABS + " 个网页");
        }
        return true;
    }

    boolean handleBack() {
        Tab tab = activeTab();
        if (tab != null && tab.webView != null && tab.webView.canGoBack()) {
            tab.webView.goBack();
            return true;
        }
        if (activity.isPageOpen()) {
            hideOverlay();
            return true;
        }
        return false;
    }

    void hideOverlay() {
        pauseAll();
        activity.setPageWindow(false);
        persistState();
    }

    void restoreOverlay() {
        Tab tab = activeTab();
        if (tab == null && !tabs.isEmpty()) tab = tabs.get(0);
        if (tab != null) showTab(tab.id);
    }

    void syncRestoreButton(boolean overlayVisible) {
        if (restoreBtn == null) return;
        restoreBtn.setVisibility(chromeVisible && !overlayVisible && hasTabs() ? View.VISIBLE : View.GONE);
    }

    void setChromeVisible(boolean visible) {
        chromeVisible = visible;
        activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(PREF_CHROME, visible)
                .apply();
        applyChromeVisible();
    }

    void applyChromeVisible() {
        if (browserBar != null) browserBar.setVisibility(chromeVisible ? View.VISIBLE : View.GONE);
        syncRestoreButton(activity.isPageOpen());
    }

    void persistState() {
        persistState(false);
    }

    void persistFullState() {
        persistState(true);
    }

    private void persistState(boolean includeWebViews) {
        if (restoring) return;
        try {
            JSONObject root = new JSONObject();
            JSONArray groupArr = new JSONArray();
            for (Group group : groups) {
                JSONObject obj = new JSONObject();
                obj.put("id", group.id);
                obj.put("name", group.name);
                JSONArray closedArr = new JSONArray();
                for (ClosedPage page : group.closedPages) {
                    JSONObject closed = new JSONObject();
                    closed.put("title", page.title == null ? "" : page.title);
                    closed.put("url", page.url == null ? "" : page.url);
                    closed.put("pinned", page.pinned);
                    closed.put("desktop", page.desktop);
                    closedArr.put(closed);
                }
                obj.put("closedPages", closedArr);
                groupArr.put(obj);
            }
            Set<String> keepIds = new HashSet<>();
            JSONArray tabArr = new JSONArray();
            for (Tab tab : tabs) {
                if (tab.webView != null) {
                    String current = tab.webView.getUrl();
                    if (current != null && !current.trim().isEmpty() && !"about:blank".equalsIgnoreCase(current)) {
                        String normalized = normalizeUrl(current);
                        tab.url = normalized == null ? current : normalized;
                    }
                    captureNativeScroll(tab);
                }
                JSONObject obj = new JSONObject();
                obj.put("id", tab.id);
                obj.put("title", tab.title == null ? "" : tab.title);
                obj.put("url", tab.url == null ? "" : tab.url);
                obj.put("groupId", tab.groupId == null ? UNGROUPED : tab.groupId);
                obj.put("scrollX", tab.scrollX);
                obj.put("scrollY", tab.scrollY);
                obj.put("pinned", tab.pinned);
                obj.put("desktop", tab.desktop);
                obj.put("viewState", tab.viewStateJson == null ? "" : tab.viewStateJson);
                tabArr.put(obj);
                keepIds.add(tab.id);
                if (includeWebViews && tab.webView != null) saveWebViewState(tab);
            }
            if (includeWebViews) pruneStateFiles(keepIds);
            root.put("groups", groupArr);
            root.put("tabs", tabArr);
            root.put("activeTabId", activeTabId == null ? "" : activeTabId);
            root.put("activeGroupId", activeGroupId == null ? UNGROUPED : activeGroupId);
            root.put("groupsVisible", groupsVisible);
            root.put("pageOpen", activity.isPageOpen());
            activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putString(PREF_STATE, root.toString())
                    .apply();
        } catch (Exception ignored) {
        }
    }

    void restoreState() {
        restoring = true;
        try {
            String json = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(PREF_STATE, "");
            if (json == null || json.trim().isEmpty()) return;
            JSONObject root = new JSONObject(json);
            groups.clear();
            JSONArray groupArr = root.optJSONArray("groups");
            if (groupArr != null) {
                for (int i = 0; i < groupArr.length(); i++) {
                    JSONObject obj = groupArr.optJSONObject(i);
                    if (obj == null) continue;
                    Group group = new Group();
                    group.id = obj.optString("id", UUID.randomUUID().toString());
                    group.name = obj.optString("name", "");
                    if (group.name.trim().isEmpty()) continue;
                    JSONArray closedArr = obj.optJSONArray("closedPages");
                    if (closedArr != null) {
                        for (int j = 0; j < closedArr.length(); j++) {
                            JSONObject closed = closedArr.optJSONObject(j);
                            if (closed == null) continue;
                            String closedUrl = closed.optString("url", "");
                            if (closedUrl.trim().isEmpty()) continue;
                            group.closedPages.add(new ClosedPage(
                                    closed.optString("title", ""),
                                    closedUrl,
                                    closed.optBoolean("pinned", false),
                                    closed.optBoolean("desktop", false)
                            ));
                        }
                    }
                    groups.add(group);
                }
            }
            JSONArray tabArr = root.optJSONArray("tabs");
            if (tabArr != null) {
                for (int i = 0; i < tabArr.length() && tabs.size() < MAX_TABS; i++) {
                    JSONObject obj = tabArr.optJSONObject(i);
                    if (obj == null) continue;
                    String url = obj.optString("url", "");
                    if (url.trim().isEmpty()) continue;
                    Tab tab = new Tab();
                    tab.id = obj.optString("id", UUID.randomUUID().toString());
                    tab.title = obj.optString("title", hostTitle(url));
                    tab.url = url;
                    tab.groupId = obj.optString("groupId", UNGROUPED);
                    tab.scrollX = obj.optInt("scrollX", 0);
                    tab.scrollY = obj.optInt("scrollY", 0);
                    tab.pinned = obj.optBoolean("pinned", false);
                    tab.desktop = obj.optBoolean("desktop", false);
                    tab.viewStateJson = obj.optString("viewState", "");
                    tab.pendingViewRestore = true;
                    tab.webView = activity.createPageWebView();
                    applyDesktopMode(tab);
                    attachWebView(tab);
                    if (!restoreWebViewState(tab)) tab.webView.loadUrl(url);
                    tabs.add(tab);
                }
            }
            sortTabsByPin();
            activeTabId = root.optString("activeTabId", "");
            activeGroupId = root.optString("activeGroupId", UNGROUPED);
            groupsVisible = root.optBoolean("groupsVisible", false);
            boolean pageOpen = root.optBoolean("pageOpen", false);
            if (findTabById(activeTabId) == null && !tabs.isEmpty()) activeTabId = tabs.get(0).id;
            Tab active = findTabById(activeTabId);
            if (active != null) activeGroupId = active.groupId == null ? UNGROUPED : active.groupId;
            applyChromeVisible();
            renderStrips();
            if (pageOpen && active != null) showTab(active.id);
            else {
                pauseAll();
                activity.setPageWindow(false);
            }
        } catch (Exception ignored) {
        } finally {
            restoring = false;
        }
    }

    private File stateDir() {
        return new File(activity.getFilesDir(), STATE_DIR);
    }

    private File stateFile(String tabId) {
        return new File(stateDir(), tabId + ".bin");
    }

    private void saveWebViewState(Tab tab) {
        try {
            captureNativeScroll(tab);
            Bundle bundle = new Bundle();
            tab.webView.saveState(bundle);
            Parcel parcel = Parcel.obtain();
            bundle.writeToParcel(parcel, 0);
            byte[] bytes = parcel.marshall();
            parcel.recycle();
            File dir = stateDir();
            if (!dir.exists()) dir.mkdirs();
            try (FileOutputStream out = new FileOutputStream(stateFile(tab.id))) {
                out.write(bytes);
            }
        } catch (Exception ignored) {
        }
    }

    private boolean restoreWebViewState(Tab tab) {
        File file = stateFile(tab.id);
        if (!file.exists()) return false;
        Parcel parcel = Parcel.obtain();
        try (FileInputStream in = new FileInputStream(file)) {
            byte[] bytes = new byte[(int) file.length()];
            int offset = 0;
            while (offset < bytes.length) {
                int read = in.read(bytes, offset, bytes.length - offset);
                if (read < 0) break;
                offset += read;
            }
            parcel.unmarshall(bytes, 0, offset);
            parcel.setDataPosition(0);
            Bundle bundle = Bundle.CREATOR.createFromParcel(parcel);
            bundle.setClassLoader(WebView.class.getClassLoader());
            boolean restored = tab.webView.restoreState(bundle) != null;
            if (restored) tab.pendingViewRestore = true;
            return restored;
        } catch (Exception ignored) {
            return false;
        } finally {
            parcel.recycle();
        }
    }

    private void pruneStateFiles(Set<String> keepIds) {
        File dir = stateDir();
        if (!dir.exists()) dir.mkdirs();
        File[] files = dir.listFiles();
        if (files == null) return;
        for (File file : files) {
            String name = file.getName();
            if (!name.endsWith(".bin")) continue;
            String id = name.substring(0, name.length() - 4);
            if (!keepIds.contains(id)) file.delete();
        }
    }

    void refreshActive() {
        Tab tab = activeTab();
        if (tab != null && tab.webView != null) tab.webView.reload();
    }

    void setAppDarkMode(boolean dark) {
        if (appDarkMode == dark) return;
        appDarkMode = dark;
        if (sheetDialog != null && sheetDialog.isShowing()) renderSheet(sheetDialog);
        if (groupDialog != null && groupDialog.isShowing()) renderGroupManager(groupDialog);
    }

    void applyChromeColors(int color) {
        if (color == chromeColor) {
            tintBarButtons();
            return;
        }
        chromeColor = color;
        boolean light = isLightColor(color);
        chromeText = light ? Color.parseColor("#2C3E50") : Color.WHITE;
        chromeMuted = light ? Color.parseColor("#8A97A5") : Color.parseColor("#B8C0C8");
        chromeAccent = light ? Color.parseColor("#007BFF") : Color.parseColor("#7AB8FF");
        chromeChip = mix(color, light ? Color.BLACK : Color.WHITE, light ? 0.08f : 0.18f);
        chromeChipActive = mix(color, Color.parseColor("#007BFF"), light ? 0.16f : 0.28f);
        tintBarButtons();
        restyleStrips();
    }

    void closeWindow(WebView window) {
        Tab tab = findTab(window);
        if (tab != null) closeTab(tab.id);
    }

    void updateTitle(WebView view, String title) {
        Tab tab = findTab(view);
        if (tab == null || title == null) return;
        String trimmed = title.trim();
        if (trimmed.isEmpty() || "about:blank".equalsIgnoreCase(trimmed)) return;
        tab.title = trimmed;
        renderStrips();
        if (sheetDialog != null && sheetDialog.isShowing()) renderSheet(sheetDialog);
    }

    void updateUrl(WebView view, String url) {
        Tab tab = findTab(view);
        if (tab == null) return;
        String normalized = normalizeUrl(url);
        if (normalized != null) tab.url = normalized;
        renderStrips();
    }

    void updateViewState(WebView view, String json) {
        Tab tab = findTab(view);
        if (tab == null || tab.pendingViewRestore || json == null || json.trim().isEmpty()) return;
        tab.viewStateJson = json;
        try {
            JSONObject obj = new JSONObject(json);
            tab.scrollX = obj.optInt("x", tab.scrollX);
            tab.scrollY = obj.optInt("y", tab.scrollY);
        } catch (Exception ignored) {
        }
    }

    void restoreViewState(WebView view) {
        Tab tab = findTab(view);
        if (tab == null || tab.webView == null || !tab.pendingViewRestore) return;
        String url = tab.webView.getUrl();
        if (url == null || url.trim().isEmpty() || "about:blank".equalsIgnoreCase(url)) return;
        String json = tab.viewStateJson;
        if (json == null || json.trim().isEmpty()) {
            if (tab.scrollX == 0 && tab.scrollY == 0) {
                applyNativeScroll(tab);
                tab.pendingViewRestore = false;
                return;
            }
            json = "{\"x\":" + tab.scrollX + ",\"y\":" + tab.scrollY + "}";
        }
        String script = "(function(s){function apply(){try{window.scrollTo(s.x||0,s.y||0);"
                + "if(s.overflow){var nodes=document.querySelectorAll('*');"
                + "for(var i=0;i<s.overflow.length;i++){var item=s.overflow[i];var el=nodes[item.i];"
                + "if(el){el.scrollLeft=item.x||0;el.scrollTop=item.y||0;}}}}catch(e){}}"
                + "apply();setTimeout(apply,300);setTimeout(apply,900);})(" + json + ");";
        tab.webView.evaluateJavascript(script, null);
        applyNativeScroll(tab);
        tab.webView.postDelayed(() -> tab.pendingViewRestore = false, 1200);
    }

    private void captureNativeScroll(Tab tab) {
        if (tab == null || tab.webView == null) return;
        if (tab.viewStateJson == null || tab.viewStateJson.trim().isEmpty()) {
            tab.scrollX = tab.webView.getScrollX();
            tab.scrollY = tab.webView.getScrollY();
        }
    }

    private void applyNativeScroll(Tab tab) {
        if (tab == null || tab.webView == null) return;
        tab.webView.scrollTo(tab.scrollX, tab.scrollY);
        tab.webView.postDelayed(() -> {
            if (tab.webView != null) tab.webView.scrollTo(tab.scrollX, tab.scrollY);
        }, 300);
    }

    Tab addPopupTab(WebView webView) {
        if (tabs.size() >= MAX_TABS) {
            toast("最多同时打开 " + MAX_TABS + " 个网页");
            return null;
        }
        Tab tab = new Tab();
        tab.id = UUID.randomUUID().toString();
        tab.title = "新网页";
        tab.url = "";
        tab.groupId = activeGroupId == null ? UNGROUPED : activeGroupId;
        tab.webView = webView;
        applyDesktopMode(tab);
        attachWebView(tab);
        insertTab(tab);
        showTab(tab.id);
        return tab;
    }

    void destroyAll() {
        dismissSheet();
        dismissGroupManager();
        for (Tab tab : new ArrayList<>(tabs)) destroyTab(tab);
        tabs.clear();
        groups.clear();
        selectedIds.clear();
        collapsedGroupIds.clear();
        groupsVisible = false;
        activeTabId = null;
        activeGroupId = UNGROUPED;
        host.removeAllViews();
        renderStrips();
    }

    void clearRuntimeCache() {
        for (Tab tab : tabs) {
            if (tab.webView != null) {
                tab.webView.clearCache(true);
                tab.webView.clearFormData();
            }
        }
    }

    void clearSession() {
        destroyAll();
        pruneStateFiles(new HashSet<String>());
        persistFullState();
        activity.setPageWindow(false);
    }

    WebView findWebViewForOrigin(String origin) {
        if (origin == null || origin.isEmpty()) return null;
        for (Tab tab : tabs) {
            if (tab.webView == null) continue;
            String current = tab.url == null ? "" : tab.url.trim();
            String loaded = tab.webView.getUrl() == null ? "" : tab.webView.getUrl().trim();
            if (origin.equals(activity.originOf(current)) || origin.equals(activity.originOf(loaded))) {
                return tab.webView;
            }
        }
        return null;
    }

    void reloadMatchingUrls(List<String> urls) {
        if (urls == null || urls.isEmpty()) return;
        Set<String> targets = new HashSet<>();
        for (String url : urls) {
            if (url != null && !url.trim().isEmpty()) targets.add(url.trim());
        }
        for (Tab tab : tabs) {
            if (tab.webView == null) continue;
            String current = tab.url == null ? "" : tab.url.trim();
            String loaded = tab.webView.getUrl() == null ? "" : tab.webView.getUrl().trim();
            if (!targets.contains(current) && !targets.contains(loaded)) continue;
            tab.webView.clearCache(true);
            tab.webView.clearFormData();
            tab.webView.clearHistory();
            if (!current.isEmpty()) tab.webView.loadUrl(current);
            else if (!loaded.isEmpty()) tab.webView.loadUrl(loaded);
        }
    }

    private Tab addTab(String title, String url, String groupId) {
        Tab tab = new Tab();
        tab.id = UUID.randomUUID().toString();
        tab.title = (title == null || title.trim().isEmpty()) ? hostTitle(url) : title.trim();
        tab.url = url;
        tab.groupId = groupId == null ? UNGROUPED : groupId;
        tab.webView = activity.createPageWebView();
        applyDesktopMode(tab);
        attachWebView(tab);
        tab.webView.loadUrl(url);
        insertTab(tab);
        forgetClosedPage(tab.groupId, url);
        return tab;
    }

    private void attachWebView(Tab tab) {
        if (tab.webView.getParent() == null) {
            FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
            );
            host.addView(tab.webView, params);
        }
        tab.webView.setVisibility(View.GONE);
    }

    private void showTab(String tabId) {
        Tab tab = findTabById(tabId);
        if (tab == null) return;
        activeTabId = tab.id;
        activeGroupId = tab.groupId == null ? UNGROUPED : tab.groupId;
        for (Tab item : tabs) {
            if (item.webView == null) continue;
            boolean show = item.id.equals(tab.id);
            item.webView.setVisibility(show ? View.VISIBLE : View.GONE);
            if (show) item.webView.onResume();
            else item.webView.onPause();
        }
        activity.setPageWindow(true);
        activity.refreshPageChrome(tab.webView);
        restoreViewState(tab.webView);
        renderStrips();
        persistState();
    }

    void pauseBackground() {
        pauseAll();
    }

    void resumeActive() {
        Tab tab = activeTab();
        if (tab != null && tab.webView != null) tab.webView.onResume();
    }

    private void pauseAll() {
        for (Tab item : tabs) {
            if (item.webView != null) item.webView.onPause();
        }
    }

    private void closeTab(String tabId) {
        closeTab(tabId, true);
    }

    private void deleteTab(String tabId) {
        closeTab(tabId, false);
    }

    private void closeTab(String tabId, boolean remember) {
        Tab tab = findTabById(tabId);
        if (tab == null) return;
        int index = tabs.indexOf(tab);
        String groupId = tab.groupId;
        if (remember) rememberClosedTab(tab);
        destroyTab(tab);
        tabs.remove(tab);
        selectedIds.remove(tabId);
        pruneEmptyGroups();
        if (tabId.equals(activeTabId)) {
            Tab next = nextTab(index, groupId);
            activeTabId = next == null ? null : next.id;
            if (next != null) showTab(next.id);
        }
        if (tabs.isEmpty()) {
            activeGroupId = UNGROUPED;
            activity.setPageWindow(false);
            if (groups.isEmpty()) {
                dismissSheet();
                dismissGroupManager();
            }
        }
        renderStrips();
        if (sheetDialog != null && sheetDialog.isShowing()) renderSheet(sheetDialog);
        refreshGroupManager();
        persistState();
    }

    private Tab nextTab(int closedIndex, String groupId) {
        for (int i = closedIndex; i < tabs.size(); i++) {
            if (groupId.equals(tabs.get(i).groupId)) return tabs.get(i);
        }
        for (int i = closedIndex - 1; i >= 0; i--) {
            if (groupId.equals(tabs.get(i).groupId)) return tabs.get(i);
        }
        return tabs.isEmpty() ? null : tabs.get(Math.max(0, Math.min(closedIndex, tabs.size() - 1)));
    }

    private void destroyTab(Tab tab) {
        if (tab.webView == null) return;
        tab.webView.stopLoading();
        tab.webView.setWebChromeClient(null);
        tab.webView.setWebViewClient(null);
        tab.webView.loadUrl("about:blank");
        if (tab.webView.getParent() instanceof ViewGroup) {
            ((ViewGroup) tab.webView.getParent()).removeView(tab.webView);
        }
        tab.webView.destroy();
        tab.webView = null;
    }

    private void closeTabs(List<String> ids) {
        for (String id : ids) closeTab(id, true);
    }

    private void deleteTabs(List<String> ids) {
        for (String id : ids) closeTab(id, false);
    }

    private void rememberClosedTab(Tab tab) {
        if (tab == null || UNGROUPED.equals(tab.groupId == null ? UNGROUPED : tab.groupId)) return;
        Group group = findGroup(tab.groupId);
        if (group == null) return;
        String url = tab.url == null ? "" : tab.url.trim();
        if (url.isEmpty()) return;
        for (ClosedPage page : group.closedPages) {
            if (url.equals(page.url)) return;
        }
        group.closedPages.add(new ClosedPage(displayTitle(tab), url, tab.pinned, tab.desktop));
    }

    private void forgetClosedPage(String groupId, String url) {
        Group group = findGroup(groupId);
        if (group == null || url == null || url.trim().isEmpty()) return;
        Iterator<ClosedPage> it = group.closedPages.iterator();
        while (it.hasNext()) {
            if (url.equals(it.next().url)) it.remove();
        }
    }

    private void moveTabs(List<String> ids, String groupId) {
        for (String id : ids) {
            Tab tab = findTabById(id);
            if (tab != null) tab.groupId = groupId == null ? UNGROUPED : groupId;
        }
        selectedIds.clear();
        pruneEmptyGroups();
        if (!ids.isEmpty()) {
            Tab first = findTabById(ids.get(0));
            if (first != null) showTab(first.id);
        }
        renderStrips();
        if (sheetDialog != null && sheetDialog.isShowing()) renderSheet(sheetDialog);
        refreshGroupManager();
    }

    private void deleteGroup(String groupId) {
        if (groupId == null || groupId.isEmpty()) return;
        List<String> ids = new ArrayList<>();
        for (Tab tab : tabs) {
            if (groupId.equals(tab.groupId)) ids.add(tab.id);
        }
        deleteTabs(ids);
        Iterator<Group> it = groups.iterator();
        while (it.hasNext()) {
            if (groupId.equals(it.next().id)) it.remove();
        }
        collapsedGroupIds.remove(groupId);
        if (groupId.equals(activeGroupId)) {
            activeGroupId = UNGROUPED;
        }
        renderStrips();
        if (sheetDialog != null && sheetDialog.isShowing()) renderSheet(sheetDialog);
        refreshGroupManager();
        persistState();
    }

    private String ensureGroup(String name) {
        for (Group group : groups) {
            if (name.equals(group.name)) return group.id;
        }
        Group group = new Group();
        group.id = UUID.randomUUID().toString();
        group.name = name;
        groups.add(group);
        return group.id;
    }

    private void pruneEmptyGroups() {
        Iterator<Group> it = groups.iterator();
        while (it.hasNext()) {
            Group group = it.next();
            if (countInGroup(group.id) == 0 && group.closedPages.isEmpty()) {
                collapsedGroupIds.remove(group.id);
                it.remove();
            }
        }
        if (countInGroup(UNGROUPED) == 0) collapsedGroupIds.remove(UNGROUPED);
        if (!UNGROUPED.equals(activeGroupId) && countInGroup(activeGroupId) == 0) {
            activeGroupId = UNGROUPED;
        }
    }

    private void renderStrips() {
        groupStrip.removeAllViews();
        tabStrip.removeAllViews();
        if (tabOverflowStrip != null) tabOverflowStrip.removeAllViews();
        applyExtrasVisible();
        if (categoryBtn != null) {
            categoryBtn.setContentDescription(groupsVisible ? "隐藏分类" : "显示分类");
            if (groupsVisible && extrasVisible) categoryBtn.setBackground(chipBackground(true));
            else if (categoryBtn != null) categoryBtn.setBackgroundResource(android.R.color.transparent);
        }
        if (pagesBtn != null) {
            pagesBtn.setContentDescription(pagesVisible ? "隐藏网页" : "显示网页");
            if (pagesVisible) pagesBtn.setBackground(chipBackground(true));
            else pagesBtn.setBackgroundResource(android.R.color.transparent);
        }
        groupScroll.setVisibility(groupsVisible && extrasVisible ? View.VISIBLE : View.GONE);
        if (groupsVisible && extrasVisible) {
            addGroupChip("未分组", UNGROUPED, countInGroup(UNGROUPED));
            for (Group group : groups) {
                addGroupChip(group.name, group.id, countInGroup(group.id));
            }
        }
        List<Tab> groupTabs = tabsInGroup(activeGroupId);
        boolean showPages = extrasVisible && pagesVisible;
        if (showPages) {
            LinearLayout overflowHost = tabOverflowStrip != null ? tabOverflowStrip : tabStrip;
            for (Tab tab : groupTabs) {
                addTabChip(tab, overflowHost);
            }
        }
        if (tabOverflowScroll != null) {
            tabOverflowScroll.setVisibility(showPages && !groupTabs.isEmpty() ? View.VISIBLE : View.GONE);
        }
        int count = tabs.size();
        tabsCount.setText(count > 9 ? "9+" : String.valueOf(count));
        tabsCount.setVisibility(count > 0 ? View.VISIBLE : View.GONE);
        tintBarButtons();
    }

    private void addGroupChip(String name, String groupId, int count) {
        View chip = inflater.inflate(R.layout.item_browser_group, groupStrip, false);
        TextView title = chip.findViewById(R.id.groupTitle);
        title.setText(name + (count > 0 ? " " + count : ""));
        boolean active = activeGroupId.equals(groupId);
        chip.setTag(groupId);
        styleChip(chip, title, active);
        chip.setOnClickListener(v -> {
            activeGroupId = groupId;
            Tab first = firstInGroup(groupId);
            if (first != null) showTab(first.id);
            else renderStrips();
        });
        chip.setOnLongClickListener(v -> {
            if (UNGROUPED.equals(groupId)) return true;
            showGroupActions(groupId, name);
            return true;
        });
        groupStrip.addView(chip);
    }

    private void addTabChip(Tab tab, LinearLayout host) {
        if (host == null) return;
        View chip = inflater.inflate(R.layout.item_browser_tab, host, false);
        TextView title = chip.findViewById(R.id.tabTitle);
        title.setText(displayTitle(tab));
        boolean active = tab.id.equals(activeTabId);
        chip.setTag(tab.id);
        styleChip(chip, title, active);
        ImageView pin = chip.findViewById(R.id.tabPin);
        if (pin != null) {
            pin.setVisibility(tab.pinned ? View.VISIBLE : View.GONE);
            pin.setColorFilter(tab.pinned ? chromeAccent : chromeMuted, PorterDuff.Mode.SRC_IN);
        }
        ImageButton close = chip.findViewById(R.id.tabClose);
        if (close != null) close.setColorFilter(chromeMuted, PorterDuff.Mode.SRC_IN);
        chip.setOnClickListener(v -> showTab(tab.id));
        chip.setOnLongClickListener(v -> {
            showTabActions(tab);
            return true;
        });
        chip.findViewById(R.id.tabClose).setOnClickListener(v -> closeTab(tab.id));
        host.addView(chip);
    }

    private void showTabActions(Tab tab) {
        new AlertDialog.Builder(activity, alertTheme())
                .setItems(new CharSequence[]{tab.pinned ? "取消置顶" : "置顶", "移动到分组", "关闭"}, (dialog, which) -> {
                    if (which == 0) togglePinTab(tab.id);
                    else if (which == 1) pickGroupFor(singletonList(tab.id));
                    else closeTab(tab.id);
                })
                .show();
    }

    private void showGroupActions(String groupId, String name) {
        new AlertDialog.Builder(activity, alertTheme())
                .setItems(new CharSequence[]{"修改名称", "删除分组"}, (dialog, which) -> {
                    if (which == 0) promptRenameGroup(groupId, name);
                    else confirmDeleteGroup(groupId, name);
                })
                .show();
    }

    private void showSheet() {
        dismissSheet();
        Dialog dialog = new Dialog(activity, sheetDialogTheme());
        dialog.setContentView(R.layout.sheet_browser_tabs);
        dialog.setCanceledOnTouchOutside(true);
        dialog.setCancelable(true);
        dialog.findViewById(R.id.sheetDone).setOnClickListener(v -> dialog.dismiss());
        View manageGroups = dialog.findViewById(R.id.sheetManageGroups);
        if (manageGroups != null) manageGroups.setOnClickListener(v -> showGroupManager());
        View selectModeBtn = dialog.findViewById(R.id.sheetSelectMode);
        if (selectModeBtn != null) selectModeBtn.setOnClickListener(v -> toggleSelectMode());
        View sortModeBtn = dialog.findViewById(R.id.sheetSortMode);
        if (sortModeBtn != null) sortModeBtn.setOnClickListener(v -> toggleSortMode());
        View collapseAll = dialog.findViewById(R.id.sheetCollapseAll);
        if (collapseAll != null) collapseAll.setOnClickListener(v -> toggleAllGroupsCollapsed());
        dialog.findViewById(R.id.sheetSelectAll).setOnClickListener(v -> toggleSelectAllVisible());
        View pinSelected = dialog.findViewById(R.id.sheetPinSelected);
        if (pinSelected != null) pinSelected.setOnClickListener(v -> togglePinTabs(selectedList()));
        dialog.findViewById(R.id.sheetMoveSelected).setOnClickListener(v -> pickGroupFor(selectedList()));
        dialog.findViewById(R.id.sheetCloseSelected).setOnClickListener(v -> {
            List<String> ids = selectedList();
            if (ids.isEmpty()) {
                toast("请先勾选网页");
                return;
            }
            closeTabs(ids);
        });
        EditText search = dialog.findViewById(R.id.sheetSearch);
        ImageButton clear = dialog.findViewById(R.id.sheetSearchClear);
        search.setText(sheetQuery);
        clear.setVisibility(sheetQuery.trim().isEmpty() ? View.GONE : View.VISIBLE);
        search.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {
            }

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {
            }

            @Override
            public void afterTextChanged(Editable s) {
                sheetQuery = s == null ? "" : s.toString();
                clear.setVisibility(sheetQuery.trim().isEmpty() ? View.GONE : View.VISIBLE);
                renderSheet(dialog);
            }
        });
        clear.setOnClickListener(v -> {
            search.setText("");
            search.requestFocus();
        });
        dialog.setOnDismissListener(d -> {
            if (sheetDialog == dialog) sheetDialog = null;
        });
        sheetDialog = dialog;
        renderSheet(dialog);
        applySheetChrome(dialog);
        dialog.show();
        Window window = dialog.getWindow();
        if (window != null) {
            int width = Math.round(activity.getResources().getDisplayMetrics().widthPixels * 0.92f);
            int height = Math.round(activity.getResources().getDisplayMetrics().heightPixels * 0.72f);
            window.setLayout(width, height);
        }
    }

    private void renderSheet(Dialog dialog) {
        LinearLayout list = dialog.findViewById(R.id.sheetList);
        TextView countView = dialog.findViewById(R.id.sheetSelectCount);
        TextView selectAll = dialog.findViewById(R.id.sheetSelectAll);
        list.removeAllViews();
        appendGroupSection(list, "未分组", UNGROUPED);
        for (Group group : groups) appendGroupSection(list, group.name, group.id);
        List<Tab> visible = visibleTabs();
        if (visible.isEmpty() && !sheetQuery.trim().isEmpty()) {
            TextView empty = new TextView(activity);
            empty.setText("无搜索结果");
            empty.setTextColor(sheetMuted());
            empty.setPadding(8, 24, 8, 24);
            empty.setGravity(android.view.Gravity.CENTER);
            list.addView(empty);
        }
        countView.setText("已选 " + selectedIds.size());
        boolean allSelected = !visible.isEmpty();
        for (Tab tab : visible) {
            if (!selectedIds.contains(tab.id)) {
                allSelected = false;
                break;
            }
        }
        selectAll.setText(allSelected ? "取消全选" : "全选");
        TextView collapseAll = dialog.findViewById(R.id.sheetCollapseAll);
        if (collapseAll != null) {
            collapseAll.setText(areAllGroupsCollapsed() ? "展开" : "折叠");
        }
        TextView selectModeBtn = dialog.findViewById(R.id.sheetSelectMode);
        if (selectModeBtn != null) selectModeBtn.setText(selectMode ? "完成多选" : "多选");
        TextView sortModeBtn = dialog.findViewById(R.id.sheetSortMode);
        if (sortModeBtn != null) sortModeBtn.setText(sortMode ? "完成排序" : "排序");
        int batchVisibility = selectMode ? View.VISIBLE : View.GONE;
        setVisible(dialog, R.id.sheetSelectCount, batchVisibility);
        setVisible(dialog, R.id.sheetSelectAll, batchVisibility);
        setVisible(dialog, R.id.sheetPinSelected, batchVisibility);
        setVisible(dialog, R.id.sheetMoveSelected, batchVisibility);
        setVisible(dialog, R.id.sheetCloseSelected, batchVisibility);
        applySheetChrome(dialog);
    }

    private void appendGroupSection(LinearLayout list, String name, String groupId) {
        List<Tab> items = filteredTabsInGroup(groupId);
        if (items.isEmpty()) return;
        View header = inflater.inflate(R.layout.item_browser_sheet_group, list, false);
        TextView title = header.findViewById(R.id.sheetGroupTitle);
        TextView closeGroup = header.findViewById(R.id.sheetGroupClose);
        TextView rename = header.findViewById(R.id.sheetGroupRename);
        TextView delete = header.findViewById(R.id.sheetGroupDelete);
        ImageButton handle = header.findViewById(R.id.sheetGroupHandle);
        ImageButton toggle = header.findViewById(R.id.sheetGroupToggle);
        boolean collapsed = isGroupCollapsed(groupId);
        title.setText(name + " (" + items.size() + ")");
        toggle.setImageResource(collapsed ? R.drawable.ic_browser_expand : R.drawable.ic_browser_collapse);
        toggle.setContentDescription(collapsed ? "展开分组" : "折叠分组");
        View.OnClickListener toggleClick = v -> toggleGroupCollapsed(groupId);
        toggle.setOnClickListener(toggleClick);
        title.setOnClickListener(toggleClick);
        header.setOnDragListener((v, event) -> handleGroupDrop(event, groupId));
        if (closeGroup != null) {
            closeGroup.setVisibility(items.isEmpty() ? View.GONE : View.VISIBLE);
            closeGroup.setOnClickListener(v -> confirmCloseGroup(groupId, name));
            closeGroup.setTextColor(sheetAccent());
        }
        if (UNGROUPED.equals(groupId)) {
            handle.setVisibility(View.GONE);
            if (rename != null) rename.setVisibility(View.GONE);
            if (delete != null) delete.setVisibility(View.GONE);
        } else {
            if (rename != null) rename.setOnClickListener(v -> promptRenameGroup(groupId, name));
            if (delete != null) delete.setOnClickListener(v -> confirmDeleteGroup(groupId, name));
            handle.setVisibility(sortMode ? View.VISIBLE : View.GONE);
            if (sortMode) enableGroupDrag(handle, header, groupId);
        }
        list.addView(header);
        tint(handle, sheetMuted());
        tint(toggle, sheetMuted());
        title.setTextColor(sheetText());
        if (rename != null) rename.setTextColor(sheetAccent());
        if (delete != null) delete.setTextColor(SHEET_DANGER);
        if (collapsed) return;
        for (Tab tab : items) {
            View row = inflater.inflate(R.layout.item_browser_sheet_tab, list, false);
            TextView titleView = row.findViewById(R.id.sheetTitle);
            TextView urlView = row.findViewById(R.id.sheetUrl);
            CheckBox check = row.findViewById(R.id.sheetCheck);
            titleView.setText(displayTitle(tab));
            urlView.setText(tab.url);
            check.setVisibility(selectMode ? View.VISIBLE : View.GONE);
            check.setChecked(selectedIds.contains(tab.id));
            check.setOnCheckedChangeListener((button, checked) -> {
                if (checked) selectedIds.add(tab.id);
                else selectedIds.remove(tab.id);
                if (sheetDialog != null) {
                    TextView countView = sheetDialog.findViewById(R.id.sheetSelectCount);
                    if (countView != null) countView.setText("已选 " + selectedIds.size());
                }
            });
            row.setOnClickListener(v -> {
                showTab(tab.id);
                dismissSheet();
            });
            row.setOnLongClickListener(v -> {
                showTabActions(tab);
                return true;
            });
            ImageButton pin = row.findViewById(R.id.sheetPin);
            if (pin != null) {
                pin.setOnClickListener(v -> togglePinTab(tab.id));
                pin.setContentDescription(tab.pinned ? "取消置顶" : "置顶网页");
                tint(pin, tab.pinned ? sheetAccent() : sheetMuted());
            }
            ImageButton copy = row.findViewById(R.id.sheetCopy);
            if (copy != null) {
                copy.setOnClickListener(v -> copyTabUrl(tab));
                tint(copy, sheetMuted());
            }
            row.findViewById(R.id.sheetMove).setOnClickListener(v -> pickGroupFor(singletonList(tab.id)));
            row.findViewById(R.id.sheetClose).setOnClickListener(v -> closeTab(tab.id));
            View deleteTabBtn = row.findViewById(R.id.sheetDelete);
            if (deleteTabBtn != null) deleteTabBtn.setOnClickListener(v -> deleteTab(tab.id));
            View handleView = row.findViewById(R.id.sheetTabHandle);
            handleView.setVisibility(sortMode ? View.VISIBLE : View.GONE);
            if (sortMode) enableTabDrag(handleView, row, tab.id);
            tint(handleView, sheetMuted());
            tint(row.findViewById(R.id.sheetMove), sheetMuted());
            tint(row.findViewById(R.id.sheetClose), sheetMuted());
            tint(deleteTabBtn, SHEET_DANGER);
            titleView.setTextColor(sheetText());
            urlView.setTextColor(sheetMuted());
            check.setButtonTintList(android.content.res.ColorStateList.valueOf(sheetAccent()));
            list.addView(row);
        }
    }

    private void pickGroupFor(List<String> ids) {
        if (ids == null || ids.isEmpty()) {
            toast("请先勾选网页");
            return;
        }
        List<String> labels = new ArrayList<>();
        List<String> values = new ArrayList<>();
        labels.add("未分组");
        values.add(UNGROUPED);
        for (Group group : groups) {
            labels.add(group.name);
            values.add(group.id);
        }
        labels.add("新建分组");
        values.add("__new__");
        new AlertDialog.Builder(activity, alertTheme())
                .setTitle("移动到分组")
                .setItems(labels.toArray(new CharSequence[0]), (dialog, which) -> {
                    String value = values.get(which);
                    if ("__new__".equals(value)) {
                        promptNewGroup(ids);
                    } else {
                        moveTabs(ids, value);
                    }
                })
                .show();
    }

    private void promptNewGroup(List<String> ids) {
        EditText input = new EditText(activity);
        input.setHint("分组名称");
        input.setSingleLine(true);
        stylePromptInput(input);
        FrameLayout wrap = new FrameLayout(activity);
        int pad = Math.round(20 * activity.getResources().getDisplayMetrics().density);
        wrap.setPadding(pad, pad / 2, pad, 0);
        wrap.addView(input);
        new AlertDialog.Builder(activity, alertTheme())
                .setTitle("新建分组")
                .setView(wrap)
                .setPositiveButton("确定", (dialog, which) -> {
                    String trimmed = input.getText() == null ? "" : input.getText().toString().trim();
                    if (trimmed.isEmpty()) {
                        toast("请输入分组名称");
                        return;
                    }
                    moveTabs(ids, ensureGroup(trimmed));
                })
                .setNegativeButton("取消", null)
                .show();
    }

    private void promptRenameGroup(String groupId, String currentName) {
        EditText input = new EditText(activity);
        input.setHint("分组名称");
        input.setSingleLine(true);
        input.setText(currentName);
        stylePromptInput(input);
        FrameLayout wrap = new FrameLayout(activity);
        int pad = Math.round(20 * activity.getResources().getDisplayMetrics().density);
        wrap.setPadding(pad, pad / 2, pad, 0);
        wrap.addView(input);
        new AlertDialog.Builder(activity, alertTheme())
                .setTitle("修改分组名称")
                .setView(wrap)
                .setPositiveButton("确定", (dialog, which) -> {
                    String trimmed = input.getText() == null ? "" : input.getText().toString().trim();
                    if (trimmed.isEmpty()) {
                        toast("请输入分组名称");
                        return;
                    }
                    renameGroup(groupId, trimmed);
                })
                .setNegativeButton("取消", null)
                .show();
    }

    private void renameGroup(String groupId, String name) {
        for (Group group : groups) {
            if (groupId.equals(group.id)) {
                group.name = name;
                break;
            }
        }
        renderStrips();
        if (sheetDialog != null && sheetDialog.isShowing()) renderSheet(sheetDialog);
        refreshGroupManager();
    }

    private void toggleGroupsVisible() {
        groupsVisible = !groupsVisible;
        renderStrips();
        persistState();
    }

    private void togglePagesVisible() {
        pagesVisible = !pagesVisible;
        activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(PREF_PAGES, pagesVisible)
                .apply();
        renderStrips();
        persistState();
        toast(pagesVisible ? "已显示网页" : "已隐藏网页");
    }

    private void toggleExtrasVisible() {
        extrasVisible = !extrasVisible;
        activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(PREF_EXTRAS, extrasVisible)
                .apply();
        renderStrips();
        persistState();
        toast(extrasVisible ? "已显示功能按钮" : "已隐藏功能按钮");
    }

    private void applyExtrasVisible() {
        int extras = extrasVisible ? View.VISIBLE : View.GONE;
        if (categoryBtn != null) categoryBtn.setVisibility(extras);
        if (homeBtn != null) homeBtn.setVisibility(extras);
        if (refreshBtn != null) refreshBtn.setVisibility(extras);
        if (desktopBtn != null) desktopBtn.setVisibility(extras);
        if (pagesBtn != null) pagesBtn.setVisibility(extras);
        if (groupScroll != null && (!extrasVisible || !groupsVisible)) {
            groupScroll.setVisibility(View.GONE);
        }
    }

    private void toggleDesktopActive() {
        Tab tab = activeTab();
        if (tab == null) {
            toast("没有打开的网页");
            return;
        }
        tab.desktop = !tab.desktop;
        applyDesktopMode(tab);
        if (tab.webView != null && tab.url != null && !tab.url.trim().isEmpty()) {
            tab.webView.loadUrl(tab.url);
        }
        persistState();
        renderStrips();
        toast(tab.desktop ? "已切换为桌面版" : "已切换为手机版");
    }

    private void applyDesktopMode(Tab tab) {
        if (tab == null || tab.webView == null) return;
        WebSettings settings = tab.webView.getSettings();
        if (tab.desktop) {
            settings.setUserAgentString(DESKTOP_UA);
        } else {
            settings.setUserAgentString(null);
        }
    }

    private void copyTabUrl(Tab tab) {
        if (tab == null) return;
        String url = tab.url == null ? "" : tab.url.trim();
        if (url.isEmpty() && tab.webView != null) {
            String current = tab.webView.getUrl();
            url = current == null ? "" : current.trim();
        }
        if (url.isEmpty() || "about:blank".equalsIgnoreCase(url)) {
            toast("没有可复制的网址");
            return;
        }
        ClipboardManager clipboard = (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard == null) {
            toast("复制失败");
            return;
        }
        clipboard.setPrimaryClip(ClipData.newPlainText("web-manager", url));
        toast("已复制网址");
    }

    private void showGroupManager() {
        dismissGroupManager();
        Dialog dialog = new Dialog(activity, sheetDialogTheme());
        dialog.setContentView(R.layout.sheet_browser_groups);
        dialog.setCanceledOnTouchOutside(true);
        dialog.setCancelable(true);
        dialog.findViewById(R.id.manageGroupDone).setOnClickListener(v -> dialog.dismiss());
        dialog.setOnDismissListener(d -> {
            if (groupDialog == dialog) groupDialog = null;
        });
        groupDialog = dialog;
        renderGroupManager(dialog);
        applySheetChrome(dialog);
        dialog.show();
        Window window = dialog.getWindow();
        if (window != null) {
            int width = Math.round(activity.getResources().getDisplayMetrics().widthPixels * 0.92f);
            int height = Math.round(activity.getResources().getDisplayMetrics().heightPixels * 0.62f);
            window.setLayout(width, height);
        }
    }

    private void renderGroupManager(Dialog dialog) {
        LinearLayout list = dialog.findViewById(R.id.manageGroupList);
        list.removeAllViews();
        if (groups.isEmpty()) {
            TextView empty = new TextView(activity);
            empty.setText("暂无分组");
            empty.setTextColor(sheetMuted());
            empty.setPadding(8, 24, 8, 24);
            empty.setGravity(android.view.Gravity.CENTER);
            list.addView(empty);
            applySheetChrome(dialog);
            return;
        }
        for (Group group : groups) {
            View row = inflater.inflate(R.layout.item_browser_manage_group, list, false);
            TextView title = row.findViewById(R.id.manageGroupTitle);
            title.setText(group.name + " (" + countInGroup(group.id) + ")");
            title.setTextColor(sheetText());
            TextView closeGroup = row.findViewById(R.id.manageGroupClose);
            TextView openGroup = row.findViewById(R.id.manageGroupOpen);
            TextView rename = row.findViewById(R.id.manageGroupRename);
            TextView delete = row.findViewById(R.id.manageGroupDelete);
            if (closeGroup != null) {
                closeGroup.setTextColor(sheetAccent());
                closeGroup.setVisibility(countInGroup(group.id) > 0 ? View.VISIBLE : View.GONE);
                closeGroup.setOnClickListener(v -> confirmCloseGroup(group.id, group.name));
            }
            if (openGroup != null) {
                openGroup.setTextColor(sheetAccent());
                openGroup.setVisibility(group.closedPages.isEmpty() ? View.GONE : View.VISIBLE);
                openGroup.setOnClickListener(v -> reopenGroupTabs(group.id));
            }
            if (rename != null) rename.setTextColor(sheetAccent());
            if (delete != null) delete.setTextColor(SHEET_DANGER);
            tint(row.findViewById(R.id.manageGroupHandle), sheetMuted());
            row.findViewById(R.id.manageGroupRename).setOnClickListener(v -> promptRenameGroup(group.id, group.name));
            row.findViewById(R.id.manageGroupDelete).setOnClickListener(v -> confirmDeleteGroup(group.id, group.name));
            enableGroupDrag(row.findViewById(R.id.manageGroupHandle), row, group.id);
            row.setOnDragListener((v, event) -> handleManageGroupDrop(event, group.id));
            list.addView(row);
        }
        applySheetChrome(dialog);
    }

    private void refreshGroupManager() {
        if (groupDialog != null && groupDialog.isShowing()) renderGroupManager(groupDialog);
    }

    private void dismissGroupManager() {
        if (groupDialog != null) {
            groupDialog.dismiss();
            groupDialog = null;
        }
    }

    private boolean handleManageGroupDrop(DragEvent event, String targetId) {
        if (!(event.getLocalState() instanceof DragPayload)) return false;
        DragPayload payload = (DragPayload) event.getLocalState();
        if (!DRAG_GROUP.equals(payload.type)) return false;
        if (UNGROUPED.equals(payload.id) || UNGROUPED.equals(targetId)) return false;
        if (event.getAction() == DragEvent.ACTION_DROP) {
            reorderGroups(payload.id, targetId);
        }
        return true;
    }

    private void toggleAllGroupsCollapsed() {
        if (areAllGroupsCollapsed()) collapsedGroupIds.clear();
        else collapsedGroupIds.addAll(sheetGroupIds());
        if (sheetDialog != null && sheetDialog.isShowing()) renderSheet(sheetDialog);
    }

    private boolean areAllGroupsCollapsed() {
        List<String> ids = sheetGroupIds();
        if (ids.isEmpty()) return false;
        for (String id : ids) {
            if (!collapsedGroupIds.contains(id)) return false;
        }
        return true;
    }

    private List<String> sheetGroupIds() {
        List<String> ids = new ArrayList<>();
        if (!filteredTabsInGroup(UNGROUPED).isEmpty()) ids.add(UNGROUPED);
        for (Group group : groups) {
            if (sheetQuery.trim().isEmpty() || !filteredTabsInGroup(group.id).isEmpty()) {
                ids.add(group.id);
            }
        }
        return ids;
    }

    @android.annotation.SuppressLint("ClickableViewAccessibility")
    @SuppressWarnings("deprecation")
    private void enableGroupDrag(View handle, View header, String groupId) {
        handle.setOnTouchListener((v, event) -> {
            if (event.getAction() != MotionEvent.ACTION_DOWN) return false;
            ClipData data = ClipData.newPlainText(DRAG_GROUP, groupId);
            View.DragShadowBuilder shadow = new View.DragShadowBuilder(header);
            DragPayload payload = new DragPayload(DRAG_GROUP, groupId);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                header.startDragAndDrop(data, shadow, payload, 0);
            } else {
                header.startDrag(data, shadow, payload, 0);
            }
            return true;
        });
    }

    @android.annotation.SuppressLint("ClickableViewAccessibility")
    @SuppressWarnings("deprecation")
    private void enableTabDrag(View handle, View row, String tabId) {
        handle.setOnTouchListener((v, event) -> {
            if (event.getAction() != MotionEvent.ACTION_DOWN) return false;
            ClipData data = ClipData.newPlainText(DRAG_TAB, tabId);
            View.DragShadowBuilder shadow = new View.DragShadowBuilder(row);
            DragPayload payload = new DragPayload(DRAG_TAB, tabId);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                row.startDragAndDrop(data, shadow, payload, 0);
            } else {
                row.startDrag(data, shadow, payload, 0);
            }
            return true;
        });
        row.setOnDragListener((v, event) -> handleTabDrop(event, tabId));
    }

    private boolean handleGroupDrop(DragEvent event, String targetId) {
        if (!(event.getLocalState() instanceof DragPayload)) return false;
        DragPayload payload = (DragPayload) event.getLocalState();
        if (DRAG_TAB.equals(payload.type)) {
            if (event.getAction() == DragEvent.ACTION_DROP) moveTabToGroup(payload.id, targetId);
            return true;
        }
        if (!DRAG_GROUP.equals(payload.type)) return false;
        if (UNGROUPED.equals(payload.id) || UNGROUPED.equals(targetId)) return false;
        if (event.getAction() == DragEvent.ACTION_DROP) {
            reorderGroups(payload.id, targetId);
        }
        return true;
    }

    private boolean handleTabDrop(DragEvent event, String targetId) {
        if (!(event.getLocalState() instanceof DragPayload)) return false;
        DragPayload payload = (DragPayload) event.getLocalState();
        if (!DRAG_TAB.equals(payload.type)) return false;
        if (event.getAction() == DragEvent.ACTION_DROP) {
            reorderTabs(payload.id, targetId);
        }
        return true;
    }

    private void reorderTabs(String fromId, String toId) {
        if (fromId == null || fromId.equals(toId)) return;
        int from = indexOfTab(fromId);
        int to = indexOfTab(toId);
        if (from < 0 || to < 0) return;
        Tab target = findTabById(toId);
        Tab moved = tabs.remove(from);
        if (to > from) to--;
        if (target != null) {
            moved.groupId = target.groupId;
            moved.pinned = target.pinned;
        }
        tabs.add(to, moved);
        pruneEmptyGroups();
        renderStrips();
        if (sheetDialog != null && sheetDialog.isShowing()) renderSheet(sheetDialog);
    }

    private void moveTabToGroup(String tabId, String groupId) {
        Tab tab = findTabById(tabId);
        if (tab == null) return;
        tab.groupId = groupId == null ? UNGROUPED : groupId;
        insertTab(tab);
        pruneEmptyGroups();
        renderStrips();
        if (sheetDialog != null && sheetDialog.isShowing()) renderSheet(sheetDialog);
    }

    private void insertTab(Tab tab) {
        if (tab == null) return;
        tabs.remove(tab);
        String groupId = tab.groupId == null ? UNGROUPED : tab.groupId;
        int insert = tabs.size();
        boolean placed = false;
        for (int i = 0; i < tabs.size(); i++) {
            Tab item = tabs.get(i);
            if (!groupId.equals(item.groupId)) {
                if (placed) {
                    insert = i;
                    break;
                }
                continue;
            }
            placed = true;
            if (tab.pinned && !item.pinned) {
                insert = i;
                break;
            }
            insert = i + 1;
        }
        tabs.add(insert, tab);
    }

    private void sortTabsByPin() {
        List<Tab> ordered = new ArrayList<>(tabs);
        tabs.clear();
        for (Tab tab : ordered) insertTab(tab);
    }

    private void togglePinTab(String tabId) {
        Tab tab = findTabById(tabId);
        if (tab == null) return;
        tab.pinned = !tab.pinned;
        insertTab(tab);
        persistState();
        renderStrips();
        if (sheetDialog != null && sheetDialog.isShowing()) renderSheet(sheetDialog);
        toast(tab.pinned ? "已置顶" : "已取消置顶");
    }

    private void togglePinTabs(List<String> ids) {
        if (ids == null || ids.isEmpty()) {
            toast("请先勾选网页");
            return;
        }
        boolean pin = false;
        for (String id : ids) {
            Tab tab = findTabById(id);
            if (tab != null && !tab.pinned) {
                pin = true;
                break;
            }
        }
        for (String id : ids) {
            Tab tab = findTabById(id);
            if (tab == null) continue;
            tab.pinned = pin;
            insertTab(tab);
        }
        persistState();
        renderStrips();
        if (sheetDialog != null && sheetDialog.isShowing()) renderSheet(sheetDialog);
        toast(pin ? "已置顶所选网页" : "已取消置顶");
    }

    private int indexOfTab(String tabId) {
        for (int i = 0; i < tabs.size(); i++) {
            if (tabId.equals(tabs.get(i).id)) return i;
        }
        return -1;
    }

    private boolean isGroupCollapsed(String groupId) {
        if (sheetQuery != null && !sheetQuery.trim().isEmpty()) return false;
        return collapsedGroupIds.contains(groupId == null ? UNGROUPED : groupId);
    }

    private void toggleGroupCollapsed(String groupId) {
        String id = groupId == null ? UNGROUPED : groupId;
        if (collapsedGroupIds.contains(id)) collapsedGroupIds.remove(id);
        else collapsedGroupIds.add(id);
        if (sheetDialog != null && sheetDialog.isShowing()) renderSheet(sheetDialog);
    }

    private void confirmCloseGroup(String groupId, String name) {
        new AlertDialog.Builder(activity, alertTheme())
                .setMessage("关闭「" + name + "」中打开的所有网页？")
                .setPositiveButton("关闭", (dialog, which) -> closeGroupTabs(groupId))
                .setNegativeButton("取消", null)
                .show();
    }

    private void closeGroupTabs(String groupId) {
        List<String> ids = new ArrayList<>();
        for (Tab tab : tabs) {
            if (groupId.equals(tab.groupId)) ids.add(tab.id);
        }
        closeTabs(ids);
    }

    private void reorderGroups(String fromId, String toId) {
        if (fromId == null || fromId.equals(toId)) return;
        int from = indexOfGroup(fromId);
        int to = indexOfGroup(toId);
        if (from < 0 || to < 0) return;
        Group moved = groups.remove(from);
        groups.add(to, moved);
        renderStrips();
        if (sheetDialog != null && sheetDialog.isShowing()) renderSheet(sheetDialog);
        refreshGroupManager();
    }

    private int indexOfGroup(String groupId) {
        for (int i = 0; i < groups.size(); i++) {
            if (groupId.equals(groups.get(i).id)) return i;
        }
        return -1;
    }

    private void toggleSelectMode() {
        selectMode = !selectMode;
        if (!selectMode) selectedIds.clear();
        if (sheetDialog != null && sheetDialog.isShowing()) renderSheet(sheetDialog);
    }

    private void toggleSortMode() {
        sortMode = !sortMode;
        if (sheetDialog != null && sheetDialog.isShowing()) renderSheet(sheetDialog);
    }

    private void toggleSelectAllVisible() {
        if (!selectMode) {
            selectMode = true;
        }
        List<Tab> visible = visibleTabs();
        if (visible.isEmpty()) {
            toast("没有可选择的网页");
            return;
        }
        boolean allSelected = true;
        for (Tab tab : visible) {
            if (!selectedIds.contains(tab.id)) {
                allSelected = false;
                break;
            }
        }
        for (Tab tab : visible) {
            if (allSelected) selectedIds.remove(tab.id);
            else selectedIds.add(tab.id);
        }
        if (sheetDialog != null && sheetDialog.isShowing()) renderSheet(sheetDialog);
    }

    private void reopenGroupTabs(String groupId) {
        Group group = findGroup(groupId);
        if (group == null || group.closedPages.isEmpty()) {
            toast("没有可打开的网页");
            return;
        }
        List<ClosedPage> pages = new ArrayList<>(group.closedPages);
        Tab last = null;
        int opened = 0;
        int skipped = 0;
        for (ClosedPage page : pages) {
            Tab existing = findTabByUrl(page.url, groupId);
            if (existing != null) {
                last = existing;
                forgetClosedPage(groupId, page.url);
                continue;
            }
            if (tabs.size() >= MAX_TABS) {
                skipped++;
                continue;
            }
            last = addTab(page.title, page.url, groupId);
            last.pinned = page.pinned;
            last.desktop = page.desktop;
            applyDesktopMode(last);
            if (last.desktop && last.webView != null && last.url != null && !last.url.trim().isEmpty()) {
                last.webView.loadUrl(last.url);
            }
            insertTab(last);
            opened++;
        }
        if (last != null) showTab(last.id);
        persistState();
        renderStrips();
        if (sheetDialog != null && sheetDialog.isShowing()) renderSheet(sheetDialog);
        refreshGroupManager();
        if (skipped > 0) toast("最多同时打开 " + MAX_TABS + " 个网页");
        else if (opened == 0 && last != null) toast("这些网页已经打开");
    }

    private Group findGroup(String groupId) {
        if (groupId == null) return null;
        for (Group group : groups) {
            if (groupId.equals(group.id)) return group;
        }
        return null;
    }

    private void confirmDeleteGroup(String groupId, String name) {
        new AlertDialog.Builder(activity, alertTheme())
                .setMessage("删除分组「" + name + "」并删除其中打开和已关闭的网页？")
                .setPositiveButton("删除", (dialog, which) -> deleteGroup(groupId))
                .setNegativeButton("取消", null)
                .show();
    }

    private void dismissSheet() {
        if (sheetDialog != null) {
            sheetDialog.dismiss();
            sheetDialog = null;
        }
    }

    private Tab activeTab() {
        return findTabById(activeTabId);
    }

    private Tab findTabById(String id) {
        if (id == null) return null;
        for (Tab tab : tabs) {
            if (id.equals(tab.id)) return tab;
        }
        return null;
    }

    private Tab findTab(WebView view) {
        if (view == null) return null;
        for (Tab tab : tabs) {
            if (view == tab.webView) return tab;
        }
        return null;
    }

    private Tab findTabByUrl(String url, String groupId) {
        for (Tab tab : tabs) {
            if (url.equals(tab.url) && ((groupId == null ? UNGROUPED : groupId).equals(tab.groupId))) {
                return tab;
            }
        }
        return null;
    }

    private Tab firstInGroup(String groupId) {
        for (Tab tab : tabs) {
            if (groupId.equals(tab.groupId)) return tab;
        }
        return null;
    }

    private int countInGroup(String groupId) {
        int count = 0;
        for (Tab tab : tabs) {
            if (groupId.equals(tab.groupId)) count++;
        }
        return count;
    }

    private List<Tab> tabsInGroup(String groupId) {
        List<Tab> items = new ArrayList<>();
        for (Tab tab : tabs) {
            if (groupId.equals(tab.groupId)) items.add(tab);
        }
        return items;
    }

    private List<Tab> filteredTabsInGroup(String groupId) {
        List<Tab> items = new ArrayList<>();
        for (Tab tab : tabsInGroup(groupId)) {
            if (matchesQuery(tab)) items.add(tab);
        }
        return items;
    }

    private List<Tab> visibleTabs() {
        List<Tab> items = new ArrayList<>();
        for (Tab tab : tabs) {
            if (matchesQuery(tab)) items.add(tab);
        }
        return items;
    }

    private boolean matchesQuery(Tab tab) {
        String q = sheetQuery == null ? "" : sheetQuery.trim().toLowerCase();
        if (q.isEmpty()) return true;
        String title = displayTitle(tab).toLowerCase();
        String url = tab.url == null ? "" : tab.url.toLowerCase();
        return title.contains(q) || url.contains(q);
    }

    private List<String> selectedList() {
        List<String> ids = new ArrayList<>();
        for (Tab tab : tabs) {
            if (selectedIds.contains(tab.id)) ids.add(tab.id);
        }
        return ids;
    }

    private List<String> singletonList(String id) {
        List<String> ids = new ArrayList<>();
        ids.add(id);
        return ids;
    }

    private List<PageSpec> singletonPages(String title, String url) {
        List<PageSpec> specs = new ArrayList<>();
        specs.add(new PageSpec(title, url));
        return specs;
    }

    private String displayTitle(Tab tab) {
        if (tab.title != null && !tab.title.trim().isEmpty()) return tab.title;
        return hostTitle(tab.url);
    }

    private String hostTitle(String url) {
        if (url == null || url.trim().isEmpty()) return "新网页";
        try {
            android.net.Uri uri = android.net.Uri.parse(url);
            String hostName = uri.getHost();
            if (hostName != null && !hostName.isEmpty()) return hostName;
            String last = uri.getLastPathSegment();
            if (last != null && !last.isEmpty()) return last;
        } catch (Exception ignored) {
        }
        return url;
    }

    private void restyleStrips() {
        tintBarButtons();
        restyleChipGroup(groupStrip, true);
        restyleChipGroup(tabStrip, false);
        restyleChipGroup(tabOverflowStrip, false);
    }

    private void restyleChipGroup(ViewGroup parent, boolean group) {
        if (parent == null) return;
        for (int i = 0; i < parent.getChildCount(); i++) {
            View chip = parent.getChildAt(i);
            Object tag = chip.getTag();
            boolean active = group
                    ? String.valueOf(tag == null ? "" : tag).equals(activeGroupId)
                    : String.valueOf(tag == null ? "" : tag).equals(activeTabId);
            TextView title = chip.findViewById(group ? R.id.groupTitle : R.id.tabTitle);
            styleChip(chip, title, active);
            ImageButton close = chip.findViewById(R.id.tabClose);
            if (close != null) close.setColorFilter(chromeMuted, PorterDuff.Mode.SRC_IN);
            ImageView pin = chip.findViewById(R.id.tabPin);
            if (pin != null) {
                Tab tab = tag == null ? null : findTabById(String.valueOf(tag));
                boolean pinned = tab != null && tab.pinned;
                pin.setVisibility(pinned ? View.VISIBLE : View.GONE);
                pin.setColorFilter(pinned ? chromeAccent : chromeMuted, PorterDuff.Mode.SRC_IN);
            }
        }
    }

    private void styleChip(View chip, TextView title, boolean active) {
        if (chip == null) return;
        chip.setBackground(chipBackground(active));
        if (title != null) title.setTextColor(active ? chromeAccent : chromeText);
    }

    private GradientDrawable chipBackground(boolean active) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setShape(GradientDrawable.RECTANGLE);
        float radius = 16f * activity.getResources().getDisplayMetrics().density;
        drawable.setCornerRadius(radius);
        drawable.setColor(active ? chromeChipActive : chromeChip);
        if (active) {
            int stroke = Math.max(1, Math.round(activity.getResources().getDisplayMetrics().density));
            drawable.setStroke(stroke, chromeAccent);
        }
        return drawable;
    }

    private void tintBarButtons() {
        tint(categoryBtn, chromeText);
        tint(homeBtn, chromeText);
        tint(refreshBtn, chromeText);
        tint(desktopBtn, chromeText);
        tint(pagesBtn, chromeText);
        Tab active = activeTab();
        if (desktopBtn != null) {
            desktopBtn.setContentDescription(active != null && active.desktop ? "切换为手机版" : "桌面版网站");
            if (active != null && active.desktop) desktopBtn.setBackground(chipBackground(true));
            else desktopBtn.setBackgroundResource(android.R.color.transparent);
            tint(desktopBtn, active != null && active.desktop ? chromeAccent : chromeText);
        }
        if (pagesBtn != null) {
            if (pagesVisible) pagesBtn.setBackground(chipBackground(true));
            else pagesBtn.setBackgroundResource(android.R.color.transparent);
            tint(pagesBtn, pagesVisible ? chromeAccent : chromeText);
        }
        if (categoryBtn != null) {
            if (groupsVisible && extrasVisible) categoryBtn.setBackground(chipBackground(true));
            else categoryBtn.setBackgroundResource(android.R.color.transparent);
        }
    }

    private void tint(View view, int color) {
        if (view instanceof android.widget.ImageView) {
            ((android.widget.ImageView) view).setColorFilter(color, PorterDuff.Mode.SRC_IN);
        }
    }

    private int sheetDialogTheme() {
        return appDarkMode ? R.style.JsDialogThemeDark : R.style.JsDialogTheme;
    }

    private int alertTheme() {
        return appDarkMode ? R.style.JsAlertThemeDark : R.style.JsAlertTheme;
    }

    private int sheetText() {
        return appDarkMode ? SHEET_TEXT_DARK : SHEET_TEXT_LIGHT;
    }

    private int sheetMuted() {
        return appDarkMode ? SHEET_MUTED_DARK : SHEET_MUTED_LIGHT;
    }

    private int sheetAccent() {
        return appDarkMode ? SHEET_ACCENT_DARK : SHEET_ACCENT_LIGHT;
    }

    private int sheetSurface() {
        return appDarkMode ? SHEET_SURFACE_DARK : SHEET_SURFACE_LIGHT;
    }

    private int sheetInput() {
        return appDarkMode ? SHEET_INPUT_DARK : SHEET_INPUT_LIGHT;
    }

    private void stylePromptInput(EditText input) {
        input.setTextColor(sheetText());
        input.setHintTextColor(sheetMuted());
        if (Build.VERSION.SDK_INT >= 29) {
            input.setTextCursorDrawable(null);
        }
    }

    private void applySheetChrome(Dialog dialog) {
        if (dialog == null) return;
        View root = dialog.findViewById(android.R.id.content);
        if (root instanceof ViewGroup && ((ViewGroup) root).getChildCount() > 0) {
            View panel = ((ViewGroup) root).getChildAt(0);
            panel.setBackground(roundedSurface(sheetSurface(), 18f));
        }
        setText(dialog, R.id.sheetHeading, sheetText());
        setText(dialog, R.id.sheetManageGroups, sheetAccent());
        setText(dialog, R.id.sheetSelectCount, sheetMuted());
        setText(dialog, R.id.sheetSelectMode, sheetAccent());
        setText(dialog, R.id.sheetSortMode, sheetAccent());
        setText(dialog, R.id.sheetCollapseAll, sheetAccent());
        setText(dialog, R.id.sheetSelectAll, sheetAccent());
        setText(dialog, R.id.sheetPinSelected, sheetAccent());
        setText(dialog, R.id.sheetMoveSelected, sheetAccent());
        setText(dialog, R.id.sheetCloseSelected, SHEET_DANGER);
        setText(dialog, R.id.sheetDone, sheetAccent());
        setText(dialog, R.id.manageGroupHeading, sheetText());
        setText(dialog, R.id.manageGroupHint, sheetMuted());
        setText(dialog, R.id.manageGroupDone, sheetAccent());
        EditText search = dialog.findViewById(R.id.sheetSearch);
        if (search != null) {
            search.setTextColor(sheetText());
            search.setHintTextColor(sheetMuted());
            search.setBackground(roundedSurface(sheetInput(), 10f));
        }
        tint(dialog.findViewById(R.id.sheetSearchClear), sheetMuted());
        TextView manage = dialog.findViewById(R.id.sheetManageGroups);
        if (manage != null) {
            android.graphics.drawable.Drawable[] icons = manage.getCompoundDrawablesRelative();
            android.graphics.drawable.Drawable start = icons[0] == null ? null : icons[0].mutate();
            android.graphics.drawable.Drawable top = icons[1] == null ? null : icons[1].mutate();
            android.graphics.drawable.Drawable end = icons[2] == null ? null : icons[2].mutate();
            android.graphics.drawable.Drawable bottom = icons[3] == null ? null : icons[3].mutate();
            if (start != null) start.setColorFilter(sheetAccent(), PorterDuff.Mode.SRC_IN);
            if (top != null) top.setColorFilter(sheetAccent(), PorterDuff.Mode.SRC_IN);
            if (end != null) end.setColorFilter(sheetAccent(), PorterDuff.Mode.SRC_IN);
            if (bottom != null) bottom.setColorFilter(sheetAccent(), PorterDuff.Mode.SRC_IN);
            manage.setCompoundDrawablesRelative(start, top, end, bottom);
        }
    }

    private void setText(Dialog dialog, int id, int color) {
        View view = dialog.findViewById(id);
        if (view instanceof TextView) ((TextView) view).setTextColor(color);
    }

    private void setVisible(Dialog dialog, int id, int visibility) {
        View view = dialog.findViewById(id);
        if (view != null) view.setVisibility(visibility);
    }

    private GradientDrawable roundedSurface(int color, float radiusDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setShape(GradientDrawable.RECTANGLE);
        drawable.setCornerRadius(radiusDp * activity.getResources().getDisplayMetrics().density);
        drawable.setColor(color);
        return drawable;
    }

    private int mix(int from, int to, float amount) {
        float t = Math.max(0f, Math.min(1f, amount));
        int r = Math.round(Color.red(from) + (Color.red(to) - Color.red(from)) * t);
        int g = Math.round(Color.green(from) + (Color.green(to) - Color.green(from)) * t);
        int b = Math.round(Color.blue(from) + (Color.blue(to) - Color.blue(from)) * t);
        return Color.rgb(r, g, b);
    }

    private boolean isLightColor(int color) {
        double luminance = (0.299 * Color.red(color) + 0.587 * Color.green(color) + 0.114 * Color.blue(color)) / 255d;
        return luminance > 0.55;
    }

    private String normalizeUrl(String url) {
        if (url == null) return null;
        String target = url.trim();
        if (target.startsWith("http://") || target.startsWith("https://") || target.startsWith("file://")) {
            return target;
        }
        if (target.startsWith("/storage/") || target.startsWith("/sdcard/")) {
            return "file://" + target;
        }
        return null;
    }

    private void toast(String message) {
        Toast.makeText(activity, message, Toast.LENGTH_SHORT).show();
    }

    static final class Tab {
        String id;
        String title;
        String url;
        String groupId;
        WebView webView;
        int scrollX;
        int scrollY;
        boolean pinned;
        boolean desktop;
        String viewStateJson = "";
        boolean pendingViewRestore;
    }

    static final class Group {
        String id;
        String name;
        final List<ClosedPage> closedPages = new ArrayList<>();
    }

    static final class ClosedPage {
        final String title;
        final String url;
        final boolean pinned;
        final boolean desktop;

        ClosedPage(String title, String url, boolean pinned, boolean desktop) {
            this.title = title;
            this.url = url;
            this.pinned = pinned;
            this.desktop = desktop;
        }
    }

    static final class PageSpec {
        final String title;
        final String url;

        PageSpec(String title, String url) {
            this.title = title;
            this.url = url;
        }
    }

    static final class DragPayload {
        final String type;
        final String id;

        DragPayload(String type, String id) {
            this.type = type;
            this.id = id;
        }
    }
}
