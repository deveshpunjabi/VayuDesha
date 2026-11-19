import test from 'node:test';
import assert from 'node:assert/strict';
import { getSimulatedAir } from '../server/air.mjs';
import { getAssistantReply, parseSelectedActions } from '../server/ai.mjs';
import { buildPlan } from '../server/decisions.mjs';

const mockedResponse = value => ({ ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: value }] }] }) });
async function withMockKey(fn) {
  const before = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'synthetic-test-only';
  try { return await fn(); }
  finally { if (before === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = before; }
}

test('Structured AI selects approved evidence-only action IDs and the server writes the response', async () => withMockKey(async () => {
  let calls = 0;
  const mock = async (url, options) => {
    calls++;
    assert.match(url, /api\.openai\.com\/v1\/responses/);
    const payload = JSON.parse(options.body);
    assert.equal(payload.store, false);
    assert.equal(payload.text.format.type, 'json_schema');
    assert.equal(payload.text.format.strict, true);
    assert.match(payload.instructions, /Do not invent/);
    assert.match(payload.input, /Synthetic|sample/i);
    return mockedResponse(JSON.stringify({ status: 'supported', actionIds: ['children', 'outdoor'] }));
  };
  const result = await getAssistantReply('Should my child play?', getSimulatedAir(), { children: true }, 'Asia/Kolkata', mock);
  assert.equal(calls, 1);
  assert.equal(result.mode, 'genai');
  assert.match(result.reply, /DEMO ONLY/);
  assert.match(result.reply, /Evidence:/);
  assert.deepEqual(result.evidence.map(a => a.id), ['children', 'outdoor']);
}));

test('A model cannot invent a new medical action ID', async () => withMockKey(async () => {
  const result = await getAssistantReply('Can pollution affect my medicine?', getSimulatedAir(), {}, 'UTC',
    async () => mockedResponse(JSON.stringify({ actionIds: ['stop-my-medicine'] })));
  assert.equal(result.mode, 'fallback');
  assert.doesNotMatch(result.reply, /stop-my-medicine/);
}));

test('Model output is rejected when JSON has extra unapproved fields', () => {
  const plan = buildPlan(getSimulatedAir());
  assert.throws(() => parseSelectedActions(JSON.stringify({ actionIds: ['outdoor'], advice: 'Run outside safely.' }), plan));
  assert.throws(() => parseSelectedActions(JSON.stringify({ actionIds: ['outdoor', 'outdoor'] }), plan));
  assert.throws(() => parseSelectedActions('not-json', plan));
});

test('AI provider outage yields a useful, truthful fallback', async () => withMockKey(async () => {
  const result = await getAssistantReply('How do I commute?', getSimulatedAir(), {}, 'UTC', async () => { throw new Error('test-only provider timeout'); });
  assert.equal(result.mode, 'fallback');
  assert.match(result.note, /checked rules/i);
}));

test('Severe medical symptoms bypass the AI provider entirely', async () => withMockKey(async () => {
  const result = await getAssistantReply('My mother cannot breathe', getSimulatedAir(), {}, 'UTC', async () => { throw new Error('Must not call AI'); });
  assert.equal(result.mode, 'rules');
  assert.match(result.reply, /emergency services immediately/);
}));

test('AI refusal or incomplete output never becomes advice', async () => withMockKey(async () => {
  const result = await getAssistantReply('Is cycling safe today?', getSimulatedAir(), {}, 'UTC', async () => ({ ok: true, json: async () => ({ status: 'incomplete', output: [] }) }));
  assert.equal(result.mode, 'fallback');
}));
