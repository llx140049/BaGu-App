/** Keeps the legacy category field compatible while allowing several tag paths. */
export function normalizeTagPath(value: string): string {
  return value
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join("/");
}

export function parseQuestionTags(raw: string | string[] | null | undefined, fallbackCategory = ""): string[] {
  let values: unknown[] = [];
  if (Array.isArray(raw)) values = raw;
  else if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      values = Array.isArray(parsed) ? parsed : [];
    } catch {
      values = [];
    }
  }

  const normalized = values
    .filter((value): value is string => typeof value === "string")
    .map(normalizeTagPath)
    .filter(Boolean);
  const fallback = normalizeTagPath(fallbackCategory);
  if (fallback) normalized.push(fallback);
  return Array.from(new Set(normalized));
}

export function cardHasTag(tags: string[], tagPath: string): boolean {
  const normalizedTarget = normalizeTagPath(tagPath);
  return Boolean(normalizedTarget) && tags.some((tag) => tag === normalizedTarget || tag.startsWith(`${normalizedTarget}/`));
}

export function topLevelTag(tagPath: string): string {
  return normalizeTagPath(tagPath).split("/")[0] || "未分类";
}
