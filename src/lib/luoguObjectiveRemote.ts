import {
  convertLuoguProblemset,
  parseLuoguInjectionHtml,
  parseLuoguProblemsetHtml,
} from "./luoguObjectiveSource";

export type LuoguCatalogEntry = { id: number; name: string };

const baseUrl = "https://ti.luogu.com.cn";

export async function fetchLuoguHtml(path: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Accept: "text/html",
      "User-Agent": "OJ-objective-source-audit/1.0",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`洛谷有题请求失败：${response.status} ${path}`);
  }
  return response.text();
}

export function readLuoguCatalogPage(html: string) {
  const injection = parseLuoguInjectionHtml(html);
  const value = injection.currentData?.problemsets;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("洛谷有题题库列表格式无效");
  }

  const result = Reflect.get(value, "result");
  const totalCount = Reflect.get(value, "totalCount");
  if (!Array.isArray(result) || typeof totalCount !== "number") {
    throw new Error("洛谷有题题库列表数据不完整");
  }

  const entries = result.filter(
    (entry): entry is LuoguCatalogEntry =>
      typeof entry === "object" &&
      entry !== null &&
      typeof Reflect.get(entry, "id") === "number" &&
      typeof Reflect.get(entry, "name") === "string",
  );
  return { entries, totalCount };
}

export async function loadLuoguCatalog() {
  const first = readLuoguCatalogPage(await fetchLuoguHtml("/problemset/?page=1"));
  const pageSize = first.entries.length;
  if (pageSize === 0) throw new Error("洛谷有题题库列表为空");

  const entries = [...first.entries];
  const pageCount = Math.ceil(first.totalCount / pageSize);
  for (let page = 2; page <= pageCount; page += 1) {
    entries.push(
      ...readLuoguCatalogPage(await fetchLuoguHtml(`/problemset/?page=${page}`))
        .entries,
    );
  }
  return entries;
}

export async function fetchLuoguObjectiveProblemset(entry: LuoguCatalogEntry) {
  const problemset = parseLuoguProblemsetHtml(
    await fetchLuoguHtml(`/problemset/${entry.id}`),
  );
  if (problemset.name !== entry.name) {
    throw new Error(
      `来源标题不一致：期望《${entry.name}》，实际《${problemset.name}》`,
    );
  }
  return {
    id: problemset.id,
    items: convertLuoguProblemset(problemset),
    name: problemset.name,
  };
}
