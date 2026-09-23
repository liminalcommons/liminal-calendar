# Reference: Claude Opus 5.5 — 100 HTML Studies

**Source:** <https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/>
**Noted:** 2026-09-23

A public gallery of 100 self-contained, single-file web pages generated with
Claude Opus 5.5 — landing pages, editorial layouts, dashboards, tools, games,
generative art and physics simulations. It is a rich reference for
**what a polished, dependency-free HTML page can look like** and, more usefully,
**how to prompt for one**.

## Why it's useful

- **Every page is one file.** All CSS, JS and SVG are inlined; no fonts,
  images, CDNs or libraries. Each works offline and is responsive on mobile.
  Good for studying technique without build tooling in the way.
- **The original prompt is published for every study.** Each card has a
  "Prompt" toggle, and a matching `.txt` sits next to each page
  (e.g. [`031-twenty-four-seasons.txt`](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/031-twenty-four-seasons.txt)).
  These prompts are excellent templates: they name an exact palette in hex,
  a concept/metaphor for the whole page, the interactions, a type treatment,
  and performance/accessibility constraints.
- **Thumbnails** live at `thumbs/<file>.jpg` for quick visual browsing.

File naming: `NNN-slug.html` (page), `NNN-slug.txt` (prompt),
`thumbs/NNN-slug.jpg` (screenshot), all relative to the source URL.

## How to use it for this project

1. Find a study whose feel or mechanic matches what you're building.
2. Read its `.txt` prompt to see how the brief was specified, and adapt the
   structure (concept → palette → layout → interactions → constraints) for our
   own prompts or design specs.
3. View source on the `.html` to study the implementation. Treat it as
   reference only — rewrite in our stack (Next.js + Tailwind) rather than
   copy-pasting, and don't reuse code verbatim: the gallery states no license.

### Most relevant to Liminal Calendar

The landing page already uses a seasonal wheel, Tufte-style sidenotes and a
hand-drawn map, so these are the closest matches:

| # | Study | Why |
|---|---|---|
| 031 | [Nijūshi Sekki — The Twenty-Four Seasons](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/031-twenty-four-seasons.html) | SVG volvelle of the 24 solar terms, traditional colour palette, vertical text via `writing-mode` — direct precedent for our seasonal wheel. |
| 044 | [Selene — Tide & Moon Clock](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/044-tide-moon-clock.html) | True moon phase for today; calm, time-aware visual. |
| 091 | [Alpenglow — A Day in the Mountains](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/091-alpenglow-day-cycle.html) | Palette and lighting that follow the time of day. |
| 078 | [Four Seasons — A Fractal Tree](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/078-fractal-tree-seasons.html) | Seasonal transitions in a generative scene. |
| 090 | [Horologe — The Word Clock](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/090-word-clock.html) | Typographic, live-time display. |
| 046 | [Tend — A Habit Garden](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/046-habit-garden.html) | Gentle tracker UI for recurring items — useful for recurrence views. |
| 008 | [The Last Keepers](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/008-lighthouse-longform.html) | Typography-led long read (measure, serif body, scroll storytelling) — fits the essay section. |
| 036 | [Meridian Metro](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/036-transit-map.html) | Printed-poster diagram style — reference for the gathering-places map. |
| 012 | [Nimbus — Weather Dashboard](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/012-nimbus-weather.html) | Calm editorial dashboard for a week of data. |
| 050 | [Loading, Beautifully](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/050-loader-atelier.html) | 16 loaders and micro-interactions for loading/empty states. |

## Recurring techniques worth borrowing

- **Canvas / WebGL:** particle systems, flow fields (simplex noise), stable-fluids
  solver, metaball fragment shaders, 2D wave equation.
- **SVG:** procedural ornament and illustration, `clipPath` masks, gear trains,
  L-system plants, radial/volvelle layouts.
- **CSS:** 3D transforms (card flips, origami, corridors), glass/neu/claymorphism,
  `writing-mode` vertical text, blend modes for foil/holo effects,
  scroll-driven typography.
- **Motion & physics:** velocity-Verlet integration, spring damping for tilt and
  hover, seeded randomness so generative pieces are reproducible.
- **Audio:** Web Audio synthesis and `AnalyserNode` visualisation, always
  started behind a user gesture / sound toggle.
- **Constraints the prompts often state:** exact hex palette, fictional
  brand/content, mobile layout, "performance-minded", and occasionally
  `prefers-reduced-motion`.

