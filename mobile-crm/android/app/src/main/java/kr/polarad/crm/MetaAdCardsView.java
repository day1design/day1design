package kr.polarad.crm;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.text.NumberFormat;
import java.util.Base64;
import java.util.Locale;

final class MetaAdCardsView {
    private static final int INK = Color.rgb(35, 35, 31);
    private static final int MUTED = Color.rgb(102, 107, 112);
    private static final int LINE = Color.rgb(229, 223, 211);
    private static final int GOOD = Color.rgb(53, 99, 78);
    private static final int GOOD_BG = Color.rgb(237, 243, 238);
    private static final int UNKNOWN_BG = Color.rgb(238, 240, 241);
    private static final int BRAND = Color.rgb(249, 173, 54);

    private MetaAdCardsView() { }

    static View create(Activity activity, JSONObject analytics) {
        return create(activity, analytics, null, 0, null);
    }

    static View create(Activity activity, JSONObject analytics, ApiClient api, int imageGeneration, Runnable loadMore) {
        JSONObject payload = analytics == null ? null : analytics.optJSONObject("metaAdCards");
        if (payload == null && analytics != null) payload = analytics.optJSONObject("meta_ad_cards");
        if (payload == null) return message(activity, "소재별 광고 보고서가 아직 연결되지 않았습니다.");
        final JSONObject cardPayload = payload;
        if (!payload.optBoolean("available", false)) {
            String reason = payload.optString("reason", "").trim();
            return message(activity, reason.isEmpty() ? "선택 기간의 소재별 광고 데이터가 없습니다." : "소재별 광고 데이터를 확인할 수 없습니다.\n" + reason);
        }
        JSONArray cards = payload.optJSONArray("cards");
        if (cards == null || cards.length() == 0) return message(activity, "선택 기간의 소재별 광고 기록이 없습니다.");
        MetricMaxima maxima = MetricMaxima.from(cards);

        LinearLayout section = column(activity);
        TextView heading = text(activity, "광고 소재별 성과", 16, true, INK);
        section.addView(heading);
        section.addView(text(activity, period(payload), 12, false, MUTED), top(activity, 5));
        section.addView(text(activity, "이미지·KPI·일별 흐름을 소재별로 확인합니다.", 12, false, MUTED), top(activity, 3));

        LinearLayout controls = row(activity);
        TextView previous = pill(activity, "이전 소재", MUTED, UNKNOWN_BG);
        TextView position = text(activity, "1 / " + cards.length(), 12, true, MUTED);
        TextView next = pill(activity, "다음 소재", MUTED, UNKNOWN_BG);
        controls.addView(previous, weight(activity));
        controls.addView(position, weight(activity));
        controls.addView(next, weight(activity));
        section.addView(controls, top(activity, 10));
        if (cards.length() > 1) section.addView(text(activity, "좌우로 밀어 다른 소재 보기", 11, false, MUTED), top(activity, 5));

        HorizontalScrollView scroll = new HorizontalScrollView(activity);
        scroll.setHorizontalScrollBarEnabled(false);
        scroll.setFillViewport(false);
        LinearLayout track = row(activity);
        track.setGravity(Gravity.TOP);
        int cardWidth = Math.max(dp(activity, 280), activity.getResources().getDisplayMetrics().widthPixels - dp(activity, 40));
        for (int i = 0; i < cards.length(); i++) {
            JSONObject card = cards.optJSONObject(i);
            if (card == null) continue;
            View view = card(activity, card, i + 1, api, imageGeneration, maxima);
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(cardWidth, -2);
            if (i > 0) params.leftMargin = dp(activity, 10);
            track.addView(view, params);
        }
        scroll.addView(track, new HorizontalScrollView.LayoutParams(-2, -2));
        section.addView(scroll, top(activity, 8));
        if (payload.optBoolean("limitReached", false)) section.addView(text(activity, "표시 한도에 도달했습니다. 기간을 좁혀 더 자세히 확인하세요.", 11, false, MUTED), top(activity, 8));
        int count = track.getChildCount();
        final int[] selected = {0};
        Runnable move = () -> {
            if (count == 0) return;
            int target = Math.max(0, Math.min(count - 1, selected[0]));
            selected[0] = target;
            View child = track.getChildAt(target);
            loadImage(child);
            if (target + 1 < count) loadImage(track.getChildAt(target + 1));
            scroll.smoothScrollTo(child.getLeft(), 0);
            position.setText((target + 1) + " / " + count);
            evictOutside(track, target);
        };
        final Runnable settle = () -> {
            if (count == 0) return;
            selected[0] = nearestChild(track, scroll.getScrollX());
            move.run();
        };
        scroll.setOnScrollChangeListener((v, scrollX, ignoredY, ignoredOldX, ignoredOldY) -> {
            if (count == 0) return;
            int target = nearestChild(track, scrollX);
            selected[0] = target;
            position.setText((target + 1) + " / " + count);
            loadImage(track.getChildAt(target));
            if (target + 1 < count) loadImage(track.getChildAt(target + 1));
            evictOutside(track, target);
            scroll.removeCallbacks(settle);
            scroll.postDelayed(settle, 150L);
        });
        scroll.setOnTouchListener((view, event) -> {
            if (event.getActionMasked() == MotionEvent.ACTION_UP && count > 0) {
                selected[0] = nearestChild(track, scroll.getScrollX());
                move.run();
            }
            return false;
        });
        previous.setOnClickListener(v -> { selected[0]--; move.run(); });
        next.setOnClickListener(v -> {
            if (selected[0] >= count - 1 && loadMore != null && payloadNextCursor(cardPayload)) loadMore.run();
            else { selected[0]++; move.run(); }
        });
        return section;
    }

