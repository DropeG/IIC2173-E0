const { Pool } = require("pg");
require("dotenv").config();

let useMock = process.env.USE_MOCK_DB === "true";
let mockStore = [];
let nextId = 1;

let pool = null;

if (!useMock) {
  pool = new Pool({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432", 10),
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    database: process.env.DB_NAME || "energyshark",
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  pool.on("error", (err) => {
    console.warn("⚠️ Postgres connection pool error:", err.message);
  });
}

async function initDB() {
  if (useMock) {
    console.log("ℹ️ Using in-memory mock database for local testing.");
    return;
  }

  const queryStr = `
    CREATE TABLE IF NOT EXISTS demand_events (
      id SERIAL PRIMARY KEY,
      idpk VARCHAR(128) UNIQUE NOT NULL,
      type VARCHAR(64) NOT NULL DEFAULT 'demand-set',
      package_body JSONB NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_demand_events_received_at ON demand_events(received_at);
    CREATE INDEX IF NOT EXISTS idx_demand_events_idpk ON demand_events(idpk);
    CREATE INDEX IF NOT EXISTS idx_demand_events_type ON demand_events(type);
  `;
  
  try {
    await pool.query(queryStr);
    console.log("✅ Database initialized successfully: table demand_events ready.");
  } catch (error) {
    console.warn("⚠️ Postgres not reachable (" + error.message + "). Falling back to in-memory mock DB for testing.");
    useMock = true;
  }
}

async function query(text, params = []) {
  if (!useMock && pool) {
    try {
      return await pool.query(text, params);
    } catch (err) {
      if (err.code === "ECONNREFUSED" || err.message.includes("connect")) {
        console.warn("⚠️ Postgres query failed, falling back to mock DB.");
        useMock = true;
      } else {
        throw err;
      }
    }
  }

  // In-Memory Mock Database Engine for local verification without running Postgres
  const lower = text.toLowerCase();

  // 1. INSERT query
  if (lower.includes("insert into demand_events")) {
    const idpk = params[0];
    const type = params[1] || "demand-set";
    const packageBody = typeof params[2] === "string" ? JSON.parse(params[2]) : params[2];
    const receivedAt = new Date().toISOString();

    const existingIdx = mockStore.findIndex((r) => r.idpk === idpk);
    let row;
    if (existingIdx >= 0) {
      mockStore[existingIdx].type = type;
      mockStore[existingIdx].package_body = packageBody;
      row = mockStore[existingIdx];
    } else {
      row = {
        id: nextId++,
        idpk,
        type,
        package_body: packageBody,
        received_at: receivedAt,
      };
      mockStore.push(row);
    }
    return { rows: [row] };
  }

  // 2. Single ID query
  if (lower.includes("where id = $1")) {
    const id = parseInt(params[0], 10);
    const row = mockStore.find((r) => r.id === id);
    return { rows: row ? [row] : [] };
  }

  // 3. Count query
  if (lower.includes("count(*)")) {
    // Filter matching
    let filtered = [...mockStore];
    // Check receivedAt filter
    const recParam = params.find((p) => typeof p === "string" && p.startsWith("%") && p.includes("-"));
    if (recParam) {
      const clean = recParam.replace(/%/g, "");
      filtered = filtered.filter((r) => String(r.received_at).includes(clean));
    }
    // Check city filter
    const cityParam = params.find((p) => typeof p === "string" && p.startsWith("%") && !p.includes("-"));
    if (cityParam) {
      const clean = cityParam.replace(/%/g, "").toLowerCase();
      filtered = filtered.filter((r) =>
        r.package_body?.demands?.some((d) => (d.city || "").toLowerCase().includes(clean))
      );
    }
    return { rows: [{ total: filtered.length }] };
  }

  // 4. Select list with pagination and ordering
  let list = [...mockStore].sort((a, b) => b.id - a.id);
  // Apply filters
  const recParam = params.find((p) => typeof p === "string" && p.startsWith("%") && p.includes("-"));
  if (recParam) {
    const clean = recParam.replace(/%/g, "");
    list = list.filter((r) => String(r.received_at).includes(clean));
  }
  const cityParam = params.find((p) => typeof p === "string" && p.startsWith("%") && !p.includes("-"));
  if (cityParam) {
    const clean = cityParam.replace(/%/g, "").toLowerCase();
    list = list.filter((r) =>
      r.package_body?.demands?.some((d) => (d.city || "").toLowerCase().includes(clean))
    );
  }

  const limit = params[params.length - 2] || 25;
  const offset = params[params.length - 1] || 0;
  const paginated = list.slice(offset, offset + limit);

  return { rows: paginated };
}

module.exports = {
  pool,
  initDB,
  query,
  getMockStore: () => mockStore,
  resetMockStore: () => { mockStore = []; nextId = 1; },
};
