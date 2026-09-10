package kr.polarad.crm;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import java.util.Locale;
import java.util.Map;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public final class CrmFirebaseMessagingService extends FirebaseMessagingService {
    static volatile Runnable dataChangeListener;
    private static final String CHANNEL_ID = "crm_default";

    @Override
    public void onNewToken(String token) {
        PushManager.saveToken(this, token);
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        Runnable listener = dataChangeListener;
        if (listener != null) listener.run();
        if (!NotificationSettings.osPermissionEnabled(this)) return;
        Map<String, String> data = message.getData();
        String type = data.get("notification_type");
        if (type == null || type.trim().isEmpty()) type = data.get("type");
        if (!NotificationSettings.shouldShow(this, type == null ? "" : type, data)) return;
        createChannel();
        String notificationId = data.get("notification_id");
        Intent intent = new Intent(this, MainActivity.class)
                .putExtra("open_notifications", true)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (notificationId != null && !notificationId.trim().isEmpty()) {
            intent.setData(Uri.parse("polarad://crm/notifications/" + Uri.encode(notificationId)));
            intent.putExtra("notification_id", notificationId);
        }
        if (type != null && !type.trim().isEmpty()) intent.putExtra("notification_type", type);
        for (String key : new String[] { "customer_id", "estimate_id", "appointment_id" }) {
            String value = data.get(key);
            if (value != null && !value.trim().isEmpty()) intent.putExtra(key, value);
        }
        int requestCode = notificationId == null ? 0 : notificationId.hashCode();
        PendingIntent pending = PendingIntent.getActivity(this, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String title = "CRM 업무 알림";
        String text = "새 업무 알림이 도착했습니다.";
        if (!NotificationSettings.isPreviewMasked(this)) {
            String detailTitle = data.get("title");
            String detailText = data.get("body");
            if (detailTitle != null && !detailTitle.trim().isEmpty()) title = detailTitle;
            if (detailText != null && !detailText.trim().isEmpty()) text = detailText;
            if ("new_customer".equals(type)) {
                if (detailTitle == null || detailTitle.trim().isEmpty()) title = newCustomerTitle(data);
                if (detailText == null || detailText.trim().isEmpty()) text = newCustomerText(data);
            }
        }
        NotificationCompat.Builder notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.polarad_launcher)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setAutoCancel(true)
                .setContentIntent(pending);
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) manager.notify((int) (System.currentTimeMillis() & 0x7fffffff), notification.build());
    }

    private static String newCustomerTitle(Map<String, String> data) {
        return isMetaSource(data) ? "신규 고객 Meta 접수" : "신규 고객 홈페이지 접수";
    }

    private static String newCustomerText(Map<String, String> data) {
        StringBuilder text = new StringBuilder();
        append(text, "이름", first(data, "name", "customer_name"));
        append(text, "연락처", first(data, "phone", "customer_phone"));
        String budget = first(data, "budget", "estimate_amount");
        if (!budget.isEmpty()) {
            try {
                budget = String.format(Locale.KOREA, "%,d", Long.parseLong(budget));
            } catch (NumberFormatException ignored) { }
        }
        append(text, "예산", budget);
        append(text, "희망지점", first(data, "desired_branch", "preferred_branch", "branch", "location"));
        return text.length() == 0 ? "새 상담신청이 접수되었습니다. 앱에서 확인해 주세요." : text.toString();
    }

    private static String first(Map<String, String> data, String... keys) {
        for (String key : keys) {
            String value = data.get(key);
            if (value != null && !value.trim().isEmpty()) return value.trim();
        }
        return "";
    }

    private static void append(StringBuilder text, String label, String value) {
        if (value == null || value.isEmpty()) return;
        if (text.length() > 0) text.append(" · ");
        text.append(label).append(' ').append(value);
    }

    private static boolean isMetaSource(Map<String, String> data) {
        String source = data.get("source");
        if (source != null && !source.trim().isEmpty()) {
            String normalized = source.trim().toLowerCase(Locale.ROOT);
            return normalized.equals("meta") || normalized.equals("facebook") || normalized.equals("instagram");
        }
        String platform = data.get("platform");
        if (platform == null || platform.trim().isEmpty()) return false;
        String normalized = platform.trim().toLowerCase(Locale.ROOT);
        return normalized.equals("meta") || normalized.equals("facebook") || normalized.equals("instagram");
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.createNotificationChannel(new NotificationChannel(CHANNEL_ID, getString(R.string.default_notification_channel_name), NotificationManager.IMPORTANCE_DEFAULT));
        }
    }
}
