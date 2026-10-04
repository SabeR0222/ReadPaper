import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker, { normalizeRecord, applyMutation } from '../backend/worker.mjs';

const origin='https://saber0222.github.io';
const original=JSON.parse(await readFile(new URL('../papers.json',import.meta.url),'utf8'));
const record={...original[0],id:'test-paper',title:'中文标题 · test'};
const env={GITHUB_TOKEN:'test-only-token',EDIT_KEY:'test-editor-password',SESSION_SECRET:'a'.repeat(64),
 GITHUB_REPO:'SabeR0222/ReadPaper',GITHUB_BRANCH:'main',ALLOWED_ORIGINS:origin,READ_PUBLIC:'true',AUTH_LIMITER:{limit:async()=>({success:true})}};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
function request(path,body,token,from=origin){return new Request('https://api.example'+path,{method:body===undefined?'GET':'POST',
 headers:{Origin:from,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});}
async function login(custom=env){const r=await worker.fetch(request('/auth',{key:custom.EDIT_KEY}),custom);assert.equal(r.status,200);return (await r.json()).token;}

test('original records and Chinese metadata survive validation',()=>{assert.equal(original.length,38);for(const p of original)assert.deepEqual(normalizeRecord(p),p);assert.equal(applyMutation(original,{action:'add',record}).papers.length,39)});
test('wrong key, missing configuration, origin and auth rate limit reject safely',async()=>{
 assert.equal((await worker.fetch(request('/auth',{key:'wrong'}),env)).status,401);
 assert.equal((await worker.fetch(request('/auth',null),env)).status,400);
 assert.equal((await worker.fetch(request('/auth',{key:env.EDIT_KEY},null,'https://evil.example'),env)).status,403);
 assert.equal((await worker.fetch(request('/auth',{key:env.EDIT_KEY}),{...env,GITHUB_TOKEN:''})).status,503);
 assert.equal((await worker.fetch(request('/auth',{key:env.EDIT_KEY}),{...env,AUTH_LIMITER:{limit:async()=>({success:false})}})).status,429);
});
test('all writes require an intact, unexpired, origin-bound session',async()=>{
 assert.equal((await worker.fetch(request('/papers',{action:'delete',id:record.id,sha:'1'.repeat(40)}),env)).status,401);
 const token=await login();
 assert.equal((await worker.fetch(request('/papers',{sha:'1'.repeat(40)},token+'bad'),env)).status,401);
 assert.equal((await worker.fetch(request('/papers',{sha:'1'.repeat(40)},token),{...env,SESSION_SECRET:'b'.repeat(64)})).status,401);
 const before=Date.now;Date.now=()=>before()+901000;
 try{assert.equal((await worker.fetch(request('/papers',{sha:'1'.repeat(40)},token),env)).status,401)}finally{Date.now=before}
});
test('add/update/delete/import each write valid UTF-8 JSON and a GitHub commit',async()=>{
 const actualFetch=globalThis.fetch;let papers=structuredClone(original),sha='1'.repeat(40),puts=[];
 globalThis.fetch=async(url,init)=>{
   assert(url.startsWith('https://api.github.com/repos/SabeR0222/ReadPaper/contents/papers.json'));
   assert.equal(init.headers.Authorization,'Bearer test-only-token');
   if(init.method==='PUT'){
     const data=JSON.parse(init.body);assert.equal(data.sha,sha);assert.equal(data.branch,'main');
     papers=JSON.parse(Buffer.from(data.content,'base64').toString('utf8'));puts.push(data.message);sha=String(puts.length+1).repeat(40);
     return json({content:{sha},commit:{sha:'c'.repeat(40)}});
   }
   return json({sha,encoding:'base64',content:Buffer.from(JSON.stringify(papers)).toString('base64')});
 };
 try{
   const token=await login();
   const mutate=async body=>{const r=await worker.fetch(request('/papers',{...body,sha},token),env);assert.equal(r.status,200,await r.clone().text());const result=await r.json();assert.equal(result.sha,sha);assert.equal(result.commit,'c'.repeat(40));assert(!JSON.stringify(result).includes(env.GITHUB_TOKEN));return result};
   await mutate({action:'add',record});assert(papers.some(p=>p.id===record.id));
   await mutate({action:'update',record:{...record,title:'修改后的中文标题'}});assert.equal(papers.find(p=>p.id===record.id).title,'修改后的中文标题');
   await mutate({action:'delete',id:record.id});assert(!papers.some(p=>p.id===record.id));
   await mutate({action:'import',records:[record]});assert(papers.some(p=>p.id===record.id));
   assert.deepEqual(puts.map(x=>x.split(':')[0]),['[papers] add','[papers] update','[papers] delete','[papers] import']);
   const publicRead=await worker.fetch(request('/papers'),env);assert.equal(publicRead.status,200);assert.equal(publicRead.headers.get('cache-control'),'no-store');assert.equal(publicRead.headers.get('access-control-allow-origin'),origin);
   assert.equal((await worker.fetch(request('/papers'),{...env,READ_PUBLIC:'false'})).status,401);
 }finally{globalThis.fetch=actualFetch}
});
test('stale SHA, GitHub write conflict and GitHub failure never report success',async()=>{
 const actualFetch=globalThis.fetch;let mode='stale',puts=0;
 globalThis.fetch=async(url,init)=>{
   if(init.method==='PUT'){puts++;return json({},mode==='conflict'?409:403)}
   return json({sha:'2'.repeat(40),encoding:'base64',content:Buffer.from(JSON.stringify(original)).toString('base64')});
 };
 try{const token=await login();const send=sha=>worker.fetch(request('/papers',{action:'add',record,sha},token),env);
   assert.equal((await send('1'.repeat(40))).status,409);assert.equal(puts,0);
   mode='conflict';assert.equal((await send('2'.repeat(40))).status,409);
   mode='failure';assert.equal((await send('2'.repeat(40))).status,502);
 }finally{globalThis.fetch=actualFetch}
});
test('duplicate IDs, invalid URLs/arrays, unchanged updates and unknown actions are handled',()=>{
 assert.throws(()=>normalizeRecord({...record,url:'javascript:alert(1)'}));
 assert.throws(()=>normalizeRecord({...record,date:'2026-02-31'}));
 assert.throws(()=>normalizeRecord({...record,metrics:['broken']}));
 assert.throws(()=>applyMutation(original,{action:'add',record:original[0]}));
 assert.throws(()=>applyMutation(original,{action:'import',records:[record,record]}));
 assert.throws(()=>applyMutation(original,{action:'overwrite',records:[]}));
});
