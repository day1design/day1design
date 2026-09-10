package kr.polarad.crm;

import android.app.Activity;
import android.app.Dialog;
import android.app.DatePickerDialog;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.LocalDate;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.HashSet;
import java.util.Set;
import java.util.function.IntConsumer;

final class AnalyticsScreen {
    private static final int INK = Color.rgb(35, 35, 31);
    private static final int MUTED = Color.rgb(104, 102, 95);
    private static final int PAPER = Color.rgb(250, 249, 246);
    private static final int PANEL = Color.WHITE;
    private static final int LINE = Color.rgb(229, 223, 211);
    private static final int GOOD = Color.rgb(53, 99, 78);
    private static final int ACTION = Color.rgb(148, 96, 25);
    private static final DateTimeFormatter DATE = DateTimeFormatter.ISO_LOCAL_DATE;
    private static final long BRIEF_REFRESH_MIN_INTERVAL_MS = 60_000L;

    private AnalyticsScreen() { }

    static View create(Activity activity, ApiClient api, IntConsumer authFailure) {
        return create(activity, api, authFailure, "hub");
    }

    static View create(Activity activity, ApiClient api, IntConsumer authFailure, String initialPage) {
        return create(activity, api, authFailure, initialPage, null);
    }

    static View create(Activity activity, ApiClient api, IntConsumer authFailure, String initialPage, Runnable openCustomers) {
        return create(activity, api, authFailure, initialPage, openCustomers, null);
    }

    static View create(Activity activity, ApiClient api, IntConsumer authFailure, String initialPage, Runnable openCustomers, Runnable exitAnalytics) {
        Controller controller = new Controller(activity, api, authFailure);
        controller.openCustomers = openCustomers;
        controller.exitAnalytics = exitAnalytics;
        controller.page = initialPage;
        View view = controller.start();
        view.setTag(controller);
        return view;
    }

    static boolean handleBack(View view) {
        Object tag = view == null ? null : view.getTag();
        return tag instanceof Controller && ((Controller) tag).handleBack();
    }

    static void refreshBriefingOnResume(View view) {
        Object tag = view == null ? null : view.getTag();
        if (tag instanceof Controller) ((Controller) tag).refreshBriefingIfVisible(false);
    }

    private static final class Controller {
        final Activity activity;
        final ApiClient api;
        final IntConsumer authFailure;
        final LocalDate today = LocalDate.now(ZoneId.of("Asia/Seoul"));
        final LocalDate monthStart = today.withDayOfMonth(1);
        final LocalDate monthEnd = today;
        String page = "hub";
        Runnable openCustomers;
        Runnable exitAnalytics;
        String selectedSource = "";
        String start = today.minusDays(6).format(DATE);
        String end = today.format(DATE);
        int rangeKind = 7;
        int generation;
        JSONObject analytics;
        JSONObject metaCardsPayload;
        String metaNextCursor = "";
        boolean metaCardsLoading;
        boolean metaCardsError;
        int metaCardsGeneration;
        int metaCardsPageCount;
        int metaCardsTotal;
        final Set<String> metaSeenCursors = new HashSet<>();
        JSONObject notifications;
        JSONArray briefingRows;
        String briefingNextCursor = "";
        boolean briefingHasMore;
        boolean briefingLoading;
        boolean briefingError;
        JSONObject latestBriefing;
        Bitmap latestBriefingImage;
        boolean latestBriefingLoaded;
        boolean latestBriefingLoading;
        boolean latestBriefingError;
        boolean latestBriefingImageError;
        int latestBriefingGeneration;
        long latestBriefingRefreshAt;
        boolean showInactiveSources;
        final LinearLayout host;

        Controller(Activity activity, ApiClient api, IntConsumer authFailure) {
            this.activity = activity;
            this.api = api;
            this.authFailure = authFailure;
            this.host = column();
            this.host.setBackgroundColor(PAPER);
            this.host.addOnAttachStateChangeListener(new View.OnAttachStateChangeListener() {
                @Override public void onViewAttachedToWindow(View v) { }
                @Override public void onViewDetachedFromWindow(View v) {
                    generation++;
                    metaCardsGeneration++;
                }
            });
            int savedRange = activity.getPreferences(Activity.MODE_PRIVATE).getInt("analytics_range", 7);
            if (savedRange == -1) {
                String savedStart = activity.getPreferences(Activity.MODE_PRIVATE).getString("analytics_start", "");
                String savedEnd = activity.getPreferences(Activity.MODE_PRIVATE).getString("analytics_end", "");
                if (validRange(savedStart, savedEnd)) {
                    rangeKind = -1;
                    start = savedStart;
                    end = savedEnd;
                    return;
                }
            }
            rangeKind = savedRange == 0 || savedRange == 30 ? savedRange : 7;
            start = (rangeKind == 0 ? monthStart : today.minusDays(rangeKind - 1L)).format(DATE);
        }

        View start() {
            renderLoading();
            loadAnalytics();
            return host;
        }

        void loadAnalytics() {
            final int request = ++generation;
            api.call("GET", "/api/mobile/analytics?start=" + start + "&end=" + end, null,
                (body, status, error) -> activity.runOnUiThread(() -> {
                    if (request != generation) return;
                    if (status == 401 || status == 403) {
                        if (authFailure != null) authFailure.accept(status);
                        return;
                    }
                    if (status >= 200 && status < 300) {
                        analytics = body;
                        if ("meta".equals(page) && metaCardsPayload == null && !metaCardsLoading) loadMetaCards(true);
                        render();
                    } else {
                        renderError(message(body, error, "분석 데이터를 불러오지 못했습니다."));
                    }
                }));
        }

        void loadMetaCards(boolean reset) {
            final int request = ++metaCardsGeneration;
            if (reset) {
                metaCardsPayload = null;
                metaNextCursor = "";
                metaCardsPageCount = 0;
                metaCardsTotal = 0;
                metaSeenCursors.clear();
                if (analytics != null) analytics.remove("metaAdCards");
            }
            if (!reset && (metaCardsPageCount >= 5 || metaCardsTotal >= 100 || metaNextCursor.isEmpty() || !metaSeenCursors.add(metaNextCursor))) {
                metaNextCursor = "";
                metaCardsLoading = false;
                try { if (metaCardsPayload != null) metaCardsPayload.put("limitReached", true); } catch (Exception ignored) { }
                render();
                return;
            }
            metaCardsLoading = true;
            metaCardsError = false;
            final String requestedCursor = reset ? "" : metaNextCursor;
            String path = "/api/mobile/meta/ads?start=" + Uri.encode(start) + "&end=" + Uri.encode(end) + "&limit=20";
            if (!reset && !metaNextCursor.isEmpty()) path += "&cursor=" + Uri.encode(metaNextCursor);
            api.call("GET", path, null, (body, status, error) -> activity.runOnUiThread(() -> {
                if (request != metaCardsGeneration) return;
                metaCardsLoading = false;
                if (status == 401 || status == 403) {
                    if (authFailure != null) authFailure.accept(status);
                    return;
                }
                if (status < 200 || status >= 300 || body == null) {
                    metaCardsError = true;
                    render();
                    return;
                }
                JSONObject payload = body.optJSONObject("metaAdCards");
                if (payload == null) payload = body.optJSONObject("meta_ad_cards");
                if (payload == null) payload = body.optJSONObject("data");
                if (payload == null) payload = body;
                if (reset || metaCardsPayload == null) metaCardsPayload = payload;
                else mergeMetaCards(payload);
                metaCardsPageCount++;
                metaCardsTotal = Math.min(100, cardCount(metaCardsPayload));
                metaNextCursor = metaCardsPayload.optString("nextCursor", metaCardsPayload.optString("next_cursor", ""));
                if (metaNextCursor.equals(requestedCursor)) metaNextCursor = "";
                try { if (analytics != null) analytics.put("metaAdCards", metaCardsPayload); } catch (Exception ignored) { }
                render();
            }));
        }

        void mergeMetaCards(JSONObject next) {
            JSONArray current = metaCardsPayload.optJSONArray("cards");
            JSONArray added = next.optJSONArray("cards");
            if (current == null || added == null) return;
            for (int i = 0; i < added.length(); i++) {
                JSONObject card = added.optJSONObject(i);
                if (card == null || cardIdExists(current, card.optString("adId", ""))) continue;
                if (current.length() >= 100) break;
                current.put(card);
            }
            try { metaCardsPayload.put("nextCursor", next.optString("nextCursor", next.optString("next_cursor", ""))); } catch (Exception ignored) { }
        }

        int cardCount(JSONObject payload) {
            JSONArray cards = payload == null ? null : payload.optJSONArray("cards");
            return cards == null ? 0 : cards.length();
        }

        boolean cardIdExists(JSONArray cards, String id) {
            if (id.isEmpty()) return false;
            for (int i = 0; i < cards.length(); i++) {
                JSONObject card = cards.optJSONObject(i);
                if (card != null && id.equals(card.optString("adId", ""))) return true;
            }
            return false;
        }

        void loadNextMetaCards() {
            if (metaCardsLoading || metaNextCursor.isEmpty()) return;
            loadMetaCards(false);
        }

        void loadBriefing() {
            final int request = ++generation;
            briefingLoading = true;
            briefingError = false;
            briefingHasMore = false;
            briefingNextCursor = "";
            loadBriefingPage(request, "", new JSONArray());
        }

        void loadBriefingPage(int request, String cursor, JSONArray collected) {
            String path = "/api/mobile/notifications" + (cursor == null || cursor.isEmpty() ? "" : "?cursor=" + Uri.encode(cursor));
            api.call("GET", path, null,
                (body, status, error) -> activity.runOnUiThread(() -> {
                    if (request != generation) return;
                    if (status == 401 || status == 403) {
                        if (authFailure != null) authFailure.accept(status);
                        return;
                    }
                    if (status >= 200 && status < 300) {
                        JSONArray rows = array(body, "notifications");
                        for (int i = 0; i < rows.length(); i++) {
                            JSONObject row = rows.optJSONObject(i);
                            if (row != null) collected.put(row);
                        }
                        String next = body == null || body.isNull("next_cursor") ? "" : body.optString("next_cursor", "");
                        if (!next.isEmpty() && next.equals(cursor)) { briefingLoading=false; briefingError=true; render(); return; }
                        {
                            notifications = new JSONObject();
                            try { notifications.put("notifications", collected); } catch (Exception ignored) { }
                            briefingRows = collected;
                            briefingNextCursor = next;
                            briefingHasMore = !next.isEmpty();
                            briefingLoading = false;
                            render();
                        }
                    } else {
                        briefingLoading = false;
                        briefingError = true;
                        render();
                    }
                }));
        }

        void loadLatestBriefing() {
            latestBriefingRefreshAt = System.currentTimeMillis();
            final int request = ++latestBriefingGeneration;
            latestBriefingLoading = true;
            latestBriefingError = false;
            boolean previousImageError = latestBriefingImageError;
            String knownId = latestBriefing == null ? "" : latestBriefing.optString("id", "").trim();
            if (!knownId.matches("[A-Za-z0-9_-]{1,120}")) knownId = "";
            String knownQuery = knownId.isEmpty() ? "" : "&known_id=" + knownId;
            api.call("GET", "/api/mobile/briefings/latest?start=" + start + "&end=" + end + knownQuery, null,
                (body, status, error) -> activity.runOnUiThread(() -> {
                    if (request != latestBriefingGeneration) return;
                    if (status == 401 || status == 403) {
                        if (authFailure != null) authFailure.accept(status);
                        return;
                    }
                    latestBriefingLoading = false;
                    if (status < 200 || status >= 300 || body == null) {
                        latestBriefingError = true;
                        render();
                        return;
                    }
                    String previousId = latestBriefing == null ? "" : latestBriefing.optString("id", "").trim();
                    String nextId = body.optString("id", "").trim();
                    boolean sameImage = !previousId.isEmpty()
                        && previousId.equals(nextId)
                        && body.optBoolean("available", false);
                    if (!sameImage) {
                        latestBriefingImage = null;
                        latestBriefingImageError = false;
                    } else {
                        latestBriefingImageError = previousImageError;
                    }
                    if (BriefingRefreshPolicy.retainUnchanged(previousId, nextId, body.optBoolean("unchanged", false), latestBriefing != null)) {
                        latestBriefingLoaded = true;
                        if (latestBriefing != null && latestBriefing.optBoolean("available", false)
                            && BriefingRefreshPolicy.shouldLoadImage(true, latestBriefingImage == null, latestBriefingImageError)) {
                            loadLatestBriefingImage(request);
                        }
                        render();
                        return;
                    }
                    latestBriefing = body;
                    latestBriefingLoaded = true;
                    if (BriefingRefreshPolicy.shouldLoadImage(body.optBoolean("available", false), latestBriefingImage == null, latestBriefingImageError)) loadLatestBriefingImage(request);
                    render();
                }));
        }

        void loadLatestBriefingImage(int request) {
            String id = latestBriefing == null ? "" : latestBriefing.optString("id", "").trim();
            String imagePath = latestBriefing == null ? "" : latestBriefing.optString("image_path", "").trim();
            if (id.isEmpty() || !imagePath.startsWith("/api/mobile/briefings/")) {
                latestBriefingImageError = true;
                return;
            }
            api.call("GET", imagePath, null,
                (body, status, error) -> activity.runOnUiThread(() -> {
                    if (request != latestBriefingGeneration) return;
                    if (status == 401 || status == 403) {
                        if (authFailure != null) authFailure.accept(status);
                        return;
                    }
                    if (status < 200 || status >= 300 || body == null) {
                        latestBriefingImageError = true;
                        render();
                        return;
                    }
                    String encoded = body.optString("base64", "");
                    if (encoded.isEmpty() || encoded.length() > 2796204) {
                        latestBriefingImageError = true;
                        render();
                        return;
                    }
                    try {
                        byte[] bytes = Base64.getDecoder().decode(encoded);
                        if (bytes.length == 0 || bytes.length > 2 * 1024 * 1024) throw new IllegalArgumentException("image too large");
                        BitmapFactory.Options bounds = new BitmapFactory.Options();
                        bounds.inJustDecodeBounds = true;
                        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
                        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw new IllegalArgumentException("invalid image");
                        BitmapFactory.Options options = new BitmapFactory.Options();
                        options.inSampleSize = Math.max(1, (int)Math.ceil(Math.sqrt((bounds.outWidth * (double)bounds.outHeight) / 4000000d)));
                        latestBriefingImage = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
                        if (latestBriefingImage == null) throw new IllegalArgumentException("decode failed");
                        latestBriefingImageError = false;
                    } catch (IllegalArgumentException | OutOfMemoryError ignored) {
                        latestBriefingImageError = true;
                    }
                    render();
                }));
        }

