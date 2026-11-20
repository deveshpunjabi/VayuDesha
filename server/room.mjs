/**
 * Budget-aware cleaner-room helper combining qualitative source control with EPA smoke CADR sizing.
 */
import { minimumSmokeCadr, SOURCES } from './decisions.mjs';

const VALID_SOURCES = new Set(['cooking', 'incense', 'dust', 'mixed']);
const VALID_HOMES = new Set(['none', 'fan', 'purifier']);
const VALID_BUDGETS = new Set(['free', 'low', 'flexible']);

/**
 * Builds a room-specific indoor air quality plan and EPA smoke CADR estimate.
 * @param {Record<string, any>} [input={}]
 * @returns {Record<string, any>}
 */
export function buildRoomPlan(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Room details are required.');
  }
  const area = Number(input.area);
  const suggestedCadrM3h = minimumSmokeCadr(input.area);
  const home = VALID_HOMES.has(input.home) ? input.home : 'none';
  const budget = VALID_BUDGETS.has(input.budget) ? input.budget : 'free';
  const source = VALID_SOURCES.has(input.source) ? input.source : 'mixed';
  const actions = [];

  if (source === 'cooking' || source === 'mixed') {
    actions.push({
      id: 'cooking',
      title: 'Control cooking-related particles',
      advice: 'Reduce high-smoke cooking where practical; use appropriate kitchen extraction and ventilate when outdoor conditions and indoor safety permit.',
      source: SOURCES.indoor,
      cost: 'no purchase or depends on existing ventilation'
    });
  }
  if (source === 'incense' || source === 'mixed') {
    actions.push({
      id: 'combustion',
      title: 'Avoid unnecessary indoor burning',
      advice: 'Avoid candles, incense and indoor smoking; a particle cleaner is not a substitute for eliminating the source.',
      source: SOURCES.cleanRoom,
      cost: 'free'
    });
  }
  if (source === 'dust' || source === 'mixed') {
    actions.push({
      id: 'dust',
      title: 'Avoid resuspending dust',
      advice: 'Use damp dusting and careful cleaning rather than dry sweeping that lifts particles into air.',
      source: SOURCES.indoor,
      cost: 'free'
    });
  }
  if (home === 'purifier') {
    actions.push({
      id: 'existing-filter',
      title: 'Use and maintain the cleaner you have',
      advice: `Compare its smoke CADR with about ${suggestedCadrM3h} m³/h for ${area} m², check filter maintenance, and place it where people spend time.`,
      source: SOURCES.cleaners,
      cost: 'existing equipment'
    });
  } else if (home === 'fan') {
    actions.push({
      id: 'fan',
      title: 'A fan alone is not PM filtration',
      advice: 'An ordinary unfiltered fan recirculates air. Proper filter-based devices need suitable filters, safe assembly and appropriate clearance; never assume a fan removes fine particles.',
      source: SOURCES.cleaners,
      cost: 'free guidance'
    });
  } else if (budget === 'flexible' || budget === 'low') {
    actions.push({
      id: 'filtered-room',
      title: 'Consider correctly sized particle filtration',
      advice: `If affordable, choose a verified low-ozone particle air cleaner with smoke CADR around ${suggestedCadrM3h} m³/h or higher for this room; avoid claims that it removes every pollutant.`,
      source: SOURCES.cleaners,
      cost: budget === 'low' ? 'low-cost only when feasible' : 'purchase varies'
    });
  } else {
    actions.push({
      id: 'free-first',
      title: 'Start with source control at zero equipment cost',
      advice: 'Focus on avoiding smoke and dust sources. Do not claim that shutting windows always makes indoor air safe; ventilation, heat and indoor-generated gases still matter.',
      source: SOURCES.indoor,
      cost: 'free'
    });
  }

  return {
    roomAreaM2: area,
    home,
    budget,
    source,
    smokeCadrEstimate: {
      value: suggestedCadrM3h,
      unit: 'm³/h',
      formula: 'EPA recommended tobacco-smoke CADR (cfm) ≳ 2/3 × room area (ft²), converted to m³/h and rounded up to nearest 10.',
      assumption: 'Typical ceiling height; higher ceilings and complex layouts can require more clean air.'
    },
    actions,
    limitations: [
      'No direct indoor sensor measurement or measured particle reduction.',
      'Particle filters do not remove every gas or chemical pollutant; safer ventilation and source control remain important.',
      'This is general informational guidance, not a tested purifier or DIY electrical design.'
    ]
  };
}
