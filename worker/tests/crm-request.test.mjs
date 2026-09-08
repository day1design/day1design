import assert from 'node:assert/strict';
import test from 'node:test';
import { readCrmJson } from '../src/lib/crm-request.js';
test('streaming parser stops oversized chunks without Content-Length', async()=>{
 let cancelled=false;
 const request=new Request('https://local/',{method:'POST',duplex:'half',body:new ReadableStream({pull(c){c.enqueue(new Uint8Array(16));},cancel(){cancelled=true;}})});
 await assert.rejects(readCrmJson(request,20),/request_too_large/);
 assert.equal(cancelled,true);
});
test('parser validates dictionary JSON and byte lengths',async()=>{
 const req=body=>new Request('https://local/',{method:'POST',body});
 assert.deepEqual(await readCrmJson(req('{"name":"한글"}')),{name:'한글'});
 await assert.rejects(readCrmJson(req('[]')),/invalid_body/);
 await assert.rejects(readCrmJson(req('{"name":"한글"}'),12),/request_too_large/);
});
