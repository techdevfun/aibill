import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as path from "path";
import { repoRoot } from "./helpers";
import { loadPricingFile, PRICING, PRICING_CHECK_DATE, usdFor } from "../src/pricing";

// Fixtures live in tests/fixtures/ (committed): deterministic, no temp files.
const FX = path.join(repoRoot(), "tests", "fixtures");

describe("usdFor", () => {
  it("prices 1M in + 1M out of claude-sonnet-4-5 at $18", () => {
    const r = usdFor("claude-sonnet-4-5", 1_000_000, 1_000_000);
    assert.equal(r.known, true);
    assert.equal(r.usd, 18);
  });
  it("returns known:false and $0 for unknown models", () => {
    const r = usdFor("nope-1", 5000, 5000);
    assert.equal(r.known, false);
    assert.equal(r.usd, 0);
  });
});

describe("loadPricingFile", () => {
  it("loads a valid table and uses it for pricing", () => {
    const table = loadPricingFile(path.join(FX, "pricing-valid.json"));
    assert.equal(usdFor("my-model", 1_000_000, 0, table).usd, 10);
    assert.equal(PRICING["my-model"], undefined); // user table does not leak into defaults
  });

  it("rejects invalid JSON", () => {
    assert.throws(
      () => loadPricingFile(path.join(FX, "pricing-bad-json.txt")),
      /cannot read pricing file/,
    );
  });

  it("rejects a non-object root", () => {
    assert.throws(
      () => loadPricingFile(path.join(FX, "pricing-array.json")),
      /non-empty JSON object/,
    );
  });

  it("rejects an empty object", () => {
    assert.throws(
      () => loadPricingFile(path.join(FX, "pricing-empty.json")),
      /non-empty JSON object/,
    );
  });

  it("rejects rows with bad rates", () => {
    assert.throws(
      () => loadPricingFile(path.join(FX, "pricing-badrow.json")),
      /non-negative/,
    );
  });
});

describe("pricing freshness", () => {
  it("default table was verified within the last 90 days", () => {
    const checkedMs = Date.parse(PRICING_CHECK_DATE + "T00:00:00Z");
    assert.ok(!Number.isNaN(checkedMs), "PRICING_CHECK_DATE must be an ISO date");
    const ageDays = (Date.now() - checkedMs) / 86_400_000;
    assert.ok(
      ageDays >= 0 && ageDays <= 90,
      `pricing table is ${ageDays.toFixed(1)} days old; re-verify against provider rate cards and update PRICING_CHECK_DATE`,
    );
    for (const [name, row] of Object.entries(PRICING)) {
      assert.equal(row.checked, PRICING_CHECK_DATE, `row ${name} must carry the verified date`);
    }
  });
});
