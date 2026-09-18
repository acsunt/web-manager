package com.webmanager.app;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Bitmap;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

final class PageInfoBridge {
    private static final long TIMEOUT_MS = 12000L;
    private static final int MAX_QUEUE = 2;

    private final MainActivity activity;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Map<String, Job> jobs = new LinkedHashMap<>();
    private final Object exportLock = new Object();
    private ByteArrayOutputStream pendingExport;
    private String pendingMime;
    private String pendingFilename;
    private int activeCount = 0;

    PageInfoBridge(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public void fetchPageInfo(String url, String requestId) {
        mainHandler.post(() -> enqueue(url, requestId));
    }

    @JavascriptInterface
    public void cancelPageInfo(String requestId) {
        mainHandler.post(() -> cancel(requestId, false));
    }

    @JavascriptInterface
    public void cancelAllPageInfo() {
        mainHandler.post(this::cancelAll);
    }

    @JavascriptInterface
    public void saveFile(String base64, String mime, String filename) {
        activity.saveExportedFile(base64, mime, filename);
    }

    @JavascriptInterface
    public boolean beginSaveFile(String mime, String filename) {
        synchronized (exportLock) {
            pendingExport = new ByteArrayOutputStream();
            pendingMime = mime;
            pendingFilename = filename;
            return true;
        }
    }

    @JavascriptInterface
    public boolean appendSaveFile(String base64Chunk) {
        synchronized (exportLock) {
            if (pendingExport == null) return false;
            try {
                byte[] bytes = Base64.decode(base64Chunk == null ? "" : base64Chunk, Base64.DEFAULT);
                pendingExport.write(bytes);
                return true;
            } catch (Exception e) {
                pendingExport = null;
                pendingMime = null;
                pendingFilename = null;
                return false;
            }
        }
    }

    @JavascriptInterface
    public boolean finishSaveFile() {
        final byte[] bytes;
        final String mime;
        final String filename;
        synchronized (exportLock) {
            if (pendingExport == null) return false;
            bytes = pendingExport.toByteArray();
            mime = pendingMime;
            filename = pendingFilename;
            pendingExport = null;
            pendingMime = null;
            pendingFilename = null;
        }
        activity.saveExportedBytes(bytes, mime, filename);
        return true;
    }

    @JavascriptInterface
    public void cancelSaveFile() {
        synchronized (exportLock) {
            pendingExport = null;
            pendingMime = null;
            pendingFilename = null;
        }
    }

    @JavascriptInterface
    public void setSystemBarsAppearance(boolean light) {
        activity.setSystemBarsAppearance(light);
    }

    @JavascriptInterface
    public void setBrowserChromeVisible(boolean visible) {
        activity.setBrowserChromeVisible(visible);
    }

    @JavascriptInterface
    public String consumeImportFile() {
        return activity.consumeImportFile();
    }

    @JavascriptInterface
    public boolean openUrl(String url) {
        return activity.openUrl(url);
    }

    @JavascriptInterface
    public boolean openUrls(String json) {
        return activity.openUrls(json);
    }

    @JavascriptInterface
    public void alert(String message) {
        JsDialog.alertSync(activity, message);
    }

    @JavascriptInterface
    public boolean confirm(String message) {
        return JsDialog.confirmSync(activity, message);
    }

    @JavascriptInterface
    public String prompt(String message, String defaultValue) {
        return JsDialog.promptSync(activity, message, defaultValue);
    }

    @JavascriptInterface
    public boolean copyText(String text) {
        try {
            final String value = text == null ? "" : text;
            activity.runOnUiThread(() -> {
                ClipboardManager clipboard = (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
                if (clipboard == null) return;
                clipboard.setPrimaryClip(ClipData.newPlainText("web-manager", value));
            });
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    void cancelAll() {
        Iterator<Map.Entry<String, Job>> iterator = jobs.entrySet().iterator();
        while (iterator.hasNext()) {
            Job job = iterator.next().getValue();
            iterator.remove();
            job.destroy(true);
        }
        activeCount = 0;
    }

    private void enqueue(String url, String requestId) {
        if (requestId == null || requestId.isEmpty()) return;
        if (jobs.containsKey(requestId)) return;
        Job job = new Job(requestId, url);
        jobs.put(requestId, job);
        pump();
    }

    private void cancel(String requestId, boolean silent) {
        Job job = jobs.remove(requestId);
        if (job == null) return;
        boolean wasRunning = job.running;
        job.destroy(true);
        if (wasRunning) activeCount = Math.max(0, activeCount - 1);
        if (!silent) {
            deliver(requestId, "", "");
        }
        pump();
    }

    private void pump() {
        while (activeCount < MAX_QUEUE) {
            Job next = null;
            for (Job job : jobs.values()) {
                if (!job.running && !job.finished) {
                    next = job;
                    break;
                }
            }
            if (next == null) return;
            next.start();
            activeCount++;
        }
    }

    private void finish(Job job, String title, String icon) {
        if (job.finished) return;
        job.finished = true;
        jobs.remove(job.requestId);
        if (job.running) activeCount = Math.max(0, activeCount - 1);
        job.destroy(false);
        deliver(job.requestId, title, icon);
        pump();
    }

    private void deliver(String requestId, String title, String icon) {
        try {
            JSONObject payload = new JSONObject();
            payload.put("title", title == null ? "" : title);
            payload.put("icon", icon == null ? "" : icon);
            String json = JSONObject.quote(payload.toString());
            String js = "window.__onNativePageInfo && window.__onNativePageInfo("
                    + JSONObject.quote(requestId) + "," + json + ");";
            activity.evaluateJavascript(js);
        } catch (Exception ignored) {
        }
    }

    private final class Job {
        final String requestId;
        final String url;
        WebView webView;
        String title = "";
        String icon = "";
        boolean running;
        boolean finished;
        final AtomicBoolean settled = new AtomicBoolean(false);
        final Runnable timeout = () -> complete(title, icon);

        Job(String requestId, String url) {
            this.requestId = requestId;
            this.url = url;
        }

        void start() {
            running = true;
            if (url == null || !(url.startsWith("http://") || url.startsWith("https://"))) {
                complete("", "");
                return;
            }
            webView = new WebView(activity);
            webView.setLayoutParams(new FrameLayout.LayoutParams(1, 1));
            webView.setAlpha(0f);
            activity.attachHiddenWebView(webView);

            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setLoadsImagesAutomatically(true);
            settings.setBlockNetworkImage(false);
            settings.setUserAgentString(settings.getUserAgentString() + " WebManagerNativeFetch");

            webView.setWebViewClient(new WebViewClient() {
                @Override
                public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    if (request.isForMainFrame()) {
                        complete("", "");
                    }
                }

                @Override
                public void onPageFinished(WebView view, String loadedUrl) {
                    if (title == null || title.isEmpty()) {
                        String pageTitle = view.getTitle();
                        if (pageTitle != null) title = pageTitle.trim();
                    }
                    scheduleSettle();
                }
            });

            webView.setWebChromeClient(new JsChromeClient(activity, false) {
                @Override
                public void onReceivedTitle(WebView view, String receivedTitle) {
                    if (receivedTitle != null && !receivedTitle.isEmpty()) {
                        title = receivedTitle.trim();
                    }
                }

                @Override
                public void onReceivedIcon(WebView view, Bitmap bitmap) {
                    if (bitmap != null) {
                        icon = bitmapToDataUrl(bitmap);
                    }
                }
            });

            mainHandler.postDelayed(timeout, TIMEOUT_MS);
            webView.loadUrl(url);
        }

        void scheduleSettle() {
            mainHandler.postDelayed(() -> complete(title, icon), 700);
        }

        void complete(String doneTitle, String doneIcon) {
            if (!settled.compareAndSet(false, true)) return;
            mainHandler.removeCallbacks(timeout);
            finish(this, doneTitle, doneIcon);
        }

        void destroy(boolean cancelled) {
            mainHandler.removeCallbacks(timeout);
            settled.set(true);
            if (webView != null) {
                webView.stopLoading();
                webView.setWebChromeClient(null);
                webView.setWebViewClient(new WebViewClient());
                webView.loadUrl("about:blank");
                activity.detachHiddenWebView(webView);
                webView.destroy();
                webView = null;
            }
            running = false;
            if (cancelled) finished = true;
        }
    }

    private static String bitmapToDataUrl(Bitmap bitmap) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Bitmap scaled = bitmap;
        int max = 128;
        if (bitmap.getWidth() > max || bitmap.getHeight() > max) {
            scaled = Bitmap.createScaledBitmap(bitmap, max, max, true);
        }
        scaled.compress(Bitmap.CompressFormat.PNG, 100, out);
        String encoded = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        if (scaled != bitmap) scaled.recycle();
        return "data:image/png;base64," + encoded;
    }
}
