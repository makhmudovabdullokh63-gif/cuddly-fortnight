"use strict";

const express = require("express");
const { getDb } = require("../database/store");
const { ok } = require("../utils/http");
const { requireAuth } = require("../middleware/auth");
const { todayISO, isValidISODate } = require("../utils/dates");
const scheduleSvc = require("../services/schedule");

const router = express.Router();

function groupIdFor(req) {
  if (req.user.role === "admin" && req.query.groupId) return req.query.groupId;
  return req.user.groupId;
}

router.get("/today", requireAuth, (req, res) => {
  const db = getDb();
  const date = todayISO();
  const classes = scheduleSvc.forGroupOnDate(db.all("schedules"), groupIdFor(req), date);
  const snapshot = scheduleSvc.currentOrUpcoming(db.all("schedules"), groupIdFor(req));
  return ok(res, { date, classes, next: snapshot.next, current: snapshot.current, now: snapshot.now });
});

router.get("/week", requireAuth, (req, res) => {
  const db = getDb();
  const from = req.query.start && isValidISODate(req.query.start) ? req.query.start : todayISO();
  const weekStart = scheduleSvc.resolveWeekStart(from);
  const days = scheduleSvc.weekForGroup(db.all("schedules"), groupIdFor(req), weekStart);
  return ok(res, { weekStart, days });
});

router.get("/", requireAuth, (req, res) => {
  const db = getDb();
  const date = req.query.date && isValidISODate(req.query.date) ? req.query.date : todayISO();
  const view = req.query.view === "week" ? "week" : "day";
  const gid = groupIdFor(req);
  const course = req.query.course ? String(req.query.course).toLowerCase() : "";
  if (view === "week") {
    const weekStart = scheduleSvc.resolveWeekStart(date);
    let days = scheduleSvc.weekForGroup(db.all("schedules"), gid, weekStart);
    if (course) {
      days = days.map((d) => ({
        ...d,
        classes: d.classes.filter(
          (c) => c.courseCode.toLowerCase() === course || c.courseName.toLowerCase().includes(course)
        ),
      }));
    }
    return ok(res, { view, weekStart, days, next: scheduleSvc.nextClass(db.all("schedules"), gid) });
  }
  let classes = scheduleSvc.forGroupOnDate(db.all("schedules"), gid, date);
  if (course) {
    classes = classes.filter(
      (c) => c.courseCode.toLowerCase() === course || c.courseName.toLowerCase().includes(course)
    );
  }
  return ok(res, {
    view,
    date,
    classes,
    next: scheduleSvc.nextClass(db.all("schedules"), gid),
  });
});

module.exports = router;
