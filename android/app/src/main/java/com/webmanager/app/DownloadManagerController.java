package com.webmanager.app;

import android.app.Dialog;
import android.app.DownloadManager;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.text.format.Formatter;
import android.util.TypedValue;
import android.view.KeyEvent;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Set;
import java.util.UUID;

final class DownloadManagerController {
    private static final String PREFS = "download_manager";
    private static final String PREF_ITEMS = "items";
    private static final String STATUS_PENDING = "pending";
    private static final String STATUS_RUNNING = "running";
    private static final String STATUS_PAUSED = "paused";
    private static final String STATUS_SUCCESS = "success";
    private static final String STATUS_FAILED = "failed";
    private static final long POLL_MS = 600L;
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

    private final MainActivity activity;
    private final LayoutInflater inflater;
    private final SharedPreferences prefs;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final List<Item> items = new ArrayList<>();
    private final Set<String> selectedIds = new HashSet<>();
    private final Object lock = new Object();
    private final Runnable pollRunnable = this::poll;
    private Dialog sheet;
    private boolean selectMode;
    private boolean appDarkMode;
    private boolean polling;
    private long lastUiAt;

    DownloadManagerController(MainActivity activity) {
        this.activity = activity;
        this.inflater = LayoutInflater.from(activity);
        this.prefs = activity.getSharedPreferences(PREFS, 0);
        load();
        pruneMissingFiles();
        startPolling();
    }

    void setAppDarkMode(boolean dark) {
        if (appDarkMode == dark) return;
        appDarkMode = dark;
        if (isShowing()) render();
    }

    void show() {
        pruneMissingFiles();
        syncSystemDownloads();
        dismiss();
        selectMode = false;
        selectedIds.clear();
        Dialog dialog = new Dialog(activity, sheetTheme());
        dialog.setContentView(R.layout.sheet_download_manager);
        dialog.setCanceledOnTouchOutside(true);
        dialog.setCancelable(true);
        dialog.findViewById(R.id.downloadDone).setOnClickListener(v -> {
            if (selectMode) {
                exitSelectMode();
                return;
            }
            dialog.dismiss();
        });
        dialog.findViewById(R.id.downloadSelectAll).setOnClickListener(v -> toggleSelectAll());
        dialog.findViewById(R.id.downloadClearRecords).setOnClickListener(v -> confirmClearRecords());
        dialog.findViewById(R.id.downloadDeleteFiles).setOnClickListener(v -> confirmDeleteFiles());
        dialog.setOnKeyListener((d, keyCode, event) -> {
            if (keyCode != KeyEvent.KEYCODE_BACK || !selectMode) return false;
            if (event.getAction() == KeyEvent.ACTION_UP) exitSelectMode();
            return true;
        });
        dialog.setOnDismissListener(d -> {
            if (sheet == dialog) sheet = null;
            selectMode = false;
            selectedIds.clear();
        });
        sheet = dialog;
        render();
        dialog.show();
        Window window = dialog.getWindow();
        if (window != null) {
            int width = Math.round(activity.getResources().getDisplayMetrics().widthPixels * 0.92f);
            int height = Math.round(activity.getResources().getDisplayMetrics().heightPixels * 0.72f);
            window.setLayout(width, height);
        }
        startPolling();
    }

    boolean handleBack() {
        if (!isShowing()) return false;
        if (selectMode) {
            exitSelectMode();
            return true;
        }
        dismiss();
        return true;
    }

    void refresh() {
        pruneMissingFiles();
        syncSystemDownloads();
        if (isShowing()) render();
        startPolling();
    }

    void destroy() {
        handler.removeCallbacks(pollRunnable);
        polling = false;
        dismiss();
    }

    void trackSystemDownload(long systemId, String name, String mime) {
        Item item = new Item();
        item.id = UUID.randomUUID().toString();
        item.systemId = systemId;
        item.name = safeName(name);
        item.mime = mime == null ? "" : mime;
        item.status = STATUS_PENDING;
        item.createdAt = System.currentTimeMillis();
        synchronized (lock) {
            items.add(0, item);
        }
        persist();
        postUi(true);
        startPolling();
    }

    void beginLocal(String id, String mime, String name) {
        if (id == null || id.trim().isEmpty()) return;
        synchronized (lock) {
            Item item = findUnlocked(id);
            if (item == null) {
                item = new Item();
                item.id = id;
                items.add(0, item);
            }
            item.local = true;
            item.name = safeName(name);
            item.mime = mime == null ? "" : mime;
            item.status = STATUS_RUNNING;
            item.bytesDownloaded = 0;
            item.totalBytes = -1;
            if (item.createdAt == 0) item.createdAt = System.currentTimeMillis();
        }
        persist();
        postUi(true);
    }

