package kr.polarad.crm;

import android.app.Activity;
import android.app.Dialog;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import android.net.Uri;

import org.json.JSONArray;
import org.json.JSONObject;

final class AccountScreens {
    private static final int INK = Color.rgb(35, 35, 31);
    private static final int MUTED = Color.rgb(104, 102, 95);
    private static final int PAPER = Color.rgb(250, 249, 246);
    private static final int PANEL = Color.WHITE;
    private static final int LINE = Color.rgb(229, 223, 211);
    private static final int PRIMARY = Color.rgb(148, 96, 25);
    private static final int DANGER = Color.rgb(153, 54, 45);

    private AccountScreens() { }

    static View security(Activity activity, ApiClient api, JSONObject me, Runnable sessionRevoked) {
        ScrollView scroll = new ScrollView(activity);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(PAPER);
        LinearLayout root = column(activity, 0, 0, 0, 12);
        scroll.addView(root, new ScrollView.LayoutParams(-1, -2));

        root.addView(title(activity, "계정·보안", "내 계정과 로그인 기기를 관리하세요"));

        LinearLayout account = card(activity);
        addKeyValue(activity, account, "이메일", me == null ? "확인할 수 없음" : value(me, "email", "확인할 수 없음"));
        addKeyValue(activity, account, "인증 방식", "이메일 OTP");
        JSONObject tenant=me==null?null:me.optJSONObject("tenant");
        boolean platform=tenant!=null&&"platform".equals(tenant.optString("id"))&&"owner".equals(me.optString("role"));
        addKeyValue(activity, account, "업무 권한", platform?"전체 관리자":roleLabel(me == null ? "" : me.optString("role", "")));
        root.addView(account, cardParams(activity));

        LinearLayout lock = card(activity);
        LinearLayout lockHeader = new LinearLayout(activity);
        lockHeader.setGravity(Gravity.CENTER_VERTICAL);
        lockHeader.addView(text(activity, "앱 재진입 잠금", 15, true, INK), new LinearLayout.LayoutParams(0, -2, 1));
        lockHeader.addView(badge(activity, "제안", Color.rgb(246, 240, 227), Color.rgb(130, 97, 33)));
        lock.addView(lockHeader);
        lock.addView(text(activity, "생체인증 또는 기기 PIN 잠금은 아직 구현되지 않았습니다.", 13, false, MUTED), topParams(7));
        root.addView(lock, cardParams(activity));

        root.addView(sectionLabel(activity, "로그인 기기"), topParams(24));
        TextView state = text(activity, "기기 정보를 불러오는 중입니다.", 14, false, MUTED);
        root.addView(state, topParams(10));
        LinearLayout devices = column(activity, 0, 0, 0, 0);
        root.addView(devices, topParams(10));

        root.addView(notePanel(activity, "기기 해제 안내", "해제한 기기는 로그아웃되고 푸시 등록도 삭제됩니다. 다시 사용하려면 이메일 인증이 필요합니다."), topParams(20));

        LinearLayout policyBody = column(activity, 0, 7, 0, 0);
        policyBody.addView(text(activity, "OTP 일회성·유효시간·재발급·실패횟수 제한을 적용합니다. 등록 계정 여부는 로그인 전 응답으로 노출하지 않습니다.", 13, false, MUTED));
        policyBody.addView(text(activity, "로그인 이후 서버에서 사용자 역할과 업체 소속을 검증합니다. 화면에서 업체 ID를 바꿔 접근할 수 없습니다.", 13, false, MUTED), topParams(7));
        root.addView(detailSheetTrigger(activity, "인증·권한 정책", policyBody), topParams(12));

        final Runnable[] load = {null};
        load[0] = new Runnable() {
            @Override public void run() {
                state.setText("기기 정보를 불러오는 중입니다.");
                devices.removeAllViews();
                api.call("GET", "/api/mobile/devices", null, (body, status, error) -> activity.runOnUiThread(() -> {
                    if (status == 401 || status == 403) {
                        state.setText("세션이 만료되었습니다. 다시 로그인하세요.");
                        if (sessionRevoked != null) sessionRevoked.run();
                        return;
                    }
                    if (status < 200 || status >= 300) {
                        state.setText(message(body, error, "기기 정보를 불러오지 못했습니다."));
                        return;
                    }
                    JSONArray rows = body == null ? null : body.optJSONArray("devices");
                    if (rows == null || rows.length() == 0) {
                        state.setText("등록된 기기가 없습니다.");
                        return;
                    }
                    state.setText("등록된 기기 " + rows.length() + "개 · 최대 5개");
                    for (int i = 0; i < rows.length(); i++) {
                        JSONObject device = rows.optJSONObject(i);
                        if (device != null) devices.addView(deviceCard(activity, api, device, load[0], state, sessionRevoked), cardParams(activity));
                    }
                }));
            }
        };
        load[0].run();
        scroll.removeView(root);
        return root;
    }

