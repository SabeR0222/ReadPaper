import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
const records=JSON.parse(await readFile(new URL('../papers.json',import.meta.url),'utf8'));

async function boot(apiBase,fetcher){
 let localWrites=0;const status={};const app={};const alerts=[];
 const context={window:{READPAPER_CONFIG:{apiBase}},URL,Date,Set,Map,JSON,Array,Object,String,Number,Error,AbortSignal,
   localStorage:{getItem:()=>JSON.stringify([{...records[0],title:'older local edit'}]),setItem:()=>{localWrites++}},
   document:{getElementById:id=>id==='app'?app:id==='sync-status'?status:null},fetch:fetcher,
   alert:message=>alerts.push(message),populateSelects(){},populateMethodControls(){},renderList(){}};
 vm.createContext(context);
 const prefix=source.slice(source.indexOf('{')+1,source.indexOf('  const modelOptions'));
 const client=await vm.runInContext('(async()=>{'+prefix+';return {commitChange,verifyEditKey,requireEditKey,getPapers:()=>papers,getSha:()=>remoteSha};})()',context);
 return {client,status,alerts,localWrites:()=>localWrites};
}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
test('canonical remote records override old browser data; failed writes do not mutate records',async()=>{
 let fail=true,posted=[];
 const apiBase='https://api.example';
 const harness=await boot(apiBase,async(url,init)=>{
   if(url.endsWith('/auth'))return json({token:'test-memory-token',expires:Math.floor(Date.now()/1000)+900});
   if(init.method==='POST'){
     posted.push({body:JSON.parse(init.body),authorization:init.headers.Authorization});
     if(fail)return json({error:'version conflict'},409);
     return json({papers:[{...records[0],title:'shared update'},...records.slice(1)],sha:'2'.repeat(40),commit:'c'.repeat(40)});
   }
   return json({papers:records,sha:'1'.repeat(40)});
 });
 assert.equal(harness.client.getPapers()[0].title,records[0].title);
 await harness.client.verifyEditKey('test');
 await assert.rejects(harness.client.commitChange({action:'update',record:records[0]}),/version conflict/);
 assert.equal(harness.client.getPapers()[0].title,records[0].title);assert.equal(harness.client.getSha(),'1'.repeat(40));
 fail=false;await harness.client.commitChange({action:'update',record:records[0]});
 assert.equal(harness.client.getPapers()[0].title,'shared update');assert.equal(harness.client.getSha(),'2'.repeat(40));
 assert.equal(posted[0].body.sha,'1'.repeat(40));assert.equal(posted[0].authorization,'Bearer test-memory-token');assert.equal(harness.localWrites(),0);
});
test('an unconfigured backend stays read-only and never reports a local save',async()=>{
 const harness=await boot('',async()=>json(records));
 assert.equal(harness.client.getPapers().length,38);assert.equal(await harness.client.requireEditKey('添加文章'),false);
 await assert.rejects(harness.client.commitChange({action:'delete',id:records[0].id}),/配置后端/);
 assert.equal(harness.localWrites(),0);assert(harness.alerts[0].includes('尚未配置'));
});
