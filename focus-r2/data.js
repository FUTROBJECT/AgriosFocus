/* =============================================================================
 * AGRIOS Focus — field data (AGRIOS honest instrument only, no Confluence panel)
 * Allerton, IA field (40.897°N, −93.197°W) · one fixed "today": 2026-07-03
 *
 * REAL PUBLIC DATA — not illustrative. Every reading, confidence figure, and the
 * one refusal below traces VERBATIM to `data-real/field-scan-allerton.md`, fetched
 * 2026-07-03 from public APIs:
 *   · USGS 3DEP   — 10 m DEM, EPQS point service (elevation)
 *   · USDA SSURGO — mapped at 1:24,000, Soil Data Access query 2026-07-03 (soil)
 *   · NWS         — grid DMX 88,18, api.weather.gov (forecast)
 * The "instruments" are these PUBLIC DATASETS, not on-farm sensors: no buried
 * probes, no drone passes. Each signal's `conditions` states the source's REAL
 * resolution limit (e.g. a 1:24,000 map-unit boundary is placed only to ±~40 m).
 *
 * Layers genuinely NOT available from public data — on-farm soil moisture, ET0,
 * agricultural debt — are shown UNAVAILABLE, never faked. No zone carries a
 * stressBudget; the card prints an honest "on-farm layer: not connected."
 *
 * Zone order here is READING ORDER for the scroll narrative: the loop walks the
 * drainage gradient SW ridge → central grade → NW flat → east low (Pass 1→2→3),
 * ending on the held-open refusal.
 *
 * Schema per zone:
 *   id, name, soil, priority ('high'|'moderate'|'watch'), confidence (0..100),
 *   confidenceDelta (signed), resolvable (bool — false ONLY for east low),
 *   loopNote (the Pass 1→2→3 tie), signals[] { instrument, reading, conditions },
 *   refusal (east low only) { line, why, reads[] two interpretations }.
 * ========================================================================== */

