/* ==========================================================================
 *  اختبار الواجهة (DOM) باستخدام jsdom
 *  التشغيل:  node tools/test-ui.mjs
 *  يتحقق من: تحميل التطبيق بلا أخطاء، إنشاء البيانات، التبديل بين التبويبات،
 *            العرض الفعلي للجداول والنوافذ.
 * ========================================================================== */
import fs from "node:fs";
import path from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

let pass = 0, fail = 0;
const errors = [];
const check = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ✅", name); }
  else { fail++; console.log("  ❌", name, extra); }
};

/* ---------- تشغيل كونسول捕获 الأخطاء ---------- */
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push("jsdomError: " + e.message));
vc.on("error", (...a) => errors.push("console.error: " + a.join(" ")));

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  url: "http://localhost:8099/index.html",
  virtualConsole: vc,
  resources: undefined, // لا نحمّل CDN
});

const { window } = dom;
const { document } = window;

/* ---------- تنفيذ ملفات التطبيق يدوياً (jsdom لا يحمّل ملفات خارجية) ---------- */
function run(file) {
  const code = fs.readFileSync(path.join(root, file), "utf8");
  try {
    window.eval(code);
  } catch (e) {
    errors.push(`${file}: ${e.message}`);
  }
}

["js/config.js", "js/supabase.js", "js/store.js", "js/ui.js", "js/auth.js",
 "js/views/dashboard.js", "js/views/students.js", "js/views/classes.js",
 "js/views/subjects.js", "js/views/attendance.js", "js/views/grades.js",
 "js/views/reports.js", "js/views/users.js", "js/views/settings.js", "js/app.js"]
  .forEach(run);

/* ---------- تشغيل DOMContentLoaded ---------- */
document.dispatchEvent(new window.Event("DOMContentLoaded"));
await new Promise((r) => setTimeout(r, 300));

console.log("\n=== 1) التحميل بلا أخطاء ===");
check("لا توجد أخطاء أثناء التشغيل", errors.length === 0, errors.join(" | "));
check("وحدة Store موجودة", !!window.Store);
check("وحدة UI موجودة", !!window.UI);
check("كل الواجهات محمّلة", ["ViewsDashboard", "ViewsStudents", "ViewsClasses", "ViewsSubjects",
  "ViewsAttendance", "ViewsGrades", "ViewsReports", "ViewsUsers", "ViewsSettings"]
  .every((v) => !!window[v]));

console.log("\n=== 2) التبويبات ===");
const tabs = [...document.querySelectorAll("#nav [data-tab]")].map((b) => b.dataset.tab);
check("عدد التبويبات = 9", tabs.length === 9, `actual=${tabs.length}`);
check("تبويب التقارير موجود", tabs.includes("reports"));
check("لوحة التحكم نشطة افتراضياً",
  document.querySelector("#sec-dashboard").classList.contains("show"));

console.log("\n=== 3) إنشاء بيانات عبر الواجهة ===");
// صف
document.getElementById("clName").value = "الأول أ";
document.getElementById("clGrade").value = "الأول";
window.ViewsClasses.add();
check("أُضيف الصف في الجدول",
  document.querySelectorAll("#clBody tr").length === 1);
check("اسم الصف ظاهر", document.getElementById("clBody").textContent.includes("الأول أ"));

// مادة
document.getElementById("subName").value = "رياضيات";
document.getElementById("subMax").value = "100";
window.ViewsSubjects.add();
check("أُضيفت المادة", document.querySelectorAll("#subBody tr").length === 1);

// طالب
const classId = window.Store.state.classes[0].id;
document.getElementById("stName").value = "أحمد محمد";
document.getElementById("stNo").value = "S001";
document.getElementById("stClass").value = classId;
window.ViewsStudents.add();
check("أُضيف الطالب", document.querySelectorAll("#stBody tr").length === 1);
check("اسم الطالب ظاهر", document.getElementById("stBody").textContent.includes("أحمد محمد"));
check("قائمة الصفوف في نموذج الطالب تعبّأت",
  document.getElementById("stClass").options.length === 2);

console.log("\n=== 4) البحث والتصفية ===");
document.getElementById("stSearch").value = "لا يوجد";
window.ViewsStudents.render();
check("البحث يُخفي النتائج", document.querySelectorAll("#stBody tr").length === 0);
document.getElementById("stSearch").value = "";
window.ViewsStudents.render();
check("مسح البحث يُعيد النتائج", document.querySelectorAll("#stBody tr").length === 1);

console.log("\n=== 5) تبويب الحضور ===");
window.App.show("attendance");
check("تبويب الحضور ظاهر", document.getElementById("sec-attendance").classList.contains("show"));
check("صف الطالب في الحضور", document.querySelectorAll("#attBody tr").length === 1);
const date = document.getElementById("attDate").value;
window.ViewsAttendance.set(window.Store.state.students[0].id, date, "absent");
check("تسجيل الغياب يعمل",
  window.Store.Q.attendanceOf(window.Store.state.students[0].id, date) === "absent");