        void renderLoading() {
            LinearLayout root = shell();
            root.addView(title("성과 분석", "근거가 있는 지표만 표시합니다."));
            root.addView(body("분석 데이터를 불러오는 중입니다."), top(12));
            set(root);
        }

        void renderError(String detail) {
            LinearLayout root = shell();
            root.addView(title("성과 분석", "분석 데이터를 확인할 수 없습니다."));
            root.addView(card("분석 데이터", detail, false), top(16));
            Button retry = action("다시 불러오기", ACTION);
            root.addView(retry, top(12));
            retry.setOnClickListener(v -> loadAnalytics());
            set(root);
        }

        void render() {
            LinearLayout root = shell();
            root.addView(header());
            root.addView(rangeControls(), top(14));
            if ("hub".equals(page)) hub(root);
            else if ("intake".equals(page)) intake(root);
            else if ("traffic".equals(page)) traffic(root);
            else if ("meta".equals(page)) meta(root);
            else if ("flow".equals(page)) flow(root);
            else if ("signal".equals(page)) signal(root);
            else brief(root);
            set(root);
            if ("brief".equals(page)) {
                if (notifications == null && !briefingLoading && !briefingError) loadBriefing();
                if (!latestBriefingLoaded && !latestBriefingLoading && !latestBriefingError) loadLatestBriefing();
            }
        }

        LinearLayout shell() {
            host.removeAllViews();
            host.setPadding(0, 0, 0, 0);
            return host;
        }

        void set(LinearLayout root) {
            if (root != host) throw new IllegalStateException("analytics host changed");
        }

        View header() {
            LinearLayout block = column();
            Button back = textButton("분석");
            back.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
            back.setOnClickListener(v -> { page = "hub"; render(); });
            back.setBackgroundColor(Color.TRANSPARENT);
            back.setText("‹ 분석");
            if (!"hub".equals(page)) block.addView(back, new LinearLayout.LayoutParams(-1, dp(48)));
            String heading = "hub".equals(page) ? "성과 분석" : pageTitle(page);
            String sub = "hub".equals(page) ? "필요한 근거까지, 단계별로 자세하게" : pageSubtitle(page);
            block.addView(title(heading, sub), top(2));
            block.addView(analysisNavigation(), top(12));
            return block;
        }

        View analysisNavigation() {
            LinearLayout row = new LinearLayout(activity);
            row.setGravity(Gravity.CENTER_VERTICAL);
            addAnalysisNav(row, "intake", "접수통계");
            addAnalysisNav(row, "traffic", "유입통계");
            addAnalysisNav(row, "meta", "Meta 광고");
            addAnalysisNav(row, "brief", "데일리브리핑");
            return row;
        }

        void addAnalysisNav(LinearLayout row, String key, String label) {
            Button item = rangeButton(label, key.equals(page));
            item.setTextSize(11);
            item.setGravity(Gravity.CENTER);
            item.setPadding(dp(2), 0, dp(2), 0);
            item.setOnClickListener(v -> open(key));
            row.addView(item, weight());
        }

        View rangeControls() {
            LinearLayout block = column();
            LinearLayout row = new LinearLayout(activity);
            row.setGravity(Gravity.CENTER_VERTICAL);
            Button month = rangeButton("이번 달", rangeKind == 0);
            Button seven = rangeButton("최근 7일", rangeKind == 7);
            Button thirty = rangeButton("최근 30일", rangeKind == 30);
            Button custom = rangeButton("사용자 지정", rangeKind == -1);
            row.addView(month, weight()); row.addView(seven, weight()); row.addView(thirty, weight()); row.addView(custom, weight());
            block.addView(row);
            TextView period = body(start + "–" + end + " · 총 " + (ChronoUnit.DAYS.between(LocalDate.parse(start), LocalDate.parse(end)) + 1) + "일 · KST · " + (analytics == null ? "갱신 확인 중" : refreshLabel()));
            block.addView(period, top(7));
            if (analytics != null && analytics.optBoolean("read_only")) block.addView(body("홈페이지 실제 집계 · 조회 전용"), top(5));
            month.setOnClickListener(v -> chooseRange(0));
            seven.setOnClickListener(v -> chooseRange(7));
            thirty.setOnClickListener(v -> chooseRange(30));
            custom.setOnClickListener(v -> chooseCustomRange());
            return block;
        }

        void chooseRange(int kind) {
            rangeKind = kind;
            activity.getPreferences(Activity.MODE_PRIVATE).edit().putInt("analytics_range", kind).apply();
            if (kind == 0) { start = monthStart.format(DATE); end = monthEnd.format(DATE); }
            else { start = today.minusDays(kind - 1L).format(DATE); end = today.format(DATE); }
            analytics = null;
            metaCardsGeneration++;
            metaCardsPayload = null;
            metaNextCursor = "";
            metaCardsLoading = false;
            metaCardsError = false;
            notifications = null;
            briefingRows = null;
            briefingNextCursor = "";
            briefingHasMore = false;
            briefingError = false;
            briefingLoading = false;
            resetLatestBriefing();
            selectedSource = "";
            renderLoading();
            loadAnalytics();
        }

        void resetLatestBriefing() {
            latestBriefingGeneration++;
            latestBriefingRefreshAt = 0L;
            latestBriefing = null;
            latestBriefingImage = null;
            latestBriefingLoaded = false;
            latestBriefingLoading = false;
            latestBriefingError = false;
            latestBriefingImageError = false;
        }

        void chooseCustomRange() {
            LocalDate initialStart = rangeKind == -1 && validDate(start) ? LocalDate.parse(start) : monthStart;
            DatePickerDialog startPicker = new DatePickerDialog(activity, (view, year, month, day) -> {
                LocalDate pickedStart = LocalDate.of(year, month + 1, day);
                LocalDate initialEnd = rangeKind == -1 && validDate(end) && !LocalDate.parse(end).isBefore(pickedStart)
                    ? LocalDate.parse(end) : pickedStart;
                DatePickerDialog endPicker = new DatePickerDialog(activity, (endView, endYear, endMonth, endDay) -> {
                    LocalDate pickedEnd = LocalDate.of(endYear, endMonth + 1, endDay);
                    if (pickedEnd.isBefore(pickedStart)) {
                        Toast.makeText(activity, "종료일은 시작일보다 빠를 수 없습니다.", Toast.LENGTH_SHORT).show();
                        return;
                    }
                    applyCustomRange(pickedStart, pickedEnd);
                }, initialEnd.getYear(), initialEnd.getMonthValue() - 1, initialEnd.getDayOfMonth());
                endPicker.setTitle("종료일 선택");
                endPicker.setOnShowListener(ignored -> endPicker.getDatePicker().setMinDate(epochMillis(pickedStart)));
                endPicker.show();
            }, initialStart.getYear(), initialStart.getMonthValue() - 1, initialStart.getDayOfMonth());
            startPicker.setTitle("시작일 선택");
            startPicker.show();
        }

        void applyCustomRange(LocalDate pickedStart, LocalDate pickedEnd) {
            if (pickedStart == null || pickedEnd == null || pickedEnd.isBefore(pickedStart)) {
                Toast.makeText(activity, "분석 기간을 확인하세요.", Toast.LENGTH_SHORT).show();
                return;
            }
            if (ChronoUnit.DAYS.between(pickedStart, pickedEnd) + 1 > 366) {
                Toast.makeText(activity, "분석 기간은 366일 이내로 선택하세요.", Toast.LENGTH_SHORT).show();
                return;
            }
            start = pickedStart.format(DATE);
            end = pickedEnd.format(DATE);
            rangeKind = -1;
            activity.getPreferences(Activity.MODE_PRIVATE).edit()
                .putInt("analytics_range", -1)
                .putString("analytics_start", start)
                .putString("analytics_end", end)
                .apply();
            analytics = null;
            notifications = null;
            briefingRows = null;
            briefingNextCursor = "";
            briefingHasMore = false;
            briefingError = false;
            briefingLoading = false;
            resetLatestBriefing();
            selectedSource = "";
            renderLoading();
            loadAnalytics();
        }

        boolean validRange(String candidateStart, String candidateEnd) {
            if (!validDate(candidateStart) || !validDate(candidateEnd)) return false;
            return !LocalDate.parse(candidateEnd).isBefore(LocalDate.parse(candidateStart));
        }

        boolean validDate(String value) {
            if (value == null || value.length() != 10) return false;
            try { LocalDate.parse(value, DATE); return true; }
            catch (java.time.format.DateTimeParseException ignored) { return false; }
        }

        long epochMillis(LocalDate date) {
            return date.atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant().toEpochMilli();
        }

        void hub(LinearLayout root) {
            JSONObject metrics = obj(analytics, "metrics");
            root.addView(metricRow(metric("홈페이지 방문", integer(metrics, "sessions"), "방문 세션 기준"),
                metric("전체 실제 접수", number(metrics, "savedLeads"), "기간 내 상담 접수")), top(16));
            LinearLayout flow = column();
            flow.setPadding(dp(16), dp(16), dp(16), dp(16));
            flow.setBackground(round(PANEL, 6));
            flow.addView(text("마케팅 흐름 인디케이터  ›", 15, true, INK));
            flow.addView(body("어느 출처의 어느 구간을\n먼저 보완해야 할까요?"), top(8));
            LinearLayout legend = new LinearLayout(activity);
            legend.setGravity(Gravity.CENTER_VERTICAL);
            legend.addView(pill("양호", Color.rgb(28, 116, 77)), weight());
            legend.addView(pill("점검", Color.rgb(176, 70, 54)), weight());
            legend.addView(pill("관찰", Color.rgb(148, 96, 25)), weight());
            legend.addView(pill("판단불가", MUTED), weight());
            flow.addView(legend, top(12));
            flow.setClickable(true);
            flow.setFocusable(true);
            flow.setOnClickListener(v -> open("flow"));
            root.addView(flow, top(14));
            LinearLayout menu = column();
            menu.setBackground(round(PANEL, 6));
            addMenu(menu, "intake", "접수통계", "채널·예산·지역·상태·상담·계약");
            addMenu(menu, "traffic", "유입통계", "방문·페이지·출처·신청·이탈");
            addMenu(menu, "meta", "Meta 광고", "캠페인·소재·CPL·CPC·CPM");
            addMenu(menu, "brief", "데일리브리핑", "오전 10시 요약·변화·조치");
            root.addView(menu, top(16));
            root.addView(note("기간은 분석 화면 간 유지합니다. 지표별 상세·차원별 표를 펼쳐 볼 수 있으며, 첫 화면 요약이 전체 통계의 대체물이 되지 않도록 설계합니다."), top(18));
        }

        void intake(LinearLayout root) {
            JSONObject source = source("saved_estimates");
            JSONObject m = sourceMetrics(source, "saved_estimates");
            JSONObject intake = obj(m, "intake");
            JSONObject cohort = obj(intake, "cohort");
            JSONObject contracts = obj(cohort, "contracts");
            String contractCount = contractCustomers(contracts);
            root.addView(metricRow(metric("실제 접수", number(m, "saved"), "기간 내 상담 접수"),
                metric("계약완료", contractCount, "접수 코호트 기준")), top(12));
            JSONArray channels = array(m, "intakeChannels");
            if (channels.length() == 0) root.addView(note("접수 채널 데이터가 아직 집계되지 않았습니다."), top(10));
            else root.addView(intakeBars("접수 채널", channels, "channel", "saved", 1,
                "홈페이지 유입 출처는 유입통계에서 세분화합니다."), top(10));
            JSONObject dimensions = obj(intake, "dimensions");
            if (dimensions.length() == 0) dimensions = obj(m, "dimensions");
            if (dimensions.length() == 0) dimensions = obj(source, "dimensions");
            addDimensionRows(root, "가용 예산 분포", dimensions.optJSONObject("budget"), true);

            LinearLayout conversion = column();
            addConversionTable(conversion, cohort);
            root.addView(expandableBlock("상담·계약 전환 상세", conversion, true), top(18));

            LinearLayout regional = column();
            addDimensionRows(regional, "지역", dimensions.optJSONObject("regions"), false);
            addDimensionRows(regional, "담당자", dimensions.optJSONObject("assignees"), false);
            addDimensionRows(regional, "지점", dimensions.optJSONObject("branches"), false);
            root.addView(expandableBlock("지역·담당자·지점별 상세", regional, false), top(12));

            LinearLayout status = column();
            addDimensionRows(status, "상태", dimensions.optJSONObject("statuses"), false);
            root.addView(expandableBlock("상태별 대기·미진행·보류", status, false), top(12));
            if (openCustomers != null) {
                Button customers = action("해당 고객 보기", INK);
                customers.setGravity(Gravity.CENTER);
                customers.setOnClickListener(v -> openCustomers.run());
                root.addView(customers, top(12));
            }
        }

        void addDimensionRows(LinearLayout root, String title, JSONObject dimension, boolean budget) {
            root.addView(dimensionChart(title, dimension, budget), top(10));
        }

        View dimensionChart(String title, JSONObject dimension, boolean budget) {
            if (dimension == null || !dimension.optBoolean("available", false)) {
                return note(title + " 데이터가 아직 집계되지 않았습니다.");
            }
            JSONArray values = array(dimension, "values");
            if (values.length() == 0) return body("해당 접수 코호트에 표시할 값이 없습니다.");
            JSONArray display = new JSONArray();
            for (int i = 0; i < values.length(); i++) {
                JSONObject row = values.optJSONObject(i);
                if (row == null) continue;
                JSONObject item = new JSONObject();
                try { item.put("label", budget ? budgetLabel(row) : row.optString("value", "미확인")); item.put("count", row.opt("count")); }
                catch (org.json.JSONException ignored) { continue; }
                display.put(item);
            }
            LinearLayout block = column();
            block.addView(budget ? intakeBars(title, display, "label", "count", 2, "")
                : barChart(title, display, "label", "count", Color.rgb(36, 84, 214)));
            if (dimension.optBoolean("hasMore", false)) block.addView(note("상위 100개 값만 표시합니다."), top(8));
            return block;
        }

