#!/usr/bin/env node
/**
 * Theme migration: slate/blue/rose/violet/emerald → mbox gold tokens in feature TSX.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "apps/web/src/features");

const replacements = [
  ["border-slate-800", "border-[rgba(223,179,134,0.12)]"],
  ["border-slate-900", "border-[rgba(223,179,134,0.1)]"],
  ["border-slate-700", "border-[rgba(223,179,134,0.18)]"],
  ["bg-slate-950/70", "bg-[rgba(18,14,24,0.7)]"],
  ["bg-slate-950/60", "bg-[rgba(18,14,24,0.6)]"],
  ["bg-slate-950/50", "bg-[rgba(18,14,24,0.5)]"],
  ["bg-slate-950/40", "bg-[rgba(18,14,24,0.45)]"],
  ["bg-slate-950/80", "bg-[rgba(18,14,24,0.8)]"],
  ["bg-slate-950", "bg-[rgba(18,14,24,0.75)]"],
  ["bg-slate-900/80", "bg-[rgba(18,14,24,0.8)]"],
  ["bg-slate-900/60", "bg-[rgba(18,14,24,0.65)]"],
  ["bg-slate-900/50", "bg-[rgba(18,14,24,0.55)]"],
  ["bg-slate-900", "bg-[rgba(18,14,24,0.75)]"],
  ["bg-slate-800", "bg-[rgba(18,14,24,0.85)]"],
  ["bg-slate-700", "bg-[rgba(18,14,24,0.7)]"],
  ["text-slate-100", "text-mbox-text"],
  ["text-slate-200", "text-mbox-text"],
  ["text-slate-300", "text-mbox-muted"],
  ["text-slate-400", "text-mbox-muted"],
  ["text-slate-500", "text-mbox-subtle"],
  ["text-slate-600", "text-mbox-subtle/80"],
  ["hover:border-slate-700", "hover:border-mbox-gold/25"],
  ["hover:border-slate-600", "hover:border-mbox-gold/30"],
  ["hover:text-slate-300", "hover:text-mbox-text"],
  ["hover:text-slate-200", "hover:text-mbox-text"],
  ["placeholder:text-slate-600", "placeholder:text-mbox-subtle"],
  ["focus:border-violet-500", "focus:border-mbox-gold"],
  ["focus:ring-violet-500/40", "focus:ring-mbox-gold/30"],
  ["focus:ring-rose-500", "focus:ring-mbox-gold"],
  ["text-rose-200/90", "text-mbox-gold/90"],
  ["text-rose-300", "text-mbox-gold"],
  ["text-rose-400", "text-mbox-gold"],
  ["text-rose-400/90", "text-mbox-gold/90"],
  ["text-violet-300/90", "text-mbox-gold/90"],
  ["text-violet-300", "text-mbox-gold"],
  ["text-violet-400/80", "text-mbox-gold/80"],
  ["text-sky-300/90", "text-mbox-gold/90"],
  ["text-sky-400", "text-mbox-gold"],
  ["text-sky-100", "text-mbox-gold"],
  ["text-sky-300", "text-mbox-gold"],
  ["border-rose-400/50", "border-mbox-gold/50"],
  ["border-rose-400/60", "border-mbox-gold/60"],
  ["border-rose-500/30", "border-mbox-gold/30"],
  ["border-rose-500/20", "border-mbox-gold/20"],
  ["bg-rose-500/15", "bg-mbox-gold/15"],
  ["bg-rose-500/10", "bg-mbox-gold/10"],
  ["bg-rose-950/20", "bg-mbox-gold/10"],
  ["border-violet-400/50", "border-mbox-gold/50"],
  ["border-violet-400/60", "border-mbox-gold/60"],
  ["bg-violet-500/15", "bg-mbox-gold/15"],
  ["bg-violet-500/10", "bg-mbox-gold/10"],
  ["text-violet-100", "text-mbox-gold"],
  ["text-violet-200", "text-mbox-gold"],
  ["accent-violet-400", "accent-mbox-gold"],
  ["text-rose-500", "text-mbox-gold"],
  ["text-violet-500", "text-mbox-gold"],
  ["border-sky-500/40", "border-mbox-gold/40"],
  ["border-sky-500/20", "border-mbox-gold/20"],
  ["bg-sky-500/10", "bg-mbox-gold/10"],
  ["bg-sky-500/5", "bg-mbox-gold/5"],
  ["hover:bg-sky-500/20", "hover:bg-mbox-gold/20"],
  ["border-indigo-500/40", "border-mbox-gold/40"],
  ["hover:text-rose-300", "hover:text-mbox-gold"],
  ["hover:bg-rose-600", "hover:bg-mbox-gold/80"],
  ["hover:border-sky-500/50", "hover:border-mbox-gold/50"],
  ["hover:text-sky-300", "hover:text-mbox-gold"],
  ["disabled:bg-slate-700", "disabled:opacity-50"],
  // emerald → gold
  ["text-emerald-300/90", "text-mbox-gold/90"],
  ["text-emerald-400/95", "text-mbox-gold/95"],
  ["text-emerald-300/80", "text-mbox-gold/80"],
  ["text-emerald-300", "text-mbox-gold"],
  ["text-emerald-400", "text-mbox-gold"],
  ["text-emerald-200", "text-mbox-gold"],
  ["text-emerald-100/90", "text-mbox-gold/90"],
  ["text-emerald-100", "text-mbox-gold"],
  ["text-emerald-50", "text-[#140f09]"],
  ["border-emerald-500/50", "border-mbox-gold/50"],
  ["border-emerald-500/40", "border-mbox-gold/40"],
  ["border-emerald-500/30", "border-mbox-gold/30"],
  ["border-emerald-500/25", "border-mbox-gold/25"],
  ["border-emerald-500/20", "border-mbox-gold/20"],
  ["border-emerald-400/50", "border-mbox-gold/50"],
  ["border-emerald-400", "border-mbox-gold"],
  ["border-2 border-emerald-400/50", "border-2 border-mbox-gold/50"],
  ["bg-emerald-600/95", "bg-mbox-gold"],
  ["bg-emerald-600/90", "bg-mbox-gold"],
  ["bg-emerald-600/30", "bg-mbox-gold/30"],
  ["bg-emerald-500/15", "bg-mbox-gold/15"],
  ["bg-emerald-500/10", "bg-mbox-gold/10"],
  ["bg-emerald-500/8", "bg-mbox-gold/8"],
  ["bg-emerald-500/5", "bg-mbox-gold/5"],
  ["hover:bg-emerald-600/45", "hover:bg-mbox-gold/45"],
  ["hover:bg-emerald-500", "hover:bg-mbox-gold/80"],
  ["hover:bg-emerald-500/25", "hover:bg-mbox-gold/25"],
  ["hover:bg-emerald-500/20", "hover:bg-mbox-gold/20"],
  ["hover:bg-emerald-500/10", "hover:bg-mbox-gold/10"],
  ["hover:border-emerald-500/40", "hover:border-mbox-gold/40"],
  ["ring-emerald-400/40", "ring-mbox-gold/40"],
  ["ring-2 ring-emerald-400/40", "ring-2 ring-mbox-gold/40"],
  ["shadow-emerald-950/40", "shadow-black/40"],
  ["from-emerald-600/30 to-teal-600/20", "from-mbox-gold/30 to-mbox-rose-gold/20"],
  ["focus:ring-emerald-500", "focus:ring-mbox-gold"],
  ["text-emerald-500", "text-mbox-gold"],
  ["accent-emerald-400", "accent-mbox-gold"],
];

function walkTsx(base) {
  const out = [];
  for (const name of readdirSync(base)) {
    const p = join(base, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walkTsx(p));
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

let filesChanged = 0;
for (const file of walkTsx(dir)) {
  let src = readFileSync(file, "utf8");
  const before = src;
  for (const [from, to] of replacements) {
    src = src.split(from).join(to);
  }
  if (src !== before) {
    writeFileSync(file, src, "utf8");
    filesChanged++;
  }
}
console.log(`theme-migrate-features: updated ${filesChanged} files`);
