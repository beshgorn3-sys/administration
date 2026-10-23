/* ==========================================================================
 *  service-worker.js — عمل دون إنترنت (Offline-first)
 *  الاستراتيجية: التخزين المسبق للملفات + الشبكة أولاً مع بديل من الذاكرة
 * ========================================================================== */
const CACHE = "schooladm-v2.1.5";
const ASSETS = [
  "./",
  "./index.html",
  "./about.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/config.js",
  "./js/supabase.js",
  "./js/store.js",
  "./js/ui.js",
  "./js/auth.js",
  "./js/app.js",
  "./js/views/dashboard.js",
  "./js/views/students.js",
  "./js/views/classes.js",
  "./js/views/subjects.js",
  "./js/views/attendance.js",
  "./js/views/grades.js",
  "./js/views/reports.js",
  "./js/views/users.js",
  "./js/views/settings.js",
  "./icons/favicon-32.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS).catch(() => c.addAll(ASSETS.slice(0, 6))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // نتجاوز استدعاءات Supabase و CDN الخارجية
  if (url.origin !== location.origin) return;

  // طلبات التنقّل: الشبكة أولاً ثم الذاكرة
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(() => caches.match("./index.html"))
    );
    return;
  }

  // بقية الملفات: الذاكرة أولاً مع تحديث في الخلفية
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

// إشعار العميل عند توفر نسخة جديدة
self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});
