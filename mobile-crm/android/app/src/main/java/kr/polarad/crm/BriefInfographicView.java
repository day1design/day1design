package kr.polarad.crm;

import android.app.Activity;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.DecimalFormat;
import java.util.Locale;

final class BriefInfographicView {
    private static final int INK = Color.rgb(35, 35, 31);
    private static final int MUTED = Color.rgb(104, 102, 95);
    private static final int PAPER = Color.rgb(250, 249, 246);
    private static final int PANEL = Color.WHITE;
    private static final int LINE = Color.rgb(229, 223, 211);
    private static final int CONSULT = Color.rgb(36, 84, 214);
    private static final int MEASURE = Color.rgb(8, 127, 115);
    private static final DecimalFormat NUMBER = new DecimalFormat("#,##0.##");

    private BriefInfographicView() { }

    static View create(Activity activity, JSONObject visualization, String analysis) {
        LinearLayout root = column(activity, 16, 16, 16, 28);
        root.setBackgroundColor(PAPER);
        root.setContentDescription("AI 브리핑 시각화");

        JSONObject data = visualization == null ? new JSONObject() : visualization;
        root.addView(card(activity, "AI 브리핑 시각화", periodLabel(data)), matchParams(activity, 0));

        JSONArray metrics = data.optJSONArray("metrics");
        if (metrics != null && metrics.length() > 0) {
            addHeading(activity, root, "핵심 지표");
            addMetricTiles(activity, root, metrics, hasUsableComparisonPeriod(data));
        }

        JSONArray channels = data.optJSONArray("channels");
        if (channels != null && channels.length() > 0) {
            addHeading(activity, root, data.optString("channels_label", "채널별 접수"));
            addChannels(activity, root, channels);
        }

        JSONArray actions = data.optJSONArray("actions");
        if (actions != null && actions.length() > 0) {
            addHeading(activity, root, "다음 점검");
            addActions(activity, root, actions);
        }

        if (analysis != null && !analysis.trim().isEmpty()) {
            addHeading(activity, root, "전문 에이전트 분석");
            addDetails(activity, root, analysis.trim());
        }
        return root;
    }

    private static void addMetricTiles(Activity a, LinearLayout root, JSONArray metrics, boolean comparison) {
        LinearLayout row = null;
        for (int i = 0; i < Math.min(metrics.length(), 8); i++) {
            JSONObject metric = metrics.optJSONObject(i);
            if (metric == null) continue;
            if (row == null || row.getChildCount() == 2) {
                row = new LinearLayout(a);
                row.setOrientation(LinearLayout.HORIZONTAL);
                root.addView(row, topParams(a, 8));
            }
            LinearLayout.LayoutParams tileParams = new LinearLayout.LayoutParams(0, -2, 1);
            tileParams.leftMargin = dp(a, 3);
            tileParams.rightMargin = dp(a, 3);
            row.addView(metricTile(a, metric, comparison), tileParams);
        }
    }

    private static View metricTile(Activity a, JSONObject metric, boolean comparison) {
        LinearLayout box = column(a, 14, 13, 14, 13);
        box.setBackground(round(a, PANEL, LINE, 6));
        View accent = new View(a);
        accent.setBackgroundColor((metric.optInt("accent", 0) & 1) == 1 ? MEASURE : CONSULT);
        box.addView(accent, new LinearLayout.LayoutParams(-1, dp(a, 3)));
        TextView label = text(a, string(metric, "label", "지표"), 13, false, MUTED);
        label.setGravity(Gravity.START);
        label.setPadding(0, dp(a, 8), 0, 0);
        box.addView(label, new LinearLayout.LayoutParams(-1, -2));

        TextView value = text(a, displayValue(metric), 20, true, INK);
        value.setPadding(0, dp(a, 5), 0, 0);
        box.addView(value, new LinearLayout.LayoutParams(-1, -2));

        if (comparison && isFinite(metric, "previous")) {
            double current = finiteOrNaN(metric, "value");
            double previous = finiteOrNaN(metric, "previous");
            if (!Double.isNaN(current) && !Double.isNaN(previous)) {
                double delta = current - previous;
                TextView deltaText = text(a, "이전 대비 " + signed(delta) + suffix(metric), 11, false, MUTED);
                deltaText.setPadding(0, dp(a, 4), 0, 0);
                box.addView(deltaText, new LinearLayout.LayoutParams(-1, -2));
            }
        }
        return box;
    }

