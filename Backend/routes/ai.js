'use strict';
/**
 * KenyaWatch AI — AI Investigator Route
 * Google Gemini 2.5 Flash (free tier)
 * Get key free: https://aistudio.google.com/apikey
 * Set env var: GEMINI_API_KEY
 */

const router = require('express').Router();
const https  = require('https');
const { pool } = require('../db');

const GEMINI_MODEL    = 'gemini-2.5-flash';
const GEMINI_HOSTNAME = 'generativelanguage.googleapis.com';
const GEMINI_PATH     = '/v1beta/models/' + GEMINI_MODEL + ':generateContent';

// ── Kenya fraud pattern dataset — from Auditor General + EACC + PPRA ─────────
// This is training context embedded in every AI request so Gemini learns
// real Kenya-specific fraud patterns, not generic ones.
const KENYA_FRAUD_DATASET = `
=== KENYA FRAUD PATTERN KNOWLEDGE BASE ===
Source: Kenya Auditor General Reports 2019-2024, EACC Annual Reports, PPRA Audit Findings

--- DOCUMENTED FRAUD PATTERNS IN KENYA PROCUREMENT ---

PATTERN 1: GHOST PROJECTS (Most common — KES 40B+ annually)
- Contract awarded and fully paid, but project never constructed
- Common sectors: Education (classroom blocks), Health (dispensaries), Roads, Water kiosks
- Detection: Satellite imagery shows no construction at GPS coordinates
- Real examples:
  * Turkana North Girls Secondary School: KES 98M paid, empty scrubland confirmed
  * Kiambu Girls Secondary 8 classrooms: KES 28M paid, bare land confirmed
  * 47 ghost water kiosks in Wajir: KES 34M paid, only 3 of 20 exist
- Red flags: Contractor registered <6 months before award, no past project portfolio

PATTERN 2: INFLATED CONTRACTS (KES 80B+ annually)
- Contract value 200-400% above comparable market prices
- Common in: Medical equipment, IT systems, school furniture, fertilizer
- Real examples:
  * PPE scandal 2020: N95 masks procured at KES 800 vs KES 40 market price
  * Laptop supply Kiambu: KES 680M for laptops available at KES 200M market rate
  * Fertilizer NCPB 2023: KES 3.2B single-source, 4-month-old company
- Detection: Cross-reference with KEMSA, government framework contracts, market surveys
- Red flags: Single source, restricted tender, director related to procurement officer

PATTERN 3: SINGLE-SOURCE ABUSE (PPADA Section 103 violations)
- Law requires open tender for contracts above KES 1M (goods), KES 5M (works)
- Corrupt officials classify large contracts as "emergency" or "single-source"
- Real examples:
  * AgriChem Solutions KES 3.2B fertilizer: company 4 months old, no competitive bidding
  * MedFurnish KES 28M hospital furniture: company 6 months old, direct award
  * RevSystems KES 35M county software: company 4 months old, director is county treasurer's cousin
- PPADA thresholds violated:
  * Open tender required: goods >KES 1M, works >KES 5M, services >KES 1M
  * Restricted bidding requires PPRA approval + documented justification

PATTERN 4: POLITICALLY CONNECTED SUPPLIERS
- Company directors are relatives of: governors, county executives, MPs, procurement officers
- Shell companies registered weeks before tender deadline
- Same company wins contracts across multiple counties simultaneously
- Real pattern: "County governor's spouse wins single-source contracts in 3+ counties"
- Detection: Cross-reference company registration (Business Registration Service) with EACC declarations

PATTERN 5: PAYMENT BEFORE COMPLETION
- Full contract payment released before project verification
- Enables ghost projects — contractor paid, disappears
- Red flags in audit files: "certificate of completion" signed by same official who awarded contract
- PPADA violation: S.92 requires completion certificate before final payment

PATTERN 6: EMERGENCY PROCUREMENT ABUSE
- Emergency classification (PPADA S.103(3)) used for routine purchases
- No public notice, no competition, inflated prices
- COVID-19 era: massive emergency procurement fraud across all 47 counties
- Detection: Compare emergency declaration date vs. contract date vs. actual need

--- KENYA-SPECIFIC RISK THRESHOLDS ---
HIGH RISK triggers (score 75-100):
- Single-source >KES 5M: +30 points
- Company age <12 months at award: +28 points
- Contract value >200% market rate: +25 points
- Director linked to government official: +20 points
- Emergency classification without crisis evidence: +15 points

MEDIUM RISK triggers (score 40-74):
- Restricted tender without PPRA approval: +15 points
- Payment before verified completion: +12 points
- No performance bond for contracts >KES 10M: +10 points
- Single supplier winning >30% of county budget: +10 points

--- COUNTY-LEVEL CORRUPTION RISK (NECS 2023-24) ---
VERY HIGH (bribery likelihood >1.0): Kwale, Kilifi, Wajir, Mandera, Marsabit
HIGH (bribery likelihood 0.8-1.0): Tharaka Nithi, Kitui, Murang'a, Samburu, Elgeyo Marakwet, Vihiga, Homa Bay
HIGH (large value corruption): West Pokot, Uasin Gishu, Baringo, Busia, Nairobi
HIGH (national share): Embu, Bomet, Kakamega, Tana River, Kiambu, Nakuru

--- SECTOR RISK LEVELS (EACC Annual Report 2024) ---
1. Infrastructure/Roads: 35% of total corruption losses (ghost projects, inflated contracts)
2. Health procurement: 13% (medical equipment overpricing, drug supply fraud)
3. Education: 10% (ghost schools, textbook overpricing, laptop fraud)
4. Agriculture: 8% (fertilizer diversion, subsidy fraud)
5. ICT/Digital: 9% (overpriced systems, non-functional software)
6. Water/Energy: 18% combined

--- LEGAL FRAMEWORK ---
PPADA 2015 key sections:
- S.69: Open tender mandatory above thresholds
- S.103: Restrictive procurement requires written justification + PPRA approval
- S.103(3): Emergency procurement — must be genuine emergency, not routine
- S.92: Payment only after satisfactory completion certificate
- S.195: Criminal liability for procurement officers — up to 10 years imprisonment

EACC Act 2011:
- S.11: EACC can investigate any public officer for corruption
- S.26: Asset recovery for unexplained wealth

=== END KENYA FRAUD KNOWLEDGE BASE ===
`;

