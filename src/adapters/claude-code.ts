// Parser for Claude Code session logs (JSONL).
//
// Shape handled (per assistant message):
//   {"type":"assistant",
//    "message":{"model":"claude-opus-4-6",
//               "usage":{"input_tokens":1234,"output_tokens":56},
//               "content":[{"type":"tool_use","name":"Read",
//                           "input":{"file_path":"src/app.ts"}}]}}
//
// Token usage in these logs is per MESSAGE, not per tool call. When one
// message carries several tool calls the usage is split evenly and the
// records are marked attribution:"shared" (see types.ts). This is an
// approximation and is always disclosed in the report.

import { CallRecord, ParseResult } from "../types";
import { fnv1aHex, isRecord, stableStringify, toNonNegativeInt } from "../util";

interface ToolUse {
  name: string;
  input: unknown;
}

export function parseClaudeCode(lines: string[]): ParseResult {
  const calls: CallRecord[] = [];
  let skippedLines = 0;

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") continue;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      skippedLines++;
      continue;
    }
    if (!isRecord(obj) || obj["type"] !== "assistant") continue;
    const message = obj["message"];
    if (!isRecord(message)) {
      skippedLines++;
      continue;
    }
    const uses = extractToolUses(message["content"]);
    if (uses.length === 0) continue;
    const usage = isRecord(message["usage"]) ? message["usage"] : {};
    const inputTokens = toNonNegativeInt(usage["input_tokens"]) ?? 0;
    const outputTokens = toNonNegativeInt(usage["output_tokens"]) ?? 0;
    const model =
      typeof message["model"] === "string" && message["model"] !== "" ? message["model"] : "unknown";
    const attribution = uses.length === 1 ? "exact" : "shared";
    // Even split across the message's tool calls; remainder goes to the first.
    const inEach = Math.floor(inputTokens / uses.length);
    const outEach = Math.floor(outputTokens / uses.length);
    uses.forEach((use, i) => {
      calls.push({
        tool: use.name,
        model,
        inputTokens: i === 0 ? inputTokens - inEach * (uses.length - 1) : inEach,
        outputTokens: i === 0 ? outputTokens - outEach * (uses.length - 1) : outEach,
        attribution,
        frameworkSurface: surfaceFromInput(use.input),
        inputHash: use.input !== undefined ? fnv1aHex(stableStringify(use.input)) : undefined,
      });
    });
  }

  return { calls, skippedLines, format: "claude-code", sourceFiles: [] };
}

function extractToolUses(content: unknown): ToolUse[] {
  if (!Array.isArray(content)) return [];
  const uses: ToolUse[] = [];
  for (const block of content) {
    if (!isRecord(block) || block["type"] !== "tool_use") continue;
    const name = block["name"];
    if (typeof name !== "string" || name.trim() === "") continue;
    uses.push({ name: name.trim(), input: block["input"] });
  }
  return uses;
}

/**
 * Derive a "framework surface" label from a tool input: the containing
 * directory of the referenced file, e.g. {file_path:"src/api/routes.ts"}
 * -> "src/api". Root-level files map to "(root)". Returns undefined when the
 * input carries no recognizable path.
 */
export function surfaceFromInput(input: unknown): string | undefined {
  if (!isRecord(input)) return undefined;
  const raw = input["file_path"] ?? input["path"] ?? input["file"] ?? input["dir"];
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const cleaned = raw.trim().replace(/^\/+/, "");
  const segments = cleaned.split("/").filter((s) => s !== "" && s !== "." && s !== "..");
  if (segments.length === 0) return undefined;
  const dir = segments.slice(0, -1);
  return dir.length === 0 ? "(root)" : dir.join("/");
}
