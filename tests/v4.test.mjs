import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {startServer} from '../server/index.mjs';
import {normalizeProfile,buildPlan,compareRoutine} from '../server/decisions.mjs';
import {buildDailyRoutine,createCommunityBrief} from '../server/routine.mjs';
import {EVIDENCE} from '../server/evidence.mjs';
import {getSimulatedAir} from '../server/air.mjs';
import {questionScope,getAssistantReply,parseSelectedActions} from '../server/ai.mjs';

test('fan-only profile changes advice without pretending a fan filters fine particles',()=>{
  const air=getSimulatedAir();
  const none=buildPlan(air,{home:'none',budget:'free'});
  const fan=buildPlan(air,{home:'fan',budget:'free'});
  assert.ok(!none.recommendations.some(x=>x.id==='fan'));
  const advice=fan.recommendations.find(x=>x.id==='fan');
  assert.ok(advice);
  assert.match(advice.action,/does not capture fine particles/i);
});
test('schedule defaults and caps reflect real maximum flexibility',()=>{
  assert.equal(normalizeProfile({flexibility:'fixed',maxShiftMinutes:120}).maxShiftMinutes,0);
  assert.equal(normalizeProfile({flexibility:'limited',maxShiftMinutes:120}).maxShiftMinutes,15);
  assert.equal(normalizeProfile({flexibility:'flexible',maxShiftMinutes:90}).maxShiftMinutes,90);
  assert.equal(normalizeProfile({flexibility:'flexible',maxShiftMinutes:'oops'}).maxShiftMinutes,120);
});
test('limited/fixed schedules never show a false safer departure hour from hourly model',()=>{
  const now=Date.parse('2026-11-19T06:00:00Z');
  const air={current:{aqi:180},forecast:[
    {time:'2026-11-19T08:00:00Z',aqi:180,pm25:80},
    {time:'2026-11-19T10:00:00Z',aqi:110,pm25:41}
  ]};
  assert.equal(compareRoutine(air.forecast,'UTC',8,now,15),null);
  assert.equal(compareRoutine(air.forecast,'UTC',8,now,120)?.deltaPm25,39);
  assert.match(buildPlan(air,{flexibility:'limited'},'UTC',now).timingNotice,/hourly forecast cannot/);
  assert.ok(buildPlan(air,{flexibility:'flexible'},'UTC',now).comparison);
  assert.ok(!buildPlan(air,{flexibility:'fixed'},'UTC',now).comparison);
});
test('hazardous and missing data demo modes are explicitly synthetic and conservative',()=>{
  const bad=getSimulatedAir(Date.now(),'hazardous');
  assert.equal(bad.current.aqi,355);
  assert.equal(buildPlan(bad).category.name,'Hazardous');
  assert.match(buildPlan(bad).recommendations[0].action,/Avoid optional|Keep necessary/i);
  const missing=getSimulatedAir(Date.now(),'unavailable');
  assert.equal(missing.current.aqi,null);
  assert.equal(buildPlan(missing).category.name,'Unavailable');
  assert.match(buildPlan(missing).recommendations[0].action,/Forecast data are unavailable/);
});
test('routine is a typed, source-labelled context-aware 3–6 step template',()=>{
  const air=getSimulatedAir();
  const family=buildDailyRoutine(air,{children:true,commute:'scooter',home:'fan',flexibility:'limited'},'Asia/Kolkata');
  const worker=buildDailyRoutine(air,{children:false,commute:'transit',home:'none',flexibility:'fixed'},'Asia/Kolkata');
  assert.equal(family.kind,'recurring-routine-template');
  assert.equal(family.dataProvenance.sourceType,'simulation');
  assert.ok(family.items.length>=3&&family.items.length<=6);
  assert.ok(family.items.some(x=>x.id==='fan'));
  assert.ok(family.items.some(x=>x.id==='children'));
  assert.ok(!worker.items.some(x=>x.id==='children'));
  assert.ok(family.items.every(x=>x.evidenceIds[0]?.startsWith('https://')));
  assert.ok(family.items.every(x=>x.impactValueOrNull===null || x.unitOrNull?.includes('forecast')));
});
test('community brief is anonymous, sourced and never claims GRAP stage',()=>{
  const brief=createCommunityBrief(getSimulatedAir(),{children:true,extraCare:true,home:'purifier'});
  assert.equal(brief.simulated,true);
  assert.ok(brief.actions.every(x=>x.evidenceUrl.startsWith('https://')));
  assert.doesNotMatch(JSON.stringify(brief),/children|extraCare|home.*purifier|GRAP Stage-III is active/i);
});
test('all curated evidence entries have publisher, claim scope and HTTPS source',()=>{
  assert.ok(Object.keys(EVIDENCE).length>=9);
  for(const value of Object.values(EVIDENCE)){
    assert.ok(value.publisher&&value.label&&value.supports.length);
    assert.match(value.url,/^https:\/\//);
  }
});
test('assistant can decline irrelevant or unclear questions without AI provider call',async()=>{
  assert.equal(questionScope('Tell me a joke'),'unsupported');
  assert.equal(questionScope('Help'),'needs_clarification');
  assert.equal(questionScope('My child cannot breathe'),'emergency');
  const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='synthetic-test-key';
  try {
    for(const q of ['Tell me a joke','Help','My child cannot breathe']){
      const reply=await getAssistantReply(q,getSimulatedAir(),{},'UTC',async()=>{throw new Error('AI should not be called');});
      assert.equal(reply.mode,'rules');
      assert.notEqual(reply.status,'supported');
    }
  }finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});
test('AI abstention is valid with zero selections, but a bogus supported ID is rejected',()=>{
  const plan=buildPlan(getSimulatedAir());
  assert.deepEqual(parseSelectedActions('{"status":"unsupported","actionIds":[]}',plan),{status:'unsupported',actionIds:[]});
  assert.throws(()=>parseSelectedActions('{"status":"supported","actionIds":[]}',plan));
  assert.throws(()=>parseSelectedActions('{"status":"supported","actionIds":["invented"]}',plan));
});
test('HTTP v4 daily routine and all synthetic scenarios are available',async t=>{
  const server=startServer(0);await once(server,'listening');t.after(()=>server.close());
  const base=`http://127.0.0.1:${server.address().port}`;
  const options=await(await fetch(`${base}/api/scenarios`)).json();
  assert.equal(options.scenarios.length,4);
  const rsp=await fetch(`${base}/api/plan`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({simulation:true,demoScenario:'hazardous',profile:{children:true,home:'fan',flexibility:'limited'}})});
  assert.equal(rsp.status,200);
  const data=await rsp.json();
  assert.equal(data.air.current.aqi,355);
  assert.ok(data.routine.items.some(x=>x.id==='fan'));
  assert.ok(data.communityBrief.disclaimer.includes('GRAP'));
  const invalid=await fetch(`${base}/api/plan`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({simulation:true,demoScenario:'fake'})});
  assert.equal(invalid.status,400);
});

