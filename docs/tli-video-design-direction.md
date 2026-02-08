# TLI Promotional Video -- Visual Design Direction

**Version:** 1.0
**Format:** 1920x1080 (16:9) primary, 1080x1920 (9:16) vertical cut
**Duration:** 35-42 seconds
**Frame rate:** 30fps (1050-1260 frames)
**Render engine:** After Effects / Motion / Rive -- any compositing tool that supports vector + raster layers

---

## PART 1: VISUAL STYLE GUIDE

### 1.1 Color Palette

All hex values extracted directly from the production codebase.

```
BACKGROUND SYSTEM
  bg-primary:     #000000   (true black, not #0F172A)
  bg-card:        #0F172A   at 60% opacity (slate-900/60) -- glass cards
  bg-elevated:    #1E293B   (slate-800) -- progress bar tracks, secondary surfaces
  bg-subtle:      #334155   at 30% opacity -- grid lines, faint structure

EMERALD SYSTEM (Primary -- Interest/Growth/Score)
  emerald-500:    #10B981   *** HERO COLOR -- used in 70% of UI accents ***
  emerald-400:    #34D399   (text highlights, hover states)
  emerald-glow:   rgba(16, 185, 129, 0.30)  (box-shadow glow)
  emerald-wash:   rgba(16, 185, 129, 0.05)  (background tint on cards)
  emerald-border: rgba(16, 185, 129, 0.20)  (glass card borders)

SKY SYSTEM (Secondary -- News Momentum/Growth Stage)
  sky-500:        #0EA5E9
  sky-400:        #38BDF8
  sky-glow:       rgba(14, 165, 233, 0.30)

AMBER SYSTEM (Warning -- Sentiment/Peak Stage)
  amber-500:      #F59E0B
  amber-400:      #FBBF24
  amber-glow:     rgba(245, 158, 11, 0.30)

PURPLE SYSTEM (Accent -- Volatility)
  purple-500:     #8B5CF6
  purple-400:     #A78BFA
  purple-glow:    rgba(139, 92, 246, 0.30)

RED SYSTEM (Danger -- Decay Stage/Negative)
  red-500:        #EF4444
  red-400:        #F87171

ORANGE SYSTEM (Special -- Reignition)
  orange-500:     #F97316
  orange-400:     #FB923C

NEUTRAL TEXT
  white:          #FFFFFF   (headings, primary numbers)
  slate-300:      #CBD5E1   (body text)
  slate-400:      #94A3B8   (secondary labels)
  slate-500:      #64748B   (tertiary, axis labels)
  slate-600:      #475569   (decorative, dividers)
  slate-700:      #334155   (near-invisible structure)
```

**Video-specific gradient overlays (not in app, created for video):**

```
HERO GRADIENT (background atmosphere):
  Top-left:     radial-gradient at 20% 30%, #10B981 at 8% opacity, fading to transparent
  Bottom-right: radial-gradient at 80% 70%, #0EA5E9 at 5% opacity, fading to transparent
  Center-float: radial-gradient at 50% 50%, #8B5CF6 at 3% opacity, 800px radius

SCAN LINE OVERLAY:
  Horizontal lines every 4px, 1px tall, #FFFFFF at 1.5% opacity
  Animated: translateY scrolling at 0.5px/frame downward (creates CRT monitor feel)

VIGNETTE:
  radial-gradient(ellipse at center, transparent 50%, #000000 at 100%)
  Applied at 40% opacity over entire frame
```

### 1.2 Typography

**Primary (Korean headings + numerals):**
- Font: **Pretendard** (Variable weight)
- Why: Korea's answer to SF Pro. Geometric, clean, excellent hangul. Far more intentional than Noto Sans KR. The production app uses `font-mono` extensively -- Pretendard bridges the monospace feel into a display typeface.
- Weights used: Black (900) for scores, Bold (700) for headings, Medium (500) for labels

**Monospace (Data, labels, small text):**
- Font: **JetBrains Mono** or **IBM Plex Mono**
- Why: The app is fundamentally `font-mono`. These fonts have distinctive character shapes (the zero has a dot, the one has a serif) that read as "data terminal" without being Courier-hacky.
- Weights: Bold (700) for metric values, Medium (500) for labels, Regular (400) for body

**Display (Title card / logo moment only):**
- Font: **Space Mono** or **Fira Code** (ligatures enabled)
- Used ONLY for the "TLI" logotype in Scene 1 and Scene 7 (bookend)

**Type scale for 1920x1080 frames:**

```
DISPLAY:    72-96px    (TLI logotype, Scene 1 only)
HEADING-1:  48-56px    (theme name on detail view)
HEADING-2:  32-40px    (section titles like "테마 트래커")
SCORE-XL:   120-160px  (hero score number, Scene 3)
SCORE-LG:   64-80px    (score in cards)
SCORE-MD:   40-48px    (inline scores)
BODY:       18-24px    (descriptions, labels)
CAPTION:    12-14px    (axis labels, timestamps, "가중치 40%")
MICRO:      10-11px    (tertiary metadata)
```

**Letter-spacing rules:**
- Uppercase Latin labels (e.g., "THEME SCORE", "24H"): `tracking: +0.1em`
- Korean body text: `tracking: 0` (never add tracking to hangul)
- Monospace numerals: `font-variant-numeric: tabular-nums` (columns align)

### 1.3 Grid System

**1920x1080 (Landscape -- primary deliverable):**

