'use strict';

/**
 * Data Generator — generates realistic Kenya government procurement seed data.
 * Includes real counties, sectors, supplier patterns, and corruption scenarios.
 */

// ── Kenya Counties ────────────────────────────────────────────────────────────
const COUNTIES = [
  'Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Kiambu', 'Kisii',
  'Kakamega', 'Turkana', 'Nyeri', 'Machakos', 'Meru', 'Kilifi',
  'Uasin Gishu', 'Murang\'a', 'Bungoma', 'Siaya', 'Homa Bay',
  'Trans Nzoia', 'Nandi', 'Bomet'
];

// ── Sectors ───────────────────────────────────────────────────────────────────
const SECTORS = [
  'Health', 'Education', 'Roads & Infrastructure', 'Water & Sanitation',
  'Police & Security', 'Lands', 'Agriculture', 'ICT', 'Energy'
];

// ── Supplier name patterns (realistic Kenya company names) ────────────────────
const SUPPLIERS = {
  high_risk: [
    'Nexus Build Ltd', 'Phantom Contractors Ltd', 'Elite Supply Co.',
    'Rapid Infrastructure Ltd', 'Swift Construct Kenya', 'Alpha Ventures Ltd',
    'Global Solutions EA', 'Premier Enterprises Ltd', 'Apex Builders Kenya',
    'Summit Contractors Ltd', 'Horizon Build Co.', 'Pinnacle Supply Ltd',
    'Zenith Infrastructure', 'Vanguard Contractors', 'Crest Build Ltd'
  ],
  medium_risk: [
    'EduSupply Co.', 'MedKe Distributors', 'AquaTech Kenya', 'Daggy Techs Ltd',
    'Savanna Builders', 'Rift Valley Contractors', 'Coastal Build Ltd',
    'Highland Infrastructure', 'Lakeside Contractors', 'Nairobi Build Co.',
    'Kenya Road Works', 'East Africa Supply', 'Mombasa Contractors',
    'Kisumu Infrastructure', 'Nakuru Build Ltd'
  ],
  low_risk: [
    'China Road & Bridge Corp', 'H. Young & Co. (EA)', 'Raubex Kenya',
    'Strabag Kenya', 'Lafarge Holcim Kenya', 'Bamburi Cement',
    'Civicon Ltd', 'Spencon Services', 'Nyoro Construction',
    'Geopetro Services', 'Techno Brain Ltd', 'Safaricom PLC',
    'Kenya Power', 'KPLC Contractors', 'National Cement Co.'
  ]
};

// ── Contract description templates ────────────────────────────────────────────
const CONTRACT_TEMPLATES = [
  // Roads
  { desc: 'Road rehabilitation and tarmacking — {road} Road, {county}', sector: 'Roads & Infrastructure', baseValue: 120_000_000 },
  { desc: 'Construction of {county}–{county2} highway bypass', sector: 'Roads & Infrastructure', baseValue: 450_000_000 },
  { desc: 'Grading and gravelling of rural access roads in {county}', sector: 'Roads & Infrastructure', baseValue: 35_000_000 },
  { desc: 'Bridge construction over {river} River, {county}', sector: 'Roads & Infrastructure', baseValue: 85_000_000 },
  // Health
  { desc: 'Supply of medical equipment to {county} County Referral Hospital', sector: 'Health', baseValue: 45_000_000 },
  { desc: 'Construction of {county} Level 4 Hospital maternity wing', sector: 'Health', baseValue: 180_000_000 },
  { desc: 'Supply of pharmaceuticals and medical supplies — {county} County', sector: 'Health', baseValue: 28_000_000 },
  { desc: 'Renovation of {county} District Hospital outpatient department', sector: 'Health', baseValue: 22_000_000 },
  // Education
  { desc: 'Construction of {n}-classroom block at {county} Secondary School', sector: 'Education', baseValue: 18_000_000 },
  { desc: 'Supply of school furniture and equipment — {n} schools, {county}', sector: 'Education', baseValue: 12_000_000 },
  { desc: 'Construction of {county} Technical and Vocational Training Institute', sector: 'Education', baseValue: 95_000_000 },
  { desc: 'Supply of textbooks and learning materials — {county} County', sector: 'Education', baseValue: 8_000_000 },
  // Water
  { desc: 'Construction of water treatment plant — {county} County', sector: 'Water & Sanitation', baseValue: 140_000_000 },
  { desc: 'Drilling and equipping of {n} boreholes in {county}', sector: 'Water & Sanitation', baseValue: 25_000_000 },
  { desc: 'Water pipeline extension — {county} urban areas', sector: 'Water & Sanitation', baseValue: 55_000_000 },
  { desc: 'Construction of sanitation facilities — {n} schools, {county}', sector: 'Water & Sanitation', baseValue: 15_000_000 },
  // ICT
  { desc: '{county} County ICT infrastructure upgrade and connectivity', sector: 'ICT', baseValue: 43_000_000 },
  { desc: 'Supply and installation of CCTV surveillance system — {county}', sector: 'ICT', baseValue: 18_000_000 },
  { desc: 'County government ERP system implementation — {county}', sector: 'ICT', baseValue: 65_000_000 },
  // Agriculture
  { desc: 'Supply of fertiliser and seeds to farmers — {county} County', sector: 'Agriculture', baseValue: 32_000_000 },
  { desc: 'Construction of {county} County grain storage facility', sector: 'Agriculture', baseValue: 48_000_000 }
];