// ── System instruction ────────────────────────────────────────────────────────
const SYSTEM = `You are KenyaWatch AI, an expert anti-corruption investigator for Kenya.
You have deep knowledge of Kenya procurement law, documented fraud patterns, and real cases.

YOUR CAPABILITIES:
- Analyse contracts from the live database for fraud indicators
- Cross-reference suppliers across multiple contracts to find cartel patterns
- Identify conflicts of interest between suppliers and procurement officials
- Calculate accurate risk scores using Kenya-specific thresholds
- Guide citizens on safe reporting and evidence collection
- Explain Kenya procurement law in plain language
- Respond in Kiswahili when user writes in Kiswahili

RESPONSE STYLE:
- Reference actual contract IDs, supplier names, and values from the live data
- Use **bold** for risk indicators, amounts, and entity names
- Be specific: "Contract KE-AGR-2025-0005 scores 97/100 because..."
- Keep responses under 400 words unless a full investigation report is requested
- Always end with one concrete next action
- Never speculate without data — cite the contract IDs or report numbers`;

// ── Live DB context ───────────────────────────────────────────────────────────
async function getLiveContext() {
  try {
    const [cRes, rRes, gRes, sRes, newRes] = await Promise.all([
      pool.query(`SELECT contract_id,description,county,sector,value,supplier,
                         bid_type,risk_score,risk_level,flags,procuring_entity,awarded_date,source
                  FROM contracts ORDER BY risk_score DESC, value DESC LIMIT 30`),
      pool.query(`SELECT case_number,type,county,sector,description,
                         amount,status,ai_credibility_score,routing,created_at
                  FROM reports ORDER BY created_at DESC LIMIT 10`),
      pool.query(`SELECT contract_ref,project_name,county,sector,claimed_status,
                         satellite_status,amount_at_risk,detection_status,confidence_score
                  FROM ghost_projects WHERE detection_status IN ('ghost','partial')
                  ORDER BY amount_at_risk DESC LIMIT 10`),
      pool.query(`SELECT COUNT(*) FILTER (WHERE risk_level='HIGH')   AS h,
                         COUNT(*) FILTER (WHERE risk_level='MEDIUM') AS m,
                         COUNT(*) FILTER (WHERE risk_level='LOW')    AS l,
                         COUNT(*)                                     AS t,
                         COALESCE(SUM(value) FILTER (WHERE risk_level='HIGH'),0) AS hv
                  FROM contracts`),
      pool.query(`SELECT contract_id,description,county,value,supplier,risk_level,risk_score,awarded_date
                  FROM contracts WHERE source='ppip_ocds' ORDER BY created_at DESC LIMIT 10`),
    ]);

    const s   = sRes.rows[0];
    const fmt = n => {
      const v = parseInt(n)||0;
      return v>=1e9?'KES '+(v/1e9).toFixed(1)+'B':v>=1e6?'KES '+(v/1e6).toFixed(0)+'M':'KES '+v.toLocaleString();
    };

    let ctx = `\n=== LIVE DATABASE (${new Date().toISOString().slice(0,16)} EAT) ===\n`;
    ctx += `TOTALS: ${s.t} contracts | HIGH: ${s.h} (${fmt(s.hv)}) | MED: ${s.m} | LOW: ${s.l}\n`;

    if (newRes.rows.length) {
      ctx += `\nRECENTLY IMPORTED FROM PPIP (real government contracts):\n`;
      newRes.rows.forEach(c => {
        ctx += `• [${c.contract_id}] ${(c.description||'').slice(0,70)} | ${c.county}|${fmt(c.value)}|${c.risk_level}\n`;
        if (c.awarded_date) ctx += `  Awarded: ${c.awarded_date} | Supplier: ${c.supplier||'?'}\n`;
      });
    }

    ctx += `\nALL CONTRACTS BY RISK:\n`;
    cRes.rows.forEach(c => {
      const fl = (()=>{try{return Array.isArray(c.flags)?c.flags:JSON.parse(c.flags||'[]');}catch{return[];}})();
      ctx += `• [${c.contract_id}] ${(c.description||'').slice(0,80)}\n`;
      ctx += `  ${c.county||'?'}|${c.sector||'?'}|${fmt(c.value)}|${c.bid_type||'open'}|${c.risk_level}(${c.risk_score})\n`;
      ctx += `  Supplier:${c.supplier||'?'}`;
      if (c.procuring_entity) ctx += ` | Entity:${c.procuring_entity}`;
      ctx += '\n';
      if (fl.length) ctx += `  Flags: ${fl.slice(0,3).join(' | ')}\n`;
    });

    if (gRes.rows.length) {
      ctx += `\nGHOST PROJECTS (satellite-confirmed):\n`;
      gRes.rows.forEach(g => {
        ctx += `• [${g.contract_ref||'?'}] ${g.project_name} (${g.county}) `;
        ctx += `${g.detection_status.toUpperCase()} ${g.confidence_score}%conf ${fmt(g.amount_at_risk)}\n`;
        ctx += `  Claimed:${(g.claimed_status||'').slice(0,60)}\n`;
        ctx += `  Satellite:${(g.satellite_status||'').slice(0,60)}\n`;
      });
    }

    if (rRes.rows.length) {
      ctx += `\nCITIZEN REPORTS:\n`;
      rRes.rows.forEach(r => {
        ctx += `• [${r.case_number}] ${r.type}|${r.county||'?'}|${r.status}|score:${r.ai_credibility_score}\n`;
        ctx += `  ${(r.description||'').slice(0,90)}\n`;
      });
    }

    ctx += `=== END LIVE DATA ===\n`;
    return ctx;
  } catch (e) {
    console.error('DB context error:', e.message);
    return '\n[DB context temporarily unavailable]\n';
  }
}

