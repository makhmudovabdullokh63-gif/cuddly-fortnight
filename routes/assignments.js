"use strict";

const express = require("express");
const { getDb } = require("../database/store");
const { ok, fail, paginate } = require("../utils/http");
const { requireAuth } = require("../middleware/auth");
const assignmentSvc = require("../services/assignments");

const router = express.Router();

router.get("/", requireAuth, (req, res) => {
  const db = getDb();
  const list = assignmentSvc.filterForStudent(
    db.all("assignments"),
    db.all("assignmentCompletions"),
    req.user,
    req.query
  );
  const page = paginate(list, req.query);
  return ok(res, page.items, { page: page.page, limit: page.limit, total: page.total, pages: page.pages });
});

router.post("/:id/complete", requireAuth, (req, res) => {
  const db = getDb();
  const assignment = db.findById("assignments", req.params.id);
  if (!assignment) return fail(res, 404, "Assignment not found");
  const exists = db.findOne(
    "assignmentCompletions",
    (c) => c.assignmentId === assignment.id && c.userId === req.user.id
  );
  if (!exists) {
    db.insert("assignmentCompletions", {
      id: `cmp_${Date.now().toString(16)}`,
      assignmentId: assignment.id,
      userId: req.user.id,
      completedAt: new Date().toISOString(),
    });
  }
  const decorated = assignmentSvc.decorate(assignment, db.all("assignmentCompletions"), req.user.id);
  return ok(res, decorated);
});

router.delete("/:id/complete", requireAuth, (req, res) => {
  const db = getDb();
  db.removeWhere(
    "assignmentCompletions",
    (c) => c.assignmentId === req.params.id && c.userId === req.user.id
  );
  const assignment = db.findById("assignments", req.params.id);
  if (!assignment) return fail(res, 404, "Assignment not found");
  return ok(res, assignmentSvc.decorate(assignment, db.all("assignmentCompletions"), req.user.id));
});

module.exports = router;