const ROADS = ['Ring', 'Bypass', 'Industrial', 'Mombasa', 'Thika', 'Ngong', 'Waiyaki', 'Jogoo', 'Langata', 'Uhuru'];
const RIVERS = ['Tana', 'Athi', 'Nzoia', 'Mara', 'Ewaso Ng\'iro', 'Turkwel', 'Kerio', 'Yala'];

// ── Ghost project scenarios ───────────────────────────────────────────────────
const GHOST_SCENARIOS = [
  {
    project_name: 'Kiambu Secondary School 8-Classroom Block',
    county: 'Kiambu',
    claimed_status: '8-classroom block fully built and furnished',
    satellite_status: 'Bare land — no structure detected',
    amount_at_risk: 28_000_000,
    detection_status: 'ghost',
    contract_ref: 'KE-EDU-2024-0112'
  },
  {
    project_name: 'Nakuru Water Treatment Plant Phase 2',
    county: 'Nakuru',
    claimed_status: '100% complete — operational',
    satellite_status: '~15% structure visible — foundation only',
    amount_at_risk: 142_000_000,
    detection_status: 'partial',
    contract_ref: 'KE-WAT-2024-0087'
  },
  {
    project_name: 'Kisii Central Market Renovation',
    county: 'Kisii',
    claimed_status: 'Renovation complete — market operational',
    satellite_status: 'Structure confirmed — consistent with contract',
    amount_at_risk: 12_000_000,
    detection_status: 'verified',
    contract_ref: 'KE-INF-2025-0034'
  },
  {
    project_name: 'Turkana County Hospital Maternity Wing',
    county: 'Turkana',
    claimed_status: 'Maternity wing complete — 40 beds operational',
    satellite_status: 'Empty plot — vegetation only, no construction',
    amount_at_risk: 85_000_000,
    detection_status: 'ghost',
    contract_ref: 'KE-HLT-2024-0203'
  },
  {
    project_name: 'Kakamega–Mumias Road Tarmacking',
    county: 'Kakamega',
    claimed_status: '18km road fully tarmacked',
    satellite_status: '~30% complete — grading done, no tarmac visible',
    amount_at_risk: 320_000_000,
    detection_status: 'partial',
    contract_ref: 'KE-RDS-2024-0156'
  },
  {
    project_name: 'Mombasa Port Road Rehabilitation',
    county: 'Mombasa',
    claimed_status: 'Road rehabilitation complete',
    satellite_status: 'Road surface confirmed — tarmac visible',
    amount_at_risk: 0,
    detection_status: 'verified',
    contract_ref: 'KE-RDS-2025-0089'
  },
  {
    project_name: 'Kisumu Lakeside Borehole Project (10 boreholes)',
    county: 'Kisumu',
    claimed_status: '10 boreholes drilled and equipped',
    satellite_status: 'Undeveloped land — no borehole infrastructure visible',
    amount_at_risk: 45_000_000,
    detection_status: 'ghost',
    contract_ref: 'KE-WAT-2025-0067'
  },
  {
    project_name: 'Nyeri County ICT Hub Construction',
    county: 'Nyeri',
    claimed_status: 'ICT hub built and equipped',
    satellite_status: '~45% complete — walls at plinth level, no roof',
    amount_at_risk: 38_000_000,
    detection_status: 'partial',
    contract_ref: 'KE-ICT-2024-0198'
  },
  {
    project_name: 'Machakos Level 5 Hospital Extension',
    county: 'Machakos',
    claimed_status: 'Hospital extension complete — 80 beds',
    satellite_status: 'Building confirmed — extension visible and complete',
    amount_at_risk: 0,
    detection_status: 'verified',
    contract_ref: 'KE-HLT-2025-0044'
  },
  {
    project_name: 'Nairobi Eastlands Drainage System',
    county: 'Nairobi',
    claimed_status: '5km drainage channel complete',
    satellite_status: 'Open field — no drainage infrastructure detected',
    amount_at_risk: 95_000_000,
    detection_status: 'ghost',
    contract_ref: 'KE-INF-2024-0321'
  }
];

