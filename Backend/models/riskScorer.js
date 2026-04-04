'use strict';

/**
 * Risk Scorer — deterministic ML-style risk scoring for Kenya government contracts.
 * Produces a 0–100 score with labelled flags and a risk level classification.
 */

// Known high-risk supplier patterns (partial matches)
const HIGH_RISK_SUPPLIER_PATTERNS = [
  /nexus/i, /phantom/i, /ghost/i, /shadow/i, /elite.*supply/i,
  /rapid.*build/i, /swift.*construct/i, /alpha.*ventures/i,
  /global.*solutions/i, /premier.*enterprises/i
];

// Suppliers with known clean track records (partial matches)
const TRUSTED_SUPPLIERS = [
  /china.*road/i, /raubex/i, /h\.?young/i, /strabag/i, /lafarge/i,
  /bamburi/i, /east.*africa.*breweries/i, /safaricom/i
];

// Sectors with historically high corruption risk in Kenya
const HIGH_RISK_SECTORS = ['Roads', 'Health', 'Education', 'Water'];

// Counties with elevated corruption indices
const HIGH_RISK_COUNTIES = ['Nairobi', 'Mombasa', 'Kiambu', 'Kakamega', 'Kisumu'];

/**
 * Score a contract for fraud risk.
 * @param {Object} contract - Contract data
 * @param {Object} opts - Optional context (existingContracts for supplier history)
 * @returns {{ score: number, risk_level: string, flags: string[], details: Object }}
 */
const scoreContract = (contract, opts = {}) => {
  const { contract_id = '', description = '', county = '', value = 0, supplier = '' } = contract;
  const { existingContracts = [], marketAverage = null } = opts;

  let score = 0;
  const flags = [];
  const details = {};

  // ── 1. Price anomaly (0–30 pts) ───────────────────────────────────────────
  const contractValue = parseInt(value) || 0;
  const avgValue = marketAverage || _estimateMarketAverage(description, county);
  const priceDeviation = avgValue > 0 ? ((contractValue - avgValue) / avgValue) * 100 : 0;
  details.price_deviation_pct = Math.round(priceDeviation);
  details.estimated_market_value = avgValue;

  if (priceDeviation > 200) {
    score += 30;
    flags.push(`Price ${Math.round(priceDeviation)}% above market average — extreme overpricing`);
  } else if (priceDeviation > 100) {
    score += 22;
    flags.push(`Price ${Math.round(priceDeviation)}% above market average — significant overpricing`);
  } else if (priceDeviation > 50) {
    score += 12;
    flags.push(`Price ${Math.round(priceDeviation)}% above market average — moderate overpricing`);
  } else if (priceDeviation < -30) {
    score += 8;
    flags.push(`Price ${Math.round(Math.abs(priceDeviation))}% below market — possible quality compromise`);
  }

  // ── 2. Supplier track record (0–25 pts) ───────────────────────────────────
  const supplierContracts = existingContracts.filter(
    c => c.supplier?.toLowerCase() === supplier?.toLowerCase() && c.contract_id !== contract_id
  );
  details.supplier_contract_count = supplierContracts.length;

  const isHighRiskSupplier = HIGH_RISK_SUPPLIER_PATTERNS.some(p => p.test(supplier));
  const isTrustedSupplier = TRUSTED_SUPPLIERS.some(p => p.test(supplier));

  if (isHighRiskSupplier) {
    score += 20;
    flags.push('Supplier name matches known high-risk pattern');
  } else if (isTrustedSupplier) {
    score -= 5; // Slight reduction for known clean suppliers
  }

  if (supplierContracts.length === 0 && contractValue > 10_000_000) {
    score += 15;
    flags.push('No prior government contracts — unproven supplier for large award');
  } else if (supplierContracts.length > 0) {
    const avgPriorScore = supplierContracts.reduce((s, c) => s + (c.risk_score || 0), 0) / supplierContracts.length;
    details.supplier_avg_prior_risk = Math.round(avgPriorScore);
    if (avgPriorScore > 70) {
      score += 18;
      flags.push(`Supplier has ${supplierContracts.length} prior high-risk contract(s) — repeat offender pattern`);
    } else if (avgPriorScore > 45) {
      score += 8;
      flags.push(`Supplier has ${supplierContracts.length} prior medium-risk contract(s)`);
    }
  }

  // ── 3. Competitive bidding (0–20 pts) ─────────────────────────────────────
  const descLower = description.toLowerCase();
  const singleSourceKeywords = ['single source', 'sole source', 'direct procurement', 'restricted tender', 'emergency procurement'];
  const isSingleSource = singleSourceKeywords.some(k => descLower.includes(k));
  details.single_source = isSingleSource;

  if (isSingleSource) {
    score += 20;
    flags.push('Single-source / direct procurement — no competitive bidding');
  } else if (contractValue > 50_000_000) {
    // Large contracts without explicit competitive bidding mention
    const competitiveKeywords = ['open tender', 'competitive', 'international tender', 'restricted tender'];
    const hasCompetitive = competitiveKeywords.some(k => descLower.includes(k));
    if (!hasCompetitive) {
      score += 10;
      flags.push('Large contract with no evidence of competitive bidding process');
    }
  }

  // ── 4. Official connections (0–15 pts) ────────────────────────────────────
  const connectionKeywords = ['director', 'official', 'minister', 'mp ', 'mca ', 'governor', 'senator', 'ps ', 'cs '];
  const hasOfficialConnection = connectionKeywords.some(k => descLower.includes(k));
  details.official_connection_detected = hasOfficialConnection;

  if (hasOfficialConnection) {
    score += 15;
    flags.push('Contract description references government official — potential conflict of interest');
  }

  // ── 5. County & sector risk (0–10 pts) ────────────────────────────────────
  const isHighRiskCounty = HIGH_RISK_COUNTIES.includes(county);
  const isHighRiskSector = HIGH_RISK_SECTORS.some(s => descLower.includes(s.toLowerCase()));
  details.high_risk_county = isHighRiskCounty;
  details.high_risk_sector = isHighRiskSector;

  if (isHighRiskCounty && isHighRiskSector) {
    score += 10;
    flags.push(`High-risk county (${county}) and sector combination — elevated scrutiny required`);
  } else if (isHighRiskCounty) {
    score += 5;
    flags.push(`${county} county has elevated corruption risk index`);
  } else if (isHighRiskSector) {
    score += 4;
    flags.push('Sector historically associated with procurement fraud in Kenya');
  }

  // ── 6. Contract value thresholds (0–10 pts) ───────────────────────────────
  if (contractValue > 500_000_000) {
    score += 10;
    flags.push('Contract value exceeds KES 500M — requires enhanced due diligence');
  } else if (contractValue > 100_000_000) {
    score += 5;
    flags.push('Contract value exceeds KES 100M — standard enhanced review');
  }

  // ── 7. Contract ID pattern analysis (0–5 pts) ─────────────────────────────
  if (contract_id && !/^KE-[A-Z]{2,5}-\d{4}-\d{4}$/.test(contract_id)) {
    score += 5;
    flags.push('Non-standard contract ID format — may indicate irregular procurement');
  }

  // ── Clamp and classify ────────────────────────────────────────────────────
  score = Math.max(0, Math.min(100, score));
  const risk_level = score >= 75 ? 'HIGH' : score >= 45 ? 'MEDIUM' : 'LOW';

  if (flags.length === 0) {
    flags.push('No significant risk flags detected — contract appears compliant');
  }

  return { score, risk_level, flags, details };
};

