"use strict";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function timezone() {
  return process.env.APP_TIMEZONE || "Asia/Tashkent";
}

function zonedParts(date = new Date()) {
  const tz = timezone();
  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const timeStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  const weekdayName = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  }).format(date);
  const weekday = WEEKDAYS.indexOf(weekdayName);
  return {
    date: dateStr,
    time: timeStr.replace("24:", "00:"),
    weekday: weekday === -1 ? date.getDay() : weekday,
    weekdayName,
    timezone: tz,
  };
}

function todayISO(date = new Date()) {
  return zonedParts(date).date;
}

function addDaysISO(isoDate, days) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d + days);
  const next = new Date(utc);
  const yyyy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function weekdayFromISO(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function startOfWeekISO(isoDate) {
  const wd = weekdayFromISO(isoDate);
  const mondayOffset = wd === 0 ? -6 : 1 - wd;
  return addDaysISO(isoDate, mondayOffset);
}

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
}

function isValidISODate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function compareTime(a, b) {
  return String(a).localeCompare(String(b));
}

function minutesBetween(start, end) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

function formatDisplayDate(isoDate, locale = "en") {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const loc = locale === "ru" ? "ru-RU" : locale === "uz" ? "uz-UZ" : "en-GB";
  return new Intl.DateTimeFormat(loc, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

function weekdayName(index, locale = "en") {
  const names = {
    en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    ru: ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"],
    uz: ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"],
  };
  return (names[locale] || names.en)[index] || "";
}

module.exports = {
  timezone,
  zonedParts,
  todayISO,
  addDaysISO,
  weekdayFromISO,
  startOfWeekISO,
  isValidTime,
  isValidISODate,
  compareTime,
  minutesBetween,
  formatDisplayDate,
  weekdayName,
  WEEKDAYS,
};
