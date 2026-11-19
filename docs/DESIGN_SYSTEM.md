# Nookscanner: Design System

Version 1.1 (2026-11-20). Tokens are implemented in `packages/design-tokens` (TypeScript source of truth, generates CSS custom properties). A test verifies WCAG contrast for the documented text/background pairs.

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

- Latin: **Inter** (variable, OFL; registered as `'Inter Variable'` by `@fontsource-variable/inter` 5.3.0). Arabic: **IBM Plex Sans Arabic** (OFL, `@fontsource/ibm-plex-sans-arabic` 5.3.0, weights 400/500/600). Headings may use Inter with tighter tracking (-0.01em). Both self-hosted (no third-party font requests from the guest app).
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

## 8b. Implementation (Stage 3.1/3.2)

Tokens are consumed as CSS custom properties (`--nt-*`) from `@nookscanner/design-tokens/tokens.css` in both apps (ADR-015: no Tailwind). Components live in `packages/ui` (`Button`, `TextField`, `SelectField`, `Modal` on native `<dialog>`, `ToastProvider`/`useToast`, `StatusPill`, `DataTable`, `EmptyState`, `ErrorState`, `Skeleton`, `Spinner`) with styles in `packages/ui/src/ui.css` using only tokens and logical properties. Every component has Testing Library + axe tests; pages are scanned with axe in Playwright (WCAG 2.2 AA tags).

## 9. Screen designs (v1.1, 2026-11-20)

Visual references: the user's concept mockups in [`docs/design/`](design/) (`01-guest-3d-viewer.png`, `02-guest-instructions.png`, `04-guest-arabic.png`). They are AI concept images, not exact specs: tokens in this document win wherever they differ. Screens without a mockup (9.3-9.6) are designed here from the tokens; every decision is recorded so later mockups can be compared against it.

### 9.1 Guest 3D view (from mockup 01)
- Full-bleed 3D canvas on `viewer.background`. Top bar: glass panel (`viewer.panel`, radius lg, e3), brand mark + "Nookscanner" (start), apartment name centred, segmented EN / عربي toggle (end). Text `viewer.text`.
- Hotspots: 44 px hit area, 28-36 px circle, 2 px Brass ring, white line icon of the category; selected hotspot shows a light label chip ("Living room AC") under it.
- Bottom stack (bottom to top): search field (glass, pill radius, placeholder "Search: AC, oven, washing machine"), room chips row (horizontal scroll; active chip `brand.primary` with white text, others surface/white with ink text; each chip has a room-type icon).
- Floating controls (end side, above the chips): 48 px round buttons, "Move/Look" (Lagoon) and "Rooms / overview" (Brass). Controls are not mirrored in RTL (DESIGN_SYSTEM 6).
- **Decision:** mockup 01 is a landscape tablet; phones use the same structure in portrait with the top bar compacted (brand mark only + name + toggle).
- **Implemented (3.4):** `apps/guest/src/Experience.tsx` + `experience.css`. Until the 3D viewer exists (Phase 7) the stage shows a status note and the appliance list for the selected room sits below the dock; without WebGL2 the list shows all rooms (fallback). Review notes: Arabic copy avoids tanween in UI strings because Plex Arabic subsets can render the mark offset in WebKit; status badges never sit inside truncated text.

### 9.2 Guest instruction sheet (from mockups 02 and 04)
- Bottom sheet over the 3D view (snap 40% / 90%), surface colour, radius lg top corners, grab handle. The 3D view above keeps the appliance highlighted with a Brass glow ring.
- Header: appliance title (2xl, 600), meta line "Brand Model · Room" in muted, "Verified" pill (success) only when the instruction version is verified.
- Video card: poster image with a 56 px Lagoon play button and duration ("Watch 45 sec video"); never autoplays.
- Steps: numbered list; number badge 24 px Lagoon circle (Brass in mockup 04: **decision: Lagoon in both languages** for consistency and contrast); optional step icon; each row expandable for detail/image.
- Troubleshooting: accordion row with question icon ("Not cooling? Troubleshooting").
- Primary action: full-width Lagoon button with headset icon "Still need help? Contact support".
- Arabic (mockup 04): full RTL mirror via logical properties; Arabic digits in step badges follow the locale; IBM Plex Sans Arabic; language toggle at the bottom of the sheet as well as in the top bar.

