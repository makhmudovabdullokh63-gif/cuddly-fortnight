"use strict";

const { HttpError, fail } = require("../utils/http");

function notFound(_req, res) {
  return fail(res, 404, "Not found");
}

function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) {
    return fail(res, err.status, err.message, err.details);
  }
  if (err && err.code === "LIMIT_FILE_SIZE") {
    return fail(res, 400, "Uploaded file is too large");
  }
  console.error(err);
  return fail(res, 500, "Internal server error");
}

module.exports = { notFound, errorHandler };
