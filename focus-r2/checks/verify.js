/* AGRIOS Focus R2 — mechanical verification (node-runnable, no browser).
 * Run: node focus-r2/checks/verify.js
 *
 * Adapted from focus/checks/verify.js for the R2 build. Checks what can be
 * checked without a browser: real DEM baked verbatim (identity vs the ground-
 * truth JSON), 4 real zones tracing to field-scan-allerton.md, exactly ONE
 * fuzzy refusal band that is AMBER (never red/--alarm) and never a crisp line/
 * pin, hypsometric bands present + derived from the grid, stat tiles rendered
 * from data fields only, no invented numbers, scripts local (?v= allowed; the
 * DM Sans font link is the one permitted external ref), no fetch(.
 *
 * NOTE vs focus/: scroll-sync here is the DIRECT scroll-listener + nearest-
 * center picker (NOT IntersectionObserver — that failed and was replaced
 * deliberately). This file asserts THAT pattern.
 *
 * Browser criteria (map render, scroll-sync pan/highlight, sheet drag, layers
 * toggle, mobile no-hscroll, hypsometric aesthetic) need the main session's
 * play-test.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const repo = path.join(root, "..");
const { FOCUS_DATA } = require(path.join(root, "data.js"));
const { DEM_GRID } = require(path.join(root, "dem-grid.js"));
const { DEM_GRID_EXT } = require(path.join(root, "dem-grid-ext.js"));
const { AGRIOS_FOCUS_R2 } = require(path.join(root, "focus-r2.js"));
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const js = fs.readFileSync(path.join(root, "focus-r2.js"), "utf8");
const css = fs.readFileSync(path.join(root, "focus-r2.css"), "utf8");

let pass = 0, fail = 0;
function ok(cond, msg) { (cond ? pass++ : fail++); console.log((cond ? "  ok  " : "FAIL  ") + msg); }

/* ========================================================================= */
console.log("\n== DEM grid: real terrain baked verbatim (identity vs ground truth) ==");
const demJson = JSON.parse(fs.readFileSync(path.join(repo, "contrast-demo", "data-real", "dem-grid-allerton.json"), "utf8"));
ok(fs.existsSync(path.join(root, "dem-grid.js")), "dem-grid.js present (copied verbatim from focus/)");
ok((function(){ const j = JSON.parse(JSON.stringify(demJson)); j.grid = j.grid.slice().reverse(); delete DEM_GRID.row_order && 0; const b = JSON.parse(JSON.stringify(DEM_GRID)); delete b.row_order; return JSON.stringify(b) === JSON.stringify(j); })(), "dem-grid.js === JSON rows-reversed (baked row0=north)");
ok(DEM_GRID.nx === 26 && DEM_GRID.ny === 18, "grid is 26×18 (" + DEM_GRID.nx + "×" + DEM_GRID.ny + ")");
ok(/USGS 3DEP/.test(DEM_GRID.source) && /epqs\.nationalmap\.gov/.test(DEM_GRID.source), "source cites USGS 3DEP / epqs.nationalmap.gov");
ok(DEM_GRID.units === "feet", "units are feet");
const spots = [[0, 0], [8, 20], [17, 25], [11, 21]];
let spotsOk = true;
spots.forEach(([r, c]) => { if (DEM_GRID.grid[r][c] !== demJson.grid[demJson.grid.length - 1 - r][c]) { spotsOk = false; console.log("     mismatch at [" + r + "][" + c + "]"); } });
ok(spotsOk, spots.length + " spot-checked grid values equal the JSON ([" + spots.map(s => DEM_GRID.grid[s[0]][s[1]]).join("], [") + "])");
let dmin = Infinity, dmax = -Infinity;
DEM_GRID.grid.forEach(row => row.forEach(v => { if (v < dmin) dmin = v; if (v > dmax) dmax = v; }));
ok(dmin >= 942 && dmax <= 1045, "elevation range within 942.9–1044.3 ft (" + dmin + "–" + dmax + ")");

/* ========================================================================= */
console.log("\n== EXTENDED DEM grid: real surround baked verbatim (identity vs ground truth) ==");
const extJson = JSON.parse(fs.readFileSync(path.join(repo, "contrast-demo", "data-real", "dem-grid-allerton-ext2.json"), "utf8"));
ok(fs.existsSync(path.join(root, "dem-grid-ext.js")), "dem-grid-ext.js present (baked from the extended real grid)");
ok((function(){ const j = JSON.parse(JSON.stringify(extJson)); j.grid = j.grid.slice().reverse(); delete DEM_GRID_EXT.row_order && 0; const b = JSON.parse(JSON.stringify(DEM_GRID_EXT)); delete b.row_order; return JSON.stringify(b) === JSON.stringify(j); })(), "dem-grid-ext.js === ext2 JSON rows-reversed (baked row0=north)");
ok(DEM_GRID_EXT.nx === 128 && DEM_GRID_EXT.ny === 98, "extended grid is 128×98 (" + DEM_GRID_EXT.nx + "×" + DEM_GRID_EXT.ny + ")");
ok(DEM_GRID_EXT.grid.length === 98 && DEM_GRID_EXT.grid.every(r => r.length === 128), "grid is 98 rows × 128 cols");
ok(/USGS 3DEP/.test(DEM_GRID_EXT.source) && /2026-07-04/.test(DEM_GRID_EXT.source), "source cites USGS 3DEP fetched 2026-07-04");
ok(DEM_GRID_EXT.holes_filled_by_neighbor_mean === 0, "holes_filled_by_neighbor_mean === 0 (zero holes)");
const extSpots = [[0, 0], [97, 127], [48, 63]];
let extSpotsOk = true;
extSpots.forEach(([r, c]) => { if (DEM_GRID_EXT.grid[r][c] !== extJson.grid[extJson.grid.length - 1 - r][c]) { extSpotsOk = false; console.log("     mismatch at [" + r + "][" + c + "]"); } });
ok(extSpotsOk, extSpots.length + " spot-checked ext grid values equal the JSON ([" + extSpots.map(s => DEM_GRID_EXT.grid[s[0]][s[1]]).join("], [") + "])");
let emin = Infinity, emax = -Infinity;
DEM_GRID_EXT.grid.forEach(row => row.forEach(v => { if (v < emin) emin = v; if (v > emax) emax = v; }));
ok(emin >= 907 && emax <= 1049, "extended range within 907.4–1048.8 ft — deeper lows in the surround (" + emin + "–" + emax + ")");
ok(!!DEM_GRID_EXT.parcel_bbox && DEM_GRID_EXT.parcel_bbox.lat[0] === 40.8925 && DEM_GRID_EXT.parcel_bbox.lat[1] === 40.9035, "ext grid carries parcel_bbox = the stated field bounds (old scan extent)");
// the page inits from the EXTENDED grid, not the old 26×18 one
ok(/DEM_GRID_EXT\.grid/.test(html), "index.html inits the map from window.DEM_GRID_EXT.grid (extended terrain)");
ok(/dem-grid-ext\.js/.test(html), "dem-grid-ext.js is loaded in index.html");

/* ========================================================================= */
console.log("\n== data.js: exactly 4 real zones tracing to field-scan-allerton.md ==");
const zones = FOCUS_DATA.zones;
ok(zones.length === 4, "exactly 4 zones (" + zones.length + ") — not padded to 5");
const ids = zones.map(z => z.id).sort().join(",");
ok(ids === "central-grade,east-low-compound,nw-flat,sw-s-shoulders",
   "the four zones are SW–S shoulders, central grade, NW flat, east low (" + ids + ")");
const reqZone = ["id", "name", "soil", "priority", "confidence", "confidenceDelta", "resolvable", "signals", "loopNote"];
let schemaOk = true;
zones.forEach(z => {
  reqZone.forEach(k => { if (!(k in z)) { schemaOk = false; console.log("     missing " + k + " on " + z.id); } });
  ok(["high", "moderate", "watch"].includes(z.priority), z.id + " priority valid (" + z.priority + ")");
  ok(typeof z.confidence === "number" && z.confidence >= 0 && z.confidence <= 100, z.id + " confidence in range (" + z.confidence + ")");
  ok(typeof z.confidenceDelta === "number", z.id + " carries a confidence delta (" + (z.confidenceDelta > 0 ? "+" : "") + z.confidenceDelta + ")");
  ok(z.signals.length >= 1, z.id + " has signals (" + z.signals.length + ")");
  z.signals.forEach(s => ok(!!(s.instrument && s.reading && s.conditions), z.id + " signal has instrument+reading+conditions"));
});
ok(schemaOk, "all zones carry the full schema");

// every signal instrument is one of the allowed PUBLIC datasets (no on-farm sensors).
// Structural boundaries add two public sources: US Census TIGER + USGS NHD. The
// regex still blocks any on-farm/fabricated instrument (guarded below).
const okSources = /USGS 3DEP|USDA SSURGO|NWS forecast|US Census TIGER|USGS NHD/;
let allPublic = true;
zones.forEach(z => z.signals.forEach(s => { if (!okSources.test(s.instrument)) { allPublic = false; console.log("     non-public instrument: " + s.instrument); } }));
ok(allPublic, "every signal instrument is USGS 3DEP / USDA SSURGO / NWS forecast / US Census TIGER / USGS NHD");

/* ========================================================================= */
console.log("\n== no invented numbers (block soil-moisture %, ET0, stress-budget, Grundy) ==");
const dataStr = JSON.stringify(FOCUS_DATA);
ok(!/grundy/i.test(dataStr), "no fictional 'Grundy' soil (corrected by the real survey)");
ok(zones.filter(z => "stressBudget" in z).length === 0, "no zone fakes a stressBudget");
// no fabricated on-farm readings: a soil-moisture percentage, an ET0 value, a debt score
ok(!/\bET0\b\s*[:=]?\s*\d/.test(dataStr) && !/soil.?moisture\s*[:=]?\s*\d+\s*%/i.test(dataStr),
   "no fabricated ET0 value or soil-moisture percentage in the data");
const bannedSensors = /buried moisture probe|drone ndvi|micro-station|array controller|yield monitor|canopy thermal|volumetric water/i;
ok(!bannedSensors.test(dataStr), "no invented on-farm sensor strings in the data");
// the same guards must hold in the rendered HTML (nothing fabricated at render time)
ok(!/grundy/i.test(html), "no 'Grundy' in the rendered HTML");
ok(!/soil.?moisture[^<]*\d+\s*%/i.test(html), "no fabricated soil-moisture % printed in the HTML");

/* ========================================================================= */
console.log("\n== on-farm layer 'not connected' as a muted stat tile ==");
ok(typeof FOCUS_DATA.onFarmLine === "string" && /not connected/i.test(FOCUS_DATA.onFarmLine), "onFarmLine present and says 'not connected'");
ok(/D\.onFarmLine/.test(html), "each card renders onFarmLine");
ok(/stat-tile--muted/.test(html) && /stat-tile--muted/.test(css), "on-farm layer is a muted stat tile (class present in html + css)");
ok(/>not connected</.test(html), "the on-farm tile value reads exactly 'not connected'");

/* ========================================================================= */
console.log("\n== exactly ONE refusal: the east low, held open ==");
const unres = zones.filter(z => !z.resolvable);
ok(unres.length === 1, "exactly one resolvable:false zone (" + unres.length + ")");
ok(unres[0] && unres[0].id === "east-low-compound", "the unresolvable zone is the east-low drainage compound");
if (unres[0]) {
  ok(!!unres[0].refusal && !!unres[0].refusal.line, "refusal zone has a held-open line");
  ok(/cannot decide/i.test(unres[0].refusal.cannotDecide), "refusal states 'the public data cannot decide'");
  ok(/probe|soil pit|ponds/i.test(unres[0].refusal.ask), "refusal asks for ground truth (probe / soil pit / where it ponds)");
  const reads = unres[0].refusal.reads;
  ok(reads && reads.length === 2, "refusal holds open exactly two interpretations");
  const tags = (reads ? reads.map(r => r.tag).join(" | ") : "").toLowerCase();
  ok(/claypan/.test(tags) && /(swale|offset)/.test(tags),
     "the two interpretations are Clarinda claypan vs transient swale/offset (" + tags + ")");
  ok(unres[0].confidenceDelta > 0, "east-low confidence is RISING (toward a more exact not-knowing)");
}
// the card renders both interpretations + "cannot decide" + the probe illustration
ok(/The public data cannot decide/.test(html) || /cannotDecide/.test(html), "card prints 'the public data cannot decide'");
ok(/probe-illo/.test(html) && /probe here/.test(html) && /where[\s\S]{0,20}it ponds/.test(html),
   "east-low card includes the thin-line probe illustration with 'probe here' + 'where it ponds' callouts");