// ── Gemini API call ────────────────────────────────────────────────────────────
function callGemini(history, systemText, userMessage) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return reject(new Error('GEMINI_API_KEY not set'));

    const body = JSON.stringify({
      system_instruction: { parts: [{ text: systemText }] },
      contents: [
        ...history,
        { role: 'user', parts: [{ text: userMessage }] },
      ],
      generationConfig: {
        temperature:     0.3,
        topP:            0.9,
        maxOutputTokens: 1024,
      },
      safetySettings: [
        { category:'HARM_CATEGORY_HARASSMENT',       threshold:'BLOCK_NONE' },
        { category:'HARM_CATEGORY_HATE_SPEECH',       threshold:'BLOCK_NONE' },
        { category:'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold:'BLOCK_NONE' },
        { category:'HARM_CATEGORY_DANGEROUS_CONTENT', threshold:'BLOCK_NONE' },
      ],
    });

    const options = {
      hostname: GEMINI_HOSTNAME,
      path:     GEMINI_PATH,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'x-goog-api-key': apiKey,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.error) return reject(new Error(parsed.error.message || 'Gemini error ' + parsed.error.code));
          const candidate = (parsed.candidates||[])[0];
          if (!candidate) return reject(new Error('No candidates returned. HTTP: ' + res.statusCode));
          if (candidate.finishReason === 'SAFETY') return reject(new Error('Blocked by safety filters'));
          const text = (candidate.content?.parts||[]).map(p=>p.text||'').join('').trim();
          if (!text) return reject(new Error('Empty response from Gemini'));
          resolve(text);
        } catch (e) {
          reject(new Error('Parse error: ' + e.message + ' | Raw: ' + raw.slice(0,200)));
        }
      });
    });

    req.on('error', err => reject(new Error('Network: ' + err.message)));
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout after 30s')); });
    req.write(body);
    req.end();
  });
}

