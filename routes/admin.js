"use strict";

const express = require("express");
const multer = require("multer");
const { getDb } = require("../database/store");
const { ok, fail, requireFields, HttpError, sanitizeUser } = require("../utils/http");
const { requireAdmin } = require("../middleware/auth");
const { isValidTime, isValidISODate, minutesBetween } = require("../utils/dates");
const { parseCsv, validateHeaders } = require("../utils/csv");
const { seedDatabase } = require("../database/seed");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1_000_000 } });

router.use(requireAdmin);

function validateSchedulePayload(body) {
  requireFields(body, ["courseId", "groupId", "classroom", "building", "startTime", "endTime"]);
  if (!isValidTime(body.startTime) || !isValidTime(body.endTime)) {
    throw new HttpError(400, "Times must use HH:MM (24-hour)");
  }
  if (minutesBetween(body.startTime, body.endTime) <= 0) {
    throw new HttpError(400, "End time must be after start time");
  }
  const recurring = body.recurring !== false && body.recurring !== "false";
  if (recurring) {
    const weekday = Number(body.weekday);
    if (Number.isNaN(weekday) || weekday < 0 || weekday > 6) {
      throw new HttpError(400, "Recurring classes need weekday 0–6 (Sunday–Saturday)");
    }
  } else if (!isValidISODate(body.date)) {
    throw new HttpError(400, "One-off classes need a valid date (YYYY-MM-DD)");
  }
}

function hydrateCourseGroup(db, payload) {
  const course = db.findById("courses", payload.courseId);
  const group = db.findById("groups", payload.groupId);
  if (!course) throw new HttpError(400, "Unknown course");
  if (!group) throw new HttpError(400, "Unknown group");
  return { course, group };
}

router.get("/stats", (req, res) => {
  const db = getDb();
  const events = db.all("statsEvents");
  const completions = db.all("assignmentCompletions");
  return ok(res, {
    students: db.all("users").filter((u) => u.role === "student").length,
    admins: db.all("users").filter((u) => u.role === "admin").length,
    courses: db.all("courses").length,
    schedules: db.all("schedules").length,
    assignments: db.all("assignments").length,
    locations: db.all("locations").length,
    announcements: db.all("announcements").length,
    events: db.all("events").length,
    logins: events.filter((e) => e.type === "login").length,
    aiQueries: events.filter((e) => e.type === "ai_query").length,
    completions: completions.length,
  });
});

router.get("/students", (req, res) => {
  const db = getDb();
  const q = String(req.query.q || "").toLowerCase();
  let list = db.all("users").filter((u) => u.role === "student").map(sanitizeUser);
  if (q) list = list.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(q));
  return ok(res, list);
});

router.patch("/students/:id", (req, res) => {
  const db = getDb();
  const user = db.findById("users", req.params.id);
  if (!user || user.role !== "student") return fail(res, 404, "Student not found");
  const patch = {};
  if (req.body.name) patch.name = String(req.body.name).trim();
  if (req.body.groupId) {
    if (!db.findById("groups", req.body.groupId)) return fail(res, 400, "Unknown group");
    patch.groupId = req.body.groupId;
  }
  if (req.body.language && ["en", "ru", "uz"].includes(req.body.language)) patch.language = req.body.language;
  return ok(res, sanitizeUser(db.update("users", user.id, patch)));
});

router.delete("/students/:id", (req, res) => {
  const db = getDb();
  const user = db.findById("users", req.params.id);
  if (!user || user.role !== "student") return fail(res, 404, "Student not found");
  db.remove("users", user.id);
  db.removeWhere("assignmentCompletions", (c) => c.userId === user.id);
  db.removeWhere("chatMessages", (c) => c.userId === user.id);
  return ok(res, { deleted: true });
});

router.get("/courses", (_req, res) => ok(res, getDb().all("courses")));