        void addCohortRows(LinearLayout root, JSONObject cohort, String title) {
            root.addView(section(title), top(18));
            JSONObject appointments = obj(cohort, "appointments");
            if (appointments.optBoolean("available", false)) {
                JSONArray values = array(appointments, "values");
                for (int i = 0; i < values.length(); i++) {
                    JSONObject row = values.optJSONObject(i);
                    if (row == null) continue;
                    String kind = "visit".equals(row.optString("kind")) ? "상담" : "실측";
                    root.addView(rowCard(kind, "고객 " + withUnit(row, "customers", "명") + " · 일정 " + withUnit(row, "events", "건") + " · 취소 " + withUnit(row, "cancelled", "건")), top(7));
                }
            } else {
                JSONObject legacy = obj(cohort, "legacyConsultation");
                if (legacy.optBoolean("available", false)) root.addView(rowCard("상담", "예약 고객 " + withUnit(legacy, "scheduled", "명")), top(7));
                else root.addView(note("상담·실측 일정 데이터가 아직 집계되지 않았습니다."), top(8));
            }
            JSONObject contracts = obj(cohort, "contracts");
            if (contracts.optBoolean("available", false)) {
                JSONArray values = array(contracts, "values");
                for (int i = 0; i < values.length(); i++) {
                    JSONObject row = values.optJSONObject(i);
                    if (row != null) root.addView(rowCard("signed".equals(row.optString("status")) ? "계약완료" : "계약 " + row.optString("status", "확인"), "고객 " + withUnit(row, "customers", "명")), top(7));
                }
            } else root.addView(note("계약 데이터가 아직 집계되지 않았습니다."), top(8));
        }

        void addConversionTable(LinearLayout root, JSONObject cohort) {
            int total = cohort.has("saved") && !cohort.isNull("saved") ? cohort.optInt("saved", -1) : -1;
            LinearLayout table = column();
            table.addView(text("단계별 접수 코호트", 14, true, INK));
            LinearLayout header = new LinearLayout(activity);
            header.setGravity(Gravity.CENTER_VERTICAL);
            header.addView(text("단계", 11, true, MUTED), weight());
            TextView customerHeader = text("고객 수", 11, true, MUTED);
            customerHeader.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
            header.addView(customerHeader, new LinearLayout.LayoutParams(dp(64), -2));
            TextView rateHeader = text("전체 접수 대비", 11, true, MUTED);
            rateHeader.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
            header.addView(rateHeader, new LinearLayout.LayoutParams(dp(96), -2));
            table.addView(header, top(10));
            addConversionRow(table, "실제 접수", total, total);
            JSONObject appointments = obj(cohort, "appointments");
            JSONArray appointmentRows = array(appointments, "values");
            int consultation = 0;
            int measurement = 0;
            for (int i = 0; i < appointmentRows.length(); i++) {
                JSONObject row = appointmentRows.optJSONObject(i);
                if (row == null) continue;
                if ("visit".equals(row.optString("kind"))) consultation += row.optInt("customers", 0);
                if ("measurement".equals(row.optString("kind"))) measurement += row.optInt("customers", 0);
            }
            addConversionRow(table, "상담 진행", appointments.optBoolean("available", false) ? consultation : -1, total);
            addConversionRow(table, "실측 진행", appointments.optBoolean("available", false) ? measurement : -1, total);
            JSONObject contracts = obj(cohort, "contracts");
            if (contracts.optBoolean("available", false)) {
                int signed = 0;
                JSONArray rows = array(contracts, "values");
                for (int i = 0; i < rows.length(); i++) {
                    JSONObject row = rows.optJSONObject(i);
                    if (row != null && ("signed".equals(row.optString("status")) || "계약완료".equals(row.optString("status")))) signed += row.optInt("customers", 0);
                }
                addConversionRow(table, "계약완료", signed, total);
            } else addConversionRow(table, "계약완료", -1, total);
            root.addView(table, top(2));
        }

        void addConversionRow(LinearLayout root, String label, int count, int total) {
            String rate = count < 0 || total <= 0 ? "—" : String.format(Locale.US, "%.1f%%", count * 100d / total);
            LinearLayout row = new LinearLayout(activity);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.addView(text(label, 13, false, INK), weight());
            row.addView(text(count < 0 ? "미집계" : String.format(Locale.KOREA, "%,d건", count), 13, true, INK), new LinearLayout.LayoutParams(dp(64), -2));
            row.addView(text(rate, 13, false, MUTED), new LinearLayout.LayoutParams(dp(64), -2));
            root.addView(row, top(8));
        }

        String contractCustomers(JSONObject contracts) {
            if (!contracts.optBoolean("available", false)) return "확인할 수 없음";
            JSONArray values = array(contracts, "values");
            int count = 0;
            for (int i = 0; i < values.length(); i++) {
                JSONObject row = values.optJSONObject(i);
                if (row != null && ("signed".equals(row.optString("status")) || "계약완료".equals(row.optString("status")))) count += row.optInt("customers", 0);
            }
            return String.format(Locale.KOREA, "%,d건", count);
        }

        String withUnit(JSONObject object, String key, String unit) {
            String value = integer(object, key);
            return "확인할 수 없음".equals(value) ? value : value + unit;
        }

        String budgetLabel(JSONObject row) {
            if (row.has("label")) return row.optString("label");
            if (row.isNull("amount")) return "미확인";
            return String.format(Locale.KOREA, "%,d원", row.optLong("amount"));
        }

        String trafficMetricValue(JSONObject summary, String key) {
            JSONObject value = obj(summary, key);
            if (!value.has("value") || value.isNull("value")) return "미집계";
            double number = value.optDouble("value", Double.NaN);
            if (!Double.isFinite(number)) return "미집계";
            if ("bounceRate".equals(key)) return String.format(Locale.KOREA, "%.1f%%", number * 100d);
            if ("avgDurationSec".equals(key)) {
                long seconds = Math.max(0L, Math.round(number));
                return (seconds / 60L) + "분 " + String.format(Locale.KOREA, "%02d초", seconds % 60L);
            }
            return String.format(Locale.KOREA, "%,d", Math.round(number));
        }

        void traffic(LinearLayout root) {
            JSONObject summary = obj(obj(analytics, "trafficSummary"), "traffic");
            String[][] summaryFields = {{"터치","touches"},{"체류","visitors"},{"재방문","returningVisitors"},{"페이지뷰","pageviews"},{"평균 체류","avgDurationSec"},{"이탈률","bounceRate"}};
            for (int i = 0; i < summaryFields.length; i += 2) {
                root.addView(metricRow(metric(summaryFields[i][0], trafficMetricValue(summary, summaryFields[i][1]), "선택 기간"),
                    metric(summaryFields[i+1][0], trafficMetricValue(summary, summaryFields[i+1][1]), "선택 기간")), top(10));
            }
            JSONObject sessions = source("sessions");
            JSONObject saved = source("saved_estimates");
            JSONObject sessionMetrics = obj(sessions, "metrics");
            JSONObject savedMetrics = obj(saved, "metrics");
            String sessionCount = integer(sessionMetrics, "sessions");
            if (!"확인할 수 없음".equals(sessionCount)) sessionCount += "세션";
            JSONArray intakeChannels = array(savedMetrics, "intakeChannels");
            String homepageCount = "미집계";
            for (int i = 0; i < intakeChannels.length(); i++) {
                JSONObject channel = intakeChannels.optJSONObject(i);
                if (channel != null && "홈페이지".equals(channel.optString("channel"))) homepageCount = number(channel, "saved");
            }
            root.addView(metricRow(metric("방문 세션", sessionCount, "동일인 반복 방문 포함"),
                metric("홈페이지 접수", homepageCount, "홈페이지 상담 폼 접수")), top(16));
            root.addView(trafficTrend(sessionMetrics, savedMetrics), top(12));
            JSONObject flow = flowAnalysis();
            JSONArray sources = array(flow, "sources");
            LinearLayout sourceBox = column();
            sourceBox.setPadding(dp(16), dp(16), dp(16), dp(16));
            sourceBox.setBackground(round(PANEL, 6));
            sourceBox.addView(text("출처별 방문과 접수", 14, true, INK));
            if (available(flow) && sources.length() > 0) {
                List<JSONObject> activeSources = new ArrayList<>();
                List<JSONObject> inactiveSources = new ArrayList<>();
                for (int i = 0; i < sources.length(); i++) {
                    JSONObject sourceRow = sources.optJSONObject(i);
                    if (sourceRow == null || isMetaInternalForm(sourceRow.optString("channel", ""))) continue;
                    JSONObject current = obj(sourceRow, "current");
                    String status = sourceStatus(sourceRow, current);
                    if (AnalyticsSourceStatus.INACTIVE.equals(status)) inactiveSources.add(sourceRow);
                    else activeSources.add(sourceRow);
                }
                Comparator<JSONObject> sourceOrder = (left, right) -> {
                    JSONObject leftCurrent = obj(left, "current");
                    JSONObject rightCurrent = obj(right, "current");
                    int savedOrder = Long.compare(metricLong(rightCurrent, "savedLeads", -1L), metricLong(leftCurrent, "savedLeads", -1L));
                    if (savedOrder != 0) return savedOrder;
                    int visitsOrder = Long.compare(metricLong(rightCurrent, "visits", -1L), metricLong(leftCurrent, "visits", -1L));
                    if (visitsOrder != 0) return visitsOrder;
                    return left.optString("channel", "").compareToIgnoreCase(right.optString("channel", ""));
                };
                Collections.sort(activeSources, sourceOrder);
                Collections.sort(inactiveSources, sourceOrder);
                List<JSONObject> visibleSources = new ArrayList<>(activeSources);
                if (showInactiveSources) visibleSources.addAll(inactiveSources);
                if (visibleSources.isEmpty()) {
                    sourceBox.addView(note("선택 기간에 방문·접수가 없습니다."), top(7));
                } else {
                    long maximumSaved = 0L;
                    for (JSONObject sourceRow : visibleSources) maximumSaved = Math.max(maximumSaved, metricLong(obj(sourceRow, "current"), "savedLeads", 0L));
                    for (int i = 0; i < visibleSources.size(); i++) addSourceEntry(sourceBox, visibleSources.get(i), maximumSaved, i > 0);
                }
                if (!inactiveSources.isEmpty()) {
                    Button reveal = action(showInactiveSources ? "활동 없는 출처 숨기기" : "활동 없는 출처 보기", ACTION);
                    sourceBox.addView(reveal, top(8));
                    reveal.setOnClickListener(v -> { showInactiveSources = !showInactiveSources; render(); });
                }
            } else {
                sourceBox.addView(note(available(flow) ? "선택 기간에 방문·접수가 없습니다." : "출처별 방문·접수는 집계 확인이 필요합니다."), top(7));
            }
            root.addView(sourceBox,top(12));
            root.addView(trafficMetaFormCard(savedMetrics), top(8));
            root.addView(detailSheetTrigger("방문과 접수는 어떻게 집계하나요?", sourceStatusCriteria()), top(8));
            JSONObject dimensions = obj(obj(obj(analytics,"dimensions"),"traffic"),"dimensions");
            LinearLayout detail = column();
            addTrafficDimension(detail,obj(dimensions,"page"),"페이지");
            addTrafficDimension(detail,obj(dimensions,"form_events"),"신청 시작·완료");
            root.addView(expandableBlock("페이지·콘텐츠·신청 단계", detail, false), top(16));
            LinearLayout acquisition = column();
            addTrafficDimension(acquisition,obj(dimensions,"source"),"방문 출처");
            addTrafficDimension(acquisition,obj(dimensions,"device"),"기기");
            addTrafficDimension(acquisition,obj(dimensions,"campaign"),"캠페인");
            root.addView(expandableBlock("기기·지역·시간·검색·캠페인", acquisition, false), top(8));
            LinearLayout quality = column();
            quality.addView(body("추적되지 않은 방문·접수는 성과 0과 다릅니다. 집계되지 않은 항목은 확인할 수 없음으로 표시합니다."));
            root.addView(expandableBlock("데이터 품질·미연결 접수", quality, false), top(8));
        }

        void refreshBriefingIfVisible(boolean force) {
            if (!"brief".equals(page)) return;
            long now = System.currentTimeMillis();
            if (latestBriefingLoading) return;
            if (latestBriefingRefreshAt > 0L && now - latestBriefingRefreshAt < BRIEF_REFRESH_MIN_INTERVAL_MS) return;
            loadLatestBriefing();
        }

        void addSourceEntry(LinearLayout sourceBox, JSONObject sourceRow, long maximumSaved, boolean dividerBefore) {
            if (dividerBefore) { View divider = new View(activity); divider.setBackgroundColor(LINE); sourceBox.addView(divider, new LinearLayout.LayoutParams(-1, dp(1))); }
            JSONObject current = obj(sourceRow, "current");
            String status = sourceStatus(sourceRow, current);
            LinearLayout entry = column();
            entry.setPadding(0, dp(13), 0, dp(13));
            LinearLayout caption = new LinearLayout(activity);
            caption.setGravity(Gravity.CENTER_VERTICAL);
            caption.addView(text(sourceRow.optString("channel", "확인할 수 없음"), 12, true, INK), weight());
            caption.addView(sourceStatusPill(status));
            entry.addView(caption);
            entry.addView(text("방문 " + sourceMetricLabel(current, "visits") + " · 접수 " + sourceMetricLabel(current, "savedLeads"), 11, false, MUTED), top(6));
            if (AnalyticsSourceStatus.QUALITY.equals(status)) entry.addView(text("상세 흐름에서 집계 확인이 필요합니다.", 11, false, MUTED), top(4));
            else if (AnalyticsSourceStatus.RECEIPT.equals(status) && metricLong(current, "visits", 0L) == 0L) entry.addView(text("접수는 확인되지만 방문 기록 연결이 필요합니다.", 11, false, MUTED), top(4));
            else if (AnalyticsSourceStatus.NONE.equals(status)) entry.addView(text("방문은 발생했지만 이 기간 접수는 없습니다.", 11, false, MUTED), top(4));
            else if (AnalyticsSourceStatus.SAMPLE.equals(status)) entry.addView(text("방문 표본이 적어 접수 추이를 더 지켜봅니다.", 11, false, MUTED), top(4));
            entry.addView(sourceBar(metricLong(current, "savedLeads", 0L), maximumSaved), top(7));
            entry.setOnClickListener(v -> { selectedSource = sourceRow.optString("channel", ""); open("flow"); });
            entry.setFocusable(true);
            sourceBox.addView(entry);
        }

