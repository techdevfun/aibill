import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { recommendCut } from "../src/cut";
import { CallRecord } from "../src/types";

function call(over: Partial<CallRecord>): CallRecord {
  return {
    tool: "Read",
    model: "claude-haiku-4-5", // $1 / $5 per MTok
    inputTokens: 1000,
    outputTokens: 1000,
    attribution: "exact",
    ...over,
  };
}

describe("recommendCut", () => {
  it("flags duplicated calls with identical inputs", () => {
    const signals = recommendCut(
      [call({ inputHash: "aa" }), call({ inputHash: "aa" }), call({ inputHash: "bb" })],
      { topN: 10 },
    );
    const dup = signals.find((s) => s.kind === "duplicates");
    if (!dup) throw new Error("expected a duplicates signal");
    assert.equal(dup.affectedCalls, 2);
  });

  it("flags huge outputs never referenced (and only then)", () => {
    const mk = (ref: boolean | undefined) => [
      call({ tool: "Big", outputTokens: 9000, outputReferenced: ref }),
    ];
    const yes = recommendCut(mk(false), { topN: 10 });
    assert.ok(yes.some((s) => s.kind === "huge-unreferenced"));
    const referenced = recommendCut(mk(true), { topN: 10 });
    assert.ok(!referenced.some((s) => s.kind === "huge-unreferenced"));
    const unknown = recommendCut(mk(undefined), { topN: 10 });
    assert.ok(!unknown.some((s) => s.kind === "huge-unreferenced"));
  });

  it("flags costly single-use tools but not cheap ones", () => {
    const costly = recommendCut([call({ tool: "Once", inputTokens: 2500, outputTokens: 2500 })], {
      topN: 10,
    });
    assert.ok(costly.some((s) => s.kind === "single-use" && s.tool === "Once"));
    const cheap = recommendCut([call({ tool: "Once", inputTokens: 100, outputTokens: 100 })], {
      topN: 10,
    });
    assert.ok(!cheap.some((s) => s.kind === "single-use"));
  });

  it("always includes the top spender as a review prompt", () => {
    const signals = recommendCut(
      [call({ tool: "Expensive" }), call({ tool: "Cheap", inputTokens: 10, outputTokens: 10 })],
      { topN: 10 },
    );
    const top = signals.find((s) => s.kind === "top-spender");
    if (!top) throw new Error("expected a top-spender signal");
    assert.equal(top.tool, "Expensive");
  });

  it("respects topN and returns nothing for topN=0", () => {
    const calls = [call({ inputHash: "aa" }), call({ inputHash: "aa" })];
    assert.equal(recommendCut(calls, { topN: 0 }).length, 0);
    assert.ok(recommendCut(calls, { topN: 1 }).length <= 1);
  });

  it("returns no candidates on an empty transcript", () => {
    assert.deepEqual(recommendCut([], { topN: 5 }), []);
  });
});
