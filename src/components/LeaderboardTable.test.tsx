import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { StudentRankingEntry } from "@/lib/ranking";
import { LeaderboardTable } from "./LeaderboardTable";

function ranking(
  rank: number,
  overrides: Partial<StudentRankingEntry> = {},
): StudentRankingEntry {
  return {
    acCount: 20 - rank,
    acceptedSubmissionCount: 30 - rank,
    customTitle: null,
    displayTitle: "黄金精英",
    points: (20 - rank) * 10,
    rank,
    tierTitle: "黄金精英",
    userId: rank,
    username: `学生${rank}`,
    ...overrides,
  };
}

describe("LeaderboardTable", () => {
  it("空榜单说明首次唯一 AC 的上榜规则", () => {
    const html = renderToStaticMarkup(<LeaderboardTable rankings={[]} />);

    expect(html).toContain("天梯正在等待第一位挑战者");
    expect(html).toContain("首次通过一道新题可获得 10 积分");
    expect(html).not.toContain("<table");
  });

  it("不足三人时只渲染已有领奖台席位", () => {
    const html = renderToStaticMarkup(
      <LeaderboardTable rankings={[ranking(1), ranking(2)]} />,
    );

    expect(html).toContain("天梯前三名");
    expect(html).toContain("学生1");
    expect(html).toContain("学生2");
    expect(html).not.toContain("学生3");
    expect(html).not.toContain("第四名及以后");
  });

  it("学生视图展示我的战绩、晋级进度和前一名积分差", () => {
    const html = renderToStaticMarkup(
      <LeaderboardTable
        currentUserId={2}
        rankings={[
          ranking(1, { points: 200 }),
          ranking(2, { points: 170, userId: 2 }),
          ranking(3, { points: 150 }),
        ]}
      />,
    );

    expect(html).toContain("我的战绩 · 第 2 名");
    expect(html).toContain("距离前一名还差 30 分");
    expect(html).toContain('role="progressbar"');
  });

  it("第四名以后同时提供移动卡片与桌面表格，并保留管理员头衔来源", () => {
    const html = renderToStaticMarkup(
      <LeaderboardTable
        rankings={[
          ranking(1),
          ranking(2),
          ranking(3),
          ranking(4, {
            customTitle: "超长但仍需完整保留的自定义头衔",
            displayTitle: "超长但仍需完整保留的自定义头衔",
          }),
        ]}
        showAdminColumns
      />,
    );

    expect(html).toContain("第四名及以后");
    expect(html).toContain("md:hidden");
    expect(html).toContain("hidden overflow-x-auto md:block");
    expect(html).toContain("管理员自定义");
    expect(html).toContain("超长但仍需完整保留的自定义头衔");
  });
});
