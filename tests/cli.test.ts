import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseArgs, run, UsageError, VERSION } from "../src/cli";

describe("parseArgs", () => {
  it("parses scan with flags", () => {
    const p = parseArgs(["node", "aibill", "scan", "x.jsonl", "--json"]);
    assert.equal(p.command, "scan");
    assert.equal(p.target, "x.jsonl");
    assert.equal(p.global.json, true);
  });

  it("parses cut with --top", () => {
    const p = parseArgs(["node", "aibill", "cut", "x.jsonl", "--top", "3"]);
    assert.equal(p.command, "cut");
    assert.equal(p.top, 3);
  });

  it("parses diff with --before/--after", () => {
    const p = parseArgs(["node", "aibill", "diff", "--before", "a.jsonl", "--after", "b.jsonl"]);
    assert.equal(p.command, "diff");
    assert.equal(p.before, "a.jsonl");
    assert.equal(p.after, "b.jsonl");
  });

  it("parses budget with --max-usd", () => {
    const p = parseArgs(["node", "aibill", "budget", "--max-usd", "8.5", "x.jsonl"]);
    assert.equal(p.command, "budget");
    assert.equal(p.maxUsd, 8.5);
  });

  it("rejects unknown commands", () => {
    assert.throws(() => parseArgs(["node", "aibill", "compress"]), UsageError);
  });

  it("rejects cut without --top", () => {
    assert.throws(() => parseArgs(["node", "aibill", "cut", "x.jsonl"]), /--top/);
  });

  it("rejects diff without both sides", () => {
    assert.throws(() => parseArgs(["node", "aibill", "diff", "--before", "a.jsonl"]), /--before/);
  });

  it("rejects budget without --max-usd", () => {
    assert.throws(() => parseArgs(["node", "aibill", "budget", "x.jsonl"]), /--max-usd/);
  });

  it("rejects unknown flags", () => {
    assert.throws(() => parseArgs(["node", "aibill", "scan", "x.jsonl", "--bogus"]), /unknown flag/);
  });

  it("routes help and version", () => {
    assert.equal(parseArgs(["node", "aibill"]).command, "help");
    assert.equal(parseArgs(["node", "aibill", "--help"]).command, "help");
    assert.equal(parseArgs(["node", "aibill", "--version"]).command, "version");
  });
});

describe("run", () => {
  it("version prints the version and exits 0", () => {
    assert.equal(typeof VERSION, "string");
    assert.equal(run(["node", "aibill", "--version"]), 0);
  });

  it("no command exits 0 on help", () => {
    assert.equal(run(["node", "aibill", "--help"]), 0);
  });

  it("unknown command exits 2", () => {
    assert.equal(run(["node", "aibill", "nope"]), 2);
  });

  it("missing file exits 2", () => {
    assert.equal(run(["node", "aibill", "scan", "/no/such.jsonl"]), 2);
  });
});
