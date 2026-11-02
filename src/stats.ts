// Aggregation: per-tool, per-model and per-surface summaries.

import { ModelPrice, PRICING, usdFor } from "./pricing";
import { CallRecord } from "./types";

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Percentile with linear interpolation between closest ranks. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

export interface ToolRow {
  tool: string;
  calls: number;
  meanTokens: number;
  p95Tokens: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  usd: number;
  usdKnown: boolean;
}

export interface ModelRow {
  model: string;
  calls: number;
  totalTokens: number;
  usd: number;
  usdKnown: boolean;
}

export interface SurfaceRow {
  surface: string;
  calls: number;
  totalTokens: number;
}

export interface ScanSummary {
  tools: ToolRow[];
  models: ModelRow[];
  surfaces: SurfaceRow[];
  totalCalls: number;
  totalTokens: number;
  totalUsd: number;
  /** Models seen in the transcript that have no price row (flagged, never priced). */
  unknownModels: string[];
  /** Calls whose token counts were split across tool calls (Claude Code multi-use messages). */
  sharedAttributionCalls: number;
  skippedLines: number;
}

export function summarize(
  calls: CallRecord[],
  table: Record<string, ModelPrice> = PRICING,
  skippedLines = 0,
): ScanSummary {
  const byTool = new Map<string, CallRecord[]>();
  const byModel = new Map<string, CallRecord[]>();
  const bySurface = new Map<string, CallRecord[]>();
  for (const c of calls) {
    pushTo(byTool, c.tool, c);
    pushTo(byModel, c.model, c);
    if (c.frameworkSurface) pushTo(bySurface, c.frameworkSurface, c);
  }

  const tools: ToolRow[] = [...byTool.entries()].map(([tool, rows]) => {
    const perCall = rows.map((r) => r.inputTokens + r.outputTokens);
    const inputTokens = rows.reduce((a, r) => a + r.inputTokens, 0);
    const outputTokens = rows.reduce((a, r) => a + r.outputTokens, 0);
    let usd = 0;
    let usdKnown = true;
    const models = new Set(rows.map((r) => r.model));
    for (const m of models) {
      const sub = rows.filter((r) => r.model === m);
      const inT = sub.reduce((a, r) => a + r.inputTokens, 0);
      const outT = sub.reduce((a, r) => a + r.outputTokens, 0);
      const res = usdFor(m, inT, outT, table);
      usd += res.usd;
      if (!res.known) usdKnown = false;
    }
    return {
      tool,
      calls: rows.length,
      meanTokens: mean(perCall),
      p95Tokens: percentile(perCall, 95),
      totalTokens: inputTokens + outputTokens,
      inputTokens,
      outputTokens,
      usd,
      usdKnown,
    };
  });
  tools.sort((a, b) => b.usd - a.usd || b.totalTokens - a.totalTokens);

  const models: ModelRow[] = [...byModel.entries()].map(([model, rows]) => {
    const inputTokens = rows.reduce((a, r) => a + r.inputTokens, 0);
    const outputTokens = rows.reduce((a, r) => a + r.outputTokens, 0);
    const res = usdFor(model, inputTokens, outputTokens, table);
    return {
      model,
      calls: rows.length,
      totalTokens: inputTokens + outputTokens,
      usd: res.usd,
      usdKnown: res.known,
    };
  });
  models.sort((a, b) => b.usd - a.usd);

  const surfaces: SurfaceRow[] = [...bySurface.entries()]
    .map(([surface, rows]) => ({
      surface,
      calls: rows.length,
      totalTokens: rows.reduce((a, r) => a + r.inputTokens + r.outputTokens, 0),
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens);

  const totalTokens = calls.reduce((a, r) => a + r.inputTokens + r.outputTokens, 0);
  const totalUsd = tools.reduce((a, t) => a + t.usd, 0);
  const unknownModels = [...new Set(calls.map((c) => c.model))].filter(
    (m) => !(m in table),
  );

  return {
    tools,
    models,
    surfaces,
    totalCalls: calls.length,
    totalTokens,
    totalUsd,
    unknownModels,
    sharedAttributionCalls: calls.filter((c) => c.attribution === "shared").length,
    skippedLines,
  };
}

function pushTo(map: Map<string, CallRecord[]>, key: string, call: CallRecord): void {
  const rows = map.get(key);
  if (rows) rows.push(call);
  else map.set(key, [call]);
}
