package com.webmanager.app;

import android.app.Dialog;
import android.graphics.Color;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.WebView;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Set;
import java.util.UUID;

final class BrowserTabsController {
    static final int MAX_TABS = 12;
    static final String UNGROUPED = "";

    private final MainActivity activity;
    private final FrameLayout host;
    private final LinearLayout groupStrip;
    private final LinearLayout tabStrip;
    private final HorizontalScrollView groupScroll;
    private final TextView tabsCount;
    private final View restoreBtn;
    private final LayoutInflater inflater;

    private final List<Group> groups = new ArrayList<>();
    private final List<Tab> tabs = new ArrayList<>();
    private final Set<String> selectedIds = new HashSet<>();
    private String activeTabId;
    private String activeGroupId = UNGROUPED;
    private Dialog sheetDialog;

    BrowserTabsController(MainActivity activity) {
        this.activity = activity;
        this.host = activity.findViewById(R.id.pageWebHost);
        this.groupStrip = activity.findViewById(R.id.groupStrip);
        this.tabStrip = activity.findViewById(R.id.tabStrip);
        this.groupScroll = activity.findViewById(R.id.groupScroll);
        this.tabsCount = activity.findViewById(R.id.tabsCount);
        this.restoreBtn = activity.findViewById(R.id.restoreTabsBtn);
        this.inflater = LayoutInflater.from(activity);
        activity.findViewById(R.id.homeBtn).setOnClickListener(v -> hideOverlay());
        activity.findViewById(R.id.refreshBtn).setOnClickListener(v -> refreshActive());
        activity.findViewById(R.id.tabsBtn).setOnClickListener(v -> showSheet());
        if (restoreBtn != null) restoreBtn.setOnClickListener(v -> restoreOverlay());
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
    }

    void restoreOverlay() {
        Tab tab = activeTab();
        if (tab == null && !tabs.isEmpty()) tab = tabs.get(0);
        if (tab != null) showTab(tab.id);
    }

    void syncRestoreButton(boolean overlayVisible) {
        if (restoreBtn == null) return;
        restoreBtn.setVisibility(!overlayVisible && hasTabs() ? View.VISIBLE : View.GONE);
    }

    void refreshActive() {
        Tab tab = activeTab();
        if (tab != null && tab.webView != null) tab.webView.reload();
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
        attachWebView(tab);
        tabs.add(tab);
        showTab(tab.id);
        return tab;
    }

    void destroyAll() {
        dismissSheet();
        for (Tab tab : new ArrayList<>(tabs)) destroyTab(tab);
        tabs.clear();
        groups.clear();
        selectedIds.clear();
        activeTabId = null;
        activeGroupId = UNGROUPED;
        host.removeAllViews();
        renderStrips();
    }