    private static int nearestChild(LinearLayout track, int scrollX) {
        int nearest = 0;
        int distance = Integer.MAX_VALUE;
        for (int i = 0; i < track.getChildCount(); i++) {
            int next = Math.abs(track.getChildAt(i).getLeft() - scrollX);
            if (next < distance) { distance = next; nearest = i; }
        }
        return nearest;
    }

    private static boolean payloadNextCursor(JSONObject payload) {
        return !value(payload, "nextCursor", "next_cursor").isEmpty();
    }

    private static void loadImage(View card) {
        if (card != null && card.getTag() instanceof CardImageState) ((CardImageState) card.getTag()).load();
    }

    private static void evictOutside(LinearLayout track, int selected) {
        for (int i = 0; i < track.getChildCount(); i++) {
            if (i < selected - 1 || i > selected + 1) {
                View child = track.getChildAt(i);
                if (child.getTag() instanceof CardImageState) ((CardImageState) child.getTag()).evict();
            }
        }
    }

    private static View card(Activity activity, JSONObject card, int number, ApiClient api, int imageGeneration, MetricMaxima maxima) {
        LinearLayout box = column(activity);
        box.setPadding(dp(activity, 14), dp(activity, 14), dp(activity, 14), dp(activity, 14));
        GradientDrawable background = new GradientDrawable();
        background.setColor(Color.WHITE);
        background.setStroke(dp(activity, 1), LINE);
        background.setCornerRadius(dp(activity, 12));
        box.setBackground(background);

        JSONObject creative = card.optJSONObject("creative");
        if (creative == null) creative = new JSONObject();
        View image = image(activity, creative, api, imageGeneration, number <= 2);
        box.setTag(image.getTag());
        box.addView(image, new LinearLayout.LayoutParams(-1, dp(activity, 144)));
        LinearLayout titleRow = row(activity);
        titleRow.addView(text(activity, "소재 " + number, 13, true, INK), weight(activity));
        String status = card.optString("status", "").trim();
        if (!status.isEmpty()) titleRow.addView(pill(activity, status, GOOD, GOOD_BG));
        box.addView(titleRow, top(activity, 10));
        String hierarchy = hierarchy(card);
        if (!hierarchy.isEmpty()) box.addView(text(activity, hierarchy, 12, false, MUTED), top(activity, 4));
        String name = card.optString("adName", "").trim();
        if (!name.isEmpty()) box.addView(text(activity, name, 15, true, INK), top(activity, 4));
        addMetrics(box, activity, card.optJSONObject("metrics"), maxima);
        JSONArray daily = card.optJSONArray("daily");
        if (daily != null && daily.length() > 0) {
            box.addView(text(activity, "일별 성과", 13, true, INK), top(activity, 12));
            box.addView(new DailyChart(activity, daily), new LinearLayout.LayoutParams(-1, dp(activity, 168)));
        } else {
            box.addView(text(activity, "일별 성과는 확인할 수 없습니다.", 12, false, MUTED), top(activity, 10));
        }
        return box;
    }

