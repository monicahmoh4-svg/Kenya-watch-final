'use strict';
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 30000,
  max: 10,
});

const initDB = async () => {
  let retries = 10;
  while (retries > 0) {
    try {
      const client = await pool.connect();
      console.log('✅ PostgreSQL connected');
      await createTables(client);
      await runMigrations(client);
      await seedIfEmpty(client);
      client.release();
      return;
    } catch (err) {
      retries--;
      console.error(`DB attempt failed (${retries} retries left): ${err.message}`);
      if (retries === 0) throw err;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
};

const createTables = async (client) => {
  // Drop old contracts table if it exists to ensure clean schema with all required columns
  await client.query('DROP TABLE IF EXISTS contracts CASCADE').catch(() => {});

  await client.query(`
    CREATE TABLE IF NOT EXISTS contracts (
      id              SERIAL PRIMARY KEY,
      contract_id     VARCHAR(120) UNIQUE NOT NULL,
      description     TEXT        NOT NULL,
      county          VARCHAR(100),
      sector          VARCHAR(100),
      value           BIGINT      DEFAULT 0,
      supplier        VARCHAR(300),
      supplier_reg_date DATE,
      bid_type        VARCHAR(50) DEFAULT 'open',
      awarded_date    DATE,
      risk_score      INTEGER     DEFAULT 0,
      risk_level      VARCHAR(10) DEFAULT 'LOW',
      flags           JSONB       DEFAULT '[]',
      status          VARCHAR(30) DEFAULT 'active',
      procuring_entity VARCHAR(300),
      ocds_ocid       VARCHAR(120),
      source          VARCHAR(50) DEFAULT 'manual',
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS reports (
      id                  SERIAL PRIMARY KEY,
      case_number         VARCHAR(25) UNIQUE NOT NULL,
      type                VARCHAR(120) NOT NULL,
      county              VARCHAR(100),
      sector              VARCHAR(100),
      description         TEXT        NOT NULL,
      amount              BIGINT,
      anonymous           BOOLEAN     DEFAULT true,
      status              VARCHAR(30) DEFAULT 'pending',
      ai_credibility_score INTEGER    DEFAULT 50,
      routing             VARCHAR(20) DEFAULT 'EACC',
      keywords            JSONB       DEFAULT '[]',
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      updated_at          TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS ghost_projects (
      id               SERIAL PRIMARY KEY,
      contract_ref     VARCHAR(120),
      project_name     VARCHAR(300) NOT NULL,
      county           VARCHAR(100),
      sector           VARCHAR(100),
      claimed_status   VARCHAR(200),
      satellite_status VARCHAR(200),
      amount_at_risk   BIGINT      DEFAULT 0,
      detection_status VARCHAR(20) DEFAULT 'flagged',
      confidence_score INTEGER     DEFAULT 0,
      satellite_metadata JSONB     DEFAULT '{}',
      created_at       TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS chat_logs (
      id         SERIAL PRIMARY KEY,
      session_id VARCHAR(120),
      role       VARCHAR(20),
      content    TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS ocds_sync_log (
      id         SERIAL PRIMARY KEY,
      year       INTEGER,
      status     VARCHAR(20) DEFAULT 'pending',
      records    INTEGER     DEFAULT 0,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      finished_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_contracts_risk   ON contracts(risk_level, risk_score DESC);
    CREATE INDEX IF NOT EXISTS idx_contracts_county ON contracts(county);
    CREATE INDEX IF NOT EXISTS idx_contracts_sector ON contracts(sector);
    CREATE INDEX IF NOT EXISTS idx_contracts_source ON contracts(source);
    CREATE INDEX IF NOT EXISTS idx_reports_status   ON reports(status);
    CREATE INDEX IF NOT EXISTS idx_ghost_status     ON ghost_projects(detection_status);
  `);
  console.log('✅ Tables ready');
};

const runMigrations = async (client) => {
  const cols = [
    ['contracts',      'ocds_ocid',         'VARCHAR(120)'],
    ['contracts',      'source',            "VARCHAR(50) DEFAULT 'manual'"],
    ['contracts',      'procuring_entity',  'VARCHAR(300)'],
    ['contracts',      'updated_at',        'TIMESTAMPTZ DEFAULT NOW()'],
    ['reports',        'routing',           "VARCHAR(20) DEFAULT 'EACC'"],
    ['reports',        'sector',            'VARCHAR(100)'],
    ['reports',        'keywords',          "JSONB DEFAULT '[]'"],
    ['reports',        'updated_at',        'TIMESTAMPTZ DEFAULT NOW()'],
    ['ghost_projects', 'sector',            'VARCHAR(100)'],
    ['ghost_projects', 'satellite_metadata',"JSONB DEFAULT '{}'"],
  ];
  for (const [tbl, col, def] of cols) {
    try {
      await client.query(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS ${col} ${def}`);
    } catch (e) {
      if (!e.message.includes('already exists')) console.warn('Migration:', e.message);
    }
  }
  console.log('✅ Migrations applied');
};

const CONTRACTS_SEED = [
  { contract_id: 'KE-RDS-2025-0001', description: 'Rehabilitation of Mombasa Road A109 — 14km section', county: 'Nairobi', value: 2850000000, supplier: 'Nexus Construction Ltd', risk_score: 94, risk_level: 'HIGH', flags: '["Single-source KES 2.85B — no competitive bidding","Company only 22 months old at award","Director linked to 2 county officials","Price 280% above market benchmark"]' },
  { contract_id: 'KE-HTH-2025-0002', description: 'Supply of medical equipment Kenyatta National Hospital 2025', county: 'Nairobi', value: 485000000, supplier: 'MedSupply Africa Ltd', risk_score: 88, risk_level: 'HIGH', flags: '["Price 320% above market benchmark","Shell company indicators detected","Registered address matches 3 previously flagged firms"]' },
  { contract_id: 'KE-EDU-2025-0003', description: 'Construction of 200 classroom blocks — Kisii County schools', county: 'Kisii', value: 360000000, supplier: 'Buildcon Kenya Ltd', risk_score: 12, risk_level: 'LOW', flags: '["Clean verified track record","Open competitive bidding","Active community oversight"]' },
  { contract_id: 'KE-WAT-2025-0004', description: 'Nairobi Water and Sewerage expansion — Phase 3', county: 'Nairobi', value: 1200000000, supplier: 'AquaInfra Kenya Ltd', risk_score: 55, risk_level: 'MEDIUM', flags: '["Director has undisclosed government interest","Price 45% above market estimate"]' },
  { contract_id: 'KE-AGR-2025-0005', description: 'Supply of fertiliser to 47 counties — National Programme 2025', county: 'National', value: 3200000000, supplier: 'AgriChem Solutions Ltd', risk_score: 97, risk_level: 'HIGH', flags: '["Single-source award KES 3.2B — no competitive bidding","Company only 4 months old at award","No verified distribution infrastructure","Director is spouse of procurement officer"]' },
  { contract_id: 'KE-ICT-2025-0006', description: 'ICT infrastructure upgrade — Kisii County offices', county: 'Kisii', value: 43000000, supplier: 'Daggy Techs Ltd', risk_score: 18, risk_level: 'LOW', flags: '["Clean verified track record","3 prior successful county contracts","Competitive open bidding"]' },
  { contract_id: 'KE-RDS-2025-0007', description: 'Meru–Nkubu road rehabilitation — 23km tarmac', county: 'Meru', value: 540000000, supplier: 'Strabag East Africa Ltd', risk_score: 22, risk_level: 'LOW', flags: '["Established international contractor","Competitive open bid process"]' },
  { contract_id: 'KE-HTH-2025-0008', description: 'Construction of Kakamega County Referral Hospital — Phase 2', county: 'Kakamega', value: 870000000, supplier: 'Ramco Builders Ltd', risk_score: 35, risk_level: 'LOW', flags: '["Minor extension granted — approved","Within approved budget"]' },
  { contract_id: 'KE-EDU-2025-0009', description: 'Supply of laptops to 800 primary schools — Kiambu County', county: 'Kiambu', value: 680000000, supplier: 'TechSource Kenya Ltd', risk_score: 85, risk_level: 'HIGH', flags: '["Price 290% above comparable market tenders","Company recently registered — 14 months old","Director linked to county education official"]' },
  { contract_id: 'KE-WAT-2025-0010', description: 'Nakuru water treatment plant expansion — 50,000 m³/day', county: 'Nakuru', value: 320000000, supplier: 'WaterTech Solutions Ltd', risk_score: 45, risk_level: 'MEDIUM', flags: '["Payment released before project completion verified","Minor documentation gaps in procurement file"]' },
  { contract_id: 'KE-RDS-2025-0011', description: 'Kisumu–Kakamega highway dualling — 18km', county: 'Kisumu', value: 1850000000, supplier: 'China Road and Bridge Corporation', risk_score: 20, risk_level: 'LOW', flags: '["Established international contractor — clean record","Competitive international tendering process"]' },
  { contract_id: 'KE-HTH-2025-0012', description: 'Supply of ARV drugs — Coast General Hospital 2025', county: 'Mombasa', value: 95000000, supplier: 'PharmKenya Ltd', risk_score: 79, risk_level: 'HIGH', flags: '["Single-source pharmaceutical supply","Price 210% above KEMSA benchmark rate","No verified cold storage infrastructure"]' },
  { contract_id: 'KE-WAT-2025-0013', description: 'Turkana County emergency water supply — drought response', county: 'Turkana', value: 145000000, supplier: 'EmerWater Solutions Ltd', risk_score: 58, risk_level: 'MEDIUM', flags: '["Emergency procurement — drought justified","Price slightly above market benchmark"]' },
  { contract_id: 'KE-ICT-2025-0014', description: 'CCTV surveillance system — Mombasa City 2025', county: 'Mombasa', value: 420000000, supplier: 'SafeCity Systems Ltd', risk_score: 72, risk_level: 'MEDIUM', flags: '["Restricted bidding for KES 420M — unusual for this value","Director has undisclosed connections to county security official"]' },
  { contract_id: 'KE-HTH-2025-0015', description: 'Supply malaria nets — 2 million units, 10 counties', county: 'National', value: 180000000, supplier: 'NetPro Supplies Ltd', risk_score: 91, risk_level: 'HIGH', flags: '["Company only 5 months old at award","Single-source KES 180M — no bidding","No verified logistics or distribution infrastructure"]' },
  { contract_id: 'KE-RDS-2025-0016', description: 'Thika Superhighway routine maintenance — Year 3', county: 'Kiambu', value: 380000000, supplier: 'Raubex Kenya Ltd', risk_score: 15, risk_level: 'LOW', flags: '["Established contractor — clean long track record","Competitive renewal tender","Performance verified"]' },
  { contract_id: 'KE-AGR-2025-0017', description: 'Strategic grain reserve — 500,000 bags maize FY2025', county: 'National', value: 2100000000, supplier: 'GrainMaster Kenya Ltd', risk_score: 42, risk_level: 'MEDIUM', flags: '["Quality dispute raised by audit team","Partial delivery confirmed — 60%"]' },
  { contract_id: 'KE-ICT-2025-0018', description: 'Integrated financial management system — Kiambu County', county: 'Kiambu', value: 95000000, supplier: 'FinSystems Ltd', risk_score: 87, risk_level: 'HIGH', flags: '["Single-source KES 95M","Company only 7 months old at award","Director is nephew of county governor","Product is resale of open-source Odoo — worth KES 500K"]' },
  { contract_id: 'KE-HTH-2025-0019', description: 'Construction of 100 rural dispensaries — Kilifi County', county: 'Kilifi', value: 380000000, supplier: 'Coastal Builders Co Ltd', risk_score: 30, risk_level: 'LOW', flags: '["Open competitive tendering","Community participation verified","World Bank co-funded"]' },
  { contract_id: 'KE-RDS-2025-0020', description: 'Nairobi Northern Bypass interchange upgrade — Phase 2', county: 'Nairobi', value: 2200000000, supplier: 'Surbana Jurong Ltd', risk_score: 25, risk_level: 'LOW', flags: '["Established Singaporean consultant","Open international tender","ADB co-financed"]' },
  { contract_id: 'KE-EDU-2025-0021', description: 'School furniture — 500 secondary schools Nairobi County', county: 'Nairobi', value: 220000000, supplier: 'FurniCraft Kenya Ltd', risk_score: 89, risk_level: 'HIGH', flags: '["Single-source KES 220M — no competitive bidding","Company only 7 months old at award","Director is elected ward representative","Price 310% above comparable market tenders"]' },
  { contract_id: 'KE-WAT-2025-0022', description: 'Baringo County borehole drilling — 500 community units', county: 'Baringo', value: 375000000, supplier: 'WellDrill Africa Ltd', risk_score: 30, risk_level: 'LOW', flags: '["Community water access project","Clean procurement process","World Bank co-funded"]' },
  { contract_id: 'KE-ICT-2025-0023', description: 'Nairobi County smart waste management digital system', county: 'Nairobi', value: 285000000, supplier: 'SmartCity Solutions Ltd', risk_score: 83, risk_level: 'HIGH', flags: '["Company only 12 months old","Price 260% above comparable systems","Director linked to county executive member"]' },
  { contract_id: 'KE-HTH-2025-0024', description: 'Mandera County Hospital — beds, linen and furniture 500 units', county: 'Mandera', value: 28000000, supplier: 'MedFurnish Kenya Ltd', risk_score: 82, risk_level: 'HIGH', flags: '["Single-source KES 28M","Price 340% above market","Company only 6 months old at award"]' },
  { contract_id: 'KE-AGR-2025-0025', description: 'Kilifi County coconut value chain development', county: 'Kilifi', value: 75000000, supplier: 'CoconutKE Processing Ltd', risk_score: 28, risk_level: 'LOW', flags: '["County-level smallholder project","Clean open procurement","Beneficiary community verified"]' },
  { contract_id: 'KE-RDS-2025-0026', description: 'Eldoret ring road bypass — Phase 1, 28km', county: 'Uasin Gishu', value: 1450000000, supplier: 'Sinohydro Corporation Ltd', risk_score: 22, risk_level: 'LOW', flags: '["Established international contractor","Open competitive tender","KfW co-financed"]' },
  { contract_id: 'KE-EDU-2025-0027', description: 'KCSE examination materials supply — 2026 national exams', county: 'National', value: 850000000, supplier: 'Printtech Kenya Ltd', risk_score: 55, risk_level: 'MEDIUM', flags: '["Restricted tender — sensitive materials (justified)","Price query raised by Auditor General"]' },
  { contract_id: 'KE-ICT-2025-0028', description: 'Lamu Port digital customs management system', county: 'Lamu', value: 480000000, supplier: 'PortTech Systems Ltd', risk_score: 76, risk_level: 'HIGH', flags: '["Price 230% above comparable systems","Director has undisclosed connection to KRA official","Restricted bidding unusual for this contract value"]' },
  { contract_id: 'KE-WAT-2025-0029', description: 'Lake Victoria water intake — Kisumu expansion Phase 4', county: 'Kisumu', value: 890000000, supplier: 'Vitens Evides International', risk_score: 18, risk_level: 'LOW', flags: '["Established Dutch water firm","Open international tender","EU co-financed project"]' },
  { contract_id: 'KE-RDS-2025-0030', description: 'Nairobi–Nakuru expressway feasibility and design', county: 'Nakuru', value: 320000000, supplier: 'Mott MacDonald Kenya Ltd', risk_score: 18, risk_level: 'LOW', flags: '["Established international consultant","Open competitive tender","Clean"]' },
  { contract_id: 'KE-HTH-2025-0031', description: 'HIV testing kits — 2 million units national programme 2025', county: 'National', value: 320000000, supplier: 'DiagnosticsKE Ltd', risk_score: 28, risk_level: 'LOW', flags: '["WHO pre-qualified supplier","Open competitive tender","NACC oversight active"]' },
  { contract_id: 'KE-AGR-2025-0032', description: 'Drought-resistant seed supply — 30 counties ASAL programme', county: 'National', value: 420000000, supplier: 'SeedCo Africa Ltd', risk_score: 25, risk_level: 'LOW', flags: '["Established company — 22-year track record","Certified seeds — KEPHIS approved","Competitive open tender"]' },
  { contract_id: 'KE-ICT-2025-0033', description: 'National ID digitisation system upgrade — Phase 3', county: 'National', value: 3500000000, supplier: 'IBM East Africa Ltd', risk_score: 30, risk_level: 'LOW', flags: '["Established vendor — 25-year track record","Negotiated — proprietary system (justified)","Security vetted by NIS"]' },
  { contract_id: 'KE-EDU-2025-0034', description: 'Kisumu Technical Training Institute construction — Phase 2', county: 'Kisumu', value: 195000000, supplier: 'Buildcon Kenya Ltd', risk_score: 22, risk_level: 'LOW', flags: '["Clean open procurement process","Community oversight active","TVETA supervised"]' },
  { contract_id: 'KE-RDS-2025-0035', description: 'Naiposha–Narok Road tarmac upgrade — 45km A104', county: 'Narok', value: 1650000000, supplier: 'Strabag East Africa Ltd', risk_score: 20, risk_level: 'LOW', flags: '["Established international contractor","Open competitive tender","NEMA EIA approved"]' },
  { contract_id: 'KE-WAT-2025-0036', description: 'Mombasa island sewerage rehabilitation — Phase 2', county: 'Mombasa', value: 640000000, supplier: 'Mott MacDonald Kenya Ltd', risk_score: 18, risk_level: 'LOW', flags: '["Established international consultant","Open competitive tender","EU co-funded"]' },
  { contract_id: 'KE-ICT-2025-0037', description: 'National government digital identity integration — NIIMS Phase 2', county: 'National', value: 4200000000, supplier: 'Idemia Group France', risk_score: 35, risk_level: 'LOW', flags: '["Strategic negotiated — biometric specialist","Security vetted","Parliament approved budget"]' },
  { contract_id: 'KE-HTH-2025-0038', description: 'Meru Tea Zone Community Health Centres — 8 units', county: 'Meru', value: 95000000, supplier: 'Highlands Construction Ltd', risk_score: 28, risk_level: 'LOW', flags: '["Open competitive tender","County assembly oversight verified"]' },
  { contract_id: 'KE-RDS-2025-0039', description: 'Machakos–Konza Technopolis Road dualling — 35km', county: 'Machakos', value: 980000000, supplier: 'H Young and Co Ltd', risk_score: 20, risk_level: 'LOW', flags: '["Established contractor","Open competitive tender","Vision 2030 flagship project"]' },
  { contract_id: 'KE-AGR-2025-0040', description: 'Meru Tea Factory modernisation and upgrade', county: 'Meru', value: 145000000, supplier: 'Tecalemit Kenya Ltd', risk_score: 22, risk_level: 'LOW', flags: '["Established firm","Open competitive tender","Farmer co-operative verified"]' },
  { contract_id: 'KE-HTH-2025-0041', description: 'Wajir County Referral Hospital medical equipment', county: 'Wajir', value: 65000000, supplier: 'MedEquip Africa Ltd', risk_score: 81, risk_level: 'HIGH', flags: '["Single-source KES 65M — no bidding","Company only 8 months old","Director linked to county health executive"]' },
  { contract_id: 'KE-EDU-2025-0042', description: 'Turkana County secondary schools construction — 12 units', county: 'Turkana', value: 280000000, supplier: 'Northlands Builders Ltd', risk_score: 32, risk_level: 'LOW', flags: '["Open competitive tender","Remote area premium justified","UNICEF co-funded"]' },
  { contract_id: 'KE-ICT-2025-0043', description: 'Marsabit County integrated revenue management system', county: 'Marsabit', value: 35000000, supplier: 'RevSystems Ltd', risk_score: 84, risk_level: 'HIGH', flags: '["Single-source KES 35M","Company only 4 months old","Director is cousin of county treasurer"]' },
  { contract_id: 'KE-WAT-2025-0044', description: 'Wajir County solar-powered water kiosks — 50 units', county: 'Wajir', value: 85000000, supplier: 'SolarWater Kenya Ltd', risk_score: 38, risk_level: 'LOW', flags: '["Open competitive tender","ASAL community project","GIZ co-funded"]' },
  { contract_id: 'KE-AGR-2025-0045', description: 'Kwale County cashew nut value chain support', county: 'Kwale', value: 55000000, supplier: 'CoastalAgri Ltd', risk_score: 25, risk_level: 'LOW', flags: '["Open competitive tender","Smallholder focused","IFAD co-funded"]' },
  { contract_id: 'KE-RDS-2025-0046', description: 'Garissa–Wajir Highway rehabilitation — 180km', county: 'Garissa', value: 4800000000, supplier: 'China Communications Construction Co', risk_score: 22, risk_level: 'LOW', flags: '["Established international contractor","Open tender","AfDB co-financed"]' },
  { contract_id: 'KE-HTH-2025-0047', description: 'Garissa County 5 dispensaries construction', county: 'Garissa', value: 75000000, supplier: 'EasternBuilders Ltd', risk_score: 30, risk_level: 'LOW', flags: '["Open competitive tender","Community health project","USAID co-funded"]' },
  { contract_id: 'KE-ICT-2025-0048', description: 'Kwale County integrated land management system', county: 'Kwale', value: 42000000, supplier: 'LandSys Kenya Ltd', risk_score: 85, risk_level: 'HIGH', flags: '["Single-source KES 42M","Company only 3 months old","Director is brother of county land registrar"]' },
];

const GHOST_SCENARIOS = [
  { contract_ref: 'KE-EDU-2024-0112', project_name: 'Kiambu Girls Secondary — 8 Classroom Block', county: 'Kiambu', claimed_status: '8-classroom block complete — completion certificate and photos submitted to ministry', satellite_status: 'Bare undisturbed land. No construction activity detected. Dense vegetation only.', amount_at_risk: 28000000, detection_status: 'ghost' },
  { contract_ref: 'KE-WAT-2024-0087', project_name: 'Nakuru Water Treatment Plant Expansion', county: 'Nakuru', claimed_status: 'Plant 100% complete — operational, serving 50,000 residents', satellite_status: '~15% structural footprint only. Foundation visible. No equipment or superstructure installed.', amount_at_risk: 142000000, detection_status: 'partial' },
  { contract_ref: 'KE-RDS-2024-0043', project_name: 'Tana River–Garissa Road Rehabilitation — 35km', county: 'Tana River', claimed_status: 'Road fully rehabilitated — paved surface, drainage structures complete', satellite_status: 'Road surface unchanged from 2019 baseline imagery. Potholed murram throughout. No tarmac layer.', amount_at_risk: 285000000, detection_status: 'ghost' },
  { contract_ref: 'KE-INF-2025-0034', project_name: 'Kisii Central Market Renovation', county: 'Kisii', claimed_status: 'Market renovation 100% complete — stalls, drainage, roofing done', satellite_status: 'New roof confirmed. Floor tiling visible. Drainage structures present. Renovation verified.', amount_at_risk: 12000000, detection_status: 'verified' },
  { contract_ref: 'KE-HTH-2025-0067', project_name: 'Marsabit County Dispensary — 3 Units', county: 'Marsabit', claimed_status: 'Three dispensary units completed and operational since March 2025', satellite_status: 'One unit ~40% complete. Two sites show bare, undisturbed ground.', amount_at_risk: 45000000, detection_status: 'partial' },
  { contract_ref: 'KE-EDU-2025-0198', project_name: 'Turkana North Girls Secondary School', county: 'Turkana', claimed_status: 'School 100% complete — 12 classrooms, dormitory, lab, kitchen', satellite_status: 'No structures detected at GPS coordinates. Undisturbed scrubland. No access road.', amount_at_risk: 98000000, detection_status: 'ghost' },
  { contract_ref: 'KE-RDS-2025-0321', project_name: 'Kakamega Urban Roads Drainage — 12 Streets', county: 'Kakamega', claimed_status: 'Drainage complete on all 12 streets — maintenance handover done', satellite_status: 'Drainage confirmed on 4 of 12 streets. 8 streets show no works commenced.', amount_at_risk: 76000000, detection_status: 'partial' },
  { contract_ref: 'KE-WAT-2025-0156', project_name: 'Wajir Solar Water Kiosks — 20 Units', county: 'Wajir', claimed_status: '20 solar water kiosks installed and operational — community benefit confirmed', satellite_status: '3 kiosks confirmed at GPS. 17 GPS coordinates show no infrastructure whatsoever.', amount_at_risk: 34000000, detection_status: 'partial' },
  { contract_ref: 'KE-AGR-2025-0089', project_name: 'Meru County Commercial Greenhouse Structures — 50 Units', county: 'Meru', claimed_status: '50 commercial greenhouses complete — farmers operational', satellite_status: '12 greenhouses confirmed. 38 sites show only cultivated farmland — no greenhouse structures.', amount_at_risk: 62000000, detection_status: 'partial' },
  { contract_ref: 'KE-INF-2025-0244', project_name: 'Mandera Border Post Upgrading', county: 'Mandera', claimed_status: 'Border post fully upgraded — customs offices, canopy, parking, fencing done', satellite_status: 'Canopy confirmed. Offices ~60% complete. Fence, parking and access road absent.', amount_at_risk: 89000000, detection_status: 'partial' },
];

const SAMPLE_REPORTS = [
  { type: 'Bribery / Kickbacks', county: 'Nairobi', sector: 'Roads', description: 'Procurement officer at KURA demanded KES 2 million from our company before registering our bid. This happened on 14 January 2026 at Times Tower 3rd floor. We have a voice recording and written evidence.', amount: 2000000, anonymous: true, status: 'reviewing', ai_credibility_score: 91 },
  { type: 'Ghost project / Fake delivery', county: 'Kiambu', sector: 'Education', description: '8 classroom blocks at Kiambu Girls Secondary School do not exist. The headteacher confirmed no construction has taken place. The contractor collected KES 28M. Parents are distressed. I visited the site personally.', amount: 28000000, anonymous: true, status: 'escalated', ai_credibility_score: 95 },
  { type: 'Procurement fraud', county: 'Nairobi', sector: 'Health', description: 'MedSupply Africa charged KES 485M for hospital equipment at 3x the market price. The same equipment is available for KES 150M. I have market quotations from 4 independent suppliers.', amount: 485000000, anonymous: true, status: 'pending', ai_credibility_score: 87 },
  { type: 'Embezzlement of public funds', county: 'Kisumu', sector: 'Education', description: 'School bursary funds of KES 4.5M for Kisumu West sub-county have not been disbursed to students. The sub-county education officer has been unresponsive for 3 months.', amount: 4500000, anonymous: true, status: 'pending', ai_credibility_score: 76 },
  { type: 'Bribery / Kickbacks', county: 'Turkana', sector: 'Water', description: 'County water official demanding 20% kickback from all contractors on the water project. Three separate contractors confirmed this independently. Total project is KES 145M.', amount: 29000000, anonymous: true, status: 'pending', ai_credibility_score: 79 },
  { type: 'Ghost project / Fake delivery', county: 'Turkana', sector: 'Education', description: 'Turkana North Girls Secondary School does not exist despite KES 98M paid. I drove to the GPS coordinates — empty scrubland. No access road. No foundation. Nothing.', amount: 98000000, anonymous: true, status: 'pending', ai_credibility_score: 94 },
];

const seedIfEmpty = async (client) => {
  try {
    const { rows } = await client.query('SELECT COUNT(*) as count FROM contracts');
    const count = parseInt(rows[0].count);
    if (count === 0) {
      console.log('🌱 Seeding data...');
      // Seed contracts
      for (const c of CONTRACTS_SEED) {
        try {
          await client.query(
            `INSERT INTO contracts (contract_id, description, county, sector, value, supplier, risk_score, risk_level, flags)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (contract_id) DO NOTHING`,
            [c.contract_id, c.description, c.county, c.sector || null, c.value, c.supplier, c.risk_score, c.risk_level, c.flags]
          );
        } catch (e) {
          console.error(`Failed to seed contract ${c.contract_id}:`, e.message);
        }
      }
      console.log(`✅ Seeded ${CONTRACTS_SEED.length} contracts`);

      // Seed ghost projects
      for (const g of GHOST_SCENARIOS) {
        try {
          await client.query(
            `INSERT INTO ghost_projects (contract_ref, project_name, county, claimed_status, satellite_status, amount_at_risk, detection_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT DO NOTHING`,
            [g.contract_ref, g.project_name, g.county, g.claimed_status, g.satellite_status, g.amount_at_risk, g.detection_status]
          );
        } catch (e) {
          console.error(`Failed to seed ghost project:`, e.message);
        }
      }
      console.log(`✅ Seeded ${GHOST_SCENARIOS.length} ghost projects`);

      // Seed reports
      for (let i = 0; i < SAMPLE_REPORTS.length; i++) {
        const r = SAMPLE_REPORTS[i];
        const year = new Date().getFullYear();
        const case_number = `KW-${year}-${1000 + i}`;
        try {
          await client.query(
            `INSERT INTO reports (case_number, type, county, sector, description, amount, anonymous, status, ai_credibility_score)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (case_number) DO NOTHING`,
            [case_number, r.type, r.county, r.sector, r.description, r.amount || null, r.anonymous, r.status, r.ai_credibility_score]
          );
        } catch (e) {
          console.error(`Failed to seed report:`, e.message);
        }
      }
      console.log(`✅ Seeded ${SAMPLE_REPORTS.length} reports`);
    } else {
      console.log('✅ Data already present — skipping seed');
    }
  } catch (e) {
    console.error('Seed error:', e.message);
  }
};



module.exports = { pool, initDB };
