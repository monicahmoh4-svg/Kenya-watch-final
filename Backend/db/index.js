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
      await client.query('ALTER TABLE contracts ADD COLUMN IF NOT EXISTS sector VARCHAR(100)').catch((e) => {
        console.warn('sector column migration (inline):', e.message);
      });
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
    ['contracts',      'sector',            'VARCHAR(100)'],
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

const seedIfEmpty = async (client) => {
  const { rowCount } = await client.query('SELECT 1 FROM contracts LIMIT 1');
  if (rowCount > 0) return;
  await seedContracts(client);
  await seedGhostProjects(client);
  await seedReports(client);
  console.log('✅ Seed data loaded');
};

const seedContracts = async (client) => {
  await client.query(`
    INSERT INTO contracts
      (contract_id,description,county,sector,value,supplier,supplier_reg_date,bid_type,awarded_date,risk_score,risk_level,flags,procuring_entity,source)
    VALUES
    ('KE-RDS-2025-0001','Rehabilitation of Mombasa Road A109 — 14km section','Nairobi','Roads',2850000000,'Nexus Construction Ltd','2023-01-15','single_source','2025-11-10',94,'HIGH','["Single-source KES 2.85B — no competitive bidding","Company only 22 months old at award","Director linked to 2 county officials","Price 280% above market benchmark"]','Kenya National Highways Authority','manual'),
    ('KE-HTH-2025-0002','Supply of medical equipment Kenyatta National Hospital 2025','Nairobi','Health',485000000,'MedSupply Africa Ltd','2022-06-20','restricted','2025-10-05',88,'HIGH','["Price 320% above market benchmark","Shell company indicators detected","Registered address matches 3 previously flagged firms"]','Ministry of Health','manual'),
    ('KE-EDU-2025-0003','Construction of 200 classroom blocks — Kisii County schools','Kisii','Education',360000000,'Buildcon Kenya Ltd','2018-04-10','open','2025-09-15',12,'LOW','["Clean verified track record","Open competitive bidding","Active community oversight"]','Kisii County Government','manual'),
    ('KE-WAT-2025-0004','Nairobi Water and Sewerage expansion — Phase 3','Nairobi','Water',1200000000,'AquaInfra Kenya Ltd','2020-03-22','open','2025-08-20',55,'MEDIUM','["Director has undisclosed government interest","Price 45% above market estimate"]','Nairobi City Water and Sewerage','manual'),
    ('KE-AGR-2025-0005','Supply of fertiliser to 47 counties — National Programme 2025','National','Agriculture',3200000000,'AgriChem Solutions Ltd','2024-09-01','single_source','2026-01-05',97,'HIGH','["Single-source award KES 3.2B — no competitive bidding","Company only 4 months old at award","No verified distribution infrastructure","Director is spouse of procurement officer"]','National Cereals and Produce Board','manual'),
    ('KE-ICT-2025-0006','ICT infrastructure upgrade — Kisii County offices','Kisii','ICT',43000000,'Daggy Techs Ltd','2018-04-10','open','2025-12-01',18,'LOW','["Clean verified track record","3 prior successful county contracts","Competitive open bidding"]','Kisii County Government','manual'),
    ('KE-RDS-2025-0007','Meru–Nkubu road rehabilitation — 23km tarmac','Meru','Roads',540000000,'Strabag East Africa Ltd','2015-06-01','open','2025-07-15',22,'LOW','["Established international contractor","Competitive open bid process"]','Kenya National Highways Authority','manual'),
    ('KE-HTH-2025-0008','Construction of Kakamega County Referral Hospital — Phase 2','Kakamega','Health',870000000,'Ramco Builders Ltd','2019-01-10','open','2025-06-20',35,'LOW','["Minor extension granted — approved","Within approved budget"]','Kakamega County Government','manual'),
    ('KE-EDU-2025-0009','Supply of laptops to 800 primary schools — Kiambu County','Kiambu','Education',680000000,'TechSource Kenya Ltd','2023-11-20','restricted','2026-01-10',85,'HIGH','["Price 290% above comparable market tenders","Company recently registered — 14 months old","Director linked to county education official"]','Kiambu County Education Department','manual'),
    ('KE-WAT-2025-0010','Nakuru water treatment plant expansion — 50,000 m³/day','Nakuru','Water',320000000,'WaterTech Solutions Ltd','2021-05-15','open','2025-09-01',45,'MEDIUM','["Payment released before project completion verified","Minor documentation gaps in procurement file"]','Nakuru County Water Services','manual'),
    ('KE-RDS-2025-0011','Kisumu–Kakamega highway dualling — 18km','Kisumu','Roads',1850000000,'China Road and Bridge Corporation','2005-01-01','open','2025-04-10',20,'LOW','["Established international contractor — clean record","Competitive international tendering process"]','Kenya National Highways Authority','manual'),
    ('KE-HTH-2025-0012','Supply of ARV drugs — Coast General Hospital 2025','Mombasa','Health',95000000,'PharmKenya Ltd','2024-02-28','single_source','2025-11-20',79,'HIGH','["Single-source pharmaceutical supply","Price 210% above KEMSA benchmark rate","No verified cold storage infrastructure"]','Coast General Teaching and Referral Hospital','manual'),
    ('KE-WAT-2025-0013','Turkana County emergency water supply — drought response','Turkana','Water',145000000,'EmerWater Solutions Ltd','2023-09-10','emergency','2025-11-05',58,'MEDIUM','["Emergency procurement — drought justified","Price slightly above market benchmark"]','Turkana County Water Services','manual'),
    ('KE-ICT-2025-0014','CCTV surveillance system — Mombasa City 2025','Mombasa','Security',420000000,'SafeCity Systems Ltd','2023-04-12','restricted','2025-10-15',72,'MEDIUM','["Restricted bidding for KES 420M — unusual for this value","Director has undisclosed connections to county security official"]','Mombasa County Government','manual'),
    ('KE-HTH-2025-0015','Supply malaria nets — 2 million units, 10 counties','National','Health',180000000,'NetPro Supplies Ltd','2024-07-15','single_source','2025-12-10',91,'HIGH','["Company only 5 months old at award","Single-source KES 180M — no bidding","No verified logistics or distribution infrastructure"]','Ministry of Health','manual'),
    ('KE-RDS-2025-0016','Thika Superhighway routine maintenance — Year 3','Kiambu','Roads',380000000,'Raubex Kenya Ltd','2012-01-01','open','2025-08-01',15,'LOW','["Established contractor — clean long track record","Competitive renewal tender","Performance verified"]','Kenya National Highways Authority','manual'),
    ('KE-AGR-2025-0017','Strategic grain reserve — 500,000 bags maize FY2025','National','Agriculture',2100000000,'GrainMaster Kenya Ltd','2022-01-01','open','2025-06-15',42,'MEDIUM','["Quality dispute raised by audit team","Partial delivery confirmed — 60%"]','National Cereals and Produce Board','manual'),
    ('KE-ICT-2025-0018','Integrated financial management system — Kiambu County','Kiambu','ICT',95000000,'FinSystems Ltd','2024-05-10','single_source','2025-11-10',87,'HIGH','["Single-source KES 95M","Company only 7 months old at award","Director is nephew of county governor","Product is resale of open-source Odoo — worth KES 500K"]','Kiambu County Treasury','manual'),
    ('KE-HTH-2025-0019','Construction of 100 rural dispensaries — Kilifi County','Kilifi','Health',380000000,'Coastal Builders Co Ltd','2015-03-15','open','2025-05-20',30,'LOW','["Open competitive tendering","Community participation verified","World Bank co-funded"]','Kilifi County Government','manual'),
    ('KE-RDS-2025-0020','Nairobi Northern Bypass interchange upgrade — Phase 2','Nairobi','Roads',2200000000,'Surbana Jurong Ltd','2010-01-01','open','2025-05-10',25,'LOW','["Established Singaporean consultant","Open international tender","ADB co-financed"]','Kenya Urban Roads Authority','manual'),
    ('KE-EDU-2025-0021','School furniture — 500 secondary schools Nairobi County','Nairobi','Education',220000000,'FurniCraft Kenya Ltd','2024-06-15','single_source','2025-12-15',89,'HIGH','["Single-source KES 220M — no competitive bidding","Company only 7 months old at award","Director is elected ward representative","Price 310% above comparable market tenders"]','Nairobi City County Education','manual'),
    ('KE-WAT-2025-0022','Baringo County borehole drilling — 500 community units','Baringo','Water',375000000,'WellDrill Africa Ltd','2016-07-01','open','2025-10-01',30,'LOW','["Community water access project","Clean procurement process","World Bank co-funded"]','Baringo County Government','manual'),
    ('KE-ICT-2025-0023','Nairobi County smart waste management digital system','Nairobi','ICT',285000000,'SmartCity Solutions Ltd','2024-01-20','restricted','2025-12-20',83,'HIGH','["Company only 12 months old","Price 260% above comparable systems","Director linked to county executive member"]','Nairobi City County Government','manual'),
    ('KE-HTH-2025-0024','Mandera County Hospital — beds, linen and furniture 500 units','Mandera','Health',28000000,'MedFurnish Kenya Ltd','2024-08-20','single_source','2025-11-30',82,'HIGH','["Single-source KES 28M","Price 340% above market","Company only 6 months old at award"]','Mandera County Government','manual'),
    ('KE-AGR-2025-0025','Kilifi County coconut value chain development','Kilifi','Agriculture',75000000,'CoconutKE Processing Ltd','2019-11-10','open','2025-08-10',28,'LOW','["County-level smallholder project","Clean open procurement","Beneficiary community verified"]','Kilifi County Agriculture Department','manual'),
    ('KE-RDS-2025-0026','Eldoret ring road bypass — Phase 1, 28km','Uasin Gishu','Roads',1450000000,'Sinohydro Corporation Ltd','2005-01-01','open','2025-06-01',22,'LOW','["Established international contractor","Open competitive tender","KfW co-financed"]','Kenya National Highways Authority','manual'),
    ('KE-EDU-2025-0027','KCSE examination materials supply — 2026 national exams','National','Education',850000000,'Printtech Kenya Ltd','2008-04-01','restricted','2026-01-15',55,'MEDIUM','["Restricted tender — sensitive materials (justified)","Price query raised by Auditor General"]','Kenya National Examinations Council','manual'),
    ('KE-ICT-2025-0028','Lamu Port digital customs management system','Lamu','ICT',480000000,'PortTech Systems Ltd','2023-07-15','restricted','2025-10-25',76,'HIGH','["Price 230% above comparable systems","Director has undisclosed connection to KRA official","Restricted bidding unusual for this contract value"]','Kenya Ports Authority','manual'),
    ('KE-WAT-2025-0029','Lake Victoria water intake — Kisumu expansion Phase 4','Kisumu','Water',890000000,'Vitens Evides International','2005-01-01','open','2025-04-15',18,'LOW','["Established Dutch water firm","Open international tender","EU co-financed project"]','Lake Victoria South Water Services','manual'),
    ('KE-RDS-2025-0030','Nairobi–Nakuru expressway feasibility and design','Nakuru','Roads',320000000,'Mott MacDonald Kenya Ltd','2010-01-01','open','2025-07-01',18,'LOW','["Established international consultant","Open competitive tender","Clean"]','Kenya National Highways Authority','manual'),
    ('KE-HTH-2025-0031','HIV testing kits — 2 million units national programme 2025','National','Health',320000000,'DiagnosticsKE Ltd','2017-03-01','open','2025-07-05',28,'LOW','["WHO pre-qualified supplier","Open competitive tender","NACC oversight active"]','National AIDS Control Council','manual'),
    ('KE-AGR-2025-0032','Drought-resistant seed supply — 30 counties ASAL programme','National','Agriculture',420000000,'SeedCo Africa Ltd','2003-01-01','open','2025-08-15',25,'LOW','["Established company — 22-year track record","Certified seeds — KEPHIS approved","Competitive open tender"]','Kenya Seed Company','manual'),
    ('KE-ICT-2025-0033','National ID digitisation system upgrade — Phase 3','National','ICT',3500000000,'IBM East Africa Ltd','2000-01-01','negotiated','2025-03-01',30,'LOW','["Established vendor — 25-year track record","Negotiated — proprietary system (justified)","Security vetted by NIS"]','National Registration Bureau','manual'),
    ('KE-EDU-2025-0034','Kisumu Technical Training Institute construction — Phase 2','Kisumu','Education',195000000,'Buildcon Kenya Ltd','2016-03-20','open','2025-07-01',22,'LOW','["Clean open procurement process","Community oversight active","TVETA supervised"]','Technical and Vocational Education Training Authority','manual'),
    ('KE-RDS-2025-0035','Naiposha–Narok Road tarmac upgrade — 45km A104','Narok','Roads',1650000000,'Strabag East Africa Ltd','2015-06-01','open','2025-10-10',20,'LOW','["Established international contractor","Open competitive tender","NEMA EIA approved"]','Kenya National Highways Authority','manual'),
    ('KE-WAT-2025-0036','Mombasa island sewerage rehabilitation — Phase 2','Mombasa','Water',640000000,'Mott MacDonald Kenya Ltd','2010-01-01','open','2025-07-20',18,'LOW','["Established international consultant","Open competitive tender","EU co-funded"]','Coast Water Services Board','manual'),
    ('KE-ICT-2025-0037','National government digital identity integration — NIIMS Phase 2','National','ICT',4200000000,'Idemia Group France','2005-01-01','negotiated','2025-02-01',35,'LOW','["Strategic negotiated — biometric specialist","Security vetted","Parliament approved budget"]','Ministry of Interior and Coordination','manual'),
    ('KE-HTH-2025-0038','Meru Tea Zone Community Health Centres — 8 units','Meru','Health',95000000,'Highlands Construction Ltd','2019-06-01','open','2025-10-20',28,'LOW','["Open competitive tender","County assembly oversight verified"]','Meru County Government','manual'),
    ('KE-RDS-2025-0039','Machakos–Konza Technopolis Road dualling — 35km','Machakos','Roads',980000000,'H Young and Co Ltd','2008-07-01','open','2025-09-10',20,'LOW','["Established contractor","Open competitive tender","Vision 2030 flagship project"]','Kenya National Highways Authority','manual'),
    ('KE-AGR-2025-0040','Meru Tea Factory modernisation and upgrade','Meru','Agriculture',145000000,'Tecalemit Kenya Ltd','2012-05-01','open','2025-09-05',22,'LOW','["Established firm","Open competitive tender","Farmer co-operative verified"]','Meru County Government','manual'),
    ('KE-HTH-2025-0041','Wajir County Referral Hospital medical equipment','Wajir','Health',65000000,'MedEquip Africa Ltd','2024-03-15','single_source','2025-12-01',81,'HIGH','["Single-source KES 65M — no bidding","Company only 8 months old","Director linked to county health executive"]','Wajir County Government','manual'),
    ('KE-EDU-2025-0042','Turkana County secondary schools construction — 12 units','Turkana','Education',280000000,'Northlands Builders Ltd','2020-07-10','open','2025-08-20',32,'LOW','["Open competitive tender","Remote area premium justified","UNICEF co-funded"]','Turkana County Government','manual'),
    ('KE-ICT-2025-0043','Marsabit County integrated revenue management system','Marsabit','ICT',35000000,'RevSystems Ltd','2024-09-01','single_source','2025-11-15',84,'HIGH','["Single-source KES 35M","Company only 4 months old","Director is cousin of county treasurer"]','Marsabit County Treasury','manual'),
    ('KE-WAT-2025-0044','Wajir County solar-powered water kiosks — 50 units','Wajir','Water',85000000,'SolarWater Kenya Ltd','2021-02-15','open','2025-09-30',38,'LOW','["Open competitive tender","ASAL community project","GIZ co-funded"]','Wajir County Government','manual'),
    ('KE-AGR-2025-0045','Kwale County cashew nut value chain support','Kwale','Agriculture',55000000,'CoastalAgri Ltd','2017-08-20','open','2025-07-25',25,'LOW','["Open competitive tender","Smallholder focused","IFAD co-funded"]','Kwale County Agriculture Department','manual'),
    ('KE-RDS-2025-0046','Garissa–Wajir Highway rehabilitation — 180km','Garissa','Roads',4800000000,'China Communications Construction Co','2000-01-01','open','2025-03-15',22,'LOW','["Established international contractor","Open tender","AfDB co-financed"]','Kenya National Highways Authority','manual'),
    ('KE-HTH-2025-0047','Garissa County 5 dispensaries construction','Garissa','Health',75000000,'EasternBuilders Ltd','2018-04-10','open','2025-06-30',30,'LOW','["Open competitive tender","Community health project","USAID co-funded"]','Garissa County Government','manual'),
    ('KE-ICT-2025-0048','Kwale County integrated land management system','Kwale','ICT',42000000,'LandSys Kenya Ltd','2024-11-01','single_source','2026-02-01',85,'HIGH','["Single-source KES 42M","Company only 3 months old","Director is brother of county land registrar"]','Kwale County Government','manual')
    ON CONFLICT (contract_id) DO NOTHING;
  `);
};

