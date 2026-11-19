/** A recurring daily decision template, NOT booked appointments or measured indoor air.
 * Dates and suggested times are labelled approximate. A lower outdoor model
 * concentration is not the same as a measured personal inhaled dose.
 */
import { buildPlan, normalizeProfile, categoryForUsAqi, SOURCES } from './decisions.mjs';

function localDate(iso, timezone) {
  try {
    return new Intl.DateTimeFormat('en-GB', { year:'numeric', month:'2-digit', day:'2-digit', timeZone:timezone })
      .format(new Date(iso));
  } catch { return new Date(iso).toISOString().slice(0,10); }
}
function clock(hour) { return `${String(hour).padStart(2,'0')}:00`; }
const cost = { outdoor:'free', family:'free', home:'free / existing equipment', travel:'varies' };
function item(id, time, activity, recommendation, impactCategory, caveats = []) {
  return {
    id, approximateTime: time, activity,
    title: recommendation.title, action: recommendation.action, reason: recommendation.why,
    impactCategory, impactValueOrNull: null, unitOrNull: null,
    costBand: cost[recommendation.category] || 'varies', feasible: true,
    confidence: 'qualitative', evidenceIds: [recommendation.source],
    limitations: [...caveats, 'This is a suggested routine template, not an appointment or measured outcome.']
  };
}
export function buildDailyRoutine(air, profile={}, timezone='UTC', now=Date.now()) {
  const p = normalizeProfile(profile);
  const plan = buildPlan(air, p, timezone, now);
  const byId = new Map(plan.recommendations.map(x=>[x.id,x]));
  const result=[];
  const add=(id,hour,activity,kind,limit=[])=>{
    const r=byId.get(id);
    if (r && result.length<6) result.push(item(id,clock(hour),activity,r,kind,limit));
  };
  const category=categoryForUsAqi(air?.current?.aqi);
  add('outdoor', p.usualHour, 'Before going outdoors', 'outdoor-exposure', [plan.timingNotice]);
  if (p.children) add('children',p.outdoorHour,'School / play check','outdoor-exposure', ['Follow school or official notices for required activities.']);
  if (p.extraCare && !p.children) add('care',p.usualHour,'Personal precautions','care-support');
  add('commute',p.usualHour,'Travel decision','transport-emissions', ['Cleaner-emissions travel is not automatically lower personal exposure.']);
  add('indoor-source',p.cookingHour,'Cooking and home sources','indoor-source-control', ['Manage cooking fumes and necessary fresh-air ventilation safely.']);
  if (p.home==='fan') add('fan',p.cookingHour,'Fan and filtration check','indoor-filtration');
  else add('filtration',p.cookingHour,'Indoor filtration check','indoor-filtration');
  if (category.level>=2) add('windows',p.cookingHour,'Ventilation check','indoor-ventilation');
  if (plan.comparison) {
    const entry=result.find(x=>x.id==='outdoor');
    if (entry) {
      entry.impactCategory='modelled-outdoor-pm25-comparison';
      entry.impactValueOrNull=plan.comparison.deltaPm25;
      entry.unitOrNull='µg/m³ difference in forecast outdoor PM2.5';
      entry.confidence='modelled comparison only';
      entry.limitations.push(plan.comparison.explanation);
      entry.alternativeModelTime=plan.comparison.alternativeTime;
    }
  }
  return {
    kind:'recurring-routine-template',
    date:localDate(new Date(now).toISOString(),timezone), timezone,
    dataProvenance:{source:air?.source ?? 'unknown', sourceType:air?.sourceType ?? 'unknown', index:air?.index ?? 'unknown',
      modelTime:air?.current?.time ?? null, retrievedAt:air?.retrievedAt ?? null},
    personaUsed:p, items:result,
    unavailableInputs:[...(p.maxShiftMinutes<60 ? ['Sub-hour shifts cannot be evaluated with hourly forecast resolution.'] : [])],
    generalWarnings:[...plan.disclaimers,'No actual indoor concentrations, personal dose or disease-risk reduction is measured.']
  };
}
export function createCommunityBrief(air, profile={}, timezone='UTC', now=Date.now()) {
  const plan=buildPlan(air,profile,timezone,now);
  const c=plan.category;
  const community=plan.recommendations.filter(x=>['outdoor','indoor-source','commute'].includes(x.id));
  return {
    title:'VayuDesha community air briefing',
    date:localDate(new Date(now).toISOString(),timezone), timezone,
    sourceType:air?.sourceType ?? 'unknown', source:air?.source ?? 'unknown', index:air?.index ?? 'unknown',
    modelTimestamp:air?.current?.time ?? null, value:air?.current?.aqi ?? null,
    category:c.name,
    actions:community.map(x=>({title:x.title, action:x.action, evidenceUrl:x.source})),
    disclaimer:'Share as general informational guidance only. No household details, person identifiers or legal restriction claims are included. A GRAP stage requires a dated official CAQM order, not inference from AQI.',
    simulated:air?.sourceType==='simulation'
  };
}