    private static void addMetrics(LinearLayout box, Activity activity, JSONObject metrics, MetricMaxima maxima) {
        if (metrics == null) metrics = new JSONObject();
        LinearLayout grid = row(activity);
        grid.addView(metricCell(activity, metrics, maxima, "광고비", "spend", money(metrics, "spend")), weight(activity));
        grid.addView(metricCell(activity, metrics, maxima, "리드", "leads", number(metrics, "leads", "건")), weight(activity));
        grid.addView(metricCell(activity, metrics, maxima, "CPL", "cpl", ratio(metrics, "cpl")), weight(activity));
        box.addView(grid, top(activity, 12));
        LinearLayout second = row(activity);
        second.addView(metricCell(activity, metrics, maxima, "CPC", "cpc", ratio(metrics, "cpc")), weight(activity));
        second.addView(metricCell(activity, metrics, maxima, "CPM", "cpm", ratio(metrics, "cpm")), weight(activity));
        second.addView(metricCell(activity, metrics, maxima, "CTR", "ctr", percent(metrics, "ctr")), weight(activity));
        box.addView(second, top(activity, 6));
    }

    private static LinearLayout metricCell(Activity activity, JSONObject metrics, MetricMaxima maxima, String label, String key, String display) {
        LinearLayout cell = column(activity);
        cell.addView(metric(activity, label, display));
        Double raw = numeric(metrics, key);
        if (raw != null && maxima.has(key)) cell.addView(metricBar(activity, label, raw, maxima.max(key)), top(activity, 2));
        return cell;
    }

    private static View metricBar(Activity activity, String label, double value, double maximum) {
        FrameLayout track = new FrameLayout(activity);
        track.setBackgroundColor(LINE);
        track.setContentDescription(label + " 상대 비교 " + format(value) + " / " + format(maximum));
        FrameLayout.LayoutParams fill = new FrameLayout.LayoutParams(-1, dp(activity, 3));
        fill.width = maximum <= 0 ? 0 : (int) Math.round(dp(activity, 100) * Math.max(0, Math.min(1, value / maximum)));
        View bar = new View(activity);
        bar.setBackgroundColor(BRAND);
        track.addView(bar, fill);
        return track;
    }

