/* ==========================================================================
 *  اختبار طبقة البيانات (Store) بدون متصفح
 *  التشغيل:  node tools/test-store.mjs
 * ========================================================================== */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

/* ---------- بيئة محاكاة للمتصفح ---------- */
const localStorage = (() => {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    _dump: () => Object.fromEntries(store),
  };
})();

const sandbox = {
  console,
  localStorage,
  crypto: globalThis.crypto,
  navigator: { onLine: false },
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  Promise,
  Date,
  Math,
  JSON,
  Number,
  String,
  Array,
  Object,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

/* ---------- تحميل الملفات ---------- */
function load(file, { globals = {} } = {}) {
  const code = fs.readFileSync(path.join(root, file), "utf8");
  for (const [k, v] of Object.entries(globals)) {
    sandbox[k] = typeof v === "function" ? v() : v;
  }
  vm.runInContext(code, sandbox, { filename: file });
}

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log("  ✅", name); }
  else { fail++; console.log("  ❌", name, extra); }
}

/* ========================================================================== */
console.log("\n=== 1) الإعدادات والتهيئة ===");
load("js/config.js");
check("الإعدادات محمّلة", !!sandbox.APP_CONFIG);
check("مفتاح التخزين الجديد", sandbox.APP_CONFIG.CACHE_KEY === "schooladm_v2");

load("js/supabase.js");
check("وحدة Supabase محمّلة", !!sandbox.SupabaseAPI);
check("وضع غير مُهيّأ قبل الإعداد", sandbox.SupabaseAPI.configured === false);

load("js/store.js");
check("وحدة Store محمّلة", !!sandbox.Store);
check("بدون Supabase = لا عميل", sandbox.SupabaseAPI.client === null);

/* ========================================================================== */
console.log("\n=== 2) عمليات CRUD الأساسية ===");
sandbox.Store.addClass({ name: "الأول أ", gradeLevel: "الأول" });
sandbox.Store.addClass({ name: "الأول ب", gradeLevel: "الأول" });
sandbox.Store.addSubject({ name: "رياضيات", maxScore: 100 });
sandbox.Store.addSubject({ name: "لغة عربية", maxScore: 80 });
check("أُضيفت صفوف", sandbox.Store.state.classes.length === 2);
check("أُضيفت مواد", sandbox.Store.state.subjects.length === 2);

const cls = sandbox.Store.state.classes[0];
const subj = sandbox.Store.state.subjects[0];
const st = sandbox.Store.addStudent({ fullName: "أحمد محمد", studentNo: "S001", classId: cls.id });
check("أُضيف طالب", sandbox.Store.state.students.length === 1);
check("اسم الصف يُقرأ بشكل صحيح", sandbox.Store.Q.className(cls.id) === "الأول أ");

const outbox = sandbox.Store.state.outbox;
check("الطابور يضم كل عمليات الإضافة", outbox.length === 5, `actual=${outbox.length}`);
check("الطابور يحوي عملية للصف", outbox.some((o) => o.table === "classes" && o.data.name === "الأول أ"));
check("بيانات الصف تحوي المعرّف", outbox.find((o) => o.table === "classes").data.id === cls.id);
check("الطالب مسجّل في الطابور", outbox.some((o) => o.table === "students" && o.data.full_name === "أحمد محمد"));

const st2 = sandbox.Store.addStudent({ fullName: "سارة علي", classId: sandbox.Store.state.classes[1].id });

/* ========================================================================== */
console.log("\n=== 3) الحضور ===");
sandbox.Store.setAttendance(st.id, "2026-10-20", "present");
sandbox.Store.setAttendance(st.id, "2026-10-21", "absent");
sandbox.Store.setAttendance(st.id, "2026-10-22", "late");
sandbox.Store.setAttendance(st2.id, "2026-10-20", "present");
const stats = sandbox.Store.Q.attendanceStats(st.id);
check("عدد أيام التسجيل = 3", stats.total === 3, `actual=${stats.total}`);
check("أيام الغياب = 1", stats.absent === 1);
check("نسبة الحضور = 66.7%", stats.rate === 66.7, `actual=${stats.rate}`);
check("حالة الحضور تُقرأ", sandbox.Store.Q.attendanceOf(st.id, "2026-10-21") === "absent");
check("الغياب الافتراضي = حاضر", sandbox.Store.Q.attendanceOf(st.id, "2026-11-01") === "present");

