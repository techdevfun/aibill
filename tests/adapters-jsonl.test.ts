import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseMcpJsonl } from "../src/adapters/jsonl";

describe("parseMcpJsonl", () => {
  it("parses valid lines with exact attribution", () => {
    const r = parseMcpJsonl([
      '{"tool":"read_file","model":"gpt-6-1-terra","input_tokens":120,"output_tokens":3400}',
      "",
      '  ',
    ]);
    assert.equal(r.calls.length, 1);
    assert.equal(r.calls[0].tool, "read_file");
    assert.equal(r.calls[0].model, "gpt-6-1-terra");
    assert.equal(r.calls[0].inputTokens, 120);
    assert.equal(r.calls[0].outputTokens, 3400);
    assert.equal(r.calls[0].attribution, "exact");
    assert.equal(r.skippedLines, 0);
    assert.equal(r.format, "mcp-jsonl");
  });

  it("skips bad lines and counts them", () => {
    const r = parseMcpJsonl([
      "not json",
      '{"tool":"","input_tokens":1,"output_tokens":2}',
      '{"tool":"x","input_tokens":-5,"output_tokens":2}',
      '{"tool":"x","input_tokens":1}', // missing output_tokens
      '{"tool":"ok","input_tokens":1,"output_tokens":2}',
    ]);
    assert.equal(r.calls.length, 1);
    assert.equal(r.calls[0].tool, "ok");
    assert.equal(r.skippedLines, 4);
  });

  it("reads optional fields and hashes inputs deterministically", () => {
    const line = (inp: object) =>
      JSON.stringify({
        tool: "t",
        input_tokens: 1,
        output_tokens: 2,
        framework_surface: "src/api",
        output_referenced: false,
        input: inp,
      });
    const r = parseMcpJsonl([line({ b: 2, a: 1 }), line({ a: 1, b: 2 })]);
    assert.equal(r.calls[0].frameworkSurface, "src/api");
    assert.equal(r.calls[0].outputReferenced, false);
    assert.equal(r.calls[0].inputHash, r.calls[1].inputHash); // key order irrelevant
    const r2 = parseMcpJsonl([line({ a: 9 })]);
    assert.notEqual(r2.calls[0].inputHash, r.calls[0].inputHash);
  });

  it("defaults model to unknown when absent", () => {
    const r = parseMcpJsonl(['{"tool":"t","input_tokens":1,"output_tokens":2}']);
    assert.equal(r.calls[0].model, "unknown");
  });
});
