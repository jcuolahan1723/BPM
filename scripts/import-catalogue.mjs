// Builds src/catalogue-data.js from Microsoft's Business Process Catalog spreadsheet.
//
//   npm run import-catalogue -- "Std Business Process Catalog MAR 2026.xlsx"
//
// Download the latest catalog from https://aka.ms/BusinessProcessCatalog, run this, review the
// summary it prints (and `git diff --stat`), then build and deploy.
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error('Usage: npm run import-catalogue -- "<catalog spreadsheet>.xlsx"');
  process.exit(1);
}
XLSX.set_fs(fs);
const OUT = path.resolve("src/catalogue-data.js");

// Families shown as filter buttons (the spreadsheet also has Productivity and Power Platform).
const APP_FAMILIES = ["Business Central", "Finance and Operations", "Customer Engagement", "Azure"];
const LEVEL = { "End to end": 1, "Process area": 2, "Process": 3, "Scenario": 4, "System process": 5, "Test case": 6 };
const TITLE_COL = { 1: "EPIC", 2: "Area", 3: "Process", 4: "Scennario", 5: "System Process", 6: "Test Case/Config" };
const CODE_RE = /^\d{2}\.\d{2}\.\d{3}\.\d{3}(\.\d{3}){0,2}$/;

/* ── Read ── */
const wb = XLSX.readFile(file);
const sheetName = wb.SheetNames.find((n) => /process catalog/i.test(n)) || wb.SheetNames[0];
const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });
const required = ["Process sequence ID", "Work item type", "Description", "Products", "Application family", "Microsoft references", "Catalog status"];
const missingCols = required.filter((c) => !(c in (rows[0] || {})));
if (missingCols.length) { console.error("Spreadsheet is missing columns:", missingCols.join(", ")); process.exit(1); }

