/** Deterministic, auditable recommendation engine. No LLM makes safety thresholds. */
import { evidenceUrl } from './evidence.mjs';
export const SOURCES = {
  airnow: evidenceUrl('usAqi'), activity: evidenceUrl('activity'), particleGuide: evidenceUrl('particleGuide'),
  cleanRoom: evidenceUrl('cleanerRoom'), cleaners: evidenceUrl('cleaners'),
  indoor: evidenceUrl('indoor'), who: evidenceUrl('who'), transport: evidenceUrl('transport')
};
export function categoryForUsAqi(value) {
  if (!Number.isFinite(value) || value < 0) return { name: 'Unavailable', tone: 'unknown', level: -1 };
  if (value <= 50) return { name: 'Good', tone: 'good', level: 0 };
  if (value <= 100) return { name: 'Moderate', tone: 'moderate', level: 1 };
  if (value <= 150) return { name: 'Unhealthy for sensitive groups', tone: 'sensitive', level: 2 };
  if (value <= 200) return { name: 'Unhealthy', tone: 'unhealthy', level: 3 };
  if (value <= 300) return { name: 'Very unhealthy', tone: 'very-unhealthy', level: 4 };
  return { name: 'Hazardous', tone: 'hazardous', level: 5 };
}
const modes = new Set(['scooter', 'car', 'transit', 'walk', 'cycle', 'remote']);
const budgets = new Set(['free', 'low', 'flexible']);
const homeOptions = new Set(['none', 'fan', 'purifier']);
const flexOptions = new Set(['flexible', 'limited', 'fixed']);
/** Hourly forecasts cannot reliably distinguish changes inside one hour. */
function allowedShiftMinutes(input) {
  const type = flexOptions.has(input.flexibility) ? input.flexibility : 'limited';
  const cap = type === 'fixed' ? 0 : type === 'limited' ? 15 : 120;
  if (input.maxShiftMinutes == null || String(input.maxShiftMinutes).trim() === '') return cap;
  const requested = Number(input.maxShiftMinutes);
  return Number.isInteger(requested) && requested >= 0 && requested <= 120 ? Math.min(cap, requested) : cap;
}
export function normalizeProfile(input = {}) {
  // Null and unexpected types must not cause a server-side exception.
  if (!input || typeof input !== 'object' || Array.isArray(input)) input = {};
  return {
    children: input.children === true,
    extraCare: input.extraCare === true,
    commute: modes.has(input.commute) ? input.commute : 'transit',
    budget: budgets.has(input.budget) ? input.budget : 'free',
    home: homeOptions.has(input.home) ? input.home : 'none',
    flexibility: flexOptions.has(input.flexibility) ? input.flexibility : 'limited',
    usualHour: Number.isInteger(Number(input.usualHour)) && Number(input.usualHour) >= 7 && Number(input.usualHour) <= 19 ? Number(input.usualHour) : 8,
    outdoorHour: Number.isInteger(Number(input.outdoorHour)) && Number(input.outdoorHour) >= 7 && Number(input.outdoorHour) <= 19 ? Number(input.outdoorHour) : 16,
    cookingHour: Number.isInteger(Number(input.cookingHour)) && Number(input.cookingHour) >= 6 && Number(input.cookingHour) <= 22 ? Number(input.cookingHour) : 19,
    maxShiftMinutes: allowedShiftMinutes(input)
  };
}
function recommendation(id, priority, title, action, why, impact, source, category) {
  return { id, priority, title, action, why, impact, source, category };
}
function hourAt(iso, timezone) {
  try { return Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: timezone }).format(new Date(iso))); }
  catch { return Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'UTC' }).format(new Date(iso))); }
}
export function recommendWindow(forecast = [], timezone = 'UTC', now = Date.now()) {
  const eligible = forecast.filter(point =>
    Number.isFinite(point.aqi) && point.aqi >= 0 &&
    Date.parse(point.time) > now + 45 * 60_000 && Date.parse(point.time) < now + 24 * 3600_000 &&
    hourAt(point.time, timezone) >= 7 && hourAt(point.time, timezone) <= 18
  );
  if (!eligible.length) return null;
  eligible.sort((a, b) => a.aqi - b.aqi || Date.parse(a.time) - Date.parse(b.time));
  const point = eligible[0];
  return { time: point.time, predictedAqi: point.aqi, predictedPm25: point.pm25, label: 'Relatively lowest forecast in the next 24 hours (daylight)' };
}
export function compareRoutine(forecast = [], timezone = 'UTC', usualHour = 8, now = Date.now(), maxShiftMinutes = Infinity) {
  const eligible = forecast.filter(point => Number.isFinite(point.aqi) && Number.isFinite(point.pm25) &&
    Date.parse(point.time) > now + 45 * 60_000 && Date.parse(point.time) < now + 24 * 3600_000 &&
    hourAt(point.time, timezone) >= 7 && hourAt(point.time, timezone) <= 19);
  const baseline = eligible.find(point => hourAt(point.time, timezone) === Number(usualHour));
  if (!baseline) return null;
  const localDay = iso => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)); }
    catch { return iso.slice(0, 10); } };
  const options = eligible.filter(point => localDay(point.time) === localDay(baseline.time) && Math.abs(Date.parse(point.time) - Date.parse(baseline.time)) <= maxShiftMinutes * 60_000);
  options.sort((a,b) => a.aqi - b.aqi || a.pm25 - b.pm25);
  const alternative = options[0];
  if (!alternative || alternative.aqi >= baseline.aqi || alternative.pm25 >= baseline.pm25) return null;
  return { originalTime: baseline.time, alternativeTime: alternative.time, originalPm25: baseline.pm25,
    alternativePm25: alternative.pm25, deltaPm25: Math.round((baseline.pm25 - alternative.pm25) * 10) / 10,
    originalAqi: baseline.aqi, alternativeAqi: alternative.aqi,
    explanation: 'Difference in forecast outdoor PM2.5 concentration for an equal-duration activity, not measured personal exposure, avoided illness, or health impact.' };
}
/** EPA guidance: smoke CADR (cfm) >= 2/3 room area (sq ft); units converted to m3/h per m2. */
export function minimumSmokeCadr(roomAreaM2) {
  const area = typeof roomAreaM2 === 'string' && roomAreaM2.trim() === '' ? NaN : Number(roomAreaM2);
  if (!Number.isFinite(area) || area < 4 || area > 200) throw new Error('Room area must be between 4 and 200 square meters.');
  const ft2PerM2 = 10.7639104167;
  const m3hPerCfm = 1.69901082;
  return Math.ceil((area * ft2PerM2 * (2 / 3) * m3hPerCfm) / 10) * 10;
}
/** Transparent activity bookkeeping, not a carbon-footprint or exposure model. */
export function avoidedMotorizedDistance(oneWayKm, trips = 1, mode = 'car') {
  const km = Number(oneWayKm), days = Number(trips);
  if (!['car', 'scooter'].includes(mode)) throw new Error('Choose a personally operated motorized transport mode.');
  if (!Number.isFinite(km) || km <= 0 || km > 150 || !Number.isInteger(days) || days < 1 || days > 7) {
    throw new Error('Distance must be 0–150 km and round trips must be 1–7.');
  }
  return {
    vehicleKilometresNotDriven: Math.round(km * 2 * days * 10) / 10,
    unit: 'vehicle-km',
    assumption: `${days} round trip(s) of ${km} km one way by ${mode} entirely avoided, without a replacement motorized trip.`,
    caveat: 'This is travel activity avoided, not measured CO₂, air-quality improvement, or personal exposure. Other travel can offset the benefit.'
  };
}
export function buildPlan(air, inputProfile = {}, timezone = 'UTC', now = Date.now()) {
  const p = normalizeProfile(inputProfile);
  const c = categoryForUsAqi(air?.current?.aqi);
  const sensitive = p.children || p.extraCare;
  const recommendations = [];
  if (c.level === -1) recommendations.push(recommendation('outdoor', 'high', 'Check authoritative local reporting', 'Forecast data are unavailable. Check local official advisories before making substantial changes to outdoor activity.', 'Missing data should not be interpreted as clean air.', 'No exposure benefit can be quantified without data.', SOURCES.airnow, 'outdoor'));
  else if (c.level >= 4) recommendations.push(recommendation('outdoor', 'urgent', 'Avoid optional outdoor exertion', p.flexibility === 'fixed' ? 'Keep necessary commitments; avoid optional strenuous outdoor activity and move flexible exercise indoors. Follow local official notices.' : 'Avoid optional strenuous outdoor exercise; move flexible tasks indoors or adjust them within your actual schedule.', 'At very unhealthy or hazardous US AQI levels, exposure is a concern for everyone.', 'May reduce time spent in polluted outdoor air; personal dose reduction cannot be calculated without exposure measurements.', SOURCES.airnow, 'outdoor'));
  else if (c.level >= 3) recommendations.push(recommendation('outdoor', 'high', 'Scale back strenuous outdoor activity', p.flexibility === 'fixed' ? 'Keep required travel, but shorten or reduce optional strenuous outdoor exercise and consider an indoor alternative.' : p.flexibility === 'limited' ? 'Only limited timing changes are feasible; reduce exertion or choose an indoor alternative rather than relying on a 15-minute shift.' : 'Where feasible, shorten or rearrange strenuous outdoor exercise within your allowed timing window.', 'US AQI above 150 is unhealthy for the general population.', 'Reduces opportunity for outdoor pollution exposure; no numeric health benefit is asserted.', SOURCES.airnow, 'outdoor'));
  else if (c.level >= 2 || (sensitive && c.level >= 1)) recommendations.push(recommendation('outdoor', 'high', 'Adjust the outdoor schedule', p.flexibility === 'fixed' ? 'With a fixed schedule, shorten or reduce strenuous outdoor activity when feasible; consider an indoor alternative.' : p.flexibility === 'limited' ? 'You can shift only a short time; do not rely on hourly pollution forecasts to pick a 15-minute safer window. Consider reducing exertion or moving the activity indoors.' : 'If genuinely feasible, move prolonged outdoor activity within your available scheduling window or do it indoors.', 'Children and other sensitive people can be affected at lower AQI levels than the general population.', 'Potentially lowers outdoor exposure, depending on conditions at the actual time and place.', SOURCES.airnow, 'outdoor'));
  else recommendations.push(recommendation('outdoor', 'normal', 'Keep checking before outdoor plans', 'Regular activity may be reasonable based on the AQI category, but check updates and how you feel.', 'AQI is a public-health indicator, not a guarantee that air is risk-free.', 'Improves decision timing; no measured exposure reduction is claimed.', SOURCES.airnow, 'outdoor'));

  if (p.children) recommendations.push(recommendation('children', c.level >= 2 ? 'high' : 'normal', 'Create a flexible school and play routine', 'For higher-pollution periods, ask whether strenuous outdoor play can move indoors. Follow school and local official guidance.', 'Children can be more affected by particle pollution, especially during vigorous activity.', 'Can reduce prolonged outdoor exertion when conditions are poor.', SOURCES.activity, 'family'));
  if (p.extraCare) recommendations.push(recommendation('care', 'high', 'Keep individual care advice in the loop', 'Follow any existing clinician care plan and local public-health alerts; seek medical advice for concerning symptoms.', 'Individual susceptibility varies and the app cannot assess medical conditions.', 'Supports safer planning; does not replace medical care.', SOURCES.airnow, 'family'));
  recommendations.push(recommendation('indoor-source', 'high', 'Cut indoor particle sources', 'Avoid incense, candles and indoor smoking; use damp cleaning instead of stirring up dust. Reduce high-smoke cooking methods when feasible.', 'Indoor combustion and resuspended dust can increase particle levels even when windows are shut.', 'Reduces pollution sources indoors, but the reduction is not numerically measured.', SOURCES.cleanRoom, 'home'));
  if (c.level >= 2) recommendations.push(recommendation('windows', 'high', 'Time ventilation carefully', 'When outdoor air is worse, limit unnecessary open-window time while maintaining safe ventilation. Ventilate when outdoor conditions improve, especially after indoor cooking.', 'Outdoor particles enter indoors, but fresh air is also needed to manage indoor-generated contaminants.', 'May limit outdoor particle entry without treating closed windows as a complete ventilation solution.', SOURCES.cleanRoom, 'home'));
  if (p.home === 'fan') recommendations.push(recommendation('fan', 'normal', 'Know what an unfiltered fan can do', 'A regular fan moves air but does not capture fine particles. Reduce smoke sources first; any fan-filter DIY device needs a safe, validated build and suitable filter.', 'Air circulation alone is not equivalent to particle filtration.', 'No PM removal is claimed for an ordinary fan.', SOURCES.cleaners, 'home'));
  if (p.home === 'purifier') recommendations.push(recommendation('filtration', 'normal', 'Get more from existing filtration', 'Run your appropriately sized particle purifier where the family spends time; keep up with filter maintenance and avoid ozone-generating models.', 'High-efficiency particle filtration can lower indoor particulate levels.', 'Potentially lowers indoor PM; effectiveness depends on CADR, room size, leakage, and use.', SOURCES.cleaners, 'home'));
  else if (p.budget === 'flexible') recommendations.push(recommendation('filtration', 'normal', 'Choose filtration by room size', 'If considering a purifier, compare smoke CADR with room area and choose a low-ozone/ozone-free particle filtration device.', 'HEPA-based portable air cleaners can remove particles; larger rooms need adequate clean-air delivery.', 'Potential indoor PM reduction; cannot predict a percentage without room measurements.', SOURCES.cleaners, 'home'));
  else recommendations.push(recommendation('filtration', 'normal', 'Start with free or low-cost indoor steps', 'Prioritize reducing indoor smoke and dust. If affordable, explore tested filtration; DIY fan-filter devices require safe, validated designs and are not equivalent to a guaranteed commercial purifier.', 'Source control can help regardless of whether a purifier is available.', 'Reduces avoidable sources; no purifier purchase is required.', SOURCES.indoor, 'home'));

  if (['walk', 'cycle'].includes(p.commute) && c.level >= 2) recommendations.push(recommendation('commute', 'high', 'Balance low emissions with exposure', 'Consider less strenuous travel or a lower-pollution travel time where possible. Do not treat cycling in severe smog as automatically safer.', 'Vigorous outdoor exertion may increase inhaled pollutant dose even when the transport mode has low emissions.', 'Protective option may reduce exertion in pollution; transport emissions impact depends on the alternative.', SOURCES.particleGuide, 'travel'));
  else if (p.commute === 'scooter' || p.commute === 'car') recommendations.push(recommendation('commute', 'normal', 'Reduce avoidable vehicle emissions', 'Combine errands, avoid unnecessary idling, and consider public transport or shared trips if practical and exposure conditions allow.', 'Fewer fuel-burning trips and less idling can reduce emissions.', 'Directionally lowers transport emissions; no unsupported CO₂ estimate is shown.', SOURCES.transport, 'travel'));
  else if (p.commute === 'remote') recommendations.push(recommendation('commute', 'normal', 'Use remote days strategically', 'When your schedule permits, group tasks or remote work on especially polluted days to avoid optional trips.', 'Eliminating an optional motorized trip can avoid its tailpipe emissions.', 'Trip avoided; actual emissions saving requires distance and vehicle data.', SOURCES.transport, 'travel'));
  else recommendations.push(recommendation('commute', 'normal', 'Make existing trips more efficient', 'If feasible, combine errands and choose less traffic-heavy routes; weigh cleaner-air timing alongside the emission benefits of shared transport.', 'Trip choices can influence emissions and exposure differently.', 'Avoids unnecessary travel; route exposure differences are not known from city-scale data.', SOURCES.transport, 'travel'));

  const comparison = p.maxShiftMinutes < 60 ? null : compareRoutine(air?.forecast, timezone, p.usualHour, now, p.maxShiftMinutes);
  const window = comparison ? { time: comparison.alternativeTime, predictedAqi: comparison.alternativeAqi, predictedPm25: comparison.alternativePm25,
    label: 'Lower forecast within the declared scheduling flexibility; not guaranteed safe' } : null;
  return {
    category: c, profile: p,
    headline: c.level === -1 ? 'Air quality unavailable — use local official advisories.' :
      c.level >= 4 ? 'High pollution: prioritize reducing exposure.' :
      c.level >= 2 ? 'Your routine may benefit from adjustments today.' :
      'Plan your day with current conditions in mind.',
    window, comparison,
    timingNotice: p.maxShiftMinutes < 60
      ? p.flexibility === 'fixed' ? 'No departure-time shift is available; prioritize feasible protective actions.' : 'Your maximum shift is less than an hour. The hourly forecast cannot substantiate a safer 15-minute departure.'
      : comparison ? 'A lower modeled PM2.5 hour was found within your declared scheduling flexibility; this is not a dose reduction.'
        : 'No lower forecast hour was established within your declared scheduling flexibility.',
    recommendations,
    disclaimers: [
      'U.S. AQI is used throughout; this is not India’s National AQI.',
      'CAMS forecasts describe regional outdoor conditions, not indoor air or street-level personal exposure.',
      'Advice is informational, not medical diagnosis, emergency instruction, or proof of avoided illness.',
      ...(air?.sourceType === 'simulation' ? ['This is a labelled simulation; do not use sample numbers for health decisions.'] : [])
    ]
  };
}