    private Tab addTab(String title, String url, String groupId) {
        Tab tab = new Tab();
        tab.id = UUID.randomUUID().toString();
        tab.title = (title == null || title.trim().isEmpty()) ? hostTitle(url) : title.trim();
        tab.url = url;
        tab.groupId = groupId == null ? UNGROUPED : groupId;
        tab.webView = activity.createPageWebView();
        attachWebView(tab);
        tab.webView.loadUrl(url);
        tabs.add(tab);
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
        renderStrips();
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
        Tab tab = findTabById(tabId);
        if (tab == null) return;
        int index = tabs.indexOf(tab);
        String groupId = tab.groupId;
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
            dismissSheet();
        }
        renderStrips();
        if (sheetDialog != null && sheetDialog.isShowing()) renderSheet(sheetDialog);
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
        for (String id : ids) closeTab(id);
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
    }

    private void deleteGroup(String groupId) {
        if (groupId == null || groupId.isEmpty()) return;
        List<String> ids = new ArrayList<>();
        for (Tab tab : tabs) {
            if (groupId.equals(tab.groupId)) ids.add(tab.id);
        }
        closeTabs(ids);
        Iterator<Group> it = groups.iterator();
        while (it.hasNext()) {
            if (groupId.equals(it.next().id)) it.remove();
        }
        if (groupId.equals(activeGroupId)) {
            activeGroupId = UNGROUPED;
        }
        renderStrips();
        if (sheetDialog != null && sheetDialog.isShowing()) renderSheet(sheetDialog);
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
            if (countInGroup(group.id) == 0) it.remove();
        }
        if (!UNGROUPED.equals(activeGroupId) && countInGroup(activeGroupId) == 0) {
            activeGroupId = UNGROUPED;
        }
    }

    private void renderStrips() {
        groupStrip.removeAllViews();
        tabStrip.removeAllViews();
        boolean showGroups = !groups.isEmpty();
        groupScroll.setVisibility(showGroups ? View.VISIBLE : View.GONE);
        if (showGroups) {
            addGroupChip("未分组", UNGROUPED, countInGroup(UNGROUPED));
            for (Group group : groups) {
                addGroupChip(group.name, group.id, countInGroup(group.id));
            }
        }
        for (Tab tab : tabs) {
            if (!activeGroupId.equals(tab.groupId)) continue;
            addTabChip(tab);
        }
        int count = tabs.size();
        tabsCount.setText(count > 9 ? "9+" : String.valueOf(count));
        tabsCount.setVisibility(count > 0 ? View.VISIBLE : View.GONE);
    }

    private void addGroupChip(String name, String groupId, int count) {
        View chip = inflater.inflate(R.layout.item_browser_group, groupStrip, false);
        TextView title = chip.findViewById(R.id.groupTitle);
        title.setText(name + (count > 0 ? " " + count : ""));
        boolean active = activeGroupId.equals(groupId);
        chip.setBackgroundResource(active ? R.drawable.bg_browser_chip_active : R.drawable.bg_browser_chip);
        title.setTextColor(active ? Color.parseColor("#007BFF") : Color.parseColor("#2C3E50"));
        chip.setOnClickListener(v -> {
            activeGroupId = groupId;
            Tab first = firstInGroup(groupId);
            if (first != null) showTab(first.id);
            else renderStrips();
        });
        chip.setOnLongClickListener(v -> {
            if (UNGROUPED.equals(groupId)) return true;
            confirmDeleteGroup(groupId, name);
            return true;
        });
        groupStrip.addView(chip);
    }

    private void addTabChip(Tab tab) {
        View chip = inflater.inflate(R.layout.item_browser_tab, tabStrip, false);
        TextView title = chip.findViewById(R.id.tabTitle);
        title.setText(displayTitle(tab));
        boolean active = tab.id.equals(activeTabId);
        chip.setBackgroundResource(active ? R.drawable.bg_browser_chip_active : R.drawable.bg_browser_chip);
        title.setTextColor(active ? Color.parseColor("#007BFF") : Color.parseColor("#2C3E50"));
        chip.setOnClickListener(v -> showTab(tab.id));
        chip.setOnLongClickListener(v -> {
            showTabActions(tab);
            return true;
        });
        chip.findViewById(R.id.tabClose).setOnClickListener(v -> closeTab(tab.id));
        tabStrip.addView(chip);
    }

    private void showTabActions(Tab tab) {
        new AlertDialog.Builder(activity)
                .setItems(new CharSequence[]{"移动到分组", "关闭"}, (dialog, which) -> {
                    if (which == 0) pickGroupFor(singletonList(tab.id));
                    else closeTab(tab.id);
                })
                .show();
    }

    private void showSheet() {
        dismissSheet();
        Dialog dialog = new Dialog(activity, R.style.JsDialogTheme);
        dialog.setContentView(R.layout.sheet_browser_tabs);
        dialog.setCanceledOnTouchOutside(true);
        dialog.setCancelable(true);
        dialog.findViewById(R.id.sheetDone).setOnClickListener(v -> dialog.dismiss());
        dialog.findViewById(R.id.sheetMoveSelected).setOnClickListener(v -> pickGroupFor(selectedList()));
        dialog.findViewById(R.id.sheetCloseSelected).setOnClickListener(v -> {
            List<String> ids = selectedList();
            if (ids.isEmpty()) {
                toast("请先勾选网页");
                return;
            }
            closeTabs(ids);
        });
        dialog.setOnDismissListener(d -> {
            if (sheetDialog == dialog) sheetDialog = null;
        });
        sheetDialog = dialog;
        renderSheet(dialog);
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
        list.removeAllViews();
        appendGroupSection(list, "未分组", UNGROUPED);
        for (Group group : groups) appendGroupSection(list, group.name, group.id);
        countView.setText("已选 " + selectedIds.size());
    }

    private void appendGroupSection(LinearLayout list, String name, String groupId) {
        List<Tab> items = tabsInGroup(groupId);
        if (items.isEmpty() && UNGROUPED.equals(groupId)) return;
        View header = inflater.inflate(R.layout.item_browser_sheet_group, list, false);
        TextView title = header.findViewById(R.id.sheetGroupTitle);
        TextView delete = header.findViewById(R.id.sheetGroupDelete);
        title.setText(name + " (" + items.size() + ")");
        if (UNGROUPED.equals(groupId)) {
            delete.setVisibility(View.GONE);
        } else {
            delete.setOnClickListener(v -> confirmDeleteGroup(groupId, name));
        }
        list.addView(header);
        for (Tab tab : items) {
            View row = inflater.inflate(R.layout.item_browser_sheet_tab, list, false);
            TextView titleView = row.findViewById(R.id.sheetTitle);
            TextView urlView = row.findViewById(R.id.sheetUrl);
            CheckBox check = row.findViewById(R.id.sheetCheck);
            titleView.setText(displayTitle(tab));
            urlView.setText(tab.url);
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
            row.findViewById(R.id.sheetMove).setOnClickListener(v -> pickGroupFor(singletonList(tab.id)));
            row.findViewById(R.id.sheetClose).setOnClickListener(v -> closeTab(tab.id));
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
        new AlertDialog.Builder(activity)
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
        FrameLayout wrap = new FrameLayout(activity);
        int pad = Math.round(20 * activity.getResources().getDisplayMetrics().density);
        wrap.setPadding(pad, pad / 2, pad, 0);
        wrap.addView(input);
        new AlertDialog.Builder(activity)
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

    private void confirmDeleteGroup(String groupId, String name) {
        new AlertDialog.Builder(activity)
                .setMessage("删除分组「" + name + "」并关闭其中打开的网页？")
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
            String hostName = android.net.Uri.parse(url).getHost();
            if (hostName != null && !hostName.isEmpty()) return hostName;
        } catch (Exception ignored) {
        }
        return url;
    }

    private String normalizeUrl(String url) {
        if (url == null) return null;
        String target = url.trim();
        if (target.startsWith("http://") || target.startsWith("https://")) return target;
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
    }

    static final class Group {
        String id;
        String name;
    }

    static final class PageSpec {
        final String title;
        final String url;

        PageSpec(String title, String url) {
            this.title = title;
            this.url = url;
        }
    }
}
