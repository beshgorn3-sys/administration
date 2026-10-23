/* ==========================================================================
 *  views/subjects.js — إدارة المواد الدراسية
 * ========================================================================== */
(function () {
  const { esc, toast, modal, field, val, table } = window.UI;
  const S = () => window.Store;

  function render() {
    const st = S().state;

    // قائمة الصفوف في نموذج الإضافة
    const sel = document.getElementById("subClass");
    if (sel) {
      const cur = sel.value;
      sel.innerHTML = classOptions(cur);
      sel.value = st.classes.some((c) => c.id === cur) ? cur : "";
    }

    const rows = st.subjects.map((s, i) => {
      const count = Object.values(st.grades).filter((g) => g.subjectId === s.id).length;
      const teacher = st.profiles.find((p) => p.id === s.teacherId);
      return `<tr>
        <td>${i + 1}</td>
        <td><b>${esc(s.name)}</b></td>
        <td>${esc(s.code || "—")}</td>
        <td>${s.maxScore}</td>
        <td>${esc(s.classId ? S().Q.className(s.classId) : "كل الصفوف")}</td>
        <td>${esc(teacher?.fullName || "—")}</td>
        <td>${count}</td>
        <td class="actions">
          <button class="btn mini" onclick="ViewsSubjects.edit('${s.id}')">تعديل</button>
          <button class="btn danger mini" onclick="ViewsSubjects.remove('${s.id}')">حذف</button>
        </td>
      </tr>`;
    });
    document.getElementById("subBody").innerHTML = rows.join("");
    document.getElementById("subEmpty").style.display = st.subjects.length ? "none" : "block";
  }

  function classOptions(sel) {
    return `<option value="">كل الصفوف</option>` +
      S().state.classes.map((c) => `<option value="${c.id}" ${c.id === sel ? "selected" : ""}>${esc(c.name)}</option>`).join("");
  }

  function add() {
    const name = val("subName");
    if (!name) { toast("اكتب اسم المادة"); return; }
    S().addSubject({
      name, maxScore: Number(val("subMax")) || 100,
      code: val("subCode"), classId: val("subClass"),
    });
    document.getElementById("subName").value = "";
    document.getElementById("subCode").value = "";
    toast("تمت إضافة المادة");
    render();
  }

  function edit(id) {
    const s = S().Q.subject(id);
    if (!s) return;
    const teachers = S().state.profiles.filter((p) => p.role !== "student");
    modal({
      title: "تعديل المادة",
      body: `
        <div class="grid-2">
          ${field("اسم المادة", `<input id="s_name" value="${esc(s.name)}">`)}
          ${field("الرمز", `<input id="s_code" value="${esc(s.code || "")}">`)}
          ${field("الدرجة العظمى", `<input id="s_max" type="number" min="1" value="${s.maxScore}">`)}
          ${field("الصف", `<select id="s_class">${classOptions(s.classId)}</select>`)}
          ${field("المعلم", `<select id="s_teacher">
              <option value="">— لا يوجد —</option>
              ${teachers.map((t) => `<option value="${t.id}" ${t.id === s.teacherId ? "selected" : ""}>${esc(t.fullName || t.id)}</option>`).join("")}
            </select>`)}
        </div>`,
      actions: [
        { label: "إلغاء", variant: "ghost" },
        {
          label: "حفظ", onClick: () => {
            const name = val("s_name");
            if (!name) { toast("اسم المادة مطلوب"); return false; }
            S().updateSubject(id, {
              name, code: val("s_code"), maxScore: Number(val("s_max")) || 100,
              classId: val("s_class"), teacherId: val("s_teacher"),
            });
            toast("تم الحفظ");
            render();
          }
        },
      ],
    });
  }

  async function remove(id) {
    const s = S().Q.subject(id);
    if (!s) return;
    const ok = await window.UI.confirmDialog(`حذف المادة «${s.name}» مع كل درجاتها المسجّلة؟`);
    if (!ok) return;
    S().removeSubject(id);
    toast("تم حذف المادة");
    render();
  }

  window.ViewsSubjects = { render, add, edit, remove };
})();
