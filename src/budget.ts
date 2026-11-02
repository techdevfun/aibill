// Budget gate for CI: non-zero exit when the measured spend of the
// transcript(s) exceeds --max-usd.

import { ScanSummary } from "./stats";

export interface BudgetVerdict {
  totalUsd: number;
  maxUsd: number;
  /** True when the spend is OVER budget (caller should exit non-zero). */
  over: boolean;
}

export function checkBudget(summary: ScanSummary, maxUsd: number): BudgetVerdict {
  if (!Number.isFinite(maxUsd) || maxUsd < 0) {
    throw new Error(`--max-usd must be a non-negative number, got: ${String(maxUsd)}`);
  }
  return { totalUsd: summary.totalUsd, maxUsd, over: summary.totalUsd > maxUsd };
}
