#!/usr/bin/env node
// Convert transgui's original `lang/transgui.*` files into our
// `src/locales/<code>.json` dictionaries.
//
// The original format is `English source text=Translation` (one per line), so
// the keys line up with the English strings used in our components. Only the
// strings that exist in both are imported; our own overrides are merged on top.
//
// Usage:
//   node scripts/import-transgui-lang.mjs <path-to-transgui-repo>
//   node scripts/import-transgui-lang.mjs ../transgui          # default

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = process.argv[2] ?? join(here, "..", "..", "transgui");
const langDir = join(repo, "lang");
const outDir = join(here, "..", "src", "locales");

if (!existsSync(langDir)) {
  console.error(`lang dir not found: ${langDir}`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const SKIP = new Set(["template"]);

// transgui's locale codes -> ours.
const CODE_MAP = {
  zh: "zh-CN",
  zh_tw: "zh-TW",
  pt: "pt",
  pt_br: "pt_BR",
};

function parseTransguiLang(text) {
  const out = {};
  // Lines are `Key=Value`; the value may contain '=' and escaped sequences.
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line || line.startsWith("TranslationLanguage=")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq);
    const val = line.slice(eq + 1);
    if (!val) continue;
    out[key] = val;
  }
  return out;
}

function existing(base) {
  try {
    return JSON.parse(readFileSync(base, "utf8"));
  } catch {
    return {};
  }
}

let written = 0;
for (const file of readdirSync(langDir)) {
  if (!file.startsWith("transgui.")) continue;
  const code = file.slice("transgui.".length);
  if (SKIP.has(code)) continue;

  const src = readFileSync(join(langDir, file), "utf8");
  const imported = parseTransguiLang(src);
  const outCode = CODE_MAP[code] ?? code;

  const target = join(outDir, `${outCode}.json`);
  // Our own translations win over the imported ones.
  const merged = { ...imported, ...existing(target) };
  writeFileSync(target, JSON.stringify(merged, null, 2) + "\n", "utf8");
  written += 1;
  console.log(`${outCode}: ${Object.keys(imported).length} imported, ${Object.keys(merged).length} total`);
}

console.log(`\nwrote ${written} locale file(s) to src/locales/`);
