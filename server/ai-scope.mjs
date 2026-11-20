/**
 * Deterministic safety-boundary regex matchers, domain gateway rules,
 * and post-LLM text safety validators for VayuDesha.
 */
import { evidenceUrl } from './evidence.mjs';

export const MIN_SAFE_REPLY_LEN = 20;
export const MAX_SAFE_REPLY_LEN = 900;

export const CLARIFY = 'Ask me anything about today’s air quality, smog conditions, wind dispersion, your commute or school routine, or practical indoor air steps.';
export const UNSUPPORTED = 'I can only help with urban air quality, smog, weather dispersion, daily commute or school routines, and indoor air protection. I cannot generate code, create images, or answer unrelated topics.';
export const EMERGENCY = 'Severe trouble breathing, severe chest pain, or unresponsiveness can be emergencies. Contact local emergency services immediately; do not rely on this app for diagnosis or emergency care.';

const EMERGENCY_RE = /(?:can't breathe|cannot breathe|difficulty breathing|struggling to breathe|severe shortness of breath|severe chest pain|chest pain with breathing trouble|unconscious|unresponsive|not breathing|blue lips|fainted and not waking|child (?:is )?wheezing (?:severely|and cannot breathe))/i;
const MEDICATION_STOP_RE = /\b(?:stop|skip|quit|discontinue|pause)\s+(?:taking\s+)?(?:(?:my|your|the|prescribed)\s+)*(?:inhaler|medication|medicine|asthma\s+(?:meds?|inhaler|medication))\b/i;
const GRAP_LEGAL_RE = /\b(?:grap\s+(?:restrictions?|stage|order|rules?|today)|delhi\s+government\s+order|official\s+government\s+order|generate\s+(?:an?\s+)?(?:actual\s+)?(?:delhi\s+)?(?:government|caqm|grap)\s+order)\b/i;
const INDEX_CONFUSION_RE = /\b(?:cpcb\s+aqi\s+(?:is|equals?|=)\s+(?:the\s+same|identical|equal)\s+(?:as|to)\s+(?:us|u\.s\.)\s+aqi|(?:us|u\.s\.)\s+aqi\s+(?:is|equals?|=)\s+(?:the\s+same|identical|equal)\s+(?:as|to)\s+cpcb)\b/i;
const PERSONAL_RISK_RE = /\b(?:disease\s+risk\s+drop|percent(?:age)?\s+(?:health|risk|dose)\s+(?:drop|reduction|saved)|100\s*%\s*(?:guaranteed\s+)?safe\s+indoors|guaranteed\s+safe\s+indoors)\b/i;
const CO2_WITHOUT_DATA_RE = /\b(?:precise\s+co2|exact\s+co2|co2\s+savings?\s+without\s+vehicle)\b/i;
const EXACT_ADDRESS_RE = /\b(?:exact\s+(?:home\s+)?address|house\s+exact\s+address|street[- ]level\s+safe\s+route)\b/i;
const MINUTE_SHIFT_RE = /\b(?:safest\s+minute|15[- ]minute\s+shift.*(?:safest|best)\s+(?:minute|time)|minute[- ]by[- ]minute\s+(?:aqi|forecast))\b/i;
const CODE_OR_IMAGE_GATEWAY_RE = /\b(?:(?:write|generate|create|debug|fix|compile|run|execute|build)\s+(?:me\s+)?(?:a\s+|an\s+|some\s+|the\s+)?(?:code|script|program|function|sql|python|javascript|typescript|java|c\+\+|c#|rust|golang|html|css|bash|powershell|regex|app|website|api)|(?:generate|create|draw|make|render|paint|sketch|edit)\s+(?:me\s+)?(?:a\s+|an\s+|some\s+|the\s+)?(?:image|picture|photo|illustration|painting|logo|icon|poster|wallpaper|video|audio|song|music|voice|avatar|ascii\s+art)|leetcode|quicksort|binary\s+tree|react\s+component|dockerfile|midjourney|dall-?e|stable\s+diffusion)\b/i;
const OTHER_DOMAIN_RE = /\b(?:stock\s+market|crypto(?:currency)?|bitcoin|ethereum|forex|football|cricket\s+scores?|fifa|nba|movie\s+tickets?|(?:write|tell\s+me|compose|draft)\s+(?:a\s+|an\s+)?(?:poem|joke|essay|story|novel|haiku|riddle|email|resume|cover\s+letter|blog\s+post)|programming\s+interview|password\s+hack|horoscope|astrology|recipes?\s+for\s+dinner|solve\s+(?:this\s+)?(?:equation|integral|math)|translate\s+(?:this|into)|who\s+is\s+the\s+(?:president|prime\s+minister))\b/i;
const SUPPORTED_RE = /\b(?:air|aqi|smog|pollut(?:ion|ants?|ed)|pm2?\.?5|pm10|no2|o3|so2|co\b|ozone|nitrogen|sulfur|carbon\s+monoxide|breath|outdoor|indoor|window|ventilat(?:ion|e)|school|child|kids?|play|exercise|jog|run|cycl(?:e|ing)|walking?|walk|scooter|commut(?:e|ing)|travel|driv(?:e|ing)|car|bus|metro|train|transport|emissions?|filter|purif(?:y|ier|ication)|cadr|hepa|fan|room|home|cook(?:ing)?|candles?|incense|work(?:er|place)?|shift|move|reschedul(?:e|ing)|smoke|clean(?:er)?|dust|cost|budget|trip|errands?|carbon|weather|wind|humidity|temperature|inversion|dispersion|climate|heat|grap|cpcb|caqm|openaq|forecast|lungs?|mask|n95|pollution|medicine|medication|inhaler|routine|schedule|morning|evening|today|outside|inside)\b/i;

export const BOUNDARY_REPLIES = Object.freeze({
  medication_boundary: `Do not stop, skip, or change prescribed inhalers or medications based on air-quality forecasts or this app. Follow your clinician's care plan and consult a qualified healthcare professional before changing any treatment.\n\nEvidence: ${evidenceUrl('usAqi')}`,
  legal_boundary: `VayuDesha does not infer active GRAP stages or generate government orders from AQI numbers. Check dated official notices directly from the Commission for Air Quality Management (CAQM) or local authorities.\n\nEvidence: ${evidenceUrl('caqm')}`,
  index_boundary: `India's CPCB National AQI and U.S. AQI are different scales with different category breakpoints and sub-index rules. VayuDesha displays modelled U.S. AQI from Open-Meteo/Copernicus CAMS—never official Indian CPCB station readings.\n\nEvidence: ${evidenceUrl('usAqi')} · ${evidenceUrl('cpcb')}`,
  risk_boundary: `VayuDesha cannot guarantee 100% safe indoor air or calculate personal inhaled dose or disease-risk reduction percentages. Indoor particle levels depend on building leakage, indoor sources, and room-level filtration, which this app does not measure.\n\nEvidence: ${evidenceUrl('cleanerRoom')}`,
  emissions_boundary: `VayuDesha cannot calculate precise CO₂ savings without verified vehicle fuel type, efficiency, and replacement-trip data. Use the travel tool to track avoided vehicle-kilometres transparently instead.\n\nEvidence: ${evidenceUrl('transport')}`,
  privacy_boundary: `Please do not enter your exact home address. VayuDesha uses regional city-scale modelled forecasts (Open-Meteo/CAMS) and cannot measure street-level or house-level air quality or certify a street-safe route.\n\nEvidence: ${evidenceUrl('camS')}`,
  resolution_boundary: `Hourly regional air-quality forecasts cannot identify a "safest minute" or substantiate a 15-minute departure shift. When schedule flexibility is under an hour, focus on feasible exertion or indoor-source steps rather than micro-timing.\n\nEvidence: ${evidenceUrl('camS')}`
});

const SCOPE_MATCHERS = Object.freeze([
  [EMERGENCY_RE, 'emergency'],
  [MEDICATION_STOP_RE, 'medication_boundary'],
  [GRAP_LEGAL_RE, 'legal_boundary'],
  [INDEX_CONFUSION_RE, 'index_boundary'],
  [PERSONAL_RISK_RE, 'risk_boundary'],
  [CO2_WITHOUT_DATA_RE, 'emissions_boundary'],
  [EXACT_ADDRESS_RE, 'privacy_boundary'],
  [MINUTE_SHIFT_RE, 'resolution_boundary']
]);

/**
 * Classifies an incoming user question against deterministic safety boundaries and domain scope.
 * @param {string} question
 * @returns {string}
 */
export function questionScope(question) {
  const q = String(question ?? '').trim();
  for (const [pattern, scope] of SCOPE_MATCHERS) {
    if (pattern.test(q)) return scope;
  }
  if (CODE_OR_IMAGE_GATEWAY_RE.test(q) || OTHER_DOMAIN_RE.test(q)) return 'unsupported';
  if (q.length < 4 || !SUPPORTED_RE.test(q)) return 'needs_clarification';
  return 'supported';
}

/**
 * Checks whether generated text contains prohibited percentages, scale conflation, or unsafe claims.
 * @param {string} text
 * @param {Record<string, any>|null} air
 * @returns {boolean}
 */
export function rejectUnsafeGeneratedText(text, air) {
  if (/\b\d+(?:\.\d+)?\s*%/.test(text)) return true;
  if (/(?:Indian|India's|National|CPCB)\s+(?:national\s+)?AQI\s*(?:is|=|:)\s*\d/i.test(text)) return true;
  if (/\b(?:stop|skip|discontinue)\s+(?:your\s+)?(?:medication|inhaler|prescribed\s+medicine)\b/i.test(text)) return true;
  if (air?.sourceType === 'simulation' && !/\b(?:demo|sample|simulat(?:ed|ion)|synthetic)\b/i.test(text)) return true;
  if (Number.isFinite(air?.current?.aqi) && air.current.aqi > 150 && /\b(?:safe|fine|risk[- ]free)\s+to\s+(?:run|jog|exercise|cycle|play)\s+outdoors\b/i.test(text)) return true;
  return false;
}

/**
 * Validates that a conversational AI reply is safe, plain-text, and free of code/HTML/prohibited claims.
 * @param {string} text
 * @param {Record<string, any>|null} air
 * @returns {boolean}
 */
export function isSafeConversationalReply(text, air) {
  if (!text || text.length < MIN_SAFE_REPLY_LEN || text.length > MAX_SAFE_REPLY_LEN) return false;
  if (/```|<\/?[a-z][\s\S]*?>|!\[.*?\]\(/i.test(text)) return false;
  if (/\b(?:def\s+\w+\(|function\s+\w+\(|SELECT\s+\*\s+FROM|#include\s+<)\b/i.test(text)) return false;
  const candidate = air?.sourceType === 'simulation' ? `DEMO ONLY simulated ${text}` : text;
  return !rejectUnsafeGeneratedText(candidate, air);
}
