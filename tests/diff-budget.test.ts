import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkBudget } from "../src/budget";
import { diffSummaries } from "../src/diff";
import { summarize } from "../src/stats";
import { CallRecord } from "../src/types";

function call(over: Partial<CallRecord>): CallRecord {
  return {
    tool: "Read",
    model: "claude-haiku-4-5", // $1 / $5 per MTok: 1000+1000 tokens = $0.006
    inputTokens: 1000,
    outputTokens: 1000,
    attribution: "exact",
    ...over,
  };
}

describe("diffSummaries", () => {
  it("reports measured before/after deltas", () => {
    const before = summarize([call({}), call({})]);
    const after = summarize([call({})]);
    const d = diffSummaries(before, after);
    assert.equal(d.beforeCalls, 2);
    assert.equal(d.afterCalls, 1);
    assert.equal(d.beforeTokens, 4000);
    assert.equal(d.afterTokens, 2000);
    assert.equal(d.tokenDelta, -2000);
    assert.equal(d.tokenDeltaPct, -50);
    assert.ok(Math.abs(d.beforeUsd - 0.012) < 1e-9);
    assert.ok(Math.abs(d.afterUsd - 0.006) < 1e-9);
    assert.ok(Math.abs(d.usdDeltaPct - -50) < 1e-9);
    assert.equal(d.tools.length, 1);
    assert.ok(d.tools[0].usdDelta < 0);
  });

  it("handles tools present on only one side", () => {
    const before = summarize([call({ tool: "Gone" })]);
    const after = summarize([call({ tool: "New" })]);
    const d = diffSummaries(before, after);
    assert.equal(d.tools.length, 2);
    const gone = d.tools.find((t) => t.tool === "Gone")!;
    assert.equal(gone.afterCalls, 0);
    assert.ok(gone.usdDelta < 0);
  });
});

describe("checkBudget", () => {
  it("flags over-budget spend", () => {
    const v = checkBudget(summarize([call({}), call({})]), 0.01); // $0.012 > $0.01
    assert.equal(v.over, true);
    assert.ok(Math.abs(v.totalUsd - 0.012) < 1e-9);
  });
  it("passes spend at or under budget", () => {
    assert.equal(checkBudget(summarize([call({})]), 0.006).over, false);
    assert.equal(checkBudget(summarize([call({})]), 1).over, false);
  });
  it("rejects negative budgets", () => {
    assert.throws(() => checkBudget(summarize([]), -1), /--max-usd/);
  });
});