```
                    1920px
  |--- 80px ---|--- 1760px content area ---|--- 80px ---|
               |                            |
  Margins: 80px left/right, 60px top/bottom
  Columns: 12-column grid, 24px gutters
  Column width: (1760 - 11*24) / 12 = ~124px per column

  Safe zone: 120px inset from all edges (for TV/player chrome)

  VERTICAL RHYTHM:
  - Baseline: 8px grid
  - Section gaps: 48px (6 units)
  - Card padding: 24-32px (3-4 units)
  - Element gaps: 8-16px (1-2 units)
```

**1080x1920 (Vertical -- social cut):**

```
                    1080px
  |--- 48px ---|--- 984px content area ---|--- 48px ---|
  Margins: 48px left/right, 80px top, 120px bottom (thumb zone)
  Columns: 6-column grid, 16px gutters

  Safe zone (stories/reels): 60px top (status bar), 160px bottom (swipe-up area)
```

### 1.4 Glass Card Rendering (for video)

The production CSS is `bg-slate-900/60 backdrop-blur-xl border border-emerald-500/20 rounded-2xl`.
In video, replicate this as:

```
CARD RECIPE:
  1. Background: #0F172A at 60% opacity
  2. Blur layer: Gaussian blur 40px on content behind card
  3. Border: 1px solid rgba(16, 185, 129, 0.20)
  4. Border radius: 16px
  5. Inner shadow: inset 0 1px 0 rgba(255,255,255,0.05) (top highlight)
  6. Drop shadow: 0 2px 12px rgba(0,0,0,0.30)

HOVER STATE (for interaction demos):
  Border: 1px solid rgba(16, 185, 129, 0.30)
  Drop shadow: 0 4px 24px rgba(16,185,129,0.15), 0 0 0 1px rgba(16,185,129,0.10)
```

---

## PART 2: ANIMATION DESIGN SYSTEM

### 2.1 Easing Curves

Named curves extracted from codebase + enhanced for video.

```
STANDARD EASE-OUT:
  cubic-bezier(0.25, 0.46, 0.45, 0.94)
  Usage: Progress bars filling, elements sliding in
  Duration: 800-1200ms
  Note: This is the EXACT curve from ScoreBreakdown component

SPRING-ENTER:
  spring(stiffness: 200, damping: 20, mass: 1)
  Usage: Elements popping into view (scores, badges)
  Equivalent cubic-bezier approximation: (0.175, 0.885, 0.32, 1.275)
  Has ~5% overshoot -- feels alive without being bouncy

FAST-OUT:
  cubic-bezier(0.0, 0.0, 0.2, 1.0)
  Usage: Quick exits, elements leaving frame
  Duration: 200-400ms

SMOOTH-IN:
  cubic-bezier(0.4, 0.0, 1.0, 1.0)
  Usage: Camera movements, slow zoom-ins
  Duration: 1000-2000ms

LINEAR (data only):
  linear
  Usage: Number counting animations, scan line scrolling, particle movement
  NEVER use for UI element entrance/exit
```

### 2.2 Duration Standards

```
INSTANT:     100-150ms   Opacity flash, color change, cursor blink
FAST:        200-300ms   Tooltip appear, badge pop, small state change
MEDIUM:      400-600ms   Card entrance, element slide, section transition
STANDARD:    800-1200ms  Progress bar fill, gauge arc draw, chart line draw
SLOW:        1500-2000ms Full chart animation, lifecycle curve render
CINEMATIC:   2000-3000ms Scene transitions, camera movements
```

### 2.3 Entry Animations

**FADE-UP (Primary entrance -- used throughout app):**
```
  From: opacity: 0, translateY: +20px
  To:   opacity: 1, translateY: 0
  Duration: 600ms
  Easing: STANDARD EASE-OUT
  Source: DetailHeader, ThemesHeader, StatsOverview all use this
```

**FADE-LEFT (Secondary entrance -- list items):**
```
  From: opacity: 0, translateX: -6px
  To:   opacity: 1, translateX: 0
  Duration: 200ms per item
  Stagger: 30ms between items (capped at 300ms total delay)
  Source: NewsHeadlines article items
```

**SCALE-POP (Attention entrance -- scores, badges):**
```
  From: opacity: 0, scale: 0.5
  To:   opacity: 1, scale: 1
  Duration: 500ms
  Delay: 300ms after container enters
  Easing: SPRING-ENTER
  Source: LifecycleScore center number
```

**SLIDE-RIGHT (Metric pills):**
```
  From: opacity: 0, translateX: +20px
  To:   opacity: 1, translateX: 0
  Duration: 400ms
  Stagger: 100ms
  Source: ChangePill component
```

**WIDTH-GROW (Progress bars, pillar bars):**
```
  From: width: 0%
  To:   width: [target]%
  Duration: 800-1200ms
  Delay: index * 100ms + 300ms base
  Easing: STANDARD EASE-OUT (0.25, 0.46, 0.45, 0.94)
  Source: ScoreBreakdown, ScoreComponents, PillarBars
```

**ARC-DRAW (Circular gauge):**
```
  From: strokeDashoffset: circumference (full circle hidden)
  To:   strokeDashoffset: circumference * (1 - progress)
  Duration: 1500ms
  Easing: ease-out
  Source: LifecycleScore SVG circle
```

### 2.4 Exit Animations

**FADE-DOWN (Mirror of FADE-UP):**
```
  From: opacity: 1, translateY: 0
  To:   opacity: 0, translateY: +10px
  Duration: 300ms
  Easing: FAST-OUT
```

**DISSOLVE (Scene transitions):**
```
  From: opacity: 1
  To:   opacity: 0
  Duration: 400ms
  Overlap: 200ms with next scene entry (cross-dissolve)
```

### 2.5 Scene Transitions

