package kr.polarad.crm;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Locale;
import java.util.function.Consumer;
import java.util.function.IntConsumer;

public final class CalendarScreen {
    private static final int INK = Color.rgb(35, 35, 31);
    private static final int MUTED = Color.rgb(104, 102, 95);
    private static final int LINE = Color.rgb(229, 223, 211);
    private static final int PAPER = Color.rgb(250, 249, 246);
    private static final int CONSULT_DOT = Color.rgb(37, 99, 235);
    private static final int MEASURE_DOT = Color.rgb(234, 88, 12);
    private static final int MEASURE = Color.rgb(8, 127, 115);
    private static final int PANGYO = Color.rgb(185, 154, 114);
    private static final int GANGNAM = Color.rgb(163, 228, 217);
    private static final int GANGNAM_INK = Color.rgb(18, 61, 53);
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm", Locale.KOREA);
    private static final DateTimeFormatter CARD_DATE = DateTimeFormatter.ofPattern("M/d(E)", Locale.KOREA);

    private final Activity context;
    private final ApiClient api;
    private final Consumer<String> openCustomer;
    private final Consumer<String> addAppointmentByKind;
    private final IntConsumer authFailure;
    private final int consultColor;
    private final LinearLayout root;
    private final LinearLayout monthBody;
    private final LinearLayout agendaBody;
    private final TextView monthTitle;
    private final TextView statusText;
    private final ArrayList<Button> filters = new ArrayList<>();
    private final ArrayList<Appointment> appointments = new ArrayList<>();
    private YearMonth month;
    private LocalDate selectedDay;
    private String filter = "전체";
    private long requestSerial;
    private String nextPage = "";
    private final java.util.HashSet<String> visitedPages = new java.util.HashSet<>();

    public static View create(Activity context, ApiClient api, Consumer<String> openCustomer, Runnable addAppointment) {
        return create(context, api, openCustomer, kind -> { if (addAppointment != null) addAppointment.run(); }, CONSULT_DOT, null);
    }

    public static View create(Activity context, ApiClient api, Consumer<String> openCustomer, Consumer<String> addAppointmentByKind) {
        return create(context, api, openCustomer, addAppointmentByKind, CONSULT_DOT, null);
    }

    public static View create(Activity context, ApiClient api, Consumer<String> openCustomer, Runnable addAppointment, int consultColor) {
        return create(context, api, openCustomer, kind -> { if (addAppointment != null) addAppointment.run(); }, consultColor, null);
    }

    public static View create(Activity context, ApiClient api, Consumer<String> openCustomer, Consumer<String> addAppointmentByKind, int consultColor) {
        return create(context, api, openCustomer, addAppointmentByKind, consultColor, null);
    }

    public static View create(Activity context, ApiClient api, Consumer<String> openCustomer, Runnable addAppointment, IntConsumer authFailure) {
        return create(context, api, openCustomer, kind -> { if (addAppointment != null) addAppointment.run(); }, CONSULT_DOT, authFailure);
    }

    public static View create(Activity context, ApiClient api, Consumer<String> openCustomer, Consumer<String> addAppointmentByKind, IntConsumer authFailure) {
        return create(context, api, openCustomer, addAppointmentByKind, CONSULT_DOT, authFailure);
    }

    public static View create(Activity context, ApiClient api, Consumer<String> openCustomer, Runnable addAppointment, int consultColor, IntConsumer authFailure) {
        return create(context, api, openCustomer, kind -> { if (addAppointment != null) addAppointment.run(); }, consultColor, authFailure);
    }

    public static View create(Activity context, ApiClient api, Consumer<String> openCustomer, Consumer<String> addAppointmentByKind, int consultColor, IntConsumer authFailure) {
        return new CalendarScreen(context, api, openCustomer, addAppointmentByKind, consultColor, authFailure).view();
    }

    private final LinearLayout monthBar;

