import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseClaudeCode, surfaceFromInput } from "../src/adapters/claude-code";

function msg(content: unknown[], usage = { input_tokens: 1000, output_tokens: 100 }, model = "claude-opus-4-6") {
  return JSON.stringify({ type: "assistant", message: { model, usage, content } });
}

describe("parseClaudeCode", () => {
  it("attributes full message usage to a single tool call", () => {
    const r = parseClaudeCode([
      msg([{ type: "tool_use", name: "Read", input: { file_path: "src/app.ts" } }]),
    ]);
    assert.equal(r.calls.length, 1);
    assert.equal(r.calls[0].tool, "Read");
    assert.equal(r.calls[0].inputTokens, 1000);
    assert.equal(r.calls[0].outputTokens, 100);
    assert.equal(r.calls[0].attribution, "exact");
    assert.equal(r.calls[0].frameworkSurface, "src");
    assert.equal(r.format, "claude-code");
  });

  it("splits usage evenly across multi-tool messages, remainder to first", () => {
    const r = parseClaudeCode([
      msg(
        [
          { type: "tool_use", name: "Read", input: { file_path: "a.ts" } },
          { type: "tool_use", name: "Glob", input: { pattern: "**/*.ts" } },
        ],
        { input_tokens: 1001, output_tokens: 5 },
      ),
    ]);
    assert.equal(r.calls.length, 2);
    assert.equal(r.calls[0].attribution, "shared");
    assert.equal(r.calls[1].attribution, "shared");
    assert.equal(r.calls[0].inputTokens, 501);
    assert.equal(r.calls[1].inputTokens, 500);
    assert.equal(r.calls[0].outputTokens, 3);
    assert.equal(r.calls[1].outputTokens, 2);
    // split must conserve the message total
    assert.equal(r.calls[0].inputTokens + r.calls[1].inputTokens, 1001);
  });

  it("ignores non-assistant lines and messages without tool_use", () => {
    const r = parseClaudeCode([
      JSON.stringify({ type: "user", message: { content: "hi" } }),
      msg([{ type: "text", text: "no tools here" }]),
      "garbage{",
    ]);
    assert.equal(r.calls.length, 0);
    assert.equal(r.skippedLines, 1);
  });
});

describe("surfaceFromInput", () => {
  it("maps file paths to their top two segments", () => {
    assert.equal(surfaceFromInput({ file_path: "src/api/routes.ts" }), "src/api");
    assert.equal(surfaceFromInput({ path: "/repo/src/app.ts" }), "repo/src");
  });
  it("maps root-level files to (root)", () => {
    assert.equal(surfaceFromInput({ file_path: "app.ts" }), "(root)");
  });
  it("returns undefined without a recognizable path", () => {
    assert.equal(surfaceFromInput({ command: "ls" }), undefined);
    assert.equal(surfaceFromInput(null), undefined);
    assert.equal(surfaceFromInput("x"), undefined);
  });
});
