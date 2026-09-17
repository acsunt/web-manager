package com.webmanager.app;

import android.annotation.SuppressLint;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.util.Base64;
import android.view.View;
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
    private PageInfoBridge bridge;
    private ValueCallback<Uri[]> filePathCallback;
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
        applyEdgeToEdge();
        bridge = new PageInfoBridge(this);
        setupAppWebView();
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
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
        WebSettings settings = appWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);

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
                Uri uri = request.getUrl();
                if (uri == null) return false;
                String url = uri.toString();
                if (url.startsWith("file:///android_asset/")) return false;
                return openExternalUrl(url);
            }
        });
        appWebView.setWebChromeClient(new WebChromeClient() {
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
        });
        appWebView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimeType, long contentLength) {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception ignored) {
                    Toast.makeText(MainActivity.this, "无法打开下载链接", Toast.LENGTH_SHORT).show();
                }
            }
        });
        appWebView.loadUrl("file:///android_asset/index.html");
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
            return insets;
        });
        ViewCompat.requestApplyInsets(root);
    }

    private void applySystemBarIcons(boolean light) {
        View decor = getWindow().getDecorView();
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), decor);
        controller.setAppearanceLightStatusBars(light);
        controller.setAppearanceLightNavigationBars(light);
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

    boolean openExternalUrl(String url) {
        if (url == null) return false;
        String trimmed = url.trim();
        if (trimmed.isEmpty()) return false;
        try {
            Uri uri = Uri.parse(trimmed);
            if (uri.getScheme() == null || uri.getScheme().isEmpty()) {
                uri = Uri.parse("https://" + trimmed);
            }
            final Uri target = uri;
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, target);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                } catch (Exception e) {
                    Toast.makeText(this, "无法打开链接", Toast.LENGTH_SHORT).show();
                }
            });
            return true;
        } catch (Exception e) {
            return false;
        }
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
    protected void onDestroy() {
        if (bridge != null) bridge.cancelAll();
        super.onDestroy();
    }
}