const FOCUS_DATA = {
  field: {
    name: "Allerton, IA",
    coords: "40.897°N, −93.197°W",
    coordsLat: "40.8977",   // parcel-center latitude (input placeholder)
    coordsLon: "−93.1970",  // parcel-center longitude (input placeholder)
    date: "2026-07-03",
    dateLabel: "July 3, 2026",
    acreage: "~400 acres · corn/soybean · Wayne County, IA",
    gradient: "~55 ft of fall, SW ridge (1041 ft) → E low (986 ft). Water sheds east; the east side is the collection ground.",
    honesty: "Read from public data only — USGS, USDA, NWS, sampled ~25 m. Terrain beyond the stated field bounds is shown muted — same public data, outside the scan focus. Roads and mapped flowlines from Census TIGER and USGS NHD — structural edges the loop reads, at context-grade accuracy. The map never speaks past the sensors."
  },

  /* Reading order = drainage order. Each zone's map geometry (fx,fy grid
   * fractions) is in focus.js ZONES and traces to the same field geography. */
  zones: [
    /* --- 1 · SW–S shoulders — Gara, well-drained, 9–25% · the ridge ------- */
    {
      id: "sw-s-shoulders",
      name: "SW–S shoulders",
      soil: "Gara clay loam/loam (well drained, 9–25%)",
      priority: "watch",
      confidence: 72,
      confidenceDelta: +2,
      resolvable: true,
      signals: [
        {
          instrument: "USGS 3DEP · 10 m DEM",
          reading: "1041.1 ft at the SW corner — the ridge, top of the ~55 ft fall. Water sheds off, not onto, this ground.",
          conditions: "10 m DEM · EPQS point service · 6-point coarse sample"
        },
        {
          instrument: "USDA SSURGO · 1:24,000 · SDA 2026-07-03",
          reading: "Gara clay loam/loam, well-drained, on 9–25% slopes (Mollic Hapludalfs). Sheds fast; stays quiet even with the Jul 3–4 storms incoming. Nearest road access: Vine Rd, 302 m (Census TIGER).",
          conditions: "mapped at 1:24,000 — map-unit boundary located to ±~40 m at this scale"
        },
        {
          instrument: "USGS NHD · waterbodies",
          reading: "An established 0.21-ac pond sits 91 m from this zone, inside the parcel — a dammed draw on the shoulders. Four perennial ponds sit within the field bounds (17 in the surround).",
          conditions: "NHD Waterbody, large scale, FCODE 39004 (perennial); stock-pond scale mapping — extents generalized, not survey"
        }
      ],
      loopNote: "Pass 1: the high edge. Topography and soil agree — the ridge sheds; it is where the fall begins, not where anything gathers."
    },

    /* --- 2 · Central grade — Adair/Lamoni/Seymour, somewhat-poorly, 5–9% -- */
    {
      id: "central-grade",
      name: "Central grade",
      soil: "Adair / Lamoni / Seymour (somewhat poorly, 5–9%)",
      priority: "moderate",
      confidence: 65,
      confidenceDelta: 0,
      resolvable: true,
      signals: [
        {
          instrument: "USGS 3DEP · 10 m DEM",
          reading: "Center 1025.2 ft, south 1023.5 ft — mid-slope, between the SW ridge and the east low. The grade that routes water east/northeast.",
          conditions: "10 m DEM · EPQS point service · 6-point coarse sample"
        },
        {
          instrument: "USDA SSURGO · 1:24,000 · SDA 2026-07-03",
          reading: "Adair, Lamoni, and Seymour on 5–9% grades — all somewhat-poorly-drained (Aquertic/Aquic Argi- soils). The transition carrying the shed water toward the east low.",
          conditions: "mapped at 1:24,000 — map-unit boundary located to ±~40 m at this scale"
        },
        {
          instrument: "US Census TIGER · local roads",
          reading: "200th St runs 16 m from this zone — a road with ditches is a hydrological interceptor and a hard management edge across the mid-slope.",
          conditions: "TIGER local roads: context/access-grade positional accuracy, not survey"
        }
      ],
      loopNote: "Pass 2: where the edges meet. The grade is the conveyor — it carries the ridge's shed water down onto the low east; it holds a little, passes most along."
    },

    /* --- 3 · NW flat — Edina, poorly-drained, 0–2% · a flat depression ---- */
    {
      id: "nw-flat",
      name: "NW flat",
      soil: "Edina silt loam (poorly drained, 0–2%)",
      priority: "watch",
      confidence: 63,
      confidenceDelta: +1,
      resolvable: true,
      signals: [
        {
          instrument: "USGS 3DEP · 10 m DEM",
          reading: "North 1009.4 ft, west 1005.4 ft — a low, flat quarter, but not the collection point the east low is. Holds water by flatness, not by slope-fed gathering.",
          conditions: "10 m DEM · EPQS point service · 6-point coarse sample"
        },
        {
          instrument: "USDA SSURGO · 1:24,000 · SDA 2026-07-03",
          reading: "Edina silt loam, poorly-drained, on 0–2% slopes (Vertic Argialbolls). A flat depression that sits wet after rain differently than the slope-fed east low — worth watching with the Jul 3–4 storms. Nearest road access: 200th St, 561 m (Census TIGER).",
          conditions: "mapped at 1:24,000 — map-unit boundary located to ±~40 m at this scale"
        }
      ],
      loopNote: "Pass 2: a second low, read apart. Flat, not slope-fed — it holds what falls on it rather than collecting what runs to it. Different mechanism, lower priority."
    },

    /* --- 4 · East low — drainage compound (Gara → Clarinda). THE refusal --
     * Lowest ground (986.5 ft, USGS). SSURGO well→poorly transition at 1:24k.
     * NWS 90°F + storms → water collects here this week. Public data cannot
     * decide between true Clarinda claypan vs a transient swale that drains.
     * resolvable: false — held open, confidence rising toward exact not-knowing.
     * ------------------------------------------------------------------- */
    {
      id: "east-low-compound",
      name: "East low — drainage compound",
      soil: "Gara (well) → Clarinda (poorly, claypan) transition",
      priority: "high",
      confidence: 60,
      confidenceDelta: +5, // rising TOWARD a more exact not-knowing, not an answer
      resolvable: false,
      signals: [
        {
          instrument: "USGS 3DEP · 10 m DEM",
          reading: "986.5 ft at the east point — the lowest of six sampled; ~55 ft below the SW ridge (1041.1 ft). Water sheds east; this is the collection ground.",
          conditions: "10 m DEM · EPQS point service · 6-point coarse sample (confidence reflects sampling density, not just DEM accuracy)"
        },
        {
          instrument: "NWS forecast · grid DMX 88,18",
          reading: "90°F Jul 3 with showers & thunderstorms Jul 3–4 (88°F Jul 4). Storm water collects on this poorly-drained low this week.",
          conditions: "fetched 2026-07-03 · nearest station KCNC logged no measured precip in the prior 6 h"
        },
        {
          instrument: "USDA SSURGO · 1:24,000 · SDA 2026-07-03",
          reading: "Drainage transition on the low east: well-drained Gara (9–25%) grading to poorly-drained Clarinda claypan (5–14%). The survey generalizes; it does not resolve within-field micro-drainage.",
          conditions: "mapped at 1:24,000 — a map-unit boundary at this scale is located only to ±~40 m"
        },
        {
          instrument: "USGS NHD · flowlines",
          reading: "A mapped intermittent flowline passes 14 m SE of the low — the drainage network runs through the field (4 segments cross the parcel), exiting southeast. Watrous Rd at 82 m is the inspection access.",
          conditions: "NHD large-scale; flowlines are partly DEM-derived — this sharpens the question of where water exits; it does not decide claypan vs. through-drainage"
        }
      ],
      refusal: {
        // The held-open state. Not an error. "Something here. Cannot say what. Look."
        line: "Something here. I cannot say what. Look.",
        why: "Public data agrees the east side is the low collection ground and that a well→poorly drainage transition runs through it — but it cannot place the Gara↔Clarinda boundary within survey scale (±~40 m), cannot say whether a given low spot is true Clarinda claypan or a transient swale that drains, and cannot reconcile the offset between 'poorly-drained here' (SSURGO) and 'low point here' (10 m DEM). The NHD flowline 14 m SE sharpens the question of where the water exits — but NHD large-scale flowlines are partly DEM-derived, so it is not an independent witness and cannot decide claypan vs. through-drainage. Confidence rose today — toward a sharper description of that gap, not toward closing it.",
        cannotDecide: "The public data cannot decide.",
        ask: "Ground truth would settle it: a probe, a soil pit, or your own knowledge of where it ponds after rain.",
        reads: [
          {
            tag: "Clarinda claypan",
            claim: "This low is true Clarinda claypan — a Vertic Argiaquoll that holds water for days. A persistent, wet problem.",
            support: "SSURGO returns Clarinda (poorly drained, claypan) among the low-flat components, and USGS confirms this is the lowest collection ground where storm water gathers."
          },
          {
            tag: "Transient swale / offset",
            claim: "This is a transient swale that drains and is fine — the 'poorly-drained' map unit and the 10 m low point don't pin the same spot.",
            support: "At 1:24,000 the boundary is placed only to ±~40 m, and the soil 'poorly-drained here' does not reconcile with the DEM 'low point here'. The public data cannot say the claypan sits exactly where the water pools."
          }
        ]
      },
      loopNote: "Pass 3, now: 90°F + storms Jul 3–4 into the lowest, poorly-drained collection ground = this compound intensifies this week. It is the highest priority — and the lowest confidence. Act, or look?"
    }
  ],

  // Public-data provenance — the honesty made checkable. Opens from the chip.
  provenance: {
    fetched: "2026-07-03",
    label: "public data · USGS/USDA/NWS/Census",
    sources: [
      { name: "USGS 3DEP", detail: "10 m DEM · EPQS point service · extended grid 128×98 sampled ~25 m, fetched 2026-07-04", limit: "sampled ~25 m (the DEM itself is 10 m); contours smoothed within sampling tolerance (≤ ~9 m). Terrain beyond the stated field bounds is the same public data, shown muted — outside the scan focus. 5 ft interval, 25 ft index (5 ft is near the 10 m DEM's vertical resolution — fine structure is real but at the data's limit)" },
      { name: "USDA SSURGO", detail: "mapped at 1:24,000 · Soil Data Access · SDA 2026-07-03", limit: "a map-unit boundary at this scale is located only to ±~40 m; cannot resolve within-field micro-drainage" },
      { name: "NWS forecast", detail: "grid DMX 88,18 · api.weather.gov", limit: "grid forecast, not a field observation; nearest station KCNC" },
      { name: "US Census TIGER", detail: "TIGERweb Transportation · Local Roads · fetched 2026-07-04", limit: "positional accuracy is generally good (±~10 m class) but the layer is for context and access, not survey" },
      { name: "USGS NHD", detail: "National Hydrography Dataset · Flowline — Large Scale + Waterbody — Large Scale · fetched 2026-07-04", limit: "flowlines mapped, partly DEM-derived; headwater placement can drift from field reality; unnamed = unverified locally. Waterbodies: 17 established ponds mapped in the extended bbox (4 inside the parcel), stock-pond scale (0.1–0.5 ac); extents generalized, not survey" },
      { name: "FEMA/ORNL USA Structures", detail: "building footprints · OCC_CLS/SQFEET/HEIGHT · fetched 2026-07-05 · 32 footprints in the Allerton surround (Agriculture 6, Residential 25, Unclassified 1)", limit: "ML+parcel-derived footprints, occupancy classed — not survey" }
    ],
    // Layers genuinely NOT fetched — shown as unavailable, never faked.
    unavailable: [
      "on-farm soil moisture (needs field sensors)",
      "ET0 (Open-Meteo unreachable at build time)",
      "agricultural-debt time series (needs on-farm feeds)",
      "planting plots (speculative — derived from public terrain only, illustrative; needs planter / yield / seed data to make real)",
      "Roadside ditches are not mapped in public data. Roads are drawn as lines only; where a reading calls a road a hydrological interceptor, that is stated inference, not mapped geometry."
    ]
  },

  /* REAL NWS forecast — the ONLY two days this static build holds, fetched
   * 2026-07-03 from api.weather.gov grid DMX 88,18 (traces to
   * data-real/field-scan-allerton.md lines 44–46). Structured (not string-
   * parsed) so the Field & date dialog can swap the weather tile between the
   * two real days with NO parsing and NO fabrication. There is no third day:
   * any other date is answered with an honest "no forecast held" note, never a
   * made-up reading. `key` is the <input type="date"> value; `chip` the chip
   * label; tempF/label the weather-tile hero + line; sub the grid citation. */
  forecasts: {
    "2026-07-03": {
      key: "2026-07-03", chip: "Fri Jul 3", default: true,
      tempF: 90, label: "showers & thunderstorms",
      line: "Fri Jul 3 · showers & thunderstorms",
      sub: "Sat Jul 4 · 88°F, storms · NWS grid DMX 88,18"
    },
    "2026-07-04": {
      key: "2026-07-04", chip: "Sat Jul 4", default: false,
      tempF: 88, label: "showers & thunderstorms",
      line: "Sat Jul 4 · showers & thunderstorms",
      sub: "Fri Jul 3 · 90°F, storms · NWS grid DMX 88,18"
    }
  },
  // Shown when the user picks any date the build does NOT hold. Honest refusal:
  // no fabricated weather, ever. The live product would query api.weather.gov.
  forecastMissingNote: "No forecast held for that date. This build carries NWS data fetched 2026-07-03 (Jul 3–4). A live AGRIOS queries api.weather.gov at read time.",

  // The on-farm layer line each card prints where a debt bar would be.
  onFarmLine: "on-farm layer: not connected — debt tracking needs field sensors."
};

// Expose on window for the browser bootstrap (const does not attach to window).
if (typeof window !== "undefined") { window.FOCUS_DATA = FOCUS_DATA; }
// Support both a plain <script> tag (browser) and node require() (checks).
if (typeof module !== "undefined" && module.exports) {
  module.exports = { FOCUS_DATA };
}
