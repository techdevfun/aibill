// Before/after comparison. Reports MEASURED change only: tokens and USD
// counted on the two transcripts you hand it. It never promises savings.

import { ScanSummary } from "./stats";

export interface ToolDelta {
  tool: string;
  beforeCalls: number;
  afterCalls: number;
  beforeUsd: number;
  afterUsd: number;
  usdDelta: number;
}

export interface DiffResult {
  beforeCalls: number;
  afterCalls: number;
  beforeTokens: number;
  afterTokens: number;
  tokenDelta: number;
  tokenDeltaPct: number;
  beforeUsd: number;
  afterUsd: number;
  usdDelta: number;
  usdDeltaPct: number;
  tools: ToolDelta[];
}

export function diffSummaries(before: ScanSummary, after: ScanSummary): DiffResult {
  const beforeByTool = new Map(before.tools.map((t) => [t.tool, t]));
  const afterByTool = new Map(after.tools.map((t) => [t.tool, t]));
  const names = new Set([...beforeByTool.keys(), ...afterByTool.keys()]);
  const tools: ToolDelta[] = [...names].map((tool) => {
    const b = beforeByTool.get(tool);
    const a = afterByTool.get(tool);
    const beforeUsd = b?.usd ?? 0;
    const afterUsd = a?.usd ?? 0;
    return {
      tool,
      beforeCalls: b?.calls ?? 0,
      afterCalls: a?.calls ?? 0,
      beforeUsd,
      afterUsd,
      usdDelta: afterUsd - beforeUsd,
    };
  });
  tools.sort((a, b) => a.usdDelta - b.usdDelta); // biggest savings first

  const tokenDelta = after.totalTokens - before.totalTokens;
  const usdDelta = after.totalUsd - before.totalUsd;
  return {
    beforeCalls: before.totalCalls,
    afterCalls: after.totalCalls,
    beforeTokens: before.totalTokens,
    afterTokens: after.totalTokens,
    tokenDelta,
    tokenDeltaPct: before.totalTokens === 0 ? 0 : (tokenDelta / before.totalTokens) * 100,
    beforeUsd: before.totalUsd,
    afterUsd: after.totalUsd,
    usdDelta,
    usdDeltaPct: before.totalUsd === 0 ? 0 : (usdDelta / before.totalUsd) * 100,
    tools,
  };
}
