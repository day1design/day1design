package kr.polarad.crm;

final class AnalyticsSourceStatus {
    static final String QUALITY = "quality";
    static final String RECEIPT = "receipt";
    static final String NONE = "none";
    static final String SAMPLE = "sample";
    static final String INACTIVE = "inactive";

    private AnalyticsSourceStatus() { }

    static String fromMetrics(boolean qualityIssue, Long visits, Long saved) {
        if (saved >= 1L) return RECEIPT;
        if (qualityIssue || visits == null || saved == null) return QUALITY;
        if (visits >= 100L) return NONE;
        if (visits >= 1L) return SAMPLE;
        return INACTIVE;
    }

    static String label(String status) {
        if (RECEIPT.equals(status)) return "접수 발생";
        if (NONE.equals(status)) return "접수 없음";
        if (SAMPLE.equals(status)) return "집계 중";
        if (QUALITY.equals(status)) return "집계 확인 필요";
        return "활동 없음";
    }
}
