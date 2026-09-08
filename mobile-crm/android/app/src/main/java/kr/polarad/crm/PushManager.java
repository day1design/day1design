package kr.polarad.crm;

import android.content.Context;
import android.content.SharedPreferences;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;
import java.util.UUID;
import org.json.JSONObject;

final class PushManager {
    private static final String PREFS = "crm_push";
    private static final String TOKEN = "fcm_token";
    private static final String DEVICE_ID = "device_id";

    private PushManager() { }

    static boolean isConfigured() {
        return BuildConfig.FCM_CONFIGURED;
    }

    static void initialize(Context context, ApiClient api, boolean notificationsEnabled) {
        if (!isConfigured()) return;
        try {
            FirebaseApp app;
            if (FirebaseApp.getApps(context).isEmpty()) {
                FirebaseOptions options = new FirebaseOptions.Builder()
                        .setProjectId(BuildConfig.FCM_PROJECT_ID)
                        .setApplicationId(BuildConfig.FCM_APP_ID)
                        .setApiKey(BuildConfig.FCM_API_KEY)
                        .setGcmSenderId(BuildConfig.FCM_SENDER_ID)
                        .build();
                app = FirebaseApp.initializeApp(context, options);
            } else {
                app = FirebaseApp.getInstance();
            }
            if (app == null) return;
            FirebaseMessaging.getInstance().getToken().addOnSuccessListener(token -> {
                saveToken(context, token);
                registerCurrentDevice(context, api, notificationsEnabled);
            });
        } catch (RuntimeException ignored) { }
    }

    static void saveToken(Context context, String token) {
        if (token == null || token.trim().isEmpty()) return;
        preferences(context).edit().putString(TOKEN, token.trim()).apply();
    }

    static void registerCurrentDevice(Context context, ApiClient api, boolean notificationsEnabled) {
        if (!isConfigured()) return;
        String token = preferences(context).getString(TOKEN, "");
        if (token == null || token.trim().isEmpty()) return;
        JSONObject payload = new JSONObject();
        try {
            payload.put("id", deviceId(context));
            payload.put("push_token", token);
            payload.put("notifications_enabled", notificationsEnabled);
            payload.put("preview_mode", "generic");
        } catch (Exception ignored) {
            return;
        }
        api.call("POST", "/api/mobile/devices", payload, (body, status, error) -> { });
    }

    static void unregisterCurrentDevice(Context context, ApiClient api) {
        if (!isConfigured()) return;
        String id = preferences(context).getString(DEVICE_ID, "");
        if (id != null && !id.isEmpty()) api.call("DELETE", "/api/mobile/devices/" + id, null, (body, status, error) -> { });
    }

    private static String deviceId(Context context) {
        SharedPreferences prefs = preferences(context);
        String id = prefs.getString(DEVICE_ID, "");
        if (id != null && !id.isEmpty()) return id;
        id = UUID.randomUUID().toString();
        prefs.edit().putString(DEVICE_ID, id).apply();
        return id;
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
