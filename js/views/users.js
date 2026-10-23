/* ==========================================================================
 *  views/users.js — إدارة المستخدمين (للمدير فقط)
 * ========================================================================== */
(function () {
  const { esc, toast, modal, field, val, table } = window.UI;
  const S = () => window.Store;
  const ROLE_LABEL = { admin: "مدير", teacher: "معلم", student: "طالب" };

  async function render() {
    const st = S().state;
    
    // تحميل المستخدمين من السحابة للتأكد من الحصول على أحدث البيانات
    if (window.SupabaseAPI?.ready && window.SupabaseAPI?.user) {
      try {
        const { data } = await window.SupabaseAPI.client.from("profiles").select("*").order("created_at");
        st.profiles = (data || []).map((p) => ({
          id: p.id, fullName: p.full_name || "", username: p.username || "", 
          role: p.role || "teacher", active: p.active !== false,
        }));
        S().saveLocal();
      } catch (e) { console.warn("تعذر تحميل المستخدمين", e); }
    }

    // بناء جدول المستخدمين
    const rows = st.profiles.map((p) => `<tr>
      <td>
        <b>${esc(p.fullName || "—")}</b>
        <br><small style="color:var(--muted);font-family:monospace">@${esc(p.username || "—")}</small>
      </td>
      <td>
        <span class="pill ${p.role === "admin" ? "ok" : p.role === "teacher" ? "info" : "warn"}">
          ${ROLE_LABEL[p.role] || p.role}
        </span>
      </td>
      <td class="actions">
        <button class="btn mini" onclick="ViewsUsers.edit('${p.id}')">تعديل</button>
        ${p.id !== window.SupabaseAPI.user.id ? 
          `<button class="btn danger mini" onclick="ViewsUsers.remove('${p.id}')">حذف</button>` : 
          `<span class="pill">أنت</span>`}
      </td>
    </tr>`);

    document.getElementById("usersBody").innerHTML = table(
      ["الاسم / اسم المستخدم", "الدور", "إجراءات"], rows, "لا يوجد مستخدمون."
    );

    // تحميل سجل التدقيق
    loadAudit();
  }

  async function loadAudit() {
    const el = document.getElementById("auditBody");
    if (!el) return;
    if (!window.SupabaseAPI?.user) { el.innerHTML = `<div class="empty">سجّل الدخول لعرض سجل التدقيق.</div>`; return; }
    try {
      const logs = await window.SupabaseAPI.auditLog(30);
      el.innerHTML = table(
        ["العملية", "الجدول", "الوقت"],
        logs.map((l) => `<tr><td>${esc(l.action)}</td><td>${esc(l.entity)}</td>
          <td>${esc(new Date(l.created_at).toLocaleString("ar"))}</td></tr>`),
        "لا توجد عمليات مسجّلة"
      );
    } catch (e) {
      el.innerHTML = `<div class="empty">سجل التدقيق متاح للمدير فقط.</div>`;
    }
  }

  /** تعديل بيانات المستخدم */
  function edit(id) {
    const p = S().state.profiles.find((x) => x.id === id);
    if (!p) return;

    modal({
      title: "تعديل بيانات المستخدم",
      body: `
        <div class="grid-2">
          ${field("الاسم الكامل", `<input id="u_name" value="${esc(p.fullName)}">`)}
          ${field("اسم المستخدم (إنجليزي)", `<input id="u_user" type="text" dir="ltr" value="${esc(p.username)}">`)}
          ${field("كلمة مرور جديدة (اتركها فارغة لعدم التغيير)", `<input id="u_pass" type="text" dir="ltr" placeholder="••••••••">`)}
          ${field("الدور", `<select id="u_role">
            ${Object.entries(ROLE_LABEL).map(([k, v]) => `<option value="${k}" ${k === p.role ? "selected" : ""}>${v}</option>`).join("")}
          </select>`)}
        </div>
        <p class="hint">إذا تركت كلمة المرور فارغة، ستبقى كلمة المرور القديمة كما هي.</p>`,
      actions: [
        { label: "إلغاء", variant: "ghost" },
        {
          label: "حفظ التعديلات", onClick: async () => {
            const username = val("u_user").toLowerCase().trim();
            if (!username) { toast("اسم المستخدم مطلوب", "bad"); return false; }
            if (!/^[a-z0-9_]+$/.test(username)) { toast("اسم المستخدم يجب أن يحتوي على أحرف إنجليزية وأرقام فقط", "bad"); return false; }

            try {
              const { error } = await window.SupabaseAPI.client.rpc("admin_update_user", {
                p_user_id: id,
                p_username: username,
                p_full_name: val("u_name"),
                p_password: val("u_pass") || null,
                p_role: val("u_role")
              });
              if (error) throw error;
              toast("تم تحديث بيانات المستخدم بنجاح", "ok");
              render();
            } catch (e) {
              toast("تعذّر التحديث: " + e.message, "bad");
              return false;
            }
          }
        },
      ],
    });
  }

  /** حذف مستخدم */
  async function remove(id) {
    const p = S().state.profiles.find((x) => x.id === id);
    if (!p) return;
    if (p.id === window.SupabaseAPI.user.id) { 
      toast("لا يمكنك حذف حسابك الحالي", "bad"); 
      return; 
    }

    const ok = await window.UI.confirmDialog(
      `هل أنت متأكد من حذف المستخدم "${p.fullName}"؟ سيتم حذف حسابه نهائياً ولا يمكن التراجع.`
    );
    if (!ok) return;

    try {
      const { error } = await window.SupabaseAPI.client.rpc("admin_delete_user", { p_user_id: id });
      if (error) throw error;
      toast("تم حذف المستخدم بنجاح", "ok");
      render();
    } catch (e) {
      toast("تعذّر الحذف: " + e.message, "bad");
    }
  }

  window.ViewsUsers = { render, edit, remove };
})();