package kr.polarad.crm;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.view.Gravity;
import android.view.View;
import android.widget.Switch;
import android.content.res.ColorStateList;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

final class NotificationSettings {
    interface PlatformSubscriptionChanged { void accept(Switch toggle, boolean enabled, boolean previous); }
    private static final String PREFS = "crm_notification_settings";
    private static final String NEW_CUSTOMER = "new_customer";
    private static final String NEW_CUSTOMER_HOME = "new_customer_homepage";
    private static final String NEW_CUSTOMER_META = "new_customer_meta";
    private static final String APPOINTMENT_EVENT = "appointment_event";
    private static final String VISIT_REMINDER = "visit_reminder";
    private static final String MEASUREMENT_REMINDER = "measurement_reminder";
    private static final String PREVIEW_MASKED = "preview_masked";
    private static final int INK = Color.rgb(35, 35, 31);
    private static final int MUTED = Color.rgb(104, 102, 95);
    private static final int PAPER = Color.rgb(250, 249, 246);
    private static final int LINE = Color.rgb(229, 223, 211);

    private NotificationSettings() { }

    static boolean isNewCustomerEnabled(Context context) {
        return isNewCustomerHomepageEnabled(context) || isNewCustomerMetaEnabled(context);
    }

    static boolean isNewCustomerHomepageEnabled(Context context) {
        SharedPreferences prefs = preferences(context);
        return prefs.contains(NEW_CUSTOMER_HOME)
                ? prefs.getBoolean(NEW_CUSTOMER_HOME, true)
                : prefs.getBoolean(NEW_CUSTOMER, true);
    }

    static boolean isNewCustomerMetaEnabled(Context context) {
        SharedPreferences prefs = preferences(context);
        return prefs.contains(NEW_CUSTOMER_META)
                ? prefs.getBoolean(NEW_CUSTOMER_META, true)
                : prefs.getBoolean(NEW_CUSTOMER, true);
    }

    static boolean isVisitReminderEnabled(Context context) {
        return preferences(context).getBoolean(VISIT_REMINDER, preferences(context).getBoolean("reminder", true));
    }

    static boolean isMeasurementReminderEnabled(Context context) {
        return preferences(context).getBoolean(MEASUREMENT_REMINDER, preferences(context).getBoolean("reminder", true));
    }

    static boolean isAppointmentEventEnabled(Context context) {
        return preferences(context).getBoolean(APPOINTMENT_EVENT, true);
    }

    static boolean isPreviewMasked(Context context) {
        return preferences(context).getBoolean(PREVIEW_MASKED, true);
    }

    static String previewMode(Context context) {
        return isPreviewMasked(context) ? "generic" : "details";
    }

    static boolean shouldShow(Context context, String type) {
        return shouldShow(context, type, null);
    }

    static boolean shouldShow(Context context, String type, java.util.Map<String, String> data) {
        if ("new_customer".equals(type)) {
            return isMetaSource(data) ? isNewCustomerMetaEnabled(context) : isNewCustomerHomepageEnabled(context);
        }
        if ("visit_reminder".equals(type)) return isVisitReminderEnabled(context);
        if ("measurement_reminder".equals(type)) return isMeasurementReminderEnabled(context);
        if ("appointment_created".equals(type) || "appointment_updated".equals(type)) return isAppointmentEventEnabled(context);
        if ("staff_message".equals(type) && data != null) {
            String kind = data.get("kind");
            if ("appointment_created".equals(kind) || "appointment_updated".equals(kind)) return isAppointmentEventEnabled(context);
        }
        return true;
    }

    private static boolean isMetaSource(java.util.Map<String, String> data) {
        if (data == null) return false;
        String source = data.get("source");
        if (source != null && !source.trim().isEmpty()) {
            String normalized = source.trim().toLowerCase(java.util.Locale.ROOT);
            return normalized.equals("meta") || normalized.equals("facebook") || normalized.equals("instagram");
        }
        String platform = data.get("platform");
        if (platform == null || platform.trim().isEmpty()) return false;
        String normalized = platform.trim().toLowerCase(java.util.Locale.ROOT);
        return normalized.equals("meta") || normalized.equals("facebook") || normalized.equals("instagram");
    }

    static boolean osPermissionEnabled(Context context) {
        if (Build.VERSION.SDK_INT < 24) return true;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        return manager == null || manager.areNotificationsEnabled();
    }

    static View settings(Activity activity) {
        return settings(activity, osPermissionEnabled(activity), null, null);
    }

    static View settings(Activity activity, boolean osPermissionEnabled) {
        return settings(activity, osPermissionEnabled, null, null);
    }

