/* ==========================================================================
 *  views/reports.js — التقارير والكشوف القابلة للطباعة
 *    1) كشف الحضور الشهري (طلاب × أيام)
 *    2) كشف بيانات الطلاب
 *    3) تقرير تحصيلي للمواد
 * ========================================================================== */
(function () {
  const { esc, toast } = window.UI;
  const S = () => window.Store;

  const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

  function currentMonth() {
    return document.getElementById("rpMonth").value;
  }

  function render() {
    const st = S().state;
    const sel = document.getElementById("rpClass");
    const cur = sel.value;
    sel.innerHTML = `<option value="">كل الصفوف</option>` +
      st.classes.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
    sel.value = st.classes.some((c) => c.id === cur) ? cur : "";

    const m = document.getElementById("rpMonth");
    if (!m.dataset.ready) {
      const now = new Date();
      m.innerHTML = MONTHS.map((name, i) => {
        const y = i > now.getMonth() ? now.getFullYear() - 1 : now.getFullYear();
        return `<option value="${y}-${String(i + 1).padStart(2, "0")}">${name} ${y}</option>`;
      }).join("");
      m.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      m.dataset.ready = "1";
    }

    document.getElementById("rpPreview").innerHTML = previewSummary();
  }

  /* ---------- ملخص سريع ---------- */
  function previewSummary() {
    const st = S().state;
    const month = currentMonth();
    const clsId = document.getElementById("rpClass").value;
    const students = st.students.filter((s) =>
      (!clsId || s.classId === clsId) && s.status === "active");
    const days = Object.keys(st.attendance).filter((d) => d.startsWith(month)).sort();
    const absent = students.reduce((n, s) =>
      n + days.filter((d) => S().Q.attendanceOf(s.id, d) === "absent").length, 0);
    const totalRecords = students.length * days.length;

    return `
      <div class="sum-card"><b>${students.length}</b><span>طالب</span></div>
      <div class="sum-card"><b>${days.length}</b><span>يوم مسجّل</span></div>
      <div class="sum-card bad"><b>${absent}</b><span>حالة غياب</span></div>
      <div class="sum-card ok"><b>${totalRecords ? Math.round(((totalRecords - absent) * 100) / totalRecords) : 0}%</b><span>نسبة الانضباط</span></div>`;
  }

  /* ---------- أدوات الطباعة ---------- */
  function openPrint(title, subtitle, head, body, foot) {
    const st = S().state;
    const w = window.open("", "_blank", "width=1000,height=700");
    if (!w) { toast("اسمح بالنوافذ المنبثقة للطباعة"); return; }
    w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
      <title>${esc(title)}</title>
      <style>
        @page{size:A4 landscape;margin:12mm}
        body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;padding:16px;color:#111;font-size:12px}
        h1{text-align:center;font-size:18px;margin:0 0 3px}
        .meta{text-align:center;color:#444;font-size:12px;margin-bottom:14px}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th,td{border:1px solid #888;padding:4px 5px;text-align:center}
        th{background:#e8eefc}
        td.name{text-align:right;white-space:nowrap}
        .p{color:#166534;font-weight:700}
        .a{color:#b91c1c;font-weight:700}
        .l{color:#92400e;font-weight:700}
        .e{color:#1e40af;font-weight:700}
        .foot{margin-top:14px;display:flex;justify-content:space-between;font-size:11px}
        .sig{margin-top:26px;display:flex;justify-content:space-around;font-size:12px}
        .sig div{border-top:1px solid #333;padding-top:5px;width:180px;text-align:center}
        @media print{body{padding:0}.noprint{display:none}}
      </style></head><body>
      <h1>${esc(st.settings.schoolName || "مدرستي")} — ${esc(title)}</h1>
      <div class="meta">${esc(subtitle)}</div>
      ${head}
      ${body}
      ${foot || ""}
      <div class="sig"><div>رائد الصف</div><div>المدير</div><div>المعلم</div></div>
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }

  /* ---------- 1) كشف الحضور الشهري ---------- */
  function monthlyAttendance() {
    const st = S().state;
    const month = currentMonth();
    const clsId = document.getElementById("rpClass").value;
    const students = st.students.filter((s) =>
      (!clsId || s.classId === clsId) && s.status === "active");
    if (!students.length) { toast("لا يوجد طلاب"); return; }

    const days = [];
    const [y, m] = month.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    for (let d = 1; d <= last; d++) {
      const date = `${month}-${String(d).padStart(2, "0")}`;
      const has = Object.keys(st.attendance).some((k) => k.startsWith(date));
      if (has) days.push(d);
    }
    if (!days.length) { toast("لا توجد سجلات حضور في هذا الشهر"); return; }

    const SYM = { present: ["✔", "p"], absent: ["✘", "a"], late: ["⏱", "l"], excused: ["📄", "e"] };
    const head = `<table><thead><tr><th>#</th><th>اسم الطالب</th><th>الصف</th>
      ${days.map((d) => `<th>${d}</th>`).join("")}<th>غياب</th><th>نسبة</th></tr></thead><tbody>`;

    const body = students.map((s, i) => {
      const absences = days.filter((d) => {
        const date = `${month}-${String(d).padStart(2, "0")}`;
        return S().Q.attendanceOf(s.id, date) === "absent";
      }).length;
      const rate = Math.round(((days.length - absences) * 100) / days.length);
      const cells = days.map((d) => {
        const date = `${month}-${String(d).padStart(2, "0")}`;
        const stt = S().Q.attendanceOf(s.id, date);
        const sym = SYM[stt] || SYM.present;
        return `<td class="${sym[1]}">${sym[0]}</td>`;
      }).join("");
      return `<tr><td>${i + 1}</td><td class="name">${esc(s.fullName)}</td>
        <td>${esc(S().Q.className(s.classId))}</td>${cells}
        <td class="a">${absences}</td><td><b>${rate}%</b></td></tr>`;
    }).join("") + "</tbody></table>";

    const monthName = MONTHS[m - 1] + " " + y;
    const clsName = clsId ? S().Q.className(clsId) : "كل الصفوف";
    openPrint("كشف الحضور الشهري", `${monthName} · ${clsName} · ${st.settings.academicYear || ""}`, head, body);
  }

  /* ---------- 2) كشف بيانات الطلاب ---------- */
  function studentList() {
    const st = S().state;
    const clsId = document.getElementById("rpClass").value;
    const students = st.students.filter((s) => !clsId || s.classId === clsId);
    if (!students.length) { toast("لا يوجد طلاب"); return; }

    const head = `<table><thead><tr><th>#</th><th>الاسم</th><th>الصف</th><th>الرقم</th>
      <th>ولي الأمر</th><th>الجوال</th><th>الحالة</th><th>نسبة الحضور</th><th>المتوسط</th></tr></thead><tbody>`;
    const term = st.settings.currentTerm || "first";
    const body = students.map((s, i) => {
      const a = S().Q.attendanceStats(s.id);
      const avg = S().Q.average(s.id, term);
      return `<tr><td>${i + 1}</td><td class="name">${esc(s.fullName)}</td>
        <td>${esc(S().Q.className(s.classId))}</td><td>${esc(s.studentNo || "—")}</td>
        <td class="name">${esc(s.guardianName || "—")}</td><td dir="ltr">${esc(s.guardianPhone || "—")}</td>
        <td>${({ active: "نشط", graduated: "تخرج", withdrawn: "منسحب", transferred: "منقول" })[s.status] || s.status}</td>
        <td>${a.rate == null ? "—" : a.rate + "%"}</td><td>${avg == null ? "—" : avg + "%"}</td></tr>`;
    }).join("") + "</tbody></table>";

    const clsName = clsId ? S().Q.className(clsId) : "كل الصفوف";
    openPrint("كشف بيانات الطلاب", `${clsName} · عدد الطلاب: ${students.length}`, head, body);
  }

  /* ---------- 3) تقرير تحصيلي للمواد ---------- */
  function subjectReport() {
    const st = S().state;
    const term = st.settings.currentTerm || "first";
    const clsId = document.getElementById("rpClass").value;
    const students = st.students.filter((s) =>
      (!clsId || s.classId === clsId) && s.status === "active");
    const subjects = st.subjects;
    if (!students.length || !subjects.length) { toast("تحتاج طلاباً ومواد"); return; }

    const head = `<table><thead><tr><th>#</th><th>اسم الطالب</th>
      ${subjects.map((s) => `<th>${esc(s.name)}</th>`).join("")}
      <th>المتوسط</th><th>نسبة الحضور</th></tr></thead><tbody>`;
    const body = students.map((s, i) => {
      const cells = subjects.map((sub) => {
        const v = S().Q.gradeOf(s.id, sub.id, term);
        if (v == null) return "<td>—</td>";
        const pct = (v / sub.maxScore) * 100;
        return `<td class="${pct >= 60 ? "p" : "a"}">${v}</td>`;
      }).join("");
      const avg = S().Q.average(s.id, term);
      const a = S().Q.attendanceStats(s.id);
      return `<tr><td>${i + 1}</td><td class="name">${esc(s.fullName)}</td>${cells}
        <td><b>${avg == null ? "—" : avg + "%"}</b></td>
        <td>${a.rate == null ? "—" : a.rate + "%"}</td></tr>`;
    }).join("") + "</tbody></table>";

    const clsName = clsId ? S().Q.className(clsId) : "كل الصفوف";
    openPrint("التقرير التحصيلي", `${clsName} · ${window.UI.TERMS[term]} · ${st.settings.academicYear || ""}`, head, body);
  }

  /* ---------- تصدير الحضور الشهري CSV ---------- */
  function exportMonth() {
    const st = S().state;
    const month = currentMonth();
    const clsId = document.getElementById("rpClass").value;
    const students = st.students.filter((s) => (!clsId || s.classId === clsId) && s.status === "active");
    const days = Object.keys(st.attendance).filter((d) => d.startsWith(month)).sort();
    if (!students.length || !days.length) { toast("لا توجد بيانات للتصدير"); return; }

    const LABEL = { present: "حاضر", absent: "غائب", late: "متأخر", excused: "بعذر" };
    const rows = [["الاسم", "الصف", ...days.map((d) => d.slice(8)), "أيام الغياب", "نسبة الحضور"]];
    students.forEach((s) => {
      const absences = days.filter((d) => S().Q.attendanceOf(s.id, d) === "absent").length;
      const rate = Math.round(((days.length - absences) * 100) / days.length);
      rows.push([
        s.fullName, S().Q.className(s.classId),
        ...days.map((d) => LABEL[S().Q.attendanceOf(s.id, d)]),
        absences, rate + "%",
      ]);
    });
    window.UI.exportCSV(`كشف-الحضور-${month}`, rows);
    toast("تم تصدير كشف الحضور");
  }

  window.ViewsReports = { render, monthlyAttendance, studentList, subjectReport, exportMonth };
})();
