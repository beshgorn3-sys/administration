/* ==========================================================================
 *  views/grades.js — إدخال الدرجات (شفهي، مذاكرة، امتحان) + كشوف طباعة + تصدير
 * ========================================================================== */
(function () {
  const { esc, toast, exportCSV } = window.UI;
  const S = () => window.Store;

  function currentTerm() { return document.getElementById("grTerm").value; }

  function ensureOptions() {
    const st = S().state;
    const subj = document.getElementById("grSubject");
    const cls = document.getElementById("grClass");
    const term = document.getElementById("grTerm");

    const curSubj = subj.value, curCls = cls.value, curTerm = term.value;

    subj.innerHTML = `<option value="">— اختر المادة —</option>` +
      st.subjects.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("");
    subj.value = st.subjects.some((s) => s.id === curSubj) ? curSubj : "";

    cls.innerHTML = `<option value="">كل الصفوف</option>` +
      st.classes.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
    cls.value = st.classes.some((c) => c.id === curCls) ? curCls : "";

    term.innerHTML = Object.entries(window.UI.TERMS)
      .map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
    term.value = curTerm || st.settings.currentTerm || "first";
  }

  function list() {
    const cls = document.getElementById("grClass").value;
    return S().state.students.filter((s) => {
      if (cls && s.classId !== cls) return false;
      return s.status === "active";
    });
  }

  function render() {
    ensureOptions();
    const subjectId = document.getElementById("grSubject").value;
    const subject = S().Q.subject(subjectId);
    const term = currentTerm();
    const body = document.getElementById("grBody");
    const empty = document.getElementById("grEmpty");

    if (!subject) {
      body.innerHTML = "";
      empty.style.display = "block";
      empty.textContent = "اختر مادة لعرض درجات الطلاب.";
      document.getElementById("grStats").innerHTML = "";
      return;
    }

    const students = list();
    const values = [];
    
    body.innerHTML = students.map((s) => {
      const g = S().Q.gradeOf(s.id, subject.id, term) || {};
      if (g.score != null && g.score !== "") values.push(g.score);
      
      const coursework = g.score != null ? Math.round((((Number(g.oralScore)||0) + (Number(g.memorizationScore)||0)) / 2) * 10) / 10 : "—";
      const total = g.score ?? "—";

      return `<tr data-st="${s.id}">
        <td><b>${esc(s.fullName)}</b></td>
        <td>${esc(S().Q.className(s.classId))}</td>
        <td><input class="grade-input in-oral" type="number" min="0" max="100" step="0.5" value="${g.oralScore ?? ""}" placeholder="—"></td>
        <td><input class="grade-input in-memo" type="number" min="0" max="100" step="0.5" value="${g.memorizationScore ?? ""}" placeholder="—"></td>
        <td><input class="grade-input in-exam" type="number" min="0" max="100" step="0.5" value="${g.examScore ?? ""}" placeholder="—"></td>
        <td class="coursework-val" style="font-weight:bold; color:var(--primary)">${coursework}</td>
        <td class="total-val" style="font-weight:bold; color:var(--green)">${total}</td>
        <td class="grade">${g.score != null ? esc(gradeLabel(g.score)) : "—"}</td>
      </tr>`;
    }).join("");

    empty.style.display = students.length ? "none" : "block";
    if (!students.length) empty.textContent = "لا يوجد طلاب في هذا الصف.";
    
    // ربط الأحداث للحساب المباشر والحفظ
    body.querySelectorAll("input").forEach(inp => {
      inp.addEventListener("input", () => preview(inp, subjectId, term));
      inp.addEventListener("change", () => save(inp, subjectId, term));
    });

    renderStats(values, subject);
  }

  function renderStats(values, subject) {
    const el = document.getElementById("grStats");
    if (!values.length) { el.innerHTML = `<div class="empty">لم تُدخل درجات بعد.</div>`; return; }
    const avg = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
    const max = Math.max(...values), min = Math.min(...values);
    const pass = Math.round((values.filter((p) => p >= 60).length / values.length) * 100);
    el.innerHTML = `
      <div class="sum-card"><b>${avg}%</b><span>المتوسط</span></div>
      <div class="sum-card ok"><b>${max}%</b><span>أعلى درجة</span></div>
      <div class="sum-card bad"><b>${min}%</b><span>أدنى درجة</span></div>
      <div class="sum-card ${pass >= 50 ? "ok" : "warn"}"><b>${pass}%</b><span>نسبة النجاح</span></div>
      <div class="sum-card"><b>${values.length}</b><span>عدد الطلاب المرصودين</span></div>`;
  }

  /** حساب مباشر أثناء الكتابة */
  function preview(input, subjectId, term) {
    const tr = input.closest("tr");
    const oral = Number(tr.querySelector(".in-oral").value) || 0;
    const memo = Number(tr.querySelector(".in-memo").value) || 0;
    const exam = Number(tr.querySelector(".in-exam").value) || 0;
    
    const coursework = Math.round(((oral + memo) / 2) * 10) / 10;
    const total = Math.round(((coursework + exam) / 2) * 10) / 10;
    
    tr.querySelector(".coursework-val").textContent = coursework;
    
    // إذا كانت جميع الحقول فارغة، نعرض شرطة
    const isEmpty = !tr.querySelector(".in-oral").value && !tr.querySelector(".in-memo").value && !tr.querySelector(".in-exam").value;
    
    tr.querySelector(".total-val").textContent = isEmpty ? "—" : total;
    tr.querySelector(".grade").textContent = isEmpty ? "—" : gradeLabel(total);
  }

  /** الحفظ في قاعدة البيانات */
  function save(input, subjectId, term) {
    const tr = input.closest("tr");
    const stId = tr.dataset.st;
    
    const oral = Number(tr.querySelector(".in-oral").value) || 0;
    const memo = Number(tr.querySelector(".in-memo").value) || 0;
    const exam = Number(tr.querySelector(".in-exam").value) || 0;

    // التحقق من عدم تجاوز 100
    if (oral > 100 || memo > 100 || exam > 100) {
      toast("الدرجة يجب ألا تتجاوز 100", "bad");
      render(); // إعادة الرسم لتصحيح القيمة
      return;
    }

    const isEmpty = !tr.querySelector(".in-oral").value && !tr.querySelector(".in-memo").value && !tr.querySelector(".in-exam").value;

    if (isEmpty) {
      S().removeGrade(stId, subjectId, term);
      toast("تم حذف الدرجة");
      render();
    } else {
      S().setGrade(stId, subjectId, term, { oralScore: oral, memorizationScore: memo, examScore: exam });
      toast("تم حفظ الدرجة");
      render(); // إعادة الرسم لتحديث الإحصائيات
    }
  }

  function saveAll() {
    const subjectId = document.getElementById("grSubject").value;
    if (!subjectId) { toast("اختر مادة أولاً"); return; }
    const term = currentTerm();
    let n = 0;
    
    document.querySelectorAll("#grBody tr").forEach(tr => {
      const stId = tr.dataset.st;
      const oral = Number(tr.querySelector(".in-oral").value) || 0;
      const memo = Number(tr.querySelector(".in-memo").value) || 0;
      const exam = Number(tr.querySelector(".in-exam").value) || 0;
      
      if (oral > 100 || memo > 100 || exam > 100) return; // تجاهل الخاطئة

      const isEmpty = !tr.querySelector(".in-oral").value && !tr.querySelector(".in-memo").value && !tr.querySelector(".in-exam").value;

      if (isEmpty) {
        S().removeGrade(stId, subjectId, term);
      } else {
        S().setGrade(stId, subjectId, term, { oralScore: oral, memorizationScore: memo, examScore: exam });
        n++;
      }
    });
    toast(`تم حفظ ${n} درجة`);
    render();
  }

  /* ---------- كشف درجات للطباعة ---------- */
  function printReport() {
    const subject = S().Q.subject(document.getElementById("grSubject").value);
    if (!subject) { toast("اختر مادة أولاً"); return; }
    const term = currentTerm();
    const students = list();
    const st = S().state;
    
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) { toast("اسمح بالنوافذ المنبثقة للطباعة"); return; }
    
    let rowsHtml = students.map((s, i) => {
      const g = S().Q.gradeOf(s.id, subject.id, term) || {};
      const score = g.score;
      const coursework = g.score != null ? Math.round((((g.oralScore||0)+(g.memorizationScore||0))/2)*10)/10 : "—";
      
      return `<tr>
        <td>${i + 1}</td>
        <td>${esc(s.fullName)}</td>
        <td>${esc(S().Q.className(s.classId))}</td>
        <td>${g.oralScore ?? "—"}</td>
        <td>${g.memorizationScore ?? "—"}</td>
        <td><b>${coursework}</b></td>
        <td>${g.examScore ?? "—"}</td>
        <td><b>${score ?? "—"}</b></td>
        <td>${score == null ? "—" : esc(gradeLabel(score))}</td>
      </tr>`;
    }).join("");

    const avg = (() => {
      const vals = students.map((s) => S().Q.gradeOf(s.id, subject.id, term)?.score).filter((v) => v != null);
      if (!vals.length) return "—";
      return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 + "%";
    })();

    w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
      <title>كشف درجات - ${esc(subject.name)}</title>
      <style>
        body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;padding:24px;color:#111}
        h1{text-align:center;font-size:20px;margin:0 0 4px}
        .meta{text-align:center;color:#555;font-size:13px;margin-bottom:18px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #999;padding:6px;text-align:center}
        th{background:#eef2ff}
        td:first-child,td:nth-child(2){text-align:right}
        .foot{margin-top:18px;display:flex;justify-content:space-between;font-size:13px}
        @media print{body{padding:0}}
      </style></head><body>
      <h1>${esc(st.settings.schoolName || "مدرستي")} — كشف درجات</h1>
      <div class="meta">المادة: ${esc(subject.name)} &nbsp;|&nbsp; ${esc(window.UI.TERMS[term])} &nbsp;|&nbsp; ${esc(st.settings.academicYear || "")}</div>
      <table><thead><tr>
        <th>#</th><th>اسم الطالب</th><th>الصف</th>
        <th>شفهي (100)</th><th>مذاكرة (100)</th><th>أعمال (100)</th>
        <th>امتحان (100)</th><th>المجموع (100)</th><th>التقدير</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody></table>
      <div class="foot"><span>المتوسط العام: ${avg}</span><span>عدد الطلاب: ${students.length}</span>
        <span>تاريخ الطباعة: ${new Date().toLocaleDateString("ar")}</span></div>
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }

  function exportData() {
    const subject = S().Q.subject(document.getElementById("grSubject").value);
    if (!subject) { toast("اختر مادة أولاً"); return; }
    const term = currentTerm();
    const rows = [["الاسم", "الصف", "شفهي", "مذاكرة", "أعمال", "امتحان", "المجموع", "التقدير"]];
    
    list().forEach((s) => {
      const g = S().Q.gradeOf(s.id, subject.id, term) || {};
      const coursework = g.score != null ? Math.round((((g.oralScore||0)+(g.memorizationScore||0))/2)*10)/10 : "";
      rows.push([
        s.fullName, S().Q.className(s.classId), 
        g.oralScore ?? "", g.memorizationScore ?? "", coursework, g.examScore ?? "",
        g.score ?? "", g.score != null ? gradeLabel(g.score) : ""
      ]);
    });
    exportCSV(`كشف-درجات-${subject.name}-${window.UI.TERMS[term]}`, rows);
    toast("تم تصدير كشف الدرجات");
  }

  function gradeLabel(p) {
    const scale = S().state.settings.gradingScale || [
      { g: "ممتاز", min: 90 }, { g: "جيد جداً", min: 80 }, { g: "جيد", min: 70 },
      { g: "مقبول", min: 60 }, { g: "راسب", min: 0 },
    ];
    return (scale.find((x) => p >= x.min) || scale[scale.length - 1]).g;
  }

  window.ViewsGrades = { render, preview, save, saveAll, printReport, exportData };
})();