    static View settings(Activity activity, boolean osPermissionEnabled, Runnable privacyChanged, Runnable customerMessages) {
        return settings(activity, osPermissionEnabled, privacyChanged, customerMessages, false, false, null);
    }

    static View settings(Activity activity, boolean osPermissionEnabled, Runnable privacyChanged, Runnable customerMessages,
                         boolean platformAdmin, boolean platformSubscribed, PlatformSubscriptionChanged platformChanged) {
        LinearLayout root = column(activity, 0, 0, 0, 20);
        root.addView(text(activity, "알림 설정", 23, true, INK));
        root.addView(text(activity, "내부 앱 알림과 고객 발송", 14, false, MUTED), topParams(7));

        root.addView(text(activity, "내가 받는 앱 알림", 17, true, INK), topParams(18));
        LinearLayout work = flatRows(activity);
        work.addView(toggleRow(activity, "신규 고객 홈페이지 접수", "이름·연락처·지역·가용예산", NEW_CUSTOMER_HOME, isNewCustomerHomepageEnabled(activity), null));
        work.addView(divider(activity), topParams(1));
        work.addView(toggleRow(activity, "신규 고객 Meta 접수", "이름·연락처·지역·가용예산", NEW_CUSTOMER_META, isNewCustomerMetaEnabled(activity), null));
        work.addView(divider(activity), topParams(1));
        work.addView(toggleRow(activity, "예약캘린더 일정 알림", "일정 등록·변경 시 고객카드로 연결", APPOINTMENT_EVENT, isAppointmentEventEnabled(activity), null));
        work.addView(divider(activity), topParams(1));
        work.addView(toggleRow(activity, "방문예약 일정 알림", "일정 등록 후 · 하루 전 · 당일 2시간 전", VISIT_REMINDER, isVisitReminderEnabled(activity), null));
        work.addView(divider(activity), topParams(1));
        work.addView(toggleRow(activity, "실측예약 일정 알림", "일정 등록 후 · 하루 전 · 당일 2시간 전", MEASUREMENT_REMINDER, isMeasurementReminderEnabled(activity), null));
        root.addView(work, topParams(18));

        if (platformAdmin) {
            root.addView(text(activity, "플랫폼 관리자 구독", 17, true, INK), topParams(18));
            root.addView(platformToggleRow(activity, "데이원디자인 신규접수 알림", "현재 플랫폼 관리자 기기로 수신", platformSubscribed, platformChanged), topParams(12));
        }

        root.addView(text(activity, "고객에게 보내는 안내", 17, true, INK), topParams(18));
        android.widget.Button customer = new android.widget.Button(activity);
        customer.setText("고객 접수·예약 메시지");
        customer.setTextColor(INK); customer.setTextSize(15); customer.setAllCaps(false);
        customer.setMinHeight(dp(activity, 52)); customer.setBackground(round(Color.WHITE, activity));
        customer.setOnClickListener(v -> { if (customerMessages != null) customerMessages.run(); });
        root.addView(customer, topParams(12));
        root.addView(text(activity, "개인정보", 17, true, INK), topParams(18));
        LinearLayout privacy = flatRows(activity);
        privacy.addView(toggleRow(activity, "잠금화면 개인정보 숨김", "이름·연락처 등 민감정보", PREVIEW_MASKED, isPreviewMasked(activity), privacyChanged));
        privacy.addView(text(activity, "잠금화면에서는 고객 정보를 숨깁니다. 앱 알림함에서 확인할 수 있습니다.", 13, false, MUTED), topParams(10));
        root.addView(privacy, topParams(12));

        root.addView(text(activity, "담당자 지정 알림과 데일리브리핑은 기존 별도 기능으로 유지합니다.", 13, false, MUTED), topParams(12));
        LinearLayout permission = card(activity);
        permission.addView(text(activity, "휴대폰 알림 권한", 15, true, INK));
        permission.addView(text(activity, osPermissionEnabled ? "알림 허용됨" : "거부됨 · 휴대폰 설정에서 허용해야 수신됩니다.", 13, false, MUTED), topParams(7));
        root.addView(permission, topParams(12));
        return root;
    }

