package kr.polarad.crm;

final class BriefingRefreshPolicy {
    private BriefingRefreshPolicy() { }

    static boolean retainUnchanged(String previousId, String nextId, boolean unchanged, boolean hasPrevious) {
        return unchanged && hasPrevious && !previousId.isEmpty() && previousId.equals(nextId);
    }

    static boolean shouldLoadImage(boolean available, boolean missingImage, boolean previousImageError) {
        return available && (missingImage || previousImageError);
    }
}
