'use strict';

const HIGH_CREDIBILITY_KEYWORDS = [
  'recording', 'photo', 'evidence', 'witness', 'invoice', 'receipt',
  'contract number', 'badge number', 'official name', 'confirmed by',
  'title deed', 'market quote', 'linkedin', 'multiple sources'
];

const LOW_CREDIBILITY_KEYWORDS = [
  'i think', 'maybe', 'rumour', 'heard that', 'not sure', 'someone said',
  'vague', 'possibly', 'might be'
];

const ROUTING_RULES = {
  'Bribery / Kickbacks':                  'DPP',
  'Ghost project / Fake delivery':         'EACC',
  'Procurement fraud':                     'PPRA',
  'Embezzlement of public funds':          'EACC',
  'Nepotism / Political appointments':     'EACC',
  'Police extortion':                      'DPP',
  'Land grabbing':                         'EACC',
  'Other':                                 'EACC',
};

/**
 * Score a citizen report for credibility
 * Returns { score, routing, keywords, recommendation }
 */
function scoreReport({ type, county, sector, description, amount }) {
  let score = 40;
  const detectedKeywords = [];

  const desc = (description || '').toLowerCase();

  // Length and specificity
  if (description && description.length > 300) { score += 15; }
  else if (description && description.length > 150) { score += 8; }
  else if (!description || description.length < 50) { score -= 20; }

  // High-credibility evidence signals
  HIGH_CREDIBILITY_KEYWORDS.forEach(kw => {
    if (desc.includes(kw)) {
      score += 8;
      detectedKeywords.push(kw);
    }
  });

  // Low-credibility signals
  LOW_CREDIBILITY_KEYWORDS.forEach(kw => {
    if (desc.includes(kw)) {
      score -= 10;
      detectedKeywords.push(`[low] ${kw}`);
    }
  });

  // Financial amount specified
  if (amount && amount > 0) {
    score += 12;
    if (amount > 1000000) score += 8;
  }

  // Location specified
  if (county) score += 8;
  if (sector) score += 5;

  // Type specified
  if (type && type !== 'Other') score += 5;

  // Names / dates mentioned
  if (/\d{1,2}[\s\/\-]\w+[\s\/\-]\d{4}|\d{4}-\d{2}-\d{2}/.test(desc)) {
    score += 8;
    detectedKeywords.push('date mentioned');
  }
  if (/mr\.|mrs\.|dr\.|officer|director|manager|official/.test(desc)) {
    score += 10;
    detectedKeywords.push('official named');
  }

  score = Math.min(Math.max(score, 5), 100);

  const routing = ROUTING_RULES[type] || 'EACC';

  let recommendation;
  if (score >= 85) recommendation = 'Immediate investigation — high credibility, strong evidence indicators';
  else if (score >= 70) recommendation = 'Prioritise for investigation — good credibility';
  else if (score >= 50) recommendation = 'Review and gather more evidence before escalating';
  else if (score >= 30) recommendation = 'Follow up with reporter for additional details';
  else recommendation = 'Low credibility — file for monitoring only';

  return { score, routing, keywords: detectedKeywords, recommendation };
}

module.exports = { scoreReport };
