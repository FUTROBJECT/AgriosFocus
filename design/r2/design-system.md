# AGRIOS design system — "R2" (Rivian-inspired)

*July 2026 · derived from Adam's Rivian R2 UI references (nav map, charger filter, app dock, driver settings, weather). A reusable token + component language for AGRIOS product surfaces. Companion file: `tokens.css`.*

The R2 language in one sentence: **a warm, light, physical world (sage map, cream surfaces) with floating dark instruments on top (rail, dock), everything a pill or a soft card, one amber accent, big friendly numerals, thin-line illustration.**

AGRIOS adaptation rule: **warm chrome, honest content.** The friendliness lives in surfaces, radii, and type — never in claims. The refusal band, dashed uncertain boundaries, visible confidence, and reachable provenance are invariants that survive any restyle.

---

## 1 · Color

| Token | Value | Use |
|---|---|---|
| `--terrain-low` | `#EFEDE3` | map canvas, lowest elevation band (warm cream) |
| `--terrain-high` | `#DDE5D3` | highest elevation band (soft sage) — hypsometric bands interpolate low→high |
| `--contour` | `#9AA08C` | minor contour lines (thin, on light terrain) |
| `--contour-index` | `#6F7562` | index contours + elevation labels |
| `--road` | `#B9B3A4` | structural boundaries: roads (Census TIGER local roads), solid non-scaling line |
| `--water` | `#8FB3C7` | structural boundaries: NHD flowlines (intermittent dashed, artificial-path faint) |
| `--surface` | `#FFFFFF` | cards, sheets, panels |
| `--surface-warm` | `#F7F6F2` | secondary surfaces, unselected rows |
| `--surface-translucent` | `rgba(255,255,255,.88)` + `backdrop-filter: blur(18px)` | floating search/chips over map |
| `--dock` | `#161618` | dark floating rail + bottom dock |
| `--dock-2` | `#242427` | selected dark rows, dark chips |
| `--ink` | `#1E1E20` | primary text on light |
| `--ink-2` | `#6E7268` | secondary text, muted labels |
| `--on-dock` | `#F4F4F2` | text/icons on dark |
| `--accent` | `#F5A623` | THE accent: active states, primary buttons, attention. One amber, used sparingly |
| `--accent-ink` | `#3D2E08` | text on amber |
| `--puck` | `#3B82F6` | location/self marker only |
| `--alarm` | `#D64545` | reserved for genuine alarm; absent by default |

Priority mapping: `watch` = ink-2 outline chip · `moderate` = dark chip · `high` = amber chip. The refusal is **amber-family, never red** (attention, not error).

### Dark theme

Gated on `html[data-theme="dark"]`, an explicit opt-in via a rail toggle — **light is the default R2 identity**; dark never auto-follows `prefers-color-scheme`. The dark instruments (`--dock`, `--dock-2`, `--on-dock`, `--accent`, `--accent-ink`) are unchanged — they were already dark, and amber still pops. Only the light-world tokens flip:

| Token | Dark value | Light value (for contrast) |
|---|---|---|
| `--terrain-low` | `#1A1B18` | `#EFEDE3` |
| `--terrain-high` | `#2E3428` | `#DDE5D3` |
| `--contour` | `#7E8470` | `#9AA08C` |
| `--contour-index` | `#C9CDBB` | `#6F7562` |
| `--road` | `#4A4B45` | `#B9B3A4` |
| `--water` | `#5E7E96` | `#8FB3C7` |
| `--surface` | `#1E1F21` | `#FFFFFF` |
| `--surface-warm` | `#26272A` | `#F7F6F2` |
| `--surface-translucent` | `rgba(24,25,26,.82)` | `rgba(255,255,255,.88)` |
| `--ink` | `#ECEDEA` | `#1E1E20` |
| `--ink-2` | `#9EA29B` | `#6E7268` |
| `--accent-tint` | `rgba(245,166,35,.20)` | `rgba(245,166,35,.16)` |
| `--shadow-float` | `0 10px 30px rgba(0,0,0,.5)` | `0 10px 30px rgba(20,20,20,.14)` |
| `--shadow-soft` | `0 4px 14px rgba(0,0,0,.35)` | `0 4px 14px rgba(20,20,20,.08)` |

The R2 edition carries both; light is default, toggle in the rail, terrain re-tints via `retintMap()`.

## 2 · Shape & elevation

