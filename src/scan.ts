// Load transcripts from a file or a directory (*.jsonl, top level only),
// detect the format once across all files, and parse everything.

import * as fs from "fs";
import * as path from "path";
import { parseClaudeCode } from "./adapters/claude-code";
import { detectFormat } from "./adapters/detect";
import { parseMcpJsonl } from "./adapters/jsonl";
import { ModelPrice, PRICING } from "./pricing";
import { ScanSummary, summarize } from "./stats";
import { CallRecord, ParseResult, TranscriptFormat } from "./types";

export interface ScanOutput {
  summary: ScanSummary;
  format: TranscriptFormat;
  sourceFiles: string[];
}

export function loadScan(
  target: string,
  table: Record<string, ModelPrice> = PRICING,
): ScanOutput {
  const files = resolveFiles(target);
  if (files.length === 0) {
    throw new Error(`no .jsonl transcript files found at ${target}`);
  }
  const allLines: string[] = [];
  for (const f of files) {
    const content = fs.readFileSync(f, "utf8");
    allLines.push(...content.split("\n"));
  }
  const format = detectFormat(allLines);
  const parsed: ParseResult =
    format === "claude-code" ? parseClaudeCode(allLines) : parseMcpJsonl(allLines);
  const summary = summarize(parsed.calls, table, parsed.skippedLines);
  return { summary, format, sourceFiles: files };
}

function resolveFiles(target: string): string[] {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(target);
  } catch {
    throw new Error(`path not found: ${target}`);
  }
  if (stat.isFile()) {
    if (!target.endsWith(".jsonl")) {
      throw new Error(`expected a .jsonl file, got: ${target}`);
    }
    return [target];
  }
  if (stat.isDirectory()) {
    return fs
      .readdirSync(target)
      .filter((name) => name.endsWith(".jsonl"))
      .sort()
      .map((name) => path.join(target, name));
  }
  throw new Error(`not a file or directory: ${target}`);
}

export function callsForCut(target: string): CallRecord[] {
  const files = resolveFiles(target);
  const allLines: string[] = [];
  for (const f of files) allLines.push(...fs.readFileSync(f, "utf8").split("\n"));
  const format = detectFormat(allLines);
  const parsed: ParseResult =
    format === "claude-code" ? parseClaudeCode(allLines) : parseMcpJsonl(allLines);
  return parsed.calls;
}