        View sourceBar(long value, long maximum) {
            LinearLayout track = new LinearLayout(activity);
            track.setBackground(round(Color.rgb(237, 240, 242), 4));
            track.setMinimumHeight(dp(7));
            track.setWeightSum(1f);
            if (maximum > 0L && value > 0L) {
                View fill = new View(activity);
                fill.setBackground(round(Color.rgb(30, 109, 79), 4));
                track.addView(fill, new LinearLayout.LayoutParams(0, dp(7), Math.min(1f, value / (float) maximum)));
            }
            return track;
        }

        View trafficMetaFormCard(JSONObject savedMetrics) {
            JSONArray channels = array(savedMetrics, "intakeChannels");
            boolean found = false;
            for (int i = 0; i < channels.length(); i++) {
                JSONObject channel = channels.optJSONObject(i);
                if (channel == null) continue;
                String label = channel.optString("channel", "");
                if (!"Meta 내부폼".equals(label) && !"Meta 내부 폼".equals(label) && !"meta_internal_form".equals(label)) continue;
                found = true;
                if (!hasMetric(channel, "saved")) return metaFormCard(AnalyticsSourceStatus.QUALITY, "접수 수치가 제공되지 않습니다.");
                long saved = metricLong(channel, "saved", 0L);
                String status = saved >= 1L ? AnalyticsSourceStatus.RECEIPT : AnalyticsSourceStatus.SAMPLE;
                return metaFormCard(status, "접수 " + sourceMetricLabel(channel, "saved") + " · 홈페이지 유입과 분리된 경로");
            }
            return metaFormCard(AnalyticsSourceStatus.QUALITY, found ? "집계 확인 필요" : "내부 폼 데이터가 제공되지 않습니다.");
        }

        View metaFormCard(String status, String detail) {
            LinearLayout box = column();
            box.setPadding(dp(15), dp(14), dp(15), dp(14));
            box.setBackground(round(PANEL, 6));
            LinearLayout heading = new LinearLayout(activity);
            heading.setGravity(Gravity.CENTER_VERTICAL);
            heading.addView(text("Meta 내부 폼", 14, true, INK), weight());
            heading.addView(sourceStatusPill(status));
            box.addView(heading);
            box.addView(text(detail, 13, false, MUTED), top(8));
            return box;
        }

        String sourceStatus(JSONObject source, JSONObject current) {
            boolean qualityIssue = source.optBoolean("qualityIssue", false) || source.optBoolean("delayed", false)
                || source.optBoolean("error", false) || !hasMetric(current, "visits") || !hasMetric(current, "savedLeads");
            return AnalyticsSourceStatus.fromMetrics(qualityIssue, metricLongOrNull(current, "visits"), metricLongOrNull(current, "savedLeads"));
        }

        String sourceNumber(JSONObject object, String key) {
            return hasMetric(object, key) ? String.format(Locale.KOREA, "%,d건", metricLong(object, key, 0L)) : "—";
        }

        String sourceMetricLabel(JSONObject object, String key) {
            if (!hasMetric(object, key)) return "—";
            return String.format(Locale.KOREA, "%,d%s", metricLong(object, key, 0L), "visits".equals(key) ? "회" : "건");
        }

        View sourceStatusCriteria() {
            LinearLayout content = column();
            content.addView(body("방문은 세션·유입 출처 기록, 접수는 저장된 상담 신청 원본을 기준으로 선택 기간에 별도 집계합니다."));
            content.addView(body("접수 발생: 저장된 접수가 1건 이상인 출처입니다."));
            content.addView(body("접수 없음: 방문 100회 이상이지만 접수가 0건인 출처입니다."), top(8));
            content.addView(body("집계 중: 방문 1~99회이고 접수가 0건인 출처입니다."), top(8));
            content.addView(body("집계 확인 필요: 필수 수치가 없거나 집계 지연·오류가 표시된 경우입니다."), top(8));
            content.addView(body("막대는 접수 건수를 출처별 최대값과 비교합니다. 목록에서는 연결되지 않은 전환율을 표시하지 않습니다."), top(8));
            return content;
        }

        boolean hasMetric(JSONObject object, String key) { return object != null && object.has(key) && !object.isNull(key) && object.opt(key) instanceof Number; }
        Long metricLongOrNull(JSONObject object, String key) { return hasMetric(object, key) ? metricLong(object, key, 0L) : null; }
        long metricLong(JSONObject object, String key, long fallback) { return hasMetric(object, key) ? object.optLong(key, fallback) : fallback; }
        boolean isMetaInternalForm(String channel) {
            return "Meta 내부폼".equals(channel) || "Meta 내부 폼".equals(channel) || "meta_internal_form".equals(channel);
        }

        View trafficTrend(JSONObject sessions, JSONObject receipts) {
            LinearLayout box = column();
            box.setPadding(dp(16),dp(16),dp(16),dp(16));
            box.setBackground(round(PANEL, 6));
            LinearLayout caption = new LinearLayout(activity);
            caption.addView(text("방문·접수 추세",14,true,INK),weight());
            caption.addView(text("각 계열 정규화",11,false,MUTED));
            box.addView(caption);
            JSONArray visits = array(sessions,"trend");
            JSONArray leads = array(receipts,"trend");
            if (visits.length()==0 || leads.length()==0) {
                box.addView(note("방문·접수 추세를 아직 집계할 수 없습니다."),top(8));
                return box;
            }
            View chart = new View(activity) {
                final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
                @Override protected void onDraw(Canvas canvas) {
                    super.onDraw(canvas);
                    canvas.save(); canvas.scale(getWidth()/320f,getHeight()/120f);
                    paint.setColor(Color.rgb(229,233,224)); paint.setStrokeWidth(1);
                    for(int y:new int[]{24,58,92})canvas.drawLine(0,y,320,y,paint);
                    drawSeries(canvas,visits,"sessions",Color.rgb(113,139,97));
                    drawSeries(canvas,leads,"homepageSaved",Color.rgb(189,102,85));
                    paint.setStyle(Paint.Style.FILL);paint.setTextSize(9);paint.setColor(Color.rgb(119,129,112));
                    int size=visits.length();
                    for(int i:new int[]{0,size/2,size-1}) {
                        JSONObject point=visits.optJSONObject(i); if(point==null)continue;
                        String date=point.optString("date","");
                        String label=date.length()==10 ? Integer.parseInt(date.substring(5,7))+"/"+Integer.parseInt(date.substring(8,10)):date;
                        float x=i==0 ? 0 : i==size-1 ? 320-paint.measureText(label) : 160-paint.measureText(label)/2;
                        canvas.drawText(label,x,115,paint);
                    }
                    canvas.restore();
                }
                void drawSeries(Canvas canvas,JSONArray points,String key,int color) {
                    double max=0;
                    for(int i=0;i<points.length();i++){JSONObject p=points.optJSONObject(i);if(p!=null)max=Math.max(max,p.optDouble(key,0));}
                    Path path=new Path();
                    boolean started=false;
                    for(int i=0;i<points.length();i++) {
                        JSONObject p=points.optJSONObject(i); if(p==null||p.isNull(key))continue;
                        float x=points.length()==1 ? 160 : 3+313f*i/(points.length()-1);
                        float y=max>0 ? 92-(float)(p.optDouble(key)/max)*73 : 92;
                        if(!started){path.moveTo(x,y);started=true;}else path.lineTo(x,y);
                    }
                    paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(2.5f);paint.setColor(color);canvas.drawPath(path,paint);
                    paint.setStyle(Paint.Style.FILL);
                }
            };
            chart.setContentDescription("방문과 홈페이지 접수의 일별 추세. 각 계열 최대값을 기준으로 정규화했습니다.");
            box.addView(chart,new LinearLayout.LayoutParams(-1,dp(120)));
            LinearLayout legend=new LinearLayout(activity);
            legend.addView(text("● 방문",10,false,Color.rgb(53,99,78)));
            TextView receiptLabel=text("● 접수",10,false,Color.rgb(160,68,59));
            LinearLayout.LayoutParams gap=new LinearLayout.LayoutParams(-2,-2);gap.leftMargin=dp(8);legend.addView(receiptLabel,gap);
            box.addView(legend,top(8));
            return box;
        }

        void meta(LinearLayout root) {
            JSONObject source = source("meta_ads");
            JSONObject m = sourceMetrics(source, "meta_ads");
            JSONObject metaDimensions = obj(obj(obj(analytics, "dimensions"), "meta"), "dimensions");
            root.addView(metricRow(metric("광고비", money(m, "spend"), currencyDetail(m)),
                metric("Meta 리드", number(m, "leads"), "Meta가 보고한 리드")), top(12));
            root.addView(metricRow(metric("CPL", ratio(m, "cpl"), "광고비 ÷ Meta 리드"),
                metric("CPC", ratio(m, "cpcLink"), "광고비 ÷ 링크 클릭")), top(8));
            root.addView(videoViewingRows(m, metaDimensions), top(10));
            root.addView(adRateRows(m), top(10));
            if (metaCardsPayload == null && metaCardsLoading) {
                root.addView(body("소재별 광고 데이터를 불러오는 중입니다."), top(16));
            } else if (metaCardsPayload == null && metaCardsError) {
                root.addView(body("소재별 광고 데이터를 확인하지 못했습니다."), top(16));
                Button retry = action("소재 데이터 다시 불러오기", ACTION);
                root.addView(retry, top(8));
                retry.setOnClickListener(v -> loadMetaCards(true));
            } else {
                root.addView(MetaAdCardsView.create(activity, analytics, api, metaCardsGeneration, this::loadNextMetaCards), top(16));
                if (metaCardsError) root.addView(note("추가 소재 데이터를 불러오지 못했습니다. 현재까지 확인된 소재를 표시합니다."), top(8));
            }
            JSONObject dimensions = metaDimensions;
            addAdDimension(root,obj(dimensions,"campaigns"),"캠페인별",dimensions,m);
            LinearLayout detail = column();
            addAdDimension(detail,obj(dimensions,"adsets"),"광고 세트",dimensions,m);
            addAdDimension(detail,obj(dimensions,"ads"),"광고 소재",dimensions,m);
            root.addView(expandableBlock("광고세트·소재 상세", detail, false), top(16));
            LinearLayout audience = column();
            addAdDimension(audience,obj(dimensions,"age_gender"),"연령·성별",dimensions,m);
            addAdDimension(audience,obj(dimensions,"regions"),"지역",dimensions,m);
            addAdDimension(audience,obj(dimensions,"placements"),"게재 위치",dimensions,m);
            audience.addView(body("차원별 수치는 중복될 수 있어 서로 합산하지 않습니다."),top(8));
            root.addView(expandableBlock("연령·성별·지역·게재 위치", audience, false), top(8));
            LinearLayout reconciliation = column();
            reconciliation.addView(body("Meta 리드 " + number(m,"leads") + " · 실제 접수 " + number(obj(source("saved_estimates"),"metrics"),"saved")));
            reconciliation.addView(body("집계 기준·중복·수집 지연을 대조합니다. 두 수치의 차이를 바로 손실로 판단하지 않습니다."),top(8));
            addAdDimension(reconciliation,obj(dimensions,"accounts"),"광고 계정",dimensions,m);
            root.addView(expandableBlock("집계 차이와 동기화 상태", reconciliation, false), top(8));
        }

        void addTrafficDimension(LinearLayout root, JSONObject dimension, String title) {
            root.addView(section(title),top(18));
            if(!dimension.optBoolean("available")){root.addView(note("선택 기간에 표시할 데이터가 없습니다."),top(8));return;}
            JSONArray rows=array(dimension,"values");
            if(rows.length()==0)root.addView(body("해당 기간에 기록이 없습니다."),top(8));
            else root.addView(barChart(title, rows, "value", "count", Color.rgb(36, 84, 214)),top(10));
            if(dimension.optBoolean("hasMore"))root.addView(note("상위 100개를 표시합니다."),top(8));
        }

        void addAdDimension(LinearLayout root, JSONObject dimension, String title, JSONObject allDimensions, JSONObject currencySource) {
            if(!dimension.optBoolean("available")){root.addView(section(title),top(18));root.addView(note("선택 기간에 표시할 광고 성과가 없습니다."),top(8));return;}
            JSONArray rows=array(dimension,"values");
            if(rows.length()==0){root.addView(section(title),top(18));root.addView(body("해당 기간에 광고 기록이 없습니다."),top(8));}
            else root.addView(barChart(title, rows, "name", "leads", Color.rgb(8, 127, 115)),top(10));
            for(int i=0;i<rows.length();i++){
                JSONObject row=rows.optJSONObject(i);if(row==null)continue;
                String label = row.optString("name", row.optString("value", "확인할 수 없음"));
                root.addView(adRowCard(label,adHierarchy(row, allDimensions)+"광고비 "+money(row,"spend",currencySource)+" · 리드 "+withUnit(row,"leads","건")+
                    "\n노출 " + countWithUnit(row, "impressions", "회") + " · 링크 클릭 " + countWithUnit(row, "linkClicks", "회")+
                    "\nCPL " + ratio(row,"cpl",currencySource) + " · CPC " + ratio(row,"cpc",currencySource) + " · CPM " + ratio(row,"cpm",currencySource),
                    row, "캠페인별".equals(title) || "광고 세트".equals(title) || "광고 소재".equals(title)),top(7));
            }
            if(dimension.optBoolean("hasMore"))root.addView(note("광고비 기준 상위 100개를 표시합니다."),top(8));
        }

