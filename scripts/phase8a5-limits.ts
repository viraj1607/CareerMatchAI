/** Approved, bounded live QA tests. Never replay a completed or interrupted run. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env.local');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL!, key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
assert.equal(new URL(url).hostname,'wxpdchlzlejsfdhabpxy.supabase.co');
const state=JSON.parse(readFileSync('.env.qa-state.local','utf8')) as {accounts:{label:string;email:string;password:string;id:string;fixtures:Record<string,string>}[]};
const baseline=JSON.parse(readFileSync('docs/PHASE_8A_5_BASELINE.json','utf8')) as {snapshots:{account:string;table:string;sha256:string}[]};
const mode=process.argv[2]; assert(['rpc','json','records'].includes(mode));
const path=`docs/PHASE_8A_5_${mode.toUpperCase()}_RESULTS.json`;
assert(!existsSync(path),'Run already started; inspect evidence before retry');
const result={mode,status:'RUNNING',rpcAttempts:0,jsonWrites:0,jsonPayloadBytes:0,recordAttempts:0,checks:[] as string[],fixtures:{} as Record<string,string>,errors:[] as string[]};
const save=()=>writeFileSync(path,JSON.stringify(result,null,2)+'\n'); save();
const pass=(s:string)=>{result.checks.push(s);console.log('PASS: '+s);save();};
const clients=state.accounts.map(()=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}));
const anon=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
async function intact(){for(let i=0;i<2;i++) for(const b of baseline.snapshots.filter(x=>x.account===state.accounts[i].label)){const id=b.table==='profiles'?state.accounts[i].id:state.accounts[i].fixtures[b.table];const r=await clients[i].from(b.table).select('*').eq('id',id).single();assert(!r.error&&r.data);assert.equal(createHash('sha256').update(JSON.stringify(r.data)).digest('hex'),b.sha256);const other=await clients[1-i].from(b.table).select('id').eq('id',id);assert(!other.error&&other.data?.length===0);}pass('All ten original snapshots unchanged; cross-user reads denied');}
async function count(i:number){let n=0;for(const t of ['resumes','job_descriptions','match_analyses','job_applications']){const r=await clients[i].from(t).select('id',{count:'exact',head:true});assert(!r.error);n+=r.count!;}return n;}
async function fresh(){while(Date.now()%60000>4000){await new Promise(r=>setTimeout(r,1000));}return Math.floor(Date.now()/60000);}
async function rpc(i:number,scope:unknown,limit:unknown){assert(result.rpcAttempts<50);result.rpcAttempts++;save();return (i<0?anon:clients[i]).rpc('consume_gemini_rate_limit',{p_scope:scope,p_limit:limit});}
async function main(){try{
 for(let i=0;i<2;i++){const a=state.accounts[i];const r=await clients[i].auth.signInWithPassword({email:a.email,password:a.password});assert(!r.error&&r.data.user?.id===a.id&&r.data.user.email_confirmed_at);}pass('Both existing confirmed QA sessions authenticated');await intact();
 if(mode==='rpc'){
 const minute=await fresh();
 for(const [i,s] of [[0,'analysis'],[0,'suggestions'],[1,'analysis'],[1,'suggestions']] as const){for(let j=0;j<6;j++){const r=await rpc(i,s,999);assert(!r.error);assert.equal(r.data,j<5);}pass(`User ${i===0?'A':'B'} ${s}: five allowed, sixth denied; hard cap and independence`);}assert.equal(Math.floor(Date.now()/60000),minute);
 while(Math.floor(Date.now()/60000)===minute) await new Promise(r=>setTimeout(r,1000));
 const next=await fresh();const start=new Date().toISOString();const rs=await Promise.all(Array.from({length:10},()=>rpc(0,'analysis',5)));assert(rs.every(r=>!r.error));assert.equal(rs.filter(r=>r.data===true).length,5);assert.equal(rs.filter(r=>r.data===false).length,5);assert.equal(Math.floor(Date.now()/60000),next);pass(`Ten concurrent calls: five allowed, five denied (${start} to ${new Date().toISOString()})`);
 for(const [i,s,l,code] of [[-1,'analysis',5,'42501'],[0,'unsupported',5,'P0001'],[0,null,5,'P0001'],[0,'analysis','invalid','22P02']] as const){const r=await rpc(i,s,l);assert.equal(r.error?.code,code);pass(`Invalid/anonymous RPC rejected safely: ${code}`);}
 for(const [j,l] of [null,0,-1].entries()){const r=await rpc(1,'analysis',l);assert(!r.error);assert.equal(r.data,j===0);}assert.equal(Math.floor(Date.now()/60000),next);pass('Null, zero, negative limits clamp to one');
 for(let i=0;i<2;i++){const c=clients[i], row={user_id:state.accounts[i].id,scope:'analysis',window_start:new Date(Math.floor(Date.now()/60000)*60000).toISOString(),request_count:1};for(const request of [()=>c.from('gemini_rate_limit_buckets').select('*'),()=>c.from('gemini_rate_limit_buckets').insert(row),()=>c.from('gemini_rate_limit_buckets').update({request_count:1}).eq('user_id',row.user_id),()=>c.from('gemini_rate_limit_buckets').delete().eq('user_id',row.user_id)]){const r=await request();assert.equal(r.error?.code,'42501');}pass(`User ${i===0?'A':'B'} direct bucket SELECT/INSERT/UPDATE/DELETE denied`);}assert.equal(result.rpcAttempts,41);
 }
 if(mode==='json'){
 assert.equal(await count(0),4);const ids={resumes:randomUUID(),job_descriptions:randomUUID(),match_analyses:randomUUID()};result.fixtures=ids;save();
 async function write(table:string,payload:Record<string,unknown>,insert=false,denied=false){assert(result.jsonWrites<30);result.jsonWrites++;result.jsonPayloadBytes+=Buffer.byteLength(JSON.stringify(payload));assert(result.jsonPayloadBytes<=16*1024*1024);save();const q=clients[0].from(table);const r=await (insert?q.insert(payload):q.update(payload).eq('id',ids[table as keyof typeof ids]));if(denied) assert.equal(r.error?.code,'23514');else assert(!r.error,`Unexpected ${table} error ${r.error?.code}`);}
 const owner={user_id:state.accounts[0].id};await write('resumes',{...owner,id:ids.resumes,name:'Phase 8A.5 fictional boundary resume',content:{},original_content:{}},true);await write('job_descriptions',{...owner,id:ids.job_descriptions,job_title:'Phase 8A.5 fictional boundary job',original_description:'Fictional boundary test'},true);await write('match_analyses',{...owner,id:ids.match_analyses,resume_id:ids.resumes,job_description_id:ids.job_descriptions,deterministic_score:75,deterministic_results:{}},true);
 const fields:[keyof typeof ids,string,number][]=[['resumes','content',524288],['resumes','original_content',524288],['job_descriptions','reviewed_requirements',262144],['match_analyses','deterministic_results',524288],['match_analyses','ai_contextual_analysis',262144]];
 for(const [t,f,cap] of fields){for(const bytes of [cap-1,cap]){const value='x'.repeat(bytes-2);await write(t,{[f]:value});const r=await clients[0].from(t).select(f).eq('id',ids[t]).single();assert(!r.error);assert.equal((r.data as unknown as Record<string,unknown>)[f],value);}const before=await clients[0].from(t).select('*').eq('id',ids[t]).single();await write(t,{[f]:'x'.repeat(cap-1)},false,true);const after=await clients[0].from(t).select('*').eq('id',ids[t]).single();assert.deepEqual(after.data,before.data);pass(`${t}.${f}: below/exact/above boundary; rejected update atomic`);}
 await write('match_analyses',{ai_contextual_analysis:null});pass('Nullable AI context accepted');
 await write('resumes',{...owner,id:randomUUID(),name:'Rejected fictional oversized insert',content:'x'.repeat(524287),original_content:{}},true,true);assert.equal(await count(0),7);pass('Oversized insert rejected without partial row');
 const legal='y'.repeat(524286);await Promise.all([write('resumes',{content:legal}),write('resumes',{content:'x'.repeat(524287)},false,true)]);const r=await clients[0].from('resumes').select('content').eq('id',ids.resumes).single();assert(!r.error&&r.data.content===legal);pass('Concurrent legal/oversized updates preserve legal committed value');
 }
 if(mode==='records'){
 assert.equal(await count(1),4);const row=(id:string)=>({id,user_id:state.accounts[1].id,job_title:'Phase 8A.5 fictional quota fixture',company_name:'Fictional QA Company',status:'Interested'});
 for(let batch=0;batch<3;batch++){const rows=Array.from({length:65},()=>row(randomUUID()));result.recordAttempts+=rows.length;save();const r=await clients[1].from('job_applications').insert(rows);assert(!r.error,`Fill rejected ${r.error?.code}`);}assert.equal(await count(1),199);pass('195 fictional applications added; B aggregate count 199');
 result.recordAttempts+=3;save();const rs=await Promise.all(Array.from({length:3},()=>clients[1].from('job_applications').insert(row(randomUUID()))));assert.equal(rs.filter(r=>!r.error).length,1,'Concurrent account cap exceeded');assert.equal(rs.filter(r=>r.error?.code==='23514').length,2);assert.equal(await count(1),200);pass('Three concurrent inserts at 199: one committed, two denied');
 result.recordAttempts++;save();const r=await clients[1].from('job_applications').insert(row(randomUUID()));assert.equal(r.error?.code,'23514');assert.equal(await count(1),200);assert.equal(result.recordAttempts,199);pass('Further insert denied atomically; B remains at 200');
 }
 await intact();result.status='PASSED';
 }catch(e){result.status='FAILED';result.errors.push(e instanceof assert.AssertionError?e.message:'Unexpected runtime/network error; private details withheld');console.error('FAILED: '+result.errors.at(-1));process.exitCode=1;}finally{save();for(const c of clients)await c.auth.signOut();}}
void main();