    private CalendarScreen(Activity context, ApiClient api, Consumer<String> openCustomer, Consumer<String> addAppointmentByKind, int consultColor, IntConsumer authFailure) {
        if (context == null || api == null) throw new IllegalArgumentException("context and api required");
        this.context = context;
        this.api = api;
        this.openCustomer = openCustomer;
        this.addAppointmentByKind = addAppointmentByKind;
        this.consultColor = consultColor;
        this.authFailure = authFailure;
        LocalDate today = LocalDate.now(KST);
        month = YearMonth.from(today);
        selectedDay = today;

        root = column(PAPER);
        root.setPadding(dp(18), dp(12), dp(18), dp(24));
        LinearLayout header = row(Gravity.CENTER_VERTICAL);
        LinearLayout titleBlock = column(Color.TRANSPARENT);
        titleBlock.addView(text("일정관리", 22, INK, true), full());
        TextView subtitle = text("상담과 실측을 한 캘린더에서", 11, MUTED, false);
        subtitle.setPadding(0, dp(4), 0, 0);
        titleBlock.addView(subtitle, full());
        header.addView(titleBlock, weight(1));
        root.addView(header, full());

        monthBar = row(Gravity.CENTER_VERTICAL);
        Button previous = compactAction("‹", 44);
        Button next = compactAction("›", 44);
        Button todayButton = compactAction("오늘", 52);
        monthTitle = text("", 17, INK, true);
        monthBar.addView(previous, wrap());
        monthBar.addView(monthTitle, weight(1));
        monthBar.addView(todayButton, wrap());
        monthBar.addView(next, wrap());
        previous.setOnClickListener(v -> changeMonth(-1));
        next.setOnClickListener(v -> changeMonth(1));
        todayButton.setOnClickListener(v -> { LocalDate d = LocalDate.now(KST); month = YearMonth.from(d); selectedDay = d; load(); });

        root.addView(filterBar(), fullMargin(0, 16, 0, 10));
        monthBody = column(Color.WHITE);
        monthBody.setPadding(dp(12), dp(10), dp(12), dp(12));
        GradientDrawable monthBackground = new GradientDrawable();
        monthBackground.setColor(Color.WHITE);
        monthBackground.setCornerRadius(dp(10));
        monthBackground.setStroke(dp(1), LINE);
        monthBody.setBackground(monthBackground);
        monthBody.addView(monthBar, fullMargin(0, 0, 0, 8));
        root.addView(monthBody, full());
        statusText = text("", 12, MUTED, false);
        root.addView(statusText, fullMargin(0, 14, 0, 0));
        agendaBody = column(Color.TRANSPARENT);
        root.addView(agendaBody, fullMargin(0, 10, 0, 0));
        load();
    }

    private View view() {
        return root;
    }

    private View filterBar() {
        HorizontalScrollView scroll = new HorizontalScrollView(context);
        scroll.setHorizontalScrollBarEnabled(false);
        LinearLayout bar = row(Gravity.CENTER_VERTICAL);
        addFilter(bar, "전체"); addFilter(bar, "상담"); addFilter(bar, "실측");
        scroll.addView(bar, new ViewGroup.LayoutParams(-1, dp(44)));
        return scroll;
    }

    private void addFilter(LinearLayout bar, String value) {
        Button button = action(value, false);
        filters.add(button);
        button.setOnClickListener(v -> { filter = value; render(); });
        bar.addView(button, margin(0, 0, 7, 0));
    }

    private void changeMonth(int amount) {
        month = month.plusMonths(amount);
        if (!YearMonth.from(selectedDay).equals(month)) selectedDay = month.atDay(1);
        load();
    }

    private void load() {
        final long serial = ++requestSerial;
        monthTitle.setText(month.getYear() + "년 " + month.getMonthValue() + "월");
        statusText.setText("일정을 불러오는 중…");
        monthBody.removeAllViews(); agendaBody.removeAllViews();
        appointments.clear(); nextPage = ""; visitedPages.clear();
        loadPage(serial, "");
    }