## Full catalog

Grouped by theme (grouping is ours; the gallery itself is numbered 001–100).

### Landing, product & brand pages

| # | Study | What it is |
|---|---|---|
| 001 | [Aurora Glass — Stillwater](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/001-aurora-glass.html) | A landing page for "Stillwater", a fictional breathing and meditation app, built as refined glassmorphism over a living night sky. |
| 010 | [Mercury](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/010-liquid-mercury.html) | A luxurious hero page for MERCURY, a fictional generative-audio studio. |
| 015 | [The Aurelian](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/015-art-deco-hotel.html) | A symmetrical, jazz-age landing page for The Aurelian, a fictional 1928 grand hotel, built as a tower you ride through: the hero is the lobby, and each section below is a floor rea… |
| 024 | [Maison Varenne — Calibre 01](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/024-luxury-watch.html) | A quiet, editorial product page for "Maison Varenne, Calibre 01", a fictional 39 mm automatic watch. |
| 035 | [Ember & Oak Coffee Roasters](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/035-coffee-roasters.html) | A warm, tactile landing page for Ember & Oak, a fictional small-batch roastery, built in the brief's espresso, roasted brown, crema, oat and copper palette with a faint paper grain… |
| 043 | [Atelier Noire — Autumn/Winter](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/043-fashion-lookbook.html) | ATELIER NOIRE is an editorial lookbook for a fictional couture house's Autumn/Winter collection. |
| 048 | [Squishy — Claymorphism UI Kit](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/048-claymorphism-kit.html) | "Squishy — Claymorphism UI Kit" is a playful landing page for a fictional product, built so almost everything looks like modelling clay and moves like it too. |
| 058 | [Radical Shapes — Milano Design Fest '86](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/058-memphis-fest.html) | RADICAL SHAPES is a landing page for a fictional festival, the Milano Design Fest '86, designed as if the Memphis movement had made its own website. |
| 082 | [Rosée — Eau de Parfum](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/082-perfume-rosee.html) | A quiet-luxury product page for Rosée, an eau de parfum from the fictional Maison Élorine, in blush #f4d6d0, cream #fff8f3, rose gold #b76e79 to #e8b4a0 and deep plum #3b1f2b. |
| 085 | [Maison Lierre — Paris 1899](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/085-art-nouveau-botanicals.html) | Maison Lierre is an Art Nouveau poster page for a fictional botanical tea house in Paris, 1899. |

### Portfolios & editorial / long-form

| # | Study | What it is |
|---|---|---|
| 006 | [Loud House Records — Issue 07](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/006-brutalist-zine.html) | A neo-brutalist web zine for the fictional label Loud House Records, laid out like a photocopied fanzine pasted onto a visible 32px grid with a numbered 12-column ruler. |
| 008 | [The Last Keepers](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/008-lighthouse-longform.html) | "The Last Keepers" is a long-read feature from the fictional Tidewater Quarterly. |
| 014 | [MOVE — A Manifesto in Motion](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/014-kinetic-manifesto.html) | MOVE is a scroll-played kinetic typography manifesto in three colours only: black #0a0a0a, off-white #f1f1ec and acid #c6ff00. |
| 020 | [Long Water — The World's Great Rivers](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/020-rivers-of-the-world.html) | An editorial data-art plate printed on pale limestone paper. |
| 022 | [Descent — Eleven Thousand Metres Down](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/022-deep-sea-descent.html) | A scroll-driven descent from a bright split-level ocean surface down to the floor of the Challenger Deep. |
| 040 | [Nonna Lucia's Lemon Ricotta Tart](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/040-lemon-tart-recipe.html) | A warm, illustrated family recipe card for a fictional grandmother's lemon ricotta tart. |
| 047 | [Vast — A Scroll Across the Solar System](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/047-solar-system-scale.html) | "Vast" is a horizontal journey from the Sun to Pluto at true relative scale, on a pure black sky with minimal thin, widely tracked white type. |
| 052 | [Helix — The Double Helix Explained](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/052-dna-helix.html) | Helix is a clean, editorial biotech explainer. |
| 056 | [Casa Lumen — Architectural Blueprint](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/056-architectural-blueprint.html) | Casa Lumen is a drawing sheet for a fictional modernist house on blueprint blue (#0b3d91 to #134a9e), with a fine and a coarse grid, film grain, a double sheet border and zone lett… |
| 063 | [Skyward — A Brief History of Flight](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/063-history-of-flight.html) | Skyward is a horizontal, drag-scrollable timeline of flight from 1783 to 1969, told as a climb. |
| 068 | [Mira Okafor — Bento Portfolio](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/068-bento-portfolio.html) | A bento-grid portfolio for Mira Okafor, a fictional product designer. |
| 072 | [Somewhere Inside](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/072-double-exposure.html) | "Somewhere Inside" is a quiet double-exposure plate. |
| 077 | [The Glass Alibi](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/077-noir-story.html) | The Glass Alibi is a short, original film-noir mystery played in black and white on a letterboxed silver screen. |
| 081 | [SIGNAL/NOISE](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/081-glitch-portfolio.html) | "SIGNAL/NOISE" is the portfolio of k.oshiro, a clearly fictional glitch artist, designed as a controlled corruption: pure black #000 and white #fff with RGB channel accents (#ff004… |
| 087 | [Pages from Juno's Sketchbook](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/087-sketchbook-portfolio.html) | "Pages from Juno's Sketchbook" is the portfolio of Juno, a clearly fictional illustrator, built as a physical spiral-bound sketchbook lying on a desk beside a pencil and an eraser. |
| 096 | [MONOLITH — Architecture & Landscape](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/096-concrete-monolith.html) | MONOLITH is the portfolio of a fictional brutalist architecture and landscape studio, built on a severe 12-column grid whose hairline guides stay visible over the whole page. |
| 098 | [Pip and the Paper Moon](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/098-paper-moon-storybook.html) | Pip and the Paper Moon is an original bedtime picture book that you read like a real hardback. |

### Dashboards, data & tools

| # | Study | What it is |
|---|---|---|
| 003 | [Raster — Swiss Poster Machine](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/003-swiss-poster-machine.html) | RASTER is a poster machine that sets one Weltformat-style sheet on off-white paper (#f2efe8) using only signal red #e30613, black #111 and white. |
| 012 | [Nimbus — Weather for Port Aurelia](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/012-nimbus-weather.html) | Nimbus is a calm, editorial weather dashboard for the fictional harbour city of Port Aurelia during an invented early-December week. |
| 021 | [Formlehre — Bauhaus Composer](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/021-bauhaus-composer.html) | "formlehre — bauhaus composer" is a tactile composition toy laid out like a printed Bauhaus sheet: a deep-cream paper page with a heavy black rule under an oversized lowercase mast… |
| 028 | [Elementa](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/028-periodic-table.html) | Elementa is a premium dark (#0d1117) periodic table of all 118 elements. |
| 036 | [Meridian Metro](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/036-transit-map.html) | Meridian Metro is a live network diagram for an invented city, drawn in the tradition of Beck and Vignelli. |
| 049 | [Riso Lab — Halftone Print Studio](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/049-riso-halftone-lab.html) | Riso Lab is a clean black-and-white print-studio tool whose output is pinned to a warm plaster wall. |
| 050 | [Loading, Beautifully](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/050-loader-atelier.html) | "Loading, Beautifully" is a refined specimen gallery of sixteen original loaders and micro-interactions, laid out as a 4×4 grid of small stages on warm charcoal (#141414); it drops… |
| 060 | [QUANTA Terminal](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/060-trading-terminal.html) | A dark, dense, professional trading terminal for a clearly fictional market. |
| 071 | [Chroma — Colour Palette Studio](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/071-palette-studio.html) | Chroma is a calm, precise palette studio in a white interface (#ffffff, #f4f4f5 panels, #18181b ink) set in a crisp system sans with monospace values. |
| 076 | [ARES VII Mission Control](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/076-mission-control.html) | ARES VII Mission Control is a "NASA-punk" flight-control dashboard for an invented crewed Mars transfer, and it is labelled throughout as simulated. |
| 089 | [SENTINEL — Radar Array](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/089-radar-console.html) | SENTINEL is a radar and sonar console built as UI art for a clearly fictional training exercise ("Exercise Grey Heron", picket station K-7, all contacts fictional). |

### Calendars, clocks & time

| # | Study | What it is |
|---|---|---|
| 004 | [The Clockmaker's Orrery](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/004-brass-orrery.html) | "The Clockmaker's Orrery" is an imagined 1774 brass instrument laid out as a museum plate on aged parchment: an engraved title and gear train on the left, the orrery itself filling… |
| 031 | [Nijūshi Sekki — The Twenty-Four Seasons](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/031-twenty-four-seasons.html) | Nijūshi Sekki is a contemplative calendar built around a large SVG volvelle of the twenty-four solar terms. |
| 044 | [Selene — Tide & Moon Clock](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/044-tide-moon-clock.html) | "Selene" is a nocturne: a navy sky with faint stars, a large moon at its true phase for today, and a still, moonlit sea below. |
| 046 | [Tend — A Habit Garden](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/046-habit-garden.html) | Tend is a calm, greenhouse-flavoured habit tracker in which every habit is a potted plant. |
| 088 | [Tempus — Hourglass Timer](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/088-hourglass-timer.html) | Tempus is a focus timer built around a physically simulated hourglass standing in a desert at dusk. |
| 090 | [Horologe — The Word Clock](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/090-word-clock.html) | Horologe is a typographic word clock that spells the current time on an original 11×10 letter grid: "IT IS TWENTY FIVE TO TEN", to five-minute precision, with four corner dots addi… |
| 091 | [Alpenglow — A Day in the Mountains](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/091-alpenglow-day-cycle.html) | Alpenglow is a full-screen canvas landscape that lives through a whole day, in a quiet, graphic style. |

### Games & playful interaction

| # | Study | What it is |
|---|---|---|
| 025 | [Pocket Metropolis](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/025-isometric-city.html) | Pocket Metropolis is a small pastel city-builder that fits in your pocket. |
| 032 | [Mythic — Holographic Card](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/032-holographic-card.html) | MYTHIC is a fictional trading-card game. |
| 033 | [Labyrinthos](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/033-stone-labyrinth.html) | "Labyrinthos" is a torch-lit maze game built as a carved stone tablet seen from above, set in a dark umber chamber between two pedimented steles. |
| 038 | [HYPERBRICK](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/038-neon-breakout.html) | HYPERBRICK is a complete, playable Breakout game built as a synthwave arcade cabinet. |
| 053 | [Arcana Nocturne — A Three-Card Reading](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/053-tarot-reading.html) | "Arcana Nocturne" is a three-card tarot reading staged on a midnight-purple velvet table under drifting gold and silver star dust. |
| 054 | [ELASTIC — Letterforms on Springs](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/054-elastic-letters.html) | ELASTIC is a dark typographic playground in deep ink (#111018), hot magenta (#ff2e88) and cyan (#29e7cd). |
| 064 | [Fridge Verse — Magnetic Poetry](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/064-magnetic-poetry.html) | "Fridge Verse" puts you nose to nose with a kitchen fridge. |
| 070 | [Grandmaster's Study](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/070-chess-study.html) | Grandmaster's Study is a complete two-player (hot-seat) chess game staged like a fine board on a green leather desk under a warm lamp. |

### Audio & music

| # | Study | What it is |
|---|---|---|
| 007 | [Soft Machine](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/007-neumorphic-synth.html) | SOFT MACHINE (model SM-16, a fictional instrument) is a fully playable polyphonic synthesizer sculpted as a single slab of soft clay (#e4e8ee) floating on a matching clay page. |
| 026 | [PULSE — Generative Audio Visualizer](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/026-pulse-visualizer.html) | PULSE is a full-screen generative music instrument and visualizer on deep plum-black #0c0612. |
| 029 | [Carriage Return — A Typewriter for Letters](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/029-typewriter-letters.html) | Carriage Return puts a fictional mint-green portable, the Marlowe 44, on a lamplit walnut desk. |
| 057 | [Hi-Fi Walnut — Vinyl Listening Room](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/057-vinyl-listening-room.html) | Hi-Fi Walnut is a private listening room rendered as a luxury object. |
| 080 | [Luminote — Piano with Falling Lights](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/080-falling-notes-piano.html) | A nocturnal, immersive piano visualizer. |
| 092 | [Ambience — Soundscape Mixer](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/092-soundscape-mixer.html) | Ambience is a calm, tactile mixer for natural sound, set in the requested earthy palette: cream #fefae0 paper, moss #606c38, deep forest #283618, sand #dda15e and clay #bc6c25. |

### Generative art & drawing

| # | Study | What it is |
|---|---|---|
| 009 | [Asterism — Draw Your Own Sky](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/009-constellation-mapper.html) | Asterism is an antique celestial atlas that you engrave yourself. |
| 011 | [Herbarium Imaginarium](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/011-victorian-herbarium.html) | Herbarium Imaginarium is laid out as the index card and open drawer of a Victorian specimen cabinet. |
| 013 | [Woolgathering](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/013-knitted-life.html) | "Woolgathering" presents Conway's Game of Life as a piece of Fair Isle knitting hanging from a wooden needle on an oatmeal linen wall. |
| 018 | [Foxglove Hollow](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/018-paper-cut-diorama.html) | Foxglove Hollow is a full-screen paper theatre: nine sheets of scissor-cut paper stacked inside a dark teal board frame with a deckle-edged cream mat, each sheet throwing a soft sh… |
| 023 | [Rosette — Symmetry Painter](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/023-symmetry-painter.html) | Rosette is a radial-symmetry drawing instrument on a near-black #070707 canvas. |
| 034 | [Currents — Flow Field Studio](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/034-flow-field-studio.html) | Currents is a quiet generative studio: the artwork fills the window edge to edge and a slim, typographically calm side panel sits to its right (a pull-up sheet on phones). |
| 039 | [Galerie Nocturne](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/039-virtual-gallery.html) | Galerie Nocturne is a small museum corridor after closing time, built entirely in CSS 3D. |
| 042 | [Infinite Coastline — Mandelbrot & Julia Explorer](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/042-fractal-explorer.html) | A full-screen, black-and-gold instrument for exploring the Mandelbrot set and its Julia sets. |
| 045 | [Vitrail — Stained Glass Generator](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/045-stained-glass.html) | Vitrail is a stained-glass workshop set in a dim stone chapel. |
| 059 | [Karesansui — A Zen Sand Garden](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/059-zen-sand-garden.html) | Karesansui is a small dry garden to tend by hand, seen from directly above. |
| 065 | [Patchwork — A Generative Quilt](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/065-generative-quilt.html) | Patchwork is a cottage-craft page that pieces a new quilt on every visit. |
| 066 | [Planet Forge — Procedural World Generator](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/066-planet-forge.html) | Planet Forge is a procedural world generator styled as a deep-space survey console. |
| 067 | [ASCII TIDES](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/067-ascii-tides.html) | ASCII TIDES is a living seascape drawn only with monospace characters, glowing like amber phosphor (#ffb000 on #140c00) by default, with Seafoam (#7fffd4 on #001414) and Paper (ink… |
| 075 | [Brush & Ink — Calligraphy Pad](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/075-calligraphy-pad.html) | Brush & Ink is a quiet, lamp-lit calligraphy desk. |
| 078 | [Four Seasons — A Fractal Tree](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/078-fractal-tree-seasons.html) | Four Seasons is a quiet, painterly landscape with one generative tree standing on a gentle rise, rolling hills dotted with small trees behind it, and a sky, a sun and drifting clou… |
| 079 | [Pulsar Ridges](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/079-pulsar-ridges.html) | Pulsar Ridges is an original, animated homage to the stacked pulse plots of radio astronomy: sixty crisp #f5f5f5 lines on pure black (#000). |
| 084 | [Crystalline — No Two Alike](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/084-snowflake-generator.html) | "Crystalline — No Two Alike" is a quiet laboratory of ice on a deep winter-blue field (#0c1b33 → #1c3a5e), where soft snow falls through three depths of focus. |
| 086 | [Rule 30 — Tapestries of Elementary Cellular Automata](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/086-cellular-tapestry.html) | "Rule 30" is presented as a museum installation: a cream, linen-textured gallery label on the left (a textile-label serif with monospace numbers), a working loom hung on a dark gal… |
| 094 | [Aquarelle — Generative Watercolour Landscapes](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/094-watercolor-landscapes.html) | Aquarelle is a painting table rather than a web page. |
| 097 | [Harmonograph — A Drawing Machine](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/097-harmonograph.html) | Harmonograph is laid out like a plate from a Victorian book of scientific recreations. |
| 099 | [Droste — The Infinite Room](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/099-droste-infinite-zoom.html) | Droste — The Infinite Room is a flat, mid-century-modern illustration that never ends. |

### Physics & simulation

| # | Study | What it is |
|---|---|---|
| 005 | [Sumi — Ink in Water](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/005-sumi-ink-in-water.html) | Sumi — Ink in Water is a quiet, full-screen ink painting that you make by letting drops fall into water over handmade washi. |
| 017 | [Harmonia — Pendulum Wave](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/017-pendulum-wave.html) | Harmonia presents the classic pendulum-wave apparatus as a quiet piece of kinetic art on a charcoal (#16171b) stage. |
| 027 | [Senbazuru — Fold a Paper Crane](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/027-origami-crane.html) | "Senbazuru — Fold a Paper Crane" folds a real, physically consistent paper crane in the browser. |
| 030 | [Orbital — N-Body Gravity Playground](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/030-gravity-sandbox.html) | Orbital is a full-screen n-body gravity playground set in deep space (#03040a). |
| 037 | [Frost Garden — Diffusion-Limited Aggregation](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/037-frost-garden.html) | Frost Garden treats diffusion-limited aggregation as a pane of night glass where ice grows in real time. |
| 055 | [Dune Engine — Falling Sand Sandbox](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/055-falling-sand.html) | Dune Engine is a falling-sand physics toy styled as a desert-dusk instrument. |
| 062 | [GROOVY — Lava Lamp](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/062-lava-lamp.html) | A warm 1970s evening scene: a brass-capped "Model 71" lava lamp (a fictional model) stands on a walnut sideboard in front of concentric-circle wallpaper in #f4a259, #bc4b51 and #5b… |
| 069 | [Apiary — The Honeycomb](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/069-honeycomb-apiary.html) | Apiary is a living honeycomb that fills the screen: hundreds of pointy-top hexagonal cells in amber #f6a821, gold #ffc93c, deep honey #c77d0a and wax #fff1c1, separated by dark com… |
| 073 | [Silicon — Living Circuit Board](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/073-circuit-board.html) | "Silicon" is a fictional development board rendered as one large responsive SVG and laid on a dark teal anti-static mat beside a datasheet-style control panel. |
| 074 | [Iridescence — Soap Bubbles](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/074-soap-bubbles.html) | Iridescence is a light, airy scene: a pale sky that fades from powder blue (#dbeafe) to blush (#fef3f2) with a warm sun bloom in one corner and faint clouds drifting across. |
| 093 | [Windwalker — A Kinetic Sculpture Simulation](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/093-strandbeest-walker.html) | "Windwalker" is a full-screen beach scene in which an original multi-legged wind sculpture, built from pale-yellow tubes with darker joints and topped by translucent billowing sail… |
| 095 | [Lines of Force — Magnetic Field Explorer](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/095-magnetic-field.html) | Lines of Force is a physics bench in steel grey: a sheet of millimetre paper, pinned at the corners, lies on a brushed-metal table beside an off-white lab notebook of controls and … |
| 100 | [Organic Wave Lab — Ripple Tank](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/100-organic-wave-lab.html) | A full-screen ripple tank that feels like a luminous physics instrument. |

### Atmospheric scenes

| # | Study | What it is |
|---|---|---|
| 002 | [Neon Rain](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/002-neon-rain.html) | A full-viewport, live-rendered cyberpunk street at night in the fictional District 9 night market. |
| 016 | [Plaza Aeterna](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/016-vaporwave-mall.html) | Plaza Aeterna is a fictional 1994 shopping mall shown as a Windows-95-style desktop floating in a vaporwave sunset. |
| 019 | [HELIOS/OS](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/019-phosphor-terminal.html) | HELIOS/OS v2.3 "Aphelion" is a fictional 1987 operating system running on a fictional Heliograph HX-14 monochrome terminal aboard a relay station. |
| 041 | [Midnight Window](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/041-rain-on-glass.html) | "Midnight Window" is a full-screen, nearly wordless nocturne: you are looking through a fogged window at night while rain runs down the glass. |
| 051 | [Hytte — A Winter Cabin](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/051-winter-cabin.html) | Hytte is a whole-screen illustrated interior: a Scandinavian log cabin at night, drawn in SVG with warm wood tones (#7a4a2a, #a0673c) and lit like a painting. |
| 061 | [Dusk Meadow — Fireflies](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/061-firefly-meadow.html) | "Dusk Meadow — Fireflies" is a quiet, full-screen canvas landscape: a sky that slowly deepens from indigo #141b41 to a dusty-rose horizon #e8a0a0, stars that appear one by one as i… |
| 083 | [Connected — A Dot-Matrix Globe](https://miaai-lab.github.io/Claude-Opus-5.5-100-HTML-Files/083-dot-globe.html) | Connected is a rotating dot-matrix Earth floating in a midnight #050a18 starfield. |