        String adHierarchy(JSONObject row, JSONObject allDimensions) {
            String campaign = row.optString("campaignId", "");
            String adset = row.optString("adsetId", "");
            if (campaign.isEmpty() && adset.isEmpty()) return "";
            String campaignName = dimensionName(obj(allDimensions, "campaigns"), campaign);
            String adsetName = dimensionName(obj(allDimensions, "adsets"), adset);
            if (!adset.isEmpty() && !campaign.isEmpty()) return "캠페인 " + displayName(campaignName, campaign) + " · 세트 " + displayName(adsetName, adset) + " · ";
            if (!campaign.isEmpty()) return "캠페인 " + displayName(campaignName, campaign) + " · ";
            return "세트 " + displayName(adsetName, adset) + " · ";
        }

        String dimensionName(JSONObject dimension, String id) {
            JSONArray values = array(dimension, "values");
            for (int i = 0; i < values.length(); i++) {
                JSONObject value = values.optJSONObject(i);
                if (value != null && id.equals(value.optString("id", ""))) return value.optString("name", "");
            }
            return "";
        }

        String displayName(String name, String id) {
            return name == null || name.isEmpty() ? id : name;
        }

        void flow(LinearLayout root) {
            JSONObject flow = flowAnalysis();
            LinearLayout legend = new LinearLayout(activity);
            legend.addView(pill("양호", Color.rgb(28,116,77)),weight());
            legend.addView(pill("점검", Color.rgb(176,70,54)),weight());
            legend.addView(pill("관찰", ACTION),weight());
            legend.addView(pill("판단불가", MUTED),weight());
            root.addView(legend,top(12));
            if (!available(flow)) {
                root.addView(card("마케팅 흐름", "확인할 수 없음\n방문·신청·접수 흐름 데이터가 제공되지 않습니다.", false), top(16));
                root.addView(note("흐름 데이터가 준비되면 현재·이전 기간과 출처별 전환을 함께 표시합니다."), top(10));
                addMetaFormPath(root);
                return;
            }
            root.addView(section("홈페이지 유입 경로"),top(16));
            root.addView(body("방문 → 신청 시작 → 실제 접수"),top(8));
            root.addView(section("출처별 흐름"), top(18));
            JSONArray sources = array(flow, "sources");
            for (int i = 0; i < sources.length(); i++) {
                JSONObject source = sources.optJSONObject(i);
                if (source != null) {
                    View sourceCard = flowSourceCard(source);
                    sourceCard.setOnClickListener(v -> { selectedSource = source.optString("channel", ""); open("signal"); });
                    root.addView(sourceCard, top(8));
                }
            }
            if (flow.optBoolean("sourcesHasMore", false)) root.addView(note("상위 100개 출처만 표시합니다."), top(8));
            addMetaFormPath(root);
            addFlowJudgment(root, flow);
            Button detail = action("인디케이터 상세 보기 →", ACTION);
            root.addView(detail, top(10)); detail.setOnClickListener(v -> open("signal"));
            root.addView(detailSheetTrigger("색상은 어떻게 결정하나요?", indicatorColorCriteria()), top(8));
        }

        View indicatorColorCriteria() {
            LinearLayout content = column();
            content.addView(body("양호: 목표 또는 비교 기준 충족, 충분한 표본, 최신 데이터."));
            content.addView(body("점검: 충분한 표본에서 의미 있는 하락 지속. 예시 기준은 이전 4%에서 현재 2%이며 방문 100 이상·이전 접수 10 이상입니다."), top(10));
            content.addView(body("관찰: 단기 변동, 표본 부족 또는 확인할 경고."), top(10));
            content.addView(body("판단불가: 필수 데이터 없음·수집 지연·추적 누락."), top(10));
            content.addView(body("임계값은 통계적 유의성을 입증한 규칙이 아니며, 채널 특성·계절·집계 지연을 함께 고려합니다."), top(10));
            return content;
        }

        void addMetaFormPath(LinearLayout root) {
            root.addView(card("Meta 내부 폼", "노출 → 링크 클릭 → Meta 리드 → 실제 저장\n내부 폼 전용 집계는 확인할 수 없습니다.\n홈페이지 방문 단계가 없는 별도 경로입니다.", false), top(16));
        }

        void signal(LinearLayout root) {
            JSONObject flow = flowAnalysis();
            if (!available(flow)) {
                root.addView(card("인디케이터 상세", "확인할 수 없음\n방문·신청·접수 흐름 데이터가 제공되지 않습니다.", false), top(16));
                return;
            }
            String sourceLabel = selectedSource.isEmpty() ? "전체 출처" : selectedSource;
            JSONObject selected = selectedFlowSource(flow, selectedSource);
            JSONObject current = obj(selected, "current");
            JSONObject previous = obj(selected, "previous");
            if (selectedSource.isEmpty()) {
                JSONObject totals = obj(flow, "totals");
                current = obj(totals, "current");
                previous = obj(totals, "previous");
            }
            root.addView(statusPill(statusForSource(selected)), top(10));
            root.addView(section("선택 출처 · " + sourceLabel), top(16));
            root.addView(funnelMetric("홈페이지 방문", current, previous, "visits"),top(16));
            root.addView(body("↓ 신청 시작률 " + flowRate(previous,"visitToApplicationStart") + " → " + flowRate(current,"visitToApplicationStart")),top(8));
            root.addView(funnelMetric("상담신청 시작", current, previous, "applicationStarts"),top(8));
            root.addView(body("↓ 신청 완료율 " + flowRate(previous,"applicationStartToSaved") + " → " + flowRate(current,"applicationStartToSaved")),top(8));
            root.addView(funnelMetric("실제 접수 완료", current, previous, "savedLeads"),top(8));
            root.addView(card("전환율 비교", "방문→신청 " + flowRate(previous, "visitToApplicationStart") + " → " + flowRate(current, "visitToApplicationStart") +
                "\n신청→접수 " + flowRate(previous, "applicationStartToSaved") + " → " + flowRate(current, "applicationStartToSaved") +
                "\n방문→접수 " + flowRate(previous, "visitToSaved") + " → " + flowRate(current, "visitToSaved"), true), top(12));
            addFlowJudgment(root, flow);
            addSelectedSourceNarrative(root, flow, selectedSource);
            root.addView(note("현재 수치만으로 폼이나 광고를 원인으로 확정할 수 없습니다. 광고비 자동 변경은 수행하지 않습니다."), top(12));
        }

        JSONObject flowAnalysis() {
            if (analytics == null) return new JSONObject();
            JSONObject value = analytics.optJSONObject("flowAnalysis");
            if (value == null) value = analytics.optJSONObject("flow_analysis");
            return value == null ? new JSONObject() : value;
        }

        JSONObject selectedFlowSource(JSONObject flow, String channel) {
            if (channel == null || channel.isEmpty()) return new JSONObject();
            JSONArray sources = array(flow, "sources");
            for (int i = 0; i < sources.length(); i++) {
                JSONObject source = sources.optJSONObject(i);
                if (source != null && channel.equals(source.optString("channel", ""))) return source;
            }
            return new JSONObject();
        }

        View flowSourceCard(JSONObject source) {
            JSONObject current = obj(source, "current");
            JSONObject previous = obj(source, "previous");
            String label = source.optString("channel", "확인할 수 없음");
            String value = "현재 방문 " + number(current, "visits") + " → 시작 " + number(current,"applicationStarts") + " → 접수 " + number(current, "savedLeads") +
                "\n이전 방문 " + number(previous, "visits") + " · 접수 " + number(previous, "savedLeads") +
                "\n방문→접수 " + flowRate(current, "visitToSaved");
            LinearLayout box = flatSurface();
            LinearLayout heading = new LinearLayout(activity);
            heading.setGravity(Gravity.CENTER_VERTICAL);
            heading.addView(text(label, 14, true, INK), weight());
            heading.addView(statusPill(statusForSource(source)));
            box.addView(heading);
            box.addView(text(value, 13, false, MUTED), top(8));
            View bottomRule = new View(activity);
            bottomRule.setBackgroundColor(LINE);
            box.addView(bottomRule, top(14));
            return box;
        }

        View adRateRows(JSONObject metrics) {
            LinearLayout box = column();
            box.setPadding(dp(15), dp(14), dp(15), dp(12));
            box.setBackground(round(PANEL, 6));
            box.addView(labeledMetricRow("CPM · 노출 1,000회당", ratio(metrics, "cpm")));
            View divider = new View(activity);
            divider.setBackgroundColor(LINE);
            box.addView(divider, new LinearLayout.LayoutParams(-1, dp(1)));
            box.addView(labeledMetricRow("CTR · 링크 클릭률", percent(metrics, "ctrLink")), top(10));
            box.addView(text("노출 " + countWithUnit(metrics, "impressions", "회") + " · 전체 클릭 " + countWithUnit(metrics, "clicks", "회") +
                " · 링크 클릭 " + countWithUnit(metrics, "linkClicks", "회"), 11, false, MUTED), top(8));
            return box;
        }

        View videoViewingRows(JSONObject metrics, JSONObject dimensions) {
            LinearLayout box = column();
            box.setPadding(dp(15), dp(14), dp(15), dp(12));
            box.setBackground(round(PANEL, 6));
            JSONObject viewing = obj(metrics, "videoViewing");
            LinearLayout average = column();
            average.addView(text("영상 평균 시청시간", 13, false, MUTED));
            boolean explicitlyUnavailable = viewing.has("available") && !viewing.optBoolean("available", false);
            Double seconds = metricNumber(viewing, "avgWatchSec");
            Double plays = numericFrom(viewing, "videoPlays", "video_plays", "plays");
            if (!explicitlyUnavailable && seconds == null) seconds = metricNumber(metrics, "videoAvgWatchSec");
            if (!explicitlyUnavailable && plays == null) plays = numericFrom(metrics, "videoPlays");
            String value;
            String detail;
            if (!explicitlyUnavailable && seconds != null && !seconds.isNaN() && !seconds.isInfinite()) {
                value = String.format(Locale.US, "%.2f초", seconds);
                detail = "재생수로 가중한 평균 · 자동 재생 포함" + (plays == null ? "" : " · 재생 " + formatCount(plays) + "회");
            } else if (plays != null && plays == 0d) {
                value = "재생 0회";
                detail = "선택 기간에 실제 영상 재생이 없습니다.";
            } else {
                value = "시청시간 미수집";
                detail = "선택 기간에 영상 시청시간이 수집되지 않았습니다.";
            }
            average.addView(text(value, 18, true, INK), top(7));
            average.addView(text(detail, 11, false, MUTED), top(4));
            box.addView(average);
            View divider = new View(activity);
            divider.setBackgroundColor(LINE);
            box.addView(divider, top(12));
            addVideoDistribution(box, "시청 플랫폼", obj(dimensions, "video_platform"), "영상 재생 기준 · 자동 재생 포함");
            addVideoDistribution(box, "시청 연령대", obj(dimensions, "video_age_gender"), "영상 재생 기준 · 실제 수집된 연령 구간 표시");
            return box;
        }

        void addVideoDistribution(LinearLayout box, String heading, JSONObject dimension, String detail) {
            box.addView(text(heading, 13, true, INK), top(12));
            if (!available(dimension)) {
                box.addView(text("시청 분포 미수집", 14, true, INK), top(7));
                box.addView(text("선택 기간에 해당 시청 분포가 수집되지 않았습니다.", 11, false, MUTED), top(4));
                return;
            }
            JSONArray values = array(dimension, "values");
            if (values.length() == 0) {
                box.addView(text("시청 기록 0회", 14, true, INK), top(7));
                box.addView(text("선택 기간에 표시할 시청 분포가 없습니다.", 11, false, MUTED), top(4));
                return;
            }
            double total = 0d;
            boolean hasCounts = false;
            for (int i = 0; i < values.length(); i++) {
                Double count = distributionCount(values.optJSONObject(i));
                if (count != null && count >= 0d) { total += count; hasCounts = true; }
            }
            for (int i = 0; i < values.length(); i++) {
                JSONObject row = values.optJSONObject(i);
                if (row == null) continue;
                Double count = distributionCount(row);
                Double share = distributionShare(row);
                if (share == null && count != null && hasCounts && total > 0d) share = count / total;
                StringBuilder caption = new StringBuilder(displayVideoLabel(row));
                if (share != null) caption.append(" · ").append(String.format(Locale.US, "%.1f%%", share * 100d));
                caption.append(" · ").append(count == null ? "횟수 미수집" : formatCount(count) + "회");
                box.addView(text(caption.toString(), 12, false, INK), top(9));
                if (share != null) {
                    LinearLayout.LayoutParams barParams = new LinearLayout.LayoutParams(-1, dp(7));
                    barParams.topMargin = dp(4);
                    box.addView(videoDistributionBar(share), barParams);
                }
            }
            box.addView(text(detail, 11, false, MUTED), top(8));
        }

        View videoDistributionBar(Double share) {
            LinearLayout track = new LinearLayout(activity);
            track.setBackgroundColor(LINE);
            float fraction = (float)Math.max(0d, Math.min(1d, share));
            if (fraction > 0f) {
                View bar = new View(activity);
                bar.setBackgroundColor(GOOD);
                track.addView(bar, new LinearLayout.LayoutParams(0, -1, fraction));
            }
            if (fraction < 1f) track.addView(new View(activity), new LinearLayout.LayoutParams(0, -1, 1f - fraction));
            return track;
        }

        String displayVideoLabel(JSONObject row) {
            String value = row == null ? "미확인" : row.optString("value", row.optString("label", "미확인"));
            String normalized = value.toLowerCase(Locale.US).replace("_", "-");
            if ("instagram".equals(normalized) || "ig".equals(normalized)) return "IG · Instagram";
            if ("facebook".equals(normalized) || "fb".equals(normalized)) return "FB · Facebook";
            String sub = row == null ? "" : row.optString("sub", "").trim();
            return sub.isEmpty() ? value : value + " · " + sub;
        }

        static Double distributionCount(JSONObject row) { return numericFrom(row, "videoPlays"); }
        static Double distributionShare(JSONObject row) {
            Double value = numericFrom(row, "share");
            if (value == null) return null;
            return value > 1d ? value / 100d : value;
        }
        static Double numericFrom(JSONObject row, String... keys) {
            if (row == null) return null;
            for (String key : keys) {
                Double value = metricNumber(row, key);
                if (value != null && !value.isNaN() && !value.isInfinite()) return value;
            }
            return null;
        }
        static String formatCount(Double value) { return String.format(Locale.KOREA, "%,d", Math.max(0L, Math.round(value))); }

