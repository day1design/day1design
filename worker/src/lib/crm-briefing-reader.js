import { jsonOk, jsonError } from './response.js';
const MAX_IMAGE=2*1024*1024,MAX_REPORT=256*1024,MAX_SNAPSHOT=256*1024;
const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
const MAX_METRICS=8,MAX_CHANNELS=6;
function finite(value){if(value===null||value===undefined||typeof value==='boolean'||(typeof value==='string'&&!value.trim()))return null;const number=Number(value);return Number.isFinite(number)?number:null;}
function dateShift(date,days){const value=new Date(`${date}T00:00:00Z`);value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);}
function actualAggregate(snapshot,date,previous=false){
 const day=snapshot?.day,range=day?.range;
 if(!day||(!previous&&(range?.startDate!==date||range?.endDate!==date))||(previous&&(day.ads?.efficiency?.previous?.startDate!==date||day.ads?.efficiency?.previous?.endDate!==date)))return null;
 const source=previous?day.ads?.efficiency?.prevTotals:day.ads?.summary;
 if(!source||typeof source!=='object')return null;
 const leadRow=!previous&&Array.isArray(day.leads?.daily)?day.leads.daily.find(row=>row?.day===date):null;
 const traffic=!previous&&day.traffic?.summary&&typeof day.traffic.summary==='object'?day.traffic.summary:null;
 const spend=finite(source.spend),impressions=finite(source.impressions),clicks=finite(source.clicks),leads=finite(source.leads);
 if([spend,impressions,clicks,leads].every(value=>value===null))return null;
 return {hasData:true,spend,impressions,clicks,leads,saved:leadRow?finite(leadRow.n):null,sessions:traffic?finite(traffic.sessions):null,ctr:finite(source.ctr),cpc:finite(source.cpc),cpm:finite(source.cpm),cpl:finite(source.cpl)};
}
function label(value){const text=String(value??'').replace(/[^\p{L}\p{N} _-]/gu,'').trim().slice(0,80);return text&& !/@|\d{4,}/.test(text)?text:null;}
function visualization(snapshot,reportDate){
 if(!snapshot||snapshot.reportDate!==reportDate||snapshot.day?.ok!==true)return null;
 const current=actualAggregate(snapshot,reportDate);if(!current?.hasData)return null;const previousDate=snapshot.day.ads?.efficiency?.previous?.startDate||dateShift(reportDate,-1),previous=actualAggregate(snapshot,previousDate,true);
 const metricDefs=[['spend','광고비',current.spend,'USD'],['impressions','노출수',current.impressions,'건'],['clicks','클릭수',current.clicks,'건'],['ctr','클릭률',current.ctr===null?null:current.ctr*100,'%'],['cpl','CPL',current.cpl,'USD'],['cpc','CPC',current.cpc,'USD'],['cpm','CPM',current.cpm,'USD'],['saved','접수',current.saved,'건']];
 const metrics=metricDefs.slice(0,MAX_METRICS).map(([key,labelText,keyValue,unit])=>({key,label:labelText,value:keyValue===null?null:Number(keyValue.toFixed(4)),unit,currency:unit==='USD'?'USD':undefined,previous:previous?.hasData&&previous[key]!==null?Number((key==='ctr'?previous[key]*100:previous[key]).toFixed(4)):null}));
 const channelMap=new Map();for(const row of Array.isArray(snapshot.day.leads?.bySource)?snapshot.day.leads.bySource:[]){const channel=label(row.source);if(!channel)continue;const count=finite(row.n);if(count===null||count<0)continue;channelMap.set(channel,(channelMap.get(channel)||0)+count);}
 const channels=[...channelMap.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,MAX_CHANNELS).map(([labelText,value])=>({label:labelText,value,unit:'건'}));
 return {metrics,channels,actions:[],period:{start:reportDate,end:reportDate},...(previous?.hasData?{comparison_period:{start:previousDate,end:previousDate}}:{})};
}
function period(request){
 const u=new URL(request.url),start=u.searchParams.get('start')||'',end=u.searchParams.get('end')||'';
 if(!start&&!end)return null;
 if(!DATE_RE.test(start)||!DATE_RE.test(end))throw new Error('invalid briefing period');
 const s=Date.UTC(Number(start.slice(0,4)),Number(start.slice(5,7))-1,Number(start.slice(8,10)));
 const e=Date.UTC(Number(end.slice(0,4)),Number(end.slice(5,7))-1,Number(end.slice(8,10)));
 if(new Date(s).toISOString().slice(0,10)!==start||new Date(e).toISOString().slice(0,10)!==end||s>e||(e-s)/86400000+1>366)throw new Error('invalid briefing period');
 return {start,end};
}
export async function readMobileBriefing(request,env,auth,path){
 if(!path.startsWith('/briefings/'))return null;
 if(request.method!=='GET')return jsonError(405,'method not allowed');
 if(auth.role!=='owner')return jsonError(403,'owner required');
 // Existing BriefRuns belongs exclusively to the Day1 website.
 if(auth.tenant_id!=='day1design')return jsonOk({available:false,reason:'no_report'});
 const latest=path==='/briefings/latest',image=path.match(/^\/briefings\/([A-Za-z0-9_-]{1,120})\/image$/);
 if(!latest&&!image)return jsonError(404,'not found');
 let row;
 if(latest){
  let p;
  try{p=period(request)}catch{return jsonError(400,'invalid briefing period')}
  const query=p?"SELECT id,EndDate,RequestedAt,SnapshotKey,ReportKey,ImageKey,Status FROM BriefRuns WHERE ReportKind='daily' AND EndDate BETWEEN ? AND ? ORDER BY RequestedAt DESC,id DESC LIMIT 1":"SELECT id,EndDate,RequestedAt,SnapshotKey,ReportKey,ImageKey,Status FROM BriefRuns WHERE ReportKind='daily' ORDER BY RequestedAt DESC,id DESC LIMIT 1";
  const stmt=env.DB.prepare(query);
  row=p?await stmt.bind(p.start,p.end).first():await stmt.first();
 }else row=await env.DB.prepare("SELECT id,ImageKey FROM BriefRuns WHERE id=? AND ReportKind='daily'").bind(image[1]).first();
 if(!row)return latest?jsonOk({available:false,reason:'no_report'}):jsonError(404,'not found');
 if(!env.CRM_CACHE)return jsonError(503,'report storage unavailable');
 if(image){
  if(!row.ImageKey)return jsonError(404,'image not available');
  const object=await env.CRM_CACHE.get(row.ImageKey);
  if(!object)return jsonError(404,'image not available');
  if(object.size>MAX_IMAGE)return jsonError(413,'image exceeds limit');
  const bytes=new Uint8Array(await object.arrayBuffer());
  if(bytes.length>MAX_IMAGE)return jsonError(413,'image exceeds limit');
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return jsonOk({mime_type:'image/png',base64:btoa(binary)});
 }
 let analysis='';
 if(row.ReportKey){const object=await env.CRM_CACHE.get(row.ReportKey);if(object){if(object.size>MAX_REPORT)return jsonError(413,'report exceeds limit');analysis=await object.text();if(new TextEncoder().encode(analysis).length>MAX_REPORT)return jsonError(413,'report exceeds limit');}}
 let visualizationData=null;
 if(row.SnapshotKey&&env.CRM_CACHE){const object=await env.CRM_CACHE.get(row.SnapshotKey);if(object&&(!Number.isFinite(object.size)||object.size<=MAX_SNAPSHOT)){try{const text=await object.text();if(new TextEncoder().encode(text).length<=MAX_SNAPSHOT)visualizationData=visualization(JSON.parse(text),row.EndDate);}catch{visualizationData=null;}}}
 return jsonOk({available:true,id:row.id,report_date:row.EndDate,published_at:row.RequestedAt||null,analysis,image_path:row.ImageKey?'/api/mobile/briefings/'+row.id+'/image':null,status:row.Status,visualization:visualizationData});
}
