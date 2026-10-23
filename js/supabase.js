/* ==========================================================================
 *  supabase.js — تهيئة اتصال Supabase + إدارة الجلسة والمصادقة
 *  يعمل هذا الملف كطبقة وسيطة (Wrapper) للتعامل مع مكتبة Supabase.
 * ========================================================================== */
(function () {
  const CFG = window.APP_CONFIG || {};
  
  // التحقق من وجود الإعدادات الأساسية
  const isConfigured = () =>
    CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY &&
    !CFG.SUPABASE_URL.includes("YOUR-PROJECT-REF") &&
    !CFG.SUPABASE_ANON_KEY.includes("YOUR-SUPABASE-ANON-KEY");

  let client = null;
  let session = null;
  const listeners = [];

  /** تهيئة العميل (يُستدعى مرة واحدة) */
  function init() {
    if (client || !isConfigured()) return client;
    if (typeof window.supabase === "undefined") {
      console.warn("[supabase] لم يتم تحميل مكتبة supabase-js من CDN");
      return null;
    }
    
    client = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    
    // الاستماع لتغيرات المصادقة
    client.auth.onAuthStateChange((_event, newSession) => {
      session = newSession;
      listeners.forEach((fn) => { try { fn(newSession); } catch (e) { console.error(e); } });
    });
    
    return client;
  }

  const API = {
    /** هل الإعدادات مضبوطة في config.js؟ */
    get configured() { return isConfigured(); },
    
    /** هل النظام جاهز للاستخدام؟ (الإعدادات + المكتبة) */
    get ready() {
      if (!isConfigured()) return false;
      return !!init();
    },
    
    /** العميل الحالي */
    get client() { return client || init(); },
    
    /** الجلسة الحالية */
    get session() { return session; },
    
    /** المستخدم الحالي */
    get user() { return session?.user || null; },

    /** الاشتراك في تغيّر حالة المصادقة */
    onAuthChange(fn) { listeners.push(fn); },

    /** تسجيل الدخول (يستخدم البريد الإلكتروني الوهمي المولد من اسم المستخدم) */
    async signIn(email, password) {
      const c = init();
      if (!c) throw new Error("Supabase غير مُهيّأ — تحقق من ملف js/config.js");
      const { data, error } = await c.auth.signInWithPassword({ email, password });
      if (error) throw new Error(translateAuthError(error.message));
      session = data.session;
      return data.user;
    },

    /** تسجيل حساب جديد (يُستخدم في الإصدارات السابقة - غير مُفضل الآن) */
    async signUp(email, password, fullName) {
      const c = init();
      if (!c) throw new Error("Supabase غير مُهيّأ");
      const { data, error } = await c.auth.signUp({
        email, password,
        options: { data: { full_name: fullName } },
      });
      if (error) throw new Error(translateAuthError(error.message));
      return data.user;
    },

    /** تسجيل الخروج */
    async signOut() {
      const c = init();
      if (!c) return;
      await c.auth.signOut();
      session = null;
    },

    /** إرسال رابط استعادة كلمة المرور (احتياطي) */
    async resetPassword(email) {
      const c = init();
      if (!c) throw new Error("Supabase غير مُهيّأ");
      const { error } = await c.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname,
      });
      if (error) throw new Error(translateAuthError(error.message));
    },

    /** هل المستخدم الحالي مسؤول (admin)؟ */
    async isAdmin() {
      if (!this.user) return false;
      const { data } = await this.client
        .from("profiles").select("role").eq("id", this.user.id).maybeSingle();
      return data?.role === "admin";
    },

    /** جلب دور المستخدم الحالي وبياناته (الاسم، اسم المستخدم، الدور) */
    async myRole() {
      if (!this.user) return null;
      const { data } = await this.client
        .from("profiles").select("role, full_name, username").eq("id", this.user.id).maybeSingle();
      return data || null;
    },

    /** سجل التدقيق (للمدير) */
    async auditLog(limit = 50) {
      const { data } = await this.client
        .from("audit_log").select("*").order("created_at", { ascending: false }).limit(limit);
      return data || [];
    },
  };

  /** ترجمة رسائل أخطاء المصادقة إلى العربية */
  function translateAuthError(msg) {
    const m = String(msg || "").toLowerCase();
    if (m.includes("invalid login")) return "اسم المستخدم أو كلمة المرور غير صحيحة";
    if (m.includes("email not confirmed")) return "لم يتم تأكيد البريد بعد";
    if (m.includes("already registered")) return "هذا الحساب مسجّل مسبقاً";
    if (m.includes("password should be")) return "كلمة المرور يجب ألا تقل عن 6 أحرف";
    if (m.includes("rate limit")) return "محاولات كثيرة — انتظر قليلاً ثم أعد المحاولة";
    return msg || "حدث خطأ غير متوقع";
  }

  // تصدير الكائن للاستخدام العام
  window.SupabaseAPI = API;
})();