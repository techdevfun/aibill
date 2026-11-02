#!/usr/bin/env python3
"""Generate deterministic demo fixtures for aibill (seeded RNG).

Writes:
  examples/session-before.jsonl  - Claude Code session log (~150 tool calls)
  examples/session-after.jsonl   - same session minus the mcp__doc_lookup calls
  examples/mcp-sample.jsonl      - generic aibill MCP JSONL (hand-authored below)

The session is synthetic but the CLI output shown in the demo is 100% real:
the demo script runs the built CLI against these files and captures verbatim
output. Fictional project names only (no real code, no real people).
"""

import json
import os
import random

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXAMPLES = os.path.join(ROOT, "examples")
RNG = random.Random(20261102)
MODEL = "claude-opus-4-6"

DIRS = ["src/shop", "src/api", "src/web", "src/db", "src/auth", "tests", "docs"]
FILES = [f"{d}/module-{i:02d}.{'tsx' if d == 'src/web' else 'ts'}"
         for d in DIRS for i in range(9)]  # 63 files: Read inputs rarely collide

TOOLS = [
    # name, count, input_range, output_range, input_builder(i)
    ("Read", 34, (800, 2000), (2000, 6000), lambda i: {"file_path": RNG.choice(FILES)}),
    ("Bash", 24, (300, 800), (500, 3000), lambda i: {"command": RNG.choice(["npm test", "tsc --noEmit", "git status", "ls src"])}),
    ("mcp__codebase_search", 24, (2000, 4000), (8000, 16000),
     lambda i: {"query": RNG.choice(["cart total rounding", "checkout discount flow", "api error handling"]) + f" (pass {i})"}),
    ("mcp__doc_lookup", 30, (1000, 2000), (18000, 26000),
     lambda i: {"topic": RNG.choice(["payment webhooks", "tax rules EU", "shipping zones"]) + f" (section {i})"}),
    ("Grep", 12, (200, 500), (800, 2500),
     lambda i: {"pattern": "TODO", "path": "src"}),  # identical inputs -> duplicate signal
    ("mcp__oneoff_export", 1, (2000, 2000), (50000, 50000),
     lambda i: {"format": "csv", "scope": "all"}),  # single-use signal
]


def msg(tool, inp, in_tok, out_tok):
    return {
        "type": "assistant",
        "message": {
            "model": MODEL,
            "usage": {"input_tokens": in_tok, "output_tokens": out_tok},
            "content": [{"type": "tool_use", "id": f"toolu_{RNG.randrange(10**9)}",
                         "name": tool, "input": inp}],
        },
        "timestamp": "2026-11-02T10:00:00Z",
    }


def main():
    lines = []
    for name, count, in_rng, out_rng, build in TOOLS:
        for i in range(count):
            inp = build(i)
            lines.append(msg(name, inp, RNG.randint(*in_rng), RNG.randint(*out_rng)))
    # A few multi-tool messages to exercise the shared-attribution path.
    for _ in range(6):
        a = {"type": "tool_use", "id": f"toolu_{RNG.randrange(10**9)}",
             "name": "Read", "input": {"file_path": RNG.choice(FILES)}}
        b = {"type": "tool_use", "id": f"toolu_{RNG.randrange(10**9)}",
             "name": "Glob", "input": {"pattern": "src/**/*.test.ts"}}
        in_tok = RNG.randint(1500, 2500)
        out_tok = RNG.randint(3000, 5000)
        lines.append({
            "type": "assistant",
            "message": {"model": MODEL,
                        "usage": {"input_tokens": in_tok, "output_tokens": out_tok},
                        "content": [a, b]},
            "timestamp": "2026-11-02T10:00:00Z",
        })
    RNG.shuffle(lines)
    os.makedirs(EXAMPLES, exist_ok=True)
    with open(os.path.join(EXAMPLES, "session-before.jsonl"), "w") as f:
        for ln in lines:
            f.write(json.dumps(ln) + "\n")
    after = [ln for ln in lines
             if not any(b.get("name") == "mcp__doc_lookup"
                        for b in ln["message"]["content"] if isinstance(b, dict))]
    with open(os.path.join(EXAMPLES, "session-after.jsonl"), "w") as f:
        for ln in after:
            f.write(json.dumps(ln) + "\n")
    print(f"before: {len(lines)} messages, after: {len(after)} messages")


if __name__ == "__main__":
    main()
