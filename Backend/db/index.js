'use strict';

const { Pool } = require('pg');
const { generateContracts, GHOST_SCENARIOS, SAMPLE_REPORTS } = require('../utils/dataGenerator');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10
});

// ── Schema ────────────────────────────────────────────────────────────────────
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS contracts (
    id          SERIAL PRIMARY KEY,
    contract_id VARCHAR(60) UNIQUE NOT NULL,
    description TEXT,
    county      VARCHAR(100),
    sector      VARCHAR(100),
    value       BIGINT DEFAULT 0,
    supplier    VARCHAR(200),
    risk_score  INTEGER DEFAULT 0,
    risk_level  VARCHAR(10) DEFAULT 'LOW',
    flags       JSONB DEFAULT '[]',
    created_at  TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS reports (
    id                   SERIAL PRIMARY KEY,
    case_number          VARCHAR(20) UNIQUE NOT NULL,
    type                 VARCHAR(100) NOT NULL,
    county               VARCHAR(100),
    sector               VARCHAR(100),
    description          TEXT NOT NULL,
    amount               BIGINT,
    anonymous            BOOLEAN DEFAULT true,
    status               VARCHAR(30) DEFAULT 'pending',
    ai_credibility_score INTEGER DEFAULT 50,
    created_at           TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS ghost_projects (
    id               SERIAL PRIMARY KEY,
    contract_ref     VARCHAR(60),
    project_name     VARCHAR(300) NOT NULL,
    county           VARCHAR(100),
    claimed_status   VARCHAR(300),
    satellite_status VARCHAR(300),
    amount_at_risk   BIGINT DEFAULT 0,
    detection_status VARCHAR(20) DEFAULT 'flagged',
    created_at       TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS chat_logs (
    id         SERIAL PRIMARY KEY,
    session_id VARCHAR(100),
    role       VARCHAR(20),
    content    TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
`;

// ── Indexes ───────────────────────────────────────────────────────────────────
const INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_contracts_risk_level ON contracts (risk_level);
  CREATE INDEX IF NOT EXISTS idx_contracts_county     ON contracts (county);
  CREATE INDEX IF NOT EXISTS idx_contracts_risk_score ON contracts (risk_score DESC);
  CREATE INDEX IF NOT EXISTS idx_contracts_supplier   ON contracts (supplier);
  CREATE INDEX IF NOT EXISTS idx_contracts_created_at ON contracts (created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_reports_status       ON reports (status);
  CREATE INDEX IF NOT EXISTS idx_reports_county       ON reports (county);
  CREATE INDEX IF NOT EXISTS idx_reports_type         ON reports (type);
  CREATE INDEX IF NOT EXISTS idx_reports_created_at   ON reports (created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_reports_credibility  ON reports (ai_credibility_score DESC);

  CREATE INDEX IF NOT EXISTS idx_ghost_status         ON ghost_projects (detection_status);
  CREATE INDEX IF NOT EXISTS idx_ghost_county         ON ghost_projects (county);
  CREATE INDEX IF NOT EXISTS idx_ghost_amount         ON ghost_projects (amount_at_risk DESC);

  CREATE INDEX IF NOT EXISTS idx_chat_session         ON chat_logs (session_id, created_at DESC);
`;

// ── Init ──────────────────────────────────────────────────────────────────────
const initDB = async () => {
  let retries = 10;
  while (retries > 0) {
    try {
      const client = await pool.connect();
      console.log('✅ PostgreSQL connected');

      await client.query(SCHEMA_SQL);
      console.log('✅ Tables ready');

      await client.query(INDEX_SQL);
      console.log('✅ Indexes ready');

      // Add sector column if missing (migration for existing DBs)
      await client.query(
        'ALTER TABLE contracts ADD COLUMN IF NOT EXISTS sector VARCHAR(100)'
      ).catch(() => {});
      await client.query(
        'ALTER TABLE ghost_projects ALTER COLUMN claimed_status TYPE VARCHAR(300)'
      ).catch(() => {});
      await client.query(
        'ALTER TABLE ghost_projects ALTER COLUMN satellite_status TYPE VARCHAR(300)'
      ).catch(() => {});
      await client.query(
        'ALTER TABLE ghost_projects ALTER COLUMN project_name TYPE VARCHAR(300)'
      ).catch(() => {});

      // Seed if empty
      const { rowCount } = await client.query('SELECT 1 FROM contracts LIMIT 1');
      if (!rowCount) {
        await seedData(client);
      } else {
        console.log('✅ Data already present — skipping seed');
      }

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

// ── Seed data ─────────────────────────────────────────────────────────────────
const seedData = async (client) => {
  console.log('🌱 Seeding comprehensive Kenya procurement data...');

  // Contracts
  const contracts = generateContracts();
  for (const c of contracts) {
    await client.query(
      `INSERT INTO contracts
         (contract_id, description, county, sector, value, supplier, risk_score, risk_level, flags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (contract_id) DO NOTHING`,
      [c.contract_id, c.description, c.county, c.sector || null,
       c.value, c.supplier, c.risk_score, c.risk_level, c.flags]
    );
  }
  console.log(`✅ Seeded ${contracts.length} contracts`);

  // Ghost projects
  for (const g of GHOST_SCENARIOS) {
    await client.query(
      `INSERT INTO ghost_projects
         (contract_ref, project_name, county, claimed_status, satellite_status, amount_at_risk, detection_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT DO NOTHING`,
      [g.contract_ref, g.project_name, g.county, g.claimed_status,
       g.satellite_status, g.amount_at_risk, g.detection_status]
    );
  }
  console.log(`✅ Seeded ${GHOST_SCENARIOS.length} ghost projects`);

  // Reports
  for (let i = 0; i < SAMPLE_REPORTS.length; i++) {
    const r = SAMPLE_REPORTS[i];
    const year = new Date().getFullYear();
    const case_number = `KW-${year}-${1000 + i}`;
    await client.query(
      `INSERT INTO reports
         (case_number, type, county, sector, description, amount, anonymous, status, ai_credibility_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (case_number) DO NOTHING`,
      [case_number, r.type, r.county, r.sector, r.description,
       r.amount || null, r.anonymous, r.status, r.ai_credibility_score]
    );
  }
  console.log(`✅ Seeded ${SAMPLE_REPORTS.length} reports`);

  console.log('🎉 Database seeding complete — Kenya procurement data ready');
};

// ── Helper: run query in a transaction ───────────────────────────────────────
const withTransaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

// ── Helper: paginated query ───────────────────────────────────────────────────
const queryPaginated = async (sql, values, page = 1, limit = 50) => {
  const p = Math.max(1, parseInt(page));
  const l = Math.min(200, Math.max(1, parseInt(limit)));
  const offset = (p - 1) * l;
  const { rows } = await pool.query(
    `${sql} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, l, offset]
  );
  return { rows, page: p, limit: l, offset };
};

module.exports = { pool, initDB, withTransaction, queryPaginated };
