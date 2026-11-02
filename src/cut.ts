// Cut recommendations. These are CANDIDATES flagged by cost signals, not
// orders: removing a tool can break the workflow that needed it. Each
// signal explains what was observed; the human decides.

import { ModelPrice, PRICING } from "./pricing";
import { ScanSummary, summarize } from "./stats";
import { CallRecord } from "./types";

export type CutSignalKind = "duplicates" | "huge-unreferenced" | "single-use" | "top-spender";

export interface CutSignal {
  tool: string;
  kind: CutSignalKind;
  /** Human-readable explanation of what was observed. */
  detail: string;
  affectedCalls: number;
  usd: number;
}

export interface CutOptions {
  topN: number;
  /** Output-token threshold for the "huge but never referenced" signal. */
  hugeOutputTokens?: number;
  table?: Record<string, ModelPrice>;
}

export function recommendCut(calls: CallRecord[], options: CutOptions): CutSignal[] {
  const table = options.table ?? PRICING;
  const hugeOutputTokens = options.hugeOutputTokens ?? 8000;
  const summary: ScanSummary = summarize(calls, table);
  const usdByTool = new Map(summary.tools.map((t) => [t.tool, t.usd]));
  const signals: CutSignal[] = [];

  // 1. Duplicated calls: same tool, byte-identical normalized input, 2+ times.
  const dupGroups = new Map<string, CallRecord[]>();
  for (const c of calls) {
    if (!c.inputHash) continue;
    const key = c.tool + "\u0000" + c.inputHash;
    const rows = dupGroups.get(key);
    if (rows) rows.push(c);
    else dupGroups.set(key, [c]);
  }
  const dupByTool = new Map<string, number>();
  for (const [key, rows] of dupGroups) {
    if (rows.length < 2) continue;
    const tool = key.split("\u0000")[0];
    dupByTool.set(tool, (dupByTool.get(tool) ?? 0) + rows.length);
  }
  for (const [tool, n] of dupByTool) {
    signals.push({
      tool,
      kind: "duplicates",
      detail: `${n} calls repeated with identical inputs; results could be cached or the prompt tightened`,
      affectedCalls: n,
      usd: usdByTool.get(tool) ?? 0,
    });
  }

  // 2. Huge outputs never referenced again (only when the transcript says so).
  const hugeByTool = new Map<string, number>();
  for (const c of calls) {
    if (c.outputReferenced === false && c.outputTokens >= hugeOutputTokens) {
      hugeByTool.set(c.tool, (hugeByTool.get(c.tool) ?? 0) + 1);
    }
  }
  for (const [tool, n] of hugeByTool) {
    signals.push({
      tool,
      kind: "huge-unreferenced",
      detail: `${n} call(s) returned >= ${hugeOutputTokens} output tokens that were never referenced later; scope the query down`,
      affectedCalls: n,
      usd: usdByTool.get(tool) ?? 0,
    });
  }

  // 3. Single-use tools with non-trivial cost.
  for (const row of summary.tools) {
    if (row.calls === 1 && row.totalTokens >= 1000) {
      signals.push({
        tool: row.tool,
        kind: "single-use",
        detail: `used once for ${row.totalTokens.toLocaleString("en-US")} tokens; check whether the workflow needs it at all`,
        affectedCalls: 1,
        usd: row.usd,
      });
    }
  }

  // 4. Top spender: not a cut order, a review prompt.
  const top = summary.tools[0];
  if (top && top.usd > 0) {
    signals.push({
      tool: top.tool,
      kind: "top-spender",
      detail: `largest cost share at $${top.usd.toFixed(2)}; verify the value justifies it before touching anything else`,
      affectedCalls: top.calls,
      usd: top.usd,
    });
  }

  signals.sort((a, b) => b.usd - a.usd);
  return signals.slice(0, Math.max(0, options.topN));
}