**TYPE A -- GLITCH CUT:**
```
  Frame 0:    Current scene at full opacity
  Frame 1-2:  RGB channel split (R shifts +4px right, B shifts +4px left)
  Frame 3:    Flash to #10B981 at 15% opacity (emerald wash)
  Frame 4-5:  Next scene fades in from 0 to 100% opacity
  Total: 5 frames (~167ms)
  Usage: Between major sections (Scene 2 to 3, Scene 4 to 5)
```

**TYPE B -- ZOOM THROUGH:**
```
  Frame 0-15: Current scene scales from 100% to 140%, opacity 1.0 to 0.0
  Frame 8-30: Next scene scales from 80% to 100%, opacity 0.0 to 1.0
  Easing: SMOOTH-IN for zoom-out, STANDARD EASE-OUT for zoom-in
  Total: 30 frames (1000ms)
  Usage: Drilling from list view into detail view (Scene 3 to 4)
```

**TYPE C -- WIPE-SCAN:**
```
  A vertical line (2px, #10B981) sweeps left-to-right across the frame.
  Content behind the line is the next scene, ahead is current scene.
  Speed: traverse 1920px in 20 frames (~667ms)
  Trail: 60px gradient from emerald-500/30 to transparent behind the line
  Usage: Between data-dense scenes (Scene 5 to 6)
```

### 2.6 Micro-Interactions

**NUMBER COUNT-UP:**
```
  Start value: 0
  End value: target (e.g., 78)
  Duration: 1200ms
  Easing: ease-out (decelerate as it approaches target)
  Format: Integer, no decimals (unless showing change like +3.2)
  Font: JetBrains Mono Bold, tabular-nums
  Color: animate from #64748B (slate) to target color (e.g., #10B981) over final 400ms
```

**PROGRESS BAR FILL:**
```
  Phase 1 (0-800ms): Bar width grows from 0% to target%
  Phase 2 (800-1000ms): Glow pip appears at bar end, opacity 0 to 1
  Phase 3 (1000-1200ms): Subtle pulse on the glow pip (scale 1.0 to 1.3 to 1.0)
  Glow: box-shadow 0 0 12px [component-glow-color]
  Source: ScoreBreakdown has this exact pattern with the sliding pip
```

**GAUGE ARC DRAW:**
```
  Phase 1 (0-1500ms): SVG arc draws from 0 to target angle
  Phase 2 (300-800ms): Center score number fades in and scales from 0.5 to 1.0
  Phase 3 (1500-2000ms): Soft glow pulse around the arc end
  Background track: always visible at #1E293B
```

**CHART LINE DRAW:**
```
  Technique: Animate strokeDashoffset from full length to 0
  Duration: 1500ms
  Fill area: Fades in 200ms after line completes, from 0% to 30% opacity
  Data points: Pop in sequentially, 50ms stagger, SCALE-POP
```

**SPARKLINE TRACE:**
```
  The 60x24px mini chart draws its path left-to-right
  Duration: 600ms
  End dot: Appears at line end with SCALE-POP, r=2 to r=3 to r=2
  Gradient fill: Fades in after line, 300ms
```

**KEYWORD TAG SCATTER:**
```
  Tags appear one by one with slight scale bounce
  From: opacity: 0, scale: 0.8
  To:   opacity: 1, scale: 1
  Stagger: 50ms per tag
  Source: DetailHeader keyword tags
```

### 2.7 Ambient Animations (Matrix Theme)

**PARTICLE RAIN (always running in background):**
```
  Particles: Single characters from "01" or small dots (2px circles)
  Color: #10B981 at 8-15% opacity (very subtle)
  Count: 40-60 particles on screen at any time
  Speed: 0.3 - 1.2 px/frame (slow drift downward)
  Size: 8-14px for characters, 1-3px for dots
  Spawn: Random X position across top edge, staggered
  Despawn: Below bottom edge
  Layer: BEHIND all UI elements, ABOVE background gradient
  Parallax: Particles move at 0.3x speed relative to camera movement
```

**GRID PULSE (background structure):**
```
  A faint grid pattern (64px cells) covers the background
  Stroke: #1E293B at 15% opacity
  Every 3-5 seconds, a random cell briefly illuminates:
    - Border transitions from 15% to 40% opacity over 400ms, then back over 600ms
    - Color shifts from slate to emerald-500/20 during pulse
  Maximum 2 cells pulsing simultaneously
```

**GLOW BREATHE (on circular gauge):**
```
  The score gauge has a soft outer glow that breathes
  From: box-shadow 0 0 20px [stage-color] at 10% opacity
  To:   box-shadow 0 0 30px [stage-color] at 20% opacity
  Duration: 3000ms per cycle
  Easing: sinusoidal (ease-in-out)
  Runs continuously while gauge is on screen
```

**DATA STREAM (decorative, edge of frame):**
```
  Position: Right edge of frame, 20px wide column
  Content: Scrolling monospace numbers/Korean characters
  Color: #10B981 at 6% opacity
  Speed: 1px/frame upward
  Purpose: Reinforces "live data terminal" feel without distracting
```

### 2.8 Camera Movements

```
SLOW ZOOM-IN:
  Scale: 100% to 105% over 90 frames (3 seconds)
  Easing: linear (imperceptible acceleration)
  Usage: While dwelling on a data card to create "leaning in" feeling

PAN-LEFT:
  TranslateX: 0 to -60px over 60 frames (2 seconds)
  Easing: SMOOTH-IN
  Usage: Revealing more cards in list view

PARALLAX LAYERS:
  Background (gradient + particles): moves at 0.3x camera speed
  Mid-ground (grid): moves at 0.6x camera speed
  Foreground (UI cards): moves at 1.0x camera speed
  Creates depth without 3D rendering
```

