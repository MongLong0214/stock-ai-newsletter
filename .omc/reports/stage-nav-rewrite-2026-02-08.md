# Stage Navigation Component Rewrite

**Date:** 2026-02-08
**Component:** `app/themes/_components/stage-nav.tsx`
**Status:** ✅ Complete - Build verified, types checked

## Problem Statement

The original `stage-nav.tsx` had critical mobile UX issues:
1. **Sticky positioning broken** - Component wouldn't stick to top on scroll
2. **Mobile clipping** - Pills cut off at screen edges, last pill inaccessible
3. **Accessibility gaps** - Missing ARIA labels and semantic HTML
4. **Layout shift** - Border appearing/disappearing on active state caused jumping

## Root Cause Analysis

### Sticky Issue
- `motion.div` wrapper applied CSS transforms during animation
- Transforms on sticky elements or ancestors break `position: sticky`
- Body had `overflow-x: hidden` (fixed separately to `overflow-x: clip`)

### Mobile Clipping
- No escape from parent container's padding
- Missing right-side buffer for horizontal scroll
- Last pill positioned against screen edge

## Solution Architecture

### 1. Sticky Fix
```tsx
// OLD (BROKEN)
<div className="sticky...">
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
    {/* transforms break sticky */}
  </motion.div>
</div>

// NEW (WORKING)
<div className="sticky..." style={{ position: 'sticky' }}>
  <div style={{ opacity: 1, animation: 'fadeInNav 0.3s...' }}>
    {/* CSS animation, no transforms */}
  </div>
</div>
```

**Key changes:**
- Plain `<div>` for sticky container (explicit `position: sticky`)
- Inline CSS keyframe animation (opacity only, no transforms)
- Animation applied to inner wrapper (preserves sticky on outer)

### 2. Edge-to-Edge Mobile Layout
```tsx
// Container escapes parent padding
<div className="-mx-4 sm:-mx-6 lg:-mx-8">
  {/* Scroll container re-applies padding for content */}
  <nav className="px-4 sm:px-6 lg:px-8 overflow-x-auto">
    {pills}
    {/* Right padding guard prevents clipping */}
    <div className="shrink-0 w-px" />
  </nav>
</div>
```

**Responsive padding:**
- Mobile: 16px (`px-4`)
- Tablet: 24px (`px-6`)
- Desktop: 32px (`px-8`)

### 3. Accessibility Enhancements

**ARIA Structure:**
```tsx
<nav role="tablist" aria-label="테마 생명주기 단계 탐색">
  <button
    role="tab"
    aria-selected={isActive}
    aria-controls="stage-early"
    aria-label="12개 테마"
  >
    {/* Content */}
  </button>
</nav>
```

**Focus Management:**
- `focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50`
- Keyboard navigation supported
- `prefers-reduced-motion` respected (disables glow animation)

### 4. Layout Stability

**Consistent border:**
```tsx
// OLD - conditional border causes layout shift
className={isActive ? 'shadow-lg' : 'border border-slate-700/30'}

// NEW - always has border
className="border"
style={isActive ? { borderColor: `${color}30` } : {}}
```

**Fixed pill height:**
- All pills maintain same padding regardless of active state
- No jumping between states

## Performance Optimizations

1. **CSS-only hover states** - No React re-renders on hover
2. **Minimal state** - Only `activeSection` tracked
3. **Ref-based operations** - Auto-scroll uses refs, not state
4. **Inline CSS animation** - Avoids global stylesheet pollution

## Visual Design

### Color System
- Inactive: `bg-slate-900/40`, `border-slate-700/30`
- Active: Stage color gradient with glow
  - Early (emerald): `#10B981`
  - Growth (sky): `#0EA5E9`
  - Peak (amber): `#F59E0B`
  - Decay (red): `#EF4444`
  - Reigniting (orange): `#F97316`

### Motion Design
- Entrance: 300ms fade-in, 100ms delay
- Active indicator: Spring animation (stiffness 380, damping 30)
- Transitions: 200ms ease-out
- Respects `prefers-reduced-motion`

## Testing Checklist

- [x] Build succeeds without errors
- [x] TypeScript types validate
- [x] No ESLint errors
- [x] Sticky positioning works
- [x] Mobile edge-to-edge layout
- [x] Horizontal scroll on overflow
- [x] Last pill not clipped
- [x] ARIA labels present
- [x] Focus states visible
- [x] No layout shift on active change
- [x] Reduced motion respected

## Browser Compatibility

- **Sticky positioning:** All modern browsers (IE11 excluded)
- **Backdrop blur:** All modern browsers
- **CSS animations:** Universal support
- **Touch scrolling:** `-webkit-overflow-scrolling: touch` for iOS

## Migration Notes

**No breaking changes** - Component maintains same props interface:
```tsx
interface StageNavProps {
  sections: {
    key: string
    stage: DisplayStage
    title: string
    count: number
  }[]
}
```

**Usage unchanged:**
```tsx
<StageNav sections={sectionsData} />
```

## File Changes

- **Modified:** `app/themes/_components/stage-nav.tsx` (complete rewrite)
- **Related fix:** `app/globals.css` body `overflow-x: hidden` → `overflow-x: clip`

## Next Steps

1. Monitor production for sticky behavior across devices
2. Gather user feedback on mobile scroll UX
3. Consider adding keyboard arrow navigation between pills
4. Potential enhancement: swipe gestures on mobile

## References

- [MDN: position: sticky](https://developer.mozilla.org/en-US/docs/Web/CSS/position#sticky)
- [CSS Tricks: Sticky Positioning](https://css-tricks.com/position-sticky-2/)
- [ARIA Authoring Practices: Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)
