import dotenv from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "url";

/** `files_unzipped` ディレクトリ（このファイルと同じ階層） */
const filesUnzippedDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url))
);

/** このフォルダから親へ最大 max 階層たどり、各階の `.env` パス（近い順） */
function collectEnvPathsUpward(startDir, maxDepth = 8) {
  const paths = [];
  let d = path.resolve(startDir);
  for (let i = 0; i < maxDepth; i++) {
    paths.push(path.join(d, ".env"));
    const parent = path.dirname(d);
    if (parent === d) break;
    d = parent;
  }
  return paths;
}

/** README + automation-projects がある階を「クロードコードまとめ」ルートとみなす */
function findMonorepoRoot(startDir) {
  let d = path.resolve(startDir);
  for (let i = 0; i < 8; i++) {
    if (
      existsSync(path.join(d, "README.md")) &&
      existsSync(path.join(d, "automation-projects"))
    ) {
      return d;
    }
    const parent = path.dirname(d);
    if (parent === d) return null;
    d = parent;
  }
  return null;
}

/**
 * ルート→子の順で複数 .env を読み、**空文字の値は無視**（`ANTHROPIC_API_KEY=` だけの行で上書き消ししない）
 * 同じキーは後から読んだ非空値が優先。
 */
function applyEnvFiles(pathsInOrder) {
  const merged = {};
  for (const p of pathsInOrder) {
    if (!existsSync(p)) continue;
    try {
      const parsed = dotenv.parse(readFileSync(p, "utf8"));
      for (const [k, v] of Object.entries(parsed)) {
        if (v != null && String(v).trim() !== "") {
          merged[k] = v;
        }
      }
    } catch {
      /* 読めないファイルはスキップ */
    }
  }
  for (const [k, v] of Object.entries(merged)) {
    process.env[k] = v;
  }
}

/** 祖先→子の順の .env パス（重複なし） */
function envPathsRootToLocal() {
  const nearestFirst = collectEnvPathsUpward(filesUnzippedDir);
  const rootToLocal = nearestFirst.slice().reverse();

  const monorepo = findMonorepoRoot(filesUnzippedDir);
  const extra = monorepo
    ? path.join(monorepo, "note-buzz-engine", ".env")
    : null;

  const out = [];
  const seen = new Set();
  for (const p of rootToLocal) {
    if (extra && p === path.join(filesUnzippedDir, ".env") && !seen.has(extra)) {
      if (existsSync(extra)) {
        out.push(extra);
        seen.add(extra);
      }
    }
    if (!seen.has(p)) {
      out.push(p);
      seen.add(p);
    }
  }
  return out;
}

export function loadAppEnv() {
  applyEnvFiles(envPathsRootToLocal());
}

export function envSearchPathsForHelp() {
  return envPathsRootToLocal();
}
