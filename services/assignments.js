"use strict";

const { todayISO, zonedParts } = require("../utils/dates");

function deadlineStamp(assignment) {
  return String(assignment.deadline || "").replace("T", " ").slice(0, 16);
}

function nowStamp(now = new Date()) {
  const p = zonedParts(now);
  return `${p.date} ${p.time}`;
}

function isCompleted(completions, assignmentId, userId) {
  return completions.some((c) => c.assignmentId === assignmentId && c.userId === userId);
}

function computedStatus(assignment, completions, userId, now = new Date()) {
  if (isCompleted(completions, assignment.id, userId)) return "completed";
  if (deadlineStamp(assignment) < nowStamp(now)) return "overdue";
  return "upcoming";
}

function decorate(assignment, completions, userId, now) {
  const status = computedStatus(assignment, completions, userId, now);
  return {
    ...assignment,
    computedStatus: status,
    completed: status === "completed",
  };
}

function filterForStudent(assignments, completions, user, query = {}, now = new Date()) {
  let list = assignments.filter(
    (a) => a.status !== "draft" && (!user.groupId || a.groupId === user.groupId || a.groupId === null)
  );
  if (query.course) {
    const q = String(query.course).toLowerCase();
    list = list.filter(
      (a) => a.courseCode.toLowerCase() === q || a.courseName.toLowerCase().includes(q)
    );
  }
  if (query.status) {
    list = list.filter((a) => computedStatus(a, completions, user.id, now) === query.status);
  }
  const decorated = list.map((a) => decorate(a, completions, user.id, now));
  const sort = query.sort || "deadline";
  decorated.sort((a, b) => {
    if (sort === "course") return a.courseCode.localeCompare(b.courseCode);
    if (sort === "title") return a.title.localeCompare(b.title);
    return String(a.deadline).localeCompare(String(b.deadline));
  });
  return decorated;
}

function upcoming(assignments, completions, user, limit = 5, now = new Date()) {
  return filterForStudent(assignments, completions, user, { status: "upcoming" }, now)
    .slice(0, limit);
}

module.exports = {
  decorate,
  filterForStudent,
  upcoming,
  computedStatus,
  nowStamp,
  todayISO,
};