---

## PART 3: SCENE-BY-SCENE VISUAL SPEC

### Scene 1: COLD OPEN -- "The Signal" (0:00 - 0:04, Frames 0-120)

**Concept:** Black screen. A single emerald data point appears and multiplies into a constellation. Resolves into the TLI logotype.

**Layout (1920x1080):**
```
  Centered composition.
  TLI logotype: 96px, Space Mono Bold, letter-spacing: +0.3em
  Subtitle: "Theme Lifecycle Intelligence" -- 18px, JetBrains Mono, slate-400
  Vertical gap between logo and subtitle: 16px
  Total block height: ~140px, centered at (960, 500)
```

**Animation choreography (30fps):**
```
  Frame 0-15:    Pure black. Silence.
  Frame 16:      Single 3px dot appears at center, #10B981 at 100%
  Frame 17-35:   Dot multiplies: 1 -> 3 -> 8 -> 20 dots, spreading in organic cluster
                 Each dot: 2-4px, emerald-500 at varying opacities (40-100%)
                 Spread radius: 0px to 200px
  Frame 36-50:   Dots begin drifting toward letter positions of "TLI"
                 Motion: spring physics (slight overshoot)
  Frame 50-65:   Dots coalesce into letterforms. Flash: entire "TLI" text
                 illuminates at 100% then settles to white at 90%
  Frame 65-80:   Subtitle fades in: FADE-UP, opacity 0->1, y +10->0
  Frame 80-100:  Hold. GLOW BREATHE begins on TLI text
                 Ambient: PARTICLE RAIN starts (will continue through video)
  Frame 100-120: Begin exit dissolve toward Scene 2
```

**Colors & effects:**
```
  Background: true black #000000
  Dots: #10B981 with individual opacity variation
  TLI text: #FFFFFF with text-shadow: 0 0 40px rgba(16,185,129,0.4)
  Subtitle: #94A3B8
  No background gradient yet (builds in Scene 2)
```

---

### Scene 2: MARKET PULSE -- "The Dashboard" (0:04 - 0:10, Frames 120-300)

**Concept:** The themes listing page materializes. Shows the header ("테마 트래커"), stats overview bar, and 3-4 theme cards arranging themselves. This is the "what is it" establishing shot.

**Layout (1920x1080):**
```
  Top section (y: 60-160):
    "테마 트래커" heading with emerald accent bar
    Matches: ThemesHeader component
    Left-aligned, 80px from left edge
    Font: 40px Pretendard Black, white + emerald-400 for "트래커"
    Vertical bar: 4px wide, 32px tall, #10B981, rounded-full

  Stats bar (y: 180-250):
    Glass card spanning full content width (1760px)
    Matches: StatsOverview component
    Contains: Total count, stage pills, Hottest theme, Surging theme, Avg Score
    All in a horizontal flex row with vertical dividers

  Card grid (y: 290-900):
    3 cards in a row, each ~560px wide (3-col layout with 24px gutters)
    Matches: ThemeCard component exactly
    Card contents:
      - Theme name (Korean, 20px bold)
      - Stage badge (pill with icon)
      - Score (48px, font-mono, font-black, stage color)
      - "Theme Score" label (11px mono, slate-500)
      - Sparkline (60x24px SVG, right-aligned)
      - Change indicator (+/- with arrow icon)
      - Stock count + news count
      - Stock tag pills at bottom
```

**Animation choreography:**
```
  Frame 120-130: GLITCH CUT transition from Scene 1
  Frame 130-150: Background gradient fades in (HERO GRADIENT)
                 GRID PULSE becomes visible
  Frame 150-170: Header FADE-UP (20 frames, 667ms)
                 Emerald bar scales from 0 height to full
  Frame 170-200: Stats bar FADE-UP with 100ms delay
                 Stage count pills pop in with SCALE-POP, 50ms stagger
                 Numbers count up from 0 (Total: 0->24, Avg: 0->47.2)
  Frame 200-260: Cards enter STAGGERED:
                 Card 1: FADE-UP at frame 200
                 Card 2: FADE-UP at frame 210
                 Card 3: FADE-UP at frame 220
                 Within each card (sequenced):
                   +0ms: Card container appears
                   +200ms: Score number counts up (0 to target)
                   +400ms: Sparkline draws left-to-right (600ms)
                   +500ms: Stage badge SCALE-POP
                   +600ms: Stock tags KEYWORD-SCATTER
  Frame 260-290: SLOW ZOOM-IN on card grid (subtle, 3% scale increase)
                 Mouse cursor appears, hovers over middle card
  Frame 290-300: Middle card hover state activates:
                 border-emerald-500/30, enhanced shadow
                 Theme name transitions to emerald-400
                 Begin transition to Scene 3
```

**Data to display (realistic mock):**
```
  Card 1: "2차전지" | Growth | Score 72 | +4.2% 7D | 18 stocks | sparkline trending up
  Card 2: "AI 반도체" | Peak | Score 85 | +12.1% 7D | 24 stocks | sparkline at high plateau
  Card 3: "바이오" | Early | Score 38 | -2.3% 7D | 15 stocks | sparkline flat/slight rise
```

---

### Scene 3: THE SCORE -- "Deep Intelligence" (0:10 - 0:18, Frames 300-540)

**Concept:** Zoom into a theme detail page. The hero moment: a giant circular score gauge draws itself, surrounded by the score breakdown bars. This is the "how does it work" explainer shot.

