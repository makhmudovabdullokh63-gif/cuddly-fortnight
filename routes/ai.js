"use strict";

const express = require("express");
const { ok, fail, requireFields } = require("../utils/http");
const { requireAuth } = require("../middleware/auth");
const assistant = require("../services/assistant");
const { isConfigured } = require("../services/ai");

const router = express.Router();

router.get("/status", requireAuth, (_req, res) => {
  return ok(res, { llm: isConfigured(), fallback: !isConfigured() });
});

router.post("/chat", requireAuth, async (req, res, next) => {
  try {
    requireFields(req.body || {}, ["message"]);
    const message = String(req.body.message).trim();
    if (message.length < 2) return fail(res, 400, "Message is too short");
    if (message.length > 2000) return fail(res, 400, "Message is too long");
    const language = ["en", "ru", "uz"].includes(req.body.language) ? req.body.language : req.user.language;
    const result = await assistant.chat({ user: req.user, message, language });
    return ok(res, result);
  } catch (err) {
    return next(err);
  }
});

router.get("/history", requireAuth, (req, res) => {
  return ok(res, assistant.history(req.user.id));
});

router.delete("/history", requireAuth, (req, res) => {
  assistant.clearHistory(req.user.id);
  return ok(res, { cleared: true });
});

module.exports = router;