    private static View image(Activity activity, JSONObject creative, ApiClient api, int imageGeneration, boolean loadNow) {
        FrameLayout frame = new FrameLayout(activity);
        frame.setBackgroundColor(Color.rgb(247, 246, 242));
        String encoded = value(creative, "imageBase64", "thumbnailBase64", "imageBytesBase64", "thumbnailBytesBase64");
        if (!encoded.isEmpty()) {
            try {
                byte[] bytes = Base64.getDecoder().decode(encoded.getBytes(StandardCharsets.UTF_8));
                Bitmap bitmap = decodeImageBytes(bytes);
                if (bitmap != null) {
                    ImageView view = new ImageView(activity);
                    view.setImageBitmap(bitmap);
                    view.setScaleType(ImageView.ScaleType.FIT_CENTER);
                    frame.addView(view, new FrameLayout.LayoutParams(-1, -1));
                    return frame;
                }
            } catch (IllegalArgumentException ignored) { }
        }
        LinearLayout placeholder = column(activity);
        placeholder.setGravity(Gravity.CENTER);
        String type = value(creative, "type");
        String availability = value(creative, "availability", "assetAvailability", "mediaAvailability", "media_availability");
        placeholder.addView(text(activity, type.isEmpty() ? "소재 이미지" : type + " 소재", 13, true, MUTED));
        placeholder.addView(text(activity, "inactive".equalsIgnoreCase(availability) || "cleaned".equalsIgnoreCase(availability)
                ? "광고 중지 · 소재 정리됨" : "인증된 이미지가 준비되면 표시됩니다.", 11, false, MUTED), top(activity, 4));
        frame.addView(placeholder, new FrameLayout.LayoutParams(-1, -1));
        String path = value(creative, "imagePath", "thumbnailPath", "image_path", "thumbnail_path");
        if (path.isEmpty()) path = value(creative.optJSONObject("thumbnailRef"), "path", "imagePath", "thumbnailPath", "image_path", "thumbnail_path");
        final String requestPath = path;
        if (api != null && requestPath.startsWith("/api/mobile/") && !requestPath.contains("//")) {
            final CardImageState state = new CardImageState(frame, placeholder);
            state.loader = () -> {
                if (state.requested) return;
                state.requested = true;
                final int callbackGeneration = ++state.requestGeneration;
                api.callBytes(requestPath, (bytes, status, error) -> activity.runOnUiThread(() -> {
                if (imageGeneration <= 0 || callbackGeneration != state.requestGeneration || !state.requested || !frame.isShown() || status < 200 || status >= 300 || bytes == null || bytes.length == 0) return;
                Bitmap bitmap = decodeImageBytes(bytes);
                if (bitmap == null) return;
                ImageView view = new ImageView(activity);
                view.setImageBitmap(bitmap);
                view.setScaleType(ImageView.ScaleType.FIT_CENTER);
                state.bitmap = bitmap;
                state.image = view;
                frame.removeAllViews();
                frame.addView(view, new FrameLayout.LayoutParams(-1, -1));
                }));
            };
            frame.setTag(state);
            if (loadNow) state.load();
        }
        return frame;
    }

    private static final class CardImageState {
        final FrameLayout frame;
        final View placeholder;
        Runnable loader;
        ImageView image;
            Bitmap bitmap;
        boolean requested;
        int requestGeneration;
        CardImageState(FrameLayout frame, View placeholder) { this.frame = frame; this.placeholder = placeholder; }
        void load() { if (loader != null) loader.run(); }
        void evict() {
            requestGeneration++;
            if (bitmap != null && !bitmap.isRecycled()) bitmap.recycle();
            bitmap = null;
            image = null;
            requested = false;
            frame.removeAllViews();
            frame.addView(placeholder, new FrameLayout.LayoutParams(-1, -1));
        }
    }

    private static final class MetricMaxima {
        private final JSONObject values = new JSONObject();
        static MetricMaxima from(JSONArray cards) {
            MetricMaxima maxima = new MetricMaxima();
            for (int i = 0; i < cards.length(); i++) {
                JSONObject card = cards.optJSONObject(i);
                JSONObject metrics = card == null ? null : card.optJSONObject("metrics");
                if (metrics == null) continue;
                for (String key : new String[]{"spend", "leads", "cpl", "cpc", "cpm", "ctr"}) {
                    Double value = numeric(metrics, key);
                    if (value == null) continue;
                    try { maxima.values.put(key, Math.max(maxima.values.optDouble(key, 0), value)); } catch (Exception ignored) { }
                }
            }
            return maxima;
        }
        boolean has(String key) { return values.has(key) && !values.isNull(key); }
        double max(String key) { return values.optDouble(key, 0); }
    }

    private static Bitmap decodeImageBytes(byte[] bytes) {
        Bitmap bitmap = decodeBitmap(bytes);
        if (bitmap != null) return bitmap;
        try {
            JSONObject envelope = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
            String encoded = envelope.optString("base64", "");
            if (encoded.isEmpty() || encoded.length() > 2796204) return null;
            byte[] decoded = Base64.getDecoder().decode(encoded);
            return decoded.length > 2 * 1024 * 1024 ? null : decodeBitmap(decoded);
        } catch (Exception ignored) { return null; }
    }

