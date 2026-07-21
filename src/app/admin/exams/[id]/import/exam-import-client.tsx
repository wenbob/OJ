"use client";

import { Check, FileUp, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { ChangeEvent, useState } from "react";
import { ProblemRichText } from "@/components/ProblemRichText";
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
};

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
`;

export function ExamImportClient({
  examId,
  examType,
}: {
  examId: number;
  examType: ProblemType;
}) {
  const router = useRouter();
  const [markdown, setMarkdown] = useState(
    examType === "objective" ? objectiveProblemMarkdownTemplate : template,
  );
  const [defaultDifficulty, setDefaultDifficulty] = useState("入门");
  const [defaultCategory, setDefaultCategory] = useState("基础语法");
  const [preview, setPreview] = useState<ParsedProblem[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMarkdown(await file.text());
    setPreview([]);
    setParseErrors([]);
    setError("");
    setSuccess("");
  }

  async function parsePreview() {
    setPending(true);
    setError("");
    setSuccess("");
    setPreview([]);
    setParseErrors([]);
    const response = await fetch(`/api/admin/exams/${examId}/import/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markdown, defaultDifficulty, defaultCategory }),
    });
    const data = await response.json();
    setPending(false);

    if (!response.ok) {
      setError(data.error ?? "解析失败");
      return;
    }
    setPreview(Array.isArray(data.problems) ? data.problems : []);
    setParseErrors(Array.isArray(data.errors) ? data.errors : []);
  }

  async function confirmImport() {
    setPending(true);
    setError("");
    setSuccess("");
    const response = await fetch(`/api/admin/exams/${examId}/import/confirm`, {
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

    setSuccess(`成功导入 ${data.count} 道题，并加入当前考试`);
    router.push(`/admin/exams/${examId}/edit`);
    router.refresh();
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_520px]">
      <section className="surface p-5">
        <div className="flex flex-col gap-3 border-b border-ink-950/10 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-black">Markdown 导入题目到考试</h1>
            <p className="mt-1 text-sm font-semibold text-ink-600">
              当前是{examType === "objective" ? "选择判断" : "编程"}考试，只能导入同类型题目。导入后题目也会进入日常题库。
            </p>
          </div>
          <label className="btn btn-secondary cursor-pointer">
            <FileUp size={16} />
            上传 .md
            <input
              accept=".md,text/markdown,text/plain"
              className="hidden"
              onChange={onFileChange}
              type="file"
            />
          </label>
        </div>
        <textarea
          className="field mt-5 min-h-[620px] resize-y font-mono text-sm leading-6"
          onChange={(event) => {
            setMarkdown(event.target.value);
            setPreview([]);
            setParseErrors([]);
          }}
          value={markdown}
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
        {success ? (
          <p className="mt-4 border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
            {success}
          </p>
        ) : null}
        {parseErrors.length > 0 ? (
          <div className="mt-4 border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
            <p>Markdown 格式有误，不能确认导入：</p>
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
            确认导入到考试
          </button>
        </div>
      </section>

      <aside className="surface p-5">
        <h2 className="text-xl font-black">解析预览</h2>
        {preview.length > 0 ? (
          <div className="mt-5 grid gap-5">
            <p className="border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
              共解析到 {preview.length} 道题
            </p>
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
            等待解析。每道题以一级标题 `# 题目名称` 开始，并且至少包含两组样例。
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
      <ProblemRichText
        className="mt-2 text-sm leading-6 text-ink-700"
        codeClassName="text-xs"
        value={value}
      />
    </div>
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
            <ProblemRichText
              className="mt-2 text-sm font-semibold text-ink-800"
              codeClassName="text-xs"
              value={item.stem}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
