package com.webmanager.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.DownloadManager;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.PixelCopy;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import androidx.activity.OnBackPressedCallback;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.view.ContextThemeWrapper;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

public class MainActivity extends AppCompatActivity {
    private WebView appWebView;
    private FrameLayout root;
    private ViewGroup pageContainer;
    private FrameLayout pageWebHost;
    private View pageTopInset;
    private View pageBottomInset;
    private View browserBar;
    private View restoreTabsBtn;
    private PageInfoBridge bridge;
    private SavedPasswordStore passwordStore;
    private BrowserTabsController tabs;
    private String passwordAutofillScript;
    private String pageDownloadScript;
    private final Object pageDownloadLock = new Object();
    private ByteArrayOutputStream pendingPageDownload;
    private String pendingPageDownloadMime;
    private String pendingPageDownloadName;
    private String pendingPageDownloadId;
    private ValueCallback<Uri[]> filePathCallback;
    private WebView pendingWindowWebView;
    private String pendingImportJson;
    private boolean lightSystemBars = true;
    private boolean themeFollowSystem = false;
    private boolean pageFollowScale = true;
    private float themeTextScale = 1f;
    private float themeUiScale = 1f;
    private boolean pageFollowDarkMode = false;
    private boolean pageDarkMode = false;
    private int safeTop;
    private int safeRight;
    private int safeBottom;
    private int safeLeft;
    private int pageTopColor = Color.WHITE;
    private int pageBottomColor = Color.WHITE;
    private int sampleGen;
    private int sampleFlags;
    private int sampledTopColor = Color.WHITE;
    private int sampledBottomColor = Color.WHITE;
    private long lastSampleAt;
    private WebView chromeWebView;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Runnable sampleChromeRunnable = () -> samplePageColors(chromeWebView);
    private static final int SAMPLE_STRIP_PX = 8;
    private static final long SAMPLE_THROTTLE_MS = 900;
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final int GALLERY_PICK_REQUEST = 1003;
    private static final int DOWNLOAD_PERMISSION_REQUEST = 1002;
    private Runnable pendingDownload;
    private static final String THEME_PREFS = "theme_scale";
    private static final String PREF_FOLLOW_SYSTEM = "followSystem";
    private static final String PREF_FOLLOW_PAGE = "followPage";
    private static final String PREF_TEXT_SCALE = "textScale";
    private static final String PREF_UI_SCALE = "uiScale";
    private Object appScaleScriptHandle;

    static {
        try {
            System.loadLibrary("webmanager");
        } catch (UnsatisfiedLinkError ignored) {
            // 网页壳不依赖 native，缺库时仍可运行
        }
    }

    private static native String nativeAbi();

    String nativeAbiName() {
        try {
            return nativeAbi();
        } catch (UnsatisfiedLinkError ignored) {
            return "";
        }
    }

    @Override
    protected void attachBaseContext(Context newBase) {
        super.attachBaseContext(browserDisplayContext(newBase));
    }

    private static Context browserDisplayContext(Context base) {
        if (base == null) return null;
        Configuration config = new Configuration(base.getResources().getConfiguration());
        config.fontScale = 1f;
        int densityDpi = stableDensityDpi();
        if (densityDpi > 0) config.densityDpi = densityDpi;
        Context display = base.createConfigurationContext(config);
        return display == null ? base : display;
    }

    private static int stableDensityDpi() {
        int stable = DisplayMetrics.DENSITY_DEVICE_STABLE;
        return stable > 0 ? stable : 0;
    }

    /** 旧版本地 HTML 写在 files/imported-html，新版已改到外部 Download。启动时删掉残留。 */
    private void deleteLegacyImportedHtml() {
        deleteTree(new File(getFilesDir(), "imported-html"));
    }