        View labeledMetricRow(String label, String value) {
            LinearLayout row = new LinearLayout(activity);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.addView(text(label, 12, false, MUTED), weight());
            TextView amount = text(value, 18, true, INK);
            amount.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
            row.addView(amount, new LinearLayout.LayoutParams(dp(120), -2));
            return row;
        }

        View funnelMetric(String label, JSONObject current, JSONObject previous, String key) {
            LinearLayout box = column();
            box.setPadding(dp(15), dp(14), dp(15), dp(14));
            box.setBackground(round(PANEL, 6));
            LinearLayout heading = new LinearLayout(activity);
            heading.setGravity(Gravity.CENTER_VERTICAL);
            heading.addView(text(label, 14, true, INK), weight());
            TextView value = text(number(current, key), 24, true, INK);
            value.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
            heading.addView(value, new LinearLayout.LayoutParams(dp(116), -2));
            box.addView(heading);
            TextView prior = text("이전 " + number(previous, key), 11, false, MUTED);
            prior.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
            box.addView(prior, top(5));
            return box;
        }

        String statusForSource(JSONObject source) {
            JSONObject judgment = obj(source, "judgment");
            String status = judgment.optString("status", "");
            if (status.isEmpty()) status = source.optString("source_status", source.optString("status", ""));
            if ("good".equals(status)) return AnalyticsSourceStatus.RECEIPT;
            if ("risk".equals(status)) return AnalyticsSourceStatus.NONE;
            if (AnalyticsSourceStatus.RECEIPT.equals(status) || AnalyticsSourceStatus.NONE.equals(status)
                    || AnalyticsSourceStatus.SAMPLE.equals(status) || AnalyticsSourceStatus.QUALITY.equals(status)
                    || AnalyticsSourceStatus.INACTIVE.equals(status)) return status;
            Long visits = source.isNull("visits") ? null : Long.valueOf(source.optLong("visits"));
            Long saved = source.isNull("count") ? null : Long.valueOf(source.optLong("count"));
            JSONObject current = obj(source, "current");
            if (visits == null && !current.isNull("visits")) visits = Long.valueOf(current.optLong("visits"));
            if (saved == null && !current.isNull("savedLeads")) saved = Long.valueOf(current.optLong("savedLeads"));
            return AnalyticsSourceStatus.fromMetrics(false, visits, saved);
        }

        String flowRate(JSONObject period, String key) {
            JSONObject rates = obj(period, "rates");
            JSONObject rate = obj(rates, key);
            if (rate.isNull("value")) return "확인할 수 없음";
            double value = rate.optDouble("value", Double.NaN);
            return !Double.isNaN(value) && !Double.isInfinite(value) ? String.format(Locale.US, "%.2f%%", value * 100d) : "확인할 수 없음";
        }

        void addFlowJudgment(LinearLayout root, JSONObject flow) {
            JSONObject judgment = obj(flow, "judgment");
            String status = judgment.optString("status", "unavailable");
            String label = "good".equals(status) ? "양호" : "risk".equals(status) ? "점검" : "watch".equals(status) ? "관찰" : "판단불가";
            String reason = "unavailable".equals(status) ? "확인된 성과 기준이 설정되지 않았습니다." : "집계된 성과를 기준으로 표시합니다.";
            root.addView(card("판정", label + "\n" + reason, false), top(14));
        }

        void addSelectedSourceNarrative(LinearLayout root, JSONObject flow, String sourceFilter) {
            JSONArray facts = array(flow, "facts");
            int shownFacts = 0;
            int shownHypotheses = 0;
            for (int i = 0; i < facts.length(); i++) {
                JSONObject fact = facts.optJSONObject(i);
                if (fact == null) continue;
                if (!sourceFilter.isEmpty() && !sourceFilter.equals(fact.optString("source", ""))) continue;
                if (shownFacts == 0) root.addView(section("판단 근거 · 확인된 사실"), top(18));
                root.addView(note(flowFactText(fact)), top(7));
                shownFacts++;
            }
            JSONArray hypotheses = array(flow, "hypotheses");
            for (int i = 0; i < hypotheses.length(); i++) {
                JSONObject hypothesis = hypotheses.optJSONObject(i);
                if (hypothesis == null) continue;
                if (shownHypotheses == 0) root.addView(section("확인할 가설과 보완안"), top(18));
                root.addView(note(flowHypothesisText(hypothesis)), top(7));
                shownHypotheses++;
            }
            if (shownFacts == 0 && shownHypotheses == 0) root.addView(note("선택 출처에 표시할 근거가 없습니다."), top(12));
        }

        String flowFactText(JSONObject fact) {
            String source = fact.optString("source", "전체");
            String period = "previous".equals(fact.optString("period", "")) ? "이전 기간" : "현재 기간";
            String key = fact.optString("key", "");
            String label = "visits".equals(key) ? "방문" : "application_starts".equals(key) ? "신청 시작" : "saved_leads".equals(key) ? "상담 접수" : "visitToSaved".equals(key) ? "방문→접수율" : "applicationStartToSaved".equals(key) ? "신청→접수율" : "visitToApplicationStart".equals(key) ? "방문→신청율" : "접수 변화";
            Object value = fact.opt("value");
            if (value instanceof JSONObject) {
                JSONObject change = (JSONObject) value;
                String absolute = change.has("absolute") && !change.isNull("absolute") ? scalar(change, "absolute") : "확인할 수 없음";
                return source + " · " + period + " · " + label + " " + absolute + ("확인할 수 없음".equals(absolute) ? "" : "건") + " 변화";
            }
            if (fact.has("value") && !fact.isNull("value") && (key.contains("rate") || key.contains("To"))) return source + " · " + period + " · " + label + " " + String.format(Locale.US, "%.2f%%", fact.optDouble("value") * 100d);
            return source + " · " + period + " · " + label + " " + (fact.isNull("value") ? "확인할 수 없음" : scalar(fact, "value"));
        }

        String flowHypothesisText(JSONObject hypothesis) {
            String label = hypothesis.optString("label", hypothesis.optString("title", "검토할 가설"));
            String body = hypothesis.optString("text", hypothesis.optString("summary", hypothesis.optString("reason", "추가 확인이 필요합니다.")));
            return label + " · " + body;
        }

        void brief(LinearLayout root) {
            root.addView(latestBriefingView(), top(16));
            root.addView(flatCard("데일리브리핑 · 10:00 KST", "어제 성과와 다음 점검을 확인합니다."), top(16));
            if (notifications == null) {
                if (briefingError) {
                    root.addView(flatCard("브리핑 상태", "알림을 불러오지 못했습니다."), top(10));
                    Button retry = action("다시 불러오기", ACTION);
                    root.addView(retry, top(10));
                    retry.setOnClickListener(v -> { notifications = null; loadBriefing(); });
                    return;
                }
                root.addView(body("브리핑 알림을 불러오는 중입니다."), top(10));
                return;
            }
            JSONArray rows = array(notifications, "notifications");
            boolean found = false;
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.optJSONObject(i);
                JSONObject payload = obj(row, "payload");
                if (row == null || !"daily_briefing".equals(payload.optString("kind", ""))) continue;
                String briefingDate = payload.optString("date", "");
                if (briefingDate.isEmpty()) briefingDate = notificationDate(row);
                if (!withinSelectedRange(briefingDate)) continue;
                found = true;
                JSONObject content = obj(payload, "content");
                root.addView(flatCard(briefingDate.isEmpty() ? "데이터 기간" : briefingDate,
                    briefingText(content)), top(10));
                addBriefMetrics(root, content);
                JSONObject flow = obj(content, "flow");
                root.addView(section("읽어야 할 변화"), top(18));
                if (flow.optBoolean("available", false)) {
                    JSONObject totals=obj(flow,"totals"), current=obj(totals,"current"), previous=obj(totals,"previous");
                    String change="방문 "+scalar(previous,"visits")+" → "+scalar(current,"visits")+" · 접수 "+scalar(previous,"savedLeads")+" → "+scalar(current,"savedLeads");
                    root.addView(flatCard("이전 7일 → 최근 7일",change+" / 방문→접수율 "+flowRate(previous,"visitToSaved")+" → "+flowRate(current,"visitToSaved")),top(8));
                }
                else root.addView(note("최근 비교 기간의 방문·접수 변화는 아직 확인할 수 없습니다."), top(8));
                root.addView(section("오늘의 점검 순서"), top(18));
                JSONArray hypotheses = array(content, "hypotheses");
                if (hypotheses.length() == 0) root.addView(note("확인된 변화가 부족해 점검 순서를 정할 수 없습니다."), top(8));
                for (int h=0; h<hypotheses.length(); h++) {
                    JSONObject hypothesis=hypotheses.optJSONObject(h);
                    if(hypothesis!=null) root.addView(note(flowHypothesisText(hypothesis)),top(8));
                }
                Button evidence=action("근거와 인디케이터 보기",ACTION);
                root.addView(evidence,top(16)); evidence.setOnClickListener(v->open("signal"));
                JSONObject period=obj(content,"period");
                LinearLayout dataStatus=column();
                dataStatus.addView(body("광고 집계 기간 · "+scalar(period,"start")+" ~ "+scalar(period,"end")));
                dataStatus.addView(body("광고 지표와 최근 비교 기간의 변화를 구분해 확인합니다."));
                dataStatus.addView(body(currencyDetail(obj(content,"metrics"))));
                root.addView(expandableBlock("보고 기간·데이터 상태",dataStatus,false),top(12));
            }
            if (!found && !available(latestBriefing)) root.addView(note("선택 기간에 데일리브리핑이 없습니다."), top(10));
            if (briefingHasMore) {
                Button more = action("더 불러오기", ACTION);
                root.addView(more, top(10));
                more.setOnClickListener(v -> {
                    briefingLoading = true;
                    briefingHasMore = false;
                    loadBriefingPage(++generation, briefingNextCursor, briefingRows == null ? new JSONArray() : briefingRows);
                });
            }
        }

        View latestBriefingView() {
            LinearLayout box = column();
            box.setPadding(dp(15), dp(14), dp(15), dp(14));
            box.setBackground(round(PANEL, 6));
            box.addView(text("10시 이미지 브리핑 · 전문가 분석", 15, true, INK));
            if (latestBriefingLoading && latestBriefing == null) {
                box.addView(body("최신 브리핑을 불러오는 중입니다."), top(8));
                return box;
            }
            if (latestBriefingLoading) box.addView(body("최신 발행 여부를 확인하는 중입니다."), top(8));
            if (latestBriefingError) {
                box.addView(body("이미지와 전문 분석을 불러오지 못했습니다."), top(8));
                Button retry = action("다시 불러오기", ACTION);
                box.addView(retry, top(10));
                retry.setOnClickListener(v -> {
                    latestBriefingLoaded = false;
                    latestBriefingError = false;
                    latestBriefing = null;
                    latestBriefingImage = null;
                    loadLatestBriefing();
                });
                return box;
            }
            if (latestBriefing == null || !latestBriefing.optBoolean("available", false)) {
                box.addView(body("선택한 분석 기간의 브리핑 자료가 없습니다."), top(8));
                return box;
            }
            String reportDate = latestBriefing.optString("report_date", "");
            if (!reportDate.isEmpty()) box.addView(body("분석 대상일 · " + reportDate + " · KST"), top(6));
            String publishedAt = latestBriefing.optString("published_at", "");
            if (!publishedAt.isEmpty()) box.addView(body("발행 · " + refreshTime(publishedAt) + " · 전일 성과 분석"), top(4));
            String analysis = latestBriefing.optString("analysis", "").trim();
            if (analysis.isEmpty()) analysis = "전문 분석 자료가 아직 없습니다.";
            box.addView(BriefInfographicView.create(activity, latestBriefing.optJSONObject("visualization"), analysis), top(14));
            if (latestBriefingImage != null) {
                ImageView image = new ImageView(activity);
                image.setImageBitmap(latestBriefingImage);
                image.setAdjustViewBounds(true);
                image.setScaleType(ImageView.ScaleType.FIT_CENTER);
                image.setContentDescription("데일리브리핑 이미지 " + reportDate);
                image.setOnClickListener(v -> BriefImageDialog.show(activity, latestBriefingImage, reportDate));
                box.addView(image, top(12));
                Button enlarge = action("이미지 크게 보기", ACTION);
                enlarge.setOnClickListener(v -> BriefImageDialog.show(activity, latestBriefingImage, reportDate));
                box.addView(enlarge, top(8));
            } else if (latestBriefingImageError) {
                box.addView(body("기존 이미지 자료를 표시할 수 없습니다."), top(10));
            } else {
                box.addView(body("기존 이미지 자료를 불러오는 중입니다."), top(10));
            }
            return box;
        }

        void addBriefMetrics(LinearLayout root, JSONObject content) {
            JSONObject metrics = obj(content, "metrics");
            if (metrics.length() == 0) return;
            LinearLayout first = new LinearLayout(activity);
            first.addView(metric("어제 광고비", scalar(metrics, "spend"), currencyDetail(metrics)), weight());
            first.addView(metric("어제 Meta 리드", scalar(metrics, "leads"), "Meta 보고 리드"), weight());
            root.addView(first, top(10));
            LinearLayout second = new LinearLayout(activity);
            second.addView(metric("CPL", scalar(metrics, "cpl"), "광고비 ÷ Meta 리드"), weight());
            second.addView(metric("CPC", scalar(metrics, "cpc"), "광고비 ÷ 링크 클릭"), weight());
            root.addView(second, top(10));
            double ctr=metrics.optDouble("ctr",Double.NaN);
            String ctrText=Double.isNaN(ctr)||Double.isInfinite(ctr)?"확인할 수 없음":String.format(Locale.US,"%.2f%%",ctr*100d);
            root.addView(card("CPM · CTR", "CPM " + scalar(metrics, "cpm") + " · 링크 CTR " + ctrText +
                "\n노출 " + integer(metrics, "impressions") + " · 링크 클릭 " + integer(metrics, "linkClicks"), false), top(8));
        }