    private void loadPage(final long serial, final String cursor) {
        if (!visitedPages.add(cursor)) { showError("페이지 정보가 반복되어 조회를 중단했습니다."); return; }
        String from = month.atDay(1).atStartOfDay(KST).toInstant().toString();
        String to = month.plusMonths(2).atDay(1).atStartOfDay(KST).toInstant().toString();
        String path = "/api/mobile/appointments?from=" + Uri.encode(from) + "&to=" + Uri.encode(to) + "&limit=100";
        if (!cursor.isEmpty()) path += "&cursor=" + Uri.encode(cursor);
        api.call("GET", path, null, (body, status, error) ->
            context.runOnUiThread(() -> {
                if (serial != requestSerial) return;
                if (status < 200 || status >= 300) {
                    if (status == 401 || status == 403) {
                        if (authFailure != null) authFailure.accept(status);
                        showError("로그인이 필요합니다.");
                    } else showError("일정을 불러오지 못했습니다.");
                    return;
                }
                try {
                    String next = parsePage(body);
                    nextPage = next;
                    render();
                } catch (Exception ignored) { showError("일정 데이터를 읽지 못했습니다."); }
            }));
    }

    private String parsePage(JSONObject body) throws Exception {
        JSONArray rows = body == null ? null : body.optJSONArray("appointments");
        if (rows != null) for (int i = 0; i < rows.length(); i++) {
            JSONObject item = rows.optJSONObject(i);
            if (item == null) continue;
            Appointment appointment = Appointment.from(item);
            if (appointment != null) appointments.add(appointment);
        }
        Collections.sort(appointments, (a, b) -> { int result = a.startsAt.compareTo(b.startsAt); return result != 0 ? result : a.id.compareTo(b.id); });
        return body == null || body.isNull("next_cursor") ? "" : body.optString("next_cursor", "");
    }

    private void showError(String message) {
        monthBody.removeAllViews(); agendaBody.removeAllViews(); statusText.setText(message);
        Button retry = action("다시 시도", true); retry.setOnClickListener(v -> load()); agendaBody.addView(retry, wrap());
    }

    private void render() {
        for (Button button : filters) {
            boolean active = button.getText().toString().equals(filter);
            button.setTypeface(Typeface.DEFAULT, active ? Typeface.BOLD : Typeface.NORMAL);
            button.setTextColor(active ? Color.rgb(148, 96, 25) : MUTED);
            GradientDrawable background = new GradientDrawable();
            background.setColor(active ? Color.rgb(251, 242, 227) : Color.WHITE);
            background.setCornerRadius(dp(7));
            background.setStroke(dp(1), active ? Color.rgb(221, 195, 153) : LINE);
            button.setBackground(background);
        }
        monthBody.removeAllViews(); agendaBody.removeAllViews(); renderMonth();
        int selectedCount = 0;
        ArrayList<Appointment> cancelled = new ArrayList<>();
        statusText.setText(selectedDay.getMonthValue() + "월 " + selectedDay.getDayOfMonth() + "일 일정");
        agendaBody.addView(text("선택한 일정", 15, INK, true), fullMargin(0, 0, 0, 8));
        for (Appointment item : appointments) {
            if (!item.day.equals(selectedDay) || !matches(item)) continue;
            if ("cancelled".equals(item.status)) { cancelled.add(item); continue; }
            agendaBody.addView(card(item), fullMargin(0, 0, 0, 10)); selectedCount++;
        }
        if (selectedCount == 0) {
            TextView empty = text("등록된 일정이 없습니다.", 13, MUTED, false);
            empty.setGravity(Gravity.CENTER); empty.setPadding(0, dp(18), 0, dp(18)); agendaBody.addView(empty, wrap());
        }
        if (!cancelled.isEmpty()) addCancellationHistory(cancelled);

        LocalDate today = LocalDate.now(KST);
        LocalDate upcomingFrom = selectedDay.equals(today) ? today.plusDays(1) : today;
        int upcomingCount = 0;
        agendaBody.addView(text("다가오는 일정", 15, INK, true), fullMargin(0, 18, 0, 8));
        for (Appointment item : appointments) {
            if (!matches(item) || "cancelled".equals(item.status) || item.day.isBefore(upcomingFrom) || item.day.equals(selectedDay)) continue;
            agendaBody.addView(card(item), fullMargin(0, 0, 0, 10)); upcomingCount++;
        }
        if (upcomingCount == 0) {
            TextView empty = text("앞으로 예정된 일정이 없습니다.", 13, MUTED, false);
            empty.setGravity(Gravity.CENTER); empty.setPadding(0, dp(18), 0, dp(18)); agendaBody.addView(empty, wrap());
        }
        if (!nextPage.isEmpty()) {
            statusText.append(" · 일부 일정 표시");
            Button more = action("일정 더 불러오기", false);
            more.setOnClickListener(v -> { more.setEnabled(false); loadPage(requestSerial, nextPage); });
            agendaBody.addView(more, wrap());
        }
        agendaBody.addView(appointmentActions(), fullMargin(0, 14, 0, 0));
    }

