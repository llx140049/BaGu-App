import { getDb } from "./db";
import { parseQuestionTags, topLevelTag } from "./tagging";
import { isCardDue, MASTERED_LEVEL } from "./sm2";

export interface StudyPlanItem { id: string; tag: string; dailyTarget: number; enabled: boolean; mode: "smart"; range: "all"; }
export interface StudyPlan { dailyTarget: number; items: StudyPlanItem[]; }
export interface TodayStudySummary { completed: number; target: number; items: StudyPlanItem[]; state: "no-plan" | "empty" | "active" | "complete"; }

const PLAN_KEY = "study_plan";
const today = () => new Date().toISOString().slice(0, 10);

export async function getStudyPlan(): Promise<StudyPlan> {
  const database = await getDb();
  const [row, targetRow] = await Promise.all([
    database.getFirstAsync("SELECT value FROM app_settings WHERE key = ?", [PLAN_KEY]),
    database.getFirstAsync("SELECT value FROM app_settings WHERE key = ?", ["daily_new_target"]),
  ]);
  const configuredTarget = Number(targetRow?.value);
  try {
    const parsed = JSON.parse(row?.value ?? "");
    if (Array.isArray(parsed?.items)) {
      const plan = { dailyTarget: Number.isFinite(configuredTarget) && configuredTarget > 0 ? configuredTarget : (Number(parsed.dailyTarget) || 0), items: parsed.items.filter((item: any) => typeof item?.tag === "string") as StudyPlanItem[] };
      const rows: { cat: string; tags?: string | null }[] = await database.getAllAsync("SELECT cat, tags FROM questions");
      const items = plan.items.filter((item) => rows.some((question) => parseQuestionTags(question.tags, question.cat).some((tag) => tag === item.tag || tag.startsWith(`${item.tag}/`))));
      if (items.length !== plan.items.length) {
        const cleanedPlan = { ...plan, items };
        await database.runAsync("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [PLAN_KEY, JSON.stringify(cleanedPlan)]);
        return cleanedPlan;
      }
      return plan;
    }
  } catch {}
  return { dailyTarget: Number.isFinite(configuredTarget) && configuredTarget > 0 ? configuredTarget : 0, items: [] };
}

export async function saveStudyPlan(plan: StudyPlan) {
  const database = await getDb();
  await database.runAsync("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [PLAN_KEY, JSON.stringify(plan)]);
}

/** Removes plan entries that no longer have any questions after a source is deleted. */
export async function pruneEmptyStudyPlanItems() {
  const [plan, database] = await Promise.all([getStudyPlan(), getDb()]);
  const rows: { cat: string; tags?: string | null }[] = await database.getAllAsync("SELECT cat, tags FROM questions");
  const items = plan.items.filter((item) => rows.some((row) => parseQuestionTags(row.tags, row.cat).some((tag) => tag === item.tag || tag.startsWith(`${item.tag}/`))));
  if (items.length !== plan.items.length) await saveStudyPlan({ ...plan, items });
  return plan.items.length - items.length;
}

export async function getDailyNewTarget() {
  const database = await getDb();
  const row = await database.getFirstAsync("SELECT value FROM app_settings WHERE key = ?", ["daily_new_target"]);
  const target = Number(row?.value);
  return Number.isFinite(target) && target > 0 ? target : 10;
}

export async function resetPlanItemProgress(tag: string) {
  const database = await getDb();
  const rows: { id: string; cat: string; tags?: string | null }[] = await database.getAllAsync("SELECT id, cat, tags FROM questions");
  const questionIds = rows
    .filter((row) => parseQuestionTags(row.tags, row.cat).some((value) => value === tag || value.startsWith(`${tag}/`)))
    .map((row) => row.id);
  if (!questionIds.length) return 0;
  const placeholders = questionIds.map(() => "?").join(", ");
  await database.runAsync(`UPDATE card_progress SET level = 0, correct = 0, incorrect = 0, last_review = NULL, next_review = NULL WHERE question_id IN (${placeholders})`, questionIds);
  return questionIds.length;
}

export async function getTodayStudySummary(): Promise<TodayStudySummary> {
  const [plan, database] = await Promise.all([getStudyPlan(), getDb()]);
  const record = await database.getFirstAsync("SELECT count FROM study_records WHERE date = ?", [today()]);
  const completed = Number(record?.count ?? 0);
  const items = plan.items.filter((item) => item.enabled);
  const target = plan.dailyTarget || items.reduce((sum, item) => sum + item.dailyTarget, 0);
  const state = items.length === 0 ? (plan.dailyTarget > 0 ? "empty" : "no-plan") : completed >= target && target > 0 ? "complete" : "active";
  return { completed, target, items, state };
}

export async function getPlanTagOptions(): Promise<string[]> {
  const database = await getDb();
  const rows: { cat: string; tags?: string | null }[] = await database.getAllAsync("SELECT cat, tags FROM questions");
  return Array.from(new Set(rows.flatMap((row) => parseQuestionTags(row.tags, row.cat)))).filter(Boolean).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

export async function getTodayItemProgress(items: StudyPlanItem[]): Promise<Record<string, number>> {
  const database = await getDb();
  const rows: { cat: string; tags?: string | null; lastReview?: string | null }[] = await database.getAllAsync("SELECT q.cat, q.tags, cp.last_review AS lastReview FROM questions q LEFT JOIN card_progress cp ON q.id = cp.question_id");
  const result: Record<string, number> = {};
  items.forEach((item) => { result[item.id] = 0; });
  rows.filter((row) => String(row.lastReview ?? "").startsWith(today())).forEach((row) => {
    const tags = parseQuestionTags(row.tags, row.cat);
    items.forEach((item) => { if (tags.some((tag) => tag === item.tag || tag.startsWith(`${item.tag}/`))) result[item.id] += 1; });
  });
  return result;
}

export async function getPlanReviewCount(items: StudyPlanItem[]): Promise<number> {
  if (items.length === 0) return 0;
  const database = await getDb();
  const rows: { cat: string; tags?: string | null; level?: number; nextReview?: string | null }[] = await database.getAllAsync("SELECT q.cat, q.tags, COALESCE(cp.level, 0) AS level, cp.next_review AS nextReview FROM questions q LEFT JOIN card_progress cp ON q.id = cp.question_id");
  return rows.filter((row) => (row.level ?? 0) < MASTERED_LEVEL && isCardDue(row.nextReview) && items.some((item) => parseQuestionTags(row.tags, row.cat).some((tag) => tag === item.tag || tag.startsWith(`${item.tag}/`)))).length;
}

export function makePlanItem(tag: string, dailyTarget = 5): StudyPlanItem {
  return { id: `${tag}-${Date.now()}`, tag, dailyTarget, enabled: true, mode: "smart", range: "all" };
}
