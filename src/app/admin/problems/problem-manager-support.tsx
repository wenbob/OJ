"use client";

import { Plus, Save, Trash2, X } from "lucide-react";
import type { DragEvent, FormEvent, ReactNode } from "react";
import {
  validateObjectiveItems,
  type ObjectiveItem,
  type ProblemType,
} from "@/lib/objectiveProblem";
import type {
  ProblemDropPlacement,
  ProblemListSort,
} from "@/lib/problemOrdering";

export type TestCaseForm = {
  id?: number;
  input: string;
  output: string;
  isSample: boolean;
};

export type ProblemItem = {
  id: number;
  title: string;
  difficulty: string;
  category: string;
  problemType: ProblemType;
  itemCount: number;
  submissions?: number;
  _count?: { submissions: number };
  sortPosition: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
};

export type ProblemDetail = {
  id: number;
  title: string;
  description: string;
  inputDescription: string;
  outputDescription: string;
  sampleInput: string;
  sampleOutput: string;
  dataRange: string | null;
  difficulty: string;
  category: string;
  problemType: string;
  objectiveItems: string | null;
  testCases: TestCaseForm[];
};

export type ProblemForm = {
  title: string;
  description: string;
  inputDescription: string;
  outputDescription: string;
  sampleInput: string;
  sampleOutput: string;
  dataRange: string;
  difficulty: string;
  category: string;
  problemType: ProblemType;
  objectiveItems: ObjectiveItem[];
  testCases: TestCaseForm[];
};

export type UpdateProblemField = <K extends keyof ProblemForm>(
  key: K,
  value: ProblemForm[K],
) => void;

export function createBlankObjectiveItem(
  kind: "choice" | "judge" = "choice",
): ObjectiveItem {
  return {
    kind,
    stem: "",
    options:
      kind === "judge"
        ? [
            { label: "A", text: "正确" },
            { label: "B", text: "错误" },
          ]
        : [
            { label: "A", text: "" },
            { label: "B", text: "" },
          ],
    answer: "A",
    score: 1,
  };
}

export function createBlankProblemForm({
  category = "基础语法",
  problemType = "programming",
}: {
  category?: string;
  problemType?: ProblemType;
} = {}): ProblemForm {
  return {
    title: "",
    description: "",
    inputDescription: "",
    outputDescription: "",
    sampleInput: "",
    sampleOutput: "",
    dataRange: "",
    difficulty: "入门",
    category,
    problemType,
    objectiveItems: [createBlankObjectiveItem()],
    testCases: [
      { input: "", output: "", isSample: true },
      { input: "", output: "", isSample: true },
    ],
  };
}

export const problemSortLabels: Record<ProblemListSort, string> = {
  custom: "自定义顺序",
  "title-asc": "标题升序",
  "title-desc": "标题降序",
  newest: "最新创建优先",
  oldest: "最早创建优先",
};

export function getDropPlacement(
  event: DragEvent<HTMLElement>,
): ProblemDropPlacement {
  const bounds = event.currentTarget.getBoundingClientRect();
  return event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
}

export function validateProblemForm(form: ProblemForm) {
  if (!form.title.trim()) return "标题不能为空";
  if (!form.difficulty.trim()) return "难度不能为空";
  if (!form.category.trim()) return "分类不能为空";
  if (!form.description.trim()) return "题目描述不能为空";
  if (form.problemType === "objective") {
    return validateObjectiveItems(form.objectiveItems)[0] ?? "";
  }
  if (!form.inputDescription.trim()) return "输入格式不能为空";
  if (!form.outputDescription.trim()) return "输出格式不能为空";
  if (!form.sampleInput.trim()) return "样例输入不能为空";
  if (!form.sampleOutput.trim()) return "样例输出不能为空";
  const nonEmptyCases = form.testCases.filter(
    (testCase) => testCase.input.trim() || testCase.output.trim(),
  );
  if (nonEmptyCases.length === 0) return "至少需要添加测试点";
  if (
    nonEmptyCases.some(
      (testCase) => !testCase.input.trim() || !testCase.output.trim(),
    )
  ) {
    return "测试点输入和输出不能为空";
  }
  if (nonEmptyCases.filter((testCase) => testCase.isSample).length < 2) {
    return "题目至少需要两组样例";
  }
  return "";
}

