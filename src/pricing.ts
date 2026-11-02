// Price table. Rates are ESTIMATES from public rate cards, verified on the
// date below. They are NOT your invoice: discounts, caching, tiers and
// regional multipliers all change the real number. Bring your own rates
// with --pricing-file when precision matters.

import * as fs from "fs";
import { isRecord } from "./util";

export interface ModelPrice {
  /** USD per 1M input tokens */
  inputPerM: number;
  /** USD per 1M output tokens */
  outputPerM: number;
  /** ISO date the row was last verified against the provider's rate card */
  checked: string;
  /** URL of the rate card the row was read from */
  source: string;
}

export const PRICING_CHECK_DATE = "2026-11-02";

const ANTHROPIC_SOURCE = "https://docs.anthropic.com/en/docs/about-claude/pricing";
const OPENAI_SOURCE = "https://platform.openai.com/docs/pricing";

export const PRICING: Record<string, ModelPrice> = {
  "claude-opus-4-6": {
    inputPerM: 5,
    outputPerM: 25,
    checked: PRICING_CHECK_DATE,
    source: ANTHROPIC_SOURCE,
  },
  "claude-opus-5": {
    inputPerM: 5,
    outputPerM: 25,
    checked: PRICING_CHECK_DATE,
    source: ANTHROPIC_SOURCE,
  },
  "claude-sonnet-4-5": {
    inputPerM: 3,
    outputPerM: 15,
    checked: PRICING_CHECK_DATE,
    source: ANTHROPIC_SOURCE,
  },
  "claude-sonnet-5-5": {
    inputPerM: 2,
    outputPerM: 10,
    checked: PRICING_CHECK_DATE,
    source: ANTHROPIC_SOURCE,
  },
  "claude-haiku-4-5": {
    inputPerM: 1,
    outputPerM: 5,
    checked: PRICING_CHECK_DATE,
    source: ANTHROPIC_SOURCE,
  },
  "gpt-5-3-codex": {
    inputPerM: 1.75,
    outputPerM: 14,
    checked: PRICING_CHECK_DATE,
    source: OPENAI_SOURCE,
  },
  "gpt-6-1-sol": {
    inputPerM: 2,
    outputPerM: 10,
    checked: PRICING_CHECK_DATE,
    source: OPENAI_SOURCE,
  },
  "gpt-6-1-terra": {
    inputPerM: 1,
    outputPerM: 5,
    checked: PRICING_CHECK_DATE,
    source: OPENAI_SOURCE,
  },
};

export interface CostResult {
  usd: number;
  /** False when the model is not in the table: usd is 0 and the row is flagged. */
  known: boolean;
}

export function usdFor(
  model: string,
  inputTokens: number,
  outputTokens: number,
  table: Record<string, ModelPrice> = PRICING,
): CostResult {
  const row = table[model];
  if (!row) return { usd: 0, known: false };
  return {
    usd: (inputTokens / 1_000_000) * row.inputPerM + (outputTokens / 1_000_000) * row.outputPerM,
    known: true,
  };
}

/**
 * Load a user-supplied pricing file: JSON object mapping model name to
 * { inputPerM, outputPerM, checked, source }. Throws on any validation error.
 */
export function loadPricingFile(path: string): Record<string, ModelPrice> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`cannot read pricing file ${path}: ${(err as Error).message}`);
  }
  if (!isRecord(parsed) || Object.keys(parsed).length === 0) {
    throw new Error(`pricing file ${path} must be a non-empty JSON object`);
  }
  const table: Record<string, ModelPrice> = {};
  for (const [model, row] of Object.entries(parsed)) {
    if (!isRecord(row)) throw new Error(`pricing file ${path}: row for "${model}" must be an object`);
    const inputPerM = row["inputPerM"];
    const outputPerM = row["outputPerM"];
    if (typeof inputPerM !== "number" || inputPerM < 0 || typeof outputPerM !== "number" || outputPerM < 0) {
      throw new Error(`pricing file ${path}: "${model}" needs non-negative inputPerM/outputPerM`);
    }
    table[model] = {
      inputPerM,
      outputPerM,
      checked: typeof row["checked"] === "string" ? row["checked"] : "unknown",
      source: typeof row["source"] === "string" ? row["source"] : "user-supplied",
    };
  }
  return table;
}
