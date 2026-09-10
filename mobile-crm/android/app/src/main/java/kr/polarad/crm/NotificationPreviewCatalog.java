package kr.polarad.crm;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

public final class NotificationPreviewCatalog {
    private NotificationPreviewCatalog() {
    }

    public static final class Entry {
        public final String id;
        public final String name;
        public final String kind;
        public final String when;
        public final String who;
        public final String heading;
        public final String body;
        public final String privateBody;
        public final String target;
        public final String rule;
        public final boolean privacyHeading;

        private Entry(
                String id,
                String name,
                String kind,
                String when,
                String who,
                String heading,
                String body,
                String privateBody,
                String target,
                String rule) {
            this.id = id;
            this.name = name;
            this.kind = kind;
            this.when = when;
            this.who = who;
            this.heading = heading;
            this.body = body;
            this.privateBody = privateBody;
            this.target = target;
            this.rule = rule;
            this.privacyHeading = privacyHeadingFor(id);
        }

        public String maskedHeading() {
            return privacyHeading ? name + " 알림" : heading;
        }
    }

    public static final List<Entry> ENTRIES = Collections.unmodifiableList(Arrays.asList(
            new Entry(
                    "intake",
                    "신규 접수",
                    "consult",
                    "접수가 서버에 정상 저장된 직후",
                    "대표 + 접수 열람 권한이 있는 담당 직원",
                    "새 상담신청이 도착했습니다",
                    "예시 고객 A · 010-0000-1001\n성남 분당구 · 예산 5천만~7천만원",
                    "새 상담신청 1건이 접수되었습니다. 앱에서 확인해 주세요.",
                    "detail",
                    "같은 접수는 한 번만 알림. 저장 실패·중복 접수는 신규 알림에서 제외."),
            new Entry(
                    "consult",
                    "상담 리마인드",
                    "consult",
                    "상담 1일 전 · 2시간 전 (제안)",
                    "해당 상담 담당자, 대표 수신은 설정",
                    "2시간 뒤 상담이 있습니다",
                    "예시 고객 A · 오늘 14:00\n판교점 · 담당 예시 직원",
                    "예정된 상담이 2시간 뒤 시작됩니다.",
                    "calendar",
                    "일정 버전별로 중복 방지. 취소·변경 시 이전 예약 알림 폐기."),
            new Entry(
                    "measure",
                    "실측 리마인드",
                    "measure",
                    "실측 1일 전 · 2시간 전 (제안)",
                    "해당 실측 담당자, 대표 수신은 설정",
                    "내일 실측 일정이 있습니다",
                    "예시 고객 B · 내일 16:00\n서울 강남구 · 방문 정보를 확인해 주세요.",
                    "내일 실측 일정이 있습니다. 앱에서 방문 정보를 확인해 주세요.",
                    "calendar",
                    "실측과 상담은 별도 종류·색상. 날짜·현장 주소는 앱 상세에서 확인."),
            new Entry(
                    "changed",
                    "일정 변경",
                    "consult",
                    "상담·실측 일정 변경 저장 직후",
                    "해당 일정 담당자",
                    "상담 시간이 변경되었습니다",
                    "예시 고객 A\n오늘 14:00 → 내일 11:00",
                    "담당 일정이 변경되었습니다. 최신 일정을 확인해 주세요.",
                    "calendar",
                    "변경 전/후를 명시. 이전 알림 링크를 눌러도 최신 일정을 표시."),
            new Entry(
                    "cancelled",
                    "일정 취소",
                    "unknown",
                    "일정 취소 저장 직후",
                    "해당 일정 담당자",
                    "실측 일정이 취소되었습니다",
                    "예시 고객 B · 내일 16:00\n예약 리마인드는 더 이상 발송되지 않습니다.",
                    "담당 일정이 취소되었습니다. 앱에서 확인해 주세요.",
                    "calendar",
                    "접수카드를 삭제하지 않음. 취소 이력으로 이동하고 종료된 일정이라고 안내."),
            new Entry(
                    "result",
                    "상담결과 미작성",
                    "watch",
                    "명시적으로 상담 완료 후 결과가 없을 때 30분 뒤 1회 (제안)",
                    "상담 담당자",
                    "상담결과를 남겨 주세요",
                    "예시 고객 A의 상담이 완료되었습니다.\n결과와 다음 일정을 기록해 주세요.",
                    "완료한 상담의 결과가 아직 작성되지 않았습니다.",
                    "result",
                    "시간 경과로 상담 완료를 추정하지 않음. 작성 완료 시 대기 알림 취소."),
            new Entry(
                    "notice",
                    "대표 공지",
                    "unknown",
                    "대표가 공지 전달을 확정한 직후",
                    "같은 업체의 활성 등록 직원 전체 (초기안)",
                    "대표 공지 · 이번 주 현장 일정",
                    "현장 방문 전 고객카드의 실측 일정을 확인해 주세요.",
                    "새 대표 공지가 등록되었습니다. 앱에서 확인해 주세요.",
                    "staffNotices",
                    "직원 0명은 작성·전달 비활성. 본문 확인 시 읽음 기록, 푸시 수신은 읽음이 아님."),
            new Entry(
                    "brief",
                    "데일리브리핑",
                    "watch",
                    "매일 오전 10:00 KST",
                    "대표, 분석 권한을 부여한 직원은 선택 수신 (제안)",
                    "데일리브리핑 · 접수 흐름을 점검하세요",
                    "방문 +20% · 접수 −40%\nCPL 상승 구간과 CPC·CPM 분석을 확인해 주세요.",
                    "오늘의 데일리브리핑이 도착했습니다.",
                    "brief",
                    "알림 수치는 검증된 집계에서만 생성. 앱에서 비용·분모·비교 기간과 근거를 표시."),
            new Entry(
                    "delay",
                    "브리핑 집계 지연",
                    "unknown",
                    "10:00에 필수 데이터가 준비되지 않았을 때",
                    "브리핑 수신자",
                    "데일리브리핑 · 집계가 늦어지고 있습니다",
                    "Meta 광고 데이터를 확인하고 있습니다.\n준비된 지표와 갱신 상태를 앱에서 확인해 주세요.",
                    "오늘의 브리핑 일부 데이터가 아직 집계 중입니다.",
                    "brief",
                    "지연을 성과 하락으로 표시하지 않음. 준비 후 같은 보고서 갱신, 추가 푸시는 기본 없음."),
            new Entry(
                    "signal",
                    "마케팅 점검",
                    "risk",
                    "충분한 표본에서 점검 기준 충족 시 (기준 컨펌 후)",
                    "대표 + 분석 권한이 있는 선택 수신자",
                    "인스타그램 광고의 접수율이 낮아졌습니다",
                    "방문→접수율 4.0% → 2.0%\n신청 완료 구간의 변화를 확인해 주세요.",
                    "마케팅 흐름에서 점검할 변화가 확인되었습니다.",
                    "signal",
                    "같은 구간은 하루 1회 제한 제안. 데이터 부족·지연이면 발송하지 않음. 원인 단정 금지."),
            new Entry(
                    "contract",
                    "계약 전환",
                    "good",
                    "계약완료 저장 직후",
                    "대표 + 계약 열람 권한이 있는 담당자",
                    "계약완료로 변경되었습니다",
                    "예시 고객 A의 계약이 기록되었습니다.\n계약 정보와 후속 업무를 확인해 주세요.",
                    "담당 고객의 계약 상태가 변경되었습니다.",
                    "detail",
                    "잠금화면에 계약금액 미표시. 계약완료는 입금 완료와 구분."),
            new Entry(
                    "security",
                    "새 기기 로그인",
                    "watch",
                    "새 기기에서 인증 성공 직후 (제안)",
                    "해당 계정 본인",
                    "새 기기에서 로그인했습니다",
                    "등록되지 않았던 기기의 접속이 확인되었습니다.\n본인이 아니라면 기기 세션을 해제해 주세요.",
                    "새 기기 로그인이 확인되었습니다.",
                    "security",
                    "OTP 번호·토큰 미포함. 인증 성공과 알림은 별도이며 접속 이력에서 확인.")));

    public static Entry findById(String id) {
        if (id == null) {
            return null;
        }
        for (Entry entry : ENTRIES) {
            if (entry.id.equals(id)) {
                return entry;
            }
        }
        return null;
    }

    private static boolean privacyHeadingFor(String id) {
        return "intake".equals(id)
                || "changed".equals(id)
                || "cancelled".equals(id)
                || "notice".equals(id)
                || "signal".equals(id)
                || "contract".equals(id);
    }
}
