"use strict";

require("dotenv").config();

const bcrypt = require("bcryptjs");
const path = require("path");
const { getDb, resetInstance } = require("./store");
const { todayISO, startOfWeekISO, addDaysISO } = require("../utils/dates");

const DEMO = true;

function id(prefix, n) {
  return `${prefix}_${String(n).padStart(3, "0")}`;
}

function buildDemoRecords(passwordHashes) {
  const today = todayISO();
  const monday = startOfWeekISO(today);

  const groups = [
    { id: "grp_cs21", name: "Computer Science 21", code: "CS-21", demo: DEMO },
    { id: "grp_cs22", name: "Computer Science 22", code: "CS-22", demo: DEMO },
    { id: "grp_ma11", name: "Mathematics 11", code: "MATH-11", demo: DEMO },
  ];

  const courses = [
    { id: "crs_cs101", code: "CS101", name: "Introduction to Programming", lecturer: "Dr. Amina Karimova", demo: DEMO },
    { id: "crs_cs201", code: "CS201", name: "Data Structures", lecturer: "Prof. James Okonkwo", demo: DEMO },
    { id: "crs_cs310", code: "CS310", name: "Database Systems", lecturer: "Dr. Elena Petrova", demo: DEMO },
    { id: "crs_cs340", code: "CS340", name: "Artificial Intelligence", lecturer: "Dr. Farid Yusupov", demo: DEMO },
    { id: "crs_math110", code: "MATH110", name: "Linear Algebra", lecturer: "Prof. Nodira Rakhimova", demo: DEMO },
    { id: "crs_phys150", code: "PHYS150", name: "Physics I", lecturer: "Dr. Samuel Wright", demo: DEMO },
    { id: "crs_eng120", code: "ENG120", name: "Academic English", lecturer: "Ms. Sarah Bennett", demo: DEMO },
    { id: "crs_hist101", code: "HIST101", name: "World History", lecturer: "Dr. Timur Aliyev", demo: DEMO },
    { id: "crs_stat200", code: "STAT200", name: "Probability and Statistics", lecturer: "Dr. Leyla Nazarova", demo: DEMO },
  ];

  const courseByCode = Object.fromEntries(courses.map((c) => [c.code, c]));
  const groupByCode = Object.fromEntries(groups.map((g) => [g.code, g]));

  const scheduleTemplates = [
    { course: "CS101", group: "CS-21", weekday: 1, start: "09:00", end: "10:20", room: "A-201", building: "Engineering Hall", notes: "Bring a laptop." },
    { course: "MATH110", group: "CS-21", weekday: 1, start: "10:40", end: "12:00", room: "B-105", building: "Science Block", notes: "" },
    { course: "ENG120", group: "CS-21", weekday: 1, start: "13:30", end: "14:50", room: "C-12", building: "Humanities Center", notes: "" },
    { course: "CS201", group: "CS-21", weekday: 2, start: "09:00", end: "10:20", room: "A-204", building: "Engineering Hall", notes: "Lab session." },
    { course: "PHYS150", group: "CS-21", weekday: 2, start: "10:40", end: "12:00", room: "P-Lab1", building: "Science Block", notes: "Safety goggles required." },
    { course: "CS310", group: "CS-21", weekday: 3, start: "09:00", end: "10:20", room: "A-310", building: "Engineering Hall", notes: "" },
    { course: "CS340", group: "CS-21", weekday: 3, start: "13:30", end: "14:50", room: "A-401", building: "Engineering Hall", notes: "" },
    { course: "STAT200", group: "CS-21", weekday: 4, start: "09:00", end: "10:20", room: "B-220", building: "Science Block", notes: "" },
    { course: "HIST101", group: "CS-21", weekday: 4, start: "15:10", end: "16:30", room: "C-01", building: "Humanities Center", notes: "" },
    { course: "CS101", group: "CS-21", weekday: 5, start: "09:00", end: "10:20", room: "A-201", building: "Engineering Hall", notes: "Weekly recitation." },
    { course: "CS201", group: "CS-22", weekday: 1, start: "13:30", end: "14:50", room: "A-204", building: "Engineering Hall", notes: "" },
    { course: "CS310", group: "CS-22", weekday: 2, start: "13:30", end: "14:50", room: "A-310", building: "Engineering Hall", notes: "" },
    { course: "MATH110", group: "MATH-11", weekday: 1, start: "09:00", end: "10:20", room: "B-101", building: "Science Block", notes: "" },
    { course: "STAT200", group: "MATH-11", weekday: 3, start: "10:40", end: "12:00", room: "B-220", building: "Science Block", notes: "" },
    { course: "PHYS150", group: "MATH-11", weekday: 5, start: "10:40", end: "12:00", room: "P-Lab2", building: "Science Block", notes: "" },
    { course: "ENG120", group: "CS-22", weekday: 4, start: "10:40", end: "12:00", room: "C-14", building: "Humanities Center", notes: "" },
    { course: "CS340", group: "CS-22", weekday: 5, start: "13:30", end: "14:50", room: "A-401", building: "Engineering Hall", notes: "" },
  ];

  const schedules = scheduleTemplates.map((t, i) => {
    const course = courseByCode[t.course];
    const group = groupByCode[t.group];
    return {
      id: id("sch", i + 1),
      courseId: course.id,
      courseCode: course.code,
      courseName: course.name,
      lecturer: course.lecturer,
      groupId: group.id,
      groupCode: group.code,
      classroom: t.room,
      building: t.building,
      startTime: t.start,
      endTime: t.end,
      weekday: t.weekday,
      date: null,
      recurring: true,
      notes: t.notes,
      demo: DEMO,
    };
  });

  const datedExtras = [
    { course: "CS310", group: "CS-21", dayOffset: 0, start: "16:40", end: "18:00", room: "A-Lab3", building: "Engineering Hall", notes: "Extra SQL workshop (demo)." },
    { course: "CS340", group: "CS-21", dayOffset: 1, start: "16:40", end: "18:00", room: "A-401", building: "Engineering Hall", notes: "Guest seminar on campus AI (demo)." },
    { course: "HIST101", group: "CS-22", dayOffset: 2, start: "09:00", end: "10:20", room: "C-01", building: "Humanities Center", notes: "Make-up lecture (demo)." },
    { course: "PHYS150", group: "CS-21", dayOffset: 3, start: "15:10", end: "16:30", room: "P-Lab1", building: "Science Block", notes: "Lab catch-up (demo)." },
  ];

  datedExtras.forEach((t, i) => {
    const course = courseByCode[t.course];
    const group = groupByCode[t.group];
    schedules.push({
      id: id("sch", schedules.length + 1),
      courseId: course.id,
      courseCode: course.code,
      courseName: course.name,
      lecturer: course.lecturer,
      groupId: group.id,
      groupCode: group.code,
      classroom: t.room,
      building: t.building,
      startTime: t.start,
      endTime: t.end,
      weekday: null,
      date: addDaysISO(monday, t.dayOffset),
      recurring: false,
      notes: t.notes,
      demo: DEMO,
    });
  });

  const assignments = [
    { title: "Python lab 3: functions", course: "CS101", group: "CS-21", days: 2, desc: "Implement the listed functions and push to the course Git repo." },
    { title: "Binary trees worksheet", course: "CS201", group: "CS-21", days: 4, desc: "Complete traversal exercises 1–8." },
    { title: "ER diagram for library system", course: "CS310", group: "CS-21", days: 6, desc: "Submit a PDF ER diagram for the campus library case study." },
    { title: "Search heuristic write-up", course: "CS340", group: "CS-21", days: 8, desc: "Compare BFS, DFS, and A* on the provided grid." },
    { title: "Matrix operations set", course: "MATH110", group: "CS-21", days: 3, desc: "Problems 4.1–4.12 from the demo workbook." },
    { title: "Kinematics problem set", course: "PHYS150", group: "CS-21", days: 5, desc: "Show full working; late work is not accepted after the deadline." },
    { title: "Essay: campus and city", course: "ENG120", group: "CS-21", days: 10, desc: "400–500 words. Academic register." },
    { title: "Reading response: Silk Road", course: "HIST101", group: "CS-21", days: 7, desc: "One page, cite two sources from the reading list." },
    { title: "Probability quiz prep", course: "STAT200", group: "CS-21", days: 1, desc: "Practice set covering Bayes' theorem." },
    { title: "SQL join homework", course: "CS310", group: "CS-22", days: 5, desc: "Write queries for the demo university schema." },
    { title: "Linked list implementation", course: "CS201", group: "CS-22", days: 4, desc: "Implement insert, delete, and reverse." },
    { title: "Overdue: lab safety quiz", course: "PHYS150", group: "CS-21", days: -2, desc: "Complete the safety quiz in the lab portal (demo overdue item)." },
  ];

  const assignmentDocs = assignments.map((a, i) => {
    const course = courseByCode[a.course];
    const group = groupByCode[a.group];
    const published = addDaysISO(today, -7);
    const deadline = `${addDaysISO(today, a.days)}T23:59`;
    return {
      id: id("hw", i + 1),
      title: a.title,
      description: a.desc,
      courseId: course.id,
      courseCode: course.code,
      courseName: course.name,
      groupId: group.id,
      groupCode: group.code,
      publishedAt: `${published}T09:00`,
      deadline,
      attachmentUrl: "",
      status: "published",
      demo: DEMO,
    };
  });

  const locations = [
    {
      id: "loc_001",
      name: "Central Library",
      category: "library",
      building: "Knowledge Center",
      floor: "1–3",
      room: "",
      openTime: "08:00",
      closeTime: "22:00",
      description: "Main campus library with study rooms, computers, and course reserves. Demo record for Horizon University.",
      directions: "From the main gate walk straight across the quad. The Knowledge Center is the glass building on the right.",
      mapUrl: "",
      demo: DEMO,
    },
    {
      id: "loc_002",
      name: "Night Study Hall",
      category: "library",
      building: "Knowledge Center",
      floor: "1",
      room: "G-10",
      openTime: "08:00",
      closeTime: "00:00",
      description: "Quiet 24-adjacent study hall during exam weeks (closes at midnight in this demo).",
      directions: "Enter the Central Library lobby and turn left past the security desk.",
      mapUrl: "",
      demo: DEMO,
    },
    {
      id: "loc_003",
      name: "Main Cafeteria",
      category: "cafeteria",
      building: "Student Union",
      floor: "1",
      room: "",
      openTime: "08:00",
      closeTime: "20:00",
      description: "Hot meals, vegetarian line, and grab-and-go. Demo dining hall.",
      directions: "Student Union is south of the quad. Cafeteria occupies the entire first floor.",
      mapUrl: "",
      demo: DEMO,
    },
    {
      id: "loc_004",
      name: "Cafe Horizon",
      category: "cafeteria",
      building: "Engineering Hall",
      floor: "1",
      room: "A-010",
      openTime: "07:30",
      closeTime: "18:00",
      description: "Coffee, snacks, and light meals near lecture halls.",
      directions: "Ground floor of Engineering Hall, opposite the main staircase.",
      mapUrl: "",
      demo: DEMO,
    },
    {
      id: "loc_005",
      name: "Computer Lab A",
      category: "computer_lab",
      building: "Engineering Hall",
      floor: "2",
      room: "A-Lab3",
      openTime: "08:00",
      closeTime: "21:00",
      description: "General-purpose lab with ID login. Printers available.",
      directions: "Engineering Hall, second floor, follow signs for Labs. A-Lab3 is at the east corridor.",
      mapUrl: "",
      demo: DEMO,
    },
    {
      id: "loc_006",
      name: "Computer Lab B",
      category: "computer_lab",
      building: "Knowledge Center",
      floor: "2",
      room: "L-210",
      openTime: "09:00",
      closeTime: "21:00",
      description: "Library-adjacent lab used for CS workshops.",
      directions: "Take the Knowledge Center elevator to floor 2; Lab B is next to group study rooms.",
      mapUrl: "",
      demo: DEMO,
    },
    {
      id: "loc_007",
      name: "Lecture Hall A-201",
      category: "lecture_hall",
      building: "Engineering Hall",
      floor: "2",
      room: "A-201",
      openTime: "08:00",
      closeTime: "20:00",
      description: "120-seat lecture theatre used by CS101.",
      directions: "Engineering Hall stairs to floor 2, first door on the right.",
      mapUrl: "",
      demo: DEMO,
    },
    {
      id: "loc_008",
      name: "Lecture Hall B-105",
      category: "lecture_hall",
      building: "Science Block",
      floor: "1",
      room: "B-105",
      openTime: "08:00",
      closeTime: "19:00",
      description: "Mathematics lecture hall.",
      directions: "Science Block main entrance, turn right; B-105 is the large room with blue doors.",
      mapUrl: "",
      demo: DEMO,
    },
    {
      id: "loc_009",
      name: "Registrar / Administration",
      category: "administration",
      building: "Admin Building",
      floor: "1",
      room: "AD-101",
      openTime: "09:00",
      closeTime: "17:00",
      description: "Student records, enrollment, and official letters. Closed weekends in this demo.",
      directions: "Admin Building faces the main gate. Room AD-101 is the first counter on the left.",
      mapUrl: "",
      demo: DEMO,
    },
    {
      id: "loc_010",
      name: "Student Services Desk",
      category: "student_services",
      building: "Student Union",
      floor: "2",
      room: "SU-201",
      openTime: "09:00",
      closeTime: "18:00",
      description: "ID cards, scholarships, and counseling referrals.",
      directions: "Student Union elevator to floor 2. Look for the orange Student Services sign.",
      mapUrl: "",
      demo: DEMO,
    },
    {
      id: "loc_011",
      name: "Sports Complex",
      category: "other",
      building: "Sports Complex",
      floor: "1",
      room: "",
      openTime: "07:00",
      closeTime: "22:00",
      description: "Gym, indoor court, and lockers. Student ID required.",
      directions: "North of campus, past Science Block. Follow the running-track path.",
      mapUrl: "",
      demo: DEMO,
    },
    {
      id: "loc_012",
      name: "Health Clinic",
      category: "student_services",
      building: "Admin Building",
      floor: "1",
      room: "AD-120",
      openTime: "09:00",
      closeTime: "16:00",
      description: "First aid and appointment clinic (demo hours).",
      directions: "Admin Building corridor past Registrar, last door on the right.",
      mapUrl: "",
      demo: DEMO,
    },
  ];

  const announcements = [
    {
      id: "ann_001",
      title: "Library extended hours this week (demo)",
      description: "Central Library stays open until 22:00 Monday–Friday this week. Night Study Hall remains until midnight.",
      category: "academic",
      publishedAt: `${addDaysISO(today, -1)}T08:00`,
      eventDate: null,
      groupId: null,
      location: "Central Library",
      link: "",
      demo: DEMO,
    },
    {
      id: "ann_002",
      title: "Campus Wi-Fi maintenance (demo)",
      description: "Engineering Hall Wi-Fi will restart between 06:00 and 07:00 on Wednesday. Classes are not affected.",
      category: "operations",
      publishedAt: `${addDaysISO(today, -3)}T10:00`,
      eventDate: addDaysISO(monday, 2),
      groupId: null,
      location: "Engineering Hall",
      link: "",
      demo: DEMO,
    },
    {
      id: "ann_003",
      title: "CS-21 advisor office hours",
      description: "Group CS-21 advisors meet students in SU-201 on Thursday 14:00–16:00.",
      category: "student_services",
      publishedAt: `${addDaysISO(today, -2)}T09:30`,
      eventDate: addDaysISO(monday, 3),
      groupId: "grp_cs21",
      location: "Student Services Desk",
      link: "",
      demo: DEMO,
    },
  ];

  const events = [
    {
      id: "evt_001",
      title: "Welcome fair: student clubs (demo)",
      description: "Club booths on the main quad. Open to all groups.",
      category: "campus_life",
      publishedAt: `${addDaysISO(today, -5)}T09:00`,
      eventDate: today,
      startTime: "12:00",
      endTime: "16:00",
      groupId: null,
      location: "Main quad",
      link: "",
      demo: DEMO,
    },
    {
      id: "evt_002",
      title: "AI in Education seminar",
      description: "Guest seminar in A-401. Related to CS340. Fictional Horizon University event.",
      category: "academic",
      publishedAt: `${addDaysISO(today, -4)}T11:00`,
      eventDate: addDaysISO(monday, 1),
      startTime: "16:40",
      endTime: "18:00",
      groupId: "grp_cs21",
      location: "Lecture Hall A-401",
      link: "",
      demo: DEMO,
    },
    {
      id: "evt_003",
      title: "Career workshop: internships",
      description: "CV clinic hosted by Student Services.",
      category: "career",
      publishedAt: `${addDaysISO(today, -2)}T12:00`,
      eventDate: addDaysISO(today, 3),
      startTime: "14:00",
      endTime: "16:00",
      groupId: null,
      location: "Student Union SU-201",
      link: "",
      demo: DEMO,
    },
    {
      id: "evt_004",
      title: "Intramural football signup",
      description: "Register teams at the Sports Complex front desk.",
      category: "sports",
      publishedAt: `${addDaysISO(today, -6)}T09:00`,
      eventDate: addDaysISO(today, 5),
      startTime: "17:00",
      endTime: "19:00",
      groupId: null,
      location: "Sports Complex",
      link: "",
      demo: DEMO,
    },
  ];

  const users = [
    {
      id: "usr_admin_demo",
      email: (process.env.DEMO_ADMIN_EMAIL || "admin@campusai.local").toLowerCase(),
      passwordHash: passwordHashes.admin,
      name: "Campus Admin (demo)",
      role: "admin",
      groupId: null,
      language: "en",
      createdAt: new Date().toISOString(),
      demo: DEMO,
    },
    {
      id: "usr_student_demo",
      email: (process.env.DEMO_STUDENT_EMAIL || "student@campusai.local").toLowerCase(),
      name: "Malika Tursunova",
      role: "student",
      groupId: "grp_cs21",
      language: "en",
      passwordHash: passwordHashes.student,
      createdAt: new Date().toISOString(),
      demo: DEMO,
    },
    {
      id: "usr_student_cs22",
      email: "jamshid@campusai.local",
      name: "Jamshid Rahimov",
      role: "student",
      groupId: "grp_cs22",
      language: "ru",
      passwordHash: passwordHashes.student,
      createdAt: new Date().toISOString(),
      demo: DEMO,
    },
  ];

  return {
    groups,
    courses,
    schedules,
    assignments: assignmentDocs,
    locations,
    announcements,
    events,
    users,
  };
}