    private View appointmentActions() {
        LinearLayout actions = row(Gravity.CENTER_VERTICAL);
        Button consult = action("상담 등록", false);
        consult.setOnClickListener(v -> { if (addAppointmentByKind != null) addAppointmentByKind.accept("visit"); });
        Button measurement = action("실측 등록", false);
        measurement.setOnClickListener(v -> { if (addAppointmentByKind != null) addAppointmentByKind.accept("measurement"); });
        actions.addView(consult, weight(1));
        LinearLayout.LayoutParams measurementParams = weight(1);
        measurementParams.setMargins(dp(8), 0, 0, 0);
        actions.addView(measurement, measurementParams);
        return actions;
    }

    private void addCancellationHistory(ArrayList<Appointment> cancelled) {
        LinearLayout box = column(Color.WHITE);
        GradientDrawable boxBackground = new GradientDrawable();
        boxBackground.setColor(Color.WHITE);
        boxBackground.setCornerRadius(dp(8));
        boxBackground.setStroke(dp(1), LINE);
        box.setBackground(boxBackground);

        LinearLayout header = row(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(14), dp(12), dp(10), dp(12));
        TextView label = text("취소 이력 · 종료된 일정 (" + cancelled.size() + ")", 13, INK, true);
        header.addView(label, weight(1));
        TextView arrow = text("⌄", 20, MUTED, false);
        arrow.setGravity(Gravity.CENTER);
        header.addView(arrow, new LinearLayout.LayoutParams(dp(28), dp(28)));
        box.addView(header, full());

        View divider = new View(context);
        divider.setBackgroundColor(LINE);
        box.addView(divider, new LinearLayout.LayoutParams(-1, dp(1)));

        LinearLayout content = column(Color.TRANSPARENT);
        content.setPadding(dp(12), dp(12), dp(12), dp(2));
        content.setVisibility(View.GONE);
        for (Appointment item : cancelled) content.addView(card(item), fullMargin(0, 0, 0, 10));
        box.addView(content, full());
        header.setClickable(true);
        header.setFocusable(true);
        header.setOnClickListener(v -> {
            boolean open = content.getVisibility() != View.VISIBLE;
            content.setVisibility(open ? View.VISIBLE : View.GONE);
            arrow.setText(open ? "⌃" : "⌄");
        });
        agendaBody.addView(box, fullMargin(0, 12, 0, 0));
    }

