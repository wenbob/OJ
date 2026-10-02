# 学生首页与共用天梯视觉更新（2026-10-02）

本次仅重排学生首页；老师和管理员首页保持原布局。三端天梯复用 `LeaderboardHero`、`LeaderboardTable`、`RankTierPath` 和 `RankEmblem`，段位图片由真实积分决定，自定义头衔单独展示。

积分、排序、鉴权、正式考试、任务提醒和奖励逻辑沿用原实现；未新增 API、数据字段或迁移。本次是本地修改，服务器发布另行安排。

## 素材

使用 Codex 内置图像生成工具，透明背景，以用户已授权的王者荣耀段位视觉为参考。先生成荣耀王者样稿，再以样稿为参考生成其余七档；黄金档额外简化为鹰盔与短翼，强化层级差异。原始生成图片保留在工具默认目录，网站使用以下 320×320 WebP，合计 249284 字节。所有文件带透明 alpha 通道，保留 20px 透明边距。

| 段位 | 最低积分 | 素材 |
| --- | ---: | --- |
| 青铜学徒 | 0 | [bronze.webp](../public/ui/ranks/bronze.webp) |
| 白银新秀 | 65 | [silver.webp](../public/ui/ranks/silver.webp) |
| 黄金精英 | 130 | [gold.webp](../public/ui/ranks/gold.webp) |
| 铂金高手 | 260 | [platinum.webp](../public/ui/ranks/platinum.webp) |
| 钻石强者 | 455 | [diamond.webp](../public/ui/ranks/diamond.webp) |
| 星耀大师 | 715 | [star.webp](../public/ui/ranks/star.webp) |
| 最强王者 | 1040 | [king.webp](../public/ui/ranks/king.webp) |
| 荣耀王者 | 1560 | [glory.webp](../public/ui/ranks/glory.webp) |

图片由 `RankEmblem` 直接加载，避免图片代理增加开销；首次加载和失败时使用原有盾牌/王冠回退。大图、领奖台、列表和成长路径共用同一份素材。

## 展示与交互

- 学生首页：一个开始刷题入口，个人段位、积分、排名和唯一通过题数，紧凑前三名；仅未完成任务显示专项卡片。公告支持完整展开，考试、错题本、奖励和提交使用紧凑入口。
- 共用天梯：冠军居中且徽章最大，个人晋级目标、真实积分差、定位到我、八档成长路径和当前行强调；同分说明不承诺加分必然反超。老师仅显示查看学生入口，管理员保留头衔管理入口。
- 原生链接保留 Enter、Ctrl 点击和新标签页。定位选择当前可见的桌面行或手机卡片并转移焦点；减少动态效果设置关闭平滑滚动与入场动效。

## 验证记录

隔离数据库 `prisma/e2e.db` 的浏览器验收覆盖首页及三端天梯 320、768、1280、1440px，共 22 个响应式检查；主体无横向溢出。长用户名曾撑宽手机网格并裁掉积分，已用 `minmax(0, 1fr)`、`min-width: 0` 和固定积分列修复，并逐行检查 320px 下积分实际位置，避免仅靠页面滚动宽度漏检。已核对八档真实积分对应图片、三端领奖台一致、同分、零积分、最高段位、长用户名、公告展开、Enter/Ctrl 新标签页、手机/桌面定位、图片失败回退、减少动态效果、专项 1/2 进度、强制提醒与完成任务隐藏、0/1/2 人榜单。另检查 1280px 单人冠军居中及双人领奖台。

可重复的关键回归位于 `e2e/student-arena.spec.ts`；详细隔离验收截图和 JSON 位于本地忽略目录 `tmp/student-arena-preview/`。截图内账号和积分是测试数据。

质量检查：124 个测试文件、667 项单元/集成测试通过；18 项端到端回归通过；`npx tsc --noEmit`、`npm run lint` 和 `npm run build` 通过。顶栏首屏徽章采用 eager 加载，榜单后续小图保持 lazy；最终加载调整与手机裁切修复后，两项定向端到端回归通过，并复跑 667 项测试、lint、类型检查和构建。

## 生成提示词

下面保存每枚徽章的原始提示词，供后续视觉迭代复用；黄金档最后一次编辑提示词优先于其初稿。

### 青铜学徒

