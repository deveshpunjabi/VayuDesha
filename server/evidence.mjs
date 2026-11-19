/** Curated source registry: citations attached to a particular claim, not generic AI output.
 * Reviewed against public issuer pages on 2026-11-19. Check URLs before submission.
 */
export const EVIDENCE = Object.freeze({
  usAqi: { label: 'AirNow — AQI basics', publisher: 'US EPA / AirNow', region: 'US index interpretation',
    url: 'https://www.airnow.gov/aqi/aqi-basics/', supports: ['U.S. AQI categories and their limitations'] },
  activity: { label: 'AirNow — outdoor activity guidance', publisher: 'US EPA / AirNow', region: 'US index interpretation',
    url: 'https://www.airnow.gov/publications/activity-guides/air-quality-and-outdoor-activity-guidance-for-schools/', supports: ['Children’s outdoor activity adjustments by air-quality conditions'] },
  particleGuide: { label: 'AirNow — particle pollution activity guidance', publisher: 'US EPA / AirNow', region: 'US index interpretation',
    url: 'https://www.airnow.gov/sites/default/files/2023-03/air-quality-guide-for-particle-pollution_0.pdf', supports: ['Outdoor exertion precautions by particle AQI category'] },
  cleanerRoom: { label: 'US EPA — cleaner-air room', publisher: 'US EPA', region: 'General principles',
    url: 'https://www.epa.gov/wildfires/how-create-cleaner-air-room-home', supports: ['Lowering indoor particle sources and improving room filtration'] },
  cleaners: { label: 'US EPA — guide to air cleaners', publisher: 'US EPA', region: 'General principles',
    url: 'https://www.epa.gov/indoor-air-quality-iaq/guide-air-cleaners-home', supports: ['Source control, ventilation, smoke CADR and particle air cleaning'] },
  indoor: { label: 'US EPA — improving indoor air quality', publisher: 'US EPA', region: 'General principles',
    url: 'https://www.epa.gov/indoor-air-quality-iaq/improving-indoor-air-quality', supports: ['Indoor source control and the need for safe ventilation'] },
  transport: { label: 'US EPA — reduce vehicle emissions', publisher: 'US EPA', region: 'General principles',
    url: 'https://www.epa.gov/transportation-air-pollution-and-climate-change/what-you-can-do-reduce-pollution-vehicles-and', supports: ['Avoiding idling, reducing unnecessary motorized travel and trips'] },
  who: { label: 'WHO — air quality and health', publisher: 'World Health Organization', region: 'Global guidance',
    url: 'https://www.who.int/teams/environment-climate-change-and-health/air-quality-and-health/health-impacts/types-of-pollutants', supports: ['Health significance of air pollutants and guideline averaging periods'] },
  camS: { label: 'Open-Meteo — air-quality API', publisher: 'Open-Meteo/Copernicus CAMS', region: 'Model information',
    url: 'https://open-meteo.com/en/docs/air-quality-api', supports: ['Forecast variables, index naming, model provenance and resolution limits'] },
  cpcb: { label: 'CPCB — National AQI', publisher: 'CPCB India', region: 'India index',
    url: 'https://app.cpcbccr.com/ccr_docs/About_AQI.pdf', supports: ['Official National AQI categories, distinct from U.S. AQI'] },
  caqm: { label: 'CAQM — official GRAP orders', publisher: 'CAQM India', region: 'Delhi-NCR orders',
    url: 'https://caqm.nic.in/', supports: ['Where to verify dated official GRAP stage orders, not stage inference'] }
});
export function evidenceFor(key) {
  if (!Object.hasOwn(EVIDENCE, key)) throw new Error(`Unknown evidence key: ${key}`);
  return EVIDENCE[key];
}
export function evidenceUrl(key) { return evidenceFor(key).url; }