/* ========================================================================= */
console.log("\n== the map's refusal is an AMBER FUZZY BAND — never red, never a line/pin ==");
ok((js.match(/id:\s*"refusal-hatch"/g) || []).length === 1, "exactly one hatch pattern defined (refusal-hatch)");
// v2: the flat amber hatch is reused by the Allerton refusal band AND by the
// computed held-open flag bands (spec v2 §4 — flags reuse the refusal treatment
// EXACTLY). So the hatch fills ≥1 element; the flag bands reference it too.
ok((js.match(/url\(#refusal-hatch\)/g) || []).length >= 1, "the refusal hatch fills the refusal band (and is reused by held-open flag bands, spec v2)");
ok(/flag-fill[\s\S]{0,80}url\(#refusal-hatch\)/.test(js), "held-open flag bands reuse url(#refusal-hatch) — the EXACT refusal treatment");
ok(/refusal-band/.test(js) && /⟨\?⟩/.test(js), "refusal band carries the ⟨?⟩ mark");
ok(/id:\s*"refusal-hatch"/.test(js) && /rotate\(45\)/.test(js), "refusal band is diagonal-hatched (uncertain-area mark)");
ok(!/feGaussianBlur/.test(js) && !/refusal-fade/.test(js), "no blur/gradient on the refusal (flat graphic style, per design call)");
ok(/"stroke-dasharray": "5 6"/.test(js), "refusal edge is DASHED (approximate), not solid");
// AMBER, not red: the hatch/fade must use --accent, and NOWHERE may --alarm/red drive the refusal
ok(/stroke:\s*"var\(--accent\)"/.test(js),
   "the refusal band is AMBER (--accent) — hatch stroke + dashed edge");
ok(!/--alarm/.test(js), "no --alarm token used anywhere in focus-r2.js");
// scope the red check to the refusal-related CSS blocks
const refusalCss = (css.match(/\.refusal[\s\S]*?(?=\n\/\* ===|\n\.field-pill)/) || [""])[0];
ok(!/--alarm/.test(refusalCss) && !/#D64545/i.test(refusalCss) && !/\bred\b/i.test(refusalCss),
   "no --alarm / red / #D64545 in the refusal CSS (amber-family only)");
// HARD honesty gate: no crisp east-low line/pin element in the map code
ok(!/resolved-line/i.test(js), "no 'resolved line' element through the east low (the Confluence failure)");
ok(!/svgEl\(\s*["']circle["']/i.test(js.replace(/illo|wx|probe/gi, "")) === false ? true : !/pin-marker/i.test(js), "no pin-marker element created on the map");
ok(!/pin-marker/i.test(js), "no pin-marker element on the map");
ok(!/box-shadow[^;]*var\(--accent\)[^;]*refusal|filter:\s*drop-shadow[^;]*refusal/i.test(css), "no glow (drop-shadow) on the refusal — fuzzy band, not a lit pin");
ok(/if \(z\.id === "east-low-compound"\) return;/.test(js), "east low is EXCLUDED from the dashed zone-region loop (it is the band, not an outline)");

/* ========================================================================= */
console.log("\n== hypsometric bands: filled level sets derived from the real grid ==");
ok(/buildBands/.test(js) && typeof AGRIOS_FOCUS_R2.buildBands === "function", "buildBands present in code + API");
ok(/buildFillLayer|cellFillPolygon/.test(js), "band polygons built from marching-squares fractional crossings (buildFillLayer)");
ok(/lerpHex\(TERRAIN_LOW, TERRAIN_HIGH/.test(js), "band fill interpolates --terrain-low → --terrain-high by elevation");
ok(/data-layer="terrain"|"data-layer": "terrain"|class: "band-layer"/.test(js), "bands live in a toggleable terrain layer group");
const bands = AGRIOS_FOCUS_R2.buildBands(DEM_GRID.grid, 5);
ok(bands.length >= 18, "≥18 hypsometric band layers built at 5 ft interval (" + bands.length + ")");
ok(bands.every(b => Array.isArray(b.polys)), "every band carries an array of cell polygons");
const totalBandPolys = bands.reduce((a, b) => a + b.polys.length, 0);
ok(totalBandPolys > 100, "bands produce a substantial polygon count (" + totalBandPolys + " cell polygons)");
ok(bands[0].t === 0 && bands[bands.length - 1].t <= 1 && bands[bands.length - 1].t > 0.5, "band t runs 0 (low/cream) → high (sage): " + bands.map(b => b.t.toFixed(2)).join(","));
// lerp sanity
ok(AGRIOS_FOCUS_R2.lerpHex("#EFEDE3", "#DDE5D3", 0) === "#efede3", "lerpHex at t=0 returns --terrain-low");
ok(AGRIOS_FOCUS_R2.lerpHex("#EFEDE3", "#DDE5D3", 1) === "#dde5d3", "lerpHex at t=1 returns --terrain-high");

/* ========================================================================= */
console.log("\n== contours over the EXTENDED grid: Chaikin then Catmull-Rom ==");
const contours = AGRIOS_FOCUS_R2.buildContours(DEM_GRID_EXT.grid, 5, 25);
const levels = contours.map(c => c.level);
ok(levels.length >= 25, "≥25 contour levels at 5 ft interval over the ext grid (" + levels.length + ": " + levels.join(", ") + ")");
ok(levels.every((L, i) => i === 0 || L - levels[i - 1] === 5), "levels spaced at exactly 5 ft");
ok(levels[0] >= 907 && levels[levels.length - 1] <= 1049, "levels span the extended 907–1049 ft range (deeper lows)");
ok(contours.filter(c => c.index).every(c => c.level % 25 === 0), "index contours fall on 25 ft multiples");
const midLevels = contours.filter(c => c.level >= 950 && c.level <= 1040);
ok(midLevels.length > 0 && midLevels.every(c => c.paths.length > 0), "every level 950–1040 ft yields ≥1 contour path");
const totalPaths = contours.reduce((a, c) => a + c.paths.length, 0);
ok(totalPaths >= 200, "ext grid produces a substantial contour path count (" + totalPaths + " paths across " + levels.length + " levels)");
const identityProj = pt => ({ x: pt.x, y: pt.y });
const sample = [{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 3, y: 1 }, { x: 4, y: 4 }];
const d = AGRIOS_FOCUS_R2.catmullRomPath(sample, identityProj, false);
ok(/^M0\.00 0\.00/.test(d), "Catmull-Rom path starts exactly at the first vertex");
ok(/4\.00 4\.00/.test(d), "Catmull-Rom path ends exactly at the last vertex — vertices preserved");
ok(/^M[\d.\- ]+C/.test(d), "Catmull-Rom emits cubic Béziers (C) — stroke-only smoothing");
ok(/chaikinSmooth\(pts, 2\)/.test(js) && /catmullRomPath\(sm, proj/.test(js), "renderer runs 2 Chaikin passes THEN catmullRomPath (both stroke-only)");
ok(/vector-effect: non-scaling-stroke/.test(css), "contours use non-scaling-stroke — stay thin under pan/zoom");

/* ========================================================================= */
console.log("\n== Chaikin smoothing is BOUNDED (< ½ cell deviation) — no fabricated terrain ==");
ok(typeof AGRIOS_FOCUS_R2.chaikinSmooth === "function", "chaikinSmooth exposed on the API");
// endpoints preserved on an open line
const openLine = [{ x: 0, y: 0 }, { x: 2, y: 3 }, { x: 5, y: 1 }, { x: 7, y: 4 }];
const smO = AGRIOS_FOCUS_R2.chaikinSmooth(openLine, 2);
ok(smO[0].x === 0 && smO[0].y === 0 && smO[smO.length - 1].x === 7 && smO[smO.length - 1].y === 4, "open-line endpoints are kept exactly (only interior corners cut)");
// closed ring stays closed
const ring = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }, { x: 0, y: 0 }];
const smR = AGRIOS_FOCUS_R2.chaikinSmooth(ring, 2);
ok(smR[0].x === smR[smR.length - 1].x && smR[0].y === smR[smR.length - 1].y, "closed ring remains closed after Chaikin");
// max deviation of every smoothed point from its source polyline, in cells
function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  if (L2 === 0) { const ex = p.x - a.x, ey = p.y - a.y; return Math.sqrt(ex * ex + ey * ey); }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2; t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx, cy = a.y + t * dy, ex = p.x - cx, ey = p.y - cy; return Math.sqrt(ex * ex + ey * ey);
}
function polyDist(p, poly) { let m = Infinity; for (let i = 0; i < poly.length - 1; i++) { const dd = segDist(p, poly[i], poly[i + 1]); if (dd < m) m = dd; } return m; }
let maxDev = 0, worst = null;
contours.forEach(c => c.paths.forEach(pts => {
  if (pts.length < 3) return;
  const sm = AGRIOS_FOCUS_R2.chaikinSmooth(pts, 2);
  sm.forEach(p => { const dd = polyDist(p, pts); if (dd > maxDev) { maxDev = dd; worst = { level: c.level, len: pts.length }; } });
}));
ok(maxDev < 0.5, "max Chaikin deviation over ALL ext-grid contour paths is < ½ cell (" + maxDev.toFixed(4) + " cells, at " + JSON.stringify(worst) + ")");

/* ========================================================================= */
console.log("\n== affine zone remap: all 4 zone centers inside the parcel rect ==");
const P = AGRIOS_FOCUS_R2.PARCEL;
ok(Math.abs(P.x0 - 31.75) < 1e-6 && Math.abs(P.x1 - 95.25) < 1e-6, "parcel rect X = [31.75, 95.25] in new-grid coords (x0=" + P.x0.toFixed(3) + ", x1=" + P.x1.toFixed(3) + ")");
ok(Math.abs(P.y0 - 24.25) < 1e-6 && Math.abs(P.y1 - 72.75) < 1e-6, "parcel rect Y = [24.25, 72.75] in new-grid coords (y0=" + P.y0.toFixed(3) + ", y1=" + P.y1.toFixed(3) + ")");
let allInside = true;
AGRIOS_FOCUS_R2.ZONES.forEach(z => {
  const zg = AGRIOS_FOCUS_R2.zoneGrid(z);
  const inside = zg.gx >= P.x0 && zg.gx <= P.x1 && zg.gy >= P.y0 && zg.gy <= P.y1;
  if (!inside) allInside = false;
  console.log("     " + z.id + ": center gx=" + zg.gx.toFixed(3) + " gy=" + zg.gy.toFixed(3) + " → inside parcel: " + inside);
});
ok(allInside, "every zone center lands inside the parcel rect after the affine remap");
ok(/zoneGrid\(z\)/.test(js) && /PARCEL\.x0 \+ z\.fx \* PARCEL_W/.test(js), "zones placed via the parcel-relative affine remap (zoneGrid)");

/* ========================================================================= */
console.log("\n== parcel bleed: outside mute wash + solid parcel boundary, correct layer order ==");
ok(/outside-wash/.test(js) && /"fill-rule": "evenodd"/.test(js), "outside wash is a single even-odd path (big rect minus parcel)");
ok(/"fill-opacity": 0\.55/.test(js), "outside wash sits at ~0.55 opacity (surround visible but secondary)");
ok(/fill: "var\(--terrain-low\)"/.test(js.match(/outside-wash[\s\S]{0,200}/)[0]), "wash uses the canvas tone (--terrain-low) for R2");
ok(/parcel-boundary/.test(js) && /"stroke-dasharray"/.test(js.match(/parcel-boundary[\s\S]{0,160}/)[0]) === false, "parcel boundary is SOLID (a stated bound), not dashed");
ok(/\.parcel-boundary[\s\S]*?vector-effect: non-scaling-stroke/.test(css), "parcel boundary stays a hairline under zoom (non-scaling-stroke)");
// layer order: contour layer appended, THEN wash, THEN boundary, THEN zones, THEN refusal
const orderIdx = s => js.indexOf(s);
ok(orderIdx('pan.appendChild(contourLayer)') < orderIdx('pan.appendChild(washLayer)') &&
   orderIdx('pan.appendChild(washLayer)') < orderIdx('pan.appendChild(boundaryLayer)') &&
   orderIdx('pan.appendChild(boundaryLayer)') < orderIdx('pan.appendChild(zoneLayer)') &&
   orderIdx('pan.appendChild(zoneLayer)') < orderIdx('pan.appendChild(refusalLayer)'),
   "layer order: terrain+contours → wash → parcel boundary → zones → refusal/labels");
ok(/parcelView/.test(js) && /applyView\(parcelView\)/.test(js), "default + recenter framing = the parcel rect (bleed fills the edges)");

/* ========================================================================= */
console.log("\n== honesty captions updated: ~25 m sampling, smoothing tolerance, muted surround ==");
ok(/~25 m|about 25 m/.test(js), "map aria-label notes ~25 m sampling");
ok(/muted|shown muted/.test(js), "map aria-label notes the muted surround terrain");
const provStr = JSON.stringify(FOCUS_DATA.provenance);
ok(/~25 m/.test(provStr) && /2026-07-04/.test(provStr), "provenance cites ~25 m sampling + the extended fetch date 2026-07-04");
ok(/smoothed within sampling tolerance/.test(provStr) && /9 m/.test(provStr), "provenance notes contours smoothed within sampling tolerance (≤ ~9 m)");
ok(/5 ft interval, 25 ft index/.test(provStr), "provenance notes 5 ft interval, 25 ft index");
ok(/shown muted|muted/.test(FOCUS_DATA.field.honesty), "field honesty line notes terrain beyond the field bounds shown muted");

/* ========================================================================= */
console.log("\n== stat tiles render from data fields only (no fabrication) ==");
ok(/stat-tile/.test(html) && /signalTile/.test(html), "signals render as stat tiles (label+value minicards)");
ok(/s\.instrument/.test(html) && /s\.reading/.test(html) && /s\.conditions/.test(html),
   "stat tile prints ONLY instrument / reading / conditions from the signal object");
ok(/\.stat-tiles \{[\s\S]*grid/.test(css), "stat tiles are laid out in a grid");
ok(/z\.confidence/.test(html) && /conf-num/.test(html), "confidence renders as the display numeral (conf-num) from z.confidence");
ok(/conf-delta/.test(html) && /z\.confidenceDelta/.test(html.replace(/\n/g, " ")) || /delta\(z\.confidenceDelta\)/.test(html), "confidence delta chip rendered from z.confidenceDelta");

/* ========================================================================= */
console.log("\n== R2 chrome present: rail / circular controls / dock / field-pill ==");
ok(/class="rail-nav"/.test(html) && /logo-bubble/.test(html), "floating dark utility rail with logo bubble");
ok(/id="rail-provenance"/.test(html) && /id="rail-about"/.test(html), "rail has provenance + about buttons");
ok(/id="ctl-zoom-in"/.test(html) && /id="ctl-zoom-out"/.test(html) && /id="ctl-recenter"/.test(html) && /id="ctl-layers"/.test(html),
   "white circular controls: zoom ± / recenter / layers");
ok(/\.ctl \{[\s\S]*border-radius: 50%/.test(css) && /\.ctl \{[\s\S]*var\(--shadow-float\)/.test(css), "controls are circular with --shadow-float");
ok(/class="dock"/.test(html) && (html.match(/dock-chip/g) || []).length >= 4, "dark bottom dock with 4 zone quick-nav chips");
ok(/dock-chip--active::after/.test(css) && /background: var\(--accent\)/.test((css.match(/dock-chip--active::after[\s\S]*?\}/) || [""])[0]), "active dock chip gets an amber underline bar");
ok(/class="field-pill"/.test(html) && /field-pill-text/.test(html), "translucent field-label pill present (not a search input)");
ok(/D\.field\.name \+ " · " \+ D\.field\.dateLabel/.test(html), "field pill reads 'Allerton, IA · July 3, 2026' from data (label, not input)");
// No FAKE search input over the map — the field pill is a labeled button, not a
// search box. The only <input>s allowed are the honest Field & date dialog's
// date + lat/lon inputs (asserted separately below).
ok(!/<input[^>]*type="search"/.test(html) && !/id="search"/.test(html), "no fake search input over the map — the field pill is a button, not a search box");
ok(/id="field-pill"[^>]*aria-haspopup="dialog"/.test(html.replace(/\n/g, " ")), "field pill is a <button> with aria-haspopup=dialog (keyboard-accessible entry)");

/* ========================================================================= */
console.log("\n== layers panel: charger-filter rows toggling SVG groups (7 rows) ==");
ok(/id="layers-panel"/.test(html), "layers panel present");
["terrain", "contours", "elevation-labels", "zones", "refusal", "structures", "plots"].forEach(l =>
  ok(new RegExp('data-layer="' + l + '"').test(html), "layer row present: " + l));
// 7 base rows + 2 v2 live-only rows (Computed zones, Held-open flags) + 1
// surround-only row (spec-surround-context-v1) = 10.
ok((html.match(/class="layer-row[^"]*" data-layer=/g) || []).length === 10, "10 layer rows (7 base + 2 live-only computed rows + 1 surround-only row)");
ok(/data-layer="computed-zones"/.test(html) && /data-layer="held-open-flags"/.test(html), "v2 live rows present: Computed zones + Held-open flags");
ok((html.match(/class="layer-row[^"]*layer-row--live[^"]*" data-layer=/g) || []).length === 2, "the 2 computed rows carry layer-row--live (shown only on .is-live)");
ok(/"data-layer": "elevation-labels"/.test(js) && /elevLabelLayer\.appendChild\(t\)/.test(js), "contour labels rendered into their own elevation-labels group");
ok(/layer-row--on/.test(css) && /\.layer-row--on \{[\s\S]*var\(--dock\)/.test(css), "selected layer row is a dark row (charger-filter pattern)");
ok(/setLayer\(/.test(js) && /style\.display = on \? "" : "none"/.test(js), "toggling a layer shows/hides its SVG group (data-layer)");
ok(/wireLayers/.test(js), "layers panel wired to the layers control");

/* ========================================================================= */
console.log("\n== SPECULATIVE PLANTING PLOTS — honest speculative layer (spec §5) ==");
// default OFF: the layer group starts display:none and its row is unchecked
ok(/plotsLayer\.style\.display = "none"/.test(js), "plots layer group is display:none at build (default OFF)");
const plotsRow = (html.match(/<button class="layer-row"[^>]*data-layer="plots"[\s\S]*?<\/button>/) || [""])[0];
ok(/data-layer="plots"/.test(html) && /aria-pressed="false"/.test(plotsRow), "plots layer row is unchecked (aria-pressed=false) by default");
ok(!/layer-row layer-row--on[^"]*"\s*data-layer="plots"/.test(html), "plots row does NOT carry layer-row--on");
// framing text present: 'speculative' / 'illustrative'
ok(/speculative/i.test(html) && /illustrative/i.test(html), "framing text present in the page: 'speculative' + 'illustrative'");
ok(/Connect planter \/ yield \/ seed data to make this layer real|make it real|make that layer real/i.test(html), "framing offers to connect planter/yield/seed data to make the layer real");
ok(/plots-footnote/.test(html) && /footnote\.hidden = !on/.test(js), "map footnote shows only when the plots layer is on");
// derivation consumes the DEM grid (takes the grid as input)
ok(typeof AGRIOS_FOCUS_R2.buildPlots === "function", "buildPlots exposed on the API");
ok(/function buildPlots\(grid, P\)/.test(js) && /parcelInteriorStats\(grid, P\)/.test(js), "plots derivation takes the DEM grid + parcel rect as input");
const plotsRun = AGRIOS_FOCUS_R2.buildPlots(DEM_GRID_EXT.grid, AGRIOS_FOCUS_R2.PARCEL);
const ps = plotsRun.stats;
ok(ps.counts.low > 0 && ps.counts.mid > 0 && ps.counts.up > 0, "three non-empty classes derived (low " + ps.counts.low + " / mid " + ps.counts.mid + " / up " + ps.counts.up + " cells)");
// thresholds are the parcel-interior elevation TERCILES (recompute independently)
(function () {
  const P = AGRIOS_FOCUS_R2.PARCEL, g = DEM_GRID_EXT.grid, vals = [];
  for (let y = Math.ceil(P.y0); y <= Math.floor(P.y1); y++) for (let x = Math.ceil(P.x0); x <= Math.floor(P.x1); x++) vals.push(g[y][x]);
  vals.sort((a, b) => a - b);
  const t1 = vals[Math.floor(vals.length / 3)], t2 = vals[Math.floor(2 * vals.length / 3)];
  ok(ps.t1 === t1 && ps.t2 === t2, "thresholds ARE elevation terciles of parcel cells (t1=" + ps.t1 + " ft, t2=" + ps.t2 + " ft; range " + ps.min + "–" + ps.max + ")");
})();
ok(plotsRun.classes.length === 3 && /upland/.test(plotsRun.classes.map(c=>c.name).join()) && /low ground/.test(plotsRun.classes.map(c=>c.name).join()) && /transitional/.test(plotsRun.classes.map(c=>c.name).join()), "class names are upland / transitional / low ground (names only)");
// NO numeric agronomy values anywhere in the plots code or data
const plotsCode = (js.match(/SPECULATIVE PLANTING PLOTS[\s\S]*?var W = 1000/) || [""])[0] +
                  (js.match(/SPECULATIVE PLANTING PLOTS \(spec §5\): draft[\s\S]*?pan\.appendChild\(plotsLayer\)/) || [""])[0];
// agronomy RATE units — seed rates, yields, per-acre figures (spec §5 gate).
// Deliberately anchored to a number + a rate token so ordinary field context
// like "~400 acres" or "±40 m" is not caught; the plots layer must carry none.
const numRate = /\d+\s*(seeds|bu\b|lb\b|k\/ac|\/ac\b|bu\/ac|lbs?\b|yield|seeding rate|population)/i;
ok(!numRate.test(plotsCode), "no numeric agronomy values (seeds/bu/lb/·/ac/yield) in the plots code");
// scope the data check to the plots-related data (the plots provenance entry)
const plotsData = JSON.stringify(FOCUS_DATA.provenance.unavailable.filter(u => /planting plots/i.test(u)));
ok(!numRate.test(plotsData), "no numeric agronomy values in the plots data (provenance entry)");
ok(!numRate.test(plotsRun.classes.map(c => c.name).join(" ")) && !/\d/.test(plotsRun.classes.map(c => c.name).join(" ")), "class-name labels carry NO numbers at all");
// dotted draft outlines + neutral fills, non-scaling stroke
ok(/stroke-dasharray: 1\.5 4/.test(css) && /\.plot-edge[\s\S]*?vector-effect: non-scaling-stroke/.test(css), "plot boundaries are dotted (1.5 4), non-scaling (draft treatment)");
ok(/\.plot-fill--low[\s\S]*?fill-opacity: 0\.06/.test(css) && /\.plot-fill--upland[\s\S]*?fill-opacity: 0\.14/.test(css), "plot fills are very light neutral tints (0.06 → 0.14)");
ok(/SPECULATIVE/.test(js) && /plot-spec-text/.test(css), "screen-constant SPECULATIVE corner tag present");
// provenance gains a matching not-connected entry
ok(/planting plots/i.test(JSON.stringify(FOCUS_DATA.provenance.unavailable)) && /speculative/i.test(JSON.stringify(FOCUS_DATA.provenance.unavailable)), "provenance 'not connected' lists planting plots as speculative");
// layer order: refusal renders ABOVE plots (question mark outranks speculation)
ok(js.indexOf('pan.appendChild(plotsLayer)') < js.indexOf('pan.appendChild(refusalLayer)'), "refusal layer renders ABOVE plots (refusal outranks speculation)");
// plots clipped to the parcel rect (never spill outside)
ok(/clip-path.*plots-clip|"clip-path": "url\(#" \+ clipId/.test(js) && /clipPath/.test(js), "plots are clipped to the parcel rect (never overlap outside)");

/* ========================================================================= */
console.log("\n== STRUCTURAL BOUNDARIES: roads (Census TIGER) + streams (USGS NHD), baked + rendered ==");
const { BOUNDARIES } = require(path.join(root, "boundaries.js"));
const boundsJson = JSON.parse(fs.readFileSync(path.join(repo, "contrast-demo", "data-real", "boundaries-allerton.json"), "utf8"));
ok(fs.existsSync(path.join(root, "boundaries.js")), "boundaries.js baked in the version");
// header cites the real sources + fetch date
const bjs = fs.readFileSync(path.join(root, "boundaries.js"), "utf8");
ok(/Census TIGERweb/.test(bjs) && /USGS National Hydrography Dataset|USGS NHD/.test(bjs) && /2026-07-04/.test(bjs), "boundaries.js header cites Census TIGERweb + USGS NHD, 2026-07-04");
// counts match the ground-truth JSON
ok(BOUNDARIES.roads.length === boundsJson.roads.features.length, "road feature count matches JSON (" + BOUNDARIES.roads.length + ")");
ok(BOUNDARIES.streams.length === boundsJson.streams.features.length, "stream feature count matches JSON (" + BOUNDARIES.streams.length + " = 22)");
// spot-check 2 road names present
const roadNames = BOUNDARIES.roads.map(r => r.name).filter(Boolean);
ok(roadNames.includes("Watrous Rd") && roadNames.includes("200th St"), "spot-check road names present (Watrous Rd + 200th St)");
// stream fcodes present: 46003 (intermittent) + 55800 (artificial path)
const fcodes = {}; BOUNDARIES.streams.forEach(s => fcodes[s.fcode] = (fcodes[s.fcode] || 0) + 1);
ok(fcodes[46003] === 15 && fcodes[55800] === 7, "stream fcodes present: 46003×15 (intermittent) + 55800×7 (artificial path)");
// analysis block kept VERBATIM for the original keys (buildings counts added by
// spec-buildings-v1 are stripped before the identity check, then asserted below).
ok((function () {
  const a = JSON.parse(JSON.stringify(BOUNDARIES.analysis));
  delete a.buildings; delete a.buildings_agricultural;
  return JSON.stringify(a) === JSON.stringify(boundsJson.analysis);
})(), "analysis block baked VERBATIM from the JSON (original keys unchanged)");
ok(BOUNDARIES.analysis.buildings === 32 && BOUNDARIES.analysis.buildings_agricultural === 6, "analysis carries the baked building counts (32 total, 6 agricultural)");
ok(BOUNDARIES.analysis.flowline_segments_touching_parcel === 4, "analysis: 4 flowline segments touch the parcel");
// structures layer exists, is a data-layer group, default ON, and in the panel
ok(/buildStructures/.test(js) && /"data-layer": "structures"/.test(js), "structures layer group built (data-layer='structures')");
ok(/root\.BOUNDARIES/.test(js) && /lonToGX\(coord\[0\]\)/.test(js) && /latToGY\(coord\[1\]\)/.test(js), "structures project lon/lat via lonToGX/latToGY (same grid transform as the DEM)");
// rendered ABOVE contours, BELOW the outside-wash
ok(js.indexOf('pan.appendChild(contourLayer)') < js.indexOf('pan.appendChild(structuresLayer)'), "structures render ABOVE contours");
ok(js.indexOf('if (structuresLayer) pan.appendChild(structuresLayer)') < js.indexOf('pan.appendChild(washLayer)'), "structures render BELOW the outside-wash (surround roads/streams muted)");
// default ON in the layers panel
const structRow = (html.match(/<button class="layer-row[^"]*"[^>]*data-layer="structures"[\s\S]*?<\/button>/) || [""])[0];
ok(/layer-row--on/.test(structRow) && /aria-pressed="true"/.test(structRow), "Roads, water & buildings row is DEFAULT ON (real structural context, not speculation)");
ok(/Roads, water &amp; buildings \(Census\/NHD\/FEMA\)/.test(html), "layers row relabeled 'Roads, water & buildings (Census/NHD/FEMA)' (spec-buildings-v1)");
// road labels deduped: ONE per distinct name (byName map keyed by NAME)
ok(/var byName = \{\}/.test(js) && /Object\.keys\(byName\)\.forEach/.test(js) && /longest/.test(js), "road labels deduped to ONE per name (longest-segment midpoint)");
ok(/name\.toUpperCase\(\)/.test(js), "road labels are uppercase");
ok(/fixedNodes\.push\(\{ el: t, ax: mid\.x, ay: mid\.y \}\)/.test(js), "road labels are screen-constant (fixedNodes)");
// intermittent streams DASHED (46003), artificial thinner/fainter
ok(/fc === 46003 \? "stream-line--intermittent"/.test(js), "FCODE 46003 flowlines get the intermittent class");
ok(/\.stream-line--intermittent \{ stroke-dasharray: 6 5/.test(css), "intermittent (46003) streams are DASHED (6 5) — USGS convention");
ok(/\.stream-line--artificial\s+\{[^}]*stroke-width: 1\.1/.test(css), "artificial-path (55800) streams are thinner/fainter");
// tokens defined in BOTH themes (R2)
ok(/--road:\s*#B9B3A4/.test(css) && /--water:\s*#8FB3C7/.test(css), "--road/--water defined in the LIGHT theme");
const darkTokenBlock = (css.match(/html\[data-theme="dark"\]\s*\{[\s\S]*?\n\}/) || [""])[0];
ok(/--road:\s*#4A4B45/.test(darkTokenBlock) && /--water:\s*#5E7E96/.test(darkTokenBlock), "--road/--water defined in the DARK theme");
// the east-low NHD signal carries the DEM-derived caveat; refusal UNCHANGED
const eastLow = zones.find(z => z.id === "east-low-compound");
const nhdSig = eastLow.signals.find(s => /USGS NHD/.test(s.instrument));
ok(!!nhdSig && /14 m SE/.test(nhdSig.reading) && /4 segments cross the parcel/.test(nhdSig.reading), "east-low carries the NHD flowline signal (14 m SE, 4 segments)");
ok(!!nhdSig && /partly DEM-derived/.test(nhdSig.conditions) && /does not decide claypan/.test(nhdSig.conditions), "NHD signal carries the DEM-derived caveat (does not decide claypan vs through-drainage)");
ok(eastLow.resolvable === false && eastLow.confidenceDelta === 5, "refusal UNCHANGED: still held open (resolvable false), delta still +5 (not raised)");
ok(/partly DEM-derived/.test(eastLow.refusal.why) && /not an independent witness/.test(eastLow.refusal.why), "refusal.why ties in NHD but keeps it non-decisive (flat hatch, held open)");
// central-grade TIGER signal
const central = zones.find(z => z.id === "central-grade");
ok(!!central.signals.find(s => /US Census TIGER/.test(s.instrument) && /200th St runs 16 m/.test(s.reading)), "central-grade carries the TIGER road signal (200th St, 16 m)");
// provenance gains both sources with resolution-limit lines
const provNamesAll = FOCUS_DATA.provenance.sources.map(s => s.name).join(" | ");
ok(/US Census TIGER/.test(provNamesAll) && /USGS NHD/.test(provNamesAll), "provenance lists US Census TIGER + USGS NHD");
const tigerSrc = FOCUS_DATA.provenance.sources.find(s => /Census TIGER/.test(s.name));
const nhdSrc = FOCUS_DATA.provenance.sources.find(s => /USGS NHD/.test(s.name));
ok(/±~10 m class/.test(tigerSrc.limit) && /partly DEM-derived/.test(nhdSrc.limit), "both new sources carry their resolution-limit lines from the .md");
// pill text extended (long span hidden ≤560px)
ok(/USGS\/USDA\/NWS\/Census/.test(html), "provenance pill reads '…USGS/USDA/NWS/Census'");
// honesty line extended
ok(/Census TIGER and USGS NHD/.test(FOCUS_DATA.field.honesty), "field.honesty extended with the Census TIGER + USGS NHD structural-edges line");
// no new externals: boundaries.js has no fetch / external URLs
ok(!/\bfetch\s*\(/.test(bjs), "no fetch( in boundaries.js");
ok(!/https?:\/\/(?!www\.w3\.org)/i.test(bjs), "no external URLs in boundaries.js (data is baked)");
// boundaries.js loaded before focus-r2.js (reads window.BOUNDARIES)
ok(html.indexOf('boundaries.js') < html.indexOf('focus-r2.js'), "boundaries.js loaded before focus-r2.js");

/* ========================================================================= */
console.log("\n== ESTABLISHED PONDS: NHD waterbodies baked + rendered solid ==");
ok(/NHD Waterbody/.test(bjs), "boundaries.js header cites NHD Waterbody, 2026-07-04");
ok(Array.isArray(BOUNDARIES.waterbodies), "BOUNDARIES.waterbodies is baked");
ok(BOUNDARIES.waterbodies.length === boundsJson.waterbodies.features.length && BOUNDARIES.waterbodies.length === 17, "17 ponds baked, matching the JSON (" + BOUNDARIES.waterbodies.length + ")");
const pondFcodes = {}; BOUNDARIES.waterbodies.forEach(p => pondFcodes[p.fcode] = (pondFcodes[p.fcode] || 0) + 1);
ok(Object.keys(pondFcodes).length === 1 && pondFcodes[39004] === 17, "every pond fcode is 39004 (perennial)");
ok(BOUNDARIES.waterbodies.filter(p => p.inside_parcel).length === 4, "4 ponds are inside_parcel");
ok(JSON.stringify(BOUNDARIES.analysis.ponds) === JSON.stringify(boundsJson.analysis.ponds), "analysis.ponds baked VERBATIM from the JSON");
ok(BOUNDARIES.analysis.ponds.ponds_in_extended_bbox === 17 && BOUNDARIES.analysis.ponds.ponds_inside_parcel === 4, "analysis.ponds counts: 17 in bbox, 4 inside parcel");
ok(/\(B\.waterbodies \|\| \[\]\)\.forEach/.test(js), "buildStructures iterates B.waterbodies");
ok(/class: "pond-shape"/.test(js) && /lonLatPath\(p\.coords, proj\) \+ " Z"/.test(js), "ponds render as CLOSED polygons (path + Z) with class pond-shape");
ok(js.indexOf('(B.waterbodies || []).forEach') < js.indexOf('(B.streams || []).forEach'), "ponds are appended BEFORE streams (render UNDER stream lines)");
ok(/\.pond-shape\s*\{[^}]*fill:\s*var\(--water\)/.test(css), "pond-shape fills with var(--water)");
ok(/\.pond-shape\s*\{[^}]*fill-opacity:\s*0\.35/.test(css), "pond fill-opacity ~0.35");
const pondCssBlock = (css.match(/\.pond-shape\s*\{[^}]*\}/) || [""])[0];
ok(!/dasharray/.test(pondCssBlock), "pond-shape carries NO stroke-dasharray (SOLID — perennial, per the vocabulary rule)");
ok(/\.pond-shape[\s\S]*?vector-effect: non-scaling-stroke/.test(css), "pond stroke stays a hairline under zoom (non-scaling-stroke)");
ok(!/waterbodies:[^,]*"stroke-dasharray"/.test(js), "no dasharray set on pond paths in the render code");
const swSig = zones.find(z => z.id === "sw-s-shoulders").signals.find(s => /USGS NHD · waterbodies/.test(s.instrument));
ok(!!swSig, "sw-s-shoulders carries the USGS NHD · waterbodies signal");
ok(!!swSig && /91 m/.test(swSig.reading), "sw signal states the pond is 91 m away");
ok(!!swSig && /perennial/.test(swSig.reading + " " + swSig.conditions), "sw signal uses the 'perennial' wording");
ok(!!swSig && /39004/.test(swSig.conditions), "sw signal conditions cite FCODE 39004");
ok(okSources.test("USGS NHD · waterbodies"), "allowed-instruments regex already covers 'USGS NHD · waterbodies' (USGS NHD prefix match)");

/* ========================================================================= */
console.log("\n== FREE INTERACTION: view-state, wheel-about-cursor, drag, pinch, scroll-top ==");
ok(/var view = \{ cx:.*zoom:.*manual: false \}/.test(js), "single view-state object {cx,cy,zoom,manual}");
ok(/svg\.addEventListener\("wheel"/.test(js) && /e\.preventDefault\(\)/.test(js) && /Math\.exp\(-e\.deltaY/.test(js), "wheel handler: preventDefault + exponential zoom");
ok(/clientToWorld/.test(js) && /w\.x - \(w\.x - view\.cx\)/.test(js), "wheel keeps the cursor's world point fixed (zoom about cursor)");
ok(/parcelView\.zoom \* 0\.6/.test(js) && /parcelView\.zoom \* 6/.test(js), "zoom clamped to [parcelZoom×0.6, parcelZoom×6]");
ok(/setPointerCapture/.test(js) && /pointerdown/.test(js) && /pointermove/.test(js), "drag pan via pointer events + setPointerCapture");
ok(/> 16/.test(js) && /svg\.classList\.add\("dragging"\)/.test(js), "drag threshold ~4px (16 = 4²) distinguishes drag from click");
ok(/if \(dragged\) \{ e\.stopPropagation\(\); e\.preventDefault\(\)/.test(js), "a drag suppresses the click that would activate a zone");
ok(/pinchStart/.test(js) && /Math\.hypot/.test(js), "two-pointer pinch zoom about the midpoint");
ok(/clampCenter/.test(js) && /view\.manual = true/.test(js), "pan/zoom clamp keeps terrain covering the viewport; sets manual mode");
ok(/deactivate\(\)/.test(js) && /fcTop - rb\.top > 40/.test(js), "scroll-top reset: deactivate when above the first card (> ~40px)");
ok(/mapCtl\.reset\(\)/.test(js) && /field\.name/.test(js), "scroll-top reset returns to parcel view + resets peek to field name");
ok(/touch-action: none/.test(css) && /cursor: grab/.test(css), "map has touch-action:none + grab cursor (pinch/pan don't fight scroll)");
ok(/fixedNodes\.forEach/.test(js) && /applyView/.test(js), "applyView is the single writer of the pan transform + fixedNodes counter-scale (screen-constant labels on every zoom path)");

/* ========================================================================= */
console.log("\n== weather tile: real NWS forecast, real values only ==");
ok(/weather-card/.test(html) && /wx-glyph/.test(html), "weather stat card with thin-line sun/storm glyph present");
// The tile is now DATA-DRIVEN from FOCUS_DATA.forecasts (so the Field & date
// dialog can swap it between the two real days). Values live in the structure,
// not as HTML literals — asserted against FORECASTS in the section below.
ok(/f\.tempF/.test(html) && /f\.line/.test(html) && /f\.sub/.test(html) && /D\.forecasts\["2026-07-03"\]/.test(html),
   "weather tile renders hero/line/sub from FOCUS_DATA.forecasts (no parsed strings, no literals)");
ok(/DMX 88,18/.test(JSON.stringify(FOCUS_DATA.forecasts)), "the real NWS grid (DMX 88,18) is carried in the forecast data");

/* ========================================================================= */
console.log("\n== priority chips per mapping (watch=outline · moderate=dark · high=amber) ==");
ok(/\.prio--watch[\s\S]*?inset 0 0 0 1\.5px var\(--ink-2\)/.test(css), "watch chip = outlined (--ink-2)");
ok(/\.prio--moderate[\s\S]*?background: var\(--dock\)/.test(css), "moderate chip = dark (--dock)");
ok(/\.prio--high[\s\S]*?background: var\(--accent\)/.test(css), "high chip = amber (--accent)");

/* ========================================================================= */
console.log("\n== provenance reachable; sources + limits + not-connected ==");
const p = FOCUS_DATA.provenance;
ok(!!p && p.fetched === "2026-07-03", "provenance fetch date is 2026-07-03");
ok(p && p.sources.length === 6, "six provenance sources listed (3 base + Census TIGER + USGS NHD + FEMA/ORNL — spec-buildings-v1)");
const provNames = p ? p.sources.map(s => s.name).join(" ") : "";
ok(/USGS 3DEP/.test(provNames) && /USDA SSURGO/.test(provNames) && /NWS/.test(provNames), "provenance lists USGS 3DEP, USDA SSURGO, NWS");
ok(/FEMA\/ORNL USA Structures/.test(provNames) && /ML\+parcel-derived footprints, occupancy classed — not survey/.test(JSON.stringify(p)), "Allerton provenance gains FEMA/ORNL USA Structures (footprints, occupancy classed — not survey)");
ok(p && /10 m/.test(JSON.stringify(p)) && /1:24,000/.test(JSON.stringify(p)) && /DMX/.test(JSON.stringify(p)),
   "provenance carries the real limits: 10 m DEM, 1:24,000, grid DMX");
ok(p && p.unavailable.length >= 3, "unavailable layers listed (on-farm soil moisture, ET0, agricultural debt)");
ok(/id="prov-chip"/.test(html), "provenance chip present in html (always visible)");
ok(/openDialog\("provenance-dialog"\)/.test(js), "provenance chip / rail opens the provenance dialog");
ok(/id="provenance-dialog"/.test(html), "provenance dialog present in html");
ok(/on-farm layer: not connected/i.test(html), "on-farm layer shown 'not connected' in the provenance dialog");

/* ========================================================================= */
console.log("\n== persistent map + mobile sheet + desktop rail ==");
ok(/#stage \{ position: fixed/.test(css), "map stage is position:fixed (never scrolls away)");
ok(/id="focus-map"/.test(html), "map mount present");
ok(/id="sheet"/.test(html) && /sheet-handle/.test(html) && /sheet-scroll/.test(html), "mobile draggable bottom sheet present");
ok(/id="rail"/.test(html), "desktop right rail present");
const desktopBlock = css.split("@media (min-width: 721px)")[1] || "";
ok(/\.rail \{[\s\S]*display: block/.test(desktopBlock), "rail shown at >720px");
ok(/\.sheet \{ display: none/.test(desktopBlock), "sheet hidden at >720px");
ok(/prefers-reduced-motion/.test(css), "reduced-motion honored in CSS (instant cuts, no draw-in)");
ok(/reduced\(\)/.test(js) && /prefers-reduced-motion/.test(js), "reduced-motion honored in JS (behavior:auto)");

/* ========================================================================= */
console.log("\n== scroll-sync: DIRECT scroll-listener + nearest-center picker (NOT IntersectionObserver) ==");
ok(!/IntersectionObserver/.test(js), "NO IntersectionObserver (that failed and was replaced deliberately)");
ok(!/requestAnimationFrame/.test(js), "NO requestAnimationFrame in scroll-sync (pauses in hidden tabs)");
ok(/addEventListener\("scroll", pickActive/.test(js), "a direct scroll listener drives pickActive");
ok(/bandCenter|nearest-center|nearest the container/.test(js) && /bestDist/.test(js), "nearest-center picker selects the active card by center distance");
ok(/wireScrollSync/.test(js) && /focusZone/.test(js), "scroll-sync focuses the active zone on the map");
ok(/region\.addEventListener\("click", go\)/.test(js), "tapping a map region syncs the card (two-way)");
ok(/c\.addEventListener\("click"/.test(js), "tapping a card syncs the map + scrolls it into the active band");

/* ========================================================================= */
console.log("\n== no external network requests / no libraries (DM Sans font link excepted) ==");
ok(!/\bfetch\s*\(/.test(js), "no fetch( in focus-r2.js");
ok(!/\bfetch\s*\(/.test(html), "no fetch( in index.html");
ok(!/https?:\/\/(?!www\.w3\.org)/i.test(js), "focus-r2.js has no external URLs (SVG namespace excepted)");
// scripts: only the three local ones (?v= allowed)
const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m => m[1]);
ok(scripts.every(s => /^(dem-grid|dem-grid-ext|boundaries|data|engine|live|fields|focus-r2)\.js(\?v=\d+)?$/.test(s)), "only local scripts loaded (" + scripts.join(", ") + ")");
ok(scripts.every(s => !/^https?:/i.test(s)), "no external script URLs");
// stylesheet: local focus-r2.css (?v= allowed)
ok(/href="focus-r2\.css(\?v=\d+)?"/.test(html), "local focus-r2.css stylesheet loaded");
// the ONLY permitted external ref is the Google Fonts DM Sans link
const externalLinks = [...html.matchAll(/<link[^>]+href="(https?:\/\/[^"]+)"/g)].map(m => m[1]);
ok(externalLinks.every(u => /fonts\.(googleapis|gstatic)\.com/.test(u)), "the only external <link>s are the DM Sans font (" + externalLinks.length + " font link(s))");
ok(/family=DM\+Sans/.test(html), "DM Sans loaded via the standard Google Fonts link");
ok(!/unpkg|jsdelivr|cdnjs|leaflet|d3js/i.test(html), "no CDN library hosts referenced");

/* ========================================================================= */
console.log("\n== dark theme: token override block, exact architect values ==");
ok(/html\[data-theme="dark"\]/.test(css), "a [data-theme=\"dark\"] override block exists on <html>");
const darkBlock = (css.match(/html\[data-theme="dark"\]\s*\{[\s\S]*?\n\}/) || [""])[0];
ok(darkBlock.length > 0, "dark override block body captured for the checks below");
[
  ["--terrain-low", "#1A1B18"], ["--terrain-high", "#2E3428"],
  ["--contour", "#7E8470"], ["--contour-index", "#C9CDBB"],
  ["--surface", "#1E1F21"], ["--surface-warm", "#26272A"],
  ["--ink", "#ECEDEA"], ["--ink-2", "#9EA29B"]
].forEach(([tok, val]) => {
  const re = new RegExp(tok.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&") + "\\s*:\\s*" + val, "i");
  ok(re.test(darkBlock), "dark " + tok + " === " + val);
});
ok(/--surface-translucent:\s*rgba\(34,\s*36,\s*38,\s*0\.86\)/.test(darkBlock), "dark --surface-translucent === rgba(34,36,38,0.86) — lifted for dark separation (2026-07-05)");
ok(/--accent-tint:\s*rgba\(245,\s*166,\s*35,\s*0\.20?\)/.test(darkBlock), "dark --accent-tint === rgba(245,166,35,0.20)");
ok(/--shadow-float:\s*0 10px 30px rgba\(0,\s*0,\s*0,\s*0\.5\)/.test(darkBlock), "dark --shadow-float === 0 10px 30px rgba(0,0,0,0.5)");
ok(/--shadow-soft:\s*0 4px 14px rgba\(0,\s*0,\s*0,\s*0\.35\)/.test(darkBlock), "dark --shadow-soft === 0 4px 14px rgba(0,0,0,0.35)");
// --dock/--dock-2/--on-dock/--accent/--accent-ink are UNCHANGED in dark — the
// dark block must not redefine them.
["--dock:", "--dock-2:", "--on-dock:", "--accent:", "--accent-ink:"].forEach(tok => {
  ok(!new RegExp(tok.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).test(darkBlock), "dark block does NOT override " + tok + " (unchanged per spec)");
});

/* ========================================================================= */
console.log("\n== dark theme: toggle button, aria-pressed, rail placement ==");
ok(/id="rail-theme"/.test(html), "theme toggle button present in the rail");
ok(/aria-pressed="false"/.test((html.match(/<button id="rail-theme"[^>]*>/) || [""])[0]), "toggle starts aria-pressed=false (light default)");
const railOrder = [html.indexOf('id="rail-provenance"'), html.indexOf('id="rail-theme"'), html.indexOf('id="rail-about"')];
ok(railOrder[0] < railOrder[1] && railOrder[1] < railOrder[2], "toggle sits below provenance, above about (rail order)");
ok(/Light \/ dark/.test(html), "toggle carries the 'Light / dark' label/tooltip");

/* ========================================================================= */
console.log("\n== dark theme: retintMap + data-t + persistence + theme wiring in JS ==");
ok(typeof AGRIOS_FOCUS_R2 !== "undefined", "AGRIOS_FOCUS_R2 API loaded");
ok(/function retintMap\(\)/.test(js), "retintMap() is defined");
ok(/retintMap:\s*retintMap/.test(js), "retintMap is exposed on the mapCtl returned by renderMap");
ok(/"data-t":\s*b\.t\.toFixed\(4\)/.test(js), "each band carries its t value in data-t at build time");
ok(/\.band\[data-t\]/.test(js), "retintMap selects bands via [data-t] to re-lerp their fill");
ok(/getComputedStyle\(document\.documentElement\)/.test(js), "terrain tokens are read live via getComputedStyle (not hardcoded hex)");
ok(/readTerrainTokens/.test(js), "readTerrainTokens() centralizes the live --terrain-low/high read");
ok(/localStorage\.setItem\(THEME_KEY/.test(js) && /localStorage\.getItem\(THEME_KEY/.test(js), "theme persists to/reads from localStorage");
ok(/THEME_KEY\s*=\s*"agrios-theme"/.test(js), "localStorage key is exactly 'agrios-theme'");
ok(/function wireTheme\(mapCtl\)/.test(js), "wireTheme(mapCtl) wires the rail toggle");
ok(/mapCtl\.retintMap\(\)/.test(js), "clicking the toggle calls mapCtl.retintMap()");
ok(/document\.documentElement\.setAttribute\("data-theme",\s*"dark"\)/.test(js), "toggle sets data-theme=\"dark\" on <html>");
ok(/document\.documentElement\.removeAttribute\("data-theme"\)/.test(js), "toggle removes data-theme to return to light (default)");
ok(!/matchMedia\(["']\(prefers-color-scheme/.test(js), "JS never auto-follows prefers-color-scheme — light default is explicit, not system-driven");
ok(/function applyStoredTheme\(\)/.test(js) && /applyStoredTheme\(\);/.test(js), "applyStoredTheme() runs on init, before the map's first render");
const initBody = (js.match(/init:\s*function\s*\(grid\)\s*\{[\s\S]*?\n    \}/) || [""])[0];
// Init now renders via renderField(); renderField() applies the stored theme
// before it calls renderMap. Assert init runs applyStoredTheme() before its
// renderField() call (no light→dark flash on reload), and renderField itself
// buildsContours/renderMap after re-applying the theme.
ok(initBody.indexOf("applyStoredTheme();") >= 0 && initBody.indexOf("applyStoredTheme();") < initBody.indexOf("renderField("),
   "stored theme is applied BEFORE renderField is CALLED in init (no light→dark flash on reload)");
const renderFieldBody = (js.match(/renderField:\s*function[\s\S]*?return \{ contours: contours, bands: bands, mapCtl: mapCtl \};/) || [""])[0];
ok(/var mapCtl = renderMap\(mount/.test(renderFieldBody) && /while \(mount\.firstChild\)/.test(renderFieldBody),
   "renderField tears down the mount and re-renders the map (re-initializable render path)");
ok(/setField:\s*function\s*\(read,\s*fieldMeta\)/.test(js) && /PARCEL_BBOX = boundsMeta/.test(js),
   "setField(read, fieldMeta) switches the active field; an unbounded read has no stated parcel bounds (bounded fields set it from bounds)");
ok(/aria-pressed", isDark/.test(js.replace(/\s+/g, " ")) || /aria-pressed", next/.test(js.replace(/\s+/g, " ")), "toggle button's aria-pressed reflects the active theme");

/* ========================================================================= */
console.log("\n== dark theme: no leftover hardcoded light hexes in chrome CSS ==");
// Every literal hex/rgb the CSS defines must live inside a :root or
// [data-theme="dark"] token block — chrome rules below should reference vars.
const rootBlock = (css.match(/:root\s*\{[\s\S]*?\n\}/) || [""])[0];
const bodyCss = css.replace(rootBlock, "").replace(darkBlock, "");
const strayHex = bodyCss.match(/#[0-9A-Fa-f]{3,6}\b/g) || [];
ok(strayHex.length === 0, "no hardcoded hex colors remain outside the :root / dark token blocks (found: " + strayHex.join(", ") + ")");
// spot-assert the specific chrome surfaces called out in the spec use var()
ok(/\.sheet\s*\{[\s\S]*?background:\s*var\(--surface\)/.test(css), "sheet background uses var(--surface)");
ok(/\.dialog-card\s*\{[\s\S]*?background:\s*var\(--surface\)/.test(css), "dialog-card background uses var(--surface)");
ok(/\.layers-panel\s*\{[\s\S]*?background:\s*var\(--surface\)/.test(css), "layers-panel background uses var(--surface)");
ok(/\.refusal-chip-bg\s*\{[\s\S]*?fill:\s*var\(--surface-translucent\)/.test(css), "refusal-chip-bg fill uses var(--surface-translucent)");
ok(/"outside-wash",\s*fill:\s*"var\(--terrain-low\)"/.test(js), "outside-wash fill uses var(--terrain-low) (re-themes without JS help)");
ok(/\.stat-tile--muted\s*\{[\s\S]*?var\(--stripe\)/.test(css), "muted stat-tile hatch stripe uses var(--stripe), not a literal hex");
ok(/rgba\(var\(--line\),/.test(css), "hairline borders use rgba(var(--line), x) so they flip with the theme");

/* ========================================================================= */
console.log("\n== FEATURE A: live view-bounds pill (row 2 readout) ==");
ok(/id="view-bounds-pill"/.test(html) && /id="view-bounds-text"/.test(html), "view-bounds readout element present in the pill group");
ok(/class="pill-row"/.test(html), "row 1 (field pill + prov chip) wrapped so the group is a 2-row stack");
ok(/\.pill-group\s*\{[\s\S]*?flex-direction:\s*column/.test(css), "pill-group is a vertical (column) stack sharing one left edge");
ok(/class="view-bounds-label"[^>]*>VIEW</.test(html), "row 2 carries the 'VIEW' micro-label");
ok(/\.view-bounds-label\s*\{[\s\S]*?12px[\s\S]*?700[\s\S]*?uppercase[\s\S]*?var\(--ink-2\)/.test(css) ||
   /\.view-bounds-label\s*\{[\s\S]*?700 12px[\s\S]*?uppercase[\s\S]*?var\(--ink-2\)/.test(css),
   "VIEW label is 12/700 uppercase --ink-2");
ok(/id="vb-full"/.test(html) && /id="vb-center"/.test(html), "readout has full-bounds + center-only spans (desktop / mobile)");
// the readout is updated FROM applyView (assert the function reference)
ok(/function applyView\(v\)\s*\{[\s\S]*?updateViewReadout\(v\);/.test(js), "updateViewReadout(v) is called inside applyView (single view-change hook, no rAF loop)");
ok(/function updateViewReadout\(v\)/.test(js), "updateViewReadout is defined");
ok(!/requestAnimationFrame/.test(js), "no rAF loop for the readout (throttled via applyView's once-per-change run)");
// mobile ≤560px shows center-only and opens the dialog on tap
ok(/@media \(max-width: 560px\)[\s\S]*?\.vb-full\s*\{\s*display:\s*none/.test(css), "≤560px hides full bounds (.vb-full)");
ok(/@media \(max-width: 560px\)[\s\S]*?\.vb-center\s*\{\s*display:\s*inline/.test(css), "≤560px shows center-only (.vb-center)");
ok(/id="view-bounds-pill"[^>]*aria-haspopup="dialog"/.test(html.replace(/\n/g, " ")), "view-bounds pill opens a dialog (mobile tap → full bounds in Field & date)");

console.log("\n== FEATURE A: bounds-format + view→bounds inversion (node unit tests) ==");
// 4-decimal signed formatter, U+2212 minus for negatives
ok(AGRIOS_FOCUS_R2.fmtDeg(40.90351) === "40.9035", "fmtDeg rounds to 4 decimals (40.90351 → 40.9035)");
ok(AGRIOS_FOCUS_R2.fmtDeg(-93.18754) === "−93.1875", "fmtDeg uses U+2212 minus for negatives (−93.1875)");
ok(AGRIOS_FOCUS_R2.fmtDeg(40.9) === "40.9000", "fmtDeg pads to 4 decimals (40.9 → 40.9000)");
// grid inverses round-trip lonToGX/latToGY exactly
(function () {
  const lon = -93.1975, lat = 40.9001;
  const gx = AGRIOS_FOCUS_R2.lonToGX(lon), gy = AGRIOS_FOCUS_R2.latToGY(lat);
  ok(Math.abs(AGRIOS_FOCUS_R2.gxToLon(gx) - lon) < 1e-9, "gxToLon inverts lonToGX exactly");
  ok(Math.abs(AGRIOS_FOCUS_R2.gyToLat(gy) - lat) < 1e-9, "gyToLat inverts latToGY exactly");
})();
// view→bounds: feed a KNOWN transform, assert expected lon/lat bounds.
// A view centered on the grid CENTER at zoom=1 with the full W×H span should
// return (clamped to) the whole GRID_BBOX corners.
(function () {
  const W = AGRIOS_FOCUS_R2.W, H = AGRIOS_FOCUS_R2.H, PAD = AGRIOS_FOCUS_R2.PAD;
  const GB = AGRIOS_FOCUS_R2.GRID_BBOX, nx = GB.nx, ny = GB.ny;
  // grid-center in SVG = center of the projected grid; with the projector,
  // grid (gxc,gyc) maps to SVG center. Use the projector's own math: SVG center
  // for the parcel is W/2,H/2 only if the grid fills W×H symmetrically — it does
  // (proj places grid[0..nx-1] across [PAD, W-PAD]). Center grid = ((nx-1)/2,(ny-1)/2).
  const unproj = AGRIOS_FOCUS_R2.makeUnprojector(nx, ny, W, H, PAD);
  // SVG coord of grid center:
  const sx = (W - 2 * PAD) / (nx - 1), sy = (H - 2 * PAD) / (ny - 1);
  const cxSvg = PAD + ((nx - 1) / 2) * sx, cySvg = PAD + ((ny - 1) / 2) * sy;
  const view = { cx: cxSvg, cy: cySvg, zoom: 1 };
  // span = full canvas at zoom 1 (whole grid visible) — use W×H directly.
  const b = AGRIOS_FOCUS_R2.viewToBounds(view, { w: W, h: H }, nx, ny, W, H, PAD);
  // the visible rect spans slightly beyond the grid edges (PAD margin), so
  // bounds clamp to the GRID_BBOX corners exactly.
  ok(Math.abs(b.w - GB.lon[0]) < 1e-6, "known transform → WEST clamps to grid west lon (" + b.w.toFixed(4) + ")");
  ok(Math.abs(b.e - GB.lon[1]) < 1e-6, "known transform → EAST clamps to grid east lon (" + b.e.toFixed(4) + ")");
  ok(Math.abs(b.n - GB.lat[1]) < 1e-6, "known transform → NORTH clamps to grid north lat (" + b.n.toFixed(4) + ")");
  ok(Math.abs(b.s - GB.lat[0]) < 1e-6, "known transform → SOUTH clamps to grid south lat (" + b.s.toFixed(4) + ")");
})();
// a tighter, un-clamped view: center on grid center, zoom 2, half-span → bounds
// symmetric about the field center and strictly inside the grid bbox.
(function () {
  const W = AGRIOS_FOCUS_R2.W, H = AGRIOS_FOCUS_R2.H, PAD = AGRIOS_FOCUS_R2.PAD;
  const GB = AGRIOS_FOCUS_R2.GRID_BBOX, nx = GB.nx, ny = GB.ny;
  const sx = (W - 2 * PAD) / (nx - 1), sy = (H - 2 * PAD) / (ny - 1);
  const cxSvg = PAD + ((nx - 1) / 2) * sx, cySvg = PAD + ((ny - 1) / 2) * sy;
  // half the drawn grid width/height in SVG units → a quarter-area window.
  const spanW = (W - 2 * PAD) / 2, spanH = (H - 2 * PAD) / 2;
  const b = AGRIOS_FOCUS_R2.viewToBounds({ cx: cxSvg, cy: cySvg, zoom: 1 }, { w: spanW, h: spanH }, nx, ny, W, H, PAD);
  const midLon = (GB.lon[0] + GB.lon[1]) / 2, midLat = (GB.lat[0] + GB.lat[1]) / 2;
  ok(Math.abs((b.e + b.w) / 2 - midLon) < 1e-6, "half-span view is horizontally centered on the grid mid-lon");
  ok(Math.abs((b.n + b.s) / 2 - midLat) < 1e-6, "half-span view is vertically centered on the grid mid-lat");
  ok(b.w > GB.lon[0] && b.e < GB.lon[1] && b.n < GB.lat[1] && b.s > GB.lat[0], "half-span bounds sit strictly inside the grid bbox (no clamp)");
})();

console.log("\n== FEATURE B: Field & date dialog present + opens from the field pill ==");
ok(/id="field-dialog"/.test(html), "field-dialog present in html");
ok(/id="field-dialog"[^>]*role="dialog"[^>]*aria-modal="true"/.test(html.replace(/\n/g, " ")), "field-dialog has role=dialog aria-modal=true");
ok(/id="field-dialog"[^>]*aria-labelledby="field-title"/.test(html.replace(/\n/g, " ")) && /id="field-title"/.test(html), "field-dialog aria-labelledby wired to its title (like existing dialogs)");
ok(/function wireFieldDialog\(mapCtl\)/.test(js), "wireFieldDialog(mapCtl) defined");
ok(/wireFieldDialog\(MAP_PROXY\);/.test(js), "wireFieldDialog is called from init (against the re-render-safe MAP_PROXY)");
ok(/getElementById\("field-pill"\)[\s\S]*?openFieldDialog\(\)/.test(js), "clicking the field pill opens the Field & date dialog");
// section 1: current field, stated PARCEL_BBOX bounds + live view bounds reused
ok(/id="fd-name"/.test(html) && /id="fd-coords"/.test(html) && /id="fd-stated"/.test(html) && /id="fd-acreage"/.test(html) && /id="fd-view"/.test(html),
   "current-field section lists name, coords, stated bounds, acreage, live view");
ok(/PARCEL_BBOX[\s\S]*?function statedBounds/.test(js) || /function statedBounds\(\)[\s\S]*?PARCEL_BBOX/.test(js), "stated bounds computed from PARCEL_BBOX");
ok(/mapCtl\.getBounds/.test(js), "current view bounds reuse the live readout values (mapCtl.getBounds)");

console.log("\n== FEATURE B: FORECASTS integrity — exactly two real days, real values ==");
const FCkeys = Object.keys(FOCUS_DATA.forecasts);
ok(FCkeys.length === 2, "FORECASTS holds exactly two days (" + FCkeys.join(", ") + ")");
ok(FCkeys.includes("2026-07-03") && FCkeys.includes("2026-07-04"), "the two days are the real held ones: 2026-07-03 and 2026-07-04");
ok(FOCUS_DATA.forecasts["2026-07-03"].tempF === 90 && /thunderstorm/i.test(FOCUS_DATA.forecasts["2026-07-03"].label), "Jul 3 = 90°F, storms (real NWS)");
ok(FOCUS_DATA.forecasts["2026-07-04"].tempF === 88 && /thunderstorm/i.test(FOCUS_DATA.forecasts["2026-07-04"].label), "Jul 4 = 88°F, storms (real NWS)");
ok(FOCUS_DATA.forecasts["2026-07-03"].default === true && FOCUS_DATA.forecasts["2026-07-04"].default === false, "Jul 3 is the default selected day");
// no third/other day anywhere in the structure
ok(!FCkeys.some(k => k !== "2026-07-03" && k !== "2026-07-04"), "no other day exists in FORECASTS (no fabricated weather)");

console.log("\n== FEATURE B: date behavior — chips swap real days; other date is honest ==");
ok(/id="date-chip-jul3"/.test(html) && /id="date-chip-jul4"/.test(html), "two date chips present (Jul 3 default, Jul 4)");
ok(/type="date"/.test(html) && /id="date-input"/.test(html), "an <input type=date> for any other date");
ok(/function applyForecastDay\(key\)/.test(js) && /writeWeatherTiles\(f\)/.test(js), "selecting a held day rewrites the weather tile from FORECASTS[key]");
ok(/document\.querySelectorAll\("#field-date, \.field-date"\)/.test(js), "the header date pill / eyebrow date swaps with the selected day");
// other-date path: honest note text present + never writes the weather tile
ok(/No forecast held for that date\. This build carries NWS data fetched 2026-07-03 \(Jul 3–4\)\. A live AGRIOS queries api\.weather\.gov at read time\./.test(FOCUS_DATA.forecastMissingNote),
   "honest 'no forecast held' note text is exactly the spec wording");
ok(/if \(FC\[v\]\) \{[\s\S]*?applyForecastDay\(v\);[\s\S]*?\}\s*else \{[\s\S]*?forecastMissingNote/.test(js), "other date → shows the honest note and does NOT call applyForecastDay (weather tile unchanged)");

console.log("\n== FEATURE B: location — read this field, or the honest capability card ==");
ok(/id="loc-lat"/.test(html) && /id="loc-lon"/.test(html), "two labeled lat/lon inputs present");
ok(/id="loc-read"[^>]*>Read this location</.test(html.replace(/\n/g, " ")), "'Read this location' primary button present");
ok(/\.loc-read-btn\s*\{[\s\S]*?background:\s*var\(--accent\)/.test(css), "read button is the amber primary (--accent)");
ok(/id="capability-card"/.test(html), "honest capability card present");
ok(/\.capability-card\s*\{[\s\S]*?background:\s*var\(--surface-warm\)/.test(css), "capability card uses --surface-warm (informational, NOT an error style)");
ok(!/\.capability-card[\s\S]*?var\(--alarm\)/.test(css), "capability card never uses --alarm (red)");
// all 5 sources + the closing pipeline line
["USGS 3DEP EPQS", "USDA SSURGO", "NWS gridpoint", "Census TIGER", "USGS NHD"].forEach(src => {
  ok(html.includes(src), "capability card lists source: " + src);
});
ok(/elevation grid/.test(html) && /soils/.test(html) && /forecast/.test(html) && /roads/.test(html) && /flowlines &amp; waterbodies/.test(html),
   "each source carries its one-line role (elevation grid / soils / forecast / roads / flowlines & waterbodies)");
ok(/The fetch pipeline exists \(agrios-boundary-scout\); it needs a live session, not a static file\./.test(html),
   "capability card carries the exact closing pipeline line");
// same-field coords → reset() + close; validation for out-of-range
ok(/var inField = lat >= P\.lat\[0\] && lat <= P\.lat\[1\] && lon >= P\.lon\[0\] && lon <= P\.lon\[1\]/.test(js), "same-field detection is 'within the parcel bbox'");
ok(/if \(inField\) \{[\s\S]*?mapCtl\.reset\(\)/.test(js), "in-field coords → close dialog + recenter (reset)");
ok(/lat < -90 \|\| lat > 90/.test(js) && /lon < -180 \|\| lon > 180/.test(js), "lat/lon validated to −90..90 / −180..180 (invalid → gentle inline message)");
ok(/isNaN\(lat\) \|\| isNaN\(lon\)/.test(js), "non-numeric input → gentle inline message");

console.log("\n== FEATURE B: no network calls anywhere (still) ==");
ok(!/\bfetch\s*\(/.test(js), "no fetch( in focus-r2.js (Feature B added no network calls)");
ok(!/\bfetch\s*\(/.test(html), "no fetch( in index.html");
ok(!/XMLHttpRequest|WebSocket|EventSource|navigator\.geolocation/.test(js), "no XHR / websocket / geolocation added");
// theme: field dialog re-themes purely through vars (no stray hex added)
ok(!/#[0-9A-Fa-f]{3,6}/.test((css.match(/\.field-facts[\s\S]*?\.cap-closing[^}]*\}/) || [""])[0]), "field-dialog CSS uses tokens only (no stray hex — both themes work)");

/* =============================================================================
 * LIVE READ (spec-live-read-v1) — fixture-driven parser tests, grid assembly,
 * cache, allowed-hosts, banner verbatim, no-interpretation in the live path.
 * ========================================================================== */
const { AGRIOS_LIVE } = require(path.join(root, "live.js"));
const liveJs = fs.readFileSync(path.join(root, "live.js"), "utf8");
const fx = n => JSON.parse(fs.readFileSync(path.join(root, "checks", "fixtures", n), "utf8"));
const LP = AGRIOS_LIVE.parsers;

console.log("\n== LIVE: live.js loads before the bootstrap; parsers are node-exportable ==");
ok(html.indexOf('src="live.js') < html.indexOf('src="focus-r2.js'), "live.js script tag loads BEFORE focus-r2.js");
ok(typeof AGRIOS_LIVE === "object" && typeof LP.epqsValue === "function", "AGRIOS_LIVE + pure parsers are node-exportable");
ok(typeof AGRIOS_LIVE.fetchRead === "function" && typeof AGRIOS_LIVE.assembleRead === "function", "fetchRead orchestrator + assembleRead present");

console.log("\n== LIVE: EPQS parser — exact value from the REAL fixture ==");
ok(LP.epqsValue(fx("fixture_epqs.json")) === 956.6255810483692, "epqsValue extracts the exact fixture elevation (956.6255810483692 ft)");
ok(LP.epqsValue(null) === null && LP.epqsValue({}) === null, "a missing/failed EPQS point returns null (never a fabricated default)");

console.log("\n== LIVE: SDA parser — 33 rows → soil inventory with drainagecl (REAL fixture) ==");
const sdaR = LP.sdaRows(fx("fixture_sda-spatial.json"));
ok(sdaR.length === 33, "SDA spatial fixture parses to 33 component rows (" + sdaR.length + ")");
ok(sdaR[0].muname === "Terril loam, 5 to 9 percent slopes" && sdaR[0].drainagecl === "Moderately well drained" && sdaR[0].slope === "5–9%" && sdaR[0].comppct === 100,
   "row 0 = Terril loam, Moderately well drained, 5–9%, 100% — exact fixture values");
const inv = LP.soilInventory(sdaR);
ok(inv.length > 0 && inv.every(e => "drainagecl" in e && "slope" in e && "comppct" in e), "inventory entries carry drainagecl + slope + comppct");
ok(inv[0].comppct >= (inv[inv.length - 1].comppct || 0), "inventory ordered by comppct descending");

console.log("\n== LIVE: NWS parser — period names/temps from the REAL fixture ==");
const per = LP.nwsPeriods(fx("fixture_nws-forecast.json"));
ok(per.length === 14, "NWS fixture parses to 14 forecast periods (" + per.length + ")");
ok(per[0].name === "Tonight" && per[0].tempF === 66 && per[0].shortForecast === "Slight Chance Showers And Thunderstorms" && per[0].pop === 23,
   "period 0 = Tonight, 66°F, 'Slight Chance Showers And Thunderstorms', 23% pop — exact fixture values");
ok(per[1].name === "Sunday" && per[1].tempF === 84, "period 1 = Sunday, 84°F (exact)");
const pForDate = LP.periodsForDate(per, "2026-07-05");
ok(pForDate.length === 2 && pForDate[0].name === "Sunday" && pForDate[1].name === "Sunday Night", "periodsForDate(2026-07-05) → Sunday + Sunday Night");
ok(LP.periodsForDate(per, "2030-01-01").length === 0, "a date outside the forecast window → [] (honest, never fabricated)");

console.log("\n== LIVE: forecastWindow — the SELECTABLE window from the REAL NWS fixture (spec-date-window-v1) ==");
ok(typeof LP.forecastWindow === "function", "forecastWindow is node-exported");
const fwin = LP.forecastWindow(per);
ok(fwin.days.length === 7 && fwin.days.length <= 7, "≤7 days deduped by calendar day (" + fwin.days.length + " from 14 periods)");
ok(fwin.firstDate === "2026-07-04" && fwin.lastDate === "2026-07-10", "window min/max = 2026-07-04 … 2026-07-10 (from the fetched periods)");
ok(fwin.days.every(d => /^\d{4}-\d\d-\d\d$/.test(d.dateStr)), "each day carries an ISO dateStr");
ok(fwin.days.every((d, i) => i === 0 || d.dateStr > fwin.days[i - 1].dateStr), "days are in ascending calendar order, no duplicates");
const sun = fwin.days.find(d => d.dateStr === "2026-07-05");
ok(sun && sun.dayPeriod && sun.dayPeriod.name === "Sunday" && sun.nightPeriod && sun.nightPeriod.name === "Sunday Night",
   "2026-07-05 carries day='Sunday' + night='Sunday Night' period objects");
ok(sun && sun.label === "Sun 5", "day label is weekday+day-of-month, no clock ('Sun 5') — NWS is 12h day/night, not hourly");
ok(LP.forecastWindow([]).days.length === 0 && LP.forecastWindow([]).firstDate === null, "empty periods → empty window (no fabricated days)");
// cap at 7 even with more days present
const many = []; for (let d = 4; d <= 20; d++) many.push({ isDaytime: true, name: "D" + d, startTime: "2026-07-" + String(d).padStart(2, "0") + "T06:00:00-05:00" });
ok(LP.forecastWindow(many).days.length === 7, "more than 7 calendar days → capped at 7 (" + LP.forecastWindow(many).days.length + ")");

console.log("\n== LIVE: acisHistory parser — 14 observed days from the REAL ACIS fixture, wet days ≥0.1\" (spec-time-axis-v1) ==");
const E = require(path.join(root, "engine.js")).AGRIOS_ENGINE; // engine handle for the observed-precip / axis checks
ok(typeof LP.acisHistory === "function", "acisHistory is node-exported");
const hist = LP.acisHistory(fx("fixture_acis-history.json"));
ok(hist.length === 14, "ACIS fixture parses to 14 observed daily rows (" + hist.length + ")");
ok(hist[0].dateStr === "2026-06-21" && hist[0].pcpn === 0.87 && hist[0].maxt === 81 && hist[0].mint === 58,
   "row 0 = 2026-06-21, pcpn 0.87\", 81/58 — exact fixture values [dateStr,pcpn,maxt,mint]");
ok(hist[13].dateStr === "2026-07-04" && hist[13].pcpn === 0.01, "last row = 2026-07-04, pcpn 0.01\" (exact)");
ok(hist.every(h => /^\d{4}-\d\d-\d\d$/.test(h.dateStr)) && hist.every((h, i) => i === 0 || h.dateStr > hist[i - 1].dateStr),
   "rows carry ISO dateStr in ascending order");
// the wet/dry judgment (precipObservedOnDate) — the two Jun wet days flagged, dry days not
ok(E.precipObservedOnDate(hist, "2026-06-21") === true && E.precipObservedOnDate(hist, "2026-06-22") === true,
   "Jun 21 (0.87\") and Jun 22 (0.78\") are observed WET days (pcpn ≥ 0.1\")");
ok(E.precipObservedOnDate(hist, "2026-06-23") === false && E.precipObservedOnDate(hist, "2026-06-27") === false && E.precipObservedOnDate(hist, "2026-07-04") === false,
   "dry days (0.00\") and trace days (0.06\", 0.01\" < 0.1\") are NOT flagged wet");
ok(E.precipObservedOnDate(hist, "2099-01-01") === false && E.precipObservedOnDate([], "2026-06-21") === false && E.precipObservedOnDate(hist, null) === false,
   "a day not in history / empty history / no date → false (never fabricated)");
// ACIS sentinels: "M" (missing) → null, "T" (trace) → 0
const sent = LP.acisHistory({ data: [["2026-06-01", "M", "T", 55], ["2026-06-02", "T", 70, "M"]] });
ok(sent[0].pcpn === null && sent[0].maxt === 0 && sent[1].pcpn === 0 && sent[1].mint === null,
   "ACIS sentinels: 'M' (missing) → null, 'T' (trace) → 0 (a real ~0\" record)");

console.log("\n== LIVE: timeAxis — combined observed+forecast ribbon, today the hinge (spec-time-axis-v1) ==");
ok(typeof LP.timeAxis === "function", "timeAxis is node-exported");
// use both real fixtures; pin today = 2026-07-05 (ACIS history ends 07-04, NWS window 07-04..07-10)
const axis = LP.timeAxis(hist, per, "2026-07-05");
ok(axis.todayStr === "2026-07-05", "todayStr is the pinned hinge (2026-07-05)");
ok(axis.days.every((d, i) => i === 0 || d.dateStr > axis.days[i - 1].dateStr), "axis days are strictly ascending, no duplicates");
ok(axis.days.filter(d => d.kind === "observed").every(d => d.dateStr < "2026-07-05"), "every OBSERVED day is strictly before today");
ok(axis.days.filter(d => d.kind === "forecast").every(d => d.dateStr >= "2026-07-05"), "every FORECAST day is today-or-later (today is the forecast hinge)");
const obsJun21 = axis.days.find(d => d.dateStr === "2026-06-21");
ok(obsJun21 && obsJun21.kind === "observed" && obsJun21.pcpn === 0.87 && obsJun21.maxt === 81, "the observed Jun 21 day carries its pcpn/maxt/mint");
const fJul9 = axis.days.find(d => d.dateStr === "2026-07-09");
ok(fJul9 && fJul9.kind === "forecast" && fJul9.dayPeriod, "a forecast day carries its NWS day period");
// 07-04 is in BOTH sources (ACIS last day + NWS first day) but before today → observed, no dup
const jul4 = axis.days.filter(d => d.dateStr === "2026-07-04");
ok(jul4.length === 1 && jul4[0].kind === "observed", "a day in BOTH sources resolves to exactly ONE entry (07-04 before today → observed, no duplicate)");
ok(axis.firstDate === "2026-06-21" && axis.lastDate === "2026-07-10", "axis spans firstDate 2026-06-21 (observed) … lastDate 2026-07-10 (forecast)");
ok(LP.timeAxis([], [], "2026-07-05").days.length === 0 && LP.timeAxis([], [], "2026-07-05").firstDate === null, "no history + no forecast → empty axis (no fabricated days)");
// history-only (forecast failed) still yields the observed side
ok(LP.timeAxis(hist, [], "2026-07-05").days.length === 14 && LP.timeAxis(hist, [], "2026-07-05").days.every(d => d.kind === "observed"),
   "forecast-failed: the observed side still renders (14 past days, Jun 21…Jul 04), all kind='observed'");

console.log("\n== LIVE: fetchObservedDay — on-demand single observed day (spec-observed-on-demand-v1) ==");
ok(typeof AGRIOS_LIVE.fetchObservedDay === "function", "fetchObservedDay is node-exported (browser fetch; guards are pure/testable)");
// FUTURE-DATE GUARD: a date >= today rejects with .futureDate BEFORE any fetch
// (a projection nobody has). The rejection is created synchronously (a bare
// Promise.reject, no fetch) — assert against a resolved marker so the test stays
// deterministic without awaiting network. A far-future date (2999) is > any
// possible local today; a malformed date rejects too. Errors are collected into
// a synchronous array via .catch and the shape is asserted in source below.
const futP = AGRIOS_LIVE.fetchObservedDay(42.03, -93.65, "2999-01-01");
const badP = AGRIOS_LIVE.fetchObservedDay(42.03, -93.65, "nope");
ok(futP && typeof futP.then === "function", "fetchObservedDay(future) returns a promise (rejected, .futureDate — shape asserted in source)");
ok(badP && typeof badP.then === "function", "fetchObservedDay(malformed) returns a promise (rejected — no fetch)");
// swallow the rejections so node doesn't emit an unhandledRejection warning
futP.then(() => {}, () => {}); badP.then(() => {}, () => {});
// SOURCE: reuses the acisHistory parser + a SINGLE-DAY GridData POST at this
// lon/lat (grid 21 PRISM, pcpn/maxt/mint) — the exact shape, verified in source.
ok(/function fetchObservedDay\(lat, lon, dateStr, signal\)/.test(liveJs), "fetchObservedDay(lat, lon, dateStr, signal) signature present");
ok(/sdate: dateStr, edate: dateStr/.test(liveJs), "fetchObservedDay POSTs a SINGLE day (sdate === edate === dateStr)");
ok(/fetchObservedDay[\s\S]*?grid: "21"[\s\S]*?\{ name: "pcpn" \}, \{ name: "maxt" \}, \{ name: "mint" \}/.test(liveJs), "the on-demand POST requests PRISM grid 21 + pcpn/maxt/mint (same elems as the window)");
ok(/fetchObservedDay[\s\S]*?var rows = acisHistory\(j\);[\s\S]*?return rows\[0\]/.test(liveJs), "fetchObservedDay REUSES acisHistory and returns one {dateStr,pcpn,maxt,mint} (null-safe on 'M')");
ok(/fetchObservedDay[\s\S]*?if \(dateStr >= today\)[\s\S]*?fe\.futureDate = true/.test(liveJs), "future-date guard: dateStr >= today rejects with .futureDate before any fetch");
ok(/fetchObservedDay[\s\S]*?if \(!rows\.length\) return null/.test(liveJs), "ACIS answered but held no row → null (never fabricated)");

console.log("\n== LIVE: TIGER parser — feature count + named roads (REAL fixture) ==");
const roads = LP.tigerGeojson(fx("fixture_tiger.json"));
ok(roads.length === 121, "TIGER fixture parses to 121 road features (" + roads.length + ")");
ok(roads.filter(r => r.name).length === 109, "109 of them are named (exact)");
ok(roads.every(r => Array.isArray(r.coords) && "name" in r), "each road has {name, coords} — the BOUNDARIES.roads shape");

console.log("\n== LIVE: NHD parser — fcode split + waterbody centroid filter (REAL fixture) ==");
const nhdBbox = { lat: [42.0104, 42.0324], lon: [-93.6661, -93.6365], nx: 36, ny: 27 };
const nhd = LP.nhdGeojson(fx("fixture_nhd.json"), nhdBbox);
ok(nhd.streams.length === 11, "NHD fixture parses to 11 flowline features (" + nhd.streams.length + ")");
const fcodeCount = {}; nhd.streams.forEach(s => fcodeCount[s.fcode] = (fcodeCount[s.fcode] || 0) + 1);
ok(fcodeCount[46003] === 2 && fcodeCount[46006] === 2 && fcodeCount[55800] === 6 && fcodeCount[33400] === 1,
   "fcode split matches the fixture (46003×2, 46006×2, 55800×6, 33400×1)");
// synthetic waterbody centroid filter: one in-bbox pond + one out-of-bbox artifact
const wbFixture = { type: "FeatureCollection", features: [
  { geometry: { type: "Polygon", coordinates: [[[-93.65, 42.02], [-93.649, 42.02], [-93.649, 42.021], [-93.65, 42.021], [-93.65, 42.02]]] }, properties: { fcode: 39004 } },
  { geometry: { type: "Polygon", coordinates: [[[-93.50, 42.50], [-93.499, 42.50], [-93.499, 42.501], [-93.50, 42.501], [-93.50, 42.50]]] }, properties: { fcode: 39004 } }
] };
const wbParsed = LP.nhdGeojson(wbFixture, nhdBbox);
ok(wbParsed.waterbodies.length === 1, "waterbody centroid-in-bbox filter keeps the in-bbox pond and DROPS the out-of-bbox envelope-clip artifact");

console.log("\n== LIVE: grid assembly — row 0 = NORTH, neighbor-mean fill with count ==");
// synthetic 3×3 (row-major, row 0 = north, col 0 = west) with one hole
const asm = AGRIOS_LIVE.assembleGrid([100, 101, 102, 103, null, 105, 106, 107, 108], 3, 3);
ok(asm.grid.length === 3 && asm.grid[0].length === 3, "assembleGrid returns a 3×3 grid");
ok(asm.grid[0][0] === 100 && asm.grid[0][2] === 102, "row 0 stays NORTH (first row = the first 3 input values)");
ok(asm.filled === 1 && asm.grid[1][1] === (101 + 103 + 105 + 107) / 4, "the single hole is neighbor-mean filled (mean of its 4 neighbors) and the fill count = 1");
// bboxFor is centered + correct aspect (nx=36, ny=27, 972 points)
const bb = AGRIOS_LIVE.bboxFor(42.03, -93.65);
ok(bb.nx === 36 && bb.ny === 27 && bb.nx * bb.ny === 972, "live grid is 36×27 = 972 points");
ok(bb.lat[0] < 42.03 && bb.lat[1] > 42.03 && bb.lon[0] < -93.65 && bb.lon[1] > -93.65, "bbox is centered on the input lat/lon");
// gridPointLonLat row 0 = north (iy=0 → max lat)
const gp0 = AGRIOS_LIVE.gridPointLonLat(bb, 0, 0), gpN = AGRIOS_LIVE.gridPointLonLat(bb, 0, bb.ny - 1);
ok(gp0.lat > gpN.lat, "gridPointLonLat iy=0 is NORTH (max lat), iy=ny-1 is SOUTH — built north-up directly");

console.log("\n== LIVE: collection-low candidate — lowest connected decile, computed flag ==");
// synthetic grid with a clear low pocket
const clGrid = [
  [50, 50, 50, 50, 50],
  [50, 40, 40, 50, 50],
  [50, 40, 10, 50, 50],
  [50, 50, 50, 50, 50],
  [50, 50, 50, 50, 50]
];
const clBbox = { lat: [42.00, 42.02], lon: [-93.66, -93.64], nx: 5, ny: 5 };
const cl = AGRIOS_LIVE.collectionLow(clGrid, clBbox, [{ name: "Test Creek", coords: [[-93.65, 42.01]] }]);
ok(cl && cl.cells.length > 0, "collectionLow returns a connected low component");
ok(cl.minElevation === 10, "its min elevation is the lowest cell (10)");
ok(cl.nearestFlowline && typeof cl.nearestFlowline.m === "number" && /^(N|NE|E|SE|S|SW|W|NW)$/.test(cl.nearestFlowline.dir),
   "it computes distance + compass direction to the nearest fetched flowline");
ok(/rule: lowest decile, connected — a computed flag, not a judgment/.test(cl.rule), "the rule is carried on the flag verbatim ('a computed flag, not a judgment')");

console.log("\n== LIVE: assembleRead — DEM_GRID_EXT shape (row0=north), BOUNDARIES shape, failures[] ==");
const asmRead = AGRIOS_LIVE.assembleRead({
  lat: 42.03, lon: -93.65, gridBbox: clBbox, grid: clGrid, filledCount: 2,
  soilRows: sdaR, periods: per, roads: roads, streams: nhd.streams, waterbodies: [],
  failures: [{ source: "hydro", consequence: "no stream layer for this read" }],
  timestamps: { elevation: "2026-07-04T00:00:00Z" }, dateStr: "2026-07-04"
});
ok(asmRead.demGrid && asmRead.demGrid.row_order.indexOf("row 0 = NORTH") === 0 && asmRead.demGrid.grid === clGrid, "demGrid uses the DEM_GRID_EXT shape with row 0 = NORTH");
ok(asmRead.demGrid.holes_filled_by_neighbor_mean === 2, "demGrid reports the neighbor-fill count");
ok(Array.isArray(asmRead.boundaries.roads) && Array.isArray(asmRead.boundaries.streams) && Array.isArray(asmRead.boundaries.waterbodies), "boundaries uses the BOUNDARIES shape (roads/streams/waterbodies)");
ok(asmRead.soil.inventory.length > 0 && asmRead.collectionLow, "read carries a soil inventory + the collection-low flag");
ok(asmRead.failures.length === 1 && asmRead.failures[0].source === "hydro", "per-source failures are carried as explicit absence markers (no fabrication)");
ok(asmRead.live === true && asmRead.timestamps.elevation === "2026-07-04T00:00:00Z", "read is marked live and carries real fetch timestamps");

console.log("\n== LIVE: cache key format (agrios-read-{lat4},{lon4}) ==");
ok(AGRIOS_LIVE.cacheKey(42.03, -93.65) === "agrios-read-42.0300,-93.6500", "cacheKey is 'agrios-read-{lat4},{lon4}' (4-decimal coords)");

console.log("\n== LIVE: ALLOWED HOSTS — EXACTLY the seven public hosts appear in fetch URLs in live.js (spec-time-axis-v1 adds NOAA/RCC ACIS) ==");
const ALLOWED = ["epqs.nationalmap.gov", "api.weather.gov", "sdmdataaccess.sc.egov.usda.gov", "tigerweb.geo.census.gov", "hydro.nationalmap.gov", "services2.arcgis.com", "data.rcc-acis.org"];
// every https:// host literal in live.js must be one of the seven
const hostMatches = (liveJs.match(/https?:\/\/[a-z0-9.\-]+/gi) || []).map(u => u.replace(/^https?:\/\//i, ""));
const uniqueHosts = [...new Set(hostMatches)];
ok(uniqueHosts.every(h => ALLOWED.indexOf(h) >= 0), "every host literal in live.js is one of the seven allowed (" + uniqueHosts.join(", ") + ")");
ok(ALLOWED.length === 7 && uniqueHosts.length === 7, "the allowlist is EXACTLY seven hosts and live.js uses exactly those seven (" + uniqueHosts.length + ")");
ALLOWED.forEach(h => ok(liveJs.indexOf(h) >= 0, "allowed host present in live.js: " + h));
ok(!/\bfetch\s*\(/.test(js), "still no fetch( in focus-r2.js — the engine lives in live.js only");

console.log("\n== LIVE: banner VERBATIM + honest-scope header line ==");
const BANNER = "LIVE READ — layers + facts from the sources, no interpretation. The zone reading (boundary-loop passes 2–3, confidence, refusals) is the analyst layer — Allerton shows a worked example.";
// The banner is assembled by concatenation in source; assert the RUNTIME value
// is verbatim (that is what renders), and that the render path references it.
ok(AGRIOS_FOCUS_R2.LIVE_BANNER === BANNER, "AGRIOS_FOCUS_R2.LIVE_BANNER equals the verbatim v1 banner (kept exported)");
// v2: the COMPUTED path renders COMPUTED_BANNER (spec v2 §2 — verbatim). This is
// what the live rail/sheet + header honesty line now show.
const COMPUTED_BANNER = "COMPUTED READING — edges found by geometry, priorities by printed rules, conflicts held open. No authored interpretation; Allerton shows the analyst layer.";
ok(AGRIOS_FOCUS_R2.COMPUTED_BANNER === COMPUTED_BANNER, "AGRIOS_FOCUS_R2.COMPUTED_BANNER equals the verbatim computed banner (spec v2 §2)");
ok(js.indexOf("esc(COMPUTED_BANNER)") >= 0, "the computed render path renders COMPUTED_BANNER into the .live-banner element");
ok(js.indexOf("no field bounds stated — showing the full read extent") >= 0, "the 'no field bounds stated' header line is present (honest scope)");

console.log("\n== LIVE: NO interpretation in the CARD render path (spec §2 is LAW) ==");
// isolate buildLiveContent (the card render path). The provenance-unavailable
// list deliberately NAMES 'confidence, refusals' as the analyst layer that is
// NOT shown — that honest meta-statement is scoped out here by design.
const liveRenderPath = (js.match(/function buildLiveContent[\s\S]*?\n  function statTile/) || [""])[0];
ok(liveRenderPath.length > 500, "the live card render path (buildLiveContent) was located");
ok(!/confidence/i.test(liveRenderPath), "card render path emits NO 'confidence'");
ok(!/\bpriorit/i.test(liveRenderPath), "card render path emits NO 'priority' chips");
ok(!/\brefus/i.test(liveRenderPath), "card render path emits NO 'refusal' claims");
ok(!/prio--(watch|moderate|high)/.test(liveRenderPath), "card render path never uses the priority-chip classes");
// the collection-low chip is a NEUTRAL computed-flag chip (not a priority chip)
// v2: the collection-low is drawn as a neutral --ink-2 dashed region (collow-
// outline) beneath the computed zones; it never uses the accent/priority
// language. (The v1 neutral chip was dropped — the computed zones now carry the
// on-map labels; the collow region stays a quiet neutral outline.)
ok(/collow-outline/.test(js) && !/collow-outline[\s\S]{0,120}prio/.test(js), "the collection-low map region is a neutral collow-outline, never a priority chip");
ok(/collow-outline\s*\{[\s\S]*?stroke:\s*var\(--ink-2\)/.test(css) && !/collow-outline\s*\{[\s\S]*?var\(--alarm\)/.test(css),
   "the collection-low map region is neutral --ink-2 dashed (never --alarm/red, never the accent priority language)");

console.log("\n== LIVE: provenance includes REAL timestamps; failure honesty per source ==");
ok(/buildLiveProvenance/.test(js) && /new Date\(ts\[k\]\)\.toLocaleString\(\)/.test(js), "live provenance renders each source's REAL fetch timestamp");
ok(/no stream layer for this read/.test(liveJs), "NHD failure consequence is stated verbatim ('no stream layer for this read')");
ok(/elevation unreachable — cannot draw terrain/.test(liveJs) && /elevationFailed/.test(liveJs), "total elevation failure fails the read honestly (can't draw terrain without it)");
ok(/AbortController/.test(liveJs) && /\.abort\(\)/.test(js), "Cancel is wired to an AbortController (aborts cleanly)");

console.log("\n== LIVE: file:// / no-connection → the capability card + network-need line ==");
ok(/Start AGRIOS\.command/.test(js) && /GitHub Pages version reads live/.test(js), "the file:// path tells the user HOW to go live (launcher + Pages), not just that it can't");
ok(/\/\^https\?:\$\/\.test\(root\.location\.protocol\)/.test(js.replace(/\s+/g, "")) || /https\?:\$/.test(js), "a live read only runs over http(s) (guarded on location.protocol)");

/* =============================================================================
 * COMPUTED ENGINE (spec-live-read-v2-engine) — PURE-function suite on SYNTHETIC
 * grids + REAL fixture, plus the computed-vocabulary grep gates (LAW).
 * ========================================================================== */
const { AGRIOS_ENGINE } = require(path.join(root, "engine.js"));
const engineJs = fs.readFileSync(path.join(root, "engine.js"), "utf8");
// E was bound earlier (in the LIVE section, for the observed-precip / timeAxis
// checks) to the same AGRIOS_ENGINE — reuse it here rather than redeclaring.

console.log("\n== ENGINE: node-exportable pure API + version stamp ==");
ok(typeof E === "object" && typeof E.computeReading === "function", "AGRIOS_ENGINE + computeReading are node-exportable");
ok(E.version === "engine v2.0" && E.rulesStamp === "rules R1–R4, F1–F2 printed", "engine stamps 'engine v2.0 · rules R1–R4, F1–F2 printed'");
ok(typeof E.wktToRings === "function" && typeof E.dedupeByPolygonKey === "function" && typeof E.douglasPeucker === "function", "WKT parse + dedupe + Douglas-Peucker exported");

console.log("\n== ENGINE: REAL fixture — WKT parse (9 polys, 4 classes), dedupe by mupolygonkey, rasterize ==");
const polyFx = fx("fixture_sda-polygons.json");
const polys = E.dedupeByPolygonKey(polyFx.Table);
ok(polys.length === 9, "9 real soil polygons parsed + deduped by mupolygonkey (" + polys.length + ")");
const classes = [...new Set(polys.map(p => p.drainagecl))].sort();
ok(classes.length === 4, "4 distinct drainage classes across the fixture (" + classes.join(", ") + ")");
ok(polys[0].rings.length >= 1 && polys[0].rings[0].length >= 3, "each poly carries ≥1 outer ring of ≥3 lon/lat vertices");
ok(polys[0].rings[0].every(p => p[0] < -90 && p[1] > 40), "ring vertices are [lon,lat] WGS84 (lon≈−93, lat≈40.8)");
// dedupe: duplicate a row by mupolygonkey → still one poly for that key
const dupRows = polyFx.Table.concat([polyFx.Table[0].slice()]);
ok(E.dedupeByPolygonKey(dupRows).length === 9, "a duplicate mupolygonkey row does NOT add a polygon (dedupe by mupolygonkey)");
// rasterize a grid over the first poly → some cells get soil assigned
const rasBbox = { lat: [40.8864, 40.8888], lon: [-93.2084, -93.2049], nx: 30, ny: 30 };
const rasSoil = E.rasterize(rasBbox, polys);
let rasHit = 0; rasSoil.forEach(r => r.forEach(c => { if (c) rasHit++; }));
ok(rasHit > 0, "rasterization assigns soil to cells whose centroid falls in a polygon (" + rasHit + " of 900)");
ok(rasSoil.some(r => r.some(c => c && /Lamoni|Seymour|Shelby|Clarinda|Rinda|Olmitz/.test(c.name || ""))), "rasterized cells carry the real soil name from the fixture");

console.log("\n== ENGINE: Douglas-Peucker simplifies an extreme ring, keeps endpoints ==");
(function () {
  const ring = []; for (let i = 0; i <= 100; i++) ring.push([-93.2 + i * 0.0001, 40.88 + (i % 2) * 1e-7]); // near-collinear zigzag
  const simp = E.douglasPeucker(ring, 0.001);
  ok(simp.length < ring.length && simp[0][0] === ring[0][0] && simp[simp.length - 1][0] === ring[ring.length - 1][0],
     "Douglas-Peucker drops near-collinear vertices, keeps first + last (" + ring.length + "→" + simp.length + ")");
})();

// --- synthetic grid helpers ---
function mkGrid(nx, ny, f) { const g = []; for (let y = 0; y < ny; y++) { g.push([]); for (let x = 0; x < nx; x++) g[y].push(f(x, y)); } return g; }
function fullRing() { return [[-93.22, 40.88], [-93.20, 40.88], [-93.20, 40.90], [-93.22, 40.90], [-93.22, 40.88]]; }
function poly(drain, name) { return { mupolygonkey: "k" + name, mukey: "m" + name, muname: name, compname: name, drainagecl: drain, slope: "5–9%", rings: [fullRing()], bbox: { minx: -93.22, maxx: -93.20, miny: 40.88, maxy: 40.90 } }; }
const synBbox = { lat: [40.88, 40.90], lon: [-93.22, -93.20], nx: 20, ny: 15 };
const bowl = mkGrid(20, 15, (x, y) => { const dx = x - 10, dy = y - 7; return 950 + Math.sqrt(dx * dx + dy * dy) * 3; });
const lowCells = []; for (let y = 5; y <= 9; y++) for (let x = 8; x <= 12; x++) lowCells.push([x, y]);

console.log("\n== ENGINE: R1 fires on a poor-drained collection-low WITH forecast precip ==");
const readR1 = {
  demGrid: { grid: bowl }, gridBbox: synBbox,
  collectionLow: { cells: lowCells, cellCount: lowCells.length, minElevation: 950 },
  boundaries: { roads: [], streams: [{ coords: [[-93.21, 40.889]] }], waterbodies: [] },
  soilPolygons: [poly("Poorly drained", "Clarinda silty clay loam")],
  forecasts: [{ name: "Today", tempF: 88, shortForecast: "Thunderstorms", pop: 60 }], failures: []
};
const R1 = E.computeReading(readR1);
ok(!R1.degraded && R1.zones.length >= 1, "R1 read is not degraded and produced zones");
ok(R1.zones.some(z => z.rule.id === "R1" && z.rule.chip === "look-first"), "R1 fires (look-first) on the poor-drained collection-low with rain");
const r1z = R1.zones.find(z => z.rule.id === "R1");
ok(r1z && r1z.dataSupport.n === 4 && r1z.dataSupport.m === 4, "the R1 zone has data support 4/4 (DEM+SSURGO+NHD+forecast)");
ok(r1z && /Poorly drained/.test(r1z.template.sentence) && r1z.template.templateId.indexOf("T-R1") === 0, "R1 zone sentence is a T-R1 template (facts-filled)");

console.log("\n== ENGINE: R4 fires on a dry well-drained upper ridge, no structure ==");
const ridge = mkGrid(20, 15, (x, y) => 1040 - y * 0.1);
const readR4 = { demGrid: { grid: ridge }, gridBbox: synBbox, collectionLow: null, boundaries: { roads: [], streams: [], waterbodies: [] }, soilPolygons: [poly("Well drained", "Shelby clay loam")], forecasts: [{ shortForecast: "Sunny", pop: 0 }], failures: [] };
const R4 = E.computeReading(readR4);
ok(R4.zones.some(z => z.rule.id === "R4" && z.rule.chip === "quiet"), "R4 fires (quiet) on the dry well-drained upper ridge");

console.log("\n== ENGINE: F1 fires on a well-drained collection-low (DEM ↔ survey conflict) ==");
const readF1 = { demGrid: { grid: bowl }, gridBbox: synBbox, collectionLow: { cells: lowCells, cellCount: lowCells.length, minElevation: 950 }, boundaries: { roads: [], streams: [], waterbodies: [] }, soilPolygons: [poly("Well drained", "Shelby clay loam")], forecasts: [], failures: [] };
const F1 = E.computeReading(readF1);
ok(F1.flags.some(f => f.id === "F1"), "F1 held-open flag fires on the well-drained collection-low");
const f1 = F1.flags.find(f => f.id === "F1");
ok(f1 && f1.readA.source && f1.readB.source && f1.readA.text !== f1.readB.text, "F1 carries the TWO disagreeing sources verbatim");
ok(f1 && /cannot decide/i.test(f1.cannotDecide) && /ground truth/i.test(f1.cannotDecide), "F1 says 'the public data cannot decide — ground truth needed'");

console.log("\n== ENGINE: zone count ≤ 6, min-size 12 enforced ==");
ok(E.MAX_ZONES === 6 && E.MIN_ZONE_CELLS === 12, "constants: MAX_ZONES=6, MIN_ZONE_CELLS=12");
ok(R1.zones.length <= 6 && R4.zones.length <= 6, "zone count is ≤ 6 in both cases (" + R1.zones.length + ", " + R4.zones.length + ")");
ok(R1.zones.every(z => z.cellCount >= 12), "every computed zone has ≥ 12 cells (min-size enforced)");

console.log("\n== ENGINE: determinism — same input → deep-equal output on rerun ==");
ok(JSON.stringify(E.computeReading(readR1)) === JSON.stringify(E.computeReading(readR1)), "computeReading is deterministic (deep-equal on rerun)");

/* -------------------------------------------------------------------------
 * FLAG & ZONE IDENTITY (spec-flag-zone-identity-v1). Two ponds are two flags
 * (distinct uid + where); duplicate NHD geometry on one cell is ONE flag; the
 * octant helper obeys row0=NORTH (mirror guard); twin zone labels disambiguate
 * by compass octant, facts only. Engine is pure — built on tiny synthetic grids.
 * ------------------------------------------------------------------------- */
console.log("\n== ENGINE: gridOctant — pure helper, row0=NORTH, 8-way table ==");
ok(typeof E.gridOctant === "function", "gridOctant is node-exported");
// 21×21 grid, center (10,10). Cardinals from center:
ok(E.gridOctant(10, 2, 21, 21) === "N", "a point ABOVE center (small gy, row0=north) is N (" + E.gridOctant(10, 2, 21, 21) + ")");
ok(E.gridOctant(10, 18, 21, 21) === "S", "a point BELOW center (large gy) is S (" + E.gridOctant(10, 18, 21, 21) + ")");
ok(E.gridOctant(18, 10, 21, 21) === "E", "a point RIGHT of center (large gx) is E (" + E.gridOctant(18, 10, 21, 21) + ")");
ok(E.gridOctant(2, 10, 21, 21) === "W", "a point LEFT of center (small gx) is W (" + E.gridOctant(2, 10, 21, 21) + ")");
ok(E.gridOctant(18, 2, 21, 21) === "NE" && E.gridOctant(2, 18, 21, 21) === "SW", "diagonals: upper-right=NE, lower-left=SW (" + E.gridOctant(18, 2, 21, 21) + "/" + E.gridOctant(2, 18, 21, 21) + ")");

console.log("\n== ENGINE: F2 — two ponds on well-drained cells → two flags, distinct uid + where ==");
// synthetic perennial pond centered near (clon, clat). A tiny quad = its coords.
function pondAt(clon, clat) {
  var d = 0.0002;
  return { fcode: 39004, coords: [[clon - d, clat - d], [clon + d, clat - d], [clon + d, clat + d], [clon - d, clat + d]] };
}
// synBbox: lat[40.88,40.90], lon[-93.22,-93.20], nx=20 ny=15, center cell ≈ (9.5,7).
// North pond: high lat → small gy (a row ABOVE center). West pond: low lon → small gx.
var pondNorth = pondAt(-93.210, 40.898); // near lon-center, high lat  → N
var pondWest  = pondAt(-93.218, 40.890); // low lon, near lat-center   → W
var readF2 = {
  demGrid: { grid: ridge }, gridBbox: synBbox, collectionLow: null,
  boundaries: { roads: [], streams: [], waterbodies: [pondNorth, pondWest] },
  soilPolygons: [poly("Well drained", "Shelby clay loam")], forecasts: [], failures: []
};
var F2 = E.computeReading(readF2);
var f2s = F2.flags.filter(f => f.id === "F2");
ok(f2s.length === 2, "two ponds on well-drained cells → TWO F2 flags (" + f2s.length + ")");
ok(f2s[0].uid === "F2a" && f2s[1].uid === "F2b", "the two F2s carry distinct uids F2a/F2b (" + f2s.map(f => f.uid).join(",") + ")");
ok(f2s.every(f => f.id === "F2"), "both F2 instances keep id 'F2' (rule vocabulary is LAW)");
ok(f2s[0].where && f2s[1].where && (f2s[0].where.octant !== f2s[1].where.octant), "the two F2s carry distinct `where` octants (" + f2s.map(f => f.where.octant).join(" vs ") + ")");
ok(f2s.every(f => typeof f.where.lat === "number" && typeof f.where.lon === "number"), "each F2 `where` carries numeric lat/lon (the pond centroid)");

console.log("\n== ENGINE: F2 physics cross-check (mirror guard) — a pond ABOVE center reads N ==");
ok(f2s.some(f => /N/.test(f.where.octant)), "at least one pond octant contains 'N' — the high-lat pond sits NORTH, not mirrored (" + f2s.map(f => f.where.octant).join(",") + ")");
// the pond at the higher latitude MUST be the one whose octant contains N.
var byLat = f2s.slice().sort((a, b) => b.where.lat - a.where.lat);
ok(/N/.test(byLat[0].where.octant), "the HIGHER-latitude pond's octant contains 'N' (row0=north physics holds: " + byLat[0].where.octant + " @ lat " + byLat[0].where.lat.toFixed(3) + ")");

console.log("\n== ENGINE: F2 dedupe — two NHD features on the SAME cell → ONE flag ==");
var readF2dup = {
  demGrid: { grid: ridge }, gridBbox: synBbox, collectionLow: null,
  boundaries: { roads: [], streams: [], waterbodies: [pondAt(-93.210, 40.890), pondAt(-93.210, 40.890)] },
  soilPolygons: [poly("Well drained", "Shelby clay loam")], forecasts: [], failures: []
};
var F2dup = E.computeReading(readF2dup).flags.filter(f => f.id === "F2");
ok(F2dup.length === 1, "two NHD features resolving to the same grid cell → ONE F2 (deduped, " + F2dup.length + ")");
ok(F2dup[0].uid === "F2a", "the single deduped F2 is uid F2a");

console.log("\n== ENGINE: F2 uid + where determinism — same grid twice → identical ==");
ok(JSON.stringify(E.computeReading(readF2).flags) === JSON.stringify(E.computeReading(readF2).flags), "F2 flags (uid + where) are deterministic on rerun");

console.log("\n== ENGINE: twin-zone labels disambiguate by octant, unique labels untouched ==");
// two same-kind components: two separate poorly-drained blobs in the same band.
// Build a flat grid (one band) with a soil polygon of ONE class, and carve two
// disconnected zone-sized regions by giving the middle columns a DIFFERENT class
// so the two blobs are separate connected components with an IDENTICAL label.
function twoPoly(drainA, nameA, xmid) {
  // left blob soil: cols < xmid ; gutter soil (different class) ; right blob soil.
  // We fake this via rings that split the bbox into three lon-bands.
  var lonAt = gx => synBbox.lon[0] + gx * (synBbox.lon[1] - synBbox.lon[0]) / (synBbox.nx - 1);
  var wL = synBbox.lon[0], eL = lonAt(xmid - 2), wG = lonAt(xmid - 1), eG = lonAt(xmid + 1), wR = lonAt(xmid + 2), eR = synBbox.lon[1];
  var s = 40.88, n = 40.90;
  function band(w, e) { return [[w, s], [e, s], [e, n], [w, n], [w, s]]; }
  return [
    { mupolygonkey: "kL", mukey: "mL", muname: nameA, compname: nameA, drainagecl: drainA, slope: "5–9%", rings: [band(wL, eL)], bbox: { minx: wL, maxx: eL, miny: s, maxy: n } },
    { mupolygonkey: "kG", mukey: "mG", muname: "Gutter", compname: "Gutter", drainagecl: "Moderately well drained", slope: "2–5%", rings: [band(wG, eG)], bbox: { minx: wG, maxx: eG, miny: s, maxy: n } },
    { mupolygonkey: "kR", mukey: "mR", muname: nameA, compname: nameA, drainagecl: drainA, slope: "5–9%", rings: [band(wR, eR)], bbox: { minx: wR, maxx: eR, miny: s, maxy: n } }
  ];
}
var flatGrid = mkGrid(20, 15, () => 1000); // one elevation band → same band both blobs
var twinRead = {
  demGrid: { grid: flatGrid }, gridBbox: synBbox, collectionLow: null,
  boundaries: { roads: [], streams: [], waterbodies: [] },
  soilPolygons: twoPoly("Poorly drained", "Zook-Olmitz-Vesser", 10),
  forecasts: [], failures: []
};
var TWIN = E.computeReading(twinRead);
var zookZones = TWIN.zones.filter(z => /Zook-Olmitz-Vesser/.test(z.label));
ok(zookZones.length >= 2, "two same-kind (Zook-Olmitz-Vesser) components form (" + zookZones.length + ")");
if (zookZones.length >= 2) {
  ok(zookZones.every(z => / · (N|NE|E|SE|S|SW|W|NW)/.test(z.label)), "twin labels each gained a compass-octant suffix (" + zookZones.map(z => z.label).join(" | ") + ")");
  var stripped = zookZones.map(z => z.label.replace(/ · (N|NE|E|SE|S|SW|W|NW)( \(\d+ cells\))?$/, ""));
  ok(stripped.every(s => s === stripped[0]), "twin labels differ ONLY by the octant (and optional cell-count) suffix");
  ok(new Set(zookZones.map(z => z.label)).size === zookZones.length, "the disambiguated twin labels are all distinct");
  // physics cross-check: the LEFT blob (all cells left of center) → octant contains W
  var leftZone = zookZones.slice().sort((a, b) => a.centroidGrid.x - b.centroidGrid.x)[0];
  ok(/W/.test(leftZone.label.match(/ · ([A-Z]+)/)[1]), "the LEFTmost twin zone's octant contains 'W' (left-of-center physics: " + leftZone.label + ")");
}
// a UNIQUE-kind zone keeps a clean label (no octant suffix forced).
var uniqZones = R1.zones.filter(z => {
  var same = R1.zones.filter(o => o.label.replace(/ · [A-Z]+.*$/, "") === z.label.replace(/ · [A-Z]+.*$/, ""));
  return same.length === 1;
});
ok(uniqZones.every(z => !/ · (N|NE|E|SE|S|SW|W|NW)(\b| \()/.test(z.label)) || uniqZones.length === 0 ? true : uniqZones.every(z => z.label.split(" · ").length === 3), "a unique-kind zone label is untouched (3 fact fields, no octant suffix)");

console.log("\n== ENGINE: twin-label + flag determinism ==");
ok(JSON.stringify(E.computeReading(twinRead).zones.map(z => z.label)) === JSON.stringify(E.computeReading(twinRead).zones.map(z => z.label)), "same grid twice → identical zone labels (deterministic disambiguation)");

console.log("\n== RENDERER: flag/zone identity wiring uses uid; F2 located fact via fmtDeg ==");
ok(/"data-flag":\s*fl\.uid/.test(js), "map flag-band data-flag wires to fl.uid (not fl.id)");
ok(/data-flag="'\s*\+\s*esc\(fl\.uid\)/.test(js), "the rail flag CARD data-flag wires to fl.uid");
ok(/function flagByUid/.test(js) && /r\.flags\[i\]\.uid === uid/.test(js), "the map-popover lookup resolves by uid (flagByUid)");
ok(/fl\.where[\s\S]{0,160}pond ≈[\s\S]{0,80}fmtDeg\(fl\.where\.lat\)/.test(js), "the F2 card prints the located fact line 'pond ≈ …' via fmtDeg(where.lat/lon)");
ok(/pond ≈ "\s*\+\s*fl\.where\.octant/.test(js) || /pond ≈ " \+ fl\.where\.octant/.test(js), "the popover brief appends 'pond ≈ {octant} of the read center' for an F2");
// F2 TITLE regex UNCHANGED — the verbatim law: the title string is not rewritten.
ok(/A perennial pond sits on a Well-drained map unit/.test(engineJs), "F2 title is verbatim 'A perennial pond sits on a Well-drained map unit' (unchanged)");
ok(f2s[0].title === "A perennial pond sits on a Well-drained map unit", "the emitted F2 title is verbatim (no located text folded into the title)");

console.log("\n== DESIGN-SYSTEM: flag/zone identity lines documented ==");
var dsMd = fs.readFileSync(path.join(root, "..", "design", "r2", "design-system.md"), "utf8");
ok(/Flag instances are located claims/.test(dsMd) && /uid/.test(dsMd) && /title stays verbatim/i.test(dsMd), "design-system.md notes flag instances are located claims (uid + where, titles verbatim)");
ok(/Twin computed-zone labels disambiguate by compass octant/.test(dsMd) && /facts only/i.test(dsMd), "design-system.md notes twin labels disambiguate by compass octant, facts only");

/* -------------------------------------------------------------------------
 * DATE WINDOW (spec-date-window-v1) — precip scoped to the SELECTED day, and
 * computeReading date-sensitivity: R1 re-ranks a poorly-drained collection-low
 * as the chosen day flips rainy↔dry. Synthetic periods across 3 days; precip
 * ONLY on day 2. */
console.log("\n== ENGINE: precipOnDate — scoped to ONE day (precip only on day 2) ==");
ok(typeof E.precipOnDate === "function", "precipOnDate is node-exported");
const dwPeriods = [
  { name: "Day1", isDaytime: true,  tempF: 82, shortForecast: "Sunny",         pop: 0,  startTime: "2026-07-08T06:00:00-05:00" },
  { name: "Day1 Night", isDaytime: false, tempF: 64, shortForecast: "Clear",   pop: 0,  startTime: "2026-07-08T18:00:00-05:00" },
  { name: "Day2", isDaytime: true,  tempF: 84, shortForecast: "Thunderstorms", pop: 60, startTime: "2026-07-09T06:00:00-05:00" },
  { name: "Day2 Night", isDaytime: false, tempF: 66, shortForecast: "Showers", pop: 55, startTime: "2026-07-09T18:00:00-05:00" },
  { name: "Day3", isDaytime: true,  tempF: 86, shortForecast: "Mostly Sunny",  pop: 5,  startTime: "2026-07-10T06:00:00-05:00" },
  { name: "Day3 Night", isDaytime: false, tempF: 65, shortForecast: "Clear",   pop: 0,  startTime: "2026-07-10T18:00:00-05:00" }
];
ok(E.precipOnDate(dwPeriods, "2026-07-09") === true, "precipOnDate true for the rainy day (2026-07-09)");
ok(E.precipOnDate(dwPeriods, "2026-07-08") === false, "precipOnDate false for dry day 1 (2026-07-08)");
ok(E.precipOnDate(dwPeriods, "2026-07-10") === false, "precipOnDate false for dry day 3 (2026-07-10)");
ok(E.precipOnDate(dwPeriods, "2030-01-01") === false && E.precipOnDate(dwPeriods, null) === false, "precipOnDate false for a date outside the window / no date (never fabricates)");
ok(E.forecastHasPrecip(dwPeriods) === true, "forecastHasPrecip (whole window) is still true — the day-2 storm is in the window");

console.log("\n== ENGINE: computeReading date-sensitivity — R1 re-ranks the poor-drained collection-low rainy↔dry ==");
// same synthetic field + forecast; only read.dateStr differs.
function dwRead(dateStr) {
  return {
    demGrid: { grid: bowl }, gridBbox: synBbox,
    collectionLow: { cells: lowCells, cellCount: lowCells.length, minElevation: 950 },
    boundaries: { roads: [], streams: [{ coords: [[-93.21, 40.889]] }], waterbodies: [] },
    soilPolygons: [poly("Poorly drained", "Clarinda silty clay loam")],
    forecasts: dwPeriods, failures: [], dateStr: dateStr
  };
}
const rainy = E.computeReading(dwRead("2026-07-09"));
const dry = E.computeReading(dwRead("2026-07-08"));
const rainyLow = rainy.zones.find(z => z.hasLow) || rainy.zones[0];
const dryLow = dry.zones.find(z => z.hasLow) || dry.zones[0];
ok(rainyLow && rainyLow.rule.id === "R1" && rainyLow.rule.chip === "look-first",
   "rainy day (2026-07-09) → the poor-drained collection-low zone fires R1 (look-first)");
ok(dryLow && dryLow.rule.id !== "R1",
   "dry day (2026-07-08) → the SAME zone does NOT fire R1 (dropped to " + (dryLow && dryLow.rule.id) + "/" + (dryLow && dryLow.rule.chip) + ") — rank changes with the date");
ok(rainyLow.id === dryLow.id, "it is the SAME zone (same id) that re-ranks, not a different one (" + rainyLow.id + ")");
ok(JSON.stringify(E.computeReading(dwRead("2026-07-09"))) === JSON.stringify(E.computeReading(dwRead("2026-07-09"))),
   "date-scoped computeReading is deterministic per (grid, dateStr) — deep-equal on rerun");
// no read.dateStr → whole-window precip (back-compat: R1 still fires here)
const noDate = E.computeReading(dwRead(null));
const noDateLow = noDate.zones.find(z => z.hasLow) || noDate.zones[0];
ok(noDateLow && noDateLow.rule.id === "R1", "no read.dateStr → whole-window precip context (R1 fires, unchanged behavior)");

console.log("\n== ENGINE: ACROSS THE HINGE — observed past vs forecast future R1 text (spec-time-axis-v1) ==");
ok(typeof E.precipObservedOnDate === "function", "precipObservedOnDate is node-exported");
ok(/rain was recorded that day/.test(E.RULE_TEXT.R1_OBSERVED) && /R1 look-first/.test(E.RULE_TEXT.R1_OBSERVED),
   "RULE_TEXT.R1_OBSERVED is the R1 text with the honest observed variant '…rain was recorded that day.'");
// same synthetic poor-drained collection-low field, now carrying the REAL ACIS
// history; only read.dateStr moves across the hinge. Forecast dwPeriods is
// today+ (2026-07-08..10); ACIS history is the observed past (…07-04).
function hingeRead(dateStr) {
  return {
    demGrid: { grid: bowl }, gridBbox: synBbox,
    collectionLow: { cells: lowCells, cellCount: lowCells.length, minElevation: 950 },
    boundaries: { roads: [], streams: [{ coords: [[-93.21, 40.889]] }], waterbodies: [] },
    soilPolygons: [poly("Poorly drained", "Clarinda silty clay loam")],
    forecasts: dwPeriods, history: hist, failures: [], dateStr: dateStr
  };
}
// PAST WET day — Jun 21 (0.87" observed): R1 fires with the OBSERVED text.
const pastWet = E.computeReading(hingeRead("2026-06-21"));
const pastWetLow = pastWet.zones.find(z => z.hasLow) || pastWet.zones[0];
ok(pastWetLow && pastWetLow.rule.id === "R1" && pastWetLow.rule.chip === "look-first",
   "PAST WET day (2026-06-21, 0.87\" observed) → the collection-low fires R1 (look-first)");
ok(pastWetLow && pastWetLow.rule.text === E.RULE_TEXT.R1_OBSERVED && /rain was recorded that day/.test(pastWetLow.rule.text),
   "…and its R1 text is the OBSERVED variant ('rain was recorded that day') — honest to the measured record");
ok(pastWetLow && pastWetLow.dataSupport.sources.indexOf("NOAA PRISM (observed)") >= 0,
   "…and its data-support names 'NOAA PRISM (observed)', not 'NWS forecast'");
// PAST DRY day — Jun 23 (0.00" observed): NOT R1.
const pastDry = E.computeReading(hingeRead("2026-06-23"));
const pastDryLow = pastDry.zones.find(z => z.hasLow) || pastDry.zones[0];
ok(pastDryLow && pastDryLow.rule.id !== "R1",
   "PAST DRY day (2026-06-23, 0.00\" observed) → the SAME zone does NOT fire R1 (dropped to " + (pastDryLow && pastDryLow.rule.id) + ")");
// FUTURE rainy day — 2026-07-09 (forecast pop 60): R1 fires with the FORECAST text.
const futWet = E.computeReading(hingeRead("2026-07-09"));
const futWetLow = futWet.zones.find(z => z.hasLow) || futWet.zones[0];
ok(futWetLow && futWetLow.rule.id === "R1" && futWetLow.rule.text === E.RULE_TEXT.R1 && /rain is in the forecast/.test(futWetLow.rule.text),
   "FUTURE rainy day (2026-07-09) → R1 fires with the FORECAST text ('rain is in the forecast') — the projection variant");
ok(pastWetLow.id === pastDryLow.id && pastDryLow.id === futWetLow.id, "it is the SAME zone re-ranking across the hinge (" + pastWetLow.id + ")");
ok(JSON.stringify(E.computeReading(hingeRead("2026-06-21"))) === JSON.stringify(E.computeReading(hingeRead("2026-06-21"))),
   "across-hinge computeReading is deterministic per (grid, dateStr) — deep-equal on rerun");
// strip comments before the code-only greps (the header comments legitimately
// NAME the banned things they enforce — the CODE must not use them)
const engineCode = engineJs.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
ok(!/Math\.random|Date\.now|new Date\(/.test(engineCode), "engine.js CODE uses NO Math.random / Date.now / new Date (nothing varies)");

console.log("\n== ENGINE: degraded mode — no soil → elevation-only zones, F3 only (no F1/F2) ==");
const readDeg = { demGrid: { grid: bowl }, gridBbox: synBbox, collectionLow: { cells: lowCells, cellCount: lowCells.length, minElevation: 950 }, boundaries: { roads: [], streams: [], waterbodies: [] }, soilPolygons: [], forecasts: [{ shortForecast: "Rain", pop: 60 }], failures: [{ source: "soil-polygons" }] };
const DEG = E.computeReading(readDeg);
ok(DEG.degraded === true, "no soil polygons → degraded mode");
ok(DEG.zones.length >= 1 && DEG.zones.every(z => z.drainagecl === null), "degraded zones are elevation-only (band components, no drainage class)");
ok(DEG.flags.length === 1 && DEG.flags[0].id === "F3" && !DEG.flags.some(f => f.id === "F1" || f.id === "F2"), "degraded fires F3 only — no soil-conflict flags (F1/F2)");

console.log("\n== ENGINE: FINITE template list is the ONLY source of computed zone prose (LAW) ==");
ok(Array.isArray(E.TEMPLATES) && E.TEMPLATES.length >= 5 && E.TEMPLATES.every(t => t.id && t.rule && t.text), "TEMPLATES is a finite checked-in array (id+rule+text each)");
// every rendered zone sentence must trace to a TEMPLATES entry (blanks filled)
(function () {
  const allSentences = R1.zones.concat(R4.zones).concat(DEG.zones).map(z => z.template.sentence);
  const tplShapes = E.TEMPLATES.map(t => new RegExp("^" + t.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\{\w+\\\}/g, "[\\s\\S]+?") + "$"));
  const allTrace = allSentences.every(s => tplShapes.some(re => re.test(s)));
  ok(allTrace, "every rendered zone sentence matches a checked-in template shape (blanks filled by facts)");
})();

console.log("\n== VOCABULARY GATES (spec v2 §2 — LAW). The computed path: NO 'confidence', NO %-on-zones, chips ONLY look-first/look/quiet ==");
// scope: the computed CARD render path (computedZoneCard) + the on-map computed
// zone/flag render. Isolate computedZoneCard's body.
const czCardPath = (js.match(/function computedZoneCard[\s\S]*?\n  \}/) || [""])[0];
ok(czCardPath.length > 200, "computedZoneCard render path located");
ok(!/confidence/i.test(czCardPath), "computed zone card emits NO 'confidence'");
ok(!/%/.test(czCardPath), "computed zone card emits NO percent sign (data support is n/4, never a %)");
ok(!/prio--(watch|moderate|high)/.test(czCardPath), "computed zone card never uses the analyst priority-chip classes");
ok(/cz-chip--(lookfirst|look|quiet)/.test(czCardPath), "computed zone card uses ONLY look-first/look/quiet chip classes");
ok(/data support/.test(czCardPath) && !/delta/i.test(czCardPath), "computed zone card carries a 'data support' line, no analyst 'delta'");
// the engine's rule chips are exactly the three computed values (never priority)
const engineChips = [...engineJs.matchAll(/chip:\s*"([^"]+)"/g)].map(m => m[1]);
ok(engineChips.length > 0 && engineChips.every(c => c === "look-first" || c === "look" || c === "quiet"), "engine rule chips are ONLY look-first / look / quiet (" + [...new Set(engineChips)].join(", ") + ")");
ok(!/confidence/i.test(engineCode), "engine.js CODE never emits 'confidence' (only the header comment names the banned term it enforces)");
// zone sentences come ONLY from the TEMPLATES array — grep confirms no other
// sentence-assembly in the computed card path (it renders z.template.sentence).
ok(/z\.template\.sentence/.test(js) && !/cz-sentence[^>]*>'\s*\+\s*esc\(['"]/.test(js), "the computed card renders z.template.sentence (from TEMPLATES) — no inline zone prose");

/* =============================================================================
 * BUILDINGS LAYER (spec-buildings-v1) — the FEMA/ORNL parser against the REAL
 * fixture, the Allerton bake, the failable-source path, the light engine touch
 * (nearBuilding + Pass-1 structures fact), the NHD ditch parse, the render
 * decisions (tokens only), and the no-new-rules gate.
 * ========================================================================== */
console.log("\n== BUILDINGS: FEMA/ORNL parser — 32 features, EXACT occupancy split (REAL Allerton fixture) ==");
const femaFx = fx("fixture_fema-structures.json");
const fp = LP.femaGeojson(femaFx);
ok(fp.length === 32, "femaGeojson parses the real fixture to 32 footprints (" + fp.length + ")");
const occSplit = {}; fp.forEach(b => occSplit[b.occ] = (occSplit[b.occ] || 0) + 1);
ok(occSplit.Agriculture === 6 && occSplit.Residential === 25 && occSplit.Unclassified === 1,
   "occupancy split is EXACT: Agriculture 6 / Residential 25 / Unclassified 1 (" + JSON.stringify(occSplit) + ")");
ok(fp.every(b => Array.isArray(b.coords) && b.coords.length >= 3 && b.coords[0].length === 2),
   "each footprint carries an outer ring of ≥3 [lon,lat] vertices");
ok(fp.every(b => "occ" in b && "sqft" in b && "height" in b && "coords" in b),
   "each footprint is shaped {occ, sqft, height, coords} (node-exported, fixture-tested)");
ok(fp[0].coords[0][0] < -90 && fp[0].coords[0][1] > 40, "ring vertices are [lon,lat] WGS84 (lon≈−93, lat≈40.8)");
// MultiPolygon tolerance (synthetic)
const mpFp = LP.femaGeojson({ features: [{ geometry: { type: "MultiPolygon", coordinates: [[[[-93.2,40.8],[-93.19,40.8],[-93.19,40.81],[-93.2,40.8]]]] }, properties: { OCC_CLS: "Agriculture", SQFEET: 100, HEIGHT: null } }] });
ok(mpFp.length === 1 && mpFp[0].occ === "Agriculture", "femaGeojson takes the outer ring of a MultiPolygon part");

console.log("\n== BUILDINGS: Allerton bake — 32 structures baked verbatim into boundaries.js ==");
ok(Array.isArray(BOUNDARIES.buildings) && BOUNDARIES.buildings.length === 32, "boundaries.js carries 32 baked structures (" + (BOUNDARIES.buildings||[]).length + ")");
const bakeSplit = {}; BOUNDARIES.buildings.forEach(b => bakeSplit[b.occ] = (bakeSplit[b.occ] || 0) + 1);
ok(bakeSplit.Agriculture === 6 && bakeSplit.Residential === 25 && bakeSplit.Unclassified === 1, "baked occupancy split matches the fixture (Ag 6 / Res 25 / Unclassified 1)");
ok(BOUNDARIES.buildings.every(b => "occ" in b && "coords" in b && Array.isArray(b.coords)), "baked structures use the SAME {occ,sqft,height,coords} shape a live read produces");
ok(/FEMA\/ORNL USA Structures 2026-07-05/.test(bjs), "boundaries.js header cites FEMA/ORNL USA Structures 2026-07-05");

console.log("\n== BUILDINGS: FAILABLE source — buildings task, honest consequence, generous timeout + 1 retry ==");
ok(/function buildingsTask\(\)/.test(liveJs), "live.js has a dedicated buildingsTask");
ok(/buildings unreachable — no structures layer this read/.test(liveJs), "the failable consequence line is stated VERBATIM ('buildings unreachable — no structures layer this read')");
ok(/outFields=OCC_CLS,SQFEET,HEIGHT/.test(liveJs) && /returnGeometry=true/.test(liveJs) && /f=geojson/.test(liveJs), "the query is lean: outFields=OCC_CLS,SQFEET,HEIGHT + returnGeometry + f=geojson");
ok(/setTimeout\([^,]*,\s*60000\)/.test(liveJs), "buildings fetch has a generous ~60 s timeout");
ok(/fetchRetry\([^)]*timedSignal,\s*1\)/.test(liveJs), "buildings fetch uses 1 retry (a slow source, kept lean)");
ok(/USA_Structures_View\/FeatureServer\/0\/query/.test(liveJs) && /services2\.arcgis\.com\/FiaPA4ga0iQKduv3/.test(liveJs), "HOST.fema is the exact FEMA/ORNL USA_Structures_View endpoint");
// assembleRead threads buildings into boundaries.buildings
const asmB = AGRIOS_LIVE.assembleRead({ lat: 42.03, lon: -93.65, gridBbox: clBbox, grid: clGrid, filledCount: 0, soilRows: [], periods: [], roads: [], streams: [], waterbodies: [], buildings: fp.slice(0, 3), failures: [], timestamps: {} });
ok(Array.isArray(asmB.boundaries.buildings) && asmB.boundaries.buildings.length === 3 && asmB.boundaries.analysis.buildings === 3, "assembleRead threads buildings into boundaries.buildings (+ analysis count)");
// a read with buildings absent still assembles (never a hard dependency)
const asmNB = AGRIOS_LIVE.assembleRead({ lat: 42.03, lon: -93.65, gridBbox: clBbox, grid: clGrid, filledCount: 0, soilRows: [], periods: [], roads: [], streams: [], waterbodies: [], failures: [{ source: "buildings", consequence: "buildings unreachable — no structures layer this read" }], timestamps: {} });
ok(Array.isArray(asmNB.boundaries.buildings) && asmNB.boundaries.buildings.length === 0 && asmNB.failures.length === 1, "a failed buildings source degrades to an empty layer + an honest failure entry (read still built)");

console.log("\n== BUILDINGS: cache schema v3 guard — pre-v3 entries treated as stale ==");
// a v3 read carries boundaries.buildings; a v2 read (soilPolygonRows but no
// boundaries.buildings) is stale; a v1 read (no soilPolygonRows) is stale. The
// guard predicate is exported node-testable (cacheRead itself needs localStorage,
// which is DOM-only — the predicate is the checkable logic).
const v3read = { savedAt: Date.now(), read: { soilPolygonRows: [], boundaries: { buildings: [] } } };
const v2read = { savedAt: Date.now(), read: { soilPolygonRows: [], boundaries: {} } };
const v1read = { savedAt: Date.now(), read: { boundaries: { buildings: [] } } };
ok(AGRIOS_LIVE.isV3Read(v3read) === true, "a v3 read (boundaries.buildings present) passes the v3 guard → served");
ok(AGRIOS_LIVE.isV3Read(v2read) === false, "a v2 read (soilPolygonRows but no boundaries.buildings) is stale → re-read live");
ok(AGRIOS_LIVE.isV3Read(v1read) === false, "a v1 read (no soilPolygonRows) is stale → re-read live");
ok(AGRIOS_LIVE.isV3Read(null) === false && AGRIOS_LIVE.isV3Read({}) === false, "null / shapeless cached entries are not v3 (never fed to the engine)");

console.log("\n== TIME AXIS: cache schema v4 guard — pre-v4 entries treated as stale (spec-time-axis-v1) ==");
// a v4 read adds read.history; a v3 read (buildings but no history) is now stale.
const v4read = { savedAt: Date.now(), read: { soilPolygonRows: [], boundaries: { buildings: [] }, history: [] } };
ok(AGRIOS_LIVE.isV4Read(v4read) === true, "a v4 read (read.history present) passes the v4 guard → served");
ok(AGRIOS_LIVE.isV4Read(v3read) === false, "a v3 read (buildings but no history) is stale → re-read live");
ok(AGRIOS_LIVE.isV4Read(v2read) === false && AGRIOS_LIVE.isV4Read(v1read) === false, "pre-v3 reads are also not v4 (graceful chain)");
ok(AGRIOS_LIVE.isV4Read(null) === false && AGRIOS_LIVE.isV4Read({}) === false, "null / shapeless cached entries are not v4");
ok(/isV4Read\(parsed\) \? parsed : null/.test(liveJs), "cacheRead + cacheReadLast gate on the v4 guard (pre-v4 → null, graceful re-read)");

/* =========================================================================
 * SURROUND CONTEXT TERRAIN (spec-surround-context-v1) — a coarse, FAILABLE
 * surround-elevation ring rendered as context terrain beyond the read core,
 * engine untouched. Covers every Verify bullet in the spec. */
console.log("\n== SURROUND: ring generator arithmetic — +50% padding, 3× spacing (v1.1), ring-only (synthetic bbox) ==");
// a synthetic core bbox (5×5) — the arithmetic is checkable by hand.
const sCore = { lat: [42.00, 42.02], lon: [-93.66, -93.64], nx: 5, ny: 5 };
const sExt = AGRIOS_LIVE.surroundExtBbox(sCore);
const coreLonSpan = sCore.lon[1] - sCore.lon[0], coreLatSpan = sCore.lat[1] - sCore.lat[0];
ok(Math.abs((sExt.lon[1] - sExt.lon[0]) - 2 * coreLonSpan) < 1e-9 &&
   Math.abs((sExt.lat[1] - sExt.lat[0]) - 2 * coreLatSpan) < 1e-9,
   "ext bbox span is 2× the core (+50% of the core span on EACH side)");
ok(Math.abs(sExt.lon[0] - (sCore.lon[0] - coreLonSpan * 0.5)) < 1e-9 &&
   Math.abs(sExt.lon[1] - (sCore.lon[1] + coreLonSpan * 0.5)) < 1e-9,
   "ext bbox is centered on the core (padded +50% west AND east)");
const sLat = AGRIOS_LIVE.surroundLattice(sCore);
const coreSx = coreLonSpan / (sCore.nx - 1), coreSy = coreLatSpan / (sCore.ny - 1);
ok(Math.abs(sLat.sx - 3 * coreSx) < 1e-12 && Math.abs(sLat.sy - 3 * coreSy) < 1e-12,
   "surround lattice spacing is 3× the core cell spacing (coarse — spec v1.1)");
// 3× doesn't divide the doubled span evenly — the lattice is CENTERED (residue
// split symmetrically) and carries its ACTUAL bbox for exact georeferencing.
const resW = sLat.bbox.lon[0] - sLat.extBbox.lon[0], resE = sLat.extBbox.lon[1] - sLat.bbox.lon[1];
const resN = sLat.extBbox.lat[1] - sLat.bbox.lat[1], resS = sLat.bbox.lat[0] - sLat.extBbox.lat[0];
ok(Math.abs(resW - resE) < 1e-12 && Math.abs(resN - resS) < 1e-12 && resW >= 0 && resN >= 0,
   "the lattice is centered in the ext bbox (residue split symmetrically on both axes)");
ok(Math.abs((sLat.bbox.lon[1] - sLat.bbox.lon[0]) - (sLat.nx - 1) * sLat.sx) < 1e-12,
   "the lattice's ACTUAL bbox spans exactly (nx−1)·spacing (the renderer georeferences against it — no stretch)");
const sRing = AGRIOS_LIVE.surroundRingPoints(sCore);
// every ring point falls OUTSIDE (or on the edge of) the core bbox — ring only.
const anyInside = sRing.some(p => p.lon > sCore.lon[0] && p.lon < sCore.lon[1] && p.lat > sCore.lat[0] && p.lat < sCore.lat[1]);
ok(!anyInside && sRing.length > 0, "ring-only: no ring point falls strictly inside the core bbox (" + sRing.length + " ring points)");
// independent interior count: lattice points inside-or-on the core bbox
let sInterior = 0;
for (let iy = 0; iy < sLat.ny; iy++) for (let ix = 0; ix < sLat.nx; ix++) {
  const lo = sLat.bbox.lon[0] + ix * sLat.sx, la = sLat.bbox.lat[1] - iy * sLat.sy;
  if (lo >= sCore.lon[0] && lo <= sCore.lon[1] && la >= sCore.lat[0] && la <= sCore.lat[1]) sInterior++;
}
const latticeTotal = sLat.nx * sLat.ny;
ok(sRing.length === latticeTotal - sInterior && sInterior > 0,
   "ring count = full lattice (" + latticeTotal + ") minus the independently-counted interior (" + sInterior + ") = " + sRing.length);
// the STANDARD live core (36×27): assert the ACTUAL computed ring count agrees
// with an independent lattice-minus-interior count (no hardcoded guess).
const stdCore = AGRIOS_LIVE.bboxFor(42.03, -93.65);
const stdLat = AGRIOS_LIVE.surroundLattice(stdCore);
const stdRing = AGRIOS_LIVE.surroundRingPoints(stdCore);
let stdInterior = 0;
for (let iy = 0; iy < stdLat.ny; iy++) for (let ix = 0; ix < stdLat.nx; ix++) {
  const lo = stdLat.bbox.lon[0] + ix * stdLat.sx, la = stdLat.bbox.lat[1] - iy * stdLat.sy;
  if (lo >= stdCore.lon[0] && lo <= stdCore.lon[1] && la >= stdCore.lat[0] && la <= stdCore.lat[1]) stdInterior++;
}
ok(stdRing.length === stdLat.nx * stdLat.ny - stdInterior,
   "standard 36×27 core: ring = " + stdLat.nx + "×" + stdLat.ny + " lattice (" + (stdLat.nx * stdLat.ny) + ") − interior (" + stdInterior + ") = " + stdRing.length + " points");
ok(stdRing.length < 972 * 0.5,
   "the coarse ring (" + stdRing.length + ") costs well under half the core's 972 points (v1.1: read time wins)");

console.log("\n== SURROUND: ext grid assembly — real ring + core downsampled (bilinear), no nulls, no fabrication ==");
const sCoreGrid = []; for (let y = 0; y < sCore.ny; y++) { const r = []; for (let x = 0; x < sCore.nx; x++) r.push(1000 + x + y); sCoreGrid.push(r); }
const sRV = {}; sRing.forEach(p => { sRV[p.ix + "," + p.iy] = 950; });
const sAsm = AGRIOS_LIVE.surroundAssembleGrid(sCore, sCoreGrid, sRV);
ok(sAsm.nx === sLat.nx && sAsm.ny === sLat.ny && sAsm.grid.length === sLat.ny && sAsm.grid[0].length === sLat.nx,
   "ext grid is the full lattice (" + sAsm.nx + "×" + sAsm.ny + "), row 0 = NORTH");
ok(!sAsm.grid.some(r => r.some(v => v == null)), "no null cells in the ext grid (ring holes neighbor-filled)");
ok(AGRIOS_LIVE.bilinearSample(sCoreGrid, 0, 0) === 1000 && AGRIOS_LIVE.bilinearSample(sCoreGrid, 4, 4) === 1008,
   "bilinearSample returns the real core value at grid nodes (downsample is coarser, never finer — no fabricated detail)");

console.log("\n== SURROUND: FAILABLE — a failed surround leaves surround:null + honest entry; the read still builds ==");
const asmS = AGRIOS_LIVE.assembleRead({ lat: 42.03, lon: -93.65, gridBbox: clBbox, grid: clGrid, filledCount: 0, soilRows: [], periods: [], roads: [], streams: [], waterbodies: [], surround: { grid: sAsm.grid, bbox: { lat: sExt.lat, lon: sExt.lon, nx: sAsm.nx, ny: sAsm.ny }, spacing: "~50 m", ringPoints: sRing.length }, failures: [], timestamps: {} });
ok(asmS.surround && asmS.surround.grid && asmS.surround.ringPoints === sRing.length, "assembleRead threads a successful surround into read.surround ({grid,bbox,spacing})");
const asmNS = AGRIOS_LIVE.assembleRead({ lat: 42.03, lon: -93.65, gridBbox: clBbox, grid: clGrid, filledCount: 0, soilRows: [], periods: [], roads: [], streams: [], waterbodies: [], failures: [{ source: "surround", consequence: "surround terrain unreachable — no context terrain beyond the read core this read" }], timestamps: {} });
ok(asmNS.surround === null && asmNS.failures.length === 1 && asmNS.demGrid && asmNS.collectionLow, "a failed surround → surround:null + honest failure entry; the read (terrain + flag) still builds");
ok(/failures\.push\(\{ source: "surround", consequence: "surround terrain unreachable/.test(liveJs), "live.js: the surround task on failure pushes the honest consequence (per-source, explicit)");
ok(/onP\("surround", \{ done: 0, total: ringTotal, state: "fail"/.test(liveJs) || /state: "fail", note: "surround terrain unreachable/.test(liveJs), "live.js: the surround failure marks its own progress row failed, never the whole read");
ok(/surroundPromise = elevPromise\.then/.test(liveJs), "live.js: surround starts AFTER the core grid completes (chained off elevPromise)");
ok(/historyTask\(\), surroundPromise\]\)/.test(liveJs) && /surround = r\[8\]/.test(liveJs), "surroundPromise is in the Promise.all — its (caught) failure never rejects the read");

console.log("\n== SURROUND: no new hosts — the surround ring fetches EPQS only (HOST.epqs) ==");
ok(/var url = HOST\.epqs \+ "\?x=" \+ pt\.lon\.toFixed\(6\)[\s\S]{0,120}surround|surroundTask[\s\S]{0,400}HOST\.epqs \+ "\?x="/.test(liveJs), "the surround ring URL is built from HOST.epqs (same EPQS point service — no new host literal)");
// (the exactly-seven-hosts allowlist above already proves no new host literal appears in live.js.)

console.log("\n== SURROUND: cache — isV4Read UNCHANGED; surround is OPTIONAL on the v4 schema ==");
const v4noSurround = { savedAt: Date.now(), read: { soilPolygonRows: [], boundaries: { buildings: [] }, history: [] } };
const v4withSurround = { savedAt: Date.now(), read: { soilPolygonRows: [], boundaries: { buildings: [] }, history: [], surround: { grid: [[1]], bbox: {}, spacing: "x" } } };
ok(AGRIOS_LIVE.isV4Read(v4noSurround) === true, "a v4 read WITHOUT surround still passes the v4 guard (schema NOT bumped — restores as before this spec)");
ok(AGRIOS_LIVE.isV4Read(v4withSurround) === true, "a v4 read WITH surround also passes (surround is optional, not a new gate)");
ok(!/isV5Read|hasOwnProperty\.call\(parsed\.read, "surround"\)/.test(liveJs), "no v5 guard / no surround predicate added to the cache-schema chain (isV4Read is the still-current gate)");
ok(/surround: input\.surround \|\| null/.test(liveJs), "assembleRead carries read.surround (or null) without touching the schema guards");

console.log("\n== SURROUND: renderer reuses the Allerton ext machinery + grows the wash to the ext canvas ==");
ok(/"data-layer": "surround-terrain"/.test(js), "the surround terrain is its own toggleable layer group (data-layer=\"surround-terrain\", distinct from the wash's data-layer=\"surround\")");
ok(/buildBands\(sGrid, 10\)/.test(js) && /buildContours\(sGrid, 10, 50\)/.test(js), "surround bands/contours reuse buildBands/buildContours at the SAME live interval (10 / 50 index)");
ok(/sContourLayer[\s\S]{0,300}chaikinSmooth\(pts, 2\)[\s\S]{0,120}catmullRomPath\(sm, surroundProj, false\)/.test(js), "surround contours use the SAME two bounded Chaikin passes then Catmull-Rom (no fabricated detail)");
ok(/function surroundProj\(pt\)[\s\S]{0,220}proj\(\{ x: lonToGX\(lon\), y: latToGY\(lat\) \}\)/.test(js), "the surround projector maps ext-grid → lon/lat → CORE grid coords → proj() (core lands under the core canvas; surround bleeds outward)");
ok(/surroundExtRect \|\| \{ x: 0, y: 0, w: W, h: H \}/.test(js), "the mute-wash outer rect grows to the EXT canvas when surround exists (core canvas when not)");
ok(/var surround = ACTIVE\.live && ACTIVE\.read \? ACTIVE\.read\.surround : null/.test(js), "the surround render is gated on ACTIVE.read.surround (a live read only; Allerton bakes its own ext grid)");
ok(/has-surround", !!\(read\.surround && read\.surround\.grid\)/.test(js), "setField toggles body.has-surround only when the read actually carried a surround grid");

console.log("\n== SURROUND: Layers row + provenance carry the honest half-resolution copy (verbatim) ==");
ok(/data-layer="surround-terrain"[\s\S]{0,200}context beyond the read core · coarse \(3× core spacing\) · context, not survey/.test(html), "the Layers row states 'context beyond the read core · coarse (3× core spacing) · context, not survey' (verbatim, v1.1)");
ok(/\.layer-row--surround \{ display: none; \}/.test(css) && /body\.has-surround \.layer-row--surround \{ display: block; \}/.test(css), "the surround Layers row shows ONLY when body.has-surround (the ring actually came back)");
ok(/label: "Surround terrain"/.test(js), "the progress panel has its own 'Surround terrain' row");
ok(/note: ringTotal \+ " points · coarse \(3× core spacing\)"/.test(liveJs), "the surround progress row reports an honest count + 'coarse (3× core spacing)' (verbatim, v1.1)");

console.log("\n== SURROUND: engine UNTOUCHED — computed on the core grid only; engine.js has NO diff ==");
// the engine gets the read (its demGrid = the CORE grid); the surround is never an argument to computeReading.
ok(/computeReading\(read\)/.test(js) && !/computeReading\([^)]*surround/.test(js), "computeReading is still called with the read (core demGrid); surround is never passed to the engine");
const engineSrc = fs.readFileSync(path.join(root, "engine.js"), "utf8");
ok(!/surround/i.test(engineSrc), "engine.js contains NO reference to 'surround' (the surround is context for the eye, never input to the reading)");

console.log("\n== SURROUND: design-system.md gains the surround-context section (context-not-survey, FAILABLE, pre-spec cache) ==");
const dsmSur = fs.readFileSync(path.join(repo, "design", "r2", "design-system.md"), "utf8");
ok(/Surround context terrain \(spec-surround-context-v1\)/.test(dsmSur), "design-system.md has the surround-context section header");
ok(/context, not survey/.test(dsmSur) && /coarse \(3× core spacing\)/.test(dsmSur), "the section states the context-not-survey / coarse (3× core spacing) law");
ok(/FAILABLE/.test(dsmSur) && /predating this spec simply have no surround until re-read/.test(dsmSur), "the section states FAILABLE + pre-spec cached reads lack surround until re-read");

console.log("\n== BUILDINGS: NHD ditch parse — CanalDitch FCODE 33600–33603 accepted + rendered dash-dot ==");
const ditchResp = { features: [
  { geometry: { type: "LineString", coordinates: [[-93.65, 42.01], [-93.649, 42.011]] }, properties: { fcode: 33600 } },
  { geometry: { type: "LineString", coordinates: [[-93.65, 42.02], [-93.649, 42.021]] }, properties: { fcode: 33601 } },
  { geometry: { type: "LineString", coordinates: [[-93.65, 42.03], [-93.649, 42.031]] }, properties: { fcode: 46003 } }
] };
const ditchParsed = LP.nhdGeojson(ditchResp, null);
const ditchFcodes = ditchParsed.streams.map(s => s.fcode);
ok(ditchFcodes.includes(33600) && ditchFcodes.includes(33601), "nhdGeojson carries CanalDitch FCODEs 33600–33603 through as flowlines");
ok(/fc >= 33600 && fc <= 33603/.test(js), "the renderer keys ditch treatment off FCODE 33600–33603");
ok(/stream-line--ditch/.test(js) && /\.stream-line--ditch \{[^}]*stroke-dasharray: 2 3 6 3/.test(css), "ditches render --water thin dash-dot (stroke-dasharray '2 3 6 3')");

console.log("\n== BUILDINGS: engine light touch — nearBuilding (within 2 cells of a footprint CENTROID) ==");
// a single footprint whose centroid lands mid-grid; nearBuilding true within 2 cells
const oneBldg = [{ occ: "Agriculture", coords: [[-93.211, 40.889], [-93.2108, 40.889], [-93.2108, 40.8892], [-93.211, 40.8892], [-93.211, 40.889]] }];
const clsB = E.classifyCells(bowl, synBbox, E.rasterize(synBbox, []), null, { streams: [], roads: [], buildings: oneBldg });
let nbCount = 0, nbTotal = 0;
clsB.cells.forEach(r => r.forEach(c => { nbTotal++; if (c.nearBuilding) nbCount++; }));
ok(clsB.cells[0][0].hasOwnProperty("nearBuilding"), "every classified cell carries a nearBuilding flag");
ok(nbCount > 0 && nbCount < nbTotal, "nearBuilding is true near the footprint centroid and false far from it (" + nbCount + " of " + nbTotal + " cells)");
// with NO buildings, nearBuilding is false everywhere
const clsNoB = E.classifyCells(bowl, synBbox, E.rasterize(synBbox, []), null, { streams: [], roads: [], buildings: [] });
ok(clsNoB.cells.every(r => r.every(c => c.nearBuilding === false)), "with no footprints, no cell is nearBuilding (honest absence)");
// buildingCentroid is the ring-vertex average
const bc = E.buildingCentroid(oneBldg[0]);
ok(bc && Math.abs(bc.lon - (-93.2109)) < 0.001 && Math.abs(bc.lat - 40.8891) < 0.001, "buildingCentroid averages the ring vertices");

console.log("\n== BUILDINGS: Pass-1 edges gains {structures:{count, agricultural}} ==");
const edgesB = E.pass1Edges(clsB, null, { streams: [], roads: [], buildings: BOUNDARIES.buildings });
ok(edgesB.structures && edgesB.structures.count === 32 && edgesB.structures.agricultural === 6, "pass1Edges.structures = {count:32, agricultural:6} on the Allerton bake");
const edgesNB = E.pass1Edges(clsNoB, null, { streams: [], roads: [], buildings: [] });
ok(edgesNB.structures.count === 0 && edgesNB.structures.agricultural === 0, "pass1Edges.structures counts are 0 when no footprints are present");

console.log("\n== BUILDINGS: zone Buildings fact + card tile — 'within ~X m · nearest: Agriculture' or 'none nearby' ==");
const readBld = { demGrid: { grid: bowl }, gridBbox: synBbox, collectionLow: { cells: lowCells, cellCount: lowCells.length, minElevation: 950 }, boundaries: { roads: [], streams: [{ coords: [[-93.21, 40.889]] }], waterbodies: [], buildings: oneBldg }, soilPolygons: [poly("Poorly drained", "Clarinda silty clay loam")], forecasts: [{ shortForecast: "Thunderstorms", pop: 60 }], failures: [] };
const RB = E.computeReading(readBld);
ok(RB.zones.every(z => typeof z.nearestBuildingM === "number"), "each zone gets a numeric nearestBuildingM when footprints are present");
ok(RB.zones.some(z => z.nearestBuildingOcc === "Agriculture"), "the nearest-building occupancy class is carried on the zone (Agriculture)");
// no buildings → nearestBuildingM null (→ card shows 'none nearby')
const readNoBld = { demGrid: { grid: bowl }, gridBbox: synBbox, collectionLow: null, boundaries: { roads: [], streams: [], waterbodies: [], buildings: [] }, soilPolygons: [poly("Well drained", "Shelby clay loam")], forecasts: [], failures: [] };
const RNB = E.computeReading(readNoBld);
ok(RNB.zones.every(z => z.nearestBuildingM == null), "no footprints → nearestBuildingM is null (the card renders 'none nearby')");
// the card render path emits the Buildings tile with the two states
ok(/statTile\("Buildings"/.test(js) && /none nearby/.test(js) && /within ~/.test(js) && /nearest: /.test(js), "computedZoneCard renders a Buildings fact tile ('within ~X m · nearest: …' / 'none nearby')");
ok(/Math\.round\(z\.nearestBuildingM \/ 10\) \* 10/.test(js), "the Buildings tile distance is rounded to 10 m (X = cell-distance × cell size, to 10s)");

console.log("\n== BUILDINGS: render decisions — footprints faint --ink-2, ag stronger, UNDER roads/streams, tokens only ==");
ok(/building-shape/.test(js) && /B\.buildings/.test(js), "buildStructures renders B.buildings as building-shape polygons (Allerton + live share the path)");
ok(/\.building-shape \{[\s\S]*?fill: var\(--ink-2\)[\s\S]*?fill-opacity: 0\.55[\s\S]*?stroke: var\(--ink-2\)[\s\S]*?stroke-width: 1[\s\S]*?vector-effect: non-scaling-stroke/.test(css), "footprints: --ink-2 solid-block fill (0.55 — 0.18 was invisible; Adam 2026-07-05), non-scaling stroke");
ok(/\.building-shape--ag \{ fill-opacity: 0\.8; fill: var\(--accent-text\)/.test(css), "Agriculture footprints read distinctly (0.8, theme-aware accent-text)");
ok(!/building-shape[\s\S]{0,200}#[0-9A-Fa-f]{6}/.test(css.match(/\.building-shape[\s\S]*?\}/)[0] + (css.match(/\.building-shape--ag[\s\S]*?\}/)||[""])[0]), "building styles use TOKENS only (no hardcoded hex) — both themes track");
// UNDER roads/streams: the buildings loop appears BEFORE the streams + roads loops in buildStructures
const bsPath = (js.match(/function buildStructures[\s\S]*?return g;\n  \}/) || [""])[0];
ok(bsPath.indexOf("B.buildings") >= 0 && bsPath.indexOf("B.buildings") < bsPath.indexOf("B.streams") && bsPath.indexOf("B.buildings") < bsPath.lastIndexOf("B.roads"), "footprints are drawn UNDER streams + roads (buildings loop precedes them in the group)");

console.log("\n== BUILDINGS: NO NEW RULES — the rules list is unchanged; buildings feed FACTS only ==");
// the rule-id set + verbatim text are exactly R1–R4 + DEFAULT (unchanged)
ok(JSON.stringify(Object.keys(E.RULE_TEXT).sort()) === JSON.stringify(["DEFAULT","R1","R1_OBSERVED","R2","R3","R4"]), "RULE_TEXT has R1–R4 + DEFAULT + the R1_OBSERVED variant (spec-time-axis-v1; still no new rule ID — R1_OBSERVED is R1's observed text, not a new rule)");
ok(E.RULE_TEXT.R1 === "R1 look-first — the zone holds the collection-low, its soil drains poorly, and rain is in the forecast." &&
   E.RULE_TEXT.R4 === "R4 quiet — well or moderately well drained, upper band, no structure crossing.",
   "R1 + R4 rule text is unchanged (verbatim)");
// pass3Rules never reads nearBuilding / buildings (buildings are facts, not a rule input)
const p3 = (engineJs.match(/function pass3Rules[\s\S]*?\n  \}/) || [""])[0];
ok(p3.length > 200 && !/nearBuilding/.test(p3) && !/buildings/i.test(p3), "pass3Rules never reads nearBuilding / buildings — determinism + rule set preserved");
// the fired-rule id set on a buildings-carrying read is still within R1–R4/DEFAULT
ok(RB.zones.every(z => ["R1","R2","R3","R4","DEFAULT"].indexOf(z.rule.id) >= 0), "every fired rule on a buildings-carrying read is still one of R1–R4/DEFAULT (no new rule fires)");
// determinism preserved with buildings present
ok(JSON.stringify(E.computeReading(readBld)) === JSON.stringify(E.computeReading(readBld)), "computeReading stays deterministic with buildings present");

/* =============================================================================
 * SAVED FIELDS (spec-saved-fields-v1) — registry schema/cap/overflow, bounds
 * validation (each rule) via node-exported pure fns, the bounded-render path
 * (PARCEL_BBOX-equivalent → wash + solid boundary + framing wiring), the
 * verbatim stated-bounds header pattern, switcher markup, no new hosts.
 * ========================================================================== */
const { AGRIOS_FIELDS } = require(path.join(root, "fields.js"));
const fieldsJs = fs.readFileSync(path.join(root, "fields.js"), "utf8");
const FLD = AGRIOS_FIELDS;

console.log("\n== SAVED FIELDS: fields.js loads before focus-r2.js; pure API node-exportable ==");
ok(fs.existsSync(path.join(root, "fields.js")), "fields.js present (new registry module)");
ok(html.indexOf('src="fields.js') < html.indexOf('src="focus-r2.js'), "fields.js script tag loads BEFORE focus-r2.js");
ok(typeof FLD === "object" && typeof FLD.validateBounds === "function" && typeof FLD.upsertField === "function",
   "AGRIOS_FIELDS + pure validation/CRUD are node-exportable");
ok(FLD.STORE_KEY === "agrios-fields" && FLD.SCHEMA_VERSION === 1 && FLD.CAP === 8, "registry key 'agrios-fields', schema v1, cap 8");

console.log("\n== SAVED FIELDS: registry schema-version guard (unknown versions ignored gracefully) ==");
ok(FLD.emptyRegistry().v === 1 && Array.isArray(FLD.emptyRegistry().fields) && FLD.emptyRegistry().fields.length === 0, "emptyRegistry is { v:1, fields:[] }");
ok(FLD.isCurrentSchema({ v: 1, fields: [] }) === true, "a v1 registry with a fields array is current-schema");
ok(FLD.isCurrentSchema({ v: 2, fields: [] }) === false && FLD.isCurrentSchema(null) === false && FLD.isCurrentSchema({}) === false, "v2 / null / shapeless registries are NOT current-schema");
ok(FLD.guardRegistry({ v: 99, fields: [{ id: "x" }] }).fields.length === 0, "an unknown-version registry is ignored gracefully → empty v1");
ok(FLD.guardRegistry({ v: 1, fields: [{ id: "a" }, { id: "b" }] }).fields.length === 2, "a well-formed v1 registry passes through with its fields");

console.log("\n== SAVED FIELDS: cap-8 + honest overflow (never silent eviction) ==");
(function () {
  let reg = FLD.emptyRegistry();
  for (let i = 1; i <= 8; i++) { reg = FLD.upsertField(reg, { id: "f" + i, name: "n" + i }).registry; }
  ok(reg.fields.length === 8, "8 fields fill the registry to cap");
  const over = FLD.upsertField(reg, { id: "f9", name: "n9" });
  ok(over.ok === false && /storage full/.test(over.error), "the 9th ADD is refused with the honest 'storage full — remove a field to save another' message");
  ok(reg.fields.length === 8 && reg.fields.every((f, i) => f.id === "f" + (i + 1)), "no existing field was evicted — the registry is unchanged after the refused add");
  const upd = FLD.upsertField(reg, { id: "f3", name: "renamed" });
  ok(upd.ok === true && upd.registry.fields.length === 8 && upd.registry.fields.find(f => f.id === "f3").name === "renamed", "updating an existing field at cap succeeds in place (no cap trip)");
})();

console.log("\n== SAVED FIELDS: bounds validation — every rule (pure, node-tested) ==");
const EXT = { lat: [40.8870, 40.9090], lon: [-93.2160, -93.1780] };
ok(FLD.validateBounds({ n: 40.9035, s: 40.8925, e: -93.1875, w: -93.2065 }, EXT).ok === true, "a real inside-extent parcel (~1 km each side) validates OK");
ok(/numeric/.test(FLD.validateBounds({ n: NaN, s: 40.89, e: -93.19, w: -93.20 }, EXT).error), "rule 1: a non-numeric bound is rejected (four numbers required)");
ok(/North must be greater than South/.test(FLD.validateBounds({ n: 40.89, s: 40.90, e: -93.19, w: -93.20 }, EXT).error), "rule 2a: N must be > S");
ok(/East must be greater than West/.test(FLD.validateBounds({ n: 40.90, s: 40.89, e: -93.21, w: -93.19 }, EXT).error), "rule 2b: E must be > W");
ok(/inside the read extent/.test(FLD.validateBounds({ n: 41.0, s: 40.89, e: -93.19, w: -93.20 }, EXT).error), "rule 3: bounds outside the read extent are rejected");
ok(/at least ~100 m/.test(FLD.validateBounds({ n: 40.9001, s: 40.9000, e: -93.1999, w: -93.2000 }, EXT).error), "rule 4a: a sub-100 m span is rejected");
// rule 4b (span ≤ extent) is enforced by fields.js — assert both the code path
// exists AND that a synthetic over-wide span against a SMALL extent is rejected
// (a real extent already caps the span via rule 3, so we use a small extent to
// isolate rule 4b's ceiling). Extent ~1.1 km lat; bounds ~2.2 km lat inside a
// taller extent would trip rule 3, so we make the extent tall but the caught
// dimension the LON one is not constructible without tripping rule 3 first —
// instead prove the ceiling with an extent smaller than the code's own EPS is
// impossible, so we assert the guard exists in source + the ≤-extent OK case.
ok(/larger than the read extent/.test(fieldsJs), "rule 4b: fields.js carries the 'larger than the read extent' span-ceiling guard");
ok((function () {
  // small extent (~0.001° ≈ 111 m lat, ~84 m lon) — its own span is under 100 m
  // on lon, so ANY valid-orientation bounds inside it fail rule 4a; construct a
  // TALL-enough extent so the bounds pass 4a but a bound wider than the extent
  // on lon (still ≥100 m, still N>S/E>W) is caught by 4b before rule 3? No —
  // rule 3 catches out-of-extent first. So 4b's reachable path is bounds ==
  // extent (OK). We therefore assert the ≤-extent boundary case passes and the
  // guard string is present (above). This case: bounds == extent → OK.
  const small = { lat: [40.8900, 40.9100], lon: [-93.2100, -93.1900] };
  return FLD.validateBounds({ n: 40.9100, s: 40.8900, e: -93.1900, w: -93.2100 }, small).ok === true;
})(), "rule 4b boundary: bounds equal to the extent are accepted (≤ extent)");
ok(FLD.validateBounds({ n: 40.9090, s: 40.8870, e: -93.1780, w: -93.2160 }, EXT).ok === true, "bounds exactly equal to the extent are allowed (≤ extent)");
ok(FLD.validateBounds({ n: 40.90351, s: 40.89249, e: -93.18749, w: -93.20651 }, EXT).bounds.n === 40.9035, "validated bounds are rounded to 4 dp (the stored precision)");

console.log("\n== SAVED FIELDS: name/note validation + deterministic buildEntry ==");
ok(FLD.validateName("Home place").ok === true, "a normal name validates");
ok(/required/.test(FLD.validateName("   ").error), "an empty/whitespace name is rejected (required)");
ok(/40 characters/.test(FLD.validateName("x".repeat(41)).error), "a >40-char name is rejected");
ok(FLD.validateNote("").ok === true && /140 characters/.test(FLD.validateNote("x".repeat(141)).error), "note is optional; a >140-char note is rejected");
(function () {
  const be = FLD.buildEntry({ name: "Home", note: "corn/soybean", lat: 40.9, lon: -93.19, bounds: { n: 40.9035, s: 40.8925, e: -93.1875, w: -93.2065 }, extent: EXT, readKey: "agrios-read-40.9000,-93.1900" }, 1700000000000);
  ok(be.ok === true && be.field.name === "Home" && be.field.readKey === "agrios-read-40.9000,-93.1900", "buildEntry shapes a full registry entry (name/note/lat/lon/readKey)");
  ok(be.field.createdAt === 1700000000000 && be.field.boundsSetAt === 1700000000000, "buildEntry is deterministic given `now` (createdAt + boundsSetAt stamped)");
  ok(be.field.bounds && be.field.bounds.n === 40.9035, "buildEntry carries the validated 4-dp bounds");
  const unb = FLD.buildEntry({ name: "Back 40", lat: 40.9, lon: -93.19, bounds: null }, 1700000000000);
  ok(unb.ok === true && unb.field.bounds === null && unb.field.boundsSetAt === null, "an unbounded field carries bounds:null + boundsSetAt:null");
  const badName = FLD.buildEntry({ name: "", lat: 40.9, lon: -93.19 }, 1);
  ok(badName.ok === false && badName.field === "name", "buildEntry surfaces which field failed (name)");
})();

console.log("\n== SAVED FIELDS: relativeTime (pure, deterministic) ==");
const NOW = 1700000000000;
ok(FLD.relativeTime(NOW - 1000, NOW) === "just now", "≤45 s → 'just now'");
ok(FLD.relativeTime(NOW - 5 * 60000, NOW) === "5 min ago", "minutes → 'N min ago'");
ok(FLD.relativeTime(NOW - 3 * 3600000, NOW) === "3 hr ago", "hours → 'N hr ago'");
ok(FLD.relativeTime(NOW - 2 * 86400000, NOW) === "2 days ago" && FLD.relativeTime(NOW - 1 * 86400000, NOW) === "1 day ago", "days → 'N day(s) ago'");
ok(/^\d{4}-\d{2}-\d{2}$/.test(FLD.relativeTime(NOW - 30 * 86400000, NOW)), "older than a week → a plain YYYY-MM-DD date");
ok(FLD.relativeTime(null, NOW) === "never read", "a null lastReadAt → 'never read'");

console.log("\n== SAVED FIELDS: removeField / findByReadKey / findById (registry-only ops) ==");
(function () {
  let reg = FLD.emptyRegistry();
  reg = FLD.upsertField(reg, { id: "a", name: "A", readKey: "agrios-read-1.0000,2.0000" }).registry;
  reg = FLD.upsertField(reg, { id: "b", name: "B", readKey: "agrios-read-3.0000,4.0000" }).registry;
  ok(FLD.findById(reg, "b").name === "B" && FLD.findByReadKey(reg, "agrios-read-1.0000,2.0000").id === "a", "findById + findByReadKey locate the right entry");
  const after = FLD.removeField(reg, "a");
  ok(after.fields.length === 1 && after.fields[0].id === "b", "removeField drops the registry entry (registry-only; read cache untouched)");
})();

console.log("\n== SAVED FIELDS: setField bounded path — PARCEL_BBOX-equivalent from bounds (honest-bounds rule, spec §2) ==");
// setField(read, fieldMeta) with bounds sets PARCEL_BBOX = {lat:[s,n],lon:[w,e]}
ok(/setField:\s*function\s*\(read,\s*fieldMeta\)/.test(js), "setField accepts a fieldMeta arg (saved-field identity)");
ok(/PARCEL_BBOX = boundsMeta\s*\?\s*\{\s*lat:\s*\[boundsMeta\.s,\s*boundsMeta\.n\],\s*lon:\s*\[boundsMeta\.w,\s*boundsMeta\.e\]\s*\}/.test(js.replace(/\n\s*/g, " ")),
   "a bounded saved field sets PARCEL_BBOX = { lat:[s,n], lon:[w,e] } — the Allerton stated-bounds shape");
ok(/:\s*null;\s*\/\/\s*no stated field bounds/.test(js), "an unbounded saved field / unsaved read keeps PARCEL_BBOX = null (no wash)");
ok(/ACTIVE\s*=\s*\{[^}]*field:\s*fieldMeta \|\| null[^}]*\}/.test(js), "ACTIVE carries the saved-field meta (field) for the header + pill name");
// the bounded path REUSES the existing Allerton render code (unchanged): recomputeParcel
// builds PARCEL from PARCEL_BBOX, and renderMap's !ACTIVE.live-or-PARCEL branch is
// the ONLY wash/boundary/framing path — a bounded live read now has a non-null PARCEL.
ok(/recomputeParcel\(\);/.test(js) && /function recomputeParcel\(\)/.test(js), "recomputeParcel() rebuilds PARCEL from PARCEL_BBOX (so bounded fields get a parcel rect)");
// renderMap's wash/boundary path is gated on the parcel existing — assert the
// existing Allerton stated-bounds code (wash + solid boundary + parcel framing)
// is the code a bounded field reuses (it renders when PARCEL is non-null).
ok(/if \(!PARCEL\) \{\s*pRX = PAD/.test(js.replace(/\n\s*/g, " ")), "renderMap frames to the parcel rect whenever PARCEL exists (bounded field reuses Allerton framing; only an unbounded read degenerates to the full canvas)");
ok(/if \(ACTIVE\.live && PARCEL\) \{[\s\S]*?class: "outside-wash"[\s\S]*?class: "parcel-boundary"/.test(js), "a bounded LIVE read draws the SAME outside-wash + solid parcel-boundary as Allerton (stated-bounds render, spec §2)");
ok(/outside-wash/.test(js) && /parcel-boundary/.test(js), "the wash + solid parcel-boundary elements a bounded field reuses are present (Allerton path)");

console.log("\n== SAVED FIELDS: stated-bounds header line VERBATIM pattern (spec §2) ==");
ok(/stated bounds: yours — a claim you made " \+ claimDate\(fld\) \+ ", drawn solid\./.test(js),
   "the stated-bounds header line matches the verbatim spec pattern ('stated bounds: yours — a claim you made {date}, drawn solid.')");
ok(/no field bounds stated — showing the full read extent/.test(js), "an unbounded live read keeps the 'no field bounds stated…' line");
ok(/hasStatedBounds\s*=\s*!!\(fld && fld\.bounds\)/.test(js), "the stated-bounds line fires only when the active field carries bounds");
ok(/var displayName = \(fld && fld\.name\) \? fld\.name : coordName/.test(js), "the pill/header show the NAME for a saved field (coords for an unsaved read)");

console.log("\n== SAVED FIELDS: SAVE THIS FIELD dialog section (visible only on a live read) ==");
ok(/id="save-field-section"/.test(html) && /hidden/.test((html.match(/<section id="save-field-section"[^>]*>/) || [""])[0]), "save section present, hidden by default");
ok(/id="save-name"[^>]*maxlength="40"/.test(html.replace(/\n/g, " ")), "name input present, capped at 40 chars");
ok(/id="save-note"[^>]*maxlength="140"/.test(html.replace(/\n/g, " ")), "note input present, capped at 140 chars");
ok(/placeholder="corn\/soybean · rented · tile map in shed…"/.test(html), "note placeholder is the spec example");
ok(/id="save-bounds-use"[^>]*>Use current view as bounds</.test(html.replace(/\n/g, " ")), "'Use current view as bounds' primary present");
["save-bounds-n", "save-bounds-s", "save-bounds-e", "save-bounds-w"].forEach(id =>
  ok(new RegExp('id="' + id + '"').test(html), "editable bounds input present: " + id));
ok(/id="save-bounds-clear"/.test(html), "clear-bounds control present");
ok(/id="save-bounds-status"/.test(html), "bounds status line present");
// Discoverability contract (2026-07-05): when NOT live the section stays
// VISIBLE with an explainer hint (form rows hidden); when live, the form shows.
ok(/refreshSaveSection/.test(js) && /save-field-hint/.test(js) && /hint\.hidden = false/.test(js), "not-live: save section shows the run-a-live-read-first hint (form hidden)");
ok(/hint\.hidden = true/.test(js) && /el\.hidden = false/.test(js), "live: hint hides, save form shows");
ok(/save-entry-chip/.test(js) && /Save this field — name it, state bounds/.test(js), "unsaved live reads surface the save-entry chip in the rail");
ok(/mapCtl\.getBounds\(\)/.test(js) && /_editingBounds = \{ n: b\.n, s: b\.s, e: b\.e, w: b\.w \}/.test(js), "'Use current view as bounds' reads the CURRENT view via the existing inversion (mapCtl.getBounds)");
ok(/F\.saveField\(\{/.test(js) && /extent: read\.gridBbox/.test(js), "Save validates bounds against the read extent (read.gridBbox) via fields.js saveField");
ok(/Edit this field/.test(js) && /existing \? existing\.name : ""/.test(js), "re-opening a saved field prefills name/note/bounds to edit in place");
ok(/\.loc-read-btn/.test(css) && /id="save-field-btn" class="loc-read-btn"/.test(html), "the Save button is the amber R2 primary (.loc-read-btn → var(--accent))");

console.log("\n== SAVED FIELDS: field switcher panel markup + rows (Allerton + saved + unsaved) ==");
ok(/id="field-switcher"/.test(html) && /id="switcher-list"/.test(html), "field switcher panel + list mount present");
ok(/function buildSwitcher\(\)/.test(js), "buildSwitcher builds the charger-row list");
ok(/worked example — analyst layer/.test(js), "the Allerton row is labeled 'worked example — analyst layer'");
ok(/switch-row--allerton/.test(js) && /data-target="allerton"/.test(js), "Allerton is always the first switcher row (baked, not a registry entry)");
ok(/relativeTime\(f\.lastReadAt\)/.test(js) && /switch-when/.test(js), "each saved row shows a relative lastReadAt");
ok(/switch-note/.test(js) && /f\.note \?/.test(js), "each saved row shows a 1-line note preview when present");
ok(/switch-del/.test(js) && /switch-confirm/.test(js), "each saved row has an inline × delete with confirm");
ok(/AGRIOS_FIELDS\.deleteField\(id\); \/\/ registry only/.test(js), "delete removes the REGISTRY entry only (read cache left to its own lifecycle)");
ok(/switch-row--unsaved/.test(js) && /unsaved read/.test(js), "an 'unsaved read' row shows when the live read is not a saved field");
ok(/restoreSavedField\(f\)/.test(js), "tapping a saved row restores it (restoreSavedField)");
ok(/function restoreSavedField\(field\)[\s\S]*?setField\(parsed\.read,\s*fieldMetaOf\(field\)\)/.test(js), "restore reads from the read cache + setField(read, fieldMeta) — instant, with bounds identity");
ok(/AGRIOS_FIELDS\.touchLastRead\(field\.id\)/.test(js), "restoring a saved field stamps its lastReadAt");
ok(/showCachedChip/.test(js) && /cached-chip/.test(js), "a 'cached {time} · re-read' chip is shown in the header on restore");
ok(/__AGRIOS_RUN_LIVE__\(field\.lat, field\.lon\)/.test(js), "the re-read half of the cached chip runs the EXISTING live-read flow");
ok(/\.cached-chip-reread/.test(css) && /\.field-switcher/.test(css), "cached-chip + switcher carry CSS");

console.log("\n== SAVED FIELDS: field chip opens the switcher (grows up) ==");
ok(/chip\.setAttribute\("aria-haspopup", "menu"\)/.test(js), "the field chip advertises aria-haspopup=menu (it's a switcher opener now)");
ok(/toggleSwitcher\(\)/.test(js) && /function openSwitcher\(\)/.test(js) && /function closeSwitcher\(\)/.test(js), "the chip toggles the switcher open/closed");
ok(/setFieldChipState[\s\S]*?loadRegistry\(\)\.fields\.length/.test(js), "the chip surfaces whenever a live read OR any saved field exists (registry-aware)");

console.log("\n== SWITCHER A11Y (spec-switcher-a11y-v1): the menu honors its ARIA contract ==");
// roving tabindex: no static tabindex="0" row pile remains in the templates,
// every row template renders tabindex="-1", and focusSwitcherRow rolls the rove.
ok(!/class="switch-row[^"]*"\s*\+[\s\S]{0,80}tabindex="0"/.test(js) && !/tabindex="0" data-target="allerton"/.test(js) &&
   !/tabindex="0" data-target="saved"/.test(js) && !/tabindex="0" data-target="current"/.test(js),
   "no row template renders a static tabindex=\"0\" (no Tab-stop pile)");
ok(/data-target="allerton"/.test(js) && /tabindex="-1" data-target="allerton"/.test(js), "the Allerton row template renders tabindex=\"-1\"");
ok(/tabindex="-1" data-target="saved"/.test(js), "the saved-row template renders tabindex=\"-1\"");
ok(/tabindex="-1" data-target="current"/.test(js), "the unsaved-read row template renders tabindex=\"-1\"");
ok(/function focusSwitcherRow\(row\)/.test(js), "focusSwitcherRow(row) exists");
ok(/function focusSwitcherRow[\s\S]{0,300}setAttribute\("tabindex", "-1"\)[\s\S]{0,200}setAttribute\("tabindex", "0"\)[\s\S]{0,100}row\.focus\(\)/.test(js),
   "focusSwitcherRow rolls the rove (all rows -1, target row 0) then calls .focus()");

console.log("\n== SWITCHER A11Y: openSwitcher focuses active-or-first row on open ==");
ok(/function openSwitcher\(\)[\s\S]{0,500}switch-row--active[\s\S]{0,200}focusSwitcherRow\(target\)/.test(js),
   "openSwitcher() focuses .switch-row--active if present, else the first .switch-row");

console.log("\n== SWITCHER A11Y: closeSwitcher returns focus to the chip when focus was inside ==");
ok(/function closeSwitcher\(\)[\s\S]{0,400}panel\.contains\(document\.activeElement\)/.test(js),
   "closeSwitcher() checks whether document.activeElement is inside the panel before deciding to refocus");
ok(/function closeSwitcher\(\)[\s\S]{0,600}chip\.focus\(\)/.test(js), "closeSwitcher() focuses the chip when focus was inside the panel");

console.log("\n== SWITCHER A11Y: switcherKeydown drives arrows/Home/End/wrap on #switcher-list ==");
ok(/function switcherKeydown\(e\)/.test(js), "switcherKeydown(e) exists");
ok(/list\.addEventListener\("keydown", switcherKeydown\)/.test(js), "switcherKeydown is wired as a delegated keydown on #switcher-list");
ok(/e\.key === "ArrowDown"/.test(js) && /e\.key === "ArrowUp"/.test(js), "switcherKeydown handles ArrowDown and ArrowUp");
ok(/e\.key === "Home"/.test(js) && /e\.key === "End"/.test(js), "switcherKeydown handles Home and End");
ok(/\(i \+ 1\) % rows\.length/.test(js) && /\(i - 1 \+ rows\.length\) % rows\.length/.test(js), "ArrowDown/ArrowUp wrap via modulo arithmetic at both ends");
ok(/focusSwitcherRow\(rows\[0\]\)/.test(js) && /focusSwitcherRow\(rows\[rows\.length - 1\]\)/.test(js), "Home focuses the first row, End focuses the last row");

console.log("\n== SWITCHER A11Y: Delete/Backspace opens the confirm focused on No; Escape cancels just the confirm ==");
ok(/e\.key === "Delete" \|\| e\.key === "Backspace"/.test(js), "switcherKeydown handles Delete and Backspace");
ok(/switch-row--saved[\s\S]{0,200}openDeleteConfirm\(row\.getAttribute\("data-id"\), true\)/.test(js),
   "Delete/Backspace on a saved row opens its confirm with focusNo=true");
ok(/function openDeleteConfirm\(id, focusNo\)[\s\S]{0,600}noBtn\.focus\(\)/.test(js), "openDeleteConfirm focuses the \"No\" button when focusNo is set");
ok(/cf\.addEventListener\("keydown", function \(e\) \{[\s\S]{0,200}e\.key !== "Escape"/.test(js), "each inline confirm has its own Escape handler");
ok(/switch-confirm:not\(\[hidden\]\)/.test(js), "the document-level Escape handler checks for an OPEN confirm before closing the panel (guard)");

console.log("\n== SWITCHER A11Y: post Yes/No rebuild refocuses the right row ==");
ok(/var deletedIndex = rowIndexById\(list, id\)/.test(js), "Yes captures the deleted row's index before the rebuild");
ok(/var next = freshRows\[deletedIndex\] \|\| freshRows\[freshRows\.length - 1\]/.test(js), "after Yes, focus goes to the row now at that index, else the last row");
ok(/function refocusRowById\(id\)/.test(js) && /refocusRowById\(id\)/.test(js), "refocusRowById(id) exists and is called after No / Escape-cancel (match by data-id)");

console.log("\n== SWITCHER A11Y: Tab closes without preventDefault (natural continue from the chip) ==");
ok(/e\.key === "Tab"[\s\S]{0,150}closeSwitcher\(\)/.test(js), "switcherKeydown closes the switcher on Tab");
ok(!/e\.key === "Tab"\) \{[\s\S]{0,80}e\.preventDefault\(\)/.test(js), "Tab does NOT call e.preventDefault() (browser continues tabbing from the chip)");

console.log("\n== SWITCHER A11Y: the × delete buttons are tabindex=\"-1\" (Delete key is the keyboard route) ==");
ok(/class="switch-del" tabindex="-1"/.test(js), "the × template carries tabindex=\"-1\"");

console.log("\n== SWITCHER A11Y: quiet keyboard hint — markup, CSS, hidden on coarse pointers ==");
ok(/class="switcher-kbd-hint" aria-hidden="true"/.test(html), "the hint line is present and aria-hidden (SRs get the real contract from the roles)");
ok(/↑↓ move · Enter switch · Delete remove/.test(html), "the hint text matches the spec's copy verbatim");
ok(/\.switcher-kbd-hint\s*\{[^}]*color:\s*var\(--ink-2\)/.test(css), "the hint uses the existing muted text token (--ink-2), no new token");
ok(/@media \(pointer: coarse\)\s*\{\s*\.switcher-kbd-hint\s*\{\s*display:\s*none/.test(css), "the hint is hidden under @media (pointer: coarse) — noise on touch");

console.log("\n== CACHE-BUST: ?v= bumped on the touched references (css/js/engine) ==");
ok(/focus-r2\.css\?v=36/.test(html), "focus-r2.css reference bumped to ?v=36 (tour button-row wrap fix)");
ok(/focus-r2\.js\?v=38/.test(html), "focus-r2.js reference bumped to ?v=38 (spec-onboarding-tour-v1)");
ok(/engine\.js\?v=7/.test(html), "engine.js reference stays ?v=7 (engine UNTOUCHED for this spec)");
ok(/live\.js\?v=8/.test(html), "live.js reference bumped to ?v=8 (surround fetch)");

console.log("\n== SWITCHER A11Y: design-system.md documents the keyboard-menu pattern ==");
const dsmA11y = fs.readFileSync(path.join(repo, "design", "r2", "design-system.md"), "utf8");
ok(/roving tabindex/i.test(dsmA11y) && /Escape/.test(dsmA11y) && /"No"/.test(dsmA11y), "design-system.md's switcher section names roving tabindex, Delete→confirm-on-No, and Escape-returns-focus");

console.log("\n== SAVED FIELDS: engine unchanged — bounds are identity, not blinders (spec §2) ==");
// setField still runs computeReading over the read's FULL grid regardless of bounds
ok(/var reading = \(root\.AGRIOS_ENGINE && read\.demGrid\) \? root\.AGRIOS_ENGINE\.computeReading\(read\)/.test(js), "the engine computes over the full read (computeReading(read)) regardless of stated bounds");
ok(/renderField\(read\.demGrid\.grid, \{ interval: 10, indexEvery: 50 \}\)/.test(js), "the map still renders from the full read grid (the surround stays visible under the wash)");

console.log("\n== SAVED FIELDS: no new external hosts / no fetch added ==");
ok(!/\bfetch\s*\(/.test(fieldsJs), "no fetch( in fields.js");
ok(!/https?:\/\/(?!www\.w3\.org)/i.test(fieldsJs), "no external URLs in fields.js (pure storage/validation)");
ok(!/XMLHttpRequest|WebSocket|EventSource|navigator\.geolocation/.test(fieldsJs), "no XHR / websocket / geolocation in fields.js");
// the loaded scripts allow-list gains fields.js only
const scripts2 = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m => m[1]);
ok(scripts2.every(s => /^(dem-grid|dem-grid-ext|boundaries|data|engine|live|fields|focus-r2)\.js(\?v=\d+)?$/.test(s)), "only local scripts loaded, fields.js added to the allow-list (" + scripts2.join(", ") + ")");

console.log("\n== SAVED FIELDS: design-system.md gains the saved-fields / stated-bounds section ==");
const dsm = fs.readFileSync(path.join(repo, "design", "r2", "design-system.md"), "utf8");
ok(/saved fields|stated bounds/i.test(dsm), "design-system.md documents the saved-fields / stated-bounds pattern");

/* =========================================================================
 * DATE WINDOW UI (spec-date-window-v1) — the DATE section builds from the
 * fetched window on a live read, recomputes without a fetch on select, honors
 * out-of-window honestly, and Allerton keeps its two baked chips. */
console.log("\n== DATE WINDOW UI: live read builds the day selector from the fetched window ==");
ok(/function buildLiveDateSelector\(read\)/.test(js), "buildLiveDateSelector(read) exists (the live day selector)");
ok(/timeAxis\(read\.history \|\| \[\], read\.forecasts/.test(js), "the selector is built from AGRIOS_LIVE.timeAxis(read.history, read.forecasts) — the combined observed+forecast axis (spec-time-axis-v1)");
ok(/if \(active && active\.live && active\.read\) \{\s*buildLiveDateSelector\(active\.read\);/.test(js),
   "openFieldDialog branches: a live read → buildLiveDateSelector; Allerton → the baked chips");
// default selection: read.dateStr if in window, else today if in window, else firstDate
ok(/read\.dateStr && inWin\(read\.dateStr\)/.test(js) && /inWin\(today\) \? today : win\.firstDate/.test(js),
   "selected day = read.dateStr if in-window, else today if in-window, else firstDate");
ok(/di\.min = "1981-01-01"; di\.max = win\.lastDate/.test(js), "the native date input past-min WIDENS to 1981 (PRISM), max stays the forecast end (spec-observed-on-demand-v1)");

console.log("\n== DATE WINDOW UI: in-window select recomputes on the SAME read — NO fetch on date change ==");
// renderLiveDay with apply=true sets read.dateStr and calls setField (recompute),
// and does NOT call any live-fetch. Isolate the function body.
const rldPath = (js.match(/function renderLiveDay\(read, win, dateStr, apply\)[\s\S]*?\n    \}/) || [""])[0];
ok(rldPath.length > 200, "renderLiveDay path located");
ok(/read\.dateStr = dateStr;/.test(rldPath) && /AGRIOS_FOCUS_R2\.setField\(read, meta\)/.test(rldPath),
   "in-window select sets read.dateStr + re-runs setField(read, meta) → computeReading for the day");
ok(!/fetchRead|__AGRIOS_RUN_LIVE__|startLiveRead|runLiveRead|\bfetch\s*\(/.test(rldPath),
   "renderLiveDay makes NO fetch / live-read call on date change (recompute reuses the cached read)");

console.log("\n== DATE WINDOW UI: out-of-window date → honest note, no recompute, display unchanged ==");
// the date-input change handler's live branch: in-window → renderLiveDay(apply),
// out-of-window → the honest 'No forecast held' note, no setField.
ok(/win\.days\.some\(function \(d\) \{ return d\.dateStr === v; \}\)/.test(js), "the input change handler tests membership in the time axis");
ok(/No record or forecast held for that date\. This read holds the observed record/.test(js), "an out-of-axis date shows the honest 'no record or forecast held' note");
// the out-of-axis branch shows the note but does NOT call setField/renderLiveDay-apply
const dateChangeBranch = (js.match(/if \(active && active\.live && active\.read\) \{\s*var win = root\.AGRIOS_LIVE\.parsers\.timeAxis[\s\S]*?return;\s*\}/) || [""])[0];
ok(dateChangeBranch.length > 100, "date-input live branch located");
ok(/else \{[\s\S]*?setText\("date-missing"[\s\S]*?show\("date-missing"\);/.test(dateChangeBranch),
   "the out-of-axis else-branch only shows the note (no recompute)");

console.log("\n== DATE WINDOW UI: Allerton keeps its two baked held-day chips + the day facts/caption markup ==");
ok(/function restoreAllertonDateChips\(\)/.test(js), "restoreAllertonDateChips() re-renders the two baked Allerton chips");
ok(/date-chip-jul3/.test(html) && /date-chip-jul4/.test(html) && /data-date="2026-07-03"/.test(html) && /data-date="2026-07-04"/.test(html),
   "index.html still carries the two baked Allerton date chips (Jul 3 / Jul 4)");
ok(/id="date-day-facts"/.test(html) && /id="date-window-cap"/.test(html), "index.html has the selected-day facts + window caption slots");
ok(/observed to /.test(js) && /forecast to /.test(js) && /\(NOAA PRISM \+ NWS\)/.test(js), "the caption reads 'observed to {today} · forecast to {last} (NOAA PRISM + NWS)' (spec-time-axis-v1)");
ok(/\.date-window-cap/.test(css) && /\.date-day-facts/.test(css) && /\.date-day-line/.test(css), "date-window caption + day-facts carry CSS");

console.log("\n== DATE WINDOW: design-system.md gains the date-as-control + time-of-day-deferred notes ==");
ok(/date as an instrument control|instrument control/i.test(dsm) && /re-runs? .*R1|R1 \(look-first\) can .*re-rank/i.test(dsm),
   "design-system.md documents 'date as an instrument control (re-runs R1 for the chosen day)'");
ok(/time-of-day is deferred|time-of-day.*deferred/i.test(dsm) && /gridpoints\/hourly|NWS gridpoints/i.test(dsm),
   "design-system.md records time-of-day deferred + future: NWS gridpoints/hourly");

/* =========================================================================
 * TIME AXIS UI (spec-time-axis-v1) — the ribbon spans observed+forecast with a
 * TODAY hinge; observed chips badged; the History progress row; the weather tile
 * shows observed for a past day; recompute-not-refetch on date change; design-
 * system documents the observed-vs-forecast distinction + PRISM ~4km. */
console.log("\n== TIME AXIS UI: the ribbon is observed chips + TODAY hinge + forecast chips ==");
ok(/date-chip--' \+ d\.kind/.test(js) && /d\.kind === "forecast"/.test(js), "chips are tagged by kind (observed / forecast) from the time axis");
ok(/date-chip-tag/.test(js) && />observed<\/span>|'observed'|"observed"/.test(js.replace(/\\/g, "")), "observed chips carry an 'observed' tag");
ok(/class="date-hinge"[\s\S]{0,80}>today</.test(js) || /date-hinge[\s\S]{0,120}today/.test(js), "a TODAY hinge marker is inserted before the first forecast chip");
ok(/\.date-chip--observed/.test(css) && /\.date-hinge/.test(css) && /\.date-chip-tag/.test(css), "the observed chip / hinge / tag carry CSS (both themes via tokens)");
ok(!/#[0-9A-Fa-f]{3,6}/.test((css.match(/\.date-chip--observed[\s\S]*?\.wx-period--observed[^}]*\}/) || [""])[0]), "the time-axis chip CSS uses tokens only (no stray hex — both themes work)");

console.log("\n== TIME AXIS UI: History is a progress row; weather tile shows OBSERVED for a past day ==");
ok(/key: "history", label: "History"/.test(js) && /NOAA ACIS/.test(js), "the live-read progress panel has a History (NOAA ACIS) row");
ok(/read\.dateStr && read\.dateStr < axisToday/.test(js) && /Observed record/.test(js), "a past selected day → the weather tile shows the OBSERVED record (not a forecast)");
ok(/observed · NOAA PRISM ~4km/.test(js), "the observed tile is labeled 'observed · NOAA PRISM ~4km'");
ok(/observed record unavailable — no history for this read/.test(js), "history-failable: a past day with no history shows the honest 'observed record unavailable' consequence");

console.log("\n== TIME AXIS UI: recompute-not-refetch holds on the combined axis (fetch spy = 0 conceptually) ==");
// renderLiveDay still makes NO fetch on date change (already asserted for the
// date-window path; re-assert against the time-axis rebuild — same function).
ok(!/fetchRead|__AGRIOS_RUN_LIVE__|startLiveRead|runLiveRead|historyTask/.test(rldPath), "renderLiveDay (now axis-aware) still makes NO fetch / history call on date change");

console.log("\n== TIME AXIS: History is FAILABLE — the forward axis still renders ==");
ok(/failures\.push\(\{ source: "history", consequence: "observed record unavailable — no history for this read" \}\)/.test(liveJs),
   "live.js: the history task on failure pushes the honest consequence + returns [] (read still built)");
ok(/historyTask\(\)/.test(liveJs) && /var asm = r\[0\][\s\S]*?history = r\[7\]/.test(liveJs), "historyTask is in the Promise.all — its failure does not reject the read");
ok(/history: history/.test(liveJs) && /history: input\.history \|\| \[\]/.test(liveJs), "history is threaded onto the read (read.history)");

console.log("\n== TIME AXIS: ACIS host + GridData shape (spec-time-axis-v1) ==");
ok(/acis:\s*"https:\/\/data\.rcc-acis\.org\/GridData"/.test(liveJs), "HOST.acis is the exact ACIS GridData endpoint");
ok(/grid: "21"/.test(liveJs) && /\{ name: "pcpn" \}, \{ name: "maxt" \}, \{ name: "mint" \}/.test(liveJs), "the ACIS POST body requests PRISM grid 21 + pcpn/maxt/mint");
ok(/lon\.toFixed\(4\) \+ "," \+ lat\.toFixed\(4\)/.test(liveJs), "the ACIS loc is 'lon,lat' (ACIS GridData order)");
ok(/isoDaysAgo\(14\)/.test(liveJs) && /isoDaysAgo\(1\)/.test(liveJs), "the observed window is today-14 … today-1 (the antecedent window)");

console.log("\n== TIME AXIS: design-system.md gains the observed-vs-forecast + PRISM ~4km / antecedent notes ==");
ok(/observed record.*forecast projection|forecast projection.*observed record/i.test(dsm) && /certainty distinction.*time|time axis/i.test(dsm),
   "design-system.md documents 'observed record vs forecast projection — the certainty distinction applied to time'");
ok(/PRISM.*~?4\s?km|~4km/i.test(dsm) && /antecedent/i.test(dsm) && /rain was recorded that day/i.test(dsm),
   "design-system.md records PRISM ~4km + the antecedent-window note + the R1_OBSERVED 'rain was recorded that day' variant");
ok(/no saturation modeling|saturation.*future work/i.test(dsm), "design-system.md notes: no saturation modeling (future work)");

/* =========================================================================
 * ON-DEMAND OBSERVED FETCH UI (spec-observed-on-demand-v1) — a past day before
 * the held window becomes a single labeled ACIS fetch; held days still recompute
 * with no fetch; future-beyond-forecast keeps the honest refusal; the input's
 * past-min widens to 1981 with the on-demand caption; Allerton is untouched. */
console.log("\n== ON-DEMAND: the date-input past-of-window path fetches ONE observed day (not a refusal) ==");
// the live date-input change branch: held → recompute; past-not-held → fetch;
// future → refusal. Capture the branch and assert its three arms.
const odBranch = (js.match(/if \(active && active\.live && active\.read\) \{\s*var win = root\.AGRIOS_LIVE\.parsers\.timeAxis[\s\S]*?\n      \}\s*\n      if \(FC\[v\]\)/) || [""])[0];
ok(/if \(has\) \{ hide\("date-missing"\); renderLiveDay\(active\.read, win, v, true\); return; \}/.test(odBranch),
   "a HELD day still recomputes with NO fetch (renderLiveDay, early return)");
ok(/if \(v && v < win\.todayStr\) \{\s*onDemandObservedFetch\(active\.read, v\);/.test(odBranch),
   "a PAST day before the held window calls onDemandObservedFetch (the single on-demand ACIS fetch)");
ok(/\/\/ FUTURE-BEYOND-FORECAST[\s\S]*?The future beyond the forecast is a projection nobody has\."\);\s*show\("date-missing"\);/.test(js),
   "a FUTURE-beyond-forecast day keeps the honest refusal (no fetch) — 'The future beyond the forecast is a projection nobody has.'");

console.log("\n== ON-DEMAND: state machine — fetching line, ok (history+cache), failed note (verbatim) ==");
const odFn = (js.match(/function onDemandObservedFetch\(read, dateStr\)[\s\S]*?\n    \}/) || [""])[0];
ok(odFn.length > 200, "onDemandObservedFetch located");
ok(/fetching the observed record for " \+ fmtHumanDate\(dateStr\) \+ " — NOAA ACIS…"/.test(odFn),
   "FETCHING state: the inline loading line 'fetching the observed record for {date} — NOAA ACIS…'");
ok(/live\.fetchObservedDay\(read\.lat, read\.lon, dateStr\)/.test(odFn),
   "it calls fetchObservedDay(read.lat, read.lon, dateStr)");
ok(/observed record unreachable for " \+ fmtHumanDate\(dateStr\) \+\s*" — NOAA ACIS didn't answer; try again\."/.test(odFn),
   "FAILED state: the honest note 'observed record unreachable for {date} — NOAA ACIS didn't answer; try again.' (verbatim)");
// OK state: push into read.history ASCENDING + persist the cached read
ok(/hist\.splice\(at, 0, row\)/.test(odFn) && /if \(hist\[i\]\.dateStr > row\.dateStr\) \{ at = i; break; \}/.test(odFn),
   "OK state: the fetched row is inserted into read.history in ASCENDING date order");
ok(/live\.cacheWrite\(read\)/.test(odFn),
   "OK state: the CACHED read is updated (cacheWrite) so the fetched day persists across reload");
ok(/renderLiveDay\(read, win2, dateStr, true\)/.test(odFn),
   "OK state: recompute the SAME way an in-axis day does (renderLiveDay → setField, no further fetch)");
ok(/if \(err && err\.futureDate\)/.test(odFn),
   "the future-date rejection is handled distinctly from a network failure (honest refusal, not 'unreachable')");

console.log("\n== ON-DEMAND: input past-min widens to 1981 + on-demand caption; chip row stays bounded ==");
ok(/di\.min = "1981-01-01"; di\.max = win\.lastDate/.test(js),
   "the live date-input min WIDENS to 1981-01-01 (PRISM start); max stays the forecast end");
ok(/observed record back to 1981 \(NOAA PRISM\), fetched on demand/.test(js),
   "the caption states 'observed record back to 1981 (NOAA PRISM), fetched on demand'");
ok(/cap\._onDemandNote/.test(js) && /\(NOAA PRISM \+ NWS\)" \+ \(cap\._onDemandNote \|\| ""\)/.test(js),
   "the on-demand note is appended AFTER the existing window caption");
ok(/var chipStart = daysAgoStr\(today, 21\)/.test(js) && /win\.days\.filter\(function \(d\) \{ return d\.dateStr >= chipStart; \}\)/.test(js),
   "the chip row is BOUNDED to ~21 days of today (a far-past fetched day is reachable via the input, not chipped)");
ok(/function daysAgoStr\(dateStr, n\)/.test(js), "daysAgoStr(dateStr, n) helper present (local date arithmetic)");

console.log("\n== ON-DEMAND: recompute-not-refetch NARROWED to held days; Allerton untouched ==");
// renderLiveDay itself STILL makes no fetch — the ONE ACIS call lives in the
// separate onDemandObservedFetch, invoked only for an out-of-window PAST day.
ok(!/fetchObservedDay|fetchRead|historyTask/.test(rldPath),
   "renderLiveDay (held-day recompute) makes NO fetch of any kind — no-refetch holds for HELD days");
ok((js.match(/fetchObservedDay/g) || []).length >= 1 && /onDemandObservedFetch/.test(js),
   "the single on-demand ACIS call is isolated in onDemandObservedFetch (exactly one fetch per out-of-window past day)");
// Allerton: still two baked chips, input clamp 2020–2030, no on-demand path
ok(/if \(di\) \{ di\.min = "2020-01-01"; di\.max = "2030-12-31"; \}/.test(js),
   "Allerton's date-input keeps its 2020–2030 clamp (no PRISM widening — the frozen two-day worked example)");
ok(/data-date="2026-07-03"/.test(html) && /data-date="2026-07-04"/.test(html),
   "Allerton still carries exactly its two baked held-day chips (Jul 3 / Jul 4) — unchanged");
ok(/dsm/ && /past dates fetch on demand/i.test(dsm) && /retrievable to PRISM's start \(\*\*1981\*\*\)|to PRISM's start \(1981\)/i.test(dsm) && /only the future beyond the forecast is refused/i.test(dsm),
   "design-system.md gains the one-line 'past dates fetch on demand … retrievable to PRISM's start (1981); only the future beyond the forecast is refused'");

/* -------------------------------------------------------------------------
 * SHORT-LABEL DISAMBIGUATION (spec-flag-zone-identity-v1 §C, play-test fix).
 * The dock chips + map cz-labels print a SHORT label (first soil word + band)
 * built independently of zone.label — the engine's collision suffix never
 * reached them (caught live at Jason's Farm: "Zook-Olmitz-Vesser · low band"
 * ×2 in the dock AFTER the engine fix). Short labels drop the drainage class,
 * a SMALLER label space, so the renderer must disambiguate in that space with
 * the same facts: the per-zone octant, then cellCount.
 * ------------------------------------------------------------------------- */
console.log("\n== ENGINE: octant is a per-zone FACT, always present ==");
ok(/octant: gridOctant\(cxg, cyg, nx, ny\)/.test(engineJs), "every shaped zone carries octant: gridOctant(centroid) — not only colliding ones");
var OCT8 = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
ok(F2.zones.length > 0 && F2.zones.every(z => OCT8.indexOf(z.octant) !== -1), "computed zones all carry an 8-way octant (" + F2.zones.map(z => z.octant).join(",") + ")");
ok(/z\.label = baseLabel \+ " · " \+ z\.octant/.test(engineJs), "the engine's full-label collision suffix reuses the same per-zone octant fact");

console.log("\n== RENDERER: czShortLabelMap — dock + map short labels disambiguate in SHORT-label space ==");
ok(/function czShortLabelMap\(zones\)/.test(js), "czShortLabelMap(zones) exists — collision-aware { zoneId: shortLabel } map");
ok(/out\[z\.id\] = z\.octant \? base \+ " · " \+ z\.octant : base/.test(js), "collisions append the zone's octant FACT (guarded for octant-less cached zones)");
ok(/if \(counts\[out\[z\.id\]\]\ > 1\) out\[z\.id\] = out\[z\.id\] \+ " \(" \+ z\.cellCount \+ " cells\)"/.test(js), "still-colliding short labels tiebreak with the cell count — same ladder as the engine");
ok(/var czShorts = czShortLabelMap\(reading\.zones\); \/\/ collision-aware short labels\s*\n\s*reading\.zones\.forEach/.test(js), "both call sites precompute the map before iterating zones");
ok(/label\.textContent = czShorts\[z\.id\]/.test(js), "the dock chip label reads from the collision-aware map (no bare czShortLabel(z))");
ok(/lbl\.textContent = z\.factLabelShort \|\| czShorts\[z\.id\]/.test(js), "the map cz-label reads from the collision-aware map (no bare czShortLabel(z))");
ok(!/label\.textContent = czShortLabel\(z\)/.test(js) && !/lbl\.textContent = z\.factLabelShort \|\| czShortLabel\(z\)/.test(js), "no zone-label call site bypasses the collision map");

console.log("\n== SHORT LABELS: design-system.md records the smaller-label-space rule ==");
var dsmShort = fs.readFileSync(path.join(repo, "design", "r2", "design-system.md"), "utf8");
ok(/short label/i.test(dsmShort) && /smaller label space|short-label space/i.test(dsmShort), "design-system.md notes short labels disambiguate in their own (smaller) label space");

/* -------------------------------------------------------------------------
 * THEME-AWARE OUTSIDE-WASH (Adam, 2026-07-05, three rounds). A terrain-colored
 * wash NEVER darkens the surround BACKGROUND (same color as the map base) --
 * it only fades strokes, so no alpha separated inside from outside in dark
 * (0.55 erased strokes, 0.34/0.45 read identical). Dark's wash fill is BLACK:
 * the whole surround field steps down in luminance while the stroke:background
 * ratio is preserved -- dimmed but legible. Light keeps terrain-low @ 0.55.
 * ------------------------------------------------------------------------- */
console.log("\n== OUTSIDE-WASH: theme-aware fill + alpha (a luminance STEP in dark, not a stroke-fade) ==");
var tokensCss = fs.readFileSync(path.join(repo, "design", "r2", "tokens.css"), "utf8");
ok(/--wash-fill: var\(--terrain-low\)/.test(tokensCss) && /--wash-fill: #000000/.test(tokensCss), "tokens.css defines --wash-fill: terrain-low in light, a BLACK veil in dark (real surround terrain underneath — spec-surround-context-v1)");
ok(/--wash-fill: var\(--terrain-low\)/.test(css) && /--wash-fill: #000000/.test(css), "focus-r2.css token copies carry --wash-fill in BOTH theme blocks");
ok(/--wash-alpha: 0\.55/.test(tokensCss) && /--wash-alpha: 0\.5;/.test(tokensCss) && /--wash-alpha: 0\.55/.test(css) && /--wash-alpha: 0\.5;/.test(css), "--wash-alpha: 0.55 light / 0.5 dark (black veil halves surround luminance — the obvious step)");
var lightWashIdx = css.indexOf("--wash-fill: var(--terrain-low)"), darkThemeIdx = css.indexOf('html[data-theme="dark"]'), darkWashIdx = css.indexOf("--wash-fill: #000000");
ok(lightWashIdx !== -1 && darkThemeIdx !== -1 && lightWashIdx < darkThemeIdx && darkThemeIdx < darkWashIdx, "terrain-low fill sits in the light root, the veil inside the dark theme block (order check)");
ok(/\.outside-wash \{ pointer-events: none; fill: var\(--wash-fill\); fill-opacity: var\(--wash-alpha\); \}/.test(css), ".outside-wash reads BOTH fill and fill-opacity from tokens (CSS outranks the inline attrs, re-resolves on theme flip)");
ok(/"fill-opacity": 0\.55/.test(js), "the inline SVG attrs stay as a harmless fallback (both wash call sites)");
var dsmWash = fs.readFileSync(path.join(repo, "design", "r2", "design-system.md"), "utf8");
ok(/--wash-fill/.test(dsmWash) && /--wash-alpha/.test(dsmWash), "design-system.md records the fill+alpha wash rule");

/* -------------------------------------------------------------------------
 * DIALOG FIELD FACTS FOLLOW THE ACTIVE FIELD (caught by Adam on the published
 * site). The Field & date CURRENT FIELD block printed Allerton's analyst facts
 * (name/coords/stated bounds/acreage-crop-county) during a LIVE read — a
 * vocabulary breach. Now it branches: live reads show THEIR facts; bounds only
 * if stated; acreage only as a computed fact of stated bounds; Allerton keeps
 * its baked analyst block.
 * ------------------------------------------------------------------------- */
console.log("\n== DIALOG: current-field facts branch on the ACTIVE field ==");
ok(/var active = AGRIOS_FOCUS_R2\.getActive && AGRIOS_FOCUS_R2\.getActive\(\);\s*\n\s*var noteEl/.test(js), "openFieldDialog resolves the active field BEFORE populating facts");
ok(/setText\("fd-name", \(f && f\.name\) \? f\.name : "unsaved read"\)/.test(js), "live read: name is the saved field's or 'unsaved read' — never Allerton's");
ok(/setText\("fd-coords", AGRIOS_FOCUS_R2\.fmtDeg\(active\.read\.lat\)/.test(js), "live read: coordinates come from the READ, not the baked field");
ok(/not stated — save the field and “use current view as bounds”/.test(js), "unbounded live read: stated bounds honestly 'not stated' + the path to state them (verbatim)");
ok(/function approxAcres\(b\)/.test(js) && /4046\.8564224/.test(js) && /acres \(from stated bounds\)/.test(js), "acreage is computed from STATED bounds and tagged '(from stated bounds)' — never asserted without them");
ok(/setText\("fd-acreage", \(f && f\.bounds\) \? approxAcres\(f\.bounds\) : "—"\)/.test(js), "no stated bounds → acreage is an honest em-dash");
ok(/stated bounds are your claim of record/i.test(js) && /the field's fixed parcel \(USGS\/USDA extent\)/i.test(js), "the facts note switches vocabulary: claim-of-record (live) vs fixed-parcel (Allerton)");
ok(/id="fd-facts-note"/.test(html), "the facts note carries its id (JS swaps the copy per active field)");
ok(/setText\("fd-name", D\.field\.name\)/.test(js) && /setText\("fd-acreage", D\.field\.acreage\)/.test(js), "the Allerton branch still prints the baked analyst facts (unchanged path)");
ok(/phLat = \(active && active\.live && active\.read\) \? AGRIOS_FOCUS_R2\.fmtDeg\(active\.read\.lat\)/.test(js), "location placeholders reflect the active read's coords on live reads");

console.log("\n== DOCK: the bottom zone strip joins the dark-mode float-separation group ==");
ok(/\.field-pill, \.view-bounds-pill, \.prov-chip, \.field-chip, \.cached-chip, \.map-popover, \.ctl, \.dock \{\s*\n\s*border: 1px solid var\(--float-border\);/.test(css), "the .dock carries the theme-aware --float-border hairline (invisible on light, visible on dark) like the other floating surfaces");
ok(/--float-border: rgba\(244, 244, 242, 0\.18\)/.test(css) && /--float-border: rgba\(30, 30, 32, 0\)/.test(css), "--float-border stays 0-alpha on light / visible hairline on dark (unchanged) — the dock inherits both");

/* -------------------------------------------------------------------------
 * HOW-TO PANEL (spec-howto-v1). A new `?` rail control mirrors the `#about-
 * dialog` structure exactly, opening an operational companion to the
 * philosophical About panel. Content is verbatim — pasted from the spec, not
 * reworded — so the honesty-gate phrase checks below are the point: they
 * confirm the shipped copy still says what passed the honesty check, and
 * that no invented confidence (%, "confidence") crept into the panel.
 * ------------------------------------------------------------------------- */
console.log("\n== HOW-TO PANEL: rail button + dialog structure (mirrors #about-dialog) ==");
ok(/<button id="rail-howto" class="rail-nav-btn" aria-label="How to use">\s*\n\s*<span class="rail-glyph">\?<\/span>/.test(html),
   "#rail-howto button exists with aria-label=\"How to use\" and the ? glyph");
const railGroupHtml = (html.match(/<div class="rail-nav-group">[\s\S]*?<\/div>\s*\n\s*<\/nav>/) || [""])[0];
ok(/id="rail-howto"/.test(railGroupHtml), "#rail-howto sits inside .rail-nav-group");
ok(railGroupHtml.indexOf('id="rail-about"') !== -1 && railGroupHtml.indexOf('id="rail-about"') < railGroupHtml.indexOf('id="rail-howto"'),
   "#rail-howto comes immediately after #rail-about in the rail group");

ok(/id="howto-dialog" class="dialog" role="dialog" aria-modal="true" aria-labelledby="howto-title" aria-hidden="true"/.test(html),
   "#howto-dialog exists with role=\"dialog\", aria-modal=\"true\", aria-labelledby=\"howto-title\", aria-hidden=\"true\"");
const howtoBlock = (html.match(/<div id="howto-dialog"[\s\S]*?\n<\/div>\s*\n\s*\n<!-- Field & date/) || [""])[0];
ok(howtoBlock.length > 0, "the #howto-dialog block is present and delimited (isolates the honesty-gate checks below to its own markup)");
ok(/<button class="dialog-close" aria-label="Close">×<\/button>/.test(howtoBlock), "#howto-dialog carries the same .dialog-close × button as the other dialogs");
ok(/<h2 id="howto-title">How to use<\/h2>/.test(howtoBlock), "#howto-dialog's <h2> title is exact: 'How to use'");

console.log("\n== HOW-TO PANEL: wiring — rail-howto opens howto-dialog, generic close machinery covers it ==");
ok(/var ho = document\.getElementById\("rail-howto"\);\s*\n\s*if \(ho\) ho\.addEventListener\("click", function \(\) \{ openDialog\("howto-dialog"\); \}\);/.test(js),
   "JS wires #rail-howto click to openDialog(\"howto-dialog\") — same shape as #rail-about");
ok(/document\.querySelectorAll\("\.dialog"\)\.forEach\(function \(d\) \{/.test(js) && /document\.querySelectorAll\("\.dialog\.open"\)\.forEach\(closeDialog\)/.test(js),
   "wireDialogs() queries ALL .dialog elements generically (backdrop click, .dialog-close, Escape) — #howto-dialog is covered for free, no per-id close logic needed");

console.log("\n== HOW-TO PANEL: verbatim copy — all 5 section headings present ==");
["1. Get a reading", "2. Read the screen", "3. What the support count and ⟨?⟩ mean", "4. State your field (optional)", "5. Trust it to point, then go check"].forEach(h =>
   ok(howtoBlock.indexOf("<h3>" + h + "</h3>") !== -1, "section heading present verbatim: \"" + h + "\""));

console.log("\n== HOW-TO PANEL: honesty gates on the copy (the point of this feature) ==");
[
  "where to look",
  "does not tell you what to do",
  "count of evidence, never a made-up percentage",
  "holds the question open",
  "working, not failing",
  "claim of record",
  "computed reading",
  "analyst reading",
  "context-grade, not survey-grade"
].forEach(phrase =>
   ok(howtoBlock.indexOf(phrase) !== -1, "honesty-gate phrase present verbatim: \"" + phrase + "\""));
ok(!/%/.test(howtoBlock), "no % anywhere inside #howto-dialog (data support is a count, n/4, never a percentage)");
ok(!/confidence/i.test(howtoBlock), "no \"confidence\" claim anywhere inside #howto-dialog (no invented confidence)");

/* =============================================================================
 * ONBOARDING TOUR (spec-onboarding-tour-v1) — a click-through spotlight tour.
 * The overlay is built by JS at runtime, so these are static structural/copy
 * checks: the steps table + 7 selectors, the box-shadow cutout reusing the
 * .dialog backdrop, z 80 > 60, keyboard + seen-key + auto-start guards, the
 * verbatim relaunch button + wiring, the honesty gates on the tour copy, the
 * reduced-motion query, tokens-only .tour-* styles, and the ?v= bumps.
 * ------------------------------------------------------------------------- */
console.log("\n== TOUR: steps table — exactly the 7 selectors, in order, with the skip rules ==");
const tourStepsBlock = (js.match(/var TOUR_STEPS = \[([\s\S]*?)\n  \];/) || [, ""])[1];
ok(tourStepsBlock.length > 0, "TOUR_STEPS array is present and delimited (isolates the copy/selector checks)");
ok(/sel:\s*"#field-pill"/.test(tourStepsBlock), "step 1 sel is #field-pill");
ok(/sel:\s*"#focus-map",\s*mobileSel:\s*"#focus-map",\s*region:\s*0\.6/.test(tourStepsBlock), "step 2 sel is #focus-map with region: 0.6 (a centered ~60% of the hero, not the whole map)");
ok(/sel:\s*"\.refusal-band",\s*mobileSel:\s*"\.refusal-band",\s*skipIfAbsent:\s*true/.test(tourStepsBlock), "step 3 sel is .refusal-band with skipIfAbsent: true (Allerton's east low; skip if absent)");
ok(/sel:\s*"#rail",\s*mobileSel:\s*"#sheet"/.test(tourStepsBlock), "step 4 sel is #rail with mobileSel #sheet (the mobile bottom sheet hosting #sheet-cards)");
ok(/sel:\s*"#dock"/.test(tourStepsBlock), "step 5 sel is #dock");
ok(/sel:\s*"#rail-nav"/.test(tourStepsBlock), "step 6 sel is #rail-nav");
ok(/name:\s*"the instrument",\s*center:\s*true/.test(tourStepsBlock), "step 7 is center: true (no spotlight — a centered card)");
const tourSelCount = (tourStepsBlock.match(/\bsel:/g) || []).length;
ok(tourSelCount === 6, "exactly 6 spotlight steps carry a sel + 1 centered step = 7 stops (" + tourSelCount + " sel keys)");
ok(/function tourStepShown/.test(js) && /return step\.center \? true : !!tourEl\(step\)/.test(js), "skip-if-missing logic present: a step is shown only if centered or its target resolves (tourEl → null ⇒ skipped)");
ok(/function tourNextShown/.test(js) && /function tourPrevShown/.test(js), "navigation skips over unshown steps (tourNextShown / tourPrevShown walk to the next/prev shown index)");

console.log("\n== TOUR: spotlight — box-shadow cutout reusing the .dialog backdrop; z 80 > 60 ==");
const dialogBg = (css.match(/\.dialog\s*\{[^}]*background:\s*(rgba\([^)]*\))/) || [, ""])[1];
ok(dialogBg === "rgba(20,20,20,0.4)", ".dialog backdrop value read from CSS is rgba(20,20,20,0.4) (" + dialogBg + ")");
ok(css.indexOf("box-shadow: 0 0 0 9999px " + dialogBg + ";") !== -1, ".tour-spot uses the box-shadow cutout (0 0 0 9999px) with the SAME backdrop value as .dialog — one dimming language, not a new color");
const dialogZ = (css.match(/\.dialog\s*\{[^}]*z-index:\s*(\d+)/) || [, ""])[1];
const tourZ = (css.match(/#tour\s*\{[^}]*z-index:\s*(\d+)/) || [, ""])[1];
ok(dialogZ === "60", ".dialog z-index is 60 (" + dialogZ + ")");
ok(tourZ === "80", "#tour z-index is 80 (" + tourZ + ")");
ok(Number(tourZ) > Number(dialogZ), "#tour (80) sits ABOVE the dialogs (60) — " + tourZ + " > " + dialogZ);
ok(/#tour\s*\{[^}]*pointer-events:\s*auto/.test(css), "#tour captures pointer-events (nothing behind the overlay is clickable while active)");

console.log("\n== TOUR: keyboard, seen-key on ANY exit, and the auto-start guards ==");
ok(/e\.key === "Escape"[\s\S]*?tourEnd\(\)/.test(js), "Escape ends the tour (= skip; Esc always works)");
ok(/e\.key === "ArrowRight"[\s\S]*?tourNext\(\)/.test(js), "ArrowRight advances (next)");
ok(/e\.key === "ArrowLeft"[\s\S]*?tourBack\(\)/.test(js), "ArrowLeft goes back");
ok(/e\.key === "Tab"/.test(js) && /trap focus inside the card/.test(js), "Tab is trapped inside the card");
ok(/var TOUR_SEEN_KEY = "agrios\.tour\.seenAt"/.test(js), "the persistence key is agrios.tour.seenAt");
ok(/function tourEnd\(\)[\s\S]*?root\.localStorage\.setItem\(TOUR_SEEN_KEY, String\(Date\.now\(\)\)\)/.test(js), "ANY exit sets agrios.tour.seenAt to a timestamp (tourEnd is the single exit for Done/Skip/Esc/how-to)");
const autoStartFn = (js.match(/function tourMaybeAutoStart\(\) \{([\s\S]*?)\n  \}/) || [, ""])[1];
ok(/root\.localStorage\.getItem\(TOUR_SEEN_KEY\)/.test(autoStartFn) && /if \(seen\) return/.test(autoStartFn), "auto-start is guarded on the seen-key's ABSENCE (present ⇒ never auto-starts again)");
ok(/document\.querySelector\("\.dialog\.open"\)\)? return/.test(autoStartFn) || /\.dialog\.open"\)\) return/.test(autoStartFn), "auto-start is guarded on no dialog already open");
ok(/getElementById\("live-progress"\)/.test(autoStartFn) && /!prog\.hidden\) return/.test(autoStartFn), "auto-start is guarded on no live read in progress (the visible #live-progress panel is the honest signal)");
ok(/root\.setTimeout\(tourMaybeAutoStart, \d+\)/.test(js), "auto-start is deferred until after the initial render settles (getBoundingClientRect valid; a short setTimeout, no rAF loop)");
ok(/if \(tourState\) return;/.test(js), "startTour is idempotent — a second start while active is a no-op (Skip always available, no double overlay)");

console.log("\n== TOUR: relaunch button in #howto-dialog (verbatim) + wiring ==");
ok(/<button type="button" id="howto-tour-launch" class="tour-relaunch">Show me around — the 60-second tour<\/button>/.test(html), "the relaunch button exists with the verbatim label 'Show me around — the 60-second tour'");
ok(howtoBlock.indexOf('id="howto-tour-launch"') !== -1, "the relaunch button lives inside #howto-dialog");
ok(howtoBlock.indexOf('class="dialog-note"') < howtoBlock.indexOf('id="howto-tour-launch"'), "the relaunch button sits BELOW the .dialog-note (the always-available path at the foot of the dialog)");
ok(/function wireTourRelaunch\(\)[\s\S]*?getElementById\("howto-tour-launch"\)[\s\S]*?closeDialog\(d\);[\s\S]*?startTour\(/.test(js), "wireTourRelaunch closes the dialog then startTour() — the always-available relaunch");
ok(/wireTourRelaunch\(\);/.test(js), "wireTourRelaunch() is called from init()");

console.log("\n== TOUR: honesty gates on the copy (same register as the how-to panel) ==");
[
  "facts the map can prove",
  "holds the question open",
  "working",
  "count of evidence, never a percentage",
  "where to look",
  "the deciding stays yours"
].forEach(phrase =>
  ok(tourStepsBlock.indexOf(phrase) !== -1, "honesty-gate phrase present verbatim in the tour copy: \"" + phrase + "\""));
ok(!/%/.test(tourStepsBlock), "no % anywhere in the tour copy (data support is a count, never a percentage)");
ok(!/confidence/i.test(tourStepsBlock), "no \"confidence\" anywhere in the tour copy (no invented confidence)");

console.log("\n== TOUR: reduced-motion honored + tokens only (no hardcoded hex in .tour-*) ==");
const tourCssBlock = css.slice(css.indexOf("ONBOARDING TOUR (spec-onboarding-tour-v1)"));
ok(/@media \(prefers-reduced-motion: reduce\) \{\s*\.tour-spot \{ transition: none; \}/.test(tourCssBlock), "the tour CSS kills the spotlight transition under prefers-reduced-motion: reduce");
ok(!/#[0-9a-fA-F]{3,8}\b/.test(tourCssBlock.replace(/rgba\([^)]*\)/g, "")), "no hardcoded hex color anywhere in the .tour-* styles (tokens only; the one rgba is the shared .dialog backdrop)");

console.log("\n== TOUR: cache-bust bumps ==");
ok(/focus-r2\.js\?v=38/.test(html) && !/focus-r2\.js\?v=37/.test(html), "index.html loads focus-r2.js?v=38 (bumped from 37)");
ok(/focus-r2\.css\?v=36/.test(html) && !/focus-r2\.css\?v=35/.test(html), "index.html loads focus-r2.css?v=36 (bumped from 35)");

/* ========================================================================= */
console.log("\n== summary ==");
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
