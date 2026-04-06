const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  max: 10
});

const initDB = async () => {
  let retries = 10;
  while (retries > 0) {
    try {
      const client = await pool.connect();
      console.log('✅ PostgreSQL connected');
      await createTables(client);
      await runMigrations(client);
      const { rows } = await client.query('SELECT COUNT(*) as count FROM contracts');
      const count = parseInt(rows[0].count);
      if (count === 0) {
        await seedAll(client);
      } else {
        console.log('✅ Data already present — skipping seed');
      }
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

const createTables = async (client) => {
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
      bid_type VARCHAR(50) DEFAULT 'open',
      awarded_date DATE,
      risk_score INTEGER DEFAULT 0,
      risk_level VARCHAR(10) DEFAULT 'LOW',
      flags JSONB DEFAULT '[]',
      status VARCHAR(30) DEFAULT 'active',
      procuring_entity VARCHAR(250),
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
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS ghost_projects (
      id SERIAL PRIMARY KEY,
      contract_ref VARCHAR(80),
      project_name VARCHAR(250) NOT NULL,
      county VARCHAR(100),
      sector VARCHAR(100),
      claimed_status VARCHAR(150),
      satellite_status VARCHAR(150),
      amount_at_risk BIGINT DEFAULT 0,
      detection_status VARCHAR(20) DEFAULT 'flagged',
      confidence_score INTEGER DEFAULT 0,
      satellite_metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS chat_logs (
      id SERIAL PRIMARY KEY,
      session_id VARCHAR(120),
      role VARCHAR(20),
      content TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_contracts_risk ON contracts(risk_level, risk_score DESC);
    CREATE INDEX IF NOT EXISTS idx_contracts_county ON contracts(county);
    CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
    CREATE INDEX IF NOT EXISTS idx_ghost_status ON ghost_projects(detection_status);
  `);
  console.log('✅ Tables ready');
};

// Safely add columns that may be missing from old deployments
const runMigrations = async (client) => {
  const cols = [
    ['reports',       'routing',          "VARCHAR(20) DEFAULT 'EACC'"],
    ['reports',       'sector',           'VARCHAR(100)'],
    ['reports',       'keywords',         "JSONB DEFAULT '[]'"],
    ['reports',       'updated_at',       'TIMESTAMPTZ DEFAULT NOW()'],
    ['ghost_projects','sector',           'VARCHAR(100)'],
    ['ghost_projects','satellite_metadata',"JSONB DEFAULT '{}'"],
    ['contracts',     'procuring_entity', 'VARCHAR(250)'],
    ['contracts',     'updated_at',       'TIMESTAMPTZ DEFAULT NOW()'],
  ];
  for (const [tbl, col, def] of cols) {
    try {
      await client.query(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS ${col} ${def}`);
    } catch (e) {
      if (!e.message.includes('already exists')) console.warn('Migration warn:', e.message);
    }
  }
  console.log('✅ Migrations done');
};

const seedAll = async (client) => {
  await client.query(`
    INSERT INTO contracts (contract_id,description,county,sector,value,supplier,supplier_reg_date,bid_type,awarded_date,risk_score,risk_level,flags,procuring_entity) VALUES
    ('KE-RDS-2026-0001','Rehabilitation of Mombasa Road Nairobi section 14km','Nairobi','Roads',2850000000,'Nexus Construction Ltd','2023-01-15','single_source','2025-11-10',94,'HIGH','["Single-source award KES 2.85B","Company 2 years old at award","Director linked to 2 county officials","Price 280% above market benchmark"]','Kenya National Highways Authority'),
    ('KE-HTH-2026-0002','Supply of medical equipment Kenyatta National Hospital','Nairobi','Health',485000000,'MedSupply Africa Ltd','2022-06-20','restricted','2025-10-05',88,'HIGH','["Price 320% above benchmark","Shell company indicators","Address matches 3 flagged firms"]','Ministry of Health'),
    ('KE-EDU-2026-0003','Construction of 200 classrooms Kisii County','Kisii','Education',360000000,'Buildcon Kenya','2018-04-10','open','2025-09-15',12,'LOW','["Clean verified track record","Open competitive bid","Community oversight active"]','Kisii County Government'),
    ('KE-WAT-2026-0004','Nairobi Water Sewerage expansion phase 3','Nairobi','Water',1200000000,'AquaInfra Kenya','2020-03-22','open','2025-08-20',55,'MEDIUM','["Director has undisclosed government interest","Price 45% above market"]','Nairobi City Water'),
    ('KE-AGR-2026-0005','Supply of fertiliser to 47 counties','National','Agriculture',3200000000,'AgriChem Solutions','2024-09-01','single_source','2026-01-05',97,'HIGH','["Single-source KES 3.2B","Company 4 months old at award","No distribution infrastructure","Director is spouse of procurement officer"]','National Cereals Board'),
    ('KE-ICT-2026-0006','County ICT infrastructure upgrade Kisii','Kisii','ICT',43000000,'Daggy Techs Ltd','2018-04-10','open','2025-12-01',18,'LOW','["Clean track record","3 prior successful contracts","Competitive bid"]','Kisii County Government'),
    ('KE-RDS-2026-0007','Meru-Nkubu road rehabilitation 23km','Meru','Roads',540000000,'Strabag East Africa','2015-06-01','open','2025-07-15',22,'LOW','["Clean international contractor","Competitive bid process"]','Kenya National Highways Authority'),
    ('KE-HTH-2026-0008','Construction Kakamega County Referral Hospital phase 2','Kakamega','Health',870000000,'Ramco Builders','2019-01-10','open','2025-06-20',35,'LOW','["Minor extension granted","Within budget"]','Kakamega County Government'),
    ('KE-EDU-2026-0009','Supply of laptops to 800 primary schools Kiambu','Kiambu','Education',680000000,'TechSource Kenya','2023-11-20','restricted','2026-01-10',85,'HIGH','["Price 290% above market","Recently registered","Connected to county official"]','Kiambu County Education'),
    ('KE-WAT-2026-0010','Nakuru water treatment plant expansion','Nakuru','Water',320000000,'WaterTech Solutions','2021-05-15','open','2025-09-01',45,'MEDIUM','["Payment released before completion","Minor documentation gaps"]','Nakuru County Water'),
    ('KE-RDS-2026-0011','Kisumu-Kakamega highway dualling 18km','Kisumu','Roads',1850000000,'China Road Bridge Corp','2005-01-01','open','2025-04-10',20,'LOW','["International contractor clean","Competitive process"]','Kenya National Highways Authority'),
    ('KE-HTH-2026-0012','Supply of ARV drugs Coast General Hospital','Mombasa','Health',95000000,'PharmKenya Ltd','2024-02-28','single_source','2025-11-20',79,'HIGH','["Single-source pharmaceutical","Price 210% above KEMSA rate","No storage verification"]','Coast General Hospital'),
    ('KE-AGR-2026-0013','Irrigation project Tana River smallholder farmers','Tana River','Agriculture',280000000,'IrriTech Africa','2017-08-15','open','2025-05-30',38,'LOW','["Slight delay","On budget","Community verified"]','Tana River County'),
    ('KE-ICT-2026-0014','CCTV surveillance system Mombasa City','Mombasa','Security',420000000,'SafeCity Systems','2023-04-12','restricted','2025-10-15',72,'MEDIUM','["Restricted bidding KES 420M unusual","Director has police connections"]','Mombasa County'),
    ('KE-EDU-2026-0015','Kisumu Technical Training Institute construction','Kisumu','Education',195000000,'Buildcon Kenya','2016-03-20','open','2025-07-01',22,'LOW','["Clean process","Community oversight active"]','TVETA'),
    ('KE-HTH-2026-0016','Supply malaria nets 2M units 10 counties','National','Health',180000000,'NetPro Supplies','2024-07-15','single_source','2025-12-10',91,'HIGH','["Company 5 months old","Single-source KES 180M","No logistics infrastructure"]','Ministry of Health'),
    ('KE-RDS-2026-0017','Thika Superhighway maintenance year 3','Kiambu','Roads',380000000,'Raubex Kenya','2012-01-01','open','2025-08-01',15,'LOW','["Established contractor","Competitive renewal","Clean"]','Kenya National Highways Authority'),
    ('KE-WAT-2026-0018','Turkana water supply emergency works','Turkana','Water',145000000,'EmerWater Solutions','2023-09-10','emergency','2025-11-05',58,'MEDIUM','["Emergency justified by drought","Price slightly above benchmark"]','Turkana County Water'),
    ('KE-AGR-2026-0019','Strategic grain reserve maize 500000 bags','National','Agriculture',2100000000,'GrainMaster Kenya','2022-01-01','open','2025-06-15',42,'MEDIUM','["Quality dispute raised","Partial delivery confirmed"]','National Cereals Board'),
    ('KE-ICT-2026-0020','National ID digitisation system upgrade','National','ICT',3500000000,'IBM East Africa','2000-01-01','negotiated','2025-03-01',30,'LOW','["Established vendor","Negotiated proprietary system","Security vetted"]','National Registration Bureau')
    ON CONFLICT (contract_id) DO NOTHING;
  `);
  await client.query(`
    INSERT INTO ghost_projects (contract_ref,project_name,county,sector,claimed_status,satellite_status,amount_at_risk,detection_status,confidence_score,satellite_metadata) VALUES
    ('KE-EDU-2024-0112','Kiambu Secondary School 8 Classroom Block','Kiambu','Education','8-classroom block built — completion certificate submitted','Bare land detected. No construction. Dense vegetation only.',28000000,'ghost',96,'{"ndvi":0.72,"built_area_sqm":0,"imagery_source":"Sentinel-2"}'),
    ('KE-WAT-2024-0087','Nakuru Water Treatment Plant Expansion','Nakuru','Water','Water treatment plant 100% complete — operational','~15% structural footprint detected. Foundation only. No equipment.',142000000,'partial',89,'{"built_area_sqm":450,"expected_sqm":3200,"completion_pct":14,"imagery_source":"Sentinel-2"}'),
    ('KE-RDS-2024-0043','Tana River Garissa Road Rehabilitation 35km','Tana River','Roads','Road fully rehabilitated — paved surface, drainage complete','Road surface unchanged from 2019. Potholed murram. No tarmac.',285000000,'ghost',94,'{"road_surface":"murram_unchanged","imagery_source":"Sentinel-2"}'),
    ('KE-INF-2025-0034','Kisii Central Market Renovation','Kisii','Infrastructure','Market renovation complete — stalls and drainage done','New roof and floor tiling confirmed. Renovation verified.',12000000,'verified',98,'{"built_area_sqm":2100,"imagery_source":"Sentinel-2"}'),
    ('KE-HTH-2025-0067','Marsabit County Dispensary 3 Units','Marsabit','Health','Three dispensary units completed and operational','One unit partially complete. Two sites show bare ground.',45000000,'partial',88,'{"units_complete":1,"units_ghost":2,"imagery_source":"Sentinel-2"}'),
    ('KE-EDU-2025-0198','Turkana North Girls Secondary School','Turkana','Education','School complete — 12 classes, dormitory, lab','No structures detected. Undisturbed scrubland.',98000000,'ghost',97,'{"built_area_sqm":0,"imagery_source":"Sentinel-2"}'),
    ('KE-RDS-2025-0321','Kakamega Urban Roads Drainage 12 Streets','Kakamega','Roads','Drainage complete on all 12 streets','Drainage confirmed on 4 streets. 8 streets show no activity.',76000000,'partial',85,'{"streets_complete":4,"streets_ghost":8,"imagery_source":"Sentinel-2"}'),
    ('KE-WAT-2025-0156','Wajir Solar Water Kiosks 20 Units','Wajir','Water','20 solar water kiosks installed and operational','3 kiosks confirmed. 17 GPS coords show no infrastructure.',34000000,'partial',92,'{"kiosks_confirmed":3,"kiosks_ghost":17,"imagery_source":"Sentinel-2"}'),
    ('KE-AGR-2025-0089','Meru County Greenhouse Structures 50 Units','Meru','Agriculture','50 commercial greenhouse units complete','12 greenhouses confirmed. 38 sites show cultivated land only.',62000000,'partial',90,'{"greenhouses_confirmed":12,"greenhouses_ghost":38,"imagery_source":"Sentinel-2"}'),
    ('KE-INF-2025-0244','Mandera Border Post Upgrading','Mandera','Infrastructure','Border post fully upgraded — offices, canopy, parking','Canopy confirmed. Offices ~60% complete. Fence and parking absent.',89000000,'partial',87,'{"canopy":"complete","offices_pct":60,"imagery_source":"Sentinel-2"}')
    ON CONFLICT DO NOTHING;
  `);
  await client.query(`
    INSERT INTO reports (case_number,type,county,sector,description,amount,anonymous,status,ai_credibility_score,routing,keywords) VALUES
    ('KW-2026-1001','Bribery / Kickbacks','Nairobi','Roads','Procurement officer at KURA demanded KES 2M from our company before registering our bid. Happened 14 January 2026 at Times Tower 3rd floor. We have a voice recording.',2000000,true,'reviewing',91,'DPP','["bribery","KURA","voice recording"]'),
    ('KW-2026-1002','Ghost project / Fake delivery','Kiambu','Education','8 classroom blocks at Kiambu Girls Secondary do not exist. Headteacher confirms no construction. Contractor collected KES 28M.',28000000,true,'escalated',95,'EACC','["ghost project","classroom","Kiambu"]'),
    ('KW-2026-1003','Procurement fraud','Nairobi','Health','MedSupply Africa charged KES 485M for hospital equipment at 3x market price. I have market quotes from 4 suppliers.',485000000,true,'pending',87,'PPRA','["overpricing","medical equipment"]'),
    ('KW-2026-1004','Embezzlement of public funds','Kisumu','Education','School bursary KES 4.5M for Kisumu West sub-county not disbursed to students.',4500000,true,'pending',76,'EACC','["bursary","non-disbursement"]'),
    ('KW-2026-1005','Bribery / Kickbacks','Turkana','Water','County water official taking 20% kickback from all contractors. Three contractors confirmed independently.',29000000,true,'pending',79,'EACC','["kickback","water official","multiple sources"]'),
    ('KW-2026-1006','Ghost project / Fake delivery','Turkana','Education','Turkana North Girls Secondary School does not exist despite KES 98M paid. Empty scrubland at GPS coordinates.',98000000,true,'pending',94,'EACC','["ghost school","Turkana","GPS verified"]')
    ON CONFLICT (case_number) DO NOTHING;
  `);
  console.log('✅ Seed data loaded');
};

module.exports = { pool, initDB };
