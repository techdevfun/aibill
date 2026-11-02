#!/usr/bin/env node
// aibill CLI: measure where your AI bill actually burns.
//
//   aibill scan <transcript-or-dir> [--json] [--pricing-file F]
//   aibill cut <transcript-or-dir> --top N [--json] [--pricing-file F]
//   aibill diff --before <a> --after <b> [--json] [--pricing-file F]
//   aibill budget --max-usd X <transcript-or-dir> [--json] [--pricing-file F]
//
// Exit codes: 0 = ok, 1 = over budget (budget command), 2 = usage/parse error.
// Reads local transcripts only; never touches billing APIs or credentials.

import { checkBudget } from "./budget";
import { recommendCut } from "./cut";
import { diffSummaries } from "./diff";
import { loadPricingFile, ModelPrice, PRICING, PRICING_CHECK_DATE } from "./pricing";
import { renderBudget, renderCut, renderDiff, renderScan, scanToJson } from "./report";
import { callsForCut, loadScan } from "./scan";

export const VERSION = "0.1.0";

export class UsageError extends Error {}

interface GlobalOpts {
  json: boolean;
  pricingTable: Record<string, ModelPrice>;
}

interface ParsedArgs {
  command: "scan" | "cut" | "diff" | "budget" | "version" | "help";
  target?: string;
  top?: number;
  before?: string;
  after?: string;
  maxUsd?: number;
  global: GlobalOpts;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const global: GlobalOpts = { json: false, pricingTable: PRICING };

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    return { command: "help", global };
  }
  if (args[0] === "--version" || args[0] === "-v") {
    return { command: "version", global };
  }

  const rawCommand = args[0];
  const KNOWN = ["scan", "cut", "diff", "budget"] as const;
  if (!(KNOWN as readonly string[]).includes(rawCommand)) {
    throw new UsageError(`unknown command "${rawCommand}". See --help.`);
  }
  const command = rawCommand as (typeof KNOWN)[number];

  const positional: string[] = [];
  let top: number | undefined;
  let before: string | undefined;
  let after: string | undefined;
  let maxUsd: number | undefined;

  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") {
      global.json = true;
    } else if (a === "--pricing-file") {
      const p = args[++i];
      if (!p) throw new UsageError("--pricing-file needs a path");
      global.pricingTable = loadPricingFile(p);
    } else if (a === "--top") {
      const v = args[++i];
      if (v === undefined || !/^\d+$/.test(v)) throw new UsageError("--top needs a non-negative integer");
      top = parseInt(v, 10);
    } else if (a === "--before") {
      before = args[++i];
      if (!before) throw new UsageError("--before needs a path");
    } else if (a === "--after") {
      after = args[++i];
      if (!after) throw new UsageError("--after needs a path");
    } else if (a === "--max-usd") {
      const v = args[++i];
      if (v === undefined || !/^\d+(\.\d+)?$/.test(v)) throw new UsageError("--max-usd needs a number");
      maxUsd = parseFloat(v);
    } else if (a.startsWith("-")) {
      throw new UsageError(`unknown flag "${a}". See --help.`);
    } else {
      positional.push(a);
    }
  }

  if (command === "diff") {
    if (!before || !after) throw new UsageError("diff needs --before <path> --after <path>");
    return { command, before, after, global };
  }
  if (positional.length !== 1) {
    throw new UsageError(`${command} needs exactly one transcript path`);
  }
  const target = positional[0];
  if (command === "cut") {
    if (top === undefined) throw new UsageError("cut needs --top N");
    return { command, target, top, global };
  }
  if (command === "budget") {
    if (maxUsd === undefined) throw new UsageError("budget needs --max-usd X");
    return { command, target, maxUsd, global };
  }
  return { command, target, global };
}

export function helpText(): string {
  return [
    "aibill - measure where your AI bill actually burns",
    "",
    "Usage:",
    "  aibill scan <transcript-or-dir> [--json] [--pricing-file F]",
    "  aibill cut <transcript-or-dir> --top N [--json] [--pricing-file F]",
    "  aibill diff --before <a> --after <b> [--json] [--pricing-file F]",
    "  aibill budget --max-usd X <transcript-or-dir> [--json] [--pricing-file F]",
    "",
    "Commands:",
    "  scan    Ranked cost attribution per tool call, per model, per framework surface.",
    "  cut     Cut candidates: duplicated calls, huge outputs never referenced,",
    "          costly single-use tools. Candidates only - you decide.",
    "  diff    Measured before/after change. Reports what WAS measured, never promises.",
    "  budget  Exit 1 when measured spend exceeds --max-usd (CI gate).",
    "",
    "Inputs: Claude Code session JSONL or aibill MCP tool-call JSONL (see README).",
    "100% local: transcripts are read from disk only. No billing APIs, no credentials.",
    `USD figures are estimates from public rate cards verified ${PRICING_CHECK_DATE}, not invoices.`,
    "",
    "Exit codes: 0 ok, 1 over budget, 2 usage or parse error.",
  ].join("\n");
}

/** Run the CLI. Returns the process exit code. */
export function run(argv: string[]): number {
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`error: ${err.message}\n\n${helpText()}\n`);
      return 2;
    }
    throw err;
  }

  if (parsed.command === "help") {
    process.stdout.write(helpText() + "\n");
    return 0;
  }
  if (parsed.command === "version") {
    process.stdout.write(VERSION + "\n");
    return 0;
  }

  try {
    return runCommand(parsed);
  } catch (err) {
    process.stderr.write(`error: ${(err as Error).message}\n`);
    return 2;
  }
}

function runCommand(p: ParsedArgs): number {
  const table = p.global.pricingTable;
  switch (p.command) {
    case "scan": {
      const { summary, format, sourceFiles } = loadScan(p.target as string, table);
      if (p.global.json) {
        process.stdout.write(scanToJson(summary) + "\n");
      } else {
        process.stdout.write(
          `Format: ${format} (${sourceFiles.length} file(s))\n\n` + renderScan(summary) + "\n",
        );
      }
      return 0;
    }
    case "cut": {
      const calls = callsForCut(p.target as string);
      const signals = recommendCut(calls, { topN: p.top as number, table });
      if (p.global.json) {
        process.stdout.write(JSON.stringify({ cutCandidates: signals }, null, 2) + "\n");
      } else {
        process.stdout.write(renderCut(signals) + "\n");
      }
      return 0;
    }
    case "diff": {
      const before = loadScan(p.before as string, table).summary;
      const after = loadScan(p.after as string, table).summary;
      const d = diffSummaries(before, after);
      if (p.global.json) {
        process.stdout.write(JSON.stringify(d, null, 2) + "\n");
      } else {
        process.stdout.write(renderDiff(d) + "\n");
      }
      return 0;
    }
    case "budget": {
      const { summary } = loadScan(p.target as string, table);
      const verdict = checkBudget(summary, p.maxUsd as number);
      if (p.global.json) {
        process.stdout.write(JSON.stringify(verdict, null, 2) + "\n");
      } else {
        process.stdout.write(renderBudget(verdict) + "\n");
      }
      return verdict.over ? 1 : 0;
    }
    default:
      throw new UsageError("internal: unhandled command");
  }
}

if (require.main === module) {
  process.exit(run(process.argv));
}