**Layout (1920x1080):**
```
  LEFT HALF (x: 80-920):
    DetailHeader content:
      Theme name: "AI 반도체" at 48px Pretendard Black
      Stage badge: Peak (amber pill with flame icon)
      Keyword tags row: "엔비디아", "HBM", "GPU", "데이터센터", "AMD" etc.
      Metric grid: 6 mini cards (2 rows of 3)
        - D+45 (emerald), +3.2 24H (emerald), +12.1 7D (emerald)
        - 24 stocks (sky), 47 news (sky), 3 patterns (purple)

  RIGHT HALF (x: 960-1840):
    Circular gauge: 160px diameter, centered at (1400, 350)
      Score: 85 (large, centered in gauge)
      Arc: amber stroke, 10px wide
      Stage label: "과열" with amber dot
      Change pill: +3.2 (emerald, below gauge)

  BOTTOM SECTION (y: 550-980):
    Score breakdown card (full width, glass card):
      4 component rows:
        1. 검색 관심 (Emerald) -- 92/100 -- bar at 92% -- 가중치 40%
        2. 뉴스 모멘텀 (Sky) -- 78/100 -- bar at 78% -- 가중치 25%
        3. 기사 논조 (Amber) -- 65/100 -- bar at 65% -- 가중치 20%
        4. 변동성 (Purple) -- 71/100 -- bar at 71% -- 가중치 15%
      Each row has:
        - Colored icon + label + weight badge
        - Progress bar with gradient fill and glowing pip
        - Score number right-aligned
        - Calculation: "92 x 40% = 36.8pt" in small mono text
```

**Animation choreography:**
```
  Frame 300-315: ZOOM THROUGH transition (Type B)
                 Previous scene zooms out, this scene zooms in from 80% to 100%
  Frame 315-345: Theme name FADE-UP (30 frames)
                 Stage badge SCALE-POP at frame 325
                 Keywords SCATTER at frame 330 (50ms stagger)
  Frame 340-370: Metric grid cards enter:
                 Staggered FADE-UP, 3 frames apart
                 Each number counts up from 0
  Frame 350-410: GAUGE ARC DRAW (hero moment):
                 SVG arc animates from 0 to 85% of circle
                 Duration: 60 frames (2 seconds) -- deliberately slow for drama
                 Score number: counts 0 to 85, appearing at frame 360
                 Stage label fades in at frame 400
                 GLOW BREATHE begins on gauge
  Frame 410-440: Score breakdown card FADE-UP
  Frame 440-520: Progress bars fill SEQUENTIALLY:
                 Bar 1 (Interest): starts frame 440, fills over 36 frames
                 Bar 2 (News): starts frame 450, fills over 36 frames
                 Bar 3 (Sentiment): starts frame 460, fills over 36 frames
                 Bar 4 (Volatility): starts frame 470, fills over 36 frames
                 Glowing pips appear as each bar reaches target
                 Score numbers count up simultaneously
  Frame 520-540: Camera SLOW ZOOM-IN on the score breakdown
                 "주도 요인" insight card flashes in:
                 emerald border, Sparkles icon, "검색 관심이(가) 점수를 주도"
```

---

### Scene 4: THE CURVE -- "Lifecycle in Motion" (0:18 - 0:26, Frames 540-780)

**Concept:** The lifecycle curve chart draws itself, showing the theme's journey over time. News volume bars pulse underneath. Comparison theme lines overlay. This is the "what makes it unique" differentiator.

**Layout (1920x1080):**
```
  CHART AREA (x: 80-1840, y: 60-600, height: 540px):
    Matches: LifecycleCurve component
    ComposedChart with:
      - X axis: dates (11px, JetBrains Mono, slate-500)
      - Y axis left: Score 0-100 (11px, slate-500)
      - Grid: horizontal dashed lines, #1E293B at 30%

    Layers (bottom to top):
      1. News volume bars: amber at 15% opacity, bottom-aligned
         Radius: 2px top corners
      2. Current theme area: emerald gradient fill (30% to 0% top-to-bottom)
      3. Current theme line: #10B981, 2px stroke
      4. Interest dashed line: #8B5CF6, 1.5px, dash pattern "4 4", 70% opacity
      5. Comparison theme 1: dashed line, #F59E0B, 1.5px
      6. Comparison theme 2: dashed line, #0EA5E9, 1.5px
      7. Peak reference line: vertical dashed, amber, at peak date

    Legend: bottom-left, using ChartLegend with colored circles + labels

  BOTTOM SECTION (y: 640-980):
    Split into 2 panels:

    LEFT (x: 80-920): News Headlines (3-4 articles visible)
      Matches: NewsHeadlines component
      Sentiment summary bar at top (논조: 긍정적)
      Article rows with:
        - Number (10px mono, slate-700)
        - Title (14px, slate-300, hover->white)
        - Source badge (emerald-500/70, mono)
        - Sentiment badge
        - Time stamp ("2시간 전")

    RIGHT (x: 960-1840): Stock List (top 3 movers)
      Matches: TopMovers component
      3 stock cards stacked:
        - Stock name (14px bold white)
        - Market badge (KOSDAQ/KOSPI, 10px mono)
        - Price (mono, ₩42,300)
        - Volume (mono, 1.2M)
        - Change badge: +5.23% (emerald) or -2.1% (red)
```

