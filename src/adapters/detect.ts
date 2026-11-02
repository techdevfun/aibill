// Format auto-detection. Reads a sample of non-empty lines and picks the
// first adapter whose signature matches. Anything else is a clear error,
// never a guess: silently mis-parsing a foreign format would corrupt the
// money math.

import { TranscriptFormat } from "../types";
import { isRecord } from "../util";

const SAMPLE_LINES = 50;

export function detectFormat(lines: string[]): TranscriptFormat {
  let saw = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") continue;
    saw++;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRecord(obj)) continue;
    if (looksLikeClaudeCode(obj)) return "claude-code";
    if (looksLikeMcpJsonl(obj)) return "mcp-jsonl";
    if (saw >= SAMPLE_LINES) break;
  }
  throw new Error(
    "unrecognized transcript format: expected Claude Code session JSONL " +
      "(assistant messages with tool_use blocks) or aibill MCP JSONL " +
      '({"tool": "...", "input_tokens": N, "output_tokens": M, ...}). ' +
      "See README for the schema.",
  );
}

function looksLikeClaudeCode(obj: Record<string, unknown>): boolean {
  if (obj["type"] !== "assistant") return false;
  const message = obj["message"];
  if (!isRecord(message) || !Array.isArray(message["content"])) return false;
  return (message["content"] as unknown[]).some(
    (b) => isRecord(b) && b["type"] === "tool_use",
  );
}

function looksLikeMcpJsonl(obj: Record<string, unknown>): boolean {
  return typeof obj["tool"] === "string" && obj["tool"] !== "";
}
