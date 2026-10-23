/* ==========================================================================
 *  auth.js — تسجيل الدخول والإنشاء الذاتي (اسم مستخدم لاتيني وكلمة مرور)
 * ========================================================================== */
(function () {
  const { esc, toast, field, val } = window.UI;
  const ROLE_LABEL = { admin: "مدير", teacher: "معلم", student: "طالب" };

  async function start() {
    if (!window.SupabaseAPI?.configured) { showConfigError(); return; }
    if (!window.SupabaseAPI?.ready) { showLibraryError(); return; }

    try {
      const { data } = await window.SupabaseAPI.client.auth.getSession();
      if (data.session) {
        await applyUserBox();
        document.body.classList.remove("app-hidden");
        return;
      }
    } catch (e) { console.warn(e); }

    showLogin();
  }

  function showConfigError() {
    const wrap = document.createElement("div");
    wrap.className = "auth-wrap";
    wrap.innerHTML = `<div class="auth-card"><div class="auth-logo">⚠️</div><h2>التطبيق غير مُهيّأ</h2><p class="muted">لم تُضبط بيانات Supabase.</p></div>`;
    document.body.appendChild(wrap);
  }

  function showLibraryError() {
    const wrap = document.createElement("div");
    wrap.className = "auth-wrap";
    wrap.innerHTML = `<div class="auth-card"><div class="auth-logo">📡</div><h2>تعذّر الاتصال بالخادم</h2><button class="btn full" onclick="location.reload()">🔄 إعادة المحاولة</button></div>`;
    document.body.appendChild(wrap);
  }

  function showLogin() {
    if (document.querySelector(".auth-wrap #authForm")) return;
    const wrap = document.createElement("div");
    wrap.className = "auth-wrap";
    wrap.innerHTML = `
      <div class="auth-card">
        <div class="auth-logo">🏫</div>
        <h2>نظام إدارة المدرسة</h2>
        <p class="muted">سجّل الدخول أو أنشئ حسابك</p>
        <div class="auth-tabs">
          <button class="on" data-mode="in">تسجيل الدخول</button>
          <button data-mode="up">حساب جديد</button>
        </div>
        <div id="authForm"></div>
      </div>`;
    document.body.appendChild(wrap);

    const formEl = wrap.querySelector("#authForm");
    let mode = "in";

    function draw() {
      // ⚠️ تم تغيير "البريد الإلكتروني" إلى "اسم المستخدم" هنا
      formEl.innerHTML = mode === "in"
        ? `${field("اسم المستخدم", `<input id="a_user" type="text" dir="ltr" placeholder="e.g. ahmed">`)}
           ${field("كلمة المرور", `<input id="a_pass" type="password" dir="ltr">`)}
           <button class="btn full" id="a_go">دخول</button>`
        : `${field("الاسم الكامل", `<input id="a_name" placeholder="مثال: أحمد محمد">`)}
           ${field("اسم المستخدم (بالأحرف اللاتينية فقط)", `<input id="a_user" type="text" dir="ltr" placeholder="e.g. ahmed">`)}
           ${field("كلمة المرور", `<input id="a_pass" type="password" dir="ltr">`)}
           ${field("تأكيد كلمة المرور", `<input id="a_pass2" type="password" dir="ltr">`)}
           <button class="btn full" id="a_go">إنشاء الحساب</button>`;

      formEl.querySelector("#a_go").onclick = async () => {
        const btn = formEl.querySelector("#a_go");
        btn.disabled = true; btn.textContent = "جارٍ المعالجة…";
        
        try {
          const username = val("a_user").toLowerCase().trim();
          const password = val("a_pass");
          
          if (!username) throw new Error("اسم المستخدم مطلوب");

          // التحقق من أن اسم المستخدم باللاتينية فقط
          if (!/^[a-z0-9_]+$/.test(username)) {
            throw new Error("اسم المستخدم يجب أن يحتوي على أحرف إنجليزية وأرقام فقط (بدون مسافات أو رموز)");
          }

          if (mode === "in") {
            const dummyEmail = username + "@school.local";
            await window.SupabaseAPI.signIn(dummyEmail, password);
            toast("تم تسجيل الدخول بنجاح", "ok");
            wrap.remove();
            await applyUserBox();
            document.body.classList.remove("app-hidden");
            await window.Store.syncNow();
            document.dispatchEvent(new CustomEvent("app:rerender"));
          } else {
            const password2 = val("a_pass2");
            if (password.length < 6) throw new Error("كلمة المرور يجب ألا تقل عن 6 أحرف");
            if (password !== password2) throw new Error("كلمتا المرور غير متطابقتين");

            const { error } = await window.SupabaseAPI.client.rpc("register_self", {
              p_username: username,
              p_password: password,
              p_full_name: val("a_name") || username
            });
            
            if (error) throw error;
            
            toast("تم إنشاء الحساب بنجاح، يمكنك الدخول الآن", "ok");
            
            mode = "in";
            wrap.querySelectorAll(".auth-tabs button").forEach(x => x.classList.toggle("on", x.dataset.mode === "in"));
            draw();
            document.getElementById("a_user").value = username;
          }
        } catch (e) {
          toast(e.message, "bad");
          btn.disabled = false;
          btn.textContent = mode === "in" ? "دخول" : "إنشاء الحساب";
        }
      };
    }

    wrap.querySelectorAll(".auth-tabs button").forEach((b) => {
      b.onclick = () => {
        wrap.querySelectorAll(".auth-tabs button").forEach((x) => x.classList.toggle("on", x === b));
        mode = b.dataset.mode;
        draw();
      };
    });
    draw();
  }

  async function applyUserBox() {
    const box = document.getElementById("userBox");
    if (!box) return;
    const user = window.SupabaseAPI?.user;
    if (!user) { box.innerHTML = ""; showLogin(); return; }

    let role = null, name = user.email;
    try {
      const me = await window.SupabaseAPI.myRole();
      if (me) { role = me.role; name = me.full_name || user.email; }
    } catch (e) { /* تجاهل */ }

    box.innerHTML = `
      <span class="user-chip">
        <b>${esc(name)}</b>
        <span class="pill ${role === "admin" ? "ok" : "info"}">${ROLE_LABEL[role] || "مستخدم"}</span>
      </span>
      <button class="btn ghost mini" id="logoutBtn">خروج</button>`;

    document.getElementById("logoutBtn").onclick = async () => {
      await window.SupabaseAPI.signOut();
      toast("تم تسجيل الخروج");
      try { window.Store.clearLocal(); } catch (e) { /* تجاهل */ }
      location.reload();
    };

    const usersTab = document.querySelector('[data-tab="users"]');
    if (usersTab) usersTab.style.display = role === "admin" ? "" : "none";
  }

  window.Auth = { start, showLogin, applyUserBox, ROLE_LABEL };
})();