router.post("/courses", (req, res, next) => {
  try {
    requireFields(req.body || {}, ["code", "name", "lecturer"]);
    const db = getDb();
    const code = String(req.body.code).trim().toUpperCase();
    if (db.findOne("courses", (c) => c.code === code)) throw new HttpError(409, "Course code already exists");
    const doc = {
      id: `crs_${Date.now().toString(16)}`,
      code,
      name: String(req.body.name).trim(),
      lecturer: String(req.body.lecturer).trim(),
      demo: false,
    };
    return ok(res, db.insert("courses", doc));
  } catch (err) {
    return next(err);
  }
});

router.patch("/courses/:id", (req, res) => {
  const db = getDb();
  const course = db.findById("courses", req.params.id);
  if (!course) return fail(res, 404, "Course not found");
  const patch = {};
  ["name", "lecturer"].forEach((k) => {
    if (req.body[k]) patch[k] = String(req.body[k]).trim();
  });
  if (req.body.code) patch.code = String(req.body.code).trim().toUpperCase();
  const updated = db.update("courses", course.id, patch);
  if (patch.code || patch.name || patch.lecturer) {
    db.all("schedules")
      .filter((s) => s.courseId === course.id)
      .forEach((s) =>
        db.update("schedules", s.id, {
          courseCode: updated.code,
          courseName: updated.name,
          lecturer: updated.lecturer,
        })
      );
  }
  return ok(res, updated);
});

router.delete("/courses/:id", (req, res) => {
  const db = getDb();
  if (!db.findById("courses", req.params.id)) return fail(res, 404, "Course not found");
  db.remove("courses", req.params.id);
  db.removeWhere("schedules", (s) => s.courseId === req.params.id);
  db.removeWhere("assignments", (a) => a.courseId === req.params.id);
  return ok(res, { deleted: true });
});

router.get("/schedules", (_req, res) => ok(res, getDb().all("schedules")));

router.post("/schedules", (req, res, next) => {
  try {
    validateSchedulePayload(req.body || {});
    const db = getDb();
    const { course, group } = hydrateCourseGroup(db, req.body);
    const recurring = req.body.recurring !== false && req.body.recurring !== "false";
    const doc = {
      id: `sch_${Date.now().toString(16)}`,
      courseId: course.id,
      courseCode: course.code,
      courseName: course.name,
      lecturer: req.body.lecturer ? String(req.body.lecturer).trim() : course.lecturer,
      groupId: group.id,
      groupCode: group.code,
      classroom: String(req.body.classroom).trim(),
      building: String(req.body.building).trim(),
      startTime: req.body.startTime,
      endTime: req.body.endTime,
      weekday: recurring ? Number(req.body.weekday) : null,
      date: recurring ? null : req.body.date,
      recurring,
      notes: String(req.body.notes || ""),
      demo: false,
    };
    return ok(res, db.insert("schedules", doc));
  } catch (err) {
    return next(err);
  }
});

router.patch("/schedules/:id", (req, res, next) => {
  try {
    const db = getDb();
    const row = db.findById("schedules", req.params.id);
    if (!row) return fail(res, 404, "Schedule not found");
    const merged = { ...row, ...req.body };
    validateSchedulePayload(merged);
    const { course, group } = hydrateCourseGroup(db, merged);
    const recurring = merged.recurring !== false && merged.recurring !== "false";
    const updated = db.update("schedules", row.id, {
      courseId: course.id,
      courseCode: course.code,
      courseName: course.name,
      lecturer: merged.lecturer || course.lecturer,
      groupId: group.id,
      groupCode: group.code,
      classroom: merged.classroom,
      building: merged.building,
      startTime: merged.startTime,
      endTime: merged.endTime,
      weekday: recurring ? Number(merged.weekday) : null,
      date: recurring ? null : merged.date,
      recurring,
      notes: merged.notes || "",
    });
    return ok(res, updated);
  } catch (err) {
    return next(err);
  }
});

