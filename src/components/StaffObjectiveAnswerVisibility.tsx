"use client";

import { Eye, EyeOff } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";

type StaffObjectiveAnswerVisibilityValue = {
  answersVisible: boolean;
  toggleAnswers: () => void;
};

const StaffObjectiveAnswerVisibilityContext =
  createContext<StaffObjectiveAnswerVisibilityValue | null>(null);

function useStaffObjectiveAnswerVisibility() {
  const value = useContext(StaffObjectiveAnswerVisibilityContext);
  if (!value) {
    throw new Error(
      "Staff objective answer controls must be used inside their provider",
    );
  }
  return value;
}

export function StaffObjectiveAnswerVisibilityProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [answersVisible, setAnswersVisible] = useState(false);
  const value = useMemo(
    () => ({
      answersVisible,
      toggleAnswers: () => setAnswersVisible((current) => !current),
    }),
    [answersVisible],
  );

  return (
    <StaffObjectiveAnswerVisibilityContext.Provider value={value}>
      {children}
    </StaffObjectiveAnswerVisibilityContext.Provider>
  );
}

export function StaffObjectiveAnswerToggle() {
  const { answersVisible, toggleAnswers } =
    useStaffObjectiveAnswerVisibility();

  return (
    <button
      aria-pressed={answersVisible}
      className="btn btn-secondary px-3 py-2 text-sm whitespace-nowrap"
      onClick={toggleAnswers}
      type="button"
    >
      {answersVisible ? <EyeOff size={15} /> : <Eye size={15} />}
      {answersVisible ? "隐藏答案" : "显示答案"}
    </button>
  );
}

export function StaffObjectiveAnswerBadge({ answer }: { answer: string }) {
  const { answersVisible } = useStaffObjectiveAnswerVisibility();
  if (!answersVisible) return null;

  return (
    <span className="border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">
      答案 {answer}
    </span>
  );
}
