const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10
});

const initDB = async () => {
  let retries = 10;
  while (retries > 0) {
    try {
      const client = await pool.connect();
      console.log('✅ PostgreSQL connected');
      await createSchema(client);
      await createIndexes(client);
      const { rowCount } = await client.query('SELECT 1 FROM contracts LIMIT 1');
      if (!rowCount) await seedData(client);
      client.release();
      return;
    } catch (err) {
      retries--;
      console.error(`DB attempt failed (${retries} left): ${err.message}`);
      if (retries === 0) throw err;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
};

const createSchema = async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS contracts (
      id SERIAL PRIMARY KEY,
      contract_id VARCHAR(80) UNIQUE NOT NULL,
      description TEXT NOT NULL,
      county VARCHAR(100),
      sector VARCHAR(100),
      value BIGINT DEFAULT 0,
      supplier VARCHAR(250),
      supplier_reg_date DATE,
      bid_type VARCHAR(50) DEFAULT 'competitive',
      awarded_date DATE,
      completion_date DATE,
      risk_score INTEGER DEFAULT 0,
      risk_level VARCHAR(10) DEFAULT 'LOW',
      flags JSONB DEFAULT '[]',
      status VARCHAR(30) DEFAULT 'active',
      procuring_entity VARCHAR(250),
      contact_officer VARCHAR(150),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      case_number VARCHAR(25) UNIQUE NOT NULL,
      type VARCHAR(120) NOT NULL,
      county VARCHAR(100),
      sector VARCHAR(100),
      description TEXT NOT NULL,
      amount BIGINT,
      anonymous BOOLEAN DEFAULT true,
      status VARCHAR(30) DEFAULT 'pending',
      ai_credibility_score INTEGER DEFAULT 50,
      routing VARCHAR(20) DEFAULT 'EACC',
      keywords JSONB DEFAULT '[]',
      related_contract_id VARCHAR(80),
      escalated_at TIMESTAMPTZ,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ghost_projects (
      id SERIAL PRIMARY KEY,
      contract_ref VARCHAR(80),
      project_name VARCHAR(250) NOT NULL,
      county VARCHAR(100),
      sector VARCHAR(100),
      gps_coordinates VARCHAR(80),
      claimed_status VARCHAR(150),
      satellite_status VARCHAR(150),
      satellite_date DATE,
      amount_at_risk BIGINT DEFAULT 0,
      detection_status VARCHAR(20) DEFAULT 'flagged',
      confidence_score INTEGER DEFAULT 0,
      satellite_metadata JSONB DEFAULT '{}',
      procuring_entity VARCHAR(250),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS chat_logs (
      id SERIAL PRIMARY KEY,
      session_id VARCHAR(120),
      role VARCHAR(20),
      content TEXT,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS request_logs (
      id SERIAL PRIMARY KEY,
      method VARCHAR(10),
      path VARCHAR(255),
      status_code INTEGER,
      response_ms INTEGER,
      ip VARCHAR(60),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('✅ Schema ready');
};

const createIndexes = async (client) => {
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_contracts_risk ON contracts(risk_level, risk_score DESC);
    CREATE INDEX IF NOT EXISTS idx_contracts_county ON contracts(county);
    CREATE INDEX IF NOT EXISTS idx_contracts_sector ON contracts(sector);
    CREATE INDEX IF NOT EXISTS idx_contracts_supplier ON contracts(supplier);
    CREATE INDEX IF NOT EXISTS idx_contracts_created ON contracts(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
    CREATE INDEX IF NOT EXISTS idx_reports_county ON reports(county);
    CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(type);
    CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ghost_status ON ghost_projects(detection_status);
    CREATE INDEX IF NOT EXISTS idx_ghost_county ON ghost_projects(county);
    CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_logs(session_id);
  `);
  console.log('✅ Indexes ready');
};

const seedData = async (client) => {
  // ── 50 Kenya contracts ──────────────────────────────────────────────────────
  await client.query(`
    INSERT INTO contracts (contract_id,description,county,sector,value,supplier,supplier_reg_date,bid_type,awarded_date,risk_score,risk_level,flags,procuring_entity) VALUES
    ('KE-RDS-2026-0001','Rehabilitation of Mombasa Road, Nairobi section 14km','Nairobi','Roads & Infrastructure',2850000000,'Nexus Construction Ltd','2023-01-15','single_source','2025-11-10',94,'HIGH','["Single-source award","Company <3 years old","Director linked to 2 county officials","Price 280% above market benchmark","No prior govt contracts"]','Kenya National Highways Authority'),
    ('KE-HTH-2026-0002','Supply of medical equipment, Kenyatta National Hospital','Nairobi','Health',485000000,'MedSupply Africa Ltd','2022-06-20','restricted','2025-10-05',88,'HIGH','["Inflated price 320% above benchmark","Shell company indicators","Address matches 3 other flagged firms"]','Ministry of Health'),
    ('KE-EDU-2026-0003','Construction of 200 classrooms across Kisii County','Kisii','Education',360000000,'Daggy Techs Ltd','2018-04-10','open','2025-09-15',12,'LOW','["Clean — verified track record"]','Kisii County Government'),
    ('KE-WAT-2026-0004','Nairobi Water and Sewerage expansion phase 3','Nairobi','Water & Sanitation',1200000000,'AquaInfra Kenya Ltd','2020-03-22','open','2025-08-20',62,'MEDIUM','["Director has undisclosed government interest","Price 45% above market"]','Nairobi City Water & Sewerage Company'),
    ('KE-AGR-2026-0005','Supply of fertiliser to 47 counties','National','Agriculture',3200000000,'AgriChem Solutions','2024-09-01','single_source','2026-01-05',97,'HIGH','["Single-source worth KES 3.2B","Company 4 months old at award","No distribution infrastructure","Fake manufacturer certifications","Director is spouse of procurement officer"]','National Cereals and Produce Board'),
    ('KE-ICT-2026-0006','Integrated county ICT infrastructure upgrade Kisii','Kisii','ICT',43000000,'Daggy Techs Ltd','2018-04-10','open','2025-12-01',18,'LOW','["Clean — verified track record","3 prior successful contracts"]','Kisii County Government'),
    ('KE-RDS-2026-0007','Meru-Nkubu road rehabilitation 23km','Meru','Roads & Infrastructure',540000000,'Strabag East Africa','2015-06-01','open','2025-07-15',25,'LOW','["Clean — international contractor","Competitive bid process"]','Kenya National Highways Authority'),
    ('KE-HTH-2026-0008','Construction of Kakamega County Referral Hospital phase 2','Kakamega','Health',870000000,'Ramco Builders','2019-01-10','open','2025-06-20',35,'LOW','["Minor: 1 extension granted","Within budget"]','Kakamega County Government'),
    ('KE-EDU-2026-0009','Supply of laptops to 800 primary schools Kiambu','Kiambu','Education',680000000,'TechSource Kenya','2023-11-20','restricted','2026-01-10',85,'HIGH','["Price 290% above Jumia market price","Recently registered","Won without technical evaluation","Connected to county official"]','Kiambu County Education Department'),
    ('KE-WAT-2026-0010','Nakuru water treatment plant expansion','Nakuru','Water & Sanitation',320000000,'WaterTech Solutions','2021-05-15','open','2025-09-01',45,'MEDIUM','["Payment released before completion","Minor documentation gaps"]','Nakuru County Water Services'),
    ('KE-RDS-2026-0011','Kisumu-Kakamega highway dualling 18km','Kisumu','Roads & Infrastructure',1850000000,'China Road & Bridge Corp','2005-01-01','open','2025-04-10',20,'LOW','["International contractor","Clean history","Competitive process"]','Kenya National Highways Authority'),
    ('KE-HTH-2026-0012','Supply of ARV drugs Coast General Hospital','Mombasa','Health',95000000,'PharmKenya Ltd','2024-02-28','single_source','2025-11-20',79,'HIGH','["Single-source pharmaceutical","Price 210% above KEMSA rate","No storage facility verification"]','Coast General Teaching & Referral Hospital'),
    ('KE-AGR-2026-0013','Irrigation project Tana River smallholder farmers','Tana River','Agriculture',280000000,'IrriTech Africa','2017-08-15','open','2025-05-30',38,'LOW','["Slight delay","On budget","Community verified"]','Tana River County Government'),
    ('KE-ICT-2026-0014','CCTV surveillance system Mombasa City','Mombasa','Security',420000000,'SafeCity Systems','2023-04-12','restricted','2025-10-15',72,'MEDIUM','["Restricted bidding for KES 420M unusual","Director has police connections","Price above benchmark"]','Mombasa County Government'),
    ('KE-EDU-2026-0015','Construction of Kisumu Technical Training Institute','Kisumu','Education',195000000,'Buildcon Kenya','2016-03-20','open','2025-07-01',22,'LOW','["Clean process","Community oversight active"]','Technical & Vocational Education Authority'),
    ('KE-HTH-2026-0016','Supply of malaria nets 2M units 10 counties','National','Health',180000000,'NetPro Supplies','2024-07-15','single_source','2025-12-10',91,'HIGH','["Company 5 months old","Single-source KES 180M","No logistics infrastructure","NGO verification pending"]','Ministry of Health — National Malaria Control Programme'),
    ('KE-RDS-2026-0017','Thika Superhighway maintenance contract year 3','Kiambu','Roads & Infrastructure',380000000,'Raubex Kenya','2012-01-01','open','2025-08-01',15,'LOW','["Established contractor","Competitive renewal","Clean track record"]','Kenya National Highways Authority'),
    ('KE-WAT-2026-0018','Turkana water supply emergency works','Turkana','Water & Sanitation',145000000,'EmerWater Solutions','2023-09-10','emergency','2025-11-05',58,'MEDIUM','["Emergency procurement — justified","Price slightly above benchmark"]','Turkana County Water Department'),
    ('KE-AGR-2026-0019','Purchase of strategic grain reserve maize 500,000 bags','National','Agriculture',2100000000,'GrainMaster Kenya','2022-01-01','open','2025-06-15',42,'MEDIUM','["Quality dispute raised","Partial delivery confirmed","Investigation ongoing"]','National Cereals and Produce Board'),
    ('KE-ICT-2026-0020','National ID digitisation system upgrade','National','ICT',3500000000,'IBM East Africa','2000-01-01','negotiated','2025-03-01',30,'LOW','["Established vendor","Negotiated — justified for proprietary system","Security vetted"]','National Registration Bureau'),
    ('KE-HTH-2026-0021','Bomet County Hospital renovation','Bomet','Health',95000000,'Highlands Construction','2019-06-01','open','2025-10-20',28,'LOW','["Clean process","County assembly verified"]','Bomet County Government'),
    ('KE-EDU-2026-0022','University of Nairobi library expansion','Nairobi','Education',520000000,'Spencon Services','2010-03-15','open','2025-05-15',32,'LOW','["Open tender","International bidders invited","Clean"]','University of Nairobi'),
    ('KE-RDS-2026-0023','Machakos-Konza Technopolis road 35km','Machakos','Roads & Infrastructure',980000000,'H. Young & Co','2008-07-01','open','2025-09-10',20,'LOW','["Clean","Part of Vision 2030 infrastructure"]','Kenya National Highways Authority'),
    ('KE-WAT-2026-0024','Mombasa island sewerage rehabilitation','Mombasa','Water & Sanitation',640000000,'Mott MacDonald Kenya','2010-01-01','open','2025-07-20',18,'LOW','["International consultant","Open bid","Clean"]','Coast Water Services Board'),
    ('KE-AGR-2026-0025','Supply of seeds drought-resistant varieties 30 counties','National','Agriculture',420000000,'SeedCo Africa','2003-01-01','open','2025-08-15',25,'LOW','["Established company","Competitive process","Certified seeds"]','Kenya Seed Company'),
    ('KE-ICT-2026-0026','Nairobi County smart waste management system','Nairobi','ICT',285000000,'SmartCity Solutions','2024-01-20','restricted','2025-12-20',83,'HIGH','["Company 1 year old at award","Price 260% above comparable systems","Director linked to county exec","Restricted bidding unusual"]','Nairobi City County'),
    ('KE-HTH-2026-0027','Supply of theatre equipment 12 county hospitals','Trans Nzoia','Health',230000000,'MedEquip Africa','2021-11-15','open','2025-09-25',40,'MEDIUM','["Equipment specs changed after award","Minor"]','Trans Nzoia County Health Department'),
    ('KE-RDS-2026-0028','Eldoret bypass ring road phase 1','Uasin Gishu','Roads & Infrastructure',1450000000,'Sinohydro Corporation','2005-01-01','open','2025-06-01',22,'LOW','["Chinese contractor clean history","Open tender","KfW co-financed"]','Kenya National Highways Authority'),
    ('KE-EDU-2026-0029','KCSE examination materials supply 2026','National','Education',850000000,'Printtech Kenya','2008-04-01','restricted','2026-01-15',55,'MEDIUM','["Restricted — sensitive material justified","Price query by Auditor General","Investigation recommended"]','Kenya National Examinations Council'),
    ('KE-WAT-2026-0030','Rural borehole drilling 500 boreholes Baringo','Baringo','Water & Sanitation',375000000,'WellDrill Africa','2016-07-01','open','2025-10-01',30,'LOW','["Community water access project","Clean","Donor co-funded (World Bank)"]','Baringo County Government'),
    ('KE-AGR-2026-0031','Cold storage facilities Eldoret fresh produce','Uasin Gishu','Agriculture',180000000,'FreshStore Kenya','2020-09-15','open','2025-08-20',35,'LOW','["Clean tender","PPP arrangement","Community benefit verified"]','Uasin Gishu County Government'),
    ('KE-ICT-2026-0032','Integrated financial management system Kiambu','Kiambu','ICT',95000000,'FinSystems Ltd','2024-05-10','single_source','2025-11-10',87,'HIGH','["Single-source KES 95M","Company 7 months old","Director is nephew of county governor","No system currently deployed to replace"]','Kiambu County Treasury'),
    ('KE-HTH-2026-0033','HIV testing kits 2M units national programme','National','Health',320000000,'DiagnosticsKE','2017-03-01','open','2025-07-05',28,'LOW','["WHO pre-qualified supplier","Open competitive","Clean"]','National AIDS Control Council'),
    ('KE-RDS-2026-0034','Garissa-Dadaab road emergency repair flood damage','Garissa','Roads & Infrastructure',95000000,'Nomadic Engineering','2024-03-20','emergency','2025-12-05',65,'MEDIUM','["Emergency justified by floods","Price 80% above normal","No post-emergency audit yet"]','Kenya National Highways Authority'),
    ('KE-EDU-2026-0035','School feeding programme supplies Turkana 200 schools','Turkana','Education',140000000,'FoodSec Kenya','2018-01-15','open','2025-09-15',32,'LOW','["WFP co-funded","Community verified","Clean"]','Turkana County Education'),
    ('KE-WAT-2026-0036','Nyeri water supply rehabilitation','Nyeri','Water & Sanitation',185000000,'Aqua Engineers','2014-06-01','open','2025-06-25',22,'LOW','["Open tender","Technical evaluation completed","Clean"]','Nyeri Water & Sanitation Company'),
    ('KE-AGR-2026-0037','Kilifi County coconut value chain support','Kilifi','Agriculture',75000000,'CoconutKE Processing','2019-11-10','open','2025-08-10',28,'LOW','["County-level project","Clean","Smallholder benefit verified"]','Kilifi County Agriculture Department'),
    ('KE-ICT-2026-0038','Lamu Port digital customs management system','Lamu','ICT',480000000,'PortTech Systems','2023-07-15','restricted','2025-10-25',76,'HIGH','["Price 230% above port authority estimate","Director connected to KRA official","Restricted for strategic system unusual"]','Kenya Ports Authority'),
    ('KE-HTH-2026-0039','Mandera County Hospital beds and linen 500 units','Mandera','Health',28000000,'MedFurnish Kenya','2024-08-20','single_source','2025-11-30',82,'HIGH','["Single-source KES 28M","Price 340% above market","Company <6 months old"]','Mandera County Government'),
    ('KE-RDS-2026-0040','Northern bypass Nairobi interchange upgrade','Nairobi','Roads & Infrastructure',2200000000,'Surbana Jurong','2010-01-01','open','2025-05-10',25,'LOW','["Singaporean consultant","Open tender","ADB funded","Clean"]','Kenya Urban Roads Authority'),
    ('KE-EDU-2026-0041','Digitisation of KCPE results archives 1980-2010','National','ICT',45000000,'DigiScan Kenya','2023-02-15','restricted','2025-09-20',68,'MEDIUM','["Restricted bidding for digitisation unusual","Price query","No baseline set"]','Kenya National Examinations Council'),
    ('KE-WAT-2026-0042','Lake Victoria water intake Kisumu Municipality','Kisumu','Water & Sanitation',890000000,'Vitens Evides International','2005-01-01','open','2025-04-15',18,'LOW','["Dutch firm clean record","Open international tender","EU funded","Clean"]','Lake Victoria South Water Works'),
    ('KE-AGR-2026-0043','Supply of pesticides and herbicides 40 counties','National','Agriculture',580000000,'AgroChemicals Kenya','2021-01-20','open','2025-07-30',38,'LOW','["Open competitive","KEPHIS certified","Slight volume query"]','State Department for Crop Development'),
    ('KE-ICT-2026-0044','Nairobi Metropolitan Area CCTV phase 2 expansion','Nairobi','Security',1850000000,'Huawei Technologies','2005-01-01','negotiated','2025-08-05',40,'MEDIUM','["Negotiated with incumbent — justified","Price query by Parliament committee","Transparency concerns"]','National Police Service'),
    ('KE-HTH-2026-0045','Construction of 100 rural dispensaries Kilifi County','Kilifi','Health',380000000,'Coastal Builders Co','2015-03-15','open','2025-05-20',30,'LOW','["Open tender","Community participation","Clean","World Bank co-funded"]','Kilifi County Government'),
    ('KE-RDS-2026-0046','Naiposha-Narok road 45km tarmac','Narok','Roads & Infrastructure',1650000000,'Strabag East Africa','2015-06-01','open','2025-10-10',20,'LOW','["Established contractor","Clean","NEMA approved"]','Kenya National Highways Authority'),
    ('KE-EDU-2026-0047','Furniture for 500 secondary schools Nairobi','Nairobi','Education',220000000,'FurniCraft Kenya','2024-06-15','single_source','2025-12-15',89,'HIGH','["Single-source KES 220M","7-month-old company","Director is ward rep","Price 310% above market","No delivery verification plan"]','Nairobi City County Education'),
    ('KE-WAT-2026-0048','Marsabit emergency water trucking 6 months','Marsabit','Water & Sanitation',42000000,'WaterTruck Kenya','2022-08-10','emergency','2025-11-15',55,'MEDIUM','["Emergency justified by drought","Price within range","Short-term")','Marsabit County Government'),
    ('KE-AGR-2026-0049','Meru Tea Factory upgrade and modernisation','Meru','Agriculture',145000000,'Tecalemit Kenya','2012-05-01','open','2025-09-05',22,'LOW','["Established firm","Open tender","Community verified"]','Meru County Government'),
    ('KE-ICT-2026-0050','National government digital identity integration','National','ICT',4200000000,'Idemia Group France','2005-01-01','negotiated','2025-02-01',35,'LOW','["Strategic negotiated contract","Security vetted","Parliament approved","Biometric specialist"]','Ministry of Interior')
    ON CONFLICT (contract_id) DO NOTHING;
  `);

  // ── 10 Ghost Projects ───────────────────────────────────────────────────────
  await client.query(`
    INSERT INTO ghost_projects (contract_ref,project_name,county,sector,gps_coordinates,claimed_status,satellite_status,satellite_date,amount_at_risk,detection_status,confidence_score,procuring_entity,satellite_metadata) VALUES
    ('KE-EDU-2024-0112','Kiambu Secondary School — 8 Classroom Block','Kiambu','Education','-1.1742, 36.8350','8-classroom block built — completion certificate submitted','Bare land detected. No construction activity. Dense vegetation only.','2026-02-15',28000000,'ghost',96,'Kiambu County Government','{"ndvi": 0.72, "built_area_sqm": 0, "vegetation_cover": "high", "change_detection": "no_change_since_2022", "imagery_source": "Sentinel-2"}'),
    ('KE-WAT-2024-0087','Nakuru Water Treatment Plant Expansion','Nakuru','Water & Sanitation','-0.3031, 36.0800','Water treatment plant 100% complete — operational','~15% structural footprint detected. Foundation work visible only. No equipment installed.','2026-01-20',142000000,'partial',89,'Nakuru County Water Services','{"ndvi": 0.15, "built_area_sqm": 450, "expected_sqm": 3200, "completion_pct": 14, "imagery_source": "Sentinel-2"}'),
    ('KE-RDS-2024-0043','Tana River–Garissa Road Rehabilitation 35km','Tana River','Roads & Infrastructure','-0.4569, 39.6440','Road fully rehabilitated — paved surface, drainage complete','Road surface unchanged from 2019 baseline. Potholed murram surface. No tarmac layer.','2026-03-01',285000000,'ghost',94,'Kenya National Highways Authority','{"road_surface": "murram_unchanged", "drainage_structures": 0, "baseline_year": 2019, "comparison": "no_improvement", "imagery_source": "Sentinel-2"}'),
    ('KE-INF-2025-0034','Kisii Central Market Renovation','Kisii','Infrastructure','-0.6817, 34.7667','Market renovation complete — stalls and drainage done','New roof and floor tiling confirmed. Renovation verified — physical inspection aligned.','2026-02-28',12000000,'verified',98,'Kisii County Government','{"built_area_sqm": 2100, "new_structures": "confirmed", "roof_material": "iron_sheet_new", "stalls_count": 180, "imagery_source": "Sentinel-2"}'),
    ('KE-HTH-2025-0067','Marsabit County Dispensary — 3 Units','Marsabit','Health','2.3360, 37.9906','Three dispensary units completed and operational','One unit partially complete (~40%). Two planned units show bare ground only.','2026-01-10',45000000,'partial',88,'Marsabit County Health','{"units_complete": 1, "units_partial": 1, "units_ghost": 2, "built_area_sqm": 280, "imagery_source": "Sentinel-2"}'),
    ('KE-EDU-2025-0198','Turkana North Girls Secondary School','Turkana','Education','3.8501, 35.5991','School construction complete — 12 classes, dormitory, lab','No structures detected. Site shows undisturbed scrubland consistent with pre-2024 baseline.','2026-03-10',98000000,'ghost',97,'Turkana County Education','{"ndvi": 0.55, "built_area_sqm": 0, "scrubland_cover": "high", "baseline_match": "2020", "imagery_source": "Sentinel-2"}'),
    ('KE-RDS-2025-0321','Kakamega Urban Roads Drainage 12 Streets','Kakamega','Roads & Infrastructure','0.2827, 34.7519','Drainage channels complete on all 12 streets','Drainage work confirmed on 4 streets (33%). 8 streets show no construction activity.','2026-02-05',76000000,'partial',85,'Kakamega County Government','{"streets_complete": 4, "streets_ghost": 8, "drainage_length_m": 1800, "expected_m": 6200, "imagery_source": "Sentinel-2"}'),
    ('KE-WAT-2025-0156','Wajir Solar-Powered Water Kiosks 20 Units','Wajir','Water & Sanitation','1.7471, 40.0573','20 solar water kiosks installed and operational','3 kiosks confirmed operational. 17 GPS coordinates show no infrastructure.','2026-01-25',34000000,'partial',92,'Wajir County Water','{"kiosks_confirmed": 3, "kiosks_ghost": 17, "solar_panels_visible": 3, "expected_kiosks": 20, "imagery_source": "Sentinel-2"}'),
    ('KE-AGR-2025-0089','Meru County Greenhouse Farming Structures 50 Units','Meru','Agriculture','-0.0469, 37.6490','50 commercial greenhouse units complete — beneficiaries confirmed','12 greenhouses confirmed by satellite. 38 claimed locations show cultivated land only, no structures.','2026-02-20',62000000,'partial',90,'Meru County Agriculture','{"greenhouses_confirmed": 12, "greenhouses_ghost": 38, "area_sqm_confirmed": 4800, "expected_sqm": 20000, "imagery_source": "Sentinel-2"}'),
    ('KE-INF-2025-0244','Mandera Border Post Upgrading','Mandera','Infrastructure','3.9365, 41.8670','Border post fully upgraded — offices, canopy, parking complete','New canopy structure confirmed. Office block ~60% complete. Perimeter fence and parking not constructed.','2026-03-05',89000000,'partial',87,'Kenya Revenue Authority','{"canopy": "complete", "offices_pct": 60, "perimeter_fence": "absent", "parking": "absent", "imagery_source": "Sentinel-2"}')
    ON CONFLICT DO NOTHING;
  `);

  // ── 10 Sample Reports ───────────────────────────────────────────────────────
  await client.query(`
    INSERT INTO reports (case_number,type,county,sector,description,amount,anonymous,status,ai_credibility_score,routing,keywords) VALUES
    ('KW-2026-1001','Bribery / Kickbacks','Nairobi','Roads & Infrastructure','A procurement officer at KURA demanded KES 2 million from our construction company before our bid document would be registered. This happened on 14 January 2026 at Times Tower 3rd floor office. The officer is Mr. J.K. (initials only for safety). We have a voice recording.',2000000,true,'reviewing',91,'DPP','["bribery","procurement officer","KURA","voice recording","bid registration"]'),
    ('KW-2026-1002','Ghost project / Fake delivery','Kiambu','Education','The 8 classroom blocks at Kiambu Girls Secondary that were supposedly built under contract KE-EDU-2024-0112 do not exist. The school headteacher confirms no construction happened. The contractor collected KES 28M. Parents are distressed.',28000000,true,'escalated',95,'EACC','["ghost project","classroom","Kiambu","contractor","no construction","headteacher confirmed"]'),
    ('KW-2026-1003','Procurement fraud','Nairobi','Health','MedSupply Africa charged KES 485M for hospital equipment at 3x market price. The same equipment is available from verified suppliers at KES 150M. I have market quotes from 4 suppliers. The procurement manager approved without technical evaluation.',485000000,true,'pending',87,'PPRA','["overpricing","medical equipment","KNH","market comparison","technical evaluation skipped"]'),
    ('KW-2026-1004','Embezzlement of public funds','Kisumu','Education','School bursary funds of KES 4.5M allocated to Kisumu West sub-county have not been disbursed to students for the 2025 school year despite government announcement. The sub-county education officer is unresponsive.',4500000,true,'pending',76,'EACC','["bursary","school fees","Kisumu West","non-disbursement","education officer"]'),
    ('KW-2026-1005','Nepotism / Political appointments','Nakuru','ICT','The county governor appointed his cousin as ICT director without competitive recruitment. The cousin has no ICT qualifications — his LinkedIn shows he was a matatu driver until 2024. The position pays KES 350,000 monthly.',350000,false,'pending',68,'EACC','["nepotism","appointment","governor","cousin","no qualifications","ICT director"]'),
    ('KW-2026-1006','Police extortion','Mombasa','Security','Police officers at Mombasa port are demanding KES 5,000-10,000 per truck from transporters clearing goods. This has been ongoing since October 2025. Approximately 50 trucks per day are affected. Officers badge numbers noted.',500000,true,'pending',82,'DPP','["police","extortion","Mombasa port","transporters","badge numbers","daily"]'),
    ('KW-2026-1007','Procurement fraud','Kiambu','ICT','The integrated financial management system awarded to FinSystems Ltd (7 months old company, KES 95M, single source) is a resale of open-source software. The actual software Odoo costs KES 500,000 to license. The county has been defrauded.',94500000,true,'reviewing',93,'DPP','["software","resale","open source","Odoo","single source","county defrauded","FinSystems"]'),
    ('KW-2026-1008','Land grabbing','Nairobi','Infrastructure','A well-connected individual has grabbed 3 acres of public land in Ruiru designated for a public park under the county spatial plan. He has fenced it and begun construction. We have the title deed numbers and photos.',0,true,'pending',72,'EACC','["land grabbing","Ruiru","public park","fencing","construction","title deed"]'),
    ('KW-2026-1009','Bribery / Kickbacks','Turkana','Water & Sanitation','The county water official is taking 20% kickback from all water project contractors. Three contractors have told me this confidentially. The total project value in Turkana this year is KES 145M so approximately KES 29M has been paid in kickbacks.',29000000,true,'pending',79,'EACC','["kickback","water official","Turkana","contractors","20 percent","confirmed by multiple sources"]'),
    ('KW-2026-1010','Other','Meru','Agriculture','I think there might be some issues with the tea factory contract.',0,false,'dismissed',22,'EACC','["vague","no specifics","unverified"]')
    ON CONFLICT (case_number) DO NOTHING;
  `);

  console.log('✅ Kenya seed data loaded — 50 contracts, 10 ghost projects, 10 reports');
};

module.exports = { pool, initDB };
