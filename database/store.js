"use strict";

const fs = require("fs");
const path = require("path");

const COLLECTIONS = [
  "users",
  "groups",
  "courses",
  "schedules",
  "assignments",
  "assignmentCompletions",
  "locations",
  "announcements",
  "events",
  "chatMessages",
  "statsEvents",
];

function emptyState() {
  const state = { version: 1, meta: { universityName: "Horizon University (demo)" } };
  for (const name of COLLECTIONS) state[name] = [];
  return state;
}

class JsonDatabase {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = emptyState();
    this.loaded = false;
  }

  load() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      this.state = emptyState();
      this.save();
    } else {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      this.state = { ...emptyState(), ...parsed };
      for (const name of COLLECTIONS) {
        if (!Array.isArray(this.state[name])) this.state[name] = [];
      }
    }
    this.loaded = true;
    return this.state;
  }

  save() {
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), "utf8");
    try {
      if (fs.existsSync(this.filePath)) fs.unlinkSync(this.filePath);
    } catch {
      /* ignore */
    }
    fs.renameSync(tmp, this.filePath);
  }

  all(name) {
    if (!this.loaded) this.load();
    return this.state[name] || [];
  }

  find(name, predicate) {
    return this.all(name).filter(predicate);
  }

  findOne(name, predicate) {
    return this.all(name).find(predicate) || null;
  }

  findById(name, id) {
    return this.findOne(name, (row) => row.id === id);
  }

  insert(name, doc) {
    if (!this.loaded) this.load();
    this.state[name].push(doc);
    this.save();
    return doc;
  }

  insertMany(name, docs) {
    if (!this.loaded) this.load();
    this.state[name].push(...docs);
    this.save();
    return docs;
  }

  update(name, id, patch) {
    if (!this.loaded) this.load();
    const idx = this.state[name].findIndex((row) => row.id === id);
    if (idx === -1) return null;
    this.state[name][idx] = { ...this.state[name][idx], ...patch, id, updatedAt: new Date().toISOString() };
    this.save();
    return this.state[name][idx];
  }

  remove(name, id) {
    if (!this.loaded) this.load();
    const before = this.state[name].length;
    this.state[name] = this.state[name].filter((row) => row.id !== id);
    if (this.state[name].length === before) return false;
    this.save();
    return true;
  }

  removeWhere(name, predicate) {
    if (!this.loaded) this.load();
    const kept = this.state[name].filter((row) => !predicate(row));
    const removed = this.state[name].length - kept.length;
    this.state[name] = kept;
    this.save();
    return removed;
  }

  replaceCollection(name, rows) {
    if (!this.loaded) this.load();
    this.state[name] = rows;
    this.save();
  }

  setMeta(patch) {
    if (!this.loaded) this.load();
    this.state.meta = { ...this.state.meta, ...patch };
    this.save();
  }
}

let instance = null;

function getDb(filePath) {
  const resolved = filePath || process.env.DATA_FILE || path.join(__dirname, "..", "..", "data", "store.json");
  if (!instance || instance.filePath !== resolved) {
    instance = new JsonDatabase(resolved);
    instance.load();
  }
  return instance;
}

function resetInstance() {
  instance = null;
}

module.exports = { JsonDatabase, getDb, resetInstance, COLLECTIONS, emptyState };
