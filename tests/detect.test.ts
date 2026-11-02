import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectFormat } from "../src/adapters/detect";

const claudeLine = JSON.stringify({
  type: "assistant",
  message: {
    model: "claude-opus-4-6",
    usage: { input_tokens: 10, output_tokens: 5 },
    content: [{ type: "tool_use", name: "Read", input: {} }],
  },
});
const mcpLine = JSON.stringify({ tool: "fetch", input_tokens: 10, output_tokens: 5 });

describe("detectFormat", () => {
  it("detects Claude Code session logs", () => {
    assert.equal(detectFormat(["", claudeLine]), "claude-code");
  });
  it("detects aibill MCP JSONL", () => {
    assert.equal(detectFormat([mcpLine]), "mcp-jsonl");
  });
  it("skips unparseable lines before deciding", () => {
    assert.equal(detectFormat(["garbage", mcpLine]), "mcp-jsonl");
  });
  it("throws a clear error for foreign formats", () => {
    assert.throws(() => detectFormat(['{"hello":"world"}']), /unrecognized transcript format/);
    assert.throws(() => detectFormat([]), /unrecognized transcript format/);
  });
});
