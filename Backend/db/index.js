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

      await client.query(`
        CREATE TABLE IF NOT EXISTS contracts (
          id SERIAL PRIMARY KEY,
          contract_id VARCHAR(60) UNIQUE NOT NULL,
          description TEXT,
          county VARCHAR(100),
          value BIGINT DEFAULT 0,
          supplier VARCHAR(200),
          risk_score INTEGER DEFAULT 0,
          risk_level VARCHAR(10) DEFAULT 'LOW',
          flags JSONB DEFAULT '[]',
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS reports (
          id SERIAL PRIMARY KEY,
          case_number VARCHAR(20) UNIQUE NOT NULL,
          type VARCHAR(100) NOT NULL,
          county VARCHAR(100),
          sector VARCHAR(100),
          description TEXT NOT NULL,
          amount BIGINT,
          anonymous BOOLEAN DEFAULT true,
          status VARCHAR(30) DEFAULT 'pending',
          ai_credibility_score INTEGER DEFAULT 50,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS ghost_projects (
          id SERIAL PRIMARY KEY,
          contract_ref VARCHAR(60),
          project_name VARCHAR(200) NOT NULL,
          county VARCHAR(100),
          claimed_status VARCHAR(100),
          satellite_status VARCHAR(100),
          amount_at_risk BIGINT DEFAULT 0,
          detection_status VARCHAR(20) DEFAULT 'flagged',
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS chat_logs (
          id SERIAL PRIMARY KEY,
          session_id VARCHAR(100),
          role VARCHAR(20),
          content TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      console.log('✅ Tables ready');

      const { rowCount } = await client.query('SELECT 1 FROM contracts LIMIT 1');
      if (!rowCount) await seedData(client);

      client.release();
      return;
    } catch (err) {
      retries--;
      console.error(`DB connect failed (${retries} retries left): ${err.message}`);
      if (retries === 0) throw err;
      await new Promise(r => setTimeout(r, 3000));
    }
  }
};

const seedData = async (client) => {
  await client.query(`
    INSERT INTO contracts (contract_id,description,county,value,supplier,risk_score,risk_level,flags) VALUES
    ('KE-PRO-2026-0341','Road rehabilitation Ring Road','Nairobi',450000000,'Nexus Build Ltd',94,'HIGH','["No track record","Single bid","Price 220% above market","Director linked to officials"]'),
    ('KE-PRO-2026-0298','School equipment 140 schools','Kiambu',220000000,'EduSupply Co.',88,'HIGH','["Price 340% above market","Connected official"]'),
    ('KE-PRO-2026-0271','Medical supplies County Hospital','Mombasa',95500000,'MedKe Distributors',79,'HIGH','["Fake company registration"]'),
    ('KE-PRO-2026-0244','Water supply infrastructure','Nakuru',180000000,'AquaTech Kenya',61,'MEDIUM','["Late filing"]'),
    ('KE-PRO-2026-0201','County ICT infrastructure upgrade','Kisii',43000000,'Daggy Techs Ltd',18,'LOW','["Clean — no flags"]')
    ON CONFLICT DO NOTHING;
  `);
  await client.query(`
    INSERT INTO ghost_projects (contract_ref,project_name,county,claimed_status,satellite_status,amount_at_risk,detection_status) VALUES
    ('KE-EDU-2024-0112','Kiambu Secondary School Block','Kiambu','8-classroom block built','Bare land — no structure',28000000,'ghost'),
    ('KE-WAT-2024-0087','Nakuru Water Treatment Plant','Nakuru','100% complete','~15% structure visible',142000000,'partial'),
    ('KE-INF-2025-0034','Kisii Market Renovation','Kisii','Renovation complete','New structure confirmed',12000000,'verified')
    ON CONFLICT DO NOTHING;
  `);
  console.log('✅ Demo data seeded');
};

module.exports = { pool, initDB };
