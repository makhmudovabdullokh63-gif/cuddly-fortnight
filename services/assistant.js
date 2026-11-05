"use strict";

const { getDb } = require("../database/store");
const { completeChat, isConfigured } = require("./ai");
const scheduleSvc = require("./schedule");
const assignmentSvc = require("./assignments");
const { addDaysISO, zonedParts, formatDisplayDate, weekdayName } = require("../utils/dates");

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .trim();
}

function detectIntent(message) {
  const q = normalize(message);
  const tests = [
    { intent: "tomorrow", keys: ["tomorrow", "ertaga", "завтра"] },
    { intent: "today", keys: ["today", "bugun", "сегодня", "today's class", "today schedule"] },
    { intent: "week", keys: ["this week", "week schedule", "shu hafta", "на этой неделе", "weekly"] },
    { intent: "next_class", keys: ["next class", "next lecture", "when does my next", "keyingi dars", "следующ"] },
    { intent: "homework", keys: ["homework", "assignment", "uy vazifa", "домашн", "what homework"] },
    { intent: "deadlines", keys: ["deadline", "due", "muddat", "дедлайн", "upcoming assignment"] },
    { intent: "events", keys: ["event", "happening today", "tadbir", "мероприят"] },
    { intent: "announcements", keys: ["announcement", "news", "e'lon", "объявлен"] },
    { intent: "hours", keys: ["close", "open", "hours", "yopiladi", "ochiladi", "закрыв", "работает"] },
    { intent: "location", keys: ["where", "qayer", "где", "library", "cafeteria", "lab", "administration", "kutubxona", "oshxona", "столов", "библиотек", "компьютер", "деканат"] },
    { intent: "classroom", keys: ["classroom", "room", "auditor", "xona", "аудитор"] },
  ];
  for (const t of tests) {
    if (t.keys.some((k) => q.includes(k))) return t.intent;
  }
  return "general";
}

function publicUser(user) {
  return { id: user.id, name: user.name, role: user.role, groupId: user.groupId, language: user.language };
}

function studentContext(user) {
  const db = getDb();
  const group = user.groupId ? db.findById("groups", user.groupId) : null;
  const schedules = db.all("schedules");
  const assignments = db.all("assignments");
  const completions = db.all("assignmentCompletions");
  const locations = db.all("locations");
  const announcements = db.all("announcements").filter(
    (a) => !a.groupId || a.groupId === user.groupId
  );
  const events = db.all("events").filter((e) => !e.groupId || e.groupId === user.groupId);
  const now = new Date();
  const parts = zonedParts(now);
  const snapshot = scheduleSvc.currentOrUpcoming(schedules, user.groupId, now);
  const week = scheduleSvc.weekForGroup(schedules, user.groupId, scheduleSvc.resolveWeekStart(parts.date));
  const hw = assignmentSvc.filterForStudent(assignments, completions, user, {}, now);
  return {
    university: db.state.meta,
    user: publicUser(user),
    group,
    now: parts,
    todayClasses: snapshot.today,
    nextClass: snapshot.next,
    currentClass: snapshot.current,
    week,
    assignments: hw,
    upcomingAssignments: hw.filter((a) => a.computedStatus === "upcoming").slice(0, 8),
    overdueAssignments: hw.filter((a) => a.computedStatus === "overdue"),
    locations,
    announcements: announcements.sort((a, b) => String(b.publishedAt).localeCompare(a.publishedAt)).slice(0, 8),
    events: events.sort((a, b) => String(a.eventDate).localeCompare(b.eventDate)),
  };
}

function searchLocations(locations, query) {
  const q = normalize(query);
  const synonyms = [
    ["library", "kutubxona", "библиотек"],
    ["cafeteria", "cafe", "oshxona", "столов", "canteen"],
    ["computer", "lab", "kompyuter", "лаборатор"],
    ["admin", "registrar", "dekana", "админ"],
    ["student service", "talaba", "студ"],
    ["sport", "gym", "sport"],
    ["clinic", "health", "salomat", "мед"],
    ["lecture", "hall", "auditor"],
  ];
  return locations.filter((loc) => {
    const hay = normalize(`${loc.name} ${loc.category} ${loc.building} ${loc.room} ${loc.description}`);
    if (q.split(/\s+/).some((w) => w.length > 3 && hay.includes(w))) return true;
    return synonyms.some((group) => group.some((g) => q.includes(g)) && group.some((g) => hay.includes(g) || loc.category.includes(group[0].split(" ")[0])));
  });
}

function formatClass(cls, locale) {
  if (!cls) return null;
  const date = cls.date ? formatDisplayDate(cls.date, locale) : weekdayName(cls.weekday, locale);
  return `${cls.courseCode} ${cls.courseName} | ${cls.startTime}–${cls.endTime} | ${cls.building} ${cls.classroom} | ${cls.lecturer} | ${date}`;
}