// ── Sample reports ────────────────────────────────────────────────────────────
const SAMPLE_REPORTS = [
  {
    type: 'Procurement fraud',
    county: 'Nairobi',
    sector: 'Roads & Infrastructure',
    description: 'The contractor for the Ring Road rehabilitation project (KE-PRO-2026-0341) has not done any work despite receiving KES 200 million advance payment in January 2026. The site has been abandoned for 3 months. The company director is the brother-in-law of the county roads director. I have photos of the empty site and the payment receipts.',
    amount: 200_000_000,
    anonymous: true,
    status: 'reviewing',
    ai_credibility_score: 89
  },
  {
    type: 'Ghost project / Fake delivery',
    county: 'Kiambu',
    sector: 'Education',
    description: 'The 8-classroom block at Kiambu Secondary School was supposedly completed in December 2024 but there is no building. The school principal confirmed they never received any construction. The contractor EduSupply Co. submitted completion certificates with forged signatures. Amount involved is approximately KES 28 million.',
    amount: 28_000_000,
    anonymous: true,
    status: 'reviewing',
    ai_credibility_score: 92
  },
  {
    type: 'Bribery / Kickbacks',
    county: 'Mombasa',
    sector: 'Health',
    description: 'A procurement officer at Mombasa County Health Department is demanding 15% kickback from all medical supply contracts. I witnessed him receiving cash from MedKe Distributors representative on 15th March 2026 at his office. The amount was approximately KES 5 million. I can provide the name of the officer if needed.',
    amount: 5_000_000,
    anonymous: true,
    status: 'pending',
    ai_credibility_score: 78
  },
  {
    type: 'Embezzlement of public funds',
    county: 'Nakuru',
    sector: 'Water & Sanitation',
    description: 'The Nakuru Water Treatment Plant project (KE-WAT-2024-0087) has only 15% of work done but the contractor has been paid 80% of the contract value (KES 113 million). The county water director approved all payments without site inspection. The contractor AquaTech Kenya is owned by a relative of the county governor.',
    amount: 113_000_000,
    anonymous: false,
    status: 'pending',
    ai_credibility_score: 85
  },
  {
    type: 'Nepotism / Political appointments',
    county: 'Kisii',
    sector: 'ICT',
    description: 'Daggy Techs Ltd was awarded the county ICT contract without competitive bidding. The company was registered only 6 months before the award and has no track record. The owner is a close associate of the county governor. The contract value is KES 43 million.',
    amount: 43_000_000,
    anonymous: true,
    status: 'resolved',
    ai_credibility_score: 71
  },
  {
    type: 'Procurement fraud',
    county: 'Kakamega',
    sector: 'Roads & Infrastructure',
    description: 'I think maybe the road project might have some issues. Someone told me the contractor is not doing good work.',
    amount: null,
    anonymous: true,
    status: 'dismissed',
    ai_credibility_score: 22
  },
  {
    type: 'Ghost project / Fake delivery',
    county: 'Turkana',
    sector: 'Health',
    description: 'The Turkana County Hospital maternity wing project (KE-HLT-2024-0203) was declared complete in October 2024 and KES 85 million was paid to the contractor. However, the maternity wing does not exist. Patients are still being turned away. The hospital administrator confirmed no construction was done. I have a letter from the hospital administrator and photos of the empty plot.',
    amount: 85_000_000,
    anonymous: true,
    status: 'reviewing',
    ai_credibility_score: 94
  },
  {
    type: 'Police extortion',
    county: 'Nairobi',
    sector: 'Police & Security',
    description: 'Police officers at Pangani Police Station are extorting business owners along Ngara Road. They demand KES 5,000 per week from each shop owner or threaten arrest. This has been going on since January 2026. Approximately 50 shops are affected, totalling KES 250,000 per week.',
    amount: 250_000,
    anonymous: true,
    status: 'pending',
    ai_credibility_score: 67
  },
  {
    type: 'Land grabbing',
    county: 'Kiambu',
    sector: 'Lands',
    description: 'A senior official at Kiambu Lands Office has been issuing title deeds for public land in Ruiru. At least 3 parcels of school land have been transferred to private individuals. I have the title deed numbers: LR/RUIRU/1234, LR/RUIRU/1235, LR/RUIRU/1236. The official is demanding KES 500,000 per title deed.',
    amount: 1_500_000,
    anonymous: true,
    status: 'pending',
    ai_credibility_score: 81
  },
  {
    type: 'Procurement fraud',
    county: 'Kisumu',
    sector: 'Water & Sanitation',
    description: 'The 10 borehole project in Kisumu (KE-WAT-2025-0067) — contractor received full payment but no boreholes were drilled. Community members have been waiting for water for 8 months. The contractor submitted fake completion certificates. Total amount: KES 45 million.',
    amount: 45_000_000,
    anonymous: true,
    status: 'reviewing',
    ai_credibility_score: 88
  }
];

/**
 * Generate the full set of seed contracts (50+ records).
 */
