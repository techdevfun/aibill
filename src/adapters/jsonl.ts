// Parser for the aibill generic MCP tool-call JSONL schema.
//
// One JSON object per line:
//   {"tool":"read_file","model":"claude-sonnet-4-5",
//    "input_tokens":120,"output_tokens":3400,
//    "ts":"2026-11-02T10:00:00Z",                       // optional
//    "framework_surface":"src/api",                    // optional
//    "output_referenced":false,                        // optional
//    "input":{"path":"src/api/index.ts"}}              // optional, raw tool input
//
// Lines that fail validation are skipped and counted; they never abort the run.

import { CallRecord, ParseResult } from "../types";
import { fnv1aHex, isRecord, stableStringify, toNonNegativeInt } from "../util";

export function parseMcpJsonl(lines: string[]): ParseResult {
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
    const call = toCallRecord(obj);
    if (call === null) {
      skippedLines++;
      continue;
    }
    calls.push(call);
  }

  return { calls, skippedLines, format: "mcp-jsonl", sourceFiles: [] };
}

function toCallRecord(obj: unknown): CallRecord | null {
  if (!isRecord(obj)) return null;
  const tool = obj["tool"];
  if (typeof tool !== "string" || tool.trim() === "") return null;
  const inputTokens = toNonNegativeInt(obj["input_tokens"]);
  const outputTokens = toNonNegativeInt(obj["output_tokens"]);
  if (inputTokens === null || outputTokens === null) return null;

  const model = typeof obj["model"] === "string" && obj["model"] !== "" ? obj["model"] : "unknown";
  const frameworkSurface =
    typeof obj["framework_surface"] === "string" && obj["framework_surface"] !== ""
      ? obj["framework_surface"]
      : undefined;
  const outputReferenced =
    typeof obj["output_referenced"] === "boolean" ? obj["output_referenced"] : undefined;
  const inputHash =
    obj["input"] !== undefined ? fnv1aHex(stableStringify(obj["input"])) : undefined;

  return {
    tool: tool.trim(),
    model,
    inputTokens,
    outputTokens,
    attribution: "exact",
    frameworkSurface,
    outputReferenced,
    inputHash,
  };
}
