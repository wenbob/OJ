import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseProblemMarkdown } from "../src/lib/markdownParser";
import {
  flattenObjectiveOptionText,
  serializeRawObjectiveMarkdown,
  serializeStandardObjectiveMarkdown,
} from "../src/lib/luoguObjectiveMarkdown";
import {
  fetchLuoguObjectiveProblemset,
  loadLuoguCatalog,
  type LuoguCatalogEntry,
} from "../src/lib/luoguObjectiveRemote";
import { validateLuoguMathMarkup } from "../src/lib/luoguObjectiveSource";

type Target = {
  filePath: string;
  format: "raw" | "standard";
  officialName: string;
};

const defaultRoot = "D:\\GESP-md文档\\选择判断";
const apply = process.argv.includes("--apply");
const rootArg = process.argv.find((value) => value.startsWith("--root="));
const root = path.resolve(rootArg?.slice("--root=".length) || defaultRoot);

function targetFromFile(filePath: string): Target | null {
  const name = path.basename(filePath);
  const raw = /^GESP_(\d{4})(\d{2})_C\+\+_(一级|二级|三级)_选择判断真题\.md$/.exec(name);
  if (raw) {
    return {
      filePath,
      format: "raw",
      officialName: `GESP ${raw[1]}${raw[2]} C++ ${raw[3]}`,
    };
  }

  const standard = /^GESP_C\+\+_(\d{4})年(\d{1,2})月_(一级|二级|三级)_选择判断真题_标准导入版\.md$/.exec(name);
  if (standard) {
    return {
      filePath,
      format: "standard",
      officialName: `GESP ${standard[1]}${standard[2].padStart(2, "0")} C++ ${standard[3]}`,
    };
  }
  return null;
}

async function walk(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(fullPath)));
    else if (entry.isFile() && entry.name.endsWith(".md")) result.push(fullPath);
  }
  return result;
}

function validateStandardMarkdown(
  content: string,
  expected: Awaited<ReturnType<typeof fetchLuoguObjectiveProblemset>>,
) {
  const parsed = parseProblemMarkdown(content);
  const actual = parsed.objectiveItems ?? [];
  if (actual.length !== expected.items.length) {
    throw new Error(`${expected.name} 标准导入版题数错误：${actual.length}/${expected.items.length}`);
  }
  actual.forEach((item, index) => {
    const source = expected.items[index];
    if (
      item.stem !== source.stem ||
      item.answer !== source.answer ||
      item.kind !== source.kind ||
      item.score !== source.score ||
      JSON.stringify(item.options) !== JSON.stringify(source.options.map((option) => ({
        ...option,
        text: flattenObjectiveOptionText(option.text),
      })))
    ) {
      throw new Error(`${expected.name} 第 ${index + 1} 题导入结果与洛谷原文不一致`);
    }
  });
}

function validateRawMarkdown(
  content: string,
  expected: Awaited<ReturnType<typeof fetchLuoguObjectiveProblemset>>,
) {
  const questionHeadings = content.match(/^###\s+\d+\.\s+(?:单选题|判断题)\s*$/gm) ?? [];
  const answers = content.match(/^答案:\s+[A-D](?:\s+\(.+\))?\s*$/gm) ?? [];
  if (questionHeadings.length !== expected.items.length || answers.length !== expected.items.length) {
    throw new Error(
      `${expected.name} 原始版结构错误：题目 ${questionHeadings.length}/${expected.items.length}，答案 ${answers.length}/${expected.items.length}`,
    );
  }
  if (!content.includes(`来源: https://ti.luogu.com.cn/problemset/${expected.id}`)) {
    throw new Error(`${expected.name} 原始版来源链接错误`);
  }
}

async function main() {
  const targets = (await walk(root)).map(targetFromFile).filter((value): value is Target => Boolean(value));
  const rawCount = targets.filter((target) => target.format === "raw").length;
  const standardCount = targets.length - rawCount;
  const sourceNames = [...new Set(targets.map((target) => target.officialName))].sort();
  console.log(`扫描到 ${targets.length} 个目标文件：原始版 ${rawCount}，标准导入版 ${standardCount}，共 ${sourceNames.length} 套真题。`);
  if (targets.length !== 82 || rawCount !== 41 || standardCount !== 41 || sourceNames.length !== 41) {
    throw new Error("一级、二级、三级目标文件数量不是预期的 82 份/41 套，已停止写入");
  }

  console.log("正在读取洛谷有题公开题库目录……");
  const catalog = await loadLuoguCatalog();
  const catalogByName = new Map(catalog.map((entry) => [entry.name, entry]));
  const sources = new Map<string, Awaited<ReturnType<typeof fetchLuoguObjectiveProblemset>>>();
  for (const [index, name] of sourceNames.entries()) {
    const entry = catalogByName.get(name) as LuoguCatalogEntry | undefined;
    if (!entry) throw new Error(`洛谷有题中找不到《${name}》`);
    console.log(`[${index + 1}/${sourceNames.length}] 校对 ${name}`);
    const source = await fetchLuoguObjectiveProblemset(entry);
    if (source.items.length !== 25) throw new Error(`${name} 题数不是 25`);
    sources.set(name, source);
  }

  const changes: { target: Target; before: string; after: string }[] = [];
  for (const target of targets) {
    const source = sources.get(target.officialName);
    if (!source) throw new Error(`缺少来源数据：${target.officialName}`);
    source.items.forEach((item, index) => {
      validateLuoguMathMarkup(item.stem, `${source.name} 第 ${index + 1} 题题干`);
      item.options.forEach((option) => validateLuoguMathMarkup(option.text, `${source.name} 第 ${index + 1} 题选项 ${option.label}`));
    });
    const after = target.format === "standard"
      ? serializeStandardObjectiveMarkdown(source)
      : serializeRawObjectiveMarkdown(source);
    if (target.format === "standard") {
      try {
        validateStandardMarkdown(after, source);
      } catch (error) {
        throw new Error(
          `${target.filePath} 校验失败：${error instanceof Error ? error.message : error}`,
        );
      }
    } else {
      validateRawMarkdown(after, source);
    }
    const before = (await readFile(target.filePath, "utf8")).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
    if (before !== after) changes.push({ target, before, after });
  }

  console.log(`校验完成：${targets.length} 份文件、${sourceNames.length * 25} 道来源题；需要更新 ${changes.length} 份文件。`);
  if (!apply) {
    console.log("当前为只读预检。确认后使用 --apply 写入。 ");
    return;
  }
  if (changes.length === 0) {
    console.log("所有文件已经与洛谷原文一致，无需写入。 ");
    return;
  }

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/T/, "-").slice(0, 15);
  const backupRoot = path.join(path.dirname(root), "backups", `选择判断-一级二级三级-公式修复-${stamp}`);
  for (const change of changes) {
    const relative = path.relative(root, change.target.filePath);
    const backupPath = path.join(backupRoot, relative);
    await mkdir(path.dirname(backupPath), { recursive: true });
    await copyFile(change.target.filePath, backupPath);
  }
  console.log(`已备份 ${changes.length} 份原文件到：${backupRoot}`);

  for (const change of changes) {
    await writeFile(change.target.filePath, change.after, "utf8");
  }
  console.log(`已写入 ${changes.length} 份 UTF-8/LF Markdown。`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