```text
Use case: stylized-concept. Asset type: one transparent game UI rank emblem. The reference image is a VISUAL STYLE REFERENCE ONLY for a coherent eight-tier 王者荣耀 / Honor of Kings medal family authorized by the user. Generate a NEW lower-tier subject, not a copy of the same ornate glory medal: BRONZE / 青铜学徒, lowest tier: a compact sturdy burnished copper and bronze shield crest, understated abstract horned helmet at center, two short bronze side flanges, small amber inset, no large wings or crown. Bold simple sculpted silhouette, dignified beginner medal. Match the reference's frontal symmetry, polished sculpted metal, fine bevels, darker recesses, upper-left studio highlights and premium 3D Chinese MOBA ranked emblem aesthetic. One isolated centered emblem occupies about 78% of a square canvas, all edges stay inside generous transparent margin. Clearly recognizable at 40px. Actual fully transparent alpha background. No backdrop, ground plane, framed card, outside cast shadow, letters, text, numbers, logo, watermark, extra objects, floating fragments or particle effects. Jewel glow must remain restrained and contained.
```

### 白银新秀

```text
Use case: stylized-concept. Asset type: one transparent game UI rank emblem. The reference image is a VISUAL STYLE REFERENCE ONLY for a coherent eight-tier 王者荣耀 / Honor of Kings medal family authorized by the user. Generate a NEW lower-tier subject, not a copy of the same ornate glory medal: SILVER / 白银新秀: a polished cool silver shield with small layered silver winglets, crisp sculpted central helmet motif, subtle icy teal jewel, modest decoration, clearly more elaborate than bronze but without giant wings or dragon crown. Match the reference's frontal symmetry, polished sculpted metal, fine bevels, darker recesses, upper-left studio highlights and premium 3D Chinese MOBA ranked emblem aesthetic. One isolated centered emblem occupies about 78% of a square canvas, all edges stay inside generous transparent margin. Clearly recognizable at 40px. Actual fully transparent alpha background. No backdrop, ground plane, framed card, outside cast shadow, letters, text, numbers, logo, watermark, extra objects, floating fragments or particle effects. Jewel glow must remain restrained and contained.
```

### 黄金精英

```text
Use case: stylized-concept. Asset type: one transparent game UI rank emblem. The reference image is a VISUAL STYLE REFERENCE ONLY for a coherent eight-tier 王者荣耀 / Honor of Kings medal family authorized by the user. Generate a NEW lower-tier subject, not a copy of the same ornate glory medal: GOLD / 黄金精英: bright warm golden shield, sculpted angular golden hawk-like helm, two medium gold winglets and small golden crown ridge, central warm amber crystal, bold elegant silhouette, mid-tier rather than a legendary dragon crown. Match the reference's frontal symmetry, polished sculpted metal, fine bevels, darker recesses, upper-left studio highlights and premium 3D Chinese MOBA ranked emblem aesthetic. One isolated centered emblem occupies about 78% of a square canvas, all edges stay inside generous transparent margin. Clearly recognizable at 40px. Actual fully transparent alpha background. No backdrop, ground plane, framed card, outside cast shadow, letters, text, numbers, logo, watermark, extra objects, floating fragments or particle effects. Jewel glow must remain restrained and contained.
```

最后一次编辑：

```text
Edit the attached rank medal to become the GOLD rank (tier 3 of 8), a much simpler intermediate medal in the same premium Honor of Kings / 王者荣耀 ranked-game UI family. Replace the dragon, giant crown and broad full wings with one compact warm polished gold hawk-shaped helmet/shield crest, a small clear amber diamond jewel, and TWO SHORT triangular winglets per side. Important hierarchy: compact upright diamond silhouette; no dragon face, no royal crown, no long feather wings, no surrounding halo. This is GOLD, far less elaborate than KING or GLORY. Maintain identical exquisite sculpted golden metal, bevel highlights, engraving, studio light direction and centered frontal symmetrical orthographic view. All badge content fully inside a square canvas with 12% transparent margin, crisp edges, truly transparent background, no floor, no text, no numbers, no letters, no additional objects. Rich professional game interface asset, recognizable at 40 pixels.
```

### 铂金高手

```text
Use case: stylized-concept. Asset type: one transparent game UI rank emblem. The reference image is a VISUAL STYLE REFERENCE ONLY for a coherent eight-tier 王者荣耀 / Honor of Kings medal family authorized by the user. Generate a NEW lower-tier subject, not a copy of the same ornate glory medal: PLATINUM / 铂金高手: pearl-silver and platinum metal with slim gold edge detailing, a faceted emerald-green crystal centerpiece, elegant angular winglets, a compact pointed crest, stronger silhouette and premium craftsmanship. Match the reference's frontal symmetry, polished sculpted metal, fine bevels, darker recesses, upper-left studio highlights and premium 3D Chinese MOBA ranked emblem aesthetic. One isolated centered emblem occupies about 78% of a square canvas, all edges stay inside generous transparent margin. Clearly recognizable at 40px. Actual fully transparent alpha background. No backdrop, ground plane, framed card, outside cast shadow, letters, text, numbers, logo, watermark, extra objects, floating fragments or particle effects. Jewel glow must remain restrained and contained.
```

