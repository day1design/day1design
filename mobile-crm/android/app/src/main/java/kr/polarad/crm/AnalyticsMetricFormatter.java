package kr.polarad.crm;

import org.json.JSONObject;

final class AnalyticsMetricFormatter {
    private AnalyticsMetricFormatter() { }

    static Double numeric(JSONObject object, String key) {
        if (object == null || !object.has(key) || object.isNull(key)) return null;
        Object raw = object.opt(key);
        if (raw instanceof JSONObject) {
            JSONObject metric = (JSONObject) raw;
            if (!metric.has("value") || metric.isNull("value")) return null;
            raw = metric.opt("value");
        }
        return finiteNumber(raw);
    }

    static Double finiteNumber(Object raw) {
        if (!(raw instanceof Number)) return null;
        double value = ((Number) raw).doubleValue();
        return Double.isFinite(value) ? value : null;
    }
}
