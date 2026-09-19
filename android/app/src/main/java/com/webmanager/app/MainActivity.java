package com.webmanager.app;

import android.annotation.SuppressLint;
import android.content.ClipData;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
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
import android.provider.OpenableColumns;
import android.util.Base64;
import android.view.PixelCopy;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import org.json.JSONObject;

import androidx.activity.OnBackPressedCallback;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;

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
    private BrowserTabsController tabs;
    private ValueCallback<Uri[]> filePathCallback;
    private WebView pendingWindowWebView;
    private String pendingImportJson;
    private boolean lightSystemBars = true;
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
    private static final long SAMPLE_THROTTLE_MS = 180;
    private static final int FILE_CHOOSER_REQUEST = 1001;

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
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
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
        appWebView.setBackgroundColor(Color.TRANSPARENT);
        appWebView.addJavascriptInterface(bridge, "Android");
        appWebView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
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
        appWebView.setDownloadListener(downloadListener());
        appWebView.loadUrl("file:///android_asset/index.html");
    }

    @SuppressLint({"SetJavaScriptEnabled", "SetAllowFileAccessFromFileURLs"})
    WebView createPageWebView() {
        WebView webView = new WebView(this);
        applyCommonWebSettings(webView.getSettings());
        webView.getSettings().setSupportMultipleWindows(true);
        webView.getSettings().setJavaScriptCanOpenWindowsAutomatically(true);
        webView.getSettings().setAllowFileAccessFromFileURLs(true);
        webView.getSettings().setAllowUniversalAccessFromFileURLs(true);
        webView.setFitsSystemWindows(false);
        webView.setBackgroundColor(Color.WHITE);
        webView.setSaveEnabled(true);
        webView.addJavascriptInterface(new PageChromeBridge(webView), "WebManagerChrome");
        webView.setOnScrollChangeListener((v, l, t, oldl, oldt) -> refreshPageChrome((WebView) v, false));
        webView.setWebViewClient(new PageWebViewClient());
        webView.setWebChromeClient(new PageChromeClient());
        webView.setDownloadListener(downloadListener());
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
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
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

    String consumeImportFile() {
        String json = pendingImportJson;
        pendingImportJson = null;
        return json == null ? "" : json;
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
            if (isPageOpen() && chromeWebView != null) schedulePageChromeSample(chromeWebView);
            return insets;
        });
        ViewCompat.requestApplyInsets(root);
    }

    private void applyPageInsets() {
        int top = Math.max(safeTop, systemBarSize("status_bar_height"));
        int bottom = Math.max(safeBottom, systemBarSize("navigation_bar_height"));
        setInsetSize(pageTopInset, ViewGroup.LayoutParams.MATCH_PARENT, top);
        setInsetSize(pageBottomInset, ViewGroup.LayoutParams.MATCH_PARENT, bottom);
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
                    browserBar.getPaddingBottom()
            );
        }
        if (restoreTabsBtn != null) {
            ViewGroup.MarginLayoutParams params = (ViewGroup.MarginLayoutParams) restoreTabsBtn.getLayoutParams();
            if (params != null) {
                float density = getResources().getDisplayMetrics().density;
                int margin = Math.round(16 * density);
                params.rightMargin = Math.max(safeRight, 0) + margin;
                params.bottomMargin = bottom + margin;
                restoreTabsBtn.setLayoutParams(params);
            }
        }
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
        getWindow().setStatusBarColor(pageTopColor);
        getWindow().setNavigationBarColor(pageBottomColor);
        if (pageTopInset != null) pageTopInset.setBackgroundColor(pageTopColor);
        if (pageBottomInset != null) pageBottomInset.setBackgroundColor(pageBottomColor);
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
                        + "var t,c;function on(){if(t)cancelAnimationFrame(t);t=requestAnimationFrame(ping);"
                        + "if(c)return;c=setTimeout(function(){c=0;collect();},400);}"
                        + "window.addEventListener('scroll',on,true);"
                        + "window.addEventListener('resize',on);"
                        + "document.addEventListener('touchmove',on,{passive:true});"
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
    }

    private float cssPx(int px) {
        float density = getResources().getDisplayMetrics().density;
        if (density <= 0f) return px;
        return px / density;
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
        if ("http".equals(scheme) || "https".equals(scheme) || "file".equals(scheme) || "about".equals(scheme)) {
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

    private DownloadListener downloadListener() {
        return (url, userAgent, contentDisposition, mimeType, contentLength) -> {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (Exception ignored) {
                Toast.makeText(MainActivity.this, "无法打开下载链接", Toast.LENGTH_SHORT).show();
            }
        };
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
        if (requestCode != FILE_CHOOSER_REQUEST || filePathCallback == null) return;
        Uri[] result = parseFileChooserResult(resultCode, data);
        try {
            filePathCallback.onReceiveValue(result);
        } catch (Exception ignored) {
        }
        filePathCallback = null;
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

    private File importHtmlDir() {
        File dir = new File(getFilesDir(), "imported-html");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    private String copyHtmlToLocalFile(String displayName, byte[] bytes) throws Exception {
        String safe = (displayName == null || displayName.trim().isEmpty())
                ? "page.html"
                : displayName.replaceAll("[\\\\/:*?\"<>|]", "_");
        String lower = safe.toLowerCase();
        if (!lower.endsWith(".html") && !lower.endsWith(".htm")) safe += ".html";
        File out = new File(importHtmlDir(), System.currentTimeMillis() + "_" + safe);
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
    }

    private class PageWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return handleExternalScheme(request.getUrl());
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            if (tabs != null) tabs.updateUrl(view, url);
            if (isActivePage(view)) refreshPageChrome(view, true);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (tabs != null) {
                tabs.updateUrl(view, url);
                tabs.restoreViewState(view);
            }
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