**Animation choreography:**
```
  Frame 540-555: WIPE-SCAN transition (Type C)
                 Emerald scan line sweeps left-to-right
  Frame 555-570: Chart container FADE-UP
                 Axes draw themselves: Y axis line top-to-bottom (200ms),
                 X axis line left-to-right (200ms)
                 Grid lines fade in (all at once, 300ms)
  Frame 570-610: News bars rise from bottom:
                 Each bar grows from height 0 to target
                 Staggered: 2 frames apart, left to right
                 Duration per bar: 20 frames
  Frame 600-650: MAIN CHART LINE DRAWS:
                 strokeDashoffset animation, left to right
                 Duration: 50 frames (1667ms)
                 Trail: area gradient fades in 10 frames behind the line
  Frame 640-680: Interest dashed line draws (same technique, slightly faster)
  Frame 660-690: Peak reference line drops in from top (vertical wipe, 15 frames)
                 Small amber label appears: "피크 D+28"
  Frame 670-700: Comparison lines draw:
                 Line 1 (amber dash): 30 frames
                 Line 2 (sky dash): 30 frames, starts 5 frames after line 1
  Frame 700-710: Legend items FADE-UP with stagger
  Frame 710-740: Bottom panels FADE-UP:
                 News panel: frame 710
                 Stock panel: frame 720
                 News articles FADE-LEFT with 30ms stagger
                 Stock cards SLIDE-RIGHT with 100ms stagger
  Frame 740-780: SLOW ZOOM-IN on chart area
                 One news article highlight: brief flash of hover state
```

---

### Scene 5: PATTERN MATCH -- "History Repeats" (0:26 - 0:32, Frames 780-960)

**Concept:** The comparison/prediction system. Show how TLI finds similar historical patterns. A comparison card expands, its mini-timeline animates, and pillar bars fill. The insight text appears. This is the "why should I care" value proposition.

**Layout (1920x1080):**
```
  LEFT PANEL (x: 80-920):
    "유사 패턴 분석" section title (14px mono, slate-400, uppercase tracking)

    3 comparison cards stacked (matches ComparisonCard):
      Card 1 (selected, expanded):
        - Theme name: "메타버스" (14px medium white)
        - Badges: "매우 유사" (emerald pill) + "82%" (emerald outline)
        - 3-Pillar bars:
            특성  |========= | 85%  (sky)
            곡선  |=======   | 79%  (emerald)
            키워드|======    | 68%  (amber)
        - Mini timeline:
            D+0 ----[current dot]--------[peak marker]---- D+180
            Progress bar: emerald at 45%
            Peak marker: amber pip at 65%
        - Text: "현재 D+45 / 전체 주기 180일"
        - Insight: "특성 유사도가 높으며 성장 단계 초반에 해당합니다."
        - Past results grid: 피크 점수 92 | 하락 기간 34일 | 최종 상태 Dormant
        - Amber callout: "피크까지 ~25일 예상"

      Card 2 (collapsed): "NFT" | 유사 | 67%
      Card 3 (collapsed): "전기차" | 약한 유사 | 48%

  RIGHT PANEL (x: 960-1840):
    The lifecycle curve chart from Scene 4, but now with the selected
    comparison theme's historical curve overlaid prominently.
    Current theme line: solid emerald
    Comparison "메타버스" line: dashed amber, more opaque than before
    Vertical dashed line showing "you are here" at current position
```

**Animation choreography:**
```
  Frame 780-795: GLITCH CUT transition (Type A)
  Frame 795-820: Section title FADE-UP
                 Comparison cards enter STAGGERED (FADE-UP, 100ms apart)
  Frame 820-860: Card 1 expands (layout animation):
                 Height grows from collapsed (~60px) to expanded (~380px)
                 Duration: 40 frames, STANDARD EASE-OUT
  Frame 830-870: Within expanded card:
                 Badges SCALE-POP (frame 830)
                 Pillar bars fill sequentially:
                   특성: frame 840, 600ms
                   곡선: frame 845, 600ms
                   키워드: frame 850, 600ms
                 Percentage numbers count up
  Frame 870-900: Mini timeline animates:
                 Progress bar width grows 0 to 45% (24 frames)
                 Current dot SCALE-POP at end of bar (frame 895)
                 Peak marker fades in at 65% position
  Frame 900-920: Insight text FADE-UP
                 Past results grid: 3 cells FADE-UP with 50ms stagger
  Frame 920-935: Amber callout slides in from left (FADE-LEFT + slight scale)
                 Pulse dot starts animating
  Frame 935-960: Right panel chart:
                 Comparison line draws (strokeDashoffset, 25 frames)
                 "You are here" marker pulses
                 Camera SLOW ZOOM-IN on the intersection area
```

---

### Scene 6: MARKET OVERVIEW -- "The Full Picture" (0:32 - 0:38, Frames 960-1140)

**Concept:** Pull back to the full dashboard. Show the stage filter tabs in action -- filtering between Growth, Peak, Decay themes. Cards rearrange with layout animation. Demonstrates the product's breadth.

**Layout (1920x1080):**
```
  Re-uses Scene 2 layout but with filter interaction:

  Header area (same as Scene 2)

  Filter tabs row (y: 170-210):
    Matches: ThemeFilter component
    Horizontal pill row:
      "전체" | "성장" | "과열" | "초기" | "말기" | "관심 없음"
    Active tab: bg-white/10, white text, ring-1 ring-white/20
    Inactive: text-slate-400, hover:text-white

  Card grid below: shows 6 cards (2 rows of 3)
  Cards have varied stages showing the diversity of tracking
```

**Animation choreography:**
```
  Frame 960-975: WIPE-SCAN transition (Type C, right-to-left this time)
  Frame 975-1000: Full dashboard fades in (quicker than Scene 2, 25 frames)
                  All elements appear nearly simultaneously
  Frame 1000-1020: Cursor moves to "성장" filter tab
                   Tab transitions to active state (200ms)
  Frame 1020-1060: Cards that are NOT "Growth" stage: FADE-DOWN exit (300ms)
                   Remaining Growth cards: layout-animate to fill grid
                   Spring physics on repositioning (slight overshoot)
  Frame 1060-1080: Cursor moves to "과열" tab
                   "성장" deactivates, "과열" activates
  Frame 1080-1110: Growth cards exit, Peak cards enter
                   New cards FADE-UP with stagger
                   Peak cards have amber-tinted borders
  Frame 1110-1140: Brief hold on the filtered view
                   Camera SLOW ZOOM-OUT (105% to 100%) -- pulling back
                   Begin dissolve to Scene 7
```