### 钻石强者

```text
Use case: stylized-concept. Asset type: one transparent game UI rank emblem. The reference image is a VISUAL STYLE REFERENCE ONLY for a coherent eight-tier 王者荣耀 / Honor of Kings medal family authorized by the user. Generate a NEW lower-tier subject, not a copy of the same ornate glory medal: DIAMOND / 钻石强者: faceted luminous icy-blue diamond held by a sharply beveled silver and pale-gold armored crest, four crystalline pointed winglets and a tall central peak, sophisticated reflective blue facets, compact symmetrical high-tier badge. Match the reference's frontal symmetry, polished sculpted metal, fine bevels, darker recesses, upper-left studio highlights and premium 3D Chinese MOBA ranked emblem aesthetic. One isolated centered emblem occupies about 78% of a square canvas, all edges stay inside generous transparent margin. Clearly recognizable at 40px. Actual fully transparent alpha background. No backdrop, ground plane, framed card, outside cast shadow, letters, text, numbers, logo, watermark, extra objects, floating fragments or particle effects. Jewel glow must remain restrained and contained.
```

### 星耀大师

```text
Use case: stylized-concept. Asset type: one transparent game UI rank emblem. The reference image is a VISUAL STYLE REFERENCE ONLY for a coherent eight-tier 王者荣耀 / Honor of Kings medal family authorized by the user. Generate a NEW lower-tier subject, not a copy of the same ornate glory medal: STAR / 星耀大师: radiant six-point violet-blue gemstone star in a golden and silver sculpted crest, elegant rising swept wings, small lavender-blue inner glow, luminous star as the unmistakable centerpiece, prestigious master-level silhouette. Match the reference's frontal symmetry, polished sculpted metal, fine bevels, darker recesses, upper-left studio highlights and premium 3D Chinese MOBA ranked emblem aesthetic. One isolated centered emblem occupies about 78% of a square canvas, all edges stay inside generous transparent margin. Clearly recognizable at 40px. Actual fully transparent alpha background. No backdrop, ground plane, framed card, outside cast shadow, letters, text, numbers, logo, watermark, extra objects, floating fragments or particle effects. Jewel glow must remain restrained and contained.
```

### 最强王者

```text
Use case: stylized-concept. Asset type: one transparent game UI rank emblem. The reference image is a VISUAL STYLE REFERENCE ONLY for a coherent eight-tier 王者荣耀 / Honor of Kings medal family authorized by the user. Generate a NEW lower-tier subject, not a copy of the same ornate glory medal: KING / 最强王者: regal gold and ivory-gold sculpted dragon-faced crest, sweeping golden wings, refined angular horned crown and deep royal-blue heart gemstone. Strong dragon identity and expanded wings; slightly fewer layers and less ornate than the reference Glory King so the highest tier remains distinguishable. Match the reference's frontal symmetry, polished sculpted metal, fine bevels, darker recesses, upper-left studio highlights and premium 3D Chinese MOBA ranked emblem aesthetic. One isolated centered emblem occupies about 78% of a square canvas, all edges stay inside generous transparent margin. Clearly recognizable at 40px. Actual fully transparent alpha background. No backdrop, ground plane, framed card, outside cast shadow, letters, text, numbers, logo, watermark, extra objects, floating fragments or particle effects. Jewel glow must remain restrained and contained.
```

### 荣耀王者

```text
Use case: stylized-concept. Asset type: a single premium transparent rank emblem for a Chinese C++ teaching platform. Generate the GLORY KING / 荣耀王者 rank badge in the distinctive Honor of Kings / 王者荣耀 ranked medal visual language; the user has authorized use of this visual identity. Frontal, symmetrical, iconic sculpted golden dragon crest with sweeping layered gold wings, ornate golden crown horns, a luminous amber gemstone at its heart, finely beveled polished metal, darker gold recesses and subtle ivory-gold highlights. Highest of a coherent eight-tier series, regal and powerful, intricately crafted yet immediately legible at 48 pixels. The shape is an emblem, not a literal animal or full dragon body. Isolated centered badge with a compact silhouette, occupies about 78% of square canvas, all wing tips remain inside with generous transparent margin. Crisp 3D game UI asset with strong shape hierarchy and refined restrained glow contained at the gemstone. Actual fully transparent alpha background, no backdrop, ground plane, framed card or outside cast shadow. No text, letters, numbers, logos, watermark, extra objects, sparkle particles or loose fragments. This will be the style reference for bronze, silver, gold, platinum, diamond, star and king badges.
```