const text = (v) => String(v ?? "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
const list = (v) => text(v).split(";").map((s) => s.trim()).filter(Boolean);
const report = { deprecated: [], duplicates: [], skipped: [] };

// One row per ID. Microsoft keeps a deprecated row next to its replacement under the same ID;
// the current row wins, and IDs that are only deprecated are left out.
const byId = new Map();
for (const r of rows) {
  const q = text(r["Process sequence ID"]);
  const l = LEVEL[text(r["Work item type"])];
  if (!l) continue; // the "Tree" root row
  if (!CODE_RE.test(q)) { report.skipped.push(q || "(blank id)"); continue; }
  const deprecated = /deprecated/i.test(r["Catalog status"]);
  const prev = byId.get(q);
  if (prev) report.duplicates.push(q);
  if (!prev || (prev.deprecated && !deprecated)) byId.set(q, { r, l, q, deprecated });
}
for (const [q, e] of byId) if (e.deprecated) { report.deprecated.push(`${q} ${text(e.r[TITLE_COL[e.l]])}`); byId.delete(q); }

/* ── Items ── */
function toItem({ r, l, q }) {
  const item = { q, t: text(r[TITLE_COL[l]]) };
  if (l <= 4) item.l = l;
  item.d = text(r["Description"]);
  const p = list(r["Products"]).join("; ");                     if (p) item.p = p;
  const refs = text(r["Microsoft references"]);                 if (refs) item.r = refs;
  const partner = text(r["Partner references"]);                if (partner) item.pr = partner;
  const menuPath = text(r["Menu path"]);                        if (menuPath) item.m = menuPath;
  const menuItem = text(r["Menu item name"]);                   if (menuItem) item.mi = menuItem;
  const apqc = text(r["APQC ID"]);                              if (apqc) item.apqc = apqc;
  if (/microsoft original/i.test(r["Business process flow status"])) item.bpf = 1;
  return item;
}
const items = [...byId.values()].sort((a, b) => a.q.localeCompare(b.q, "en", { numeric: true }));
const prefix = (q) => q.split(".")[0];
const l3Of = (q) => q.split(".").slice(0, 3).join(".") + ".000";
const parentOf = (q) => q.split(".").slice(0, -1).join(".");

// Orphans (a child whose parent is missing or deprecated) would never be reachable in the app.
const ids = new Set(items.map((e) => e.q));
const parentCode = (e) =>
  e.l === 1 ? null : e.l === 2 ? `${prefix(e.q)}.00.000.000` : e.l === 3 ? e.q.slice(0, 5) + ".000.000" : e.l === 4 ? l3Of(e.q) : parentOf(e.q);
const orphans = items.filter((e) => e.l > 1 && !ids.has(parentCode(e)));
const kept = items.filter((e) => !orphans.includes(e));

const PER_L1 = {}, SP_INDEX = {}, TC_INDEX = {};
for (const e of kept) {
  const it = toItem(e), k = prefix(e.q);
  if (e.l <= 4) (PER_L1[k] ||= []).push(it);
  else if (e.l === 5) ((SP_INDEX[k] ||= {})[parentOf(e.q)] ||= []).push(it);
  else ((TC_INDEX[k] ||= {})[parentOf(e.q)] ||= []).push(it);
}
for (const k of Object.keys(PER_L1)) { SP_INDEX[k] ||= {}; TC_INDEX[k] ||= {}; }

// Process rows carry their system-process and test-case counts.
for (const [k, list3] of Object.entries(PER_L1)) for (const it of list3) {
  if (it.l !== 3) continue;
  const pfx = it.q.split(".").slice(0, 3).join(".") + ".";
  const sps = Object.entries(SP_INDEX[k]).filter(([l4]) => l4.startsWith(pfx)).flatMap(([, v]) => v);
  it.sp = sps.length;
  it.tc = sps.reduce((a, sp) => a + (TC_INDEX[k][sp.q] || []).length, 0);
}

/* ── Family index: a process belongs to the families in its own "Application family" column ── */
const FAM_INDEX = {};
for (const e of kept) {
  if (e.l !== 2 && e.l !== 3) continue;
  for (const fam of list(e.r["Application family"])) {
    const f = (FAM_INDEX[fam] ||= { l1: new Set(), l2: new Set(), l3: new Set() });
    f.l1.add(prefix(e.q));
    f[e.l === 2 ? "l2" : "l3"].add(e.q);
    if (e.l === 3) f.l2.add(e.q.slice(0, 5) + ".000.000");
  }
}
for (const f of Object.values(FAM_INDEX)) for (const k of ["l1", "l2", "l3"]) f[k] = [...f[k]].sort();

/* ── Summary cards (one per end-to-end process, alphabetical as before) ── */
const all4 = Object.values(PER_L1).flat();
const count = (k, l) => (PER_L1[k] || []).filter((i) => i.l === l).length;
const SUMMARY = all4.filter((i) => i.l === 1).map((l1) => {
  const k = prefix(l1.q);
  return {
    q: l1.q, t: l1.t, d: l1.d, p: l1.p || "",
    l2: count(k, 2), l3: count(k, 3), l4: count(k, 4),
    l5: Object.values(SP_INDEX[k]).flat().length,
    l6: Object.values(TC_INDEX[k]).flat().length,
    areas: PER_L1[k].filter((i) => i.l === 2).map((a) => ({ q: a.q, t: a.t })),
  };
}).sort((a, b) => a.t.localeCompare(b.t));

const TOTALS = {
  l1: SUMMARY.length, l2: all4.filter((i) => i.l === 2).length, l3: all4.filter((i) => i.l === 3).length,
  l4: all4.filter((i) => i.l === 4).length,
  l5: Object.values(SP_INDEX).flatMap((o) => Object.values(o)).flat().length,
  l6: Object.values(TC_INDEX).flatMap((o) => Object.values(o)).flat().length,
};

/* ── Write ── */
const source = path.basename(file);
const version = (source.match(/(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s*(\d{4})/i) || []).slice(1).join(" ").toUpperCase();
const CATALOGUE_INFO = { source, version: version || "unknown", imported: new Date().toISOString().slice(0, 10) };
const out = [
  "// Generated by scripts/import-catalogue.mjs from Microsoft's Business Process Catalog. Do not edit by hand.",
  `export const CATALOGUE_INFO = ${JSON.stringify(CATALOGUE_INFO)};`,
  `export const APP_FAMILIES = ${JSON.stringify(APP_FAMILIES)};`,
  `export const TOTALS = ${JSON.stringify(TOTALS)};`,
  `export const SUMMARY = ${JSON.stringify(SUMMARY)};`,
  `export const PER_L1 = ${JSON.stringify(PER_L1)};`,
  `export const SP_INDEX = ${JSON.stringify(SP_INDEX)};`,
  `export const TC_INDEX = ${JSON.stringify(TC_INDEX)};`,
  `export const FAM_INDEX = ${JSON.stringify(FAM_INDEX)};`,
  "",
].join("\n");
fs.writeFileSync(OUT, out);

/* ── Report ── */
const withField = (f) => kept.filter((e) => toItem(e)[f]).length;
console.log(`Imported ${source} (${CATALOGUE_INFO.version}) → ${path.relative(process.cwd(), OUT)} (${(out.length / 1024 / 1024).toFixed(2)} MB)`);
console.log("Totals:", TOTALS);
console.log(`Learn links: ${withField("r")} · menu items: ${withField("mi")} · APQC ids: ${withField("apqc")} · Microsoft flows: ${withField("bpf")}`);
console.log(`Deprecated rows left out: ${report.deprecated.length}${report.deprecated.length ? "\n  " + report.deprecated.join("\n  ") : ""}`);
console.log(`Duplicate IDs resolved: ${report.duplicates.length}`);
if (orphans.length) console.log(`Unreachable (parent missing/deprecated), left out: ${orphans.length}\n  ${orphans.map((e) => e.q).join(", ")}`);
if (report.skipped.length) console.log(`Rows with an invalid ID, skipped: ${report.skipped.join(", ")}`);
