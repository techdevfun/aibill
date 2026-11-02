import * as fs from "fs";
import * as path from "path";

/**
 * Repo root, whether tests run from tests/ (bun / tsx, direct TS)
 * or out/tests/ (tsc build). Walks up until package.json is found.
 */
export function repoRoot(startDir: string = __dirname): string {
  let dir = startDir;
  for (;;) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("repo root not found");
    dir = parent;
  }
}
