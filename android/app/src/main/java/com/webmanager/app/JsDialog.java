package com.webmanager.app;

import android.app.Activity;
import android.app.Dialog;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.widget.EditText;
import android.widget.TextView;

final class JsDialog {
    private JsDialog() {}

    static void alert(Activity activity, String message, JsResult result) {
        show(activity, message, null, false, result, null);
    }

    static void confirm(Activity activity, String message, JsResult result) {
        show(activity, message, null, true, result, null);
    }

    static void prompt(Activity activity, String message, String defaultValue, JsPromptResult result) {
        show(activity, message, defaultValue, true, null, result);
    }

    private static void show(
            Activity activity,
            String message,
            String defaultValue,
            boolean showCancel,
            JsResult result,
            JsPromptResult promptResult
    ) {
        if (activity == null || activity.isFinishing()) {
            cancel(result, promptResult);
            return;
        }

        Dialog dialog = new Dialog(activity);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        dialog.setContentView(R.layout.dialog_js);
        dialog.setCanceledOnTouchOutside(false);

        Window window = dialog.getWindow();
        if (window != null) {
            window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            window.setDimAmount(0.45f);
        }

        TextView messageView = dialog.findViewById(R.id.jsDialogMessage);
        EditText inputView = dialog.findViewById(R.id.jsDialogInput);
        TextView cancelView = dialog.findViewById(R.id.jsDialogCancel);
        TextView okView = dialog.findViewById(R.id.jsDialogOk);

        messageView.setText(message == null ? "" : message);
        final boolean[] settled = { false };

        if (promptResult != null) {
            inputView.setVisibility(View.VISIBLE);
            inputView.setText(defaultValue == null ? "" : defaultValue);
            inputView.setSelection(inputView.getText().length());
        } else {
            inputView.setVisibility(View.GONE);
        }

        cancelView.setVisibility(showCancel ? View.VISIBLE : View.GONE);
        cancelView.setOnClickListener(v -> {
            if (!settle(settled)) return;
            cancel(result, promptResult);
            dialog.dismiss();
        });
        okView.setOnClickListener(v -> {
            if (!settle(settled)) return;
            if (promptResult != null) {
                promptResult.confirm(inputView.getText() == null ? "" : inputView.getText().toString());
            } else if (result != null) {
                result.confirm();
            }
            dialog.dismiss();
        });
        dialog.setOnCancelListener(d -> {
            if (!settle(settled)) return;
            cancel(result, promptResult);
        });

        dialog.show();
        if (window != null) {
            int width = Math.round(activity.getResources().getDisplayMetrics().widthPixels * 0.82f);
            window.setLayout(width, ViewGroup.LayoutParams.WRAP_CONTENT);
        }
        if (promptResult != null) {
            inputView.requestFocus();
        }
    }

    private static boolean settle(boolean[] settled) {
        if (settled[0]) return false;
        settled[0] = true;
        return true;
    }

    private static void cancel(JsResult result, JsPromptResult promptResult) {
        if (promptResult != null) promptResult.cancel();
        else if (result != null) result.cancel();
    }
}
