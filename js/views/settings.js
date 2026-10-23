/* ==========================================================================
 *  views/settings.js — إعدادات المدرسة + النسخ الاحتياطي + الترحيل
 * ========================================================================== */
(function () {
  const { esc, toast, modal, field, val, downloadJSON, confirmDialog } = window.UI;
  const S = () => window.Store;

  function render() {
    const st = S().state;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ""; };

    set("setName", st.settings.schoolName);
    set("setYear", st.settings.academicYear);
    set("setTerm", st.settings.currentTerm);
    set("setPhone", st.settings.phone);
    set("setEmail", st.settings.email);
    set("setAddress", st.settings.address);

    document.getElementById("setTerm").innerHTML =
      Object.entries(window.UI.TERMS).map(([k, v]) =>
        `<option value="${k}" ${k === st.settings.currentTerm ? "selected" : ""}>${esc(v)}</option>`).join("");

    const pending = st.outbox.length;
    const last = st.meta.lastSync ? new Date(st.meta.lastSync).toLocaleString("ar") : "—";
    document.getElementById("setSyncInfo").innerHTML = `
      <div class="sync-row"><span>حالة المزامنة</span><b class="pill ${pending ? "warn" : "ok"}">${pending ? pending + " عملية معلّقة" : "كل شيء محفوظ"}</b></div>
      <div class="sync-row"><span>آخر مزامنة</span><b>${esc(last)}</b></div>
      <div class="sync-row"><span>Supabase</span><b class="pill ${window.SupabaseAPI?.configured ? "ok" : "warn"}">${window.SupabaseAPI?.configured ? "مُهيّأ" : "غير مُهيّأ"}</b></div>`;
  }

  function save() {
    S().setSettings({
      schoolName: val("setName") || "مدرستي",
      academicYear: val("setYear"),
      currentTerm: val("setTerm"),
      phone: val("setPhone"), email: val("setEmail"), address: val("setAddress"),
    });
    toast("تم حفظ الإعدادات");
    render();
    document.dispatchEvent(new CustomEvent("app:rerender"));
  }

  function exportBackup() {
    downloadJSON(`نسخة-احتياطية-${window.UI.today()}.json`, S().exportJSON());
    toast("تم تنزيل النسخة الاحتياطية");
  }

  function importBackup(input) {
    const f = input.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        S().importJSON(JSON.parse(r.result));
        toast("تم استيراد البيانات");
        render();
        document.dispatchEvent(new CustomEvent("app:rerender"));
      } catch (e) { toast("ملف غير صالح: " + e.message); }
    };
    r.readAsText(f);
    input.value = "";
  }

  /** ترحيل بيانات النسخة القديمة (school_data_v1) */
  async function migrateLegacy() {
    const ok = await confirmDialog(
      "سيتم استيراد بيانات النسخة القديمة (الطلاب/المواد/الغياب/الدرجات) من هذا الجهاز وإضافتها إلى البيانات الحالية. هل تريد المتابعة؟",
      { danger: false, title: "ترحيل البيانات القديمة" }
    );
    if (!ok) return;
    const res = S().importLegacy();
    if (res.ok) {
      toast(`تم ترحيل ${res.students} طالب و ${res.subjects} مادة`);
      render();
      document.dispatchEvent(new CustomEvent("app:rerender"));
    } else {
      toast(res.error);
    }
  }

  async function syncNow() {
    toast("جارٍ المزامنة…");
    const ok = await S().syncNow();
    toast(ok ? "تمت المزامنة بنجاح" : "تعذّرت المزامنة (تحقّق من الاتصال بالحساب)");
    render();
    document.dispatchEvent(new CustomEvent("app:rerender"));
  }

  async function clearLocal() {
    const ok = await confirmDialog("سيتم مسح البيانات المحلية المؤقتة من هذا الجهاز. هل أنت متأكد؟");
    if (!ok) return;
    localStorage.removeItem(window.APP_CONFIG.CACHE_KEY);
    toast("تم المسح — أعد تحميل الصفحة");
  }

  window.ViewsSettings = { render, save, exportBackup, importBackup, migrateLegacy, syncNow, clearLocal };
})();