// ── Session memory ─────────────────────────────────────────────────────────────
const sessions = new Map();
function getSession(id) { return sessions.get(id) || []; }
function saveSession(id, msgs) { sessions.set(id, msgs.slice(-20)); }

// ── POST /api/ai/chat ─────────────────────────────────────────────────────────
router.post('/chat', async (req, res) => {
  const { message, session_id } = req.body || {};

  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, error: 'message is required' });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.json({
      success: true, fallback: true,
      reply:
        '⚠️ **AI investigator not activated.**\n\n' +
        '1. Go to **https://aistudio.google.com/apikey**\n' +
        '2. Sign in with Google → Create API key (free)\n' +
        '3. In Render → Environment → add: `GEMINI_API_KEY` = your key\n' +
        '4. Save — AI activates immediately on next request\n\n' +
        '_No billing or credit card required._',
    });
  }

  const sid     = String(session_id || 'default').slice(0, 80);
  const userMsg = String(message).trim().slice(0, 3000);

  try {
    const [liveCtx] = await Promise.all([getLiveContext()]);

    // Full system = instruction + Kenya fraud dataset + live DB data
    const fullSystem = SYSTEM + '\n' + KENYA_FRAUD_DATASET + liveCtx;

    const history = getSession(sid);
    const reply   = await callGemini(history, fullSystem, userMsg);

    history.push({ role: 'user',  parts: [{ text: userMsg }] });
    history.push({ role: 'model', parts: [{ text: reply   }] });
    saveSession(sid, history);

    return res.json({ success: true, reply, fallback: false, session_id: sid, model: GEMINI_MODEL });

  } catch (e) {
    console.error('AI error:', e.message);

    let reply;
    const m = e.message.toLowerCase();
    if (m.includes('api_key')||m.includes('invalid')||m.includes('401')||m.includes('403')) {
      reply = '⚠️ **Invalid Gemini API key.**\n\nCheck `GEMINI_API_KEY` in Render → Environment Variables.\n\nGet a free key: **https://aistudio.google.com/apikey**';
    } else if (m.includes('resource_exhausted')||m.includes('429')||m.includes('quota')) {
      reply = '⏱️ **Rate limit reached.** Free tier: 15 req/min. Please wait 60s and retry.';
    } else if (m.includes('timeout')) {
      reply = '⏱️ Request timed out. Please try again.';
    } else {
      reply = '❌ **AI error:** ' + e.message + '\n\nPlease try again.';
    }

    return res.json({ success: true, reply, fallback: true, error: e.message });
  }
});

// ── GET /api/ai/status ────────────────────────────────────────────────────────
router.get('/status', (_req, res) => res.json({
  success: true, ai_ready: !!process.env.GEMINI_API_KEY,
  provider: 'Google Gemini', model: GEMINI_MODEL,
  endpoint: GEMINI_HOSTNAME + GEMINI_PATH, free: true,
}));

router.delete('/session/:id', (req, res) => {
  sessions.delete(req.params.id);
  res.json({ success: true });
});

module.exports = router;
