package com.webmanager.app;

import android.annotation.SuppressLint;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.DownloadListener;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import java.io.File;
import java.io.FileOutputStream;

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
    private boolean lightSystemBars = true;
    private int safeTop;
    private int safeRight;
    private int safeBottom;
    private int safeLeft;

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
        setupAppWebView();
        tabs = new BrowserTabsController(this);
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
        if (visible) {
            refreshPageChrome(null);
        } else {
            getWindow().setStatusBarColor(Color.TRANSPARENT);
            getWindow().setNavigationBarColor(Color.TRANSPARENT);
            applySystemBarIcons(lightSystemBars);
        }
        if (tabs != null) tabs.syncRestoreButton(visible);
    }

    void refreshPageChrome(WebView webView) {
        if (!isPageOpen()) return;
        int color = getResources().getColor(R.color.browser_toolbar_bg, getTheme());
        getWindow().setStatusBarColor(color);
        getWindow().setNavigationBarColor(color);
        if (pageTopInset != null) pageTopInset.setBackgroundColor(color);
        if (pageBottomInset != null) pageBottomInset.setBackgroundColor(color);
        if (pageContainer != null) pageContainer.setBackgroundColor(color);
        applyPageInsets();
        applySystemBarIcons(true);
    }

    void setSystemBarsAppearance(boolean light) {
        lightSystemBars = light;
        runOnUiThread(() -> applySystemBarIcons(light));
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
        boolean useLight = isPageOpen() || light;
        View decor = getWindow().getDecorView();
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), decor);
        controller.setAppearanceLightStatusBars(useLight);
        controller.setAppearanceLightNavigationBars(useLight);
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
        if (requestCode != 1001 || filePathCallback == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK && data != null && data.getClipData() != null) {
            ClipData clip = data.getClipData();
            result = new Uri[clip.getItemCount()];
            for (int i = 0; i < clip.getItemCount(); i++) {
                result[i] = clip.getItemAt(i).getUri();
            }
        } else {
            result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
        }
        filePathCallback.onReceiveValue(result);
        filePathCallback = null;
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (tabs != null) tabs.pauseBackground();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (tabs != null && isPageOpen()) tabs.resumeActive();
    }

    @Override
    protected void onDestroy() {
        if (bridge != null) bridge.cancelAll();
        destroyPendingWindow();
        if (tabs != null) tabs.destroyAll();
        super.onDestroy();
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
            if (filePathCallback != null) filePathCallback.onReceiveValue(null);
            filePathCallback = callback;
            Intent intent = fileChooserParams.createIntent();
            if (fileChooserParams.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            }
            try {
                startActivityForResult(intent, 1001);
            } catch (Exception e) {
                filePathCallback.onReceiveValue(null);
                filePathCallback = null;
                return false;
            }
            return true;
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
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (tabs != null) tabs.updateUrl(view, url);
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
