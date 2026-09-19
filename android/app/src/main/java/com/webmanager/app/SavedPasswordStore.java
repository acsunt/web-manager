package com.webmanager.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Locale;

final class SavedPasswordStore {
    private static final String PREFS = "web_manager_passwords";
    private static final String KEY = "json";
    private static final int MAX_SUGGEST = 8;

    private final SharedPreferences prefs;

    SavedPasswordStore(Context context) {
        prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    String read() {
        String json = prefs.getString(KEY, "[]");
        return json == null || json.trim().isEmpty() ? "[]" : json;
    }

    boolean write(String json) {
        String value = json == null || json.trim().isEmpty() ? "[]" : json;
        try {
            new JSONArray(value);
        } catch (Exception e) {
            return false;
        }
        prefs.edit().putString(KEY, value).apply();
        return true;
    }

    String query(String url, String typed) {
        String origin = originOf(url);
        String q = typed == null ? "" : typed.trim().toLowerCase(Locale.US);
        JSONArray out = new JSONArray();
        try {
            JSONArray list = new JSONArray(read());
            for (int i = 0; i < list.length() && out.length() < MAX_SUGGEST; i++) {
                JSONObject item = list.optJSONObject(i);
                if (item == null) continue;
                if (!originsMatch(item.optString("website"), origin)) continue;
                String username = item.optString("username");
                if (!q.isEmpty() && !username.toLowerCase(Locale.US).contains(q)
                        && !item.optString("website").toLowerCase(Locale.US).contains(q)) {
                    continue;
                }
                out.put(item);
            }
        } catch (Exception ignored) {
        }
        return out.toString();
    }

    void capture(String json) {
        try {
            JSONObject obj = new JSONObject(json == null ? "{}" : json);
            String url = obj.optString("url");
            String username = obj.optString("username").trim();
            String password = obj.optString("password");
            String title = obj.optString("title").trim();
            String website = originOf(url);
            if (website.isEmpty() || username.isEmpty() || password.isEmpty()) return;
            JSONArray list = new JSONArray(read());
            int found = -1;
            for (int i = 0; i < list.length(); i++) {
                JSONObject item = list.optJSONObject(i);
                if (item == null) continue;
                if (originsMatch(item.optString("website"), website)
                        && username.equals(item.optString("username"))) {
                    found = i;
                    break;
                }
            }
            JSONObject item = found >= 0 ? list.getJSONObject(found) : new JSONObject();
            if (found < 0) item.put("id", "p_" + System.currentTimeMillis());
            if (title.isEmpty()) title = item.optString("title").trim();
            item.put("website", website);
            item.put("title", title);
            item.put("username", username);
            item.put("password", password);
            item.put("updatedAt", System.currentTimeMillis());
            if (found >= 0) list.put(found, item);
            else list.put(item);
            write(list.toString());
        } catch (Exception ignored) {
        }
    }

    static String originOf(String value) {
        if (value == null) return "";
        String trimmed = value.trim();
        if (trimmed.isEmpty()) return "";
        try {
            String withScheme = trimmed.matches("^[a-zA-Z][a-zA-Z0-9+\\-.]*:.*") ? trimmed : "https://" + trimmed;
            Uri uri = Uri.parse(withScheme);
            String host = uri.getHost();
            return host == null ? "" : host.toLowerCase(Locale.US);
        } catch (Exception e) {
            return "";
        }
    }

    static boolean originsMatch(String savedWebsite, String pageOrigin) {
        String a = stripWww(originOf(savedWebsite));
        String b = stripWww(originOf(pageOrigin));
        return !a.isEmpty() && a.equals(b);
    }

    private static String stripWww(String host) {
        if (host == null) return "";
        String value = host.trim().toLowerCase(Locale.US);
        return value.startsWith("www.") ? value.substring(4) : value;
    }
}