function formatLocation(loc) {
  const hours = loc.openTime && loc.closeTime ? `Hours: ${loc.openTime}–${loc.closeTime}` : "Hours: not listed";
  const room = loc.room ? ` Room ${loc.room}.` : "";
  return `${loc.name} (${loc.category}) — ${loc.building}, floor ${loc.floor}.${room} ${hours}. ${loc.directions}`;
}

function pickRecords(intent, ctx, question) {
  switch (intent) {
    case "today":
      return { todayClasses: ctx.todayClasses, nextClass: ctx.nextClass, now: ctx.now };
    case "tomorrow": {
      const tomorrow = addDaysISO(ctx.now.date, 1);
      const classes = (ctx.week.find((d) => d.date === tomorrow) || { classes: [] }).classes;
      return { date: tomorrow, classes };
    }
    case "week":
      return { week: ctx.week };
    case "next_class":
    case "classroom":
      return { nextClass: ctx.nextClass, currentClass: ctx.currentClass };
    case "homework":
    case "deadlines":
      return {
        upcoming: ctx.upcomingAssignments,
        overdue: ctx.overdueAssignments,
      };
    case "events":
      return { events: ctx.events.filter((e) => e.eventDate >= ctx.now.date).slice(0, 8) };
    case "announcements":
      return { announcements: ctx.announcements };
    case "hours":
    case "location":
      return { locations: searchLocations(ctx.locations, question).slice(0, 6) };
    default:
      return {
        todayClasses: ctx.todayClasses,
        nextClass: ctx.nextClass,
        upcoming: ctx.upcomingAssignments.slice(0, 5),
        locations: searchLocations(ctx.locations, question).slice(0, 4),
        events: ctx.events.filter((e) => e.eventDate >= ctx.now.date).slice(0, 3),
        announcements: ctx.announcements.slice(0, 3),
      };
  }
}

function fallbackAnswer(intent, records, ctx, language) {
  const locale = language || ctx.user.language || "en";
  const lines = [];
  const disclaimer = locale === "ru"
    ? "Ответ построен по данным университета (правила, без LLM)."
    : locale === "uz"
      ? "Javob universitet ma'lumotlariga asoslangan (qoida asosidagi yordamchi, LLM yo'q)."
      : "Answered from stored university records (rule-based assistant, no LLM).";

  const missing = locale === "ru"
    ? "В сохранённых данных университета этой информации нет. Я не буду её выдумывать."
    : locale === "uz"
      ? "Universitet bazasida bu ma'lumot yo'q. Uni o'ylab topmayman."
      : "That information is not in the stored university data, so I will not invent it.";

  if (intent === "today") {
    if (!records.todayClasses.length) {
      lines.push(locale === "ru" ? "На сегодня занятий в вашем расписании нет." : locale === "uz" ? "Bugun dars jadvalingizda mashg'ulot yo'q." : "You have no classes scheduled today.");
    } else {
      lines.push(locale === "ru" ? "Занятия сегодня:" : locale === "uz" ? "Bugungi darslar:" : "Today's classes:");
      records.todayClasses.forEach((c) => lines.push("• " + formatClass(c, locale)));
    }
  } else if (intent === "tomorrow") {
    if (!records.classes.length) {
      lines.push(locale === "ru" ? "На завтра занятий нет." : locale === "uz" ? "Ertaga dars yo'q." : "No classes are scheduled tomorrow.");
    } else {
      lines.push(locale === "ru" ? "Завтра:" : locale === "uz" ? "Ertaga:" : `Tomorrow (${records.date}):`);
      records.classes.forEach((c) => lines.push("• " + formatClass({ ...c, date: records.date }, locale)));
    }
  } else if (intent === "week") {
    lines.push(locale === "ru" ? "Расписание на неделю:" : locale === "uz" ? "Haftalik dars jadvali:" : "This week's schedule:");
    records.week.forEach((day) => {
      if (!day.classes.length) return;
      lines.push(`${day.date}:`);
      day.classes.forEach((c) => lines.push("  • " + formatClass({ ...c, date: day.date }, locale)));
    });
    if (lines.length === 1) lines.push(missing);
  } else if (intent === "next_class" || intent === "classroom") {
    if (!records.nextClass) lines.push(locale === "ru" ? "Ближайших занятий в ближайшие 14 дней нет." : locale === "uz" ? "Keyingi 14 kunda dars topilmadi." : "No upcoming class was found in the next 14 days.");
    else {
      const c = records.nextClass;
      lines.push(locale === "ru" ? "Следующее занятие:" : locale === "uz" ? "Keyingi dars:" : "Your next class:");
      lines.push(formatClass(c, locale));
      lines.push(locale === "en" ? `Starts at ${c.startTime} and finishes at ${c.endTime} in ${c.building}, room ${c.classroom}.` : `${c.building}, ${c.classroom}. ${c.startTime}–${c.endTime}.`);
    }
  } else if (intent === "homework" || intent === "deadlines") {
    if (records.overdue && records.overdue.length) {
      lines.push(locale === "ru" ? "Просрочено:" : locale === "uz" ? "Muddati o'tgan:" : "Overdue:");
      records.overdue.forEach((a) => lines.push(`• ${a.courseCode} — ${a.title} (due ${a.deadline})`));
    }
    if (records.upcoming && records.upcoming.length) {
      lines.push(locale === "ru" ? "Ближайшие дедлайны:" : locale === "uz" ? "Yaqin muddatlar:" : "Upcoming deadlines:");
      records.upcoming.forEach((a) => lines.push(`• ${a.courseCode} — ${a.title} (due ${a.deadline})`));
    }
    if (lines.length === 0) lines.push(locale === "en" ? "No homework records were found for your group." : missing);
  } else if (intent === "events") {
    if (!records.events.length) lines.push(locale === "en" ? "No upcoming events are stored." : missing);
    else records.events.forEach((e) => lines.push(`• ${e.title} — ${e.eventDate} ${e.startTime || ""} (${e.location || "campus"})`));
  } else if (intent === "announcements") {
    records.announcements.forEach((a) => lines.push(`• ${a.title} (${a.publishedAt.slice(0, 10)}) — ${a.description}`));
    if (!records.announcements.length) lines.push(missing);
  } else if (intent === "location" || intent === "hours") {
    if (!records.locations.length) lines.push(missing);
    else records.locations.forEach((loc) => lines.push("• " + formatLocation(loc)));
  } else {
    if (ctx.nextClass) lines.push((locale === "en" ? "Next class: " : "") + formatClass(ctx.nextClass, locale));
    if (ctx.upcomingAssignments[0]) {
      const a = ctx.upcomingAssignments[0];
      lines.push(`Next deadline: ${a.courseCode} — ${a.title} (${a.deadline})`);
    }
    if (!lines.length) lines.push(missing);
  }

  lines.push("");
  lines.push(disclaimer);
  return lines.join("\n");
}

