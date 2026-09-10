package kr.polarad.crm;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

final class AppUpdateClient {
    private static final long CHECK_DEBOUNCE_MS = 15_000L;

    interface CheckCallback { void done(AppUpdateInfo info, int status, String error); }
    interface DownloadCallback {
        void progress(long downloaded, long total);
        void done(File file, String error);
    }

    private final ApiClient api;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Object checkLock = new Object();
    private final Object downloadLock = new Object();
    private final ArrayList<CheckCallback> pendingChecks = new ArrayList<>();
    private AppUpdateInfo cachedCheckInfo;
    private int cachedCheckStatus;
    private String cachedCheckError;
    private long cachedCheckAtMs;
    private AtomicBoolean activeDownloadCancel;
    private volatile boolean closed;

    AppUpdateClient(ApiClient api) { this.api = api; }

    void check(CheckCallback callback) {
        if (closed) return;
        if (api == null) {
            callback.done(AppUpdateInfo.none(), 0, "업데이트 API 연결이 아직 설정되지 않았습니다.");
            return;
        }
        long now = System.currentTimeMillis();
        synchronized (checkLock) {
            if (cachedCheckAtMs > 0 && now - cachedCheckAtMs < CHECK_DEBOUNCE_MS) {
                callback.done(cachedCheckInfo, cachedCheckStatus, cachedCheckError);
                return;
            }
            pendingChecks.add(callback);
            if (pendingChecks.size() > 1) return;
        }
        String path = "/api/mobile/app-update/latest?platform=android&package=kr.polarad.crm&version_code=" + BuildConfig.VERSION_CODE;
        api.callFresh("GET", path, null, (body, status, error) -> {
            if (closed) return;
            if (status == 404) {
                deliverCheck(AppUpdateInfo.none(), status, "업데이트 서비스를 찾을 수 없습니다.");
                return;
            }
            if (status < 200 || status >= 300) {
                deliverCheck(AppUpdateInfo.none(), status, message(body, error, "새 버전을 확인하지 못했습니다."));
                return;
            }
            try {
                deliverCheck(AppUpdateInfo.fromJson(body), status, null);
            } catch (IllegalArgumentException e) {
                deliverCheck(AppUpdateInfo.none(), status, e.getMessage());
            }
        });
    }

    void download(AppUpdateInfo info, File target, DownloadCallback callback) {
        if (closed) {
            callback.done(null, "업데이트 화면이 닫혔습니다.");
            return;
        }
        AtomicBoolean taskCancelled = new AtomicBoolean(false);
        synchronized (downloadLock) {
            activeDownloadCancel = taskCancelled;
        }
        executor.execute(() -> {
            HttpURLConnection connection = null;
            File partial = new File(target.getParentFile(), target.getName() + ".part");
            try {
                if (info == null || !info.available) throw new IllegalArgumentException("다운로드할 업데이트가 없습니다.");
                String startToken = api == null ? "" : clean(api.currentToken());
                if (startToken.isEmpty()) throw new SecurityException("로그인이 필요합니다.");
                String baseUrl = BuildConfig.API_BASE_URL == null ? "" : BuildConfig.API_BASE_URL.trim();
                if (BuildConfig.DRY_RUN) {
                    if (!"http://127.0.0.1:18791".equals(baseUrl)) throw new IllegalArgumentException("dry_run_endpoint_blocked");
                } else if (!baseUrl.startsWith("https://")) {
                    throw new IllegalArgumentException("HTTPS 업데이트 서버가 필요합니다.");
                }
                URL url = new URL(baseUrl + info.downloadPath);
                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("GET");
                connection.setConnectTimeout(8000);
                connection.setReadTimeout(20000);
                connection.setInstanceFollowRedirects(false);
                connection.setRequestProperty("Accept", "application/vnd.android.package-archive");
                connection.setRequestProperty("Authorization", "Bearer " + startToken);
                int status = connection.getResponseCode();
                if (status == 404) throw new IllegalStateException("업데이트 파일을 찾을 수 없습니다.");
                if (status < 200 || status >= 300) throw new IllegalStateException("업데이트 파일을 받을 수 없습니다.");
                long total = connection.getContentLengthLong();
                if (total <= 0 || total > AppUpdateInstaller.MAX_APK_BYTES) throw new IllegalStateException("업데이트 파일 크기가 허용 범위를 벗어났습니다.");
                if (info.sizeBytes > 0 && total != info.sizeBytes) throw new IllegalStateException("업데이트 파일 크기가 매니페스트와 다릅니다.");
                byte[] buffer = new byte[64 * 1024];
                long downloaded = 0;
                if (!partial.getParentFile().isDirectory()) partial.getParentFile().mkdirs();
                try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(partial, false)) {
                    int read;
                    while ((read = input.read(buffer)) != -1) {
                        if (closed || taskCancelled.get()) throw new InterruptedException("download_cancelled");
                        ensureSameToken(startToken);
                        downloaded += read;
                        if (downloaded > AppUpdateInstaller.MAX_APK_BYTES) throw new IllegalStateException("업데이트 파일이 너무 큽니다.");
                        output.write(buffer, 0, read);
                        if (!closed) callback.progress(downloaded, total);
                    }
                }
                if (info.sizeBytes > 0 && downloaded != info.sizeBytes) throw new IllegalStateException("다운로드 크기가 매니페스트와 다릅니다.");
                ensureSameToken(startToken);
                if (target.exists() && !target.delete()) throw new IllegalStateException("기존 업데이트 파일을 교체하지 못했습니다.");
                if (!partial.renameTo(target)) throw new IllegalStateException("업데이트 파일을 준비하지 못했습니다.");
                ensureSameToken(startToken);
                if (!closed) callback.done(target, null);
            } catch (InterruptedException e) {
                partial.delete();
                if (!closed) callback.done(null, "다운로드를 취소했습니다.");
            } catch (Exception e) {
                partial.delete();
                if (!closed) callback.done(null, e.getMessage() == null ? "다운로드에 실패했습니다." : e.getMessage());
            } finally {
                if (connection != null) connection.disconnect();
                synchronized (downloadLock) {
                    if (activeDownloadCancel == taskCancelled) activeDownloadCancel = null;
                }
            }
        });
    }

    void cancel() {
        synchronized (downloadLock) {
            if (activeDownloadCancel != null) activeDownloadCancel.set(true);
        }
    }

    void close() {
        closed = true;
        cancel();
        executor.shutdownNow();
    }

    private void ensureSameToken(String expectedToken) throws SecurityException {
        String currentToken = api == null ? "" : clean(api.currentToken());
        if (!Objects.equals(expectedToken, currentToken)) {
            throw new SecurityException("로그인 계정이 변경되어 업데이트를 중단했습니다.");
        }
    }

    private void deliverCheck(AppUpdateInfo info, int status, String error) {
        List<CheckCallback> callbacks;
        synchronized (checkLock) {
            cachedCheckInfo = info;
            cachedCheckStatus = status;
            cachedCheckError = error;
            cachedCheckAtMs = System.currentTimeMillis();
            callbacks = new ArrayList<>(pendingChecks);
            pendingChecks.clear();
        }
        if (closed) return;
        for (CheckCallback callback : callbacks) callback.done(info, status, error);
    }

    private static String clean(String value) {
        return value == null ? "" : value.trim();
    }

    private static String message(JSONObject body, String error, String fallback) {
        if (body != null) {
            String value = body.optString("message", "");
            if (!value.trim().isEmpty()) return value;
            value = body.optString("error", "");
            if (!value.trim().isEmpty()) return value;
        }
        return error == null || error.trim().isEmpty() ? fallback : error;
    }
}
