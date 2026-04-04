'use strict';

/**
 * Credibility Scorer — evaluates citizen corruption reports for credibility.
 * Produces a 0–100 score with reasoning and routing recommendations.
 */

// High-value keywords that indicate specific, credible reports
const SPECIFICITY_KEYWORDS = [
  'contract', 'tender', 'procurement', 'invoice', 'receipt', 'payment',
  'official', 'minister', 'governor', 'director', 'officer', 'commissioner',
  'million', 'billion', 'thousand', 'kes', 'ksh', 'shilling',
  'date', 'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
  'witness', 'evidence', 'document', 'receipt', 'photo', 'video',
  'company', 'ltd', 'limited', 'registration', 'pin', 'kra'
];

// Keywords indicating vague or potentially unreliable reports
const VAGUENESS_KEYWORDS = [
  'i think', 'i believe', 'maybe', 'perhaps', 'rumour', 'heard',
  'someone told me', 'i was told', 'apparently', 'supposedly'
];

// Corruption-specific terminology that adds credibility
const CORRUPTION_KEYWORDS = [
  'bribe', 'kickback', 'embezzle', 'fraud', 'ghost', 'inflat',
  'overpriced', 'single source', 'no tender', 'fake', 'forged',
  'conflict of interest', 'nepotism', 'extortion', 'theft'
];

// High-risk sectors for cross-referencing
const HIGH_RISK_SECTORS = ['Health', 'Education', 'Roads & Infrastructure', 'Water & Sanitation'];

/**
 * Score a report for credibility.
 * @param {Object} report - Report data
 * @param {Object} opts - Optional context (existingReports, existingContracts)
 * @returns {{ score: number, factors: Object, routing: string, priority: string }}
 */
const scoreReport = (report, opts = {}) => {
  const { type = '', county = '', sector = '', description = '', amount = null } = report;
  const { existingReports = [], existingContracts = [] } = opts;

  let score = 30; // Base score
  const factors = {};

  // ── 1. Description length & specificity (0–25 pts) ───────────────────────
  const wordCount = description.trim().split(/\s+/).length;
  factors.word_count = wordCount;

  if (wordCount >= 100) {
    score += 25;
    factors.length_score = 'Detailed (100+ words)';
  } else if (wordCount >= 50) {
    score += 18;
    factors.length_score = 'Adequate (50–99 words)';
  } else if (wordCount >= 20) {
    score += 10;
    factors.length_score = 'Brief (20–49 words)';
  } else {
    score += 2;
    factors.length_score = 'Very brief — low detail';
  }

  // ── 2. Specificity keywords (0–20 pts) ───────────────────────────────────
  const descLower = description.toLowerCase();
  const specificityMatches = SPECIFICITY_KEYWORDS.filter(k => descLower.includes(k));
  const specificityScore = Math.min(20, specificityMatches.length * 3);
  score += specificityScore;
  factors.specificity_keywords = specificityMatches.length;
  factors.specificity_score = specificityScore;

  // ── 3. Corruption terminology (0–15 pts) ─────────────────────────────────
  const corruptionMatches = CORRUPTION_KEYWORDS.filter(k => descLower.includes(k));
  const corruptionScore = Math.min(15, corruptionMatches.length * 4);
  score += corruptionScore;
  factors.corruption_keywords = corruptionMatches.length;

  // ── 4. Vagueness penalty (0 to -15 pts) ──────────────────────────────────
  const vaguenessMatches = VAGUENESS_KEYWORDS.filter(k => descLower.includes(k));
  const vaguenessDeduction = Math.min(15, vaguenessMatches.length * 5);
  score -= vaguenessDeduction;
  factors.vagueness_penalty = -vaguenessDeduction;

  // ── 5. Amount provided (0–10 pts) ────────────────────────────────────────
  if (amount && parseInt(amount) > 0) {
    score += 10;
    factors.amount_provided = true;
    factors.amount = parseInt(amount);
  } else {
    factors.amount_provided = false;
  }

  // ── 6. County & sector provided (0–10 pts) ───────────────────────────────
  if (county) { score += 5; factors.county_provided = true; }
  if (sector) { score += 5; factors.sector_provided = true; }

  // ── 7. Cross-reference with existing contracts (0–15 pts) ────────────────
  const countyContracts = existingContracts.filter(
    c => c.county?.toLowerCase() === county?.toLowerCase()
  );
  factors.county_contract_count = countyContracts.length;

  if (countyContracts.length > 0) {
    const highRiskInCounty = countyContracts.filter(c => c.risk_level === 'HIGH').length;
    if (highRiskInCounty > 0) {
      score += 15;
      factors.corroborated_by_contracts = `${highRiskInCounty} high-risk contract(s) in same county`;
    } else {
      score += 5;
      factors.corroborated_by_contracts = `${countyContracts.length} contract(s) in same county`;
    }
  }

  // ── 8. Duplicate detection (0 to -20 pts) ────────────────────────────────
  const similarReports = existingReports.filter(r => {
    if (r.county !== county || r.type !== type) return false;
    const similarity = _textSimilarity(r.description || '', description);
    return similarity > 0.7;
  });
  factors.similar_reports = similarReports.length;

  if (similarReports.length > 2) {
    score -= 20;
    factors.duplicate_penalty = 'Multiple very similar reports — possible duplicate';
  } else if (similarReports.length > 0) {
    score += 8; // Corroboration from similar reports
    factors.corroboration = `${similarReports.length} similar report(s) filed — corroborates claim`;
  }

  // ── 9. High-risk sector bonus (0–5 pts) ──────────────────────────────────
  if (HIGH_RISK_SECTORS.includes(sector)) {
    score += 5;
    factors.high_risk_sector = true;
  }

  // ── Clamp score ───────────────────────────────────────────────────────────
  score = Math.max(5, Math.min(100, score));

  // ── Routing recommendation ────────────────────────────────────────────────
  let routing, priority;
  if (score >= 75) {
    routing = 'EACC + DPP';
    priority = 'URGENT';
  } else if (score >= 55) {
    routing = 'EACC';
    priority = 'HIGH';
  } else if (score >= 35) {
    routing = 'PPRA';
    priority = 'MEDIUM';
  } else {
    routing = 'County Oversight';
    priority = 'LOW';
  }

  return { score, factors, routing, priority };
};

/**
 * Simple text similarity using word overlap (Jaccard-like).
 */
const _textSimilarity = (a, b) => {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
};

/**
 * Detect duplicate or very similar reports in a set.
 */
const detectDuplicates = (reports) => {
  const duplicates = [];
  for (let i = 0; i < reports.length; i++) {
    for (let j = i + 1; j < reports.length; j++) {
      const sim = _textSimilarity(reports[i].description || '', reports[j].description || '');
      if (sim > 0.75) {
        duplicates.push({
          report_a: reports[i].case_number,
          report_b: reports[j].case_number,
          similarity: Math.round(sim * 100)
        });
      }
    }
  }
  return duplicates;
};

module.exports = { scoreReport, detectDuplicates };