function systemPrompt() {
  return [
    "You are CampusAI, a university assistant for students.",
    "The university in the sample data is fictional Horizon University (demo). Never claim it is a real institution.",
    "Answer ONLY using the JSON context provided. If a fact is missing, say you do not have that information.",
    "Never invent schedules, rooms, hours, deadlines, or announcements.",
    "Do not reveal other students' personal data. Only the current student's records are in context.",
    "Cite sources: course codes, rooms, dates, and announcement titles when relevant.",
    "Be concise and practical. Match the student's language (English, Russian, or Uzbek).",
  ].join(" ");
}

async function chat({ user, message, language }) {
  const ctx = studentContext(user);
  const intent = detectIntent(message);
  const records = pickRecords(intent, ctx, message);
  const locale = language || user.language || "en";
  let mode = "fallback";
  let answer = fallbackAnswer(intent, records, ctx, locale);
  let llmError = null;

  if (isConfigured()) {
    try {
      const llm = await completeChat({
        system: systemPrompt(),
        language: locale,
        user: `Student question:\n${message}\n\nUniversity records (JSON):\n${JSON.stringify({
          meta: ctx.university,
          student: ctx.user,
          group: ctx.group,
          now: ctx.now,
          intent,
          records,
        })}`,
      });
      if (llm) {
        answer = llm;
        mode = "llm";
      }
    } catch (err) {
      llmError = err.message;
      answer = `${answer}\n\n(LLM unavailable: ${err.message}. Showing the database answer instead.)`;
    }
  }

  const db = getDb();
  const saved = db.insert("chatMessages", {
    id: `chat_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    userId: user.id,
    role: "assistant",
    question: message,
    answer,
    intent,
    mode,
    language: locale,
    createdAt: new Date().toISOString(),
  });
  db.insert("statsEvents", {
    id: `stat_${Date.now()}`,
    type: "ai_query",
    userId: user.id,
    createdAt: new Date().toISOString(),
    demo: Boolean(user.demo),
  });

  return {
    id: saved.id,
    answer,
    intent,
    mode,
    sources: records,
    llmError,
    createdAt: saved.createdAt,
  };
}

function history(userId, limit = 40) {
  const db = getDb();
  return db
    .all("chatMessages")
    .filter((m) => m.userId === userId)
    .sort((a, b) => String(a.createdAt).localeCompare(b.createdAt))
    .slice(-limit);
}

function clearHistory(userId) {
  const db = getDb();
  db.removeWhere("chatMessages", (m) => m.userId === userId);
}

module.exports = { chat, history, clearHistory, detectIntent, studentContext };
