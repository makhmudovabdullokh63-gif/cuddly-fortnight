"use strict";

const express = require("express");
const { getDb } = require("../database/store");
const { ok, paginate } = require("../utils/http");
const { requireAuth } = require("../middleware/auth");
const assignmentSvc = require("../services/assignments");
const scheduleSvc = require("../services/schedule");

const router = express.Router();

router.get("/locations", requireAuth, (req, res) => {
  const db = getDb();
  const q = String(req.query.q || "").toLowerCase();
  const category = String(req.query.category || "");
  let list = db.all("locations");
  if (category) list = list.filter((l) => l.category === category);
  if (q) {
    list = list.filter((l) =>
      `${l.name} ${l.building} ${l.room} ${l.description} ${l.directions} ${l.category}`
        .toLowerCase()
        .includes(q)
    );
  }
  const page = paginate(list, req.query);
  return ok(res, page.items, { total: page.total, page: page.page });
});

router.get("/announcements", requireAuth, (req, res) => {
  const db = getDb();
  const q = String(req.query.q || "").toLowerCase();
  const category = String(req.query.category || "");
  let list = db.all("announcements").filter((a) => !a.groupId || a.groupId === req.user.groupId || req.user.role === "admin");
  if (category) list = list.filter((a) => a.category === category);
  if (q) list = list.filter((a) => `${a.title} ${a.description}`.toLowerCase().includes(q));
  list.sort((a, b) => String(b.publishedAt).localeCompare(a.publishedAt));
  return ok(res, paginate(list, req.query).items, { total: list.length });
});

router.get("/events", requireAuth, (req, res) => {
  const db = getDb();
  const q = String(req.query.q || "").toLowerCase();
  let list = db.all("events").filter((e) => !e.groupId || e.groupId === req.user.groupId || req.user.role === "admin");
  if (req.query.upcoming === "true") {
    const today = require("../utils/dates").todayISO();
    list = list.filter((e) => e.eventDate && e.eventDate >= today);
  }
  if (q) list = list.filter((e) => `${e.title} ${e.description}`.toLowerCase().includes(q));
  list.sort((a, b) => String(a.eventDate).localeCompare(String(b.eventDate)));
  return ok(res, list);
});

router.get("/courses", requireAuth, (req, res) => {
  return ok(res, getDb().all("courses"));
});

router.get("/groups", requireAuth, (req, res) => {
  return ok(res, getDb().all("groups"));
});

router.get("/dashboard", requireAuth, (req, res) => {
  const db = getDb();
  const schedules = db.all("schedules");
  const snapshot = scheduleSvc.currentOrUpcoming(schedules, req.user.groupId);
  const assignments = assignmentSvc.filterForStudent(
    db.all("assignments"),
    db.all("assignmentCompletions"),
    req.user
  );
  const announcements = db
    .all("announcements")
    .filter((a) => !a.groupId || a.groupId === req.user.groupId)
    .sort((a, b) => String(b.publishedAt).localeCompare(a.publishedAt))
    .slice(0, 4);
  const today = require("../utils/dates").todayISO();
  const events = db
    .all("events")
    .filter((e) => (!e.groupId || e.groupId === req.user.groupId) && e.eventDate && e.eventDate >= today)
    .sort((a, b) => String(a.eventDate).localeCompare(String(b.eventDate)))
    .slice(0, 4);
  const group = req.user.groupId ? db.findById("groups", req.user.groupId) : null;
  return ok(res, {
    user: req.user,
    group,
    university: db.state.meta,
    now: snapshot.now,
    nextClass: snapshot.next,
    todayClasses: snapshot.today,
    upcomingAssignments: assignments.filter((a) => a.computedStatus === "upcoming").slice(0, 5),
    overdueAssignments: assignments.filter((a) => a.computedStatus === "overdue"),
    announcements,
    events,
  });
});

module.exports = router;
