import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { startServer } from '../server/index.mjs';

test('HTTP server: healthy, secure, functional without external service or AI key', async t => {
  const server = startServer(0);
  await once(server, 'listening');
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
  const html = await fetch(base);
  assert.equal(html.status, 200);
  assert.match(html.headers.get('content-security-policy'), /default-src 'self'/);
  assert.match(await html.text(), /Urban|airwise/i);
  const demo = await fetch(`${base}/api/demo`);
  const sample = await demo.json();
  assert.equal(sample.air.sourceType, 'simulation');
  assert.equal(sample.plan.category.level, 3);
  assert.equal(sample.choices.choices.length, 4);
  assert.equal(sample.community.length, 3);
  const plan = await fetch(`${base}/api/plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ simulation: true, profile: { children: true, commute: 'scooter' } }) });
  assert.equal(plan.status, 200);
  const planned = await plan.json();
  assert.ok(planned.plan.recommendations.find(x => x.id === 'children'));
  assert.ok(planned.choices.choices.some(x => x.id === 'active'));
  const cadr = await fetch(`${base}/api/cadr?area=15`);
  assert.equal((await cadr.json()).suggestedCadrM3h, 190);
  const invalidCadr = await fetch(`${base}/api/cadr?area=-8`);
  assert.equal(invalidCadr.status, 400);
  const chat = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ simulation: true, question: 'What about commuting?' }) });
  const answer = await chat.json();
  assert.equal(chat.status, 200);
  assert.equal(answer.mode, 'rules');
  assert.match(answer.reply, /DEMO ONLY/);
  const impact = await fetch(`${base}/api/travel-impact?distance=8&trips=3&mode=car`);
  assert.equal((await impact.json()).vehicleKilometresNotDriven, 48);
  const invalidImpact = await fetch(`${base}/api/travel-impact?distance=8&trips=3&mode=flight`);
  assert.equal(invalidImpact.status, 400);
  const nullProfile = await fetch(`${base}/api/plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ simulation: true, profile: null }) });
  assert.equal(nullProfile.status, 200);
  const wrong = await fetch(`${base}/../../../server/index.mjs`);
  assert.equal(wrong.status, 404);
  const badInput = await fetch(`${base}/api/plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' });
  assert.equal(badInput.status, 400);
  const invalidCoords = await fetch(`${base}/api/air?lat=100&lon=2`);
  assert.equal(invalidCoords.status, 400);
  const crossOrigin = await fetch(`${base}/api/plan`, { method:'POST', headers: { 'content-type': 'application/json', origin:'https://bad.example' }, body:'{"simulation":true}' });
  assert.equal(crossOrigin.status, 403);
  const wrongMime = await fetch(`${base}/api/plan`, { method:'POST', headers: { 'content-type': 'text/plain' }, body:'{"simulation":true}' });
  assert.equal(wrongMime.status, 415);
  const malformedOrigin = await fetch(`${base}/api/chat`, { method:'POST', headers:{ 'content-type':'application/json', origin:'not a url' }, body:'{"simulation":true,"question":"hello"}' });
  assert.equal(malformedOrigin.status, 403);
});

test('HTTP scenario compare is accessible, evidence-bounded, and validates scenario IDs', async t => {
  const server = startServer(0);
  await once(server, 'listening');
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const options = await fetch(`${base}/api/compare-options`);
  assert.equal(options.status, 200);
  assert.equal((await options.json()).options.length, 4);
  const compared = await fetch(`${base}/api/compare`, {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({simulation:true, profile:{children:false}, alternativeId:'child'})
  });
  assert.equal(compared.status, 200);
  const data = await compared.json();
  assert.ok(data.comparison.changes.added.some(a=>a.id==='children'));
  assert.equal(data.comparison.sourceType, 'simulation');
  const unknown = await fetch(`${base}/api/compare`, {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({simulation:true, alternativeId:'fake'})
  });
  assert.equal(unknown.status, 400);
  const crossOrigin = await fetch(`${base}/api/compare`, {
    method:'POST', headers:{'content-type':'application/json', origin:'https://third-party.example'},
    body: JSON.stringify({simulation:true, alternativeId:'child'})
  });
  assert.equal(crossOrigin.status, 403);
});
