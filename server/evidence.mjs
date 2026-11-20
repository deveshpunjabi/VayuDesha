/**
 * Curated scientific source registry: official citations attached to specific domain claims.
 */
export const EVIDENCE = Object.freeze({
  usAqi: Object.freeze({
    label: 'AirNow — AQI basics',
    publisher: 'US EPA / AirNow',
    region: 'US index interpretation',
    url: 'https://www.airnow.gov/aqi/aqi-basics/',
    supports: Object.freeze(['U.S. AQI categories and their limitations'])
  }),
  activity: Object.freeze({
    label: 'AirNow — outdoor activity guidance',
    publisher: 'US EPA / AirNow',
    region: 'US index interpretation',
    url: 'https://www.airnow.gov/publications/activity-guides/air-quality-and-outdoor-activity-guidance-for-schools/',
    supports: Object.freeze(['Children’s outdoor activity adjustments by air-quality conditions'])
  }),
  particleGuide: Object.freeze({
    label: 'AirNow — particle pollution activity guidance',
    publisher: 'US EPA / AirNow',
    region: 'US index interpretation',
    url: 'https://www.airnow.gov/sites/default/files/2023-03/air-quality-guide-for-particle-pollution_0.pdf',
    supports: Object.freeze(['Outdoor exertion precautions by particle AQI category'])
  }),
  cleanerRoom: Object.freeze({
    label: 'US EPA — cleaner-air room',
    publisher: 'US EPA',
    region: 'General principles',
    url: 'https://www.epa.gov/wildfires/how-create-cleaner-air-room-home',
    supports: Object.freeze(['Lowering indoor particle sources and improving room filtration'])
  }),
  cleaners: Object.freeze({
    label: 'US EPA — guide to air cleaners',
    publisher: 'US EPA',
    region: 'General principles',
    url: 'https://www.epa.gov/indoor-air-quality-iaq/guide-air-cleaners-home',
    supports: Object.freeze(['Source control, ventilation, smoke CADR and particle air cleaning'])
  }),
  indoor: Object.freeze({
    label: 'US EPA — improving indoor air quality',
    publisher: 'US EPA',
    region: 'General principles',
    url: 'https://www.epa.gov/indoor-air-quality-iaq/improving-indoor-air-quality',
    supports: Object.freeze(['Indoor source control and the need for safe ventilation'])
  }),
  transport: Object.freeze({
    label: 'US EPA — reduce vehicle emissions',
    publisher: 'US EPA',
    region: 'General principles',
    url: 'https://www.epa.gov/transportation-air-pollution-and-climate-change/what-you-can-do-reduce-pollution-vehicles-and',
    supports: Object.freeze(['Avoiding idling, reducing unnecessary motorized travel and trips'])
  }),
  who: Object.freeze({
    label: 'WHO — air quality and health',
    publisher: 'World Health Organization',
    region: 'Global guidance',
    url: 'https://www.who.int/teams/environment-climate-change-and-health/air-quality-and-health/health-impacts/types-of-pollutants',
    supports: Object.freeze(['Health significance of air pollutants and guideline averaging periods'])
  }),
  camS: Object.freeze({
    label: 'Open-Meteo — air-quality API',
    publisher: 'Open-Meteo/Copernicus CAMS',
    region: 'Model information',
    url: 'https://open-meteo.com/en/docs/air-quality-api',
    supports: Object.freeze(['Forecast variables, index naming, model provenance and resolution limits'])
  }),
  cpcb: Object.freeze({
    label: 'CPCB — National AQI',
    publisher: 'CPCB India',
    region: 'India index',
    url: 'https://app.cpcbccr.com/ccr_docs/About_AQI.pdf',
    supports: Object.freeze(['Official National AQI categories, distinct from U.S. AQI'])
  }),
  caqm: Object.freeze({
    label: 'CAQM — official GRAP orders',
    publisher: 'CAQM India',
    region: 'Delhi-NCR orders',
    url: 'https://caqm.nic.in/',
    supports: Object.freeze(['Where to verify dated official GRAP stage orders, not stage inference'])
  })
});

/**
 * Looks up a curated evidence record by key.
 * @param {string} key
 * @returns {Record<string, any>}
 */
export function evidenceFor(key) {
  if (!Object.hasOwn(EVIDENCE, key)) throw new Error(`Unknown evidence key: ${key}`);
  return EVIDENCE[key];
}

/**
 * Returns the verified HTTPS URL for an evidence registry key.
 * @param {string} key
 * @returns {string}
 */
export function evidenceUrl(key) {
  return evidenceFor(key).url;
}