---

### Scene 7: CLOSE -- "Your Edge" (0:38 - 0:42, Frames 1140-1260)

**Concept:** Bookend with Scene 1. The UI elements dissolve into the emerald dot constellation, which resolves into the TLI logo + tagline + URL. Clean, memorable, shareable.

**Layout (1920x1080):**
```
  Centered composition:

  TLI logotype: 72px, Space Mono Bold, white
  Tagline: "테마의 생명주기를 읽다" -- 24px Pretendard Medium, slate-300
  Gap: 24px

  URL/CTA: "yoursite.com/themes" -- 16px JetBrains Mono, emerald-400
  Gap: 48px below tagline

  Bottom: subtle emerald line (200px wide, 1px, emerald-500/40) as separator
```

**Animation choreography:**
```
  Frame 1140-1160: Dashboard UI elements fragment into particles
                   Each card breaks into 8-12 emerald dots
                   Dots drift toward center
  Frame 1160-1180: Dots coalesce (reverse of Scene 1 open)
                   Form the "TLI" letterforms
  Frame 1180-1200: TLI text solidifies, white at 100%
                   GLOW BREATHE resumes on text
  Frame 1200-1220: Tagline FADE-UP
  Frame 1220-1235: URL FADE-UP
                   Emerald line draws left-to-right (200ms)
  Frame 1235-1260: Hold. PARTICLE RAIN continues.
                   Gentle GLOW BREATHE on everything.
                   Final frame: clean hold for screenshot-ability.
```

---

## PART 4: MOTION PRINCIPLES

### 4.1 The Five Laws of Premium Motion

**LAW 1: DECELERATION, NOT ACCELERATION**
Every moving element should arrive at its destination with decreasing speed. The world has friction. Elements that stop abruptly or maintain constant speed feel robotic. Use ease-out curves for entries, ease-in for exits. Never linear for UI.

Why this matters: The production codebase uses `ease: 'easeOut'` and `cubic-bezier(0.25, 0.46, 0.45, 0.94)` everywhere. The video must match this feel.

**LAW 2: STAGGER CREATES HIERARCHY**
When multiple elements enter, they must arrive in reading order with consistent delay intervals. This teaches the viewer's eye where to look.

Production pattern: Cards use 100ms stagger, keywords use 50ms, news items use 30ms. The stagger duration signals importance -- longer gaps = more important elements.

Rules:
- Primary elements: 100-150ms stagger
- Secondary elements: 50-80ms stagger
- Tertiary elements: 20-30ms stagger (fast cascade)
- Maximum total stagger: 500ms (viewers lose patience after this)

**LAW 3: OVERSHOOT SPARINGLY**
Spring physics (slight overshoot, settle) should be reserved for MOMENTS -- the score number appearing, a badge popping in, a card being selected. If everything bounces, nothing feels special. Reserve overshoot for scores, badges, and the gauge.

Production pattern: Only `LifecycleScore` center number uses `scale: 0.5 to 1` (implicit overshoot). Progress bars use pure ease-out (no overshoot). Maintain this hierarchy.

**LAW 4: MOTION HAS DIRECTION AND MEANING**
- Vertical up = entering, appearing, positive
- Vertical down = exiting, leaving, negative
- Horizontal left-to-right = progress, time, reading flow
- Scale up = emphasis, selection
- Scale down = de-emphasis, dismissal

The production code is consistent: all entries are FADE-UP (y: +20 to 0), all slides are directional. Never violate this spatial grammar.

**LAW 5: AMBIENT MOTION CREATES LIFE**
Static frames feel dead. But too much ambient motion is distracting. The sweet spot:
- 1-2 ambient loops running at all times (particle rain, glow breathe)
- These loops should be SLOW (3000ms+ cycles) and LOW CONTRAST (under 15% opacity delta)
- They exist to prevent the viewer's brain from "freezing" the image

### 4.2 What Separates Amateur from Professional

| Amateur | Professional |
|---------|-------------|
| All elements enter at same speed | Each element has unique timing based on importance |
| Linear easing | Matched easing curves from a coherent system |
| Every element bounces/springs | Springs reserved for 2-3 hero moments |
| Transitions are cuts or fades | Transitions reinforce the narrative (zoom-through = drilling deeper) |
| Motion is decoration | Motion communicates data (bar filling = value, arc drawing = score) |
| Particles everywhere | Particles are atmospheric, below 15% opacity |
| Elements pop in from nowhere | Elements have spatial origin (cards rise from below, tooltips grow from trigger) |
| All at 60fps butter-smooth | Strategic frame-rate mixing: UI at 30fps, particle layer at 15fps (creates depth) |
| Generic "slide in" | Every entry matches the element type (numbers count, bars fill, arcs draw, dots pop) |
| Sound and motion disconnected | Key moments have synchronized audio hits (gauge completing, score landing) |

### 4.3 Timing Budget

Total runtime: ~40 seconds (1200 frames at 30fps)