/**
 * Estimate market average value for a contract based on description keywords.
 * Uses Kenya government procurement benchmarks.
 */
const _estimateMarketAverage = (description = '', county = '') => {
  const desc = description.toLowerCase();

  // Road construction benchmarks (KES per km, typical 5km project)
  if (desc.includes('road') || desc.includes('highway') || desc.includes('tarmac')) {
    return county === 'Nairobi' ? 180_000_000 : 120_000_000;
  }
  // School construction
  if (desc.includes('school') || desc.includes('classroom') || desc.includes('education')) {
    return 15_000_000;
  }
  // Hospital / medical
  if (desc.includes('hospital') || desc.includes('medical') || desc.includes('health')) {
    return 45_000_000;
  }
  // Water infrastructure
  if (desc.includes('water') || desc.includes('borehole') || desc.includes('pipeline')) {
    return 35_000_000;
  }
  // ICT / equipment
  if (desc.includes('ict') || desc.includes('computer') || desc.includes('equipment')) {
    return 8_000_000;
  }
  // Market / public facility
  if (desc.includes('market') || desc.includes('facility') || desc.includes('renovation')) {
    return 12_000_000;
  }
  // Default
  return 25_000_000;
};

/**
 * Analyse trend across multiple contracts for a supplier.
 */
const analyseSupplierTrend = (contracts) => {
  if (!contracts.length) return null;
  const scores = contracts.map(c => c.risk_score || 0);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const trend = scores.length > 1 ? scores[scores.length - 1] - scores[0] : 0;
  return {
    contract_count: contracts.length,
    avg_risk_score: Math.round(avg),
    trend: trend > 10 ? 'INCREASING' : trend < -10 ? 'DECREASING' : 'STABLE',
    total_value: contracts.reduce((s, c) => s + (parseInt(c.value) || 0), 0)
  };
};

module.exports = { scoreContract, analyseSupplierTrend };