    private static View toggleRow(Activity activity, String title, String subtitle, String key, boolean checked, Runnable changed) {
        LinearLayout row = row(activity);
        LinearLayout copy = column(activity, 0, 0, 8, 0);
        copy.addView(text(activity, title, 15, true, INK));
        copy.addView(text(activity, subtitle, 12, false, MUTED), topParams(4));
        row.addView(copy, new LinearLayout.LayoutParams(0, -2, 1));
        Switch toggle = new Switch(activity);
        toggle.setThumbTintList(new ColorStateList(new int[][]{new int[]{android.R.attr.state_checked},new int[]{}},new int[]{Color.WHITE,Color.rgb(150,148,141)}));
        toggle.setTrackTintList(new ColorStateList(new int[][]{new int[]{android.R.attr.state_checked},new int[]{}},new int[]{Color.rgb(53,99,78),Color.rgb(184,190,181)}));
        toggle.setChecked(checked);
        toggle.setContentDescription(title);
        toggle.setMinHeight(dp(activity, 48));
        toggle.setOnCheckedChangeListener((button, value) -> {
            preferences(activity).edit().putBoolean(key, value).apply();
            if (changed != null) changed.run();
        });
        row.addView(toggle, new LinearLayout.LayoutParams(dp(activity, 52), dp(activity, 52)));
        return row;
    }

    private static View platformToggleRow(Activity activity, String title, String subtitle, boolean checked, PlatformSubscriptionChanged changed) {
        LinearLayout row = row(activity);
        LinearLayout copy = column(activity, 0, 0, 8, 0);
        copy.addView(text(activity, title, 15, true, INK));
        copy.addView(text(activity, subtitle, 12, false, MUTED), topParams(4));
        row.addView(copy, new LinearLayout.LayoutParams(0, -2, 1));
        Switch toggle = new Switch(activity);
        toggle.setThumbTintList(new ColorStateList(new int[][]{new int[]{android.R.attr.state_checked},new int[]{}},new int[]{Color.WHITE,Color.rgb(150,148,141)}));
        toggle.setTrackTintList(new ColorStateList(new int[][]{new int[]{android.R.attr.state_checked},new int[]{}},new int[]{Color.rgb(53,99,78),Color.rgb(184,190,181)}));
        toggle.setChecked(checked);
        toggle.setContentDescription(title);
        toggle.setMinHeight(dp(activity, 48));
        toggle.setTag(Boolean.FALSE);
        toggle.setOnCheckedChangeListener((button, value) -> {
            if (changed != null) {
                if (Boolean.TRUE.equals(button.getTag())) return;
                button.setTag(Boolean.TRUE);
                button.setEnabled(false);
                changed.accept(toggle, value, !value);
            }
        });
        row.addView(toggle, new LinearLayout.LayoutParams(dp(activity, 52), dp(activity, 52)));
        return row;
    }

    private static View infoRow(Activity activity, String title, String subtitle) {
        LinearLayout row = row(activity);
        LinearLayout copy = column(activity, 0, 0, 0, 0);
        copy.addView(text(activity, title, 15, true, INK));
        copy.addView(text(activity, subtitle, 12, false, MUTED), topParams(4));
        row.addView(copy, new LinearLayout.LayoutParams(-1, -2));
        return row;
    }

    private static LinearLayout row(Activity activity) {
        LinearLayout row = new LinearLayout(activity);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(activity, 14), 0, dp(activity, 8), 0);
        row.setMinimumHeight(dp(activity, 52));
        GradientDrawable background = new GradientDrawable();
        background.setColor(Color.TRANSPARENT);

        row.setBackground(background);
        return row;
    }

    private static View divider(Activity activity) {
        View line = new View(activity);
        line.setBackgroundColor(LINE);
        line.setMinimumHeight(dp(activity, 1));
        return line;
    }

    private static LinearLayout card(Activity activity) {
        LinearLayout card = column(activity, 12, 12, 12, 12);
        card.setBackground(round(Color.WHITE, activity));
        return card;
    }

    private static LinearLayout flatRows(Activity activity) {
        LinearLayout rows = column(activity, 0, 0, 0, 0);
        rows.setBackgroundColor(Color.TRANSPARENT);
        return rows;
    }

    private static LinearLayout column(Activity activity, int left, int top, int right, int bottom) {
        LinearLayout view = new LinearLayout(activity);
        view.setOrientation(LinearLayout.VERTICAL);
        view.setPadding(dp(activity, left), dp(activity, top), dp(activity, right), dp(activity, bottom));
        return view;
    }

    private static TextView text(Activity activity, String value, float size, boolean bold, int color) {
        TextView view = new TextView(activity);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        view.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        if (bold) view.setTypeface(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD);
        return view;
    }

    private static GradientDrawable round(int color, Activity activity) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(activity, 6));
        drawable.setStroke(dp(activity, 1), LINE);
        return drawable;
    }

    private static LinearLayout.LayoutParams topParams(int top) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.topMargin = top;
        return params;
    }

    private static int dp(Activity activity, int value) {
        return Math.round(value * activity.getResources().getDisplayMetrics().density);
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
