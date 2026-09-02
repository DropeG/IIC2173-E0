const express = require("express");
const cors = require("cors");
const { initDB, query } = require("./db");

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Helper to format database row into canonical JSON
function formatRow(row) {
  return {
    id: row.id,
    idpk: row.idpk,
    type: row.type,
    packageBody: row.package_body,
    receivedAt: row.received_at,
  };
}

// -------------------------------------------------------------
// Healthcheck Endpoint
// -------------------------------------------------------------
app.get("/health", (req, res) => {
  res.status(200).json({ status: "healthy", timestamp: new Date().toISOString() });
});

app.get("/", (req, res) => {
  res.status(200).json({
    service: "EnergyShark Master API",
    status: "running",
    version: "1.0.0",
  });
});

// -------------------------------------------------------------
// Internal Ingestion Endpoint (called by Connector)
// POST /events
// -------------------------------------------------------------
app.post("/events", async (req, res) => {
  try {
    const { idpk, type, packageBody } = req.body;

    if (!idpk || !packageBody) {
      return res.status(400).json({ error: "Missing required fields: idpk and packageBody" });
    }

    const eventType = type || "demand-set";

    const insertQuery = `
      INSERT INTO demand_events (idpk, type, package_body, received_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (idpk) DO UPDATE SET
        type = EXCLUDED.type,
        package_body = EXCLUDED.package_body
      RETURNING *;
    `;

    const result = await query(insertQuery, [idpk, eventType, JSON.stringify(packageBody)]);
    const saved = formatRow(result.rows[0]);

    return res.status(201).json({
      message: "Event processed and saved successfully",
      data: saved,
    });
  } catch (error) {
    console.error("❌ Error ingesting event:", error);
    return res.status(500).json({ error: "Internal server error saving event" });
  }
});

// -------------------------------------------------------------
// RF1, RF3, RF4: History List with Pagination & Property Filtering
// GET /history?page=1&limit=25&receivedAt=...&city=...
// -------------------------------------------------------------
app.get("/history", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.max(1, parseInt(req.query.limit || "25", 10));
    const offset = (page - 1) * limit;

    const conditions = [];
    const values = [];
    let paramIndex = 1;

    // Filter by idpk
    if (req.query.idpk) {
      conditions.push(`idpk = $${paramIndex++}`);
      values.push(req.query.idpk);
    }

    // Filter by type
    if (req.query.type) {
      conditions.push(`type = $${paramIndex++}`);
      values.push(req.query.type);
    }

    // Filter by receivedAt (allows full timestamp or partial date string like "2026-08-08")
    if (req.query.receivedAt) {
      conditions.push(`CAST(received_at AS TEXT) LIKE $${paramIndex++}`);
      values.push(`%${req.query.receivedAt}%`);
    }

    // Filter by city (searches JSON array inside package_body->demands)
    if (req.query.city) {
      conditions.push(`
        EXISTS (
          SELECT 1 FROM jsonb_array_elements(package_body->'demands') AS elem
          WHERE LOWER(elem->>'city') LIKE LOWER($${paramIndex++})
        )
      `);
      values.push(`%${req.query.city}%`);
    }

    // Filter by validUntil (searches package_body->>validUntil)
    if (req.query.validUntil) {
      conditions.push(`package_body->>'validUntil' LIKE $${paramIndex++}`);
      values.push(`%${req.query.validUntil}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // 1. Get total count
    const countQuery = `SELECT COUNT(*) AS total FROM demand_events ${whereClause};`;
    const countResult = await query(countQuery, values);
    const total = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(total / limit) || 1;

    // 2. Fetch paginated data
    const dataQuery = `
      SELECT * FROM demand_events
      ${whereClause}
      ORDER BY id DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++};
    `;
    const dataValues = [...values, limit, offset];
    const dataResult = await query(dataQuery, dataValues);

    const formattedData = dataResult.rows.map(formatRow);

    // Set standard pagination headers
    res.setHeader("X-Total-Count", total);
    res.setHeader("X-Page", page);
    res.setHeader("X-Limit", limit);
    res.setHeader("X-Total-Pages", totalPages);

    return res.status(200).json({
      page,
      limit,
      total,
      totalPages,
      data: formattedData,
    });
  } catch (error) {
    console.error("❌ Error fetching history:", error);
    return res.status(500).json({ error: "Internal server error fetching history" });
  }
});

// -------------------------------------------------------------
// RF2: Individual History Detail
// GET /history/:id
// -------------------------------------------------------------
app.get("/history/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query("SELECT * FROM demand_events WHERE id = $1 LIMIT 1;", [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: `Record with id ${id} not found` });
    }

    return res.status(200).json(formatRow(result.rows[0]));
  } catch (error) {
    console.error("❌ Error fetching history detail:", error);
    return res.status(500).json({ error: "Internal server error fetching record" });
  }
});

// Start server only when executed directly (node src/index.js)
if (require.main === module) {
  initDB().then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Master API server running on port ${PORT}`);
    });
  });
}

module.exports = app;
