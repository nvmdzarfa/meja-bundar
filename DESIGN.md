# DESIGN.md — Meja Bundar

## Direction & Dials

- **Reading this as:** Fullstack multi-AI group workspace (landing + WhatsApp-inspired live group chat + settings console) for Indonesian-speaking owners and teams, in a warm daylight editorial-messenger style.
- **Dial:** `ENERGY 2 / RHYTHM 2 / MOTION 1`

## Palette (R-29)

- **Core Neutrals:**
  - Canvas Paper: `#F6F4F0`
  - Elevated Surface: `#FFFFFF`
  - Chat Ground: `#EFEAE2`
  - Primary Ink: `#18181B` (15.7:1 on `#FFFFFF`)
  - Secondary Ink: `#52525B` (7.4:1 on `#FFFFFF`, 6.8:1 on `#F6F4F0`)
  - Subtle Border: `#E2DDD5`
- **Core Brand & Semantic:**
  - Deep Charcoal Header/Anchor: `#1C1917` (text `#FAF8F5`, 16.8:1)
  - Owner Bubble Tint: `#FFF3E8` with border `#F3D5BD` and ink `#18181B`
  - Danger / Error Surface: `#FEF2F2`, border `#FCA5A5`, text `#991B1B` (7.9:1)
- **Single Deliberate Accent:**
  - Burnt Terracotta `#C2410C` for primary solid CTAs and active tab/button fills (5.3:1 with `#FFFFFF` text — passes WCAG AA).
  - Warm Orange `#EA580C` (matching `assets/icon.svg`) strictly for non-text brand emblem, focus rings, and small seat markers.

## Typography (R-06)

- **Sans (`Plus Jakarta Sans`):** Chosen for crisp Indonesian diacritic/word-shape legibility and warm geometric neutrality suited to a conversational workspace.
- **Mono (`IBM Plex Mono`):** Reserved strictly for 3-character seat codes (`M10`–`M05`), model identifiers, API paths, and 8-character relay codes.

## Purpose-Gate Decisions (R-31)

- **Color & Accent (R-01):** Terracotta `#C2410C`/`#EA580C` anchors the brand to the existing `assets/icon.svg` mark without generic blue/purple AI gradients.
- **Badges & Dots (R-09, R-13, R-31):** Role chips (`Perencana`, `Pelaksana`, etc.) and presence dots exist strictly to communicate fixed seat roles, live typing/pending/error states, and model source honesty; zero decorative glow or endless pulse.
- **Icons (R-04):** Custom inline SVG icons only where functional (settings gear, back arrow, send, image, mention, shield/lock) instead of decorative AI sparkles or stars.
- **Cards (R-14):** Landing page differentiates the Owner + 8th-seat spotlight from the 7 AI seat cards, and differentiates the 6-step pipeline timeline from the 4 mode blocks and 3 model-source panels.
- **Motion (R-19):** Transitions limited to hover/active press feedback, smooth drawer open/close, and subtle typing-indicator dots that pause under `prefers-reduced-motion: reduce`.
