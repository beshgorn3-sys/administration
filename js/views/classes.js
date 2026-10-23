/* ==========================================================================
 *  views/classes.js — إدارة الصفوف والشعب
 * ========================================================================== */
(function () {
  const { esc, toast, modal, field, val, table } = window.UI;
  const S = () => window.Store;

  function render() {
    const st = S().state;
    const rows = st.classes.map((c, i) => {
      const list = S().Q.studentsOfClass(c.id).filter((s) => s.status === "active");
      const capacity = c.capacity ? `<span class="muted">${list.length}/${c.capacity}</span>` : list.length;
      const teacher = st.profiles.find((p) => p.id === c.homeroomTeacher);
      return `<tr>
        <td>${i + 1}</td>
        <td><b>${esc(c.name)}</b></td>
        <td>${esc(c.gradeLevel || "—")}</td>
        <td>${capacity}</td>
        <td>${esc(teacher?.fullName || "—")}</td>
        <td class="actions">
          <button class="btn mini" onclick="ViewsClasses.edit('${c.id}')">تعديل</button>
          <button class="btn danger mini" onclick="ViewsClasses.remove('${c.id}')">حذف</button>
        </td>
      </tr>`;
    });
    document.getElementById("clBody").innerHTML = rows.join("");
    document.getElementById("clEmpty").style.display = st.classes.length ? "none" : "block";
  }

  function add() {
    const name = val("clName");
    if (!name) { toast("اكتب اسم الصف"); return; }
    if (S().state.classes.some((c) => c.name === name)) { toast("يوجد صف بنفس الاسم"); return; }
    S().addClass({ name, gradeLevel: val("clGrade") });
    document.getElementById("clName").value = "";
    document.getElementById("clGrade").value = "";
    toast("تمت إضافة الصف");
    render();
  }

  function edit(id) {
    const c = S().Q.klass(id);
    if (!c) return;
    const st = S().state;
    const teachers = st.profiles.filter((p) => p.role !== "student");
    modal({
      title: "تعديل الصف",
      body: `
        <div class="grid-2">
          ${field("اسم الصف / الشعبة", `<input id="c_name" value="${esc(c.name)}">`)}
          ${field("المستوى", `<input id="c_grade" value="${esc(c.gradeLevel || "")}" placeholder="مثال: الأول">`)}
          ${field("السعة القصوى", `<input id="c_cap" type="number" min="1" value="${c.capacity || ""}">`)}
          ${field("رائد الصف", `<select id="c_teacher">
              <option value="">— لا يوجد —</option>
              ${teachers.map((t) => `<option value="${t.id}" ${t.id === c.homeroomTeacher ? "selected" : ""}>${esc(t.fullName || t.id)}</option>`).join("")}
            </select>`)}
        </div>`,
      actions: [
        { label: "إلغاء", variant: "ghost" },
        {
          label: "حفظ", onClick: () => {
            const name = val("c_name");
            if (!name) { toast("اسم الصف مطلوب"); return false; }
            S().updateClass(id, {
              name, gradeLevel: val("c_grade"),
              capacity: val("c_cap") ? Number(val("c_cap")) : null,
              homeroomTeacher: val("c_teacher"),
            });
            toast("تم الحفظ");
            render();
          }
        },
      ],
    });
  }

  async function remove(id) {
    const c = S().Q.klass(id);
    if (!c) return;
    const n = S().Q.studentsOfClass(id).length;
    const ok = await window.UI.confirmDialog(
      n ? `حذف الصف «${c.name}»؟ سيتم فك ارتباط ${n} طالب (لن تُحذف بياناتهم).` : `حذف الصف «${c.name}»؟`
    );
    if (!ok) return;
    S().removeClass(id);
    toast("تم حذف الصف");
    render();
  }

  window.ViewsClasses = { render, add, edit, remove };
})();