    static View update(Activity activity) {
        return update(activity, null);
    }

    static void resumeUpdate(View updateView) {
        UpdateState state = updateState(updateView);
        if (state != null) state.refreshAfterResume();
    }

    static void disposeUpdate(View updateView) {
        UpdateState state = updateState(updateView);
        if (state != null) state.dispose();
    }

    static View update(Activity activity, ApiClient api) {
        ScrollView scroll = new ScrollView(activity);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(PAPER);
        LinearLayout root = column(activity, 0, 0, 0, 12);
        scroll.addView(root, new ScrollView.LayoutParams(-1, -2));

        root.addView(title(activity, "앱 업데이트", "현재 버전 " + BuildConfig.VERSION_NAME + " · 업데이트 경로를 확인합니다."));

        LinearLayout currentCard = card(activity);
        currentCard.addView(text(activity, "현재 앱", 15, true, INK));
        currentCard.addView(text(activity, "설치 버전 " + BuildConfig.VERSION_NAME, 13, false, MUTED), topParams(7));
        currentCard.addView(text(activity, "새 버전이 있으면 다운로드 후 Android 설치 화면에서 직접 확인합니다.", 13, false, MUTED), topParams(7));
        root.addView(currentCard, cardParams(activity));

        AppUpdateClient updates = new AppUpdateClient(api);
        final AppUpdateInfo[] latest = {null};
        final java.io.File[] downloaded = {null};
        LinearLayout updateCard = card(activity);
        TextView updateTitle = text(activity, "새 버전 확인", 15, true, INK);
        TextView updateBody = text(activity, api == null ? "업데이트 API 연결 대기 중입니다." : "새 버전을 확인할 수 있습니다.", 13, false, MUTED);
        Button primary = actionButton(activity, api == null ? "업데이트 연결 대기" : "새 버전 확인");
        primary.setBackground(round(PRIMARY, 8));
        primary.setTextColor(Color.WHITE);
        Button secondary = textActionButton(activity, "나중에");
        ProgressBar progress = new ProgressBar(activity, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        progress.setProgress(0);
        progress.setVisibility(View.GONE);
        secondary.setTextColor(MUTED);
        updateCard.addView(updateTitle);
        updateCard.addView(updateBody, topParams(8));
        updateCard.addView(progress, topParams(12));
        updateCard.addView(primary, topParams(14));
        updateCard.addView(secondary, topParams(8));
        if (api == null) {
            primary.setEnabled(false);
        }
        root.addView(updateCard, cardParams(activity));
        UpdateState updateState = new UpdateState(activity, updates, latest, downloaded, primary, updateBody);
        root.setTag(updateState);
        root.addOnAttachStateChangeListener(new View.OnAttachStateChangeListener() {
            @Override public void onViewAttachedToWindow(View v) { }
            @Override public void onViewDetachedFromWindow(View v) { updateState.dispose(); }
        });

        final View.OnClickListener[] checkClick = {null};
        checkClick[0] = v -> {
            if (api == null) return;
            primary.setEnabled(false);
            progress.setVisibility(View.GONE);
            progress.setProgress(0);
            updateTitle.setText("새 버전 확인 중");
            updateBody.setText("새 버전 정보를 확인하고 있습니다.");
            updates.check((info, status, error) -> activity.runOnUiThread(() -> {
                primary.setEnabled(true);
                downloaded[0] = null;
                latest[0] = info;
                progress.setVisibility(View.GONE);
                if (error != null && !error.trim().isEmpty()) {
                    updateTitle.setText("새 버전을 확인하지 못했습니다");
                    updateBody.setText(error);
                    primary.setText("다시 확인");
                    return;
                }
                if (info == null || !info.available) {
                    updateTitle.setText("최신 버전 사용 중");
                    updateBody.setText("현재 설치된 버전 " + BuildConfig.VERSION_NAME + "을 그대로 사용하면 됩니다.");
                    primary.setText("다시 확인");
                    return;
                }
                updateTitle.setText("새 버전 " + info.versionName);
                updateBody.setText(fileSize(info.sizeBytes) + (info.mandatory ? " · 필수 업데이트" : " · 일반 업데이트") + (info.releaseNote.isEmpty() ? "" : "\n" + info.releaseNote));
                primary.setText("업데이트 다운로드");
                primary.setOnClickListener(downloadClick(activity, updates, info, primary, updateTitle, updateBody, progress, downloaded));
            }));
        };
        primary.setOnClickListener(checkClick[0]);
        secondary.setOnClickListener(v -> {
            updates.cancel();
            downloaded[0] = null;
            progress.setVisibility(View.GONE);
            updateTitle.setText("나중에 업데이트");
            updateBody.setText("기존 앱을 그대로 사용합니다. 필요할 때 다시 새 버전을 확인하세요.");
            primary.setEnabled(api != null);
            primary.setText(api == null ? "업데이트 연결 대기" : "새 버전 확인");
            primary.setOnClickListener(checkClick[0]);
        });

        LinearLayout safetyBody = column(activity, 0, 7, 0, 0);
        safetyBody.addView(text(activity, "다운로드 취소·실패 시 기존 설치 버전은 삭제하지 않습니다.", 13, false, MUTED));
        safetyBody.addView(text(activity, "설치 전 SHA-256, 파일 크기, 패키지명 kr.polarad.crm, versionCode, release 서명을 확인합니다.", 13, false, MUTED), topParams(7));
        safetyBody.addView(text(activity, "Android 일반 APK 업데이트는 시스템 설치 확인 화면을 거칩니다.", 13, false, MUTED), topParams(7));
        safetyBody.addView(text(activity, "앱 시작 후 로그인 확인이 끝났을 때와 더보기의 앱 업데이트 화면에서 같은 최신 버전 확인 API를 사용합니다.", 13, false, MUTED), topParams(7));
        root.addView(detailSheetTrigger(activity, "업데이트 안전장치", safetyBody), cardParams(activity));
        scroll.removeView(root);
        return root;
    }

    private static View.OnClickListener downloadClick(Activity activity, AppUpdateClient updates, AppUpdateInfo info,
                                                     Button primary, TextView updateTitle, TextView updateBody,
                                                     ProgressBar progress, java.io.File[] downloaded) {
        return v -> {
            java.io.File target = AppUpdateInstaller.targetFile(activity, info);
            primary.setEnabled(true);
            primary.setText("다운로드 중지");
            updateTitle.setText("다운로드 중");
            updateBody.setText("0% · 기존 앱은 계속 사용할 수 있습니다.");
            progress.setVisibility(View.VISIBLE);
            progress.setProgress(0);
            primary.setOnClickListener(cancelDownloadClick(updates, primary, updateBody));
            updates.download(info, target, new AppUpdateClient.DownloadCallback() {
                @Override public void progress(long done, long total) {
                    activity.runOnUiThread(() -> {
                        int pct = total > 0 ? (int) Math.min(99, Math.max(0, done * 100 / total)) : 0;
                        progress.setProgress(pct);
                        updateBody.setText(pct + "% · " + fileSize(done) + " / " + fileSize(total));
                    });
                }
                @Override public void done(java.io.File file, String error) {
                    activity.runOnUiThread(() -> {
                        primary.setEnabled(true);
                        if (error != null && !error.trim().isEmpty()) {
                            updateTitle.setText("다운로드 실패");
                            updateBody.setText(error + "\n기존 앱은 그대로 유지됩니다.");
                            progress.setVisibility(View.GONE);
                            primary.setText("다시 다운로드");
                            primary.setOnClickListener(downloadClick(activity, updates, info, primary, updateTitle, updateBody, progress, downloaded));
                            return;
                        }
                        try {
                            AppUpdateInstaller.verify(activity, info, file);
                            downloaded[0] = file;
                            updateTitle.setText("설치 준비 완료");
                            updateBody.setText("패키지 검증을 마쳤습니다. Android 설치 화면에서 업데이트를 확인하세요.");
                            progress.setVisibility(View.VISIBLE);
                            progress.setProgress(100);
                            primary.setText(AppUpdateInstaller.canRequestInstall(activity) ? "Android 설치 화면 열기" : "설치 권한 설정");
                            primary.setOnClickListener(installClick(activity, info, primary, updateBody, downloaded));
                        } catch (Exception e) {
                            updateTitle.setText("검증 실패");
                            updateBody.setText((e.getMessage() == null ? "업데이트 파일 검증에 실패했습니다." : e.getMessage()) + "\n설치 화면을 열지 않습니다.");
                            progress.setVisibility(View.GONE);
                            primary.setText("다시 다운로드");
                            primary.setOnClickListener(downloadClick(activity, updates, info, primary, updateTitle, updateBody, progress, downloaded));
                        }
                    });
                }
            });
        };
    }

    private static View.OnClickListener cancelDownloadClick(AppUpdateClient updates, Button primary, TextView updateBody) {
        return v -> {
            updates.cancel();
            primary.setEnabled(false);
            updateBody.setText("다운로드 취소를 요청했습니다. 기존 앱은 그대로 유지됩니다.");
        };
    }

    private static View.OnClickListener installClick(Activity activity, AppUpdateInfo info, Button primary, TextView updateBody, java.io.File[] downloaded) {
        return v -> {
            if (downloaded[0] == null || !downloaded[0].isFile()) {
                updateBody.setText("설치할 업데이트 파일이 없습니다.");
                return;
            }
            try {
                AppUpdateInstaller.verify(activity, info, downloaded[0]);
            } catch (Exception e) {
                updateBody.setText((e.getMessage() == null ? "업데이트 파일 검증에 실패했습니다." : e.getMessage()) + "\n설치 화면을 열지 않습니다.");
                return;
            }
            if (!AppUpdateInstaller.canRequestInstall(activity)) {
                primary.setText("권한 확인 후 설치 다시 열기");
                updateBody.setText("Android 설정에서 이 앱의 설치 권한을 허용한 뒤 돌아와 다시 누르세요.");
                AppUpdateInstaller.openInstallPermission(activity);
                return;
            }
            AppUpdateInstaller.openInstaller(activity, downloaded[0]);
            updateBody.setText("Android 설치 화면을 열었습니다. 설치를 취소하면 기존 앱 버전은 그대로 유지됩니다.");
        };
    }

    private static View deviceCard(Activity a, ApiClient api, JSONObject device, Runnable reload, TextView state, Runnable sessionRevoked) {
        LinearLayout card = card(a);
        String id = device.optString("id", "");
        boolean current = device.optBoolean("current", device.optInt("current", 0) == 1);
        LinearLayout heading = new LinearLayout(a);
        heading.setGravity(Gravity.CENTER_VERTICAL);
        heading.addView(text(a, current ? "현재 기기" : "등록 기기", 15, true, INK), new LinearLayout.LayoutParams(0, -2, 1));
        if (current) heading.addView(badge(a, "사용중", Color.rgb(237, 243, 238), Color.rgb(53, 99, 78)));
        card.addView(heading);
        String updated = device.optString("updated_at", "");
        try { updated = java.time.OffsetDateTime.parse(updated).atZoneSameInstant(java.time.ZoneId.of("Asia/Seoul")).format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"))+" KST"; } catch(java.time.format.DateTimeParseException ignored) { }
        card.addView(text(a, "마지막 등록 갱신  " + (updated.isEmpty() ? "확인할 수 없음" : updated), 12, false, MUTED), topParams(4));
        card.addView(text(a, "알림 " + (device.optBoolean("notifications_enabled", device.optInt("notifications_enabled", 0) == 1) ? "사용" : "사용 안 함") + " · 잠금화면 표시 " + previewLabel(device.optString("preview_mode", "")), 12, false, MUTED), topParams(4));
        Button revoke = textActionButton(a, "이 기기 접근 해제");
        revoke.setTextColor(DANGER);
        card.addView(revoke, topParams(12));
        revoke.setOnClickListener(v -> confirmRevoke(a, api, id, revoke, reload, state, sessionRevoked));
        return card;
    }

    private static void confirmRevoke(Activity a, ApiClient api, String id, Button source, Runnable reload, TextView state, Runnable sessionRevoked) {
        if (id.isEmpty()) return;
        Dialog dialog = new Dialog(a);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        LinearLayout box = column(a, 20, 20, 20, 20);
        box.setBackground(round(PANEL, 14));
        box.addView(text(a, "이 기기 접근을 해제할까요?", 20, true, INK));
        box.addView(text(a, "이 기기의 로그인 세션과 푸시 등록을 해제합니다. 현재 기기를 선택하면 이 앱에서도 로그아웃됩니다.", 14, false, MUTED), topParams(10));
        LinearLayout actions = new LinearLayout(a);
        actions.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        Button cancel = actionButton(a, "취소");
        Button confirm = actionButton(a, "접근 해제");
        confirm.setTextColor(DANGER);
        actions.addView(cancel, new LinearLayout.LayoutParams(0, dp(a, 48), 1));
        actions.addView(confirm, new LinearLayout.LayoutParams(0, dp(a, 48), 1));
        box.addView(actions, topParams(16));
        cancel.setOnClickListener(v -> dialog.dismiss());
        confirm.setOnClickListener(v -> {
            confirm.setEnabled(false);
            api.call("DELETE", "/api/mobile/devices/" + Uri.encode(id), null, (body, status, error) -> a.runOnUiThread(() -> {
                dialog.dismiss();
                if (status == 401 || status == 403) {
                    state.setText("세션이 만료되었습니다. 다시 로그인하세요.");
                    if (sessionRevoked != null) sessionRevoked.run();
                } else if (status >= 200 && status < 300) {
                    Toast.makeText(a, "기기 접근을 해제했습니다.", Toast.LENGTH_SHORT).show();
                    if (body != null && body.optBoolean("session_revoked", false)
                            && body.optBoolean("current", false) && sessionRevoked != null) {
                        sessionRevoked.run();
                    } else {
                        reload.run();
                    }
                } else {
                    Toast.makeText(a, message(body, error, "기기 접근을 해제하지 못했습니다."), Toast.LENGTH_LONG).show();
                }
            }));
        });
        dialog.setContentView(box);
        Window window = dialog.getWindow();
        if (window != null) {
            window.setBackgroundDrawableResource(android.R.color.transparent);
            window.setLayout(-1, -2);
            window.setGravity(Gravity.BOTTOM);
            window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            WindowManager.LayoutParams params = window.getAttributes();
            params.width = WindowManager.LayoutParams.MATCH_PARENT;
            params.dimAmount = 0.32f;
            window.setAttributes(params);
        }
        dialog.show();
        Window shown = dialog.getWindow();
        if (shown != null) {
            shown.setLayout(-1, -2);
            shown.setGravity(Gravity.BOTTOM);
        }
    }

    private static LinearLayout column(Activity a, int l, int t, int r, int b) {
        LinearLayout view = new LinearLayout(a);
        view.setOrientation(LinearLayout.VERTICAL);
        view.setPadding(dp(a, l), dp(a, t), dp(a, r), dp(a, b));
        return view;
    }

    private static LinearLayout card(Activity a) {
        LinearLayout view = column(a, 16, 16, 16, 16);
        view.setBackground(round(PANEL, 10));
        return view;
    }

    private static LinearLayout flatBlock(Activity a) {
        LinearLayout view = column(a, 0, 20, 0, 20);
        view.setBackgroundColor(Color.TRANSPARENT);
        return view;
    }

    private static LinearLayout notePanel(Activity a, String heading, String body) {
        LinearLayout view = column(a, 12, 12, 12, 12);
        view.setBackground(noteBackground());
        view.addView(text(a, heading, 13, true, MUTED));
        view.addView(text(a, body, 13, false, MUTED), topParams(6));
        return view;
    }

    private static TextView badge(Activity a, String value, int background, int foreground) {
        TextView view = text(a, value, 11, true, foreground);
        view.setPadding(dp(a, 7), dp(a, 4), dp(a, 7), dp(a, 4));
        view.setBackground(badgeBackground(background));
        return view;
    }

    private static Button textActionButton(Activity a, String label) {
        Button button = new Button(a);
        button.setText(label);
        button.setTextSize(13);
        button.setAllCaps(false);
        button.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        button.setPadding(0, 0, 0, 0);
        button.setMinHeight(dp(a, 44));
        button.setMinimumHeight(dp(a, 44));
        button.setBackgroundColor(Color.TRANSPARENT);
        return button;
    }

    static View detailSheetTrigger(Activity a, String title, View content) {
        LinearLayout row = new LinearLayout(a);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(a, 2), dp(a, 14), dp(a, 2), dp(a, 14));
        row.setMinimumHeight(dp(a, 60));
        TextView leading = text(a, "▥", 16, false, MUTED);
        leading.setGravity(Gravity.CENTER);
        leading.setBackground(round(Color.TRANSPARENT, 9));
        row.addView(leading, new LinearLayout.LayoutParams(dp(a, 31), dp(a, 31)));
        TextView label = text(a, title, 12, true, INK);
        LinearLayout.LayoutParams labelParams = new LinearLayout.LayoutParams(0, -2, 1);
        labelParams.leftMargin = dp(a, 12);
        row.addView(label, labelParams);
        TextView arrow = text(a, "›", 22, false, MUTED);
        arrow.setGravity(Gravity.CENTER);
        row.addView(arrow, new LinearLayout.LayoutParams(dp(a, 24), dp(a, 31)));
        View divider = new View(a);
        divider.setBackgroundColor(LINE);
        LinearLayout wrapper = column(a, 0, 0, 0, 0);
        wrapper.addView(row);
        wrapper.addView(divider, new LinearLayout.LayoutParams(-1, dp(a, 1)));
        row.setClickable(true);
        row.setFocusable(true);
        row.setContentDescription(title + " 상세 열기");
        row.setOnClickListener(v -> showInfoSheet(a, title, content));
        return wrapper;
    }

    private static void showInfoSheet(Activity a, String title, View content) {
        Dialog dialog = new Dialog(a);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        LinearLayout sheet = column(a, 0, 0, 0, 0);
        sheet.setBackground(round(PANEL, 26));
        View grip = new View(a);
        grip.setBackground(round(Color.rgb(216, 211, 202), 4));
        LinearLayout.LayoutParams gripParams = new LinearLayout.LayoutParams(dp(a, 34), dp(a, 4));
        gripParams.gravity = Gravity.CENTER_HORIZONTAL;
        gripParams.topMargin = dp(a, 10);
        sheet.addView(grip, gripParams);
        LinearLayout header = new LinearLayout(a);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(a, 22), dp(a, 14), dp(a, 18), dp(a, 12));
        header.addView(text(a, title, 20, true, INK), new LinearLayout.LayoutParams(0, -2, 1));
        Button close = textActionButton(a, "×");
        close.setTextSize(24);
        close.setGravity(Gravity.CENTER);
        close.setContentDescription("닫기");
        close.setBackground(round(Color.rgb(242, 238, 231), 18));
        header.addView(close, new LinearLayout.LayoutParams(dp(a, 36), dp(a, 36)));
        sheet.addView(header);
        ScrollView scroll = new ScrollView(a);
        scroll.setFillViewport(true);
        LinearLayout contentHost = column(a, 18, 0, 18, 20);
        contentHost.addView(content);
        scroll.addView(contentHost, new ScrollView.LayoutParams(-1, -2));
        sheet.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        close.setOnClickListener(v -> dialog.dismiss());
        dialog.setOnDismissListener(ignored -> contentHost.removeView(content));
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
            shown.setLayout(-1, Math.min(dp(a, 620), a.getResources().getDisplayMetrics().heightPixels * 85 / 100));
            shown.setGravity(Gravity.BOTTOM);
        }
    }

    private static GradientDrawable noteBackground() {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(Color.rgb(240, 239, 235));
        drawable.setCornerRadius(4);
        return drawable;
    }

    private static GradientDrawable badgeBackground(int color) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(4);
        return drawable;
    }

    private static View rule(Activity a) {
        View view = new View(a);
        view.setBackgroundColor(Color.rgb(214, 210, 201));
        return view;
    }

    private static LinearLayout.LayoutParams ruleParams(Activity a) {
        return new LinearLayout.LayoutParams(-1, dp(a, 1));
    }

    private static LinearLayout title(Activity a, String heading, String subtitle) {
        LinearLayout block = column(a, 0, 0, 0, 0);
        TextView title = text(a, heading, 26, true, INK);
        block.addView(title);
        block.addView(text(a, subtitle, 14, false, MUTED), topParams(7));
        return block;
    }

    private static TextView sectionLabel(Activity a, String value) {
        return text(a, value, 13, true, MUTED);
    }

    private static TextView text(Activity a, String value, float size, boolean bold, int color) {
        TextView view = new TextView(a);
        view.setText(value == null ? "" : value);
        view.setTextSize(size);
        view.setTextColor(color);
        view.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        if (bold) view.setTypeface(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD);
        return view;
    }

    private static Button actionButton(Activity a, String label) {
        Button button = new Button(a);
        button.setText(label);
        button.setTextSize(14);
        button.setTextColor(PRIMARY);
        button.setAllCaps(false);
        button.setMinHeight(dp(a, 48));
        button.setMinimumHeight(dp(a, 48));
        button.setBackground(round(Color.TRANSPARENT, 8));
        return button;
    }

    private static void addKeyValue(Activity a, LinearLayout parent, String key, String value) {
        LinearLayout row = new LinearLayout(a);
        row.setGravity(Gravity.CENTER_VERTICAL);
        TextView left = text(a, key, 13, false, MUTED);
        left.setTypeface(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD);
        TextView right = text(a, value, 14, false, INK);
        row.addView(left, new LinearLayout.LayoutParams(dp(a, 78), -2));
        row.addView(right, new LinearLayout.LayoutParams(0, -2, 1));
        parent.addView(row, topParams(parent.getChildCount() == 0 ? 0 : 12));
    }

    private static void divider(Activity a, LinearLayout parent) {
        View line = new View(a);
        line.setBackgroundColor(LINE);
        parent.addView(line, new LinearLayout.LayoutParams(-1, dp(a, 1)));
    }

    private static GradientDrawable round(int color, int radius) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(radius);
        drawable.setStroke(1, LINE);
        return drawable;
    }

    private static LinearLayout.LayoutParams blockParams() {
        return new LinearLayout.LayoutParams(-1, -2);
    }

    private static LinearLayout.LayoutParams cardParams(Activity a) {
        LinearLayout.LayoutParams params = blockParams();
        params.bottomMargin = dp(a, 12);
        return params;
    }

    private static LinearLayout.LayoutParams topParams(int top) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2);
        params.topMargin = top;
        return params;
    }

    private static int dp(Activity a, int value) {
        return Math.round(value * a.getResources().getDisplayMetrics().density);
    }

    private static String value(JSONObject object, String key, String fallback) {
        String value = object.optString(key, "");
        return value.trim().isEmpty() ? fallback : value;
    }

    private static String fileSize(long bytes) {
        if (bytes <= 0) return "0 B";
        double value = bytes;
        String[] units = {"B", "KB", "MB"};
        int unit = 0;
        while (value >= 1024 && unit < units.length - 1) {
            value /= 1024;
            unit++;
        }
        return unit == 0
                ? String.format(java.util.Locale.US, "%.0f %s", value, units[unit])
                : String.format(java.util.Locale.US, "%.1f %s", value, units[unit]);
    }

    private static UpdateState updateState(View view) {
        Object tag = view == null ? null : view.getTag();
        return tag instanceof UpdateState ? (UpdateState) tag : null;
    }

    private static final class UpdateState {
        final Activity activity;
        final AppUpdateClient updates;
        final AppUpdateInfo[] latest;
        final java.io.File[] downloaded;
        final Button primary;
        final TextView body;
        boolean disposed;

        UpdateState(Activity activity, AppUpdateClient updates, AppUpdateInfo[] latest, java.io.File[] downloaded,
                    Button primary, TextView body) {
            this.activity = activity;
            this.updates = updates;
            this.latest = latest;
            this.downloaded = downloaded;
            this.primary = primary;
            this.body = body;
        }

        void refreshAfterResume() {
            if (disposed || downloaded[0] == null || latest[0] == null || !latest[0].available) return;
            try {
                AppUpdateInstaller.verify(activity, latest[0], downloaded[0]);
                primary.setText(AppUpdateInstaller.canRequestInstall(activity) ? "Android 설치 화면 열기" : "권한 확인 후 설치 다시 열기");
                body.setText(AppUpdateInstaller.canRequestInstall(activity)
                        ? "설치 권한이 확인되었습니다. Android 설치 화면에서 업데이트를 확인하세요."
                        : "Android 설정에서 이 앱의 설치 권한을 허용한 뒤 돌아와 다시 누르세요.");
            } catch (Exception e) {
                body.setText((e.getMessage() == null ? "업데이트 파일 검증에 실패했습니다." : e.getMessage()) + "\n설치 화면을 열지 않습니다.");
            }
        }

        void dispose() {
            if (disposed) return;
            disposed = true;
            updates.close();
        }
    }

    private static String roleLabel(String role) {
        if ("superadmin".equals(role) || "platform".equals(role)) return "전체 관리자";
        if ("owner".equals(role)) return "업체 관리자";
        if ("staff".equals(role)) return "업체 직원";
        return role == null || role.trim().isEmpty() ? "확인할 수 없음" : role;
    }

    private static String previewLabel(String value) {
        if ("generic".equals(value)) return "일반 알림";
        if ("details".equals(value)) return "상세 표시";
        return "확인할 수 없음";
    }

    private static String message(JSONObject body, String error, String fallback) {
        if (body != null) {
            String value = body.optString("message", "");
            if (!value.trim().isEmpty()) return value;
            value = body.optString("error", "");
            if (!value.trim().isEmpty()) return value;
        }
        return error == null || error.trim().isEmpty() ? fallback : fallback;
    }
}