const generateContracts = () => {
  const contracts = [
    // ── Pre-defined high-profile contracts ──────────────────────────────────
    {
      contract_id: 'KE-PRO-2026-0341',
      description: 'Road rehabilitation and tarmacking — Ring Road, Nairobi',
      county: 'Nairobi',
      sector: 'Roads & Infrastructure',
      value: 450_000_000,
      supplier: 'Nexus Build Ltd',
      risk_score: 94,
      risk_level: 'HIGH',
      flags: JSON.stringify([
        'No prior government contracts — unproven supplier for large award',
        'Single-source / direct procurement — no competitive bidding',
        'Price 220% above market average — extreme overpricing',
        'Director linked to government officials — potential conflict of interest',
        'Contract value exceeds KES 500M — requires enhanced due diligence'
      ])
    },
    {
      contract_id: 'KE-PRO-2026-0298',
      description: 'Supply of school furniture and equipment — 140 schools, Kiambu',
      county: 'Kiambu',
      sector: 'Education',
      value: 220_000_000,
      supplier: 'EduSupply Co.',
      risk_score: 88,
      risk_level: 'HIGH',
      flags: JSON.stringify([
        'Price 340% above market average — extreme overpricing',
        'Director linked to government officials — potential conflict of interest',
        'Large contract with no evidence of competitive bidding process',
        'Kiambu county has elevated corruption risk index'
      ])
    },
    {
      contract_id: 'KE-PRO-2026-0271',
      description: 'Supply of medical equipment to Mombasa County Referral Hospital',
      county: 'Mombasa',
      sector: 'Health',
      value: 95_500_000,
      supplier: 'MedKe Distributors',
      risk_score: 79,
      risk_level: 'HIGH',
      flags: JSON.stringify([
        'Supplier name matches known high-risk pattern',
        'No prior government contracts — unproven supplier for large award',
        'Price 180% above market average — significant overpricing',
        'Mombasa county has elevated corruption risk index'
      ])
    },
    {
      contract_id: 'KE-PRO-2026-0244',
      description: 'Construction of water treatment plant — Nakuru County',
      county: 'Nakuru',
      sector: 'Water & Sanitation',
      value: 180_000_000,
      supplier: 'AquaTech Kenya',
      risk_score: 61,
      risk_level: 'MEDIUM',
      flags: JSON.stringify([
        'Large contract with no evidence of competitive bidding process',
        'Sector historically associated with procurement fraud in Kenya',
        'Contract value exceeds KES 100M — standard enhanced review'
      ])
    },
    {
      contract_id: 'KE-PRO-2026-0201',
      description: 'Kisii County ICT infrastructure upgrade and connectivity',
      county: 'Kisii',
      sector: 'ICT',
      value: 43_000_000,
      supplier: 'Daggy Techs Ltd',
      risk_score: 18,
      risk_level: 'LOW',
      flags: JSON.stringify([
        'No significant risk flags detected — contract appears compliant'
      ])
    },
    // ── Additional high-risk contracts ───────────────────────────────────────
    {
      contract_id: 'KE-HLT-2024-0203',
      description: 'Construction of Turkana County Hospital maternity wing — 40 beds',
      county: 'Turkana',
      sector: 'Health',
      value: 85_000_000,
      supplier: 'Phantom Contractors Ltd',
      risk_score: 91,
      risk_level: 'HIGH',
      flags: JSON.stringify([
        'Supplier name matches known high-risk pattern',
        'No prior government contracts — unproven supplier for large award',
        'Price 190% above market average — extreme overpricing',
        'Single-source / direct procurement — no competitive bidding',
        'Sector historically associated with procurement fraud in Kenya'
      ])
    },
    {
      contract_id: 'KE-RDS-2024-0156',
      description: 'Kakamega–Mumias road tarmacking — 18km',
      county: 'Kakamega',
      sector: 'Roads & Infrastructure',
      value: 320_000_000,
      supplier: 'Elite Supply Co.',
      risk_score: 86,
      risk_level: 'HIGH',
      flags: JSON.stringify([
        'Supplier name matches known high-risk pattern',
        'Price 170% above market average — significant overpricing',
        'Large contract with no evidence of competitive bidding process',
        'Contract value exceeds KES 500M — requires enhanced due diligence',
        'High-risk county (Kakamega) and sector combination'
      ])
    },
    {
      contract_id: 'KE-WAT-2025-0067',
      description: 'Drilling and equipping of 10 boreholes in Kisumu',
      county: 'Kisumu',
      sector: 'Water & Sanitation',
      value: 45_000_000,
      supplier: 'Rapid Infrastructure Ltd',
      risk_score: 82,
      risk_level: 'HIGH',
      flags: JSON.stringify([
        'Supplier name matches known high-risk pattern',
        'Price 160% above market average — significant overpricing',
        'Single-source / direct procurement — no competitive bidding',
        'Sector historically associated with procurement fraud in Kenya'
      ])
    },
    {
      contract_id: 'KE-INF-2024-0321',
      description: 'Nairobi Eastlands drainage system — 5km channel',
      county: 'Nairobi',
      sector: 'Roads & Infrastructure',
      value: 95_000_000,
      supplier: 'Swift Construct Kenya',
      risk_score: 77,
      risk_level: 'HIGH',
      flags: JSON.stringify([
        'Supplier name matches known high-risk pattern',
        'Price 140% above market average — significant overpricing',
        'High-risk county (Nairobi) and sector combination',
        'Contract value exceeds KES 100M — standard enhanced review'
      ])
    },
    {
      contract_id: 'KE-EDU-2024-0112',
      description: 'Construction of 8-classroom block — Kiambu Secondary School',
      county: 'Kiambu',
      sector: 'Education',
      value: 28_000_000,
      supplier: 'Alpha Ventures Ltd',
      risk_score: 83,
      risk_level: 'HIGH',
      flags: JSON.stringify([
        'Supplier name matches known high-risk pattern',
        'No prior government contracts — unproven supplier for large award',
        'Price 250% above market average — extreme overpricing',
        'Kiambu county has elevated corruption risk index'
      ])
    },
    // ── Medium-risk contracts ─────────────────────────────────────────────────
    {
      contract_id: 'KE-ICT-2024-0198',
      description: 'Construction of Nyeri County ICT Hub',
      county: 'Nyeri',
      sector: 'ICT',
      value: 38_000_000,
      supplier: 'Global Solutions EA',
      risk_score: 58,
      risk_level: 'MEDIUM',
      flags: JSON.stringify([
        'Supplier name matches known high-risk pattern',
        'Large contract with no evidence of competitive bidding process'
      ])
    },
    {
      contract_id: 'KE-AGR-2025-0089',
      description: 'Supply of fertiliser and seeds to farmers — Machakos County',
      county: 'Machakos',
      sector: 'Agriculture',
      value: 32_000_000,
      supplier: 'Savanna Builders',
      risk_score: 52,
      risk_level: 'MEDIUM',
      flags: JSON.stringify([
        'Price 80% above market average — moderate overpricing',
        'Sector historically associated with procurement fraud in Kenya'
      ])
    },
    {
      contract_id: 'KE-HLT-2025-0044',
      description: 'Machakos Level 5 Hospital extension — 80 beds',
      county: 'Machakos',
      sector: 'Health',
      value: 145_000_000,
      supplier: 'Rift Valley Contractors',
      risk_score: 48,
      risk_level: 'MEDIUM',
      flags: JSON.stringify([
        'Large contract with no evidence of competitive bidding process',
        'Contract value exceeds KES 100M — standard enhanced review'
      ])
    },
    {
      contract_id: 'KE-WAT-2024-0087',
      description: 'Water pipeline extension — Nakuru urban areas',
      county: 'Nakuru',
      sector: 'Water & Sanitation',
      value: 55_000_000,
      supplier: 'Coastal Build Ltd',
      risk_score: 45,
      risk_level: 'MEDIUM',
      flags: JSON.stringify([
        'Price 60% above market average — moderate overpricing',
        'Sector historically associated with procurement fraud in Kenya'
      ])
    },
    {
      contract_id: 'KE-RDS-2025-0089',
      description: 'Mombasa Port Road rehabilitation',
      county: 'Mombasa',
      sector: 'Roads & Infrastructure',
      value: 78_000_000,
      supplier: 'Kenya Road Works',
      risk_score: 42,
      risk_level: 'MEDIUM',
      flags: JSON.stringify([
        'Mombasa county has elevated corruption risk index',
        'Price 55% above market average — moderate overpricing'
      ])
    },
    // ── Low-risk contracts ────────────────────────────────────────────────────
    {
      contract_id: 'KE-RDS-2025-0201',
      description: 'Thika Road maintenance and pothole repair — Nairobi',
      county: 'Nairobi',
      sector: 'Roads & Infrastructure',
      value: 25_000_000,
      supplier: 'China Road & Bridge Corp',
      risk_score: 15,
      risk_level: 'LOW',
      flags: JSON.stringify(['No significant risk flags detected — contract appears compliant'])
    },
    {
      contract_id: 'KE-HLT-2025-0112',
      description: 'Supply of pharmaceuticals — Kisumu County hospitals',
      county: 'Kisumu',
      sector: 'Health',
      value: 18_000_000,
      supplier: 'H. Young & Co. (EA)',
      risk_score: 12,
      risk_level: 'LOW',
      flags: JSON.stringify(['No significant risk flags detected — contract appears compliant'])
    },
    {
      contract_id: 'KE-EDU-2025-0078',
      description: 'Supply of textbooks and learning materials — Nyeri County',
      county: 'Nyeri',
      sector: 'Education',
      value: 8_500_000,
      supplier: 'Techno Brain Ltd',
      risk_score: 10,
      risk_level: 'LOW',
      flags: JSON.stringify(['No significant risk flags detected — contract appears compliant'])
    },
    {
      contract_id: 'KE-ICT-2025-0145',
      description: 'Supply and installation of CCTV — Nakuru County offices',
      county: 'Nakuru',
      sector: 'ICT',
      value: 12_000_000,
      supplier: 'Safaricom PLC',
      risk_score: 8,
      risk_level: 'LOW',
      flags: JSON.stringify(['No significant risk flags detected — contract appears compliant'])
    },
    {
      contract_id: 'KE-AGR-2025-0156',
      description: 'Construction of Kisii County grain storage facility',
      county: 'Kisii',
      sector: 'Agriculture',
      value: 48_000_000,
      supplier: 'Civicon Ltd',
      risk_score: 20,
      risk_level: 'LOW',
      flags: JSON.stringify(['No significant risk flags detected — contract appears compliant'])
    },
    // ── Additional contracts for variety ─────────────────────────────────────
    {
      contract_id: 'KE-PRO-2025-0412',
      description: 'Construction of Bungoma County vocational training institute',
      county: 'Bungoma',
      sector: 'Education',
      value: 95_000_000,
      supplier: 'Premier Enterprises Ltd',
      risk_score: 76,
      risk_level: 'HIGH',
      flags: JSON.stringify([
        'Supplier name matches known high-risk pattern',
        'Price 130% above market average — significant overpricing',
        'Large contract with no evidence of competitive bidding process'
      ])
    },
    {
      contract_id: 'KE-WAT-2025-0234',
      description: 'Drilling and equipping of 5 boreholes — Turkana County',
      county: 'Turkana',
      sector: 'Water & Sanitation',
      value: 22_000_000,
      supplier: 'Lakeside Contractors',
      risk_score: 38,
      risk_level: 'LOW',
      flags: JSON.stringify(['No significant risk flags detected — contract appears compliant'])
    },
    {
      contract_id: 'KE-HLT-2026-0056',
      description: 'Renovation of Homa Bay District Hospital outpatient department',
      county: 'Homa Bay',
      sector: 'Health',
      value: 22_000_000,
      supplier: 'Nairobi Build Co.',
      risk_score: 44,
      risk_level: 'MEDIUM',
      flags: JSON.stringify([
        'Price 70% above market average — moderate overpricing',
        'Sector historically associated with procurement fraud in Kenya'
      ])
    },
    {
      contract_id: 'KE-RDS-2026-0078',
      description: 'Grading and gravelling of rural access roads — Siaya County',
      county: 'Siaya',
      sector: 'Roads & Infrastructure',
      value: 35_000_000,
      supplier: 'Spencon Services',
      risk_score: 22,
      risk_level: 'LOW',
      flags: JSON.stringify(['No significant risk flags detected — contract appears compliant'])
    },
    {
      contract_id: 'KE-PRO-2026-0189',
      description: 'Supply of medical equipment — Meru County Referral Hospital',
      county: 'Meru',
      sector: 'Health',
      value: 67_000_000,
      supplier: 'Apex Builders Kenya',
      risk_score: 73,
      risk_level: 'HIGH',
      flags: JSON.stringify([
        'Supplier name matches known high-risk pattern',
        'Price 120% above market average — significant overpricing',
        'No prior government contracts — unproven supplier for large award'
      ])
    },
    {
      contract_id: 'KE-EDU-2026-0234',
      description: 'Construction of 6-classroom block — Trans Nzoia Secondary School',
      county: 'Trans Nzoia',
      sector: 'Education',
      value: 14_000_000,
      supplier: 'Highland Infrastructure',
      risk_score: 35,
      risk_level: 'LOW',
      flags: JSON.stringify(['No significant risk flags detected — contract appears compliant'])
    },
    {
      contract_id: 'KE-ICT-2026-0067',
      description: 'County government ERP system implementation — Uasin Gishu',
      county: 'Uasin Gishu',
      sector: 'ICT',
      value: 65_000_000,
      supplier: 'Zenith Infrastructure',
      risk_score: 69,
      risk_level: 'MEDIUM',
      flags: JSON.stringify([
        'Supplier name matches known high-risk pattern',
        'Large contract with no evidence of competitive bidding process',
        'Price 90% above market average — moderate overpricing'
      ])
    },
    {
      contract_id: 'KE-AGR-2026-0123',
      description: 'Supply of fertiliser and seeds — Bomet County farmers',
      county: 'Bomet',
      sector: 'Agriculture',
      value: 28_000_000,
      supplier: 'East Africa Supply',
      risk_score: 31,
      risk_level: 'LOW',
      flags: JSON.stringify(['No significant risk flags detected — contract appears compliant'])
    },
    {
      contract_id: 'KE-RDS-2026-0345',
      description: 'Bridge construction over Tana River — Tana River County',
      county: 'Tana River',
      sector: 'Roads & Infrastructure',
      value: 85_000_000,
      supplier: 'Vanguard Contractors',
      risk_score: 78,
      risk_level: 'HIGH',
      flags: JSON.stringify([
        'Supplier name matches known high-risk pattern',
        'Price 150% above market average — significant overpricing',
        'Single-source / direct procurement — no competitive bidding'
      ])
    },
    {
      contract_id: 'KE-HLT-2026-0178',
      description: 'Supply of pharmaceuticals — Kilifi County hospitals',
      county: 'Kilifi',
      sector: 'Health',
      value: 24_000_000,
      supplier: 'Raubex Kenya',
      risk_score: 14,
      risk_level: 'LOW',
      flags: JSON.stringify(['No significant risk flags detected — contract appears compliant'])
    },
    {
      contract_id: 'KE-WAT-2026-0089',
      description: 'Water pipeline extension — Murang\'a urban areas',
      county: 'Murang\'a',
      sector: 'Water & Sanitation',
      value: 42_000_000,
      supplier: 'Crest Build Ltd',
      risk_score: 65,
      risk_level: 'MEDIUM',
      flags: JSON.stringify([
        'Supplier name matches known high-risk pattern',
        'Price 85% above market average — moderate overpricing'
      ])
    },
    {
      contract_id: 'KE-PRO-2026-0456',
      description: 'Construction of Nandi County market — Kapsabet',
      county: 'Nandi',
      sector: 'Roads & Infrastructure',
      value: 18_000_000,
      supplier: 'Nyoro Construction',
      risk_score: 25,
      risk_level: 'LOW',
      flags: JSON.stringify(['No significant risk flags detected — contract appears compliant'])
    },
    {
      contract_id: 'KE-EDU-2026-0312',
      description: 'Supply of school furniture — 80 schools, Kakamega County',
      county: 'Kakamega',
      sector: 'Education',
      value: 96_000_000,
      supplier: 'Summit Contractors Ltd',
      risk_score: 81,
      risk_level: 'HIGH',
      flags: JSON.stringify([
        'Supplier name matches known high-risk pattern',
        'Price 200% above market average — extreme overpricing',
        'Large contract with no evidence of competitive bidding process',
        'High-risk county (Kakamega) and sector combination'
      ])
    },
    {
      contract_id: 'KE-ICT-2026-0234',
      description: 'Supply and installation of CCTV — Kisumu County offices',
      county: 'Kisumu',
      sector: 'ICT',
      value: 15_000_000,
      supplier: 'Techno Brain Ltd',
      risk_score: 16,
      risk_level: 'LOW',
      flags: JSON.stringify(['No significant risk flags detected — contract appears compliant'])
    },
    {
      contract_id: 'KE-HLT-2026-0289',
      description: 'Construction of Laikipia County health centre',
      county: 'Laikipia',
      sector: 'Health',
      value: 35_000_000,
      supplier: 'Horizon Build Co.',
      risk_score: 72,
      risk_level: 'HIGH',
      flags: JSON.stringify([
        'Supplier name matches known high-risk pattern',
        'Price 110% above market average — significant overpricing',
        'No prior government contracts — unproven supplier for large award'
      ])
    },
    {
      contract_id: 'KE-RDS-2026-0412',
      description: 'Grading and gravelling of rural roads — Samburu County',
      county: 'Samburu',
      sector: 'Roads & Infrastructure',
      value: 28_000_000,
      supplier: 'Geopetro Services',
      risk_score: 19,
      risk_level: 'LOW',
      flags: JSON.stringify(['No significant risk flags detected — contract appears compliant'])
    },
    {
      contract_id: 'KE-AGR-2026-0267',
      description: 'Supply of irrigation equipment — Isiolo County',
      county: 'Isiolo',
      sector: 'Agriculture',
      value: 38_000_000,
      supplier: 'Pinnacle Supply Ltd',
      risk_score: 68,
      risk_level: 'MEDIUM',
      flags: JSON.stringify([
        'Supplier name matches known high-risk pattern',
        'Price 95% above market average — moderate overpricing'
      ])
    },
    {
      contract_id: 'KE-WAT-2026-0156',
      description: 'Construction of sanitation facilities — 20 schools, Busia County',
      county: 'Busia',
      sector: 'Water & Sanitation',
      value: 16_000_000,
      supplier: 'Strabag Kenya',
      risk_score: 11,
      risk_level: 'LOW',
      flags: JSON.stringify(['No significant risk flags detected — contract appears compliant'])
    },
    {
      contract_id: 'KE-PRO-2026-0523',
      description: 'Construction of Marsabit County administration block',
      county: 'Marsabit',
      sector: 'Roads & Infrastructure',
      value: 55_000_000,
      supplier: 'Mombasa Contractors',
      risk_score: 54,
      risk_level: 'MEDIUM',
      flags: JSON.stringify([
        'Price 75% above market average — moderate overpricing',
        'Large contract with no evidence of competitive bidding process'
      ])
    },
    {
      contract_id: 'KE-HLT-2026-0345',
      description: 'Supply of medical equipment — Wajir County Hospital',
      county: 'Wajir',
      sector: 'Health',
      value: 42_000_000,
      supplier: 'Kisumu Infrastructure',
      risk_score: 47,
      risk_level: 'MEDIUM',
      flags: JSON.stringify([
        'Price 65% above market average — moderate overpricing',
        'Sector historically associated with procurement fraud in Kenya'
      ])
    },
    {
      contract_id: 'KE-EDU-2026-0389',
      description: 'Construction of Mandera County technical institute',
      county: 'Mandera',
      sector: 'Education',
      value: 88_000_000,
      supplier: 'Nakuru Build Ltd',
      risk_score: 56,
      risk_level: 'MEDIUM',
      flags: JSON.stringify([
        'Large contract with no evidence of competitive bidding process',
        'Price 80% above market average — moderate overpricing'
      ])
    },
    {
      contract_id: 'KE-RDS-2026-0489',
      description: 'Garissa–Wajir road rehabilitation — 45km',
      county: 'Garissa',
      sector: 'Roads & Infrastructure',
      value: 380_000_000,
      supplier: 'China Road & Bridge Corp',
      risk_score: 18,
      risk_level: 'LOW',
      flags: JSON.stringify(['No significant risk flags detected — contract appears compliant'])
    },
    {
      contract_id: 'KE-ICT-2026-0312',
      description: 'Kericho County ERP system and digital services',
      county: 'Kericho',
      sector: 'ICT',
      value: 52_000_000,
      supplier: 'Safaricom PLC',
      risk_score: 13,
      risk_level: 'LOW',
      flags: JSON.stringify(['No significant risk flags detected — contract appears compliant'])
    },
    {
      contract_id: 'KE-WAT-2026-0234',
      description: 'Borehole drilling — 8 boreholes, Elgeyo Marakwet County',
      county: 'Elgeyo Marakwet',
      sector: 'Water & Sanitation',
      value: 20_000_000,
      supplier: 'Civicon Ltd',
      risk_score: 17,
      risk_level: 'LOW',
      flags: JSON.stringify(['No significant risk flags detected — contract appears compliant'])
    },
    {
      contract_id: 'KE-PRO-2026-0601',
      description: 'West Pokot County hospital renovation and equipment',
      county: 'West Pokot',
      sector: 'Health',
      value: 48_000_000,
      supplier: 'Kisumu Infrastructure',
      risk_score: 43,
      risk_level: 'MEDIUM',
      flags: JSON.stringify([
        'Price 60% above market average — moderate overpricing'
      ])
    },
    {
      contract_id: 'KE-AGR-2026-0345',
      description: 'Supply of seeds and fertiliser — Baringo County',
      county: 'Baringo',
      sector: 'Agriculture',
      value: 25_000_000,
      supplier: 'East Africa Supply',
      risk_score: 29,
      risk_level: 'LOW',
      flags: JSON.stringify(['No significant risk flags detected — contract appears compliant'])
    },
    {
      contract_id: 'KE-RDS-2026-0567',
      description: 'Narok–Bomet road tarmacking — 12km',
      county: 'Narok',
      sector: 'Roads & Infrastructure',
      value: 145_000_000,
      supplier: 'H. Young & Co. (EA)',
      risk_score: 21,
      risk_level: 'LOW',
      flags: JSON.stringify(['No significant risk flags detected — contract appears compliant'])
    },
    {
      contract_id: 'KE-HLT-2026-0412',
      description: 'Kajiado County health centre construction — 3 facilities',
      county: 'Kajiado',
      sector: 'Health',
      value: 62_000_000,
      supplier: 'Raubex Kenya',
      risk_score: 16,
      risk_level: 'LOW',
      flags: JSON.stringify(['No significant risk flags detected — contract appears compliant'])
    },
    {
      contract_id: 'KE-EDU-2026-0456',
      description: 'Makueni County secondary school construction — 4 schools',
      county: 'Makueni',
      sector: 'Education',
      value: 72_000_000,
      supplier: 'Nyoro Construction',
      risk_score: 24,
      risk_level: 'LOW',
      flags: JSON.stringify(['No significant risk flags detected — contract appears compliant'])
    },
    {
      contract_id: 'KE-PRO-2026-0678',
      description: 'Embu County market construction and renovation',
      county: 'Embu',
      sector: 'Roads & Infrastructure',
      value: 32_000_000,
      supplier: 'Spencon Services',
      risk_score: 27,
      risk_level: 'LOW',
      flags: JSON.stringify(['No significant risk flags detected — contract appears compliant'])
    },
    {
      contract_id: 'KE-WAT-2026-0312',
      description: 'Tharaka Nithi water supply infrastructure',
      county: 'Tharaka Nithi',
      sector: 'Water & Sanitation',
      value: 38_000_000,
      supplier: 'Geopetro Services',
      risk_score: 23,
      risk_level: 'LOW',
      flags: JSON.stringify(['No significant risk flags detected — contract appears compliant'])
    },
    {
      contract_id: 'KE-ICT-2026-0389',
      description: 'Kirinyaga County digital services platform',
      county: 'Kirinyaga',
      sector: 'ICT',
      value: 28_000_000,
      supplier: 'Techno Brain Ltd',
      risk_score: 15,
      risk_level: 'LOW',
      flags: JSON.stringify(['No significant risk flags detected — contract appears compliant'])
    },
    {
      contract_id: 'KE-HLT-2026-0489',
      description: 'Nyandarua County hospital equipment supply',
      county: 'Nyandarua',
      sector: 'Health',
      value: 35_000_000,
      supplier: 'Lafarge Holcim Kenya',
      risk_score: 12,
      risk_level: 'LOW',
      flags: JSON.stringify(['No significant risk flags detected — contract appears compliant'])
    },
    {
      contract_id: 'KE-PRO-2026-0745',
      description: 'Nyamira County roads maintenance programme',
      county: 'Nyamira',
      sector: 'Roads & Infrastructure',
      value: 45_000_000,
      supplier: 'Strabag Kenya',
      risk_score: 18,
      risk_level: 'LOW',
      flags: JSON.stringify(['No significant risk flags detected — contract appears compliant'])
    },
    {
      contract_id: 'KE-EDU-2026-0523',
      description: 'Migori County primary school construction — 6 schools',
      county: 'Migori',
      sector: 'Education',
      value: 54_000_000,
      supplier: 'Bamburi Cement',
      risk_score: 14,
      risk_level: 'LOW',
      flags: JSON.stringify(['No significant risk flags detected — contract appears compliant'])
    },
    {
      contract_id: 'KE-PRO-2026-0812',
      description: 'Vihiga County administration block construction',
      county: 'Vihiga',
      sector: 'Roads & Infrastructure',
      value: 42_000_000,
      supplier: 'Kisumu Infrastructure',
      risk_score: 36,
      risk_level: 'LOW',
      flags: JSON.stringify(['No significant risk flags detected — contract appears compliant'])
    }
  ];

  return contracts;
};

module.exports = {
  generateContracts,
  GHOST_SCENARIOS,
  SAMPLE_REPORTS,
  COUNTIES,
  SECTORS,
  SUPPLIERS
};
