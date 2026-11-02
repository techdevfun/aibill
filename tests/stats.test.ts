import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mean, percentile, summarize } from "../src/stats";
import { CallRecord } from "../src/types";

function call(over: Partial<CallRecord>): CallRecord {
  return {
    tool: "Read",
    model: "claude-haiku-4-5",
    inputTokens: 1000,
    outputTokens: 4000,
    attribution: "exact",
    ...over,
  };
}

describe("mean", () => {
  it("averages values", () => assert.equal(mean([1, 2, 3, 4]), 2.5));
  it("returns 0 for empty input", () => assert.equal(mean([]), 0));
});

describe("percentile", () => {
  it("p95 of [100,200,300,400,500] is 480 (linear interpolation)", () => {
    assert.equal(percentile([100, 200, 300, 400, 500], 95), 480);
  });
  it("p50 of [1,2,3,4] is 2.5", () => assert.equal(percentile([1, 2, 3, 4], 50), 2.5));
  it("p100 returns the max", () => assert.equal(percentile([5, 9, 3], 100), 9));
  it("p0 returns the min", () => assert.equal(percentile([5, 9, 3], 0), 3));
  it("returns 0 for empty input", () => assert.equal(percentile([], 95), 0));
});

describe("summarize", () => {
  it("aggregates per-tool rows sorted by usd desc", () => {
    const s = summarize([
      call({ tool: "Read", inputTokens: 1000, outputTokens: 4000 }),
      call({ tool: "Read", inputTokens: 1000, outputTokens: 4000 }),
      call({ tool: "Bash", model: "gpt-6-1-terra", inputTokens: 2000, outputTokens: 2000 }),
    ]);
    assert.equal(s.tools.length, 2);
    assert.equal(s.tools[0].tool, "Read"); // 0.042 > 0.012
    assert.equal(s.tools[0].calls, 2);
    assert.equal(s.tools[0].totalTokens, 10000);
    assert.ok(Math.abs(s.tools[0].usd - 0.042) < 1e-9);
    assert.equal(s.tools[0].usdKnown, true);
    assert.equal(s.tools[0].meanTokens, 5000);
    assert.equal(s.tools[0].p95Tokens, 5000);
    assert.equal(s.totalCalls, 3);
    assert.equal(s.totalTokens, 14000);
    assert.ok(Math.abs(s.totalUsd - 0.054) < 1e-9);
  });

  it("flags unknown models and prices them at $0", () => {
    const s = summarize([call({ model: "mystery-model-9" })]);
    assert.deepEqual(s.unknownModels, ["mystery-model-9"]);
    assert.equal(s.tools[0].usd, 0);
    assert.equal(s.tools[0].usdKnown, false);
    assert.equal(s.totalUsd, 0);
  });

  it("counts shared-attribution calls", () => {
    const s = summarize([call({ attribution: "shared" }), call({})]);
    assert.equal(s.sharedAttributionCalls, 1);
  });

  it("aggregates framework surfaces", () => {
    const s = summarize([
      call({ frameworkSurface: "src/api" }),
      call({ frameworkSurface: "src/api" }),
      call({}),
    ]);
    assert.equal(s.surfaces.length, 1);
    assert.equal(s.surfaces[0].surface, "src/api");
    assert.equal(s.surfaces[0].calls, 2);
  });

  it("handles an empty call list", () => {
    const s = summarize([]);
    assert.equal(s.totalCalls, 0);
    assert.equal(s.totalUsd, 0);
    assert.deepEqual(s.tools, []);
  });
});
