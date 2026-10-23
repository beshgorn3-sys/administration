/* ==========================================================================
 *  store.js — طبقة البيانات (Data Layer)
 *
 *  الفكرة: الواجهة تتعامل مع الذاكرة فقط (state)، والطبقة مسؤولة عن:
 *    1) التخزين المحلي (localStorage) ككاش ليعمل التطبيق دون إنترنت بعد الدخول
 *    2) المزامنة مع Supabase في الخلفية
 *    3) طابور العمليات (outbox) لإعادة المحاولة عند عودة الاتصال
 * ========================================================================== */
(function () {
  const CFG = window.APP_CONFIG || {};
  const KEY = CFG.CACHE_KEY || "schooladm_v2";

  /* ---------- أدوات المعرّفات ---------- */
  function uid() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  /* ---------- التحقق من وجود مستخدم ---------- */
  function requireAuth() {
    if (!window.SupabaseAPI?.user) {
      throw new Error("يجب تسجيل الدخول أولاً");
    }
  }

  function isSignedIn() {
    return !!window.SupabaseAPI?.user;
  }

  /* ---------- الحالة ---------- */
  const state = {
    students: [],
    classes: [],
    subjects: [],
    profiles: [],
    attendance: {},   // key: `${date}|${studentId}`
    grades: {},       // key: `${term}|${studentId}|${subjectId}`
    settings: {},
    outbox: [],       // عمليات معلّقة للمزامنة
    meta: { lastSync: null, dirty: false },
  };

  const listeners = [];
  const emit = () => listeners.forEach((fn) => { try { fn(state); } catch (e) { console.error(e); } });

  /* ======================================================================
   *  التخزين المحلي (كاش بعد الدخول)
   * ==================================================================== */
  function saveLocal() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        students: state.students,
        classes: state.classes,
        subjects: state.subjects,
        profiles: state.profiles,
        attendance: state.attendance,
        grades: state.grades,
        settings: state.settings,
        outbox: state.outbox,
        meta: state.meta,
      }));
    } catch (e) {
      console.warn("تعذّر الحفظ المحلي", e);
    }
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      Object.assign(state, {
        students: d.students || [],
        classes: d.classes || [],
        subjects: d.subjects || [],
        profiles: d.profiles || [],
        attendance: d.attendance || {},
        grades: d.grades || {},
        settings: d.settings || {},
        outbox: d.outbox || [],
        meta: d.meta || state.meta,
      });
      return true;
    } catch (e) {
      console.warn("تعذّر قراءة التخزين المحلي", e);
      return false;
    }
  }

  function clearLocal() {
    state.students = [];
    state.classes = [];
    state.subjects = [];
    state.profiles = [];
    state.attendance = {};
    state.grades = {};
    state.outbox = [];
    state.meta = { lastSync: null, dirty: false };
    try { localStorage.removeItem(KEY); } catch (e) { /* تجاهل */ }
    emit();
  }

  /* ======================================================================
   *  مزامنة Supabase
   * ==================================================================== */
  const SB = () => window.SupabaseAPI?.client;

  /** تحويل صف الذاكرة → صف قاعدة البيانات (snake_case) */
  const ROW = {
    students: (s) => ({
      id: s.id, full_name: s.fullName, student_no: s.studentNo || null,
      national_id: s.nationalId || null, class_id: s.classId || null,
      gender: s.gender || null, birth_date: s.birthDate || null,
      guardian_name: s.guardianName || null, guardian_phone: s.guardianPhone || null,
      address: s.address || null, status: s.status || "active",
      user_id: s.userId || null, notes: s.notes || null,
    }),
    classes: (c) => ({
      id: c.id, name: c.name, grade_level: c.gradeLevel || null,
      capacity: c.capacity || null, homeroom_teacher: c.homeroomTeacher || null,
      academic_year: c.academicYear || CFG.ACADEMIC_YEAR,
    }),
    subjects: (s) => ({
      id: s.id, name: s.name, code: s.code || null,
      max_score: Number(s.maxScore) || 100, class_id: s.classId || null,
      teacher_id: s.teacherId || null,
    }),
    profiles: (p) => ({
      id: p.id, full_name: p.fullName || null, role: p.role || "teacher",
      phone: p.phone || null, active: p.active !== false,
    }),
    attendance: (a) => ({
      student_id: a.studentId, date: a.date, status: a.status,
      note: a.note || null, recorded_by: a.recordedBy || null,
    }),
    grades: (g) => ({
      student_id: g.studentId, subject_id: g.subjectId, term: g.term,
      academic_year: g.academicYear || CFG.ACADEMIC_YEAR,
      score: Number(g.score) || 0, max_score: Number(g.maxScore) || 100,
      oral_score: Number(g.oralScore) || 0,
      memorization_score: Number(g.memorizationScore) || 0,
      exam_score: Number(g.examScore) || 0,
      recorded_by: g.recordedBy || null,
    }),
  };

  /** تحويل صف قاعدة البيانات → صف الذاكرة (camelCase) */
  const FROM = {
    students: (r) => ({
      id: r.id, fullName: r.full_name, studentNo: r.student_no || "",
      nationalId: r.national_id || "", classId: r.class_id || "",
      gender: r.gender || "", birthDate: r.birth_date || "",
      guardianName: r.guardian_name || "", guardianPhone: r.guardian_phone || "",
      address: r.address || "", status: r.status || "active",
      userId: r.user_id || "", notes: r.notes || "",
    }),
    classes: (r) => ({
      id: r.id, name: r.name, gradeLevel: r.grade_level || "",
      capacity: r.capacity || null, homeroomTeacher: r.homeroom_teacher || "",
      academicYear: r.academic_year || "",
    }),
    subjects: (r) => ({
      id: r.id, name: r.name, code: r.code || "",
      maxScore: Number(r.max_score) || 100, classId: r.class_id || "",
      teacherId: r.teacher_id || "",
    }),
    profiles: (r) => ({
      id: r.id, fullName: r.full_name || "", role: r.role || "teacher",
      phone: r.phone || "", active: r.active !== false,
    }),
    grades: (r) => ({
      id: r.id, studentId: r.student_id, subjectId: r.subject_id,
      term: r.term, academicYear: r.academic_year,
      score: Number(r.score) || 0, maxScore: Number(r.max_score) || 100,
      oralScore: Number(r.oral_score) || 0,
      memorizationScore: Number(r.memorization_score) || 0,
      examScore: Number(r.exam_score) || 0,
      recordedBy: r.recorded_by || "",
    }),
  };

  const TABLE_NAME = {
    students: "students", classes: "classes", subjects: "subjects",
    profiles: "profiles", attendance: "attendance", grades: "grades",
    school_settings: "school_settings",
  };

  const CONFLICT = {
    attendance: "student_id,date",
    grades: "student_id,subject_id,term,academic_year",
  };

  function enqueue(op) {
    requireAuth();
    state.outbox.push({ ...op, at: new Date().toISOString() });
    state.meta.dirty = true;
    saveLocal();
    if (CFG.AUTO_SYNC) scheduleSync();
  }

  let syncTimer = null;
  function scheduleSync(delay = 1200) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncNow().catch(() => {}), delay);
  }

  /** تنفيذ طابور العمليات على Supabase */
  async function flushOutbox() {
    const c = SB();
    if (!c || !window.SupabaseAPI?.user) return { ok: false, reason: "no-client", count: 0 };
    if (!state.outbox.length) return { ok: true, count: 0 };

    const ops = state.outbox.slice();
    let succeeded = 0;
    let firstError = null;

    for (const op of ops) {
      try {
        if (op.op === "delete") {
          // ✅ بناء استعلام الحذف بالطريقة الصحيحة لـ Supabase
          let deleteQuery = c.from(TABLE_NAME[op.table]).delete();
          
          if (op.where) {
            Object.entries(op.where).forEach(([k, v]) => { 
              deleteQuery = deleteQuery.eq(k, v); 
            });
          } else {
            deleteQuery = deleteQuery.eq("id", op.id);
          }
          
          const { error } = await deleteQuery;
          if (error) throw error;
          
        } else {
          // ✅ بناء استعلام Upsert بالطريقة الصحيحة
          let upsertQuery = c.from(TABLE_NAME[op.table]);
          const opts = CONFLICT[op.table] ? { onConflict: CONFLICT[op.table] } : {};
          
          const { error } = await upsertQuery.upsert(op.data, opts);
          if (error) throw error;
        }
        
        const i = state.outbox.findIndex((o) => o === op);
        if (i > -1) state.outbox.splice(i, 1);
        succeeded++;
      } catch (e) {
        if (!firstError) firstError = e;
        console.warn("فشلت عملية مزامنة، ستُعاد لاحقاً:", e.message);
        break;
      }
    }

    state.meta.dirty = state.outbox.length > 0;
    if (!firstError) state.meta.lastSync = new Date().toISOString();
    saveLocal();
    emit();

    if (firstError && window.UI?.toast) {
      const msg = /row-level security/i.test(firstError.message)
        ? "صلاحياتك لا تسمح بهذه العملية"
        : /foreign key/i.test(firstError.message)
        ? "لا يمكن حذف هذا العنصر — يوجد عناصر مرتبطة به"
        : "تعذّرت المزامنة: " + firstError.message.slice(0, 80);
      window.UI.toast(msg, "bad");
    }

    return {
      ok: !firstError,
      count: succeeded,
      error: firstError?.message || null,
    };
  }

  /** تنزيل البيانات من Supabase (المصدر الأساسي بعد الدخول) */
  async function hydrateFromCloud() {
    const c = SB();
    if (!c || !window.SupabaseAPI?.user) return false;

    const { data: settings } = await c.from("school_settings").select("*").limit(1);
    if (settings?.length) {
      const s = settings[0];
      state.settings = {
        schoolName: s.school_name, academicYear: s.academic_year,
        currentTerm: s.current_term, logoUrl: s.logo_url || "",
        address: s.address || "", phone: s.phone || "", email: s.email || "",
        gradingScale: s.grading_scale || null,
      };
    }

    for (const key of ["students", "classes", "subjects"]) {
      const { data, error } = await c.from(TABLE_NAME[key]).select("*");
      if (error) { console.warn("تعذّر تحميل " + key, error.message); continue; }
      state[key] = (data || []).map((r) => FROM[key](r));
    }

    const { data: att } = await c.from("attendance").select("*");
    state.attendance = {};
    (att || []).forEach((a) => {
      state.attendance[`${a.date}|${a.student_id}`] = {
        id: a.id, studentId: a.student_id, date: a.date,
        status: a.status, note: a.note || "", recordedBy: a.recorded_by || "",
      };
    });

    const { data: grd } = await c.from("grades").select("*");
    state.grades = {};
    (grd || []).forEach((g) => {
      state.grades[`${g.term}|${g.student_id}|${g.subject_id}`] = FROM.grades(g);
    });

    if (await window.SupabaseAPI.isAdmin()) {
      const { data: profs } = await c.from("profiles").select("*");
      state.profiles = (profs || []).map((r) => FROM.profiles(r));
    }

    state.meta.lastSync = new Date().toISOString();
    state.meta.dirty = state.outbox.length > 0;
    saveLocal();
    emit();
    return true;
  }

  /** مزامنة كاملة: تفريغ الطابور ثم تحميل من السحابة */
  async function syncNow() {
    if (!window.SupabaseAPI?.configured || !window.SupabaseAPI?.user) return false;
    if (!navigator.onLine) return false;

    const result = await flushOutbox();

    // ⚠️ لا تُعِد التحميل إذا فشلت أي عملية (لمنع عودة المحذوفات)
    if (!result.ok || state.outbox.length > 0) {
      return false;
    }

    const ok = await hydrateFromCloud();
    if (ok) { state.meta.dirty = false; saveLocal(); }
    return ok;
  }

  /* ======================================================================
   *  عمليات CRUD
   * ==================================================================== */

  function addStudent(data) {
    const s = {
      id: uid(), fullName: (data.fullName || "").trim(), studentNo: data.studentNo || "",
      nationalId: data.nationalId || "", classId: data.classId || "",
      gender: data.gender || "", birthDate: data.birthDate || "",
      guardianName: data.guardianName || "", guardianPhone: data.guardianPhone || "",
      address: data.address || "", status: "active", userId: "", notes: data.notes || "",
    };
    enqueue({ op: "upsert", table: "students", data: ROW.students(s) }); 
    state.students.push(s);
    emit();
    return s;
  }

  function updateStudent(id, data) {
    const i = state.students.findIndex((s) => s.id === id);
    if (i < 0) return null;
    const updated = { ...state.students[i], ...data, id };
    enqueue({ op: "upsert", table: "students", data: ROW.students(updated) });
    state.students[i] = updated;
    emit();
    return updated;
  }

  function removeStudent(id) {
    requireAuth();
    state.students = state.students.filter((s) => s.id !== id);
    Object.keys(state.grades).forEach((k) => { if (k.split("|")[1] === id) delete state.grades[k]; });
    Object.keys(state.attendance).forEach((k) => { if (k.split("|")[1] === id) delete state.attendance[k]; });
    enqueue({ op: "delete", table: "students", id });
    emit();
  }

  function addClass(data) {
    const c = {
      id: uid(), name: (data.name || "").trim(), gradeLevel: data.gradeLevel || "",
      capacity: data.capacity || null, homeroomTeacher: data.homeroomTeacher || "",
      academicYear: CFG.ACADEMIC_YEAR,
    };
    enqueue({ op: "upsert", table: "classes", data: ROW.classes(c) });
    state.classes.push(c);
    emit();
    return c;
  }

  function updateClass(id, data) {
    const i = state.classes.findIndex((c) => c.id === id);
    if (i < 0) return null;
    const updated = { ...state.classes[i], ...data, id };
    enqueue({ op: "upsert", table: "classes", data: ROW.classes(updated) });
    state.classes[i] = updated;
    emit();
    return updated;
  }

  function removeClass(id) {
    requireAuth();
    state.classes = state.classes.filter((c) => c.id !== id);
    state.students.forEach((s) => { if (s.classId === id) s.classId = ""; });
    enqueue({ op: "delete", table: "classes", id });
    emit();
  }

  function addSubject(data) {
    const s = {
      id: uid(), name: (data.name || "").trim(), code: data.code || "",
      maxScore: Number(data.maxScore) || 100, classId: data.classId || "",
      teacherId: data.teacherId || "",
    };
    enqueue({ op: "upsert", table: "subjects", data: ROW.subjects(s) });
    state.subjects.push(s);
    emit();
    return s;
  }

  function updateSubject(id, data) {
    const i = state.subjects.findIndex((s) => s.id === id);
    if (i < 0) return null;
    const updated = { ...state.subjects[i], ...data, id };
    enqueue({ op: "upsert", table: "subjects", data: ROW.subjects(updated) });
    state.subjects[i] = updated;
    emit();
    return updated;
  }

  function removeSubject(id) {
    requireAuth();
    state.subjects = state.subjects.filter((s) => s.id !== id);
    Object.keys(state.grades).forEach((k) => { if (k.split("|")[2] === id) delete state.grades[k]; });
    enqueue({ op: "delete", table: "subjects", id });
    emit();
  }

  function setAttendance(studentId, date, status, note = "") {
    requireAuth();
    const key = `${date}|${studentId}`;
    const rec = {
      id: state.attendance[key]?.id || uid(), studentId, date, status,
      note, recordedBy: window.SupabaseAPI?.user?.id || "",
    };
    state.attendance[key] = rec;
    enqueue({ op: "upsert", table: "attendance", data: ROW.attendance(rec) });
    return rec;
  }

  function removeAttendance(studentId, date) {
    requireAuth();
    delete state.attendance[`${date}|${studentId}`];
    enqueue({ op: "delete", table: "attendance", where: { student_id: studentId, date } });
  }

  /** حفظ درجة الطالب مع الحساب التلقائي للمجموع */
  function setGrade(studentId, subjectId, term, data) {
    requireAuth();
    const key = `${term}|${studentId}|${subjectId}`;
    
    const oral = Number(data.oralScore) || 0;
    const memo = Number(data.memorizationScore) || 0;
    const exam = Number(data.examScore) || 0;
    
    // حساب درجة الأعمال: (شفهي + مذاكرة) / 2
    const coursework = Math.round(((oral + memo) / 2) * 10) / 10;
    
    // الدرجة النهائية: (درجة الأعمال + الامتحان) / 2
    const totalScore = Math.round(((coursework + exam) / 2) * 10) / 10;

    const rec = {
      id: state.grades[key]?.id || uid(), studentId, subjectId, term,
      academicYear: state.settings.academicYear || CFG.ACADEMIC_YEAR,
      score: totalScore, maxScore: 100,
      oralScore: oral, memorizationScore: memo, examScore: exam,
      recordedBy: window.SupabaseAPI?.user?.id || "",
    };
    
    state.grades[key] = rec;
    enqueue({ op: "upsert", table: "grades", data: ROW.grades(rec) });
    return rec;
  }

  function removeGrade(studentId, subjectId, term) {
    requireAuth();
    delete state.grades[`${term}|${studentId}|${subjectId}`];
    enqueue({
      op: "delete", table: "grades",
      where: { student_id: studentId, subject_id: subjectId, term },
    });
  }

  function setSettings(patch) {
    requireAuth();
    state.settings = { ...state.settings, ...patch };
    const row = {
      id: true, school_name: state.settings.schoolName || CFG.SCHOOL_NAME,
      academic_year: state.settings.academicYear || CFG.ACADEMIC_YEAR,
      current_term: state.settings.currentTerm || CFG.CURRENT_TERM,
      logo_url: state.settings.logoUrl || null,
      address: state.settings.address || null, phone: state.settings.phone || null,
      email: state.settings.email || null,
    };
    enqueue({ op: "upsert", table: "school_settings", data: row });
    emit();
  }

  function exportJSON() {
    return JSON.stringify({
      version: 2, exportedAt: new Date().toISOString(),
      students: state.students, classes: state.classes, subjects: state.subjects,
      attendance: state.attendance, grades: state.grades, settings: state.settings,
    }, null, 2);
  }

  function importJSON(obj) {
    requireAuth();
    if (!obj || typeof obj !== "object") throw new Error("ملف غير صالح");
    state.students = obj.students || [];
    state.classes = obj.classes || [];
    state.subjects = obj.subjects || [];
    state.attendance = obj.attendance || {};
    state.grades = obj.grades || {};
    state.settings = { ...state.settings, ...(obj.settings || {}) };
    state.students.forEach((s) => enqueue({ op: "upsert", table: "students", data: ROW.students(s) }));
    state.classes.forEach((c) => enqueue({ op: "upsert", table: "classes", data: ROW.classes(c) }));
    state.subjects.forEach((s) => enqueue({ op: "upsert", table: "subjects", data: ROW.subjects(s) }));
    Object.values(state.attendance).forEach((a) => enqueue({ op: "upsert", table: "attendance", data: ROW.attendance(a) }));
    Object.values(state.grades).forEach((g) => enqueue({ op: "upsert", table: "grades", data: ROW.grades(g) }));
    emit();
  }

  function importLegacy() {
    requireAuth();
    let legacy = null;
    try { legacy = JSON.parse(localStorage.getItem(CFG.LEGACY_KEY || "school_data_v1")); }
    catch (e) { return { ok: false, error: "تعذّر قراءة البيانات القديمة" }; }
    if (!legacy) return { ok: false, error: "لا توجد بيانات قديمة" };

    const classByName = new Map();
    const ensureClass = (name) => {
      const n = (name || "").trim() || "عام";
      if (!classByName.has(n)) {
        const c = addClass({ name: n, gradeLevel: n });
        classByName.set(n, c.id);
      }
      return classByName.get(n);
    };

    const subjectByOldId = new Map();
    (legacy.subjects || []).forEach((s) => {
      const created = addSubject({ name: s.name, maxScore: Number(s.max) || 100 });
      subjectByOldId.set(s.id, created.id);
    });

    const studentByOldId = new Map();
    (legacy.students || []).forEach((s) => {
      const created = addStudent({
        fullName: s.name, studentNo: s.sid || "", classId: ensureClass(s.cls),
      });
      studentByOldId.set(s.id, created.id);
    });

    Object.entries(legacy.attendance || {}).forEach(([date, day]) => {
      Object.entries(day || {}).forEach(([oldSid, present]) => {
        const sid = studentByOldId.get(oldSid);
        if (sid) setAttendance(sid, date, present ? "present" : "absent");
      });
    });

    Object.entries(legacy.grades || {}).forEach(([oldSid, bySubject]) => {
      const sid = studentByOldId.get(oldSid);
      if (!sid) return;
      Object.entries(bySubject || {}).forEach(([oldSubj, score]) => {
        const subjId = subjectByOldId.get(oldSubj);
        const max = (legacy.subjects || []).find((x) => x.id === oldSubj)?.max || 100;
        if (subjId && score != null && score !== "") {
          // في حال كانت البيانات القديمة مجرد درجة واحدة، نضعها في الامتحان
          setGrade(sid, subjId, "first", { oralScore: 0, memorizationScore: 0, examScore: score });
        }
      });
    });

    emit();
    return {
      ok: true,
      students: (legacy.students || []).length,
      subjects: (legacy.subjects || []).length,
    };
  }

  const Q = {
    student: (id) => state.students.find((s) => s.id === id),
    subject: (id) => state.subjects.find((s) => s.id === id),
    klass: (id) => state.classes.find((c) => c.id === id),
    className: (id) => state.classes.find((c) => c.id === id)?.name || "—",
    attendanceOf: (studentId, date) => state.attendance[`${date}|${studentId}`]?.status || "present",
    // تم تعديلها لإرجاع الكائن كاملاً بدلاً من الدرجة فقط
    gradeOf: (studentId, subjectId, term) =>
      state.grades[`${term || state.settings.currentTerm || "first"}|${studentId}|${subjectId}`],
    studentsOfClass: (classId) => state.students.filter((s) => s.classId === classId),
    attendanceStats: (studentId) => {
      let total = 0, absent = 0, late = 0, excused = 0;
      Object.values(state.attendance).forEach((a) => {
        if (a.studentId !== studentId) return;
        total++;
        if (a.status === "absent") absent++;
        else if (a.status === "late") late++;
        else if (a.status === "excused") excused++;
      });
      const rate = total ? Math.round(((total - absent) * 100) / total * 10) / 10 : null;
      return { total, absent, late, excused, rate };
    },
    average: (studentId, term) => {
      const t = term || state.settings.currentTerm || "first";
      const vals = Object.values(state.grades).filter(
        (g) => g.studentId === studentId && g.term === t && g.score != null
      );
      if (!vals.length) return null;
      const pct = vals.map((g) => (g.score / (g.maxScore || 100)) * 100);
      return Math.round((pct.reduce((a, b) => a + b, 0) / pct.length) * 10) / 10;
    },
  };

  async function init() {
    if (isSignedIn()) {
      loadLocal();
    }
    if (!state.settings.schoolName) {
      state.settings = {
        schoolName: CFG.SCHOOL_NAME, academicYear: CFG.ACADEMIC_YEAR,
        currentTerm: CFG.CURRENT_TERM, logoUrl: "", address: "", phone: "", email: "",
      };
    }
    emit();

    window.addEventListener("online", () => {
      if (CFG.AUTO_SYNC && isSignedIn()) syncNow().catch(() => {});
    });
  }

  window.Store = {
    state, Q, init, emit, saveLocal, loadLocal, clearLocal,
    syncNow, flushOutbox, hydrateFromCloud,
    exportJSON, importJSON, importLegacy,
    requireAuth, isSignedIn,
    addStudent, updateStudent, removeStudent,
    addClass, updateClass, removeClass,
    addSubject, updateSubject, removeSubject,
    setAttendance, removeAttendance,
    setGrade, removeGrade,
    setSettings,
    onChange(fn) { listeners.push(fn); },
  };
})();