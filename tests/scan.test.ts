import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as path from "path";
import { repoRoot } from "./helpers";
import { loadScan } from "../src/scan";

// Fixtures live in tests/fixtures/ (committed): deterministic, no temp files.
const FX = path.join(repoRoot(), "tests", "fixtures");

describe("loadScan", () => {
  it("loads a single file", () => {
    const out = loadScan(path.join(FX, "scan-dir", "a.jsonl"));
    assert.equal(out.format, "claude-code");
    assert.equal(out.summary.totalCalls, 1);
    assert.equal(out.summary.tools[0].tool, "Read");
    assert.equal(out.sourceFiles.length, 1);
  });

  it("loads every .jsonl in a directory and ignores other files", () => {
    const out = loadScan(path.join(FX, "scan-dir"));
    assert.equal(out.summary.totalCalls, 2);
    assert.equal(out.sourceFiles.length, 2);
  });

  it("throws on missing paths", () => {
    assert.throws(() => loadScan(path.join(FX, "does-not-exist.jsonl")), /path not found/);
  });

  it("throws when a directory holds no .jsonl files", () => {
    assert.throws(() => loadScan(path.join(FX, "scan-nojsonl")), /no .jsonl transcript files/);
  });

  it("throws on a non-jsonl file", () => {
    assert.throws(
      () => loadScan(path.join(FX, "scan-dir", "notes.txt")),
      /expected a .jsonl file/,
    );
  });
});
