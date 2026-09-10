package kr.polarad.crm;

import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.Reader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class ApiClient {
    interface Callback { void done(JSONObject body, int status, String error); }
    interface BytesCallback { void done(byte[] body, int status, String error); }
    interface PendingListener { void changed(int pendingRequests); }

    private static final long CACHE_TTL_MS = 15_000L;
    private static final int CACHE_MAX_ENTRIES = 32;
    private static final int CACHE_MAX_BYTES = 4 * 1024 * 1024;
    private static final int MAX_IN_FLIGHT = 64;

    private final ExecutorService executor = Executors.newFixedThreadPool(2);
    private final Object cacheLock = new Object();
    private final LinkedHashMap<String, CacheEntry> cache = new LinkedHashMap<>(16, 0.75f, true);
    private final Map<String, InFlight> inFlight = new LinkedHashMap<>();
    private int cacheBytes;
    private int pendingRequests;
    private long generation;
    private volatile String token;
    private volatile boolean supportReadOnly;
    private Runnable suspensionListener;
    private volatile PendingListener pendingListener;

    void setSuspensionListener(Runnable listener) { suspensionListener = listener; }

    void setPendingListener(PendingListener listener) { pendingListener = listener; }

    int pendingCount() {
        synchronized (cacheLock) { return pendingRequests; }
    }

    void setToken(String t) {
        synchronized (cacheLock) {
            if (same(token, t)) return;
            token = t;
            clearReadStateLocked();
        }
    }

    String currentToken() { return token; }

    void setSupportReadOnly(boolean readOnly) { supportReadOnly = readOnly; }

    void call(String method, String path, JSONObject payload, Callback callback) {
        request(method, path, payload, callback, false);
    }

    void callFresh(String method, String path, JSONObject payload, Callback callback) {
        request(method, path, payload, callback, true);
    }

    void callBytes(String path, BytesCallback callback) {
        if (token == null || token.trim().isEmpty()) { callback.done(new byte[0], 0, "auth_required"); return; }
        if (path == null || !path.startsWith("/api/mobile/meta/ads/") || path.contains("//") || path.contains("..") || path.length() > 220) {
            callback.done(new byte[0], 0, "image_path_blocked"); return;
        }
        final String bearer = token;
        final long requestGeneration;
        synchronized (cacheLock) {
            if (pendingRequests >= MAX_IN_FLIGHT) { callback.done(new byte[0], 0, "request_queue_full"); return; }
            requestGeneration = generation;
            pendingRequests++;
        }
        notifyPendingChanged(pendingRequests);
        executor.execute(() -> {
            int status = 0;
            byte[] body = new byte[0];
            String error = null;
            HttpURLConnection c = null;
            try {
                String baseUrl = BuildConfig.API_BASE_URL == null ? "" : BuildConfig.API_BASE_URL.trim();
                if (baseUrl.isEmpty()) error = "API_BASE_URL is not configured for this build.";
                else if (BuildConfig.DRY_RUN && (!"http://127.0.0.1:18791".equals(baseUrl)
                        || path == null || !path.startsWith("/api/mobile/") || path.contains("//"))) error = "dry_run_endpoint_blocked";
                else {
                    c = (HttpURLConnection) new URL(baseUrl + path).openConnection();
                    c.setRequestMethod("GET");
                    c.setConnectTimeout(8000);
                    c.setReadTimeout(12000);
                    c.setInstanceFollowRedirects(false);
                    c.setRequestProperty("Accept", "image/*,application/json");
                    if (bearer != null) c.setRequestProperty("Authorization", "Bearer " + bearer);
                    status = c.getResponseCode();
                    InputStream stream = status >= 400 ? c.getErrorStream() : c.getInputStream();
                    body = readBytes(stream, 2 * 1024 * 1024);
                }
            } catch (Exception e) {
                error = e.getMessage() == null ? "network_error" : e.getMessage();
            } finally {
                if (c != null) c.disconnect();
            }
            synchronized (cacheLock) {
                if (!same(bearer, token) || requestGeneration != generation) { body = new byte[0]; status = 0; error = "request_superseded"; }
            }
            byte[] result = body;
            String resultError = error;
            int resultStatus = status;
            try { callback.done(result, resultStatus, resultError); }
            finally {
                int pendingAfterFinish;
                synchronized (cacheLock) {
                    if (pendingRequests > 0) pendingRequests--;
                    pendingAfterFinish = pendingRequests;
                }
                notifyPendingChanged(pendingAfterFinish);
            }
        });
    }

    private void request(String method, String path, JSONObject payload, Callback callback, boolean fresh) {
        String verb = method == null ? "" : method.toUpperCase(java.util.Locale.US);
        if (supportReadOnly && isMutation(verb) && (path == null || (!path.endsWith("/support/end") && !path.endsWith("/preview-session/end")))) {
            callback.done(new JSONObject(), 403, "support_read_only");
            return;
        }
        String bearer = token;
        boolean cacheable = "GET".equals(verb) && payload == null && isCacheableRead(path);
        String key = cacheable ? readKey(bearer, path) : null;

        if (cacheable && !fresh) {
            CacheEntry hit;
            boolean hitValid;
            synchronized (cacheLock) {
                hit = cache.get(key);
                hitValid = hit != null && hit.expiresAt > System.currentTimeMillis();
                if (hit != null && !hitValid) removeCacheLocked(key);
            }
            if (hitValid) {
                JSONObject body = copy(hit.body);
                if (same(bearer, token)) callback.done(body, 200, null);
                else callback.done(new JSONObject(), 0, "request_superseded");
                return;
            }
        } else if (cacheable) {
            synchronized (cacheLock) { removeCacheLocked(key); }
        }

        final long requestGeneration;
        synchronized (cacheLock) { requestGeneration = generation; }
        String flightKey = cacheable ? (fresh ? "fresh|" + key : key) + "|g" + requestGeneration : null;
        int pendingAfterStart = -1;
        if (cacheable) {
            boolean overflow = false;
            boolean deduplicated = false;
            synchronized (cacheLock) {
                InFlight existing = inFlight.get(flightKey);
                if (existing != null) {
                    if (existing.callbacks.size() >= MAX_IN_FLIGHT) {
                        overflow = true;
                    } else {
                        existing.callbacks.add(callback);
                        deduplicated = true;
                    }
                } else if (pendingRequests >= MAX_IN_FLIGHT) {
                    overflow = true;
                } else {
                    inFlight.put(flightKey, new InFlight(generation, callback));
                    pendingRequests++;
                    pendingAfterStart = pendingRequests;
                }
            }
            if (overflow) { callback.done(new JSONObject(), 0, "request_queue_full"); return; }
            if (deduplicated) return;
        } else {
            boolean overflow;
            synchronized (cacheLock) {
                overflow = pendingRequests >= MAX_IN_FLIGHT;
                if (!overflow) {
                    pendingRequests++;
                    pendingAfterStart = pendingRequests;
                }
            }
            if (overflow) { callback.done(new JSONObject(), 0, "request_queue_full"); return; }
        }

        notifyPendingChanged(pendingAfterStart);

        executor.execute(() -> perform(verb, path, payload, bearer, callback, cacheable, key, flightKey, requestGeneration));
    }

    private void perform(String method, String path, JSONObject payload, String bearer, Callback callback,
                         boolean cacheable, String key, String flightKey, long requestGeneration) {
        int status = 0;
        HttpURLConnection c = null;
        JSONObject body = new JSONObject();
        String error = null;
        try {
            String baseUrl = BuildConfig.API_BASE_URL == null ? "" : BuildConfig.API_BASE_URL.trim();
            if (baseUrl.isEmpty()) {
                error = "API_BASE_URL is not configured for this build.";
            } else if (BuildConfig.DRY_RUN && (!"http://127.0.0.1:18791".equals(baseUrl)
                    || path == null || !path.startsWith("/api/mobile/") || path.contains("//"))) {
                error = "dry_run_endpoint_blocked";
            } else {
                c = (HttpURLConnection) new URL(baseUrl + path).openConnection();
                c.setRequestMethod(method);
                c.setConnectTimeout(8000);
                c.setReadTimeout(12000);
                c.setInstanceFollowRedirects(false);
                c.setRequestProperty("Accept", "application/json");
                if (bearer != null) c.setRequestProperty("Authorization", "Bearer " + bearer);
                if (payload != null) {
                    c.setDoOutput(true);
                    c.setRequestProperty("Content-Type", "application/json");
                    try (OutputStream o = c.getOutputStream()) {
                        o.write(payload.toString().getBytes(StandardCharsets.UTF_8));
                    }
                }
                status = c.getResponseCode();
                InputStream stream = status >= 400 ? c.getErrorStream() : c.getInputStream();
                String text = read(stream);
                body = text.isEmpty() ? new JSONObject() : new JSONObject(text);
                if (status == 403 && "tenant_suspended".equals(body.optString("code"))
                        && bearer != null && bearer.equals(token) && suspensionListener != null) {
                    suspensionListener.run();
                }
            }
        } catch (Exception e) {
            error = e.getMessage() == null ? "network_error" : e.getMessage();
        } finally {
            if (c != null) c.disconnect();
        }

        if (!same(bearer, token)) {
            body = new JSONObject();
            status = 0;
            error = "request_superseded";
        }

        String serialized = null;
        if (cacheable && error == null && status >= 200 && status < 300) {
            serialized = body.toString();
            synchronized (cacheLock) {
                if (requestGeneration == generation && serialized.getBytes(StandardCharsets.UTF_8).length <= CACHE_MAX_BYTES) {
                    putCacheLocked(key, serialized);
                }
            }
        }
        if (!cacheable && error == null && isMutation(method) && status >= 200 && status < 300) {
            invalidateData();
        }

        try {
            List<Callback> callbacks = new ArrayList<>();
            if (cacheable) {
                synchronized (cacheLock) {
                    InFlight flight = inFlight.remove(flightKey);
                    if (flight != null) callbacks.addAll(flight.callbacks);
                }
            } else {
                callbacks.add(callback);
            }
            for (Callback item : callbacks) item.done(copy(body), status, error);
        } finally {
            int pendingAfterFinish;
            synchronized (cacheLock) {
                if (pendingRequests > 0) pendingRequests--;
                pendingAfterFinish = pendingRequests;
            }
            notifyPendingChanged(pendingAfterFinish);
        }
    }

    private void notifyPendingChanged(int count) {
        PendingListener listener = pendingListener;
        if (listener != null && count >= 0) listener.changed(count);
    }

    private static boolean isCacheableRead(String path) {
        if (path == null) return false;
        String base = path;
        int query = base.indexOf('?');
        if (query >= 0) base = base.substring(0, query);
        return "/api/mobile/home".equals(base)
                || "/api/mobile/analytics".equals(base)
                || "/api/mobile/meta/ads".equals(base)
                || "/api/mobile/appointments".equals(base)
                || "/api/mobile/customers".equals(base)
                || (base.startsWith("/api/mobile/customers/") && base.length() > "/api/mobile/customers/".length());
    }

    private static boolean isMutation(String method) {
        return "POST".equals(method) || "PUT".equals(method) || "PATCH".equals(method) || "DELETE".equals(method);
    }

    private static String readKey(String bearer, String path) {
        return (bearer == null ? "<anonymous>" : bearer) + "\n" + path;
    }

    private void putCacheLocked(String key, String serialized) {
        removeCacheLocked(key);
        int size = serialized.getBytes(StandardCharsets.UTF_8).length;
        cache.put(key, new CacheEntry(serialized, System.currentTimeMillis() + CACHE_TTL_MS, size));
        cacheBytes += size;
        while (cache.size() > CACHE_MAX_ENTRIES || cacheBytes > CACHE_MAX_BYTES) {
            Iterator<Map.Entry<String, CacheEntry>> it = cache.entrySet().iterator();
            if (!it.hasNext()) break;
            Map.Entry<String, CacheEntry> eldest = it.next();
            cacheBytes -= eldest.getValue().bytes;
            it.remove();
        }
    }

    private void removeCacheLocked(String key) {
        CacheEntry removed = cache.remove(key);
        if (removed != null) cacheBytes -= removed.bytes;
    }

    private void clearReadStateLocked() {
        cache.clear();
        cacheBytes = 0;
        generation++;
    }

    private void invalidateReadStateLocked() {
        cache.clear();
        cacheBytes = 0;
        generation++;
    }

    void invalidateData() {
        synchronized (cacheLock) {
            Iterator<Map.Entry<String, CacheEntry>> it = cache.entrySet().iterator();
            while (it.hasNext()) {
                Map.Entry<String, CacheEntry> entry = it.next();
                String key = entry.getKey();
                int separator = key.indexOf('\n');
                String path = separator < 0 ? key : key.substring(separator + 1);
                int query = path.indexOf('?');
                if (query >= 0) path = path.substring(0, query);
                if ("/api/mobile/home".equals(path) || "/api/mobile/appointments".equals(path)
                        || path.equals("/api/mobile/customers") || path.startsWith("/api/mobile/customers/")) {
                    cacheBytes -= entry.getValue().bytes;
                    it.remove();
                }
            }
            generation++;
        }
    }

    void invalidateAll() {
        synchronized (cacheLock) { invalidateReadStateLocked(); }
    }

    private static boolean same(String left, String right) { return left == null ? right == null : left.equals(right); }

    private static JSONObject copy(JSONObject source) {
        try { return source == null ? new JSONObject() : new JSONObject(source.toString()); }
        catch (Exception ignored) { return new JSONObject(); }
    }

    private static JSONObject copy(String source) {
        try { return source == null ? new JSONObject() : new JSONObject(source); }
        catch (Exception ignored) { return new JSONObject(); }
    }

    private static String read(InputStream s) throws IOException {
        if (s == null) return "";
        try (Reader r = new InputStreamReader(s, StandardCharsets.UTF_8)) {
            StringBuilder b = new StringBuilder();
            char[] chunk = new char[4096];
            int n;
            while ((n = r.read(chunk)) != -1) {
                if (b.length() + n > 2097152) throw new IOException("response_too_large");
                b.append(chunk, 0, n);
            }
            return b.toString();
        }
    }

    private static byte[] readBytes(InputStream s, int maxBytes) throws IOException {
        if (s == null) return new byte[0];
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        int total = 0;
        int n;
        while ((n = s.read(chunk)) != -1) {
            total += n;
            if (total > maxBytes) throw new IOException("response_too_large");
            out.write(chunk, 0, n);
        }
        return out.toByteArray();
    }

    private static final class CacheEntry {
        final String body;
        final long expiresAt;
        final int bytes;
        CacheEntry(String body, long expiresAt, int bytes) { this.body = body; this.expiresAt = expiresAt; this.bytes = bytes; }
    }

    private static final class InFlight {
        final long generation;
        final List<Callback> callbacks = new ArrayList<>();
        InFlight(long generation, Callback first) { this.generation = generation; callbacks.add(first); }
    }
}