    void setLocalProgress(String id, long bytes) {
        synchronized (lock) {
            Item item = findUnlocked(id);
            if (item == null || !item.local) return;
            item.bytesDownloaded = Math.max(0, bytes);
            item.status = STATUS_RUNNING;
        }
        postUi(false);
    }

    void finishLocal(String id, String name, String mime, String uri, String path, long bytes) {
        synchronized (lock) {
            Item item = findUnlocked(id);
            if (item == null) {
                addCompletedUnlocked(name, mime, uri, path, bytes);
            } else {
                item.local = true;
                item.name = safeName(name == null || name.trim().isEmpty() ? item.name : name);
                if (mime != null && !mime.trim().isEmpty()) item.mime = mime;
                item.uri = uri == null ? "" : uri;
                item.path = path == null ? "" : path;
                item.bytesDownloaded = Math.max(0, bytes);
                item.totalBytes = Math.max(0, bytes);
                item.status = STATUS_SUCCESS;
            }
        }
        persist();
        postUi(true);
    }

    void failLocal(String id, String message) {
        synchronized (lock) {
            Item item = findUnlocked(id);
            if (item == null) return;
            item.status = STATUS_FAILED;
            item.error = message == null ? "" : message;
        }
        persist();
        postUi(true);
    }

    void cancelLocal(String id) {
        synchronized (lock) {
            Item item = findUnlocked(id);
            if (item == null) return;
            items.remove(item);
            selectedIds.remove(id);
        }
        persist();
        postUi(true);
    }

    void addCompleted(String name, String mime, String uri, String path, long bytes) {
        synchronized (lock) {
            addCompletedUnlocked(name, mime, uri, path, bytes);
        }
        persist();
        postUi(true);
    }

    private void addCompletedUnlocked(String name, String mime, String uri, String path, long bytes) {
        Item item = new Item();
        item.id = UUID.randomUUID().toString();
        item.local = true;
        item.name = safeName(name);
        item.mime = mime == null ? "" : mime;
        item.uri = uri == null ? "" : uri;
        item.path = path == null ? "" : path;
        item.bytesDownloaded = Math.max(0, bytes);
        item.totalBytes = Math.max(0, bytes);
        item.status = STATUS_SUCCESS;
        item.createdAt = System.currentTimeMillis();
        items.add(0, item);
    }

    private void startPolling() {
        if (polling) return;
        if (!hasActiveSystemDownloads() && !isShowing()) return;
        polling = true;
        handler.removeCallbacks(pollRunnable);
        handler.post(pollRunnable);
    }

    private void poll() {
        polling = false;
        boolean changed = syncSystemDownloads();
        boolean pruned = pruneMissingFiles();
        if (isShowing() && (changed || pruned)) render();
        if (hasActiveSystemDownloads() || isShowing()) {
            polling = true;
            handler.postDelayed(pollRunnable, POLL_MS);
        }
    }

    private boolean hasActiveSystemDownloads() {
        synchronized (lock) {
            for (Item item : items) {
                if (item.systemId > 0 && isActive(item.status)) return true;
            }
        }
        return false;
    }