```
Scene 1 (Cold Open):      4s   |  10% of runtime  | 1 animation focus
Scene 2 (Dashboard):      6s   |  15% of runtime  | 5-6 animation focuses
Scene 3 (Score Detail):   8s   |  20% of runtime  | 8-10 animation focuses (HERO)
Scene 4 (Lifecycle Curve): 8s  |  20% of runtime  | 6-8 animation focuses
Scene 5 (Pattern Match):  6s   |  15% of runtime  | 5-6 animation focuses
Scene 6 (Market Overview): 6s  |  15% of runtime  | 3-4 animation focuses
Scene 7 (Close):          2-4s |   5% of runtime  | 2 animation focuses
```

The HERO scene (Scene 3) gets the most screen time and animation complexity. This is the moment the viewer remembers.

---

## PART 5: REFERENCE MOOD BOARD

### Reference 1: Linear App Launch Video (2023)
**URL concept:** linear.app product videos
**What to borrow:**
- The restrained color palette: one accent color dominates (their purple -> our emerald)
- Typography hierarchy: massive score numbers + tiny mono labels
- The "zoom into card" transition when showing detail
- Speed: brisk but never rushed. Each element has just enough time.
**What to avoid:** Their aesthetic is very "light mode clean" -- we need darker, more atmospheric

### Reference 2: Bloomberg Terminal UI (Real-time data aesthetic)
**What to borrow:**
- Data density without clutter: many numbers on screen, all readable
- The monospace type that says "this is real data, not decoration"
- Color-coding system: green = up, red = down, amber = warning (matches our palette exactly)
- The "always live" feel from subtle blinking cursors and updating numbers
**What to avoid:** Bloomberg is intentionally ugly. We take the data density but add the glass morphism layer on top.

### Reference 3: The Matrix (1999) -- Title sequence and in-world monitors
**What to borrow:**
- Falling green characters (our PARTICLE RAIN at 8-15% opacity)
- The CRT scan line overlay (our SCAN LINE OVERLAY at 1.5% opacity)
- Black background as negative space, not emptiness
- The feeling that data IS the world, not just displayed on it
**What to avoid:** The actual green (#00FF00) is garish. Our #10B981 is cooler and more sophisticated.

### Reference 4: Raycast Product Videos
**What to borrow:**
- The glass card rendering: blur behind, subtle border, inner highlights
- How they showcase keyboard shortcuts and interactions in real-time
- The pace: show, don't explain. No talking head, no text-heavy slides.
- Tight framing on the UI element being showcased, then pulling back
**What to avoid:** Raycast's palette is warmer (purples, pinks). We stay in the cool emerald/sky range.

### Reference 5: Vercel Ship Announcement Videos
**What to borrow:**
- The dramatic reveal of a single metric or number (their deploy time -> our TLI score)
- How they transition from product UI to abstract visualization and back
- Sound design: the satisfying "click" when a metric appears
- The final frame: clean, memorable, screenshot-worthy
**What to avoid:** Vercel is very minimal, almost sparse. We can be denser because our data IS the product.

---

## PART 6: PRODUCTION NOTES

### 6.1 Asset Extraction Checklist

Before production, export these from the running application:

```
[ ] Screenshot: /themes page (full page, dark mode, populated data)
[ ] Screenshot: /themes/[id] detail page (a peak-stage theme)
[ ] Screenshot: Score breakdown card expanded
[ ] Screenshot: Lifecycle curve chart with comparison lines
[ ] Screenshot: Comparison cards (one expanded, two collapsed)
[ ] Screenshot: News headlines section
[ ] Screenshot: Stock list with price data
[ ] SVG export: Circular gauge component (clean vector)
[ ] SVG export: Sparkline component (clean vector)
[ ] Color hex values: confirmed from STAGE_CONFIG and SCORE_COMPONENTS (documented above)
[ ] Font files: Pretendard Variable, JetBrains Mono, Space Mono
```

### 6.2 Sound Design Notes (not visual, but paired)

```
Scene 1 - Cold Open:     Low digital hum -> crystallization sound as dots form letters
Scene 2 - Dashboard:     Soft "materialization" whoosh as cards appear
Scene 3 - Score:         Rising tone as gauge fills, satisfying "lock" click at completion
Scene 4 - Curve:         Subtle data-stream ambience, each chart point has a tiny blip
Scene 5 - Pattern:       "Connection found" chime when comparison card expands
Scene 6 - Overview:      Quick filter-click sounds, card shuffle
Scene 7 - Close:         Reverse of Scene 1 sound, ending on a resonant tone
```

### 6.3 Vertical (9:16) Adaptation Rules

For the 1080x1920 vertical cut:

```
1. Stack all horizontal layouts vertically
2. Gauge moves from side to top-center
3. Chart uses full width, reduced height (250px instead of 540px)
4. Comparison cards become horizontally scrollable (show 1.5 cards)
5. Stock list shows 2 items instead of 3
6. News headlines show 3 items instead of 5
7. Scene 6 (filter demo) can be cut or shortened to 3 seconds
8. Text sizes scale DOWN by ~15% across the board
9. Safe zones: 60px top (status bar), 160px bottom (swipe area)
```

### 6.4 Export Specifications

```
LANDSCAPE (Primary):
  Resolution: 1920x1080
  Frame rate: 30fps
  Codec: H.264 High Profile or ProRes 422 (for editing)
  Final delivery: H.264, CRF 18, 2-pass
  Color space: sRGB

VERTICAL (Social):
  Resolution: 1080x1920
  Same codec/color specifications
  Additional: Add 1-2 second hold at end for story auto-advance

THUMBNAIL:
  Extract Scene 3 at frame 500 (gauge fully drawn, score visible)
  Export as PNG, 1920x1080
  This frame should work as a standalone image
```

---

*This document is the single source of truth for visual direction. Every color value, timing, and easing curve is drawn from the production codebase to ensure the video feels like the product -- not a generic promotional piece.*
