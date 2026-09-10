package kr.polarad.crm;

import android.app.Activity;
import android.app.Dialog;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

final class BriefImageDialog {
    static void show(Activity activity, Bitmap bitmap, String date) {
        if (bitmap == null || bitmap.isRecycled() || activity.isFinishing()) return;
        Dialog dialog = new Dialog(activity);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);
        LinearLayout layout = new LinearLayout(activity);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setBackgroundColor(Color.rgb(250, 249, 246));
        int pad = Math.round(12 * activity.getResources().getDisplayMetrics().density);
        layout.setPadding(pad, pad, pad, pad);
        TextView title = new TextView(activity);
        title.setText(date + " 브리핑 이미지");
        title.setTextSize(18);
        title.setTextColor(Color.rgb(35, 35, 31));
        layout.addView(title);
        TextView hint = new TextView(activity);
        hint.setText("두 손가락으로 확대 · 끌어서 이동 · 두 번 눌러 확대");
        hint.setTextSize(12);
        hint.setTextColor(Color.rgb(104, 102, 95));
        layout.addView(hint);
        ZoomView image = new ZoomView(activity, bitmap);
        image.setContentDescription(date + " 브리핑 확대 이미지");
        layout.addView(image, new LinearLayout.LayoutParams(-1, 0, 1));
        LinearLayout controls = new LinearLayout(activity);
        controls.setGravity(Gravity.CENTER);
        String[] labels = {"축소", "확대", "맞춤", "닫기"};
        for (int i = 0; i < labels.length; i++) {
            final int index = i;
            Button button = new Button(activity);
            button.setText(labels[i]);
            button.setTextSize(13);
            button.setTextColor(Color.rgb(36, 84, 214));
            button.setMinWidth(0);
            controls.addView(button, new LinearLayout.LayoutParams(0, -2, 1));
            button.setOnClickListener(v -> {
                if (index == 0) image.zoom(1 / 1.5f, image.getWidth() / 2f, image.getHeight() / 2f);
                else if (index == 1) image.zoom(1.5f, image.getWidth() / 2f, image.getHeight() / 2f);
                else if (index == 2) image.fit();
                else dialog.dismiss();
            });
        }
        layout.addView(controls);
        dialog.setContentView(layout);
        Window window = dialog.getWindow();
        if (window != null && (activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE) != 0) {
            window.addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        }
        dialog.show();
        if (window != null) window.setLayout(-1, -1);
    }

    private static final class ZoomView extends View {
        private final Bitmap bitmap;
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        private final ScaleGestureDetector scaler;
        private final GestureDetector gestures;
        private float scale = 1, minimum = 1, x, y;

        ZoomView(Activity activity, Bitmap bitmap) {
            super(activity);
            this.bitmap = bitmap;
            setClickable(true);
            scaler = new ScaleGestureDetector(activity, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
                @Override public boolean onScale(ScaleGestureDetector detector) {
                    zoom(detector.getScaleFactor(), detector.getFocusX(), detector.getFocusY());
                    return true;
                }
            });
            gestures = new GestureDetector(activity, new GestureDetector.SimpleOnGestureListener() {
                @Override public boolean onDown(MotionEvent event) { return true; }
                @Override public boolean onSingleTapUp(MotionEvent event) { performClick(); return true; }
                @Override public boolean onDoubleTap(MotionEvent event) {
                    if (scale > minimum * 1.1f) fit();
                    else zoom(2.5f, event.getX(), event.getY());
                    return true;
                }
                @Override public boolean onScroll(MotionEvent first, MotionEvent current, float dx, float dy) {
                    if (!scaler.isInProgress()) { x -= dx; y -= dy; constrain(); invalidate(); }
                    return true;
                }
            });
        }

        @Override protected void onSizeChanged(int w, int h, int oldw, int oldh) { fit(); }
        void fit() {
            if (getWidth() == 0 || getHeight() == 0) return;
            minimum = Math.min(getWidth() / (float) bitmap.getWidth(), getHeight() / (float) bitmap.getHeight());
            scale = minimum;
            x = (getWidth() - bitmap.getWidth() * scale) / 2;
            y = (getHeight() - bitmap.getHeight() * scale) / 2;
            setContentDescription("브리핑 확대 이미지 · 맞춤 100%");
            invalidate();
        }
        void zoom(float factor, float focusX, float focusY) {
            float next = Math.max(minimum, Math.min(minimum * 8, scale * factor));
            float ratio = next / scale;
            x = focusX - (focusX - x) * ratio;
            y = focusY - (focusY - y) * ratio;
            scale = next;
            setContentDescription("브리핑 확대 이미지 · 확대 " + Math.round(scale / minimum * 100) + "%");
            constrain();
            invalidate();
        }
        private void constrain() {
            float w = bitmap.getWidth() * scale, h = bitmap.getHeight() * scale;
            x = w <= getWidth() ? (getWidth() - w) / 2 : Math.min(0, Math.max(getWidth() - w, x));
            y = h <= getHeight() ? (getHeight() - h) / 2 : Math.min(0, Math.max(getHeight() - h, y));
        }
        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            canvas.save();
            canvas.translate(x, y);
            canvas.scale(scale, scale);
            canvas.drawBitmap(bitmap, 0, 0, paint);
            canvas.restore();
        }
        @Override public boolean onTouchEvent(MotionEvent event) {
            scaler.onTouchEvent(event);
            gestures.onTouchEvent(event);
            return true;
        }
        @Override public boolean performClick() { super.performClick(); return true; }
    }
}
