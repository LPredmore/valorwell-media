

# Rebrand: ContentHub → Flurra

## Concept
Position Flurra as a **"team member,"** not a tool. Warmer, more conversational, more confident. Lean into the deep-navy + electric-blue/aqua/mint gradient from your logo. Move from the current corporate indigo to a sophisticated dark-first palette with a friendlier voice everywhere copy lives.

## Brand identity

**Name:** Flurra (replaces "ContentHub" everywhere)

**Color system** (extracted from your logo):
- Deep navy `#101A2B` → `#16263D` (background gradients)
- Electric cyan `#11C5FF` (primary action)
- Cobalt `#2E7BFF` (secondary accent)
- Mint `#4BE09E` (success / "live" states)
- Light mode stays available but the default app shell shifts to dark-first to match the logo

**Typography:** Keep Inter but add **Space Grotesk** for the wordmark and section headlines — gives the modern, slightly playful "team member" feel.

**Voice shift:** Microcopy moves from imperative tool-speak ("Generate content", "No unscheduled content") to first-person teammate ("I'll write your script", "Nothing waiting in the queue — want me to draft something?"). Applied selectively to high-visibility surfaces (onboarding, empty states, headers) — not every label.

## Assets

1. Copy `flurra_favicon_vector.svg` → `public/favicon.svg` (replace `favicon.ico` reference)
2. Copy the chibi mascot PNG → `src/assets/flurra-mascot.png` — used on Login, Signup, Onboarding step 1, and the empty-state for first-time users
3. Add a small wordmark-only SVG inline in `AppLayout` header

## Files to change

| File | Change |
|---|---|
| `index.html` | Title → "Flurra"; description, og tags, favicon to `/favicon.svg`, theme-color meta |
| `public/favicon.svg` | New — copy of uploaded SVG |
| `src/assets/flurra-mascot.png` | New — copy of uploaded mascot |
| `src/index.css` | Replace color tokens; default `<html>` to `dark` class; add Space Grotesk import; subtle gradient background utility |
| `tailwind.config.ts` | Add `font-display: ['Space Grotesk', ...]`; add `brand-cyan`, `brand-mint`, `brand-cobalt` semantic colors |
| `src/components/AppLayout.tsx` | Wordmark "Flurra" with gradient text; mascot 24px avatar next to wordmark; nav restyled with pill active state |
| `src/pages/Login.tsx` | Mascot above wordmark; "Hi, I'm Flurra" tagline; warmer microcopy |
| `src/pages/Signup.tsx` | Same treatment; "Let's get you set up" |
| `src/pages/Onboarding.tsx` | Replace "Welcome to ContentHub" → "Hi, I'm Flurra"; rewrite the 4 flow steps in first person ("I'll capture your ideas…", "I'll write the script…", "I'll schedule it…", "I'll post it for you"); mascot in step 1 |
| `src/pages/Connections.tsx` | Copy: "…publish content directly from Flurra" |
| Empty states (`UnscheduledTab`, `ScheduledTab`, `IncompleteTab`, `PastTab`, `Ideas.tsx`) | Friendlier first-person empty copy |

## Out of scope (intentional)
- Server-side `info@valorwell.org` email branding (separate concern — that's transactional infra, not the user-facing app)
- Edge function prompt content (ValorWell brand guidance for clients stays — that's the user's content domain, not Flurra's product brand)
- Database column renames

## Technical decisions

1. **Dark-first by default**, light mode preserved. The logo lives natively against deep navy — forcing it onto white backgrounds (current state) loses contrast. Add `class="dark"` to `<html>` in `index.html`. Users who later want a theme toggle can have one added; we don't build it now.
2. **Gradient brand text** for "Flurra" wordmark via `bg-gradient-to-r from-[--brand-cyan] via-[--brand-cobalt] to-[--brand-mint] bg-clip-text text-transparent` — matches the logo's wave-gradient signature.
3. **Mascot used sparingly** — only auth/onboarding/first-run empty states. Inside the app shell it's a small avatar next to the wordmark, not a recurring character. Keeps it from feeling cartoonish in daily workflow views.
4. **Single CSS variable swap** drives the entire palette change — no component-level color rewrites needed because everything already consumes `hsl(var(--primary))` etc.

## Verification after build
- `getflurra.com/login` shows new wordmark + mascot, dark background
- Schedule page tabs render correctly with new accent colors
- YouTube "Connect" button still uses the brand cyan as primary
- Favicon updates in browser tab