- Radii: `--r-pill: 999px` (buttons, chips, search) · `--r-card: 24px` (cards) · `--r-panel: 28px` (sheets, rail, dock) · `--r-row: 16px` (filter rows).
- Shadows: `--shadow-float: 0 10px 30px rgba(20,20,20,.14)` (everything floating over the map) · `--shadow-soft: 0 4px 14px rgba(20,20,20,.08)` (cards on surfaces).
- Floating elements never touch screen edges — min 12–16px inset (the R2 rail/dock float, not flush).

## 3 · Type

- Family: DM Sans (FO standard; closest open face to the R2 humanist-geometric).
- Scale: labels 12/700 uppercase +0.08em (mono NOT used in this language — labels are sans) · body 15/400 · card titles 18/700 · section 22/800 · **display numerals 44–64/700** (the 74°F move: confidence renders BIG — `62%` as the card's hero).
- Ink on light, on-dock on dark. Amber only as accent, never body text.

## 4 · Components

- **Utility rail** (left, floating, dark): vertical pill stack — logo/initials bubble, status glyphs, settings, provenance, lock. Icons 20px, outlined, 1.75px stroke, rounded caps. Collapsed width ~64px; labels appear in an expanded flyout.
- **Floating circular controls** (right): 44–52px white circles, `--shadow-float`, one glyph each (zoom ±, recenter, layers). Stack with 10px gap.
- **Bottom dock** (dark, floating): app/action row; active item gets an amber underline bar. On mobile the dock hosts the sheet handle.
- **Search/head pill**: translucent white pill, icon + placeholder, top-left over map.
- **Cards**: white, `--r-card`, `--shadow-soft`, 20–24px padding. Section tabs as a segmented row of pills (one selected = white on `--surface-warm` track).
- **Filter rows** (charger-filter pattern): full-width rounded rows; selected = dark row with white text, unselected = `--surface-warm`. Use for layer toggles (contours / soil / weather).
- **Chips** (network-chip pattern): pill toggles; selected = dark, unselected = warm light. Use for zone quick-nav.
- **Stat tiles** (weather pattern): grid of small white cards, label 12/700 muted + value 20/700 ink. Use for signal readouts (elevation, drainage, forecast).
- **Primary button**: amber pill, `--accent-ink` text, 44px height ("Save" / "Tour your Rivian" pattern). Secondary: warm-light pill.
- **Illustration**: thin-line technical (1.75px, `--ink-2`) with amber-filled highlights and small labeled callouts (the seat-diagram pattern). Use for the ground-truth ask: a little probe-in-soil line drawing with callouts, amber where action is invited.

## 5 · The map in this language

- **Hypsometric tint bands** between contour levels, interpolated `--terrain-low` → `--terrain-high` by elevation. This is the R2 sage/cream terrain — and it is honest: the bands are the same real DEM, just filled.
- Contours thin `--contour`; index contours `--contour-index` + labels (labels are their own toggleable `data-layer="elevation-labels"` group, separate from the lines). Zone outlines **dashed** `--ink-2` (SSURGO ±40 m unchanged).
- **The refusal band**: FLAT diagonal hatching in `--accent` (the cartographic uncertain-area mark) with a **dashed** ellipse edge (the established "approximate" vocabulary) + ⟨?⟩ marker chip. No blur, no gradient — the flat graphic language is the style (Adam's call, July 2026). Never a solid line, never a pin, never red.
- Location/zone focus ring: `--puck` blue reserved for "you are here" only; active zone brightens its tint + darkens its outline.
- **Structural boundaries** (`data-layer="structures"`, default ON — real context, not speculation): roads (`--road`) drawn as solid non-scaling lines with one deduped uppercase `--ink-2` NAME label per road name; intermittent streams (NHD FCODE 46003, `--water`) **dashed** per USGS convention, artificial paths (55800) solid but thinner/fainter. Rendered ABOVE contours but BELOW the outside-wash so surround roads/streams are muted with the terrain. Context-grade accuracy stated (TIGER ±~10 m class; NHD large-scale, partly DEM-derived) — never survey.
- **Building footprints** (FEMA/ORNL USA Structures, in the same `structures` group, rendered UNDER roads/streams): small neutral polygons — `--ink-2` fill at ~0.18 opacity, thin `0.75` non-scaling solid stroke; occupancy-class **Agriculture** gets a slightly stronger fill (~0.30) so the ag structures read a touch darker. Tokens only, both themes. The layer row reads *"Roads, water & buildings (Census/NHD/FEMA)."* Footprints are ML+parcel-derived, occupancy classed — **not survey** (stated in provenance). No shadow modeling yet: building/array shadows are the agrivoltaic Pass-1 edge to come.
- **NHD ditches** (CanalDitch, FCODE 33600–33603): rendered `--water`, thin, **dash-dot** (`stroke-dasharray: 2 3 6 3`) when present, and counted in the structures inventory. But roadside ditches themselves are the honest non-layer: **Roadside ditches are not mapped in public data. Roads are drawn as lines only; where a reading calls a road a hydrological interceptor, that is stated inference, not mapped geometry.**

### The speculative-layer pattern (planting plots)

A layer that previews what a *connected* on-farm state would show, drawn so it can never be mistaken for sensed data. First use: the **planting plots** layer (three management classes derived from the real DEM's parcel-interior elevation terciles — upland / transitional / low ground).

- **Draft-dotted, neutral, no numbers.** Very light neutral fills (`--ink-2`-tinted, ~0.06 / 0.10 / 0.14; on the dark version, `--ink` at the same opacities), **dotted** non-scaling outlines (`stroke-dasharray: 1.5 4`), and **class NAMES only** — never a seed rate, yield, acreage, or any number. A single screen-constant **SPECULATIVE** corner tag rides the layer.
- **Default OFF.** The group ships `display:none`; its Layers row is unchecked. The layer row carries an inline **draft** tag.
- **Framed as a preview.** The row and a map footnote (shown only when the layer is on) read "*derived from public terrain only — illustrative. Connect planter / yield / seed data to make this layer real.*" A matching entry sits under Provenance → "not connected."
- **Refusal outranks speculation.** When both are on, the refusal band renders **above** the plots — the question mark wins over the guess. Speculative fills are clipped to the parcel and are never click targets.

This is the general contract for any future "what a connected AGRIOS would show" layer: **draft-dotted, neutral, no numbers, default off, honestly framed, and outranked by refusal.**

## 6 · Honesty invariants (restyle-proof)

1. Refusal = flat diagonal-hatched band, dashed edge, ⟨?⟩ — both interpretations shown, "the public data cannot decide." Never a solid line or pin.
2. Confidence + delta visible on every zone (here: as the big numeral).
3. Provenance chip always on screen; sources + resolution limits one tap away.
4. On-farm layer: "not connected" — never a fabricated number.
5. Nothing rendered crisper than the data: dashed soil edges, sampled contours, stated limits.

### The live-read pattern (facts, not interpretation)

A **live read** ("Read this location") fetches the five public sources for any US point client-side and renders it with the same map machinery. It produces **layers and facts, not interpretation** — the analyst layer (zone narratives, confidence, refusals) is deliberately absent; Allerton stays the baked worked example.

- **Facts-not-interpretation banner** (permanent, verbatim): `LIVE READ — layers + facts from the sources, no interpretation. The zone reading (boundary-loop passes 2–3, confidence, refusals) is the analyst layer — Allerton shows a worked example.` Rendered as a `--surface-warm` note with an amber left rule at the top of the live rail/sheet. It is the scope statement; changing it fails review.
- **No interpretation in the live path.** No zone narratives, no confidence numerals, no refusal bands, **no priority chips**. The header states *"no field bounds stated — showing the full read extent"* (a live point has no stated parcel). The card body is stat tiles (elevation range/relief/gradient/sampling), a **soil inventory card** (SSURGO map units: name · drainage · slope · % by comppct), a **structures card** (n roads named, n flowlines, n ponds, nearest-flowline distance), a **forecast card** from the real NWS periods, and one computed flag.
- **The one computed flag — collection-low candidate.** The lowest connected decile of cells (4-neighbor largest component). Drawn on the map as a **neutral `--ink-2` dashed region with a neutral computed-flag chip** — never the accent/priority language, never the refusal hatch. Its rule is printed beside it verbatim: *"rule: lowest decile, connected — a computed flag, not a judgment."* Its card carries only computed facts (min elevation, region size, distance/direction to the nearest fetched flowline, centroid).
- **Per-source progress + failure honesty.** The read runs behind an R2 **progress panel**: one row per source with a live count (`elevation 412/972`), a spinner that resolves to a check or a cross, and a **Cancel** (clean AbortController). A failed source shows a cross and a one-line consequence (*"NHD unreachable — no stream layer for this read"*); the read renders whatever succeeded and lists what didn't — **never fabricated, never silently substituted**. If **elevation itself** fails entirely the whole read fails honestly (no terrain without it) with a **retry** offer.
- **Live provenance** lists each source WITH its **real fetch timestamp** and resolution limit; sampling density is stated in the header (*sampled ~60 m — live-read resolution; a deeper read samples denser*).
- **file:// / no connection.** No live read runs; the honest capability card (the five sources a live AGRIOS would fetch) shows plus the line *"live reads need the page served over http(s) and a connection."*
- **Field chip** in the pill group toggles the active field **Allerton ↔ last live read**; the last read is cached in `localStorage` (`agrios-read-{lat4},{lon4}`), offering *"cached read from {time} · Re-read live"* on re-entry. Allerton is never cached (baked).

### The computed-reading pattern (v2 — the boundary loop by geometry + printed rules)

A live read now carries a **computed zone reading**: the boundary loop run by geometry and *printed rules*, not by an author (`engine.js`, pure + node-tested; soil map-unit **polygons** fetched from SDA in addition to the attribute inventory). It must be **visually and verbally DISTINCT from the analyst (Allerton) layer** — imitating the analyst voice is the failure mode. The vocabulary below is LAW (verify-enforced):

| Analyst (Allerton) | Computed (live v2) |
|---|---|
| priority chips high / moderate / watch | **look-first / look / quiet** chips, each carrying its fired rule id (hover/tap → the rule text verbatim) |
| confidence % + delta | **data support n/4 · sampled ~Xm** (named sources that corroborate). NEVER a percentage, NEVER "confidence" |
| authored narrative prose | **structured facts** (stat tiles) + at most **ONE** template sentence from a **finite checked-in list** (`engine.js` `TEMPLATES`); blanks are facts only. Grepping that array is the single source of computed zone prose. |
| the refusal (east low, held open) | **held-open flags** (F1/F2/F3) fired by conflict rules; the card shows the two disagreeing sources verbatim + *"the public data cannot decide — ground truth needed."* |
| banner: facts only | banner (verbatim): **"COMPUTED READING — edges found by geometry, priorities by printed rules, conflicts held open. No authored interpretation; Allerton shows the analyst layer."** |

- **Computed zones on the map** are **dotted-dash** outlines (`stroke-dasharray: 1 3 5 3`, `--ink-2`) — deliberately DISTINCT from Allerton's dashed ellipses — with a screen-constant fact-label ("Lamoni · low band"). The active/hover state tints them amber. They carry `data-zone` ids so **scroll-sync, the map↔card two-way sync, and the dock chips reuse the Allerton machinery unchanged**.
- **The outside-bounds wash is theme-aware (`--wash-fill` + `--wash-alpha`).** The surround must read *dimmed but visible, with an OBVIOUS inside/outside step*. Light: `--terrain-low` @ 0.55 (pale wash; dark strokes soften toward paper). Dark: **black @ 0.5** — it halves the surround's luminance (the obvious step) while strokes keep half their brightness (the topo stays readable). Five rounds of history compressed: a terrain-colored wash only fades strokes (background unchanged → no step at any alpha); black over a boundless live read looked like a void — but that was **missing data**, not the wrong color (live reads had no terrain beyond the bounds until spec-surround-context-v1 guaranteed a context ring); the intermediate #24261F scrim lifted the background and killed the step. With real terrain always underneath, the black veil gives contrast AND legibility. `.outside-wash` reads both tokens (CSS outranks the inline attrs; re-resolves on theme flip).
- **Held-open flags** reuse the **EXACT** established refusal treatment: flat amber hatch (`url(#refusal-hatch)`), dashed edge (`stroke-dasharray: 5 6`), and the `⟨?⟩` mark. The semantics are identical and honest — the public data cannot decide.
- **Flag instances are located claims (spec-flag-zone-identity-v1).** A flag is a claim about a PLACE, so each instance carries a **`uid`** (rule id + ordinal: `F1`, `F2a`, `F2b`…) — the `id` stays the rule id (chips/vocabulary are LAW) while all per-instance wiring (`data-flag`, map-popover lookup, cross-highlight, the rail card) resolves by `uid`, so two ponds are two distinguishable flags. F2 gains a `where: {octant, lat, lon}` and its card + popover print ONE located fact line — *"pond ≈ {octant} of the read center · {lat}, {lon}"* — the **title stays verbatim** (the located line is an added fact, never a rewrite). Duplicate NHD features on one grid cell are deduped to a single flag.
- **Twin computed-zone labels disambiguate by compass octant, facts only.** Two connected components of the same `(soil, drainage, band)` print an identical fact label; after the top-6 slice, any label-collision group appends ` · {octant}` (the zone centroid's grid-space octant, **row 0 = NORTH**), and if octants still collide, ` ({cellCount} cells)` as the tiebreak. A unique label is left untouched — distinguishers are **facts** (position, size), never narrative. The dock chips and map labels print a **short label** (first soil word + band) that drops the drainage class — a **smaller label space** where collisions can occur even between distinct full labels — so the renderer runs the same octant→cellCount ladder in short-label space (`czShortLabelMap`), reading the per-zone `octant` fact the engine always provides.
- **Zone card** (`.cz-card`): fact-label title, a rule chip (`.cz-chip--lookfirst/--look/--quiet`; `title`/`aria-label` reveal the rule text verbatim), a `data support n/4 · sampled ~Xm` line, stat tiles (soil / band / structure / size), and the one template sentence.
- **The three passes, printed.** Pass 1 finds edges (drainage-class transitions, slope breaks, the collection-low, flowlines/roads — summarized in the intro card). Pass 2 forms compound zones (connected components sharing `(drainagecl, band)`, min 12 cells, top 6 by salience: collection-low → poorly-drained → straddles-break → largest). Pass 3 fires **R1 look-first / R2 look / R3 look / R4 quiet** (verbatim text, stable ids). Everything is **deterministic** — same input → same output; no `Math.random`, no `Date`.
- **Layers panel + dock on a live read** swap the Allerton-only rows (Field zones / Refusal band / Plots) for **Computed zones** + **Held-open flags**; the dock shows one **computed-zone chip** per zone.
- **Degraded mode.** If the soil polygons are unreachable, zones are computed from **elevation structure alone** (band components), no soil-conflict flags, and a single **F3** flag states *"zone reading limited — soil boundaries unreachable this read."*
- **Provenance** gains a **soil-boundaries** source row (SDA `mupolygon` geometry, `Reduce(0.00005)`, holes ignored, any client Douglas-Peucker simplification disclosed) and stamps the engine: *"engine v2.0 · rules R1–R4, F1–F2 printed."*

### Surround context terrain (spec-surround-context-v1)

Four rounds of wash tuning ended at a data truth: on a **bounded** live read there is (almost) **no terrain outside the stated bounds to dim** — the core 972-point EPQS grid stops at the read extent, so "use current view as bounds" draws the claim at ≈ the read edge and the wash has nothing to mute. **Allerton** reads correctly only because its baked example carries an **extended surround grid** (`dem-grid-ext`); live reads had no equivalent. AGRIOS never draws terrain it didn't read — so the fix is to **READ more, coarsely, and say so**.

- **A FAILABLE surround pass (context, not survey — LAW).** After the core grid completes, a live read fetches a **surround ring**: the ext bbox = the core bbox padded **+50% of its span on each side** (ext span = 2× core), sampled at **3× the core cell spacing** (**coarse** — spec v1.1: v1 said 2×, but lattice density scales with **area**, so 2× over the doubled span cost ~as many points as the core itself; for a live instrument read time wins over surround fidelity), **ring only** (points inside the core bbox are skipped — the core already read them at full resolution). 3× doesn't divide the doubled span evenly, so the lattice is **centered** in the ext bbox and the renderer georeferences against the lattice's **actual** bbox (never a stretch). Same EPQS host (**no new hosts**), same pool/retry/abort machinery, its own progress row **"Surround terrain"** with an **honest count** (*"{N} points · coarse (3× core spacing)"*). It is **FAILABLE like History / Buildings**: any failure → a per-source consequence line + the read **still succeeds** with `surround: null`. It **NEVER** blocks or alters the core read.
- **Coarseness is stated, never hidden.** The Layers row reads *"context beyond the read core · coarse (3× core spacing) · context, not survey"*; the provenance row states the ring point count + the coarse 3× spacing. The ext grid is real: **ring cells** are the fetched EPQS context; **interior cells** are the core DEM **downsampled by bilinear interpolation** — coarser, never finer (the SAME no-fabrication bound the contour engine already honors). No upsampling tricks to fake core-grade detail.
- **Rendered exactly like Allerton's ext path.** When `read.surround` exists, hypsometric bands + contours are drawn over the ext grid with the **same** `buildBands` / `buildContours` / Chaikin+Catmull-Rom smoothing and the **same terrain tokens**, **beneath** everything the core canvas draws. Its projector maps ext-grid coords → lon/lat → **core** grid coords (`lonToGX`/`latToGY`, relative to the live `GRID_BBOX`) → `proj()`, so the core sub-region lands exactly under the core canvas and the surround **bleeds outward**. The **outside-wash outer rect grows to the extended canvas** when surround exists (the core canvas when not), so a bounded read's scrim covers **bounds → ext** exactly as it covers Allerton's baked surround. **No PARCEL → no wash**, and the surround still renders as plain context terrain.
- **The engine never sees it.** Zones, flags, rules, collection-low are computed on the **core grid only** (`computeReading(read)` unchanged). The surround is context **for the eye**, never input to the reading — **engine.js has zero diff** for this spec.
- **Cache: `surround` is OPTIONAL on the v4 schema — the schema is NOT bumped.** `isV4Read` is **unchanged**; a v4 read **without** `surround` restores exactly as before this spec (no context terrain). **Cached reads predating this spec simply have no surround until re-read** — surround arrives on the next re-read.

### Saved fields & stated bounds (spec-saved-fields-v1)

A live read can be **named, given stated bounds, annotated, and saved** — it becomes a place the farmer knows ("Home place," not "41.72, −93.41"). Registry: `localStorage` `agrios-fields` `{ v:1, fields:[{ id, name, note, lat, lon, bounds|null, createdAt, lastReadAt, readKey }] }` (`fields.js`, pure parts node-tested; cap **8** with an **honest overflow** message — *"storage full — remove a field to save another"* — never silent eviction). The reads themselves stay in the existing read cache, referenced by `readKey`; deleting a field removes its **registry entry only**. Allerton is **not** a registry entry — it is baked, always the first switcher row, labeled *"worked example — analyst layer."*

- **The honest-bounds rule (LAW).** Stated bounds are the farmer's **claim of record**, rendered **exactly like Allerton's parcel**: solid hairline boundary + muted wash outside + default framing contains the bounds. A bounded saved field sets the **`PARCEL_BBOX`-equivalent** from its `bounds` (`{lat:[s,n],lon:[w,e]}`) so `renderMap`'s existing wash / solid-boundary / parcel-framing code runs **unchanged**. Header line switches to **"stated bounds: yours — a claim you made {date}, drawn solid."**; pill row 1 shows the **name**. The **read extent** (the instrument's aperture) is unchanged and still shown in the bounds pill, and the **engine still computes over the full extent** — bounds are **identity, not blinders**. An **unbounded** saved field renders live exactly like an unsaved read (no wash, "no field bounds stated…").
- **Bounds input** (no drawing tools in v1): frame the field by pan/zoom then **"Use current view as bounds"** (reads the current view via the existing inversion), or type editable **N/S/E/W** 4-dp inputs; **clear-bounds** reverts to unbounded. Validation (pure, node-tested): inside the read extent, N>S, E>W, span ≥ ~100 m and ≤ the extent.
- **Save section** lives in the Field & date dialog, visible **only on a live read**: name (required ≤40), note (≤140), the bounds block, and an **amber Save** (`.loc-read-btn`). Re-opening a saved field **edits it in place**.
- **Field switcher** — the field chip **grows up** into an R2 charger-row panel: Allerton + saved rows (name / small coords / relative `lastReadAt` / 1-line note preview / inline `×` with confirm) + an "unsaved read" row when applicable. The **active** row is a dark (selected) charger row. Tap → restore from the read cache **instantly** via `setField(read, fieldMeta)` and drop a quiet **"cached {time} · re-read"** header chip wired to the existing re-read flow.
- **Switcher keyboard a11y (spec-switcher-a11y-v1)** — the menu honors the keyboard contract its ARIA roles promise: **roving tabindex** (one row is a Tab stop, arrows/Home/End move it, wrapping at the ends), focus enters the active-or-first row on open and **returns to the chip** on close if focus was inside, and **Delete/Backspace opens the inline confirm focused on "No"** (the safe default) with Escape cancelling just the confirm, not the panel.


## Date as an instrument control (spec-date-window-v1)

- **The date re-runs R1 for the chosen day.** On a live read the Field & date dialog's DATE section is the **fetched NWS forecast window** — a row of day chips (R2 network-chip style, ≤7, wrap on mobile) derived from the read's periods (`AGRIOS_LIVE.forecastWindow`), plus a native `<input type="date">` **clamped to `[firstDate, lastDate]`**. Selecting an in-window day sets `read.dateStr` and re-runs `computeReading` on the **same cached read** — precip context is scoped to that day (`AGRIOS_ENGINE.precipOnDate(periods, dateStr)`), so **R1 (look-first) can legitimately re-rank** as the day changes (a poorly-drained collection-low is *look-first* the day storms are forecast, *look/quiet* the day they aren't). The date is therefore an **instrument control, not a label**. This is a pure recompute — **never a network call on date change** (assertable: no HOST fetch). Out-of-window dates hit the existing **honest "no forecast held" note** — no recompute, display unchanged. Below the chips: the selected day's day/night period facts + a *"forecast window: {first}–{last} (NWS, fetched {time})"* caption. The header date pill reflects the selected day everywhere. **Allerton keeps its two baked held-day chips (Jul 3 / Jul 4) unchanged** — it is a worked example, not a live window.
- **Time-of-day is deferred, stated.** NWS gives **12-hour day/night periods, not hourly** — a clock would imply precision we don't have, so the selector works in **days** and each day shows its day/night periods as facts. Future work: hourly needs a different NWS product (**NWS gridpoints/hourly**).

### Time axis: observed record vs forecast projection (spec-time-axis-v1)

- **The certainty distinction, applied to time.** The date control spans **OBSERVED past ← today → FORECAST future** as one ribbon, and the two halves are **visibly, verbally distinct** — the same honesty invariant that separates a measured layer from a projected one, now on the time axis. **Past days** are the **observed record** (NOAA/RCC ACIS GridData, PRISM daily **~4km**): measured pcpn + hi/lo, chips lighter/quieter and **badged "observed."** **Today + future** are the **forecast projection** (NWS): warm-solid chips, badged **"forecast."** A **TODAY hinge** marker sits where the record ends and the projection begins. Window caption states both: *"observed to {today} · forecast to {last} (NOAA PRISM + NWS)."* Adam's frame: *forward-only was a false symmetry — a forecast is a projection (degrades with distance); an observation is a record (measured).*
- **Antecedent window.** History spans **~14 days back** — the antecedent-moisture window that actually matters agronomically (a poorly-drained collection-low that *did* collect during a real rain event may still be saturated). ACIS is the **7th allowlisted source**, **failable**: history fails → past days show an *"observed record unavailable"* honest note, the forward axis still renders.
- **The engine reads the record.** For a **past** selected day, R1's precip fact is the **observed pcpn ≥ 0.1"** (a real rain day), and the printed rule text becomes the honest variant **"…rain was recorded that day."** (`RULE_TEXT.R1_OBSERVED` — same rule, honest source); its data-support names **NOAA PRISM (observed)**, not NWS forecast. For **today/future** the projection variant (*"rain is in the forecast"*) is unchanged. Determinism holds per **(grid, dateStr)**; selecting a day is a **pure recompute, never a refetch** (history + forecast are both on the cached read).
- **No saturation modeling (future work).** The observed record is stated as the record it is — pcpn, hi/lo, "rain recorded." AGRIOS does **not** model antecedent-moisture / soil saturation here; that inference is the analyst layer / future work. Facts only.
- **Past dates fetch on demand (spec-observed-on-demand-v1).** The held axis is only the trailing ~14 days, but the observed record is retrievable to PRISM's start (**1981**): selecting a past date before the held window fires a single labeled ACIS fetch (*"fetching the observed record for {date} — NOAA ACIS…"* → the day joins the axis + the cached read), so **only the future beyond the forecast is refused**. The no-refetch rule now applies to **held days only**; the input's past-min widens to 1981 (caption: *"observed record back to 1981 (NOAA PRISM), fetched on demand"*), the chip row stays bounded to ~21 days, and a fetch failure — not a past-window boundary — is the only thing that now prints the honest "observed record unreachable" note.

**OPEN QUESTION (2026-07-05, Adam):** the data-support fraction (n/m at hero scale) is penciled in, not settled — Adam accepts the honesty logic but isn't sure it's the right *metric*. Revisit with real users; candidates: corroboration count, per-source agreement icons, sampling-density grade.
