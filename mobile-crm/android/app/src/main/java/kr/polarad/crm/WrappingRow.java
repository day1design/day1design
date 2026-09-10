package kr.polarad.crm;

import android.content.Context;
import android.view.View;
import android.view.ViewGroup;

final class WrappingRow extends ViewGroup {
    private final int gap;

    WrappingRow(Context context, int gap) {
        super(context);
        this.gap = gap;
        setClipChildren(false);
    }

    @Override protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
        int available = Math.max(0, MeasureSpec.getSize(widthMeasureSpec) - getPaddingLeft() - getPaddingRight());
        for (int i = 0; i < getChildCount(); i++) {
            View child = getChildAt(i);
            child.measure(MeasureSpec.makeMeasureSpec(available, MeasureSpec.AT_MOST), MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED));
        }
        int lineWidth = 0, lineHeight = 0, totalHeight = getPaddingTop() + getPaddingBottom();
        for (int i = 0; i < getChildCount(); i++) {
            View child = getChildAt(i);
            int childWidth = child.getMeasuredWidth(), childHeight = child.getMeasuredHeight();
            if (lineWidth > 0 && lineWidth + gap + childWidth > available) {
                totalHeight += lineHeight + gap;
                lineWidth = 0;
                lineHeight = 0;
            }
            lineWidth += (lineWidth == 0 ? 0 : gap) + childWidth;
            lineHeight = Math.max(lineHeight, childHeight);
        }
        totalHeight += lineHeight;
        setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), resolveSize(totalHeight, heightMeasureSpec));
    }

    @Override protected void onLayout(boolean changed, int left, int top, int right, int bottom) {
        int available = right - left - getPaddingLeft() - getPaddingRight();
        int rowStart=0, y=getPaddingTop();
        while(rowStart<getChildCount()) {
            int rowEnd=rowStart, rowWidth=0, rowHeight=0;
            while(rowEnd<getChildCount()) {
                View child=getChildAt(rowEnd);
                int nextWidth=rowWidth+(rowEnd>rowStart?gap:0)+child.getMeasuredWidth();
                if(rowEnd>rowStart && nextWidth>available)break;
                rowWidth=nextWidth;rowHeight=Math.max(rowHeight,child.getMeasuredHeight());rowEnd++;
            }
            int x=getPaddingLeft();
            for(int i=rowStart;i<rowEnd;i++) {
                View child=getChildAt(i);int childTop=y+(rowHeight-child.getMeasuredHeight())/2;
                child.layout(x,childTop,x+child.getMeasuredWidth(),childTop+child.getMeasuredHeight());
                x+=child.getMeasuredWidth()+gap;
            }
            y+=rowHeight+gap;rowStart=rowEnd;
        }
    }
}
