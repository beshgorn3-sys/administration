/* ==========================================================================
 *  views/attendance.js — تسجيل الحضور والغياب
 * ========================================================================== */
(function () {
  const { esc, toast, STATUSES } = window.UI;
  const S = () => window.Store;

  function currentDate() { return document.getElementById("attDate").value || window.UI.today(); }

  function filtered() {
    const cls = document.getElementById("attFilter").value;
    const q = (document.getElementById("attSearch")?.value || "").trim().toLowerCase();
    return S().state.students.filter((s) => {
      if (cls && s.classId !== cls) return false;
      if (!q) return true;
      return [s.fullName, s.studentNo].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }

  function render() {
    const st = S().state;
    const date = currentDate();

    // فلتر الصفوف
    const f = document.getElementById("attFilter");
    if (f) {
      const cur = f.value;
      f.innerHTML = `<option value="">كل الصفوف</option>` +
        st.classes.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
      f.value = st.classes.some((c) => c.id === cur) ? cur : "";
    }

    const list = filtered();
    const body = document.getElementById("attBody");
    body.innerHTML = list.map((s) => {
      const st0 = S().Q.attendanceOf(s.id, date);
      const btn = (key) => {
        const m = STATUSES[key];
        const active = st0 === key;
        return `<button class="att-btn ${m.cls} ${active ? "on" : ""}" title="${m.label}"
          onclick="ViewsAttendance.set('${s.id}','${date}','${key}')">${m.icon} ${m.label}</button>`;
      };
      const stats = S().Q.attendanceStats(s.id);
      return `<tr>
        <td><b>${esc(s.fullName)}</b></td>
        <td>${esc(S().Q.className(s.classId))}</td>
        <td class="att-actions">${btn("present")}${btn("absent")}${btn("late")}${btn("excused")}</td>
        <td>${stats.rate == null ? "—" : stats.rate + "%"}</td>
        <td>${stats.absent}</td>
      </tr>`;
    }).join("");

    document.getElementById("attEmpty").style.display = list.length ? "none" : "block";
    renderSummary(list, date);
  }

  function renderSummary(list, date) {
    const counts = { present: 0, absent: 0, late: 0, excused: 0 };
    list.forEach((s) => {
      const st = S().Q.attendanceOf(s.id, date);
      if (counts[st] != null) counts[st]++;
    });
    const total = list.length || 1;
    const pct = (n) => Math.round((n / total) * 100);
    document.getElementById("attSummary").innerHTML = `
      <div class="sum-card ok"><b>${counts.present}</b><span>حاضر (${pct(counts.present)}%)</span></div>
      <div class="sum-card bad"><b>${counts.absent}</b><span>غائب (${pct(counts.absent)}%)</span></div>
      <div class="sum-card warn"><b>${counts.late}</b><span>متأخر (${pct(counts.late)}%)</span></div>
      <div class="sum-card info"><b>${counts.excused}</b><span>بعذر (${pct(counts.excused)}%)</span></div>`;
  }

  function set(studentId, date, status) {
    S().setAttendance(studentId, date, status);
    render();
  }

  function markAll(status) {
    const date = currentDate();
    const list = filtered();
    list.forEach((s) => S().setAttendance(s.id, date, status));
    toast(status === "present" ? "تم تسجيل الجميع حاضرين" : "تم تسجيل الجميع غائبين");
    render();
  }

  /** تعبئة الحضور تلقائياً: من لم يسجّل يُعتبر غائباً */
  function fillAbsent() {
    const date = currentDate();
    const list = filtered();
    let n = 0;
    list.forEach((s) => {
      if (S().Q.attendanceOf(s.id, date) === "present" && !S().state.attendance[`${date}|${s.id}`]) {
        S().setAttendance(s.id, date, "absent");
        n++;
      }
    });
    toast(n ? `تم تعليم ${n} طالب غائباً` : "لا يوجد طلاب بلا تسجيل");
    render();
  }

  window.ViewsAttendance = { render, set, markAll, fillAbsent };
})();
