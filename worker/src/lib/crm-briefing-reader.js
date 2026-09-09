import { jsonOk, jsonError } from './response.js';
const MAX_IMAGE=2*1024*1024,MAX_REPORT=256*1024;
export async function readMobileBriefing(request,env,auth,path){
 if(!path.startsWith('/briefings/'))return null;
 if(request.method!=='GET')return jsonError(405,'method not allowed');
 if(auth.role!=='owner')return jsonError(403,'owner required');
 // Existing BriefRuns belongs exclusively to the Day1 website.
 if(auth.tenant_id!=='day1design')return jsonOk({available:false,reason:'no_report'});
 const latest=path==='/briefings/latest',image=path.match(/^\/briefings\/([A-Za-z0-9_-]{1,120})\/image$/);
 if(!latest&&!image)return jsonError(404,'not found');
 const row=latest?await env.DB.prepare("SELECT id,EndDate,ReportKey,ImageKey,Status FROM BriefRuns WHERE ReportKind='daily' ORDER BY RequestedAt DESC,id DESC LIMIT 1").first():await env.DB.prepare("SELECT id,ImageKey FROM BriefRuns WHERE id=? AND ReportKind='daily'").bind(image[1]).first();
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
 return jsonOk({available:true,id:row.id,report_date:row.EndDate,analysis,image_path:row.ImageKey?'/api/mobile/briefings/'+row.id+'/image':null,status:row.Status});
}
