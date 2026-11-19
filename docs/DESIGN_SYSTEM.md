# Nookscanner: Design System

Version 1.0 (2026-11-19). Tokens are implemented in `packages/design-tokens` (TypeScript source of truth, generates CSS custom properties). A test verifies WCAG contrast for the documented text/background pairs.

## 1. Brand identity

- **Name:** Nookscanner ("a cosy nook" + "a tour of it"). Tagline (working): *"Your stay, shown not told."*
- **Personality:** calm, warm, precise, quietly premium; hospitality first, technology second.
- **Voice:** short, friendly, plain language ("Tap the AC to see how it works"), no jargon for guests or managers.
- **Logo (placeholder until designed):** wordmark "nookscanner" in the heading font, lowercase, with a small doorway-arch glyph. A professional logo is a user decision (KNOWN_ISSUES KI-006).

## 2. Colour

| Token | HEX | Use |
|---|---|---|
| `color.brand.primary` (Lagoon 700) | `#1F5662` | Primary actions, links, active nav |
| `color.brand.primaryHover` (Lagoon 800) | `#17434D` | Hover/pressed |
| `color.brand.primarySoft` (Lagoon 50) | `#E8F1F2` | Selected rows, soft backgrounds |
| `color.brand.accent` (Brass 500) | `#C8893B` | Hotspots, highlights, focus accents on dark |
| `color.brand.accentStrong` (Brass 700) | `#8F5E1F` | Accent text on light backgrounds |
| `color.neutral.ink` | `#161A20` | Primary text |
| `color.neutral.muted` | `#5A6370` | Secondary text |
| `color.neutral.subtle` | `#8A929C` | Placeholder, disabled text (non-essential) |
| `color.neutral.border` | `#E3DFD8` | Borders, dividers |
| `color.neutral.canvas` | `#F7F5F1` | App background (warm off-white) |
| `color.neutral.surface` | `#FFFFFF` | Cards, panels, inputs |
| `color.viewer.background` | `#0E1116` | 3D viewer letterbox, guest dark chrome |
| `color.viewer.panel` | `rgba(18,22,28,0.78)` | Glass panels over 3D |
| `color.viewer.text` | `#F4F1EC` | Text on viewer panels |
| `color.status.success` | `#1E7A4F` | Success |
| `color.status.warning` | `#9A5408` | Warning text/icons |
| `color.status.danger` | `#B42318` | Errors, destructive |
| `color.status.info` | `#1D5FD1` | Info |
| `color.focus` | `#2F80ED` | Focus ring (3 px, 2 px offset) |

Contrast requirements (AA): body text >= 4.5:1, large text/icons >= 3:1. Tested pairs: ink/canvas, ink/surface, muted/surface, muted/canvas, white/primary, white/primaryHover, primary/surface, accentStrong/surface, danger/surface, success/surface, warning/surface, info/surface, viewer.text/viewer.background, accent/viewer.background.

Secondary palette for data viz (analytics): Lagoon `#1F5662`, Brass `#C8893B`, Sage `#5E8C6A`, Clay `#B4644A`, Slate `#4B5B73`.

## 3. Typography

- Latin: **Inter** (variable, OFL). Arabic: **IBM Plex Sans Arabic** (OFL). Headings may use Inter with tighter tracking (-0.01em). Both self-hosted (no third-party font requests from the guest app).
- Scale (rem, base 16 px): `xs 0.75 / 1rem`, `sm 0.875 / 1.25`, `md 1 / 1.5`, `lg 1.125 / 1.625`, `xl 1.25 / 1.75`, `2xl 1.5 / 2`, `3xl 1.875 / 2.25`, `4xl 2.25 / 2.5`.
- Weights: 400 body, 500 UI labels, 600 headings, 700 numbers in analytics only.
- Arabic line-height +0.125rem relative to Latin; never letter-space Arabic.

## 4. Spacing, radius, elevation, grid