    private void renderMonth() {
        monthBody.addView(monthBar, fullMargin(0, 0, 0, 8));
        LinearLayout weekdays = row(Gravity.CENTER_VERTICAL); String[] names = {"일", "월", "화", "수", "목", "금", "토"};
        for (String name : names) { TextView day = text(name, 11, MUTED, true); day.setGravity(Gravity.CENTER); weekdays.addView(day, weight(1)); }
        monthBody.addView(weekdays, fullMargin(0, 0, 0, 4));
        LinearLayout grid = column(Color.TRANSPARENT);
        int offset = month.atDay(1).getDayOfWeek().getValue() % 7;
        int cells = ((offset + month.lengthOfMonth() + 6) / 7) * 7;
        for (int i = 0; i < cells; i += 7) {
            LinearLayout week = row(Gravity.CENTER_VERTICAL);
            for (int j = 0; j < 7; j++) {
                int index = i + j;
                if (index < offset || index >= offset + month.lengthOfMonth()) week.addView(new View(context), weight(1));
                else { View cell = dayCell(month.atDay(index - offset + 1)); week.addView(cell, weight(1)); }
            }
            grid.addView(week, new LinearLayout.LayoutParams(-1, dp(45)));
        }
        LinearLayout legend = row(Gravity.CENTER_VERTICAL);
        legend.setPadding(0, dp(2), 0, dp(2));
        legend.setClipToPadding(false);
        legend.addView(legendItem(CONSULT_DOT, "상담"), margin(0, 0, 12, 0));
        legend.addView(legendItem(MEASURE_DOT, "실측"), margin(0, 0, 0, 0));
        grid.addView(legend, full());
        monthBody.addView(grid, full());
    }

    private View dayCell(LocalDate date) {
        LinearLayout cell = column(Color.TRANSPARENT);
        cell.setGravity(Gravity.CENTER);
        cell.setPadding(0, dp(2), 0, dp(2));
        TextView number = text(String.valueOf(date.getDayOfMonth()), 12, INK, date.equals(selectedDay));
        number.setGravity(Gravity.CENTER);
        cell.addView(number, new LinearLayout.LayoutParams(-1, dp(25)));
        boolean consult = false, measurement = false;
        for (Appointment item : appointments) if (item.day.equals(date) && !"cancelled".equals(item.status) && matches(item)) { consult |= item.isConsult(); measurement |= item.isMeasurement(); }
        GradientDrawable background = new GradientDrawable(); background.setCornerRadius(dp(8));
        if (date.equals(selectedDay)) { background.setColor(Color.rgb(255, 250, 241)); background.setStroke(dp(1), Color.rgb(221, 195, 153)); }
        else if (date.equals(LocalDate.now(KST))) background.setColor(Color.rgb(242, 243, 239));
        else background.setColor(Color.TRANSPARENT);
        cell.setBackground(background);
        if (consult || measurement) {
            LinearLayout dots = row(Gravity.CENTER);
            if (consult) dots.addView(dot(CONSULT_DOT), dotParams(measurement ? 3 : 0));
            if (measurement) dots.addView(dot(MEASURE_DOT), dotParams(0));
            cell.addView(dots, new LinearLayout.LayoutParams(-1, dp(7)));
        }
        cell.setOnClickListener(v -> { selectedDay = date; render(); });
        return cell;
    }

