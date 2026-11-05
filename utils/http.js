 "use strict";

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function ok(res, data, extra = {}) {
  return res.json({ ok: true, data, ...extra });
}

function fail(res, status, message, details) {
  return res.status(status).json({
    ok: false,
    error: message,
    details: details || undefined,
  });
}

function paginate(list, query) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
  const start = (page - 1) * limit;
  return {
    items: list.slice(start, start + limit),
    page,
    limit,
    total: list.length,
    pages: Math.max(1, Math.ceil(list.length / limit)),
  };
}

function requireFields(body, fields) {
  const missing = fields.filter((f) => {
    const v = body[f];
    return v === undefined || v === null || String(v).trim() === "";
  });
  if (missing.length) {
    throw new HttpError(400, `Missing required fields: ${missing.join(", ")}`, { missing });
  }
}

function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
}

module.exports = { HttpError, ok, fail, paginate, requireFields, sanitizeUser };
