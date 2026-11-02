// Shared record types for aibill.

/** How a call's token usage was attributed to a single tool call. */
export type Attribution = "exact" | "shared";

/**
 * One measured tool call.
 *
 * "exact"  - the transcript carried per-call token counts (aibill JSONL schema).
 * "shared" - the transcript only carried per-message usage (Claude Code logs);
 *            the message's tokens were split evenly across its tool calls.
 */
export interface CallRecord {
  tool: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  attribution: Attribution;
  /** File/directory surface the agent kept working on, when derivable. */
  frameworkSurface?: string;
  /** True when the tool's output was referenced again later. Undefined = unknown. */
  outputReferenced?: boolean;
  /** Stable hash of the raw tool input, for duplicate-call detection. */
  inputHash?: string;
}

export type TranscriptFormat = "claude-code" | "mcp-jsonl";

export interface ParseResult {
  calls: CallRecord[];
  skippedLines: number;
  format: TranscriptFormat;
  sourceFiles: string[];
}
