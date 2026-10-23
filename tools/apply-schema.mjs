#!/usr/bin/env node
/* =============================================================================
 *  apply-schema.mjs — تنفيذ supabase/schema.sql على مشروع Supabase
 *
 *  الاستخدام:
 *    SUPABASE_ACCESS_TOKEN=sbp_xxx \
 *    node tools/apply-schema.mjs [--ref esbliordpjnogvroaqla] [--admin-email x@y.z --admin-pass '...' --admin-name 'مدير']
 *
 *  يحتاج Personal Access Token بصلاحية: Database → Read-write
 *  (راجع README قسم "الربط بقاعدة البيانات")
 * ========================================================================== */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const API = "https://api.supabase.com/v1";

/* ---------- معطيات سطر الأوامر ---------- */
const args = process.argv.slice(2);
const arg = (name, def = null) => {
  const i = args.indexOf("--" + name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def;
};
const has = (name) => args.includes("--" + name);

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_PAT;
const REF = arg("ref", process.env.SUPABASE_REF || "esbliordpjnogvroaqla");
const SCHEMA = join(ROOT, arg("schema", "supabase/schema.sql"));
const ADMIN_EMAIL = arg("admin-email");
const ADMIN_PASS = arg("admin-pass");
const ADMIN_NAME = arg("admin-name", "مدير المدرسة");

if (!TOKEN) {
  console.error("❌缺少 SUPABASE_ACCESS_TOKEN — ضعه في متغير البيئة ثم أعد التشغيل");
  process.exit(1);
}

/* ---------- تقسيم SQL إلى جمل مع احترام dollar-quoting والنصوص والتعليقات ---------- */
function splitStatements(sql) {
  const out = [];
  let buf = "", i = 0, dollarTag = null;
  while (i < sql.length) {
    const two = sql.slice(i, i + 2);
    if (dollarTag) {                       // داخل كتلة $$
      if (sql.startsWith(dollarTag, i)) { buf += dollarTag; i += dollarTag.length; dollarTag = null; continue; }
      buf += sql[i++]; continue;
    }
    if (sql[i] === "'") {                   // ن��ص
      buf += sql[i++];
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") { buf += "''"; i += 2; continue; }
        buf += sql[i];
        if (sql[i] === "'") { i++; break; }
        i++;
      }
      continue;
    }
    if (two === "--") {                     // تعليق سطر
      const nl = sql.indexOf("\n", i); i = nl < 0 ? sql.length : nl; continue;
    }
    if (two === "/*") {                     // تعليق كتلة
      const end = sql.indexOf("*/", i); i = end < 0 ? sql.length : end + 2; continue;
    }
    if (sql[i] === "$") {                   // وسم $tag$
      const m = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(i));
      if (m) { dollarTag = m[0]; buf += m[0]; i += m[0].length; continue; }
    }
    if (sql[i] === ";") { if (buf.trim()) out.push(buf.trim()); buf = ""; i++; continue; }
    buf += sql[i++];
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/* ---------- تنفيذ جملة عبر Management API ---------- */
async function query(sql) {
  const res = await fetch(`${API}/projects/${REF}/database/query`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try { const j = JSON.parse(text); msg = j.message || j.error || j.hint || text; } catch {}
    throw new Error(`[HTTP ${res.status}] ${String(msg).slice(0, 400)}`);
  }
  try { return JSON.parse(text); } catch { return text; }
}

/* ---------- التشغيل ---------- */
(async () => {
  console.log(`\n▶ المشروع: ${REF}`);
  console.log(`▶ المخطط : ${SCHEMA}\n`);

  // 1) فحص الاتصال
  try {
    const p = await query("select 1 as ok");
    console.log("✅ الاتصال بالمشروع ناجح");
  } catch (e) {
    console.error("❌ فشل الاتصال:", e.message);
    console.error("   تأكد من صحة التوكن ومن منحه صلاحية Database → Read-write");
    process.exit(1);
  }

  // 2) تنفيذ المخطط جملة جملة
  const stmts = splitStatements(readFileSync(SCHEMA, "utf8"));
  console.log(`▶ عدد الجمل: ${stmts.length}\n`);
  let ok = 0, failed = [];
  for (let i = 0; i < stmts.length; i++) {
    const s = stmts[i];
    const label = s.split("\n").find((l) => l.trim() && !l.trim().startsWith("--"))?.slice(0, 58) || "?";
    try {
      await query(s);
      ok++;
      console.log(`  ✅ [${i + 1}/${stmts.length}] ${label}`);
    } catch (e) {
      failed.push({ i: i + 1, label, error: e.message });
      console.log(`  ❌ [${i + 1}/${stmts.length}] ${label}\n     ${e.message}`);
    }
  }

  // 3) التحقق من الجداول
  console.log("\n▶ الجداول المنشأة:");
  const tbls = await query(
    "select tablename from pg_tables where schemaname='public' order by tablename"
  );
  const names = (Array.isArray(tbls) ? tbls : []).map((r) => r.tablename);
  for (const t of names) console.log("   •", t);
  console.log(`   الإجمالي: ${names.length}`);

  // 4) إنشاء حساب المدير (اختياري)
  if (ADMIN_EMAIL && ADMIN_PASS) {
    console.log(`\n▶ إنشاء حساب المدير: ${ADMIN_EMAIL}`);
    const esc = (v) => String(v).replace(/'/g, "''");
    try {
      const r = await query(
        `select public.admin_create_user('${esc(ADMIN_EMAIL)}','${esc(ADMIN_PASS)}','${esc(ADMIN_NAME)}','admin') as uid`
      );
      console.log("   ✅ UID =", JSON.stringify(r));
    } catch (e) {
      console.log("   ⚠️ ", e.message);
      console.log("   (إنشئ الحساب يدوياً من Authentication → Users ثم رقّه بالأمر التالي)");
      console.log(`   update public.profiles set role='admin' where id='<UID>';`);
    }
  }

  console.log(`\n${"=".repeat(52)}`);
  console.log(`النتيجة: ✅ نجح ${ok} / ${ok + failed.length}` + (failed.length ? `  ❌ فشل ${failed.length}` : ""));
  if (failed.length) {
    console.log("\nالجمل الفاشلة:");
    for (const f of failed) console.log(`  [${f.i}] ${f.label}\n      ${f.error}`);
  }
  console.log("=".repeat(52));
  process.exit(failed.length ? 1 : 0);
})();
