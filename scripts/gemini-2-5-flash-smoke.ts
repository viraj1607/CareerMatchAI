/** Approval-gated single application-route request. Never run without explicit approval. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServerClient } from '@supabase/ssr';
import { geminiRequestSchema, validateGeminiResult } from '../src/lib/gemini-analysis';

async function main() {
  assert(process.argv.includes('--approved-one-billable-request'), 'Explicit user approval required before execution');
  process.loadEnvFile('.env.local');
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  assert.equal(new URL(url).hostname,'wxpdchlzlejsfdhabpxy.supabase.co');
  const state=JSON.parse(readFileSync('.env.qa-state.local','utf8'));
  assert.equal(state.project,'wxpdchlzlejsfdhabpxy');
  const account=state.accounts.find((a:{label:string})=>a.label==='CareerMatch QA A');assert(account);
  assert.equal(process.env.GEMINI_MODEL?.trim(),'gemini-2.5-flash');assert(process.env.GEMINI_API_KEY?.trim());
  const path='docs/GEMINI_2_5_FLASH_RESULT.json';assert(!existsSync(path),'Attempt already recorded; do not replay');
  const jar=new Map<string,string>();
  const client=createServerClient(url,key,{cookies:{getAll:()=>Array.from(jar,([name,value])=>({name,value})),setAll:items=>{for(const c of items)jar.set(c.name,c.value);}}});
  const input=geminiRequestSchema.parse({consent:true,resumeText:'Fictional candidate Morgan Reed built Python scripts to validate inventory files for a classroom project.',jobDescription:'Fictional QA role: build Python scripts to validate inventory files.',requirements:[{id:'qa-8a7-python',text:'Python scripting',category:'Technical'}]});
  try {
    const login=await client.auth.signInWithPassword({email:account.email,password:account.password});assert(!login.error&&login.data.user?.id===account.id);
    const result:{status:string;applicationRequests:number;httpStatus?:number;checks:string[];errorCategory?:string;model:string;startedAt:string;elapsedMs?:number;transportName?:string}={status:'ATTEMPT_STARTED',applicationRequests:1,model:'gemini-2.5-flash',startedAt:new Date().toISOString(),checks:[]};
    writeFileSync(path,JSON.stringify(result,null,2)+'\n');
    const started=Date.now();
    try {
      const response=await fetch('http://127.0.0.1:3101/api/gemini/analyze',{method:'POST',redirect:'error',headers:{'content-type':'application/json',cookie:Array.from(jar,([n,v])=>`${n}=${v}`).join('; ')},body:JSON.stringify(input),signal:AbortSignal.timeout(60000)});
      result.httpStatus=response.status;
      const body=await response.json();
      if(!response.ok){result.status='FAILED';result.errorCategory=['CONFIGURATION','TIMEOUT','RATE_LIMIT','AUTHENTICATION','MODEL_UNAVAILABLE','INVALID_RESPONSE','PROVIDER','RATE_LIMIT_UNAVAILABLE','UNAUTHORIZED','AUTH_UNAVAILABLE','INVALID_REQUEST','REQUEST_TIMEOUT'].includes(body?.error?.code)?body.error.code:'UNCLASSIFIED_RESPONSE';}
      else {
        assert.equal(response.status,200);
        const validated=validateGeminiResult(JSON.stringify(body),input);
        for(const [i,r] of validated.requirements.entries()){assert.equal(body.requirements[i].evidenceVerified,r.evidenceVerified);assert.equal(body.requirements[i].unverifiedEvidence,r.unverifiedEvidence);assert.equal(body.requirements[i].evidenceExcerpt,r.evidenceExcerpt);}
        for(const [i,r] of validated.strengths.entries()){assert.equal(body.strengths[i].evidenceVerified,r.evidenceVerified);assert.equal(body.strengths[i].evidenceExcerpt,r.evidenceExcerpt);}
        result.status='PASSED';result.checks=['HTTP 200','Response schema and requirement identity valid','Evidence flags and retained excerpts agree with grounding validator'];
      }
    } catch(error) {result.status='FAILED';result.errorCategory=result.httpStatus?'RESPONSE_VALIDATION_FAILURE':'TRANSPORT_FAILURE';result.transportName=error instanceof Error && ['TimeoutError','AbortError','TypeError','SyntaxError','AssertionError'].includes(error.name)?error.name:'UNCLASSIFIED';}
    result.elapsedMs=Date.now()-started;
    writeFileSync(path,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));if(result.status!=='PASSED')process.exitCode=1;
  } finally {await client.auth.signOut({scope:'local'});jar.clear();}
}
main().catch(()=>{console.error('Blocked or pre-request authentication failure; secrets withheld; inspect approval/attempt guard');process.exitCode=1;});
