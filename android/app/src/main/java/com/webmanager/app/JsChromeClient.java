package com.webmanager.app;

import android.app.Activity;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebView;

class JsChromeClient extends WebChromeClient {
    private final Activity activity;
    private final boolean showDialogs;

    JsChromeClient(Activity activity, boolean showDialogs) {
        this.activity = activity;
        this.showDialogs = showDialogs;
    }

    @Override
    public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
        if (!showDialogs) {
            JsDialog.dismiss(result);
            return true;
        }
        JsDialog.alert(activity, message, result);
        return true;
    }

    @Override
    public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
        if (!showDialogs) {
            result.cancel();
            return true;
        }
        JsDialog.confirm(activity, message, result);
        return true;
    }

    @Override
    public boolean onJsPrompt(WebView view, String url, String message, String defaultValue, JsPromptResult result) {
        if (!showDialogs) {
            JsDialog.dismiss(result);
            return true;
        }
        JsDialog.prompt(activity, message, defaultValue, result);
        return true;
    }

    @Override
    public boolean onJsBeforeUnload(WebView view, String url, String message, JsResult result) {
        if (!showDialogs) {
            result.confirm();
            return true;
        }
        JsDialog.confirm(activity, message, result);
        return true;
    }
}
