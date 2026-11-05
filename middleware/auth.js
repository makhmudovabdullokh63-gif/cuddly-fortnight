"use strict";

const { getDb } = require("../database/store");
const { fail, sanitizeUser } = require("../utils/http");

function currentUser(req) {
  const userId = req.session && req.session.userId;
  if (!userId) return null;
  const db = getDb();
  const user = db.findById("users", userId);
  return user ? sanitizeUser(user) : null;
}

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return fail(res, 401, "Authentication required");
  req.user = user;
  return next();
}

function requireAdmin(req, res, next) {
  const user = currentUser(req);
  if (!user) return fail(res, 401, "Authentication required");
  if (user.role !== "admin") return fail(res, 403, "Administrator access required");
  req.user = user;
  return next();
}

function requireStudent(req, res, next) {
  const user = currentUser(req);
  if (!user) return fail(res, 401, "Authentication required");
  if (user.role !== "student" && user.role !== "admin") {
    return fail(res, 403, "Student access required");
  }
  req.user = user;
  return next();
}

function attachUser(req, _res, next) {
  req.user = currentUser(req);
  next();
}

module.exports = { currentUser, requireAuth, requireAdmin, requireStudent, attachUser };
