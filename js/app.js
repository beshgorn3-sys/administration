/* ==========================================================================
 *  app.js — نقطة البداية: التنقل، التهيئة، إعادة الرسم
 * ========================================================================== */
(function () {
  const { toast } = window.UI;

  const RENDERERS = {
    dashboard: () => window.ViewsDashboard.render(),
    students: () => window.ViewsStudents.render(),
    classes: () => window.ViewsClasses.render(),
    subjects: () => window.ViewsSubjects.render(),
    attendance: () => window.ViewsAttendance.render(),
    grades: () => window.ViewsGrades.render(),
    reports: () => window.ViewsReports.render(),
    users: () => window.ViewsUsers.render(),
    settings: () => window.ViewsSettings.render(),
  };

  let current = "dashboard";

  /* ---------- التنقل بين التبويبات ---------- */
  function show(tab) {
    if (!window.SupabaseAPI?.user) return;
    if (!RENDERERS[tab]) tab = "dashboard";
    current = tab;
    
    // إظهار الواجهة (إزالة كلاس الإخفاء)
    document.body.classList.remove("app-hidden");

    document.querySelectorAll("#nav [data-tab]").forEach((b) =>
      b.classList.toggle("active", b.dataset.tab === tab));
    document.querySelectorAll("section.panel").forEach((s) =>
      s.classList.toggle("show", s.id === "sec-" + tab));
    RENDERERS[tab]();
    location.hash = tab;
  }

  function rerender() {
    if (!window.SupabaseAPI?.user) return;
    try { RENDERERS[current](); } catch (e) { console.error(e); }
  }

  /* ---------- المظهر (نهاري/ليلي) ---------- */
  function initTheme() {
    const saved = localStorage.getItem("schooladm_theme");
    if (saved === "dark") document.documentElement.setAttribute("data-theme", "dark");
    const btn = document.getElementById("themeBtn");
    if (btn) {
      btn.onclick = () => {
        const dark = document.documentElement.getAttribute("data-theme") === "dark";
        if (dark) document.documentElement.removeAttribute("data-theme");
        else document.documentElement.setAttribute("data-theme", "dark");
        localStorage.setItem("schooladm_theme", dark ? "light" : "dark");
        btn.textContent = dark ? "🌙" : "☀️";
      };
      btn.textContent = document.documentElement.getAttribute("data-theme") === "dark" ? "☀️" : "🌙";
    }
  }

  /* ---------- PWA ---------- */
  function initPWA() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    }
    const btn = document.getElementById("installBtn");
    let deferred = null;
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault(); deferred = e;
      if (btn) btn.style.display = "inline-block";
    });
    if (btn) btn.onclick = async () => {
      if (!deferred) { toast("التثبيت غير متاح حالياً من قائمة المتصفح"); return; }
      deferred.prompt();
      await deferred.userChoice;
      deferred = null;
      btn.style.display = "none";
    };
    window.addEventListener("appinstalled", () => {
      if (btn) btn.style.display = "none";
      toast("تم تثبيت التطبيق");
    });
  }

  /* ---------- التشغيل ---------- */
  async function boot() {
    initTheme();
    initPWA();

    // التنقل
    document.getElementById("nav").addEventListener("click", (e) => {
      const b = e.target.closest("[data-tab]");
      if (b) show(b.dataset.tab);
    });

    document.addEventListener("app:rerender", rerender);
    window.Store.onChange(() => { /* رسم عند الحاجة */ });

    // حالة المزامنة في الترويسة
    const syncLabel = document.getElementById("syncLabel");
    const updateSync = () => {
      if (!syncLabel) return;
      const signedIn = !!window.SupabaseAPI?.user;
      if (!signedIn) { syncLabel.innerHTML = ""; return; }
      const pending = window.Store.state.outbox.length;
      const online = navigator.onLine;
      syncLabel.innerHTML = `<span class="dot ${online ? "on" : "off"}"></span>${
        pending ? pending + " بانتظار المزامنة" : (online ? "متصل" : "دون اتصال")
      }`;
    };
    window.Store.onChange(updateSync);
    window.addEventListener("online", updateSync);
    window.addEventListener("offline", updateSync);

    // تهيئة البيانات المحلية
    await window.Store.init();
    updateSync();

    // الدخول الإلزامي
    await window.Auth.start();

    // ⚠️ لا نُظهر أي تبويب قبل التأكد من وجود مستخدم
    if (!window.SupabaseAPI?.user) return;

    // أظهر الواجهة الآن
    document.body.classList.remove("app-hidden");

    // التبويب الأولي
    const hash = location.hash.replace("#", "");
    show(hash || "dashboard");

    // اختصارات لوحة المفاتيح
    document.addEventListener("keydown", (e) => {
      if (!window.SupabaseAPI?.user) return;
      if (e.target.matches("input,textarea,select")) return;
      const tabs = Object.keys(RENDERERS);
      const i = tabs.indexOf(current);
      if (e.key === "ArrowLeft" && e.altKey) show(tabs[(i + 1) % tabs.length]);
      if (e.key === "ArrowRight" && e.altKey) show(tabs[(i - 1 + tabs.length) % tabs.length]);
    });

    document.addEventListener("keydown", (e) => {
      if (!window.SupabaseAPI?.user) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        show("students");
        setTimeout(() => document.getElementById("stSearch")?.focus(), 60);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", boot);
  window.App = { show, rerender };
})();