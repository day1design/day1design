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
import android.view.inputmethod.EditorInfo;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.view.WindowInsets;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.DatePicker;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
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
import java.util.Calendar;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final int INK = Color.rgb(31, 35, 39);
    private static final int MUTED = Color.rgb(102, 100, 94);
    private static final int PAPER = Color.rgb(247, 245, 240);
    private static final int PANEL = Color.rgb(255, 254, 250);
    private static final int LINE = Color.rgb(216, 209, 196);
    private static final int BLUE = Color.rgb(66, 98, 122);
    private static final int TERRA = Color.rgb(184, 102, 78);
    private static final int DISABLED = Color.rgb(154, 149, 140);

    private final ApiClient api = new ApiClient();
    private final ArrayList<JSONObject> members = new ArrayList<>();
    private final Map<String, EditText> customerEdits = new HashMap<>();
    private SecureSessionStore store;
    private LinearLayout root;
    private JSONObject me;
    private JSONObject current;
    private int requestGeneration = 0;
    private boolean loggingOut = false;
    private boolean openNotificationsAfterLogin;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        store = new SecureSessionStore(this);
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
                api.setToken(token);
                fetchMe(true);
            } catch (Exception error) {
                runOnUiThread(this::showLogin);
            }
        }).start();
    }

    private void fetchMe(boolean fromStartup) {
        final int generation = requestGeneration;
        api.call("GET", "/api/mobile/me", null, (body, status, error) -> runOnUiThread(() -> {
            if (!sameGeneration(generation)) return;
            if (status >= 200 && status < 300) {
                me = body;
                PushManager.initialize(this, api, notificationsEnabled());
                PushManager.registerCurrentDevice(this, api, notificationsEnabled());
                if (openNotificationsAfterLogin) {
                    openNotificationsAfterLogin = false;
                    showNotifications();
                } else {
                    showCustomers("");
                }
            } else if (status == 401 || status == 403) {
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
                showNotifications();
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

    private void base() {
        requestGeneration++;
        customerEdits.clear();
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(PAPER);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(20), dp(20), dp(28));
        scroll.setOnApplyWindowInsetsListener((view, insets) -> {
            int top;
            int bottom;
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                top = bars.top;
                bottom = bars.bottom;
            } else {
                top = insets.getSystemWindowInsetTop();
                bottom = insets.getSystemWindowInsetBottom();
            }
            root.setPadding(dp(20), dp(20) + top, dp(20), dp(28) + bottom);
            return insets;
        });
        scroll.addView(root, new ScrollView.LayoutParams(-1, -2));
        setContentView(scroll);
    }

    private void showLoading() {
        base();
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        addLogo(R.drawable.dayone_logo, 64);
        root.addView(text("CRM 연결 중", 24, true));
        root.addView(body("저장된 세션을 확인하고 있습니다."));
    }

    private void showOfflineRetry(String detail) {
        base();
        addLogo(R.drawable.dayone_logo, 64);
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
        base();
        addLogo(R.drawable.polarad_logo, 56);
        root.addView(text("폴라애드", 18, true));
        root.addView(text("이메일로 로그인", 28, true));
        root.addView(body("업무 이메일로 인증번호를 받아 안전하게 로그인합니다."));
        root.addView(label("업무 이메일"));
        EditText email = input("name@company.com", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS, false);
        email.setSingleLine(true);
        email.setMinimumHeight(dp(60));
        email.setPadding(dp(14), dp(12), dp(14), dp(12));
        email.setImeOptions(EditorInfo.IME_ACTION_NEXT);
        root.addView(email);
        root.addView(body("한 번 인증하면 이 기기에서 로그인이 유지됩니다."));
        Button request = primary("인증번호 받기");
        request.setMinimumHeight(dp(56));
        root.addView(request);
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
        addLogo(R.drawable.polarad_logo, 56);
        root.addView(text("인증번호 확인", 28, true));
        root.addView(body(email + "\n메일로 받은 6자리 번호를 입력하세요."));
        root.addView(label("인증번호"));
        EditText code = input("6자리 숫자", InputType.TYPE_CLASS_NUMBER, false);
        code.setSingleLine(true);
        code.setMinimumHeight(dp(60));
        code.setPadding(dp(14), dp(12), dp(14), dp(12));
        code.setImeOptions(EditorInfo.IME_ACTION_DONE);
        root.addView(code);
        Button verify = primary("로그인");
        verify.setMinimumHeight(dp(56));
        root.addView(verify);
        Button back = textButton("이메일 다시 입력");
        root.addView(back);
        back.setOnClickListener(v -> showLogin());
        verify.setOnClickListener(v -> {
            String value = code.getText().toString().trim();
            if (value.isEmpty()) {
                code.setError("인증번호를 입력하세요");
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

    private void showCustomers(String query) {
        base();
        current = null;
        addHeader();
        root.addView(text("고객 접수", 26, true));
        EditText search = input("고객명, 연락처, 지역 검색", InputType.TYPE_CLASS_TEXT, false);
        search.setSingleLine(true);
        search.setText(query);
        root.addView(search);
        Button searchButton = secondary("검색");
        root.addView(searchButton);
        LinearLayout list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        root.addView(list);
        searchButton.setOnClickListener(v -> showCustomers(search.getText().toString().trim()));
        loadCustomersInto(list, query, "", true);
    }

    private void showSchedule() {
        base();
        addHeader();
        root.addView(text("예약 일정", 26, true));
        root.addView(body("방문과 실측 예약을 KST 기준으로 표시합니다."));
        Button back = secondary("고객 목록");
        root.addView(back);
        back.setOnClickListener(v -> showCustomers(""));
        Calendar month = Calendar.getInstance(TimeZone.getTimeZone("Asia/Seoul"));
        String monthValue = String.format(Locale.US, "%04d-%02d", month.get(Calendar.YEAR), month.get(Calendar.MONTH) + 1);
        Button reload = primary(monthValue + " 일정 불러오기");
        root.addView(reload);
        LinearLayout list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        root.addView(list);
        final int generation = requestGeneration;
        reload.setOnClickListener(v -> loadSchedule(list, reload, monthValue, generation));
        loadSchedule(list, reload, monthValue, generation);
    }

    private void loadSchedule(LinearLayout list, Button reload, String month, int generation) {
        reload.setEnabled(false);
        api.call("GET", "/api/mobile/appointments?month=" + Uri.encode(month), null, (body, status, error) -> runOnUiThread(() -> {
            if (!sameGeneration(generation)) return;
            reload.setEnabled(true);
            if (handleAuthFailure(status)) return;
            list.removeAllViews();
            if (status < 200 || status >= 300) {
                list.addView(body(message(body, error, "예약 일정 서비스를 사용할 수 없습니다.")));
                return;
            }
            JSONArray rows = body.optJSONArray("appointments");
            if (rows == null || rows.length() == 0) {
                list.addView(body("선택한 달의 예약이 없습니다."));
                return;
            }
            for (int i = 0; i < rows.length(); i++) {
                JSONObject item = rows.optJSONObject(i);
                if (item == null) continue;
                String kind = "measurement".equals(item.optString("kind")) ? "실측" : "visit".equals(item.optString("kind")) ? "방문" : item.optString("kind", "예약");
                String customer = item.optString("customer_name", "고객명 미지정");
                list.addView(body(kind + " · " + customer + "\n" + formatIsoForDisplay(item.optString("starts_at", "")) + "\n" + item.optString("location", "") + " · " + item.optString("address", "")), blockParams());
            }
        }));
    }

    private void showMembers() {
        base();
        addHeader();
        root.addView(text("직원", 26, true));
        root.addView(body("현재 업체에 등록된 활성 직원만 표시합니다."));
        if (isPlatform()) {
            Button tenants = primary("업체 관리");
            root.addView(tenants);
            tenants.setOnClickListener(v -> showPlatformTenants());
        }
        if (isOwner()) {
            Button add = primary("직원 추가");
            root.addView(add);
            add.setOnClickListener(v -> showMemberEditor());
        }
        Button back = secondary("고객 목록");
        root.addView(back);
        back.setOnClickListener(v -> showCustomers(""));
        final int generation = requestGeneration;
        String membersPath = isOwner() ? "/api/mobile/members?include_inactive=true" : "/api/mobile/members";
        api.call("GET", membersPath, null, (body, status, error) -> runOnUiThread(() -> {
            if (!sameGeneration(generation)) return;
            if (handleAuthFailure(status)) return;
            if (status < 200 || status >= 300) {
                root.addView(body(message(body, error, "직원 정보를 불러오지 못했습니다.")));
                return;
            }
            JSONArray rows = body.optJSONArray("members");
            if (rows == null || rows.length() == 0) {
                root.addView(body("등록된 활성 직원이 없습니다."));
                return;
            }
            for (int i = 0; i < rows.length(); i++) {
                JSONObject member = rows.optJSONObject(i);
                if (member == null) continue;
                LinearLayout card = new LinearLayout(this);
                card.setOrientation(LinearLayout.VERTICAL);
                card.addView(body(member.optString("email", "이메일 없음") + " · " + roleLabel(member.optString("role", ""))));
                if (isOwner() && "staff".equals(member.optString("role", ""))) {
                    boolean active = member.optBoolean("active", true);
                    Button deactivate = secondary(active ? "직원 비활성화" : "직원 재활성화");
                    card.addView(deactivate);
                    String id = member.optString("id", "");
                    deactivate.setOnClickListener(v -> setMemberActive(id, !active, deactivate));
                }
                root.addView(card, blockParams());
            }
        }));
    }

    private void showMemberEditor() {
        Dialog dialog = sheet();
        LinearLayout box = sheetBox();
        box.addView(text("직원 추가", 22, true));
        EditText email = input("직원 이메일", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS, false);
        box.addView(email);
        Button save = primary("직원 저장");
        box.addView(save);
        save.setOnClickListener(v -> {
            String value = email.getText().toString().trim();
            if (value.isEmpty()) { email.setError("이메일을 입력하세요"); return; }
            JSONObject payload = new JSONObject();
            tryPut(payload, "email", value);
            tryPut(payload, "role", "staff");
            submit(save, "POST", "/api/mobile/members", payload, "직원을 추가했습니다.", false, dialog);
        });
        setSheetContent(dialog, box);
        dialog.show();
        sizeSheet(dialog);
    }

    private void showPlatformTenants() {
        base();
        addHeader();
        root.addView(text("업체 관리", 26, true));
        root.addView(body("플랫폼 권한이 있는 계정만 업체 목록과 정지 상태를 관리합니다."));
        Button add = primary("업체 등록");
        root.addView(add);
        add.setOnClickListener(v -> showTenantEditor());
        Button back = secondary("직원");
        root.addView(back);
        back.setOnClickListener(v -> showMembers());
        final int generation = requestGeneration;
        api.call("GET", "/api/mobile/platform/tenants", null, (body, status, error) -> runOnUiThread(() -> {
            if (!sameGeneration(generation)) return;
            if (handleAuthFailure(status)) return;
            if (status < 200 || status >= 300) { root.addView(body(message(body, error, "업체 관리 서비스를 사용할 수 없습니다."))); return; }
            JSONArray rows = body.optJSONArray("tenants");
            if (rows == null || rows.length() == 0) { root.addView(body("등록된 업체가 없습니다.")); return; }
            for (int i = 0; i < rows.length(); i++) {
                JSONObject tenant = rows.optJSONObject(i);
                if (tenant == null) continue;
                LinearLayout card = new LinearLayout(this);
                card.setOrientation(LinearLayout.VERTICAL);
                String id = tenant.optString("id", "");
                boolean suspended = tenant.optBoolean("suspended", false);
                card.addView(body(tenant.optString("name", id) + " · " + id + "\n" + (suspended ? "정지됨" : "운영 중")));
                Button toggle = secondary(suspended ? "업체 재개" : "업체 정지");
                card.addView(toggle);
                toggle.setOnClickListener(v -> setTenantSuspended(id, !suspended, toggle));
                Button delivery = secondary("발송 연결");
                card.addView(delivery);
                delivery.setOnClickListener(v -> showTenantDeliverySettings(id, tenant.optString("name", id)));
                root.addView(card, blockParams());
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
        Button channelButton = secondary("채널 선택");
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

        box.addView(label("승인된 고객 발송 문구"));
        EditText visitBody = input("방문 메시지 본문", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE, true);
        EditText measurementBody = input("실측 메시지 본문", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE, true);
        visitBody.setText("{{name}}님, {{date}} {{time}} {{location}} 방문 일정 안내.\n주소: {{address}}\n지도: {{map}}\n문의: {{contact_phone}}");
        measurementBody.setText("{{name}}님, {{date}} {{time}} {{location}} 실측 일정 안내.\n주소: {{address}}\n지도: {{map}}\n문의: {{contact_phone}}");
        box.addView(visitBody);
        box.addView(measurementBody);

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
            putField(payload, "visit_body", visitBody);
            putField(payload, "measurement_body", measurementBody);
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
        Dialog dialog = sheet();
        LinearLayout box = sheetBox();
        box.addView(text("업체 등록", 22, true));
        EditText id = input("업체 ID", InputType.TYPE_CLASS_TEXT, false); box.addView(id);
        EditText name = input("업체명", InputType.TYPE_CLASS_TEXT, false); box.addView(name);
        EditText brand = input("브랜드", InputType.TYPE_CLASS_TEXT, false); box.addView(brand);
        EditText logo = input("로고 URL", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI, false); box.addView(logo);
        EditText owner = input("대표 이메일", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS, false); box.addView(owner);
        Button save = primary("업체 등록 저장"); box.addView(save);
        save.setOnClickListener(v -> {
            JSONObject payload = new JSONObject();
            tryPut(payload, "id", id.getText().toString().trim()); tryPut(payload, "name", name.getText().toString().trim());
            tryPut(payload, "brand", brand.getText().toString().trim()); tryPut(payload, "logo_url", logo.getText().toString().trim());
            tryPut(payload, "owner_email", owner.getText().toString().trim());
            submit(save, "POST", "/api/mobile/platform/tenants", payload, "업체를 등록했습니다.", false, dialog);
        });
        setSheetContent(dialog, box); dialog.show(); sizeSheet(dialog);
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
                button.setText("비활성화됨");
            } else {
                button.setEnabled(true);
                toast(message(body, error, "직원 상태를 변경하지 못했습니다."));
            }
        }));
    }

    private void showAnalytics() {
        base();
        addHeader();
        root.addView(text("분석", 26, true));
        root.addView(body("저장된 견적, Meta, Pixel, 세션을 업체 범위로 조회합니다."));
        LinearLayout range = new LinearLayout(this);
        range.setOrientation(LinearLayout.HORIZONTAL);
        EditText startDate = input("시작일 YYYY-MM-DD", InputType.TYPE_CLASS_DATETIME, false);
        EditText endDate = input("종료일 YYYY-MM-DD", InputType.TYPE_CLASS_DATETIME, false);
        range.addView(startDate, new LinearLayout.LayoutParams(0, -2, 1));
        range.addView(endDate, new LinearLayout.LayoutParams(0, -2, 1));
        root.addView(range, blockParams());
        Button chooseRange = secondary("기간 날짜 선택");
        root.addView(chooseRange);
        chooseRange.setOnClickListener(v -> pickDate(value -> {
            startDate.setText(value);
            pickDate(endDate::setText);
        }));
        Button back = secondary("고객 목록");
        root.addView(back);
        back.setOnClickListener(v -> showCustomers(""));
        Button load = primary("분석 불러오기");
        root.addView(load);
        final int analyticsResultStart = root.getChildCount();
        load.setOnClickListener(v -> {
            while (root.getChildCount() > analyticsResultStart) {
                root.removeViewAt(root.getChildCount() - 1);
            }
            StringBuilder path = new StringBuilder("/api/mobile/analytics");
            String start = startDate.getText().toString().trim();
            String end = endDate.getText().toString().trim();
            String rangeError = analyticsRangeError(start, end);
            if (!rangeError.isEmpty()) {
                root.addView(body(rangeError));
                return;
            }
            load.setEnabled(false);
            final int generation = requestGeneration;
            if (!start.isEmpty()) path.append("?start=").append(Uri.encode(start));
            if (!end.isEmpty()) path.append(start.isEmpty() ? "?end=" : "&end=").append(Uri.encode(end));
            api.call("GET", path.toString(), null, (body, status, error) -> runOnUiThread(() -> {
                if (!sameGeneration(generation)) return;
                load.setEnabled(true);
                if (handleAuthFailure(status)) return;
                if (status < 200 || status >= 300) {
                    root.addView(body(message(body, error, "분석 서비스를 사용할 수 없습니다.")));
                    return;
                }
                renderAnalytics(body);
            }));
        });
    }

    private void showNotifications() {
        base();
        addHeader();
        root.addView(text("알림함", 26, true));
        root.addView(body("읽음 상태는 로그인한 수신자별로 저장됩니다. 저장 성공은 외부 발송 성공을 뜻하지 않습니다."));
        Button compose = primary("업무 알림 작성");
        compose.setEnabled(isOwner());
        root.addView(compose);
        compose.setOnClickListener(v -> showNotificationCompose());
        Button back = secondary("고객 목록");
        root.addView(back);
        back.setOnClickListener(v -> showCustomers(""));
        final int generation = requestGeneration;
        api.call("GET", "/api/mobile/notifications", null, (body, status, error) -> runOnUiThread(() -> {
            if (!sameGeneration(generation)) return;
            if (handleAuthFailure(status)) return;
            if (status < 200 || status >= 300) {
                root.addView(body(message(body, error, "알림 서비스를 사용할 수 없습니다.")));
                return;
            }
            JSONArray rows = body.optJSONArray("notifications");
            if (rows == null || rows.length() == 0) {
                root.addView(body("새 알림이 없습니다."));
                return;
            }
            for (int i = 0; i < rows.length(); i++) {
                JSONObject item = rows.optJSONObject(i);
                if (item == null) continue;
                LinearLayout card = new LinearLayout(this);
                card.setOrientation(LinearLayout.VERTICAL);
                card.setPadding(dp(12), dp(8), dp(12), dp(8));
                card.setBackground(round(PANEL, 8, LINE));
                card.addView(body(notificationTitle(notificationKind(item)) + " · " + formatIsoForDisplay(item.optString("created_at", ""))));
                card.addView(body(notificationMessage(item)));
                String id = item.optString("id", "");
                boolean unread = item.optBoolean("unread", item.isNull("read_at") || item.optString("read_at", "").isEmpty());
                if (!id.isEmpty() && unread) {
                    Button read = secondary("읽음 처리");
                    card.addView(read);
                    read.setOnClickListener(v -> markNotificationRead(id, read));
                } else {
                    card.addView(body("읽음"));
                }
                root.addView(card, blockParams());
            }
        }));
    }

    private void markNotificationRead(String id, Button button) {
        button.setEnabled(false);
        final int generation = requestGeneration;
        api.call("POST", "/api/mobile/notifications/" + Uri.encode(id) + "/read", null, (body, status, error) -> runOnUiThread(() -> {
            if (!sameGeneration(generation)) return;
            if (handleAuthFailure(status)) return;
            if (status >= 200 && status < 300) {
                button.setText("읽음");
            } else {
                button.setEnabled(true);
                toast(message(body, error, "읽음 처리에 실패했습니다."));
            }
        }));
    }

    private String notificationTitle(String type) {
        if ("new_customer".equals(type)) return "신규 고객 접수";
        if ("visit_reminder".equals(type)) return "방문 일정 알림";
        if ("measurement_reminder".equals(type)) return "실측 일정 알림";
        if ("staff_message".equals(type)) return "업무 알림";
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
                addNotificationField(fields, "고객", payload.optString("name", ""));
                addNotificationField(fields, "연락처", payload.optString("phone", ""));
                addNotificationField(fields, "주소", payload.optString("address", payload.optString("region", "")));
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
        Dialog dialog = sheet();
        LinearLayout box = sheetBox();
        box.addView(text("업무 알림 작성", 22, true));
        box.addView(body("동일 업체의 활성 직원에게 저장합니다. 외부 발송은 수행하지 않습니다."));
        final String[] mode = {"all"};
        final String[] selectedId = {""};
        final boolean[] membersReady = {false};
        final Button[] saveRef = {null};
        TextView audience = body("수신 범위: 전체 직원");
        box.addView(audience);
        Button chooseAudience = secondary("수신 범위 선택");
        chooseAudience.setEnabled(false);
        box.addView(chooseAudience);
        TextView memberStatus = body("활성 직원을 불러오는 중입니다.");
        box.addView(memberStatus);
        chooseAudience.setOnClickListener(v -> {
            ArrayList<String> options = new ArrayList<>();
            options.add("전체 직원");
            for (JSONObject member : members) if ("staff".equals(member.optString("role", "staff"))) options.add(member.optString("email", member.optString("id", "직원")));
            choose("수신 범위", options.toArray(new String[0]), value -> {
                if ("전체 직원".equals(value)) {
                    mode[0] = "all"; selectedId[0] = ""; audience.setText("수신 범위: 전체 직원");
                } else {
                    for (JSONObject member : members) if ("staff".equals(member.optString("role", "staff")) && value.equals(member.optString("email", member.optString("id", "")))) { selectedId[0] = member.optString("id", ""); break; }
                    mode[0] = "selected"; audience.setText("수신 범위: 선택 직원 1명");
                }
            });
        });
        EditText message = input("알림 내용을 입력하세요", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE, true);
        box.addView(message);
        Button save = primary("알림 저장");
        save.setEnabled(false);
        saveRef[0] = save;
        box.addView(save);
        save.setOnClickListener(v -> {
            String value = message.getText().toString().trim();
            if (value.isEmpty()) {
                message.setError("알림 내용을 입력하세요");
                return;
            }
            JSONObject payload = new JSONObject();
            tryPut(payload, "mode", mode[0]);
            JSONArray recipientIds = new JSONArray();
            if (!selectedId[0].isEmpty()) recipientIds.put(selectedId[0]);
            tryPut(payload, "recipient_ids", recipientIds);
            tryPut(payload, "message", value);
            submit(save, "POST", "/api/mobile/notifications", payload, "알림을 저장했습니다. 외부 발송은 하지 않았습니다.", false, dialog);
        });
        setSheetContent(dialog, box);
        dialog.show();
        sizeSheet(dialog);
        final int generation = requestGeneration;
        api.call("GET", "/api/mobile/members", null, (body, status, error) -> runOnUiThread(() -> {
            if (!sameGeneration(generation)) return;
            if (handleAuthFailure(status)) return;
            members.clear();
            if (status >= 200 && status < 300) {
                JSONArray rows = body.optJSONArray("members");
                if (rows != null) for (int i = 0; i < rows.length(); i++) {
                    JSONObject member = rows.optJSONObject(i);
                    if (member != null && "staff".equals(member.optString("role", "staff"))) members.add(member);
                }
                membersReady[0] = !members.isEmpty();
                chooseAudience.setEnabled(membersReady[0]);
                saveRef[0].setEnabled(membersReady[0]);
                memberStatus.setText(membersReady[0] ? "활성 직원 " + members.size() + "명을 확인했습니다." : "수신 가능한 활성 직원이 없습니다.");
            } else {
                memberStatus.setText(message(body, error, "활성 직원을 불러오지 못했습니다."));
            }
        }));
    }

    private void showTemplates() {
        base();
        addHeader();
        root.addView(text("메시지 템플릿", 26, true));
        root.addView(body("템플릿은 초안으로 저장하고, 변수 치환 결과만 미리 봅니다. 실제 발송은 하지 않습니다."));
        Button create = primary("템플릿 초안 작성");
        create.setEnabled(isOwner());
        root.addView(create);
        create.setOnClickListener(v -> showTemplateEditor(null));
        Button back = secondary("고객 목록");
        root.addView(back);
        back.setOnClickListener(v -> showCustomers(""));
        final int generation = requestGeneration;
        api.call("GET", "/api/mobile/message-templates", null, (body, status, error) -> runOnUiThread(() -> {
            if (!sameGeneration(generation)) return;
            if (handleAuthFailure(status)) return;
            if (status < 200 || status >= 300) {
                root.addView(body(message(body, error, "메시지 템플릿 서비스를 사용할 수 없습니다.")));
                return;
            }
            JSONArray rows = body.optJSONArray("templates");
            if (rows == null || rows.length() == 0) {
                root.addView(body("저장된 템플릿이 없습니다."));
                return;
            }
            for (int i = 0; i < rows.length(); i++) {
                JSONObject item = rows.optJSONObject(i);
                if (item == null) continue;
                LinearLayout card = new LinearLayout(this);
                card.setOrientation(LinearLayout.VERTICAL);
                card.addView(body(templateKindLabel(item.optString("kind", "")) + " · " + item.optString("state", "draft") + (item.optBoolean("enabled", false) ? " · 사용" : " · 중지") + "\n" + item.optString("body", "")));
                if (isOwner()) {
                    Button edit = secondary("템플릿 편집");
                    card.addView(edit);
                    edit.setOnClickListener(v -> showTemplateEditor(item));
                }
                root.addView(card, blockParams());
            }
        }));
    }

    private void showTemplateEditor(JSONObject existing) {
        Dialog dialog = sheet();
        LinearLayout box = sheetBox();
        box.addView(text("템플릿 초안", 22, true));
        final String[] kind = {existing == null ? "visit" : existing.optString("kind", "visit")};
        TextView kindLabel = body(getString(R.string.template_kind, "measurement".equals(kind[0]) ? "실측" : "방문"));
        box.addView(kindLabel);
        Button chooseKind = secondary("유형 선택");
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
        Button chooseChannel = secondary("미리보기 채널 선택");
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
        preview.removeAllViews();
        boolean alimtalk = "알림톡".equals(channel);
        TextView heading = text(alimtalk ? "알림톡 수신 화면" : "문자 수신 화면", 16, true);
        preview.addView(heading);
        preview.addView(body("화면 확인용 · 실제 발송 없음"));

        LinearLayout device = new LinearLayout(this);
        device.setOrientation(LinearLayout.VERTICAL);
        device.setPadding(dp(12), dp(10), dp(12), dp(12));
        device.setBackground(round(alimtalk ? Color.rgb(238, 247, 235) : Color.rgb(235, 241, 248), 12, LINE));
        device.addView(text(alimtalk ? tenantName() : "등록된 발신번호", 14, true));
        device.addView(body(alimtalk ? "알림톡 · 수신 예시" : "SMS · 수신 예시"));
        if (alimtalk) {
            TextView tag = body("알림톡");
            tag.setTextColor(Color.rgb(45, 105, 48));
            tag.setPadding(dp(8), dp(3), dp(8), dp(3));
            tag.setBackground(round(Color.rgb(207, 233, 204), 8, Color.TRANSPARENT));
            device.addView(tag);
        }
        TextView messageView = body(message);
        messageView.setTextColor(INK);
        messageView.setTextSize(15);
        messageView.setPadding(dp(12), dp(10), dp(12), dp(10));
        messageView.setBackground(round(Color.WHITE, 10, LINE));
        device.addView(messageView, blockParams());
        preview.addView(device, blockParams());
        preview.addView(body("가상 고객정보를 연결한 미리보기입니다. 기기·문자 앱에 따라 실제 표시가 달라질 수 있습니다."));
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
                root.addView(body("실제 저장 접수: " + analyticsValue(values,"saved") + "건"));
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
            root.addView(text("일별 저장 접수 추이", 17, true));
            for (int i = 0; i < trend.length(); i++) {
                JSONObject day = trend.optJSONObject(i);
                if (day == null) continue;
                root.addView(body(day.optString("date", "날짜 확인 필요") + " · 저장 " + analyticsValue(day, "saved") + "건 · 광고 출처 " + analyticsValue(day, "metaSaved") + "건"));
            }
        }
        JSONArray channels = values.optJSONArray("channels");
        if (channels != null && channels.length() > 0) {
            root.addView(text("출처별 저장 접수", 17, true));
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
        if (!object.has(key) || object.isNull(key)) return "확인 필요";
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
        Button back = secondary("고객 목록");
        root.addView(back);
        back.setOnClickListener(v -> showCustomers(""));
    }

    private void loadCustomersInto(LinearLayout list, String query, String cursor, boolean replace) {
        list.addView(body("고객 목록을 불러오는 중입니다."));
        String path = "/api/mobile/customers";
        ArrayList<String> parts = new ArrayList<>();
        if (!query.isEmpty()) parts.add("q=" + Uri.encode(query));
        if (!cursor.isEmpty()) parts.add("cursor=" + Uri.encode(cursor));
        if (!parts.isEmpty()) path += "?" + join(parts, "&");
        final int generation = requestGeneration;
        api.call("GET", path, null, (body, status, error) -> runOnUiThread(() -> {
            if (!sameGeneration(generation)) return;
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
                    Button row = secondary(customer.optString("name", "이름 없음") + "\n" + customer.optString("phone", "") + " · " + money(customer.optLong("budget", 0)));
                    list.addView(row);
                    final String id = customer.optString("id", "");
                    row.setOnClickListener(v -> {
                        if (!id.isEmpty()) showDetail(id);
                    });
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
        base();
        Button back = secondary("고객 목록");
        root.addView(back);
        back.setOnClickListener(v -> showCustomers(""));
        root.addView(body("고객 상세를 불러오는 중입니다."));
        final int generation = requestGeneration;
        api.call("GET", "/api/mobile/customers/" + Uri.encode(id), null, (body, status, error) -> runOnUiThread(() -> {
            if (!sameGeneration(generation)) return;
            if (handleAuthFailure(status)) return;
            if (status >= 200 && status < 300) {
                current = body;
                loadMembersThenRender();
            } else {
                root.addView(body(message(body, error, "고객 정보를 불러오지 못했습니다.")));
            }
        }));
    }

    private void loadMembersThenRender() {
        members.clear();
        if (!isOwner()) {
            renderDetail();
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
            renderDetail();
        }));
    }

    private void renderDetail() {
        root.removeAllViews();
        Button back = secondary("고객 목록");
        root.addView(back);
        back.setOnClickListener(v -> showCustomers(""));
        addHeader();
        root.addView(text(current.optString("name", "고객 상세"), 28, true));
        root.addView(body(current.optString("phone", "") + "\n" + current.optString("region", "") + " · " + money(current.optLong("budget", 0)) + "\n버전 " + current.optInt("version", 0)));

        addSection("고객 정보");
        addCustomerForm();
        if (isOwner()) {
            Button save = primary("고객 정보 저장");
            root.addView(save);
            save.setOnClickListener(v -> saveCustomer(save));
        } else {
            root.addView(body("직원 계정은 조회만 가능합니다."));
        }

        addSection("예약");
        addHistory("appointments");
        if (isOwner()) {
            Button visit = primary("방문 예약 추가");
            root.addView(visit);
            visit.setOnClickListener(v -> showAppointmentSheet("visit"));
            Button measurement = primary("실측 예약 추가");
            root.addView(measurement);
            measurement.setOnClickListener(v -> showAppointmentSheet("measurement"));
        }

        addSection("상담 결과");
        addHistory("consultations");
        if (isOwner()) {
            Button consultation = primary("상담 결과 추가");
            root.addView(consultation);
            consultation.setOnClickListener(v -> showConsultationSheet());
        }

        addSection("계약");
        addHistory("contracts");
        if (isOwner()) {
            Button contract = primary("계약 등록");
            root.addView(contract);
            contract.setOnClickListener(v -> showContractSheet());
        }
    }

    private void addCustomerForm() {
        addBoundEdit("name", "이름", InputType.TYPE_CLASS_TEXT);
        addBoundEdit("phone", "연락처", InputType.TYPE_CLASS_PHONE);
        addBoundEdit("email", "이메일", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        addBoundEdit("region", "지역", InputType.TYPE_CLASS_TEXT);
        addBoundEdit("budget", "예산", InputType.TYPE_CLASS_NUMBER);
        addBoundEdit("status", "상태", InputType.TYPE_CLASS_TEXT);
        Button status = secondary("상태 선택");
        root.addView(status);
        status.setOnClickListener(v -> choose("상태", new String[]{"new", "contacted", "scheduled", "quoted", "contracted", "closed"}, value -> customerEdits.get("status").setText(value)));
        addReadOnly("담당자", memberLabel(current.optString("assignee_id", "")));
        if (isOwner()) {
            Button assignee = secondary("담당자 선택");
            root.addView(assignee);
            assignee.setOnClickListener(v -> showAssigneeSheet());
        }
    }

    private void addBoundEdit(String key, String label, int type) {
        TextView title = label(label);
        root.addView(title);
        EditText edit = input(label, type, false);
        edit.setText(key.equals("budget") ? String.valueOf(current.optLong(key, 0)) : current.optString(key, ""));
        edit.setEnabled(isOwner());
        edit.setSingleLine(!key.equals("status"));
        customerEdits.put(key, edit);
        root.addView(edit);
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
            tryPut(current, "assignee_id", index <= 0 ? JSONObject.NULL : ids.get(index));
            renderDetail();
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
            Object assignee = current.opt("assignee_id");
            payload.put("assignee_id", assignee == null || JSONObject.NULL.equals(assignee) || String.valueOf(assignee).isEmpty() ? JSONObject.NULL : assignee);
        } catch (Exception error) {
            toast("입력값을 확인하세요. 예산은 숫자로 입력해야 합니다.");
            return;
        }
        submit(button, "PATCH", "/api/mobile/customers/" + Uri.encode(current.optString("id", "")), payload, "고객 정보를 저장했습니다.", true);
    }

    private void showAppointmentSheet(String kind) {
        Dialog dialog = sheet();
        LinearLayout box = sheetBox();
        String title = "visit".equals(kind) ? "방문 예약" : "실측 예약";
        box.addView(text(title, 22, true));
        TextView starts = body("일시를 선택하세요.");
        box.addView(starts);
        final String[] startsAt = {""};
        Button pickTime = secondary("날짜와 시간 선택");
        box.addView(pickTime);
        pickTime.setOnClickListener(v -> pickDateTime(value -> {
            startsAt[0] = value;
            starts.setText(formatIsoForDisplay(value));
        }));
        EditText location = input("장소 이름", InputType.TYPE_CLASS_TEXT, false);
        EditText address = input("주소", InputType.TYPE_CLASS_TEXT, false);
        location.setSingleLine(true);
        address.setSingleLine(false);
        box.addView(label("장소"));
        box.addView(location);
        box.addView(label("주소"));
        box.addView(address);
        Button save = primary(title + " 저장");
        box.addView(save);
        save.setOnClickListener(v -> {
            if (startsAt[0].isEmpty() || location.getText().toString().trim().isEmpty() || address.getText().toString().trim().isEmpty()) {
                toast("일시, 장소, 주소를 모두 입력하세요.");
                return;
            }
            JSONObject payload = baseRecordPayload();
            tryPut(payload, "kind", kind);
            tryPut(payload, "starts_at", startsAt[0]);
            tryPut(payload, "location", location.getText().toString().trim());
            tryPut(payload, "address", address.getText().toString().trim());
            submit(save, "POST", "/api/mobile/appointments", payload, title + "을 저장했습니다.", false, dialog);
        });
        setSheetContent(dialog, box);
        dialog.show();
        sizeSheet(dialog);
    }

    private void showConsultationSheet() {
        Dialog dialog = sheet();
        LinearLayout box = sheetBox();
        box.addView(text("상담 결과", 22, true));
        EditText result = input("상담 내용을 입력하세요", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE, true);
        box.addView(result);
        Button save = primary("상담 결과 저장");
        box.addView(save);
        save.setOnClickListener(v -> {
            String value = result.getText().toString().trim();
            if (value.isEmpty()) {
                result.setError("상담 결과를 입력하세요");
                return;
            }
            JSONObject payload = baseRecordPayload();
            tryPut(payload, "result", value);
            submit(save, "POST", "/api/mobile/consultations", payload, "상담 결과를 저장했습니다.", false, dialog);
        });
        setSheetContent(dialog, box);
        dialog.show();
        sizeSheet(dialog);
    }

    private void showContractSheet() {
        Dialog dialog = sheet();
        LinearLayout box = sheetBox();
        box.addView(text("계약 등록", 22, true));
        EditText amount = input("계약 금액", InputType.TYPE_CLASS_NUMBER, false);
        amount.setSingleLine(true);
        box.addView(label("금액"));
        box.addView(amount);
        final String[] status = {"signed"};
        TextView statusLabel = body(getString(R.string.contract_status, contractStatusLabel("signed")));
        box.addView(statusLabel);
        Button pickStatus = secondary("계약 상태 선택");
        box.addView(pickStatus);
        pickStatus.setOnClickListener(v -> choose("계약 상태", new String[]{"draft", "signed", "cancelled"}, value -> {
            status[0] = value;
            statusLabel.setText(getString(R.string.contract_status, contractStatusLabel(value)));
        }));
        final String[] signedAt = {""};
        TextView signedAtLabel = body("서명일을 선택하세요.");
        box.addView(signedAtLabel);
        Button pickSignedAt = secondary("서명 날짜와 시간 선택");
        box.addView(pickSignedAt);
        pickSignedAt.setOnClickListener(v -> pickDateTime(value -> {
            signedAt[0] = value;
            signedAtLabel.setText(formatIsoForDisplay(value));
        }));
        Button save = primary("계약 저장");
        box.addView(save);
        save.setOnClickListener(v -> {
            if (amount.getText().toString().trim().isEmpty() || signedAt[0].isEmpty()) {
                toast("금액과 서명일을 입력하세요.");
                return;
            }
            JSONObject payload = baseRecordPayload();
            try {
                payload.put("amount", parseMoney(amount.getText().toString().trim()));
            } catch (Exception error) {
                amount.setError("숫자로 입력하세요");
                return;
            }
            tryPut(payload, "status", status[0]);
            tryPut(payload, "signed_at", signedAt[0]);
            submit(save, "POST", "/api/mobile/contracts", payload, "계약을 저장했습니다.", false, dialog);
        });
        setSheetContent(dialog, box);
        dialog.show();
        sizeSheet(dialog);
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

    private void clearSessionAndShowLogin(String notice) {
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
        if (status == 401 || status == 403) {
            clearSessionAndShowLogin("권한이 만료되어 다시 로그인해야 합니다.");
            return true;
        }
        return false;
    }

    private void addHeader() {
        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(0, 0, 0, dp(12));
        int logo = isDayoneTenant() ? R.drawable.dayone_logo : R.drawable.polarad_logo;
        ImageView image = new ImageView(this);
        image.setImageResource(logo);
        image.setAdjustViewBounds(true);
        bar.addView(image, new LinearLayout.LayoutParams(dp(44), dp(44)));
        TextView title = text("  " + tenantName(), 20, true);
        bar.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        Button out = secondary("로그아웃");
        out.setEnabled(!loggingOut);
        bar.addView(out, new LinearLayout.LayoutParams(dp(104), dp(48)));
        out.setOnClickListener(v -> logout());
        root.addView(bar);
        LinearLayout nav = new LinearLayout(this);
        nav.setOrientation(LinearLayout.HORIZONTAL);
        nav.setGravity(Gravity.CENTER_VERTICAL);
        addNavButton(nav, "직원", v -> showMembers());
        addNavButton(nav, "일정", v -> showSchedule());
        addNavButton(nav, "알림", v -> showNotifications());
        addNavButton(nav, "메시지", v -> showTemplates());
        addNavButton(nav, "분석", v -> showAnalytics());
        root.addView(nav, new LinearLayout.LayoutParams(-1, -2));
        if (me != null) root.addView(body(me.optString("email", "") + " · " + me.optString("role", "")));
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
        box.addView(date);
        Button pick = secondary("날짜와 시간 선택");
        box.addView(pick);
        pick.setOnClickListener(v -> pickDateTime(value -> { startsAt[0] = value; date.setText(formatIsoForDisplay(value)); }));
        EditText location = input("장소", InputType.TYPE_CLASS_TEXT, false);
        location.setText(item.optString("location", ""));
        box.addView(location);
        EditText address = input("주소", InputType.TYPE_CLASS_TEXT, false);
        address.setText(item.optString("address", ""));
        box.addView(address);
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
            return formatIsoForDisplay(item.optString("created_at", "")) + "\n" + item.optString("result", "");
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
        edit.setBackground(round(Color.WHITE, 8, LINE));
        if (multiline) {
            edit.setGravity(Gravity.TOP | Gravity.START);
            edit.setMinLines(4);
        }
        edit.setLayoutParams(blockParams());
        return edit;
    }

    private Button primary(String value) {
        return button(value, TERRA, Color.WHITE);
    }

    private Button secondary(String value) {
        return button(value, BLUE, Color.WHITE);
    }

    private Button textButton(String value) {
        Button b = new Button(this);
        b.setText(value);
        b.setTextColor(BLUE);
        b.setTextSize(14);
        b.setAllCaps(false);
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
        b.setMinHeight(dp(48));
        b.setPadding(dp(12), 0, dp(12), 0);
        b.setBackground(round(bg, 8, Color.TRANSPARENT));
        b.setLayoutParams(blockParams());
        return b;
    }

    private void addSection(String title) {
        TextView section = text(title, 20, true);
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

    private boolean isDayoneTenant() {
        JSONObject tenant = me == null ? null : me.optJSONObject("tenant");
        JSONObject branding = me == null ? null : me.optJSONObject("branding");
        return (tenant != null && "day1design".equals(tenant.optString("id", "")))
            || (branding != null && "day1design".equals(branding.optString("brand", "")));
    }

    private String memberLabel(String id) {
        if (id == null || id.isEmpty() || "null".equals(id)) return "미지정";
        for (JSONObject member : members) {
            if (id.equals(member.optString("id", ""))) return member.optString("email", id);
        }
        return id;
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