- Spacing scale (px): 0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80.
- Radius: `sm 6px` (inputs), `md 10px` (buttons, cards), `lg 16px` (sheets, modals), `pill 999px` (chips).
- Elevation: `e1 0 1px 2px rgba(22,26,32,.06), 0 1px 1px rgba(22,26,32,.04)`; `e2 0 4px 12px rgba(22,26,32,.08)`; `e3 0 12px 32px rgba(22,26,32,.14)` (modals, guest sheets).
- Grid: dashboard 12 columns, 24 px gutters, max content width 1280 px, sidebar 248 px (collapsible to 72 px). Guest: single column, 16 px side gutter, bottom sheet pattern.
- Breakpoints: `sm 640`, `md 768`, `lg 1024`, `xl 1280`.
- Motion: 150 ms (hover), 220 ms (sheets), 600-1200 ms (camera fly-throughs, ease-in-out cubic); honour `prefers-reduced-motion` (cut transitions instead of flying).

## 5. Components (dashboard)

| Component | Spec |
|---|---|
| Button | Variants primary, secondary (surface + border), ghost, danger; sizes sm 32px, md 40px, lg 48px; label 500 weight; loading state keeps width with spinner; min touch 44x44 in Nookscanner app |
| Input / Select / Textarea | 40 px, 1 px border `neutral.border`, focus ring `color.focus`; label above, helper below, error text in danger with icon; never placeholder-as-label |
| Form | One column, max 560 px; primary action bottom-right (LTR) / bottom-left (RTL) |
| Navigation | Left sidebar: Apartments, Properties, Scans, Appliances & Instructions, Analytics, Settings; org switcher at top; breadcrumbs in header |
| Card | Surface, radius md, e1, 24 px padding; used sparingly (avoid dashboard-card grids) |
| Table | 48 px rows, sticky header, row hover primarySoft, status pills, overflow menu for actions; becomes stacked list < md |
| Modal | Max 560 px, radius lg, e3, focus trap, Esc closes, destructive confirm requires typing name for deletes |
| Toast / Notification | Bottom-right (LTR), 5 s auto-dismiss except errors; in-app notification centre for processing updates |
| Status pill | draft (neutral), processing (info, animated dot), review (warning), published (success), failed (danger) |
| Progress | Linear with stage label for processing ("Estimating camera positions... 42%") |
| Loading | Skeletons for lists/tables; spinner only for < 1 s actions |
| Empty state | Simple line illustration + one sentence + one primary action ("Add your first apartment") |
| Error state | What happened + what to do + retry; error code in small text for support |

## 6. Guest experience

- 3D viewer fills the screen; UI floats on top in glass panels (`viewer.panel`).
- Top: apartment name + language toggle (EN/عربي). Bottom: search bar + horizontally scrolling room chips.
- Hotspot marker: 28 px circle, brass ring 2 px, category icon, soft pulse when highlighted; label shows on tap; 44 px hit area.
- Instruction sheet: bottom sheet (snap 40% / 90%), title, room, brand/model, numbered steps with images, video player (muted autoplay off), troubleshooting accordion, "Still need help?" contact button.
- Loading: brand mark + progress ring with real percentage; appliance list accessible immediately ("Browse appliances while the 3D apartment loads").
- Fallback: list grouped by room with reference photos; banner explains 3D is unavailable on this device.
- RTL: mirror layout via logical CSS properties (`margin-inline-start`), mirror directional icons, keep 3D controls unmirrored.

## 7. 3D viewer controls

- Touch: one-finger drag look/orbit, two-finger pinch zoom/dolly, two-finger drag pan; double-tap to move toward a point (within room bounds).
- Desktop: drag orbit, wheel zoom, right-drag pan, WASD walk (dashboard editor).
- Buttons (48 px, bottom-right stack): Reset view, Rooms, Fullscreen (where supported).
- Dashboard editor extras: Place hotspot (crosshair cursor, tap to raycast), Move, Align floor, Set scale, Crop box.
- Camera constraints: stay inside apartment bounds, min/max distance, no flipping under the floor.

## 8. Accessibility

WCAG 2.2 AA for all non-3D UI: keyboard navigation, visible focus, labels, 44 px targets, contrast tested, `aria-live` for processing status, captions for instruction videos (uploaded as WebVTT, optional in MVP but supported), the 3D experience always has an accessible list equivalent (fallback list doubles as screen-reader view).
