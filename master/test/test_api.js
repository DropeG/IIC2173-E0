const assert = require("assert");
const app = require("../src/index");
const { initDB, resetMockStore } = require("../src/db");

async function runTests() {
  process.env.USE_MOCK_DB = "true";
  process.env.NODE_ENV = "test";
  await initDB();
  resetMockStore();

  const server = app.listen(3001);
  const baseUrl = "http://localhost:3001";

  console.log("🧪 Starting Automated Verification Suite for Master API...\n");

  try {
    // -------------------------------------------------------------
    // Test 1: Healthcheck
    // -------------------------------------------------------------
    console.log("1️⃣ Testing GET /health ...");
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.strictEqual(healthRes.status, 200);
    const healthData = await healthRes.json();
    assert.strictEqual(healthData.status, "healthy");
    console.log("   ✅ GET /health is working perfectly.\n");

    // -------------------------------------------------------------
    // Test 2: Ingest Event (POST /events)
    // -------------------------------------------------------------
    console.log("2️⃣ Testing POST /events (Event Ingestion) ...");
    const sampleEvent = {
      idpk: "test-uuid-001",
      type: "demand-set",
      packageBody: {
        demands: [
          { city: "Santiago", demand: 1500.5, unit: "GW" },
          { city: "Valparaíso", demand: 820.0, unit: "GW" },
        ],
        validUntil: "2026-12-31T23:59:59Z",
        metaContent: "Test payload",
        constraints: {},
      },
    };

    const postRes = await fetch(`${baseUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sampleEvent),
    });
    assert.strictEqual(postRes.status, 201);
    const postData = await postRes.json();
    assert.strictEqual(postData.data.idpk, "test-uuid-001");
    assert.strictEqual(postData.data.id, 1);
    assert.ok(postData.data.receivedAt);
    console.log("   ✅ Event successfully ingested with ID: 1 and receivedAt timestamp.\n");

    // -------------------------------------------------------------
    // Test 3: RF2 - Detail endpoint GET /history/:id
    // -------------------------------------------------------------
    console.log("3️⃣ Testing RF2: GET /history/1 (Individual Detail) ...");
    const detailRes = await fetch(`${baseUrl}/history/1`);
    assert.strictEqual(detailRes.status, 200);
    const detailData = await detailRes.json();
    assert.strictEqual(detailData.id, 1);
    assert.strictEqual(detailData.idpk, "test-uuid-001");
    assert.strictEqual(detailData.packageBody.demands[0].city, "Santiago");
    console.log("   ✅ RF2 detail endpoint returned exact requested record.\n");

    // -------------------------------------------------------------
    // Test 4: RF1 & RF3 - Ingest 30 events and test Pagination (page=1 & limit=25)
    // -------------------------------------------------------------
    console.log("4️⃣ Testing RF1 & RF3: Ingesting 30 events and verifying pagination ...");
    for (let i = 2; i <= 30; i++) {
      await fetch(`${baseUrl}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idpk: `test-uuid-${String(i).padStart(3, "0")}`,
          type: "demand-set",
          packageBody: {
            demands: [{ city: i % 2 === 0 ? "Concepción" : "Santiago", demand: 100 * i, unit: "GW" }],
            validUntil: "2026-12-31T23:59:59Z",
          },
        }),
      });
    }

    // Page 1 (limit 25)
    const page1Res = await fetch(`${baseUrl}/history?page=1&limit=25`);
    assert.strictEqual(page1Res.status, 200);
    const page1Data = await page1Res.json();
    assert.strictEqual(page1Data.page, 1);
    assert.strictEqual(page1Data.limit, 25);
    assert.strictEqual(page1Data.total, 30);
    assert.strictEqual(page1Data.totalPages, 2);
    assert.strictEqual(page1Data.data.length, 25);
    console.log("   ✅ Page 1 returned exactly 25 items (total: 30, totalPages: 2).");

    // Page 2 (limit 25 -> remaining 5)
    const page2Res = await fetch(`${baseUrl}/history?page=2&limit=25`);
    const page2Data = await page2Res.json();
    assert.strictEqual(page2Data.page, 2);
    assert.strictEqual(page2Data.data.length, 5);
    console.log("   ✅ Page 2 returned exactly remaining 5 items.\n");

    // -------------------------------------------------------------
    // Test 5: RF4 - Filtering by properties (city, receivedAt)
    // -------------------------------------------------------------
    console.log("5️⃣ Testing RF4: Property Filtering (city=Concepcion) ...");
    const filterRes = await fetch(`${baseUrl}/history?city=Concepc`);
    assert.strictEqual(filterRes.status, 200);
    const filterData = await filterRes.json();
    assert.ok(filterData.total > 0);
    assert.ok(filterData.data.every((item) => 
      item.packageBody.demands.some((d) => d.city.includes("Concepción"))
    ));
    console.log(`   ✅ Filtered by city correctly: found ${filterData.total} matching items.\n`);

    console.log("==========================================================");
    console.log("🎉 ALL API TESTS PASSED 100% SUCCESSFUL!");
    console.log("==========================================================");
  } catch (err) {
    console.error("❌ Test Failed:", err);
    process.exitCode = 1;
  } finally {
    server.close(() => {
      process.exit(process.exitCode || 0);
    });
  }
}

runTests();
