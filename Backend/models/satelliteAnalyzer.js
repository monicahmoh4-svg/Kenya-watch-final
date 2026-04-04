'use strict';

/**
 * Satellite Analyzer — simulates satellite imagery analysis for ghost project detection.
 * Generates realistic detection statuses, confidence scores, and metadata.
 */

// Sentinel-2 satellite passes over Kenya (approximate)
const SATELLITE_PASSES = ['Sentinel-2A', 'Sentinel-2B', 'Landsat-8', 'Landsat-9', 'PlanetScope'];

// Realistic cloud cover ranges by county (Kenya climate zones)
const COUNTY_CLOUD_COVER = {
  'Nairobi': { min: 5, max: 35 },
  'Mombasa': { min: 10, max: 60 },
  'Kisumu': { min: 15, max: 70 },
  'Nakuru': { min: 8, max: 45 },
  'Kiambu': { min: 10, max: 50 },
  'Kisii': { min: 20, max: 75 },
  'Kakamega': { min: 25, max: 80 },
  'Turkana': { min: 2, max: 20 },
  'Nyeri': { min: 12, max: 55 },
  'Machakos': { min: 5, max: 40 },
  'default': { min: 10, max: 60 }
};

// Detection status probabilities based on contract characteristics
const STATUS_WEIGHTS = {
  ghost: 0.35,    // 35% of flagged projects are complete ghosts
  partial: 0.40,  // 40% are partially built
  verified: 0.25  // 25% are actually built
};

/**
 * Analyse a project and generate satellite detection data.
 * @param {Object} project - Project data
 * @returns {Object} Satellite analysis result
 */
const analyseProject = (project) => {
  const { project_name = '', county = '', claimed_status = '', amount_at_risk = 0 } = project;

  // Determine detection status based on risk factors
  const detectionStatus = _determineDetectionStatus(project);
  const confidence = _calculateConfidence(project, detectionStatus);
  const satelliteStatus = _generateSatelliteStatus(detectionStatus, claimed_status);
  const metadata = _generateMetadata(county);

  return {
    detection_status: detectionStatus,
    satellite_status: satelliteStatus,
    confidence_score: confidence,
    metadata,
    analysis_summary: _generateSummary(detectionStatus, confidence, project_name, county)
  };
};

/**
 * Determine detection status based on project risk factors.
 */
const _determineDetectionStatus = (project) => {
  const { amount_at_risk = 0, county = '', claimed_status = '' } = project;
  const amount = parseInt(amount_at_risk) || 0;

  // Seed deterministic randomness from project name for consistency
  const seed = _hashString(project.project_name || project.contract_ref || '');
  const rand = _seededRandom(seed);

  // Higher amounts = higher ghost probability
  let ghostProb = STATUS_WEIGHTS.ghost;
  let partialProb = STATUS_WEIGHTS.partial;

  if (amount > 100_000_000) {
    ghostProb += 0.15;
    partialProb += 0.05;
  } else if (amount > 50_000_000) {
    ghostProb += 0.08;
  }

  // High-risk counties increase ghost probability
  const highRiskCounties = ['Nairobi', 'Kiambu', 'Mombasa', 'Kakamega'];
  if (highRiskCounties.includes(county)) {
    ghostProb += 0.08;
  }

  // Claimed "100% complete" with large amount is suspicious
  if (claimed_status?.toLowerCase().includes('100%') || claimed_status?.toLowerCase().includes('complete')) {
    ghostProb += 0.10;
  }

  // Normalise probabilities
  const total = ghostProb + partialProb + (1 - ghostProb - partialProb);
  const r = rand * total;

  if (r < ghostProb) return 'ghost';
  if (r < ghostProb + partialProb) return 'partial';
  return 'verified';
};

/**
 * Calculate confidence score for the detection.
 */
const _calculateConfidence = (project, detectionStatus) => {
  const county = project.county || 'default';
  const cloudRange = COUNTY_CLOUD_COVER[county] || COUNTY_CLOUD_COVER.default;
  const cloudCover = cloudRange.min + Math.random() * (cloudRange.max - cloudRange.min);

  // Base confidence inversely proportional to cloud cover
  let confidence = 95 - (cloudCover * 0.5);

  // Ghost projects have higher confidence (easier to detect absence)
  if (detectionStatus === 'ghost') confidence += 5;
  // Partial is hardest to classify accurately
  if (detectionStatus === 'partial') confidence -= 8;

  return Math.round(Math.max(45, Math.min(99, confidence)));
};

/**
 * Generate a realistic satellite status description.
 */
