import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../worker/index.js',import.meta.url),'utf8')).replace("import { connect } from 'cloudflare:sockets';", 'const connect = () => {};');
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const saved=globalThis.fetch;
try {
 globalThis.fetch=async()=>new Response('error code: 1015',{status:429});
 const res=await worker.fetch(new Request('https://local/api/ai/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({provider:'custom',apiKey:'test-key-1234',model:'test-model',baseUrl:'https://example.com/v1',messages:[{role:'user',content:'hello'}]})}),{});
 const data=await res.json();
 assert.match(data.error,/1015/);
 assert.doesNotMatch(data.error,/前端会改用浏览器直连/);
 assert.match(data.error,/稍后/);
 console.log('PASS rate-limit error does not claim an unperformed retry');
} finally { globalThis.fetch=saved; }
