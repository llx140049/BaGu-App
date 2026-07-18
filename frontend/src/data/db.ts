import { Platform } from "react-native";
import { SAMPLE_DOCUMENTS } from "./sample-docs";
import { genId } from "./utils";

let db: any = null;

export async function getDb(): Promise<any> {
  if (db) return db;

  if (Platform.OS === "web") {
    const { getDb: webGetDb } = await import("./db.web");
    db = await webGetDb();
    return db;
  }

  const SQLite = await import("expo-sqlite");
  db = await SQLite.openDatabaseAsync("bagu-memory.db");

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'local',
      cat TEXT NOT NULL,
      q TEXT NOT NULL,
      a TEXT NOT NULL,
      source TEXT DEFAULT '',
      has_original_file INTEGER DEFAULT 0,
      source_document_id TEXT DEFAULT NULL,
      tags TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS card_progress (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'local',
      question_id TEXT NOT NULL,
      level INTEGER DEFAULT 0,
      correct INTEGER DEFAULT 0,
      incorrect INTEGER DEFAULT 0,
      last_review TEXT,
      next_review TEXT,
      is_starred INTEGER DEFAULT 0,
      UNIQUE(user_id, question_id)
    );
    CREATE TABLE IF NOT EXISTS study_records (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'local',
      date TEXT NOT NULL,
      count INTEGER DEFAULT 0,
      correct INTEGER DEFAULT 0,
      incorrect INTEGER DEFAULT 0,
      new_count INTEGER DEFAULT 0,
      UNIQUE(user_id, date)
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      cat TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      scroll_offset REAL DEFAULT 0,
      reading_progress REAL DEFAULT 0,
      last_read_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  const questionColumns: { name: string }[] = await db.getAllAsync("PRAGMA table_info(questions)");
  if (!questionColumns.some((column) => column.name === "source_document_id")) {
    await db.execAsync("ALTER TABLE questions ADD COLUMN source_document_id TEXT DEFAULT NULL");
  }
  if (!questionColumns.some((column) => column.name === "tags")) {
    await db.execAsync("ALTER TABLE questions ADD COLUMN tags TEXT DEFAULT '[]'");
  }

  const studyRecordColumns: { name: string }[] = await db.getAllAsync("PRAGMA table_info(study_records)");
  if (!studyRecordColumns.some((column) => column.name === "new_count")) {
    await db.execAsync("ALTER TABLE study_records ADD COLUMN new_count INTEGER DEFAULT 0");
  }

  const documentColumns: { name: string }[] = await db.getAllAsync("PRAGMA table_info(documents)");
  if (!documentColumns.some((column) => column.name === "scroll_offset")) {
    await db.execAsync("ALTER TABLE documents ADD COLUMN scroll_offset REAL DEFAULT 0");
  }
  if (!documentColumns.some((column) => column.name === "reading_progress")) {
    await db.execAsync("ALTER TABLE documents ADD COLUMN reading_progress REAL DEFAULT 0");
  }
  if (!documentColumns.some((column) => column.name === "last_read_at")) {
    await db.execAsync("ALTER TABLE documents ADD COLUMN last_read_at TEXT");
  }
  if (!documentColumns.some((column) => column.name === "has_original_file")) {
    await db.execAsync("ALTER TABLE documents ADD COLUMN has_original_file INTEGER DEFAULT 0");
  }

  return db;
}

/** Removes data that belongs to the signed-in account before another account uses this device. */
export async function clearAccountData() {
  const database = await getDb();
  await database.runAsync("DELETE FROM card_progress");
  await database.runAsync("DELETE FROM study_records");
  await database.runAsync("DELETE FROM questions");
  await database.runAsync("DELETE FROM documents");
  await database.runAsync("DELETE FROM app_settings");
}

export async function insertSampleData() {
  // New installations start with an empty library. Existing local data is
  // intentionally left untouched so user-created questions are never removed.
  return;

  const database = await getDb();

  const row: any = await database.getFirstAsync("SELECT COUNT(*) as cnt FROM questions");
  const qCount = row?.cnt ?? 0;
  if (qCount === 0) {
    const samples = [
      { cat: "JavaScript", q: "什么是闭包（Closure）？", a: "闭包是指函数能够记住并访问其词法作用域中的变量，即使该函数在其词法作用域之外执行。" },
      { cat: "JavaScript", q: "解释一下事件循环（Event Loop）", a: "JavaScript 是单线程的，事件循环负责执行代码、收集和处理事件。宏任务 → 微任务 → 渲染。" },
      { cat: "React", q: "useEffect 的依赖数组有什么作用？", a: "告诉 React 只在特定值发生变化时才重新运行 effect。空数组 [] 表示仅在挂载和卸载时运行。" },
      { cat: "React", q: "什么是 Virtual DOM？", a: "Virtual DOM 是真实 DOM 的轻量级 JavaScript 对象表示。React 通过 diff 算法比较新旧 Virtual DOM，最小化实际 DOM 操作。" },
      { cat: "CSS", q: "Flexbox 和 Grid 有什么区别？", a: "Flexbox 是一维布局（行或列），Grid 是二维布局（行和列同时控制）。" },
      { cat: "网络", q: "HTTP 和 HTTPS 有什么区别？", a: "HTTPS = HTTP + SSL/TLS 加密。HTTPS 通过证书验证身份，数据加密传输。" },
    ];
    for (const s of samples) {
      const id = genId();
      await database.runAsync("INSERT INTO questions (id, user_id, cat, q, a) VALUES (?, 'local', ?, ?, ?)", [id, s.cat, s.q, s.a]);
      await database.runAsync("INSERT INTO card_progress (id, user_id, question_id, level) VALUES (?, 'local', ?, 0)", [genId(), id]);
    }
  }

  const docRow: any = await database.getFirstAsync("SELECT COUNT(*) as cnt FROM documents");
  const dCount = docRow?.cnt ?? 0;
  if (dCount === 0) {
    for (const doc of SAMPLE_DOCUMENTS) {
      await database.runAsync(
        "INSERT INTO documents (id, title, cat, content, source) VALUES (?, ?, ?, ?, ?)",
        [genId(), doc.title, doc.cat, doc.content, doc.source]
      );
    }
  }
}