router.delete("/schedules/:id", (req, res) => {
  if (!getDb().remove("schedules", req.params.id)) return fail(res, 404, "Schedule not found");
  return ok(res, { deleted: true });
});

router.get("/assignments", (_req, res) => ok(res, getDb().all("assignments")));

router.post("/assignments", (req, res, next) => {
  try {
    requireFields(req.body || {}, ["title", "courseId", "groupId", "deadline"]);
    const db = getDb();
    const course = db.findById("courses", req.body.courseId);
    const group = db.findById("groups", req.body.groupId);
    if (!course) throw new HttpError(400, "Unknown course");
    if (!group) throw new HttpError(400, "Unknown group");
    const doc = {
      id: `hw_${Date.now().toString(16)}`,
      title: String(req.body.title).trim(),
      description: String(req.body.description || ""),
      courseId: course.id,
      courseCode: course.code,
      courseName: course.name,
      groupId: group.id,
      groupCode: group.code,
      publishedAt: req.body.publishedAt || new Date().toISOString().slice(0, 16).replace("T", "T"),
      deadline: String(req.body.deadline),
      attachmentUrl: String(req.body.attachmentUrl || ""),
      status: req.body.status === "draft" ? "draft" : "published",
      demo: false,
    };
    return ok(res, db.insert("assignments", doc));
  } catch (err) {
    return next(err);
  }
});

router.patch("/assignments/:id", (req, res) => {
  const db = getDb();
  const row = db.findById("assignments", req.params.id);
  if (!row) return fail(res, 404, "Assignment not found");
  const patch = {};
  ["title", "description", "deadline", "publishedAt", "attachmentUrl", "status"].forEach((k) => {
    if (req.body[k] !== undefined) patch[k] = req.body[k];
  });
  if (req.body.courseId) {
    const course = db.findById("courses", req.body.courseId);
    if (!course) return fail(res, 400, "Unknown course");
    patch.courseId = course.id;
    patch.courseCode = course.code;
    patch.courseName = course.name;
  }
  if (req.body.groupId) {
    const group = db.findById("groups", req.body.groupId);
    if (!group) return fail(res, 400, "Unknown group");
    patch.groupId = group.id;
    patch.groupCode = group.code;
  }
  return ok(res, db.update("assignments", row.id, patch));
});

router.delete("/assignments/:id", (req, res) => {
  const db = getDb();
  if (!db.remove("assignments", req.params.id)) return fail(res, 404, "Assignment not found");
  db.removeWhere("assignmentCompletions", (c) => c.assignmentId === req.params.id);
  return ok(res, { deleted: true });
});

function upsertLocation(body, existing) {
  requireFields(body, ["name", "category", "building"]);
  return {
    name: String(body.name).trim(),
    category: String(body.category).trim(),
    building: String(body.building).trim(),
    floor: String(body.floor || ""),
    room: String(body.room || ""),
    openTime: body.openTime || "",
    closeTime: body.closeTime || "",
    description: String(body.description || ""),
    directions: String(body.directions || ""),
    mapUrl: String(body.mapUrl || ""),
    demo: existing ? existing.demo : false,
  };
}

router.get("/locations", (_req, res) => ok(res, getDb().all("locations")));

router.post("/locations", (req, res, next) => {
  try {
    const doc = { id: `loc_${Date.now().toString(16)}`, ...upsertLocation(req.body || {}) };
    return ok(res, getDb().insert("locations", doc));
  } catch (err) {
    return next(err);
  }
});

router.patch("/locations/:id", (req, res, next) => {
  try {
    const db = getDb();
    const row = db.findById("locations", req.params.id);
    if (!row) return fail(res, 404, "Location not found");
    return ok(res, db.update("locations", row.id, upsertLocation({ ...row, ...req.body }, row)));
  } catch (err) {
    return next(err);
  }
});

router.delete("/locations/:id", (req, res) => {
  if (!getDb().remove("locations", req.params.id)) return fail(res, 404, "Location not found");
  return ok(res, { deleted: true });
});

