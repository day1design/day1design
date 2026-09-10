package kr.polarad.crm;

import org.json.JSONObject;

final class AppUpdateInfo {
    final boolean available;
    final boolean mandatory;
    final int versionCode;
    final String versionName;
    final long sizeBytes;
    final String sha256;
    final String downloadPath;
    final String releaseNote;

    private AppUpdateInfo(boolean available, boolean mandatory, int versionCode, String versionName,
                          long sizeBytes, String sha256, String downloadPath, String releaseNote) {
        this.available = available;
        this.mandatory = mandatory;
        this.versionCode = versionCode;
        this.versionName = versionName == null ? "" : versionName.trim();
        this.sizeBytes = sizeBytes;
        this.sha256 = sha256 == null ? "" : sha256.trim().toLowerCase(java.util.Locale.US);
        this.downloadPath = downloadPath == null ? "" : downloadPath.trim();
        this.releaseNote = releaseNote == null ? "" : releaseNote.trim();
    }

    static AppUpdateInfo none() {
        return new AppUpdateInfo(false, false, BuildConfig.VERSION_CODE, BuildConfig.VERSION_NAME, 0, "", "", "");
    }

    static AppUpdateInfo fromJson(JSONObject body) throws IllegalArgumentException {
        if (body == null) throw new IllegalArgumentException("업데이트 매니페스트가 비어 있습니다.");
        if (!body.has("available")) throw new IllegalArgumentException("업데이트 매니페스트 available 필드가 없습니다.");
        Object availableValue = body.opt("available");
        if (!(availableValue instanceof Boolean)) throw new IllegalArgumentException("업데이트 매니페스트 available 형식이 올바르지 않습니다.");
        if (!((Boolean) availableValue)) return none();
        if (!"kr.polarad.crm".equals(body.optString("packageName", ""))) throw new IllegalArgumentException("업데이트 대상 앱 정보가 올바르지 않습니다.");
        long longCode = body.optLong("versionCode", 0);
        if (longCode > Integer.MAX_VALUE || longCode <= BuildConfig.VERSION_CODE) throw new IllegalArgumentException("업데이트 버전 정보가 올바르지 않습니다.");
        int nextCode = (int) longCode;
        long bytes = body.optLong("sizeBytes", body.optLong("size_bytes", -1));
        String path = body.optString("downloadPath", body.optString("download_path", ""));
        String hash = body.optString("sha256", "");
        if (nextCode <= BuildConfig.VERSION_CODE) throw new IllegalArgumentException("현재 버전보다 높은 versionCode가 아닙니다.");
        if (bytes <= 0 || bytes > AppUpdateInstaller.MAX_APK_BYTES) throw new IllegalArgumentException("APK 크기 정보가 올바르지 않습니다.");
        if (!hash.matches("(?i)^[a-f0-9]{64}$")) throw new IllegalArgumentException("APK SHA-256 형식이 올바르지 않습니다.");
        if (!path.startsWith("/api/mobile/app-update/") || path.contains("..") || path.contains("//")) {
            throw new IllegalArgumentException("다운로드 경로가 허용 범위를 벗어났습니다.");
        }
        return new AppUpdateInfo(true, body.optBoolean("mandatory", false), nextCode,
                body.optString("versionName", body.optString("version_name", "")), bytes, hash, path,
                body.optString("releaseNote", body.optString("release_note", "")));
    }
}
