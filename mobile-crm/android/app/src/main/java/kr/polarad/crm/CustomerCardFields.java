package kr.polarad.crm;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class CustomerCardFields {
    private CustomerCardFields() {}

    static String value(String value) {
        return value == null || "null".equals(value.trim()) ? "" : value.trim();
    }

    static String budget(String budgetText, String detail) {
        String text = value(budgetText);
        if (!text.isEmpty()) return text;
        Matcher match = Pattern.compile("가용\\s*예산[^\\S\\r\\n]*[:：][^\\S\\r\\n]*([^\\n\\r]*)").matcher(value(detail));
        if (match.find() && !match.group(1).trim().isEmpty()) return match.group(1).trim();
        return "미기재";
    }

    static String source(String firstSource, String source, String referrer) {
        String key = value(firstSource);
        if (key.isEmpty()) key = value(source);
        switch (key.toLowerCase(Locale.ROOT)) {
            case "homepage": return "홈페이지(직접)";
            case "instagram_official": return "인스타 오피셜";
            case "instagram_mkt": return "인스타 마케팅";
            case "meta": return "Meta";
            case "google": return "Google";
            case "naver":
                String host = value(referrer).toLowerCase(Locale.ROOT);
                if (host.matches("(^|.*\\.)search\\.naver\\.com")) return "네이버검색";
                if (host.matches("(^|.*\\.)blog\\.naver\\.com")) return "네이버블로그";
                if (host.matches("(^|.*\\.)place\\.naver\\.com")) return "네이버플레이스";
                if (host.matches("(^|.*\\.)cafe\\.naver\\.com")) return "네이버카페";
                return "Naver";
            case "youtube": return "YouTube";
            case "kakao": return "Kakao";
            case "referral": return "Referral";
            case "other": return "기타";
            default: return key.isEmpty() ? "미확인" : key;
        }
    }

    static boolean homepage(String source) {
        switch (value(source).toLowerCase(Locale.ROOT)) {
            case "homepage": case "instagram_official": case "instagram_mkt":
            case "google": case "naver": case "youtube": case "kakao": case "referral":
                return true;
            default: return false;
        }
    }
}