function upsertPost(body, type, existing) {
  requireFields(body, ["title", "description", "category"]);
  return {
    title: String(body.title).trim(),
    description: String(body.description).trim(),
    category: String(body.category).trim(),
    publishedAt: body.publishedAt || new Date().toISOString(),
    eventDate: body.eventDate || null,
    startTime: body.startTime || "",
    endTime: body.endTime || "",
    groupId: body.groupId || null,
    location: String(body.location || ""),
    link: String(body.link || ""),
    demo: existing ? existing.demo : false,
  };
}

router.get("/announcements", (_req, res) => ok(res, getDb().all("announcements")));
router.post("/announcements", (req, res, next) => {
  try {
    const doc = { id: `ann_${Date.now().toString(16)}`, ...upsertPost(req.body || {}, "ann") };
    return ok(res, getDb().insert("announcements", doc));
  } catch (err) {
    return next(err);
  }
});
router.patch("/announcements/:id", (req, res, next) => {
  try {
    const db = getDb();
    const row = db.findById("announcements", req.params.id);
    if (!row) return fail(res, 404, "Announcement not found");
    return ok(res, db.update("announcements", row.id, upsertPost({ ...row, ...req.body }, "ann", row)));
  } catch (err) {
    return next(err);
  }
});
router.delete("/announcements/:id", (req, res) => {
  if (!getDb().remove("announcements", req.params.id)) return fail(res, 404, "Announcement not found");
  return ok(res, { deleted: true });
});

router.get("/events", (_req, res) => ok(res, getDb().all("events")));
router.post("/events", (req, res, next) => {
  try {
    requireFields(req.body || {}, ["title", "description", "category", "eventDate"]);
    const doc = { id: `evt_${Date.now().toString(16)}`, ...upsertPost(req.body, "evt") };
    return ok(res, getDb().insert("events", doc));
  } catch (err) {
    return next(err);
  }
});
router.patch("/events/:id", (req, res, next) => {
  try {
    const db = getDb();
    const row = db.findById("events", req.params.id);
    if (!row) return fail(res, 404, "Event not found");
    return ok(res, db.update("events", row.id, upsertPost({ ...row, ...req.body }, "evt", row)));
  } catch (err) {
    return next(err);
  }
});
router.delete("/events/:id", (req, res) => {
  if (!getDb().remove("events", req.params.id)) return fail(res, 404, "Event not found");
  return ok(res, { deleted: true });
});

function findCourseByCode(db, code) {
  return db.findOne("courses", (c) => c.code.toLowerCase() === String(code).toLowerCase());
}
function findGroupByCode(db, code) {
  return db.findOne("groups", (g) => g.code.toLowerCase() === String(code).toLowerCase());
}

