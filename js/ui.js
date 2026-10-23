/* ==========================================================================
 *  ui.js — أدوات واجهة مشتركة (تنبيهات، نوافذ، جداول، تصدير)
 * ========================================================================== */
(function () {

  /* ---------- أمان النصوص ---------- */
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* ---------- التنبيه العائم ---------- */
  function toast(msg, type = "info") {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "toast show " + type;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.className = "toast"; }, 2600);
  }

  /* ---------- نافذة منبثقة عامة ---------- */
  function modal({ title, body, actions = [], width = 560, onOpen, onClose }) {
    const wrap = document.createElement("div");
    wrap.className = "modal-wrap";
    wrap.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal" style="max-width:${width}px" role="dialog" aria-modal="true">
        <div class="modal-head">
          <h3>${esc(title)}</h3>
          <button class="icon-btn" title="إغلاق" aria-label="إغلاق">✕</button>
        </div>
        <div class="modal-body"></div>
        <div class="modal-foot"></div>
      </div>`;

    const bodyEl = wrap.querySelector(".modal-body");
    if (typeof body === "string") bodyEl.innerHTML = body;
    else if (body instanceof Node) bodyEl.appendChild(body);

    const footEl = wrap.querySelector(".modal-foot");
    actions.forEach((a) => {
      const b = document.createElement("button");
      b.className = "btn " + (a.variant || "");
      b.textContent = a.label;
      b.onclick = () => { const r = a.onClick?.(bodyEl); if (r !== false) close(); };
      footEl.appendChild(b);
    });

    function close(result) { wrap.remove(); document.removeEventListener("keydown", onKey); onClose?.(result); }
    function onKey(e) { if (e.key === "Escape") close(null); }

    wrap.querySelector(".icon-btn").onclick = () => close(null);
    wrap.querySelector(".modal-backdrop").onclick = () => close(null);
    document.addEventListener("keydown", onKey);
    document.body.appendChild(wrap);
    onOpen?.(bodyEl);
    const first = bodyEl.querySelector("input,select,textarea");
    if (first) setTimeout(() => first.focus(), 50);
    return { close, body: bodyEl };
  }

  /* ---------- تأكيد ---------- */
  function confirmDialog(message, { title = "تأكيد", danger = true } = {}) {
    return new Promise((resolve) => {
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      modal({
        title,
        body: `<p style="margin:4px 0 6px;line-height:1.8">${esc(message)}</p>`,
        actions: [
          { label: "إلغاء", variant: "ghost", onClick: () => done(false) },
          { label: "تأكيد", variant: danger ? "danger" : "", onClick: () => done(true) },
        ],
        onClose: () => done(false),
      });
    });
  }

  /* ---------- حقول نموذج ---------- */
  function field(label, inputHTML, hint = "") {
    return `<div class="field">
      <label>${esc(label)}</label>
      ${inputHTML}
      ${hint ? `<small class="hint-inline">${esc(hint)}</small>` : ""}
    </div>`;
  }

  function val(id) {
    const el = document.getElementById(id);
    if (!el) return "";
    return el.type === "checkbox" ? el.checked : el.value.trim();
  }

  /* ---------- تصدير CSV (مع BOM لدعم العربية في Excel) ---------- */
  function exportCSV(filename, rows) {
    const csv = rows.map((row) =>
      row.map((cell) => {
        const s = String(cell ?? "");
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(",")
    ).join("\r\n");

    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename.endsWith(".csv") ? filename : filename + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ---------- تنزيل ملف JSON ---------- */
  function downloadJSON(filename, jsonText) {
    const blob = new Blob([jsonText], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ---------- شريط تقدم ---------- */
  function progress(pct, label = "") {
    return `<div class="progress"><div class="progress-bar" style="width:${Math.max(0, Math.min(100, pct))}%"></div>
      ${label ? `<span class="progress-label">${esc(label)}</span>` : ""}</div>`;
  }

  /* ---------- شريط إحصائي ---------- */
  function bar(value, max, color = "var(--primary)") {
    const pct = max ? Math.round((value / max) * 100) : 0;
    return `<div class="mini-bar"><div class="mini-bar-fill" style="width:${pct}%;background:${color}"></div></div>`;
  }

  /* ---------- جدول ---------- */
  function table(headers, rows, emptyMsg = "لا توجد بيانات") {
    if (!rows.length) return `<div class="empty">${esc(emptyMsg)}</div>`;
    return `<div class="table-wrap"><table>
      <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${rows.join("")}</tbody></table></div>`;
  }

  /* ---------- تنسيقات ---------- */
  function today() { return new Date().toISOString().slice(0, 10); }

  function fmtDate(d) {
    if (!d) return "—";
    try {
      return new Intl.DateTimeFormat("ar", { year: "numeric", month: "long", day: "numeric" })
        .format(new Date(d));
    } catch { return d; }
  }

  function initials(name) {
    return String(name || "؟").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("");
  }

  const TERMS = { first: "الفصل الأول", second: "الفصل الثاني", third: "الفصل الثالث" };
  const STATUSES = {
    present: { label: "حاضر", cls: "ok", icon: "✔" },
    absent: { label: "غائب", cls: "bad", icon: "✘" },
    late: { label: "متأخر", cls: "warn", icon: "⏱" },
    excused: { label: "بعذر", cls: "info", icon: "📄" },
  };

  window.UI = { esc, toast, modal, confirmDialog, field, val, exportCSV, downloadJSON, progress, bar, table, today, fmtDate, initials, TERMS, STATUSES };
})();