/* ========================================================================== */
console.log("\n=== 4) الدرجات ===");
sandbox.Store.setGrade(st.id, subj.id, "first", 85, 100);
sandbox.Store.setGrade(st.id, sandbox.Store.state.subjects[1].id, "first", 64, 80);
check("الدرجة تُقرأ", sandbox.Store.Q.gradeOf(st.id, subj.id, "first") === 85);
check("المتوسط محسوب", sandbox.Store.Q.average(st.id, "first") === 82.5, `actual=${sandbox.Store.Q.average(st.id, "first")}`);

/* ========================================================================== */
console.log("\n=== 5) الحذف والتنظيف ===");
sandbox.Store.removeStudent(st.id);
check("حُذف الطالب", sandbox.Store.state.students.length === 1);
check("حُذفت درجاته", !Object.keys(sandbox.Store.state.grades).some((k) => k.includes(st.id)));
check("حُذف حضوره", !Object.keys(sandbox.Store.state.attendance).some((k) => k.includes(st.id)));

/* ========================================================================== */
console.log("\n=== 6) الترحيل من النسخة القديمة (school_data_v1) ===");
localStorage.setItem("school_data_v1", JSON.stringify({
  students: [
    { id: "a", name: "طالب قديم ١", cls: "الثالث أ", sid: "OLD1" },
    { id: "b", name: "طالب قديم ٢", cls: "الثالث أ", sid: "OLD2" },
  ],
  subjects: [{ id: "s1", name: "علوم", max: 50 }],
  attendance: { "2026-09-01": { a: true, b: false } },
  grades: { a: { s1: 45 } },
}));

const res = sandbox.Store.importLegacy();
check("الترحيل نجح", res.ok === true, JSON.stringify(res));
check("نُقل طالبان", res.students === 2);
check("نُقلت مادة واحدة", res.subjects === 1);
const oldStudents = sandbox.Store.state.students.filter((s) => s.fullName.startsWith("طالب قديم"));
check("الطلاب القديمون موجودون", oldStudents.length === 2);
check("أُنشئ صف من اسم الشعبة القديمة", sandbox.Store.state.classes.some((c) => c.name === "الثالث أ"));
const oldStu = oldStudents[0];
check("الرقم التسلسلي انتقل", oldStu.studentNo === "OLD1");
check("الحضور انتقل (حاضر)", sandbox.Store.Q.attendanceOf(oldStu.id, "2026-09-01") === "present");
const oldStu2 = oldStudents[1];
check("الحضور انتقل (غائب)", sandbox.Store.Q.attendanceOf(oldStu2.id, "2026-09-01") === "absent");
const oldSubj = sandbox.Store.state.subjects.find((s) => s.name === "علوم");
check("الدرجة انتقلت مع الدرجة العظمى", sandbox.Store.Q.gradeOf(oldStu.id, oldSubj.id, "first") === 45);

/* ========================================================================== */
console.log("\n=== 7) الحفظ المحلي والاستعادة ===");
sandbox.Store.saveLocal();
const raw = JSON.parse(localStorage.getItem("schooladm_v2"));
check("الحُفظ المحلي يعمل", !!raw && raw.students.length === 3);
check("الطابور محفوظ", Array.isArray(raw.outbox) && raw.outbox.length > 0);

/* ========================================================================== */
console.log("\n=== 8) التصدير والاستيراد ===");
const dump = sandbox.Store.exportJSON();
const parsed = JSON.parse(dump);
check("التصدير JSON صالح", parsed.version === 2 && Array.isArray(parsed.students));
const before = sandbox.Store.state.students.length;
sandbox.Store.importJSON(parsed);
check("الاستيراد يحافظ على البيانات", sandbox.Store.state.students.length === before);

/* ========================================================================== */
console.log("\n=== 9) الإعدادات وسنة الفصل ===");
sandbox.Store.setSettings({ schoolName: "مدرسة النور", academicYear: "2026-2027", currentTerm: "second" });
check("اسم المدرسة حُفظ", sandbox.Store.state.settings.schoolName === "مدرسة النور");
check("الفصل الحالي = الثاني", sandbox.Store.state.settings.currentTerm === "second");
check("درجات الفصل الثاني مفصولة", sandbox.Store.Q.gradeOf(st2.id, subj.id, "second") === undefined);

/* ========================================================================== */
console.log(`\n${"=".repeat(52)}`);
console.log(`النتيجة:  ✅ ناجح: ${pass}   ❌ فاشل: ${fail}`);
console.log("=".repeat(52));
process.exit(fail ? 1 : 0);
