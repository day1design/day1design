package kr.polarad.crm;

import android.app.Activity;
import android.app.DatePickerDialog;
import android.app.Dialog;
import android.app.TimePickerDialog;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.inputmethod.EditorInfo;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.view.WindowInsets;
import android.view.inputmethod.InputMethodManager;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;
import android.widget.Button;
import android.widget.DatePicker;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.TimePicker;
import android.widget.Toast;
import java.time.OffsetDateTime;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.text.DecimalFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Calendar;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final int INK = Color.rgb(35, 35, 31);
    private static final int MUTED = Color.rgb(104, 102, 95);
    private static final int PAPER = Color.rgb(250, 249, 246);
    private static final int PANEL = Color.WHITE;
    private static final int LINE = Color.rgb(229, 223, 211);
    private static final int BLUE = Color.rgb(66, 98, 122);
    private static final int TERRA = Color.rgb(184, 102, 78);
    private static final int DISABLED = Color.rgb(154, 149, 140);

    private static final int ACTION = Color.rgb(148, 96, 25);
    private String activeTab = "home";
    private String analyticsPage = "hub";
    private long dataRevision = -1;
    private boolean syncInFlight;
    private String detailTab = "정보";
    private String customerQuery = "";
    private String customerStatus = "";
    private String customerSource = "";
    private String pendingCsv;
    private LinearLayout screenShell;
    private LinearLayout headerHost;
    private View analyticsView;
    private View updateView;
    private AppUpdateClient startupUpdates;
    private boolean updateCheckInFlight;
    private long lastUpdateCheck;
    private int announcedUpdateVersion;
    private boolean customerDetailActive;
    private final OnBackInvokedCallback backCallback = () -> {
        if (!navigateBack()) finish();
    };

    private final ApiClient api = new ApiClient();
    private final ApiClient supportRenewalApi = new ApiClient();
    private LoadingOverlay loadingOverlay;
    private final ArrayList<JSONObject> members = new ArrayList<>();
    private final Map<String, EditText> customerEdits = new HashMap<>();
    private SecureSessionStore store;
    private LinearLayout root;
    private JSONObject me;
    private JSONObject current;
    private int requestGeneration = 0;
    private boolean loggingOut = false;
    private boolean openNotificationsAfterLogin;
    private boolean supportMode;
    private boolean previewMode;
    private String previewExpiresAt;
    private String supportToken;
    private String adminToken;
    private JSONObject adminMe;
    private String supportTenantId;
    private String supportExpiresAt;
    private boolean supportAdminMode;
    private boolean supportRenewalInFlight;
    private long supportRenewalLastAttemptAt;
    private final Map<String, String> customerMessageDrafts = new HashMap<>();
    private String customerMessageKind = "visit";
    private String customerMessageChannel = "sms";

    private boolean navigateBack() {
        if ("analytics".equals(activeTab) && AnalyticsScreen.handleBack(analyticsView)) return true;
        if (customerDetailActive) {
            customerDetailActive = false;
            if (isOwner()) showCustomers(customerQuery); else showNotifications();
            return true;
        }
        return false;
    }

    @Override
    public boolean onKeyUp(int keyCode, KeyEvent event) {
        if (Build.VERSION.SDK_INT < 33 && keyCode == KeyEvent.KEYCODE_BACK && !event.isCanceled()) {
            if (!navigateBack()) finish();
            return true;
        }
        return super.onKeyUp(keyCode, event);
    }

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
        }
        store = new SecureSessionStore(this);
        api.setSuspensionListener(() -> runOnUiThread(this::showSuspended));
        loadingOverlay = new LoadingOverlay(this);
        api.setPendingListener(count -> runOnUiThread(() -> loadingOverlay.onPendingChanged(api.pendingCount())));
        openNotificationsAfterLogin = hasNotificationIntent(getIntent());
        requestNotificationPermission();
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        if (!BuildConfig.DEBUG) {
            getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        }
        showLoading();
        new Thread(() -> {
            try {
                String token = store.read();
                if (token == null || token.trim().isEmpty()) {
                    runOnUiThread(this::showLogin);
                    return;
                }
                adminToken = token;
                api.setToken(token);
                fetchMe(true);
            } catch (Exception error) {
                runOnUiThread(this::showLogin);
            }
        }).start();
    }

    @Override
    protected void onDestroy() {
        AccountScreens.disposeUpdate(updateView);
        if (startupUpdates != null) startupUpdates.close();
        if (loadingOverlay != null) loadingOverlay.detach();
        api.setPendingListener(null);
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
        }
        super.onDestroy();
    }

    @Override
    protected void onResume() {
        super.onResume();
        CrmFirebaseMessagingService.dataChangeListener = () -> runOnUiThread(() -> checkDataRevision(true));
        if (supportMode && supportExpiresSoon()) renewSupportAndReload();
        if (me != null && isOwner() && !isPlatform() && !isOnboardingPending()) checkDataRevision(true);
        if ("analytics".equals(activeTab) && analyticsView != null) AnalyticsScreen.refreshBriefingOnResume(analyticsView);
        AccountScreens.resumeUpdate(updateView);
        checkAppUpdate();
    }

    private void checkAppUpdate() {
        if (me == null || isOnboardingPending() || updateCheckInFlight || isFinishing()) return;
        long now = android.os.SystemClock.elapsedRealtime();
        if (lastUpdateCheck > 0 && now - lastUpdateCheck < 15 * 60_000L) return;
        lastUpdateCheck = now;
        updateCheckInFlight = true;
        final String token = api.currentToken();
        if (startupUpdates == null) startupUpdates = new AppUpdateClient(api);
        startupUpdates.check((info, status, error) -> runOnUiThread(() -> {
            updateCheckInFlight = false;
            if (isFinishing() || isDestroyed() || me == null || !java.util.Objects.equals(token, api.currentToken())) return;
            if (error == null && info != null && info.available && info.versionCode != announcedUpdateVersion) {
                announcedUpdateVersion = info.versionCode;
                toast("새 앱 버전 " + info.versionName + "이 있습니다. 더보기의 앱 업데이트에서 설치할 수 있습니다.");
            }
        }));
    }

    @Override
    protected void onPause() {
        CrmFirebaseMessagingService.dataChangeListener = null;
        super.onPause();
    }

    private void checkDataRevision(boolean refreshChanged) {
        if (syncInFlight || me == null || !isOwner() || isPlatform() || isOnboardingPending()) return;
        syncInFlight = true;
        final JSONObject identity = me;
        api.call("GET", "/api/mobile/sync", null, (payload, status, error) -> runOnUiThread(() -> {
            syncInFlight = false;
            if (me != identity || handleAuthFailure(status)) return;
            if (status != 200 || !payload.has("version")) return;
            long next = payload.optLong("version", -1);
            boolean changed = dataRevision >= 0 && dataRevision != next;
            dataRevision = next;
            if (changed) {
                api.invalidateData();
                if (refreshChanged && "home".equals(activeTab)) showHome();
                else if (refreshChanged && "customers".equals(activeTab) && current == null) showCustomers(customerQuery);
            }
        }));
    }

    private void fetchMe(boolean fromStartup) {
        final int generation = requestGeneration;
        api.call("GET", "/api/mobile/me", null, (body, status, error) -> runOnUiThread(() -> {
            if (!sameGeneration(generation)) return;
            if (status >= 200 && status < 300) {
                me = body;
                if (loadingOverlay != null) loadingOverlay.setBranding(loadingLogoResource(), tenantName());
                dataRevision = -1; checkDataRevision(false);
                if (!supportMode && !previewMode) {
                    PushManager.initialize(this, api, notificationsEnabled());
                    PushManager.registerCurrentDevice(this, api, notificationsEnabled());
                }
                if(isOnboardingPending()){showOnboardingPending();return;}
                checkAppUpdate();
                if (supportMode) { showSupportWorkspace(); return; }
                if (previewMode) { showHome(); return; }
                if (openNotificationsAfterLogin) {
                    openNotificationsAfterLogin = false;
                    openNotificationIntent();
                } else {
                    if (isPlatform()) showPlatformHome(); else if(isOwner()) showHome(); else showNotifications();
                }
            } else if (status == 401 || status == 403) {
                if (supportMode) { renewSupportAndReload(); return; }
                if (previewMode) { restorePreviewAdmin(); return; }
                clearSessionAndShowLogin("세션이 만료되었습니다. 다시 로그인하세요.");
            } else if (fromStartup) {
                showOfflineRetry(message(body, error, "서버에 연결할 수 없습니다. 저장된 로그인은 유지됩니다."));
            } else {
                toast(message(body, error, "사용자 정보를 불러오지 못했습니다."));
            }
        }));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (hasNotificationIntent(intent)) {
            openNotificationsAfterLogin = true;
            if (me != null) {
                openNotificationsAfterLogin = false;
                openNotificationIntent();
            }
        }
    }

    private boolean hasNotificationIntent(Intent intent) {
        if (intent == null) return false;
        return intent.getBooleanExtra("open_notifications", false)
                || intent.hasExtra("google.message_id")
                || intent.hasExtra("notification_id")
                || intent.hasExtra("kind");
    }

    private void requestNotificationPermission() {
        if (!PushManager.isConfigured() || Build.VERSION.SDK_INT < 33) return;
        if (checkSelfPermission("android.permission.POST_NOTIFICATIONS") != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 7001);
        }
    }

    private boolean notificationsEnabled() {
        return Build.VERSION.SDK_INT < 33 || checkSelfPermission("android.permission.POST_NOTIFICATIONS") == android.content.pm.PackageManager.PERMISSION_GRANTED;
    }

    private String pendingScheduleKind="";

    private void base() {
        AccountScreens.disposeUpdate(updateView);
        updateView = null;
        pendingScheduleKind="";
        analyticsView = null;
        customerDetailActive = false;
        requestGeneration++;
        customerEdits.clear();
        screenShell = new LinearLayout(this);
        screenShell.setOrientation(LinearLayout.VERTICAL);
        screenShell.setBackgroundColor(PAPER);
        headerHost = new LinearLayout(this);
        headerHost.setOrientation(LinearLayout.VERTICAL);
        screenShell.addView(headerHost, new LinearLayout.LayoutParams(-1, -2));
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(18), dp(21), dp(18), dp(26));
        scroll.addView(root, new ScrollView.LayoutParams(-1, -2));
        screenShell.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        if (me != null && isOwner() && !isOnboardingPending()) addBottomNavigation();
        screenShell.setOnApplyWindowInsetsListener((view, insets) -> {
            int top, bottom;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                top = bars.top; bottom = Math.max(bars.bottom, ime.bottom);
            } else { top = insets.getSystemWindowInsetTop(); bottom = insets.getSystemWindowInsetBottom(); }
            screenShell.setPadding(0, top, 0, bottom);
            return insets;
        });
        setContentView(screenShell);
        if (loadingOverlay != null) {
            loadingOverlay.attach();
            loadingOverlay.setBranding(loadingLogoResource(), tenantName());
            loadingOverlay.onPendingChanged(api.pendingCount());
        }
    }

    private void addBottomNavigation() {
        LinearLayout nav = new LinearLayout(this);
        nav.setBackgroundColor(Color.WHITE);
        nav.setPadding(dp(7), dp(6), dp(7), dp(10));
        if (isPlatform()) {
            addBottomItem(nav, "운영 홈", "home", R.drawable.nav_home, this::showPlatformHome);
            addBottomItem(nav, "거래처", "customers", R.drawable.nav_people, this::showPlatformTenants);
            addBottomItem(nav, "신규 등록", "calendar", R.drawable.nav_plus, this::showTenantEditor);
            addBottomItem(nav, "설정", "more", R.drawable.nav_shield, this::showPlatformSettings);
        } else {
            addBottomItem(nav, "홈", "home", R.drawable.nav_home, this::showHome);
            addBottomItem(nav, "고객", "customers", R.drawable.nav_people, () -> showCustomers(""));
            addBottomItem(nav, "일정", "calendar", R.drawable.nav_calendar, this::showSchedule);
            addBottomItem(nav, "분석", "analytics", R.drawable.nav_chart, this::showAnalytics);
            addBottomItem(nav, "더보기", "more", R.drawable.nav_more, this::showMore);
        }
        screenShell.addView(nav, new LinearLayout.LayoutParams(-1, -2));
    }

    private void addBottomItem(LinearLayout nav, String title, String key, int icon, Runnable action) {
        Button item = textButton(title);
        item.setTextSize(10);
        item.setPadding(0, dp(5), 0, dp(5));
        boolean selected = key.equals(activeTab);
        item.setTextColor(selected ? ACTION : MUTED);
        item.setSelected(selected);
        android.graphics.drawable.Drawable drawable = getDrawable(icon).mutate();
        drawable.setTint(selected ? INK : MUTED);
        drawable.setBounds(0, 0, dp(20), dp(20));
        item.setCompoundDrawables(null, drawable, null, null);
        item.setCompoundDrawablePadding(dp(3));
        item.setOnClickListener(v -> { activeTab = key; action.run(); });
        nav.addView(item, new LinearLayout.LayoutParams(0, dp(54), 1));
    }

    private void showLoading() {
        base();
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        addLogo(R.drawable.polarad_logo, 64);
        root.addView(text("CRM 연결 중", 24, true));
        root.addView(body("저장된 세션을 확인하고 있습니다."));
    }

    private void showOfflineRetry(String detail) {
        base();
        addLogo(R.drawable.polarad_logo, 64);
        root.addView(text("서버 연결 대기", 24, true));
        root.addView(body(detail));
        Button retry = primary("다시 연결");
        root.addView(retry);
        retry.setOnClickListener(v -> {
            showLoading();
            fetchMe(true);
        });
    }

    private void showLogin() {
        showLogin("");
    }

    private void authenticationHeader() {
        ImageView logo=new ImageView(this);logo.setImageResource(R.drawable.polarad_logo);logo.setContentDescription("폴라애드 로고");logo.setBackground(round(Color.WHITE,20,Color.TRANSPARENT));logo.setClipToOutline(true);
        LinearLayout.LayoutParams logoParams=new LinearLayout.LayoutParams(dp(72),dp(72));logoParams.gravity=Gravity.CENTER_HORIZONTAL;logoParams.setMargins(0,dp(22),0,dp(19));root.addView(logo,logoParams);
        TextView eyebrow=fidelityCaption("INTERIOR CRM");eyebrow.setGravity(Gravity.CENTER);root.addView(eyebrow);
        TextView title=text("폴라애드\n인테리어 CRM",23,true);title.setGravity(Gravity.CENTER);root.addView(title);
        TextView caption=fidelityCaption("등록된 이메일로 안전하게 시작하세요.");caption.setGravity(Gravity.CENTER);root.addView(caption,blockParams());
    }

    private void authenticationFooter() {
        fidelityDivider(root);
        root.addView(fidelityCaption("등록 및 이용 문의는 폴라애드 담당자에게 문의해 주세요."));
    }

    private void showLogin(String previousEmail) {
        base();
        authenticationHeader();
        root.addView(label("이메일 아이디"));
        EditText email = input("등록된 이메일 주소", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS, false);
        email.setText(previousEmail);
        email.setSingleLine(true);
        email.setMinimumHeight(dp(60));
        email.setPadding(dp(14), dp(12), dp(14), dp(12));
        email.setImeOptions(EditorInfo.IME_ACTION_NEXT);
        root.addView(email);
        root.addView(fidelityCaption("업체 선택 없이 내 계정에 연결된 공간으로 이동합니다."),blockParams());
        Button request = primary("인증번호 발급 신청");
        request.setMinimumHeight(dp(56));
        root.addView(request);
        authenticationFooter();
        request.setOnClickListener(v -> {
            String value = email.getText().toString().trim();
            if (value.isEmpty()) {
                email.setError("이메일을 입력하세요");
                return;
            }
            request.setEnabled(false);
            JSONObject payload = new JSONObject();
            tryPut(payload, "email", value);
            final int generation = requestGeneration;
            api.call("POST", "/api/mobile/auth/request-otp", payload, (body, status, error) -> runOnUiThread(() -> {
                if (!sameGeneration(generation)) return;
                request.setEnabled(true);
                if (status >= 200 && status < 300) {
                    showVerify(value);
                } else {
                    toast(message(body, error, "인증번호를 요청할 수 없습니다."));
                }
            }));
        });
    }

    private void showVerify(String email) {
        base();
        authenticationHeader();
        root.addView(label("이메일 아이디"));
        TextView emailValue=text(email,16,false);emailValue.setPadding(dp(14),dp(12),dp(14),dp(12));emailValue.setMinimumHeight(dp(60));emailValue.setGravity(Gravity.CENTER_VERTICAL);emailValue.setBackground(round(Color.WHITE,8,LINE));root.addView(emailValue,blockParams());
        TextView deliveryNote=fidelityCaption("등록된 계정이라면 입력한 이메일로 인증번호를 발송했습니다.");deliveryNote.setPadding(dp(12),dp(12),dp(12),dp(12));deliveryNote.setBackground(round(Color.rgb(240,239,235),4,Color.TRANSPARENT));root.addView(deliveryNote,blockParams());
        root.addView(label("인증번호 6자리"));
        EditText code = input("6자리 인증번호", InputType.TYPE_CLASS_NUMBER, false);
        code.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(6)});
        code.setSingleLine(true);
        code.setMinimumHeight(dp(60));
        code.setPadding(dp(14), dp(12), dp(14), dp(12));
        code.setImeOptions(EditorInfo.IME_ACTION_DONE);
        root.addView(code);
        root.addView(fidelityCaption("유효시간 5분 · 재발급 대기 60초"),blockParams());
        Button verify = primary("인증하고 시작하기");
        verify.setMinimumHeight(dp(56));
        root.addView(verify);
        Button back = textButton("이메일 다시 입력");
        root.addView(back);
        back.setOnClickListener(v -> showLogin(email));
        authenticationFooter();
        verify.setOnClickListener(v -> {
            String value = code.getText().toString().trim();
            if (!value.matches("[0-9]{6}")) {
                code.setError("인증번호 6자리를 입력하세요");
                return;
            }
            verify.setEnabled(false);
            JSONObject payload = new JSONObject();
            tryPut(payload, "email", email);
            tryPut(payload, "code", value);
            final int generation = requestGeneration;
            api.call("POST", "/api/mobile/auth/verify-otp", payload, (body, status, error) -> runOnUiThread(() -> {
                if (!sameGeneration(generation)) return;
                verify.setEnabled(true);
                String token = body.optString("token", "");
                if (status >= 200 && status < 300 && !token.isEmpty()) {
                    try {
                        store.save(token);
                        adminToken = token;
                        api.setToken(token);
                        fetchMe(false);
                    } catch (Exception secureError) {
                        toast("세션을 안전하게 저장하지 못했습니다.");
                    }
                } else {
                    toast(message(body, error, "인증번호가 올바르지 않습니다."));
                }
            }));
        });
    }

    private void showHome() {
        activeTab="home";base();addHeader();root.addView(text("오늘의 업무",23,true));
        LocalDate today=LocalDate.now(ZoneId.of("Asia/Seoul"));root.addView(fidelityCaption(today.format(DateTimeFormatter.ofPattern("M월 d일 EEEE",Locale.KOREAN))+" · "+tenantName()));
        LinearLayout metrics=new LinearLayout(this);TextView intake=fidelityMetric(metrics,"오늘 접수","KST 오늘 기준");TextView agenda=fidelityMetric(metrics,"오늘 일정","상담 · 실측");root.addView(metrics);
        LinearLayout recentMetrics=new LinearLayout(this);TextView recentSubmissions=fidelityMetric(recentMetrics,"최근 30일 접수","오늘 포함 누적");root.addView(recentMetrics);
        fidelitySection("오늘 유입 · KST 1일","상세 분석",()->showAnalytics("traffic"));
        LinearLayout trafficRows=fidelityColumn();trafficRows.setPadding(dp(16),dp(12),dp(16),dp(12));trafficRows.setBackground(round(Color.WHITE,6,LINE));root.addView(trafficRows,blockParams());
        String[][] trafficLabels={{"터치","touches"},{"체류","visitors"},{"재방문","returningVisitors"},{"페이지뷰","pageviews"},{"평균 체류","avgDurationSec"},{"이탈률","bounceRate"}};
        TextView[] trafficValues=new TextView[trafficLabels.length];
        for(int i=0;i<trafficLabels.length;i++){if(i>0)fidelityDivider(trafficRows);LinearLayout row=new LinearLayout(this);row.setGravity(Gravity.CENTER_VERTICAL);row.addView(fidelityCaption(trafficLabels[i][0]),new LinearLayout.LayoutParams(0,-2,1));trafficValues[i]=text("미집계",14,true);trafficValues[i].setGravity(Gravity.END|Gravity.CENTER_VERTICAL);row.addView(trafficValues[i],new LinearLayout.LayoutParams(-2,dp(42)));trafficRows.addView(row);}
        LinearLayout briefing=fidelityColumn();fidelityDivider(briefing);briefing.addView(fidelityCaption("DAILY BRIEFING / 10:00"));
        TextView briefTitle=text("오늘의 브리핑을 확인하세요.",19,true);TextView briefDescription=fidelityCaption("업무와 마케팅 흐름을 한눈에 확인합니다.");briefing.addView(briefTitle);briefing.addView(briefDescription);fidelityDivider(briefing);root.addView(briefing);briefing.setOnClickListener(v->showAnalytics("brief"));briefing.setFocusable(true);
        fidelitySection("먼저 확인할 고객","전체 보기",()->showCustomers(""));LinearLayout customers=fidelityColumn();root.addView(customers);
        fidelitySection("오늘 일정","캘린더",this::showSchedule);LinearLayout appointments=fidelityColumn();root.addView(appointments);
        fidelitySection("마케팅 흐름","상세 분석",()->showAnalytics("flow"));LinearLayout marketingRows=fidelityColumn();marketingRows.setPadding(dp(16),dp(12),dp(16),dp(12));marketingRows.setBackground(round(Color.WHITE,6,LINE));root.addView(marketingRows,blockParams());
        final int generation=requestGeneration;
        api.call("GET","/api/mobile/customers?status=__pending",null,(payload,status,error)->runOnUiThread(()->{
            if(!sameGeneration(generation)||handleAuthFailure(status))return;
            if(status<200||status>=300){customers.addView(fidelityCaption("고객을 불러오지 못했습니다."));return;}
            JSONArray rows=payload.optJSONArray("customers");
            if(rows==null||rows.length()==0)customers.addView(fidelityCaption("확인이 필요한 고객이 없습니다."));
            else for(int i=0;i<Math.min(3,rows.length());i++){JSONObject customer=rows.optJSONObject(i);if(customer!=null)customers.addView(customerSummary(customer));}
        }));
        api.call("GET","/api/mobile/home",null,(payload,status,error)->runOnUiThread(()->{
            if(!sameGeneration(generation)||handleAuthFailure(status))return;
            if(status<200||status>=300){intake.setText("조회 실패");agenda.setText("조회 실패");return;}
            JSONObject homeMetrics=payload.optJSONObject("home_metrics");
            JSONObject submissions=homeMetrics==null?null:homeMetrics.optJSONObject("submissions");
            JSONObject todaySubmissions=submissions==null?null:submissions.optJSONObject("today");
            JSONObject recent30Submissions=submissions==null?null:submissions.optJSONObject("recent30");
            if(todaySubmissions!=null)intake.setText(homeMetricValue(todaySubmissions,"submissions","건"));
            else {JSONObject pending=payload.optJSONObject("intake");intake.setText(pending==null?"—":String.format(Locale.KOREA,"%,d",pending.optInt("pending_count"))+"건");}
            if(recent30Submissions!=null)recentSubmissions.setText(homeMetricValue(recent30Submissions,"submissions","건"));
            JSONObject traffic=homeMetrics==null?null:homeMetrics.optJSONObject("traffic");
            for(int i=0;i<trafficLabels.length;i++)trafficValues[i].setText(homeMetricValue(traffic==null?null:traffic.optJSONObject(trafficLabels[i][1]),trafficLabels[i][1],""));
            JSONObject day=payload.optJSONObject("today");int count=0;ArrayList<JSONObject> items=new ArrayList<>();
            if(day!=null)for(String kind:new String[]{"consultation","measurement"}){JSONObject group=day.optJSONObject(kind);if(group==null)continue;count+=group.optInt("count");JSONArray rows=group.optJSONArray("items");if(rows!=null)for(int i=0;i<rows.length();i++)if(rows.optJSONObject(i)!=null)items.add(rows.optJSONObject(i));}
            agenda.setText(String.format(Locale.KOREA,"%,d",count)+"건");items.sort((left,right)->left.optString("starts_at").compareTo(right.optString("starts_at")));
            for(JSONObject item:items){View card=CalendarScreen.appointmentCard(this,item,this::showDetail);if(card!=null)appointments.addView(card,blockParams());}
            if(count==0)appointments.addView(fidelityCaption("오늘 등록된 일정이 없습니다."));
            else if(count>items.size())appointments.addView(fidelityCaption("총 "+String.format(Locale.KOREA,"%,d",count)+"건 · 전체 일정은 캘린더에서 확인하세요."));
            JSONObject daily=payload.optJSONObject("daily_brief");
            if(daily==null){briefTitle.setText("아직 도착한 브리핑이 없습니다.");briefDescription.setText("브리핑이 도착하면 이곳에서 확인할 수 있습니다.");}
            else{JSONObject content=daily.optJSONObject("payload");briefTitle.setText(content==null?daily.optString("date")+" 데일리브리핑":content.optString("title",daily.optString("date")+" 데일리브리핑"));briefDescription.setText(content==null?"브리핑 내용 확인하기":content.optString("summary","브리핑 내용 확인하기"));}
            JSONObject marketing=payload.optJSONObject("marketing_flow");JSONArray channels=marketing==null?null:marketing.optJSONArray("channels");
            if(channels==null||channels.length()==0)marketingRows.addView(fidelityCaption("집계된 마케팅 흐름이 없습니다."));
            else for(int i=0;i<Math.min(3,channels.length());i++){
                JSONObject channel=channels.optJSONObject(i);if(channel==null)continue;
                if(i>0)fidelityDivider(marketingRows);
                LinearLayout row=fidelityColumn();LinearLayout heading=new LinearLayout(this);heading.setGravity(Gravity.CENTER_VERTICAL);
                String channelState=channel.optString("source_status",channel.optString("status",""));
                if("good".equals(channelState)||"양호".equals(channelState))channelState=AnalyticsSourceStatus.RECEIPT;
                else if("risk".equals(channelState)||"점검".equals(channelState))channelState=AnalyticsSourceStatus.NONE;
                if(!AnalyticsSourceStatus.RECEIPT.equals(channelState)&&!AnalyticsSourceStatus.NONE.equals(channelState)&&!AnalyticsSourceStatus.SAMPLE.equals(channelState)&&!AnalyticsSourceStatus.QUALITY.equals(channelState)&&!AnalyticsSourceStatus.INACTIVE.equals(channelState)){
                    Long visitsValue=channel.isNull("visits")?null:Long.valueOf(channel.optLong("visits"));
                    Long savedValue=channel.isNull("count")?null:Long.valueOf(channel.optLong("count"));
                    channelState=AnalyticsSourceStatus.fromMetrics(false,visitsValue,savedValue);
                }
                heading.addView(text(channel.optString("channel"),14,true),new LinearLayout.LayoutParams(0,-2,1));
                TextView state=text(AnalyticsSourceStatus.label(channelState),10,true);
                state.setPadding(dp(7),dp(4),dp(7),dp(4));
                state.setTextColor(AnalyticsSourceStatus.RECEIPT.equals(channelState)?Color.rgb(53,99,78):AnalyticsSourceStatus.NONE.equals(channelState)?Color.rgb(160,68,59):AnalyticsSourceStatus.QUALITY.equals(channelState)?Color.rgb(138,91,18):Color.rgb(102,107,112));
                state.setBackground(round(AnalyticsSourceStatus.RECEIPT.equals(channelState)?Color.rgb(237,243,238):AnalyticsSourceStatus.NONE.equals(channelState)?Color.rgb(247,238,235):AnalyticsSourceStatus.QUALITY.equals(channelState)?Color.rgb(255,244,220):Color.rgb(238,240,241),4,Color.TRANSPARENT));
                heading.addView(state);row.addView(heading);
                String visits=channel.isNull("visits")?"—":String.valueOf(channel.optInt("visits"));
                String receipts=channel.isNull("count")?"—":String.valueOf(channel.optInt("count"));
                String summary="방문 "+visits+" · 접수 "+receipts;
                if(!channel.isNull("visits_change_pct")&&!channel.isNull("receipts_change_pct")){
                    summary="방문 "+homeChange(channel.optDouble("visits_change_pct"))+" · 접수 "+homeChange(channel.optDouble("receipts_change_pct"));
                }
                row.addView(fidelityCaption(summary));row.setOnClickListener(v->showAnalytics("flow"));row.setFocusable(true);marketingRows.addView(row);
            }
        }));
    }

    private String homeChange(double value) {
        if(!Double.isFinite(value))return "—";
        return (value>0?"+":"")+String.format(Locale.KOREAN,"%.1f%%",value);
    }

    private String homeMetricValue(JSONObject metric, String key, String suffix) {
        if (metric == null || !metric.has("value") || metric.isNull("value")) return "미집계";
        Object raw = metric.opt("value");
        if (!(raw instanceof Number)) return String.valueOf(raw) + suffix;
        double value = ((Number) raw).doubleValue();
        if ("bounceRate".equals(key)) return String.format(Locale.KOREA, "%.1f%%", value * 100d);
        if ("avgDurationSec".equals(key)) {
            long seconds = Math.max(0L, Math.round(value));
            return (seconds / 60L) + "분 " + String.format(Locale.KOREA, "%02d초", seconds % 60L);
        }
        if (Math.rint(value) == value) return String.format(Locale.KOREA, "%,d", (long) value) + suffix;
        return String.format(Locale.KOREA, "%,.1f", value) + suffix;
    }

    private View customerSummary(JSONObject customer) {
        LinearLayout card=fidelityColumn();card.setPadding(dp(16),dp(12),dp(16),dp(12));card.setBackground(round(Color.WHITE,6,LINE));card.setLayoutParams(blockParams());
        LinearLayout heading=new LinearLayout(this);heading.setGravity(Gravity.CENTER_VERTICAL);
        String name=customer.optString("name","이름 없음");TextView avatar=text(name.isEmpty()?"?":name.substring(0,1),16,true);avatar.setGravity(Gravity.CENTER);avatar.setPadding(0,0,0,0);avatar.setBackground(round(Color.rgb(239,237,231),8,Color.TRANSPARENT));heading.addView(avatar,new LinearLayout.LayoutParams(dp(36),dp(36)));
        LinearLayout identity=fidelityColumn();identity.setPadding(dp(10),0,dp(8),0);identity.addView(text(name,15,true));
        LinearLayout attribution=new LinearLayout(this);attribution.setGravity(Gravity.CENTER_VERTICAL);attribution.setPadding(0,dp(3),0,0);
        String source=CustomerCardFields.value(customer.optString("source","")).toLowerCase(Locale.KOREA);
        boolean meta="meta".equals(source);
        String firstSource=CustomerCardFields.value(customer.optString("first_source"));
        boolean homepage=CustomerCardFields.homepage(source.isEmpty()?firstSource:source);
        boolean sourceMissing=source.isEmpty()&&firstSource.isEmpty();
        String intakeLabel=meta?"Meta 접수":homepage?"홈페이지 접수":sourceMissing?"출처 미확인":"기타 접수";
        int intakeForeground=meta?Color.rgb(53,99,78):homepage?BLUE:Color.rgb(102,107,112);
        int intakeBackground=meta?Color.rgb(237,243,238):homepage?Color.rgb(234,240,245):Color.rgb(238,240,241);
        TextView intakeBadge=smallBadge(intakeLabel,intakeForeground,intakeBackground);
        attribution.addView(intakeBadge);
        String platform=CustomerCardFields.value(customer.optString("platform",""));
        String inflowApp=CustomerCardFields.value(customer.optString("first_inflow_app",""));
        String device=CustomerCardFields.value(customer.optString("first_device",""));
        String deviceLabel="pc".equalsIgnoreCase(device)?"PC":"mobile".equalsIgnoreCase(device)?"모바일":device;
        String attributionText=!deviceLabel.isEmpty()?"디바이스 · "+deviceLabel:meta&&!platform.isEmpty()?"Meta 플랫폼 · "+platform:!inflowApp.isEmpty()?"유입 앱 · "+inflowApp:sourceMissing?"유입 출처 · 미확인":"디바이스 · 미수집";
        TextView detail=fidelityCaption(attributionText);detail.setPadding(dp(6),dp(3),0,dp(3));attribution.addView(detail);
        identity.addView(attribution);
        identity.addView(fidelityCaption("유입 출처 · "+CustomerCardFields.source(customer.optString("first_source"),source,customer.optString("first_referrer"))));
        heading.addView(identity,new LinearLayout.LayoutParams(0,-2,1));
        String status=customer.optString("status");boolean pending="접수대기".equals(status)||"new".equals(status);TextView badge=text(pending?"신규":"계약완료".equals(status)?"계약":"진행중",10,true);badge.setPadding(dp(7),dp(4),dp(7),dp(4));badge.setTextColor(pending?Color.rgb(136,100,33):Color.rgb(53,99,78));badge.setBackground(round(pending?Color.rgb(246,240,227):Color.rgb(237,243,238),4,Color.TRANSPARENT));heading.addView(badge);card.addView(heading);
        card.addView(fidelityCaption(customer.optString("region")));
        card.addView(fidelityCaption("가용예산 · "+CustomerCardFields.budget(customer.optString("budget_text"),customer.optString("detail"))));
        String desiredBranch=CustomerCardFields.value(customer.optString("branch"));
        if(!desiredBranch.isEmpty())card.addView(fidelityCaption("희망지점 · "+desiredBranch));
        card.addView(fidelityCaption(customer.optString("phone")+" · "+status));
        card.setOnClickListener(v->showDetail(customer.optString("id")));card.setFocusable(true);return card;
    }

    private TextView smallBadge(String value,int foreground,int background) {
        TextView badge=text(value,10,true);badge.setTextColor(foreground);badge.setPadding(dp(7),dp(4),dp(7),dp(4));badge.setBackground(round(background,4,foreground));return badge;
    }

    private void showPlatformSettings() {
        activeTab = "more"; base(); addHeader();
        root.addView(text("설정", 23, true));
        menu("계정·보안·기기", this::showSecurity);
        menu("앱 업데이트", this::showUpdate);
    }

    private void showMore() {
        activeTab="more";base();addHeader();
        root.addView(text("더보기",23,true));
        root.addView(body(tenantName()+" 업무공간"));
        if (previewMode) {
            TextView previewContext = body("업체 화면 확인 중 · 읽기 전용");
            previewContext.setTextSize(12);
            previewContext.setTextColor(MUTED);
            root.addView(previewContext);
            if (previewExpiresAt != null && !previewExpiresAt.isEmpty()) {
                TextView expiry = body("접근 만료: " + previewExpiresAt);
                expiry.setTextSize(11);
                expiry.setTextColor(MUTED);
                root.addView(expiry);
            }
            Button returnToAdmin = secondary("관리자 화면으로 돌아가기");
            returnToAdmin.setOnClickListener(v -> endPreviewSession());
            root.addView(returnToAdmin);
        }
        LinearLayout identity=new LinearLayout(this);identity.setGravity(Gravity.CENTER_VERTICAL);
        identity.setPadding(dp(16),dp(16),dp(16),dp(16));identity.setBackground(round(PANEL,6,LINE));
        ImageView logo=new ImageView(this);logo.setImageResource(isDayoneTenant()?R.drawable.dayone_logo:R.drawable.polarad_logo);logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        identity.addView(logo,new LinearLayout.LayoutParams(dp(42),dp(42)));
        LinearLayout account=new LinearLayout(this);account.setOrientation(LinearLayout.VERTICAL);account.setPadding(dp(12),0,0,0);
        account.addView(text(tenantName(),16,true));account.addView(fidelityCaption(me.optString("email")));
        identity.addView(account,new LinearLayout.LayoutParams(0,-2,1));root.addView(identity,blockParams());
        LinearLayout menuGroup=new LinearLayout(this);menuGroup.setOrientation(LinearLayout.VERTICAL);menuGroup.setBackground(round(PANEL,6,LINE));
        groupedMenu(menuGroup,"계정·보안·기기",this::showSecurity);
        groupedMenu(menuGroup,"알림·리마인드 설정",this::showNotificationSettings);
        groupedMenu(menuGroup,"앱 업데이트",this::showUpdate);
        groupedMenu(menuGroup,"데일리브리핑 보관함",()->showAnalytics("brief"));
        root.addView(menuGroup,blockParams());
        LinearLayout integrationDetails=fidelityColumn();
        JSONObject tenant=me==null?null:me.optJSONObject("tenant");
        String[][] links={{"홈페이지 접수", "website_connected"},{"홈페이지 방문", "traffic_connected"},{"Meta 광고", "meta_connected"}};
        for(int i=0;i<links.length;i++){if(i>0)fidelityDivider(integrationDetails);String value=tenant==null||!tenant.has(links[i][1])?"확인 불가":(tenant.optBoolean(links[i][1])?"연결됨":"연결 안됨");LinearLayout line=new LinearLayout(this);line.setGravity(Gravity.CENTER_VERTICAL);line.addView(text(links[i][0],13,false),new LinearLayout.LayoutParams(0,-2,1));line.addView(fidelityCaption(value));integrationDetails.addView(line);}
        root.addView(AccountScreens.detailSheetTrigger(this,"내 업체 연동 상태",integrationDetails),blockParams());
        if (isOwner()) {
            LinearLayout management=new LinearLayout(this);management.setOrientation(LinearLayout.VERTICAL);management.setBackground(round(PANEL,6,LINE));
            addSection("대표 관리");
            LinearLayout toolsContent=new LinearLayout(this);toolsContent.setOrientation(LinearLayout.VERTICAL);
            groupedMenu(toolsContent,"직원 관리",this::showMembers);
            groupedMenu(toolsContent,"직원 전체·개별 알림",this::showNotificationCompose);
            groupedMenu(toolsContent,"고객 메시지 설정",this::showTemplates);
            management.addView(toolsContent);
            root.addView(management,blockParams());
        }
        Button out=secondary("로그아웃");root.addView(out);out.setOnClickListener(v -> logout());
    }

    private void groupedMenu(LinearLayout group,String title,Runnable action) {
        if(group.getChildCount()>0){View line=new View(this);line.setBackgroundColor(LINE);LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,dp(1));p.leftMargin=dp(16);p.rightMargin=dp(16);group.addView(line,p);}
        LinearLayout row=new LinearLayout(this);row.setGravity(Gravity.CENTER_VERTICAL);row.setPadding(dp(16),dp(12),dp(16),dp(12));row.setMinimumHeight(dp(52));
        row.addView(text(title,14,false),new LinearLayout.LayoutParams(0,-2,1));row.addView(text("›",20,false));row.setClickable(true);row.setFocusable(true);row.setOnClickListener(v->action.run());group.addView(row,new LinearLayout.LayoutParams(-1,-2));
    }

    private void menu(String title, Runnable action) {
        Button row=secondary(title+"  ›");row.setGravity(Gravity.START|Gravity.CENTER_VERTICAL);
        root.addView(row);row.setOnClickListener(v -> action.run());
    }

    private void showSecurity() {
        activeTab="more";base();addHeader();
        final int generation = requestGeneration;
        if(!isOwner())menu("내 담당 업무",this::showNotifications);
        root.addView(AccountScreens.security(this,api,me,() -> {
            if (sameGeneration(generation)) clearSessionAndShowLogin("다시 로그인해 주세요.");
        }));
    }
    private void showUpdate() {
        activeTab="more";base();addHeader();
        updateView = AccountScreens.update(this,api);
        root.addView(updateView);
    }
    private void showNotificationSettings() {
        activeTab="more";base();addHeader();
        root.addView(NotificationSettings.settings(this,notificationsEnabled(),()->PushManager.registerCurrentDevice(this,api,notificationsEnabled()),this::showTemplates));
        menu("휴대폰 알림 권한 설정",()->{
            Intent intent=new Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            intent.putExtra(android.provider.Settings.EXTRA_APP_PACKAGE,getPackageName());startActivity(intent);
        });
        menu("알림 종류별 미리보기",this::showNotificationPreview);
    }
    private void fidelityKeyValue(LinearLayout parent,String title,String value) {
        TextView content=text(value,12,false);content.setGravity(Gravity.START);content.setPadding(0,0,0,0);
        fidelityKeyValue(parent,title,content);
    }

    private void fidelityKeyValue(LinearLayout parent,String title,View content) {
        LinearLayout row=new LinearLayout(this);row.setGravity(Gravity.TOP);row.setPadding(0,dp(8),0,dp(8));
        TextView key=text(title,12,true);key.setTextColor(Color.rgb(118,111,100));key.setPadding(0,0,0,0);row.addView(key,new LinearLayout.LayoutParams(dp(78),-2));
        LinearLayout.LayoutParams valueParams=new LinearLayout.LayoutParams(0,-2,1);valueParams.setMargins(dp(9),0,0,0);row.addView(content,valueParams);parent.addView(row);
    }

    private TextView fidelityCaption(String value) {
        TextView view=text(value,12,false);view.setTextColor(MUTED);view.setPadding(0,dp(3),0,dp(3));return view;
    }

    private LinearLayout fidelityColumn() {
        LinearLayout view=new LinearLayout(this);view.setOrientation(LinearLayout.VERTICAL);return view;
    }

    private void fidelityDivider(LinearLayout parent) {
        View line=new View(this);line.setBackgroundColor(LINE);LinearLayout.LayoutParams params=new LinearLayout.LayoutParams(-1,dp(1));params.setMargins(0,dp(12),0,dp(12));parent.addView(line,params);
    }

    private TextView fidelityMetric(LinearLayout parent,String title,String caption) {
        LinearLayout metric=fidelityColumn();metric.setPadding(0,dp(16),dp(12),0);
        metric.addView(fidelityCaption(title));TextView value=text("—",32,true);metric.addView(value);metric.addView(fidelityCaption(caption));fidelityDivider(metric);
        parent.addView(metric,new LinearLayout.LayoutParams(0,-2,1));return value;
    }

    private void fidelitySection(String title,String action,Runnable open) {
        LinearLayout row=new LinearLayout(this);row.setGravity(Gravity.CENTER_VERTICAL);row.setPadding(0,dp(20),0,dp(8));
        row.addView(text(title,17,true),new LinearLayout.LayoutParams(0,-2,1));
        if(action!=null){Button link=textButton(action);link.setTextSize(12);link.setMinWidth(0);link.setMinimumWidth(0);link.setPadding(dp(8),0,0,0);row.addView(link,new LinearLayout.LayoutParams(-2,dp(48)));link.setOnClickListener(v->open.run());}
        root.addView(row);
    }

    private void styleTenantState(TextView state,JSONObject tenant) {
        boolean pending="pending".equals(tenant.optString("onboarding_status"));boolean suspended=tenant.optBoolean("suspended");
        state.setText(pending?"설정 대기":suspended?"이용 중지":"사용중");state.setTextSize(10);
        state.setTextColor(pending?Color.rgb(136,100,33):suspended?Color.rgb(102,107,112):Color.rgb(53,99,78));
        state.setPadding(dp(7),dp(4),dp(7),dp(4));
        state.setBackground(round(pending?Color.rgb(246,240,227):suspended?Color.rgb(238,240,241):Color.rgb(237,243,238),4,Color.TRANSPARENT));
    }

    private void showPlatformHome() {
        activeTab="home";base();addHeader();root.addView(text("운영 대시보드",23,true));root.addView(fidelityCaption("폴라애드 전체 관리자"));
        fidelityDivider(root);root.addView(fidelityCaption("POLARAD INTERIOR CRM"));
        root.addView(text("거래처의 업무를 연결하고,\n운영 상태를 관리하세요.",21,true));
        root.addView(fidelityCaption("고객 데이터는 업체별 독립 업무공간에서 관리됩니다."));fidelityDivider(root);
        LinearLayout metrics=new LinearLayout(this);TextView registered=fidelityMetric(metrics,"등록 거래처","관리자 전용 현황");
        TextView connected=fidelityMetric(metrics,"정상 연동","연결 검증 현황");root.addView(metrics);
        Button add=primary("새 거래처 등록");root.addView(add);add.setOnClickListener(v->showTenantEditor());
        fidelitySection("거래처 관리","전체 보기",this::showPlatformTenants);
        LinearLayout preview=fidelityColumn();root.addView(preview);
        fidelitySection("운영 확인",null,null);
        LinearLayout operations=fidelityColumn();operations.setPadding(dp(16),dp(14),dp(16),dp(14));operations.setBackground(round(Color.WHITE,6,LINE));root.addView(operations,blockParams());
        operations.addView(text("알림 처리 상태",14,true));TextView dispatchValue=fidelityCaption("현황을 확인하는 중입니다.");operations.addView(dispatchValue);fidelityDivider(operations);
        operations.addView(text("계정·보안 이벤트",14,true));TextView auditValue=fidelityCaption("최근 이력을 확인하는 중입니다.");operations.addView(auditValue);
        root.addView(note("이 화면은 전체 관리자만 볼 수 있습니다. 거래처 로그인에는 목록·업체 수·타 업체명이 표시되지 않습니다."),blockParams());
        final int generation=requestGeneration;
        api.call("GET","/api/mobile/platform/overview",null,(payload,status,error)->runOnUiThread(()->{
            if(!sameGeneration(generation)||handleAuthFailure(status))return;
            if(status<200||status>=300){registered.setText("조회 실패");connected.setText("—");dispatchValue.setText("운영 현황을 불러오지 못했습니다.");auditValue.setText("다시 조회해 주세요.");return;}
            JSONObject tenants=payload.optJSONObject("tenants");registered.setText(tenants==null||tenants.isNull("registered")?"—":tenants.optInt("registered")+"개");
            JSONObject integration=payload.optJSONObject("integration");connected.setText(integration==null||integration.isNull("count")?"미집계":integration.optInt("count")+"개");
            JSONObject dispatch=payload.optJSONObject("dispatch");dispatchValue.setText(dispatch==null||dispatch.isNull("pending")?"발송 대기 집계 없음":"발송 대기 "+dispatch.optInt("pending")+"건 · 재시도 미집계");
            JSONObject audit=payload.optJSONObject("security_audit");JSONArray records=audit==null?null:audit.optJSONArray("records");
            if(audit!=null&&"unknown".equals(audit.optString("status")))auditValue.setText("보안 이력을 불러오지 못했습니다.");
            else if(records==null||records.length()==0)auditValue.setText("최근 보안 이력이 없습니다.");
            else{JSONObject first=records.optJSONObject(0);auditValue.setText(first==null?"최근 보안 이력이 없습니다.":formatIsoForDisplay(first.optString("created_at"))+" · "+first.optString("action"));}
        }));
        api.call("GET","/api/mobile/platform/tenants",null,(payload,status,error)->runOnUiThread(()->{
            if(!sameGeneration(generation)||handleAuthFailure(status))return;
            if(status<200||status>=300){preview.addView(fidelityCaption("거래처를 불러오지 못했습니다."));return;}
            JSONArray tenants=payload.optJSONArray("tenants");if(tenants==null||tenants.length()==0){preview.addView(fidelityCaption("등록된 거래처가 없습니다."));return;}
            JSONObject tenant=tenants.optJSONObject(0);if(tenant==null)return;
            LinearLayout card=fidelityColumn();card.setPadding(dp(16),dp(14),dp(16),dp(14));card.setBackground(round(Color.WHITE,6,LINE));
            LinearLayout heading=new LinearLayout(this);heading.setGravity(Gravity.CENTER_VERTICAL);heading.addView(text(tenant.optString("name"),16,true),new LinearLayout.LayoutParams(0,-2,1));
            TextView state=fidelityCaption("pending".equals(tenant.optString("onboarding_status"))?"설정 대기":tenant.optBoolean("suspended")?"이용 중지":"사용중");heading.addView(state);card.addView(heading);
            styleTenantState(state,tenant);
            card.addView(fidelityCaption(tenant.optString("owner_email","등록 이메일 없음")));fidelityDivider(card);card.addView(fidelityCaption("계정 및 데이터 연동 상태 확인"));
            card.setOnClickListener(v->showPlatformTenantDetail(tenant.optString("id")));card.setFocusable(true);preview.addView(card,blockParams());
        }));
    }

    private void showCustomers(String query) {
        customerDetailActive = false;
        customerQuery = query;
        activeTab = "customers";
        String scheduleKind=pendingScheduleKind;
        base();pendingScheduleKind=scheduleKind;
        current = null;
        addHeader();
        root.addView(text("상담신청", 23, true));root.addView(fidelityCaption("업체 고객 정보"));root.addView(label("고객 검색"));
        EditText search = input("고객명, 연락처, 지역 검색", InputType.TYPE_CLASS_TEXT, false);
        search.setSingleLine(true);
        search.setText(query);
        root.addView(search);
        LinearLayout list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        root.addView(list);
        LinearLayout statusTabs=new LinearLayout(this);String[] groupNames={"전체","접수대기","진행중","계약완료"};String[] groupValues={"","__pending","__progress","__contract"};
        for(int i=0;i<groupNames.length;i++){final String group=groupValues[i];Button tab=secondary(groupNames[i]);tab.setTextSize(12);if(group.equals(customerStatus)){tab.setTextColor(ACTION);tab.setBackground(round(Color.rgb(251,242,227),6,Color.rgb(221,195,153)));}statusTabs.addView(tab,new LinearLayout.LayoutParams(0,dp(48),1));tab.setOnClickListener(v->{customerStatus=group;showCustomers(search.getText().toString().trim());});}root.addView(statusTabs,root.indexOfChild(list));
        root.addView(label("접수 위치"),root.indexOfChild(list));
        LinearLayout sourceTabs=new LinearLayout(this);
        String[] sourceNames={"전체","홈페이지","Meta"};
        String[] sourceValues={"","__homepage","__meta"};
        for(int i=0;i<sourceNames.length;i++){
            final String source=sourceValues[i];
            Button tab=secondary(sourceNames[i]);
            tab.setTextSize(12);
            if(source.equals(customerSource)){tab.setTextColor(ACTION);tab.setBackground(round(Color.rgb(251,242,227),6,Color.rgb(221,195,153)));}
            sourceTabs.addView(tab,new LinearLayout.LayoutParams(0,dp(48),1));
            tab.setOnClickListener(v->{customerSource=source;showCustomers(search.getText().toString().trim());});
        }
        root.addView(sourceTabs,root.indexOfChild(list));
        final int searchGeneration=requestGeneration;
        android.os.Handler searchHandler=new android.os.Handler(android.os.Looper.getMainLooper());
        Runnable[] pendingSearch={null};
        search.addTextChangedListener(new TextWatcher(){
            public void beforeTextChanged(CharSequence value,int start,int count,int after){}
            public void afterTextChanged(Editable value){}
            public void onTextChanged(CharSequence value,int start,int before,int count){
                if(pendingSearch[0]!=null)searchHandler.removeCallbacks(pendingSearch[0]);
                String nextQuery=value.toString().trim();customerQuery=nextQuery;
                pendingSearch[0]=()->{if(sameGeneration(searchGeneration)){list.removeAllViews();loadCustomersInto(list,nextQuery,"",true);}};
                searchHandler.postDelayed(pendingSearch[0],400);
            }
        });
        loadCustomersInto(list, query, "", true);
        Button intake=secondary("접수통계 보기");root.addView(intake);intake.setOnClickListener(v->showAnalytics("intake"));
        Button message=secondary("문자 발송 · 내보내기");root.addView(message);message.setOnClickListener(v->{if(current!=null)showCustomerMessage();else toast("문자 발송·내보내기는 고객카드에서 대상 고객을 선택한 뒤 사용하세요.");});
    }

    private void showSchedule() {
        activeTab = "calendar";
        base();
        addHeader();
        root.setPadding(0, 0, 0, 0);
        final int generation = requestGeneration;
        root.addView(CalendarScreen.create(this, api, this::showDetail,
                kind -> { showCustomers(""); pendingScheduleKind=kind; toast("일정을 등록할 고객을 선택하세요."); }, Color.rgb(36, 84, 214),
                status -> { if(sameGeneration(generation)) handleAuthFailure(status); }), blockParams());
    }

    private void showMembers() {
        if (!isOwner()) { showNotifications(); return; }
        base();
        addHeader();
        root.addView(text("함께 일하는 사람", 23, true));
        root.addView(fidelityCaption(tenantName()+" · 대표계정"));
        if (isPlatform()) {
            Button tenants = primary("업체 관리");
            root.addView(tenants);
            tenants.setOnClickListener(v -> showPlatformTenants());
        }
        LinearLayout ownerList=fidelityColumn(); root.addView(ownerList,blockParams());
        LinearLayout staffList=fidelityColumn(); root.addView(staffList,blockParams());
        EditText memberName = null;
        EditText memberEmail = null;
        Button memberRegister = null;
        if (isOwner()) {
            memberName = input("직원 이름", InputType.TYPE_CLASS_TEXT, false);
            memberEmail = input("직원 이메일", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS, false);
            memberName.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(40)});
            root.addView(label("직원 이름"));
            root.addView(memberName, blockParams());
            root.addView(label("직원 로그인 이메일"));
            root.addView(memberEmail, blockParams());
            memberRegister = primary("직원 등록");
            root.addView(memberRegister, blockParams());
            final EditText registerName = memberName;
            final EditText registerEmail = memberEmail;
            final Button registerButton = memberRegister;
            registerButton.setOnClickListener(v -> {
                String displayName = registerName.getText().toString().trim();
                String email = registerEmail.getText().toString().trim();
                if (displayName.isEmpty()) { registerName.setError("이름을 입력하세요"); return; }
                if (email.isEmpty()) { registerEmail.setError("이메일을 입력하세요"); return; }
                JSONObject payload = new JSONObject();
                tryPut(payload, "name", displayName);
                tryPut(payload, "email", email);
                tryPut(payload, "role", "staff");
                submit(registerButton, "POST", "/api/mobile/members", payload, "직원을 등록했습니다.", false);
            });
        }
        final int generation = requestGeneration;
        String membersPath = "/api/mobile/members";
        api.call("GET", membersPath, null, (body, status, error) -> runOnUiThread(() -> {
            if (!sameGeneration(generation)) return;
            if (handleAuthFailure(status)) return;
            if (status < 200 || status >= 300) {
                root.addView(body(message(body, error, "직원 정보를 불러오지 못했습니다.")));
                return;
            }
            JSONArray rows = body.optJSONArray("members");
            int activeStaff = 0;
            for (int i = 0; rows != null && i < rows.length(); i++) {
                JSONObject member = rows.optJSONObject(i);
                if (member != null && "staff".equals(member.optString("role", "")) && member.optBoolean("active", true)) activeStaff++;
            }
            staffList.addView(text("직원 " + activeStaff + "명", 17, true), blockParams());
            if(activeStaff==0)staffList.addView(body("등록된 직원이 없습니다. 직원을 등록하면 담당 업무 기능이 활성화됩니다."));
            for (int i = 0; rows != null && i < rows.length(); i++) {
                JSONObject member = rows.optJSONObject(i);
                if (member == null) continue;
                LinearLayout card = new LinearLayout(this);
                card.setOrientation(LinearLayout.HORIZONTAL);
                card.setGravity(Gravity.CENTER_VERTICAL);
                String role = member.optString("role", "");
                String name = member.optString("name", "");
                if (name.isEmpty()) name = "owner".equals(role) ? "대표" : "이름 미등록";
                card.setPadding(0, dp(12), 0, dp(12));
                LinearLayout person=fidelityColumn();
                person.addView(text("owner".equals(role)?"대표":name,14,true));
                person.addView(fidelityCaption(member.optString("email","이메일 없음")));
                card.addView(person,new LinearLayout.LayoutParams(0,-2,1));
                if(isOwner() && "staff".equals(role)) {
                    Button deactivate=textButton("계정 해제");deactivate.setTextColor(Color.rgb(160,68,59));
                    card.addView(deactivate,new LinearLayout.LayoutParams(-2,-2));
                    String id=member.optString("id","");
                    deactivate.setOnClickListener(v -> setMemberActive(id,false,deactivate));
                }
                LinearLayout destination="owner".equals(role)?ownerList:staffList;
                destination.addView(card,new LinearLayout.LayoutParams(-1,-2));fidelityDivider(destination);
            }
            root.addView(text("직원 담당 업무", 17, true), blockParams());
            Button assignments = secondary("담당 업무 작성");
            assignments.setEnabled(activeStaff > 0); assignments.setAlpha(activeStaff>0?1f:.5f);
            root.addView(assignments, blockParams());
            assignments.setOnClickListener(v -> showCustomerAssignment());
            Button alerts=secondary("전체·개별 알림 보내기");alerts.setEnabled(activeStaff>0);root.addView(alerts,blockParams());alerts.setOnClickListener(v -> showNotificationCompose());
        }));
    }

    private void showCustomerAssignment() {
        if (!isOwner()) { showNotifications(); return; }
        base();
        addHeader();
        root.addView(text("고객 담당자 지정", 26, true));
        root.addView(body(tenantName() + " · 대표계정"));
        LinearLayout content = fidelityColumn();
        root.addView(content, blockParams());
        content.addView(body("고객과 직원을 불러오는 중입니다."));
        final ArrayList<JSONObject> customers = new ArrayList<>();
        final ArrayList<JSONObject> staff = new ArrayList<>();
        final String[] customerId = {""};
        final String[] assigneeId = {""};
        final String[] existingAssigneeId = {""};
        final int[] customerVersion = {1};
        final int[] customerPages = {0};
        final String[] customerNextCursor = {""};
        final ArrayList<String> seenCustomerCursors = new ArrayList<>();
        final Button customer = choiceButton("고객 선택");
        final Button assignee = choiceButton("담당 직원 선택");
        final EditText messageInput = input("확인할 사항이나 후속 업무", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE, true);
        final Button save = primary("담당자 지정");
        final Button moreCustomers = secondary("고객 더 보기");
        save.setEnabled(false);
        final int generation = requestGeneration;
        seenCustomerCursors.add("");
        api.call("GET", "/api/mobile/customers?cursor=", null, (customerPayload, customerStatus, customerError) -> runOnUiThread(() -> {
            if (!sameGeneration(generation) || handleAuthFailure(customerStatus)) return;
            if (customerStatus < 200 || customerStatus >= 300) { content.removeAllViews(); content.addView(body(message(customerPayload, customerError, "고객을 불러오지 못했습니다."))); return; }
            JSONArray customerRows = customerPayload.optJSONArray("customers");
            if (customerRows != null) for (int i = 0; i < customerRows.length(); i++) { JSONObject row = customerRows.optJSONObject(i); if (row != null) customers.add(row); }
            customerPages[0] = 1;
            customerNextCursor[0] = customerPayload.optString("next_cursor", "");
            api.call("GET", "/api/mobile/members", null, (memberPayload, memberStatus, memberError) -> runOnUiThread(() -> {
                if (!sameGeneration(generation) || handleAuthFailure(memberStatus)) return;
                content.removeAllViews();
                if (memberStatus < 200 || memberStatus >= 300) { content.addView(body(message(memberPayload, memberError, "직원을 불러오지 못했습니다."))); return; }
                JSONArray memberRows = memberPayload.optJSONArray("members");
                if (memberRows != null) for (int i = 0; i < memberRows.length(); i++) { JSONObject row = memberRows.optJSONObject(i); if (row != null && "staff".equals(row.optString("role")) && row.optBoolean("active", true)) staff.add(row); }
                if (customers.isEmpty()) { content.addView(body("등록된 고객이 없습니다.")); return; }
                if (staff.isEmpty()) { content.addView(body("등록된 활성 직원이 없어 담당자 지정이 비활성입니다.")); return; }
                content.addView(label("고객")); content.addView(customer, blockParams());
                content.addView(label("담당 직원")); content.addView(assignee, blockParams());
                content.addView(label("전달할 내용")); content.addView(messageInput, blockParams());
                content.addView(fidelityCaption("고객카드 담당자를 변경하고 지정된 직원에게만 앱 알림을 전달합니다."), blockParams());
                content.addView(save, blockParams());
                content.addView(moreCustomers, blockParams());
                moreCustomers.setEnabled(!customerNextCursor[0].isEmpty());
                customer.setOnClickListener(v -> {
                    String[] labels = new String[customers.size()];
                    for (int i = 0; i < customers.size(); i++) labels[i] = customers.get(i).optString("name", "이름 없음") + " · " + customers.get(i).optString("email", "");
                    choose("고객 선택", labels, value -> { for (int i = 0; i < labels.length; i++) if (labels[i].equals(value)) { JSONObject selected = customers.get(i); customerId[0] = selected.optString("id"); customerVersion[0] = selected.optInt("version", 1); existingAssigneeId[0] = selected.optString("assignee_id", ""); customer.setText(selected.optString("name", "이름 없음")); } save.setEnabled(!customerId[0].isEmpty() && !assigneeId[0].isEmpty()); });
                });
                assignee.setOnClickListener(v -> {
                    String[] labels = new String[staff.size()];
                    for (int i = 0; i < staff.size(); i++) labels[i] = staff.get(i).optString("name", staff.get(i).optString("email"));
                    choose("담당 직원 선택", labels, value -> { for (int i = 0; i < labels.length; i++) if (labels[i].equals(value)) { JSONObject selected = staff.get(i); assigneeId[0] = selected.optString("id"); assignee.setText(selected.optString("name", selected.optString("email"))); } save.setEnabled(!customerId[0].isEmpty() && !assigneeId[0].isEmpty()); });
                });
                save.setOnClickListener(v -> {
                    String note = messageInput.getText().toString().trim();
                    if (customerId[0].isEmpty()) { toast("고객을 선택하세요."); return; }
                    if (assigneeId[0].isEmpty()) { toast("담당 직원을 선택하세요."); return; }
                    JSONObject update = new JSONObject(); tryPut(update, "assignee_id", assigneeId[0]); tryPut(update, "version", customerVersion[0]); tryPut(update, "assignment_message", note);
                    if (!note.isEmpty() && assigneeId[0].equals(existingAssigneeId[0])) { toast("현재 담당자가 동일하여 전달 내용은 저장되지 않습니다. 담당자를 변경한 뒤 다시 지정하세요."); return; }
                    save.setEnabled(false);
                    api.call("PATCH", "/api/mobile/customers/" + Uri.encode(customerId[0]), update, (updated, updateStatus, updateError) -> runOnUiThread(() -> {
                        if (!sameGeneration(generation) || handleAuthFailure(updateStatus)) return;
                        if (updateStatus < 200 || updateStatus >= 300) { save.setEnabled(true); toast(message(updated, updateError, "담당자 저장에 실패했습니다.")); return; }
                        toast(note.isEmpty() ? "담당자를 지정했습니다." : "담당자를 지정하고 전달 내용을 알렸습니다.");
                        showMembers();
                    }));
                });
                moreCustomers.setOnClickListener(v -> {
                    String cursor = customerNextCursor[0];
                    if (cursor.isEmpty() || customerPages[0] >= 5 || seenCustomerCursors.contains(cursor)) { moreCustomers.setEnabled(false); return; }
                    seenCustomerCursors.add(cursor); moreCustomers.setEnabled(false);
                    api.call("GET", "/api/mobile/customers?cursor=" + Uri.encode(cursor), null, (nextPayload, nextStatus, nextError) -> runOnUiThread(() -> {
                        if (!sameGeneration(generation) || handleAuthFailure(nextStatus)) return;
                        if (nextStatus < 200 || nextStatus >= 300) { seenCustomerCursors.remove(cursor); moreCustomers.setEnabled(true); toast(message(nextPayload, nextError, "고객을 더 불러오지 못했습니다.")); return; }
                        JSONArray nextRows = nextPayload.optJSONArray("customers");
                        if (nextRows != null) for (int i = 0; i < nextRows.length(); i++) { JSONObject row = nextRows.optJSONObject(i); if (row != null) customers.add(row); }
                        customerPages[0]++;
                        customerNextCursor[0] = nextPayload.optString("next_cursor", "");
                        moreCustomers.setEnabled(!customerNextCursor[0].isEmpty() && customerPages[0] < 5);
                        toast("고객 목록을 추가로 불러왔습니다.");
                    }));
                });
            }));
        }));
    }

    private void showMemberEditor() {
        if (!isOwner()) { showNotifications(); return; }
        Dialog dialog = sheet();
        LinearLayout box = sheetBox();
        box.addView(text("직원 등록", 22, true));
        EditText name = input("직원 이름", InputType.TYPE_CLASS_TEXT, false);
        box.addView(name);
        EditText email = input("직원 이메일", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS, false);
        box.addView(email);
        Button save = primary("직원 등록");
        box.addView(save);
        save.setOnClickListener(v -> {
            String displayName = name.getText().toString().trim();
            String value = email.getText().toString().trim();
            if (displayName.isEmpty()) { name.setError("이름을 입력하세요"); return; }
            if (value.isEmpty()) { email.setError("이메일을 입력하세요"); return; }
            JSONObject payload = new JSONObject();
            tryPut(payload, "email", value);
            tryPut(payload, "name", displayName);
            tryPut(payload, "role", "staff");
            submit(save, "POST", "/api/mobile/members", payload, "직원을 추가했습니다.", false, dialog);
        });
        setSheetContent(dialog, box);
        dialog.show();
        sizeSheet(dialog);
    }

    private void showPlatformTenants() {
        activeTab="customers";base();addHeader();root.addView(text("거래처 관리",23,true));
        root.addView(fidelityCaption("폴라애드 관리자 전용"));
        Button add=primary("거래처 추가 등록");root.addView(add);add.setOnClickListener(v->showTenantEditor());
        root.addView(label("거래처 검색"));
        EditText search=input("업체명 또는 등록 이메일",InputType.TYPE_CLASS_TEXT,false);root.addView(search);
        LinearLayout list=new LinearLayout(this);list.setOrientation(LinearLayout.VERTICAL);root.addView(list);
        list.setTag(search);
        final Runnable[] pendingSearch = {null};
        search.addTextChangedListener(new TextWatcher(){
            public void beforeTextChanged(CharSequence value,int start,int count,int after){}
            public void onTextChanged(CharSequence value,int start,int before,int count){
                if(pendingSearch[0]!=null) search.removeCallbacks(pendingSearch[0]);
                final String query=value.toString().trim();
                pendingSearch[0]=()->{
                    list.removeAllViews();
                    loadPlatformTenantPage(list,"",query);
                };
                search.postDelayed(pendingSearch[0],300);
            }
            public void afterTextChanged(Editable value){}
        });
        loadPlatformTenantPage(list,"","");
        root.addView(note("지원 접근은 관리자 세션을 보존하며 서버가 부여한 권한 모드로 업무화면을 엽니다. 고객 발송은 별도 승인 없이 실행하지 않습니다."),blockParams());
    }

    private void loadPlatformTenantPage(LinearLayout list,String cursor,String query) {
        final int generation=requestGeneration;
        final Object searchRequest=list.getTag();
        api.call("GET","/api/mobile/platform/tenants?cursor="+Uri.encode(cursor)+"&q="+Uri.encode(query),null,(payload,status,error)->runOnUiThread(()->{
            if(!sameGeneration(generation)||searchRequest!=list.getTag()||handleAuthFailure(status))return;
            EditText activeSearch=(EditText)list.getTag();
            if(!query.equals(activeSearch.getText().toString().trim()))return;
            if(status<200||status>=300){list.addView(body("거래처를 불러오지 못했습니다."));return;}
            JSONArray rows=payload.optJSONArray("tenants");
            if(rows!=null)for(int i=0;i<rows.length();i++){
                JSONObject tenant=rows.optJSONObject(i);if(tenant==null)continue;
                LinearLayout card=new LinearLayout(this);card.setOrientation(LinearLayout.VERTICAL);
                card.setPadding(dp(14),dp(14),dp(14),dp(14));card.setBackground(round(Color.WHITE,6,LINE));
                String id=tenant.optString("id");boolean suspended=tenant.optBoolean("suspended");
                LinearLayout heading=new LinearLayout(this);heading.setGravity(Gravity.CENTER_VERTICAL);
                heading.addView(text(tenant.optString("name",id),17,true),new LinearLayout.LayoutParams(0,-2,1));
                boolean pending="pending".equals(tenant.optString("onboarding_status"));
                TextView state=text(pending?"설정 대기":suspended?"이용 중지":"사용중",10,true);
                styleTenantState(state,tenant);
                heading.addView(state);card.addView(heading);
                card.addView(fidelityCaption(tenant.isNull("owner_email")?"등록 이메일 없음":tenant.optString("owner_email")));
                card.addView(fidelityCaption(pending?"데이터 연동 검증 대기":"계정 및 데이터 연동 관리"));
                card.setOnClickListener(v->showPlatformTenantDetail(id));card.setFocusable(true);
                list.addView(card,blockParams());
            }
            String next=payload.isNull("next_cursor")?"":payload.optString("next_cursor");
            if((rows==null||rows.length()==0)&&cursor.isEmpty())list.addView(body("일치하는 거래처가 없습니다."));
            if(!next.isEmpty()){
                Button more=secondary("다음 거래처 더 보기");list.addView(more);
                more.setOnClickListener(v->{list.removeView(more);loadPlatformTenantPage(list,next,query);});
            }
        }));
    }

    private void showTenantDeliverySettings(String tenantId, String tenantName) {
        Dialog dialog = sheet();
        LinearLayout box = sheetBox();
        box.addView(text("발송 연결 · " + tenantName, 22, true));
        box.addView(body("관리자가 이 업체의 발송 자격과 메시지 내용을 등록합니다. 저장만 해도 고객에게 즉시 발송되지 않으며, 활성화된 향후 알림만 선택한 채널로 연결됩니다."));

        TextView status = body("설정 정보를 불러오는 중입니다.");
        box.addView(status);
        TextView channelLabel = body("채널: 선택 전");
        box.addView(channelLabel);
        final String[] channel = {"sms"};
        Button channelButton = choiceButton("채널 선택");
        box.addView(channelButton);

        LinearLayout sharedFields = new LinearLayout(this);
        sharedFields.setOrientation(LinearLayout.VERTICAL);
        EditText accessKey = input("SENS Access Key", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD, false);
        EditText secretKey = input("SENS Secret Key", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD, false);
        EditText contactPhone = input("운영 담당 연락처", InputType.TYPE_CLASS_PHONE, false);
        sharedFields.addView(label("공통 발송 자격"));
        sharedFields.addView(accessKey);
        sharedFields.addView(secretKey);
        sharedFields.addView(contactPhone);
        box.addView(sharedFields);

        LinearLayout smsFields = new LinearLayout(this);
        smsFields.setOrientation(LinearLayout.VERTICAL);
        EditText serviceId = input("SENS 서비스 ID", InputType.TYPE_CLASS_TEXT, false);
        EditText fromNumber = input("발신번호", InputType.TYPE_CLASS_PHONE, false);
        smsFields.addView(label("SMS / LMS 연결"));
        smsFields.addView(serviceId);
        smsFields.addView(fromNumber);
        box.addView(smsFields);

        LinearLayout alimtalkFields = new LinearLayout(this);
        alimtalkFields.setOrientation(LinearLayout.VERTICAL);
        EditText alimtalkServiceId = input("알림톡 서비스 ID", InputType.TYPE_CLASS_TEXT, false);
        EditText channelId = input("알림톡 채널 ID", InputType.TYPE_CLASS_TEXT, false);
        EditText visitTemplate = input("방문 템플릿 코드", InputType.TYPE_CLASS_TEXT, false);
        EditText measurementTemplate = input("실측 템플릿 코드", InputType.TYPE_CLASS_TEXT, false);
        alimtalkFields.addView(label("알림톡 연결"));
        alimtalkFields.addView(alimtalkServiceId);
        alimtalkFields.addView(channelId);
        alimtalkFields.addView(visitTemplate);
        alimtalkFields.addView(measurementTemplate);
        box.addView(alimtalkFields);

        box.addView(label("고객에게 보낼 문구 · LMS"));
        box.addView(note("문자 본문은 LMS 기준입니다. 아래 항목 버튼을 누르면 현재 커서 위치에 들어가며, 직접 입력한 줄바꿈과 문장 순서를 그대로 저장합니다. 알림톡 승인 템플릿 코드는 아래 연결 정보에서 별도로 관리합니다."), blockParams());
        EditText visitBody = input("상담 방문 안내 문구", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE, true);
        EditText measurementBody = input("실측 안내 문구", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE, true);
        visitBody.setText("{{name}}님, {{date}} {{time}} {{location}} 방문 일정 안내.\n주소: {{address}}\n지도: {{map}}\n문의: {{contact_phone}}");
        measurementBody.setText("{{name}}님, {{date}} {{time}} {{location}} 실측 일정 안내.\n주소: {{address}}\n지도: {{map}}\n문의: {{contact_phone}}");
        box.addView(label("상담 방문 문구"));
        box.addView(visitBody);
        TextView visitPreview = body("");
        box.addView(label("미리보기"));
        box.addView(visitPreview, blockParams());
        addMessageTokenButtons(box, visitBody, visitPreview);
        box.addView(label("실측 문구"));
        box.addView(measurementBody);
        TextView measurementPreview = body("");
        box.addView(label("미리보기"));
        box.addView(measurementPreview, blockParams());
        addMessageTokenButtons(box, measurementBody, measurementPreview);
        updateMessagePreview(visitBody, visitPreview);
        updateMessagePreview(measurementBody, measurementPreview);

        TextView enabledLabel = body("사용 안 함");
        box.addView(enabledLabel);
        Button enabledButton = secondary("발송 연결 활성화");
        enabledButton.setEnabled(false);
        box.addView(enabledButton);
        Button save = primary("승인 문구와 발송 연결 저장");
        save.setEnabled(false);
        box.addView(save);

        final boolean[] hasCredentials = {false};
        final boolean[] configured = {false};
        final boolean[] enabled = {false};
        final JSONArray[] missingFields = {new JSONArray()};
        final Runnable[] updateReadiness = {null};

        Runnable updateChannel = () -> {
            boolean sms = "sms".equals(channel[0]);
            channelLabel.setText("채널: " + (sms ? "SMS / LMS" : "알림톡"));
            smsFields.setVisibility(sms ? View.VISIBLE : View.GONE);
            alimtalkFields.setVisibility(sms ? View.GONE : View.VISIBLE);
            if (updateReadiness[0] != null) updateReadiness[0].run();
        };
        channelButton.setOnClickListener(v -> choose("발송 채널", new String[]{"SMS / LMS", "알림톡"}, value -> {
            channel[0] = "알림톡".equals(value) ? "alimtalk" : "sms";
            updateChannel.run();
        }));
        updateChannel.run();

        updateReadiness[0] = () -> {
            JSONArray localMissing = new JSONArray();
            if (!hasCredentials[0] && (blank(accessKey) || blank(secretKey))) addMissing(localMissing, "access_key");
            if (blank(contactPhone)) addMissing(localMissing, "contact_phone");
            if ("sms".equals(channel[0])) {
                if (blank(serviceId)) addMissing(localMissing, "sms_service_id");
                if (blank(fromNumber)) addMissing(localMissing, "from_number");
            } else {
                if (blank(alimtalkServiceId)) addMissing(localMissing, "alimtalk_service_id");
                if (blank(channelId)) addMissing(localMissing, "channel_id");
                if (blank(visitTemplate)) addMissing(localMissing, "visit_template_code");
                if (blank(measurementTemplate)) addMissing(localMissing, "measurement_template_code");
            }
            if (blank(visitBody)) addMissing(localMissing, "visit_body");
            if (blank(measurementBody)) addMissing(localMissing, "measurement_body");
            missingFields[0] = localMissing;
            configured[0] = localMissing.length() == 0;
            String missing = localMissing.length() == 0 ? "없음" : joinMissingFields(localMissing);
            status.setText(configured[0] ? "필수 설정 완료 · 누락 항목: 없음" : "등록 상태 · 누락 항목: " + missing);
            enabledButton.setEnabled(configured[0] || enabled[0]);
        };
        watchFields(updateReadiness[0], accessKey, secretKey, contactPhone, serviceId, fromNumber,
            alimtalkServiceId, channelId, visitTemplate, measurementTemplate, visitBody, measurementBody);

        enabledButton.setOnClickListener(v -> {
            if (!configured[0] && !enabled[0]) {
                toast("필수 발송 설정을 먼저 등록하세요.");
                return;
            }
            enabled[0] = !enabled[0];
            enabledLabel.setText(enabled[0] ? "사용 중 · 향후 알림부터 선택한 채널로 연결" : "사용 안 함");
            enabledButton.setText(enabled[0] ? "발송 연결 비활성화" : "발송 연결 활성화");
        });
        save.setOnClickListener(v -> {
            JSONObject payload = new JSONObject();
            tryPut(payload, "enabled", enabled[0]);
            tryPut(payload, "channel", channel[0]);
            putIfNotBlank(payload, "access_key", accessKey);
            putIfNotBlank(payload, "secret_key", secretKey);
            putField(payload, "sms_service_id", serviceId);
            putField(payload, "from_number", fromNumber);
            putField(payload, "contact_phone", contactPhone);
            putField(payload, "alimtalk_service_id", alimtalkServiceId);
            putField(payload, "channel_id", channelId);
            putField(payload, "visit_template_code", visitTemplate);
            putField(payload, "measurement_template_code", measurementTemplate);
            putBodyField(payload, "visit_body", visitBody);
            putBodyField(payload, "measurement_body", measurementBody);
            submit(save, "PUT", "/api/mobile/platform/tenants/" + Uri.encode(tenantId) + "/delivery-settings", payload, "발송 연결을 저장했습니다.", false, dialog);
        });

        final int generation = requestGeneration;
        api.call("GET", "/api/mobile/platform/tenants/" + Uri.encode(tenantId) + "/delivery-settings", null, (body, responseStatus, error) -> runOnUiThread(() -> {
            if (!sameGeneration(generation)) return;
            if (handleAuthFailure(responseStatus)) return;
            if (responseStatus < 200 || responseStatus >= 300) {
                status.setText(message(body, error, "발송 연결 정보를 불러오지 못했습니다."));
                return;
            }
            JSONObject settings = body.optJSONObject("delivery_settings");
            if (settings == null) settings = body.optJSONObject("settings");
            if (settings == null) settings = body;
            channel[0] = "alimtalk".equals(settings.optString("channel", "sms")) ? "alimtalk" : "sms";
            enabled[0] = settings.optBoolean("enabled", false);
            configured[0] = settings.optBoolean("configured", false);
            hasCredentials[0] = settings.optBoolean("has_credentials", false);
            missingFields[0] = settings.optJSONArray("missing_fields");
            if (missingFields[0] == null) missingFields[0] = new JSONArray();
            setTextIfPresent(serviceId, settings, "sms_service_id");
            setTextIfPresent(fromNumber, settings, "from_number");
            setTextIfPresent(contactPhone, settings, "contact_phone");
            setTextIfPresent(alimtalkServiceId, settings, "alimtalk_service_id");
            setTextIfPresent(channelId, settings, "channel_id");
            setTextIfPresent(visitTemplate, settings, "visit_template_code");
            setTextIfPresent(measurementTemplate, settings, "measurement_template_code");
            setTextIfPresent(visitBody, settings, "visit_body");
            setTextIfPresent(measurementBody, settings, "measurement_body");
            accessKey.setHint(hasCredentials[0] ? "등록됨 · 비워두면 기존 값 유지" : "SENS Access Key");
            secretKey.setHint(hasCredentials[0] ? "등록됨 · 비워두면 기존 값 유지" : "SENS Secret Key");
            String missing = missingFields[0].length() == 0 ? "없음" : joinMissingFields(missingFields[0]);
            status.setText(configured[0] ? "필수 설정 완료 · 누락 항목: " + missing : "등록 상태 · 누락 항목: " + missing);
            enabledLabel.setText(enabled[0] ? "사용 중 · 향후 알림부터 선택한 채널로 연결" : "사용 안 함");
            enabledButton.setText(enabled[0] ? "발송 연결 비활성화" : "발송 연결 활성화");
            enabledButton.setEnabled(configured[0]);
            save.setEnabled(true);
            updateChannel.run();
            updateReadiness[0].run();
        }));

        setSheetContent(dialog, box);
        dialog.show();
        sizeSheet(dialog);
    }

    private void putIfNotBlank(JSONObject payload, String key, EditText field) {
        if (field == null) return;
        String value = field.getText().toString().trim();
        if (!value.isEmpty()) tryPut(payload, key, value);
    }

    private boolean blank(EditText field) {
        return field == null || field.getText().toString().trim().isEmpty();
    }

    private void addMissing(JSONArray fields, String key) {
        try { fields.put(key); } catch (Exception ignored) { }
    }

    private void watchFields(Runnable callback, EditText... fields) {
        TextWatcher watcher = new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence value, int start, int count, int after) { }
            @Override public void onTextChanged(CharSequence value, int start, int before, int count) { callback.run(); }
            @Override public void afterTextChanged(Editable value) { }
        };
        for (EditText field : fields) field.addTextChangedListener(watcher);
    }

    private void putField(JSONObject payload, String key, EditText field) {
        if (field != null) tryPut(payload, key, field.getText().toString().trim());
    }

    private void putBodyField(JSONObject payload, String key, EditText field) {
        if (field != null) tryPut(payload, key, field.getText().toString());
    }

    private void addMessageTokenButtons(LinearLayout parent, EditText target, TextView preview) {
        String[][] tokens = {{"고객명", "name"}, {"업체명", "company"}, {"날짜", "date"}, {"시간", "time"},
            {"장소", "location"}, {"주소", "address"}, {"지도", "map"}, {"담당자", "staff"},
            {"고객 연락처", "phone"}, {"문의 연락처", "contact_phone"}};
        LinearLayout row = null;
        for (int i = 0; i < tokens.length; i++) {
            if (i % 3 == 0) { row = new LinearLayout(this); row.setOrientation(LinearLayout.HORIZONTAL); parent.addView(row, blockParams()); }
            Button chip = secondary(tokens[i][0]);
            chip.setTextSize(12);
            chip.setMinHeight(dp(42));
            final String token = "{{" + tokens[i][1] + "}}";
            chip.setOnClickListener(v -> {
                target.requestFocus();
                int cursor = Math.max(0, target.getSelectionStart());
                target.getText().insert(cursor, token);
                updateMessagePreview(target, preview);
            });
            row.addView(chip, new LinearLayout.LayoutParams(0, -2, 1));
        }
        target.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) { }
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) { updateMessagePreview(target, preview); }
            @Override public void afterTextChanged(Editable s) { }
        });
    }

    private void updateMessagePreview(EditText source, TextView preview) {
        String sample = source.getText().toString()
            .replace("{{company}}", "데이원디자인")
            .replace("{{name}}", "홍길동")
            .replace("{{date}}", "9월 15일")
            .replace("{{time}}", "오후 2:00")
            .replace("{{location}}", "판교 쇼룸")
            .replace("{{address}}", "서울시 강남구 테헤란로 123")
            .replace("{{map}}", "지도 보기")
            .replace("{{staff}}", "김담당")
            .replace("{{phone}}", "010-1234-5678")
            .replace("{{contact_phone}}", "02-0000-0000");
        preview.setText(sample);
        preview.setTextColor(INK);
        preview.setPadding(dp(12), dp(10), dp(12), dp(10));
        preview.setBackground(round(Color.rgb(247, 247, 244), 8, LINE));
    }

    private void setTextIfPresent(EditText field, JSONObject source, String key) {
        if (source.has(key) && !source.isNull(key)) {
            String value = source.optString(key, "");
            if (!value.trim().isEmpty()) field.setText(value);
        }
    }

    private String joinJson(JSONArray values) {
        ArrayList<String> parts = new ArrayList<>();
        for (int i = 0; i < values.length(); i++) parts.add(values.optString(i, ""));
        return join(parts, ", ");
    }

    private String joinMissingFields(JSONArray values) {
        ArrayList<String> parts = new ArrayList<>();
        for (int i = 0; i < values.length(); i++) {
            String key = values.optString(i, "");
            if ("access_key".equals(key) || "secret_key".equals(key)) parts.add("SENS 자격");
            else if ("sms_service_id".equals(key)) parts.add("SENS 서비스 ID");
            else if ("from_number".equals(key)) parts.add("발신번호");
            else if ("contact_phone".equals(key)) parts.add("운영 담당 연락처");
            else if ("alimtalk_service_id".equals(key)) parts.add("알림톡 서비스 ID");
            else if ("channel_id".equals(key)) parts.add("알림톡 채널 ID");
            else if ("visit_template_code".equals(key)) parts.add("방문 템플릿 코드");
            else if ("measurement_template_code".equals(key)) parts.add("실측 템플릿 코드");
            else if ("visit_body".equals(key)) parts.add("방문 문구");
            else if ("measurement_body".equals(key)) parts.add("실측 문구");
            else if (!key.isEmpty()) parts.add(key);
        }
        return join(parts, ", ");
    }

    private void setTenantSuspended(String id, boolean suspended, Button button) {
        JSONObject payload = new JSONObject();
        tryPut(payload, "suspended", suspended);
        submit(button, "PATCH", "/api/mobile/platform/tenants/" + Uri.encode(id), payload, suspended ? "업체를 정지했습니다." : "업체를 재개했습니다.", false, null);
    }

    private void showTenantEditor() {
        activeTab="calendar";base();addHeader();LinearLayout box=root;
        box.addView(text("거래처 등록",23,true));box.addView(fidelityCaption("관리자 → 하위 업체 계정 생성"));
        LinearLayout steps=new LinearLayout(this);
        String[] stepNames={"① 업체","② 계정","③ 연동"};
        for(int i=0;i<stepNames.length;i++){TextView step=text(stepNames[i],9,i==0);step.setTextColor(i==0?INK:MUTED);step.setPadding(0,dp(6),0,dp(6));steps.addView(step,new LinearLayout.LayoutParams(0,-2,1));}
        box.addView(steps);
        EditText name=input("예: 예시 인테리어",InputType.TYPE_CLASS_TEXT,false);box.addView(label("거래처명"));box.addView(name);
        EditText owner=input("업체 담당자의 이메일",InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS,false);box.addView(label("로그인 이메일"));box.addView(owner);
        EditText homepage=input("https://example.com",InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_URI,false);box.addView(label("홈페이지 주소"));box.addView(homepage);
        EditText manager=input("관리 담당자",InputType.TYPE_CLASS_TEXT,false);box.addView(label("폴라애드 담당자"));box.addView(manager);
        TextView registrationNote=fidelityCaption("등록 후 연결 검증을 완료하면 업무공간을 활성화할 수 있습니다.");
        registrationNote.setPadding(dp(12),dp(12),dp(12),dp(12));
        registrationNote.setBackground(round(Color.rgb(240,239,235),4,Color.TRANSPARENT));
        box.addView(registrationNote,blockParams());
        final String tenantId="tenant-"+java.util.UUID.randomUUID().toString();
        Button save=primary("거래처 등록");box.addView(save);
        save.setOnClickListener(v->{
            if(name.getText().toString().trim().isEmpty()||!android.util.Patterns.EMAIL_ADDRESS.matcher(owner.getText().toString().trim()).matches()){toast("업체명과 로그인 이메일을 확인하세요.");return;}
            JSONObject payload=new JSONObject();tryPut(payload,"id",tenantId);tryPut(payload,"name",name.getText().toString().trim());tryPut(payload,"brand",name.getText().toString().trim());
            tryPut(payload,"owner_email",owner.getText().toString().trim());tryPut(payload,"homepage_url",homepage.getText().toString().trim());tryPut(payload,"manager",manager.getText().toString().trim());
            save.setEnabled(false);final int generation=requestGeneration;
            api.call("POST","/api/mobile/platform/tenants",payload,(response,status,error)->runOnUiThread(()->{
                if(!sameGeneration(generation))return;save.setEnabled(true);if(handleAuthFailure(status))return;
                if(status>=200&&status<300){showPlatformTenantDetail(tenantId);}else toast(message(response,error,"업체 등록을 완료하지 못했습니다."));
            }));
        });
        addSection("연동 체크");
        LinearLayout checklist=new LinearLayout(this);checklist.setOrientation(LinearLayout.VERTICAL);checklist.setPadding(dp(16),dp(14),dp(16),dp(14));checklist.setBackground(round(Color.WHITE,6,LINE));
        checklist.addView(body("□ 홈페이지 소유·접수 API 연결 확인\n□ 방문 수집·출처 태깅 확인\n□ Meta 광고계정 연결 확인\n□ 로그인·푸시 수신 검증"));box.addView(checklist,blockParams());

    }

    private String integrationStateLabel(JSONObject tenant, String key) {
        JSONObject checklist=tenant==null?null:tenant.optJSONObject("integration_status");
        JSONObject item=checklist==null?null:checklist.optJSONObject(key);
        String state=item==null?"unknown":item.optString("state","unknown");
        if ("connected".equals(state)) return "연결";
        if ("disconnected".equals(state)) return "연결 안 됨";
        if ("error".equals(state)) return "오류";
        if ("new_setup".equals(state)) return "설정 필요";
        return "확인 필요";
    }

    private TextView integrationStateBadge(String value) {
        boolean good="연결".equals(value), risk="오류".equals(value);
        boolean watch="연결 안 됨".equals(value)||"설정 필요".equals(value);
        TextView badge=text(value,10,true);badge.setPadding(dp(7),dp(4),dp(7),dp(4));
        badge.setTextColor(good?Color.rgb(53,99,78):risk?Color.rgb(160,68,59):watch?Color.rgb(136,100,33):Color.rgb(102,107,112));
        badge.setBackground(round(good?Color.rgb(237,243,238):risk?Color.rgb(247,238,235):watch?Color.rgb(246,240,227):Color.rgb(238,240,241),4,Color.TRANSPARENT));
        return badge;
    }

    private void showPlatformTenantDetail(String tenantId) {
        activeTab="customers";base();addHeader();final int generation=requestGeneration;
        root.addView(body("거래처 정보를 불러오는 중입니다."));
        api.call("GET","/api/mobile/platform/tenants/"+Uri.encode(tenantId),null,(payload,status,error)->runOnUiThread(()->{
            if(!sameGeneration(generation)||handleAuthFailure(status))return;root.removeAllViews();
            if(status<200||status>=300){root.addView(body("거래처 정보를 불러오지 못했습니다."));return;}
            JSONObject tenant=payload.optJSONObject("tenant");if(tenant==null)return;
            String name=tenant.optString("name");root.addView(text(name,23,true));root.addView(body("거래처 계정 · 연동 · 이용 관리"));
            JSONObject owner=tenant.optJSONObject("owner");boolean pending="pending".equals(tenant.optString("onboarding_status"));
            LinearLayout account=fidelityColumn();account.setPadding(dp(16),dp(12),dp(16),dp(12));account.setBackground(round(Color.WHITE,6,LINE));root.addView(account,blockParams());
            fidelityKeyValue(account,"로그인 ID",owner==null?"등록 없음":owner.optString("email"));
            fidelityKeyValue(account,"업체 권한",name+" 업무공간만");
            TextView usage=text("",10,true);styleTenantState(usage,tenant);LinearLayout usageCell=fidelityColumn();usageCell.addView(usage,new LinearLayout.LayoutParams(-2,-2));fidelityKeyValue(account,"이용 상태",usageCell);
            fidelityKeyValue(account,"기본 시간","Asia/Seoul · KST");
            fidelityKeyValue(account,"계정 통화","Meta: 계정 설정 기준 · 계약: KRW");
            addSection("데이터 연동");
            LinearLayout links=fidelityColumn();links.setPadding(dp(16),dp(14),dp(16),dp(14));links.setBackground(round(Color.WHITE,6,LINE));
            String[][] linkRows={{"홈페이지 접수","접수 데이터 · 고객카드 원본 공유"},{"홈페이지 방문","출처·세션·신청 단계"},{"Meta 광고","지표 동기화 · 토큰은 서버에 보관"}};
            String[] integrationKeys={"website_intake","website_visits","meta_ads"};
            for(int i=0;i<linkRows.length;i++){if(i>0)fidelityDivider(links);LinearLayout heading=new LinearLayout(this);heading.addView(text(linkRows[i][0],14,true),new LinearLayout.LayoutParams(0,-2,1));String stateLabel=integrationStateLabel(tenant,integrationKeys[i]);TextView state=integrationStateBadge(stateLabel);heading.addView(state);links.addView(heading);TextView description=text(linkRows[i][1],11,false);description.setTextColor(MUTED);links.addView(description);}root.addView(links,blockParams());
            menu("거래처 정보 수정",()->showTenantProfileEditor(tenantId,tenant));
            menu("발송 연결",()->showTenantDeliverySettings(tenantId,name));
            addSection("업체 화면 확인");
            Button preview = primary("업체 계정 화면 보기");
            root.addView(preview);
            root.addView(note("관리자 세션을 유지한 읽기 전용 업체 화면입니다. 고객 변경·문자·알림 발송은 실행하지 않습니다."),blockParams());
            preview.setOnClickListener(v -> beginTenantPreview(tenantId, name, preview));
            if(pending){
                addSection("연동 체크");root.addView(body("실제 확인한 항목만 체크해 주세요."));
                String[][] items={{"website_ownership","홈페이지 소유 확인"},{"api","홈페이지 접수 API 연결"},{"traffic_tagging","방문 수집·출처 태깅"},{"meta_authority","Meta 광고계정 권한"},{"login_push_verified","로그인·푸시 수신 검증"}};
                Map<String,android.widget.CheckBox> checks=new HashMap<>();
                for(String[] item:items){android.widget.CheckBox check=new android.widget.CheckBox(this);check.setText(item[1]);check.setTextColor(INK);check.setMinHeight(dp(48));root.addView(check);checks.put(item[0],check);}
                Button activate=primary("검증 완료 · 이용 활성화");root.addView(activate);
                activate.setOnClickListener(v->{JSONObject evidence=new JSONObject();for(String[] item:items){if(!checks.get(item[0]).isChecked()){toast("연결 검증을 모두 완료해 주세요.");return;}tryPut(evidence,item[0],true);}JSONObject value=new JSONObject();tryPut(value,"suspended",false);tryPut(value,"checklist",evidence);submit(activate,"PATCH","/api/mobile/platform/tenants/"+Uri.encode(tenantId),value,"업체를 활성화했습니다.",false);});
            }
            addSection("지원 접근");
            Button support=primary("거래처 업무화면 보기");root.addView(support);
            root.addView(note("관리자 세션을 보존한 지원 화면입니다. 서버 권한 모드에 따라 관리자 지원 또는 읽기 전용으로 표시됩니다."),blockParams());
            support.setOnClickListener(v -> startSupportSession(tenantId, support));
            LinearLayout managementDetails=fidelityColumn();
            managementDetails.addView(fidelityCaption("로그인 이메일 변경: 새 주소 검증 후 적용, 기존 세션 해제."));
            managementDetails.addView(fidelityCaption("이용 중지: 로그인 차단과 세션 해제. 데이터 삭제와 분리."));
            if(!pending){Button toggle=secondary(tenant.optBoolean("suspended")?"이용 재개":"이용 중지");managementDetails.addView(toggle);toggle.setOnClickListener(v->setTenantSuspended(tenantId,!tenant.optBoolean("suspended"),toggle));}
            managementDetails.addView(fidelityCaption("영구 삭제: 보존 정책·백업·별도 확인 후 처리. 현재 미구현."));
            root.addView(AccountScreens.detailSheetTrigger(this,"계정 및 이용 관리",managementDetails),blockParams());
        }));
    }

    private void beginTenantPreview(String tenantId, String tenantName, Button button) {
        if (previewMode || supportMode || tenantId == null || tenantId.isEmpty()) return;
        button.setEnabled(false);
        JSONObject payload = new JSONObject();
        tryPut(payload, "mode", "readonly");
        final int generation = requestGeneration;
        api.call("POST", "/api/mobile/platform/tenants/" + Uri.encode(tenantId) + "/preview-session", payload,
            (body, status, error) -> runOnUiThread(() -> {
                if (!sameGeneration(generation)) return;
                button.setEnabled(true);
                JSONObject session = body.optJSONObject("preview_session");
                String token = body.optString("preview_token", session == null ? "" : session.optString("token", ""));
                if (token.isEmpty()) token = body.optString("token", "");
                if (status < 200 || status >= 300 || token.isEmpty()) {
                    toast(message(body, error, "업체 계정 화면을 열지 못했습니다."));
                    return;
                }
                adminToken = api.currentToken();
                adminMe = me;
                previewMode = true;
                previewExpiresAt = session == null ? body.optString("expires_at", "") : session.optString("expires_at", body.optString("expires_at", ""));
                api.setSupportReadOnly(true);
                api.setToken(token);
                api.invalidateData();
                me = null;
                current = null;
                members.clear();
                fetchMe(false);
            }));
    }

    private void endPreviewSession() {
        if (!previewMode) return;
        api.call("POST", "/api/mobile/platform/preview-session/end", new JSONObject(),
            (body, status, error) -> runOnUiThread(this::restorePreviewAdmin));
    }

    private void restorePreviewAdmin() {
        previewMode = false;
        previewExpiresAt = null;
        api.setSupportReadOnly(false);
        String token = adminToken;
        JSONObject previousMe = adminMe;
        adminToken = null;
        adminMe = null;
        me = previousMe;
        current = null;
        members.clear();
        api.setToken(token);
        api.invalidateData();
        if (me != null && isPlatform()) showPlatformHome(); else fetchMe(false);
    }

    private void showTenantProfileEditor(String tenantId, JSONObject tenant) {
        Dialog dialog = sheet();
        LinearLayout box = sheetBox();
        box.addView(text("거래처 정보 수정", 22, true));
        box.addView(body("업체명·브랜드명·로고 주소와 거래처 로그인 이메일을 수정합니다. 로그인 이메일을 바꾸면 새 이메일로 다시 로그인해야 합니다."));
        EditText name = input("업체명", InputType.TYPE_CLASS_TEXT, false);
        EditText brand = input("브랜드명", InputType.TYPE_CLASS_TEXT, false);
        EditText logoUrl = input("로고 이미지 주소 (선택)", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI, false);
        JSONObject owner = tenant.optJSONObject("owner");
        String currentOwnerEmail = owner == null ? tenant.optString("owner_email", "") : owner.optString("email", "");
        EditText ownerEmail = input("거래처 로그인 이메일", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS, false);
        name.setText(tenant.optString("name", ""));
        brand.setText(tenant.optString("brand", ""));
        logoUrl.setText(tenant.optString("logo_url", ""));
        ownerEmail.setText(currentOwnerEmail);
        box.addView(label("업체명")); box.addView(name);
        box.addView(label("브랜드명")); box.addView(brand);
        box.addView(label("로고")); box.addView(logoUrl);
        box.addView(label("로그인 이메일")); box.addView(ownerEmail);
        Button save = primary("거래처 정보 저장");
        box.addView(save);
        save.setOnClickListener(v -> {
            String nextName = name.getText().toString().trim();
            if (nextName.isEmpty()) { toast("업체명을 입력하세요."); return; }
            String nextOwnerEmail = ownerEmail.getText().toString().trim();
            boolean ownerEmailChanged = !nextOwnerEmail.equalsIgnoreCase(currentOwnerEmail);
            if (ownerEmailChanged && !android.util.Patterns.EMAIL_ADDRESS.matcher(nextOwnerEmail).matches()) {
                ownerEmail.setError("올바른 이메일 주소를 입력하세요.");
                ownerEmail.requestFocus();
                return;
            }
            JSONObject payload = new JSONObject();
            tryPut(payload, "name", nextName);
            tryPut(payload, "brand", brand.getText().toString().trim());
            tryPut(payload, "logo_url", logoUrl.getText().toString().trim());
            if (ownerEmailChanged) tryPut(payload, "owner_email", nextOwnerEmail);
            save.setEnabled(false);
            final int generation = requestGeneration;
            api.call("PATCH", "/api/mobile/platform/tenants/" + Uri.encode(tenantId) + "/profile", payload,
                (response, status, error) -> runOnUiThread(() -> {
                    if (!sameGeneration(generation)) return;
                    if (handleAuthFailure(status)) return;
                    if (status >= 200 && status < 300) {
                        dialog.dismiss();
                        toast("거래처 정보를 저장했습니다.");
                        showPlatformTenantDetail(tenantId);
                    } else {
                        save.setEnabled(true);
                        if (status == 409 && response != null && "owner email already in use".equals(response.optString("error", ""))) {
                            ownerEmail.setError("이미 다른 계정에서 사용 중인 이메일입니다.");
                            ownerEmail.requestFocus();
                        } else {
                            toast(message(response, error, "거래처 정보를 저장하지 못했습니다."));
                        }
                    }
                }));
        });
        setSheetContent(dialog, box);
        dialog.show();
        sizeSheet(dialog);
    }

    private void startSupportSession(String tenantId, Button button) {
        if (supportMode || tenantId == null || tenantId.isEmpty()) return;
        button.setEnabled(false);
        JSONObject payload = new JSONObject();
        final int generation = requestGeneration;
        api.call("POST", "/api/mobile/platform/tenants/" + Uri.encode(tenantId) + "/support-sessions", payload,
            (body, status, error) -> runOnUiThread(() -> {
                if (!sameGeneration(generation)) return;
                if (handleAuthFailure(status)) { button.setEnabled(true); return; }
                JSONObject session = body.optJSONObject("support_session");
                String token = body.optString("token", session == null ? "" : session.optString("token", ""));
                if (status < 200 || status >= 300 || token.isEmpty()) {
                    button.setEnabled(true);
                    toast(message(body, error, "지원 업무화면을 열지 못했습니다."));
                    return;
                }
                adminToken = api.currentToken();
                adminMe = me;
                supportRenewalApi.setToken(adminToken);
                supportToken = token;
                supportTenantId = tenantId;
                supportExpiresAt = session == null ? body.optString("expires_at", "") : session.optString("expires_at", body.optString("expires_at", ""));
                supportMode = true;
                supportRenewalLastAttemptAt = 0L;
                String supportModeValue = session == null ? body.optString("mode", "") : session.optString("mode", body.optString("mode", ""));
                supportAdminMode = "admin".equalsIgnoreCase(supportModeValue);
                api.setSupportReadOnly(!supportAdminMode);
                api.setToken(token);
                fetchMe(false);
            }));
    }

    private void showSupportWorkspace() { showHome(); }

    private void endSupportSession(Button button) {
        if (!supportMode) return;
        button.setEnabled(false);
        api.call("POST", "/api/mobile/support/end", new JSONObject(),
            (body, status, error) -> runOnUiThread(() -> restoreAdminSession()));
    }

    private void restoreAdminSession() {
        supportMode = false;
        supportAdminMode = false;
        api.setSupportReadOnly(false);
        String token = adminToken;
        JSONObject previousMe = adminMe;
        String tenantId = supportTenantId;
        supportToken = null;
        supportExpiresAt = null;
        adminToken = null;
        adminMe = null;
        supportTenantId = null;
        supportRenewalInFlight = false;
        supportRenewalLastAttemptAt = 0L;
        me = previousMe;
        api.setToken(token);
        if (me != null && isPlatform() && tenantId != null) showPlatformTenantDetail(tenantId);
        else fetchMe(false);
    }

    private void setMemberActive(String id, boolean active, Button button) {
        if (id.isEmpty()) return;
        button.setEnabled(false);
        final int generation = requestGeneration;
        JSONObject payload = new JSONObject();
        tryPut(payload, "active", active);
        api.call("PATCH", "/api/mobile/members/" + Uri.encode(id), payload, (body, status, error) -> runOnUiThread(() -> {
            if (!sameGeneration(generation)) return;
            if (handleAuthFailure(status)) return;
            if (status >= 200 && status < 300) {
                showMembers();
            } else {
                button.setEnabled(true);
                toast(message(body, error, "직원 상태를 변경하지 못했습니다."));
            }
        }));
    }

    private void showAnalytics() { showAnalytics("hub"); }

    private void showAnalytics(String page) {
        analyticsPage = page == null || page.isEmpty() ? "hub" : page;
        activeTab = "analytics";
        base();
        addHeader();
        final int generation = requestGeneration;
        analyticsView = AnalyticsScreen.create(this, api, status -> {
            if (sameGeneration(generation)) handleAuthFailure(status);
        }, analyticsPage, () -> showCustomers(""), this::showHome);
        root.addView(analyticsView, blockParams());
    }

    private void openNotificationIntent() {
        api.invalidateData();
        String notificationId=getIntent().getStringExtra("notification_id");
        if(notificationId==null||!notificationId.matches("[A-Za-z0-9_-]{1,100}")){showNotifications();return;}
        getIntent().removeExtra("notification_id");
        base();addHeader();root.addView(body("알림을 확인하는 중입니다."));
        final int generation=requestGeneration;
        api.call("GET","/api/mobile/notifications/"+Uri.encode(notificationId),null,(payload,status,error)->runOnUiThread(()->{
            if(!sameGeneration(generation)||handleAuthFailure(status))return;
            if(status>=200&&status<300){if(payload.has("id")){openNotificationDestination(payload);return;}}
            showNotifications();toast("해당 알림을 확인할 수 없습니다.");
        }));
    }

    private void openNotificationDestination(JSONObject item) {
        JSONObject payload=item.optJSONObject("payload");String kind=notificationKind(item);
        String customerId=payload==null?"":payload.optString("customer_id",payload.optString("estimate_id",""));
        if("daily_briefing".equals(kind)){showAnalytics("brief");return;}
        if(customerId.matches("[A-Za-z0-9_-]{1,120}")){showDetail(customerId);return;}
        if("visit_reminder".equals(kind)||"measurement_reminder".equals(kind)||"appointment_created".equals(kind)||"appointment_updated".equals(kind)){showSchedule();return;}
        Dialog dialog=sheet();LinearLayout box=sheetBox();box.addView(text(notificationDisplayTitle(item),22,true));
        box.addView(body(notificationMessage(item)));Button read=primary("내용 확인 · 읽음 처리");box.addView(read);
        read.setOnClickListener(v->markNotificationRead(item.optString("id"),read));
        setSheetContent(dialog,box);dialog.show();sizeSheet(dialog);
    }

    private void showNotifications() {
        base();addHeader();root.addView(text(isOwner()?"알림함":"내 알림",23,true));
        root.addView(body(isOwner()?"업무를 놓치지 않도록":tenantName()+" · "+me.optString("name",me.optString("email","직원계정"))));
        if(isOwner()) {
            Button readAll=textButton("전체 읽음 처리");root.addView(readAll);
            readAll.setOnClickListener(v->markAllNotificationsRead(readAll));
        }
        LinearLayout list=new LinearLayout(this);list.setOrientation(LinearLayout.VERTICAL);root.addView(list);
        if(isOwner()) {
            addSection("잠금화면 미리보기");
            LinearLayout lockPreview=fidelityColumn();lockPreview.setPadding(dp(16),dp(14),dp(16),dp(14));lockPreview.setBackground(round(PANEL,6,LINE));
            LinearLayout lockHeading=new LinearLayout(this);lockHeading.addView(text("폴라애드 인테리어 CRM",12,true),new LinearLayout.LayoutParams(0,-2,1));lockHeading.addView(fidelityCaption("지금"));lockPreview.addView(lockHeading);
            lockPreview.addView(fidelityCaption("새 상담신청이 도착했습니다.\n잠금 해제 후 고객 정보를 확인하세요."),blockParams());
            root.addView(lockPreview,blockParams());
        }
        if(isOwner()){Button settings=textButton("알림 표시 설정");root.addView(settings);settings.setOnClickListener(v->showNotificationSettings());}
        loadNotificationPage(list,"");
    }

    private void markAllNotificationsRead(Button button) {
        button.setEnabled(false);
        final int generation=requestGeneration;
        api.call("POST","/api/mobile/notifications/read-all",null,(body,status,error)->runOnUiThread(()->{
            if(!sameGeneration(generation)){button.setEnabled(true);return;}
            if(handleAuthFailure(status))return;
            if(status>=200&&status<300){button.setText("모두 확인했습니다");}
            else{button.setEnabled(true);toast(message(body,error,"전체 읽음 처리에 실패했습니다."));}
        }));
    }

    private void showNotificationPreview() {
        base();
        addHeader();
        root.addView(text("어떤 알림을 받게 될까요", 26, true));
        root.addView(body("내부 업무 알림 · 문구와 도착지 검토"));
        String[] names=new String[NotificationPreviewCatalog.ENTRIES.size()];
        for(int i=0;i<names.length;i++)names[i]=NotificationPreviewCatalog.ENTRIES.get(i).name;
        final int[] selected={0};
        Button chooseKind=choiceButton(names[0]);
        root.addView(label("알림 종류"));
        root.addView(chooseKind);
        final boolean[] previewMasked={true};
        LinearLayout maskToggle=new LinearLayout(this);
        maskToggle.setGravity(Gravity.CENTER_VERTICAL);
        maskToggle.setMinimumHeight(dp(48));
        maskToggle.setFocusable(true);
        maskToggle.addView(fidelityCaption("잠금화면 개인정보"),new LinearLayout.LayoutParams(0,-2,1));
        TextView privacyState=text("숨김",12,true);
        maskToggle.addView(privacyState);
        maskToggle.setContentDescription("잠금화면 개인정보 숨김 미리보기");
        root.addView(maskToggle,blockParams());
        LinearLayout preview=fidelityColumn();
        preview.setPadding(dp(14),dp(12),dp(14),dp(12));
        preview.setBackground(round(PANEL,6,LINE));
        root.addView(preview,blockParams());
        LinearLayout details=fidelityColumn(); root.addView(details,blockParams());
        TextView ruleText=note(NotificationPreviewCatalog.ENTRIES.get(0).rule);root.addView(ruleText,blockParams());
        Button destination=secondary("이동 화면 확인");
        root.addView(destination,blockParams());
        Runnable[] render={null};
        render[0]=()->{
            int i=selected[0];boolean masked=previewMasked[0];
            NotificationPreviewCatalog.Entry entry=NotificationPreviewCatalog.ENTRIES.get(i);
            details.removeAllViews();
            fidelityKeyValue(details,"발송 시점",entry.when);
            fidelityKeyValue(details,"수신자",entry.who);
            fidelityKeyValue(details,"누른 후",notificationPreviewTargetLabel(entry.target));
            ruleText.setText(entry.rule);
            preview.removeAllViews();
            LinearLayout previewHeader=new LinearLayout(this);
            previewHeader.setGravity(Gravity.CENTER_VERTICAL);
            previewHeader.addView(fidelityCaption("폴라애드 인테리어 CRM"),new LinearLayout.LayoutParams(0,-2,1));
            TextView kindBadge=text(entry.name,10,true);
            kindBadge.setPadding(dp(7),dp(4),dp(7),dp(4));
            int foreground=Color.rgb(102,107,112),background=Color.rgb(238,240,241);
            if("consult".equals(entry.kind)){foreground=Color.rgb(36,84,214);background=Color.rgb(234,240,245);}
            else if("measure".equals(entry.kind)){foreground=Color.rgb(8,127,115);background=Color.rgb(245,237,231);}
            else if("good".equals(entry.kind)){foreground=Color.rgb(53,99,78);background=Color.rgb(237,243,238);}
            else if("risk".equals(entry.kind)){foreground=Color.rgb(160,68,59);background=Color.rgb(247,238,235);}
            else if("watch".equals(entry.kind)){foreground=Color.rgb(136,100,33);background=Color.rgb(246,240,227);}
            kindBadge.setTextColor(foreground);kindBadge.setBackground(round(background,4,Color.TRANSPARENT));
            previewHeader.addView(kindBadge);preview.addView(previewHeader);
            preview.addView(text(masked ? entry.maskedHeading() : entry.heading,16,true));
            preview.addView(fidelityCaption(masked?entry.privateBody:entry.body),blockParams());
            preview.addView(fidelityCaption("기획용 예시 · 실제 발송 없음"),blockParams());
        };
        chooseKind.setOnClickListener(v->choose("알림 종류",names,value->{for(int i=0;i<names.length;i++)if(names[i].equals(value)){selected[0]=i;break;}chooseKind.setText(names[selected[0]]);render[0].run();}));
        maskToggle.setOnClickListener(v->{previewMasked[0]=!previewMasked[0];privacyState.setText(previewMasked[0]?"숨김":"표시");maskToggle.setContentDescription("잠금화면 개인정보 "+(previewMasked[0]?"숨김":"표시")+" 미리보기");render[0].run();});
        render[0].run();
        destination.setOnClickListener(v->{
            String target=NotificationPreviewCatalog.ENTRIES.get(selected[0]).target;
            if("calendar".equals(target))showSchedule();
            else if("brief".equals(target)||"signal".equals(target))showAnalytics(target);
            else if("security".equals(target))showSecurity();
            else if("staffNotices".equals(target))showNotifications();
            else showCustomers("");
        });
        root.addView(fidelityCaption("이 검토 버튼은 화면 종류를 보여줍니다. 실제 알림은 접수·일정·공지 ID를 포함해 해당 항목에 직접 연결하도록 설계합니다."),blockParams());
    }

    private String notificationPreviewTargetLabel(String target) {
        if("calendar".equals(target))return "상담·실측 캘린더";
        if("result".equals(target))return "상담결과 작성";
        if("staffNotices".equals(target))return "직원 알림함";
        if("brief".equals(target))return "데일리브리핑";
        if("signal".equals(target))return "인디케이터 상세";
        if("security".equals(target))return "보안·기기";
        return "고객 상담카드";
    }

    private void loadNotificationPage(LinearLayout list,String cursor) {
        final int generation=requestGeneration;
        api.call("GET","/api/mobile/notifications?cursor="+Uri.encode(cursor),null,(payload,status,error)->runOnUiThread(()->{
            if(!sameGeneration(generation)||handleAuthFailure(status))return;
            if(status<200||status>=300){list.addView(body("알림을 불러오지 못했습니다."));return;}
            JSONArray rows=payload.optJSONArray("notifications");
            if(rows==null||rows.length()==0){if(cursor.isEmpty())list.addView(body("새 알림이 없습니다."));return;}
            for(int i=0;i<rows.length();i++){
                JSONObject item=rows.optJSONObject(i);if(item==null)continue;
                LinearLayout card=new LinearLayout(this);card.setOrientation(LinearLayout.VERTICAL);
                card.setPadding(dp(14),dp(12),dp(14),dp(12));
                if(isOwner())card.setBackground(round(PANEL,6,LINE));else fidelityDivider(list);
                LinearLayout noticeHeading=new LinearLayout(this);noticeHeading.setGravity(Gravity.CENTER_VERTICAL);
                TextView category=fidelityCaption(notificationAudienceLabel(item));
                String noticeKind=notificationKind(item);JSONObject noticePayload=item.optJSONObject("payload");
                boolean measurementNotice=noticeKind.startsWith("measurement")||(noticePayload!=null&&"measurement".equals(noticePayload.optString("kind")));
                boolean allStaffNotice="staff_message".equals(noticeKind)&&noticePayload!=null&&"all".equals(noticePayload.optString("scope"));
                category.setTextColor(allStaffNotice?Color.rgb(102,107,112):measurementNotice?Color.rgb(8,127,115):Color.rgb(36,84,214));
                if(!isOwner()){category.setTextSize(10);category.setPadding(dp(7),dp(4),dp(7),dp(4));category.setBackground(round(allStaffNotice?Color.rgb(238,240,241):measurementNotice?Color.rgb(245,237,231):Color.rgb(234,240,245),4,Color.TRANSPARENT));}
                LinearLayout categoryCell=fidelityColumn();categoryCell.addView(category,new LinearLayout.LayoutParams(-2,-2));noticeHeading.addView(categoryCell,new LinearLayout.LayoutParams(0,-2,1));
                boolean itemUnread=item.optBoolean("unread",item.isNull("read_at")||item.optString("read_at").isEmpty());
                TextView readState=fidelityCaption(itemUnread?"미확인":"읽음");
                noticeHeading.addView(readState);card.addView(noticeHeading);
                card.addView(text(notificationDisplayTitle(item),16,true));
                card.addView(fidelityCaption(formatIsoForDisplay(item.optString("created_at"))));
                card.addView(body(notificationMessage(item)));
                Button open=textButton("업무 내용 확인");card.addView(open);open.setOnClickListener(v->openNotificationDestination(item));
                String id=item.optString("id");
                boolean unread=item.optBoolean("unread",item.isNull("read_at")||item.optString("read_at").isEmpty());
                if(!id.isEmpty()&&unread){Button read=textButton("읽음 처리");card.addView(read);read.setOnClickListener(v->markNotificationRead(id,read,()->readState.setText("읽음")));}

                list.addView(card,blockParams());
            }
            String next=payload.isNull("next_cursor")?"":payload.optString("next_cursor");
            if(!next.isEmpty()){Button more=secondary("이전 알림 더 보기");list.addView(more);more.setOnClickListener(v->{list.removeView(more);loadNotificationPage(list,next);});}
        }));
    }

    private void markNotificationRead(String id, Button button) {
        markNotificationRead(id,button,()->{});
    }

    private void markNotificationRead(String id, Button button, Runnable onRead) {
        button.setEnabled(false);
        final int generation = requestGeneration;
        api.call("POST", "/api/mobile/notifications/" + Uri.encode(id) + "/read", null, (body, status, error) -> runOnUiThread(() -> {
            if (!sameGeneration(generation)) return;
            if (handleAuthFailure(status)) return;
            if (status >= 200 && status < 300) {
                button.setText("읽음");
                onRead.run();
            } else {
                button.setEnabled(true);
                toast(message(body, error, "읽음 처리에 실패했습니다."));
            }
        }));
    }

    private String notificationDisplayTitle(JSONObject item) {
        JSONObject payload=item.optJSONObject("payload");
        String title=payload==null?"":payload.optString("title","").trim();
        return title.isEmpty()?notificationTitle(notificationKind(item)):title;
    }

    private String notificationAudienceLabel(JSONObject item) {
        String type=notificationKind(item);
        if("assignee_assigned".equals(type))return "담당자 지정";
        JSONObject payload=item.optJSONObject("payload");
        if("staff_message".equals(type)&&payload!=null)return "all".equals(payload.optString("scope"))?"전체 알림":"개별 알림";
        return notificationTitle(type);
    }

    private String notificationTitle(String type) {
        if ("new_customer".equals(type)) return "신규 고객 접수";
        if ("visit_reminder".equals(type)) return "방문 일정 알림";
        if ("measurement_reminder".equals(type)) return "실측 일정 알림";
        if ("staff_message".equals(type)) { return "업무 알림"; }
        if ("appointment_created".equals(type)) return "예약 등록 알림";
        if ("appointment_updated".equals(type)) return "예약 변경 알림";
        if ("assignee_assigned".equals(type)) return "담당 고객 배정";
        if ("daily_briefing".equals(type)) return "마케팅 효율 브리핑";
        return type.isEmpty() ? "업무 알림" : type;
    }

    private String notificationMessage(JSONObject item) {
        String kind = notificationKind(item);
        String message = item.optString("message", "");
        JSONObject payload = item.optJSONObject("payload");
        if (payload == null) {
            String raw = item.optString("payload_json", item.optString("payload", ""));
            if (!raw.isEmpty() && raw.startsWith("{")) {
                try { payload = new JSONObject(raw); } catch (JSONException ignored) { }
            }
        }
        if (payload != null) {
            String payloadMessage = payload.optString("message", "");
            if (!payloadMessage.isEmpty()) message = payloadMessage;
            if ("new_customer".equals(kind)) {
                ArrayList<String> fields = new ArrayList<>();
                addNotificationField(fields, "출처", notificationSourceLabel(payload));
                addNotificationField(fields, "고객", payload.optString("name", ""));
                addNotificationField(fields, "연락처", payload.optString("phone", ""));
                addNotificationField(fields, "희망지점", firstNotificationValue(payload, "desired_branch", "preferred_branch", "branch", "location"));
                addNotificationField(fields, "예산", payload.has("budget") ? money(payload.optLong("budget", 0)) : "");
                if (!fields.isEmpty()) return join(fields, " · ");
            }
            if ("appointment_created".equals(kind) || "appointment_updated".equals(kind)) {
                ArrayList<String> fields = new ArrayList<>();
                String appointmentKind = payload.optString("appointment_kind", payload.optString("kind", ""));
                addNotificationField(fields, "예약", "visit".equals(appointmentKind) ? "방문" : "measurement".equals(appointmentKind) ? "실측" : appointmentKind);
                addNotificationField(fields, "일시", formatIsoForDisplay(payload.optString("starts_at", "")));
                addNotificationField(fields, "장소", payload.optString("location", ""));
                addNotificationField(fields, "주소", payload.optString("address", ""));
                addNotificationField(fields, "상태", appointmentStatusLabel(payload.optString("status", "")));
                if (!fields.isEmpty()) return join(fields, " · ");
            }
            if ("assignee_assigned".equals(kind)) {
                if (!message.isEmpty()) return message;
                ArrayList<String> fields = new ArrayList<>();
                addNotificationField(fields, "고객", payload.optString("name", ""));
                addNotificationField(fields, "연락처", payload.optString("phone", ""));
                addNotificationField(fields, "주소", payload.optString("address", ""));
                addNotificationField(fields, "예산", payload.has("budget") ? money(payload.optLong("budget", 0)) : "");
                if (!fields.isEmpty()) return join(fields, " · ");
            }
            if ("daily_briefing".equals(kind)) {
                JSONArray facts = payload.optJSONArray("facts");
                JSONObject content = payload.optJSONObject("content");
                if (facts == null && content != null) facts = content.optJSONArray("facts");
                if (facts != null && facts.length() > 0) {
                    ArrayList<String> labels = new ArrayList<>();
                    for (int i = 0; i < facts.length(); i++) {
                        JSONObject fact = facts.optJSONObject(i);
                        if (fact == null) continue;
                        String key = fact.optString("key", "확인 필요");
                        String value = fact.optString("value", "확인 필요");
                        labels.add(briefingFactLabel(key) + ": " + value);
                    }
                    if (!labels.isEmpty()) return join(labels, " · ");
                }
            }
        }
        return message.isEmpty() ? "내용 없음" : message;
    }

    private String appointmentStatusLabel(String status) {
        if ("scheduled".equals(status)) return "예약됨";
        if ("confirmed".equals(status)) return "확정";
        if ("booked".equals(status)) return "예약됨";
        if ("cancelled".equals(status)) return "취소됨";
        return status;
    }

    private void addNotificationField(ArrayList<String> fields, String title, String value) {
        if (value != null && !value.isEmpty()) fields.add(title + ": " + value);
    }

    private String notificationSourceLabel(JSONObject payload) {
        String source = firstNotificationValue(payload, "source_label", "source", "origin", "platform", "lead_source", "first_inflow_app", "channel").toLowerCase(java.util.Locale.ROOT);
        return source.contains("meta") || source.contains("facebook") || source.contains("instagram") ? "Meta" : "홈페이지";
    }

    private String firstNotificationValue(JSONObject payload, String... keys) {
        for (String key : keys) {
            String value = payload.optString(key, "").trim();
            if (!value.isEmpty()) return value;
        }
        return "";
    }

    private String notificationKind(JSONObject item) {
        JSONObject payload = item.optJSONObject("payload");
        if (payload == null) {
            String raw = item.optString("payload_json", item.optString("payload", ""));
            if (raw.startsWith("{")) try { payload = new JSONObject(raw); } catch (JSONException ignored) { }
        }
        String kind = payload == null ? "" : payload.optString("kind", "");
        return kind.isEmpty() ? item.optString("type", "") : kind;
    }

    private String briefingFactLabel(String key) {
        if ("saved_leads".equals(key)) return "저장 리드";
        if ("meta_cpl".equals(key)) return "Meta CPL";
        if ("meta_cpc".equals(key)) return "Meta CPC";
        if ("meta_cpm".equals(key)) return "Meta CPM";
        if ("pixel_events".equals(key)) return "Pixel 이벤트";
        if ("sessions".equals(key)) return "세션";
        return "확인 필요";
    }

    private String templateKindLabel(String kind) {
        if ("visit".equals(kind)) return "방문";
        if ("measurement".equals(kind)) return "실측";
        return kind.isEmpty() ? "메시지" : kind;
    }

    private void showNotificationCompose() {
        if (!isOwner()) { showNotifications(); return; }
        base(); addHeader();
        root.addView(text("직원 알림 보내기", 26, true));
        root.addView(body("같은 업체 직원에게 전체 또는 개별 알림을 전달합니다."));
        LinearLayout content = fidelityColumn(); root.addView(content, blockParams());
        content.addView(body("직원을 확인하고 있습니다."));
        final int generation = requestGeneration;
        api.call("GET", "/api/mobile/members", null, (response, status, error) -> runOnUiThread(() -> {
            if (!sameGeneration(generation) || handleAuthFailure(status)) return;
            content.removeAllViews();
            if (status < 200 || status >= 300) {
                content.addView(body(message(response, error, "직원을 불러오지 못했습니다.")));
                return;
            }
            ArrayList<JSONObject> staff = new ArrayList<>();
            JSONArray rows = response.optJSONArray("members");
            if (rows != null) for (int i=0; i<rows.length(); i++) {
                JSONObject member=rows.optJSONObject(i);
                if (member!=null && "staff".equals(member.optString("role")) && member.optBoolean("active",true)) staff.add(member);
            }
            if (staff.isEmpty()) {
                content.addView(body("등록된 직원이 없습니다. 직원 등록 후 전체·개별 알림을 사용할 수 있습니다."));
                Button disabled=primary("직원 알림 비활성"); disabled.setEnabled(false); disabled.setAlpha(.45f); content.addView(disabled);
                Button register=textButton("직원 등록으로 이동"); content.addView(register); register.setOnClickListener(v->showMembers());
                return;
            }
            final boolean[] all={false};
            final int[] selected={0};
            LinearLayout tabs=new LinearLayout(this);
            Button allTab=secondary("전체 알림"), individualTab=primary("개별 알림");
            tabs.addView(allTab,new LinearLayout.LayoutParams(0,dp(48),1));
            tabs.addView(individualTab,new LinearLayout.LayoutParams(0,dp(48),1));
            content.addView(tabs);
            TextView audience=body(""); content.addView(audience,blockParams());
            Button recipient=choiceButton(""); content.addView(recipient);
            Runnable updateAudience=()->{
                allTab.setBackground(round(all[0]?Color.rgb(251,242,227):PANEL,6,all[0]?Color.rgb(221,195,153):LINE));
                allTab.setTextColor(all[0]?ACTION:INK);
                individualTab.setBackground(round(all[0]?PANEL:Color.rgb(251,242,227),6,all[0]?LINE:Color.rgb(221,195,153)));
                individualTab.setTextColor(all[0]?INK:ACTION);
                allTab.setSelected(all[0]); individualTab.setSelected(!all[0]);
                recipient.setVisibility(all[0]?View.GONE:View.VISIBLE);
                if(all[0]) {
                    ArrayList<String> names=new ArrayList<>();
                    for(JSONObject member:staff) names.add(member.optString("name",member.optString("email")));
                    audience.setText("수신 직원 "+staff.size()+"명\n"+join(names," · ")+"\n이 업체에 등록된 직원에게만 전달합니다.");
                } else {
                    audience.setText("받는 담당자");
                    JSONObject member=staff.get(selected[0]);
                    recipient.setText(member.optString("name",member.optString("email")));
                }
            };
            allTab.setOnClickListener(v->{all[0]=true;updateAudience.run();});
            individualTab.setOnClickListener(v->{all[0]=false;updateAudience.run();});
            recipient.setOnClickListener(v->{
                String[] labels=new String[staff.size()];
                for(int i=0;i<staff.size();i++) labels[i]=staff.get(i).optString("email",staff.get(i).optString("id"));
                choose("받는 담당자",labels,value->{for(int i=0;i<labels.length;i++)if(labels[i].equals(value))selected[0]=i;updateAudience.run();});
            });
            updateAudience.run();
            content.addView(label("알림 제목"));
            EditText heading=input("확인해야 할 내용을 짧게 적어주세요",InputType.TYPE_CLASS_TEXT,false);
            heading.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(100)}); content.addView(heading);
            content.addView(label("내용"));
            EditText messageInput=input("업무 내용과 필요한 행동을 적어주세요",InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_MULTI_LINE,true);
            messageInput.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(3000)}); content.addView(messageInput);
            Button save=primary("선택 담당자에게 전달"); content.addView(save);
            allTab.setOnClickListener(v->{all[0]=true;updateAudience.run();save.setText("직원 전체에게 전달");});
            individualTab.setOnClickListener(v->{all[0]=false;updateAudience.run();save.setText("선택 담당자에게 전달");});
            save.setOnClickListener(v->{
                String title=heading.getText().toString().trim(), value=messageInput.getText().toString().trim();
                if(title.isEmpty()){heading.setError("제목을 입력해 주세요.");return;}
                if(value.isEmpty()){messageInput.setError("내용을 입력해 주세요.");return;}
                JSONObject payload=new JSONObject(); JSONArray recipients=new JSONArray();
                if(!all[0])recipients.put(staff.get(selected[0]).optString("id"));
                tryPut(payload,"mode",all[0]?"all":"selected");tryPut(payload,"recipient_ids",recipients);
                tryPut(payload,"title",title);tryPut(payload,"message",value);
                save.setEnabled(false);
                api.call("POST","/api/mobile/notifications",payload,(result,code,failure)->runOnUiThread(()->{
                    if(!sameGeneration(generation)||handleAuthFailure(code))return;
                    save.setEnabled(true);
                    if(code>=200&&code<300){toast("직원 알림함에 저장했습니다.");showNotificationCompose();}
                    else toast(message(result,failure,"알림을 저장하지 못했습니다."));
                }));
            });
        }));
    }

    private void showTemplates() {
        if (!isOwner()) { showNotifications(); return; }
        base();
        addHeader();
        root.addView(text("고객 메시지 관리", 26, true));
        root.addView(body("문구를 수정하고 고객 수신 화면을 확인하세요"));
        LinearLayout switches = fidelityColumn();
        root.addView(switches, blockParams());
        LinearLayout editor = fidelityColumn();
        root.addView(editor, blockParams());
        Button back = secondary(isOwner()?"고객 목록":"내 담당 업무");
        root.addView(back);
        back.setOnClickListener(v -> {if(isOwner())showCustomers(customerQuery);else showNotifications();});
        final int generation = requestGeneration;
        api.call("GET", "/api/mobile/message-templates", null, (body, status, error) -> runOnUiThread(() -> {
            if (!sameGeneration(generation)) return;
            if (handleAuthFailure(status)) return;
            if (status < 200 || status >= 300) {
                switches.addView(body(message(body, error, "고객 메시지 설정을 불러올 수 없습니다.")));
                return;
            }
            JSONArray rows = body.optJSONArray("templates");
            Map<String, JSONObject> templates = new HashMap<>();
            if (rows != null) for (int i = 0; i < rows.length(); i++) {
                JSONObject item = rows.optJSONObject(i);
                if (item != null) templates.put(item.optString("kind", ""), item);
            }
            for (String kind : new String[]{"intake", "visit", "measurement"}) {
                JSONObject item = templates.get(kind);
                if (item != null && !customerMessageDrafts.containsKey(kind)) customerMessageDrafts.put(kind, toUiMessageTemplate(item.optString("body", "")));
            }
            renderCustomerMessageEditor(editor, templates);
            final int preferenceGeneration = requestGeneration;
            api.call("GET", "/api/mobile/message-preferences", null, (preferenceBody, preferenceStatus, preferenceError) -> runOnUiThread(() -> {
                if (!sameGeneration(preferenceGeneration)) return;
                Map<String, Boolean> preferences = new HashMap<>();
                Map<String, Boolean> configuredPreferences = new HashMap<>();
                JSONArray preferenceRows = preferenceBody.optJSONArray("preferences");
                if (preferenceRows != null) for (int i = 0; i < preferenceRows.length(); i++) {
                    JSONObject preference = preferenceRows.optJSONObject(i);
                    if (preference != null) {
                        String kind = preference.optString("kind", "");
                        preferences.put(kind, preference.optBoolean("enabled", false));
                        configuredPreferences.put(kind, preference.optBoolean("configured", false));
                    }
                }
                boolean readable = preferenceStatus >= 200 && preferenceStatus < 300;
                addCustomerMessageSwitch(switches, "intake", "최초 접수 안내", "접수 저장 완료 후 1회", preferences.get("intake"), configuredPreferences.get("intake"), readable);
                addCustomerMessageSwitch(switches, "visit", "방문예약 리마인드", "예약 3시간 전", preferences.get("visit"), configuredPreferences.get("visit"), readable);
                addCustomerMessageSwitch(switches, "measurement", "실측예약 리마인드", "예약 3시간 전", preferences.get("measurement"), configuredPreferences.get("measurement"), readable);
            }));
        }));
    }

    private void addCustomerMessageSwitch(LinearLayout parent, String kind, String title, String timing, Boolean enabledValue, Boolean configuredValue, boolean readable) {
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(12), dp(9), dp(12), dp(9));
        row.setBackgroundColor(PANEL);
        LinearLayout copy = fidelityColumn();
        copy.addView(text(title, 15, true));
        copy.addView(body(timing));
        row.addView(copy, new LinearLayout.LayoutParams(0, -2, 1));
        Switch toggle = new Switch(this);
        boolean configured = readable && Boolean.TRUE.equals(configuredValue);
        toggle.setText(configured ? (Boolean.TRUE.equals(enabledValue) ? "ON" : "OFF") : "intake".equals(kind) ? "상태 확인 필요" : "연결 안 됨");
        toggle.setChecked(configured && Boolean.TRUE.equals(enabledValue));
        toggle.setContentDescription(title + " 발송 설정");
        toggle.setEnabled(isOwner() && configured);
        row.addView(toggle, new LinearLayout.LayoutParams(dp(150), dp(46)));
        toggle.setOnCheckedChangeListener((buttonView, isChecked) -> {
            toggle.setEnabled(false);
            JSONObject payload = new JSONObject();
            tryPut(payload, "kind", kind);
            tryPut(payload, "enabled", isChecked);
            final int generation = requestGeneration;
            api.call("POST", "/api/mobile/message-preferences", payload, (response, status, error) -> runOnUiThread(() -> {
                if (!sameGeneration(generation)) return;
                if (handleAuthFailure(status)) return;
                if (status >= 200 && status < 300) {
                    toggle.setText(isChecked ? "ON" : "OFF");
                    toggle.setEnabled(isOwner());
                } else {
                    toggle.setOnCheckedChangeListener(null);
                    toggle.setChecked(!isChecked);
                    toggle.setText(!isChecked ? "ON" : "OFF");
                    toggle.setEnabled(false);
                    toast(message(response, error, "고객 메시지 설정을 저장하지 못했습니다."));
                    toggle.setOnCheckedChangeListener((ignored, ignoredChecked) -> { });
                }
            }));
        });
        parent.addView(row, blockParams());
        View divider = new View(this);
        divider.setBackgroundColor(LINE);
        parent.addView(divider, new LinearLayout.LayoutParams(-1, dp(1)));
    }

    private void renderCustomerMessageEditor(LinearLayout editor, Map<String, JSONObject> templates) {
        editor.removeAllViews();
        editor.addView(label("수정할 메시지"));
        Button chooseKind = choiceButton("intake".equals(customerMessageKind) ? "최초 접수 안내" : "measurement".equals(customerMessageKind) ? "실측예약 리마인드" : "방문예약 리마인드");
        editor.addView(chooseKind);
        chooseKind.setOnClickListener(v -> choose("메시지 종류", new String[]{"최초 접수 안내", "방문예약 리마인드", "실측예약 리마인드"}, value -> {
            customerMessageKind = "최초 접수 안내".equals(value) ? "intake" : "실측예약 리마인드".equals(value) ? "measurement" : "visit";
            renderCustomerMessageEditor(editor, templates);
        }));
        String initial = customerMessageDrafts.get(customerMessageKind);
        if (initial == null || initial.trim().isEmpty()) initial = defaultCustomerMessage(customerMessageKind);
        EditText content = input("고객에게 보낼 문구", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE, true);
        content.setMinHeight(dp(240));
        editor.addView(label("고객에게 보낼 문구"));
        content.setText(initial);
        editor.addView(content);
        editor.addView(body("연결값을 넣으면 고객별 예약 정보로 바뀝니다."));
        WrappingRow tokenGrid = new WrappingRow(this,dp(6));
        String[][] values = {{"업체명", "#{업체명}"}, {"고객명", "#{고객명}"}, {"예약일시", "#{예약일시}"}, {"장소명", "#{장소명}"}, {"상세주소", "#{상세주소}"}, {"지도링크", "#{지도링크}"}, {"담당자명", "#{담당자명}"}, {"담당자연락처", "#{담당자연락처}"}};
        for (String[] value : values) {
            Button token = secondary(value[0]+" 넣기");token.setTextSize(11);
            token.setMinWidth(0);token.setMinimumWidth(0);token.setMinHeight(dp(36));token.setMinimumHeight(dp(36));
            token.setPadding(dp(10),dp(6),dp(10),dp(6));
            tokenGrid.addView(token,new android.view.ViewGroup.LayoutParams(-2,-2));
            token.setOnClickListener(v -> {
                int cursor = Math.max(0, content.getSelectionStart());
                content.getText().insert(cursor,value[1]);
                customerMessageDrafts.put(customerMessageKind,content.getText().toString());
            });
        }
        editor.addView(tokenGrid, blockParams());
        TextView status = body("수정 중 · 아직 저장하지 않았습니다.");
        editor.addView(status);
        content.addTextChangedListener(new TextWatcher() {
            public void beforeTextChanged(CharSequence s, int start, int count, int after) { }
            public void onTextChanged(CharSequence s, int start, int before, int count) { customerMessageDrafts.put(customerMessageKind, s.toString()); status.setText("수정 중 · 아직 저장하지 않았습니다."); }
            public void afterTextChanged(Editable s) { }
        });
        Button save = primary("초안 저장");
        editor.addView(save);
        save.setOnClickListener(v -> {
            String value = content.getText().toString().trim();
            if (value.isEmpty()) { content.setError("문구를 입력해 주세요."); return; }
            if (value.length() > 5000) {
                status.setText("문구는 5000자 이내로 입력해 주세요.");
                return;
            }
            String[] required = "intake".equals(customerMessageKind)
                    ? new String[0]
                    : new String[]{"예약일시", "장소명", "상세주소", "지도링크"};
            ArrayList<String> missing = new ArrayList<>();
            for (String token : required) {
                if (!value.contains("#{" + token + "}")) missing.add(token);
            }
            ArrayList<String> unknown = new ArrayList<>();
            java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("#\\{([^}]+)\\}").matcher(value);
            while (matcher.find()) {
                String token = matcher.group(1);
                if (!isKnownCustomerMessageToken(token) && !unknown.contains(token)) unknown.add(token);
            }
            if (!missing.isEmpty()) {
                status.setText("자동 연결 항목을 포함해 주세요: " + join(missing, ", "));
                return;
            }
            if (!unknown.isEmpty()) {
                status.setText("지원하지 않는 연결 항목: " + join(unknown, ", "));
                return;
            }
            String serverValue = toServerMessageTemplate(value);
            if (serverValue.length() > 5000) {
                status.setText("변환된 문구는 5000자 이내로 입력해 주세요.");
                return;
            }
            JSONObject payload = new JSONObject();
            tryPut(payload, "kind", customerMessageKind);
            tryPut(payload, "state", "draft");
            tryPut(payload, "body", serverValue);
            tryPut(payload, "enabled", templates.containsKey(customerMessageKind) && templates.get(customerMessageKind).optBoolean("enabled", false));
            save.setEnabled(false);
            final int generation = requestGeneration;
            api.call("POST", "/api/mobile/message-templates", payload, (response, responseStatus, error) -> runOnUiThread(() -> {
                if (!sameGeneration(generation)) return;
                save.setEnabled(true);
                if (handleAuthFailure(responseStatus)) return;
                status.setText(responseStatus >= 200 && responseStatus < 300 ? "초안을 저장했습니다. 실제 발송 반영 없음" : message(response, error, "초안을 저장하지 못했습니다."));
            }));
        });
        editor.addView(text("고객 수신 화면", 18, true));
        LinearLayout channels = new LinearLayout(this);
        channels.setOrientation(LinearLayout.HORIZONTAL);
        Button sms = secondary("문자 미리보기");
        Button alimtalk = secondary("알림톡 미리보기");
        channels.addView(sms, new LinearLayout.LayoutParams(0, dp(48), 1));
        channels.addView(alimtalk, new LinearLayout.LayoutParams(0, dp(48), 1));
        editor.addView(channels);
        LinearLayout preview = templatePreviewBox();
        editor.addView(preview, blockParams());
        Runnable refresh = () -> {
            boolean selectedAlimtalk="알림톡".equals(customerMessageChannel);
            sms.setTextColor(selectedAlimtalk?INK:ACTION);
            alimtalk.setTextColor(selectedAlimtalk?ACTION:INK);
            sms.setBackground(round(selectedAlimtalk?Color.WHITE:Color.rgb(251,242,227),6,selectedAlimtalk?LINE:Color.rgb(221,195,153)));
            alimtalk.setBackground(round(selectedAlimtalk?Color.rgb(251,242,227):Color.WHITE,6,selectedAlimtalk?Color.rgb(221,195,153):LINE));
            sms.setSelected(!selectedAlimtalk);alimtalk.setSelected(selectedAlimtalk);
            renderTemplateChannelPreview(customerMessageChannel, localCustomerMessagePreview(content.getText().toString()), preview);
        };
        sms.setOnClickListener(v -> { customerMessageChannel = "sms"; refresh.run(); });
        alimtalk.setOnClickListener(v -> { customerMessageChannel = "알림톡"; refresh.run(); });
        content.addTextChangedListener(new TextWatcher() { public void beforeTextChanged(CharSequence s, int start, int count, int after) { } public void onTextChanged(CharSequence s, int start, int before, int count) { refresh.run(); } public void afterTextChanged(Editable s) { } });
        refresh.run();
    }

    private String localCustomerMessagePreview(String value) {
        boolean measurement = "measurement".equals(customerMessageKind);
        return toServerMessageTemplate(value).replace("{{company}}", "데이원디자인").replace("{{name}}", measurement ? "예시 고객 B" : "예시 고객 A").replace("{{date}}", "2026년 9월 10일").replace("{{time}}", measurement ? "오후 4시 (16:00)" : "오후 2시 (14:00)").replace("{{location}}", measurement ? "예시 아파트 실측 현장" : "판교점").replace("{{address}}", measurement ? "서울 강남구 예시로 10, 101동 1001호 (가상 주소)" : "분당구 판교공원로1길 22-1, 1층").replace("{{map}}", "지도 링크 예시").replace("{{staff}}", "예시 담당자").replace("{{phone}}", "010-0000-1000").replace("{{contact_phone}}", "010-0000-1000");
    }

    private String defaultCustomerMessage(String kind) {
        if ("intake".equals(kind)) return "[#{업체명}] 상담 접수 확인\n안녕하세요 #{고객명}님,\n\n홈페이지의 견적문의 메뉴를 통해 작성해주신 양식이 정상적으로 접수되었습니다.\n\n접수 문의를 확인하는대로 담당 매니저가 고객님께 연락드려 전화상담을 진행할 예정입니다.\n\n감사합니다.\n\n[데이원 사무실 주소]\n강남본점 : 강남구 논현로 562 역삼동 동극빌딩 2층(건물 기계식 주차 가능 -무료)\n판교점 : 분당구 판교공원로1길 22-1, 1층(건물 앞 주차가능)\nhttps://naver.me/FpwVn9Ta\n\n***홈페이지 안내***\nhttps://day1design.co.kr/";
        if ("measurement".equals(kind)) return "[#{업체명}] 실측예약 안내\n#{고객명}님, 담당자가 아래 일정에 방문할 예정입니다.\n\n예약: #{예약일시}\n실측 장소: #{장소명}\n현장 주소: #{상세주소}\n위치: #{지도링크}\n담당자: #{담당자명} / #{담당자연락처}\n\n주소나 일정이 변경되었다면 담당자에게 알려 주세요.";
        return "[#{업체명}] 방문예약 안내\n#{고객명}님, 방문예약을 안내드립니다.\n\n예약: #{예약일시}\n장소: #{장소명}\n주소: #{상세주소}\n위치: #{지도링크}\n\n예약 변경이 필요하면 담당자에게 연락해 주세요.\n문의: #{담당자연락처}";
    }

    private String toServerMessageTemplate(String value) {
        return value.replace("#{업체명}", "{{company}}").replace("#{고객명}", "{{name}}").replace("#{예약일시}", "{{date}} {{time}}").replace("#{장소명}", "{{location}}").replace("#{상세주소}", "{{address}}").replace("#{지도링크}", "{{map}}").replace("#{담당자명}", "{{staff}}").replace("#{담당자연락처}", "{{contact_phone}}");
    }

    private boolean isKnownCustomerMessageToken(String token) {
        return "업체명".equals(token) || "고객명".equals(token) || "예약일시".equals(token)
                || "장소명".equals(token) || "상세주소".equals(token) || "지도링크".equals(token)
                || "담당자명".equals(token) || "담당자연락처".equals(token);
    }

    private String toUiMessageTemplate(String value) {
        return value.replace("{{company}}", "#{업체명}").replace("{{name}}", "#{고객명}").replace("{{date}} {{time}}", "#{예약일시}").replace("{{location}}", "#{장소명}").replace("{{address}}", "#{상세주소}").replace("{{map}}", "#{지도링크}").replace("{{staff}}", "#{담당자명}").replace("{{contact_phone}}", "#{담당자연락처}").replace("{{phone}}", "#{담당자연락처}");
    }

    private void showTemplateEditor(JSONObject existing) {
        Dialog dialog = sheet();
        LinearLayout box = sheetBox();
        box.addView(text("템플릿 초안", 22, true));
        final String[] kind = {existing == null ? "visit" : existing.optString("kind", "visit")};
        TextView kindLabel = body(getString(R.string.template_kind, "measurement".equals(kind[0]) ? "실측" : "방문"));
        box.addView(kindLabel);
        Button chooseKind = choiceButton("유형 선택");
        box.addView(chooseKind);
        chooseKind.setOnClickListener(v -> choose("메시지 유형", new String[]{"방문", "실측"}, value -> {
            kind[0] = "실측".equals(value) ? "measurement" : "visit";
            kindLabel.setText(getString(R.string.template_kind, "measurement".equals(kind[0]) ? "실측" : "방문"));
        }));
        EditText content = input("템플릿 본문", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE, true);
        if (existing != null) content.setText(existing.optString("body", ""));
        box.addView(content);
        Button variable = secondary("변수 삽입");
        box.addView(variable);
        variable.setOnClickListener(v -> choose("삽입할 변수", new String[]{"{{name}}", "{{date}}", "{{time}}", "{{location}}", "{{address}}", "{{phone}}", "{{map}}"}, value -> {
            int cursor = Math.max(0, content.getSelectionStart());
            content.getText().insert(cursor, value);
        }));
        final String[] channel = {"SMS"};
        final boolean[] enabled = {existing != null && existing.optBoolean("enabled", false)};
        TextView channelLabel = body("미리보기 채널: SMS (화면 확인용)");
        box.addView(channelLabel);
        Button chooseChannel = choiceButton("미리보기 채널 선택");
        box.addView(chooseChannel);
        channelLabel.setPadding(dp(12), dp(10), dp(12), dp(10));
        channelLabel.setBackground(round(Color.rgb(222, 233, 245), 12, LINE));
        chooseChannel.setOnClickListener(v -> choose("미리보기 채널", new String[]{"SMS", "알림톡"}, value -> {
            channel[0] = value;
            channelLabel.setText(getString(R.string.preview_channel, value));
            channelLabel.setBackground(round("알림톡".equals(value) ? Color.rgb(221, 240, 222) : Color.rgb(222, 233, 245), 12, LINE));
        }));
        Button toggleEnabled = secondary(getString(R.string.template_enabled, enabled[0] ? "ON" : "OFF"));
        box.addView(toggleEnabled);
        toggleEnabled.setOnClickListener(v -> { enabled[0] = !enabled[0]; toggleEnabled.setText(getString(R.string.template_enabled, enabled[0] ? "ON" : "OFF")); });
        Button preview = secondary("미리보기");
        box.addView(preview);
        LinearLayout result = templatePreviewBox();
        box.addView(result, blockParams());
        preview.setOnClickListener(v -> previewTemplate(kind[0], channel[0], content, result));
        Button save = primary("초안 저장");
        box.addView(save);
        save.setOnClickListener(v -> {
            String value = content.getText().toString().trim();
            if (value.isEmpty()) {
                content.setError("본문을 입력하세요");
                return;
            }
            JSONObject payload = new JSONObject();
            tryPut(payload, "kind", kind[0]);
            tryPut(payload, "state", "draft");
            tryPut(payload, "body", value);
            tryPut(payload, "enabled", enabled[0]);
            submit(save, "POST", "/api/mobile/message-templates", payload, "템플릿 초안을 저장했습니다.", false, dialog);
        });
        setSheetContent(dialog, box);
        dialog.show();
        sizeSheet(dialog);
    }

    private void previewTemplate(String kind, String channel, EditText content, LinearLayout result) {
        String value = content.getText().toString().trim();
        if (value.isEmpty()) {
            content.setError("본문을 입력하세요");
            return;
        }
        JSONObject variables = new JSONObject();
        tryPut(variables, "name", "홍길동");
        tryPut(variables, "date", "2026-09-15");
        tryPut(variables, "time", "14:00");
        tryPut(variables, "location", "데이원디자인 쇼룸");
        tryPut(variables, "address", "서울시 강남구 테헤란로 123");
        tryPut(variables, "phone", "010-1234-5678");
        tryPut(variables, "map", "지도 링크 예시");
        JSONObject payload = new JSONObject();
        tryPut(payload, "kind", kind);
        tryPut(payload, "body", value);
        tryPut(payload, "variables", variables);
        final int generation = requestGeneration;
        api.call("POST", "/api/mobile/message-preview", payload, (body, status, error) -> runOnUiThread(() -> {
            if (!sameGeneration(generation)) return;
            if (handleAuthFailure(status)) return;
            if (status >= 200 && status < 300) {
                renderTemplateChannelPreview(channel, body.optString("text", "미리보기 결과가 없습니다."), result);
            } else {
                result.removeAllViews();
                result.addView(body(message(body, error, "미리보기 서비스를 사용할 수 없습니다.")));
            }
        }));
    }

    private LinearLayout templatePreviewBox() {
        LinearLayout preview = new LinearLayout(this);
        preview.setOrientation(LinearLayout.VERTICAL);
        preview.setPadding(dp(14), dp(12), dp(14), dp(12));
        preview.setBackground(round(PANEL, 14, LINE));
        preview.addView(body("미리보기를 누르면 가상 고객정보를 넣은 수신 화면이 표시됩니다."));
        return preview;
    }

    private void renderTemplateChannelPreview(String channel, String message, LinearLayout preview) {
        preview.removeAllViews();preview.setPadding(0,0,0,0);preview.setBackgroundColor(Color.TRANSPARENT);
        boolean alimtalk = "알림톡".equals(channel);
        LinearLayout device=fidelityColumn();device.setBackground(round(alimtalk?Color.rgb(220,229,234):Color.rgb(243,244,245),16,Color.rgb(216,217,219)));device.setClipToOutline(true);
        LinearLayout header=new LinearLayout(this);header.setGravity(Gravity.CENTER_VERTICAL);header.setPadding(dp(17),dp(17),dp(17),dp(17));header.setBackgroundColor(Color.WHITE);
        header.addView(text("‹",18,false));TextView sender=text(alimtalk?tenantName():"등록된 발신번호",13,true);sender.setGravity(Gravity.CENTER);header.addView(sender,new LinearLayout.LayoutParams(0,-2,1));header.addView(text("⋯",18,false));device.addView(header);
        TextView date=text(("intake".equals(customerMessageKind)?"9월 8일 오전 9:20":"measurement".equals(customerMessageKind)?"9월 10일 오후 1:00":"9월 10일 오전 11:00")+" · 수신 예시",10,false);date.setTextColor(Color.rgb(105,112,121));date.setGravity(Gravity.CENTER);date.setPadding(dp(6),dp(18),dp(6),dp(18));device.addView(date);
        LinearLayout bubble=fidelityColumn();bubble.setBackground(round(alimtalk?Color.WHITE:Color.rgb(227,229,232),10,Color.TRANSPARENT));bubble.setClipToOutline(true);
        if(alimtalk){TextView tag=text("알림톡",12,true);tag.setTextColor(Color.rgb(69,60,31));tag.setPadding(dp(14),dp(9),dp(14),dp(9));tag.setBackgroundColor(Color.rgb(244,223,120));bubble.addView(tag);}
        TextView messageView=text(message,12,false);messageView.setTextColor(Color.rgb(36,40,45));messageView.setLineSpacing(0,1.9f);messageView.setPadding(dp(14),dp(14),dp(14),dp(14));bubble.addView(messageView);
        LinearLayout.LayoutParams bubbleParams=new LinearLayout.LayoutParams(-1,-2);bubbleParams.setMargins(dp(12),0,dp(24),dp(15));device.addView(bubble,bubbleParams);
        TextView foot=text("가상 고객정보를 연결한 미리보기\n기기·문자 앱에 따라 실제 표시가 달라질 수 있습니다.",10,false);foot.setTextColor(Color.rgb(105,112,121));foot.setGravity(Gravity.CENTER);foot.setPadding(dp(12),0,dp(12),dp(18));device.addView(foot);
        preview.addView(device,blockParams());
    }

    private void renderAnalytics(JSONObject payload) {
        JSONArray sources = payload.optJSONArray("sources");
        if (sources == null) { root.addView(body("분석 데이터를 불러오지 못했습니다.")); return; }
        JSONObject totals = payload.optJSONObject("metrics");
        if (totals != null) {
            root.addView(text("접수와 방문", 21, true));
            root.addView(body("저장된 접수: " + analyticsValue(totals, "savedLeads") + "건\n홈페이지 세션: " + analyticsValue(totals, "sessions") + (totals.isNull("sessions") ? "" : "회")));
            root.addView(body("광고 출처 접수: " + analyticsValue(totals, "metaSavedLeads") + "건"));
        }
        for (int i = 0; i < sources.length(); i++) {
            JSONObject source = sources.optJSONObject(i);
            if (source == null) continue;
            JSONObject period = source.optJSONObject("period");
            String range = period == null ? "기간 확인 필요" : period.optString("start", "") + " ~ " + period.optString("end", "") + " KST";
            root.addView(text(source.optString("label", "분석 원천"), 20, true));
            root.addView(body(range));
            if (!source.optBoolean("available", false)) {
                root.addView(body("데이터 확인 필요 · 이 업체의 통계 연결이 준비되지 않았습니다."));
                continue;
            }
            JSONObject values = source.optJSONObject("metrics");
            String key = source.optString("key", "");
            if (values != null && "meta_ads".equals(key)) {
                root.addView(body("광고비: " + analyticsValue(values,"spend") + "원 · 노출: " + analyticsValue(values,"impressions") + "회\n클릭: " + analyticsValue(values,"clicks") + "회 · Meta 리드: " + analyticsValue(values,"leads") + "건"));
                for (String metric : new String[]{"cpl","cpc","cpm"}) {
                    JSONObject number = values.optJSONObject(metric);
                    root.addView(body(metric.toUpperCase(Locale.ROOT) + ": " + (number == null ? "확인 필요" : analyticsValue(number,"value")) + "원\n기준: " + ("cpl".equals(metric) ? "광고비 / Meta 리드" : "cpc".equals(metric) ? "광고비 / 클릭" : "광고비 × 1,000 / 노출")));
                }
            } else if (values != null && "pixel_events".equals(key)) {
                root.addView(body("페이지뷰 이벤트: " + analyticsValue(values,"pageviews") + "회 · Lead 이벤트: " + analyticsValue(values,"leads") + "회\n이벤트 수는 저장된 접수 건수와 다릅니다."));
            } else if (values != null && "sessions".equals(key)) {
                root.addView(body("봇 제외 세션: " + analyticsValue(values,"sessions") + "회 · 페이지뷰: " + analyticsValue(values,"pageviews") + "회"));
            } else if (values != null) {
                root.addView(body("실제 상담 접수: " + analyticsValue(values,"saved") + "건"));
                if ("saved_estimates".equals(key)) {
                    appendSavedEstimateBreakdown(values);
                }
            }
            root.addView(body("갱신: " + (source.isNull("refreshed_at") ? "기간 내 기록 없음" : formatIsoForDisplay(source.optString("refreshed_at","")))));
        }
        root.addView(body("효율 판단 기준은 아직 확정되지 않았습니다. 데이터가 없는 항목은 0으로 계산하지 않습니다."));
    }

    private void appendSavedEstimateBreakdown(JSONObject values) {
        JSONArray trend = values.optJSONArray("trend");
        if (trend != null && trend.length() > 0) {
            root.addView(text("일별 상담 접수 추이", 17, true));
            for (int i = 0; i < trend.length(); i++) {
                JSONObject day = trend.optJSONObject(i);
                if (day == null) continue;
                root.addView(body(day.optString("date", "날짜 확인 필요") + " · 저장 " + analyticsValue(day, "saved") + "건 · 광고 출처 " + analyticsValue(day, "metaSaved") + "건"));
            }
        }
        JSONArray channels = values.optJSONArray("channels");
        if (channels != null && channels.length() > 0) {
            root.addView(text("출처별 상담 접수", 17, true));
            for (int i = 0; i < channels.length(); i++) {
                JSONObject channel = channels.optJSONObject(i);
                if (channel == null) continue;
                root.addView(body(channel.optString("channel", "출처 확인 필요") + " · 저장 " + analyticsValue(channel, "saved") + "건 · 광고 출처 " + analyticsValue(channel, "metaSaved") + "건"));
            }
            if (values.optBoolean("channelsHasMore", false)) {
                root.addView(body("기타 채널 " + analyticsValue(values, "otherLeads") + "건"));
            }
        }
    }

    private String analyticsValue(JSONObject object, String key) {
        if (!object.has(key) || object.isNull(key)) { return "확인 필요"; }
        return java.text.NumberFormat.getNumberInstance(Locale.KOREA).format(object.optDouble(key));
    }

    private String analyticsRangeError(String start, String end) {
        if (start.isEmpty() && end.isEmpty()) return "";
        if (start.isEmpty() || end.isEmpty()) return "분석 기간은 시작일과 종료일을 함께 입력하세요.";
        try {
            LocalDate startDate = start.isEmpty() ? null : LocalDate.parse(start);
            LocalDate endDate = end.isEmpty() ? null : LocalDate.parse(end);
            if (startDate != null && endDate != null) {
                if (endDate.isBefore(startDate)) return "분석 기간을 확인하세요: 종료일이 시작일보다 빠릅니다.";
                if (ChronoUnit.DAYS.between(startDate, endDate) >= 366) return "분석 기간은 366일 이내로 선택하세요.";
            }
            return "";
        } catch (DateTimeParseException error) {
            return "분석 기간은 YYYY-MM-DD 형식으로 입력하세요.";
        }
    }

    private void showUnavailable(String title, String endpoint, String detail) {
        base();
        addHeader();
        root.addView(text(title, 26, true));
        root.addView(body(detail));
        root.addView(body("연결 경로: " + endpoint));
        Button back = secondary(isOwner()?"고객 목록":"내 담당 업무");
        root.addView(back);
        back.setOnClickListener(v -> {if(isOwner())showCustomers("");else showNotifications();});
    }

    private void loadCustomersInto(LinearLayout list, String query, String cursor, boolean replace) {
        list.addView(body("고객 목록을 불러오는 중입니다."));
        String path = "/api/mobile/customers";
        ArrayList<String> parts = new ArrayList<>();
        if (!query.isEmpty()) parts.add("q=" + Uri.encode(query));
        if (!customerStatus.isEmpty()) parts.add("status=" + Uri.encode(customerStatus));
        if (!customerSource.isEmpty()) parts.add("source=" + Uri.encode(customerSource));
        if (!cursor.isEmpty()) parts.add("cursor=" + Uri.encode(cursor));
        if (!parts.isEmpty()) path += "?" + join(parts, "&");
        final int generation = requestGeneration;
        api.call("GET", path, null, (body, status, error) -> runOnUiThread(() -> {
            if (!sameGeneration(generation) || !query.equals(customerQuery)) return;
            if (replace) list.removeAllViews();
            else list.removeViewAt(list.getChildCount() - 1);
            if (handleAuthFailure(status)) return;
            if (status < 200 || status >= 300) {
                list.addView(body(message(body, error, "고객 목록을 불러오지 못했습니다.")));
                return;
            }
            JSONArray customers = body.optJSONArray("customers");
            if (customers == null || customers.length() == 0) {
                list.addView(body("표시할 고객이 없습니다."));
            } else {
                for (int i = 0; i < customers.length(); i++) {
                    JSONObject customer = customers.optJSONObject(i);
                    if (customer == null) continue;
                    list.addView(customerSummary(customer));
                }
            }
            String next = body.optString("next_cursor", "");
            if (!next.isEmpty() && !"null".equals(next)) {
                Button more = secondary("더 불러오기");
                list.addView(more);
                more.setOnClickListener(v -> {
                    more.setEnabled(false);
                    list.removeView(more);
                    loadCustomersInto(list, query, next, false);
                });
            }
        }));
    }

    private void showDetail(String id) {
        String scheduleKind=pendingScheduleKind;
        if (isOwner()) { activeTab = "customers"; }
        detailTab = "정보";
        base();
        customerDetailActive = true;
        Button back = secondary(isOwner()?"고객 목록":"내 담당 업무");
        root.addView(back);
        back.setOnClickListener(v -> {if(isOwner())showCustomers("");else showNotifications();});
        root.addView(body("고객 상세를 불러오는 중입니다."));
        final int generation = requestGeneration;
        api.call("GET", "/api/mobile/customers/" + Uri.encode(id), null, (body, status, error) -> runOnUiThread(() -> {
            if (!sameGeneration(generation)) return;
            if (handleAuthFailure(status)) return;
            if (status >= 200 && status < 300) {
                current = body;
                loadMembersThenRender(scheduleKind.isEmpty()?this::renderDetail:()->showAppointmentSheet(scheduleKind));
            } else {
                root.addView(body(message(body, error, "고객 정보를 불러오지 못했습니다.")));
            }
        }));
    }

    private void loadMembersThenRender(Runnable ready) {
        members.clear();
        if (!isOwner()) {
            ready.run();
            return;
        }
        final int generation = requestGeneration;
        api.call("GET", "/api/mobile/members", null, (body, status, error) -> runOnUiThread(() -> {
            if (!sameGeneration(generation)) return;
            if (handleAuthFailure(status)) return;
            if (status >= 200 && status < 300) {
                JSONArray rows = body.optJSONArray("members");
                if (rows != null) {
                    for (int i = 0; i < rows.length(); i++) {
                        JSONObject member = rows.optJSONObject(i);
                        if (member != null) members.add(member);
                    }
                }
            }
            ready.run();
        }));
    }

    private void renderDetail() {
        root.removeAllViews();addHeader();
        Button back = secondary(isOwner()?"고객 목록":"내 담당 업무");
        root.addView(back);
        back.setOnClickListener(v -> { customerDetailActive = false; if(isOwner())showCustomers(customerQuery);else showNotifications(); });
        root.addView(text("고객 상담카드",23,true));
        root.addView(label("접수번호 "+current.optString("id")));
        LinearLayout hero=fidelityColumn();hero.setPadding(dp(16),dp(12),dp(16),dp(12));hero.setBackground(round(Color.WHITE,6,LINE));root.addView(hero,blockParams());
        LinearLayout identityRow=new LinearLayout(this);identityRow.setGravity(Gravity.CENTER_VERTICAL);
        String customerName=current.optString("name","고객");TextView avatar=text(customerName.isEmpty()?"?":customerName.substring(0,1),16,true);avatar.setGravity(Gravity.CENTER);avatar.setPadding(0,0,0,0);avatar.setBackground(round(Color.rgb(239,237,231),6,Color.TRANSPARENT));identityRow.addView(avatar,new LinearLayout.LayoutParams(dp(36),dp(36)));
        LinearLayout identity=fidelityColumn();identity.setPadding(dp(10),0,dp(8),0);identity.addView(text(customerName,19,true));identity.addView(fidelityCaption(CustomerCardFields.source(current.optString("first_source"),current.optString("source"),current.optString("first_referrer"))));identityRow.addView(identity,new LinearLayout.LayoutParams(0,-2,1));
        String customerStatusValue=current.optString("status");TextView statusBadge=text(("계약완료".equals(customerStatusValue)||"contracted".equals(customerStatusValue))?"계약완료":"진행중",10,true);statusBadge.setPadding(dp(7),dp(4),dp(7),dp(4));statusBadge.setTextColor(Color.rgb(53,99,78));statusBadge.setBackground(round(Color.rgb(237,243,238),4,Color.TRANSPARENT));identityRow.addView(statusBadge);hero.addView(identityRow);fidelityDivider(hero);
        fidelityKeyValue(hero,"연락처",current.optString("phone"));
        if(!CustomerCardFields.value(current.optString("branch")).isEmpty())fidelityKeyValue(hero,"희망지점",current.optString("branch"));
        fidelityKeyValue(hero,"지역·예산",current.optString("region")+"\n가용예산 · "+CustomerCardFields.budget(current.optString("budget_text"),current.optString("detail")));
        LinearLayout actions=new LinearLayout(this);
        addNavButton(actions,"전화",v -> {
            if (BuildConfig.DRY_RUN) { toast("드라이런에서는 전화를 실행하지 않습니다."); return; }
            Intent dial=new Intent(Intent.ACTION_DIAL,Uri.parse("tel:"+Uri.encode(current.optString("phone"))));
            if(dial.resolveActivity(getPackageManager())!=null)startActivity(dial);else toast("전화 앱이 없습니다.");
        });
        addNavButton(actions,"문자",v -> showCustomerMessage());
        if(isOwner())addNavButton(actions,"정보 수정",v -> showCustomerEditor());
        hero.addView(actions);
        LinearLayout tabs=new LinearLayout(this);
        for(String title:new String[]{"정보","진행","이력"}) {
            Button tab=secondary(title);if(title.equals(detailTab))tab.setBackground(round(Color.rgb(251,242,227),6,Color.rgb(221,195,153)));
            tabs.addView(tab,new LinearLayout.LayoutParams(0,dp(48),1));
            tab.setOnClickListener(v -> {detailTab=title;renderDetail();});
        }
        root.addView(tabs,blockParams());
        if("정보".equals(detailTab)) {
            LinearLayout info=fidelityColumn();info.setPadding(dp(16),dp(12),dp(16),dp(12));info.setBackground(round(Color.WHITE,6,LINE));root.addView(info,blockParams());
            fidelityKeyValue(info,"공간",current.optString("space_type")+" · "+current.optString("space_size"));
            fidelityKeyValue(info,"주소",current.optString("address",current.optString("region"))+" "+current.optString("address_detail"));
            fidelityKeyValue(info,"담당자",memberLabel(current));
            fidelityKeyValue(info,"상태",current.optString("status"));
            fidelityKeyValue(info,"희망 내용",current.optString("detail"));
            detailSheetRow("유입·방문 히스토리",this::showCustomerAttribution);
            detailSheetRow("첨부·원문 응답",this::showCustomerOriginal);
        } else if("진행".equals(detailTab)) {
            LinearLayout progress=fidelityColumn();progress.setPadding(dp(16),dp(12),dp(16),dp(12));progress.setBackground(round(Color.WHITE,6,LINE));progress.addView(fidelityCaption("현재 상태"));progress.addView(text(current.optString("status"),19,true));
            LinearLayout steps=new LinearLayout(this);String[] names={"접수","상담","실측","계약"};String state=current.optString("status");int reached="계약완료".equals(state)?3:state.contains("실측")?2:state.contains("상담")||state.contains("미팅")?1:0;
            for(int i=0;i<names.length;i++){TextView step=fidelityCaption(names[i]);step.setTextColor(i<=reached?INK:MUTED);step.setTypeface(Typeface.DEFAULT,i<=reached?Typeface.BOLD:Typeface.NORMAL);step.setPadding(0,dp(6),0,dp(6));steps.addView(step,new LinearLayout.LayoutParams(0,-2,1));}progress.addView(steps);progress.addView(fidelityCaption("보류·미진행·재상담으로 분기할 수 있습니다."));root.addView(progress,blockParams());
            addSection("예약");addHistory("appointments");
            addSection("계약");addHistory("contracts");
        } else {
            addSection("예약 이력");addHistory("appointments");
            addSection("상담결과");
            if(current.optJSONArray("consultations")==null||current.optJSONArray("consultations").length()==0)root.addView(body("결과 미작성 · 상담 완료 확인 없음"));
            addHistory("consultations");
            addSection("계약 이력");addHistory("contracts");
        }
        if(isOwner()) {
            addSection("상담·후속 업무");
            menu("상담 일정 등록·변경",() -> showAppointmentSheet("visit"));
            Button result=primary("상담 완료 · 결과 작성");root.addView(result);result.setOnClickListener(v -> showConsultationSheet());
            menu("실측 일정 선택",() -> showAppointmentSheet("measurement"));
            menu("계약 전환",this::showContractSheet);
        }
    }

    private void detailSheetRow(String title,Runnable action) {
        Button row=textButton(title);row.setTextColor(INK);row.setGravity(Gravity.START|Gravity.CENTER_VERTICAL);
        row.setCompoundDrawablesRelativeWithIntrinsicBounds(R.drawable.nav_chart,0,R.drawable.control_chevron,0);row.setCompoundDrawablePadding(dp(10));
        root.addView(row,new LinearLayout.LayoutParams(-1,-2));fidelityDivider(root);row.setOnClickListener(v->action.run());
    }

    private void showCustomerAttribution() {
        Dialog dialog=sheet();LinearLayout box=sheetBox();box.addView(text("유입·방문 히스토리",22,true));
        String[][] fields={{"first_source","첫 유입 출처"},{"first_platform","첫 유입 플랫폼"},{"first_campaign","첫 유입 캠페인"},{"first_referrer","이전 페이지"},{"source","접수 출처"},{"platform","접수 플랫폼"},{"campaign","접수 캠페인"},{"referral","접수 경로"}};
        for(String[] field:fields){String value=current.optString(field[0]);box.addView(label(field[1]));box.addView(body(value.isEmpty()?"기록 없음":value));}
        box.addView(text("방문 페이지 기록",17,true));
        box.addView(body("접수에 연결된 방문 페이지를 시간순으로 표시합니다. 페이지 조회 수는 재방문 횟수와 다릅니다."));
        LinearLayout timeline=fidelityColumn();box.addView(timeline);
        Button more=secondary("방문 기록 불러오기");box.addView(more);
        final JSONObject customer=current;
        final ArrayList<String> cursors=new ArrayList<>();
        JSONObject cached=customer.optJSONObject("visit_history");
        if(cached!=null) renderCustomerVisits(timeline,more,cached);
        more.setOnClickListener(v->{JSONObject saved=customer.optJSONObject("visit_history");loadCustomerVisits(dialog,timeline,more,customer,saved==null?"":saved.optString("nextCursor",""),cursors);});
        setSheetContent(dialog,box);dialog.show();sizeSheet(dialog);
        if(cached==null)loadCustomerVisits(dialog,timeline,more,customer,"",cursors);
    }

    private void loadCustomerVisits(Dialog dialog,LinearLayout timeline,Button more,JSONObject customer,String cursor,ArrayList<String> cursors) {
        if(cursors.contains(cursor)){more.setEnabled(false);more.setText("중복 기록 조회를 중단했습니다.");return;}
        more.setEnabled(false);more.setText("방문 기록을 불러오는 중...");
        final int generation=requestGeneration;
        api.call("GET","/api/mobile/customers/"+Uri.encode(customer.optString("id"))+"/visit-history"+(cursor.isEmpty()?"":"?cursor="+Uri.encode(cursor)),null,(result,status,error)->runOnUiThread(()->{
            if(!dialog.isShowing()||!sameGeneration(generation)||current!=customer)return;
            if(handleAuthFailure(status))return;
            if(status<200||status>=300||error!=null){more.setEnabled(true);more.setText("방문 기록 다시 불러오기");toast("방문 기록을 불러오지 못했습니다.");return;}
            JSONArray incoming=result.optJSONArray("events");
            if(incoming==null){more.setEnabled(true);more.setText("방문 기록 다시 불러오기");return;}
            JSONObject saved=customer.optJSONObject("visit_history");
            JSONArray rows=saved==null?new JSONArray():saved.optJSONArray("events");
            if(rows==null)rows=new JSONArray();
            for(int i=0;i<incoming.length()&&rows.length()<1000;i++)rows.put(incoming.optJSONObject(i));
            try{result.put("events",rows);customer.put("visit_history",result);}catch(JSONException ignored){}
            cursors.add(cursor);renderCustomerVisits(timeline,more,result);
        }));
    }

    private void renderCustomerVisits(LinearLayout timeline,Button more,JSONObject history) {
        timeline.removeAllViews();JSONArray rows=history.optJSONArray("events");int count=rows==null?0:rows.length();
        if(count==0)timeline.addView(body(history.optBoolean("linked")?"연결된 방문 페이지 기록이 없습니다.":"이 접수에는 방문 추적 정보가 연결되어 있지 않습니다."));
        else{
            timeline.addView(label("확인된 페이지 조회 "+new DecimalFormat("#,###").format(count)+"건"));
            for(int i=0;i<count;i++){JSONObject event=rows.optJSONObject(i);if(event==null)continue;
                timeline.addView(label(formatIsoForDisplay(event.optString("createdAt"))));
                timeline.addView(body(event.optString("page","/")));
                String source=event.optString("utmSource");if(source.isEmpty())source=event.optString("referrer");if(source.isEmpty())source="직접 방문";
                timeline.addView(fidelityCaption(source+" · "+event.optString("device")+(event.optString("utmCampaign").isEmpty()?"":" · "+event.optString("utmCampaign"))));fidelityDivider(timeline);
            }
        }
        String next=history.optString("nextCursor","");boolean hasMore=!next.isEmpty()&&!"null".equals(next);
        more.setVisibility(hasMore?View.VISIBLE:View.GONE);more.setEnabled(count<1000);more.setText(count>=1000?"최대 1,000건 표시 · 이후 기록이 더 있습니다.":"이전 기록 다음 50건 보기");
    }

    private void showCustomerOriginal() {
        Dialog dialog=sheet();LinearLayout box=sheetBox();box.addView(text("첨부·원문 응답",22,true));
        JSONArray attachments=current.optJSONArray("attachments");
        box.addView(text("첨부파일",17,true));
        if(attachments==null||attachments.length()==0)box.addView(body("등록된 첨부파일이 없습니다."));
        else for(int i=0;i<attachments.length();i++){
            JSONObject file=attachments.optJSONObject(i);if(file==null)continue;
            String url=file.optString("url");Uri uri=Uri.parse(url);
            if(!"https".equalsIgnoreCase(uri.getScheme())||uri.getHost()==null)continue;
            String name=file.optString("name");if(name.isEmpty())name=uri.getLastPathSegment();
            Button open=secondary(name==null||name.isEmpty()?"첨부파일 열기":name);box.addView(open);
            open.setOnClickListener(v->{if(BuildConfig.DRY_RUN){toast("드라이런에서는 외부 파일을 열지 않습니다.");return;}Intent intent=new Intent(Intent.ACTION_VIEW,uri);if(intent.resolveActivity(getPackageManager())!=null)startActivity(intent);else toast("파일을 열 앱이 없습니다.");});
        }
        box.addView(text("고객이 입력한 원문 응답",17,true));
        if("stored_fields".equals(current.optString("form_answers_source")))box.addView(body("이전 홈페이지 접수에 저장된 내용입니다. 접수 후 수정된 항목은 현재 저장값으로 표시합니다."));
        JSONArray answers=current.optJSONArray("form_answers");
        if(answers==null||answers.length()==0)box.addView(body("저장된 추가 응답이 없습니다."));
        else for(int i=0;i<answers.length();i++){
            JSONObject answer=answers.optJSONObject(i);if(answer==null)continue;
            box.addView(label(answer.optString("question")));box.addView(body(answer.optString("answer")));
        }
        setSheetContent(dialog,box);dialog.show();sizeSheet(dialog);
    }

    private void showCustomerEditor() {
        base();addHeader();root.addView(text("고객 정보 수정",23,true));
        root.addView(body(current.optString("name")));addCustomerForm();
        root.addView(note("앱과 웹의 같은 고객 원본을 수정하는 구조입니다. 다른 곳에서 수정했다면 덮어쓰기 대신 최신 내용 비교를 안내합니다."),blockParams());
        Button save=primary("변경 내용 저장");root.addView(save);save.setOnClickListener(v -> saveCustomer(save));
    }

    private void showCustomerMessage() {
        base();addHeader();root.addView(text("문자·내보내기",23,true));
        root.addView(fidelityCaption("기존 상담관리 기능 유지"));
        LinearLayout messageCard=fidelityColumn();messageCard.setPadding(dp(16),dp(14),dp(16),dp(14));messageCard.setBackground(round(Color.WHITE,6,LINE));
        messageCard.addView(text("문자 발송",16,true));
        messageCard.addView(fidelityCaption("선택 고객 · "+current.optString("phone")));
        messageCard.addView(label("문자 내용"));
        EditText content=input("고객에게 전달할 내용을 입력하세요",InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_MULTI_LINE,true);messageCard.addView(content);
        Button draft=primary("발송 전 내용 확인");messageCard.addView(draft);root.addView(messageCard,blockParams());
        draft.setOnClickListener(v -> showSmsPreview(content.getText().toString()));
        LinearLayout exportCard=fidelityColumn();exportCard.setPadding(dp(16),dp(14),dp(16),dp(14));exportCard.setBackground(round(Color.WHITE,6,LINE));
        exportCard.addView(text("접수 내보내기",16,true));exportCard.addView(fidelityCaption("고객 목록에 적용한 검색·상태·출처 조건으로 CSV를 저장합니다."));
        Button export = secondary("CSV 파일 저장"); exportCard.addView(export);root.addView(exportCard,blockParams());
        root.addView(note("발송 전 수신자·건수·문구를 확인해 주세요."),blockParams());
        export.setOnClickListener(v -> {
            export.setEnabled(false);
            ArrayList<String> parts = new ArrayList<>();
            if (!customerQuery.isEmpty()) parts.add("q=" + Uri.encode(customerQuery));
            if (!customerStatus.isEmpty()) parts.add("status=" + Uri.encode(customerStatus));
            if (!customerSource.isEmpty()) parts.add("source=" + Uri.encode(customerSource));
            exportCustomers(export, "/api/mobile/customers?"+join(parts,"&"), "", new StringBuilder("이름,연락처,지역,예산,상태,출처"), requestGeneration, 0);
        });
    }

    private void showSmsPreview(String messageText) {
        Dialog dialog=sheet();LinearLayout box=sheetBox();box.addView(text("발송 전 내용 확인",22,true));
        box.addView(fidelityCaption(current.optString("name")+" · "+current.optString("phone")));
        box.addView(body(messageText.trim().isEmpty()?"입력된 내용이 없습니다.":messageText.trim()));
        Button close=secondary("닫기");box.addView(close);close.setOnClickListener(v->dialog.dismiss());
        if(!BuildConfig.DRY_RUN){Button open=primary("문자 앱에서 확인");box.addView(open);open.setOnClickListener(v->{Intent intent=new Intent(Intent.ACTION_SENDTO,Uri.parse("smsto:"+Uri.encode(current.optString("phone"))));intent.putExtra("sms_body",messageText);if(intent.resolveActivity(getPackageManager())!=null)startActivity(intent);else toast("문자 앱을 사용할 수 없습니다.");});}
        setSheetContent(dialog,box);dialog.show();sizeSheet(dialog);
    }

    private void exportCustomers(Button button, String path, String cursor, StringBuilder csv, int generation, int pages) {
        if (pages >= 40) { button.setEnabled(true); toast("내보내기 범위가 큽니다. 필터를 좁혀주세요."); return; }
        api.call("GET",path+(cursor.isEmpty()?"":"&cursor="+Uri.encode(cursor)),null,(payload,status,error)->runOnUiThread(()->{
            if(!sameGeneration(generation))return;
            if(handleAuthFailure(status))return;
            if(status<200||status>=300){button.setEnabled(true);toast("내보내기에 실패했습니다. 다시 시도하세요.");return;}
            JSONArray rows=payload.optJSONArray("customers");
            if(rows!=null)for(int i=0;i<rows.length();i++){
                JSONObject row=rows.optJSONObject(i);if(row==null)continue;
                csv.append((char)13).append((char)10);
                String[] keys={"name","phone","region","budget","status","source"};
                for(int j=0;j<keys.length;j++){if(j>0)csv.append(',');csv.append(csvCell(row.optString(keys[j],"")));}
            }
            String next=payload.isNull("next_cursor")?"":payload.optString("next_cursor","");
            if(!next.isEmpty()){if(next.equals(cursor)){button.setEnabled(true);toast("페이지 정보가 반복되어 내보내기를 중단했습니다.");return;}exportCustomers(button,path,next,csv,generation,pages+1);return;}
            button.setEnabled(true); pendingCsv=csv.toString();
            Intent save=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("text/csv").putExtra(Intent.EXTRA_TITLE,"customers-"+LocalDate.now(ZoneId.of("Asia/Seoul"))+".csv");
            startActivityForResult(save,701);
        }));
    }

    private String csvCell(String value) {
        String checked=value.trim();
        if(!checked.isEmpty()&&"=+-@".indexOf(checked.charAt(0))>=0)value="'"+value;
        String quote=Character.toString((char)34);
        return quote+value.replace(quote,quote+quote)+quote;
    }

    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){
        super.onActivityResult(requestCode,resultCode,data);
        if(requestCode!=701)return;
        String content=pendingCsv;pendingCsv=null;
        if(resultCode!=RESULT_OK||data==null||data.getData()==null||content==null)return;
        Uri destination=data.getData();
        new Thread(()->{
            try(java.io.OutputStream stream=getContentResolver().openOutputStream(destination,"w")){
                if(stream==null)throw new java.io.IOException();
                stream.write(new byte[]{(byte)0xef,(byte)0xbb,(byte)0xbf});
                stream.write(content.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                runOnUiThread(()->toast("CSV 파일을 저장했습니다."));
            }catch(Exception error){runOnUiThread(()->toast("파일을 저장하지 못했습니다."));}
        }).start();
    }

    private void addCustomerForm() {
        addBoundEdit("name", "이름", InputType.TYPE_CLASS_TEXT);
        addBoundEdit("phone", "연락처", InputType.TYPE_CLASS_PHONE);
        addBoundEdit("email", "이메일", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        addBoundEdit("region", "지역", InputType.TYPE_CLASS_TEXT);
        addBoundEdit("budget", "예산", InputType.TYPE_CLASS_NUMBER);
        addBoundEdit("address_detail", "상세 주소", InputType.TYPE_CLASS_TEXT);
        addBoundEdit("space_type", "공간 유형", InputType.TYPE_CLASS_TEXT);
        addBoundEdit("space_size", "평수", InputType.TYPE_CLASS_TEXT);
        addBoundEdit("schedule", "희망 일정", InputType.TYPE_CLASS_TEXT);
        addBoundEdit("branch", "지점", InputType.TYPE_CLASS_TEXT);
        addBoundEdit("referral", "추천인", InputType.TYPE_CLASS_TEXT);
        addBoundEdit("detail", "희망 내용", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        EditText statusValue=addBoundEdit("status", "상태", InputType.TYPE_CLASS_TEXT);
        statusValue.setEnabled(false);
        root.removeView(statusValue);
        Button status = choiceButton(statusValue.getText().toString());
        root.addView(status);
        ArrayList<String> statusOptions=new ArrayList<>(Arrays.asList("접수대기", "고객 부재중", "진행불가 (예산/범위/지역/일정등)", "전화상담 후 미진행", "전화상담 후 미팅예약", "전화상담 후 대기중", "보류"));
        if ("계약완료".equals(current.optString("status")) || "contracted".equals(current.optString("status"))) statusOptions.add("계약완료");
        status.setOnClickListener(v -> choose("상태", statusOptions.toArray(new String[0]), value -> { customerEdits.get("status").setText(value); status.setText(value); }));
        if (isOwner()) {
            root.addView(label("담당자"));
            Button assignee = choiceButton(memberLabel(current));
            root.addView(assignee);
            assignee.setOnClickListener(v -> showAssigneeSheet());
        } else {
            addReadOnly("담당자", memberLabel(current));
        }
        addBoundEdit("memo", "메모", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
    }

    private EditText addBoundEdit(String key, String label, int type) {
        boolean visible=Arrays.asList("name","phone","region","budget","status","memo").contains(key);
        TextView title = label("status".equals(key)?"상담 상태":label);
        if(visible)root.addView(title);
        boolean multiline = key.equals("detail") || key.equals("memo");
        EditText edit = input(label, type, multiline);
        edit.setText(key.equals("budget") ? String.valueOf(current.optLong(key, 0)) : current.optString(key, ""));
        edit.setEnabled(isOwner());
        edit.setSingleLine(!multiline);
        customerEdits.put(key, edit);
        if(visible)root.addView(edit);
        return edit;
    }

    private void showAssigneeSheet() {
        ArrayList<String> labels = new ArrayList<>();
        ArrayList<String> ids = new ArrayList<>();
        labels.add("담당자 없음");
        ids.add("");
        for (JSONObject member : members) {
            labels.add(member.optString("email", member.optString("id")) + " · " + member.optString("role", ""));
            ids.add(member.optString("id", ""));
        }
        choose("담당자", labels.toArray(new String[0]), value -> {
            int index = labels.indexOf(value);
            for (Map.Entry<String, EditText> entry : customerEdits.entrySet()) tryPut(current, entry.getKey(), entry.getValue().getText().toString());
            tryPut(current, "assignee_id", index <= 0 ? JSONObject.NULL : ids.get(index));
            showCustomerEditor();
        });
    }

    private void saveCustomer(Button button) {
        hideKeyboard();
        JSONObject payload = new JSONObject();
        try {
            payload.put("version", current.optInt("version", 0));
            payload.put("name", editValue("name"));
            payload.put("phone", editValue("phone"));
            payload.put("email", editValue("email"));
            payload.put("region", editValue("region"));
            payload.put("budget", parseMoney(editValue("budget")));
            payload.put("status", editValue("status"));
            for (String key : new String[]{"address_detail","space_type","space_size","schedule","branch","referral","detail","memo"}) payload.put(key, editValue(key));
            Object assignee = current.opt("assignee_id");
            payload.put("assignee_id", assignee == null || JSONObject.NULL.equals(assignee) || String.valueOf(assignee).isEmpty() ? JSONObject.NULL : assignee);
        } catch (Exception error) {
            toast("입력값을 확인하세요. 예산은 숫자로 입력해야 합니다.");
            return;
        }
        submit(button, "PATCH", "/api/mobile/customers/" + Uri.encode(current.optString("id", "")), payload, "고객 정보를 저장했습니다.", true);
    }

    private void showAppointmentSheet(String kind) {
        base();addHeader();LinearLayout box=root;
        String title = "visit".equals(kind) ? "상담 예약" : "실측 예약";
        box.addView(text("visit".equals(kind)?"상담 예약":"실측 일정 선택", 23, true));box.addView(fidelityCaption(current.optString("name")));box.addView(label("visit".equals(kind)?"상담 일시 · KST":"실측 일시 · KST"));
        TextView starts = body("일시를 선택하세요.");

        final String[] startsAt = {""};
        Button pickTime = choiceButton(starts.getText().toString());
        pickTime.setCompoundDrawablesRelativeWithIntrinsicBounds(R.drawable.nav_calendar,0,R.drawable.control_chevron,0);
        box.addView(pickTime);
        pickTime.setOnClickListener(v -> pickDateTime(value -> {
            startsAt[0] = value;
            starts.setText(formatIsoForDisplay(value));
            pickTime.setText(formatIsoForDisplay(value));
        }));
        EditText location = input("visit".equals(kind)?"상담 지점":"실측 주소", InputType.TYPE_CLASS_TEXT, false);
        location.setSingleLine(true);
        box.addView(label("visit".equals(kind)?"상담 지점":"실측 주소"));
        box.addView(location);
        if ("visit".equals(kind)) location.setText(current.optString("branch", "판교점"));
        else location.setText(current.optString("address",current.optString("region")));
        final String[] assigneeId={current.optString("assignee_id","")};
        box.addView(label("담당자"));Button owner=choiceButton(memberLabel(current));box.addView(owner);
        owner.setOnClickListener(v->{ArrayList<String> labels=new ArrayList<>();ArrayList<String> ids=new ArrayList<>();for(JSONObject member:members){labels.add(member.optString("email"));ids.add(member.optString("id"));}if(labels.isEmpty()){toast("등록된 담당자가 없습니다.");return;}choose("담당자",labels.toArray(new String[0]),value->{assigneeId[0]=ids.get(labels.indexOf(value));owner.setText(value);});});
        box.addView(label("일정 메모"));EditText memo=input("주차, 준비사항, 전달할 내용을 적어주세요.",InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_MULTI_LINE,true);box.addView(memo);
        LinearLayout reminder=fidelityColumn();reminder.setPadding(dp(12),dp(10),dp(12),dp(10));reminder.setBackground(round(Color.WHITE,6,LINE));reminder.addView(text("담당자 앱 리마인드",13,true));reminder.addView(fidelityCaption("1일 전 · 2시간 전"));box.addView(reminder,blockParams());
        box.addView(note("visit".equals(kind)?"시간이 지나도 상담 완료로 자동 처리하지 않습니다.":"변경·취소 시 기존 알림을 취소하고 새 일정 알림을 다시 계산합니다."),blockParams());
        Button save = primary(title + " 저장");
        box.addView(save);
        save.setOnClickListener(v -> {
            if (startsAt[0].isEmpty() || location.getText().toString().trim().isEmpty() || assigneeId[0].trim().isEmpty()) {
                toast("일시, 장소, 담당자를 모두 입력하세요.");
                return;
            }
            JSONObject payload = baseRecordPayload();
            tryPut(payload, "assignee_id", assigneeId[0]);tryPut(payload,"memo",memo.getText().toString().trim());
            tryPut(payload, "kind", kind);
            tryPut(payload, "starts_at", startsAt[0]);
            tryPut(payload, "location", location.getText().toString().trim());
            String place=location.getText().toString().trim();
            String customerAddress=current.optString("address", "").trim();
            if(customerAddress.isEmpty()) customerAddress=current.optString("region", "").trim();
            if(customerAddress.isEmpty()) customerAddress=place;
            tryPut(payload, "address", "visit".equals(kind)?customerAddress:place);
            submit(save, "POST", "/api/mobile/appointments", payload, title + "을 저장했습니다.", false, null);
        });
    }

    private void showConsultationSheet() {
        base();addHeader();LinearLayout box=root;
        box.addView(text("상담결과 작성",22,true));
        box.addView(body(current.optString("name")));
        box.addView(label("상담결과"));
        Button outcome=choiceButton("실측 진행 희망");box.addView(outcome);
        outcome.setOnClickListener(v -> choose("상담결과",new String[]{"실측 진행 희망","추가 상담 필요","견적 검토","보류","미진행"},outcome::setText));
        box.addView(label("상담 내용"));
        EditText result=input("요구사항, 예산 협의, 결정사항을 기록하세요.",InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_MULTI_LINE,true);box.addView(result);
        box.addView(label("다음 행동"));
        EditText next=input("예: 실측 일정 확인 후 연락",InputType.TYPE_CLASS_TEXT,false);box.addView(next);
        android.widget.CheckBox complete=new android.widget.CheckBox(this);complete.setText("해당 상담이 완료되었음을 확인합니다.");complete.setTextColor(INK);complete.setMinHeight(dp(48));box.addView(complete);
        box.addView(note("저장하면 고객카드와 웹에서 같은 상담 결과를 조회하며, 기존 결과는 이력으로 남습니다."),blockParams());
        Button save=primary("상담결과 저장");box.addView(save);
        save.setOnClickListener(v -> {
            String value=result.getText().toString().trim();
            if(value.isEmpty()){result.setError("상담 내용을 입력하세요");return;}
            if(!complete.isChecked()){toast("상담 완료 여부를 확인하세요.");return;}
            JSONObject payload=baseRecordPayload();
            tryPut(payload,"result",value);
            tryPut(payload,"outcome",outcome.getText().toString());
            tryPut(payload,"next_action",next.getText().toString().trim());
            tryPut(payload,"complete",true);
            submit(save,"POST","/api/mobile/consultations",payload,"상담 결과를 저장했습니다.",false,null);
        });
    }

    private void showContractSheet() {
        base();addHeader();LinearLayout box=root;
        box.addView(text("계약 전환", 22, true));
        box.addView(fidelityCaption(current.optString("name")));
        final boolean completed = !current.optString("contract_at", "").trim().isEmpty();
        box.addView(label("계약 일시"));
        final String[] signedAt = {current.isNull("contract_at") ? "" : current.optString("contract_at", "")};
        TextView signedAtLabel = body(signedAt[0].isEmpty() ? "계약 일시를 선택하세요." : formatIsoForDisplay(signedAt[0]));

        Button pickSignedAt = choiceButton(signedAtLabel.getText().toString());
        pickSignedAt.setCompoundDrawablesRelativeWithIntrinsicBounds(R.drawable.nav_calendar,0,R.drawable.control_chevron,0);
        box.addView(pickSignedAt);
        pickSignedAt.setOnClickListener(v -> pickDateTime(value -> {
            signedAt[0] = value;
            signedAtLabel.setText(formatIsoForDisplay(value));
            pickSignedAt.setText(formatIsoForDisplay(value));
        }));
        EditText contractOwner=input("계약 담당자",InputType.TYPE_CLASS_TEXT,false);
        contractOwner.setText(current.optString("contract_owner",memberLabel(current)));
        box.addView(label("계약 담당자"));box.addView(contractOwner);
        EditText amount = input("계약 금액", InputType.TYPE_CLASS_NUMBER, false);
        amount.setSingleLine(true);
        if (!current.isNull("contract_amount")) amount.setText(current.optString("contract_amount", ""));
        box.addView(label("계약 금액 · 원"));
        box.addView(amount);
        TextView contractNote=fidelityCaption("기존 웹과 같은 계약 일시·담당자·금액을 사용합니다. 저장하면 고객 상태와 계약 지표에 반영됩니다.");
        contractNote.setPadding(dp(12),dp(12),dp(12),dp(12));
        contractNote.setBackground(round(Color.rgb(240,239,235),4,Color.TRANSPARENT));
        box.addView(contractNote,blockParams());
        Button save = primary(completed ? "계약 정보 수정" : "계약완료로 전환");
        box.addView(save);
        save.setOnClickListener(v -> {
            if (amount.getText().toString().trim().isEmpty() || signedAt[0].isEmpty()) {
                toast("금액과 서명일을 입력하세요.");
                return;
            }
            JSONObject payload = baseRecordPayload();
            try {
                long contractAmount = parseMoney(amount.getText().toString().trim());
                if (contractAmount < 1) { amount.setError("1원 이상 입력하세요"); return; }
                if (contractOwner.getText().toString().trim().isEmpty()) { contractOwner.setError("계약 담당자를 입력하세요"); return; }
                payload.put("amount", contractAmount);
            } catch (Exception error) {
                amount.setError("숫자로 입력하세요");
                return;
            }
            tryPut(payload, "status", "signed");
            tryPut(payload, "signed_at", signedAt[0]);
            tryPut(payload, "contract_owner", contractOwner.getText().toString().trim());
            submit(save, "POST", "/api/mobile/contracts", payload, "계약을 저장했습니다.", false, null);
        });
        if (completed) {
            Button uncontract = secondary("계약완료 해제");
            uncontract.setTextColor(Color.rgb(160,68,59));
            box.addView(uncontract);
            uncontract.setOnClickListener(v -> {
                JSONObject payload = baseRecordPayload();
                tryPut(payload, "amount", current.optLong("contract_amount",0));
                tryPut(payload, "status", "cancelled");
                tryPut(payload, "signed_at", current.optString("contract_at"));
                tryPut(payload, "contract_owner", current.optString("contract_owner"));
                submit(uncontract, "POST", "/api/mobile/contracts", payload, "계약완료를 해제했습니다.", false, null);
            });
        }
        box.addView(fidelityCaption("계약금액은 매출 인식이나 실제 입금액과 구분합니다."),blockParams());
    }

    private JSONObject baseRecordPayload() {
        JSONObject payload = new JSONObject();
        tryPut(payload, "customer_id", current.optString("id", ""));
        tryPut(payload, "version", current.optInt("version", 0));
        return payload;
    }

    private void submit(Button button, String method, String path, JSONObject payload, String success, boolean keepOnSuccess) {
        submit(button, method, path, payload, success, keepOnSuccess, null);
    }

    private void submit(Button button, String method, String path, JSONObject payload, String success, boolean keepOnSuccess, Dialog dialog) {
        button.setEnabled(false);
        final int generation = requestGeneration;
        api.call(method, path, payload, (body, status, error) -> runOnUiThread(() -> {
            if (!sameGeneration(generation)) return;
            button.setEnabled(true);
            if (handleAuthFailure(status)) return;
            if (status == 409) {
                showConflict();
            } else if (status >= 200 && status < 300) {
                toast(success);
                if (dialog != null) dialog.dismiss();
                if (path.equals("/api/mobile/members") || path.startsWith("/api/mobile/members/")) {
                    showMembers();
                } else if (path.equals("/api/mobile/platform/tenants") || path.startsWith("/api/mobile/platform/tenants/")) {
                    showPlatformTenants();
                } else if (keepOnSuccess) {
                    showDetail(current.optString("id", ""));
                } else {
                    refreshCurrentDetail();
                }
            } else {
                toast(message(body, error, "저장하지 못했습니다."));
            }
        }));
    }

    private void refreshCurrentDetail() {
        String id = current == null ? "" : current.optString("id", "");
        if (!id.isEmpty()) showDetail(id);
    }

    private void showConflict() {
        Dialog dialog = sheet();
        LinearLayout box = sheetBox();
        box.addView(text("최신 정보 필요", 22, true));
        box.addView(body("다른 변경이 먼저 저장되었습니다. 입력 내용은 현재 화면에 남아 있습니다. 최신 정보를 다시 불러온 뒤 다시 입력하세요."));
        Button reload = primary("최신 정보 다시 불러오기");
        box.addView(reload);
        reload.setOnClickListener(v -> {
            dialog.dismiss();
            refreshCurrentDetail();
        });
        setSheetContent(dialog, box);
        dialog.show();
        sizeSheet(dialog);
    }

    private void logout() {
        if (loggingOut) return;
        loggingOut = true;
        final int generation = requestGeneration;
        PushManager.unregisterCurrentDevice(this, api);
        api.call("POST", "/api/mobile/auth/logout", null, (body, status, error) -> runOnUiThread(() -> {
            if (!sameGeneration(generation)) return;
            loggingOut = false;
            if (status >= 200 && status < 300 || status == 401 || status == 403) {
                clearSessionAndShowLogin("로그아웃했습니다.");
            } else {
                toast(message(body, error, "로그아웃 요청에 실패했습니다. 다시 시도하세요."));
            }
        }));
    }

    private boolean isOnboardingPending() {
        JSONObject tenant=me==null?null:me.optJSONObject("tenant");
        return tenant!=null&&"pending".equals(tenant.optString("onboarding_status"));
    }

    private void showOnboardingPending() {
        base();addLogo(R.drawable.polarad_logo,48);
        root.addView(text("업무공간 연결을 확인하고 있습니다",23,true));
        root.addView(body(tenantName()));
        root.addView(body("이메일 인증을 완료했습니다. 홈페이지·광고 계정·알림 연결 확인 후 이용할 수 있습니다."));
        root.addView(body(NotificationSettings.osPermissionEnabled(this)?"휴대폰 알림 권한이 허용되어 있습니다.":"알림 수신 검증을 위해 휴대폰 알림 권한을 허용해 주세요."));
        menu("연결 상태 다시 확인",()->fetchMe(false));
        menu("로그아웃",this::logout);
    }

    private void showSuspended() {
        String workspace = tenantName();
        try { store.clear(); } catch(Exception ignored) { }
        api.setToken(null);me=null;current=null;members.clear();pendingCsv=null;customerQuery="";customerStatus="";customerSource="";
        base();addLogo(R.drawable.polarad_logo,48);
        root.addView(text("서비스 이용이 중지되었습니다",26,true));
        root.addView(fidelityCaption(workspace + " 업무공간"));
        ImageView shield = new ImageView(this);
        shield.setImageResource(R.drawable.nav_shield);
        shield.setColorFilter(Color.rgb(123,99,64));
        shield.setPadding(dp(20),dp(20),dp(20),dp(20));
        shield.setBackground(round(Color.rgb(237,229,215),34,Color.TRANSPARENT));
        LinearLayout.LayoutParams shieldParams = new LinearLayout.LayoutParams(dp(68),dp(68));
        shieldParams.gravity=Gravity.CENTER_HORIZONTAL;shieldParams.topMargin=dp(22);shieldParams.bottomMargin=dp(28);
        root.addView(shield,shieldParams);
        LinearLayout notice=fidelityColumn();notice.setPadding(dp(16),dp(16),dp(16),dp(16));notice.setBackground(round(Color.WHITE,6,LINE));
        notice.addView(text("현재 업무공간에 접근할 수 없습니다.",17,true));
        notice.addView(body("이용 상태 확인이 필요합니다. 폴라애드 담당자에게 문의해 주세요."));
        root.addView(notice,blockParams());
        TextView impact=note("접수·일정·통계 조회와 알림이 중지됩니다. 계정 및 데이터 삭제와는 별개입니다.");
        root.addView(impact,blockParams());
        Button login=secondary("로그인 화면으로");root.addView(login);login.setOnClickListener(v->showLogin());
    }

    private void clearSessionAndShowLogin(String notice) {
        pendingCsv = null;
        customerQuery = "";
        customerStatus = "";
        customerSource = "";
        try {
            store.clear();
        } catch (Exception ignored) {
        }
        api.setToken(null);
        me = null;
        current = null;
        members.clear();
        showLogin();
        if (notice != null && !notice.isEmpty()) toast(notice);
    }

    private boolean handleAuthFailure(int status) {
        if (previewMode && (status == 401 || status == 403)) {
            restorePreviewAdmin();
            toast("업체 화면 접근이 만료되어 관리자 화면으로 돌아왔습니다.");
            return true;
        }
        if (status == 401) {
            if (supportMode) {
                renewSupportAndReload();
                return true;
            }
            clearSessionAndShowLogin("권한이 만료되어 다시 로그인해야 합니다.");
            return true;
        }
        return false;
    }

    private void renewSupportAndReload() {
        if (!supportMode || supportRenewalInFlight) return;
        long now = System.currentTimeMillis();
        if (supportRenewalLastAttemptAt > 0L && now - supportRenewalLastAttemptAt < 60_000L) {
            restoreAdminSession();
            toast("지원 접근이 만료되어 관리자 화면으로 돌아왔습니다.");
            return;
        }
        String platformToken = adminToken;
        String expiredSupportToken = supportToken;
        if (platformToken == null || platformToken.trim().isEmpty()
                || expiredSupportToken == null || expiredSupportToken.trim().isEmpty()) {
            restoreAdminSession();
            toast("지원 접근이 만료되어 관리자 화면으로 돌아왔습니다.");
            return;
        }
        final String expectedPlatformToken = platformToken;
        final String expectedSupportToken = expiredSupportToken;
        final String expectedTenantId = supportTenantId;
        supportRenewalLastAttemptAt = now;
        supportRenewalInFlight = true;
        JSONObject payload = new JSONObject();
        tryPut(payload, "support_token", expiredSupportToken);
        supportRenewalApi.setToken(platformToken);
        supportRenewalApi.callFresh("POST", "/api/mobile/support/renew", payload,
            (body, status, error) -> runOnUiThread(() -> {
                boolean sameSupportSession = supportMode
                        && expectedPlatformToken.equals(adminToken)
                        && expectedSupportToken.equals(supportToken)
                        && expectedTenantId.equals(supportTenantId);
                if (!sameSupportSession) return;
                supportRenewalInFlight = false;
                if (status >= 200 && status < 300) {
                    String nextToken = body.optString("token", "").trim();
                    if (!nextToken.isEmpty()) {
                        supportToken = nextToken;
                        JSONObject nextSession = body.optJSONObject("support_session");
                        supportExpiresAt = nextSession == null ? body.optString("expires_at", "") : nextSession.optString("expires_at", body.optString("expires_at", ""));
                        api.setToken(nextToken);
                        api.invalidateAll();
                        reloadSupportScreen();
                        return;
                    }
                }
                supportRenewalInFlight = false;
                restoreAdminSession();
                toast("지원 접근이 만료되어 관리자 화면으로 돌아왔습니다.");
            }));
    }

    private void reloadSupportScreen() {
        if (!supportMode) return;
        if (customerDetailActive && current != null && !current.optString("id", "").isEmpty()) {
            showDetail(current.optString("id", ""));
            return;
        }
        if ("customers".equals(activeTab)) { showCustomers(customerQuery); return; }
        if ("calendar".equals(activeTab)) { showSchedule(); return; }
        if ("analytics".equals(activeTab)) { showAnalytics(analyticsPage); return; }
        if ("more".equals(activeTab)) { showMore(); return; }
        showHome();
    }

    private boolean supportExpiresSoon() {
        if (supportExpiresAt == null || supportExpiresAt.trim().isEmpty()) return false;
        try {
            return OffsetDateTime.parse(supportExpiresAt).toInstant().toEpochMilli() - System.currentTimeMillis() <= 60_000L;
        } catch (DateTimeParseException ignored) {
            return false;
        }
    }

    private void addHeader() {
        headerHost.removeAllViews();
        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(Color.WHITE);
        bar.setPadding(dp(18), dp(10), dp(18), dp(10));
        ImageView image = new ImageView(this);
        image.setImageResource(isDayoneTenant() ? R.drawable.dayone_logo : R.drawable.polarad_logo);
        bar.addView(image, new LinearLayout.LayoutParams(dp(30), dp(30)));
        TextView title = text(tenantName(), 13, true);
        title.setPadding(dp(9), 0, dp(8), 0);
        bar.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        Button bell = textButton("알림");
        bell.setTextSize(11);
        bell.setOnClickListener(v -> showNotifications());
        bar.addView(bell, new LinearLayout.LayoutParams(dp(48), dp(44)));
        headerHost.addView(bar);
        if (supportMode) {
            LinearLayout supportBar = new LinearLayout(this);
            supportBar.setGravity(Gravity.CENTER_VERTICAL);
            supportBar.addView(text(supportAdminMode ? "관리자 지원 접근" : "읽기 전용", 12, true), new LinearLayout.LayoutParams(0, -2, 1));
            Button exit = secondary("지원 접근 종료");
            exit.setOnClickListener(v -> endSupportSession(exit));
            supportBar.addView(exit);
            headerHost.addView(supportBar);
        }
        View line = new View(this); line.setBackgroundColor(LINE);
        headerHost.addView(line, new LinearLayout.LayoutParams(-1, dp(1)));
    }

    private void addNavButton(LinearLayout nav, String title, View.OnClickListener listener) {
        Button button = secondary(title);
        button.setTextSize(12);
        button.setMinHeight(dp(44));
        button.setPadding(dp(4), 0, dp(4), 0);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(44), 1);
        params.setMargins(dp(2), dp(2), dp(2), dp(2));
        nav.addView(button, params);
        button.setOnClickListener(listener);
    }

    private void addHistory(String key) {
        JSONArray rows = current.optJSONArray(key);
        if (rows == null || rows.length() == 0) {
            root.addView(body("기록이 없습니다."));
            return;
        }
        for (int i = 0; i < rows.length(); i++) {
            JSONObject item = rows.optJSONObject(i);
            if (item == null) continue;
            if ("appointments".equals(key) && isOwner()) {
                LinearLayout card = new LinearLayout(this);
                card.setOrientation(LinearLayout.VERTICAL);
                card.setPadding(dp(12), dp(10), dp(12), dp(10));
                card.setBackground(round(PANEL, 8, LINE));
                card.addView(body(historyLine(key, item)));
                if (!"cancelled".equals(item.optString("status", ""))) {
                    Button edit = secondary("예약 변경");
                    Button cancel = secondary("예약 취소");
                    card.addView(edit);
                    card.addView(cancel);
                    edit.setOnClickListener(v -> showAppointmentEditSheet(item));
                    cancel.setOnClickListener(v -> cancelAppointment(item, cancel));
                }
                root.addView(card, blockParams());
            } else {
                TextView card = body(historyLine(key, item));
                card.setBackground(round(PANEL, 8, LINE));
                card.setPadding(dp(12), dp(10), dp(12), dp(10));
                root.addView(card, blockParams());
            }
        }
    }

    private void showAppointmentEditSheet(JSONObject item) {
        Dialog dialog = sheet();
        LinearLayout box = sheetBox();
        box.addView(text("예약 변경", 22, true));
        final String[] startsAt = {item.optString("starts_at", "")};
        TextView date = body(formatIsoForDisplay(startsAt[0]));
        box.addView(label("일시 · KST"));
        box.addView(date);
        Button pick = choiceButton("날짜와 시간 선택");
        box.addView(pick);
        pick.setOnClickListener(v -> pickDateTime(value -> { startsAt[0] = value; date.setText(formatIsoForDisplay(value)); }));
        EditText location = input("장소", InputType.TYPE_CLASS_TEXT, false);
        location.setText(item.optString("location", ""));
        box.addView(label("visit".equals(item.optString("kind"))?"상담 지점":"실측 장소"));
        box.addView(location);
        EditText address = input("주소", InputType.TYPE_CLASS_TEXT, false);
        address.setText(item.optString("address", ""));
        box.addView(label("주소"));
        box.addView(address);
        final String[] assigneeId={item.isNull("assignee_id")?"":item.optString("assignee_id","")};
        box.addView(label("담당자"));Button owner=choiceButton(memberLabel(assigneeId[0]));box.addView(owner);
        owner.setOnClickListener(v->{ArrayList<String> labels=new ArrayList<>();ArrayList<String> ids=new ArrayList<>();for(JSONObject member:members){labels.add(member.optString("email"));ids.add(member.optString("id"));}if(labels.isEmpty()){toast("등록된 담당자가 없습니다.");return;}choose("담당자",labels.toArray(new String[0]),value->{assigneeId[0]=ids.get(labels.indexOf(value));owner.setText(value);});});
        box.addView(label("일정 메모"));EditText memo=input("주차, 준비사항, 전달할 내용을 적어주세요.",InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_MULTI_LINE,true);memo.setText(item.optString("memo",""));box.addView(memo);
        Button save = primary("예약 변경 저장");
        box.addView(save);
        save.setOnClickListener(v -> {
            if (startsAt[0].isEmpty() || location.getText().toString().trim().isEmpty() || address.getText().toString().trim().isEmpty()) {
                toast("일시, 장소, 주소를 입력하세요.");
                return;
            }
            JSONObject payload = new JSONObject();
            tryPut(payload, "version", current.optInt("version", 0));
            tryPut(payload, "starts_at", startsAt[0]);
            tryPut(payload, "location", location.getText().toString().trim());
            tryPut(payload, "address", address.getText().toString().trim());
            tryPut(payload, "status", "scheduled");
            tryPut(payload,"assignee_id",assigneeId[0].isEmpty()?JSONObject.NULL:assigneeId[0]);
            tryPut(payload,"memo",memo.getText().toString().trim());
            submit(save, "PATCH", "/api/mobile/appointments/" + Uri.encode(item.optString("id", "")), payload, "예약을 변경했습니다.", false, dialog);
        });
        setSheetContent(dialog, box);
        dialog.show();
        sizeSheet(dialog);
    }

    private void cancelAppointment(JSONObject item, Button button) {
        JSONObject payload = new JSONObject();
        tryPut(payload, "version", current.optInt("version", 0));
        tryPut(payload, "status", "cancelled");
        submit(button, "PATCH", "/api/mobile/appointments/" + Uri.encode(item.optString("id", "")), payload, "예약을 취소했습니다.", false, null);
    }

    private String historyLine(String key, JSONObject item) {
        if ("appointments".equals(key)) {
            String kind = "visit".equals(item.optString("kind")) ? "방문" : "실측";
            return kind + " · " + formatIsoForDisplay(item.optString("starts_at", "")) + "\n" + item.optString("location", "") + "\n" + item.optString("address", "");
        }
        if ("consultations".equals(key)) {
            return formatIsoForDisplay(item.optString("created_at", "")) + " · " + item.optString("author_name", item.optString("author_email", "")) + "\n" + (item.isNull("completed_at")?"완료 확인 없음":"상담 완료") + " · " + item.optString("outcome", "") + "\n" + item.optString("result", "") + "\n다음 행동: " + item.optString("next_action", "");
        }
        return item.optString("status", "") + " · " + money(item.optLong("amount", 0)) + "\n" + formatIsoForDisplay(item.optString("signed_at", ""));
    }

    private void choose(String title, String[] options, ChoiceCallback callback) {
        Dialog dialog = sheet();
        LinearLayout box = sheetBox();
        box.addView(text(title + " 선택", 22, true));
        for (String option : options) {
            Button b = secondary(option);
            box.addView(b);
            b.setOnClickListener(v -> {
                callback.selected(option);
                dialog.dismiss();
            });
        }
        setSheetContent(dialog, box);
        dialog.show();
        sizeSheet(dialog);
    }

    private void pickDateTime(DateTimeCallback callback) {
        Calendar cal = Calendar.getInstance(TimeZone.getTimeZone("Asia/Seoul"));
        DatePickerDialog dateDialog = new DatePickerDialog(this, (DatePicker view, int year, int month, int day) -> {
            TimePickerDialog timeDialog = new TimePickerDialog(this, (TimePicker timeView, int hour, int minute) -> {
                String value = String.format(Locale.US, "%04d-%02d-%02dT%02d:%02d:00+09:00", year, month + 1, day, hour, minute);
                callback.selected(value);
            }, cal.get(Calendar.HOUR_OF_DAY), cal.get(Calendar.MINUTE), true);
            timeDialog.setOnShowListener(x -> sizeSheet(timeDialog));
            timeDialog.show();
            sizeSheet(timeDialog);
        }, cal.get(Calendar.YEAR), cal.get(Calendar.MONTH), cal.get(Calendar.DAY_OF_MONTH));
        dateDialog.setOnShowListener(x -> sizeSheet(dateDialog));
        dateDialog.show();
        sizeSheet(dateDialog);
    }

    private void pickDate(DateCallback callback) {
        Calendar cal = Calendar.getInstance(TimeZone.getTimeZone("Asia/Seoul"));
        DatePickerDialog dateDialog = new DatePickerDialog(this, (DatePicker view, int year, int month, int day) -> {
            callback.selected(String.format(Locale.US, "%04d-%02d-%02d", year, month + 1, day));
        }, cal.get(Calendar.YEAR), cal.get(Calendar.MONTH), cal.get(Calendar.DAY_OF_MONTH));
        dateDialog.setOnShowListener(x -> sizeSheet(dateDialog));
        dateDialog.show();
        sizeSheet(dateDialog);
    }

    private Dialog sheet() {
        Dialog dialog = new Dialog(this);
        dialog.setOnShowListener(x -> sizeSheet(dialog));
        return dialog;
    }

    private LinearLayout sheetBox() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(20), dp(16), dp(20), dp(24));
        box.setBackground(round(PAPER, 18, LINE));
        return box;
    }

    private void setSheetContent(Dialog dialog, LinearLayout box) {
        ScrollView scroll = new ScrollView(this);
        scroll.addView(box, new ScrollView.LayoutParams(-1, -2));
        dialog.setContentView(scroll);
    }

    private void sizeSheet(Dialog dialog) {
        Window window = dialog.getWindow();
        if (window == null) return;
        window.setBackgroundDrawableResource(android.R.color.transparent);
        window.setGravity(Gravity.BOTTOM);
        window.setLayout(-1, -2);
    }

    private TextView text(String value, int size, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextColor(INK);
        view.setTextSize(size);
        view.setLineSpacing(0, 1.08f);
        view.setPadding(0, dp(6), 0, dp(6));
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }

    private TextView body(String value) {
        TextView view = text(value, 15, false);
        view.setTextColor(MUTED);
        return view;
    }

    private TextView label(String value) {
        TextView view = text(value, 13, true);
        view.setTextColor(MUTED);
        return view;
    }

    private EditText input(String hint, int type, boolean multiline) {
        EditText edit = new EditText(this);
        edit.setHint(hint);
        edit.setTextColor(INK);
        edit.setHintTextColor(MUTED);
        edit.setTextSize(16);
        edit.setInputType(type);
        edit.setMinHeight(dp(multiline ? 112 : 56));
        edit.setMinimumHeight(dp(multiline ? 112 : 56));
        edit.setPadding(dp(12), dp(multiline ? 14 : 12), dp(12), dp(multiline ? 14 : 12));
        edit.setBackground(round(Color.rgb(255,254,250), 10, Color.rgb(216,209,197)));
        if (multiline) {
            edit.setGravity(Gravity.TOP | Gravity.START);
            edit.setMinLines(4);
        }
        edit.setLayoutParams(blockParams());
        return edit;
    }

    private TextView note(String value) {
        TextView view=fidelityCaption(value);
        view.setPadding(dp(12),dp(12),dp(12),dp(12));
        view.setBackground(round(Color.rgb(240,239,235),4,Color.TRANSPARENT));
        return view;
    }

    private Button choiceButton(String value) {
        Button view=secondary(value);
        view.setGravity(Gravity.START|Gravity.CENTER_VERTICAL);
        view.setPadding(dp(12),dp(10),dp(12),dp(10));
        view.setCompoundDrawablesRelativeWithIntrinsicBounds(0,0,R.drawable.control_chevron,0);
        view.setCompoundDrawablePadding(dp(10));
        return view;
    }

    private Button primary(String value) {
        return button(value, ACTION, Color.WHITE);
    }

    private Button secondary(String value) {
        Button control = button(value, Color.WHITE, INK);
        control.setBackground(round(Color.WHITE, 6, LINE));
        return control;
    }

    private Button textButton(String value) {
        Button b = new Button(this);
        b.setText(value);
        b.setTextColor(BLUE);
        b.setTextSize(14);
        b.setAllCaps(false);
        b.setStateListAnimator(null);
        b.setElevation(0);
        b.setMinHeight(dp(44));
        b.setPadding(dp(8), dp(4), dp(8), dp(4));
        b.setBackgroundColor(Color.TRANSPARENT);
        b.setLayoutParams(blockParams());
        return b;
    }

    private Button button(String value, int bg, int fg) {
        Button b = new Button(this);
        b.setText(value);
        b.setTextColor(fg);
        b.setTextSize(14);
        b.setAllCaps(false);
        b.setStateListAnimator(null);
        b.setElevation(0);
        b.setMinHeight(dp(48));
        b.setPadding(dp(12), 0, dp(12), 0);
        b.setBackground(round(bg, 6, Color.TRANSPARENT));
        b.setLayoutParams(blockParams());
        return b;
    }

    private void addSection(String title) {
        TextView section = text(title, 17, true);
        section.setPadding(0, dp(18), 0, dp(6));
        root.addView(section);
    }

    private void addReadOnly(String title, String value) {
        root.addView(label(title));
        TextView view = body(value == null || value.isEmpty() ? "미지정" : value);
        view.setBackground(round(PANEL, 8, LINE));
        view.setPadding(dp(12), dp(10), dp(12), dp(10));
        root.addView(view, blockParams());
    }

    private void addLogo(int resId, int size) {
        ImageView logo = new ImageView(this);
        logo.setImageResource(resId);
        logo.setAdjustViewBounds(true);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(dp(size), dp(size));
        params.setMargins(0, dp(8), 0, dp(12));
        logo.setLayoutParams(params);
        root.addView(logo);
    }

    private GradientDrawable round(int color, int radius, int stroke) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(radius));
        if (stroke != Color.TRANSPARENT) drawable.setStroke(dp(1), stroke);
        return drawable;
    }

    private LinearLayout.LayoutParams blockParams() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.setMargins(0, dp(6), 0, dp(6));
        return params;
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    private boolean sameGeneration(int generation) {
        return generation == requestGeneration;
    }

    private boolean isOwner() {
        return me != null && "owner".equals(me.optString("role", ""));
    }

    private boolean isPlatform() {
        JSONObject tenant = me == null ? null : me.optJSONObject("tenant");
        return isOwner() && tenant != null && "platform".equals(tenant.optString("id", ""));
    }

    private String tenantName() {
        JSONObject tenant = me == null ? null : me.optJSONObject("tenant");
        return tenant == null ? "CRM" : tenant.optString("name", "CRM");
    }

    private String brandingLogo() {
        JSONObject branding = me == null ? null : me.optJSONObject("branding");
        return branding == null ? "" : branding.optString("logo", "");
    }

    private int loadingLogoResource() {
        if (isPlatform()) return R.drawable.polarad_logo;
        if (isDayoneTenant()) return R.drawable.dayone_logo;
        return 0;
    }

    private boolean isDayoneTenant() {
        JSONObject tenant = me == null ? null : me.optJSONObject("tenant");
        JSONObject branding = me == null ? null : me.optJSONObject("branding");
        return (tenant != null && "day1design".equals(tenant.optString("id", "")))
            || (branding != null && "day1design".equals(branding.optString("brand", "")));
    }

    private String memberLabel(String id) {
        if (id == null || id.isEmpty() || "null".equals(id)) return "미지정";
        for (JSONObject member : members) {
            if (id.equals(member.optString("id", ""))) return member.optString("name", member.optString("email", "확인 필요"));
        }
        return "확인 필요";
    }

    private String memberLabel(JSONObject customer) {
        if (customer == null) return "미지정";
        String name = customer.optString("assignee_name", "").trim();
        if (!name.isEmpty()) return name;
        String email = customer.optString("assignee_email", "").trim();
        return email.isEmpty() ? (customer.isNull("assignee_id") || customer.optString("assignee_id").isEmpty() ? "미지정" : "확인 필요") : email;
    }

    private String roleLabel(String role) {
        if ("owner".equals(role)) return "대표";
        if ("staff".equals(role)) return "직원";
        return role.isEmpty() ? "권한 미지정" : role;
    }

    private String editValue(String key) {
        EditText edit = customerEdits.get(key);
        return edit == null ? "" : edit.getText().toString().trim();
    }

    private long parseMoney(String raw) {
        if (raw == null || raw.trim().isEmpty()) return 0L;
        return Long.parseLong(raw.replace(",", "").trim());
    }

    private String money(long amount) {
        return new DecimalFormat("#,###").format(amount) + "원";
    }

    private String formatIsoForDisplay(String iso) {
        if (iso == null || iso.isEmpty()) return "일시 미입력";
        try {
            OffsetDateTime value = OffsetDateTime.parse(iso);
            return value.atZoneSameInstant(ZoneId.of("Asia/Seoul")).format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm 'KST'", Locale.KOREA));
        } catch (Exception ignored) {
            return iso.replace("T", " ").replace("+09:00", " KST").replace("+00:00", " UTC");
        }
    }

    private String join(ArrayList<String> parts, String sep) {
        StringBuilder builder = new StringBuilder();
        for (int i = 0; i < parts.size(); i++) {
            if (i > 0) builder.append(sep);
            builder.append(parts.get(i));
        }
        return builder.toString();
    }

    private void tryPut(JSONObject object, String key, Object value) {
        try {
            object.put(key, value);
        } catch (JSONException ignored) {
        }
    }

    private String message(JSONObject body, String error, String fallback) {
        if (body != null) {
            String value = body.optString("message", body.optString("error", ""));
            if (!value.isEmpty()) return value;
        }
        return error == null || error.isEmpty() ? fallback : error;
    }

    private String contractStatusLabel(String status) {
        if ("draft".equals(status)) return "초안";
        if ("signed".equals(status)) return "서명 완료";
        if ("cancelled".equals(status)) return "취소";
        return status;
    }

    private void hideKeyboard() {
        View view = getCurrentFocus();
        if (view != null) {
            ((InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(view.getWindowToken(), 0);
        }
    }

    private void toast(String value) {
        Toast.makeText(this, value, Toast.LENGTH_LONG).show();
    }

    private interface ChoiceCallback {
        void selected(String value);
    }

    private interface DateTimeCallback {
        void selected(String value);
    }

    private interface DateCallback {
        void selected(String value);
    }
}
