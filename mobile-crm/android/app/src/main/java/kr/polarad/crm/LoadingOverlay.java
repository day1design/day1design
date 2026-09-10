package kr.polarad.crm;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

final class LoadingOverlay {
    private static final long SHOW_DELAY_MS = 120L;
    private static final int INK = Color.rgb(35, 35, 31);
    private static final int MUTED = Color.rgb(104, 102, 95);

    private final Activity activity;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final FrameLayout overlay;
    private final ImageView logo;
    private final TextView tenantLabel;
    private final TextView status;
    private final Runnable showTask = this::showNow;
    private final Runnable hideTask = this::hideNow;
    private boolean attached;
    private boolean visible;

    LoadingOverlay(Activity activity) {
        this.activity = activity;
        overlay = new FrameLayout(activity);
        overlay.setBackgroundColor(Color.argb(238, 250, 249, 246));
        overlay.setClickable(false);
        overlay.setFocusable(false);
        overlay.setVisibility(View.GONE);

        LinearLayout content = new LinearLayout(activity);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER_HORIZONTAL);
        content.setPadding(dp(24), dp(20), dp(24), dp(20));
        content.setBackground(round(Color.WHITE, 16, Color.rgb(229, 223, 211)));

        logo = new ImageView(activity);
        logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        content.addView(logo, new LinearLayout.LayoutParams(dp(64), dp(64)));

        tenantLabel = new TextView(activity);
        tenantLabel.setTextColor(INK);
        tenantLabel.setTextSize(14);
        tenantLabel.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        tenantLabel.setGravity(Gravity.CENTER);
        content.addView(tenantLabel, new LinearLayout.LayoutParams(-2, -2));

        status = new TextView(activity);
        status.setText("불러오는 중");
        status.setTextColor(MUTED);
        status.setTextSize(12);
        status.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams statusParams = new LinearLayout.LayoutParams(-2, -2);
        statusParams.topMargin = dp(6);
        content.addView(status, statusParams);

        FrameLayout.LayoutParams contentParams = new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER);
        overlay.addView(content, contentParams);
    }

    void attach() {
        ViewGroup parent = activity.findViewById(android.R.id.content);
        if (parent == null || overlay.getParent() == parent) return;
        if (overlay.getParent() instanceof ViewGroup) ((ViewGroup) overlay.getParent()).removeView(overlay);
        parent.addView(overlay, new ViewGroup.LayoutParams(-1, -1));
        attached = true;
    }

    void setBranding(int logoResId, String tenantName) {
        if (logoResId != 0) {
            logo.setVisibility(View.VISIBLE);
            logo.setImageResource(logoResId);
        } else {
            logo.setVisibility(View.GONE);
        }
        String label = tenantName == null ? "" : tenantName.trim();
        tenantLabel.setText(label);
        tenantLabel.setVisibility(label.isEmpty() ? View.GONE : View.VISIBLE);
    }

    void onPendingChanged(int pendingRequests) {
        if (pendingRequests > 0) {
            main.removeCallbacks(hideTask);
            if (!visible) {
                main.removeCallbacks(showTask);
                main.postDelayed(showTask, SHOW_DELAY_MS);
            }
        } else {
            main.removeCallbacks(showTask);
            main.removeCallbacks(hideTask);
            if (visible) main.post(hideTask);
        }
    }

    void detach() {
        main.removeCallbacks(showTask);
        main.removeCallbacks(hideTask);
        if (attached && overlay.getParent() instanceof ViewGroup) {
            ((ViewGroup) overlay.getParent()).removeView(overlay);
        }
        overlay.animate().cancel();
        attached = false;
        visible = false;
    }

    private void showNow() {
        if (!attached || visible) return;
        visible = true;
        overlay.setAlpha(0f);
        overlay.setScaleX(.98f);
        overlay.setScaleY(.98f);
        overlay.setVisibility(View.VISIBLE);
        overlay.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(180L)
                .setInterpolator(new AccelerateDecelerateInterpolator()).start();
    }

    private void hideNow() {
        if (!attached || !visible) return;
        visible = false;
        overlay.animate().alpha(0f).setDuration(120L).withEndAction(() -> {
            if (!visible) overlay.setVisibility(View.GONE);
        }).start();
    }

    private int dp(int value) {
        return Math.round(value * activity.getResources().getDisplayMetrics().density);
    }

    private static GradientDrawable round(int fill, int radius, int stroke) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(fill);
        drawable.setCornerRadius(radius);
        if (stroke != Color.TRANSPARENT) drawable.setStroke(1, stroke);
        return drawable;
    }
}
