import { PrismaClient } from "@prisma/client";
import {
  convertLuoguProblemset,
  getOfficialLuoguProblemsetName,
  parseLuoguInjectionHtml,
  parseLuoguProblemsetHtml,
} from "../src/lib/luoguObjectiveSource";
import { parseObjectiveItems, stringifyObjectiveItems } from "../src/lib/objectiveProblem";

type CatalogEntry = { id: number; name: string };

const db = new PrismaClient();
const apply = process.argv.includes("--apply");
const baseUrl = "https://ti.luogu.com.cn";

async function fetchHtml(path: string) {
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

function readCatalogPage(html: string) {
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
    (entry): entry is CatalogEntry =>
      typeof entry === "object" &&
      entry !== null &&
      typeof Reflect.get(entry, "id") === "number" &&
      typeof Reflect.get(entry, "name") === "string",
  );
  return { entries, totalCount };
}

async function loadCatalog() {
  const first = readCatalogPage(await fetchHtml("/problemset/?page=1"));
  const pageSize = first.entries.length;
  if (pageSize === 0) throw new Error("洛谷有题题库列表为空");

  const entries = [...first.entries];
  const pageCount = Math.ceil(first.totalCount / pageSize);
  for (let page = 2; page <= pageCount; page += 1) {
    entries.push(
      ...readCatalogPage(await fetchHtml(`/problemset/?page=${page}`)).entries,
    );
  }
  return entries;
}

async function main() {
  const localProblems = await db.problem.findMany({
    where: {
      archivedAt: null,
      category: { in: ["GESP 一级", "GESP 二级", "GESP 三级"] },
      problemType: "objective",
    },
    select: {
      category: true,
      id: true,
      objectiveItems: true,
      title: true,
    },
    orderBy: { id: "asc" },
  });

  const officialProblems = localProblems.flatMap((problem) => {
    const sourceName = getOfficialLuoguProblemsetName(problem.title);
    return sourceName ? [{ ...problem, sourceName }] : [];
  });
  const catalog = await loadCatalog();
  const catalogByName = new Map(catalog.map((entry) => [entry.name, entry]));
  const sourceCache = new Map<string, ReturnType<typeof convertLuoguProblemset>>();

  let changedRecords = 0;
  let changedItems = 0;
  for (const problem of officialProblems) {
    const catalogEntry = catalogByName.get(problem.sourceName);
    if (!catalogEntry) {
      throw new Error(`洛谷有题中未找到《${problem.sourceName}》`);
    }

    let sourceItems = sourceCache.get(problem.sourceName);
    if (!sourceItems) {
      const source = parseLuoguProblemsetHtml(
        await fetchHtml(`/problemset/${catalogEntry.id}`),
      );
      if (source.name !== problem.sourceName) {
        throw new Error(
          `来源标题不一致：期望《${problem.sourceName}》，实际《${source.name}》`,
        );
      }
      sourceItems = convertLuoguProblemset(source);
      sourceCache.set(problem.sourceName, sourceItems);
    }

    const localItems = parseObjectiveItems(problem.objectiveItems);
    const itemDiffs = Array.from(
      { length: Math.max(sourceItems.length, localItems.length) },
      (_, index) =>
        sourceItems[index] &&
        localItems[index] &&
        stringifyObjectiveItems([sourceItems[index]]) ===
          stringifyObjectiveItems([localItems[index]])
          ? 0
          : 1,
    ).reduce<number>((sum, value) => sum + value, 0);
    if (itemDiffs === 0 && localItems.length === sourceItems.length) {
      console.log(`一致  #${problem.id} ${problem.sourceName}`);
      continue;
    }

    changedRecords += 1;
    changedItems += itemDiffs;
    console.log(
      `${apply ? "更新" : "待更新"} #${problem.id} ${problem.sourceName}：${localItems.length} -> ${sourceItems.length} 题，${itemDiffs} 题内容不同`,
    );
    if (apply) {
      await db.problem.update({
        data: { objectiveItems: stringifyObjectiveItems(sourceItems) },
        where: { id: problem.id },
      });
    }
  }

  const levelCounts = ["GESP 一级", "GESP 二级", "GESP 三级"].map((category) => ({
    category,
    count: localProblems.filter((problem) => problem.category === category).length,
  }));
  console.log("");
  console.log(
    `结果：核对 ${officialProblems.length} 条本地正式真题记录、${sourceCache.size} 套洛谷原题；${changedRecords} 条记录、${changedItems} 道小题${apply ? "已修正" : "需要修正"}。`,
  );
  console.log(
    `本地分类：${levelCounts.map(({ category, count }) => `${category} ${count} 套`).join("，")}。`,
  );
  if (!apply && changedRecords > 0) {
    console.log("当前是只读审计；确认后使用 --apply 执行更新。");
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