    private static Bitmap decodeBitmap(byte[] bytes) {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0 || (long) bounds.outWidth * bounds.outHeight > 4000000L) return null;
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = Math.max(1, (int) Math.ceil(Math.sqrt((bounds.outWidth * (double) bounds.outHeight) / 4000000d)));
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
    }

    private static TextView metric(Activity activity, String label, String value) {
        TextView wrapper = text(activity, label + "\n" + value, 11, false, INK);
        wrapper.setPadding(dp(activity, 6), dp(activity, 7), dp(activity, 6), dp(activity, 7));
        return wrapper;
    }

    private static final class DailyChart extends View {
        private final JSONArray points;
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        DailyChart(Activity activity, JSONArray points) { super(activity); this.points = points; setContentDescription("소재별 일별 광고비와 리드 그래프"); }
        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            float density = getResources().getDisplayMetrics().density;
            float w = getWidth(), h = getHeight(), left = 58 * density, right = w - 8 * density, top = 24 * density, bottom = h - 34 * density;
            paint.setColor(LINE); paint.setStrokeWidth(1); canvas.drawLine(left, bottom, right, bottom, paint);
            double maxSpend = max("spend"), maxLeads = max("leads");
            paint.setTextSize(10 * density); paint.setColor(BRAND);
            boolean hasSpendValue = hasValue("spend"), hasLeadsValue = hasValue("leads");
            if (!hasSpendValue && !hasLeadsValue) {
                paint.setColor(MUTED);
                canvas.drawText("일별 성과 데이터 없음", left, (top + bottom) / 2, paint);
                return;
            }
            canvas.drawText("광고비 " + format(maxSpend), 4 * density, 12 * density, paint);
            paint.setColor(GOOD); canvas.drawText("리드 " + format(maxLeads) + "건", 4 * density, h - 8 * density, paint);
            Path spend = new Path(), leads = new Path(); boolean hasSpend = false, hasLeads = false;
            for (int i = 0; i < points.length(); i++) {
                JSONObject p = points.optJSONObject(i); if (p == null) continue;
                float x = points.length() == 1 ? (left + right) / 2 : left + (right - left) * i / (points.length() - 1);
                Double s = numeric(p, "spend"), l = numeric(p, "leads");
                if (s != null) { float y = bottom - (float) (s / Math.max(1, maxSpend)) * (bottom - top); if (!hasSpend) { spend.moveTo(x, y); hasSpend = true; } else spend.lineTo(x, y); }
                else hasSpend = false;
                if (l != null) { float y = bottom - (float) (l / Math.max(1, maxLeads)) * (bottom - top); if (!hasLeads) { leads.moveTo(x, y); hasLeads = true; } else leads.lineTo(x, y); }
                else hasLeads = false;
            }
            paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(2.5f);
            if (hasValue("spend")) { paint.setColor(BRAND); canvas.drawPath(spend, paint); drawMarkers(canvas, "spend", BRAND, maxSpend, left, right, top, bottom, density); }
            if (hasValue("leads")) { paint.setColor(GOOD); canvas.drawPath(leads, paint); drawMarkers(canvas, "leads", GOOD, maxLeads, left, right, top, bottom, density); }
            paint.setStyle(Paint.Style.FILL); paint.setTextSize(10 * density); paint.setColor(MUTED);
            String first = date(0), last = date(points.length() - 1);
            canvas.drawText(first, left, h - 8 * density, paint);
            if (!last.equals(first)) canvas.drawText(last, Math.max(left + 4 * density, right - paint.measureText(last)), h - 8 * density, paint);
        }
        private double max(String key) { double max = 0; for (int i = 0; i < points.length(); i++) { Double n = numeric(points.optJSONObject(i), key); if (n != null) max = Math.max(max, n); } return max; }
        private boolean hasValue(String key) { for (int i = 0; i < points.length(); i++) if (numeric(points.optJSONObject(i), key) != null) return true; return false; }
        private void drawMarkers(Canvas canvas, String key, int color, double maximum, float left, float right, float top, float bottom, float density) {
            paint.setStyle(Paint.Style.FILL); paint.setColor(color);
            for (int i = 0; i < points.length(); i++) {
                Double n = numeric(points.optJSONObject(i), key); if (n == null) continue;
                float x = points.length() == 1 ? (left + right) / 2 : left + (right - left) * i / (points.length() - 1);
                float y = bottom - (float) (n / Math.max(1, maximum)) * (bottom - top);
                canvas.drawCircle(x, y, 4 * density, paint);
            }
            paint.setStyle(Paint.Style.STROKE);
        }
        private String date(int index) { JSONObject p = points.optJSONObject(Math.max(0, index)); return p == null ? "" : p.optString("date", ""); }
    }

    private static String period(JSONObject payload) { JSONObject period = payload.optJSONObject("period"); return period == null ? "선택 기간 · KST" : period.optString("start", "") + " ~ " + period.optString("end", "") + " · " + period.optString("timezone", "KST"); }
    private static String hierarchy(JSONObject card) { String campaign = value(card.optJSONObject("campaign"), "name"); String set = value(card.optJSONObject("adset"), "name"); return join(campaign, set); }
    private static String join(String... values) { StringBuilder b = new StringBuilder(); for (String value : values) if (value != null && !value.trim().isEmpty()) { if (b.length() > 0) b.append(" · "); b.append(value.trim()); } return b.toString(); }
    private static String value(JSONObject o, String... keys) { if (o == null) return ""; for (String key : keys) { String value = o.optString(key, "").trim(); if (!value.isEmpty()) return value; } return ""; }
    private static Double numeric(JSONObject o, String key) {
        if (o == null || !o.has(key) || o.isNull(key)) return null;
        Object raw = o.opt(key);
        if (raw instanceof JSONObject) raw = ((JSONObject) raw).opt("value");
        double n = raw instanceof Number ? ((Number) raw).doubleValue() : o.optDouble(key, Double.NaN);
        return Double.isFinite(n) ? n : null;
    }
    private static String number(JSONObject o, String key, String unit) { Double n = numeric(o, key); return n == null ? "확인할 수 없음" : format(n) + unit; }
    private static String money(JSONObject o, String key) { Double n = numeric(o, key); if (n == null) return "확인할 수 없음"; String currency = value(o, "currency", "currencyCode"); return ("KRW".equalsIgnoreCase(currency) || currency.isEmpty() ? "₩" : currency + " ") + format(n); }
    private static String ratio(JSONObject o, String key) { Double n = numeric(o, key); return n == null ? "확인할 수 없음" : format(n); }
    private static String percent(JSONObject o, String key) { Double n = numeric(o, key); return n == null ? "확인할 수 없음" : format(n * (n <= 1 ? 100 : 1)) + "%"; }
    private static String format(double n) { return NumberFormat.getNumberInstance(Locale.KOREA).format(Math.round(n * 100.0) / 100.0); }

    private static TextView message(Activity activity, String value) { return text(activity, value, 12, false, MUTED); }
    private static LinearLayout column(Activity activity) { LinearLayout v = new LinearLayout(activity); v.setOrientation(LinearLayout.VERTICAL); return v; }
    private static LinearLayout row(Activity activity) { LinearLayout v = new LinearLayout(activity); v.setOrientation(LinearLayout.HORIZONTAL); v.setGravity(Gravity.CENTER_VERTICAL); return v; }
    private static TextView text(Activity activity, String value, float size, boolean bold, int color) { TextView v = new TextView(activity); v.setText(value == null ? "" : value); v.setTextSize(size); v.setTextColor(color); if (bold) v.setTypeface(Typeface.DEFAULT, Typeface.BOLD); return v; }
    private static TextView pill(Activity activity, String value, int color, int background) { TextView v = text(activity, value, 11, true, color); v.setGravity(Gravity.CENTER); v.setPadding(dp(activity, 8), dp(activity, 5), dp(activity, 8), dp(activity, 5)); GradientDrawable d = new GradientDrawable(); d.setColor(background); d.setCornerRadius(dp(activity, 20)); v.setBackground(d); return v; }
    private static LinearLayout.LayoutParams top(Activity activity, int margin) { LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2); p.topMargin = dp(activity, margin); return p; }
    private static LinearLayout.LayoutParams weight(Activity activity) { return new LinearLayout.LayoutParams(0, -2, 1); }
    private static int dp(Activity activity, int value) { return Math.round(value * activity.getResources().getDisplayMetrics().density); }
    private static GradientDrawable round(Activity activity, int color, int radius) { GradientDrawable d = new GradientDrawable(); d.setColor(color); d.setCornerRadius(dp(activity, radius)); return d; }
}