    private void deleteTree(File file) {
        if (file == null || !file.exists()) return;
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) deleteTree(child);
            }
        }
        //noinspection ResultOfMethodCallIgnored
        file.delete();
    }

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        deleteLegacyImportedHtml();
        restoreThemeScale();
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        setContentView(R.layout.activity_main);
        root = findViewById(R.id.rootLayout);
        appWebView = findViewById(R.id.appWebView);
        pageContainer = findViewById(R.id.pageContainer);
        pageWebHost = findViewById(R.id.pageWebHost);
        pageTopInset = findViewById(R.id.pageTopInset);
        pageBottomInset = findViewById(R.id.pageBottomInset);
        browserBar = findViewById(R.id.browserBar);
        restoreTabsBtn = findViewById(R.id.restoreTabsBtn);
        applyEdgeToEdge();
        passwordStore = new SavedPasswordStore(this);
        bridge = new PageInfoBridge(this);
        tabs = new BrowserTabsController(this);
        tabs.restoreState();
        handleIncomingIntent(getIntent());
        setupAppWebView();
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (tabs != null && tabs.handleBack()) return;
                if (appWebView.canGoBack()) {
                    appWebView.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupAppWebView() {
        applyCommonWebSettings(appWebView.getSettings());
        appWebView.getSettings().setSupportMultipleWindows(true);
        appWebView.getSettings().setJavaScriptCanOpenWindowsAutomatically(true);
        appWebView.setFitsSystemWindows(false);
        appWebView.setBackgroundColor(Color.WHITE);
        appWebView.addJavascriptInterface(bridge, "Android");
        appWebView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                injectAppScale();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                injectAppScale();
                applySystemBarIcons(lightSystemBars);
                injectSafeArea();
                deliverPendingImport();
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return interceptAppNavigation(request);
            }
        });
        appWebView.setWebChromeClient(new AppChromeClient());
        appWebView.setDownloadListener(downloadListener(appWebView));
        registerAppScaleScript();
        appWebView.loadUrl("file:///android_asset/index.html");
    }

    @SuppressLint({"SetJavaScriptEnabled", "SetAllowFileAccessFromFileURLs"})
    WebView createPageWebView() {
        WebView webView = new WebView(pageWebViewContext());
        applyCommonWebSettings(webView.getSettings());
        webView.getSettings().setLoadWithOverviewMode(false);
        webView.getSettings().setSupportMultipleWindows(true);
        webView.getSettings().setJavaScriptCanOpenWindowsAutomatically(true);
        webView.getSettings().setAllowFileAccessFromFileURLs(true);
        webView.getSettings().setAllowUniversalAccessFromFileURLs(true);
        webView.setFitsSystemWindows(false);
        webView.setBackgroundColor(pageFollowDarkMode && pageDarkMode ? Color.parseColor("#121212") : Color.WHITE);
        webView.setSaveEnabled(true);
        if (tabs != null) tabs.applyPageDarkSettings(webView);
        webView.addJavascriptInterface(new PageChromeBridge(webView), "WebManagerChrome");
        webView.setWebViewClient(new PageWebViewClient());
        webView.setWebChromeClient(new PageChromeClient());
        webView.setDownloadListener(downloadListener(webView));
        applyTextZoom(webView);
        return webView;
    }

    private void applyCommonWebSettings(WebSettings settings) {
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setTextZoom(100);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setOffscreenPreRaster(true);
        if (Build.VERSION.SDK_INT >= 26) {
            try {
                settings.getClass()
                        .getMethod("setRendererPriorityPolicy", int.class, boolean.class)
                        .invoke(settings, 2, false);
            } catch (Throwable ignored) {
            }
        }
    }

    void applyThemeScale(boolean followSystem, boolean followPage, float textScale, float uiScale) {
        boolean nextFollow = followSystem;
        boolean nextPageFollow = followPage;
        float nextText = clampScale(textScale, 0.4f, 3f, 1f);
        float nextUi = clampScale(uiScale, 0.5f, 2f, 1f);
        if (nextFollow == themeFollowSystem
                && nextPageFollow == pageFollowScale
                && Math.abs(nextText - themeTextScale) < 0.001f
                && Math.abs(nextUi - themeUiScale) < 0.001f) {
            return;
        }
        themeFollowSystem = nextFollow;
        pageFollowScale = nextPageFollow;
        themeTextScale = nextText;
        themeUiScale = nextUi;
        persistThemeScale();
        runOnUiThread(() -> {
            if (appWebView != null && appWebView.getSettings() != null) {
                appWebView.getSettings().setTextZoom(100);
            }
            registerAppScaleScript();
            injectAppScale();
            if (tabs != null) tabs.applyThemeScale();
            applyPageInsets();
        });
    }

    private void restoreThemeScale() {
        SharedPreferences prefs = getSharedPreferences(THEME_PREFS, MODE_PRIVATE);
        if (!prefs.contains(PREF_TEXT_SCALE) && !prefs.contains(PREF_UI_SCALE)) return;
        themeFollowSystem = prefs.getBoolean(PREF_FOLLOW_SYSTEM, false);
        pageFollowScale = prefs.getBoolean(PREF_FOLLOW_PAGE, true);
        themeTextScale = clampScale(prefs.getFloat(PREF_TEXT_SCALE, 1f), 0.4f, 3f, 1f);
        themeUiScale = clampScale(prefs.getFloat(PREF_UI_SCALE, 1f), 0.5f, 2f, 1f);
    }

    private void persistThemeScale() {
        getSharedPreferences(THEME_PREFS, MODE_PRIVATE)
                .edit()
                .putBoolean(PREF_FOLLOW_SYSTEM, themeFollowSystem)
                .putBoolean(PREF_FOLLOW_PAGE, pageFollowScale)
                .putFloat(PREF_TEXT_SCALE, themeTextScale)
                .putFloat(PREF_UI_SCALE, themeUiScale)
                .apply();
    }

    private void registerAppScaleScript() {
        if (appWebView == null) return;
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return;
        try {
            removeAppScaleScript();
            appScaleScriptHandle = WebViewCompat.addDocumentStartJavaScript(
                    appWebView,
                    appScaleScript(),
                    new HashSet<>(Arrays.asList("*", "file:///*"))
            );
        } catch (Throwable ignored) {
        }
    }

    private void removeAppScaleScript() {
        if (appScaleScriptHandle == null) return;
        try {
            appScaleScriptHandle.getClass().getMethod("remove").invoke(appScaleScriptHandle);
        } catch (Throwable ignored) {
        }
        appScaleScriptHandle = null;
    }

    private void injectAppScale() {
        if (appWebView == null) return;
        appWebView.evaluateJavascript(appScaleScript(), null);
    }

    private String appScaleScript() {
        return "(function(){var r=document.documentElement;if(!r||!r.style)return;"
                + "r.style.setProperty('--text-scale','" + chromeTextScale() + "');"
                + "r.style.setProperty('--ui-scale','" + chromeUiScale() + "');"
                + "})();";
    }

    float chromeTextScale() {
        if (themeFollowSystem) return 1f;
        return themeTextScale;
    }

    float chromeUiScale() {
        if (themeFollowSystem) return 1f;
        return themeUiScale;
    }

    float pageTextScale() {
        if (!pageFollowScale || themeFollowSystem) return 1f;
        return themeTextScale;
    }

    int pageTextZoom() {
        if (!pageFollowScale || themeFollowSystem) return 100;
        float ui = themeUiScale <= 0.01f ? 1f : themeUiScale;
        int zoom = Math.round(themeTextScale / ui * 100f);
        return Math.max(10, Math.min(1000, zoom));
    }

    float pageUiScale() {
        if (!pageFollowScale || themeFollowSystem) return 1f;
        return themeUiScale;
    }

    void applyPageDarkMode(boolean follow, boolean dark) {
        boolean nextFollow = follow;
        boolean nextDark = dark;
        if (nextFollow == pageFollowDarkMode && nextDark == pageDarkMode) return;
        boolean reload = nextFollow != pageFollowDarkMode || (nextFollow && nextDark != pageDarkMode);
        pageFollowDarkMode = nextFollow;
        pageDarkMode = nextDark;
        runOnUiThread(() -> {
            if (tabs != null) tabs.applyPageDarkMode(reload);
        });
    }

    boolean pageFollowDarkMode() {
        return pageFollowDarkMode;
    }

    boolean pageDarkMode() {
        return pageDarkMode;
    }

    private Context pageWebViewContext() {
        Configuration config = new Configuration(getResources().getConfiguration());
        if (pageFollowDarkMode) {
            int night = pageDarkMode ? Configuration.UI_MODE_NIGHT_YES : Configuration.UI_MODE_NIGHT_NO;
            config.uiMode = (config.uiMode & ~Configuration.UI_MODE_NIGHT_MASK) | night;
        }
        Context themed = createConfigurationContext(config);
        int theme = pageFollowDarkMode && pageDarkMode
                ? R.style.Theme_WebManager_PageDark
                : R.style.Theme_WebManager_PageLight;
        ContextThemeWrapper wrapped = new ContextThemeWrapper(themed == null ? this : themed, theme);
        wrapped.applyOverrideConfiguration(config);
        return wrapped;
    }

    void applyTextZoom(WebView view) {
        if (view == null) return;
        applyTextZoom(view.getSettings());
    }

    void applyTextZoom(WebSettings settings) {
        if (settings == null) return;
        int zoom = pageTextZoom();
        if (settings.getTextZoom() == zoom) return;
        settings.setTextZoom(zoom);
    }

    private static float clampScale(float value, float min, float max, float fallback) {
        if (Float.isNaN(value) || Float.isInfinite(value)) return fallback;
        return Math.max(min, Math.min(max, value));
    }

    boolean openUrl(String url) {
        return openUrl(url, "");
    }

    boolean openUrl(String url, String title) {
        if (url == null || url.trim().isEmpty()) return false;
        String target = url.trim();
        if (!(target.startsWith("http://") || target.startsWith("https://") || target.startsWith("file://"))) return false;
        runOnUiThread(() -> {
            if (tabs != null) tabs.openUrl(target, title);
        });
        return true;
    }

    boolean openUrls(String json) {
        runOnUiThread(() -> {
            if (tabs != null) tabs.openUrls(json);
        });
        return true;
    }

    boolean isPageOpen() {
        return pageContainer != null && pageContainer.getVisibility() == View.VISIBLE;
    }

    int pageSafeRight() {
        return Math.max(safeRight, 0);
    }

    int pageSafeBottom() {
        return Math.max(safeBottom, systemBarSize("navigation_bar_height"));
    }

    void setPageWindow(boolean visible) {
        if (pageContainer != null) {
            pageContainer.setVisibility(visible ? View.VISIBLE : View.GONE);
        }
        if (!visible) {
            cancelPageChromeSample();
            getWindow().setStatusBarColor(Color.TRANSPARENT);
            getWindow().setNavigationBarColor(Color.TRANSPARENT);
            applySystemBarIcons(lightSystemBars);
        }
        if (tabs != null) {
            tabs.applyChromeVisible();
            tabs.syncRestoreButton(visible);
        }
    }

    void setBrowserChromeVisible(boolean visible) {
        runOnUiThread(() -> {
            if (tabs != null) tabs.setChromeVisible(visible);
        });
    }

    SavedPasswordStore passwordStore() {
        return passwordStore;
    }

    String consumeImportFile() {
        String json = pendingImportJson;
        pendingImportJson = null;
        return json == null ? "" : json;
    }

    void injectPasswordAutofill(WebView view) {
        String script = passwordAutofillScript();
        if (view == null || script.isEmpty()) return;
        String url = view.getUrl();
        if (url != null && (url.startsWith("about:") || url.startsWith("javascript:"))) return;
        view.evaluateJavascript(script, null);
    }

    private String passwordAutofillScript() {
        if (passwordAutofillScript != null) return passwordAutofillScript;
        try (InputStream in = getAssets().open("password-autofill.js")) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            passwordAutofillScript = out.toString("UTF-8");
        } catch (Exception e) {
            passwordAutofillScript = "";
        }
        return passwordAutofillScript;
    }

    void injectPageDownloadHook(WebView view) {
        String script = pageDownloadScript();
        if (view == null || script.isEmpty()) return;
        String url = view.getUrl();
        if (url != null && (url.startsWith("about:") || url.startsWith("javascript:"))) return;
        view.evaluateJavascript(script, null);
    }

    String pageDownloadScript() {
        if (pageDownloadScript != null) return pageDownloadScript;
        try (InputStream in = getAssets().open("page-download.js")) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            pageDownloadScript = out.toString("UTF-8");
        } catch (Exception e) {
            pageDownloadScript = "";
        }
        return pageDownloadScript;
    }

    boolean beginPageDownload(String mime, String filename) {
        synchronized (pageDownloadLock) {
            pendingPageDownload = new ByteArrayOutputStream();
            pendingPageDownloadMime = mime;
            pendingPageDownloadName = filename;
            pendingPageDownloadId = UUID.randomUUID().toString();
        }
        return true;
    }

    boolean appendPageDownload(String base64Chunk) {
        synchronized (pageDownloadLock) {
            if (pendingPageDownload == null) return false;
            try {
                byte[] bytes = Base64.decode(base64Chunk == null ? "" : base64Chunk, Base64.DEFAULT);
                pendingPageDownload.write(bytes);
                return true;
            } catch (Exception e) {
                pendingPageDownload = null;
                pendingPageDownloadMime = null;
                pendingPageDownloadName = null;
                pendingPageDownloadId = null;
                return false;
            }
        }
    }

    boolean finishPageDownload() {
        final byte[] bytes;
        final String mime;
        final String filename;
        synchronized (pageDownloadLock) {
            if (pendingPageDownload == null) return false;
            bytes = pendingPageDownload.toByteArray();
            mime = pendingPageDownloadMime;
            filename = pendingPageDownloadName;
            pendingPageDownload = null;
            pendingPageDownloadMime = null;
            pendingPageDownloadName = null;
            pendingPageDownloadId = null;
        }
        saveDownloadBytes(bytes, mime, filename);
        return true;
    }

    void cancelPageDownload() {
        synchronized (pageDownloadLock) {
            pendingPageDownload = null;
            pendingPageDownloadMime = null;
            pendingPageDownloadName = null;
            pendingPageDownloadId = null;
        }
    }

    void clearAppCache() {
        runOnUiThread(() -> {
            if (appWebView != null) {
                appWebView.clearCache(true);
                appWebView.clearFormData();
            }
            if (tabs != null) tabs.clearRuntimeCache();
            deleteDirContents(getCacheDir());
            File codeCache = getCodeCacheDir();
            if (codeCache != null) deleteDirContents(codeCache);
            Toast.makeText(this, "缓存已清除", Toast.LENGTH_SHORT).show();
        });
    }

    void clearBrowserSession() {
        runOnUiThread(() -> {
            if (tabs != null) tabs.clearSession();
        });
    }

    int clearPageSiteData(String json) {
        ClearRequest request = parseClearRequest(json);
        if (request.urls.isEmpty() || !request.types.any()) return 0;
        CountDownLatch started = new CountDownLatch(1);
        runOnUiThread(() -> {
            try {
                List<String> urls = request.urls;
                if (request.types.cookie) {
                    CookieManager cookies = CookieManager.getInstance();
                    for (String url : urls) clearCookiesForUrl(cookies, url);
                    cookies.flush();
                }
                if (request.types.localStorage || request.types.indexedDB) {
                    clearOriginStorage(urls, request.types, () -> {
                        if (tabs != null) tabs.reloadMatchingUrls(urls);
                    });
                } else if (tabs != null) {
                    tabs.reloadMatchingUrls(urls);
                }
            } catch (Exception ignored) {
            } finally {
                started.countDown();
            }
        });
        try {
            started.await(4, TimeUnit.SECONDS);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
        return request.urls.size();
    }

    private static final class ClearTypes {
        boolean localStorage;
        boolean indexedDB;
        boolean cookie;

        boolean any() {
            return localStorage || indexedDB || cookie;
        }
    }

    private static final class ClearRequest {
        final List<String> urls = new ArrayList<>();
        final ClearTypes types = new ClearTypes();
    }

    private ClearRequest parseClearRequest(String json) {
        ClearRequest request = new ClearRequest();
        if (json == null || json.trim().isEmpty()) return request;
        String raw = json.trim();
        try {
            if (raw.startsWith("[")) {
                collectClearUrls(new JSONArray(raw), request.urls);
                request.types.localStorage = true;
                return request;
            }
            JSONObject obj = new JSONObject(raw);
            collectClearUrls(obj.optJSONArray("urls"), request.urls);
            JSONObject types = obj.optJSONObject("types");
            if (types != null) {
                request.types.localStorage = types.optBoolean("localStorage", false);
                request.types.indexedDB = types.optBoolean("indexedDB", false);
                request.types.cookie = types.optBoolean("cookie", false);
            } else {
                request.types.localStorage = true;
            }
        } catch (Exception ignored) {
        }
        return request;
    }

    private void collectClearUrls(JSONArray arr, List<String> urls) {
        if (arr == null) return;
        LinkedHashSet<String> unique = new LinkedHashSet<>(urls);
        for (int i = 0; i < arr.length(); i++) {
            String url = normalizeClearUrl(arr.optString(i, ""));
            if (url != null && !shouldSkipSiteDataUrl(url)) unique.add(url);
        }
        urls.clear();
        urls.addAll(unique);
    }

    private boolean shouldSkipSiteDataUrl(String url) {
        if (url == null) return true;
        String target = url.trim().toLowerCase();
        return target.startsWith("file://") || target.startsWith("about:") || target.startsWith("data:");
    }

    private void clearOriginStorage(List<String> urls, ClearTypes types, Runnable done) {
        Map<String, String> originUrls = new LinkedHashMap<>();
        for (String url : urls) {
            if (shouldSkipSiteDataUrl(url)) continue;
            String origin = originOf(url);
            if (origin == null || origin.isEmpty()) continue;
            originUrls.putIfAbsent(origin, url);
        }
        if (originUrls.isEmpty()) {
            done.run();
            return;
        }
        List<Map.Entry<String, String>> pending = new ArrayList<>(originUrls.entrySet());
        AtomicInteger remaining = new AtomicInteger(pending.size());
        Runnable oneDone = () -> {
            if (remaining.decrementAndGet() <= 0) done.run();
        };
        if (types.localStorage && types.indexedDB) {
            for (Map.Entry<String, String> entry : pending) {
                try {
                    WebStorage.getInstance().deleteOrigin(entry.getKey());
                } catch (Exception ignored) {
                }
                oneDone.run();
            }
            return;
        }
        pumpStorageClear(pending, 0, types, oneDone);
    }

    private void pumpStorageClear(List<Map.Entry<String, String>> pending, int index, ClearTypes types, Runnable oneDone) {
        if (index >= pending.size()) return;
        Map.Entry<String, String> entry = pending.get(index);
        Runnable next = () -> {
            oneDone.run();
            pumpStorageClear(pending, index + 1, types, oneDone);
        };
        WebView open = tabs != null ? tabs.findWebViewForOrigin(entry.getKey()) : null;
        if (open != null) {
            runStorageClearScript(open, types, next);
        } else {
            startHiddenStorageClear(entry.getValue(), types, next);
        }
    }

    private void runStorageClearScript(WebView view, ClearTypes types, Runnable done) {
        if (view == null) {
            done.run();
            return;
        }
        view.evaluateJavascript(storageClearScript(types), value -> {
            if (!types.indexedDB) {
                done.run();
                return;
            }
            pollIndexedDbClear(view, 0, done);
        });
    }

    private void pollIndexedDbClear(WebView view, int attempt, Runnable done) {
        if (view == null || attempt >= 20) {
            done.run();
            return;
        }
        view.evaluateJavascript("window.__wmClearDone===true", value -> {
            if (value != null && value.contains("true")) {
                done.run();
            } else {
                mainHandler.postDelayed(() -> pollIndexedDbClear(view, attempt + 1, done), 150);
            }
        });
    }

    private void startHiddenStorageClear(String url, ClearTypes types, Runnable done) {
        WebView view = new WebView(this);
        applyCommonWebSettings(view.getSettings());
        view.setAlpha(0f);
        attachHiddenWebView(view);
        AtomicBoolean finished = new AtomicBoolean(false);
        Runnable finish = () -> {
            if (!finished.compareAndSet(false, true)) return;
            try {
                view.stopLoading();
                view.setWebViewClient(new WebViewClient());
                detachHiddenWebView(view);
                view.destroy();
            } catch (Exception ignored) {
            }
            done.run();
        };
        Runnable timeout = finish;
        view.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView v, String loadedUrl) {
                if (finished.get()) return;
                mainHandler.removeCallbacks(timeout);
                runStorageClearScript(v, types, finish);
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest request, android.webkit.WebResourceError error) {
                if (request != null && request.isForMainFrame()) {
                    mainHandler.removeCallbacks(timeout);
                    finish.run();
                }
            }
        });
        mainHandler.postDelayed(timeout, 8000);
        view.loadUrl(url);
    }

    private String storageClearScript(ClearTypes types) {
        String ls = types.localStorage ? "true" : "false";
        String idb = types.indexedDB ? "true" : "false";
        return "(function(){window.__wmClearDone=false;var ls=" + ls + ",idb=" + idb + ";"
                + "try{if(ls){localStorage.clear();sessionStorage.clear();}}catch(e){}"
                + "if(!idb||!window.indexedDB||!indexedDB.databases){window.__wmClearDone=true;return true;}"
                + "indexedDB.databases().then(function(dbs){"
                + "return Promise.all((dbs||[]).map(function(db){"
                + "return new Promise(function(resolve){"
                + "try{if(!db||!db.name){resolve();return;}var req=indexedDB.deleteDatabase(db.name);"
                + "req.onsuccess=req.onerror=req.onblocked=function(){resolve();};}"
                + "catch(e){resolve();}"
                + "});}));}).then(function(){window.__wmClearDone=true;}).catch(function(){window.__wmClearDone=true;});"
                + "return true;})();";
    }

    private String normalizeClearUrl(String raw) {
        if (raw == null) return null;
        String target = raw.trim();
        if (target.isEmpty()) return null;
        if (target.startsWith("http://") || target.startsWith("https://") || target.startsWith("file://")) return target;
        return null;
    }

    private void clearCookiesForUrl(CookieManager cookies, String url) {
        if (cookies == null || url == null) return;
        String header = cookies.getCookie(url);
        if (header == null || header.isEmpty()) return;
        String[] parts = header.split(";");
        for (String part : parts) {
            String name = part.split("=", 2)[0].trim();
            if (name.isEmpty()) continue;
            cookies.setCookie(url, name + "=; Max-Age=0; path=/");
        }
    }

    String originOf(String url) {
        try {
            Uri uri = Uri.parse(url);
            String scheme = uri.getScheme();
            String host = uri.getHost();
            if (scheme == null) return url;
            if (host == null || host.isEmpty()) return scheme + "://";
            int port = uri.getPort();
            return scheme + "://" + host + (port > 0 ? ":" + port : "");
        } catch (Exception e) {
            return url;
        }
    }

    private void deleteDirContents(File dir) {
        if (dir == null || !dir.isDirectory()) return;
        File[] files = dir.listFiles();
        if (files == null) return;
        for (File file : files) {
            if (file.isDirectory()) {
                deleteDirContents(file);
            }
            file.delete();
        }
    }

    void refreshPageChrome(WebView webView) {
        refreshPageChrome(webView, true);
    }

    void refreshPageChrome(WebView webView, boolean force) {
        if (!isPageOpen()) return;
        applyPageInsets();
        if (webView == null) {
            applyPageChromeColors(pageTopColor, pageBottomColor);
            return;
        }
        chromeWebView = webView;
        if (force) lastSampleAt = 0;
        applyPageChromeColors(pageTopColor, pageBottomColor);
        schedulePageChromeSample(webView);
    }

    void setSystemBarsAppearance(boolean light) {
        lightSystemBars = light;
        runOnUiThread(() -> {
            applySystemBarIcons(light);
            if (tabs != null) tabs.setAppDarkMode(!light);
        });
    }

    private void applyEdgeToEdge() {
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 29) {
            getWindow().setNavigationBarContrastEnforced(false);
            getWindow().setStatusBarContrastEnforced(false);
        }
        applySystemBarIcons(lightSystemBars);
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            Insets cutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout());
            safeTop = Math.max(bars.top, cutout.top);
            safeRight = Math.max(bars.right, cutout.right);
            safeBottom = Math.max(bars.bottom, cutout.bottom);
            safeLeft = Math.max(bars.left, cutout.left);
            injectSafeArea();
            applyPageInsets();
            if (tabs != null) tabs.injectPageSafeArea();
            if (isPageOpen() && chromeWebView != null) schedulePageChromeSample(chromeWebView);
            return insets;
        });
        ViewCompat.requestApplyInsets(root);
    }

    private void applyPageInsets() {
        int bottom = Math.max(safeBottom, systemBarSize("navigation_bar_height"));
        setInsetSize(pageTopInset, ViewGroup.LayoutParams.MATCH_PARENT, 0);
        setInsetSize(pageBottomInset, ViewGroup.LayoutParams.MATCH_PARENT, 0);
        if (pageWebHost != null) {
            ViewGroup.MarginLayoutParams params = (ViewGroup.MarginLayoutParams) pageWebHost.getLayoutParams();
            if (params != null) {
                params.leftMargin = Math.max(safeLeft, 0);
                params.rightMargin = Math.max(safeRight, 0);
                pageWebHost.setLayoutParams(params);
            }
        }
        if (browserBar != null) {
            browserBar.setPadding(
                    Math.max(safeLeft, 0),
                    browserBar.getPaddingTop(),
                    Math.max(safeRight, 0),
                    bottom
            );
        }
        if (restoreTabsBtn != null) {
            ViewGroup.MarginLayoutParams params = (ViewGroup.MarginLayoutParams) restoreTabsBtn.getLayoutParams();
            if (params != null) {
                float density = getResources().getDisplayMetrics().density;
                int margin = Math.round(16 * density * chromeUiScale());
                params.rightMargin = Math.max(safeRight, 0) + margin;
                params.bottomMargin = bottom + margin;
                restoreTabsBtn.setLayoutParams(params);
            }
        }
        if (tabs != null) tabs.applyChromeVisible();
    }

    private int systemBarSize(String dimenName) {
        int id = getResources().getIdentifier(dimenName, "dimen", "android");
        return id > 0 ? getResources().getDimensionPixelSize(id) : 0;
    }

    private void setInsetSize(View view, int width, int height) {
        if (view == null) return;
        ViewGroup.LayoutParams params = view.getLayoutParams();
        if (params == null) return;
        params.width = width;
        params.height = height;
        view.setLayoutParams(params);
    }

    private void applySystemBarIcons(boolean light) {
        View decor = getWindow().getDecorView();
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), decor);
        if (isPageOpen()) {
            controller.setAppearanceLightStatusBars(isLightColor(pageTopColor));
            controller.setAppearanceLightNavigationBars(isLightColor(pageBottomColor));
            return;
        }
        controller.setAppearanceLightStatusBars(light);
        controller.setAppearanceLightNavigationBars(light);
    }

    private void schedulePageChromeSample(WebView webView) {
        chromeWebView = webView;
        mainHandler.removeCallbacks(sampleChromeRunnable);
        long now = SystemClock.uptimeMillis();
        long delay = Math.max(0, SAMPLE_THROTTLE_MS - (now - lastSampleAt));
        mainHandler.postDelayed(sampleChromeRunnable, delay);
    }

    private void cancelPageChromeSample() {
        mainHandler.removeCallbacks(sampleChromeRunnable);
        chromeWebView = null;
    }

    private void samplePageColors(WebView webView) {
        if (!isPageOpen() || webView == null || webView.getVisibility() != View.VISIBLE) return;
        if (webView.getWindowToken() == null || webView.getWidth() <= 0 || webView.getHeight() <= 0) {
            mainHandler.postDelayed(sampleChromeRunnable, 80);
            return;
        }
        lastSampleAt = SystemClock.uptimeMillis();
        int gen = ++sampleGen;
        sampleFlags = 0;
        copyStrip(webView, true, gen);
        copyStrip(webView, false, gen);
    }

    private void copyStrip(WebView webView, boolean top, int gen) {
        Rect src = stripRect(webView, top);
        if (src == null || src.isEmpty()) {
            onStripSampled(top, fallbackDrawColor(webView, top), gen);
            return;
        }
        if (Build.VERSION.SDK_INT >= 26) {
            Bitmap bitmap = Bitmap.createBitmap(Math.max(1, src.width()), Math.max(1, src.height()), Bitmap.Config.ARGB_8888);
            try {
                PixelCopy.request(getWindow(), src, bitmap, result -> {
                    if (gen != sampleGen) {
                        bitmap.recycle();
                        return;
                    }
                    int color = result == PixelCopy.SUCCESS ? averageColor(bitmap) : fallbackDrawColor(webView, top);
                    bitmap.recycle();
                    onStripSampled(top, color, gen);
                }, mainHandler);
                return;
            } catch (Exception ignored) {
                bitmap.recycle();
            }
        }
        onStripSampled(top, fallbackDrawColor(webView, top), gen);
    }

    private Rect stripRect(WebView webView, boolean top) {
        int width = webView.getWidth();
        int height = webView.getHeight();
        if (width <= 0 || height <= 0) return null;
        int strip = Math.min(SAMPLE_STRIP_PX, height);
        int[] loc = new int[2];
        webView.getLocationInWindow(loc);
        View decor = getWindow().getDecorView();
        Rect src = new Rect(
                loc[0],
                top ? loc[1] : loc[1] + height - strip,
                loc[0] + width,
                top ? loc[1] + strip : loc[1] + height
        );
        if (!src.intersect(0, 0, Math.max(1, decor.getWidth()), Math.max(1, decor.getHeight()))) return null;
        return src;
    }

    private int fallbackDrawColor(WebView webView, boolean top) {
        int width = Math.max(1, webView.getWidth());
        int height = Math.max(1, webView.getHeight());
        int strip = Math.min(SAMPLE_STRIP_PX, height);
        Bitmap bitmap = Bitmap.createBitmap(width, strip, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.translate(0, top ? 0 : strip - height);
        webView.draw(canvas);
        int color = averageColor(bitmap);
        bitmap.recycle();
        return color;
    }

    private void onStripSampled(boolean top, int color, int gen) {
        if (gen != sampleGen || !isPageOpen()) return;
        if (top) {
            sampledTopColor = color;
            sampleFlags |= 1;
        } else {
            sampledBottomColor = color;
            sampleFlags |= 2;
        }
        if (sampleFlags != 3) return;
        applyPageChromeColors(sampledTopColor, sampledBottomColor);
    }

    private void applyPageChromeColors(int topColor, int bottomColor) {
        pageTopColor = opaque(topColor);
        pageBottomColor = opaque(bottomColor);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        if (pageTopInset != null) pageTopInset.setBackgroundColor(Color.TRANSPARENT);
        if (pageBottomInset != null) pageBottomInset.setBackgroundColor(Color.TRANSPARENT);
        if (pageContainer != null) pageContainer.setBackgroundColor(pageTopColor);
        if (browserBar != null) browserBar.setBackgroundColor(pageBottomColor);
        applySystemBarIcons(lightSystemBars);
        if (tabs != null) tabs.applyChromeColors(pageBottomColor);
    }

    private int opaque(int color) {
        return Color.rgb(Color.red(color), Color.green(color), Color.blue(color));
    }

    private int averageColor(Bitmap bitmap) {
        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        if (width <= 0 || height <= 0) return Color.WHITE;
        long r = 0;
        long g = 0;
        long b = 0;
        long n = 0;
        int stepX = Math.max(1, width / 24);
        int stepY = Math.max(1, height / 4);
        for (int y = 0; y < height; y += stepY) {
            for (int x = 0; x < width; x += stepX) {
                int pixel = bitmap.getPixel(x, y);
                if (Color.alpha(pixel) < 24) continue;
                r += Color.red(pixel);
                g += Color.green(pixel);
                b += Color.blue(pixel);
                n++;
            }
        }
        if (n == 0) return Color.WHITE;
        return Color.rgb((int) (r / n), (int) (g / n), (int) (b / n));
    }

    private boolean isLightColor(int color) {
        double luminance = (0.299 * Color.red(color) + 0.587 * Color.green(color) + 0.114 * Color.blue(color)) / 255d;
        return luminance > 0.55;
    }

    private boolean isActivePage(WebView view) {
        return isPageOpen() && view != null && view.getVisibility() == View.VISIBLE;
    }

    private void bindPageChrome(WebView view) {
        if (view == null) return;
        view.evaluateJavascript(
                "(function(){if(window.__wmChromeBound)return;window.__wmChromeBound=true;"
                        + "function ping(){try{WebManagerChrome.onViewportChange();}catch(e){}}"
                        + "function collect(){try{var overflow=[];var nodes=document.querySelectorAll('*');"
                        + "for(var i=0;i<nodes.length&&overflow.length<40;i++){var el=nodes[i];if(!el||el===document.documentElement||el===document.body)continue;"
                        + "if((el.scrollTop||0)>0||(el.scrollLeft||0)>0)overflow.push({i:i,x:el.scrollLeft||0,y:el.scrollTop||0});}"
                        + "WebManagerChrome.onViewState(JSON.stringify({x:window.scrollX||0,y:window.scrollY||0,overflow:overflow}));}catch(e){}}"
                        + "var t,c;function on(){if(t)cancelAnimationFrame(t);t=requestAnimationFrame(ping);}"
                        + "function settle(){if(c)clearTimeout(c);c=setTimeout(function(){c=0;collect();},700);}"
                        + "window.addEventListener('scroll',settle,true);"
                        + "window.addEventListener('resize',on);"
                        + "collect();"
                        + "})();",
                null
        );
    }

    private final class PageChromeBridge {
        private final WebView webView;

        PageChromeBridge(WebView webView) {
            this.webView = webView;
        }

        @JavascriptInterface
        public void onViewportChange() {
            runOnUiThread(() -> {
                if (isActivePage(webView)) refreshPageChrome(webView, false);
            });
        }

        @JavascriptInterface
        public void onViewState(String json) {
            runOnUiThread(() -> {
                if (tabs != null) tabs.updateViewState(webView, json);
            });
        }

        @JavascriptInterface
        public String queryPasswords(String url, String typed) {
            return passwordStore == null ? "[]" : passwordStore.query(url, typed);
        }

        @JavascriptInterface
        public void saveLogin(String json) {
            if (passwordStore != null) passwordStore.capture(json);
        }

        @JavascriptInterface
        public void saveBlobDownload(String dataUrl, String mime, String filename) {
            saveDataUrlDownload(dataUrl, mime, filename);
        }

        @JavascriptInterface
        public boolean beginDownloadFile(String mime, String filename) {
            return beginPageDownload(mime, filename);
        }

        @JavascriptInterface
        public boolean appendDownloadFile(String base64Chunk) {
            return appendPageDownload(base64Chunk);
        }

        @JavascriptInterface
        public boolean finishDownloadFile() {
            return finishPageDownload();
        }

        @JavascriptInterface
        public void cancelDownloadFile() {
            cancelPageDownload();
        }
    }

    private float cssPx(int px) {
        float density = getResources().getDisplayMetrics().density;
        if (density <= 0f) return px;
        return px / density;
    }

    int pageSafeTop() {
        return Math.max(safeTop, 0);
    }

    int pageSafeLeft() {
        return Math.max(safeLeft, 0);
    }

    private void injectSafeArea() {
        if (appWebView == null) return;
        String script = "(function(){var r=document.documentElement;if(!r||!r.style)return;"
                + "r.style.setProperty('--safe-top','" + cssPx(safeTop) + "px');"
                + "r.style.setProperty('--safe-right','" + cssPx(safeRight) + "px');"
                + "r.style.setProperty('--safe-bottom','" + cssPx(safeBottom) + "px');"
                + "r.style.setProperty('--safe-left','" + cssPx(safeLeft) + "px');"
                + "if(typeof window.applySafeAreaInsets==='function'){window.applySafeAreaInsets({"
                + "top:" + cssPx(safeTop)
                + ",right:" + cssPx(safeRight)
                + ",bottom:" + cssPx(safeBottom)
                + ",left:" + cssPx(safeLeft)
                + "});}})();";
        evaluateJavascript(script);
    }

    private boolean interceptAppNavigation(WebResourceRequest request) {
        if (request == null) return false;
        Uri uri = request.getUrl();
        if (handleExternalScheme(uri)) return true;
        if (!request.isForMainFrame()) return false;
        return openHttpUrl(uri);
    }

    private boolean openHttpUrl(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme();
        String target = uri.toString();
        if ("file".equals(scheme)) {
            if (target.contains("/android_asset/")) return false;
            openUrl(target);
            return true;
        }
        if (!"http".equals(scheme) && !"https".equals(scheme)) return false;
        openUrl(target);
        return true;
    }

    private boolean handleExternalScheme(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme();
        if ("http".equals(scheme) || "https".equals(scheme) || "file".equals(scheme) || "about".equals(scheme)
                || "blob".equals(scheme) || "data".equals(scheme) || "javascript".equals(scheme)) {
            return false;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception ignored) {
        }
        return true;
    }

    private boolean capturePopupWindow(android.os.Message resultMsg) {
        destroyPendingWindow();
        WebView temp = new WebView(this);
        temp.setLayoutParams(new FrameLayout.LayoutParams(1, 1));
        temp.setAlpha(0f);
        attachHiddenWebView(temp);
        pendingWindowWebView = temp;
        temp.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                consumePopupUrl(request == null ? null : request.getUrl());
                return true;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                consumePopupUrl(url == null ? null : Uri.parse(url));
            }
        });
        temp.setWebChromeClient(new JsChromeClient(this, true));
        temp.postDelayed(this::destroyPendingWindow, 8000);
        WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
        transport.setWebView(temp);
        resultMsg.sendToTarget();
        return true;
    }

    private void consumePopupUrl(Uri uri) {
        if (uri == null) return;
        String scheme = uri.getScheme();
        if (scheme == null || "about".equals(scheme) || "javascript".equals(scheme)) return;
        if (handleExternalScheme(uri)) {
            destroyPendingWindow();
            return;
        }
        if (openHttpUrl(uri)) {
            destroyPendingWindow();
        }
    }

    private void destroyPendingWindow() {
        if (pendingWindowWebView == null) return;
        pendingWindowWebView.removeCallbacks(this::destroyPendingWindow);
        pendingWindowWebView.stopLoading();
        pendingWindowWebView.setWebViewClient(new WebViewClient());
        detachHiddenWebView(pendingWindowWebView);
        pendingWindowWebView.destroy();
        pendingWindowWebView = null;
    }

    private DownloadListener downloadListener(WebView webView) {
        return (url, userAgent, contentDisposition, mimeType, contentLength) ->
                runOnUiThread(() -> enqueueDownload(webView, url, userAgent, contentDisposition, mimeType));
    }

    private void enqueueDownload(WebView webView, String url, String userAgent, String contentDisposition, String mimeType) {
        if (url == null || url.trim().isEmpty()) {
            Toast.makeText(this, "无法下载该文件", Toast.LENGTH_SHORT).show();
            return;
        }
        String target = url.trim();
        if (target.startsWith("blob:")) {
            downloadBlob(webView, target, contentDisposition, mimeType);
            return;
        }
        if (target.startsWith("data:")) {
            saveDataUrlDownload(target, mimeType, URLUtil.guessFileName(target, contentDisposition, mimeType));
            return;
        }
        if (target.startsWith("http://") || target.startsWith("https://")) {
            String referer = webView == null ? target : webView.getUrl();
            ensureStorageThen(() -> startHttpDownload(target, userAgent, contentDisposition, mimeType, referer));
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(target));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception ignored) {
            Toast.makeText(this, "无法下载该文件", Toast.LENGTH_SHORT).show();
        }
    }

    private void ensureStorageThen(Runnable action) {
        if (action == null) return;
        if (Build.VERSION.SDK_INT >= 30 || checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED) {
            action.run();
            return;
        }
        pendingDownload = action;
        requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, DOWNLOAD_PERMISSION_REQUEST);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != DOWNLOAD_PERMISSION_REQUEST) return;
        Runnable next = pendingDownload;
        pendingDownload = null;
        if (next != null && grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            next.run();
        } else {
            cancelPageDownload();
            Toast.makeText(this, "没有存储权限，无法保存下载文件", Toast.LENGTH_SHORT).show();
        }
    }

    private void startHttpDownload(String url, String userAgent, String contentDisposition, String mimeType, String referer) {
        File dest = uniqueDownloadFile(publicDownloadDir(),
                ensureDownloadExtension(URLUtil.guessFileName(url, contentDisposition, mimeType), mimeType));
        String name = dest.getName();
        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            if (mimeType != null && !mimeType.trim().isEmpty()) request.setMimeType(mimeType);
            if (userAgent != null && !userAgent.trim().isEmpty()) request.addRequestHeader("User-Agent", userAgent);
            String cookie = CookieManager.getInstance().getCookie(url);
            if (cookie != null && !cookie.isEmpty()) request.addRequestHeader("Cookie", cookie);
            if (referer != null && !referer.trim().isEmpty()) request.addRequestHeader("Referer", referer);
            request.setTitle(name);
            request.setDescription("网页下载");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(true);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            if (manager == null) throw new IllegalStateException("系统下载服务不可用");
            long id = manager.enqueue(request);
            Toast.makeText(this, "开始下载 " + name, Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(this, "下载失败: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private void downloadBlob(WebView webView, String url, String contentDisposition, String mimeType) {
        if (webView == null) {
            Toast.makeText(this, "无法下载该文件", Toast.LENGTH_SHORT).show();
            return;
        }
        String mime = mimeType == null ? "" : mimeType;
        String name = ensureDownloadExtension(URLUtil.guessFileName(url, contentDisposition, mimeType), mime);
        String quotedUrl = JSONObject.quote(url);
        String quotedMime = JSONObject.quote(mime);
        String quotedName = JSONObject.quote(name);
        String script = "(function(){function fail(){try{(window.WebManagerChrome||window.Android).saveBlobDownload('','','');}catch(e){}}"
                + "function save(b,nameHint){if(!b){fail();return;}"
                + "var mime=(b.type||" + quotedMime + "||'');"
                + "var name=(nameHint||(window.__wmDlNames&&window.__wmDlNames[" + quotedUrl + "])||" + quotedName + "||'');"
                + "if(typeof(window.WebManagerChrome||window.Android).beginDownloadFile==='function'){"
                + "b.arrayBuffer().then(function(buf){var u8=new Uint8Array(buf);var n=window.WebManagerChrome||window.Android;"
                + "try{n.beginDownloadFile(mime,name);"
                + "var CHUNK=262144;function toB64(part){var s='';for(var i=0;i<part.length;i++)s+=String.fromCharCode(part[i]);return btoa(s);}"
                + "for(var i=0;i<u8.length;i+=CHUNK){if(n.appendDownloadFile(toB64(u8.subarray(i,Math.min(i+CHUNK,u8.length))))===false)throw 0;}"
                + "n.finishDownloadFile();}catch(e){try{n.cancelDownloadFile();}catch(x){}fail();}}).catch(fail);return;}"
                + "var reader=new FileReader();reader.onload=function(){try{(window.WebManagerChrome||window.Android).saveBlobDownload(String(reader.result||''),"
                + "mime,name);}catch(e){fail();}};reader.readAsDataURL(b);}"
                + "try{if(window.__wmDlBlobs&&window.__wmDlBlobs[" + quotedUrl + "]){save(window.__wmDlBlobs[" + quotedUrl + "]);return;}"
                + "fetch(" + quotedUrl + ").then(function(r){return r.blob();}).then(save).catch(fail);}catch(e){fail();}})();";
        webView.evaluateJavascript(script, null);
    }

    void saveDataUrlDownload(String dataUrl, String mime, String filename) {
        runOnUiThread(() -> {
            if (dataUrl == null || dataUrl.trim().isEmpty()) {
                Toast.makeText(this, "下载失败", Toast.LENGTH_SHORT).show();
                return;
            }
            try {
                byte[] bytes = decodeDataUrl(dataUrl);
                String resolvedMime = mime;
                if (resolvedMime == null || resolvedMime.trim().isEmpty()) resolvedMime = dataUrlMime(dataUrl);
                String name = ensureDownloadExtension(
                        (filename == null || filename.trim().isEmpty())
                                ? URLUtil.guessFileName("https://download.local/file", null, resolvedMime)
                                : filename,
                        resolvedMime);
                saveDownloadBytes(bytes, resolvedMime, name);
            } catch (Exception e) {
                Toast.makeText(this, "下载失败: " + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        });
    }

    private byte[] decodeDataUrl(String dataUrl) {
        String raw = dataUrl.trim();
        int comma = raw.indexOf(',');
        if (raw.startsWith("data:") && comma > 0) {
            String meta = raw.substring(5, comma);
            String payload = raw.substring(comma + 1);
            if (meta.toLowerCase().contains(";base64")) {
                return Base64.decode(payload, Base64.DEFAULT);
            }
            return Uri.decode(payload).getBytes(StandardCharsets.UTF_8);
        }
        return Base64.decode(raw, Base64.DEFAULT);
    }

    private String dataUrlMime(String dataUrl) {
        if (dataUrl == null || !dataUrl.startsWith("data:")) return "application/octet-stream";
        int comma = dataUrl.indexOf(',');
        String meta = comma > 0 ? dataUrl.substring(5, comma) : "";
        int semi = meta.indexOf(';');
        String mime = (semi >= 0 ? meta.substring(0, semi) : meta).trim();
        return mime.isEmpty() ? "application/octet-stream" : mime;
    }

    void saveDownloadBytes(byte[] bytes, String mime, String filename) {
        final byte[] payload = bytes == null ? new byte[0] : bytes;
        runOnUiThread(() -> ensureStorageThen(() -> {
            try {
                String safeName = ensureDownloadExtension(
                        (filename == null || filename.trim().isEmpty())
                                ? "download.bin"
                                : filename.replaceAll("[\\\\/:*?\"<>|]", "_"),
                        mime);
                File out = writeDownloadFile(payload, safeName);
                Toast.makeText(this, "已保存到下载目录: " + out.getName(), Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(this, "保存失败: " + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        }));
    }

    File appDownloadDir() {
        File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (dir == null) dir = getFilesDir();
        if (dir != null && !dir.exists()) dir.mkdirs();
        if (dir == null) dir = getCacheDir();
        return dir;
    }

    File publicDownloadDir() {
        File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (dir != null && !dir.exists()) dir.mkdirs();
        return dir;
    }

    String numberedDownloadName(String filename, int index) {
        int split = filename.lastIndexOf('.');
        String stem = split > 0 ? filename.substring(0, split) : filename;
        String ext = split > 0 ? filename.substring(split) : "";
        return stem + "(" + index + ")" + ext;
    }

    String[] downloadMimeFallbacks(String mime, String filename) {
        String preferred = mediaStoreDownloadMime(mime, filename);
        if ("application/octet-stream".equals(preferred)) {
            return new String[] { preferred };
        }
        return new String[] { preferred, "application/octet-stream" };
    }

    String mediaStoreDownloadMime(String mime, String filename) {
        String raw = mime == null ? "" : mime.trim();
        String lower = raw.toLowerCase(Locale.US);
        String name = filename == null ? "" : filename.toLowerCase(Locale.US);
        // 不少 Android 10+ 机型的 Downloads 集合拒收 application/zip，TXT 能下、ZIP 不能下。
        if (lower.contains("zip") || name.endsWith(".zip")) return "application/octet-stream";
        if (raw.isEmpty()) return "application/octet-stream";
        int semicolon = raw.indexOf(';');
        return semicolon >= 0 ? raw.substring(0, semicolon).trim() : raw;
    }

    String ensureDownloadExtension(String filename, String mime) {
        String safe = filename == null ? "" : filename.trim();
        if (safe.isEmpty()) safe = "download.bin";
        String lower = safe.toLowerCase(Locale.US);
        String mimeLower = mime == null ? "" : mime.toLowerCase(Locale.US);
        boolean zip = mimeLower.contains("zip") || lower.endsWith(".zip");
        if (zip && !lower.endsWith(".zip")) {
            int dot = safe.lastIndexOf('.');
            String stem = dot > 0 ? safe.substring(0, dot) : safe;
            if (stem.isEmpty() || "download".equalsIgnoreCase(stem) || "downloadfile".equalsIgnoreCase(stem)) {
                stem = "download";
            }
            return stem + ".zip";
        }
        return safe;
    }

    private File uniqueDownloadFile(File dir, String filename) {
        String safe = ensureDownloadExtension(
                (filename == null || filename.trim().isEmpty())
                        ? "download.bin"
                        : filename.replaceAll("[\\\\/:*?\"<>|]", "_"),
                null);
        if (dir == null) dir = publicDownloadDir();
        if (dir == null) dir = appDownloadDir();
        if (dir != null && !dir.exists()) dir.mkdirs();
        File out = new File(dir, safe);
        if (!downloadNameTaken(out)) return out;
        for (int i = 1; i < 1000; i++) {
            File next = new File(dir, numberedDownloadName(safe, i));
            if (!downloadNameTaken(next)) return next;
        }
        return new File(dir, numberedDownloadName(safe, (int) (System.currentTimeMillis() % 100000)));
    }

    private boolean downloadNameTaken(File file) {
        if (file == null) return false;
        String name = file.getName();
        if (name == null || name.trim().isEmpty()) return false;
        if (downloadFileExists(file) || downloadFileExists(new File(appDownloadDir(), name))) return true;
        File publicDir = publicDownloadDir();
        if (publicDir != null && downloadFileExists(new File(publicDir, name))) return true;
        return mediaStoreHasDownloadName(name);
    }

    private boolean mediaStoreHasDownloadName(String name) {
        if (name == null || name.trim().isEmpty()) return false;
        if (Build.VERSION.SDK_INT < 29) return false;
        try (Cursor cursor = getContentResolver().query(
                MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                new String[]{MediaStore.Downloads._ID},
                MediaStore.Downloads.DISPLAY_NAME + "=?",
                new String[]{name.trim()},
                null)) {
            return cursor != null && cursor.moveToFirst();
        } catch (Exception ignored) {
            return false;
        }
    }

    private static boolean downloadFileExists(File file) {
        return file != null && file.exists() && file.isFile();
    }

    private File writeDownloadFile(byte[] payload, String filename) throws Exception {
        File[] dirs = new File[] { publicDownloadDir(), appDownloadDir() };
        Exception last = null;
        for (File dir : dirs) {
            if (dir == null) continue;
            File out = uniqueDownloadFile(dir, filename);
            try (FileOutputStream fos = new FileOutputStream(out)) {
                fos.write(payload);
                return out;
            } catch (Exception e) {
                last = e;
            }
        }
        throw last == null ? new IllegalStateException("没有可写的下载目录") : last;
    }

    void attachHiddenWebView(WebView hidden) {
        if (root == null) root = findViewById(R.id.rootLayout);
        if (hidden.getParent() == null) {
            root.addView(hidden);
        }
    }

    void detachHiddenWebView(WebView hidden) {
        if (root != null) root.removeView(hidden);
    }

    void evaluateJavascript(String script) {
        if (appWebView == null) return;
        appWebView.post(() -> appWebView.evaluateJavascript(script, null));
    }

    void saveExportedFile(String base64, String mime, String filename) {
        byte[] bytes;
        try {
            bytes = Base64.decode(base64 == null ? "" : base64, Base64.DEFAULT);
        } catch (Exception e) {
            runOnUiThread(() -> Toast.makeText(this, "导出失败: " + e.getMessage(), Toast.LENGTH_LONG).show());
            return;
        }
        saveExportedBytes(bytes, mime, filename);
    }

    void saveExportedBytes(byte[] bytes, String mime, String filename) {
        final byte[] payload = bytes == null ? new byte[0] : bytes;
        runOnUiThread(() -> {
            try {
                File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (dir == null) dir = getCacheDir();
                if (!dir.exists()) dir.mkdirs();
                String safeName = (filename == null || filename.trim().isEmpty())
                        ? "export.bin"
                        : filename.replaceAll("[\\\\/:*?\"<>|]", "_");
                File out = new File(dir, safeName);
                try (FileOutputStream fos = new FileOutputStream(out)) {
                    fos.write(payload);
                }
                Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", out);
                Intent share = new Intent(Intent.ACTION_SEND);
                share.setType((mime == null || mime.isEmpty()) ? "*/*" : mime);
                share.putExtra(Intent.EXTRA_STREAM, uri);
                share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivity(Intent.createChooser(share, "导出 " + safeName));
            } catch (Exception e) {
                Toast.makeText(this, "导出失败: " + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == GALLERY_PICK_REQUEST) {
            deliverGalleryImage(resultCode, data);
            return;
        }
        if (requestCode != FILE_CHOOSER_REQUEST || filePathCallback == null) return;
        Uri[] result = parseFileChooserResult(resultCode, data);
        try {
            filePathCallback.onReceiveValue(result);
        } catch (Exception ignored) {
        }
        filePathCallback = null;
    }

    void pickGalleryImage() {
        runOnUiThread(() -> {
            Intent pick = new Intent(Intent.ACTION_PICK);
            pick.setDataAndType(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "image/*");
            Intent gallery = new Intent(Intent.ACTION_GET_CONTENT);
            gallery.addCategory(Intent.CATEGORY_OPENABLE);
            gallery.setType("image/*");
            Intent chooser = Intent.createChooser(gallery, "选择图片");
            chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[] { pick });
            if (startGalleryPicker(chooser)) return;
            if (startGalleryPicker(pick)) return;
            if (startGalleryPicker(gallery)) return;
            Toast.makeText(this, "无法打开图库", Toast.LENGTH_SHORT).show();
        });
    }

    private boolean startGalleryPicker(Intent intent) {
        try {
            startActivityForResult(intent, GALLERY_PICK_REQUEST);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private void deliverGalleryImage(int resultCode, Intent data) {
        if (resultCode != RESULT_OK || data == null || data.getData() == null || appWebView == null) return;
        Uri uri = data.getData();
        new Thread(() -> {
            String dataUrl = readImageDataUrl(uri);
            if (dataUrl == null) {
                runOnUiThread(() -> Toast.makeText(this, "无法读取图片", Toast.LENGTH_SHORT).show());
                return;
            }
            String js = "if(typeof receiveGalleryImage==='function')receiveGalleryImage("
                    + JSONObject.quote(dataUrl) + ");";
            runOnUiThread(() -> appWebView.evaluateJavascript(js, null));
        }).start();
    }

    private String readImageDataUrl(Uri uri) {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            if (in == null) return null;
            BitmapFactory.decodeStream(in, null, bounds);
        } catch (Exception e) {
            return null;
        }
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inSampleSize = gallerySampleSize(bounds.outWidth, bounds.outHeight, 1600);
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            if (in == null) return null;
            Bitmap bitmap = BitmapFactory.decodeStream(in, null, opts);
            if (bitmap == null) return null;
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.JPEG, 85, out);
            bitmap.recycle();
            return "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) {
            return null;
        }
    }

    private static int gallerySampleSize(int width, int height, int maxEdge) {
        int size = 1;
        while (width / size > maxEdge || height / size > maxEdge) size *= 2;
        return size;
    }

    private Uri[] parseFileChooserResult(int resultCode, Intent data) {
        if (resultCode != RESULT_OK || data == null) return null;
        ClipData clip = data.getClipData();
        if (clip != null && clip.getItemCount() > 0) {
            Uri[] result = new Uri[clip.getItemCount()];
            int count = 0;
            for (int i = 0; i < clip.getItemCount(); i++) {
                Uri uri = clip.getItemAt(i).getUri();
                if (uri != null) result[count++] = uri;
            }
            if (count == 0) return null;
            if (count == result.length) return result;
            Uri[] trimmed = new Uri[count];
            System.arraycopy(result, 0, trimmed, 0, count);
            return trimmed;
        }
        if (data.getData() != null) return new Uri[] { data.getData() };
        return WebChromeClient.FileChooserParams.parseResult(resultCode, data);
    }

    private boolean launchFileChooser(WebChromeClient.FileChooserParams params) {
        boolean multiple = params != null
                && params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE;
        String type = safeChooserMime(params);
        Intent getContent = buildChooserIntent(Intent.ACTION_GET_CONTENT, type, multiple);
        Intent openDoc = buildChooserIntent(Intent.ACTION_OPEN_DOCUMENT, type, multiple);
        if ("image/*".equals(type) && !multiple) {
            Intent pick = new Intent(Intent.ACTION_PICK);
            pick.setDataAndType(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "image/*");
            Intent chooser = Intent.createChooser(getContent, "选择图片");
            chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[] { pick });
            if (startFileChooser(chooser)) return true;
            if (startFileChooser(pick)) return true;
        }
        // Android 10 系统文件选择器一旦带上 application/json 等 EXTRA_MIME_TYPES，
        // 会在还没画出文件列表时直接崩溃，startActivity 成功后回退逻辑走不到。
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.Q) {
            if (startFileChooser(Intent.createChooser(getContent, "选择文件"))) return true;
            if (startFileChooser(getContent)) return true;
            return startFileChooser(openDoc);
        }
        if (startFileChooser(openDoc)) return true;
        return startFileChooser(Intent.createChooser(getContent, "选择文件"));
    }

    private boolean startFileChooser(Intent intent) {
        try {
            startActivityForResult(intent, FILE_CHOOSER_REQUEST);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private Intent buildChooserIntent(String action, String type, boolean multiple) {
        Intent intent = new Intent(action);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(type);
        if (multiple) intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        return intent;
    }

    // 备份导入的 accept=".json,.zip,.html" 不能传给系统选择器。
    // 只保留 image/* 这类 DocumentsUI 能稳定处理的类型，其余一律 */*。
    private String safeChooserMime(WebChromeClient.FileChooserParams params) {
        if (params == null) return "*/*";
        String[] types = params.getAcceptTypes();
        if (types == null || types.length == 0) return "*/*";
        boolean sawImage = false;
        for (String raw : types) {
            if (raw == null) continue;
            for (String part : raw.split(",")) {
                String token = part.trim().toLowerCase();
                if (token.isEmpty() || token.equals("*/*")) continue;
                if (token.equals("image/*") || token.startsWith("image/")) {
                    sawImage = true;
                    continue;
                }
                return "*/*";
            }
        }
        return sawImage ? "image/*" : "*/*";
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingIntent(intent);
        deliverPendingImport();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (tabs != null) {
            tabs.pauseBackground();
            tabs.persistFullState();
        }
    }

    @Override
    protected void onStop() {
        if (tabs != null) tabs.persistFullState();
        super.onStop();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (tabs != null && isPageOpen()) {
            tabs.resumeActive();
            if (chromeWebView != null) refreshPageChrome(chromeWebView, true);
        }
    }

    @Override
    protected void onDestroy() {
        if (tabs != null) tabs.persistFullState();
        if (bridge != null) bridge.cancelAll();
        destroyPendingWindow();
        cancelPageChromeSample();
        if (tabs != null) tabs.destroyAll();
        super.onDestroy();
    }

    private void handleIncomingIntent(Intent intent) {
        if (intent == null) return;
        Uri uri = intent.getData();
        if (uri == null && Intent.ACTION_SEND.equals(intent.getAction())) {
            uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        }
        if (uri == null && intent.getClipData() != null && intent.getClipData().getItemCount() > 0) {
            uri = intent.getClipData().getItemAt(0).getUri();
        }
        if (uri == null) return;
        String action = intent.getAction();
        if (Intent.ACTION_VIEW.equals(action) || Intent.ACTION_SEND.equals(action) || Intent.ACTION_EDIT.equals(action)) {
            queueImportUri(uri, intent.getType());
            intent.setData(null);
            intent.removeExtra(Intent.EXTRA_STREAM);
            intent.setAction(Intent.ACTION_MAIN);
        }
    }

    private void queueImportUri(Uri uri, String mime) {
        if (uri == null) return;
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            if (in == null) {
                runOnUiThread(() -> Toast.makeText(this, "无法读取外部文件", Toast.LENGTH_SHORT).show());
                return;
            }
            byte[] bytes = readAllBytes(in);
            String name = queryDisplayName(uri);
            JSONObject payload = new JSONObject();
            payload.put("name", name);
            payload.put("mime", mime == null ? "" : mime);
            payload.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP));
            if (isHtmlImport(name, mime)) {
                payload.put("fileUrl", copyHtmlToLocalFile(name, bytes));
            }
            pendingImportJson = payload.toString();
        } catch (Exception e) {
            runOnUiThread(() -> Toast.makeText(this, "外部文件读取失败", Toast.LENGTH_SHORT).show());
        }
    }

    private boolean isHtmlImport(String name, String mime) {
        String n = name == null ? "" : name.toLowerCase();
        String m = mime == null ? "" : mime.toLowerCase();
        return n.endsWith(".html") || n.endsWith(".htm") || m.contains("html") || m.contains("xhtml");
    }

    private String copyHtmlToLocalFile(String displayName, byte[] bytes) throws Exception {
        String safe = (displayName == null || displayName.trim().isEmpty())
                ? "page.html"
                : displayName.replaceAll("[\\\\/:*?\"<>|]", "_");
        String lower = safe.toLowerCase();
        if (!lower.endsWith(".html") && !lower.endsWith(".htm")) safe += ".html";
        // 只写应用外部 Download：/storage/emulated/0/Android/data/<包名>/files/Download/
        // 不用 appDownloadDir()，它在外部目录不可用时会退回私有 files。
        File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (dir == null) throw new IllegalStateException("没有可写的下载目录");
        if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("无法创建下载目录");
        // 保留原文件名，不在前面加时间戳。同名直接覆盖。
        File out = new File(dir, safe);
        try (FileOutputStream fos = new FileOutputStream(out)) {
            fos.write(bytes == null ? new byte[0] : bytes);
        }
        return "file://" + out.getAbsolutePath();
    }

    private void deliverPendingImport() {
        if (pendingImportJson == null || appWebView == null) return;
        evaluateJavascript("(function(){if(typeof window.consumeNativeImport==='function')window.consumeNativeImport();})();");
    }

    private String queryDisplayName(Uri uri) {
        String fallback = uri.getLastPathSegment();
        if (fallback == null || fallback.trim().isEmpty()) fallback = "import.bin";
        try (Cursor cursor = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                String name = cursor.getString(0);
                if (name != null && !name.trim().isEmpty()) return name;
            }
        } catch (Exception ignored) {
        }
        return fallback;
    }

    private byte[] readAllBytes(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
        return out.toByteArray();
    }

    private class AppChromeClient extends JsChromeClient {
        AppChromeClient() {
            super(MainActivity.this, true);
        }

        @Override
        public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, android.os.Message resultMsg) {
            return capturePopupWindow(resultMsg);
        }

        @Override
        public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams fileChooserParams) {
            return handleShowFileChooser(callback, fileChooserParams);
        }
    }

    private boolean handleShowFileChooser(ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams fileChooserParams) {
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(null);
            filePathCallback = null;
        }
        filePathCallback = callback;
        if (launchFileChooser(fileChooserParams)) return true;
        filePathCallback = null;
        callback.onReceiveValue(null);
        return false;
    }

    private class PageWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (request == null) return false;
            Uri uri = request.getUrl();
            if (uri == null) return false;
            String scheme = uri.getScheme();
            if ("blob".equals(scheme) || "data".equals(scheme)) {
                enqueueDownload(view, uri.toString(), null, null, request.getRequestHeaders() == null
                        ? null
                        : request.getRequestHeaders().get("Content-Type"));
                return true;
            }
            return handleExternalScheme(uri);
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            applyTextZoom(view);
            if (tabs != null) {
                tabs.beginPageLoad(view);
                tabs.updateUrl(view, url);
                tabs.injectPageLayoutOnLoad(view, false);
            }
            if (isActivePage(view)) refreshPageChrome(view, true);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            applyTextZoom(view);
            if (tabs != null) {
                tabs.updateUrl(view, url);
                tabs.injectPageLayoutOnLoad(view, true);
                tabs.restoreViewState(view);
                tabs.finishPageLoad(view);
            }
            injectPasswordAutofill(view);
            injectPageDownloadHook(view);
            if (!isActivePage(view)) return;
            bindPageChrome(view);
            refreshPageChrome(view, true);
            view.postVisualStateCallback(0, new WebView.VisualStateCallback() {
                @Override
                public void onComplete(long requestId) {
                    if (isActivePage(view)) refreshPageChrome(view, true);
                }
            });
        }

        @Override
        public void onScaleChanged(WebView view, float oldScale, float newScale) {
            if (isActivePage(view)) refreshPageChrome(view, false);
        }
    }

    private class PageChromeClient extends JsChromeClient {
        PageChromeClient() {
            super(MainActivity.this, true);
        }

        @Override
        public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback, FileChooserParams fileChooserParams) {
            return handleShowFileChooser(callback, fileChooserParams);
        }

        @Override
        public void onReceivedTitle(WebView view, String title) {
            if (tabs != null) tabs.updateTitle(view, title);
        }

        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            if (newProgress >= 100 && isActivePage(view)) refreshPageChrome(view, true);
        }

        @Override
        public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, android.os.Message resultMsg) {
            WebView child = createPageWebView();
            if (tabs == null || tabs.addPopupTab(child) == null) {
                child.destroy();
                return false;
            }
            WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
            transport.setWebView(child);
            resultMsg.sendToTarget();
            return true;
        }

        @Override
        public void onCloseWindow(WebView window) {
            if (tabs != null) tabs.closeWindow(window);
        }
    }
}