    private LinearLayout.LayoutParams dotParams(int rightMargin) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(dp(5), dp(5));
        params.rightMargin = dp(rightMargin);
        return params;
    }

    private View dot(int color) {
        View dot = new View(context);
        GradientDrawable background = new GradientDrawable();
        background.setColor(color);
        background.setShape(GradientDrawable.OVAL);
        dot.setBackground(background);
        return dotWithSize(dot, 5);
    }

    private View dotWithSize(View view, int size) {
        view.setLayoutParams(new LinearLayout.LayoutParams(dp(size), dp(size)));
        return view;
    }

    private View legendItem(int color, String label) {
        LinearLayout item = row(Gravity.CENTER_VERTICAL);
        item.addView(dot(color), dotParams(5));
        item.addView(text(label, 10, MUTED, false), wrap());
        return item;
    }

    static View appointmentCard(Activity context,JSONObject value,Consumer<String> openCustomer) {
        Appointment item=Appointment.from(value);return item==null?null:buildCard(context,item,openCustomer);
    }

    private View card(Appointment item) { return buildCard(context,item,openCustomer); }

    private static View buildCard(Activity context,Appointment item,Consumer<String> openCustomer) {
        return ScheduleCard.create(context,item.customerName,item.time(),item.dateLabel(),item.isMeasurement(),item.location,item.branch(),"cancelled".equals(item.status),()->{if(openCustomer!=null&&!item.estimateId.isEmpty())openCustomer.accept(item.estimateId);});
    }

    private boolean matches(Appointment item) { return "전체".equals(filter) || ("상담".equals(filter) && item.isConsult()) || ("실측".equals(filter) && item.isMeasurement()); }
    private TextView text(String value, float size, int color, boolean bold) { TextView view = new TextView(context); view.setText(value); view.setTextSize(size); view.setTextColor(color); view.setTypeface(Typeface.DEFAULT, bold ? Typeface.BOLD : Typeface.NORMAL); return view; }
    private Button action(String value, boolean primary) { Button button = new Button(context); button.setAllCaps(false); button.setText(value); button.setTextSize(12); button.setMinHeight(dp(38)); button.setMinWidth(0); button.setMinimumWidth(0); button.setStateListAnimator(null); button.setElevation(0); button.setPadding(dp(12), 0, dp(12), 0); button.setTextColor(primary ? Color.WHITE : INK); GradientDrawable background = new GradientDrawable(); background.setColor(primary ? Color.rgb(148, 96, 25) : Color.WHITE); background.setCornerRadius(dp(7)); background.setStroke(dp(1), primary ? Color.rgb(148, 96, 25) : LINE); button.setBackground(background); return button; }
    private Button compactAction(String value, int width) { Button button = action(value, false); button.setMinWidth(dp(width)); button.setMinimumWidth(dp(width)); button.setPadding(0, 0, 0, 0); return button; }
    private LinearLayout row(int gravity) { LinearLayout view = new LinearLayout(context); view.setOrientation(LinearLayout.HORIZONTAL); view.setGravity(gravity); return view; }
    private LinearLayout column(int color) { LinearLayout view = new LinearLayout(context); view.setOrientation(LinearLayout.VERTICAL); view.setBackgroundColor(color); return view; }
    private LinearLayout.LayoutParams wrap() { return new LinearLayout.LayoutParams(-2, -2); }
    private LinearLayout.LayoutParams full() { return new LinearLayout.LayoutParams(-1, -2); }
    private LinearLayout.LayoutParams endWrap() { LinearLayout.LayoutParams p = wrap(); p.gravity = Gravity.END; return p; }
    private LinearLayout.LayoutParams weight(float value) { return new LinearLayout.LayoutParams(0, -1, value); }
    private LinearLayout.LayoutParams margin(int left, int top, int right, int bottom) { LinearLayout.LayoutParams p = wrap(); p.setMargins(dp(left), dp(top), dp(right), dp(bottom)); return p; }
    private LinearLayout.LayoutParams fullMargin(int left, int top, int right, int bottom) { LinearLayout.LayoutParams p = full(); p.setMargins(dp(left), dp(top), dp(right), dp(bottom)); return p; }
    private int dp(int value) { return Math.round(value * context.getResources().getDisplayMetrics().density); }

    private static final class Appointment {
        final String id, estimateId, customerName, kind, location, status;
        final OffsetDateTime startsAt;
        final LocalDate day;
        private Appointment(String id, String estimateId, String customerName, String kind, OffsetDateTime startsAt, String location, String status) { this.id = id; this.estimateId = estimateId; this.customerName = customerName; this.kind = kind; this.startsAt = startsAt; this.day = startsAt.atZoneSameInstant(KST).toLocalDate(); this.location = location; this.status = status; }
        static Appointment from(JSONObject item) { try { OffsetDateTime starts = OffsetDateTime.parse(item.optString("starts_at", "")); return new Appointment(item.optString("id", ""), item.optString("customer_id", ""), item.optString("customer_name", ""), item.optString("kind", "visit"), starts, item.optString("location", ""), item.optString("status", "scheduled")); } catch (DateTimeParseException error) { return null; } }
        boolean isMeasurement() { return "measurement".equals(kind); }
        boolean isConsult() { return "visit".equals(kind); }
        String time() { return startsAt.atZoneSameInstant(KST).format(TIME); }
        String dateLabel() { return startsAt.atZoneSameInstant(KST).format(CARD_DATE); }
        String branch() { if (location.contains("판교점")) return "판교점"; if (location.contains("강남점")) return "강남점"; return ""; }
    }
}
