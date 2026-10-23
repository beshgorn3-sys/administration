/* ==========================================================================
 *  config.js — إعدادات التطبيق
 *  انسخ هذا الملف واملأ بيانات مشروع Supabase الخاص بك.
 *  البيانات تجدها في: Supabase Dashboard → Project Settings → API
 *  ملاحظة: مفتاح anon آمن للنشر (الحماية الحقيقية تأتي من RLS في قاعدة البيانات)
 * ========================================================================== */

window.APP_CONFIG = {
  /* ---------- بيانات Supabase ---------- */
  SUPABASE_URL: "https://esbliordpjnogvroaqla.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzYmxpb3JkcGpub2d2cm9hcWxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1NjEyMjksImV4cCI6MjEwODEzNzIyOX0._7JNUjxFku-Jv95lj3lo6KQL9dBmAmvHZhXkNOVOcRQ",

  /* ---------- معلومات المدرسة ---------- */
  SCHOOL_NAME: "مدرستي",
  ACADEMIC_YEAR: "2026-2027",
  CURRENT_TERM: "first", // first | second | third

  /* ---------- سلوك التطبيق ---------- */
  AUTO_SYNC: true,          // مزامنة تلقائية مع Supabase
  SYNC_ON_START: true,      // تحميل البيانات من السحابة عند فتح التطبيق
  CACHE_KEY: "schooladm_v2", // مفتاح التخزين المحلي المؤقت
  LEGACY_KEY: "school_data_v1", // مفتاح النسخة القديمة (لنقل البيانات)
};
