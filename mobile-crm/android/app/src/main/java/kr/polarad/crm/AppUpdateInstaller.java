package kr.polarad.crm;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import java.io.File;
import java.io.FileInputStream;
import java.security.MessageDigest;
import java.util.LinkedHashSet;
import java.util.Set;

final class AppUpdateInstaller {
    static final long MAX_APK_BYTES = 150L * 1024L * 1024L;

    private AppUpdateInstaller() { }

    static File updateDir(Activity activity) {
        File dir = new File(activity.getCacheDir(), "updates");
        if (!dir.isDirectory()) dir.mkdirs();
        return dir;
    }

    static File targetFile(Activity activity, AppUpdateInfo info) {
        return new File(updateDir(activity), "crm-" + info.versionCode + ".apk");
    }

    static void verify(Activity activity, AppUpdateInfo info, File file) throws Exception {
        if (file == null || !file.isFile()) throw new IllegalArgumentException("다운로드 파일이 없습니다.");
        long length = file.length();
        if (length <= 0 || length > MAX_APK_BYTES) throw new IllegalArgumentException("APK 크기가 허용 범위를 벗어났습니다.");
        if (info.sizeBytes > 0 && length != info.sizeBytes) throw new IllegalArgumentException("APK 크기가 매니페스트와 다릅니다.");
        String actualHash = sha256(file);
        if (!info.sha256.equalsIgnoreCase(actualHash)) throw new IllegalArgumentException("APK SHA-256 검증에 실패했습니다.");
        PackageManager pm = activity.getPackageManager();
        PackageInfo archive = archiveInfo(pm, file);
        if (archive == null) throw new IllegalArgumentException("APK 패키지 정보를 읽을 수 없습니다.");
        if (!"kr.polarad.crm".equals(archive.packageName)) throw new IllegalArgumentException("대상 패키지가 kr.polarad.crm이 아닙니다.");
        long archiveCode = versionCode(archive);
        if (archiveCode != info.versionCode || archiveCode <= BuildConfig.VERSION_CODE) throw new IllegalArgumentException("APK versionCode가 올바르지 않습니다.");
        PackageInfo installed = installedInfo(pm);
        if (!sameSigning(installed, archive)) throw new IllegalArgumentException("현재 앱과 같은 release 서명이 아닙니다.");
    }

    static boolean canRequestInstall(Activity activity) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || activity.getPackageManager().canRequestPackageInstalls();
    }

    static void openInstallPermission(Activity activity) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
        intent.setData(Uri.parse("package:" + activity.getPackageName()));
        try {
            activity.startActivity(intent);
        } catch (Exception ignored) {
            activity.startActivity(new Intent(Settings.ACTION_SECURITY_SETTINGS));
        }
    }

    static void openInstaller(Activity activity, File file) {
        Uri uri = new Uri.Builder()
                .scheme("content")
                .authority(activity.getPackageName() + ".updates")
                .appendPath(file.getName())
                .build();
        Intent intent = new Intent(Intent.ACTION_INSTALL_PACKAGE);
        intent.setData(uri);
        intent.setFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true);
        activity.startActivity(intent);
    }

    private static PackageInfo archiveInfo(PackageManager pm, File file) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return pm.getPackageArchiveInfo(file.getAbsolutePath(), PackageManager.GET_SIGNING_CERTIFICATES);
        }
        return pm.getPackageArchiveInfo(file.getAbsolutePath(), PackageManager.GET_SIGNATURES);
    }

    private static PackageInfo installedInfo(PackageManager pm) throws PackageManager.NameNotFoundException {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return pm.getPackageInfo("kr.polarad.crm", PackageManager.GET_SIGNING_CERTIFICATES);
        }
        return pm.getPackageInfo("kr.polarad.crm", PackageManager.GET_SIGNATURES);
    }

    private static long versionCode(PackageInfo info) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) return info.getLongVersionCode();
        return info.versionCode;
    }

    private static boolean sameSigning(PackageInfo left, PackageInfo right) throws Exception {
        Set<String> leftDigests = certDigests(left);
        Set<String> rightDigests = certDigests(right);
        return !leftDigests.isEmpty() && !rightDigests.isEmpty() && leftDigests.equals(rightDigests);
    }

    @SuppressWarnings("deprecation")
    private static Set<String> certDigests(PackageInfo info) throws Exception {
        Signature[] signatures;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && info.signingInfo != null) {
            signatures = info.signingInfo.hasMultipleSigners()
                    ? info.signingInfo.getApkContentsSigners()
                    : info.signingInfo.getSigningCertificateHistory();
        } else {
            signatures = info.signatures;
        }
        Set<String> result = new LinkedHashSet<>();
        if (signatures != null) {
            for (Signature signature : signatures) result.add(bytesToHex(MessageDigest.getInstance("SHA-256").digest(signature.toByteArray())));
        }
        return result;
    }

    private static String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[64 * 1024];
        try (FileInputStream input = new FileInputStream(file)) {
            int read;
            while ((read = input.read(buffer)) != -1) digest.update(buffer, 0, read);
        }
        return bytesToHex(digest.digest());
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder builder = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) builder.append(String.format(java.util.Locale.US, "%02x", value));
        return builder.toString();
    }
}