const seedGhostProjects = async (client) => {
  await client.query(`
    INSERT INTO ghost_projects
      (contract_ref,project_name,county,sector,claimed_status,satellite_status,amount_at_risk,detection_status,confidence_score,satellite_metadata)
    VALUES
    ('KE-EDU-2024-0112','Kiambu Girls Secondary — 8 Classroom Block','Kiambu','Education','8-classroom block complete — completion certificate and photos submitted to ministry','Bare undisturbed land. No construction activity detected. Dense vegetation only.',28000000,'ghost',96,'{"ndvi":0.72,"built_area_sqm":0,"imagery_source":"Sentinel-2","analysis_date":"2026-02-15"}'),
    ('KE-WAT-2024-0087','Nakuru Water Treatment Plant Expansion','Nakuru','Water','Plant 100% complete — operational, serving 50,000 residents','~15% structural footprint only. Foundation visible. No equipment or superstructure installed.',142000000,'partial',89,'{"built_area_sqm":450,"expected_sqm":3200,"completion_pct":14,"imagery_source":"Sentinel-2"}'),
    ('KE-RDS-2024-0043','Tana River–Garissa Road Rehabilitation — 35km','Tana River','Roads','Road fully rehabilitated — paved surface, drainage structures complete','Road surface unchanged from 2019 baseline imagery. Potholed murram throughout. No tarmac layer.',285000000,'ghost',94,'{"road_surface":"murram_unchanged","baseline_year":2019,"imagery_source":"Sentinel-2"}'),
    ('KE-INF-2025-0034','Kisii Central Market Renovation','Kisii','Infrastructure','Market renovation 100% complete — stalls, drainage, roofing done','New roof confirmed. Floor tiling visible. Drainage structures present. Renovation verified.',12000000,'verified',98,'{"built_area_sqm":2100,"stalls_count":180,"imagery_source":"Sentinel-2"}'),
    ('KE-HTH-2025-0067','Marsabit County Dispensary — 3 Units','Marsabit','Health','Three dispensary units completed and operational since March 2025','One unit ~40% complete. Two sites show bare, undisturbed ground.',45000000,'partial',88,'{"units_complete":1,"units_partial":1,"units_ghost":2,"imagery_source":"Sentinel-2"}'),
    ('KE-EDU-2025-0198','Turkana North Girls Secondary School','Turkana','Education','School 100% complete — 12 classrooms, dormitory, lab, kitchen','No structures detected at GPS coordinates. Undisturbed scrubland. No access road.',98000000,'ghost',97,'{"built_area_sqm":0,"scrubland_cover":"high","imagery_source":"Sentinel-2"}'),
    ('KE-RDS-2025-0321','Kakamega Urban Roads Drainage — 12 Streets','Kakamega','Roads','Drainage complete on all 12 streets — maintenance handover done','Drainage confirmed on 4 of 12 streets. 8 streets show no works commenced.',76000000,'partial',85,'{"streets_complete":4,"streets_ghost":8,"imagery_source":"Sentinel-2"}'),
    ('KE-WAT-2025-0156','Wajir Solar Water Kiosks — 20 Units','Wajir','Water','20 solar water kiosks installed and operational — community benefit confirmed','3 kiosks confirmed at GPS. 17 GPS coordinates show no infrastructure whatsoever.',34000000,'partial',92,'{"kiosks_confirmed":3,"kiosks_ghost":17,"imagery_source":"Sentinel-2"}'),
    ('KE-AGR-2025-0089','Meru County Commercial Greenhouse Structures — 50 Units','Meru','Agriculture','50 commercial greenhouses complete — farmers operational','12 greenhouses confirmed. 38 sites show only cultivated farmland — no greenhouse structures.',62000000,'partial',90,'{"greenhouses_confirmed":12,"greenhouses_ghost":38,"imagery_source":"Sentinel-2"}'),
    ('KE-INF-2025-0244','Mandera Border Post Upgrading','Mandera','Infrastructure','Border post fully upgraded — customs offices, canopy, parking, fencing done','Canopy confirmed. Offices ~60% complete. Fence, parking and access road absent.',89000000,'partial',87,'{"canopy":"complete","offices_pct":60,"parking":"absent","imagery_source":"Sentinel-2"}')
    ON CONFLICT DO NOTHING;
  `);
};

