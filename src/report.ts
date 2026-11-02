// Human-readable tables and machine-readable JSON output.

import { BudgetVerdict } from "./budget";
import { CutSignal } from "./cut";
import { DiffResult } from "./diff";
import { PRICING_CHECK_DATE } from "./pricing";
import { ScanSummary } from "./stats";

function padRight(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

function padLeft(s: string, width: number): string {
  return s.length >= width ? s : " ".repeat(width - s.length) + s;
}

function usdCell(usd: number, known: boolean): string {
  const base = "$" + usd.toFixed(2);
  return known ? base : base + " (?)";
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function renderScan(summary: ScanSummary): string {
  const lines: string[] = [];
  const toolWidth = Math.max(4, ...summary.tools.map((t) => t.tool.length));
  lines.push(
    padRight("TOOL", toolWidth) +
      "  " +
      padLeft("CALLS", 6) +
      "  " +
      padLeft("MEAN TOK", 9) +
      "  " +
      padLeft("P95 TOK", 8) +
      "  " +
      padLeft("TOTAL TOK", 10) +
      "  " +
      padLeft("USD*", 9),
  );
  lines.push("-".repeat(toolWidth + 6 + 9 + 8 + 10 + 9 + 10));
  for (const t of summary.tools) {
    lines.push(
      padRight(t.tool, toolWidth) +
        "  " +
        padLeft(String(t.calls), 6) +
        "  " +
        padLeft(fmtInt(t.meanTokens), 9) +
        "  " +
        padLeft(fmtInt(t.p95Tokens), 8) +
        "  " +
        padLeft(fmtInt(t.totalTokens), 10) +
        "  " +
        padLeft(usdCell(t.usd, t.usdKnown), 9),
    );
  }
  lines.push("");
  lines.push(
    `Total: ${summary.totalCalls} calls, ${fmtInt(summary.totalTokens)} tokens, $${summary.totalUsd.toFixed(2)}* estimated`,
  );
  if (summary.models.length > 1) {
    lines.push("");
    lines.push("By model:");
    for (const m of summary.models) {
      lines.push(`  ${m.model}: ${m.calls} calls, ${fmtInt(m.totalTokens)} tokens, ${usdCell(m.usd, m.usdKnown)}`);
    }
  }
  if (summary.surfaces.length > 0) {
    lines.push("");
    lines.push("By framework surface (top 8):");
    for (const s of summary.surfaces.slice(0, 8)) {
      lines.push(`  ${s.surface}: ${s.calls} calls, ${fmtInt(s.totalTokens)} tokens`);
    }
  }
  lines.push(...footnotes(summary));
  return lines.join("\n");
}

export function renderCut(signals: CutSignal[]): string {
  const lines: string[] = [];
  if (signals.length === 0) {
    return "No cut candidates found: no duplicated calls, huge unreferenced outputs, or costly single-use tools.";
  }
  lines.push("Cut candidates (review before removing anything):");
  lines.push("");
  signals.forEach((s, i) => {
    lines.push(`${i + 1}. [${s.kind}] ${s.tool} - $${s.usd.toFixed(2)} across ${s.affectedCalls} call(s)`);
    lines.push(`   ${s.detail}`);
  });
  lines.push("");
  lines.push("* USD = estimate from public rate cards, not a savings promise.");
  return lines.join("\n");
}

export function renderDiff(d: DiffResult): string {
  const lines: string[] = [];
  const sign = (n: number) => (n > 0 ? "+" : "") + n.toFixed(1);
  lines.push("Measured change (before -> after):");
  lines.push(`  calls:  ${d.beforeCalls} -> ${d.afterCalls}`);
  lines.push(`  tokens: ${fmtInt(d.beforeTokens)} -> ${fmtInt(d.afterTokens)} (${sign(d.tokenDeltaPct)}% measured)`);
  lines.push(
    `  USD*:   $${d.beforeUsd.toFixed(2)} -> $${d.afterUsd.toFixed(2)} (${sign(d.usdDeltaPct)}% measured)`,
  );
  lines.push("");
  lines.push("Per tool (biggest measured savings first):");
  for (const t of d.tools) {
    const delta = t.usdDelta <= 0 ? "" : "+";
    lines.push(
      `  ${t.tool}: $${t.beforeUsd.toFixed(2)} -> $${t.afterUsd.toFixed(2)} (${delta}$${t.usdDelta.toFixed(2)})`,
    );
  }
  lines.push("");
  lines.push("* Measured on these two transcripts only. Not a promise of future savings.");
  return lines.join("\n");
}

export function renderBudget(v: BudgetVerdict): string {
  const status = v.over ? "OVER BUDGET" : "within budget";
  return (
    `Spend $${v.totalUsd.toFixed(2)}* vs budget $${v.maxUsd.toFixed(2)}: ${status}\n` +
    "* Estimate from public rate cards, not your invoice."
  );
}

function footnotes(summary: ScanSummary): string[] {
  const notes: string[] = [""];
  notes.push(`* USD estimated from public rate cards verified ${PRICING_CHECK_DATE}; not your invoice.`);
  notes.push("  Override with --pricing-file for your contracted rates.");
  if (summary.unknownModels.length > 0) {
    notes.push(`  (!) unknown model(s) priced at $0: ${summary.unknownModels.join(", ")}`);
  }
  if (summary.sharedAttributionCalls > 0) {
    notes.push(
      `  (!) ${summary.sharedAttributionCalls} call(s) share per-message token counts (split evenly across the message's tool calls).`,
    );
  }
  if (summary.skippedLines > 0) {
    notes.push(`  (!) ${summary.skippedLines} line(s) could not be parsed and were skipped.`);
  }
  return notes;
}

export function scanToJson(summary: ScanSummary): string {
  return JSON.stringify(
    {
      generatedBy: "aibill-cli",
      pricingCheckDate: PRICING_CHECK_DATE,
      totals: {
        calls: summary.totalCalls,
        tokens: summary.totalTokens,
        usdEstimated: round2(summary.totalUsd),
        unknownModels: summary.unknownModels,
        sharedAttributionCalls: summary.sharedAttributionCalls,
        skippedLines: summary.skippedLines,
      },
      tools: summary.tools.map((t) => ({
        tool: t.tool,
        calls: t.calls,
        meanTokens: round2(t.meanTokens),
        p95Tokens: round2(t.p95Tokens),
        totalTokens: t.totalTokens,
        usdEstimated: round2(t.usd),
        usdKnown: t.usdKnown,
      })),
      models: summary.models,
      surfaces: summary.surfaces,
    },
    null,
    2,
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
