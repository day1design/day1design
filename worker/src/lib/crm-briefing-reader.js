import { jsonOk, jsonError } from './response.js';
const MAX_IMAGE=2*1024*1024,MAX_REPORT=256*1024;
const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
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
  const query=p?"SELECT id,EndDate,RequestedAt,ReportKey,ImageKey,Status FROM BriefRuns WHERE ReportKind='daily' AND EndDate BETWEEN ? AND ? ORDER BY RequestedAt DESC,id DESC LIMIT 1":"SELECT id,EndDate,RequestedAt,ReportKey,ImageKey,Status FROM BriefRuns WHERE ReportKind='daily' ORDER BY RequestedAt DESC,id DESC LIMIT 1";
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
 return jsonOk({available:true,id:row.id,report_date:row.EndDate,published_at:row.RequestedAt||null,analysis,image_path:row.ImageKey?'/api/mobile/briefings/'+row.id+'/image':null,status:row.Status});
}
