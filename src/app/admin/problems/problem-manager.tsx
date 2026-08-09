"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  FileUp,
  GripVertical,
  ListOrdered,
  Pencil,
  Save,
  Trash2,
} from "lucide-react";
import type { DragEvent, FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { ProblemTypeBadge } from "@/components/ProblemTypeBadge";
import {
  parseObjectiveItems,
  type ObjectiveItem,
  type ProblemType,
} from "@/lib/objectiveProblem";
import type { PaginationMeta } from "@/lib/pagination";
import {
  moveItemRelative,
  moveProblemRelative,
  type ProblemDropPlacement,
  type ProblemListSort,
} from "@/lib/problemOrdering";
import {
  CategoryButton,
  ProblemEditorForm,
  createBlankObjectiveItem,
  createBlankProblemForm,
  getDropPlacement,
  problemSortLabels,
  validateProblemForm,
  type ProblemDetail,
  type ProblemForm,
  type ProblemItem,
  type TestCaseForm,
} from "./problem-manager-support";

export function ProblemManager({
  categories,
  initialCategory,
  initialPagination,
  initialProblemType,
  initialProblems,
  initialSort,
  openCreateForm,
}: {
  categories: string[];
  initialCategory: string;
  initialPagination: PaginationMeta;
  initialProblemType: ProblemType;
  initialProblems: ProblemItem[];
  initialSort: ProblemListSort;
  openCreateForm: boolean;
}) {
  const [categoryOptions, setCategoryOptions] = useState(categories);
  const [problems, setProblems] = useState(initialProblems);
  const [pagination, setPagination] = useState(initialPagination);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [selectedProblemType, setSelectedProblemType] =
    useState<ProblemType>(initialProblemType);
  const [selectedSort, setSelectedSort] =
    useState<ProblemListSort>(initialSort);
  const [form, setForm] = useState<ProblemForm>(() =>
    createBlankProblemForm({
      category:
        openCreateForm && initialCategory ? initialCategory : "基础语法",
      problemType: openCreateForm ? initialProblemType : "programming",
    }),
  );
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loadingProblemId, setLoadingProblemId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [movingProblemId, setMovingProblemId] = useState<number | null>(null);
  const [draggedProblemId, setDraggedProblemId] = useState<number | null>(null);
  const [problemDropTarget, setProblemDropTarget] = useState<{
    problemId: number;
    placement: ProblemDropPlacement;
  } | null>(null);
  const [savingCurrentOrder, setSavingCurrentOrder] = useState(false);
  const [categorySortOpen, setCategorySortOpen] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState<string[]>(categories);
  const [categoryPending, setCategoryPending] = useState(false);
  const [draggedCategory, setDraggedCategory] = useState<string | null>(null);
  const [categoryDropTarget, setCategoryDropTarget] = useState<{
    category: string;
    placement: ProblemDropPlacement;
  } | null>(null);
  const reloadRequestIdRef = useRef(0);
  const allCurrentPageSelected =
    problems.length > 0 && problems.every((problem) => selectedIds.includes(problem.id));

  useEffect(() => {
    if (!openCreateForm) return;
    document.getElementById("problem-create-form")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
  }, [openCreateForm]);

  function resetProblemDrag() {
    setDraggedProblemId(null);
    setProblemDropTarget(null);
  }

  function resetCategoryDrag() {
    setDraggedCategory(null);
    setCategoryDropTarget(null);
  }

  async function reload(
    category = selectedCategory,
    page = pagination.page,
    problemType = selectedProblemType,
    sort = selectedSort,
  ) {
    const requestId = ++reloadRequestIdRef.current;
    const query = new URLSearchParams();
    if (category) query.set("category", category);
    query.set("problemType", problemType);
    query.set("sort", sort);
    query.set("page", String(page));
    query.set("pageSize", String(pagination.pageSize));
    try {
      const response = await fetch(`/api/admin/problems?${query}`);
      const data = await response.json();
      if (requestId !== reloadRequestIdRef.current) return;
      if (response.ok) {
        const nextProblems: ProblemItem[] = data.items ?? data.problems ?? [];
        setProblems(nextProblems);
        setSelectedIds([]);
        setPagination({
          total: data.total ?? nextProblems.length,
          page: data.page ?? page,
          pageSize: data.pageSize ?? pagination.pageSize,
          totalPages: data.totalPages ?? 1,
        });
        setSelectedSort(data.sort ?? sort);
        const categoryValues: unknown[] = Array.isArray(data.categories)
          ? data.categories.filter(
              (value: unknown): value is string =>
                typeof value === "string" && Boolean(value.trim()),
            )
          : nextProblems.map((problem) => problem.category).filter(Boolean);
        const responseCategories = categoryValues.filter(
          (value): value is string => typeof value === "string",
        );
        setCategoryOptions(
          Array.from(new Set(responseCategories.map((value) => value.trim()))),
        );
        return;
      }
      setError(data.error ?? "题目列表加载失败");
    } catch {
      if (requestId !== reloadRequestIdRef.current) return;
      setError("题目列表加载失败，请稍后重试");
    }
  }

  async function selectCategory(category: string) {
    setSelectedCategory(category);
    setMessage("");
    setError("");
    const query = new URLSearchParams({
      problemType: selectedProblemType,
      sort: selectedSort,
    });
    if (category) query.set("category", category);
    window.history.pushState(null, "", `/admin/problems?${query}`);
    await reload(category, 1, selectedProblemType, selectedSort);
  }

  async function selectProblemType(problemType: ProblemType) {
    resetProblemDrag();
    resetCategoryDrag();
    setSelectedProblemType(problemType);
    setSelectedCategory("");
    setCategoryOptions([]);
    setSelectedIds([]);
    setCategorySortOpen(false);
    setCategoryDraft([]);
    setMessage("");
    setError("");
    window.history.pushState(
      null,
      "",
      `/admin/problems?problemType=${problemType}&sort=${selectedSort}`,
    );
    await reload("", 1, problemType, selectedSort);
  }

  async function selectSort(sort: ProblemListSort) {
    resetProblemDrag();
    setSelectedSort(sort);
    setMessage("");
    setError("");
    const query = new URLSearchParams({
      problemType: selectedProblemType,
      sort,
    });
    if (selectedCategory) query.set("category", selectedCategory);
    window.history.pushState(null, "", `/admin/problems?${query}`);
    await reload(selectedCategory, 1, selectedProblemType, sort);
  }

  async function goPage(page: number) {
    const query = new URLSearchParams();
    setMessage("");
    setError("");
    if (selectedCategory) query.set("category", selectedCategory);
    query.set("problemType", selectedProblemType);
    query.set("sort", selectedSort);
    query.set("page", String(page));
    query.set("pageSize", String(pagination.pageSize));
    window.history.pushState(null, "", `/admin/problems?${query}`);
    await reload(selectedCategory, page, selectedProblemType, selectedSort);
  }

  function updateField<K extends keyof ProblemForm>(key: K, value: ProblemForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateTestCase(index: number, patch: Partial<TestCaseForm>) {
    setForm((current) => ({
      ...current,
      testCases: current.testCases.map((testCase, currentIndex) =>
        currentIndex === index ? { ...testCase, ...patch } : testCase,
      ),
    }));
  }

  function updateObjectiveItem(index: number, patch: Partial<ObjectiveItem>) {
    setForm((current) => ({
      ...current,
      objectiveItems: current.objectiveItems.map((item, currentIndex) =>
        currentIndex === index ? { ...item, ...patch } : item,
      ),
    }));
  }

  function updateObjectiveKind(index: number, kind: "choice" | "judge") {
    updateObjectiveItem(index, {
      ...createBlankObjectiveItem(kind),
      stem: form.objectiveItems[index]?.stem ?? "",
      score: form.objectiveItems[index]?.score ?? 1,
    });
  }

  function updateObjectiveOption(
    itemIndex: number,
    optionIndex: number,
    text: string,
  ) {
    const item = form.objectiveItems[itemIndex];
    if (!item) return;
    updateObjectiveItem(itemIndex, {
      options: item.options.map((option, currentIndex) =>
        currentIndex === optionIndex ? { ...option, text } : option,
      ),
    });
  }

  function addObjectiveOption(itemIndex: number) {
    const item = form.objectiveItems[itemIndex];
    if (!item || item.kind === "judge" || item.options.length >= 4) return;
    updateObjectiveItem(itemIndex, {
      options: [
        ...item.options,
        {
          label: String.fromCharCode(65 + item.options.length),
          text: "",
        },
      ],
    });
  }

  function removeObjectiveOption(itemIndex: number, optionIndex: number) {
    const item = form.objectiveItems[itemIndex];
    if (!item || item.kind === "judge" || item.options.length <= 2) return;
    const options = item.options
      .filter((_, currentIndex) => currentIndex !== optionIndex)
      .map((option, currentIndex) => ({
        ...option,
        label: String.fromCharCode(65 + currentIndex),
      }));
    updateObjectiveItem(itemIndex, {
      options,
      answer: options.some((option) => option.label === item.answer)
        ? item.answer
        : "A",
    });
  }

  async function editProblem(problem: ProblemItem) {
    setError("");
    setMessage("");
    setLoadingProblemId(problem.id);
    try {
      const response = await fetch(`/api/admin/problems/${problem.id}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.problem) {
        setError(data.error ?? "题目详情加载失败");
        return;
      }

      const detail = data.problem as ProblemDetail;
      const problemType: ProblemType =
        detail.problemType === "objective" ? "objective" : "programming";
      const objectiveItems = parseObjectiveItems(detail.objectiveItems);
      setEditingId(detail.id);
      setForm({
        title: detail.title,
        description: detail.description,
        inputDescription: detail.inputDescription,
        outputDescription: detail.outputDescription,
        sampleInput: detail.sampleInput,
        sampleOutput: detail.sampleOutput,
        dataRange: detail.dataRange ?? "",
        difficulty: detail.difficulty,
        category: detail.category,
        problemType,
        objectiveItems:
          problemType === "objective" && objectiveItems.length > 0
            ? objectiveItems
            : [createBlankObjectiveItem()],
        testCases: detail.testCases.length
          ? detail.testCases.map((item) => ({
              id: item.id,
              input: item.input,
              output: item.output,
              isSample: item.isSample,
            }))
          : [
              {
                input: detail.sampleInput,
                output: detail.sampleOutput,
                isSample: true,
              },
            ],
      });
      document.getElementById("problem-create-form")?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    } catch {
      setError("题目详情加载失败，请稍后重试");
    } finally {
      setLoadingProblemId(null);
    }
  }

  function resetForm() {
    setEditingId(null);
    setForm(createBlankProblemForm());
    setError("");
    setMessage("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateProblemForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    setPending(true);
    setError("");
    setMessage("");

    const endpoint = editingId
      ? `/api/admin/problems/${editingId}`
      : "/api/admin/problems";
    try {
      const response = await fetch(endpoint, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "保存失败");
        return;
      }

      setCategoryOptions((current) =>
        form.category
          ? Array.from(new Set([...current, form.category]))
          : current,
      );
      const successMessage = editingId ? "题目已更新" : "题目已创建";
      resetForm();
      setMessage(successMessage);
      await reload(
        selectedCategory,
        editingId ? pagination.page : 1,
        selectedProblemType,
      );
    } catch {
      setError("网络异常，保存题目失败，请检查连接后重试");
    } finally {
      setPending(false);
    }
  }

  function toggleProblem(problemId: number) {
    setSelectedIds((current) =>
      current.includes(problemId)
        ? current.filter((id) => id !== problemId)
        : [...current, problemId],
    );
  }

  function toggleCurrentPage() {
    if (allCurrentPageSelected) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(problems.map((problem) => problem.id));
  }

  async function deleteProblem(problem: ProblemItem) {
    if (
      !confirm(
        `确定要下架题目《${problem.title}》吗？下架后学生不能继续作答，但历史提交和天梯积分会完整保留。`,
      )
    ) {
      return;
    }
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/admin/problems/${problem.id}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setMessage("已下架 1 道题，历史提交和积分已保留");
        await reload();
      } else {
        setError(data.error ?? "下架题目失败");
      }
    } catch {
      setError("网络异常，下架题目失败，请检查连接后重试");
    }
  }

  async function bulkDeleteProblems() {
    if (selectedIds.length === 0) return;

    const selectedProblems = problems.filter((problem) => selectedIds.includes(problem.id));
    const confirmText =
      selectedIds.length === 1 && selectedProblems[0]
        ? `确定要下架题目《${selectedProblems[0].title}》吗？历史提交和天梯积分会保留。`
        : `确定要下架选中的 ${selectedIds.length} 道题吗？题目会从题库隐藏，但历史提交和天梯积分会完整保留。`;

    if (!confirm(confirmText)) return;

    setPending(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/admin/problems/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problemIds: selectedIds }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "批量下架失败");
        return;
      }

      setMessage(
        `已下架 ${data.archivedCount ?? data.deletedCount ?? 0} 道题，历史提交和积分已保留`,
      );
      setSelectedIds([]);
      await reload(selectedCategory, pagination.page);
    } catch {
      setError("网络异常，批量下架失败，请检查连接后重试");
    } finally {
      setPending(false);
    }
  }

  async function moveProblem(
    problem: ProblemItem,
    direction: "up" | "down",
  ) {
    if (selectedSort !== "custom" || movingProblemId !== null) return;

    setMovingProblemId(problem.id);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/problems/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemId: problem.id,
          problemType: selectedProblemType,
          direction,
          category: selectedCategory,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "调整题目顺序失败");
        return;
      }
      if (!data.moved) {
        setMessage(direction === "up" ? "已经是第一道题" : "已经是最后一道题");
        return;
      }

      const nextPosition = Number(data.position) ||
        problem.sortPosition + (direction === "up" ? -1 : 1);
      const nextPage = Math.max(
        1,
        Math.ceil(nextPosition / pagination.pageSize),
      );
      const query = new URLSearchParams({
        problemType: selectedProblemType,
        sort: "custom",
        page: String(nextPage),
        pageSize: String(pagination.pageSize),
      });
      if (selectedCategory) query.set("category", selectedCategory);
      window.history.pushState(null, "", `/admin/problems?${query}`);
      setMessage(direction === "up" ? "题目已上移" : "题目已下移");
      await reload(selectedCategory, nextPage, selectedProblemType, "custom");
    } catch {
      setError("调整题目顺序失败，请稍后重试");
    } finally {
      setMovingProblemId(null);
    }
  }

  function startProblemDrag(
    event: DragEvent<HTMLButtonElement>,
    problemId: number,
  ) {
    if (
      selectedSort !== "custom" ||
      movingProblemId !== null ||
      pending ||
      savingCurrentOrder
    ) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(problemId));
    setDraggedProblemId(problemId);
    setProblemDropTarget(null);
    // 不要在 dragstart 清空提示：提示条消失会让表格瞬间位移，
    // Chromium 会因此取消刚开始的原生拖动。
  }

  function dragProblemOver(
    event: DragEvent<HTMLTableRowElement>,
    targetProblemId: number,
  ) {
    if (
      draggedProblemId === null ||
      draggedProblemId === targetProblemId ||
      movingProblemId !== null
    ) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const placement = getDropPlacement(event);
    setProblemDropTarget((current) =>
      current?.problemId === targetProblemId && current.placement === placement
        ? current
        : { problemId: targetProblemId, placement },
    );
  }

  async function dropProblem(
    event: DragEvent<HTMLTableRowElement>,
    targetProblemId: number,
  ) {
    event.preventDefault();
    const problemId = draggedProblemId;
    const placement = getDropPlacement(event);
    resetProblemDrag();
    if (
      problemId === null ||
      problemId === targetProblemId ||
      selectedSort !== "custom" ||
      movingProblemId !== null
    ) {
      return;
    }

    const reordered = moveProblemRelative(
      problems,
      problemId,
      targetProblemId,
      placement,
    );
    if (reordered.every((problem, index) => problem.id === problems[index]?.id)) {
      return;
    }

    const pageOffset = (pagination.page - 1) * pagination.pageSize;
    setProblems(
      reordered.map((problem, index) => ({
        ...problem,
        sortPosition: pageOffset + index + 1,
        canMoveUp: pageOffset + index > 0,
        canMoveDown: pageOffset + index + 1 < pagination.total,
      })),
    );
    setMovingProblemId(problemId);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/problems/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemId,
          targetProblemId,
          placement,
          problemType: selectedProblemType,
          category: selectedCategory,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "拖动题目失败");
        await reload(
          selectedCategory,
          pagination.page,
          selectedProblemType,
          "custom",
        );
        return;
      }
      if (data.moved === false) {
        setMessage("题目位置没有变化");
        await reload(
          selectedCategory,
          pagination.page,
          selectedProblemType,
          "custom",
        );
        return;
      }
      // 当前页顺序已乐观更新，成功后无需再刷新表格；立即释放拖动状态，
      // 避免下一次抓取被无关的列表请求阻塞。
      setMessage("题目顺序已保存");
    } catch {
      setError("拖动题目失败，请稍后重试");
      await reload(
        selectedCategory,
        pagination.page,
        selectedProblemType,
        "custom",
      );
    } finally {
      setMovingProblemId(null);
    }
  }

  async function saveCurrentProblemOrder() {
    if (
      selectedSort === "custom" ||
      savingCurrentOrder ||
      movingProblemId !== null
    ) {
      return;
    }

    const scope = selectedCategory
      ? `“${selectedCategory}”分类`
      : selectedProblemType === "programming"
        ? "全部编程题"
        : "全部选择判断题";
    if (
      !confirm(
        `确定将“${problemSortLabels[selectedSort]}”保存为${scope}的自定义题序吗？学生题库会立即跟随新的顺序。`,
      )
    ) {
      return;
    }

    setSavingCurrentOrder(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/problems/order/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemType: selectedProblemType,
          category: selectedCategory,
          sort: selectedSort,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "保存当前题序失败");
        return;
      }

      const query = new URLSearchParams({
        problemType: selectedProblemType,
        sort: "custom",
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
      });
      if (selectedCategory) query.set("category", selectedCategory);
      window.history.pushState(null, "", `/admin/problems?${query}`);
      setSelectedSort("custom");
      setMessage(
        `已保存 ${Number(data.updatedCount) || 0} 道题的当前题序，学生端已同步`,
      );
      await reload(
        selectedCategory,
        pagination.page,
        selectedProblemType,
        "custom",
      );
    } catch {
      setError("保存当前题序失败，请稍后重试");
    } finally {
      setSavingCurrentOrder(false);
    }
  }

  function openCategorySort() {
    resetCategoryDrag();
    setCategoryDraft(categoryOptions);
    setCategorySortOpen(true);
    setMessage("");
    setError("");
  }

  function closeCategorySort() {
    resetCategoryDrag();
    setCategoryDraft(categoryOptions);
    setCategorySortOpen(false);
  }

  function moveCategory(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= categoryDraft.length) return;
    setCategoryDraft((current) => {
      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }

  function startCategoryDrag(
    event: DragEvent<HTMLButtonElement>,
    category: string,
  ) {
    if (categoryPending) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", category);
    setDraggedCategory(category);
    setCategoryDropTarget(null);
  }

  function dragCategoryOver(
    event: DragEvent<HTMLDivElement>,
    targetCategory: string,
  ) {
    if (
      draggedCategory === null ||
      draggedCategory === targetCategory ||
      categoryPending
    ) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const placement = getDropPlacement(event);
    setCategoryDropTarget((current) =>
      current?.category === targetCategory && current.placement === placement
        ? current
        : { category: targetCategory, placement },
    );
  }

  function dropCategory(
    event: DragEvent<HTMLDivElement>,
    targetCategory: string,
  ) {
    event.preventDefault();
    const sourceCategory = draggedCategory;
    const placement = getDropPlacement(event);
    resetCategoryDrag();
    if (sourceCategory === null || sourceCategory === targetCategory) return;

    setCategoryDraft((current) => {
      const sourceIndex = current.indexOf(sourceCategory);
      const targetIndex = current.indexOf(targetCategory);
      return moveItemRelative(current, sourceIndex, targetIndex, placement);
    });
  }

  async function saveCategoryOrder() {
    setCategoryPending(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/problems/categories/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemType: selectedProblemType,
          categories: categoryDraft,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "保存分类顺序失败");
        return;
      }
      const savedCategories = Array.isArray(data.categories)
        ? data.categories.filter(
            (category: unknown): category is string =>
              typeof category === "string" && Boolean(category.trim()),
          )
        : categoryDraft;
      setCategoryOptions(savedCategories);
      setCategoryDraft(savedCategories);
      setCategorySortOpen(false);
      setMessage("分类顺序已保存，学生题库和组卷筛选会同步使用");
    } catch {
      setError("保存分类顺序失败，请稍后重试");
    } finally {
      setCategoryPending(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_520px]">
      <section className="surface overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-ink-950/10 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.16em] text-clay">
              Problem Admin
            </p>
            <h1 className="mt-2 text-2xl font-black">题目管理</h1>
            <p className="mt-2 text-sm font-semibold text-ink-600">
              当前 {problems.length} 道题
            </p>
          </div>
          <Link className="btn btn-primary" href="/admin/problems/import">
            <FileUp size={16} />
            导入 Markdown 题目
          </Link>
        </div>
        <div className="border-b border-ink-950/10 p-5">
          <div className="flex flex-wrap gap-2">
            <CategoryButton
              active={selectedProblemType === "programming"}
              onClick={() => selectProblemType("programming")}
            >
              编程题
            </CategoryButton>
            <CategoryButton
              active={selectedProblemType === "objective"}
              onClick={() => selectProblemType("objective")}
            >
              选择判断题
            </CategoryButton>
          </div>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid min-w-52 gap-2 text-sm font-bold text-ink-800">
                管理员查看排序
                <select
                  className="field"
                  disabled={movingProblemId !== null || savingCurrentOrder}
                  onChange={(event) =>
                    void selectSort(event.target.value as ProblemListSort)
                  }
                  value={selectedSort}
                >
                  <option value="custom">自定义顺序</option>
                  <option value="title-asc">标题升序</option>
                  <option value="title-desc">标题降序</option>
                  <option value="newest">最新创建优先</option>
                  <option value="oldest">最早创建优先</option>
                </select>
              </label>
              {selectedSort !== "custom" ? (
                <button
                  className="btn btn-primary px-3 py-2"
                  disabled={savingCurrentOrder || movingProblemId !== null}
                  onClick={() => void saveCurrentProblemOrder()}
                  type="button"
                >
                  <Save size={15} />
                  {savingCurrentOrder ? "保存中" : "保存当前题序"}
                </button>
              ) : null}
            </div>
            <p className="max-w-xl text-xs font-semibold leading-5 text-ink-600">
              {selectedSort === "custom"
                ? "可拖动当前页题目快速排序；跨页继续使用上下按钮。学生端会跟随保存后的顺序。"
                : "当前是管理员预览；可将当前筛选范围的全部分页保存为自定义题序。"}
            </p>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <CategoryButton
                active={!selectedCategory}
                onClick={() => selectCategory("")}
              >
                全部
              </CategoryButton>
              {categoryOptions.map((category) => (
                <CategoryButton
                  active={selectedCategory === category}
                  key={category}
                  onClick={() => selectCategory(category)}
                >
                  {category}
                </CategoryButton>
              ))}
            </div>
            {categoryOptions.length > 1 && !categorySortOpen ? (
              <button
                className="btn btn-secondary px-3 py-2"
                onClick={openCategorySort}
                type="button"
              >
                <ListOrdered size={15} />
                调整分类顺序
              </button>
            ) : null}
          </div>
          {categorySortOpen ? (
            <div className="mt-4 border border-steel/20 bg-steel/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-black text-ink-950">分类标签顺序</h2>
                  <p className="mt-1 text-xs font-semibold text-ink-600">
                    拖动或使用上下按钮调整草稿，确认后点击保存；学生只能查看。
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn btn-secondary px-3 py-2"
                    disabled={categoryPending}
                    onClick={closeCategorySort}
                    type="button"
                  >
                    取消
                  </button>
                  <button
                    className="btn btn-primary px-3 py-2"
                    disabled={categoryPending}
                    onClick={() => void saveCategoryOrder()}
                    type="button"
                  >
                    <Save size={15} />
                    {categoryPending ? "保存中" : "保存顺序"}
                  </button>
                </div>
              </div>
              <div className="mt-4 grid max-w-2xl gap-2">
                {categoryDraft.map((category, index) => (
                  <div
                    className={`flex items-center gap-3 border border-ink-950/10 bg-white/75 px-3 py-2 transition ${
                      draggedCategory === category ? "opacity-50" : ""
                    } ${
                      categoryDropTarget?.category === category
                        ? categoryDropTarget.placement === "before"
                          ? "border-t-4 border-t-clay"
                          : "border-b-4 border-b-clay"
                        : ""
                    }`}
                    key={category}
                    onDragOver={(event) => dragCategoryOver(event, category)}
                    onDrop={(event) => dropCategory(event, category)}
                  >
                    <span className="w-7 text-center text-xs font-black text-steel">
                      {index + 1}
                    </span>
                    <button
                      aria-label={`拖动分类 ${category}`}
                      className="cursor-grab p-1 text-steel active:cursor-grabbing"
                      disabled={categoryPending}
                      draggable={!categoryPending}
                      onDragEnd={resetCategoryDrag}
                      onDragStart={(event) => startCategoryDrag(event, category)}
                      title="按住拖动分类"
                      type="button"
                    >
                      <GripVertical size={16} />
                    </button>
                    <span className="min-w-0 flex-1 truncate text-sm font-black text-ink-900">
                      {category}
                    </span>
                    <button
                      aria-label={`上移分类 ${category}`}
                      className="btn btn-secondary p-2"
                      disabled={index === 0 || categoryPending}
                      onClick={() => moveCategory(index, "up")}
                      title="上移分类"
                      type="button"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      aria-label={`下移分类 ${category}`}
                      className="btn btn-secondary p-2"
                      disabled={index === categoryDraft.length - 1 || categoryPending}
                      onClick={() => moveCategory(index, "down")}
                      title="下移分类"
                      type="button"
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-950/10 bg-white/45 p-5">
          <label className="inline-flex items-center gap-2 text-sm font-black text-ink-800">
            <input
              checked={allCurrentPageSelected}
              disabled={problems.length === 0}
              onChange={toggleCurrentPage}
              type="checkbox"
            />
            全选当前页
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-ink-600">
              已选择 {selectedIds.length} 道题
            </span>
            <button
              className="btn btn-danger px-3 py-2"
              disabled={selectedIds.length === 0 || pending}
              onClick={bulkDeleteProblems}
              type="button"
            >
              <Trash2 size={15} />
              批量下架
            </button>
          </div>
        </div>
        {message ? (
          <p className="mx-5 mt-4 border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
            {message}
          </p>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse">
            <thead>
              <tr className="border-b border-ink-950/10 bg-white/55 text-left">
                <th className="table-head px-5 py-3">选择</th>
                <th className="table-head px-5 py-3">排序</th>
                <th className="table-head px-5 py-3">标题</th>
                <th className="table-head px-5 py-3">难度</th>
                <th className="table-head px-5 py-3">分类</th>
                <th className="table-head px-5 py-3">题型</th>
                <th className="table-head px-5 py-3">测试点 / 小题</th>
                <th className="table-head px-5 py-3">提交</th>
                <th className="table-head px-5 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {problems.map((problem) => (
                <tr
                  className={`border-b transition ${
                    draggedProblemId === problem.id ? "opacity-50" : ""
                  } ${
                    problemDropTarget?.problemId === problem.id
                      ? problemDropTarget.placement === "before"
                        ? "border-t-4 border-t-clay border-b-ink-950/10 bg-clay/5"
                        : "border-b-4 border-b-clay bg-clay/5"
                      : "border-b-ink-950/10"
                  }`}
                  key={problem.id}
                  onDragOver={(event) => dragProblemOver(event, problem.id)}
                  onDrop={(event) => void dropProblem(event, problem.id)}
                >
                  <td className="px-5 py-4">
                    <input
                      aria-label={`选择题目 ${problem.title}`}
                      checked={selectedIds.includes(problem.id)}
                      onChange={() => toggleProblem(problem.id)}
                      type="checkbox"
                    />
                  </td>
                  <td className="px-5 py-4">
                    {selectedSort === "custom" ? (
                      <div className="flex items-center gap-2">
                        <button
                          aria-label={`拖动题目 ${problem.title}`}
                          className="cursor-grab p-1 text-steel active:cursor-grabbing"
                          disabled={
                            movingProblemId !== null ||
                            pending ||
                            savingCurrentOrder
                          }
                          draggable={
                            movingProblemId === null &&
                            !pending &&
                            !savingCurrentOrder
                          }
                          onDragEnd={resetProblemDrag}
                          onDragStart={(event) =>
                            startProblemDrag(event, problem.id)
                          }
                          title="按住拖动（仅当前页）"
                          type="button"
                        >
                          <GripVertical size={16} />
                        </button>
                        <span className="min-w-8 text-center text-xs font-black text-steel">
                          #{problem.sortPosition}
                        </span>
                        <button
                          aria-label={`上移题目 ${problem.title}`}
                          className="btn btn-secondary p-2"
                          disabled={
                            !problem.canMoveUp ||
                            movingProblemId !== null ||
                            pending ||
                            savingCurrentOrder
                          }
                          onClick={() => void moveProblem(problem, "up")}
                          title="上移题目"
                          type="button"
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          aria-label={`下移题目 ${problem.title}`}
                          className="btn btn-secondary p-2"
                          disabled={
                            !problem.canMoveDown ||
                            movingProblemId !== null ||
                            pending ||
                            savingCurrentOrder
                          }
                          onClick={() => void moveProblem(problem, "down")}
                          title="下移题目"
                          type="button"
                        >
                          <ArrowDown size={14} />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs font-semibold text-ink-500">
                        临时查看
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 font-black">{problem.title}</td>
                  <td className="px-5 py-4 text-sm font-semibold text-ink-700">
                    {problem.difficulty}
                  </td>
                  <td className="px-5 py-4 text-sm font-semibold text-ink-700">
                    {problem.category}
                  </td>
                  <td className="px-5 py-4">
                    <ProblemTypeBadge type={problem.problemType} />
                  </td>
                  <td className="px-5 py-4 text-sm font-semibold text-ink-700">
                    {problem.itemCount}
                  </td>
                  <td className="px-5 py-4 text-sm font-semibold text-ink-700">
                    <Link
                      className="font-black text-steel underline-offset-4 hover:text-clay hover:underline"
                      href={`/admin/submissions?problemId=${problem.id}`}
                      title={`查看《${problem.title}》的提交记录`}
                    >
                      {problem.submissions ?? problem._count?.submissions ?? 0}
                    </Link>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <button
                        className="btn btn-secondary px-3 py-2"
                        disabled={loadingProblemId !== null || pending}
                        onClick={() => void editProblem(problem)}
                        type="button"
                      >
                        <Pencil size={15} />
                        {loadingProblemId === problem.id ? "加载中" : "编辑"}
                      </button>
                      <button
                        className="btn btn-danger px-3 py-2"
                        onClick={() => deleteProblem(problem)}
                        type="button"
                      >
                        <Trash2 size={15} />
                        下架
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {problems.length === 0 ? (
                <tr>
                  <td
                    className="px-5 py-12 text-center text-sm font-semibold text-ink-600"
                    colSpan={9}
                  >
                    当前分类下还没有题目。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-950/10 p-5 text-sm font-semibold text-ink-700">
          <span>
            共 {pagination.total} 条，每页 {pagination.pageSize} 条，第 {pagination.page} / {pagination.totalPages} 页
          </span>
          <div className="flex gap-2">
            <button
              className="btn btn-secondary px-3 py-2"
              disabled={pagination.page <= 1}
              onClick={() => goPage(pagination.page - 1)}
              type="button"
            >
              上一页
            </button>
            <button
              className="btn btn-secondary px-3 py-2"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => goPage(pagination.page + 1)}
              type="button"
            >
              下一页
            </button>
          </div>
        </div>
      </section>

      <ProblemEditorForm
        addObjectiveOption={addObjectiveOption}
        editingId={editingId}
        error={error}
        form={form}
        pending={pending}
        removeObjectiveOption={removeObjectiveOption}
        resetForm={resetForm}
        save={save}
        updateField={updateField}
        updateObjectiveItem={updateObjectiveItem}
        updateObjectiveKind={updateObjectiveKind}
        updateObjectiveOption={updateObjectiveOption}
        updateTestCase={updateTestCase}
      />
    </div>
  );
}
