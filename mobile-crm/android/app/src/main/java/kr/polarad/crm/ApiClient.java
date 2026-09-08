package kr.polarad.crm;

import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class ApiClient {
    interface Callback { void done(JSONObject body, int status, String error); }
    private final ExecutorService executor = Executors.newFixedThreadPool(2);
    private volatile String token;
    void setToken(String t) { token = t; }
    void call(String method, String path, JSONObject payload, Callback callback) {
        String bearer = token;
        executor.execute(() -> { int status = 0; HttpURLConnection c = null; try {
            String baseUrl = BuildConfig.API_BASE_URL == null ? "" : BuildConfig.API_BASE_URL.trim();
            if (baseUrl.isEmpty()) {
                callback.done(new JSONObject(), status, "API_BASE_URL is not configured for this build.");
                return;
            }
            c = (HttpURLConnection) new URL(baseUrl + path).openConnection();
            c.setRequestMethod(method); c.setConnectTimeout(8000); c.setReadTimeout(12000); c.setInstanceFollowRedirects(false); c.setRequestProperty("Accept", "application/json");
            if (bearer != null) c.setRequestProperty("Authorization", "Bearer " + bearer);
            if (payload != null) { c.setDoOutput(true); c.setRequestProperty("Content-Type", "application/json"); try (OutputStream o = c.getOutputStream()) { o.write(payload.toString().getBytes(StandardCharsets.UTF_8)); } }
            status = c.getResponseCode(); InputStream stream = status >= 400 ? c.getErrorStream() : c.getInputStream();
            String text = read(stream); callback.done(text.isEmpty() ? new JSONObject() : new JSONObject(text), status, null);
        } catch (Exception e) { callback.done(new JSONObject(), status, e.getMessage() == null ? "network_error" : e.getMessage()); }
        finally { if (c != null) c.disconnect(); } });
    }
    private static String read(InputStream s) throws IOException { if (s == null) return ""; try (Reader r = new InputStreamReader(s, StandardCharsets.UTF_8)) { StringBuilder b = new StringBuilder(); char[] chunk = new char[4096]; int n; while ((n = r.read(chunk)) != -1 && b.length() < 512000) b.append(chunk, 0, Math.min(n, 512000 - b.length())); return b.toString(); } }
}