    private static void addChannels(Activity a, LinearLayout root, JSONArray channels) {
        double max = 0;
        for (int i = 0; i < Math.min(channels.length(), 6); i++) {
            JSONObject channel = channels.optJSONObject(i);
            if (channel == null) continue;
            double value = finiteOrNaN(channel, "value");
            if (!Double.isNaN(value) && value >= 0) max = Math.max(max, value);
        }
        LinearLayout block = column(a, 14, 12, 14, 12);
        block.setBackground(round(a, PANEL, LINE, 6));
        for (int i = 0; i < Math.min(channels.length(), 6); i++) {
            JSONObject channel = channels.optJSONObject(i);
            if (channel == null) continue;
            if (i > 0) addDivider(a, block);
            LinearLayout line = column(a, 0, 7, 0, 7);
            LinearLayout header = new LinearLayout(a);
            header.setGravity(Gravity.CENTER_VERTICAL);
            TextView label = text(a, string(channel, "label", "채널"), 13, false, INK);
            label.setGravity(Gravity.START);
            header.addView(label, new LinearLayout.LayoutParams(0, -2, 1));
            TextView value = text(a, displayChannelValue(channel), 13, true, INK);
            value.setGravity(Gravity.END);
            header.addView(value, new LinearLayout.LayoutParams(-2, -2));
            line.addView(header, new LinearLayout.LayoutParams(-1, -2));

            double current = finiteOrNaN(channel, "value");
            BarTrack bar = new BarTrack(a, current, max);
            bar.setContentDescription(string(channel, "label", "채널") + " " + displayChannelValue(channel));
            line.addView(bar, new LinearLayout.LayoutParams(-1, dp(a, 10)));
            block.addView(line, new LinearLayout.LayoutParams(-1, -2));
        }
        root.addView(block, topParams(a, 8));
    }

    private static void addActions(Activity a, LinearLayout root, JSONArray actions) {
        for (int i = 0; i < Math.min(actions.length(), 3); i++) {
            JSONObject action = actions.optJSONObject(i);
            if (action == null) continue;
            LinearLayout box = column(a, 14, 13, 14, 13);
            box.setBackground(round(a, PANEL, LINE, 6));
            TextView title = text(a, string(action, "title", "점검 항목"), 14, true, INK);
            box.addView(title, new LinearLayout.LayoutParams(-1, -2));
            String body = string(action, "body", "").trim();
            if (!body.isEmpty()) {
                TextView detail = text(a, body, 13, false, MUTED);
                detail.setPadding(0, dp(a, 5), 0, 0);
                box.addView(detail, new LinearLayout.LayoutParams(-1, -2));
            }
            root.addView(box, topParams(a, 8));
        }
    }

    private static void addDetails(Activity a, LinearLayout root, String analysis) {
        LinearLayout box = column(a, 14, 12, 14, 12);
        box.setBackground(round(a, PANEL, LINE, 6));
        TextView toggle = text(a, "전문 분석 펼치기", 14, true, INK);
        toggle.setMinHeight(dp(a, 48));
        toggle.setGravity(Gravity.CENTER_VERTICAL);
        toggle.setFocusable(true);
        toggle.setClickable(true);
        toggle.setContentDescription("전문 분석 펼치기");
        TextView body = text(a, analysis, 13, false, MUTED);
        body.setPadding(0, dp(a, 10), 0, 0);
        body.setVisibility(View.GONE);
        toggle.setOnClickListener(v -> {
            boolean open = body.getVisibility() == View.VISIBLE;
            body.setVisibility(open ? View.GONE : View.VISIBLE);
            toggle.setText(open ? "전문 분석 펼치기" : "전문 분석 접기");
            toggle.setContentDescription(open ? "전문 분석 펼치기" : "전문 분석 접기");
        });
        box.addView(toggle, new LinearLayout.LayoutParams(-1, -2));
        box.addView(body, new LinearLayout.LayoutParams(-1, -2));
        root.addView(box, topParams(a, 8));
    }

    private static View card(Activity a, String title, String subtitle) {
        LinearLayout box = column(a, 16, 14, 16, 14);
        box.setBackground(round(a, PANEL, LINE, 6));
        TextView heading = text(a, title, 18, true, INK);
        box.addView(heading, new LinearLayout.LayoutParams(-1, -2));
        if (!subtitle.isEmpty()) {
            TextView sub = text(a, subtitle, 12, false, MUTED);
            sub.setPadding(0, dp(a, 5), 0, 0);
            box.addView(sub, new LinearLayout.LayoutParams(-1, -2));
        }
        return box;
    }

    private static void addHeading(Activity a, LinearLayout root, String title) {
        TextView heading = text(a, title, 15, true, INK);
        root.addView(heading, topParams(a, 18));
    }