router.post("/import/schedules", upload.single("file"), (req, res, next) => {
  try {
    const text = req.file ? req.file.buffer.toString("utf8") : req.body.csv || "";
    const { headers, records } = parseCsv(text);
    const missing = validateHeaders(headers, [
      "courseCode",
      "groupCode",
      "classroom",
      "building",
      "startTime",
      "endTime",
    ]);
    if (missing.length) throw new HttpError(400, `CSV missing columns: ${missing.join(", ")}`);
    const db = getDb();
    const errors = [];
    const created = [];
    const skipped = [];
    records.forEach((row) => {
      const course = findCourseByCode(db, row.courseCode);
      const group = findGroupByCode(db, row.groupCode);
      if (!course) {
        errors.push({ line: row._line, error: `Unknown course ${row.courseCode}` });
        return;
      }
      if (!group) {
        errors.push({ line: row._line, error: `Unknown group ${row.groupCode}` });
        return;
      }
      if (!isValidTime(row.startTime) || !isValidTime(row.endTime) || minutesBetween(row.startTime, row.endTime) <= 0) {
        errors.push({ line: row._line, error: "Invalid start/end time" });
        return;
      }
      const recurring = String(row.recurring || "true").toLowerCase() !== "false";
      const weekday = row.weekday === "" ? null : Number(row.weekday);
      const date = row.date || null;
      if (recurring && (weekday === null || weekday < 0 || weekday > 6)) {
        errors.push({ line: row._line, error: "Recurring row needs weekday 0-6" });
        return;
      }
      if (!recurring && !isValidISODate(date)) {
        errors.push({ line: row._line, error: "One-off row needs date YYYY-MM-DD" });
        return;
      }
      const dup = db.findOne("schedules", (s) => {
        return (
          s.courseId === course.id &&
          s.groupId === group.id &&
          s.startTime === row.startTime &&
          s.endTime === row.endTime &&
          ((recurring && s.weekday === weekday) || (!recurring && s.date === date))
        );
      });
      if (dup) {
        skipped.push({ line: row._line, id: dup.id, reason: "duplicate" });
        return;
      }
      created.push(
        db.insert("schedules", {
          id: `sch_imp_${Date.now().toString(16)}_${row._line}`,
          courseId: course.id,
          courseCode: course.code,
          courseName: course.name,
          lecturer: row.lecturer || course.lecturer,
          groupId: group.id,
          groupCode: group.code,
          classroom: row.classroom,
          building: row.building,
          startTime: row.startTime,
          endTime: row.endTime,
          weekday: recurring ? weekday : null,
          date: recurring ? null : date,
          recurring,
          notes: row.notes || "",
          demo: false,
        })
      );
    });
    return ok(res, { created: created.length, skipped: skipped.length, errors, rows: created, skippedRows: skipped });
  } catch (err) {
    return next(err);
  }
});

router.post("/import/assignments", upload.single("file"), (req, res, next) => {
  try {
    const text = req.file ? req.file.buffer.toString("utf8") : req.body.csv || "";
    const { headers, records } = parseCsv(text);
    const missing = validateHeaders(headers, ["title", "courseCode", "groupCode", "deadline"]);
    if (missing.length) throw new HttpError(400, `CSV missing columns: ${missing.join(", ")}`);
    const db = getDb();
    const errors = [];
    const created = [];
    const skipped = [];
    records.forEach((row) => {
      const course = findCourseByCode(db, row.courseCode);
      const group = findGroupByCode(db, row.groupCode);
      if (!course || !group) {
        errors.push({ line: row._line, error: "Unknown course or group" });
        return;
      }
      if (!row.title) {
        errors.push({ line: row._line, error: "Title required" });
        return;
      }
      const dup = db.findOne(
        "assignments",
        (a) => a.title === row.title && a.courseId === course.id && a.groupId === group.id && a.deadline === row.deadline
      );
      if (dup) {
        skipped.push({ line: row._line, reason: "duplicate" });
        return;
      }
      created.push(
        db.insert("assignments", {
          id: `hw_imp_${Date.now().toString(16)}_${row._line}`,
          title: row.title,
          description: row.description || "",
          courseId: course.id,
          courseCode: course.code,
          courseName: course.name,
          groupId: group.id,
          groupCode: group.code,
          publishedAt: row.publishedAt || new Date().toISOString(),
          deadline: row.deadline,
          attachmentUrl: row.attachmentUrl || "",
          status: "published",
          demo: false,
        })
      );
    });
    return ok(res, { created: created.length, skipped: skipped.length, errors, rows: created, skippedRows: skipped });
  } catch (err) {
    return next(err);
  }
});

router.post("/demo/reset", async (req, res, next) => {
  try {
    if (process.env.ALLOW_DEMO_RESET !== "true") {
      return fail(res, 403, "Demo reset is disabled. Set ALLOW_DEMO_RESET=true in the environment.");
    }
    await seedDatabase({ resetDemo: true });
    return ok(res, { reset: true, note: "Labeled demo records were refreshed. Non-demo records were kept." });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
