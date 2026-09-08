package kr.polarad.crm;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public final class CrmFirebaseMessagingService extends FirebaseMessagingService {
    private static final String CHANNEL_ID = "crm_default";

    @Override
    public void onNewToken(String token) {
        PushManager.saveToken(this, token);
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        createChannel();
        Intent intent = new Intent(this, MainActivity.class)
                .putExtra("open_notifications", true)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(this, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String title = "CRM 업무 알림";
        String text = "새 업무 알림이 도착했습니다.";
        NotificationCompat.Builder notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.dayone_launcher)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setAutoCancel(true)
                .setContentIntent(pending);
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) manager.notify((int) (System.currentTimeMillis() & 0x7fffffff), notification.build());
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.createNotificationChannel(new NotificationChannel(CHANNEL_ID, getString(R.string.default_notification_channel_name), NotificationManager.IMPORTANCE_DEFAULT));
        }
    }
}
