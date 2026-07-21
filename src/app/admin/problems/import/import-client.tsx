"use client";

import { Check, FileText, FileUp, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { ChangeEvent, useState } from "react";
import type {
  ObjectiveItem,
  ProblemType,
} from "@/lib/objectiveProblem";
import { objectiveProblemMarkdownTemplate } from "@/lib/markdownTemplates";

type ParsedProblem = {
  title: string;
  problemType: ProblemType;
  difficulty: string;
  category: string;
  description: string;
  inputDescription: string;
  outputDescription: string;
  samples: { input: string; output: string }[];
  dataRange: string;
  objectiveItems?: ObjectiveItem[];
  sourceDocumentIndex: number;
  sourceFileName: string;
};

type ImportDocument = {
  id: string;
  markdown: string;
  name: string;
};

type ImportDocumentResult = {
  errors: string[];
  index: number;
  name: string;
  problemCount: number;
};

const MAX_IMPORT_DOCUMENTS = 20;
const MAX_IMPORT_DOCUMENT_BYTES = 1024 * 1024;
const MAX_IMPORT_BATCH_BYTES = 8 * 1024 * 1024;

const template = `# A+B 问题

## 难度

入门

## 分类

基础语法

## 题目描述

输入两个整数 a 和 b，输出它们的和。

## 输入格式

一行两个整数 a 和 b。

## 输出格式

输出一个整数，表示 a+b 的结果。

## 样例

### 输入样例 1

\`\`\`text
1 2
\`\`\`

### 输出样例 1

\`\`\`text
3
\`\`\`

### 输入样例 2

\`\`\`text
10 20
\`\`\`

### 输出样例 2

\`\`\`text
30
\`\`\`

## 数据范围

1 <= a, b <= 1000

# 判断奇偶

## 难度

入门

## 分类

条件判断

## 题目描述

输入一个整数 n，判断它是奇数还是偶数。

## 输入格式

一行一个整数 n。

## 输出格式

如果是偶数，输出 even；如果是奇数，输出 odd。

## 样例

### 输入样例 1

\`\`\`text
4
\`\`\`

### 输出样例 1

\`\`\`text
even
\`\`\`

### 输入样例 2

\`\`\`text
5
\`\`\`

### 输出样例 2

\`\`\`text
odd
\`\`\`

## 数据范围

1 <= n <= 100000
`;

export function ImportClient() {
  const router = useRouter();
  const [documents, setDocuments] = useState<ImportDocument[]>([
    { id: "programming-template", markdown: template, name: "编程题模板.md" },
  ]);
  const [activeDocumentId, setActiveDocumentId] = useState(
    "programming-template",
  );
  const [defaultDifficulty, setDefaultDifficulty] = useState("入门");
  const [defaultCategory, setDefaultCategory] = useState("基础语法");
  const [preview, setPreview] = useState<ParsedProblem[]>([]);
  const [documentResults, setDocumentResults] = useState<ImportDocumentResult[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const activeDocument =
    documents.find((document) => document.id === activeDocumentId) ??
    documents[0];

  function clearPreview() {
    setPreview([]);
    setDocumentResults([]);
    setParseErrors([]);
  }

  function applyTemplate(name: string, markdown: string, id: string) {
    setDocuments([{ id, markdown, name }]);
    setActiveDocumentId(id);
    clearPreview();
    setError("");
  }

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (files.length === 0) return;

    if (files.length > MAX_IMPORT_DOCUMENTS) {
      setError(`一次最多选择 ${MAX_IMPORT_DOCUMENTS} 个 Markdown 文档`);
      return;
    }

    const invalidFile = files.find((file) => !file.name.toLowerCase().endsWith(".md"));
    if (invalidFile) {
      setError(`《${invalidFile.name}》不是 .md 文档`);
      return;
    }

    const oversizedFile = files.find(
      (file) => file.size > MAX_IMPORT_DOCUMENT_BYTES,
    );
    if (oversizedFile) {
      setError(`《${oversizedFile.name}》超过 1MB，暂时不能导入`);
      return;
    }

    if (files.reduce((total, file) => total + file.size, 0) > MAX_IMPORT_BATCH_BYTES) {
      setError("所选 Markdown 文档内容合计不能超过 8MB");
      return;
    }

    const nextDocuments = await Promise.all(
      files.map(async (file, index) => ({
        id: `${file.name}:${file.size}:${file.lastModified}:${index}`,
        markdown: await file.text(),
        name: file.name,
      })),
    );
    setDocuments(nextDocuments);
    setActiveDocumentId(nextDocuments[0].id);
    clearPreview();
    setError("");
  }

  async function parsePreview() {
    setPending(true);
    setError("");
    clearPreview();
    if (documents.length === 0) {
      setPending(false);
      setError("请先选择 Markdown 文档");
      return;
    }
    const response = await fetch("/api/admin/problems/import/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documents, defaultDifficulty, defaultCategory }),
    });
    const data = await response.json();
    setPending(false);

    if (!response.ok) {
      setError(data.error ?? "解析失败");
      return;
    }
    setPreview(Array.isArray(data.problems) ? data.problems : []);
    setDocumentResults(
      Array.isArray(data.documents) ? data.documents : [],
    );
    setParseErrors(Array.isArray(data.errors) ? data.errors : []);
  }

  async function confirmImport() {
    setPending(true);
    setError("");
    const response = await fetch("/api/admin/problems/import/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ problems: preview, defaultDifficulty, defaultCategory }),
    });
    const data = await response.json();
    setPending(false);

    if (!response.ok) {
      setError(data.error ?? "导入失败");
      return;
    }

    router.push(
      `/admin/problems?problemType=${preview[0]?.problemType ?? "programming"}`,
    );
    router.refresh();
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_520px]">
      <section className="surface p-5">
        <div className="flex flex-col gap-3 border-b border-ink-950/10 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-black">Markdown 导入题目</h1>
            <p className="mt-1 text-sm font-semibold text-ink-600">
              一次最多选择 20 个文档；每道题会按自己的题型、难度和分类生成标签，默认值只在缺少字段时兜底。
            </p>
          </div>
          <label className="btn btn-secondary cursor-pointer">
            <FileUp size={16} />
            选择多个 .md
            <input
              accept=".md,text/markdown,text/plain"
              className="hidden"
              multiple
              onChange={onFileChange}
              type="file"
            />
          </label>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            className="btn btn-secondary px-3 py-2 text-sm"
            onClick={() => {
              applyTemplate("编程题模板.md", template, "programming-template");
            }}
            type="button"
          >
            使用编程题模板
          </button>
          <button
            className="btn btn-secondary px-3 py-2 text-sm"
            onClick={() => {
              applyTemplate(
                "选择判断题模板.md",
                objectiveProblemMarkdownTemplate,
                "objective-template",
              );
            }}
            type="button"
          >
            使用选择判断模板
          </button>
        </div>
        <div className="mt-4 border border-ink-950/10 bg-white/55 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-black text-ink-800">
              已选择 {documents.length} 个文档
            </p>
            <p className="text-xs font-semibold text-ink-500">
              点击文件名可检查或修改对应内容
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {documents.map((document) => (
              <button
                className={`inline-flex max-w-full items-center gap-2 border px-3 py-2 text-left text-xs font-black ${
                  activeDocument?.id === document.id
                    ? "border-steel bg-steel text-white"
                    : "border-ink-950/10 bg-white text-ink-700 hover:border-steel"
                }`}
                key={document.id}
                onClick={() => setActiveDocumentId(document.id)}
                title={document.name}
                type="button"
              >
                <FileText size={14} />
                <span className="truncate">{document.name}</span>
              </button>
            ))}
          </div>
        </div>
        <textarea
          className="field mt-3 min-h-[620px] resize-y font-mono text-sm leading-6"
          onChange={(event) => {
            const markdown = event.target.value;
            setDocuments((current) =>
              current.map((document) =>
                document.id === activeDocument?.id
                  ? { ...document, markdown }
                  : document,
              ),
            );
            clearPreview();
          }}
          value={activeDocument?.markdown ?? ""}
        />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-bold text-ink-800">
            默认难度
            <input
              className="field"
              onChange={(event) => setDefaultDifficulty(event.target.value)}
              value={defaultDifficulty}
            />
          </label>
          <label className="grid gap-2 text-sm font-bold text-ink-800">
            默认分类
            <input
              className="field"
              onChange={(event) => setDefaultCategory(event.target.value)}
              value={defaultCategory}
            />
          </label>
        </div>
        {error ? (
          <p className="mt-4 border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
            {error}
          </p>
        ) : null}
        {parseErrors.length > 0 ? (
          <div className="mt-4 border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
            <p>Markdown 格式有误，暂时不能导入：</p>
            <ul className="mt-2 list-inside list-disc">
              {parseErrors.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            className="btn btn-secondary"
            disabled={pending}
            onClick={parsePreview}
            type="button"
          >
            <Search size={16} />
            解析预览
          </button>
          <button
            className="btn btn-primary"
            disabled={pending || preview.length === 0 || parseErrors.length > 0}
            onClick={confirmImport}
            type="button"
          >
            <Check size={16} />
            确认导入
          </button>
        </div>
      </section>

      <aside className="surface p-5">
        <h2 className="text-xl font-black">解析结果</h2>
        {preview.length > 0 ? (
          <div className="mt-5 grid gap-5">
            <p className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
              共解析 {documentResults.length} 个文档、{preview.length} 道题；编程题 {preview.filter((problem) => problem.problemType === "programming").length} 道，选择判断题 {preview.filter((problem) => problem.problemType === "objective").length} 道
            </p>
            <div className="flex flex-wrap gap-2">
              {documentResults.map((document) => (
                <span
                  className={`border px-2 py-1 text-xs font-black ${
                    document.errors.length > 0
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : "border-steel/20 bg-steel/10 text-steel"
                  }`}
                  key={`${document.index}-${document.name}`}
                >
                  {document.name} · {document.problemCount} 题
                </span>
              ))}
            </div>
            {preview.map((problem, problemIndex) => (
              <details
                className="border border-ink-950/10 bg-white/65 p-4 open:bg-white/82"
                key={`${problem.title}-${problemIndex}`}
                open={problemIndex === 0}
              >
                <summary className="cursor-pointer text-lg font-black">
                  题目 {problemIndex + 1}：{problem.title}
                </summary>
                <div className="mt-4 grid gap-4">
                  <div className="flex flex-wrap gap-2">
                    <PreviewTag value={problem.sourceFileName} />
                    <PreviewTag
                      value={
                        problem.problemType === "objective"
                          ? "选择判断题"
                          : "编程题"
                      }
                    />
                    <PreviewTag value={problem.category} />
                    <PreviewTag value={problem.difficulty} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <PreviewBlock
                      title="题型"
                      value={
                        problem.problemType === "objective"
                          ? "选择判断题"
                          : "编程题"
                      }
                    />
                    <PreviewBlock title="难度" value={problem.difficulty} />
                    <PreviewBlock title="分类" value={problem.category} />
                    <PreviewBlock
                      title={problem.problemType === "objective" ? "小题数量" : "样例数量"}
                      value={`${
                        problem.problemType === "objective"
                          ? problem.objectiveItems?.length ?? 0
                          : problem.samples.length
                      }`}
                    />
                  </div>
                  <PreviewBlock title="题目描述" value={problem.description} />
                  {problem.problemType === "objective" ? (
                    <ObjectivePreview items={problem.objectiveItems ?? []} />
                  ) : (
                    <>
                      <PreviewBlock title="输入格式" value={problem.inputDescription} />
                      <PreviewBlock title="输出格式" value={problem.outputDescription} />
                      <PreviewBlock title="数据范围" value={problem.dataRange} />
                      <SamplePreview samples={problem.samples} />
                    </>
                  )}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm font-semibold text-ink-600">
            等待解析。每道题以一级标题 `# 题目名称` 开始，推荐在文档内写明 `## 难度` 和 `## 分类`。
          </p>
        )}
      </aside>
    </div>
  );
}

function PreviewBlock({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <h3 className="text-sm font-black text-ink-800">{title}</h3>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink-700">{value}</p>
    </div>
  );
}

function PreviewTag({ value }: { value: string }) {
  return (
    <span className="border border-clay/20 bg-clay/10 px-2 py-1 text-xs font-black text-clay">
      {value}
    </span>
  );
}

function SamplePreview({
  samples,
}: {
  samples: { input: string; output: string }[];
}) {
  return (
    <div>
      <h3 className="text-sm font-black text-ink-800">样例列表</h3>
      <div className="mt-2 grid gap-3">
        {samples.map((sample, index) => (
          <div className="border border-ink-950/10 bg-white/70 p-3" key={index}>
            <h4 className="text-xs font-black text-ink-800">
              输入样例 {index + 1}
            </h4>
            <pre className="mt-2 overflow-x-auto text-xs">{sample.input}</pre>
            <h4 className="mt-3 text-xs font-black text-ink-800">
              输出样例 {index + 1}
            </h4>
            <pre className="mt-2 overflow-x-auto text-xs">{sample.output}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}

function ObjectivePreview({ items }: { items: ObjectiveItem[] }) {
  return (
    <div>
      <h3 className="text-sm font-black text-ink-800">小题预览</h3>
      <div className="mt-2 grid gap-3">
        {items.map((item, index) => (
          <div
            className="border border-ink-950/10 bg-white/70 p-3"
            key={`${index}-${item.stem}`}
          >
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-black">第 {index + 1} 题</h4>
              <span className="text-xs font-black text-clay">
                答案 {item.answer} · {item.score} 分
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm font-semibold text-ink-800">
              {item.stem}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-ink-600">
              {item.options
                .map((option) => `${option.label}. ${option.text}`)
                .join("\n")}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
