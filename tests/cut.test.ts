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

  it("prices duplicates at the duplicated calls' cost, not the whole tool's", () => {
    // 2 cheap duplicated calls ($0.006 each) + 1 huge unrelated call ($6.00):
    // the signal must report $0.012 across 2 calls, not the $6.012 tool total.
    const signals = recommendCut(
      [
        call({ inputHash: "aa" }),
        call({ inputHash: "aa" }),
        call({ inputHash: "bb", inputTokens: 1000000, outputTokens: 1000000 }),
      ],
      { topN: 10 },
    );
    const dup = signals.find((s) => s.kind === "duplicates");
    if (!dup) throw new Error("expected a duplicates signal");
    assert.equal(dup.affectedCalls, 2);
    assert.ok(Math.abs(dup.usd - 0.012) < 1e-9, `duplicates usd: ${dup.usd}`);
  });

  it("prices huge-unreferenced calls at their own cost, not the whole tool's", () => {
    // 1 huge unreferenced call ($0.046) + 1 huge referenced call ($6.00):
    // the signal must report $0.046 across 1 call, not the $6.046 tool total.
    const signals = recommendCut(
      [
        call({ tool: "Big", outputTokens: 9000, outputReferenced: false }),
        call({ tool: "Big", inputTokens: 1000000, outputTokens: 1000000, outputReferenced: true }),
      ],
      { topN: 10 },
    );
    const huge = signals.find((s) => s.kind === "huge-unreferenced");
    if (!huge) throw new Error("expected a huge-unreferenced signal");
    assert.equal(huge.affectedCalls, 1);
    assert.ok(Math.abs(huge.usd - 0.046) < 1e-9, `huge-unreferenced usd: ${huge.usd}`);
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