    private static String periodLabel(JSONObject data) {
        JSONObject period = data.optJSONObject("period");
        if (period == null) return "계산된 데이터만 표시합니다";
        String start = string(period, "start", "");
        String end = string(period, "end", "");
        if (start.isEmpty() || end.isEmpty() || start.compareTo(end) > 0) return "기간 정보 확인 필요";
        return start.equals(end) ? start + " 기준" : start + " ~ " + end + " 기준";
    }

    private static boolean hasUsableComparisonPeriod(JSONObject data) {
        JSONObject current = data.optJSONObject("period");
        JSONObject previous = data.optJSONObject("comparison_period");
        if (current == null || previous == null) return false;
        String currentStart = string(current, "start", "");
        String currentEnd = string(current, "end", "");
        String previousStart = string(previous, "start", "");
        String previousEnd = string(previous, "end", "");
        return !currentStart.isEmpty() && !currentEnd.isEmpty() && !previousStart.isEmpty() && !previousEnd.isEmpty()
            && currentStart.compareTo(currentEnd) <= 0 && previousStart.compareTo(previousEnd) <= 0;
    }

    private static String displayValue(JSONObject object) {
        double value = finiteOrNaN(object, "value");
        if (Double.isNaN(value)) return "미집계";
        String prefix = string(object, "currency", "");
        return prefix.isEmpty() ? NUMBER.format(value) + suffix(object) : prefix + " " + NUMBER.format(value) + (prefix.equals(string(object, "unit", "")) ? "" : suffix(object));
    }

    private static String displayChannelValue(JSONObject object) {
        double value = finiteOrNaN(object, "value");
        return Double.isNaN(value) ? "미집계" : NUMBER.format(value) + suffix(object);
    }

    private static String suffix(JSONObject object) {
        String unit = string(object, "unit", "");
        return unit.isEmpty() ? "" : " " + unit;
    }

    private static String signed(double value) {
        return (value > 0 ? "+" : "") + NUMBER.format(value);
    }

    private static double finiteOrNaN(JSONObject object, String key) {
        if (object == null || object.isNull(key)) return Double.NaN;
        double value = object.optDouble(key, Double.NaN);
        return Double.isFinite(value) ? value : Double.NaN;
    }

    private static boolean isFinite(JSONObject object, String key) {
        return !Double.isNaN(finiteOrNaN(object, key));
    }

    private static String string(JSONObject object, String key, String fallback) {
        if (object == null || object.isNull(key)) return fallback;
        String value = object.optString(key, fallback);
        return value == null ? fallback : value;
    }

    private static LinearLayout column(Activity a, int l, int t, int r, int b) {
        LinearLayout view = new LinearLayout(a);
        view.setOrientation(LinearLayout.VERTICAL);
        view.setPadding(dp(a, l), dp(a, t), dp(a, r), dp(a, b));
        return view;
    }

    private static TextView text(Activity a, String value, float size, boolean bold, int color) {
        TextView view = new TextView(a);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        view.setTypeface(android.graphics.Typeface.DEFAULT, bold ? android.graphics.Typeface.BOLD : android.graphics.Typeface.NORMAL);
        view.setIncludeFontPadding(true);
        return view;
    }

    private static void addDivider(Activity a, LinearLayout parent) {
        View divider = new View(a);
        divider.setBackgroundColor(LINE);
        parent.addView(divider, new LinearLayout.LayoutParams(-1, dp(a, 1)));
    }

    private static LinearLayout.LayoutParams matchParams(Activity a, int top) {
        return topParams(a, top);
    }

    private static LinearLayout.LayoutParams topParams(Activity a, int top) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.topMargin = dp(a, top);
        return params;
    }

    private static int dp(Activity a, int value) {
        return Math.round(value * a.getResources().getDisplayMetrics().density);
    }

    private static GradientDrawable round(Activity a, int fill, int stroke, int radiusDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(fill);
        drawable.setCornerRadius(dp(a, radiusDp));
        drawable.setStroke(1, stroke);
        return drawable;
    }

    private static final class BarTrack extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final double value;
        private final double max;

        BarTrack(Activity a, double value, double max) {
            super(a);
            this.value = value;
            this.max = max;
            setLayerType(View.LAYER_TYPE_SOFTWARE, null);
        }

        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            float radius = getHeight() / 2f;
            paint.setColor(Color.rgb(237, 240, 242));
            canvas.drawRoundRect(0, 0, getWidth(), getHeight(), radius, radius, paint);
            if (!Double.isNaN(value) && value >= 0 && max > 0) {
                float width = (float) Math.min(getWidth(), getWidth() * (value / max));
                paint.setColor(CONSULT);
                canvas.drawRoundRect(0, 0, width, getHeight(), radius, radius, paint);
            }
        }
    }
}