test('indoor clean-air room planner respects cost/equipment/source and avoids false efficacy', async()=>{
  const {buildRoomPlan}=await import('../server/room.mjs');
  const fan=buildRoomPlan({area:15,home:'fan',budget:'free',source:'cooking'});
  assert.equal(fan.smokeCadrEstimate.value,190);
  assert.ok(fan.actions.some(x=>x.id==='fan'));
  assert.ok(!fan.actions.some(x=>x.id==='filtered-room'));
  assert.match(JSON.stringify(fan),/never assume a fan removes fine particles/i);
  const purifier=buildRoomPlan({area:20,home:'purifier',source:'dust'});
  assert.ok(purifier.actions.some(x=>x.id==='existing-filter'));
  assert.ok(!purifier.actions.some(x=>x.id==='cooking'));
  assert.throws(()=>buildRoomPlan({area:' ' }),/Room area/);
  assert.throws(()=>buildRoomPlan({area:500}),/Room area/);
});
test('room planner endpoint returns advice and validates JSON errors',async t=>{
  const server=startServer(0);await once(server,'listening');t.after(()=>server.close());
  const base=`http://127.0.0.1:${server.address().port}`;
  const res=await fetch(`${base}/api/room-plan`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({area:15,home:'fan',source:'incense',budget:'free'})});
  assert.equal(res.status,200);
  assert.ok((await res.json()).roomPlan.actions.some(x=>x.id==='fan'));
  const invalid=await fetch(`${base}/api/room-plan`,{method:'POST',headers:{'content-type':'application/json'},body:'{"area":-15}'});
  assert.equal(invalid.status,400);
});

test('emergency and off-topic routes bypass unavailable air provider entirely',async t=>{
  const server=startServer(0);await once(server,'listening');t.after(()=>server.close());
  const base=`http://127.0.0.1:${server.address().port}`;
  for(const [question,expected] of [['My child cannot breathe','emergency'],['Tell me a joke','unsupported'],['Help','needs_clarification']]){
    const rsp=await fetch(`${base}/api/chat`,{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({lat:999,lon:999,simulation:false,question})});
    assert.equal(rsp.status,200);
    assert.equal((await rsp.json()).status,expected);
  }
});