const seedReports = async (client) => {
  await client.query(`
    INSERT INTO reports
      (case_number,type,county,sector,description,amount,anonymous,status,ai_credibility_score,routing,keywords)
    VALUES
    ('KW-2026-1001','Bribery / Kickbacks','Nairobi','Roads','Procurement officer at KURA demanded KES 2 million from our company before registering our bid. This happened on 14 January 2026 at Times Tower 3rd floor. We have a voice recording and written evidence.',2000000,true,'reviewing',91,'DPP','["bribery","KURA","voice recording","evidence","January 2026"]'),
    ('KW-2026-1002','Ghost project / Fake delivery','Kiambu','Education','8 classroom blocks at Kiambu Girls Secondary School do not exist. The headteacher confirmed no construction has taken place. The contractor collected KES 28M. Parents are distressed. I visited the site personally.',28000000,true,'escalated',95,'EACC','["ghost project","classroom","Kiambu","site visit confirmed","headteacher witness"]'),
    ('KW-2026-1003','Procurement fraud','Nairobi','Health','MedSupply Africa charged KES 485M for hospital equipment at 3x the market price. The same equipment is available for KES 150M. I have market quotations from 4 independent suppliers.',485000000,true,'pending',87,'PPRA','["overpricing","medical equipment","market comparison","4 supplier quotes"]'),
    ('KW-2026-1004','Embezzlement of public funds','Kisumu','Education','School bursary funds of KES 4.5M for Kisumu West sub-county have not been disbursed to students. The sub-county education officer has been unresponsive for 3 months.',4500000,true,'pending',76,'EACC','["bursary","non-disbursement","Kisumu West","3 months unresponsive"]'),
    ('KW-2026-1005','Bribery / Kickbacks','Turkana','Water','County water official demanding 20% kickback from all contractors on the water project. Three separate contractors confirmed this independently. Total project is KES 145M.',29000000,true,'pending',79,'EACC','["kickback","water official","3 contractor witnesses","20 percent"]'),
    ('KW-2026-1006','Ghost project / Fake delivery','Turkana','Education','Turkana North Girls Secondary School does not exist despite KES 98M paid. I drove to the GPS coordinates — empty scrubland. No access road. No foundation. Nothing.',98000000,true,'pending',94,'EACC','["ghost school","Turkana","GPS verified","personal site visit"]')
    ON CONFLICT (case_number) DO NOTHING;
  `);
};

module.exports = { pool, initDB };
