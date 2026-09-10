package kr.polarad.crm;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

final class ScheduleCard {
    private ScheduleCard() { }

    static View create(Context context,String name,String time,boolean measurement,String location,String branch,boolean cancelled,Runnable open) {
        return create(context,name,time,"",measurement,location,branch,cancelled,open);
    }

    static View create(Context context,String name,String time,String dateLabel,boolean measurement,String location,String branch,boolean cancelled,Runnable open) {
        LinearLayout card=new LinearLayout(context);card.setGravity(Gravity.CENTER_VERTICAL);
        card.setBackground(background(context,Color.WHITE,6,Color.rgb(220,224,228)));card.setClipToOutline(true);card.setMinimumHeight(dp(context,92));
        LinearLayout rail=column(context);rail.setGravity(Gravity.CENTER);rail.setPadding(dp(context,7),dp(context,dateLabel.isEmpty()?14:9),dp(context,7),dp(context,9));rail.setBackgroundColor(Color.rgb(measurement?8:36,measurement?127:84,measurement?115:214));
        if(!dateLabel.isEmpty())rail.addView(text(context,dateLabel,11,Color.WHITE,false));
        rail.addView(text(context,time,19,Color.WHITE,true));TextView kind=text(context,measurement?"실측":"상담",12,Color.WHITE,false);LinearLayout.LayoutParams typeParams=new LinearLayout.LayoutParams(-2,-2);typeParams.topMargin=dp(context,5);rail.addView(kind,typeParams);card.addView(rail,new LinearLayout.LayoutParams(dp(context,76),-1));
        LinearLayout detail=column(context);detail.setPadding(dp(context,12),dp(context,12),dp(context,12),dp(context,12));WrappingRow heading=new WrappingRow(context,dp(context,8));
        TextView customerName=text(context,name.isEmpty()?"고객명 미확인":name,15,Color.rgb(37,42,48),true);customerName.setMinWidth(0);customerName.setMaxLines(Integer.MAX_VALUE);customerName.setEllipsize(null);
        heading.addView(customerName);
        if(!branch.isEmpty()){boolean pangyo=branch.contains("판교점");TextView badge=text(context,branch,12,pangyo?Color.WHITE:Color.rgb(18,61,53),true);badge.setPadding(dp(context,9),dp(context,3),dp(context,9),dp(context,3));badge.setBackground(background(context,pangyo?Color.rgb(185,154,114):Color.rgb(163,228,217),4,Color.TRANSPARENT));heading.addView(badge);}
        detail.addView(heading);TextView place=text(context,location.isEmpty()?"장소 미입력":location,12,Color.rgb(98,106,116),false);LinearLayout.LayoutParams placeParams=new LinearLayout.LayoutParams(-1,-2);placeParams.topMargin=dp(context,5);detail.addView(place,placeParams);
        if(cancelled)detail.addView(text(context,"취소된 일정",11,Color.rgb(98,106,116),false));card.addView(detail,new LinearLayout.LayoutParams(0,-2,1));card.setOnClickListener(v->open.run());card.setFocusable(true);return card;
    }

    private static LinearLayout column(Context context){LinearLayout view=new LinearLayout(context);view.setOrientation(LinearLayout.VERTICAL);return view;}
    private static TextView text(Context context,String value,int size,int color,boolean bold){TextView view=new TextView(context);view.setText(value);view.setTextSize(size);view.setTextColor(color);view.setTypeface(Typeface.DEFAULT,bold?Typeface.BOLD:Typeface.NORMAL);return view;}
    private static GradientDrawable background(Context context,int color,int radius,int border){GradientDrawable view=new GradientDrawable();view.setColor(color);view.setCornerRadius(dp(context,radius));if(border!=Color.TRANSPARENT)view.setStroke(dp(context,1),border);return view;}
    private static int dp(Context context,int value){return Math.round(value*context.getResources().getDisplayMetrics().density);}

}
