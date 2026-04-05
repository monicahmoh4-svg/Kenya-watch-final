'use strict';

// Kenya market benchmarks per sector (KES per unit/sqm/km)
const MARKET_BENCHMARKS = {
  'Roads & Infrastructure': { per_km: 45000000, per_sqm: 25000 },
  'Health':                 { per_unit: 15000000, per_sqm: 85000 },
  'Education':              { per_classroom: 4500000, per_sqm: 55000 },
  'Water & Sanitation':     { per_connection: 180000, per_sqm: 65000 },
  'Agriculture':            { per_ha: 250000 },
  'ICT':                    { per_workstation: 85000 },
  'Security':               { per_camera: 450000 },
  'Infrastructure':         { per_sqm: 65000 },
};

// Known politically connected supplier patterns (hashed/anonymised)
const HIGH_RISK_KEYWORDS = [
  'nexus', 'techsource', 'medsupply', 'agriche', 'netpro',
  'smartcity', 'finsystems', 'medequip', 'safemanage', 'futureit'
];

const BID_TYPE_SCORES = {
  'single_source': 30,
  'restricted':    15,
  'emergency':     10,
  'negotiated':    8,
  'open':          0,
  'competitive':   0,
};

/**
 * Compute AI risk score for a contract
 * Returns { score, risk_level, flags }
 */
function scoreContract({ contract_id, description, value, supplier, supplier_reg_date, bid_type, awarded_date, sector, county }) {
  let score = 0;
  const flags = [];

  // 1. Bid type risk
  const bidScore = BID_TYPE_SCORES[bid_type] || 0;
  score += bidScore;
  if (bidScore >= 30) flags.push('Single-source award — no competitive bidding process');
  else if (bidScore >= 15) flags.push('Restricted bidding for large contract — unusual');

  // 2. Company age at award date
  if (supplier_reg_date && awarded_date) {
    const regDate = new Date(supplier_reg_date);
    const awardDate = new Date(awarded_date);
    const ageMonths = (awardDate - regDate) / (1000 * 60 * 60 * 24 * 30);
    if (ageMonths < 6) {
      score += 28;
      flags.push(`Company only ${Math.floor(ageMonths)} months old at award — classic shell company indicator`);
    } else if (ageMonths < 18) {
      score += 18;
      flags.push(`Company ${Math.floor(ageMonths)} months old at award — limited track record`);
    } else if (ageMonths < 36) {
      score += 8;
      flags.push('Company less than 3 years old — limited government contracting history');
    }
  }

  // 3. Price deviation from market benchmark
  if (value && sector) {
    const bench = MARKET_BENCHMARKS[sector];
    if (bench) {
      const benchValue = Object.values(bench)[0];
      // Simple heuristic: high value contracts in sector vs benchmark
      const ratio = value / benchValue;
      if (ratio > 50 && bid_type === 'single_source') {
        score += 22;
        flags.push(`Price ${Math.round(ratio / 10)}x above per-unit sector benchmark for ${sector}`);
      } else if (ratio > 200 && bid_type !== 'open') {
        score += 15;
        flags.push(`Contract value significantly above typical sector benchmarks`);
      }
    }
  }

  // 4. High-risk supplier name patterns
  if (supplier) {
    const supplierLower = supplier.toLowerCase();
    const isHighRisk = HIGH_RISK_KEYWORDS.some(k => supplierLower.includes(k));
    if (isHighRisk) {
      score += 20;
      flags.push('Supplier matches known high-risk procurement network patterns');
    }
  }

  // 5. High-value single/restricted contracts
  if (value >= 1000000000 && bid_type !== 'open') {
    score += 18;
    flags.push(`Contract value KES ${(value / 1e9).toFixed(1)}B awarded via non-open process`);
  } else if (value >= 500000000 && bid_type === 'single_source') {
    score += 22;
    flags.push(`KES ${(value / 1e6).toFixed(0)}M single-source contract — extraordinary justification required`);
  }

  // 6. Description keyword risk signals
  const descLower = (description || '').toLowerCase();
  const riskKeywords = ['supply of', 'procurement of', 'purchase of'];
  const cleanKeywords = ['construction', 'rehabilitation', 'upgrade', 'expansion'];
  if (bid_type === 'single_source' && riskKeywords.some(k => descLower.includes(k))) {
    score += 10;
    flags.push('Supply/purchase contract awarded via single-source — should be competitive');
  }

  // 7. Add positive signals (reduce score)
  const positiveSignals = ['world bank', 'afdb', 'eu funded', 'kfw', 'usaid', 'open tender', 'international'];
  const descPlus = (description || '').toLowerCase() + (supplier || '').toLowerCase();
  if (positiveSignals.some(p => descPlus.includes(p))) {
    score = Math.max(0, score - 15);
    flags.push('Positive: International co-financing or verified open competitive process');
  }

  score = Math.min(Math.max(score, 0), 100);
  const risk_level = score >= 75 ? 'HIGH' : score >= 40 ? 'MEDIUM' : 'LOW';

  if (flags.length === 0) flags.push('No significant fraud indicators detected');

  return { score, risk_level, flags };
}

module.exports = { scoreContract };