async function hashPasswords() {
  const adminPass = process.env.DEMO_ADMIN_PASSWORD || "CampusAI-Demo-2026";
  const studentPass = process.env.DEMO_STUDENT_PASSWORD || "Student-Demo-2026";
  return {
    admin: await bcrypt.hash(adminPass, 10),
    student: await bcrypt.hash(studentPass, 10),
  };
}

async function seedDatabase(options = {}) {
  const db = options.db || getDb(options.filePath);
  const resetDemo = options.resetDemo !== false;
  const hashes = await hashPasswords();
  const demo = buildDemoRecords(hashes);

  if (resetDemo) {
    const demoUserIds = new Set(db.find("users", (u) => u.demo).map((u) => u.id));
    const demoAssignmentIds = new Set(db.find("assignments", (a) => a.demo).map((a) => a.id));
    db.removeWhere(
      "assignmentCompletions",
      (row) => demoUserIds.has(row.userId) || demoAssignmentIds.has(row.assignmentId)
    );
    db.removeWhere("chatMessages", (row) => demoUserIds.has(row.userId) || row.demo === true);
    db.removeWhere("statsEvents", (row) => demoUserIds.has(row.userId) || row.demo === true);
    for (const name of [
      "users",
      "groups",
      "courses",
      "schedules",
      "assignments",
      "locations",
      "announcements",
      "events",
    ]) {
      db.removeWhere(name, (row) => row.demo === true);
    }
  }

  const existingEmails = new Set(db.all("users").map((u) => u.email));
  db.insertMany(
    "users",
    demo.users.filter((u) => !existingEmails.has(u.email))
  );

  const skipIfId = (name, rows) => {
    const ids = new Set(db.all(name).map((r) => r.id));
    db.insertMany(
      name,
      rows.filter((r) => !ids.has(r.id))
    );
  };

  skipIfId("groups", demo.groups);
  skipIfId("courses", demo.courses);
  skipIfId("schedules", demo.schedules);
  skipIfId("assignments", demo.assignments);
  skipIfId("locations", demo.locations);
  skipIfId("announcements", demo.announcements);
  skipIfId("events", demo.events);

  db.setMeta({
    universityName: "Horizon University (demo)",
    seededAt: new Date().toISOString(),
    disclaimer: "All sample records are fictional demo data for CampusAI, not a real university.",
  });

  return db;
}

async function ensureSeeded(db) {
  if (db.all("courses").length === 0 || db.all("users").length === 0) {
    await seedDatabase({ db, resetDemo: false });
  }
}

if (require.main === module) {
  (async () => {
    const filePath = process.env.DATA_FILE || path.join(__dirname, "..", "..", "data", "store.json");
    resetInstance();
    const db = getDb(filePath);
    await seedDatabase({ db, resetDemo: true });
    console.log(`Demo data written to ${filePath}`);
    console.log("Fictional university: Horizon University (demo)");
    console.log(`Admin: ${process.env.DEMO_ADMIN_EMAIL || "admin@campusai.local"}`);
    console.log(`Student: ${process.env.DEMO_STUDENT_EMAIL || "student@campusai.local"} (group CS-21)`);
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { seedDatabase, ensureSeeded, buildDemoRecords };
