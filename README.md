# aibill

**aibill** measures where your AI bill actually burns. For developers running
coding agents (Claude Code and friends), it reads real session transcripts and
attributes tokens and estimated USD to each tool call, so you can see which
tool ate the budget - and verify the cut paid off.

![demo](examples/demo.gif)

_Demo runs on synthetic seeded fixtures (`scripts/gen-examples.py`) — run `aibill scan` on your own transcripts for real numbers._

## The problem

You see the bill, not the line items. When a framework feels "heavy" or a usage
limit changes, token spend moves with no invoice detail: which MCP tool ate the
most tokens, which call pattern is worth cutting, and did the cut actually save
anything? Right now the answer is gut feel - or benchmarks measured on someone
else's workload. aibill measures on yours.

## What it does

Four commands, one idea: measure first, cut second, verify third.

```sh
npx -p aibill-cli aibill scan <transcript-or-dir>
```

```
TOOL                   CALLS   MEAN TOK   P95 TOK   TOTAL TOK       USD*
------------------------------------------------------------------------
mcp__doc_lookup           30     23,265    26,947     697,938     $16.55
mcp__codebase_search      24     15,427    18,889     370,241      $7.81
Read                      40      5,020     7,247     200,797      $3.94
...

Total: 137 calls, 1,425,208 tokens, $31.68* estimated

* USD estimated from public rate cards verified 2026-11-02; not your invoice.
```

- `scan` - ranked attribution per tool (calls, mean/p95/total tokens, USD), plus
  per-model and per-framework-surface breakdowns.
- `cut --top N` - cut *candidates*: duplicated calls, huge outputs never
  referenced again, costly single-use tools. Candidates only - you decide.
- `diff --before a --after b` - measured before/after change. Reports what *was*
  measured, never promises savings.
- `budget --max-usd X` - exits non-zero when measured spend exceeds the budget.
  Built for CI gates.

## Install

```sh
npm install -g aibill-cli
```

Requires Node.js 20+. Zero runtime dependencies.

```sh
# no install needed:
npx -p aibill-cli aibill scan ~/.claude/projects/my-project/*.jsonl
```

## Inputs

- **Claude Code session logs** (JSONL): auto-detected. Token usage in these logs
  is per *message*, so when one message carries several tool calls the usage is
  split evenly and flagged as shared attribution in the report.
- **aibill MCP JSONL**: one object per line, for any other harness:
  `{"tool":"read_file","model":"gpt-6-1-terra","input_tokens":120,"output_tokens":3400}`
  - optional: `ts`, `framework_surface`, `output_referenced` (bool),
    `input` (raw tool input, enables duplicate detection).
- A directory scans every `*.jsonl` in it. Anything else fails with a clear
  error - a foreign format is never silently mis-parsed.

## Pricing: read this before trusting the dollars

USD figures are **estimates from public rate cards**, verified on **2026-11-02**
(see `src/pricing.ts` for the table and its sources). They are not your invoice:
discounts, caching, tiers and regional multipliers change the real number.
Unknown models are priced at $0 and flagged, never guessed. Bring contracted
rates with `--pricing-file`:

```sh
aibill scan session.jsonl --pricing-file my-rates.json
# {"my-model": {"inputPerM": 4.5, "outputPerM": 18, "checked": "2026-11-02", "source": "..."}}
```

## Honest limits

- aibill **measures**; it does not reduce tokens, rewrite prompts, or compress
  anything. Any "% saved" you see from `diff` was measured on the two
  transcripts you gave it - not a promise about the future.
- It reads **local transcripts only**. It never calls billing APIs, never
  touches credentials, never sends anything anywhere. Transcripts contain your
  proprietary code; the tool is 100% offline by design.
- Claude Code attribution across multi-tool messages is an even split, disclosed
  in every report. Adapter coverage grows over time; unsupported formats error
  loudly instead of guessing.

## CI gate example

```yaml
- run: npx -p aibill-cli aibill budget --max-usd 25 ./agent-transcripts/
```

## Roadmap

- OpenCode / Codex session adapters
- An MCP server so the agent itself can ask "which tool is burning money?"
- Trend view across weeks of sessions

## Contributing

Bug reports with a redacted transcript snippet are gold. See CONTRIBUTING.md.

## License

MIT - see LICENSE.