check("ملخص اليوم يعكس الغياب",
  document.getElementById("attSummary").textContent.includes("غائب"));

console.log("\n=== 6) تبويب الدرجات ===");
window.App.show("grades");
const subjId = window.Store.state.subjects[0].id;
document.getElementById("grSubject").value = subjId;
window.ViewsGrades.render();
check("صف الطالب في الدرجات", document.querySelectorAll("#grBody tr").length === 1);
const input = document.querySelector("#grBody .grade-input");
check("حقل الدرجة موجود", !!input);
input.value = "85";
window.ViewsGrades.save(input, subjId, "first");
check("حُفظت الدرجة", window.Store.Q.gradeOf(window.Store.state.students[0].id, subjId, "first") === 85);
check("النسبة معروضة", document.querySelector("#grBody .pct").textContent === "85.0%");
check("التقدير معروض", document.querySelector("#grBody .grade").textContent.includes("جيد جداً"));
check("إحصائيات الدرجات ظهرت", document.getElementById("grStats").textContent.includes("المتوسط"));

console.log("\n=== 7) تبويب التقارير ===");
window.App.show("reports");
check("تبويب التقارير ظاهر", document.getElementById("sec-reports").classList.contains("show"));
check("الشهر الافتراضي محدد", !!document.getElementById("rpMonth").value);
check("ملخص التقارير ظهر", document.getElementById("rpPreview").textContent.includes("طالب"));
check("عدد الأيام المسجّلة = 1", document.getElementById("rpPreview").textContent.includes("يوم مسجّل"));

console.log("\n=== 8) تبويب لوحة التحكم ===");
window.App.show("dashboard");
check("بطاقات المؤشرات = 6", document.querySelectorAll("#dashStats .stat-card").length === 6);
check("عدد الطلاب في البطاقة",
  document.getElementById("dashStats").textContent.includes("1"));
check("توزيع التقديرات ظهر", document.getElementById("dashGrades").textContent.includes("ممتاز"));
check("جدول الصفوف ظهر", document.getElementById("dashClasses").textContent.includes("الأول أ"));

console.log("\n=== 9) النوافذ المنبثقة ===");
window.ViewsStudents.profile(window.Store.state.students[0].id);
check("نافذة ملف الطالب فُتحت", !!document.querySelector(".modal-wrap"));
check("الملف يعرض اسم الطالب", document.querySelector(".modal-wrap").textContent.includes("أحمد محمد"));
check("الملف يعرض نسبة الحضور", document.querySelector(".modal-wrap").textContent.includes("نسبة الحضور"));
document.querySelector(".modal-wrap .icon-btn").click();
check("النافذة أُغلقت", !document.querySelector(".modal-wrap"));

console.log("\n=== 10) الحفظ المحلي والاستعادة ===");
const saved = window.localStorage.getItem("schooladm_v2");
check("البيانات محفوظة محلياً", !!saved && JSON.parse(saved).students.length === 1);
check("الطابور يحتوي عمليات", JSON.parse(saved).outbox.length >= 3);

console.log("\n=== 11) الإعدادات ===");
window.App.show("settings");
document.getElementById("setName").value = "مدرسة النور";
window.ViewsSettings.save();
check("اسم المدرسة حُفظ", window.Store.state.settings.schoolName === "مدرسة النور");
check("العنوان الظاهر تحدّث", document.getElementById("setName").value === "مدرسة النور");

console.log("\n=== 12) لا أخطاء نهائية ===");
check("لا أخطاء في الكونسول", errors.length === 0, errors.join(" | "));

console.log("\n=== 13) الحالة الحرجة: Supabase مُهيّأ لكن مكتبة CDN معطّلة ===");
// نحاكي: المستخدم ملأ بيانات المشروع، لكن التحميل من CDN فشل (عمل دون إنترنت)
const origConfig = window.APP_CONFIG.SUPABASE_URL;
window.APP_CONFIG.SUPABASE_URL = "https://demo.supabase.co";
window.APP_CONFIG.SUPABASE_ANON_KEY = "dummy-anon-key";
const errsBefore = errors.length;
await window.Auth.start();
check("لم ينهار التطبيق", errors.length === errsBefore, errors.slice(errsBefore).join(" | "));
check("وضع المحلي مُعلَن", window.SupabaseAPI.ready === false);
check("واجهة المستخدم تعرض الوضع المحلي",
  document.getElementById("userBox").textContent.includes("محلي"));
check("التطبيق ما زال يعرض البيانات",
  document.querySelectorAll("#stBody tr").length === 1);
window.APP_CONFIG.SUPABASE_URL = origConfig;

console.log(`\n${"=".repeat(52)}`);
console.log(`النتيجة:  ✅ ناجح: ${pass}   ❌ فاشل: ${fail}`);
if (errors.length) { console.log("\nالأخطاء:"); errors.forEach((e) => console.log("  -", e)); }
console.log("=".repeat(52));
process.exit(fail ? 1 : 0);
