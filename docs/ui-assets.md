# 竞技学院 UI 插画

2026-10-01 使用内置 `image_gen` 生成。网页采用 384 × 384 的透明 WebP，固定显示尺寸并在解码失败时回退为 Lucide 图标。生成原图保留在工具返回的原始目录；日常练习的参考原稿同时保存在 `docs/ui-preview/assets/code-scroll-source.png`。

| 入口 | 网页文件 | 字节 |
| --- | --- | --- |
| 日常刷题 | `public/ui/academy/practice.webp` | 15,678 |
| 模拟考试 | `public/ui/academy/exam.webp` | 18,266 |
| 专项练习 | `public/ui/academy/assignment.webp` | 17,420 |
| 我的奖励 | `public/ui/academy/reward.webp` | 17,046 |

总计 68,410 字节。导航、样例复制及操作按钮使用已有 Lucide 矢量图标。新插画用于首页入口、奖励与空状态，不用于评测进度或考试题面。

2026-10-02 新增 `public/ui/ranks/` 八档透明段位徽章，由 `RankEmblem` 在首页、三端天梯与管理员门槛页共用；320×320 WebP 合计 249,284 字节。段位名称和图片固定，最低积分由管理员配置。素材来源、授权语境与生成提示词统一记录在 [首页与天梯视觉说明](student-arena-ui-2026-10-02.md)，本页保留入口指针。

## 日常刷题

```text
Use case: stylized-concept. Create one refined small web UI illustration for a Chinese C++ teaching website with an existing 'competitive academy' aesthetic. Subject: a single cream-colored paper scroll or folded coding practice booklet, partially open, with only a simple dark ink </> code symbol on its front, and a small clay-orange ribbon. Style: tasteful handmade layered paper cut craft, soft bevels, fine subtle paper texture, compact silhouette, crisp edges, understated 3/4 view, not photorealistic and not glossy plastic. Palette strictly warm ivory #fffdf7, dark ink #161713, muted steel blue #4f6f88, clay orange #b66b41; small warm gold accent allowed. Consistent gentle upper-left light, very subtle contained shadow. Isolated centered subject with roughly 15% empty margin on all sides. Transparent alpha background, no backdrop, no ground plane, no border or card, no cast shadow outside the object footprint. It must remain recognizable at 80px wide, so use bold simple forms and restrained detail. Square composition. No text, letters, numbers, brand logo, watermark, or extra objects. This will be the reference illustration for a family of daily practice, exam, assignments, and rewards icons.
```

## 模拟考试

参考图片：`docs/ui-preview/assets/code-scroll-source.png`。工具参数 `transparent_background: true`。

```text
Use case: stylized-concept.
Asset type: small transparent homepage illustration for a Chinese C++ teaching platform.
Input images: Image 1 is the approved visual style reference only. Create a NEW subject, matching its handmade layered paper craft, fine paper texture, soft bevels, understated 3/4 perspective, compact silhouette, and upper-left gentle lighting.
Palette: warm ivory #fffdf7, dark ink #161713, muted steel blue #4f6f88, clay orange #b66b41, restrained warm gold accents.
Composition: one isolated centered object, square canvas, about 15 percent empty margin; recognizable at 80px wide with bold simple forms.
Constraints: actual transparent alpha background; no backdrop, ground plane, border, card, watermark, letters, numbers, brand logo or extra unrelated objects. No glossy plastic. Keep shadows contained within the silhouette.
Subject: A compact paper stopwatch made from layered ivory paper, with a steel-blue outer rim, dark simple clock hands and small clay-orange top button. No numerals or lettering. It represents a timed exam.
```


## 专项练习

参考图片：`docs/ui-preview/assets/code-scroll-source.png`。工具参数 `transparent_background: true`。

```text
Use case: stylized-concept.
Asset type: small transparent homepage illustration for a Chinese C++ teaching platform.
Input images: Image 1 is the approved visual style reference only. Create a NEW subject, matching its handmade layered paper craft, fine paper texture, soft bevels, understated 3/4 perspective, compact silhouette, and upper-left gentle lighting.
Palette: warm ivory #fffdf7, dark ink #161713, muted steel blue #4f6f88, clay orange #b66b41, restrained warm gold accents.
Composition: one isolated centered object, square canvas, about 15 percent empty margin; recognizable at 80px wide with bold simple forms.
Constraints: actual transparent alpha background; no backdrop, ground plane, border, card, watermark, letters, numbers, brand logo or extra unrelated objects. No glossy plastic. Keep shadows contained within the silhouette.
Subject: A compact ivory paper clipboard with a steel-blue backing, clay-orange clip, three simple dark checklist lines and two small checked squares. No letters or numerals. It represents teacher-assigned practice.
```


## 我的奖励

参考图片：`docs/ui-preview/assets/code-scroll-source.png`。工具参数 `transparent_background: true`。

```text
Use case: stylized-concept.
Asset type: small transparent homepage illustration for a Chinese C++ teaching platform.
Input images: Image 1 is the approved visual style reference only. Create a NEW subject, matching its handmade layered paper craft, fine paper texture, soft bevels, understated 3/4 perspective, compact silhouette, and upper-left gentle lighting.
Palette: warm ivory #fffdf7, dark ink #161713, muted steel blue #4f6f88, clay orange #b66b41, restrained warm gold accents.
Composition: one isolated centered object, square canvas, about 15 percent empty margin; recognizable at 80px wide with bold simple forms.
Constraints: actual transparent alpha background; no backdrop, ground plane, border, card, watermark, letters, numbers, brand logo or extra unrelated objects. No glossy plastic. Keep shadows contained within the silhouette.
Subject: A small CLOSED reward chest crafted from layered paper, muted steel-blue body, warm ivory lid and clay-orange bands, with a single warm gold star clasp. It represents earned practice rewards. No glowing effects, scattered coins or lettering.
```
