import { ArrowRight, SlidersHorizontal, Users } from "lucide-react";
import { NavigationLink } from "@/components/NavigationLink";
import { PageHeading } from "@/components/PageHeading";
import { RankEmblem } from "@/components/RankEmblem";

export function LeaderboardHero({ role }: { role: "student" | "teacher" | "admin" }) {
  const base = `/${role}`;
  return (
    <header className="ladder-hero">
      <div className="ladder-hero-copy">
        <p className="arena-kicker">Arena Ladder</p>
        <PageHeading className="mt-2" kind="leaderboard" size="hero">天梯竞技场</PageHeading>
        {role !== "student" ? <p className="ladder-rule">积分 = 首次通过题数 × 10 + 抽奖与翻倍奖励 + 管理员调分</p> : null}
        <div className="ladder-hero-actions">
          <NavigationLink className="btn ladder-challenge-button" href={role === "student" ? "/student/problems" : `${base}/practice`}>
            {role === "student" ? "去挑战新题" : "进入题库练习"}<ArrowRight aria-hidden="true" size={16} />
          </NavigationLink>
          {role !== "student" ? <NavigationLink className="ladder-secondary-link" href={`${base}/users`}><Users aria-hidden="true" size={16} />{role === "admin" ? "管理学生头衔" : "查看学生"}</NavigationLink> : null}
          {role === "admin" ? <NavigationLink className="ladder-secondary-link" href="/admin/leaderboard/settings"><SlidersHorizontal aria-hidden="true" size={16} />积分与段位设置</NavigationLink> : null}
        </div>
      </div>
      <div className="ladder-hero-emblem">
        <RankEmblem className="rank-emblem-hero" eager tierTitle="荣耀王者" />
        {role !== "student" ? <span>荣耀王者</span> : null}
      </div>
    </header>
  );
}