        String scalar(JSONObject object, String key) {
            if (object == null || !object.has(key) || object.isNull(key)) return "확인할 수 없음";
            Object value = object.opt(key);
            if (value == null) return "확인할 수 없음";
            try {
                java.math.BigDecimal numeric = new java.math.BigDecimal(String.valueOf(value));
                java.text.NumberFormat format = java.text.NumberFormat.getNumberInstance(Locale.US);
                format.setMaximumFractionDigits(Math.max(0, numeric.scale()));
                return format.format(numeric);
            } catch (NumberFormatException ignored) { return String.valueOf(value); }
        }

        String notificationDate(JSONObject row) {
            String value = row == null ? "" : row.optString("created_at", "");
            if (value.isEmpty()) return "";
            try {
                return ZonedDateTime.ofInstant(Instant.parse(value), ZoneId.of("Asia/Seoul")).toLocalDate().format(DATE);
            } catch (Exception ignored) {
                return value.length() >= 10 ? value.substring(0, 10) : "";
            }
        }

        boolean withinSelectedRange(String value) {
            if (value == null || value.length() < 10) return false;
            String date = value.substring(0, 10);
            return date.compareTo(start) >= 0 && date.compareTo(end) <= 0;
        }

        void addMenu(LinearLayout root, String key, String label, String detail) {
            if (root.getChildCount() > 0) {
                View divider = new View(activity);
                divider.setBackgroundColor(LINE);
                LinearLayout.LayoutParams rule = new LinearLayout.LayoutParams(-1, dp(1));
                rule.leftMargin = dp(16); rule.rightMargin = dp(16);
                root.addView(divider, rule);
            }
            LinearLayout row = new LinearLayout(activity);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setPadding(dp(16), dp(15), dp(16), dp(15));
            row.setMinimumHeight(dp(64));
            LinearLayout labels = column();
            labels.addView(text(label, 15, true, INK));
            labels.addView(text(detail, 12, false, MUTED), top(5));
            row.addView(labels, new LinearLayout.LayoutParams(0, -2, 1));
            TextView arrow = text("›", 22, false, MUTED);
            arrow.setPadding(dp(12), 0, 0, 0);
            row.addView(arrow);
            row.setClickable(true); row.setFocusable(true);
            row.setOnClickListener(v -> open(key));
            root.addView(row, new LinearLayout.LayoutParams(-1, -2));
        }

        View expandableBlock(String title, View content, boolean open) {
            return detailSheetTrigger(title, content);
        }

        View detailSheetTrigger(String title, View content) {
            LinearLayout row = new LinearLayout(activity);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setPadding(dp(2), dp(14), dp(2), dp(14));
            row.setMinimumHeight(dp(60));
            TextView leading = text("▥", 16, false, MUTED);
            leading.setGravity(Gravity.CENTER);
            leading.setBackground(round(Color.TRANSPARENT, 9));
            row.addView(leading, new LinearLayout.LayoutParams(dp(31), dp(31)));
            TextView label = text(title, 12, true, INK);
            LinearLayout.LayoutParams labelParams = new LinearLayout.LayoutParams(0, -2, 1);
            labelParams.leftMargin = dp(12);
            row.addView(label, labelParams);
            TextView arrow = text("›", 22, false, MUTED);
            arrow.setGravity(Gravity.CENTER);
            row.addView(arrow, new LinearLayout.LayoutParams(dp(24), dp(31)));
            View divider = new View(activity);
            divider.setBackgroundColor(LINE);
            LinearLayout wrapper = column();
            wrapper.addView(row);
            wrapper.addView(divider, new LinearLayout.LayoutParams(-1, dp(1)));
            row.setClickable(true);
            row.setFocusable(true);
            row.setContentDescription(title + " 상세 열기");
            row.setOnClickListener(v -> showInfoSheet(title, content));
            return wrapper;
        }

        void showInfoSheet(String title, View content) {
            Dialog dialog = new Dialog(activity);
            dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
            LinearLayout sheet = column();
            sheet.setBackground(round(PANEL, 26));
            View grip = new View(activity);
            grip.setBackground(round(Color.rgb(216, 211, 202), 4));
            LinearLayout.LayoutParams gripParams = new LinearLayout.LayoutParams(dp(34), dp(4));
            gripParams.gravity = Gravity.CENTER_HORIZONTAL;
            gripParams.topMargin = dp(10);
            sheet.addView(grip, gripParams);
            LinearLayout header = new LinearLayout(activity);
            header.setGravity(Gravity.CENTER_VERTICAL);
            header.setPadding(dp(22), dp(14), dp(18), dp(12));
            header.addView(text(title, 20, true, INK), new LinearLayout.LayoutParams(0, -2, 1));
            Button close = textButton("×");
            close.setTextSize(24);
            close.setGravity(Gravity.CENTER);
            close.setContentDescription("닫기");
            close.setBackground(round(Color.rgb(242, 238, 231), 18));
            header.addView(close, new LinearLayout.LayoutParams(dp(36), dp(36)));
            sheet.addView(header);
            ScrollView scroll = new ScrollView(activity);
            scroll.setFillViewport(true);
            LinearLayout contentHost = column();
            contentHost.setPadding(dp(18), 0, dp(18), dp(20));
            contentHost.addView(content);
            dialog.setOnDismissListener(ignored -> contentHost.removeView(content));
            scroll.addView(contentHost, new ScrollView.LayoutParams(-1, -2));
            sheet.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
            close.setOnClickListener(v -> dialog.dismiss());
            dialog.setContentView(sheet);
            Window window = dialog.getWindow();
            if (window != null) {
                window.setBackgroundDrawableResource(android.R.color.transparent);
                window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
                WindowManager.LayoutParams params = window.getAttributes();
                params.width = WindowManager.LayoutParams.MATCH_PARENT;
                params.gravity = Gravity.BOTTOM;
                params.dimAmount = 0.34f;
                window.setAttributes(params);
            }
            dialog.show();
            Window shown = dialog.getWindow();
            if (shown != null) {
                shown.setLayout(-1, Math.min(dp(620), activity.getResources().getDisplayMetrics().heightPixels * 85 / 100));
                shown.setGravity(Gravity.BOTTOM);
            }
        }

        void open(String next) {
            page = next;
            if ("meta".equals(next) && metaCardsPayload == null && !metaCardsLoading) loadMetaCards(true);
            if ("brief".equals(next)) {
                notifications = null;
                briefingError = false;
                briefingLoading = false;
                briefingRows = null;
                briefingNextCursor = "";
                briefingHasMore = false;
                refreshBriefingIfVisible(true);
            }
            render();
        }

        boolean handleBack() {
            if (!"hub".equals(page)) {
                page = "hub";
                render();
                return true;
            }
            if (exitAnalytics != null) {
                exitAnalytics.run();
                return true;
            }
            return false;
        }

