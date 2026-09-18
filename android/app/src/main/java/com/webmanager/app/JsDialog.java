package com.webmanager.app;

import android.app.Activity;
import android.app.Dialog;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.widget.EditText;
import android.widget.TextView;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

final class JsDialog {
    private JsDialog() {}

    static void alert(Activity activity, String message, JsResult result) {
        show(activity, message, null, false, false, value -> {
            if (result != null) result.confirm();
        }, () -> {
            if (result != null) result.cancel();
        });
    }

    static void confirm(Activity activity, String message, JsResult result) {
        show(activity, message, null, true, false, value -> {
            if (result != null) result.confirm();
        }, () -> {
            if (result != null) result.cancel();
        });
    }

    static void prompt(Activity activity, String message, String defaultValue, JsPromptResult result) {
        show(activity, message, defaultValue, true, true, value -> {
            if (result != null) result.confirm(value);
        }, () -> {
            if (result != null) result.cancel();
        });
    }

    static void dismiss(JsResult result) {
        if (result != null) result.confirm();
    }

    static void dismiss(JsPromptResult result) {
        if (result != null) result.cancel();
    }

    static void alertSync(Activity activity, String message) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            alert(activity, message, null);
            return;
        }
        CountDownLatch latch = new CountDownLatch(1);
        show(activity, message, null, false, false, value -> latch.countDown(), latch::countDown);
        await(latch);
    }

    static boolean confirmSync(Activity activity, String message) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            confirm(activity, message, null);
            return false;
        }
        CountDownLatch latch = new CountDownLatch(1);
        AtomicBoolean ok = new AtomicBoolean(false);
        show(activity, message, null, true, false, value -> {
            ok.set(true);
            latch.countDown();
        }, latch::countDown);
        await(latch);
        return ok.get();
    }

    static String promptSync(Activity activity, String message, String defaultValue) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            prompt(activity, message, defaultValue, null);
            return defaultValue;
        }
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> value = new AtomicReference<>(null);
        show(activity, message, defaultValue, true, true, input -> {
            value.set(input);
            latch.countDown();
        }, latch::countDown);
        await(latch);
        return value.get();
    }

    private interface Reply {
        void onResult(String value);
    }

    private static void show(
            Activity activity,
            String message,
            String defaultValue,
            boolean showCancel,
            boolean showInput,
            Reply onOk,
            Runnable onCancel
    ) {
        if (activity == null || activity.isFinishing()) {
            if (onCancel != null) onCancel.run();
            return;
        }
        Runnable task = () -> showNow(activity, message, defaultValue, showCancel, showInput, onOk, onCancel);
        if (Looper.myLooper() == Looper.getMainLooper()) task.run();
        else activity.runOnUiThread(task);
    }

    private static void showNow(
            Activity activity,
            String message,
            String defaultValue,
            boolean showCancel,
            boolean showInput,
            Reply onOk,
            Runnable onCancel
    ) {
        if (activity.isFinishing()) {
            if (onCancel != null) onCancel.run();
            return;
        }
        try {
            Dialog dialog = new Dialog(activity, R.style.JsDialogTheme);
            dialog.setContentView(R.layout.dialog_js);
            dialog.setCanceledOnTouchOutside(false);
            dialog.setCancelable(false);

            TextView messageView = dialog.findViewById(R.id.jsDialogMessage);
            EditText inputView = dialog.findViewById(R.id.jsDialogInput);
            TextView cancelView = dialog.findViewById(R.id.jsDialogCancel);
            TextView okView = dialog.findViewById(R.id.jsDialogOk);
            messageView.setText(message == null ? "" : message);
            final boolean[] settled = { false };

            if (showInput) {
                inputView.setVisibility(View.VISIBLE);
                inputView.setText(defaultValue == null ? "" : defaultValue);
                inputView.setSelection(inputView.getText().length());
            } else {
                inputView.setVisibility(View.GONE);
            }

            cancelView.setVisibility(showCancel ? View.VISIBLE : View.GONE);
            cancelView.setOnClickListener(v -> {
                if (!settle(settled)) return;
                if (onCancel != null) onCancel.run();
                dialog.dismiss();
            });
            okView.setOnClickListener(v -> {
                if (!settle(settled)) return;
                if (onOk != null) {
                    onOk.onResult(showInput && inputView.getText() != null ? inputView.getText().toString() : "");
                }
                dialog.dismiss();
            });
            dialog.setOnCancelListener(d -> {
                if (!settle(settled)) return;
                if (onCancel != null) onCancel.run();
            });

            dialog.show();
            Window window = dialog.getWindow();
            if (window != null) {
                int width = Math.round(activity.getResources().getDisplayMetrics().widthPixels * 0.82f);
                window.setLayout(width, ViewGroup.LayoutParams.WRAP_CONTENT);
            }
            if (showInput) inputView.requestFocus();
        } catch (Exception ignored) {
            if (onCancel != null) onCancel.run();
        }
    }

    private static boolean settle(boolean[] settled) {
        if (settled[0]) return false;
        settled[0] = true;
        return true;
    }

    private static void await(CountDownLatch latch) {
        try {
            latch.await(60, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
