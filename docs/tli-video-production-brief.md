# TLI (Theme Lifecycle Intelligence) Video Production Brief

> Prepared by: Product Marketing | Date: 2026-02-08
> Product: StockMatrix TLI — stockmatrix.co.kr/themes
> Status: PRODUCTION READY

---

## Table of Contents

1. [Video Strategy Document](#1-video-strategy-document)
2. [Narrative Arc](#2-narrative-arc-storytelling-framework)
3. [Scene-by-Scene Storyboard](#3-scene-by-scene-storyboard-37-seconds)
4. [Messaging Framework](#4-messaging-framework)
5. [Appendix: Design System Reference](#appendix-design-system-reference-for-motion-designers)

---

## 1. Video Strategy Document

### 1.1 Objective

Launch TLI as the definitive lifecycle tracking tool for Korean theme stocks (테마주). Position StockMatrix as the "Bloomberg Terminal for theme stock investors" — data-dense, algorithmically rigorous, and visually commanding.

### 1.2 KPIs

| Metric | Target (30 days) | Measurement |
|--------|-------------------|-------------|
| Total views (YouTube + Reels + X) | 100,000+ | Platform analytics |
| Average watch-through rate | > 65% (short-form) | Platform retention curves |
| Click-through to /themes | > 4.5% CTR | UTM-tagged links |
| Newsletter sign-up conversion | > 2.0% of clickers | Supabase auth events |
| Social shares / saves | > 1,500 | Platform analytics |
| Brand search lift ("StockMatrix") | +30% week-over-week | Google Trends / Naver DataLab |

### 1.3 Platform Strategy

| Platform | Format | Length | Aspect Ratio | Priority |
|----------|--------|--------|--------------|----------|
| YouTube Shorts | Short-form vertical | 35-45s | 9:16 | PRIMARY |
| Instagram Reels | Short-form vertical | 30-40s | 9:16 | PRIMARY |
| X (Twitter) | Autoplay inline video | 30-37s | 1:1 or 16:9 | PRIMARY |
| YouTube (long-form) | Product demo / walkthrough | 2-3 min | 16:9 | SECONDARY |
| Naver Blog / Cafe | Embedded video + write-up | 60-90s | 16:9 | SECONDARY |
| KakaoTalk Channel | Short clip + landing link | 15-20s | 9:16 | TERTIARY |

**Primary focus: 35-second vertical video** optimized for YouTube Shorts and Instagram Reels. This single hero asset drives all other cuts.

### 1.4 Tone & Voice Guidelines

**Brand voice: "Calm authority."** Think: a senior quant explaining their system in 3 sentences. Never hype. Never "get rich quick." Never stock-bro energy.

| Attribute | DO | DO NOT |
|-----------|-----|---------|
| Confidence | "AI가 추적합니다" (AI tracks it) | "무조건 수익!" (Guaranteed returns!) |
| Precision | Exact numbers, named stages | Vague promises, unsubstantiated claims |
| Visual tone | Dark, minimal, data-forward | Bright, cluttered, meme-style |
| Typography | Monospace numbers, clean sans-serif | Decorative fonts, Comic Sans energy |
| Color palette | Black, emerald (#10B981), slate accents | Neon rainbow, red/green trading cliches |
| Music | Ambient electronic, minimal beats | Dramatic orchestral, EDM drops |
| Pacing | Deliberate reveals, breathing room | Rapid-fire text, seizure-inducing cuts |

**Reference mood**: Linear's product videos, Vercel's Ship announcements, Raycast's feature reveals. Minimal. Purposeful. Every pixel earns its place.

**Forbidden tropes**: Stock chart going up with cash emojis. "To the moon." Red/green candlestick animations. Trading floor montages. Countdown timers. Fake urgency.

---

## 2. Narrative Arc (Storytelling Framework)

### 2.1 Core Insight

Every theme stock follows a lifecycle. The investors who see the stage clearly — before the crowd — are the ones who make informed decisions. TLI is the instrument that makes lifecycle stages visible.

### 2.2 Narrative Structure

```
[HOOK: 0-3s]           Visual punch. One data point that demands attention.
[PAIN: 3-8s]           The real problem: you're always late to themes.
[REFRAME: 8-13s]       What if you could see the lifecycle in real-time?
[REVEAL: 13-20s]       TLI dashboard — the product moment.
[CREDIBILITY: 20-28s]  Score system, stages, algorithm transparency.
[PROOF: 28-33s]        Real data. Real themes. Real scores.
[CTA: 33-37s]          One clear action. No friction.
```

### 2.3 Emotional Journey

```
Curiosity ("Wait, what?")
  --> Recognition ("I've felt this pain")
    --> Intrigue ("This exists?")
      --> Trust ("The data is real")
        --> Action ("I need this")
```

### 2.4 The Hook Strategy (First 3 Seconds)

Three hook options — A/B test across platforms:

**Hook A: "The Score"**
A single lifecycle score gauge animates from 0 to 87. The number pulses amber. Text appears: "이 테마, 지금 과열입니다." (This theme is overheating right now.)

**Hook B: "The Question"**
Black screen. White monospace text types out character by character: "테마주, 지금 들어가도 될까?" (Theme stocks — is it safe to enter now?)

**Hook C: "The Timeline"**
A lifecycle curve draws itself across the screen — dormant, early, growth, peak, decay. A dot pulses at "Growth." Text: "당신의 테마는 지금 어디에?" (Where is your theme right now?)

**Recommended: Hook C** — it introduces the core concept (lifecycle) immediately and creates personal relevance ("your theme").

---

## 3. Scene-by-Scene Storyboard (37 seconds)

> Format: Vertical 9:16 (1080x1920)
> Frame rate: 60fps for UI animations, 30fps for text
> Color space: sRGB, bg-black (#000000)

---

### SCENE 1: THE HOOK (0:00 - 0:03)

**Duration:** 3 seconds

**Visual:**
- Pure black screen (0.0s - 0.3s)
- A single lifecycle curve draws itself left to right in emerald (#10B981), tracing the classic Dormant-Early-Growth-Peak-Decay shape
- Line animation: smooth easeInOut, takes 1.5 seconds
- A glowing dot appears at the "Growth" inflection point and pulses twice
- Subtle particle/grid background fades in at 10% opacity (matching the app's AnimatedBackground)

**On-screen text (Korean):**
```
당신의 테마는 지금 어디에?
```
- Font: Monospace (matching app's font-mono)
- Size: 48px, weight: 900
- Color: White (#FFFFFF), with "어디에" in emerald-400 (#34D399)
- Animation: Fade up from bottom, 0.4s ease-out
- Position: Center-bottom third of screen

**Audio:**
- Soft analog synth pad fades in (think: Tycho meets Boards of Canada)
- Single clean "ping" sound on dot pulse
- No voice-over in this scene

**Transition:** Hard cut to black (0.1s)

---

### SCENE 2: THE PAIN POINT (0:03 - 0:08)

**Duration:** 5 seconds

**Visual:**
- Black background with faint scanline effect (matching app's `matrix-scan` CSS animation, 4px horizontal lines at 4% emerald opacity)
- Three lines of text appear sequentially, each with a 0.8s stagger:

**On-screen text (Korean):**
```
Line 1: 테마 뉴스가 쏟아질 때 사면 — 이미 늦었고
Line 2: 조용해졌을 때 팔면 — 기회를 놓쳤고
Line 3: 매번 타이밍이 어긋납니다
```
- Lines 1-2: slate-400 (#94A3B8), 28px, font-mono
- Line 3: white (#FFFFFF), 32px, font-black — emphasis line
- Each line slides in from right (x: 40 -> 0, opacity: 0 -> 1)
- Line 3 has a subtle emerald underline that draws itself left to right

**Audio:**
- Ambient pad continues
- Soft mechanical keyboard click on each line reveal (subtle, not cheesy)
- Slight low-frequency rumble building tension

**Transition:** Lines dissolve simultaneously (opacity 1 -> 0, 0.3s), screen goes black

---

### SCENE 3: THE REFRAME (0:08 - 0:13)

**Duration:** 5 seconds

**Visual:**
- Split into two beats:

**Beat 1 (0:08 - 0:10):**
- Single line appears center screen:
```
만약 테마의 생명주기를 읽을 수 있다면?
```
- Color: emerald-400 (#34D399)
- Size: 36px, font-black
- Animation: Scale from 0.9 to 1.0 with subtle blur-to-sharp (like focusing a lens)

**Beat 2 (0:10 - 0:13):**
- Text dissolves. The TLI dashboard begins to materialize:
  - First: the GlassCard border draws itself (emerald-500/20 border, rounded-2xl)
  - Then: the backdrop blur fills in (slate-900/60 bg)
  - Then: the lifecycle score gauge starts its animation (circle SVG stroke drawing from 0 to score)
- This is a partial reveal — only the score gauge and stage badge are visible, the rest is still dark/blurred

**Audio:**
- Pad shifts to a slightly brighter key (conveying "possibility")
- Soft glass chime on GlassCard border draw
- Score gauge "filling" has a quiet electronic sweep sound

**Transition:** Smooth zoom-out (scale 1.2 -> 1.0) to reveal full dashboard

---

### SCENE 4: THE PRODUCT REVEAL (0:13 - 0:20)

**Duration:** 7 seconds — the centerpiece scene

**Visual:**
- Full TLI detail page revealed in its actual UI:
  - DetailHeader with theme name (e.g., "반도체"), StageBadge ("성장" in sky-blue), and LifecycleScore gauge (score: 73)
  - Keyword tags appear one by one with staggered animation (matching the app's actual `delay: i * 0.05` pattern)
  - MetricGrid numbers count up to their values
  - ScoreComponents bar chart fills in from left to right

**Sequence within scene:**
1. (0:13-0:15) Header area materializes: theme name + score gauge + stage badge
2. (0:15-0:17) Score components animate in. The "주도 요인" (dominant factor) insight box highlights with emerald border glow
3. (0:17-0:20) Camera (virtual) pans down to lifecycle curve. The curve draws itself with data points appearing as glowing dots. Comparison overlay lines draw in a different color (sky-400 for historical theme comparison)

**On-screen text overlay:**
```
(0:15) 4가지 지표. 1개의 점수.
(0:18) AI가 매일 추적합니다.
```
- Position: Top-left corner, small (20px), font-mono, slate-300
- Appears and fades with 0.5s duration

**Key UI elements that MUST be visible:**
- The circular score gauge with animated fill (this is the hero element)
- Stage badge with color coding (emerald for Early, sky for Growth, amber for Peak, red for Decay)
- The "주도 요인" insight box with Sparkles icon
- The lifecycle curve with smooth line drawing

**Audio:**
- Beat drops softly — minimal electronic percussion joins the pad
- Data "whoosh" sounds as numbers count up (very subtle, think Stripe's checkout sounds)
- Curve drawing has a smooth "sweep" sound

**Transition:** Crossfade with slight scale-down

---

### SCENE 5: THE SYSTEM CREDIBILITY (0:20 - 0:28)

**Duration:** 8 seconds

**Visual:**
- Split into info cards that appear in a 2x2 grid, each card using the GlassCard style (rounded-2xl, emerald-500/20 border, slate-900/60 bg, backdrop-blur):

**Card 1 (top-left, appears at 0:20):**
```
관심도 40%
```
Icon: Activity (line chart icon)
Subtitle: 네이버 검색 트렌드 기반
Bar fills to 40% in emerald

**Card 2 (top-right, appears at 0:21):**
```
뉴스 모멘텀 25%
```
Icon: Newspaper
Subtitle: 뉴스 빈도 및 가속도
Bar fills to 25% in sky-blue

**Card 3 (bottom-left, appears at 0:22):**
```
감성 분석 20%
```
Icon: Brain
Subtitle: AI 뉴스 감성 점수
Bar fills to 20% in violet

**Card 4 (bottom-right, appears at 0:23):**
```
변동성 15%
```
Icon: TrendingUp
Subtitle: 관련주 주가 변동
Bar fills to 15% in amber

**Hold grid for 2 seconds (0:24-0:26)**

**Then (0:26-0:28):**
Grid cards slide out. Stage pipeline appears — 5 connected dots on a horizontal line:
```
[관심 없음] → [초기] → [성장] → [과열] → [말기]
```
- Each dot has its stage color (slate, emerald, sky, amber, red)
- Dots illuminate sequentially left to right, like a status indicator
- The "성장" dot pulses larger and brighter to show "you are here" concept

**On-screen text overlay:**
```
(0:26) 5단계 생명주기 분류
```
- Center-bottom, 28px, font-mono, white

**Audio:**
- Each card appearance has a soft "pop" sound
- Stage dots illuminating: sequential ascending tones (like a brief musical scale)
- Clean, clinical feel — "this is a system, not a toy"

**Transition:** Stage pipeline shrinks to center and fades

---

### SCENE 6: SOCIAL PROOF / LIVE DATA (0:28 - 0:33)

**Duration:** 5 seconds

**Visual:**
- The TLI themes list page (테마 트래커) scrolls into view:
  - Header shows "테마 트래커" with the emerald accent bar
  - Market pulse indicator showing current status (e.g., "성장 주도" in sky-blue with Activity icon)
  - StatsOverview bar with real numbers
  - Theme cards scrolling vertically — each showing:
    - Theme name
    - Score with gauge
    - Stage badge with color
    - Sparkline trend

**Key visual beats:**
1. (0:28-0:30) Dashboard scrolls at moderate speed showing 6-8 themes. Numbers are REAL production data. No mockups.
2. (0:30-0:31) Auto-scroll pauses on one theme. Score pulses.
3. (0:31-0:33) A finger/cursor taps the theme card. Transition animation into detail page (matching the app's actual page transition).

**On-screen text overlay (0:29):**
```
실시간 추적 중인 테마 40+
```
- Top-right corner, small badge style
- emerald-400 text, emerald-500/10 bg, emerald-500/20 border (matching app's pill style)

**Audio:**
- Scrolling has a soft "paper slide" feel
- Beat maintains but slightly quieter — letting the data speak

**Transition:** Theme detail page zooms in, becomes full screen briefly, then scales down

---

### SCENE 7: CTA (0:33 - 0:37)

**Duration:** 4 seconds

**Visual:**
- Clean black background
- Logo or wordmark: "StockMatrix" — clean, white, centered
- Below it, the tagline appears:

**On-screen text (Korean):**
```
Primary:   테마의 온도를 읽다
Secondary: stockmatrix.co.kr/themes
```
- "테마의 온도를 읽다": 40px, font-black, white. "온도" in emerald-400
- URL: 24px, font-mono, slate-400, appears 0.5s after tagline
- Both center-aligned

**Final beat (0:36-0:37):**
- The lifecycle score gauge from Scene 3 appears small in the corner, score ticking up by 1 point — implying "the system is always running"
- Subtle emerald glow pulse on the entire frame border (0.5s)

**Audio:**
- Music resolves to a clean final chord
- Soft "power on" hum that fades to silence
- No voice-over — let the visual breathe

**End frame holds for 0.5s on black with URL**

---

## 4. Messaging Framework

### 4.1 Primary Headline

```
테마의 온도를 읽다
```
Translation: "Read the temperature of themes"
Rationale: "온도" (temperature) is a concept Korean investors already use colloquially ("시장 온도" = market temperature). This connects TLI's lifecycle scoring to existing mental models while elevating it with precision.

### 4.2 Alternative Headlines (for A/B testing)

| Variant | Korean | Use case |
|---------|--------|----------|
| A (primary) | 테마의 온도를 읽다 | Hero headline, brand-level |
| B (problem-forward) | 테마주, 아직도 감으로 하세요? | Ads, pain-point emphasis |
| C (system-forward) | 4가지 지표. 5단계 분류. AI가 매일 추적합니다. | Feature-focused, X/Twitter |
| D (FOMO-free) | 테마 진입 타이밍, 데이터로 판단하세요 | Newsletter CTA, rational appeal |
| E (curiosity) | 당신의 테마는 지금 어디에? | Social hooks, Reels caption |

### 4.3 Supporting Copy Lines

**For product pages / landing:**
```
AI가 분석하는 한국 주식시장 테마 생명주기.
관심도, 뉴스 모멘텀, 감성, 변동성 — 4가지 축으로 테마의 현재 위치를 추적합니다.
```

**For social captions (short):**
```
테마주 타이밍, 더 이상 뉴스 속도에 의존하지 마세요.
AI가 매일 계산하는 생명주기 점수로 판단하세요.
```

**For data-driven audiences:**
```
관심도(40%) + 뉴스 모멘텀(25%) + 감성 분석(20%) + 변동성(15%)
= 0~100 생명주기 점수 → 5단계 자동 분류
```

### 4.4 Hashtags

**Primary set (always include):**
```
#테마주 #테마분석 #StockMatrix #생명주기점수 #AI주식분석
```

**Secondary set (platform-dependent):**
```
#주식 #주식투자 #테마주분석 #데이터투자 #퀀트분석 #주식AI #한국주식 #코스피 #코스닥
```

**Niche/community set:**
```
#반도체테마 #2차전지테마 #AI테마 #로봇테마 #바이오테마
```

### 4.5 Platform-Specific Captions

**YouTube Shorts:**
```
테마주, 아직도 감으로 타이밍 잡으세요?

AI가 매일 계산하는 생명주기 점수 —
관심도, 뉴스, 감성, 변동성 4가지 축으로
테마의 현재 단계를 자동 분류합니다.

지금 바로 확인하세요:
stockmatrix.co.kr/themes

#테마주 #테마분석 #StockMatrix #AI주식분석 #생명주기점수
```

**Instagram Reels:**
```
당신의 테마는 지금 어디에?

초기 → 성장 → 과열 → 말기
AI가 추적하는 실시간 테마 생명주기

stockmatrix.co.kr/themes

#테마주 #테마분석 #StockMatrix #주식 #데이터투자
```

**X (Twitter):**
```
테마주 타이밍을 데이터로 판단하세요.

4가지 지표 → 1개의 점수 → 5단계 분류

관심도 40% | 뉴스 모멘텀 25% | 감성 20% | 변동성 15%

AI가 매일 추적하는 테마 생명주기:
stockmatrix.co.kr/themes

#테마주 #StockMatrix
```

**Naver Blog / Cafe post intro:**
```
[StockMatrix] AI 테마 생명주기 추적기 출시

테마주 투자에서 가장 어려운 것 — 타이밍.
"지금 들어가도 되나?" "이미 늦은 건 아닌가?"

StockMatrix TLI는 4가지 정량 지표(관심도, 뉴스 모멘텀, AI 감성 분석, 변동성)를
종합하여 0~100 생명주기 점수를 산출하고, 테마를 5단계로 자동 분류합니다.

매일 업데이트되는 실시간 데이터 기반 분석으로,
감이 아닌 데이터로 테마의 현재 위치를 파악하세요.
```

---

## Appendix: Design System Reference (for Motion Designers)

### Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| bg-black | #000000 | Primary background |
| emerald-500 | #10B981 | Primary accent, Early stage |
| emerald-400 | #34D399 | Text accent, highlight |
| sky-500 | #0EA5E9 | Growth stage |
| sky-400 | #38BDF8 | Growth text |
| amber-500 | #F59E0B | Peak stage |
| amber-400 | #FBBF24 | Peak text |
| red-500 | #EF4444 | Decay stage |
| red-400 | #F87171 | Decay text |
| orange-500 | #F97316 | Reigniting stage |
| slate-900 | #0F172A | Card backgrounds (60% opacity) |
| slate-800 | #1E293B | Borders, subtle backgrounds |
| slate-700 | #334155 | Dividers (40% opacity) |
| slate-500 | #64748B | Dormant stage, muted text |
| slate-400 | #94A3B8 | Secondary text |

### GlassCard Component Spec

```
border-radius: 16px (rounded-2xl)
border: 1px solid rgba(16, 185, 129, 0.2)   /* emerald-500/20 */
background: rgba(15, 23, 42, 0.6)            /* slate-900/60 */
backdrop-filter: blur(24px)                   /* backdrop-blur-xl */
```

### Typography

| Element | Font | Size | Weight | Color |
|---------|------|------|--------|-------|
| Page title | System sans | 36-48px | 900 (black) | White |
| Score number | Monospace | 60px (lg gauge) | 900 (black) | White |
| Stage label | System sans | 14-16px | 600 | Stage color |
| Metric labels | Monospace | 10-12px | 400 | slate-400/500 |
| Body text | System sans | 14px | 400 | slate-400 |
| Keyword tags | Monospace | 10px | 400 | slate-400 (hover: emerald-400) |

### Animation Specs (from codebase)

| Element | Duration | Easing | Delay pattern |
|---------|----------|--------|--------------|
| Page fade-in | 0.6s | default | — |
| Score gauge fill | 1.5s | easeOut | 0.3s initial delay |
| Score number scale | 0.5s | default | 0.3s |
| Keyword tags | 0.3s | default | i * 0.05s (stagger) |
| Card slide-in | 0.4-0.6s | default | 0.1-0.2s increments |
| Change pill slide | 0.4s | default | 0.4-0.5s |
| Scanline background | 8s loop | linear | infinite |

### Lifecycle Score Gauge SVG Spec

```
Dimensions: 160x160 (lg size)
Stroke width: 10px
Track color: #1E293B (slate-800)
Progress color: Stage-dependent color
Stroke linecap: round
Rotation: -90deg (starts at top)
Animation: strokeDashoffset from circumference to (circumference * (1 - score/100))
```

### Stage Badge Spec

```
Shape: pill (rounded-full)
Border: 1px solid, stage color at 30% opacity
Background: stage color at 20% opacity
Text: stage color at full
Box shadow: 0 0 12px (stage color at ~12% opacity)
Icons: Minus (Dormant), Pulse dot (Early), TrendingUp (Growth), Flame (Peak), TrendingDown (Decay), Zap (Reigniting)
```

### Background Effects

**Animated Background:** Particle/grid system (component: `AnimatedBackground`)

**Scanline Overlay:**
```css
position: fixed;
opacity: 0.04;
background: linear-gradient(transparent 50%, rgba(16, 185, 129, 0.04) 50%);
background-size: 100% 4px;
animation: matrix-scan 8s linear infinite;
```

---

## Production Notes

### Recording Guidelines

1. **Use real production data.** Do not mock up fake theme names or scores. Record the actual `/themes` page with live data. Authenticity is the product's strongest differentiator.

2. **Screen recordings** should be captured at 2x resolution (2160x3840 for 9:16) and downscaled in post. Use a clean browser with no extensions, bookmarks bar hidden, and a controlled window size.

3. **The score gauge animation is the "hero moment."** It must feel as satisfying as a progress bar completing. Give it space. Do not rush past it.

4. **Stage colors are sacred.** Never use Growth's sky-blue for a Peak theme, or Peak's amber for Growth. The color system IS the product language.

5. **No stock photography.** No generic "investor looking at phone" images. No candlestick chart stock footage. The product UI IS the visual content.

### Music Brief for Composer/Sound Designer

- **Genre:** Ambient electronic, minimal techno influences
- **Tempo:** 90-100 BPM (calm but purposeful, not sleepy)
- **References:** Tycho "Awake," Rival Consoles "Articulation," Kiasmos "Blurred"
- **Key instruments:** Clean analog synths, soft sub-bass, minimal percussion (hi-hats only, no snare), glass/metallic textures for UI sounds
- **Arc:** Starts atmospheric and sparse, gains subtle momentum at Scene 4 (product reveal), resolves cleanly at CTA
- **No:** Dramatic builds, dubstep drops, stock music "corporate inspiration" vibes
- **Duration:** 37-40 seconds, with clean fade-out

### Delivery Specs

| Asset | Resolution | Format | Frame Rate |
|-------|-----------|--------|------------|
| YouTube Shorts / Reels | 1080x1920 | H.264 MP4 | 60fps |
| X (Twitter) 16:9 | 1920x1080 | H.264 MP4 | 30fps |
| X (Twitter) 1:1 | 1080x1080 | H.264 MP4 | 30fps |
| YouTube long-form | 3840x2160 | H.264 MP4 | 60fps |
| Thumbnail (YT Shorts) | 1080x1920 | PNG | — |
| Thumbnail (YT long) | 2560x1440 | PNG | — |
| GIF teaser (X) | 480x480 | GIF | 15fps, <5MB |

---

## Version Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-08 | Initial production brief |
