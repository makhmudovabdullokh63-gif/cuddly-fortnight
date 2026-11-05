"use strict";

const {
  todayISO,
  addDaysISO,
  startOfWeekISO,
  weekdayFromISO,
  zonedParts,
  compareTime,
} = require("../utils/dates");

function occursOnDate(item, dateISO) {
  if (item.date) return item.date === dateISO;
  if (item.recurring && typeof item.weekday === "number") {
    return weekdayFromISO(dateISO) === item.weekday;
  }
  return false;
}

function forGroupOnDate(records, groupId, dateISO) {
  return records
    .filter((row) => (!groupId || row.groupId === groupId) && occursOnDate(row, dateISO))
    .sort((a, b) => compareTime(a.startTime, b.startTime));
}

function weekForGroup(records, groupId, weekStartISO) {
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const date = addDaysISO(weekStartISO, i);
    days.push({
      date,
      weekday: weekdayFromISO(date),
      classes: forGroupOnDate(records, groupId, date),
    });
  }
  return days;
}

function nextClass(records, groupId, now = new Date()) {
  const parts = zonedParts(now);
  for (let offset = 0; offset < 14; offset += 1) {
    const date = addDaysISO(parts.date, offset);
    const classes = forGroupOnDate(records, groupId, date);
    for (const cls of classes) {
      if (offset === 0 && compareTime(cls.endTime, parts.time) <= 0) continue;
      return { ...cls, date, isToday: offset === 0 };
    }
  }
  return null;
}

function currentOrUpcoming(records, groupId, now = new Date()) {
  const parts = zonedParts(now);
  const todayClasses = forGroupOnDate(records, groupId, parts.date);
  const current = todayClasses.find(
    (cls) => compareTime(cls.startTime, parts.time) <= 0 && compareTime(cls.endTime, parts.time) > 0
  );
  return {
    now: parts,
    current,
    next: nextClass(records, groupId, now),
    today: todayClasses,
  };
}

function resolveWeekStart(queryDate) {
  const date = queryDate || todayISO();
  return startOfWeekISO(date);
}

module.exports = {
  occursOnDate,
  forGroupOnDate,
  weekForGroup,
  nextClass,
  currentOrUpcoming,
  resolveWeekStart,
};
