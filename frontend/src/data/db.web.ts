import { SAMPLE_DOCUMENTS } from "./sample-docs";
import { genId } from "./utils";

let instance: any = null;

function createInMemoryDb() {
  const tables: Record<string, any[]> = {
    questions: [],
    card_progress: [],
    study_records: [],
    documents: [],
  };

  return {
    tables,
    execAsync: async (_sql: string) => {},
    getAllAsync: async (sql: string, _params?: any[]): Promise<any[]> => {
      if (sql.includes("FROM documents")) return tables.documents;
      if (sql.includes("FROM questions")) return tables.questions;
      if (sql.includes("FROM card_progress")) return tables.card_progress;
      return [];
    },
    getFirstAsync: async (sql: string, _params?: any[]): Promise<any> => {
      // Handle COUNT queries
      if (sql.toUpperCase().includes("COUNT(")) {
        const all = await instance!.getAllAsync(sql);
        return { cnt: all.length };
      }
      const all = await instance!.getAllAsync(sql);
      return all[0] ?? null;
    },
    runAsync: async (sql: string, params?: any[]) => {
      const upper = sql.toUpperCase();
      if (upper.includes("INSERT INTO QUESTIONS") && params) {
        tables.questions.push({
          id: params[0], user_id: params[1], cat: params[2],
          q: params[3], a: params[4], tags: "[]",
          created_at: new Date().toISOString(),
        });
      }
      if (upper.includes("INSERT INTO CARD_PROGRESS") && params) {
        tables.card_progress.push({
          id: params[0], user_id: params[1], question_id: params[2],
          level: params[3] ?? 0, correct: 0, incorrect: 0,
          last_review: null, next_review: null, is_starred: 0,
        });
      }
      if (upper.includes("INSERT INTO DOCUMENTS") && params) {
        tables.documents.push({
          id: params[0], title: params[1], cat: params[2],
          content: params[3], source: params[4] ?? "", tags: "[]",
          created_at: new Date().toISOString(),
        });
      }
    },
  };
}

export async function getDb(): Promise<any> {
  if (instance) return instance;
  instance = createInMemoryDb();
  for (const doc of SAMPLE_DOCUMENTS) {
    await instance.runAsync(
      "INSERT INTO documents (id, title, cat, content, source) VALUES (?, ?, ?, ?, ?)",
      [genId(), doc.title, doc.cat, doc.content, doc.source]
    );
  }
  return instance;
}

export async function insertSampleData() {
  // handled by getDb + db.ts
}
