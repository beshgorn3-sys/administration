/* ==========================================================================
 *  views/students.js — إدارة الطلاب (إضافة/تعديل/ملف/حذف/تصدير)
 * ========================================================================== */
(function () {
  const { esc, toast, modal, confirmDialog, field, val, exportCSV, table, initials } = window.UI;
  const S = () => window.Store;

  function currentFilter() {
    return {
      q: (document.getElementById("stSearch")?.value || "").trim().toLowerCase(),
      cls: document.getElementById("stFilter")?.value || "",
    };
  }

  function list() {
    const { q, cls } = currentFilter();
    return S().state.students.filter((s) => {
      if (cls && s.classId !== cls) return false;
      if (!q) return true;
      return [s.fullName, s.studentNo, s.guardianName, s.guardianPhone]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }

  function render() {
    const st = S().state;
    const term = st.settings.currentTerm || "first";

    // قائمة الصفوف (نموذج الإضافة + الفلتر)
    const clsSelect = document.getElementById("stClass");
    if (clsSelect) {
      const cur = clsSelect.value;
      clsSelect.innerHTML = `<option value="">— بدون صف —</option>` +
        st.classes.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
      clsSelect.value = st.classes.some((c) => c.id === cur) ? cur : "";
    }

    const filter = document.getElementById("stFilter");
    if (filter) {
      const cur = filter.value;
      filter.innerHTML = `<option value="">كل الصفوف</option>` +
        st.classes.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
      filter.value = st.classes.some((c) => c.id === cur) ? cur : "";
    }

    const items = list();
    const rows = items.map((s, i) => {
      const a = S().Q.attendanceStats(s.id);
      const avg = S().Q.average(s.id, term);
      const statusBadge = {
        active: '<span class="pill ok">نشط</span>',
        graduated: '<span class="pill info">تخرج</span>',
        withdrawn: '<span class="pill bad">منسحب</span>',
        transferred: '<span class="pill warn">منقول</span>',
      }[s.status] || "";
      return `<tr>
        <td>${i + 1}</td>
        <td>
          <div class="person"><div class="avatar">${esc(initials(s.fullName))}</div>
            <div><b>${esc(s.fullName)}</b>${s.guardianPhone ? `<small>ولي الأمر: ${esc(s.guardianPhone)}</small>` : ""}</div></div>
        </td>
        <td>${esc(S().Q.className(s.classId))}</td>
        <td>${esc(s.studentNo || "—")}</td>
        <td>${a.rate == null ? "—" : a.rate + "%"}</td>
        <td>${avg == null ? "—" : avg + "%"}</td>
        <td>${statusBadge}</td>
        <td class="actions">
          <button class="btn ghost mini" onclick="ViewsStudents.profile('${s.id}')">الملف</button>
          <button class="btn mini" onclick="ViewsStudents.edit('${s.id}')">تعديل</button>
          <button class="btn danger mini" onclick="ViewsStudents.remove('${s.id}')">حذف</button>
        </td>
      </tr>`;
    });

    document.getElementById("stBody").innerHTML = rows.join("");
    document.getElementById("stEmpty").style.display = items.length ? "none" : "block";
    document.getElementById("stCount").innerHTML =
      `<span class="stat">الطلاب: ${items.length}</span>` +
      (items.length !== st.students.length ? `<span class="stat">الإجمالي: ${st.students.length}</span>` : "");
  }

  /* ---------- إضافة طالب ---------- */
  function add() {
    const fullName = val("stName");
    if (!fullName) { toast("اكتب اسم الطالب"); return; }
    const s = S().addStudent({
      fullName,
      studentNo: val("stNo"),
      classId: val("stClass"),
      guardianName: val("stGuardian"),
      guardianPhone: val("stPhone"),
    });
    document.getElementById("stName").value = "";
    document.getElementById("stNo").value = "";
    document.getElementById("stGuardian").value = "";
    document.getElementById("stPhone").value = "";
    toast(`تمت إضافة الطالب: ${s.fullName}`);
    render();
  }

  /* ---------- تعديل طالب ---------- */
  function edit(id) {
    const s = S().Q.student(id);
    if (!s) return;
    const st = S().state;
    const classOptions = `<option value="">— بدون صف —</option>` +
      st.classes.map((c) => `<option value="${c.id}" ${c.id === s.classId ? "selected" : ""}>${esc(c.name)}</option>`).join("");

    modal({
      title: "تعديل بيانات الطالب",
      width: 620,
      body: `
        <div class="grid-2">
          ${field("الاسم الكامل", `<input id="e_name" value="${esc(s.fullName)}">`)}
          ${field("الصف / الشعبة", `<select id="e_class">${classOptions}</select>`)}
          ${field("الرقم التسلسلي", `<input id="e_no" value="${esc(s.studentNo || "")}">`)}
          ${field("رقم الهوية", `<input id="e_nid" value="${esc(s.nationalId || "")}">`)}
          ${field("ولي الأمر", `<input id="e_guard" value="${esc(s.guardianName || "")}">`)}
          ${field("جوال ولي الأمر", `<input id="e_phone" value="${esc(s.guardianPhone || "")}">`)}
          ${field("تاريخ الميلاد", `<input id="e_birth" type="date" value="${esc(s.birthDate || "")}">`)}
          ${field("الحالة", `<select id="e_status">
              ${["active", "graduated", "withdrawn", "transferred"]
                .map((v) => `<option value="${v}" ${v === s.status ? "selected" : ""}>${
                  { active: "نشط", graduated: "تخرج", withdrawn: "منسحب", transferred: "منقول" }[v]}</option>`).join("")}
            </select>`)}
        </div>
        ${field("ملاحظات", `<textarea id="e_notes" rows="2">${esc(s.notes || "")}</textarea>`)}`,
      actions: [
        { label: "إلغاء", variant: "ghost" },
        {
          label: "حفظ", onClick: () => {
            const name = val("e_name");
            if (!name) { toast("الاسم مطلوب"); return false; }
            S().updateStudent(id, {
              fullName: name, classId: val("e_class"), studentNo: val("e_no"),
              nationalId: val("e_nid"), guardianName: val("e_guard"), guardianPhone: val("e_phone"),
              birthDate: val("e_birth"), status: val("e_status"), notes: val("e_notes"),
            });
            toast("تم حفظ التعديلات");
            render();
          }
        },
      ],
    });
  }

  /* ---------- ملف الطالب ---------- */
  function profile(id) {
    const s = S().Q.student(id);
    if (!s) return;
    const term = S().state.settings.currentTerm || "first";
    const att = S().Q.attendanceStats(id);
    const avg = S().Q.average(id, term);
    const grades = Object.values(S().state.grades).filter((g) => g.studentId === id);

    const attRows = Object.values(S().state.attendance)
      .filter((a) => a.studentId === id)
      .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30)
      .map((a) => `<tr><td>${esc(a.date)}</td>
        <td><span class="pill ${window.UI.STATUSES[a.status]?.cls || ""}">${esc(window.UI.STATUSES[a.status]?.label || a.status)}</span></td>
        <td>${esc(a.note || "—")}</td></tr>`);

    const grdRows = grades.map((g) => {
      const sub = S().Q.subject(g.subjectId);
      const pct = Math.round((g.score / (g.maxScore || 100)) * 100);
      return `<tr><td>${esc(sub?.name || "—")}</td><td>${esc(window.UI.TERMS[g.term] || g.term)}</td>
        <td>${g.score} / ${g.maxScore}</td><td>${pct}%</td>
        <td><span class="pill ${pct >= 60 ? "ok" : "bad"}">${esc(gradeLabel(pct))}</span></td></tr>`;
    });

    modal({
      title: `ملف الطالب: ${s.fullName}`,
      width: 760,
      body: `
        <div class="profile-head">
          <div class="avatar big">${esc(initials(s.fullName))}</div>
          <div>
            <h3 style="margin:0">${esc(s.fullName)}</h3>
            <p class="muted">${esc(S().Q.className(s.classId))} · الرقم: ${esc(s.studentNo || "—")}</p>
            <p class="muted">ولي الأمر: ${esc(s.guardianName || "—")} · ${esc(s.guardianPhone || "—")}</p>
          </div>
          <div class="profile-stats">
            <div><b>${att.rate == null ? "—" : att.rate + "%"}</b><span>نسبة الحضور</span></div>
            <div><b>${avg == null ? "—" : avg + "%"}</b><span>المتوسط</span></div>
            <div><b>${att.total}</b><span>أيام مسجّلة</span></div>
          </div>
        </div>
        <h4>الدرجات</h4>
        ${table(["المادة", "الفصل", "الدرجة", "النسبة", "التقدير"], grdRows, "لا توجد درجات")}
        <h4>آخر سجلات الحضور</h4>
        ${table(["التاريخ", "الحالة", "ملاحظة"], attRows, "لا يوجد سجل حضور")}`,
      actions: [{ label: "إغلاق", variant: "ghost" }],
    });
  }

  /* ---------- حذف ---------- */
  async function remove(id) {
    const s = S().Q.student(id);
    if (!s) return;
    const ok = await confirmDialog(`سيتم حذف الطالب «${s.fullName}» مع كل درجاته وسجلات حضوره. لا يمكن التراجع.`);
    if (!ok) return;
    S().removeStudent(id);
    toast("تم حذف الطالب");
    render();
  }

  /* ---------- تصدير ---------- */
  function exportData() {
    const term = S().state.settings.currentTerm || "first";
    const rows = [["الاسم", "الصف", "الرقم", "ولي الأمر", "الجوال", "نسبة الحضور", "المتوسط"]];
    list().forEach((s) => {
      const a = S().Q.attendanceStats(s.id);
      const avg = S().Q.average(s.id, term);
      rows.push([s.fullName, S().Q.className(s.classId), s.studentNo || "",
        s.guardianName || "", s.guardianPhone || "",
        a.rate == null ? "" : a.rate + "%", avg == null ? "" : avg + "%"]);
    });
    exportCSV("الطلاب-" + window.UI.today(), rows);
    toast("تم تصدير ملف CSV");
  }

  function gradeLabel(p) {
    const scale = S().state.settings.gradingScale || [
      { g: "ممتاز", min: 90 }, { g: "جيد جداً", min: 80 }, { g: "جيد", min: 70 },
      { g: "مقبول", min: 60 }, { g: "راسب", min: 0 },
    ];
    return (scale.find((x) => p >= x.min) || scale[scale.length - 1]).g;
  }

  window.ViewsStudents = { render, add, edit, profile, remove, exportData };
})();
