'use strict';

const SECTOR_DETECTION_RATES = {
  'Roads & Infrastructure': { ghost: 0.22, partial: 0.31, verified: 0.47 },
  'Health':                 { ghost: 0.18, partial: 0.28, verified: 0.54 },
  'Education':              { ghost: 0.20, partial: 0.25, verified: 0.55 },
  'Water & Sanitation':     { ghost: 0.25, partial: 0.35, verified: 0.40 },
  'Agriculture':            { ghost: 0.15, partial: 0.30, verified: 0.55 },
  'Infrastructure':         { ghost: 0.20, partial: 0.28, verified: 0.52 },
  'ICT':                    { ghost: 0.10, partial: 0.20, verified: 0.70 },
};

/**
 * Simulate satellite analysis for a ghost project
 * Returns detection details with realistic metadata
 */
function analyzeSatellite({ project_name, sector, amount_at_risk, county, claimed_status }) {
  const rates = SECTOR_DETECTION_RATES[sector] || { ghost: 0.20, partial: 0.30, verified: 0.50 };

  // Higher-value contracts in remote counties have higher ghost rates
  const remoteCounties = ['Turkana', 'Marsabit', 'Mandera', 'Wajir', 'Garissa', 'Tana River'];
  let ghostBias = remoteCounties.includes(county) ? 0.15 : 0;

  // Single-source or high value increases ghost probability
  if (amount_at_risk > 50000000) ghostBias += 0.1;

  const rand = Math.random();
  let status;
  if (rand < rates.ghost + ghostBias) status = 'ghost';
  else if (rand < rates.ghost + ghostBias + rates.partial) status = 'partial';
  else status = 'verified';

  // Generate confidence score
  const confidence = status === 'ghost'
    ? 85 + Math.floor(Math.random() * 12)
    : status === 'partial'
    ? 78 + Math.floor(Math.random() * 15)
    : 88 + Math.floor(Math.random() * 10);

  // Generate satellite metadata
  const ndvi = status === 'ghost'
    ? (0.4 + Math.random() * 0.4).toFixed(2)      // high vegetation
    : status === 'partial'
    ? (0.1 + Math.random() * 0.2).toFixed(2)       // some disturbance
    : (0.05 + Math.random() * 0.15).toFixed(2);    // construction activity

  const builtAreaPct = status === 'ghost' ? 0
    : status === 'partial' ? Math.floor(10 + Math.random() * 55)
    : Math.floor(85 + Math.random() * 15);

  const satelliteDate = new Date();
  satelliteDate.setDate(satelliteDate.getDate() - Math.floor(Math.random() * 30));

  let satelliteStatus;
  if (status === 'ghost') {
    satelliteStatus = `No construction activity detected. ${builtAreaPct}% of contracted area shows undisturbed ${ndvi > 0.5 ? 'vegetation' : 'bare land'}.`;
  } else if (status === 'partial') {
    satelliteStatus = `Partial construction detected — approximately ${builtAreaPct}% complete. ${100 - builtAreaPct}% of contracted scope not commenced.`;
  } else {
    satelliteStatus = `Construction confirmed — approximately ${builtAreaPct}% complete. Structures consistent with contracted description.`;
  }

  const metadata = {
    ndvi: parseFloat(ndvi),
    built_area_pct: builtAreaPct,
    imagery_date: satelliteDate.toISOString().split('T')[0],
    imagery_source: 'Sentinel-2 ESA',
    analysis_model: 'KenyaWatch Satellite AI v1.0',
    cloud_cover_pct: Math.floor(Math.random() * 20),
    resolution_m: 10,
  };

  return {
    detection_status: status,
    satellite_status: satelliteStatus,
    satellite_date: satelliteDate.toISOString().split('T')[0],
    confidence_score: confidence,
    satellite_metadata: metadata,
  };
}

module.exports = { analyzeSatellite };