    private boolean syncSystemDownloads() {
        long[] ids;
        synchronized (lock) {
            List<Long> list = new ArrayList<>();
            for (Item item : items) {
                if (item.systemId > 0) list.add(item.systemId);
            }
            if (list.isEmpty()) return false;
            ids = new long[list.size()];
            for (int i = 0; i < list.size(); i++) ids[i] = list.get(i);
        }
        DownloadManager manager = (DownloadManager) activity.getSystemService(MainActivity.DOWNLOAD_SERVICE);
        if (manager == null) return false;
        List<SystemSnapshot> snapshots = new ArrayList<>();
        DownloadManager.Query query = new DownloadManager.Query();
        query.setFilterById(ids);
        try (Cursor cursor = manager.query(query)) {
            if (cursor != null) {
                int idIdx = cursor.getColumnIndex(DownloadManager.COLUMN_ID);
                int statusIdx = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
                int bytesIdx = cursor.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR);
                int totalIdx = cursor.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES);
                int uriIdx = cursor.getColumnIndex(DownloadManager.COLUMN_LOCAL_URI);
                int mimeIdx = cursor.getColumnIndex(DownloadManager.COLUMN_MEDIA_TYPE);
                int titleIdx = cursor.getColumnIndex(DownloadManager.COLUMN_TITLE);
                int reasonIdx = cursor.getColumnIndex(DownloadManager.COLUMN_REASON);
                int filenameIdx = -1;
                try {
                    filenameIdx = cursor.getColumnIndex(DownloadManager.COLUMN_LOCAL_FILENAME);
                } catch (Exception ignored) {
                }
                while (cursor.moveToNext()) {
                    SystemSnapshot snap = new SystemSnapshot();
                    snap.id = idIdx >= 0 ? cursor.getLong(idIdx) : 0;
                    snap.status = mapStatus(statusIdx >= 0 ? cursor.getInt(statusIdx) : 0);
                    snap.bytes = bytesIdx >= 0 ? cursor.getLong(bytesIdx) : 0;
                    snap.total = totalIdx >= 0 ? cursor.getLong(totalIdx) : -1;
                    snap.uri = uriIdx >= 0 ? cursor.getString(uriIdx) : null;
                    snap.mime = mimeIdx >= 0 ? cursor.getString(mimeIdx) : null;
                    snap.title = titleIdx >= 0 ? cursor.getString(titleIdx) : null;
                    if (filenameIdx >= 0) {
                        try {
                            snap.filename = cursor.getString(filenameIdx);
                        } catch (Exception ignored) {
                        }
                    }
                    if (STATUS_FAILED.equals(snap.status) && reasonIdx >= 0) snap.error = "下载失败";
                    snapshots.add(snap);
                }
            }
        } catch (Exception ignored) {
        }
        Set<Long> seen = new HashSet<>();
        boolean changed = false;
        boolean persistNeeded = false;
        synchronized (lock) {
            for (SystemSnapshot snap : snapshots) {
                seen.add(snap.id);
                Item item = findBySystemIdUnlocked(snap.id);
                if (item == null) continue;
                if (applySystemSnapshotUnlocked(item, snap, manager)) {
                    persistNeeded = true;
                    changed = true;
                }
            }
            for (Item item : items) {
                if (item.systemId <= 0 || seen.contains(item.systemId)) continue;
                if (!isActive(item.status) && STATUS_SUCCESS.equals(item.status)) continue;
                if (resolveExistingFileUnlocked(item, manager)) {
                    item.status = STATUS_SUCCESS;
                    item.error = "";
                } else if (isActive(item.status)) {
                    item.status = STATUS_FAILED;
                    item.error = "下载中断";
                } else {
                    continue;
                }
                changed = true;
                persistNeeded = true;
            }
        }
        if (persistNeeded) persist();
        return changed;
    }

    boolean pruneMissingFiles() {
        boolean changed = false;
        synchronized (lock) {
            Iterator<Item> it = items.iterator();
            while (it.hasNext()) {
                Item item = it.next();
                if (!STATUS_SUCCESS.equals(item.status)) continue;
                if (shouldKeepCompletedItemUnlocked(item)) continue;
                it.remove();
                selectedIds.remove(item.id);
                changed = true;
            }
        }
        if (changed) persist();
        return changed;
    }

    boolean hasStoredLocation(Item item) {
        return item != null
                && ((item.path != null && !item.path.trim().isEmpty())
                || (item.uri != null && !item.uri.trim().isEmpty()));
    }

    boolean fileExists(Item item) {
        if (item == null) return false;
        synchronized (lock) {
            return resolveExistingFileUnlocked(item, null);
        }
    }

    private boolean applySystemSnapshotUnlocked(Item item, SystemSnapshot snap, DownloadManager manager) {
        boolean persistNeeded = false;
        if (snap.bytes != item.bytesDownloaded) {
            item.bytesDownloaded = snap.bytes;
            persistNeeded = true;
        }
        if (snap.total != item.totalBytes) {
            item.totalBytes = snap.total;
            persistNeeded = true;
        }
        if (snap.mime != null && !snap.mime.trim().isEmpty() && !snap.mime.equals(item.mime)) {
            item.mime = snap.mime;
            persistNeeded = true;
        }
        if (snap.title != null && !snap.title.trim().isEmpty() && !snap.title.equals(item.name)) {
            item.name = snap.title;
            persistNeeded = true;
        }
        if (snap.uri != null && !snap.uri.trim().isEmpty() && !snap.uri.equals(item.uri)) {
            item.uri = snap.uri;
            persistNeeded = true;
        }
        if (snap.filename != null && !snap.filename.trim().isEmpty()) {
            String path = pathFromMaybeUri(snap.filename);
            if (path != null && !path.equals(item.path)) {
                item.path = path;
                persistNeeded = true;
            }
        }
        if (STATUS_SUCCESS.equals(snap.status)) {
            if (!STATUS_SUCCESS.equals(item.status) || !safeText(item.error).isEmpty()) persistNeeded = true;
            item.status = STATUS_SUCCESS;
            item.error = "";
            if (item.bytesDownloaded <= 0 && item.totalBytes > 0) {
                item.bytesDownloaded = item.totalBytes;
                persistNeeded = true;
            }
            if (resolveExistingFileUnlocked(item, manager)) persistNeeded = true;
        } else {
            if (!snap.status.equals(item.status) || !safeText(snap.error).equals(safeText(item.error))) persistNeeded = true;
            item.status = snap.status;
            item.error = snap.error;
        }
        return persistNeeded;
    }

    private boolean shouldKeepCompletedItemUnlocked(Item item) {
        if (item == null) return false;
        if (item.systemId > 0) return true;
        if (resolveExistingFileUnlocked(item, null)) return true;
        if (item.uri != null && item.uri.startsWith("content://") && contentPresence(Uri.parse(item.uri)) != 0) {
            return true;
        }
        return !hasStoredLocation(item);
    }

    private boolean resolveExistingFileUnlocked(Item item, DownloadManager manager) {
        if (item == null) return false;
        boolean mutated = false;
        if (fileExistsUnlocked(item)) return true;
        if (item.systemId > 0) {
            Uri downloaded = downloadManagerUri(manager, item.systemId);
            if (downloaded != null) {
                mutated |= applyResolvedLocationUnlocked(item, downloaded.toString());
                if (fileExistsUnlocked(item) || contentPresence(downloaded) != 0) return true;
            }
        }
        if (item.uri != null && !item.uri.trim().isEmpty()) {
            mutated |= applyResolvedLocationUnlocked(item, item.uri);
            if (fileExistsUnlocked(item)) return true;
        }
        File guessed = publicDownloadFile(item.name);
        if (guessed != null && readableFile(guessed)) {
            item.path = guessed.getAbsolutePath();
            if (item.uri == null || item.uri.trim().isEmpty()) item.uri = Uri.fromFile(guessed).toString();
            return true;
        }
        if (lookupMediaStoreUnlocked(item)) return true;
        return mutated && fileExistsUnlocked(item);
    }

    private boolean lookupMediaStoreUnlocked(Item item) {
        if (Build.VERSION.SDK_INT < 29 || item == null) return false;
        String name = item.name == null ? "" : item.name.trim();
        if (name.isEmpty()) return false;
        try (Cursor cursor = activity.getContentResolver().query(
                MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                new String[]{MediaStore.Downloads._ID, MediaStore.Downloads.DISPLAY_NAME, MediaStore.Downloads.SIZE},
                MediaStore.Downloads.DISPLAY_NAME + "=?",
                new String[]{name},
                MediaStore.Downloads.DATE_ADDED + " DESC")) {
            if (cursor != null && cursor.moveToFirst()) {
                long id = cursor.getLong(0);
                Uri uri = Uri.withAppendedPath(MediaStore.Downloads.EXTERNAL_CONTENT_URI, String.valueOf(id));
                item.uri = uri.toString();
                if (item.bytesDownloaded <= 0) {
                    long size = cursor.getLong(2);
                    if (size > 0) {
                        item.bytesDownloaded = size;
                        item.totalBytes = size;
                    }
                }
                return contentExists(uri);
            }
        } catch (Exception ignored) {
        }
        return false;
    }

    private boolean fileExistsUnlocked(Item item) {
        if (item == null) return false;
        if (item.path != null && !item.path.trim().isEmpty() && readableFile(new File(item.path))) return true;
        if (item.uri == null || item.uri.trim().isEmpty()) return false;
        return uriExists(item.uri, item.systemId > 0);
    }

    private boolean applyResolvedLocationUnlocked(Item item, String raw) {
        if (item == null || raw == null || raw.trim().isEmpty()) return false;
        boolean mutated = false;
        String value = raw.trim();
        if (value.startsWith("content://") || value.startsWith("file://")) {
            if (item.uri == null || item.uri.trim().isEmpty() || (value.startsWith("content://") && !value.equals(item.uri))) {
                item.uri = value;
                mutated = true;
            }
        }
        String path = pathFromMaybeUri(value);
        if (path != null && readableFile(new File(path)) && !path.equals(item.path)) {
            item.path = path;
            mutated = true;
        }
        if (value.startsWith("content://")) {
            String display = queryDisplayName(Uri.parse(value));
            if (display != null && !display.trim().isEmpty() && !display.equals(item.name)) {
                item.name = display;
                mutated = true;
            }
        }
        return mutated;
    }

    private Uri downloadManagerUri(DownloadManager manager, long systemId) {
        if (systemId <= 0) return null;
        DownloadManager dm = manager != null
                ? manager
                : (DownloadManager) activity.getSystemService(MainActivity.DOWNLOAD_SERVICE);
        if (dm == null) return null;
        try {
            return dm.getUriForDownloadedFile(systemId);
        } catch (Exception ignored) {
            return null;
        }
    }

    private boolean uriExists(String raw, boolean keepIfUnknown) {
        if (raw == null || raw.trim().isEmpty()) return false;
        Uri uri = Uri.parse(raw);
        String scheme = uri.getScheme();
        if (scheme == null || "file".equalsIgnoreCase(scheme)) {
            String path = uri.getPath();
            return path != null && readableFile(new File(path));
        }
        int presence = contentPresence(uri);
        return presence == 1 || (presence < 0 && keepIfUnknown);
    }

    private boolean contentExists(Uri uri) {
        return contentPresence(uri) != 0;
    }

    private int contentPresence(Uri uri) {
        if (uri == null) return 0;
        ContentResolver resolver = activity.getContentResolver();
        try (Cursor cursor = resolver.query(uri, new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null)) {
            if (cursor != null) return cursor.moveToFirst() ? 1 : 0;
        } catch (SecurityException ignored) {
            return -1;
        } catch (Exception ignored) {
        }
        try (ParcelFileDescriptor fd = resolver.openFileDescriptor(uri, "r")) {
            return fd != null ? 1 : 0;
        } catch (SecurityException ignored) {
            return -1;
        } catch (Exception ignored) {
            return -1;
        }
    }

    private String queryDisplayName(Uri uri) {
        if (uri == null) return null;
        try (Cursor cursor = activity.getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) return cursor.getString(0);
        } catch (Exception ignored) {
        }
        return null;
    }

    private static boolean readableFile(File file) {
        return file != null && file.exists() && file.isFile() && file.canRead();
    }

    private static String pathFromMaybeUri(String raw) {
        if (raw == null || raw.trim().isEmpty()) return null;
        String value = raw.trim();
        if (value.startsWith("file://")) {
            String path = Uri.parse(value).getPath();
            return path == null || path.trim().isEmpty() ? null : path;
        }
        if (value.startsWith("content://")) return null;
        return value;
    }

    private static String safeText(String value) {
        return value == null ? "" : value;
    }

    private void render() {
        if (!isShowing()) return;
        LinearLayout list = sheet.findViewById(R.id.downloadList);
        View header = sheet.findViewById(R.id.downloadHeader);
        TextView heading = sheet.findViewById(R.id.downloadHeading);
        View selectBar = sheet.findViewById(R.id.downloadSelectBar);
        TextView countView = sheet.findViewById(R.id.downloadSelectCount);
        TextView selectAll = sheet.findViewById(R.id.downloadSelectAll);
        TextView done = sheet.findViewById(R.id.downloadDone);
        if (header != null) header.setVisibility(selectMode ? View.GONE : View.VISIBLE);
        if (heading != null) heading.setVisibility(selectMode ? View.GONE : View.VISIBLE);
        if (selectBar != null) selectBar.setVisibility(selectMode ? View.VISIBLE : View.GONE);
        if (countView != null) countView.setText("已选择 " + selectedIds.size() + " 个下载项");
        List<Item> snapshot = snapshot();
        boolean allSelected = !snapshot.isEmpty();
        for (Item item : snapshot) {
            if (!selectedIds.contains(item.id)) {
                allSelected = false;
                break;
            }
        }
        if (selectAll != null) selectAll.setText(allSelected ? "取消全选" : "全选");
        if (done != null) done.setText(selectMode ? "退出多选" : "完成");
        sheet.setCanceledOnTouchOutside(!selectMode);
        if (list != null) {
            list.removeAllViews();
            if (snapshot.isEmpty()) {
                TextView empty = new TextView(activity);
                empty.setText("暂无下载记录");
                empty.setTextColor(sheetMuted());
                empty.setPadding(dp(8), dp(24), dp(8), dp(24));
                empty.setGravity(android.view.Gravity.CENTER);
                empty.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f * activity.chromeTextScale());
                list.addView(empty);
            } else {
                for (Item item : snapshot) list.addView(createRow(item));
            }
        }
        applySheetChrome();
    }

    private View createRow(Item item) {
        View row = inflater.inflate(R.layout.item_download, sheet.findViewById(R.id.downloadList), false);
        CheckBox check = row.findViewById(R.id.downloadCheck);
        TextView name = row.findViewById(R.id.downloadName);
        TextView status = row.findViewById(R.id.downloadStatus);
        ProgressBar progress = row.findViewById(R.id.downloadProgress);
        name.setText(item.name);
        name.setTextColor(sheetText());
        status.setText(statusText(item));
        status.setTextColor(STATUS_FAILED.equals(item.status) ? SHEET_DANGER : sheetMuted());
        boolean active = isActive(item.status);
        if (progress != null) {
            if (active) {
                progress.setVisibility(View.VISIBLE);
                progress.setMax(1000);
                if (item.totalBytes > 0) {
                    progress.setIndeterminate(false);
                    int value = (int) Math.max(0, Math.min(1000, item.bytesDownloaded * 1000 / item.totalBytes));
                    progress.setProgress(value);
                } else {
                    progress.setIndeterminate(true);
                }
                if (Build.VERSION.SDK_INT >= 21) {
                    progress.setProgressTintList(ColorStateList.valueOf(sheetAccent()));
                    progress.setProgressBackgroundTintList(ColorStateList.valueOf(sheetInput()));
                    progress.setIndeterminateTintList(ColorStateList.valueOf(sheetAccent()));
                }
            } else {
                progress.setVisibility(View.GONE);
            }
        }
        if (check != null) {
            check.setVisibility(selectMode ? View.VISIBLE : View.GONE);
            check.setOnCheckedChangeListener(null);
            check.setChecked(selectedIds.contains(item.id));
            check.setClickable(false);
            check.setFocusable(false);
        }
        row.setOnClickListener(v -> {
            if (selectMode) {
                toggleSelected(item.id);
                return;
            }
            openItem(item);
        });
        row.setOnLongClickListener(v -> {
            if (!selectMode) {
                selectMode = true;
                selectedIds.clear();
            }
            selectedIds.add(item.id);
            render();
            return true;
        });
        return row;
    }

    private String statusText(Item item) {
        if (STATUS_PENDING.equals(item.status)) return "等待下载";
        if (STATUS_PAUSED.equals(item.status)) {
            return "已暂停" + sizePart(item, true);
        }
        if (STATUS_RUNNING.equals(item.status)) {
            if (item.totalBytes > 0) {
                return "下载中 " + formatSize(item.bytesDownloaded) + " / " + formatSize(item.totalBytes);
            }
            if (item.bytesDownloaded > 0) return "下载中 " + formatSize(item.bytesDownloaded);
            return "正在下载";
        }
        if (STATUS_FAILED.equals(item.status)) {
            return item.error == null || item.error.trim().isEmpty() ? "下载失败" : item.error;
        }
        if (item.bytesDownloaded > 0) return "已完成 · " + formatSize(item.bytesDownloaded);
        return "已完成";
    }

    private String sizePart(Item item, boolean prefixSpace) {
        if (item.bytesDownloaded <= 0 && item.totalBytes <= 0) return "";
        String text = item.totalBytes > 0
                ? formatSize(item.bytesDownloaded) + " / " + formatSize(item.totalBytes)
                : formatSize(item.bytesDownloaded);
        return prefixSpace ? " · " + text : text;
    }

    private void openItem(Item item) {
        if (item == null) return;
        if (!STATUS_SUCCESS.equals(item.status)) {
            toast(statusText(item));
            return;
        }
        if (!fileExists(item)) {
            pruneMissingFiles();
            render();
            toast("文件已不存在");
            return;
        }
        Uri uri = viewUri(item);
        if (uri == null) {
            toast("无法打开该文件");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_VIEW);
        String mime = item.mime == null || item.mime.trim().isEmpty() ? "*/*" : item.mime;
        intent.setDataAndType(uri, mime);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            activity.startActivity(Intent.createChooser(intent, "打开 " + item.name));
        } catch (Exception e) {
            toast("没有可用的应用打开该文件");
        }
    }

    private Uri viewUri(Item item) {
        if (item.systemId > 0) {
            Uri downloaded = downloadManagerUri(null, item.systemId);
            if (downloaded != null) return downloaded;
        }
        File file = item.path == null || item.path.trim().isEmpty() ? null : new File(item.path);
        if (file != null && readableFile(file)) {
            try {
                return FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", file);
            } catch (Exception ignored) {
                return Uri.fromFile(file);
            }
        }
        if (item.uri == null || item.uri.trim().isEmpty()) return null;
        Uri uri = Uri.parse(item.uri);
        if ("file".equalsIgnoreCase(uri.getScheme())) {
            String path = uri.getPath();
            if (path == null) return null;
            File parsed = new File(path);
            if (!readableFile(parsed)) return null;
            try {
                return FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", parsed);
            } catch (Exception ignored) {
                return uri;
            }
        }
        if (contentPresence(uri) == 0) return null;
        return uri;
    }

    private void toggleSelected(String id) {
        if (selectedIds.contains(id)) selectedIds.remove(id);
        else selectedIds.add(id);
        render();
    }

    private void toggleSelectAll() {
        List<Item> snapshot = snapshot();
        boolean allSelected = !snapshot.isEmpty();
        for (Item item : snapshot) {
            if (!selectedIds.contains(item.id)) {
                allSelected = false;
                break;
            }
        }
        selectedIds.clear();
        if (!allSelected) {
            for (Item item : snapshot) selectedIds.add(item.id);
        }
        render();
    }

    private void exitSelectMode() {
        selectMode = false;
        selectedIds.clear();
        render();
    }

    private void confirmClearRecords() {
        List<Item> selected = selectedItems();
        if (selected.isEmpty()) {
            toast("请先选择下载项");
            return;
        }
        new AlertDialog.Builder(activity, alertTheme())
                .setMessage("清除这 " + selected.size() + " 条下载记录？文件仍会保留。")
                .setPositiveButton("清记录", (dialog, which) -> clearRecords(selected))
                .setNegativeButton("取消", null)
                .show();
    }

    private void confirmDeleteFiles() {
        List<Item> selected = selectedItems();
        if (selected.isEmpty()) {
            toast("请先选择下载项");
            return;
        }
        new AlertDialog.Builder(activity, alertTheme())
                .setMessage("删除这 " + selected.size() + " 个文件？文件将从手机中移除。")
                .setPositiveButton("删除文件", (dialog, which) -> deleteFiles(selected))
                .setNegativeButton("取消", null)
                .show();
    }

    private void clearRecords(List<Item> selected) {
        Set<String> ids = new HashSet<>();
        for (Item item : selected) ids.add(item.id);
        synchronized (lock) {
            Iterator<Item> it = items.iterator();
            while (it.hasNext()) {
                if (ids.contains(it.next().id)) it.remove();
            }
        }
        selectedIds.clear();
        persist();
        exitSelectMode();
        toast("已清除记录");
    }

    private void deleteFiles(List<Item> selected) {
        DownloadManager manager = (DownloadManager) activity.getSystemService(MainActivity.DOWNLOAD_SERVICE);
        int removed = 0;
        for (Item item : selected) {
            if (item.systemId > 0 && manager != null) {
                try {
                    manager.remove(item.systemId);
                } catch (Exception ignored) {
                }
            }
            deleteStoredFile(item);
            removed++;
        }
        Set<String> ids = new HashSet<>();
        for (Item item : selected) ids.add(item.id);
        synchronized (lock) {
            Iterator<Item> it = items.iterator();
            while (it.hasNext()) {
                if (ids.contains(it.next().id)) it.remove();
            }
        }
        selectedIds.clear();
        persist();
        exitSelectMode();
        toast("已删除 " + removed + " 个文件");
    }

    private void deleteStoredFile(Item item) {
        if (item.uri != null && !item.uri.trim().isEmpty()) {
            Uri uri = Uri.parse(item.uri);
            if ("content".equalsIgnoreCase(uri.getScheme())) {
                try {
                    activity.getContentResolver().delete(uri, null, null);
                } catch (Exception ignored) {
                }
            }
        }
        if (item.path != null && !item.path.trim().isEmpty()) {
            File file = new File(item.path);
            if (file.exists()) {
                //noinspection ResultOfMethodCallIgnored
                file.delete();
            }
        } else if (item.uri != null && item.uri.startsWith("file://")) {
            String path = Uri.parse(item.uri).getPath();
            if (path != null) {
                File file = new File(path);
                if (file.exists()) {
                    //noinspection ResultOfMethodCallIgnored
                    file.delete();
                }
            }
        }
    }

    private List<Item> selectedItems() {
        List<Item> selected = new ArrayList<>();
        synchronized (lock) {
            for (Item item : items) {
                if (selectedIds.contains(item.id)) selected.add(item);
            }
        }
        return selected;
    }

    private List<Item> snapshot() {
        synchronized (lock) {
            return new ArrayList<>(items);
        }
    }

    private Item findUnlocked(String id) {
        if (id == null) return null;
        for (Item item : items) {
            if (id.equals(item.id)) return item;
        }
        return null;
    }

    private Item findBySystemIdUnlocked(long systemId) {
        for (Item item : items) {
            if (item.systemId == systemId) return item;
        }
        return null;
    }

    private void load() {
        String raw = prefs.getString(PREF_ITEMS, "[]");
        boolean dropped = false;
        try {
            JSONArray arr = new JSONArray(raw);
            synchronized (lock) {
                items.clear();
                for (int i = 0; i < arr.length(); i++) {
                    Item item = Item.fromJson(arr.optJSONObject(i));
                    if (item == null) continue;
                    if (item.local && isActive(item.status)) {
                        dropped = true;
                        continue;
                    }
                    items.add(item);
                }
            }
        } catch (Exception ignored) {
        }
        if (dropped) persist();
    }

    private void persist() {
        JSONArray arr = new JSONArray();
        synchronized (lock) {
            for (Item item : items) arr.put(item.toJson());
        }
        prefs.edit().putString(PREF_ITEMS, arr.toString()).apply();
    }

    private void postUi(boolean force) {
        long now = android.os.SystemClock.uptimeMillis();
        if (!force && now - lastUiAt < 250 && isShowing()) return;
        lastUiAt = now;
        if (Looper.myLooper() == Looper.getMainLooper()) {
            if (isShowing()) render();
            return;
        }
        handler.post(() -> {
            if (isShowing()) render();
        });
    }

    private boolean isShowing() {
        return sheet != null && sheet.isShowing();
    }

    private void dismiss() {
        if (sheet != null) {
            sheet.dismiss();
            sheet = null;
        }
    }

    private void applySheetChrome() {
        if (!isShowing()) return;
        View root = sheet.findViewById(android.R.id.content);
        if (root instanceof ViewGroup && ((ViewGroup) root).getChildCount() > 0) {
            ((ViewGroup) root).getChildAt(0).setBackground(roundedSurface(sheetSurface(), 18f));
        }
        setText(R.id.downloadHeading, sheetText());
        setText(R.id.downloadSelectCount, sheetText());
        setText(R.id.downloadSelectAll, sheetAccent());
        setText(R.id.downloadClearRecords, sheetAccent());
        setText(R.id.downloadDeleteFiles, SHEET_DANGER);
        setText(R.id.downloadDone, sheetAccent());
        View sheetRoot = sheet.findViewById(R.id.downloadSheetRoot);
        if (sheetRoot != null) sheetRoot.setPadding(dp(8), dp(16), dp(8), dp(8));
        scaleText(asText(R.id.downloadHeading), 18f);
        scaleText(asText(R.id.downloadSelectCount), 15f);
        scaleText(asText(R.id.downloadSelectAll), 14f);
        scaleText(asText(R.id.downloadClearRecords), 14f);
        scaleText(asText(R.id.downloadDeleteFiles), 14f);
        scaleText(asText(R.id.downloadDone), 15f);
        View done = sheet.findViewById(R.id.downloadDone);
        if (done != null) {
            ViewGroup.LayoutParams params = done.getLayoutParams();
            if (params != null) {
                params.height = dp(44);
                done.setLayoutParams(params);
            }
        }
    }

    private void setText(int id, int color) {
        View view = sheet.findViewById(id);
        if (view instanceof TextView) ((TextView) view).setTextColor(color);
    }

    private TextView asText(int id) {
        View view = sheet.findViewById(id);
        return view instanceof TextView ? (TextView) view : null;
    }

    private void scaleText(TextView view, float sp) {
        if (view == null) return;
        view.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp * activity.chromeTextScale());
    }

    private GradientDrawable roundedSurface(int color, float radiusDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setShape(GradientDrawable.RECTANGLE);
        drawable.setCornerRadius(dp(radiusDp) * 1f);
        drawable.setColor(color);
        return drawable;
    }

    private int sheetTheme() {
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

    private int dp(float value) {
        return Math.round(value * activity.getResources().getDisplayMetrics().density);
    }

    private void toast(String message) {
        Toast.makeText(activity, message, Toast.LENGTH_SHORT).show();
    }

    private String formatSize(long bytes) {
        if (bytes < 0) bytes = 0;
        return Formatter.formatShortFileSize(activity, bytes);
    }

    private static boolean isActive(String status) {
        return STATUS_PENDING.equals(status) || STATUS_RUNNING.equals(status) || STATUS_PAUSED.equals(status);
    }

    private static String mapStatus(int status) {
        if (status == DownloadManager.STATUS_SUCCESSFUL) return STATUS_SUCCESS;
        if (status == DownloadManager.STATUS_FAILED) return STATUS_FAILED;
        if (status == DownloadManager.STATUS_PAUSED) return STATUS_PAUSED;
        if (status == DownloadManager.STATUS_RUNNING) return STATUS_RUNNING;
        return STATUS_PENDING;
    }

    private static String safeName(String name) {
        if (name == null || name.trim().isEmpty()) return "未命名文件";
        return name.replaceAll("[\\\\/:*?\"<>|]", "_");
    }

    private static File publicDownloadFile(String name) {
        if (name == null || name.trim().isEmpty()) return null;
        File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (dir == null) return null;
        return new File(dir, name);
    }

    private static final class SystemSnapshot {
        long id;
        String status = STATUS_PENDING;
        long bytes;
        long total = -1;
        String uri;
        String mime;
        String title;
        String filename;
        String error = "";
    }

    static final class Item {
        String id = "";
        String name = "";
        String mime = "";
        String uri = "";
        String path = "";
        String status = STATUS_PENDING;
        String error = "";
        long systemId;
        long bytesDownloaded;
        long totalBytes = -1;
        long createdAt;
        boolean local;

        JSONObject toJson() {
            JSONObject obj = new JSONObject();
            try {
                obj.put("id", id);
                obj.put("name", name);
                obj.put("mime", mime);
                obj.put("uri", uri);
                obj.put("path", path);
                obj.put("status", status);
                obj.put("error", error);
                obj.put("systemId", systemId);
                obj.put("bytesDownloaded", bytesDownloaded);
                obj.put("totalBytes", totalBytes);
                obj.put("createdAt", createdAt);
                obj.put("local", local);
            } catch (Exception ignored) {
            }
            return obj;
        }

        static Item fromJson(JSONObject obj) {
            if (obj == null) return null;
            Item item = new Item();
            item.id = obj.optString("id", UUID.randomUUID().toString());
            item.name = obj.optString("name", "未命名文件");
            item.mime = obj.optString("mime", "");
            item.uri = obj.optString("uri", "");
            item.path = obj.optString("path", "");
            item.status = obj.optString("status", STATUS_SUCCESS);
            item.error = obj.optString("error", "");
            item.systemId = obj.optLong("systemId", 0);
            item.bytesDownloaded = obj.optLong("bytesDownloaded", 0);
            item.totalBytes = obj.optLong("totalBytes", -1);
            item.createdAt = obj.optLong("createdAt", 0);
            item.local = obj.optBoolean("local", item.systemId == 0);
            return item;
        }
    }
}
