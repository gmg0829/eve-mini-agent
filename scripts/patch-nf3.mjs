#!/usr/bin/env node
// Patch nf3 的 ESM 加载 CJS named-export bug。
// 问题：nf3/dist/_chunks/trace.mjs 里 `import { nodeFileTrace } from "@vercel/nft"`
//   在 Node 24 的 ESM 解析器下,@vercel/nft 是 CJS,动态 export 识别不到 → build 挂。
// 改法：改成 default import + 解构。
//
// 本脚本是幂等的,重复跑不会出问题。
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const target = resolve(__dirname, "..", "node_modules", "nf3", "dist", "_chunks", "trace.mjs");

const before = 'import { nodeFileTrace } from "@vercel/nft";';
const after  = 'import nft from "@vercel/nft"; const { nodeFileTrace } = nft;';

try {
  const src = await readFile(target, "utf8");
  if (src.includes(after)) {
    console.log("[patch-nf3] already patched");
    process.exit(0);
  }
  if (!src.includes(before)) {
    console.log("[patch-nf3] no original line found, skipping (different nf3 version?)");
    process.exit(0);
  }
  await writeFile(target, src.replace(before, after));
  console.log("[patch-nf3] patched", target);
} catch (e) {
  if (e.code === "ENOENT") {
    console.log("[patch-nf3] nf3 not installed yet, nothing to do");
    process.exit(0);
  }
  throw e;
}