        JSONObject source(String key) {
            JSONArray rows = array(analytics, "sources");
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.optJSONObject(i);
                if (row != null && key.equals(row.optString("key", ""))) return row;
            }
            JSONObject missing = new JSONObject();
            try { missing.put("key", key); missing.put("available", false); missing.put("reason", "source_not_returned"); }
            catch (Exception ignored) { }
            return missing;
        }

        JSONObject sourceMetrics(JSONObject source, String key) {
            JSONObject metrics = obj(source, "metrics");
            if (metrics.length() == 0) return new JSONObject();
            if ("meta_ads".equals(key)) {
                JSONObject ads = metrics.optJSONObject("ads");
                if (ads != null && ads.length() > 0) return ads;
            }
            return metrics;
        }

        View sourceSummary(JSONObject source, String label) {
            if (!available(source)) return card(label, "이 기간에 집계된 데이터가 없습니다.", false);
            JSONObject metrics = obj(source, "metrics");
            String key = source.optString("key", "");
            String value = "sessions".equals(key) ? integer(metrics, "sessions") + "건" :
                "pixel_events".equals(key) ? integer(metrics, "events") + "건" :
                "meta_ads".equals(key) ? integer(metrics, "leads") + "건" : integer(metrics, "saved") + "건";
            LinearLayout box = column();
            box.setPadding(dp(15), dp(14), dp(15), dp(14));
            box.setBackground(round(PANEL, 6));
            box.addView(text(label, 14, true, INK));
            box.addView(text(value, 20, true, INK), top(8));
            box.addView(text("분모 · " + denominatorLabel(key, source.optString("denominator", "")), 12, false, MUTED), top(5));
            box.addView(text("갱신 · " + refreshTime(source.optString("refreshed_at", "")), 12, false, MUTED), top(3));
            return box;
        }

        String refreshLabel() {
            return analytics == null ? "확인할 수 없음" : refreshTime(analytics.optString("refreshed_at", ""));
        }

        String refreshTime(String value) {
            if (value == null || value.isEmpty()) return "확인할 수 없음";
            try {
                return ZonedDateTime.ofInstant(Instant.parse(value), ZoneId.of("Asia/Seoul"))
                    .format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm", Locale.KOREA)) + " KST";
            } catch (Exception ignored) {
                return value;
            }
        }

        String denominatorLabel(String key, String raw) {
            if ("saved_estimates".equals(key)) return "상담 접수 기준";
            if ("sessions".equals(key)) return "비봇 페이지 방문 세션";
            if ("pixel_events".equals(key)) return "수집 이벤트";
            if ("meta_ads".equals(key)) return "Meta 광고 보고 리드";
            return raw == null || raw.isEmpty() ? "확인할 수 없음" : "집계 기준";
        }

        String pageTitle(String key) {
            if ("intake".equals(key)) return "접수통계";
            if ("traffic".equals(key)) return "유입통계";
            if ("meta".equals(key)) return "Meta 광고";
            if ("flow".equals(key)) return "마케팅 흐름";
            if ("signal".equals(key)) return "접수 구간을 점검하세요";
            return "데일리브리핑";
        }

        String pageSubtitle(String key) {
            if ("intake".equals(key)) return "접수량뿐 아니라 상담·계약까지";
            if ("traffic".equals(key)) return "어디서 와서, 어디까지 이어졌는지";
            if ("meta".equals(key)) return connectedAccountSubtitle();
            if ("flow".equals(key)) return "잘되는 곳은 유지하고, 약한 곳은 보완";
            if ("signal".equals(key)) return "인스타그램 광고 → 홈페이지";
            return "매일 오전 10시 · KST";
        }

        String connectedAccountSubtitle() {
            String tenantLabel = analytics == null ? "" : analytics.optString("tenant_name", "").trim();
            if (tenantLabel.isEmpty() && analytics != null) tenantLabel = analytics.optString("company_name", "").trim();
            if (tenantLabel.isEmpty() && analytics != null) {
                JSONObject tenant = analytics.optJSONObject("tenant");
                tenantLabel = tenant == null ? "" : tenant.optString("name", "").trim();
            }
            return tenantLabel.isEmpty() ? "연결 계정 · 조회·분석" : tenantLabel + " 연결 계정 · 조회·분석";
        }

        String currencyDetail(JSONObject metrics) {
            String currency = metrics == null ? "" : metrics.optString("account_currency", "");
            if (currency.isEmpty() || "null".equalsIgnoreCase(currency)) currency = metrics == null ? "" : metrics.optString("currency", "");
            if ("null".equalsIgnoreCase(currency)) currency = "";
            return currency.isEmpty() ? "계정 통화 확인 필요" : "계정 통화 " + currency;
        }

        String briefingText(JSONObject content) {
            StringBuilder text = new StringBuilder();
            JSONArray facts = array(content, "facts");
            for (int i = 0; i < facts.length(); i++) {
                JSONObject fact = facts.optJSONObject(i);
                if (fact != null) text.append("• ").append(briefFactText(fact)).append("\n");
            }
            JSONArray hypotheses = array(content, "hypotheses");
            if (hypotheses.length() > 0) {
                text.append("\n검토할 가설\n");
                for (int i = 0; i < hypotheses.length(); i++) {
                    JSONObject hypothesis = hypotheses.optJSONObject(i);
                    if (hypothesis != null) text.append("• ").append(flowHypothesisText(hypothesis)).append("\n");
                }
            }
            if (text.length() == 0) text.append("표시할 브리핑 내용이 없습니다.");
            return text.toString().trim();
        }

        String briefFactText(JSONObject fact) {
            String key = fact.optString("key", "");
            String label = fact.optString("label", "");
            if (label.isEmpty()) label = "visits".equals(key) ? "방문" :
                "application_starts".equals(key) ? "신청 시작" :
                "saved_leads".equals(key) ? "상담 접수" :
                "visitToSaved".equals(key) ? "방문→접수율" :
                "applicationStartToSaved".equals(key) ? "신청→접수율" :
                "visitToApplicationStart".equals(key) ? "방문→신청율" : "확인된 사실";
            Object value = fact.opt("value");
            if (value instanceof JSONObject) return label + " · " + flowFactText(fact);
            if (value instanceof JSONArray) return label + " · 세부 항목 " + ((JSONArray) value).length() + "건";
            if (fact.isNull("value")) return label + " · 확인할 수 없음";
            if (key.contains("rate") || key.contains("To")) {
                double rate = fact.optDouble("value", Double.NaN);
                return label + " · " + (!Double.isNaN(rate) && !Double.isInfinite(rate) ? String.format(Locale.US, "%.2f%%", rate * 100d) : "확인할 수 없음");
            }
            return label + " · " + scalar(fact, "value");
        }

        static boolean available(JSONObject o) { return o != null && o.optBoolean("available", false); }

        static JSONObject obj(JSONObject parent, String key) { return parent == null ? new JSONObject() : parent.optJSONObject(key) == null ? new JSONObject() : parent.optJSONObject(key); }
        static JSONArray array(JSONObject parent, String key) { return parent == null || parent.optJSONArray(key) == null ? new JSONArray() : parent.optJSONArray(key); }
        static String integer(JSONObject o, String key) { return o == null || !o.has(key) || o.isNull(key) ? "확인할 수 없음" : String.format(Locale.KOREA, "%,d", o.optLong(key)); }
        static String number(JSONObject o, String key) { return integer(o, key).equals("확인할 수 없음") ? "미집계" : integer(o, key) + "건"; }
        static String countWithUnit(JSONObject o, String key, String unit) {
            String value = integer(o, key);
            return "확인할 수 없음".equals(value) ? value : value + unit;
        }
        static String currency(JSONObject o) {
            if (o != null) {
                String value = o.optString("account_currency", "").trim();
                if (value.isEmpty()) value = o.optString("currency", "").trim();
                if (!value.isEmpty()) return value.toUpperCase(Locale.US);
            }
            return "";
        }
        static String currencyPrefix(String code) { return "USD".equals(code) ? "$" : code.isEmpty() ? "" : code + " "; }
        static String money(JSONObject o, String key) { return money(o, key, o); }
        static String money(JSONObject o, String key, JSONObject currencySource) { return o == null || o.isNull(key) ? "확인할 수 없음" : currencyPrefix(currency(currencySource)) + String.format(Locale.US, "%,.2f", o.optDouble(key)); }
        static String ratio(JSONObject o, String key) {
            return ratio(o, key, o);
        }
        static String ratio(JSONObject o, String key, JSONObject currencySource) {
            Double value = metricNumber(o, key);
            return value == null ? "확인할 수 없음" : currencyPrefix(currency(currencySource)) + String.format(Locale.US, "%,.2f", value);
        }
        static String percent(JSONObject o, String key) {
            Double value = metricNumber(o, key);
            return value == null ? "확인할 수 없음" : String.format(Locale.US, "%.2f%%", value * 100d);
        }
        static Double metricNumber(JSONObject object, String key) {
            return AnalyticsMetricFormatter.numeric(object, key);
        }

        View title(String h, String sub) {
            LinearLayout box = column();
            TextView heading = text(h, 25, true, INK); box.addView(heading);
            box.addView(text(sub, 14, false, MUTED), top(6));
            return wrap(box);
        }

        TextView section(String value) { return text(value, 15, true, INK); }
        TextView body(String value) { return text(value, 13, false, MUTED); }
        TextView pill(String value, int color) {
            TextView v = text(value, 10, true, color);
            v.setGravity(Gravity.CENTER);
            v.setPadding(dp(7), dp(4), dp(7), dp(4));
            v.setBackground(statusBackground(value));
            return v;
        }
        TextView statusPill(String status) {
            String label = "good".equals(status) ? "양호" : "risk".equals(status) ? "점검" : "watch".equals(status) ? "관찰" : "판단불가";
            int color = "good".equals(status) ? Color.rgb(30,109,79) : "risk".equals(status) ? Color.rgb(173,52,45) : "watch".equals(status) ? Color.rgb(138,91,18) : Color.rgb(102,112,120);
            return pill(label, color);
        }
        TextView sourceStatusPill(String status) {
            String label = AnalyticsSourceStatus.label(status);
            int color = AnalyticsSourceStatus.RECEIPT.equals(status) ? Color.rgb(30,109,79)
                : AnalyticsSourceStatus.NONE.equals(status) ? Color.rgb(173,52,45)
                : AnalyticsSourceStatus.SAMPLE.equals(status) ? Color.rgb(102,102,96)
                : AnalyticsSourceStatus.QUALITY.equals(status) ? Color.rgb(138,91,18)
                : Color.rgb(102,112,120);
            TextView value = pill(label, color);
            GradientDrawable background = new GradientDrawable();
            background.setColor(AnalyticsSourceStatus.RECEIPT.equals(status) ? Color.rgb(232,244,236)
                : AnalyticsSourceStatus.NONE.equals(status) ? Color.rgb(255,240,236)
                : AnalyticsSourceStatus.SAMPLE.equals(status) ? Color.rgb(242,242,239)
                : AnalyticsSourceStatus.QUALITY.equals(status) ? Color.rgb(255,244,220)
                : Color.rgb(237,240,241));
            background.setCornerRadius(dp(4));
            value.setBackground(background);
            return value;
        }
        GradientDrawable statusBackground(String value) {
            int background = "양호".equals(value) ? Color.rgb(232,244,236) : "점검".equals(value) ? Color.rgb(255,240,236) : "관찰".equals(value) ? Color.rgb(255,244,220) : Color.rgb(237,240,241);
            GradientDrawable d = new GradientDrawable();
            d.setColor(background);
            d.setCornerRadius(dp(4));
            return d;
        }
        TextView note(String value) { TextView v = text(value, 12, false, MUTED); v.setPadding(dp(13), dp(12), dp(13), dp(12)); v.setBackground(round(Color.rgb(246, 242, 235), 8)); return v; }
        View card(String heading, String value, boolean factual) {
            LinearLayout box = column(); box.setPadding(dp(15), dp(14), dp(15), dp(14)); box.setBackground(round(PANEL, 6));
            box.addView(text(heading, 14, true, INK)); box.addView(text(value, factual ? 17 : 13, factual, factual ? INK : MUTED), top(8));
            return box;
        }
        LinearLayout flatSurface() {
            LinearLayout box = column();
            box.setPadding(0, dp(20), 0, dp(20));
            box.setBackgroundColor(Color.TRANSPARENT);
            View topRule = new View(activity);
            topRule.setBackgroundColor(LINE);
            box.addView(topRule, new LinearLayout.LayoutParams(-1, dp(1)));
            return box;
        }
        View flatCard(String heading, String value) {
            LinearLayout box = flatSurface();
            box.addView(text(heading, 14, true, INK), top(14));
            box.addView(text(value, 13, false, MUTED), top(8));
            View bottomRule = new View(activity);
            bottomRule.setBackgroundColor(LINE);
            box.addView(bottomRule, top(14));
            return box;
        }
        View rowCard(String heading, String value) { return card(heading, value, false); }
        View adRowCard(String heading, String value, JSONObject row, boolean showStatus) {
            LinearLayout box = column();
            box.setPadding(dp(15), dp(14), dp(15), dp(14));
            box.setBackground(round(PANEL, 6));
            LinearLayout title = new LinearLayout(activity);
            title.setGravity(Gravity.CENTER_VERTICAL);
            title.addView(text(heading, 14, true, INK), weight());
            String status = showStatus ? adDeliveryStatus(row) : "";
            if (!status.isEmpty()) {
                    int color = "ON".equals(status) ? GOOD : MUTED;
                int background = "ON".equals(status) ? Color.rgb(232, 244, 236) : Color.rgb(237, 240, 241);
                TextView indicator = pill(status, color);
                indicator.setBackground(round(background, 4));
                title.addView(indicator, left(6));
            }
            box.addView(title);
            box.addView(text(value, 13, false, MUTED), top(8));
            return box;
        }
        String adDeliveryStatus(JSONObject row) {
            String raw = firstString(row, "effectiveStatus", "effective_status", "deliveryStatus", "delivery_status", "status").toUpperCase(Locale.ROOT);
            if ("ACTIVE".equals(raw) || "ON".equals(raw) || "ENABLED".equals(raw) || "LIVE".equals(raw) || "PUBLISHED".equals(raw)) return "ON";
            if ("PAUSED".equals(raw) || "ADSET_PAUSED".equals(raw) || "CAMPAIGN_PAUSED".equals(raw) || "OFF".equals(raw) || "INACTIVE".equals(raw) || "DISABLED".equals(raw) || "DELETED".equals(raw) || "ARCHIVED".equals(raw)) return "OFF";
            return "";
        }
        String firstString(JSONObject row, String... keys) {
            if (row == null) return "";
            for (String key : keys) {
                String value = row.optString(key, "").trim();
                if (!value.isEmpty()) return value;
            }
            return "";
        }
        View intakeBars(String heading, JSONArray rows, String labelKey, String valueKey, int highlighted, String detail) {
            LinearLayout box = column();
            box.setPadding(dp(16), dp(16), dp(16), dp(16));
            box.setBackground(round(PANEL, 6));
            box.addView(text(heading, 14, true, INK));
            double maximum = 0;
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.optJSONObject(i);
                if (row != null && row.opt(valueKey) instanceof Number) maximum = Math.max(maximum, row.optDouble(valueKey));
            }
            for (int i = 0; i < rows.length(); i++) {
                JSONObject item = rows.optJSONObject(i);
                if (item == null) continue;
                LinearLayout row = column();
                LinearLayout caption = new LinearLayout(activity);
                caption.setGravity(Gravity.CENTER_VERTICAL);
                caption.addView(text(item.optString(labelKey, "미확인"), 11, false, INK), weight());
                Object raw = item.opt(valueKey);
                String countText = raw instanceof Number ? String.format(Locale.KOREA, "%,d건", ((Number) raw).longValue()) : "미집계";
                TextView count = text(countText, 11, true, INK);
                count.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
                caption.addView(count, new LinearLayout.LayoutParams(dp(64), -2));
                row.addView(caption);
                LinearLayout track = new LinearLayout(activity);
                track.setBackground(round(Color.rgb(240, 242, 237), 4));
                track.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
                if (raw instanceof Number && maximum > 0) {
                    double value = ((Number) raw).doubleValue();
                    float fraction = (float)Math.max(0, Math.min(1, value / maximum));
                    if (fraction > 0) {
                        View fill = new View(activity);
                        fill.setBackgroundColor(i == highlighted ? Color.rgb(166, 140, 87) : Color.rgb(101, 133, 114));
                        track.addView(fill, new LinearLayout.LayoutParams(0, -1, fraction));
                    }
                    if (fraction < 1) track.addView(new View(activity), new LinearLayout.LayoutParams(0, -1, 1 - fraction));
                    row.addView(track, new LinearLayout.LayoutParams(-1, dp(7)));
                }
                box.addView(row, top(13));
            }
            if (!detail.isEmpty()) box.addView(text(detail, 11, false, MUTED), top(10));
            return box;
        }

        View barChart(String heading, JSONArray rows, String labelKey, String valueKey, int accent) {
            LinearLayout box = column();
            box.setPadding(dp(15), dp(14), dp(15), dp(12));
            box.setBackground(round(PANEL, 6));
            box.addView(text(heading, 14, true, INK));
            double maximum = 0;
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.optJSONObject(i);
                if (row != null && row.opt(valueKey) instanceof Number) maximum = Math.max(maximum, row.optDouble(valueKey));
            }
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.optJSONObject(i);
                if (row == null) continue;
                Object raw = row.opt(valueKey);
                String label = row.optString(labelKey, "미확인");
                LinearLayout caption = new LinearLayout(activity);
                caption.addView(text(label, 12, false, INK), new LinearLayout.LayoutParams(0, -2, 1));
                caption.addView(text(raw instanceof Number ? String.format(Locale.KOREA, "%,d", ((Number) raw).longValue()) + ("sessions".equals(valueKey) ? "세션" : "건") : "미집계", 12, true, INK));
                box.addView(caption, top(12));
                LinearLayout track = new LinearLayout(activity);
                track.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
                track.setBackgroundColor(Color.rgb(237, 235, 230));
                if (raw instanceof Number && maximum > 0) {
                    float fraction = (float)Math.max(0, Math.min(1, ((Number)raw).doubleValue()/maximum));
                    if (fraction > 0) { View bar = new View(activity); bar.setBackgroundColor(accent); track.addView(bar, new LinearLayout.LayoutParams(0, -1, fraction)); }
                    if (fraction < 1) track.addView(new View(activity), new LinearLayout.LayoutParams(0, -1, 1-fraction));
                }
                LinearLayout.LayoutParams trackParams = new LinearLayout.LayoutParams(-1, dp(7)); trackParams.topMargin = dp(5);
                if (raw instanceof Number) box.addView(track, trackParams);
            }
            return box;
        }
        View metric(String heading, String value, String detail) {
            LinearLayout box = column();
            box.setPadding(0, dp(14), dp(10), dp(14));
            box.addView(text(heading, 13, false, MUTED));
            boolean unavailable = value == null || value.contains("확인") || value.contains("미집계");
            box.addView(text(value, unavailable ? 16 : 30, true, INK), top(8));
            box.addView(text(detail, 12, false, MUTED), top(5));
            View line = new View(activity); line.setBackgroundColor(LINE);
            LinearLayout.LayoutParams rule = new LinearLayout.LayoutParams(-1, dp(1)); rule.topMargin = dp(16); box.addView(line, rule);
            return box;
        }
        View metricRow(View left, View right) { LinearLayout row = new LinearLayout(activity); row.addView(left, weight()); row.addView(right, weight()); return row; }

        Button rangeButton(String label, boolean selected) { Button b = action(label, selected ? ACTION : MUTED); b.setTextSize(12); b.setGravity(Gravity.CENTER); b.setBackground(round(selected ? Color.rgb(246, 238, 224) : PANEL, 8)); return b; }
        Button action(String label, int color) { Button b = textButton(label); b.setTextColor(color); b.setMinHeight(dp(48)); b.setMinimumHeight(dp(48)); b.setBackground(round(PANEL, 6)); return b; }
        Button textButton(String label) { Button b = new Button(activity); b.setStateListAnimator(null); b.setElevation(0); b.setText(label); b.setTextSize(14); b.setTextColor(INK); b.setAllCaps(false); b.setGravity(Gravity.START | Gravity.CENTER_VERTICAL); b.setPadding(dp(4), 0, dp(4), 0); b.setMinHeight(dp(48)); b.setMinimumHeight(dp(48)); b.setBackground(round(PANEL, 6)); return b; }
        TextView text(String value, float size, boolean bold, int color) { TextView v = new TextView(activity); v.setText(value == null ? "" : value); v.setTextSize(size); v.setTextColor(color); v.setGravity(Gravity.START | Gravity.CENTER_VERTICAL); if (bold) v.setTypeface(Typeface.DEFAULT, Typeface.BOLD); return v; }
        LinearLayout column() { LinearLayout v = new LinearLayout(activity); v.setOrientation(LinearLayout.VERTICAL); return v; }
        View wrap(View v) { return v; }
        LinearLayout.LayoutParams top(int margin) { LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2); p.topMargin = dp(margin); return p; }
        LinearLayout.LayoutParams weight() { return new LinearLayout.LayoutParams(0, -2, 1); }
        LinearLayout.LayoutParams left(int margin) { LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-2, -2); p.leftMargin = dp(margin); return p; }
        int dp(int value) { return (int) (value * activity.getResources().getDisplayMetrics().density + 0.5f); }
        GradientDrawable round(int color, int radius) { GradientDrawable d = new GradientDrawable(); d.setColor(color); d.setCornerRadius(dp(radius)); d.setStroke(dp(1), LINE); return d; }
        static String message(JSONObject body, String error, String fallback) { String value = body == null ? "" : body.optString("message", ""); return value.isEmpty() ? (error == null || error.isEmpty() ? fallback : error) : value; }
    }

}
