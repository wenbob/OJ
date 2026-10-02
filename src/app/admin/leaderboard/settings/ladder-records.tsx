import { AcademyEmptyState } from "@/components/AcademyEmptyState";
import { UiBadge } from "@/components/UiBadge";
import { POINT_ADJUSTMENT_MODE_LABELS, type PointAdjustmentView } from "@/lib/ladderShared";

function RecordAmount({ record }: { record: PointAdjustmentView }) {
  return <strong className={`data-number whitespace-nowrap ${record.amount > 0 ? "text-emerald-700" : "text-red-700"}`}>{record.amount > 0 ? "+" : ""}{record.amount}</strong>;
}
function recordTime(value: string) { return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }); }
export function AdjustmentRecords({ records }: { records: PointAdjustmentView[] }) {
  if (!records.length) return <AcademyEmptyState compact title="暂无调分记录" description="管理员保存加分、扣分或设定总分后，记录会显示在这里。" />;
  return <>
    <div className="mt-5 space-y-3 md:hidden">{records.map((record) => <article className="min-w-0 rounded-[7px] border border-ink-950/10 p-4" data-adjustment-id={record.id} key={record.id}>
      <div className="flex min-w-0 items-center justify-between gap-3"><h3 className="min-w-0 break-words font-bold">{record.studentUsername}{record.studentId === null ? <span className="ml-2 text-xs font-normal text-steel">账号已删除</span> : null}</h3><RecordAmount record={record} /></div>
      <div className="mt-2 flex flex-wrap items-center gap-2"><UiBadge tone={record.amount > 0 ? "success" : "danger"}>{POINT_ADJUSTMENT_MODE_LABELS[record.mode]}</UiBadge><span className="data-number text-sm">{record.beforePoints} → {record.afterPoints} 分</span></div>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{record.reason}</p>
      <p className="mt-3 break-words text-xs leading-5 text-steel">{record.administratorUsername} · {recordTime(record.createdAt)}</p>
    </article>)}</div>
    <div className="mt-5 hidden overflow-x-auto md:block"><table className="w-full min-w-[900px] text-left text-sm"><thead><tr className="table-head border-b border-ink-950/10"><th className="p-3">学生</th><th className="p-3">操作</th><th className="p-3">变动</th><th className="p-3">积分变化</th><th className="p-3">理由</th><th className="p-3">管理员</th><th className="p-3">时间</th></tr></thead><tbody>{records.map((record) => <tr className="border-b border-ink-950/10" data-adjustment-id={record.id} key={record.id}>
      <td className="max-w-40 break-words p-3 font-semibold [overflow-wrap:anywhere]">{record.studentUsername}{record.studentId === null ? <p className="mt-1 text-xs font-normal text-steel">账号已删除</p> : null}</td>
      <td className="p-3"><UiBadge tone={record.amount > 0 ? "success" : "danger"}>{POINT_ADJUSTMENT_MODE_LABELS[record.mode]}</UiBadge></td><td className="p-3"><RecordAmount record={record} /></td>
      <td className="data-number whitespace-nowrap p-3">{record.beforePoints} → {record.afterPoints}</td><td className="min-w-48 max-w-80 whitespace-pre-wrap break-words p-3 [overflow-wrap:anywhere]">{record.reason}</td><td className="max-w-40 break-words p-3 [overflow-wrap:anywhere]">{record.administratorUsername}</td><td className="whitespace-nowrap p-3 text-xs text-steel">{recordTime(record.createdAt)}</td>
    </tr>)}</tbody></table></div>
  </>;
}