const _generateSatelliteStatus = (detectionStatus, claimedStatus = '') => {
  const ghostDescriptions = [
    'Bare land — no structure detected',
    'Empty plot — vegetation only, no construction',
    'Undeveloped land — no building activity observed',
    'Open field — no infrastructure visible',
    'Bare earth — no construction materials or structures'
  ];

  const partialDescriptions = [
    '~15% structure visible — foundation only',
    '~30% complete — walls at plinth level',
    '~45% complete — partial walls, no roof',
    '~20% complete — site cleared, foundation poured',
    '~60% complete — structure standing, unfinished'
  ];

  const verifiedDescriptions = [
    'Structure confirmed — matches contract description',
    'Building complete — consistent with claimed status',
    'Infrastructure verified — operational',
    'Construction confirmed — structure visible and complete',
    'Project verified — satellite imagery matches contract'
  ];

  const idx = Math.floor(Math.random() * 5);

  switch (detectionStatus) {
    case 'ghost': return ghostDescriptions[idx];
    case 'partial': return partialDescriptions[idx];
    case 'verified': return verifiedDescriptions[idx];
    default: return 'Analysis pending — insufficient imagery';
  }
};

/**
 * Generate satellite image metadata.
 */
const _generateMetadata = (county = '') => {
  const cloudRange = COUNTY_CLOUD_COVER[county] || COUNTY_CLOUD_COVER.default;
  const cloudCover = Math.round(cloudRange.min + Math.random() * (cloudRange.max - cloudRange.min));
  const satellite = SATELLITE_PASSES[Math.floor(Math.random() * SATELLITE_PASSES.length)];

  // Generate a date within the last 90 days
  const captureDate = new Date();
  captureDate.setDate(captureDate.getDate() - Math.floor(Math.random() * 90));

  // Generate realistic GPS coordinates for Kenya
  const lat = (-4.5 + Math.random() * 8.5).toFixed(6);  // Kenya: -4.5 to 4.0
  const lng = (34.0 + Math.random() * 7.5).toFixed(6);  // Kenya: 34.0 to 41.5

  return {
    satellite,
    capture_date: captureDate.toISOString().split('T')[0],
    cloud_cover_pct: cloudCover,
    resolution_m: satellite.includes('Planet') ? 3 : satellite.includes('Sentinel') ? 10 : 15,
    coordinates: { lat: parseFloat(lat), lng: parseFloat(lng) },
    image_id: `IMG-${Date.now()}-${Math.floor(Math.random() * 9999).toString().padStart(4, '0')}`
  };
};

/**
 * Generate a human-readable analysis summary.
 */
const _generateSummary = (detectionStatus, confidence, projectName, county) => {
  const conf = confidence >= 85 ? 'high' : confidence >= 65 ? 'moderate' : 'low';

  switch (detectionStatus) {
    case 'ghost':
      return `Satellite analysis with ${conf} confidence (${confidence}%) indicates NO structure at the reported location for "${projectName}" in ${county}. Funds appear to have been disbursed for a non-existent project. Immediate EACC referral recommended.`;
    case 'partial':
      return `Satellite analysis with ${conf} confidence (${confidence}%) shows PARTIAL construction at the reported location for "${projectName}" in ${county}. Significant discrepancy between claimed and actual completion status. Investigation recommended.`;
    case 'verified':
      return `Satellite analysis with ${conf} confidence (${confidence}%) CONFIRMS structure at the reported location for "${projectName}" in ${county}. Project appears consistent with contract description. Routine monitoring continues.`;
    default:
      return `Analysis pending for "${projectName}" in ${county}. Awaiting clear satellite imagery.`;
  }
};

/**
 * Simple string hash for deterministic seeding.
 */
const _hashString = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

/**
 * Seeded pseudo-random number generator (0–1).
 */
const _seededRandom = (seed) => {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
};

/**
 * Batch analyse multiple projects.
 */
const batchAnalyse = (projects) => {
  return projects.map(p => ({
    id: p.id,
    project_name: p.project_name,
    ...analyseProject(p)
  }));
};

/**
 * Generate detection statistics for a set of projects.
 */
const generateStats = (projects) => {
  const ghost = projects.filter(p => p.detection_status === 'ghost').length;
  const partial = projects.filter(p => p.detection_status === 'partial').length;
  const verified = projects.filter(p => p.detection_status === 'verified').length;
  const totalAtRisk = projects
    .filter(p => ['ghost', 'partial'].includes(p.detection_status))
    .reduce((s, p) => s + (parseInt(p.amount_at_risk) || 0), 0);

  return {
    total: projects.length,
    ghost_count: ghost,
    partial_count: partial,
    verified_count: verified,
    detection_rate: projects.length > 0 ? Math.round(((ghost + partial) / projects.length) * 100) : 0,
    total_at_risk: totalAtRisk
  };
};

module.exports = { analyseProject, batchAnalyse, generateStats };
