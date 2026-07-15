import { genId } from "./utils";
import { MASTERED_LEVEL } from "./sm2";

type Row = Record<string, any>;

let instance: any = null;
const WEB_STORAGE_KEY = "bagu_memory_web_database_v1";

function createInMemoryDb() {
  const emptyTables: Record<string, Row[]> = {
    questions: [],
    card_progress: [],
    study_records: [],
    documents: [],
    app_settings: [],
  };
  let storedTables: Partial<Record<string, Row[]>> = {};
  try {
    storedTables = JSON.parse(globalThis.localStorage?.getItem(WEB_STORAGE_KEY) ?? "{}") ?? {};
  } catch {}
  const tables: Record<string, Row[]> = {
    ...emptyTables,
    ...Object.fromEntries(Object.keys(emptyTables).map((name) => [name, Array.isArray(storedTables[name]) ? storedTables[name] : []])),
  };
  const persist = () => {
    try { globalThis.localStorage?.setItem(WEB_STORAGE_KEY, JSON.stringify(tables)); } catch {}
  };

  const findQuestionById = (id: string) => tables.questions.find((row) => row.id === id);
  const findProgressByQuestionId = (questionId: string) =>
    tables.card_progress.find((row) => row.question_id === questionId);
  const findStudyRecordByDate = (date: string) => tables.study_records.find((row) => row.date === date);

  const upsertProgress = (row: Row) => {
    const existing = findProgressByQuestionId(row.question_id);
    if (existing) {
      Object.assign(existing, row);
      return;
    }
    tables.card_progress.push(row);
  };

  const upsertStudyRecord = (row: Row) => {
    const existing = findStudyRecordByDate(row.date);
    if (existing) {
      existing.count += row.count ?? 1;
      existing.correct += row.correct ?? 0;
      existing.incorrect += row.incorrect ?? 0;
      existing.new_count = (existing.new_count ?? 0) + (row.new_count ?? 0);
      return;
    }
    tables.study_records.push(row);
  };

  const joinQuestionsAndProgress = () =>
    tables.questions.map((question) => {
      const progress = findProgressByQuestionId(question.id) ?? {};
      return {
        id: question.id,
        cat: question.cat,
        q: question.q,
        a: question.a,
        source_document_id: question.source_document_id ?? null,
        tags: question.tags ?? "[]",
        level: progress.level ?? 0,
        correct: progress.correct ?? 0,
        incorrect: progress.incorrect ?? 0,
        lastReview: progress.last_review ?? null,
        nextReview: progress.next_review ?? null,
        isStarred: progress.is_starred ?? 0,
      };
    });

  const groupByCategory = () => {
    const grouped = new Map<string, { total: number; mastered: number }>();
    for (const question of tables.questions) {
      const progress = findProgressByQuestionId(question.id);
      const current = grouped.get(question.cat) ?? { total: 0, mastered: 0 };
      current.total += 1;
      if ((progress?.level ?? 0) >= MASTERED_LEVEL) current.mastered += 1;
      grouped.set(question.cat, current);
    }
    return Array.from(grouped.entries()).map(([cat, value]) => ({
      cat,
      total: value.total,
      mastered: value.mastered,
    }));
  };

  const groupByLevel = () => {
    const grouped = new Map<number, number>();
    for (const progress of tables.card_progress) {
      const level = progress.level ?? 0;
      grouped.set(level, (grouped.get(level) ?? 0) + 1);
    }
    return Array.from(grouped.entries()).map(([level, count]) => ({ level, count }));
  };

  return {
    tables,
    execAsync: async (_sql: string) => {},
    getAllAsync: async (sql: string, params?: any[]): Promise<any[]> => {
      if (sql.includes("LEFT JOIN card_progress cp ON q.id = cp.question_id")) {
        const rows = joinQuestionsAndProgress();
        if (sql.includes("WHERE q.source_document_id = ?")) {
          return rows.filter((row) => row.source_document_id === params?.[0]);
        }
        return rows;
      }
      if (sql.includes("FROM questions q") && sql.includes("GROUP BY q.cat")) {
        return groupByCategory();
      }
      if (sql.includes("FROM card_progress") && sql.includes("GROUP BY level")) {
        return groupByLevel();
      }
      if (sql.includes("FROM documents WHERE id = ?")) {
        const id = params?.[0];
        return tables.documents.filter((row) => row.id === id);
      }
      if (sql.includes("FROM questions WHERE source_document_id = ?")) {
        return tables.questions.filter((row) => row.source_document_id === params?.[0]);
      }
      if (sql.includes("FROM documents")) {
        return tables.documents.slice();
      }
      if (sql.includes("FROM app_settings")) {
        return tables.app_settings.slice();
      }
      if (sql.includes("SELECT id, title, cat, source FROM documents")) {
        return tables.documents.map((row) => ({
          id: row.id,
          title: row.title,
          cat: row.cat,
          source: row.source ?? "",
        }));
      }
      if (sql.includes("SELECT id, cat, q, a, source, source_document_id, tags, created_at FROM questions")) {
        return tables.questions.map((row) => ({
          id: row.id,
          cat: row.cat,
          q: row.q,
          a: row.a,
          source: row.source ?? "",
          source_document_id: row.source_document_id ?? null,
          tags: row.tags ?? "[]",
          created_at: row.created_at,
        }));
      }
      if (sql.includes("SELECT id, cat, q, a, source, tags, created_at FROM questions")) {
        return tables.questions.map((row) => ({
          id: row.id,
          cat: row.cat,
          q: row.q,
          a: row.a,
          source: row.source ?? "",
          source_document_id: row.source_document_id ?? null,
          tags: row.tags ?? "[]",
          created_at: row.created_at,
        }));
      }
      if (sql.includes("SELECT id, cat, q, source_document_id FROM questions")) {
        return tables.questions.map((row) => ({
          id: row.id,
          cat: row.cat,
          q: row.q,
          source_document_id: row.source_document_id ?? null,
        }));
      }
      if (sql.includes("SELECT id, cat, q, a, source_document_id FROM questions")) {
        return tables.questions.map((row) => ({
          id: row.id,
          cat: row.cat,
          q: row.q,
          a: row.a,
          source_document_id: row.source_document_id ?? null,
        }));
      }
      if (sql.includes("SELECT id, cat, q FROM questions")) {
        return tables.questions.map((row) => ({
          id: row.id,
          cat: row.cat,
          q: row.q,
        }));
      }
      if (sql.includes("FROM questions WHERE id = ?")) {
        const id = params?.[0];
        return tables.questions.filter((row) => row.id === id);
      }
      if (sql.includes("FROM card_progress WHERE question_id = ?")) {
        const questionId = params?.[0];
        return tables.card_progress.filter((row) => row.question_id === questionId);
      }
      if (sql.includes("FROM questions")) {
        return tables.questions.slice();
      }
      if (sql.includes("FROM study_records")) {
        return tables.study_records.slice();
      }
      if (sql.includes("FROM card_progress")) {
        return tables.card_progress.slice();
      }
      return [];
    },
    getFirstAsync: async (sql: string, params?: any[]): Promise<any> => {
      const upper = sql.toUpperCase();

      if (upper.includes("FROM QUESTIONS") && upper.includes("COUNT(")) {
        return { cnt: tables.questions.length };
      }
      if (upper.includes("FROM STUDY_RECORDS") && upper.includes("SUM(COUNT)")) {
        const date = params?.[0];
        const row = findStudyRecordByDate(date);
        return { cnt: row?.count ?? 0 };
      }
      if (upper.includes("FROM STUDY_RECORDS") && upper.includes("SUM(NEW_COUNT)")) {
        const date = params?.[0];
        const row = findStudyRecordByDate(date);
        return { cnt: row?.new_count ?? 0 };
      }
      if (upper.includes("FROM APP_SETTINGS") && upper.includes("WHERE KEY = ?")) {
        const row = tables.app_settings.find((setting) => setting.key === params?.[0]);
        return row ?? null;
      }
      if (upper.includes("FROM STUDY_RECORDS") && upper.includes("COUNT(")) {
        const date = params?.[0];
        if (date) {
          const row = findStudyRecordByDate(date);
          return { cnt: row?.count ?? 0 };
        }
        return { cnt: tables.study_records.length };
      }
      if (upper.includes("FROM CARD_PROGRESS") && upper.includes("SUM(CORRECT)")) {
        const correct = tables.card_progress.reduce((sum, row) => sum + (row.correct ?? 0), 0);
        const incorrect = tables.card_progress.reduce((sum, row) => sum + (row.incorrect ?? 0), 0);
        return { cor: correct, inc: incorrect };
      }
      if (upper.includes("FROM CARD_PROGRESS") && upper.includes("LEVEL >= ?")) {
        const threshold = Number(params?.[0] ?? 0);
        const count = tables.card_progress.filter((row) => (row.level ?? 0) >= threshold).length;
        return { cnt: count };
      }
      if (upper.includes("FROM CARD_PROGRESS") && upper.includes("NEXT_REVIEW IS NULL OR NEXT_REVIEW <= ?")) {
        const now = String(params?.[0] ?? "");
        const threshold = Number(params?.[1] ?? 0);
        const count = tables.card_progress.filter((row) => {
          const due = !row.next_review || String(row.next_review) <= now;
          return due && (row.level ?? 0) < threshold;
        }).length;
        return { cnt: count };
      }
      if (upper.includes("FROM CARD_PROGRESS") && upper.includes("IS_STARRED = 1")) {
        const count = tables.card_progress.filter((row) => row.is_starred === 1 || row.is_starred === true).length;
        return { cnt: count };
      }
      if (upper.includes("COUNT(")) {
        const all = await instance!.getAllAsync(sql, params);
        return { cnt: all.length };
      }

      const all = await instance!.getAllAsync(sql, params);
      return all[0] ?? null;
    },
    runAsync: async (sql: string, params?: any[]) => {
      const upper = sql.toUpperCase();

      if (upper.includes("INTO QUESTIONS") && params) {
        const literalUserId = sql.match(/VALUES\s*\(\?\s*,\s*'([^']+)'\s*,/i)?.[1];
        const usesLiteralUserId = Boolean(literalUserId);
        const valueOffset = usesLiteralUserId ? 1 : 2;
        tables.questions.push({
          id: params[0],
          user_id: literalUserId ?? params[1],
          cat: params[valueOffset],
          q: params[valueOffset + 1],
          a: params[valueOffset + 2],
          source: params[valueOffset + 3] ?? "",
          source_document_id: params[valueOffset + 4] ?? null,
          tags: params[valueOffset + 5] ?? "[]",
          created_at: params[valueOffset + 6] ?? new Date().toISOString(),
        });
      }

      if (upper.includes("INTO CARD_PROGRESS") && params) {
        const literalUserId = sql.match(/VALUES\s*\(\?\s*,\s*'([^']+)'\s*,/i)?.[1];
        const valueOffset = literalUserId ? 1 : 2;
        upsertProgress({
          id: params[0],
          user_id: literalUserId ?? params[1],
          question_id: params[valueOffset],
          level: params[valueOffset + 1] ?? 0,
          correct: params[valueOffset + 2] ?? 0,
          incorrect: params[valueOffset + 3] ?? 0,
          last_review: params[valueOffset + 4] ?? null,
          next_review: params[valueOffset + 5] ?? null,
          is_starred: params[valueOffset + 6] ?? 0,
        });
      }

      if (upper.includes("INSERT INTO STUDY_RECORDS") && params) {
        const isSyncedRecord = upper.includes("'CLOUD'");
        upsertStudyRecord(isSyncedRecord ? {
          id: params[0], user_id: "cloud", date: params[1], count: params[2] ?? 0,
          correct: params[3] ?? 0, incorrect: params[4] ?? 0, new_count: params[5] ?? 0,
        } : {
          id: params[0], user_id: "local", date: params[1], count: 1,
          correct: params[2] ?? 0, incorrect: params[3] ?? 0, new_count: params[4] ?? 0,
        });
      }

      if (upper.includes("INSERT INTO APP_SETTINGS") && params) {
        const existing = tables.app_settings.find((setting) => setting.key === params[0]);
        if (existing) existing.value = params[1];
        else tables.app_settings.push({ key: params[0], value: params[1] });
      }

      if (upper.includes("INTO DOCUMENTS") && params) {
        const existingIndex = tables.documents.findIndex((row) => row.id === params[0]);
        if (!(upper.includes("OR IGNORE") && existingIndex >= 0)) {
          const hasReadingFields = upper.includes("SCROLL_OFFSET");
          const document = {
          id: params[0],
          title: params[1],
          cat: params[2],
          content: params[3],
          source: params[4] ?? "",
          tags: hasReadingFields ? (params[5] ?? "[]") : "[]",
          scroll_offset: hasReadingFields ? (params[6] ?? 0) : 0,
          reading_progress: hasReadingFields ? (params[7] ?? 0) : 0,
          last_read_at: hasReadingFields ? (params[8] ?? null) : null,
          created_at: hasReadingFields ? (params[9] ?? new Date().toISOString()) : (params[5] ?? new Date().toISOString()),
          };
          if (existingIndex >= 0) tables.documents[existingIndex] = document;
          else tables.documents.push(document);
        }
      }

      if (upper.includes("UPDATE QUESTIONS SET Q = ?, A = ? WHERE ID = ?") && params) {
        const question = findQuestionById(params[2]);
        if (question) {
          question.q = params[0];
          question.a = params[1];
        }
      }

      if (upper.includes("UPDATE QUESTIONS SET CAT = ?, Q = ?, A = ? WHERE ID = ?") && params) {
        const question = findQuestionById(params[3]);
        if (question) {
          question.cat = params[0];
          question.q = params[1];
          question.a = params[2];
        }
      }

      if (upper.includes("UPDATE QUESTIONS SET SOURCE_DOCUMENT_ID = NULL WHERE SOURCE_DOCUMENT_ID = ?") && params) {
        for (const question of tables.questions) {
          if (question.source_document_id === params[0]) question.source_document_id = null;
        }
      }

      if (upper.includes("UPDATE DOCUMENTS SET TITLE = ? WHERE ID = ?") && params) {
        const document = tables.documents.find((row) => row.id === params[1]);
        if (document) document.title = params[0];
      }

      if (upper.includes("UPDATE DOCUMENTS SET SCROLL_OFFSET = ?") && params) {
        const document = tables.documents.find((row) => row.id === params[3]);
        if (document) {
          document.scroll_offset = params[0];
          document.reading_progress = params[1];
          document.last_read_at = params[2];
        }
      }

      if (upper.includes("UPDATE DOCUMENTS SET TITLE = ?, CAT = ?, CONTENT = ?") && params) {
        const document = tables.documents.find((row) => row.id === params[9]);
        if (document) {
          Object.assign(document, {
            title: params[0], cat: params[1], content: params[2], source: params[3], tags: params[4],
            scroll_offset: params[5], reading_progress: params[6], last_read_at: params[7], created_at: params[8],
          });
        }
      }

      if (upper.includes("DELETE FROM DOCUMENTS WHERE ID = ?") && params) {
        const index = tables.documents.findIndex((row) => row.id === params[0]);
        if (index >= 0) tables.documents.splice(index, 1);
      }

      if (upper.includes("DELETE FROM CARD_PROGRESS WHERE QUESTION_ID = ?") && params) {
        const index = tables.card_progress.findIndex((row) => row.question_id === params[0]);
        if (index >= 0) tables.card_progress.splice(index, 1);
      }

      if (upper.includes("DELETE FROM QUESTIONS WHERE ID = ?") && params) {
        const index = tables.questions.findIndex((row) => row.id === params[0]);
        if (index >= 0) tables.questions.splice(index, 1);
      }

      if (upper.includes("UPDATE CARD_PROGRESS SET") && params) {
        const progress = tables.card_progress.find((row) => row.id === params[6]);
        if (progress) {
          progress.level = params[0];
          progress.correct = params[1];
          progress.incorrect = params[2];
          progress.last_review = params[3];
          progress.next_review = params[4];
          progress.is_starred = params[5];
        }
      }

      if (upper.includes("UPDATE STUDY_RECORDS SET COUNT = COUNT + 1") && params) {
        const record = findStudyRecordByDate(params[2]);
        if (record) {
          record.count += 1;
          record.correct += params[0] ?? 0;
          record.incorrect += params[1] ?? 0;
          record.new_count += params[2] ?? 0;
        }
      }

      if (upper.includes("UPDATE STUDY_RECORDS SET COUNT = ?") && params) {
        const record = findStudyRecordByDate(params[4]);
        if (record) {
          record.count = params[0];
          record.correct = params[1];
          record.incorrect = params[2];
          record.new_count = params[3];
        }
      }

      persist();
    },
  };
}

export async function getDb(): Promise<any> {
  if (instance) return instance;
  instance = createInMemoryDb();
  return instance;
}

export async function insertSampleData() {
  // handled by getDb + db.ts
}
