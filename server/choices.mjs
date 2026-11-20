/**
 * Human-auditable scenario trade-off comparisons. Qualitative decision aid, not measured personal exposure.
 */
import { categoryForUsAqi, normalizeProfile, SOURCES } from './decisions.mjs';

const EXPOSURE_LEVELS = Object.freeze([
  'Lower outdoor exertion',
  'Depends on conditions',
  'More outdoor exertion'
]);

function makeChoiceItems(p, polluted, veryPolluted, canShift) {
  return [
    {
      id: 'remote',
      title: 'Avoid an optional trip',
      tag: 'Consider first',
      exposure: 'Avoids that outdoor trip',
      emissions: 'Avoids associated personal motorized trip only when one is displaced',
      cost: 'Usually no travel fare',
      fit: veryPolluted ? 'strong' : 'possible',
      reasoning: 'Works only if the trip is optional or remote participation is genuinely available. Bundling errands into a single trip also cuts cold-start exhaust.',
      directImpact: 'Eliminates both outdoor commute inhalation during winter smog peaks and direct tailpipe/road-dust output from an optional motorized trip.',
      limitation: 'Indoor air may still be polluted; a necessary trip cannot always be skipped.',
      source: SOURCES.transport
    },
    {
      id: 'transit',
      title: 'Choose shared transport',
      tag: 'Practical alternative',
      exposure: 'Varies by station, waiting time and ventilation',
      emissions: 'Potentially lower per-person transport emissions than a solo vehicle',
      cost: 'Fare and transfers vary',
      fit: p.commute === 'transit' ? 'strong' : 'possible',
      reasoning: 'Useful when metro, electric rail, or shared buses replace private car or two-wheeler travel with manageable outdoor waiting.',
      directImpact: 'Spreads transport emissions across shared capacity rather than adding another solo tailpipe to congested winter corridors.',
      limitation: 'A route-specific cleaner-air claim cannot be made from regional model data.',
      source: SOURCES.transport
    },
    {
      id: 'active',
      title: 'Walk or cycle',
      tag: polluted ? 'Use extra caution' : 'Low-emission option',
      exposure: EXPOSURE_LEVELS[polluted ? 2 : 1],
      emissions: 'No direct tailpipe emissions during the trip',
      cost: 'Usually inexpensive',
      fit: polluted ? 'caution' : 'possible',
      reasoning: polluted
        ? 'Outdoor exertion can increase pollutant inhalation, so do not choose active travel solely for emission savings during elevated pollution.'
        : 'Consider personal needs, route conditions, traffic safety and exposure. Low AQI is not zero risk.',
      directImpact: polluted
        ? 'Zero tailpipe exhaust, but deeper breathing during severe smog increases personal particulate intake compared with enclosed transit.'
        : 'Zero direct tailpipe emissions and active mobility when ambient particulate levels are relatively lower.',
      limitation: 'Actual breathed dose depends on pace, microenvironment, duration and individual circumstances.',
      source: SOURCES.particleGuide
    },
    {
      id: 'reschedule',
      title: 'Move a flexible outdoor task',
      tag: canShift ? 'Timing option' : 'May not be feasible',
      exposure: 'Depends on forecast and time outdoors',
      emissions: 'No inherent emissions reduction from rescheduling alone',
      cost: 'Usually no purchase required',
      fit: canShift ? 'possible' : 'limited',
      reasoning: canShift
        ? 'Only compare forecast hours inside your declared maximum time shift. A 15-minute change cannot be resolved by hourly forecasts.'
        : 'A fixed or sub-hour shift cannot justify choosing another forecast hour; prefer feasible protective choices.',
      directImpact: canShift
        ? 'Shifts outdoor errands away from shallow morning inversion hours toward afternoon boundary-layer dispersion windows when forecast PM2.5 is lower.'
        : 'Preserves mandatory school or shift commitments while focusing on exertion reduction and indoor source control.',
      limitation: 'Forecast timing is uncertain and can be different from conditions at street level.',
      source: SOURCES.particleGuide
    }
  ];
}

/**
 * Builds qualitative commute and daily routine trade-off cards for the household profile.
 * @param {Record<string, any>|null} air
 * @param {Record<string, any>} [inputProfile={}]
 * @returns {Record<string, any>}
 */
export function buildChoices(air, inputProfile = {}) {
  const p = normalizeProfile(inputProfile);
  const category = categoryForUsAqi(air?.current?.aqi);
  const unknown = category.level < 0;
  const polluted = category.level >= 2 || unknown;
  const veryPolluted = category.level >= 3;
  const canShift = p.maxShiftMinutes >= 60;
  const choices = makeChoiceItems(p, polluted, veryPolluted, canShift);
  const guidance = unknown
    ? 'Air quality is unavailable. Do not assume conditions are good; check official reports before choosing outdoor exertion.'
    : polluted
      ? 'Pollution is elevated. Start with feasible exposure-protection steps, then compare emissions and cost.'
      : 'Compare convenience, costs and emissions alongside any exposure concerns; current AQI is not a personal safety guarantee.';
  return {
    category: category.name,
    guidance,
    choices,
    methodology: 'Qualitative decision aid based on U.S. AQI categories and declared preferences. Not personalized exposure measurement, route safety ranking or quantitative emissions modelling.',
    inputUsed: { commute: p.commute, flexibility: p.flexibility, maxShiftMinutes: p.maxShiftMinutes }
  };
}

/**
 * Generates anonymous community smog guidance cards for schools, neighbours, and workplaces.
 * @param {Record<string, any>|null} air
 * @param {Record<string, any>} [inputProfile={}]
 * @returns {Array<Record<string, string>>}
 */
export function buildCommunityActions(air, inputProfile = {}) {
  const p = normalizeProfile(inputProfile);
  const category = categoryForUsAqi(air?.current?.aqi);
  const high = category.level >= 2;
  return [
    {
      id: 'school',
      audience: 'Schools & families',
      title: high ? 'Review outdoor activity plans' : 'Keep an AQI check in the routine',
      action: high
        ? 'Share the sourced AQI forecast with school staff and ask about flexible indoor options for strenuous outdoor activity. Follow official school instructions.'
        : 'Check official AQI alerts before outdoor sports and explain the difference between a regional forecast and on-site conditions.',
      source: SOURCES.activity
    },
    {
      id: 'neighbours',
      audience: 'Housing communities',
      title: 'Reduce shared particle sources',
      action: 'Discourage waste burning and indoor smoke in shared spaces. Share low-cost source-control and filtration guidance without promising a specific reduction.',
      source: SOURCES.indoor
    },
    {
      id: 'travel',
      audience: 'Workplaces & neighbours',
      title: 'Enable fewer unnecessary trips',
      action: `Where genuinely possible, coordinate remote participation, combine errands and shared travel.${p.flexibility === 'fixed' ? ' Recognize that many essential schedules cannot move.' : ''}`,
      source: SOURCES.transport
    }
  ];
}
