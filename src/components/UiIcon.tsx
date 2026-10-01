import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BookOpen,
  BrainCircuit,
  ChartNoAxesCombined,
  ClipboardList,
  FileSearch,
  FileText,
  FlaskConical,
  Gift,
  GraduationCap,
  KeyRound,
  Megaphone,
  MessageSquare,
  RotateCcw,
  Ruler,
  Send,
  Settings2,
  Timer,
  Trophy,
  Upload,
  UsersRound,
} from "lucide-react";

const icons = {
  ai: BrainCircuit,
  announcement: Megaphone,
  assignment: ClipboardList,
  auth: KeyRound,
  empty: FileSearch,
  exam: Timer,
  feedback: MessageSquare,
  home: GraduationCap,
  import: Upload,
  input: ArrowDownToLine,
  leaderboard: Trophy,
  learning: ChartNoAxesCombined,
  output: ArrowUpFromLine,
  practice: BookOpen,
  problem: FileText,
  range: Ruler,
  review: RotateCcw,
  reward: Gift,
  samples: FlaskConical,
  settings: Settings2,
  submission: Send,
  users: UsersRound,
};

export type UiIconKind = keyof typeof icons;

export function UiIcon({ kind, size = 23, className }: {
  kind: UiIconKind;
  size?: number;
  className?: string;
}) {
  const Icon = icons[kind];
  return <Icon aria-hidden="true" className={className} size={size} strokeWidth={1.8} />;
}