### 9.3 Manager dashboard shell (no mockup; implemented in Stage 3.3)
- Left sidebar 248 px (collapsible to 72 px, remembered per browser), surface colour with an end border; brand mark (doorway arch in `brand.accentStrong`) + lowercase wordmark in Lagoon.
- Organization switcher under the brand (label "ORGANIZATION" xs uppercase muted, select below).
- Navigation: 44 px rows, 20 px line icons, active row `brand.primarySoft` background with Lagoon text and `aria-current="page"`.
- Footer: signed-in email (muted, truncated) + ghost "Sign out".
- Header: 64 px, canvas background, breadcrumbs (muted links, "/" separators, current page ink), active organization name at the end.
- Content: max 1280 px, 32 px top padding; page title 3xl/600 with -0.01em tracking; panels are surface + border + e1 + radius md (cards used sparingly, not as a card grid).
- Below 768 px: sidebar becomes an off-canvas drawer (hidden from the accessibility tree when closed) opened by a menu button in the header.
- Overview (Phase 4+): "Needs attention" list first (scans needing review, failed processing, unverified instructions), then apartments table with status pills; no vanity metrics on the first screen.

### 9.4 Guest search results (no mockup; Phase 9.3)
- Typing in the bottom search field raises a results sheet (40% snap) above the keyboard.
- Results are grouped by appliance and show the room explicitly, because the same appliance type can exist in several rooms: row = category icon (Brass ring, as on the hotspot) + name ("Air conditioner") + room ("Bedroom 1") + chevron. Example: "AC" returns "Living room AC" and "Bedroom 1 AC" as two rows.
- Matching uses EN/AR aliases; the matched alias is shown in muted text when it differs from the name ("matches: split unit").
- Selecting a row closes the keyboard, flies the camera to the hotspot (or cuts when reduced motion is on), pulses the hotspot and opens the instruction sheet.
- No results: "No appliance called '…' in this apartment" + up to 4 suggested categories as chips + "Browse all appliances" (opens the list view).

### 9.5 Nookscanner Capture (no mockup; Phase 5.4)
- Dark capture UI (`viewer.background`), camera preview full screen, controls in the thumb zone; all targets >= 44 px.
- Top: checkpoint progress ("Living room · 2 of 7") as a segmented bar; current checkpoint name large.
- Centre overlay: live guidance chip that changes colour by state: Lagoon "Walk slowly", Brass "Too fast, slow down", Brass "Too dark, turn on lights", danger "Blurry, hold steadier". Never more than one message at a time.
- Bottom: 72 px record button (Lagoon ring, danger fill while recording), pause on the start side, "Next room" on the end side (enabled after the minimum coverage time). Doorway step: full-width banner "Walk slowly through the doorway into {next room}, keeping the previous room in view".
- Review screen: list of checkpoints with per-room quality summary (blur %, exposure, duration) and "Re-record" per room; upload button shows size and Wi-Fi recommendation.
- Device tiers (3D_QUALITY_BAR 1b): the capture profile and its requirements are shown on the first screen ("This phone records 4K 30 fps: recommended" / "This phone records 1080p: supported, results may be softer").

### 9.6 Hotspot editor (no mockup; Phase 8.2)
- Dashboard page with the 3D viewer taking the main area and a 360 px end-side inspector panel (surface, border-start).
- Toolbar over the viewer (top-start, glass on dark): Navigate, Place hotspot (crosshair cursor), Move, Align floor, Set scale, Crop. Active tool = Lagoon fill.
- Placing: click/tap raycasts onto the splat; a Brass ghost marker previews the hit point and surface normal; confirm opens the inspector with Room (auto-detected from floor polygon, editable), Appliance category, Brand, Model, Name EN/AR.
- Inspector also lists all hotspots of the room (status pill: unverified/verified/needs update) and shows the instruction version state; "Preview as guest" opens the guest view in a side-by-side modal.
- Keyboard: tool shortcuts (V, H, M), arrow keys nudge the selected hotspot by 1 cm (Shift = 10 cm), Delete removes with confirmation.