export function ProblemEditorForm({
  addObjectiveOption,
  editingId,
  error,
  form,
  pending,
  removeObjectiveOption,
  resetForm,
  save,
  updateField,
  updateObjectiveItem,
  updateObjectiveKind,
  updateObjectiveOption,
  updateTestCase,
}: {
  addObjectiveOption: (itemIndex: number) => void;
  editingId: number | null;
  error: string;
  form: ProblemForm;
  pending: boolean;
  removeObjectiveOption: (itemIndex: number, optionIndex: number) => void;
  resetForm: () => void;
  save: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  updateField: UpdateProblemField;
  updateObjectiveItem: (index: number, patch: Partial<ObjectiveItem>) => void;
  updateObjectiveKind: (index: number, kind: "choice" | "judge") => void;
  updateObjectiveOption: (
    itemIndex: number,
    optionIndex: number,
    text: string,
  ) => void;
  updateTestCase: (index: number, patch: Partial<TestCaseForm>) => void;
}) {
  return (
    <form
      className="surface scroll-mt-4 p-5"
      id="problem-create-form"
      onSubmit={save}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-black">
          {editingId ? "编辑题目" : "新增题目"}
        </h2>
        {editingId ? (
          <button
            className="btn btn-secondary px-3 py-2"
            onClick={resetForm}
            type="button"
          >
            <X size={15} />
            取消
          </button>
        ) : null}
      </div>

      <div className="mt-5 grid gap-4">
        <Input
          label="标题"
          onChange={(value) => updateField("title", value)}
          value={form.title}
        />
        <label className="grid gap-2 text-sm font-bold text-ink-800">
          题型
          <select
            className="field"
            onChange={(event) =>
              updateField("problemType", event.target.value as ProblemType)
            }
            value={form.problemType}
          >
            <option value="programming">编程题</option>
            <option value="objective">选择判断题</option>
          </select>
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="难度"
            onChange={(value) => updateField("difficulty", value)}
            value={form.difficulty}
          />
          <Input
            label="分类"
            onChange={(value) => updateField("category", value)}
            value={form.category}
          />
        </div>
        <Textarea
          label="题目描述"
          onChange={(value) => updateField("description", value)}
          value={form.description}
        />
        {form.problemType === "programming" ? (
          <>
            <Textarea
              label="输入格式"
              onChange={(value) => updateField("inputDescription", value)}
              value={form.inputDescription}
            />
            <Textarea
              label="输出格式"
              onChange={(value) => updateField("outputDescription", value)}
              value={form.outputDescription}
            />
            <Textarea
              label="样例输入"
              onChange={(value) => updateField("sampleInput", value)}
              value={form.sampleInput}
            />
            <Textarea
              label="样例输出"
              onChange={(value) => updateField("sampleOutput", value)}
              value={form.sampleOutput}
            />
            <Textarea
              label="数据范围"
              onChange={(value) => updateField("dataRange", value)}
              value={form.dataRange}
            />
          </>
        ) : (
          <p className="border border-steel/20 bg-steel/10 px-3 py-3 text-sm font-semibold leading-6 text-ink-700">
            选择判断题不使用输入输出样例。学生在右侧答案区按题号顺序逐行填写
            A、B、C 或 D。
          </p>
        )}
      </div>

      {form.problemType === "programming" ? (
        <div className="mt-6 border-t border-ink-950/10 pt-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black">测试点列表</h3>
            <button
              className="btn btn-secondary px-3 py-2"
              onClick={() =>
                updateField("testCases", [
                  ...form.testCases,
                  { input: "", output: "", isSample: false },
                ])
              }
              type="button"
            >
              <Plus size={15} />
              添加
            </button>
          </div>
          <div className="mt-4 grid gap-4">
            {form.testCases.map((testCase, index) => (
              <div
                className="border border-ink-950/10 bg-white/60 p-3"
                key={index}
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 text-sm font-bold">
                    <input
                      checked={testCase.isSample}
                      onChange={(event) =>
                        updateTestCase(index, {
                          isSample: event.target.checked,
                        })
                      }
                      type="checkbox"
                    />
                    样例
                  </label>
                  <button
                    className="btn btn-danger px-3 py-2"
                    onClick={() =>
                      updateField(
                        "testCases",
                        form.testCases.filter(
                          (_, currentIndex) => currentIndex !== index,
                        ),
                      )
                    }
                    type="button"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <Textarea
                  label={`输入 ${index + 1}`}
                  onChange={(value) => updateTestCase(index, { input: value })}
                  value={testCase.input}
                />
                <div className="mt-3">
                  <Textarea
                    label={`输出 ${index + 1}`}
                    onChange={(value) =>
                      updateTestCase(index, { output: value })
                    }
                    value={testCase.output}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-6 border-t border-ink-950/10 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-black">选择判断小题</h3>
              <p className="mt-1 text-sm font-semibold text-ink-600">
                判断题固定使用 A=正确、B=错误；单选题支持 2 至 4 个选项。
              </p>
            </div>
            <div className="flex gap-2">
              <button
                className="btn btn-secondary px-3 py-2"
                onClick={() =>
                  updateField("objectiveItems", [
                    ...form.objectiveItems,
                    createBlankObjectiveItem("choice"),
                  ])
                }
                type="button"
              >
                <Plus size={15} />
                单选题
              </button>
              <button
                className="btn btn-secondary px-3 py-2"
                onClick={() =>
                  updateField("objectiveItems", [
                    ...form.objectiveItems,
                    createBlankObjectiveItem("judge"),
                  ])
                }
                type="button"
              >
                <Plus size={15} />
                判断题
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-4">
            {form.objectiveItems.map((item, itemIndex) => (
              <div
                className="border border-ink-950/10 bg-white/60 p-4"
                key={itemIndex}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h4 className="font-black">第 {itemIndex + 1} 题</h4>
                  <button
                    className="btn btn-danger px-3 py-2"
                    disabled={form.objectiveItems.length <= 1}
                    onClick={() =>
                      updateField(
                        "objectiveItems",
                        form.objectiveItems.filter(
                          (_, currentIndex) => currentIndex !== itemIndex,
                        ),
                      )
                    }
                    type="button"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-bold text-ink-800">
                    小题类型
                    <select
                      className="field"
                      onChange={(event) =>
                        updateObjectiveKind(
                          itemIndex,
                          event.target.value as "choice" | "judge",
                        )
                      }
                      value={item.kind}
                    >
                      <option value="choice">单选题</option>
                      <option value="judge">判断题</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-bold text-ink-800">
                    分值
                    <input
                      className="field"
                      min={1}
                      onChange={(event) =>
                        updateObjectiveItem(itemIndex, {
                          score: Number(event.target.value),
                        })
                      }
                      type="number"
                      value={item.score}
                    />
                  </label>
                </div>
                <div className="mt-4">
                  <Textarea
                    label="题干"
                    onChange={(value) =>
                      updateObjectiveItem(itemIndex, { stem: value })
                    }
                    value={item.stem}
                  />
                </div>
                <div className="mt-4 grid gap-3">
                  {item.options.map((option, optionIndex) => (
                    <div
                      className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-end gap-2"
                      key={option.label}
                    >
                      <span className="pb-3 text-center font-black text-steel">
                        {option.label}
                      </span>
                      <Input
                        label={`选项 ${option.label}`}
                        onChange={(value) =>
                          updateObjectiveOption(itemIndex, optionIndex, value)
                        }
                        value={option.text}
                      />
                      <button
                        className="btn btn-danger mb-0.5 px-3 py-2"
                        disabled={
                          item.kind === "judge" || item.options.length <= 2
                        }
                        onClick={() =>
                          removeObjectiveOption(itemIndex, optionIndex)
                        }
                        type="button"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  {item.kind === "choice" && item.options.length < 4 ? (
                    <button
                      className="btn btn-secondary justify-self-start px-3 py-2"
                      onClick={() => addObjectiveOption(itemIndex)}
                      type="button"
                    >
                      <Plus size={14} />
                      添加选项
                    </button>
                  ) : null}
                </div>
                <label className="mt-4 grid gap-2 text-sm font-bold text-ink-800">
                  正确答案
                  <select
                    className="field"
                    onChange={(event) =>
                      updateObjectiveItem(itemIndex, {
                        answer: event.target.value,
                      })
                    }
                    value={item.answer}
                  >
                    {item.options.map((option) => (
                      <option key={option.label} value={option.label}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      {error ? (
        <p className="mt-4 border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
          {error}
        </p>
      ) : null}
      <button
        className="btn btn-primary mt-5 w-full"
        disabled={pending}
        type="submit"
      >
        <Save size={16} />
        {pending ? "保存中" : "保存题目"}
      </button>
    </form>
  );
}

export function CategoryButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={`border px-3 py-2 text-sm font-black ${
        active
          ? "border-ink-950 bg-ink-950 text-white"
          : "border-ink-950/10 bg-white/65 text-ink-800 hover:border-steel hover:text-steel"
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function Input({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-bold text-ink-800">
      {label}
      <input
        className="field"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function Textarea({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-bold text-ink-800">
      {label}
      <textarea
        className="field min-h-24 resize-y"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}
