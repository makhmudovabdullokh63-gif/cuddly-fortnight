"use strict";

const express = require("express");
const bcrypt = require("bcryptjs");
const { getDb } = require("../database/store");
const { ok, fail, requireFields, sanitizeUser, HttpError } = require("../utils/http");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validPassword(pw) {
  return typeof pw === "string" && pw.length >= 8 && pw.length <= 72;
}

router.post("/register", async (req, res, next) => {
  try {
    requireFields(req.body || {}, ["email", "password", "name"]);
    const email = String(req.body.email).trim().toLowerCase();
    const name = String(req.body.name).trim();
    const password = req.body.password;
    const language = ["en", "ru", "uz"].includes(req.body.language) ? req.body.language : "en";
    if (!EMAIL_RE.test(email)) throw new HttpError(400, "Invalid email");
    if (!validPassword(password)) throw new HttpError(400, "Password must be 8–72 characters");
    if (name.length < 2) throw new HttpError(400, "Name is too short");

    const db = getDb();
    if (db.findOne("users", (u) => u.email === email)) {
      throw new HttpError(409, "An account with this email already exists");
    }
    const groupCode = String(req.body.groupCode || "CS-21").toUpperCase();
    const group = db.findOne("groups", (g) => g.code === groupCode) || db.findById("groups", "grp_cs21");
    const user = {
      id: `usr_${Date.now().toString(16)}`,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      name,
      role: "student",
      groupId: group ? group.id : null,
      language,
      createdAt: new Date().toISOString(),
      demo: false,
    };
    db.insert("users", user);
    req.session.userId = user.id;
    req.session.role = user.role;
    db.insert("statsEvents", {
      id: `stat_${Date.now()}`,
      type: "register",
      userId: user.id,
      createdAt: new Date().toISOString(),
    });
    return ok(res, { user: sanitizeUser(user) });
  } catch (err) {
    return next(err);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    requireFields(req.body || {}, ["email", "password"]);
    const email = String(req.body.email).trim().toLowerCase();
    const db = getDb();
    const user = db.findOne("users", (u) => u.email === email);
    if (!user) throw new HttpError(401, "Invalid email or password");
    const match = await bcrypt.compare(String(req.body.password), user.passwordHash);
    if (!match) throw new HttpError(401, "Invalid email or password");
    req.session.userId = user.id;
    req.session.role = user.role;
    db.insert("statsEvents", {
      id: `stat_${Date.now()}`,
      type: "login",
      userId: user.id,
      createdAt: new Date().toISOString(),
      demo: Boolean(user.demo),
    });
    return ok(res, { user: sanitizeUser(user) });
  } catch (err) {
    return next(err);
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("campusai.sid");
    return ok(res, { loggedOut: true });
  });
});

router.get("/me", requireAuth, (req, res) => {
  const db = getDb();
  const group = req.user.groupId ? db.findById("groups", req.user.groupId) : null;
  return ok(res, { user: req.user, group });
});

router.patch("/profile", requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const patch = {};
    if (req.body.name) {
      const name = String(req.body.name).trim();
      if (name.length < 2) throw new HttpError(400, "Name is too short");
      patch.name = name;
    }
    if (req.body.language) {
      if (!["en", "ru", "uz"].includes(req.body.language)) throw new HttpError(400, "Unsupported language");
      patch.language = req.body.language;
    }
    if (req.body.groupCode && req.user.role === "student") {
      const group = db.findOne("groups", (g) => g.code === String(req.body.groupCode).toUpperCase());
      if (!group) throw new HttpError(400, "Unknown group code");
      patch.groupId = group.id;
    }
    if (req.body.password) {
      if (!validPassword(req.body.password)) throw new HttpError(400, "Password must be 8–72 characters");
      patch.passwordHash = bcrypt.hashSync(req.body.password, 10);
    }
    const updated = db.update("users", req.user.id, patch);
    return ok(res, { user: sanitizeUser(updated) });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
