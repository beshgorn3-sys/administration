/* ==========================================================================
 *  views/dashboard.js — لوحة التحكم والمؤشرات
 * ========================================================================== */
(function () {
  const { esc, table, bar, STATUSES } = window.UI;
  const S = () => window.Store;

  function render() {
    const st = S().state;
    const term = st.settings.currentTerm || "first";

    /* ---- بطاقات المؤشرات ---- */
    const students = st.students.filter((s) => s.status === "active");
    const attTotal = Object.values(st.attendance).length;
    const attAbsent = Object.values(st.attendance).filter((a) => a.status === "absent").length;
    const attRate = attTotal ? Math.round(((attTotal - attAbsent) * 100) / attTotal) : null;

    const termGrades = Object.values(st.grades).filter((g) => g.term === term && g.score != null);
    const avg = termGrades.length
      ? Math.round((termGrades.reduce((a, g) => a + (g.score / (g.maxScore || 100)) * 100, 0) / termGrades.length) * 10) / 10
      : null;

    const passRate = termGrades.length
      ? Math.round((termGrades.filter((g) => (g.score / (g.maxScore || 100)) * 100 >= 60).length / termGrades.length) * 100)
      : null;

    document.getElementById("dashStats").innerHTML = [
      card("👨‍🎓", "الطلاب", students.length, "طالب نشط", "var(--primary)"),
      card("🏫", "الصفوف", st.classes.length, "صف / شعبة", "var(--green)"),
      card("📚", "المواد", st.subjects.length, "مادة دراسية", "var(--amber)"),
      card("📅", "نسبة الحضور", attRate == null ? "—" : attRate + "%", `من ${attTotal} تسجيل`, "var(--teal)"),
      card("📈", "متوسط الدرجات", avg == null ? "—" : avg + "%", window.UI.TERMS[term], "var(--purple)"),
      card("✅", "نسبة النجاح", passRate == null ? "—" : passRate + "%", "≥ 60%", "var(--green)"),
    ].join("");

    /* ---- توزيع التقديرات ---- */
    const scale = st.settings.gradingScale || [
      { g: "ممتاز", min: 90 }, { g: "جيد جداً", min: 80 }, { g: "جيد", min: 70 },
      { g: "مقبول", min: 60 }, { g: "راسب", min: 0 },
    ];
    const buckets = scale.map((s) => ({ ...s, count: 0 }));
    termGrades.forEach((g) => {
      const p = (g.score / (g.maxScore || 100)) * 100;
      const b = buckets.find((x) => p >= x.min) || buckets[buckets.length - 1];
      b.count++;
    });
    const maxB = Math.max(1, ...buckets.map((b) => b.count));
    document.getElementById("dashGrades").innerHTML = buckets.map((b) => `
      <div class="dist-row">
        <span class="dist-label">${esc(b.g)}</span>
        ${bar(b.count, maxB, b.min >= 60 ? "var(--green)" : "var(--red)")}
        <span class="dist-num">${b.count}</span>
      </div>`).join("") || `<div class="empty">لا توجد درجات في هذا الفصل بعد.</div>`;

    /* ---- جدول الصفوف ---- */
    const rows = st.classes.map((c) => {
      const list = S().Q.studentsOfClass(c.id);
      const active = list.filter((s) => s.status === "active");
      const rates = active.map((s) => S().Q.attendanceStats(s.id).rate).filter((r) => r != null);
      const rate = rates.length ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10 : null;
      const avgs = active.map((s) => S().Q.average(s.id, term)).filter((a) => a != null);
      const avg = avgs.length ? Math.round((avgs.reduce((a, b) => a + b, 0) / avgs.length) * 10) / 10 : null;
      return `<tr>
        <td><b>${esc(c.name)}</b></td>
        <td>${active.length}</td>
        <td>${rate == null ? "—" : rate + "%"}</td>
        <td>${avg == null ? "—" : avg + "%"}</td>
        <td style="min-width:140px">${rate == null ? "" : bar(rate, 100, rate >= 85 ? "var(--green)" : rate >= 70 ? "var(--amber)" : "var(--red)")}</td>
      </tr>`;
    });
    document.getElementById("dashClasses").innerHTML = table(
      ["الصف / الشعبة", "عدد الطلاب", "نسبة الحضور", "متوسط الدرجات", ""], rows, "لم تُضف صفوف بعد."
    );

    /* ---- حالة المزامنة ---- */
    const online = navigator.onLine;
    const configured = window.SupabaseAPI?.configured;
    const signedIn = !!window.SupabaseAPI?.user;
    const pending = st.outbox.length;
    const last = st.meta.lastSync
      ? new Date(st.meta.lastSync).toLocaleString("ar")
      : "لم تتم المزامنة بعد";
    document.getElementById("dashSync").innerHTML = `
      <div class="sync-row"><span>حالة الاتصال</span><b class="pill ${online ? "ok" : "bad"}">${online ? "متصل" : "غير متصل"}</b></div>
      <div class="sync-row"><span>Supabase</span><b class="pill ${configured ? "ok" : "warn"}">${configured ? "مُهيّأ" : "غير مُهيّأ"}</b></div>
      <div class="sync-row"><span>حساب المستخدم</span><b class="pill ${signedIn ? "ok" : "warn"}">${signedIn ? esc(window.SupabaseAPI.user.email) : "محلي فقط"}</b></div>
      <div class="sync-row"><span>عمليات معلّقة</span><b class="pill ${pending ? "warn" : "ok"}">${pending}</b></div>
      <div class="sync-row"><span>آخر مزامنة</span><b>${esc(last)}</b></div>`;
  }

  function card(icon, label, value, sub, color) {
    return `<div class="stat-card" style="--accent:${color}">
      <div class="stat-icon">${icon}</div>
      <div class="stat-body">
        <div class="stat-label">${esc(label)}</div>
        <div class="stat-value">${esc(value)}</div>
        <div class="stat-sub">${esc(sub)}</div>
      </div>
    </div>`;
  }

  window.ViewsDashboard = { render };
})();
