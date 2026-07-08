/* =============================================================================
 * AGRIOS Focus — R2 edition. The persistent field map + scroll-linked narrative,
 * restyled into the R2 design language (design/r2/design-system.md + tokens.css).
 *
 * The map is LIGHT now: warm hypsometric tint bands (--terrain-low → --terrain-high,
 * interpolated by elevation from the SAME real DEM) between thin contour lines.
 * Index contours are brighter + labeled. Zone outlines are dashed --ink-2. The
 * east-low refusal stays a fuzzy AMBER hatched + blurred band with a ⟨?⟩ chip —
 * never red, never a crisp line or a pin. Honesty invariants are restyle-proof.
 *
 * REUSED VERBATIM from focus/focus.js (the paid-for logic):
 *   · marchingSquares  — 16-case with linear edge interpolation
 *   · stitch           — segment → polyline joining
 *   · catmullRomPath   — STROKE-ONLY smoothing; passes THROUGH every vertex
 *   · zone geometry (ZONES, grid fractions) and pan/zoom controller
 *   · wireScrollSync   — the DIRECT scroll-listener + nearest-center picker
 *                        (a plain scroll handler, not the observer/rAF paths that failed)
 *
 * NEW for R2:
 *   · buildBands       — filled hypsometric band polygons from the level sets
 *   · light chrome wiring (rail, circular controls, dock chips, layers panel)
 *
 * Vanilla JS + SVG only. No libraries, no network. Traceable to
 * data-real/field-scan-allerton.md. Node-runnable API for checks/verify.js.
 * ========================================================================== */
(function (root) {
  "use strict";

  var SVGNS = "http://www.w3.org/2000/svg";

  /* =========================================================================
   * MARCHING SQUARES — reused verbatim from focus/focus.js.
   * ========================================================================= */
  function marchingSquares(grid, level) {
    var ny = grid.length, nx = grid[0].length;
    var segs = [];
    function t(a, b) { return (level - a) / (b - a); }
    for (var y = 0; y < ny - 1; y++) {
      for (var x = 0; x < nx - 1; x++) {
        var tl = grid[y][x], tr = grid[y][x + 1], br = grid[y + 1][x + 1], bl = grid[y + 1][x];
        var idx = 0;
        if (tl >= level) idx |= 8;
        if (tr >= level) idx |= 4;
        if (br >= level) idx |= 2;
        if (bl >= level) idx |= 1;
        if (idx === 0 || idx === 15) continue;
        var top    = { x: x + t(tl, tr), y: y };
        var right  = { x: x + 1,         y: y + t(tr, br) };
        var bottom = { x: x + t(bl, br), y: y + 1 };
        var left   = { x: x,             y: y + t(tl, bl) };
        function push(a, b) { segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }); }
        switch (idx) {
          case 1:  push(left, bottom); break;
          case 2:  push(bottom, right); break;
          case 3:  push(left, right); break;
          case 4:  push(top, right); break;
          case 5:  push(left, top); push(bottom, right); break; // saddle
          case 6:  push(top, bottom); break;
          case 7:  push(left, top); break;
          case 8:  push(left, top); break;
          case 9:  push(top, bottom); break;
          case 10: push(left, bottom); push(top, right); break; // saddle
          case 11: push(top, right); break;
          case 12: push(left, right); break;
          case 13: push(bottom, right); break;
          case 14: push(left, bottom); break;
        }
      }
    }
    return segs;
  }

  /* =========================================================================
   * STITCH segments into polylines — reused verbatim from focus/focus.js.
   * ========================================================================= */
  function stitch(segs) {
    var EPS = 1e-6;
    var used = new Array(segs.length).fill(false);
    var key = function (x, y) { return Math.round(x / EPS) + "," + Math.round(y / EPS); };
    var index = {};
    segs.forEach(function (s, i) {
      (index[key(s.x1, s.y1)] = index[key(s.x1, s.y1)] || []).push({ i: i, end: 0 });
      (index[key(s.x2, s.y2)] = index[key(s.x2, s.y2)] || []).push({ i: i, end: 1 });
    });
    function endpoints(s, end) {
      return end === 0 ? [{ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }]
                       : [{ x: s.x2, y: s.y2 }, { x: s.x1, y: s.y1 }];
    }
    var paths = [];
    for (var start = 0; start < segs.length; start++) {
      if (used[start]) continue;
      used[start] = true;
      var pts = endpoints(segs[start], 0);
      var head = pts[0], tail = pts[1];
      var line = [head, tail];
      var grow = true;
      while (grow) {
        grow = false;
        var cand = index[key(tail.x, tail.y)] || [];
        for (var c = 0; c < cand.length; c++) {
          var ci = cand[c].i;
          if (used[ci]) continue;
          var ep = endpoints(segs[ci], cand[c].end);
          if (key(ep[0].x, ep[0].y) === key(tail.x, tail.y)) {
            used[ci] = true; line.push(ep[1]); tail = ep[1]; grow = true; break;
          }
        }
      }
      grow = true;
      while (grow) {
        grow = false;
        var cand2 = index[key(head.x, head.y)] || [];
        for (var d = 0; d < cand2.length; d++) {
          var di = cand2[d].i;
          if (used[di]) continue;
          var ep2 = endpoints(segs[di], cand2[d].end);
          if (key(ep2[0].x, ep2[0].y) === key(head.x, head.y)) {
            used[di] = true; line.unshift(ep2[1]); head = ep2[1]; grow = true; break;
          }
        }
      }
      paths.push(line);
    }
    return paths;
  }

  function contourLevels(grid, interval) {
    var min = Infinity, max = -Infinity;
    grid.forEach(function (r) { r.forEach(function (v) { if (v < min) min = v; if (v > max) max = v; }); });
    var levels = [];
    var first = Math.ceil(min / interval) * interval;
    for (var L = first; L < max; L += interval) levels.push(Math.round(L));
    return levels;
  }

  function buildContours(grid, interval, indexEvery) {
    var levels = contourLevels(grid, interval);
    return levels.map(function (level) {
      return { level: level, index: (level % indexEvery === 0), paths: stitch(marchingSquares(grid, level)) };
    });
  }

  /* =========================================================================
   * HYPSOMETRIC BANDS (NEW for R2).
   *
   * The honest fill: the map is tinted between contour levels, low→high, from
   * the SAME real DEM the contours come from — no new terrain is invented. We
   * build FILLED polygons by tracing, per cell, the region where the surface is
   * >= a level using the marching-squares fractional crossings. A filled band
   * for [loLevel, hiLevel) is drawn as (fill >= loLevel) with the next band
   * painted on top — so layering lowest-to-highest yields clean hypsometric
   * bands with no seams. Each band carries a `t` in 0..1 for the tint lerp.
   *
   * Per cell we emit the polygon of the corner-and-edge points that lie at or
   * above `level`. Corners contribute their own position; edges contribute the
   * fractional crossing (identical math to marchingSquares). This is the
   * standard "filled contour" / iso-band construction and is exact at the grid
   * resolution — it cannot show detail finer than the 128×98 (~25 m) sample.
   * ========================================================================= */
  function cellFillPolygon(tl, tr, br, bl, x, y, level) {
    // corners in CW order from top-left; edges between them.
    // returns array of {x,y} grid-coord points forming the >=level region in cell.
    function t(a, b) { return (level - a) / (b - a); }
    var pts = [];
    var TL = { x: x,     y: y },     cTL = tl >= level;
    var TR = { x: x + 1, y: y },     cTR = tr >= level;
    var BR = { x: x + 1, y: y + 1 }, cBR = br >= level;
    var BL = { x: x,     y: y + 1 }, cBL = bl >= level;
    // top edge (TL->TR)
    if (cTL) pts.push(TL);
    if (cTL !== cTR) pts.push({ x: x + t(tl, tr), y: y });
    // right edge (TR->BR)
    if (cTR) pts.push(TR);
    if (cTR !== cBR) pts.push({ x: x + 1, y: y + t(tr, br) });
    // bottom edge (BR->BL)
    if (cBR) pts.push(BR);
    if (cBR !== cBL) pts.push({ x: x + t(bl, br), y: y + 1 });
    // left edge (BL->TL)
    if (cBL) pts.push(BL);
    if (cBL !== cTL) pts.push({ x: x, y: y + t(tl, bl) });
    return pts;
  }

  // Build one filled ">= level" layer as an array of small cell polygons.
  // Painting layers lowest→highest with increasing tint produces the bands.
  function buildFillLayer(grid, level) {
    var ny = grid.length, nx = grid[0].length;
    var polys = [];
    for (var y = 0; y < ny - 1; y++) {
      for (var x = 0; x < nx - 1; x++) {
        var poly = cellFillPolygon(grid[y][x], grid[y][x + 1], grid[y + 1][x + 1], grid[y + 1][x], x, y, level);
        if (poly.length >= 3) polys.push(poly);
      }
    }
    return polys;
  }

  // Hypsometric bands: one fill layer per contour level (plus a base floor at
  // the minimum). Each layer's tint `t` = fraction of the way from min→max
  // elevation, so painting min→max colors the terrain low(cream)→high(sage).
  function buildBands(grid, interval) {
    var min = Infinity, max = -Infinity;
    grid.forEach(function (r) { r.forEach(function (v) { if (v < min) min = v; if (v > max) max = v; }); });
    var levels = contourLevels(grid, interval);
    var bands = [];
    // base floor: everything >= min (t=0, the lowest cream)
    bands.push({ level: Math.floor(min), t: 0, polys: buildFillLayer(grid, Math.floor(min)) });
    levels.forEach(function (L) {
      bands.push({ level: L, t: (L - min) / (max - min), polys: buildFillLayer(grid, L) });
    });
    return bands;
  }

  // linear interpolate two #rrggbb colors by t in 0..1 → "#rrggbb"
  function lerpHex(a, b, t) {
    function hx(c) { return parseInt(c, 16); }
    var ar = hx(a.slice(1, 3)), ag = hx(a.slice(3, 5)), ab = hx(a.slice(5, 7));
    var br = hx(b.slice(1, 3)), bg = hx(b.slice(3, 5)), bb = hx(b.slice(5, 7));
    function m(x, y) { return Math.round(x + (y - x) * t).toString(16).padStart(2, "0"); }
    return "#" + m(ar, br) + m(ag, bg) + m(ab, bb);
  }

  /* =========================================================================
   * CHAIKIN corner-cutting (NEW — spec §3.4). Two bounded passes run on each
   * marching-squares polyline BEFORE Catmull-Rom, to soften the staircase kinks
   * of the denser 128×98 grid. Each pass replaces every segment [P,Q] with two
   * points at ¼ and ¾ — so a corner is cut, never pushed outward. Deviation
   * from the original polyline is bounded by ~⅜ of one cell (~9 m at 25 m
   * spacing) after two passes — under the sampling tolerance, so no fabricated
   * terrain detail: the curve stays inside the corner it rounds.
   *   · Closed rings (first ≈ last) are cut CIRCULARLY (wrap the corner).
   *   · Open lines KEEP their endpoints (only interior corners are cut).
   * Points are in grid coords; smoothing happens before projection.
   * ========================================================================= */
  function chaikinOnce(pts, closed) {
    var n = pts.length;
    if (n < 3) return pts.slice();
    var out = [];
    if (closed) {
      // circular: cut every corner, wrapping the last→first edge
      for (var i = 0; i < n; i++) {
        var p = pts[i], q = pts[(i + 1) % n];
        out.push({ x: p.x * 0.75 + q.x * 0.25, y: p.y * 0.75 + q.y * 0.25 });
        out.push({ x: p.x * 0.25 + q.x * 0.75, y: p.y * 0.25 + q.y * 0.75 });
      }
    } else {
      // open: pin the endpoints, cut only interior corners
      out.push({ x: pts[0].x, y: pts[0].y });
      for (var j = 0; j < n - 1; j++) {
        var a = pts[j], b = pts[j + 1];
        out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
        out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
      }
      out.push({ x: pts[n - 1].x, y: pts[n - 1].y });
    }
    return out;
  }
  function isClosedRing(pts) {
    if (pts.length < 4) return false;
    var a = pts[0], b = pts[pts.length - 1];
    var dx = a.x - b.x, dy = a.y - b.y;
    return dx * dx + dy * dy < 1e-6;
  }
  // Two bounded Chaikin passes. A closed ring's duplicated closing vertex is
  // dropped before cutting (so the wrap isn't double-counted) and the ring is
  // left implicitly closed for catmullRomPath's own ring detection.
  function chaikinSmooth(pts, passes) {
    if (pts.length < 3) return pts.slice();
    var closed = isClosedRing(pts);
    var work = closed ? pts.slice(0, pts.length - 1) : pts.slice();
    for (var k = 0; k < passes; k++) work = chaikinOnce(work, closed);
    if (closed) work.push({ x: work[0].x, y: work[0].y });
    return work;
  }

  /* =========================================================================
   * CATMULL-ROM → cubic-Bézier smoothing (STROKE-ONLY). Reused verbatim.
   * ========================================================================= */
  function catmullRomPath(points, proj, closed) {
    if (points.length < 2) return "";
    var p = points.map(proj);
    if (p.length === 2) {
      return "M" + p[0].x.toFixed(2) + " " + p[0].y.toFixed(2) +
             " L" + p[1].x.toFixed(2) + " " + p[1].y.toFixed(2);
    }
    var isClosed = closed;
    if (!isClosed) {
      var dx = p[0].x - p[p.length - 1].x, dy = p[0].y - p[p.length - 1].y;
      if (dx * dx + dy * dy < 0.01) isClosed = true;
    }
    function at(i) {
      var n = p.length;
      if (isClosed) return p[(i % n + n) % n];
      return p[Math.max(0, Math.min(n - 1, i))];
    }
    var d = "M" + p[0].x.toFixed(2) + " " + p[0].y.toFixed(2) + " ";
    var last = isClosed ? p.length : p.length - 1;
    for (var i = 0; i < last; i++) {
      var p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      var c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
      var c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      d += "C" + c1x.toFixed(2) + " " + c1y.toFixed(2) + " " +
                 c2x.toFixed(2) + " " + c2y.toFixed(2) + " " +
                 p2.x.toFixed(2) + " " + p2.y.toFixed(2) + " ";
    }
    if (isClosed) d += "Z";
    return d.trim();
  }

  function makeProjector(nx, ny, W, H, pad) {
    var gw = nx - 1, gh = ny - 1;
    var sx = (W - 2 * pad) / gw, sy = (H - 2 * pad) / gh;
    return function (pt) { return { x: pad + pt.x * sx, y: pad + pt.y * sy }; };
  }
  // The inverse of makeProjector: SVG user-space coords → grid coords. Same
  // sx/sy, so unproj(proj(pt)) === pt. The live view-bounds readout inverts the
  // view transform to a visible SVG rect, then this maps that rect to grid
  // coords, then gxToLon/gyToLat map to lon/lat.
  function makeUnprojector(nx, ny, W, H, pad) {
    var gw = nx - 1, gh = ny - 1;
    var sx = (W - 2 * pad) / gw, sy = (H - 2 * pad) / gh;
    return function (p) { return { x: (p.x - pad) / sx, y: (p.y - pad) / sy }; };
  }

  /* =========================================================================
   * VIEW → BOUNDS (pure, node-testable). Given the current view {cx,cy,zoom},
   * the visible SVG rect span {w,h} (from visibleSize), the map dims/pad, and
   * grid nx/ny, return the ACTUAL visible map bounds in decimal degrees:
   *   { n, s, e, w } (north/south latitude, east/west longitude).
   * The visible SVG rect is centered on (cx,cy) with the given span; its
   * corners invert through the projector to grid coords, then through
   * gxToLon/gyToLat to lon/lat. gy=0 is NORTH (max lat), so the rect TOP
   * (smaller svgY) is the NORTH edge. Longitude/latitude are clamped to the
   * grid bbox — the terrain never extends past it, so neither can the view.
   * ========================================================================= */
  function viewToBounds(view, span, nx, ny, W, H, pad) {
    var unproj = makeUnprojector(nx, ny, W, H, pad);
    var leftSvg = view.cx - span.w / 2, rightSvg = view.cx + span.w / 2;
    var topSvg = view.cy - span.h / 2, botSvg = view.cy + span.h / 2;
    var gTL = unproj({ x: leftSvg, y: topSvg });     // west lon, north lat
    var gBR = unproj({ x: rightSvg, y: botSvg });     // east lon, south lat
    function clampLon(l) { return Math.max(GRID_BBOX.lon[0], Math.min(GRID_BBOX.lon[1], l)); }
    function clampLat(l) { return Math.max(GRID_BBOX.lat[0], Math.min(GRID_BBOX.lat[1], l)); }
    return {
      n: clampLat(gyToLat(gTL.y)),
      s: clampLat(gyToLat(gBR.y)),
      w: clampLon(gxToLon(gTL.x)),
      e: clampLon(gxToLon(gBR.x))
    };
  }

  function svgEl(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }

  function polyPath(pts, proj) {
    var d = "";
    pts.forEach(function (pt, i) {
      var q = proj(pt);
      d += (i === 0 ? "M" : "L") + q.x.toFixed(2) + " " + q.y.toFixed(2) + " ";
    });
    return d.trim() + " Z";
  }

  /* =========================================================================
   * ZONE GEOGRAPHY — reused verbatim from focus/focus.js (grid fractions).
   * ========================================================================= */
  var ZONES = [
    { id: "sw-s-shoulders",    label: "SW–S shoulders", fx: 0.18, fy: 0.82, rx: 0.20, ry: 0.16 },
    { id: "central-grade",     label: "Central grade",  fx: 0.44, fy: 0.50, rx: 0.20, ry: 0.20 },
    { id: "nw-flat",           label: "NW flat",        fx: 0.16, fy: 0.20, rx: 0.16, ry: 0.15 },
    { id: "east-low-compound", label: "East low",       fx: 0.82, fy: 0.55, rx: 0.14, ry: 0.34 }
  ];

  /* =========================================================================
   * AFFINE ZONE REMAP (spec §3.2). The ZONES fx/fy/rx/ry above are fractions of
   * the STATED FIELD BOUNDS (parcel) — they were authored against the old 26×18
   * grid whose extent WAS the parcel. The new 128×98 grid is larger (real
   * surround bleeds past the parcel), so the parcel now occupies only an inner
   * rectangle of the grid. We compute that rectangle ONCE from both bboxes and
   * place zones relative to it, so the geography is unchanged.
   *
   * Grid orientation: gx=0 west(min lon) … gx=nx-1 east; gy=0 north(max lat) …
   * gy=ny-1 south. Converting a parcel corner's lon/lat into new-grid coords:
   *   gx_new = (lon − LON0_new) / (LONspan_new / (nx-1))
   *   gy_new = (LAT0_new − lat) / (LATspan_new / (ny-1))     [LAT0_new = north]
   *
   *   OLD parcel bbox : lat 40.8925–40.9035, lon −93.2065–−93.1875 (26×18)
   *   NEW grid bbox   : lat 40.8870–40.9090, lon −93.2160–−93.1780 (128×98)
   *
   * Parcel rect in NEW grid coords (computed below, checked by verify.js):
   *   x ∈ [31.75, 95.25]  (width 63.50 cells)   y ∈ [24.25, 72.75]  (height 48.50)
   * Radii scale per-axis by the parcel width/height in cells:
   *   rx (parcel-width fraction) · PARCEL_W ,  ry (parcel-height fraction) · PARCEL_H.
   * ========================================================================= */
  // GRID_BBOX / PARCEL_BBOX are the ALLERTON baked defaults. On a live read
  // (setField), GRID_BBOX is REASSIGNED to the read's gridBbox so ALL the
  // projection math (lonToGX/latToGY/gxToLon/gyToLat, view→bounds, structures)
  // works unchanged against the live extent — the functions read the live
  // variable, they don't capture a snapshot. The baked Allerton values are kept
  // in ALLERTON_GRID_BBOX / ALLERTON_PARCEL_BBOX so switching the field chip
  // back restores them exactly.
  var ALLERTON_GRID_BBOX   = { lat: [40.8870, 40.9090], lon: [-93.2160, -93.1780], nx: 128, ny: 98 };
  var ALLERTON_PARCEL_BBOX = { lat: [40.8925, 40.9035], lon: [-93.2065, -93.1875] };
  var GRID_BBOX   = ALLERTON_GRID_BBOX;
  var PARCEL_BBOX = ALLERTON_PARCEL_BBOX;
  // ACTIVE holds what the CURRENT field is: the baked Allerton reading (default)
  // or a live read. renderMap branches on ACTIVE.live for the honest-scope
  // differences (no parcel wash / no zones / no refusal / no plots on a live
  // read; a neutral collection-low region instead). Live reads set
  // ACTIVE.structures to the read's boundaries so buildStructures reads live data.
  var ACTIVE = { live: false, read: null, structures: null, collectionLow: null, reading: null };
  function lonToGX(lon) { return (lon - GRID_BBOX.lon[0]) / ((GRID_BBOX.lon[1] - GRID_BBOX.lon[0]) / (GRID_BBOX.nx - 1)); }
  function latToGY(lat) { return (GRID_BBOX.lat[1] - lat) / ((GRID_BBOX.lat[1] - GRID_BBOX.lat[0]) / (GRID_BBOX.ny - 1)); }
  // INVERSES of lonToGX/latToGY — grid coords → lon/lat. Exact algebraic
  // inverses (same GRID_BBOX cell size), used by the live view-bounds readout
  // to turn the visible SVG rect (→ grid coords) back into decimal degrees.
  function gxToLon(gx) { return GRID_BBOX.lon[0] + gx * ((GRID_BBOX.lon[1] - GRID_BBOX.lon[0]) / (GRID_BBOX.nx - 1)); }
  function gyToLat(gy) { return GRID_BBOX.lat[1] - gy * ((GRID_BBOX.lat[1] - GRID_BBOX.lat[0]) / (GRID_BBOX.ny - 1)); }
  // 4-decimal signed decimal degrees (unit-tested via node export). A leading
  // U+2212 MINUS for negatives (matches the field's coord typography), never a
  // hyphen. e.g. fmtDeg(-93.1875) === "−93.1875".
  function fmtDeg(v) {
    var s = v.toFixed(4);
    return s.charAt(0) === "-" ? "−" + s.slice(1) : s;
  }
  // parcel rect in new-grid coords: x0=west,x1=east ; y0=north(top),y1=south(bottom)
  // Recomputed by recomputeParcel() whenever GRID_BBOX/PARCEL_BBOX change (a live
  // read reassigns GRID_BBOX; PARCEL_BBOX becomes null on a live read since there
  // are no stated field bounds — see setField).
  var PARCEL, PARCEL_W, PARCEL_H;
  function recomputeParcel() {
    if (!PARCEL_BBOX) { PARCEL = null; PARCEL_W = 0; PARCEL_H = 0; return; }
    PARCEL = {
      x0: lonToGX(PARCEL_BBOX.lon[0]), x1: lonToGX(PARCEL_BBOX.lon[1]),
      y0: latToGY(PARCEL_BBOX.lat[1]), y1: latToGY(PARCEL_BBOX.lat[0])
    };
    PARCEL_W = PARCEL.x1 - PARCEL.x0; PARCEL_H = PARCEL.y1 - PARCEL.y0;
  }
  recomputeParcel();
  // a zone's center + radii in NEW-GRID coords (fx/fy are parcel fractions)
  function zoneGrid(z) {
    return {
      gx: PARCEL.x0 + z.fx * PARCEL_W, gy: PARCEL.y0 + z.fy * PARCEL_H,
      grx: z.rx * PARCEL_W,            gry: z.ry * PARCEL_H
    };
  }

  /* =========================================================================
   * STRUCTURAL BOUNDARIES (roads + streams + ponds) — REAL public data, rendered.
   *
   * Data: window.BOUNDARIES (boundaries.js, baked from Census TIGERweb local
   * roads + USGS NHD flowlines + USGS NHD waterbodies). A polyline of [lon,lat]
   * vertices is projected lon/lat → lonToGX/latToGY (SAME grid transform as the
   * DEM) → proj() to SVG. Coordinates extend across the whole ext bbox and
   * beyond — that bleed is intended (real context extends into the surround).
   * No clipping.
   *
   * Roads: solid --road lines; ONE deduped uppercase --ink-2 NAME label per road
   * name, placed at the midpoint of that name's LONGEST segment (screen-constant
   * via fixedNodes). Streams: --water; FCODE 46003 (intermittent) DASHED per USGS
   * convention, 55800 (artificial path) solid but thinner/fainter. One tiny
   * screen-constant "intermittent flowline (NHD)" tag on the 46003 flowline whose
   * first vertex projects nearest the east low (it doesn't clutter — a single tag).
   * Ponds: USGS NHD waterbodies, FCODE 39004 (perennial) closed polygons, solid
   * --water fill+stroke, rendered UNDER the stream lines; no labels (too small/many).
   * ========================================================================= */
  function projLonLat(coord, proj) {
    return proj({ x: lonToGX(coord[0]), y: latToGY(coord[1]) });
  }
  function lonLatPath(coords, proj) {
    var d = "";
    coords.forEach(function (c, i) {
      var q = projLonLat(c, proj);
      d += (i === 0 ? "M" : "L") + q.x.toFixed(2) + " " + q.y.toFixed(2) + " ";
    });
    return d.trim();
  }
  // planar length of a projected polyline (SVG units) — for "longest segment"
  function projLen(coords, proj) {
    var L = 0, prev = null;
    coords.forEach(function (c) {
      var q = projLonLat(c, proj);
      if (prev) { var dx = q.x - prev.x, dy = q.y - prev.y; L += Math.sqrt(dx * dx + dy * dy); }
      prev = q;
    });
    return L;
  }
  function buildStructures(proj, fixedNodes) {
    // Allerton reads the baked window.BOUNDARIES; a live read supplies its own
    // (ACTIVE.structures) shaped identically (roads/streams/waterbodies of
    // {name|fcode, coords:[[lon,lat]...]}), so the SAME render path draws it.
    var B = ACTIVE.live ? ACTIVE.structures : root.BOUNDARIES;
    if (!B) return null;
    var g = svgEl("g", { class: "structures", "data-layer": "structures" });

    // --- ponds first (established water, UNDER stream lines) — NHD Waterbody,
    // all FCODE 39004 (perennial): solid closed fill+stroke, no dasharray (the
    // vocabulary rule — permanence drawn the way we draw certainty). ---
    (B.waterbodies || []).forEach(function (p) {
      if (!p.coords || p.coords.length < 3) return;
      g.appendChild(svgEl("path", { d: lonLatPath(p.coords, proj) + " Z", class: "pond-shape" }));
    });

    // --- building footprints (spec §1) — UNDER roads/streams, small neutral
    // --ink-2 polygons (fill ~0.18, non-scaling 0.75 solid stroke). OCC_CLS
    // "Agriculture" gets a slightly stronger fill (~0.30 via .building-shape--ag)
    // so the ag structures read a touch darker. Tokens only, both themes. FEMA/
    // ORNL footprints are context-grade (ML+parcel-derived, occupancy classed —
    // NOT survey); the same shape drives Allerton (baked) + a live read. ---
    (B.buildings || []).forEach(function (b) {
      if (!b.coords || b.coords.length < 3) return;
      var ag = b.occ != null && String(b.occ).trim().toLowerCase() === "agriculture";
      g.appendChild(svgEl("path", {
        d: lonLatPath(b.coords, proj) + " Z",
        class: "building-shape" + (ag ? " building-shape--ag" : "")
      }));
    });

    // --- streams next (roads paint over them) ---
    (B.streams || []).forEach(function (s) {
      if (!s.coords || s.coords.length < 2) return;
      // NHD flowline treatment keys off FCODE: 46003 intermittent (dashed);
      // 33600–33603 CanalDitch (spec §4) rendered --water thin dash-dot; the rest
      // (artificial path 55800, connectors, perennial) the faint artificial style.
      var fc = Number(s.fcode);
      var isDitch = fc >= 33600 && fc <= 33603;
      var cls = "stream-line " + (fc === 46003 ? "stream-line--intermittent"
        : (isDitch ? "stream-line--ditch" : "stream-line--artificial"));
      g.appendChild(svgEl("path", { d: lonLatPath(s.coords, proj), class: cls, fill: "none" }));
    });
    // one tiny tag on the intermittent (46003) flowline nearest the east low.
    // The east low center in SVG (via the zone remap) is the reference point.
    // Allerton only — a live read has no zones (honest scope), so no tag here.
    var eastZ = (!ACTIVE.live && PARCEL) ? ZONES.filter(function (z) { return z.id === "east-low-compound"; })[0] : null;
    if (eastZ) {
      var ezg = zoneGrid(eastZ);
      var eastPt = proj({ x: ezg.gx, y: ezg.gy });
      var best = null, bestD = Infinity;
      (B.streams || []).forEach(function (s) {
        if (s.fcode !== 46003 || !s.coords || s.coords.length < 2) return;
        var q = projLonLat(s.coords[0], proj);
        var dx = q.x - eastPt.x, dy = q.y - eastPt.y, d2 = dx * dx + dy * dy;
        if (d2 < bestD) { bestD = d2; best = s; }
      });
      if (best) {
        var mid = projLonLat(best.coords[Math.floor(best.coords.length / 2)], proj);
        var tag = svgEl("text", { x: mid.x.toFixed(1), y: mid.y.toFixed(1), class: "stream-tag" });
        fixedNodes.push({ el: tag, ax: mid.x, ay: mid.y });
        tag.textContent = "intermittent flowline (NHD)";
        g.appendChild(tag);
      }
    }

    // --- roads on top ---
    // group features by NAME so a name repeated across features draws all its
    // segments but is labeled ONCE (dedupe), at its single longest segment mid.
    var byName = {};   // name -> { features:[coords...], longest:{coords,len} }
    (B.roads || []).forEach(function (r) {
      if (!r.coords || r.coords.length < 2) return;
      g.appendChild(svgEl("path", { d: lonLatPath(r.coords, proj), class: "road-line", fill: "none" }));
      if (!r.name) return; // unnamed roads draw but are never labeled
      var len = projLen(r.coords, proj);
      var e = byName[r.name];
      if (!e) { byName[r.name] = { longest: { coords: r.coords, len: len } }; }
      else if (len > e.longest.len) { e.longest = { coords: r.coords, len: len }; }
    });
    // ONE label per distinct road NAME, at the midpoint of its longest segment
    Object.keys(byName).forEach(function (name) {
      var seg = byName[name].longest.coords;
      var mid = projLonLat(seg[Math.floor(seg.length / 2)], proj);
      var t = svgEl("text", { x: mid.x.toFixed(1), y: mid.y.toFixed(1), class: "road-label" });
      fixedNodes.push({ el: t, ax: mid.x, ay: mid.y });
      t.textContent = name.toUpperCase();
      g.appendChild(t);
    });
    return g;
  }

  /* =========================================================================
   * SPECULATIVE PLANTING PLOTS (spec §5) — the HONEST speculative layer.
   *
   * Derivation is REAL-DATA-ONLY and takes the DEM grid as input. We look at
   * ONLY the parcel interior (the stated field bounds, in grid coords) and split
   * it into three management classes by ELEVATION TERCILES of the parcel's OWN
   * range:
   *   · upland   — upper third   (well-drained shoulders / Gara)
   *   · transitional — middle third (the conveying grade)
   *   · low ground — lower third (bottom band + the east collection low)
   * The east-low collection area lands in the low class by elevation, as it
   * should. Two thresholds (t1 = low|mid, t2 = mid|up) are the tercile cut
   * elevations; the class boundaries are traced with the SAME marching-squares
   * used for contours, at t1 and t2, and CLIPPED to the parcel rect at render.
   *
   * NO numbers of any kind live here — no seed rates, yields, or acres. The
   * class is a NAME only. This is a preview of a layer that would become real
   * only when planter / yield / seed data are connected. Default OFF.
   * ========================================================================= */
  function parcelInteriorStats(grid, P) {
    var vals = [];
    var x0 = Math.ceil(P.x0), x1 = Math.floor(P.x1);
    var y0 = Math.ceil(P.y0), y1 = Math.floor(P.y1);
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) vals.push(grid[y][x]);
    }
    vals.sort(function (a, b) { return a - b; });
    var n = vals.length;
    var t1 = vals[Math.floor(n / 3)], t2 = vals[Math.floor(2 * n / 3)];
    var low = 0, mid = 0, up = 0;
    vals.forEach(function (v) { if (v < t1) low++; else if (v < t2) mid++; else up++; });
    return { min: vals[0], max: vals[n - 1], t1: t1, t2: t2, n: n, counts: { low: low, mid: mid, up: up } };
  }
  // Build the three plot classes. Each is a set of marching-squares polylines at
  // its bounding threshold(s); the fill regions are formed by even-odd stacking
  // the ">= level" fill layers (same construction as the hypsometric bands) and
  // painting: low = everything, transitional = >= t1 over it, upland = >= t2 on
  // top — so each visible class shows its own band. The class labels are placed
  // at the centroid of the parcel cells in that band.
  function buildPlots(grid, P) {
    var s = parcelInteriorStats(grid, P);
    // fill layers (cell polygons) at the two thresholds, from the WHOLE grid;
    // rendering clips them to the parcel rect via a clipPath.
    var fillMid = buildFillLayer(grid, s.t1); // >= t1  (transitional + upland)
    var fillUp  = buildFillLayer(grid, s.t2); // >= t2  (upland)
    // label anchors: centroid (grid coords) of parcel cells in each class
    function centroid(pred) {
      var sx = 0, sy = 0, k = 0;
      var x0 = Math.ceil(P.x0), x1 = Math.floor(P.x1);
      var y0 = Math.ceil(P.y0), y1 = Math.floor(P.y1);
      for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
        if (pred(grid[y][x])) { sx += x; sy += y; k++; }
      }
      return k ? { x: sx / k, y: sy / k } : { x: (P.x0 + P.x1) / 2, y: (P.y0 + P.y1) / 2 };
    }
    return {
      stats: s,
      classes: [
        { id: "low",   name: "low ground — drainage-first / buffer candidate", anchor: centroid(function (v) { return v < s.t1; }) },
        { id: "mid",   name: "transitional — row crop / cover",                 anchor: centroid(function (v) { return v >= s.t1 && v < s.t2; }) },
        { id: "upland", name: "upland — row crop candidate",                    anchor: centroid(function (v) { return v >= s.t2; }) }
      ],
      // the three painted regions (cell polygons), lowest → highest:
      //   base (all interior) → >=t1 → >=t2, each a distinct neutral tint.
      fillMid: fillMid,
      fillUp: fillUp
    };
  }

  var W = 1000, H = 720, PAD = 40;

  function reduced() {
    return root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /* =========================================================================
   * RENDER THE MAP into #focus-map. Light R2 world.
   * ========================================================================= */
  // Read a token straight off the live cascade (getComputedStyle on the root),
  // so the map always re-tints from whatever theme is active — light values,
  // dark values, or any future override — never a value baked into the JS.
  function readTerrainTokens() {
    var cs = getComputedStyle(document.documentElement);
    return {
      low: cs.getPropertyValue("--terrain-low").trim(),
      high: cs.getPropertyValue("--terrain-high").trim()
    };
  }

  function renderMap(mount, bands, contours, nx, ny, gridForPlots) {
    var proj = makeProjector(nx, ny, W, H, PAD);
    var terrain = readTerrainTokens();
    var TERRAIN_LOW = terrain.low, TERRAIN_HIGH = terrain.high; // live --terrain-low/high

    var svg = svgEl("svg", {
      viewBox: "0 0 " + W + " " + H,
      class: "fieldmap",
      role: "img",
      "aria-label": ACTIVE.live
        ? "Computed-reading map of a live-read location from public data: warm cream-to-sage hypsometric tint bands between thin smoothed contour lines, real roads and streams, dotted-dash outlines marking the computed compound zones (drainage class by elevation band), and amber hatched bands marking held-open flags where the public data disagree. Edges by geometry, priorities by printed rules, conflicts held open."
        : "Light hypsometric contour map of the Allerton parcel and its real surrounding terrain, from the USGS elevation grid sampled about 25 m: warm cream-to-sage tint bands between thin smoothed contour lines, brighter labeled index lines every 25 ft, a thin solid rectangle marking the stated field bounds, terrain beyond that boundary shown muted, four dashed approximate soil-zone outlines, and a soft amber hatched band over the east low marking a drainage boundary the public data cannot place.",
      preserveAspectRatio: "xMidYMid slice"
    });

    // <defs>: flat diagonal hatch for the refusal band (the cartographic mark
    // for an uncertain area). Deliberately NO blur / NO gradient — the flat
    // graphic language is the R2 style; the dashed edge (our established
    // "approximate" vocabulary) keeps it a held-open band, not a crisp claim.
    var defs = svgEl("defs");
    var hatch = svgEl("pattern", { id: "refusal-hatch", width: 12, height: 12, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
    hatch.appendChild(svgEl("rect", { width: 12, height: 12, fill: "transparent" }));
    hatch.appendChild(svgEl("line", { x1: 0, y1: 0, x2: 0, y2: 12, stroke: "var(--accent)", "stroke-width": 2, "stroke-opacity": 0.5 }));
    defs.appendChild(hatch);
    svg.appendChild(defs);

    // base canvas (lowest terrain) — retintMap() rewrites this fill on theme change
    svg.appendChild(svgEl("rect", { x: 0, y: 0, width: W, height: H, fill: TERRAIN_LOW, class: "terrain-base-rect" }));

    // the pannable group (map pans/zooms; the <svg> itself never moves)
    var pan = svgEl("g", { class: "pan" });
    var fixedNodes = [];  // {el, ax, ay} — labels counter-scaled in applyView
    svg.appendChild(pan);

    // ---- SURROUND CONTEXT TERRAIN (spec-surround-context-v1). A live read that
    // carries read.surround gets hypsometric bands + contours over the coarse
    // (3× core spacing, v1.1) EXT grid — drawn the SAME way Allerton's baked ext path is
    // (buildBands / buildContours / Chaikin+Catmull-Rom smoothing, same terrain
    // tokens), BENEATH everything the core canvas draws. The ext grid is real
    // fetched context (ring) + the core downsampled (interior); it never feeds
    // the engine. Its projector maps ext-grid coords → lon/lat → CORE grid coords
    // (lonToGX/latToGY, relative to the live GRID_BBOX = core) → proj(), so the
    // core sub-region lands exactly under the core canvas and the surround bleeds
    // outward. The mute-wash outer rect grows to this ext canvas below.
    var surround = ACTIVE.live && ACTIVE.read ? ACTIVE.read.surround : null;
    var surroundExtRect = null; // {x,y,w,h} in SVG — the wash grows to this
    if (surround && surround.grid && surround.bbox) {
      var sBbox = surround.bbox, sGrid = surround.grid;
      var sNx = sBbox.nx || sGrid[0].length, sNy = sBbox.ny || sGrid.length;
      // ext-grid coord (ex,ey) → lon/lat (row 0 = NORTH) → core-grid → proj()
      function surroundProj(pt) {
        var lon = sBbox.lon[0] + (pt.x / (sNx - 1)) * (sBbox.lon[1] - sBbox.lon[0]);
        var lat = sBbox.lat[1] - (pt.y / (sNy - 1)) * (sBbox.lat[1] - sBbox.lat[0]);
        return proj({ x: lonToGX(lon), y: latToGY(lat) });
      }
      // the ext canvas rectangle (ext-grid corners projected) — the wash outer
      var eTL = surroundProj({ x: 0, y: 0 }), eBR = surroundProj({ x: sNx - 1, y: sNy - 1 });
      surroundExtRect = { x: eTL.x, y: eTL.y, w: eBR.x - eTL.x, h: eBR.y - eTL.y };
      // SAME interval/index as the live core render (setField: interval 10 / 50)
      var sBands = buildBands(sGrid, 10);
      var sContours = buildContours(sGrid, 10, 50);
      var surroundLayer = svgEl("g", { class: "surround-layer", "data-layer": "surround-terrain" });
      // bands (reuse the core tint lerp + tokens; t normalized over the ext grid,
      // which spans the whole visible terrain — the honest full range)
      var sBandLayer = svgEl("g", { class: "surround-band-layer" });
      sBands.forEach(function (b) {
        var fill = lerpHex(TERRAIN_LOW, TERRAIN_HIGH, b.t);
        var d = "";
        b.polys.forEach(function (poly) { d += polyPath(poly, surroundProj) + " "; });
        if (!d.trim()) return;
        sBandLayer.appendChild(svgEl("path", { d: d.trim(), fill: fill, stroke: "none", "fill-rule": "nonzero", class: "band surround-band", "data-t": b.t.toFixed(4) }));
      });
      surroundLayer.appendChild(sBandLayer);
      // contours (the SAME two bounded Chaikin passes then Catmull-Rom — no
      // fabricated detail; the coarse grid's contours are drawn as-is)
      var sContourLayer = svgEl("g", { class: "surround-contour-layer" });
      sContours.forEach(function (c) {
        c.paths.forEach(function (pts) {
          if (pts.length < 2) return;
          var sm = chaikinSmooth(pts, 2);
          var d = catmullRomPath(sm, surroundProj, false);
          sContourLayer.appendChild(svgEl("path", { d: d, class: "contour surround-contour" + (c.index ? " contour-index" : ""), fill: "none" }));
        });
      });
      surroundLayer.appendChild(sContourLayer);
      pan.appendChild(surroundLayer);
    }

    // ---- HYPSOMETRIC TINT BANDS: filled level sets, low→high (cream→sage in
    // light; retinted per-theme by retintMap()). Each band path carries its own
    // `t` (0..1, low→high) in data-t so retintMap() can recompute its fill from
    // whatever --terrain-low/--terrain-high are live right now — the geometry
    // (the polygons) never changes, only the color lerp.
    var bandLayer = svgEl("g", { class: "band-layer", "data-layer": "terrain" });
    bands.forEach(function (b) {
      var fill = lerpHex(TERRAIN_LOW, TERRAIN_HIGH, b.t);
      var d = "";
      b.polys.forEach(function (poly) { d += polyPath(poly, proj) + " "; });
      if (!d.trim()) return;
      bandLayer.appendChild(svgEl("path", { d: d.trim(), fill: fill, stroke: "none", "fill-rule": "nonzero", class: "band", "data-t": b.t.toFixed(4) }));
    });
    pan.appendChild(bandLayer);

    // ---- contours: SMOOTH Catmull-Rom; thin --contour; index brighter+labeled --
    // Contour LINES and elevation LABELS live in SEPARATE toggleable groups
    // (spec §4: elevation labels are their own data-layer).
    var contourLayer = svgEl("g", { class: "contour-layer", "data-layer": "contours" });
    var elevLabelLayer = svgEl("g", { class: "elev-label-layer", "data-layer": "elevation-labels" });
    var animOrder = 0;
    contours.forEach(function (c) {
      // label an index level sparsely: only its 2 longest paths (real topo
      // practice) — labeling every fragment at 5 ft spacing reads as clutter.
      var labelIdx = {};
      if (c.index) {
        c.paths.map(function (pp, pi) { return { pi: pi, n: pp.length }; })
          .sort(function (a, b) { return b.n - a.n; })
          .slice(0, 2)
          .forEach(function (e) { if (e.n >= 12) labelIdx[e.pi] = true; });
      }
      c.paths.forEach(function (pts, pi) {
        if (pts.length < 2) return;
        // two bounded Chaikin passes THEN Catmull-Rom — both stroke-only, no
        // new terrain detail (the rounded curve stays inside the real corners).
        var sm = chaikinSmooth(pts, 2);
        var d = catmullRomPath(sm, proj, false);
        var p = svgEl("path", { d: d, class: "contour" + (c.index ? " contour-index" : ""), fill: "none" });
        p.style.setProperty("--draw-delay", (0.012 * animOrder).toFixed(3) + "s");
        animOrder++;
        contourLayer.appendChild(p);
        if (c.index && labelIdx[pi]) {
          var mid = proj(pts[Math.floor(pts.length / 2)]);
          var t = svgEl("text", { x: mid.x.toFixed(1), y: mid.y.toFixed(1), class: "contour-label" });
          fixedNodes.push({ el: t, ax: mid.x, ay: mid.y });
          t.textContent = c.level;
          elevLabelLayer.appendChild(t);
        }
      });
    });
    pan.appendChild(contourLayer);
    pan.appendChild(elevLabelLayer);

    // ---- STRUCTURAL BOUNDARIES (roads + streams + ponds) — REAL public context data.
    // Census TIGER local roads + USGS NHD flowlines + USGS NHD waterbodies,
    // projected lon/lat → lonToGX/latToGY grid coords → proj() to SVG. Rendered
    // here (above contours, BELOW the surround mute wash) so surround roads/
    // streams/ponds are muted with the surround terrain and bleed across the
    // full ext bbox. Default ON — real
    // structural context, not speculation. Context-grade accuracy (stated in
    // the caption + Layers row): TIGER ±~10 m; NHD large-scale, partly DEM-derived.
    var structuresLayer = buildStructures(proj, fixedNodes);
    if (structuresLayer) pan.appendChild(structuresLayer);

    // grid corners of the parcel rect, projected to SVG (top-left / bottom-right).
    // The parcel exists in TWO cases now: Allerton (baked bounds) and a SAVED
    // FIELD WITH STATED BOUNDS (spec-saved-fields-v1 §2 — PARCEL is set from the
    // field's bounds in setField). When there is NO parcel (an unbounded live
    // read / unsaved read — honest scope), the rect degenerates to the FULL grid
    // canvas so default framing fits the whole read extent and no wash/boundary
    // draws. Framing follows the PARCEL whenever it exists, live or not.
    var pTL, pBR, pRX, pRY, pRW, pRH;
    if (!PARCEL) {
      pRX = PAD; pRY = PAD; pRW = W - 2 * PAD; pRH = H - 2 * PAD;
    } else {
      pTL = proj({ x: PARCEL.x0, y: PARCEL.y0 });
      pBR = proj({ x: PARCEL.x1, y: PARCEL.y1 });
      pRX = pTL.x; pRY = pTL.y; pRW = pBR.x - pTL.x; pRH = pBR.y - pTL.y;
    }

    // ---- STATED-BOUNDS RENDER (spec-saved-fields-v1 §2, DESIGN LAW). A saved
    // field with bounds is a LIVE read that ALSO has a PARCEL — draw the SAME
    // outside-mute wash + solid hairline boundary as Allerton, so a stated claim
    // looks identical whether the field is the worked example or the farmer's
    // own. (Allerton draws these in the !ACTIVE.live branch below; here we draw
    // the SAME two elements for the bounded live read, above the computed zones.)
    // Unbounded live reads have no PARCEL → this block is skipped (no wash).
    if (ACTIVE.live && PARCEL) {
      var boundedWash = svgEl("g", { class: "wash-layer", "data-layer": "surround" });
      // the wash outer rect GROWS to the EXTENDED canvas when surround terrain
      // exists (so the mute covers bounds→ext exactly as it covers Allerton's
      // baked surround); the CORE canvas (0,0,W,H) when there is no surround.
      var wR = surroundExtRect || { x: 0, y: 0, w: W, h: H };
      var bOuter = "M" + wR.x.toFixed(2) + " " + wR.y.toFixed(2) +
                   " H" + (wR.x + wR.w).toFixed(2) + " V" + (wR.y + wR.h).toFixed(2) +
                   " H" + wR.x.toFixed(2) + " Z";
      var bInner = "M" + pRX.toFixed(2) + " " + pRY.toFixed(2) +
                   " H" + (pRX + pRW).toFixed(2) + " V" + (pRY + pRH).toFixed(2) +
                   " H" + pRX.toFixed(2) + " Z";
      boundedWash.appendChild(svgEl("path", { d: bOuter + " " + bInner, "fill-rule": "evenodd",
        class: "outside-wash", fill: "var(--terrain-low)", "fill-opacity": 0.55, stroke: "none" }));
      pan.appendChild(boundedWash);
      var boundedBoundary = svgEl("g", { class: "boundary-layer", "data-layer": "parcel" });
      boundedBoundary.appendChild(svgEl("rect", { x: pRX.toFixed(2), y: pRY.toFixed(2),
        width: pRW.toFixed(2), height: pRH.toFixed(2), class: "parcel-boundary",
        fill: "none", stroke: "var(--contour-index)", "stroke-width": 1, "stroke-opacity": 0.7 }));
      pan.appendChild(boundedBoundary);
    }

    if (ACTIVE.live) {
      // ---- LIVE READ v2: the COMPUTED BOUNDARY LOOP rendered (spec §4/§5). The
      // engine's compound zones are traced (component-mask marching squares →
      // grid-coord rings) and drawn as DOTTED-DASH outlines — deliberately
      // DISTINCT from Allerton's dashed ellipses — each with a screen-constant
      // fact-label. Held-open flags reuse the EXACT established refusal treatment
      // (flat amber hatch + dashed edge + ⟨?⟩). The collection-low candidate
      // still shows as a neutral dashed region beneath the computed zones.
      var reading = ACTIVE.reading;

      // collection-low neutral region (unchanged neutral treatment, kept below zones)
      var cl = ACTIVE.collectionLow;
      if (cl && cl.cells && cl.cells.length) {
        var clLayer = svgEl("g", { class: "collow-layer", "data-layer": "collection-low" });
        var minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
        cl.cells.forEach(function (c) {
          if (c[0] < minx) minx = c[0]; if (c[0] > maxx) maxx = c[0];
          if (c[1] < miny) miny = c[1]; if (c[1] > maxy) maxy = c[1];
        });
        var a = proj({ x: minx, y: miny }), b = proj({ x: maxx, y: maxy });
        var ccx = (a.x + b.x) / 2, ccy = (a.y + b.y) / 2;
        var crx = Math.max(14, (b.x - a.x) / 2 + 6), cry = Math.max(12, (b.y - a.y) / 2 + 6);
        var reg = svgEl("g", { class: "collow-region", "data-flag": "collection-low", role: "img",
          "aria-label": "Collection-low candidate — the lowest connected decile of sampled cells. A computed flag, not a judgment." });
        reg.appendChild(svgEl("ellipse", { cx: ccx.toFixed(1), cy: ccy.toFixed(1), rx: crx.toFixed(1), ry: cry.toFixed(1),
          class: "collow-outline", fill: "none" }));
        clLayer.appendChild(reg);
        pan.appendChild(clLayer);
      }

      // ---- COMPUTED ZONES: traced component boundaries, dotted-dash, fact-label
      if (reading && reading.zones && reading.zones.length) {
        var czLayer = svgEl("g", { class: "cz-layer", "data-layer": "computed-zones" });
        var czShorts = czShortLabelMap(reading.zones); // collision-aware short labels
        reading.zones.forEach(function (z) {
          var g = svgEl("g", { class: "cz-region", "data-zone": z.id, tabindex: 0, role: "button",
            "aria-label": z.label + " — computed zone; " + z.rule.chip + " (rule " + z.rule.id + "). Activate to focus." });
          // trace each ring: Chaikin (2 passes) then Catmull-Rom, CLOSED — the
          // SAME smoothing the contour engine uses, so no fabricated detail.
          (z.rings || []).forEach(function (ring) {
            if (ring.length < 3) return;
            var closed = ring.length > 3;
            var sm = chaikinSmooth(ring, 2);
            var d = catmullRomPath(sm, proj, closed) + (closed ? " Z" : "");
            g.appendChild(svgEl("path", { d: d, class: "cz-outline", fill: "none" }));
          });
          // fact-label at the zone centroid (screen-constant)
          var cg = proj({ x: z.centroidGrid.x, y: z.centroidGrid.y });
          var lbl = svgEl("text", { x: cg.x.toFixed(1), y: cg.y.toFixed(1), class: "cz-label" });
          fixedNodes.push({ el: lbl, ax: cg.x, ay: cg.y });
          lbl.textContent = z.factLabelShort || czShorts[z.id];
          g.appendChild(lbl);
          czLayer.appendChild(g);
        });
        pan.appendChild(czLayer);
      }

      // ---- HELD-OPEN FLAGS: EXACTLY the refusal treatment (flat amber hatch +
      // dashed edge + ⟨?⟩). Each flag with a cell region becomes a hatched band.
      if (reading && reading.flags && reading.flags.length) {
        var flagLayer = svgEl("g", { class: "flag-layer", "data-layer": "held-open-flags" });
        reading.flags.forEach(function (fl, fi) {
          if (!fl.cells || !fl.cells.length) return; // F3 (degraded) has no region
          var fminx = Infinity, fmaxx = -Infinity, fminy = Infinity, fmaxy = -Infinity;
          fl.cells.forEach(function (c) {
            if (c[0] < fminx) fminx = c[0]; if (c[0] > fmaxx) fmaxx = c[0];
            if (c[1] < fminy) fminy = c[1]; if (c[1] > fmaxy) fmaxy = c[1];
          });
          var fa = proj({ x: fminx, y: fminy }), fb = proj({ x: fmaxx, y: fmaxy });
          var fcx = (fa.x + fb.x) / 2, fcy = (fa.y + fb.y) / 2;
          var frx = Math.max(16, (fb.x - fa.x) / 2 + 8), fry = Math.max(14, (fb.y - fa.y) / 2 + 8);
          // data-flag carries the INSTANCE uid (F1/F2a/F2b…) so the popover +
          // cross-highlight resolve to THIS pond, not the first of its rule. The
          // visible aria-label keeps the rule id (chip vocabulary is LAW); for an
          // F2 with a location, the located fact is appended to the label.
          var flAria = "Held-open flag " + fl.id + " — the public data cannot decide. Activate to read what disagrees.";
          if (fl.where) flAria += " Pond ≈ " + fl.where.octant + " of the read center · " +
            AGRIOS_FOCUS_R2.fmtDeg(fl.where.lat) + ", " + AGRIOS_FOCUS_R2.fmtDeg(fl.where.lon) + ".";
          var fg = svgEl("g", { class: "flag-band", "data-flag": fl.uid, role: "button", tabindex: 0,
            "aria-label": flAria });
          // flat amber hatch fill + dashed edge (the EXACT refusal marks)
          fg.appendChild(svgEl("ellipse", { cx: fcx.toFixed(1), cy: fcy.toFixed(1), rx: frx.toFixed(1), ry: fry.toFixed(1),
            class: "flag-fill", fill: "url(#refusal-hatch)", stroke: "var(--accent)", "stroke-dasharray": "5 6", "stroke-width": 1.4, "stroke-opacity": 0.8 }));
          // the ⟨?⟩ mark chip (same as the refusal)
          var qY = fcy - fry - 16;
          var qchip = svgEl("g", { class: "flag-chip" });
          fixedNodes.push({ el: qchip, ax: fcx, ay: qY });
          qchip.appendChild(svgEl("rect", { x: (fcx - 20).toFixed(1), y: (qY - 14).toFixed(1), width: 40, height: 26, rx: 13, class: "refusal-chip-bg" }));
          var qm = svgEl("text", { x: fcx.toFixed(1), y: (qY + 4).toFixed(1), class: "refusal-mark" });
          qm.textContent = "⟨?⟩";
          qchip.appendChild(qm);
          fg.appendChild(qchip);
          flagLayer.appendChild(fg);
        });
        pan.appendChild(flagLayer);
      }

      mount.appendChild(svg);
    } else {

    // ---- OUTSIDE MUTE WASH (spec §3.3): one even-odd path (full canvas minus
    // the parcel rect) filled with the canvas tone at ~0.55 opacity. Laid OVER
    // terrain + contours but UNDER zones / refusal / labels — so the real
    // surround stays visible yet clearly secondary to the scanned parcel.
    var washLayer = svgEl("g", { class: "wash-layer", "data-layer": "surround" });
    var outer = "M0 0 H" + W + " V" + H + " H0 Z";
    var innerRect = "M" + pRX.toFixed(2) + " " + pRY.toFixed(2) +
                    " H" + (pRX + pRW).toFixed(2) + " V" + (pRY + pRH).toFixed(2) +
                    " H" + pRX.toFixed(2) + " Z";
    washLayer.appendChild(svgEl("path", { d: outer + " " + innerRect, "fill-rule": "evenodd",
      class: "outside-wash", fill: "var(--terrain-low)", "fill-opacity": 0.55, stroke: "none" }));
    pan.appendChild(washLayer);

    // ---- PARCEL BOUNDARY (spec §3.3): a thin SOLID hairline. It is a STATED
    // bound (the scan extent), not sensed data — solid is honest here, distinct
    // from the dashed "approximate" vocabulary reserved for sensed edges.
    var boundaryLayer = svgEl("g", { class: "boundary-layer", "data-layer": "parcel" });
    boundaryLayer.appendChild(svgEl("rect", { x: pRX.toFixed(2), y: pRY.toFixed(2),
      width: pRW.toFixed(2), height: pRH.toFixed(2), class: "parcel-boundary",
      fill: "none", stroke: "var(--contour-index)", "stroke-width": 1, "stroke-opacity": 0.7 }));
    pan.appendChild(boundaryLayer);

    // ---- zone regions: DASHED --ink-2 approximate outlines (±40 m SSURGO).
    // Placed via the parcel-relative affine remap (zoneGrid) → projector, so the
    // geography is unchanged from the old grid despite the larger extent.
    var zoneLayer = svgEl("g", { class: "zone-layer", "data-layer": "zones" });
    ZONES.forEach(function (z) {
      if (z.id === "east-low-compound") return; // east low = the hatched refusal band
      var zg = zoneGrid(z);
      var c = proj({ x: zg.gx, y: zg.gy });
      var e = proj({ x: zg.gx + zg.grx, y: zg.gy + zg.gry });
      var cx = c.x, cy = c.y, rx = e.x - c.x, ry = e.y - c.y;
      var g = svgEl("g", { class: "zone-region", "data-zone": z.id, tabindex: 0, role: "button",
        "aria-label": z.label + " — approximate placement (soil boundary ±40 m). Activate to focus." });
      g.appendChild(svgEl("ellipse", { cx: cx, cy: cy, rx: rx, ry: ry, class: "zone-outline" }));
      var lbl = svgEl("text", { x: cx, y: cy, class: "zone-label" });
      fixedNodes.push({ el: lbl, ax: cx, ay: cy });
      lbl.textContent = z.label;
      g.appendChild(lbl);
      zoneLayer.appendChild(g);
    });
    pan.appendChild(zoneLayer);

    // ---- SPECULATIVE PLANTING PLOTS (spec §5): draft-dotted, neutral fills,
    // class NAMES only, NO numbers. Derived from the DEM terciles of the parcel
    // interior; clipped to the parcel rect. DEFAULT OFF (display:none). Appended
    // BELOW the refusal layer so the refusal (the question mark) outranks the
    // speculation when both are on.
    var plots = buildPlots(gridForPlots, PARCEL);
    var plotsLayer = svgEl("g", { class: "plots-layer", "data-layer": "plots" });
    plotsLayer.style.display = "none"; // default OFF
    // clipPath: the parcel rect, so plot fills never spill past the field bounds
    var clipId = "plots-clip";
    var clip = svgEl("clipPath", { id: clipId });
    clip.appendChild(svgEl("rect", { x: pRX.toFixed(2), y: pRY.toFixed(2), width: pRW.toFixed(2), height: pRH.toFixed(2) }));
    defs.appendChild(clip);
    var plotsClipped = svgEl("g", { "clip-path": "url(#" + clipId + ")" });
    // paint low→high: base neutral over the whole parcel, then >=t1, then >=t2.
    // Each is a very light ink-2 tint; dotted non-scaling outlines read as DRAFT.
    function plotFillPath(polys) { var d = ""; polys.forEach(function (poly) { d += polyPath(poly, proj) + " "; }); return d.trim(); }
    // base (low ground): fill the whole parcel rect at the lowest tint
    plotsClipped.appendChild(svgEl("rect", { x: pRX.toFixed(2), y: pRY.toFixed(2), width: pRW.toFixed(2), height: pRH.toFixed(2),
      class: "plot-fill plot-fill--low", "data-plot": "low" }));
    plotsClipped.appendChild(svgEl("path", { d: plotFillPath(plots.fillMid), class: "plot-fill plot-fill--mid", "fill-rule": "nonzero", "data-plot": "mid" }));
    plotsClipped.appendChild(svgEl("path", { d: plotFillPath(plots.fillUp), class: "plot-fill plot-fill--upland", "fill-rule": "nonzero", "data-plot": "upland" }));
    // dotted class-boundary outlines at the two thresholds (clipped), draft dashes
    [plots.stats.t1, plots.stats.t2].forEach(function (lvl) {
      stitch(marchingSquares(gridForPlots, lvl)).forEach(function (pts) {
        if (pts.length < 2) return;
        plotsClipped.appendChild(svgEl("path", { d: catmullRomPath(chaikinSmooth(pts, 2), proj, false), class: "plot-edge", fill: "none" }));
      });
    });
    plotsLayer.appendChild(plotsClipped);
    // class-name labels (screen-constant, fixedNodes) — NAMES only, no numbers
    plots.classes.forEach(function (cls) {
      var a = proj(cls.anchor);
      var t = svgEl("text", { x: a.x.toFixed(1), y: a.y.toFixed(1), class: "plot-label" });
      fixedNodes.push({ el: t, ax: a.x, ay: a.y });
      t.textContent = cls.name;
      plotsLayer.appendChild(t);
    });
    // one screen-constant SPECULATIVE corner tag (top-left of the parcel rect)
    var specTag = svgEl("g", { class: "plot-spec-tag" });
    var specX = pRX + 6, specY = pRY + 6;
    fixedNodes.push({ el: specTag, ax: specX, ay: specY });
    specTag.appendChild(svgEl("rect", { x: specX.toFixed(1), y: specY.toFixed(1), width: 86, height: 18, rx: 4, class: "plot-spec-bg" }));
    var specTxt = svgEl("text", { x: (specX + 43).toFixed(1), y: (specY + 13).toFixed(1), class: "plot-spec-text" });
    specTxt.textContent = "SPECULATIVE";
    specTag.appendChild(specTxt);
    plotsLayer.appendChild(specTag);
    pan.appendChild(plotsLayer);

    // ---- THE REFUSAL: amber hatched + radially-faded + blurred FUZZY BAND ----
    var refusalLayer = svgEl("g", { class: "refusal-layer", "data-layer": "refusal" });
    var east = ZONES.filter(function (z) { return z.id === "east-low-compound"; })[0];
    var eg = zoneGrid(east);
    var ec = proj({ x: eg.gx, y: eg.gy });
    var ee = proj({ x: eg.gx + eg.grx, y: eg.gy + eg.gry });
    var ecx = ec.x, ecy = ec.y, erx = ee.x - ec.x, ery = ee.y - ec.y;
    var refusal = svgEl("g", { class: "refusal-band", "data-zone": "east-low-compound", tabindex: 0, role: "button",
      "aria-label": "East low drainage transition — a boundary the public data cannot place. Shown as a flat amber diagonal-hatched band with a dashed edge, not a line. Activate to focus." });
    refusal.appendChild(svgEl("ellipse", { cx: ecx, cy: ecy, rx: erx, ry: ery,
      fill: "url(#refusal-hatch)", class: "refusal-fill",
      stroke: "var(--accent)", "stroke-width": 1.5, "stroke-dasharray": "5 6", "stroke-opacity": 0.7 }));
    // the ⟨?⟩ chip — a small rounded amber-tint pill, not a pin
    var chipY = (ecy - ery - 20);
    var chip = svgEl("g", { class: "refusal-chip" });
    fixedNodes.push({ el: chip, ax: ecx, ay: chipY });
    chip.appendChild(svgEl("rect", { x: (ecx - 20).toFixed(1), y: (chipY - 14).toFixed(1), width: 40, height: 26, rx: 13, class: "refusal-chip-bg" }));
    var q = svgEl("text", { x: ecx.toFixed(1), y: (chipY + 4).toFixed(1), class: "refusal-mark" });
    q.textContent = "⟨?⟩";
    chip.appendChild(q);
    refusal.appendChild(chip);
    var rl = svgEl("text", { x: ecx.toFixed(1), y: (ecy + ery + 26).toFixed(1), class: "refusal-band-label" });
    fixedNodes.push({ el: rl, ax: ecx, ay: (ecy + ery + 26) });
    rl.textContent = "unplaceable";
    refusal.appendChild(rl);
    refusalLayer.appendChild(refusal);
    pan.appendChild(refusalLayer);

    mount.appendChild(svg);
    } // end !ACTIVE.live (Allerton parcel wash / boundary / zones / plots / refusal)

    /* fixed-size (screen-constant) label registry — filled at creation */
    // (declared earlier, populated by the creation sites below)
    /* --- pan/zoom controller: transform the .pan group to a zone ---------- */
    // Default framing = the PARCEL rect (spec §3.5): fit the parcel to the
    // viewport so the surround terrain BLEEDS past the field edges instead of
    // ending in blank page. Zone framing is a tighter zoom on that same basis.
    var pCx = (pRX + pRW / 2), pCy = (pRY + pRH / 2);
    // CONTAIN the whole parcel in the *element's* visible area. The SVG renders
    // with preserveAspectRatio "slice" (cover), so the visible viewBox region is
    // smaller than W×H — fitting against W/H alone crops the parcel. Compute the
    // slice factor from the mounted element's real box, then contain + margin.
    function computeParcelZoom() {
      var r = mount.getBoundingClientRect();
      var s = Math.max(r.width / W, r.height / H) || 1;   // slice (cover) factor
      var visW = (r.width || W) / s, visH = (r.height || H) / s;
      return Math.min(visW / pRW, visH / pRH) * 0.92;      // whole parcel + margin
    }
    var parcelView = { cx: pCx, cy: pCy, zoom: computeParcelZoom() };
    var current = null;

    /* ---- VIEW STATE (spec §2): one object {cx,cy,zoom,manual} is the single
     * source of truth; applyView is the single writer of the .pan transform +
     * the fixedNodes counter-scale. `manual` = true after wheel/drag/pinch
     * ("free until the narrative moves"); any zone activation or recenter
     * clears it. ---------------------------------------------------------- */
    var view = { cx: pCx, cy: pCy, zoom: parcelView.zoom, manual: false };

    function zoneCenter(id) {
      var z = ZONES.filter(function (zz) { return zz.id === id; })[0];
      if (!z) return { cx: parcelView.cx, cy: parcelView.cy, zoom: parcelView.zoom };
      var zg = zoneGrid(z);
      var c = proj({ x: zg.gx, y: zg.gy });
      return { cx: c.x, cy: c.y, zoom: parcelView.zoom * 1.7 };
    }
    // zoom clamps (spec §2): [parcelZoom × 0.6, parcelZoom × 6]
    function zoomClamp(z) { return Math.max(parcelView.zoom * 0.6, Math.min(parcelView.zoom * 6, z)); }
    // slice-aware visible rect (in SVG user units) for the current zoom — used to
    // clamp cx/cy so the ext-grid terrain always covers the viewport (no blank).
    function visibleSize(zoom) {
      var r = mount.getBoundingClientRect();
      var s = Math.max((r.width || W) / W, (r.height || H) / H) || 1; // slice/cover
      var elVisW = (r.width || W) / s, elVisH = (r.height || H) / s;  // element's visible viewBox span
      return { w: elVisW / zoom, h: elVisH / zoom };
    }
    // clamp the center so the visible rect stays inside the whole [0,W]×[0,H]
    // terrain canvas (the ext grid fills it). If the visible rect is larger than
    // the canvas on an axis, pin the center to the canvas center on that axis.
    function clampCenter(cx, cy, zoom) {
      var vs = visibleSize(zoom);
      function ax(c, span, full) {
        var half = span / 2;
        if (span >= full) return full / 2;
        return Math.max(half, Math.min(full - half, c));
      }
      return { cx: ax(cx, vs.w, W), cy: ax(cy, vs.h, H) };
    }
    function applyView(v) {
      // clamp before writing so the transform never shows blank page
      v.zoom = zoomClamp(v.zoom);
      var c = clampCenter(v.cx, v.cy, v.zoom);
      v.cx = c.cx; v.cy = c.cy;
      var tx = W / 2 - v.cx * v.zoom, ty = H / 2 - v.cy * v.zoom;
      pan.setAttribute("transform", "translate(" + tx.toFixed(2) + "," + ty.toFixed(2) + ") scale(" + v.zoom.toFixed(3) + ")");
      // labels/chips render at constant screen size: counter-scale each about
      // its own anchor (they live inside the pan group and would scale with it)
      var f = 1 / v.zoom;
      fixedNodes.forEach(function (n) {
        n.el.setAttribute("transform",
          "translate(" + (n.ax * (1 - f)).toFixed(2) + "," + (n.ay * (1 - f)).toFixed(2) + ") scale(" + f.toFixed(4) + ")");
      });
      // FEATURE A: live view-bounds readout. applyView already runs exactly
      // once per view change (pan/zoom/wheel/drag/zone focus) — appending the
      // readout here throttles it for free (no rAF loop). The bounds are the
      // ACTUAL visible map bounds, inverted from this same view transform.
      updateViewReadout(v);
    }
    // Compute the visible bounds from the current view and write both the
    // desktop full-bounds readout (row 2 pill) and the mobile center-only text.
    // lastBounds is exposed so the Field & date dialog can reuse the live values.
    var lastBounds = null;
    function updateViewReadout(v) {
      var span = visibleSize(v.zoom);
      var b = viewToBounds(v, span, nx, ny, W, H, PAD);
      lastBounds = b;
      var full = "N " + fmtDeg(b.n) + " · S " + fmtDeg(b.s) +
                 " · E " + fmtDeg(b.e) + " · W " + fmtDeg(b.w);
      var cLat = (b.n + b.s) / 2, cLon = (b.e + b.w) / 2;
      // "· center …" — the "VIEW" micro-label span precedes it, giving the
      // spec's "VIEW · center 40.8977, −93.1970" on mobile.
      var center = "· center " + fmtDeg(cLat) + ", " + fmtDeg(cLon);
      // Both strings are always written; CSS shows full (desktop) or center
      // (≤560px). No JS media-query branching — the readout stays a pure write.
      var fullEl = document.getElementById("vb-full");
      var ctrEl = document.getElementById("vb-center");
      if (fullEl) fullEl.textContent = full;
      if (ctrEl) ctrEl.textContent = center;
      if (root.__FOCUS_MAP__) root.__FOCUS_MAP__.lastBounds = b;
    }
    // set the whole view from a framing object (zone/parcel) — clears manual.
    function setView(v, opts) {
      opts = opts || {};
      view.cx = v.cx; view.cy = v.cy; view.zoom = v.zoom; view.manual = false;
      applyView(view);
    }
    // refresh framing when the element resizes (parcel stays fully in view)
    var rszT = null;
    window.addEventListener("resize", function () {
      clearTimeout(rszT);
      rszT = setTimeout(function () {
        parcelView.zoom = computeParcelZoom();
        if (view.manual) { applyView(view); }              // keep the manual view, just re-clamp
        else { setView(current ? zoneCenter(current) : parcelView); }
      }, 120);
    }, { passive: true });
    function focusZone(id, opts) {
      opts = opts || {};
      if (id === current && !opts.force && !view.manual) return;
      current = id;
      svg.querySelectorAll("[data-zone]").forEach(function (n) {
        n.classList.toggle("zone-active", n.getAttribute("data-zone") === id);
        n.classList.toggle("zone-dim", id != null && n.getAttribute("data-zone") !== id);
      });
      if (id) setView(zoneCenter(id)); // clears manual, frames the zone
    }
    function reset() {
      current = null;
      svg.querySelectorAll("[data-zone]").forEach(function (n) { n.classList.remove("zone-active", "zone-dim"); });
      setView(parcelView); // recenter = parcel framing (bleed fills edges), clears manual
    }
    applyView(view);

    /* ---- WHEEL ZOOM ABOUT THE CURSOR (spec §2). Zoom toward the pointer's
     * world point, keeping that world point fixed under the cursor. Sets manual.
     * No inertia; the .pan CSS transition is momentarily disabled so the zoom
     * tracks the wheel 1:1 (a transition here would lag the cursor). ------- */
    function clientToWorld(clientX, clientY) {
      // invert the current pan transform: world = (screenViewBox − translate)/zoom
      var r = mount.getBoundingClientRect();
      var s = Math.max((r.width || W) / W, (r.height || H) / H) || 1;
      // element px → viewBox units (slice/cover: the viewBox is centered)
      var vbX = (clientX - r.left - (r.width - W * s) / 2) / s;
      var vbY = (clientY - r.top - (r.height - H * s) / 2) / s;
      var tx = W / 2 - view.cx * view.zoom, ty = H / 2 - view.cy * view.zoom;
      return { x: (vbX - tx) / view.zoom, y: (vbY - ty) / view.zoom };
    }
    var wheelClearT = null;
    svg.addEventListener("wheel", function (e) {
      e.preventDefault();
      var w = clientToWorld(e.clientX, e.clientY);
      var k = 0.0016;                              // wheel sensitivity
      var nz = zoomClamp(view.zoom * Math.exp(-e.deltaY * k));
      // keep the world point w under the cursor: solve for cx,cy so that w maps
      // to the same viewBox position. After zoom change, screenVB of w =
      // tx + w*nz; we want it unchanged → adjust cx,cy via the same relation.
      // Simplest: recompute cx so w stays put:  cx = w.x - (w.x - cx)*zoom/nz.
      view.cx = w.x - (w.x - view.cx) * (view.zoom / nz);
      view.cy = w.y - (w.y - view.cy) * (view.zoom / nz);
      view.zoom = nz;
      view.manual = true;
      pan.style.transition = "none";               // 1:1 with the wheel
      applyView(view);
      clearTimeout(wheelClearT);
      wheelClearT = setTimeout(function () { pan.style.transition = ""; }, 120);
    }, { passive: false });

    /* ---- DRAG PAN + PINCH (spec §2). Pointer events with setPointerCapture.
     * >4px movement counts as a drag and suppresses the click that would
     * otherwise activate a zone. Two-pointer pinch scales about the midpoint.
     * All manual; all clamped by applyView. --------------------------------- */
    var pointers = {};          // active pointers by id
    var dragStart = null;       // {x,y,cx,cy} for single-pointer pan
    var dragged = false;        // moved > threshold?
    var pinchStart = null;      // {dist, zoom, worldMid}
    function activePointerList() { return Object.keys(pointers).map(function (k) { return pointers[k]; }); }
    svg.addEventListener("pointerdown", function (e) {
      // ignore secondary buttons
      if (e.button && e.button !== 0) return;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      try { svg.setPointerCapture(e.pointerId); } catch (err) {}
      var list = activePointerList();
      if (list.length === 1) {
        dragStart = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy };
        dragged = false;
      } else if (list.length === 2) {
        var a = list[0], b = list[1];
        var dx = a.x - b.x, dy = a.y - b.y;
        pinchStart = { dist: Math.hypot(dx, dy), zoom: view.zoom,
          worldMid: clientToWorld((a.x + b.x) / 2, (a.y + b.y) / 2) };
        dragStart = null;
      }
    });
    svg.addEventListener("pointermove", function (e) {
      if (!pointers[e.pointerId]) return;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var list = activePointerList();
      if (list.length >= 2 && pinchStart) {
        var a = list[0], b = list[1];
        var dx = a.x - b.x, dy = a.y - b.y;
        var dist = Math.hypot(dx, dy) || 1;
        var nz = zoomClamp(pinchStart.zoom * (dist / pinchStart.dist));
        var wm = pinchStart.worldMid;
        view.cx = wm.x - (wm.x - view.cx) * (view.zoom / nz);
        view.cy = wm.y - (wm.y - view.cy) * (view.zoom / nz);
        view.zoom = nz;
        view.manual = true;
        dragged = true;
        pan.style.transition = "none";
        applyView(view);
      } else if (dragStart) {
        var mdx = e.clientX - dragStart.x, mdy = e.clientY - dragStart.y;
        if (!dragged && (mdx * mdx + mdy * mdy) > 16) { dragged = true; svg.classList.add("dragging"); }
        if (dragged) {
          // convert screen px delta → world units (slice factor + zoom)
          var r = mount.getBoundingClientRect();
          var s = Math.max((r.width || W) / W, (r.height || H) / H) || 1;
          view.cx = dragStart.cx - (mdx / s) / view.zoom;
          view.cy = dragStart.cy - (mdy / s) / view.zoom;
          view.manual = true;
          pan.style.transition = "none";
          applyView(view);
        }
      }
    });
    function endPointer(e) {
      if (pointers[e.pointerId]) delete pointers[e.pointerId];
      try { svg.releasePointerCapture(e.pointerId); } catch (err) {}
      var list = activePointerList();
      if (list.length < 2) pinchStart = null;
      if (list.length === 0) {
        dragStart = null;
        svg.classList.remove("dragging");
        // restore the smooth transition for subsequent programmatic moves
        pan.style.transition = "";
      } else if (list.length === 1) {
        // lifted one finger of a pinch → resume single-pointer pan from here
        dragStart = { x: list[0].x, y: list[0].y, cx: view.cx, cy: view.cy };
      }
    }
    svg.addEventListener("pointerup", endPointer);
    svg.addEventListener("pointercancel", endPointer);
    // suppress the click that a drag would otherwise fire on a zone/refusal
    svg.addEventListener("click", function (e) {
      if (dragged) { e.stopPropagation(); e.preventDefault(); dragged = false; }
    }, true); // capture phase: intercept before the zone handlers

    // layer visibility (Layers panel toggles these <g data-layer> groups)
    function setLayer(name, on) {
      svg.querySelectorAll('[data-layer="' + name + '"]').forEach(function (g) {
        g.style.display = on ? "" : "none";
      });
    }

    // zoom about the current view center by a factor (button controls). Manual.
    function zoomBy(factor) {
      view.zoom = zoomClamp(view.zoom * factor);
      view.manual = true;
      pan.style.transition = "";  // buttons animate smoothly
      applyView(view);
    }

    /* ---- RE-TINT THE MAP ON THEME CHANGE ------------------------------------
     * The hypsometric bands, the base canvas rect, and the outside-wash fill
     * are the three terrain elements NOT already driven purely by CSS vars —
     * the bands/base-rect bake a computed hex into their `fill` attribute at
     * render time (the wash already reads `var(--terrain-low)` directly and
     * needs no JS help). retintMap() re-reads --terrain-low/--terrain-high off
     * the live cascade (so it always matches whatever [data-theme] is active)
     * and rewrites: the base rect's fill, and every band's fill via lerpHex at
     * that band's own stored `t` (data-t, 0..1 low→high) — the SAME lerp used
     * at build time, just re-run with the new endpoints. No geometry changes;
     * only color. Call this any time the theme flips. ------------------------ */
    function retintMap() {
      var t = readTerrainTokens();
      var base = svg.querySelector(".terrain-base-rect");
      if (base) base.setAttribute("fill", t.low);
      svg.querySelectorAll(".band[data-t]").forEach(function (el) {
        var bt = parseFloat(el.getAttribute("data-t"));
        el.setAttribute("fill", lerpHex(t.low, t.high, bt));
      });
    }

    return { svg: svg, pan: pan, focusZone: focusZone, reset: reset, setLayer: setLayer, retintMap: retintMap,
      current: function () { return current; },
      isManual: function () { return view.manual; },
      zoomBy: zoomBy, setView: setView, parcelView: parcelView,
      getBounds: function () { return lastBounds; } };
  }

  /* =========================================================================
   * SCROLL-SYNC — the DIRECT scroll-listener + nearest-center picker.
   * a plain scroll handler, not the observer/rAF paths (deliberately — those failed and were
   * replaced; see focus/focus.js wireScrollSync). Two-way card↔map sync.
   * ========================================================================= */
  function wireScrollSync(mapCtl, scrollRoot) {
    var cards = Array.prototype.slice.call(document.querySelectorAll(".zone-card[data-zone], .cz-card[data-zone]"));
    if (!cards.length) return;

    function setActiveCard(id) {
      cards.forEach(function (c) { c.classList.toggle("card-active", c.getAttribute("data-zone") === id); });
    }
    function visibleCard(id) {
      return cards.filter(function (c) {
        return c.getAttribute("data-zone") === id && c.getClientRects().length > 0;
      })[0] || cards.filter(function (c) { return c.getAttribute("data-zone") === id; })[0];
    }
    function setActiveDock(id) {
      document.querySelectorAll(".dock-chip[data-zone]").forEach(function (ch) {
        ch.classList.toggle("dock-chip--active", ch.getAttribute("data-zone") === id);
      });
    }
    function activate(id, opts) {
      if (id == null) { deactivate(); return; }
      mapCtl.focusZone(id, opts);
      setActiveCard(id);
      setActiveDock(id);
      var head = document.getElementById("sheet-peek-zone");
      var card = cards.filter(function (c) { return c.getAttribute("data-zone") === id; })[0];
      if (head && card) head.textContent = card.getAttribute("data-peek") || "";
    }
    // scroll-top reset (spec §3): nothing active, map back to the parcel view,
    // sheet peek text resets to the field name. Scrolling down re-picks.
    function deactivate() {
      lastActive = null;
      mapCtl.reset();  // clears zone/refusal active classes, applyView(parcelView), clears manual
      setActiveCard(null);
      setActiveDock(null);
      var head = document.getElementById("sheet-peek-zone");
      if (head) head.textContent = (window.FOCUS_DATA && window.FOCUS_DATA.field.name) || "";
    }

    // nearest-center picker on a plain scroll listener (deterministic, robust to
    // card height; an element-root observer with ratio selection proved unreliable here).
    var lastActive = null;
    // While a programmatic jump's smooth scroll is in flight, the nearest-
    // center picker would re-activate every zone it passes; suppress it.
    var suppressPickUntil = 0;
    function pickActive() {
      if (Date.now() < suppressPickUntil) return;
      var rootEl = (scrollRoot && scrollRoot.getBoundingClientRect) ? scrollRoot : document.documentElement;
      var rb = rootEl.getBoundingClientRect();
      // SCROLL-TOP RESET (spec §3): if scrolled above the first zone card (its
      // top sits > ~40px below the scroll container's top), deactivate. Compute
      // the offset robustly from the first VISIBLE card's rect vs the container.
      var firstCard = cards.filter(function (c) { return c.getClientRects().length > 0; })[0];
      if (firstCard) {
        var fcTop = firstCard.getBoundingClientRect().top;
        if (fcTop - rb.top > 40) {   // first card pushed down → we're above it
          if (lastActive !== null) deactivate();
          return;
        }
      }
      var bandCenter = rb.top + rb.height / 2;
      var best = null, bestDist = Infinity;
      cards.forEach(function (c) {
        if (c.getClientRects().length === 0) return;
        var r = c.getBoundingClientRect();
        var d = Math.abs((r.top + r.height / 2) - bandCenter);
        if (d < bestDist) { bestDist = d; best = c.getAttribute("data-zone"); }
      });
      if (best && best !== lastActive) { lastActive = best; activate(best); }
    }
    var scroller = (scrollRoot && scrollRoot.addEventListener) ? scrollRoot : window;
    scroller.addEventListener("scroll", pickActive, { passive: true });
    window.addEventListener("resize", pickActive, { passive: true });
    setTimeout(pickActive, 0);

    cards.forEach(function (c) {
      c.addEventListener("click", function () {
        var id = c.getAttribute("data-zone");
        activate(id, { force: true });
        (visibleCard(id) || c).scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "center" });
        suppressPickUntil = Date.now() + (reduced() ? 150 : 900);
      });
    });

    mapCtl.svg.querySelectorAll("[data-zone]").forEach(function (region) {
      function go() {
        var id = region.getAttribute("data-zone");
        activate(id, { force: true });
        if (root.__RAISE_SHEET__ && matchMedia("(max-width:720px)").matches) root.__RAISE_SHEET__();
        var card = visibleCard(id);
        if (card) card.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "center" });
        suppressPickUntil = Date.now() + (reduced() ? 150 : 900);
      }
      region.addEventListener("click", go);
      region.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); }
      });
    });

    // Held-open flag bands: hover/tap → an in-place POPOVER at the mark (title,
    // the two disagreeing sources compressed, "Read why ↓" scrolls to the full
    // card with a soft tint). A bare highlight wasn't an answer (Adam, 2026-07-05).
    // lookup by INSTANCE uid (F1/F2a/F2b…) — two ponds share id "F2" but differ by
    // uid, so the second pond's ⟨?⟩ must resolve to the second pond (spec §D).
    function flagByUid(uid) {
      var r = ACTIVE && ACTIVE.reading;
      if (!r || !r.flags) return null;
      for (var i = 0; i < r.flags.length; i++) if (r.flags[i].uid === uid) return r.flags[i];
      return null;
    }
    function scrollToFlagCard(id) {
      var visible = null;
      document.querySelectorAll('[data-flag="' + id + '"]').forEach(function (c) {
        if (c.getClientRects && c.getClientRects().length > 0 && /flag-card/.test(c.className)) visible = c;
      });
      if (!visible) return;
      visible.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "center" });
      suppressPickUntil = Date.now() + (reduced() ? 150 : 900);
      visible.classList.add("flag-card--lit");
      setTimeout(function () { visible.classList.remove("flag-card--lit"); }, 2200);
    }
    var pop = document.getElementById("map-popover");
    function hidePopover() { if (pop) { pop.hidden = true; pop.dataset.flag = ""; } }
    function showPopover(band) {
      if (!pop) return;
      var id = band.getAttribute("data-flag"); // instance uid (F1/F2a/F2b…) or "collection-low"
      var fl = flagByUid(id);
      var title, brief;
      if (fl) {
        title = fl.title; // TITLE verbatim — the located line is an added fact, not a rewrite
        brief = fl.readA.source + ": " + fl.readA.text + "  ·  " + fl.readB.source + ": " + fl.readB.text;
        // the locating FACT (spec §B): where this pond sits, facts only.
        if (fl.where) brief += "  ·  pond ≈ " + fl.where.octant + " of the read center · " +
          AGRIOS_FOCUS_R2.fmtDeg(fl.where.lat) + ", " + AGRIOS_FOCUS_R2.fmtDeg(fl.where.lon);
      } else if (id === "collection-low") {
        title = "Collection-low candidate";
        brief = "The lowest connected cells of this read — a computed flag (rule printed on its card), not a judgment.";
      } else { return; }
      pop.querySelector(".map-popover-title").textContent = "⟨?⟩ " + title;
      pop.querySelector(".map-popover-brief").textContent = brief;
      pop.dataset.flag = id;
      // anchor near the band, clamped to the stage
      var br = band.getBoundingClientRect();
      var stage = document.getElementById("stage").getBoundingClientRect();
      pop.hidden = false;
      var pw = pop.offsetWidth, ph = pop.offsetHeight;
      var x = Math.max(stage.left + 10, Math.min(br.left + br.width / 2 - pw / 2, stage.right - pw - 10));
      var y = br.top - ph - 10 < stage.top + 10 ? br.bottom + 10 : br.top - ph - 10;
      pop.style.left = (x - stage.left) + "px";
      pop.style.top = (y - stage.top) + "px";
    }
    if (pop) {
      pop.querySelector(".map-popover-go").addEventListener("click", function () {
        var id = pop.dataset.flag;
        hidePopover();
        if (id && id !== "collection-low") scrollToFlagCard(id);
        else if (id === "collection-low") scrollToFlagCard("collection-low");
      });
      document.addEventListener("click", function (e) {
        if (!pop.hidden && !pop.contains(e.target) && !e.target.closest(".flag-band") && !e.target.closest(".collow-region")) hidePopover();
      });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape") hidePopover(); });
    }
    var hoverT = null;
    mapCtl.svg.querySelectorAll(".flag-band[data-flag], .collow-region[data-flag]").forEach(function (band) {
      band.addEventListener("click", function (e) {
        e.stopPropagation();
        if (pop && !pop.hidden && pop.dataset.flag === band.getAttribute("data-flag")) { hidePopover(); return; }
        showPopover(band);
        if (pop) pop.querySelector(".map-popover-go").focus();
      });
      band.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showPopover(band); if (pop) pop.querySelector(".map-popover-go").focus(); }
      });
      band.addEventListener("mouseenter", function () {
        band.classList.add("flag-hover");
        clearTimeout(hoverT);
        hoverT = setTimeout(function () { showPopover(band); }, 220);
      });
      band.addEventListener("mouseleave", function () {
        band.classList.remove("flag-hover");
        clearTimeout(hoverT);
        // grace: leave the popover if the pointer is heading into it
        setTimeout(function () { if (pop && !pop.matches(":hover")) hidePopover(); }, 350);
      });
    });

    mapCtl.svg.querySelectorAll("[data-zone]").forEach(function (region) {
      region.addEventListener("mouseenter", function () { region.classList.add("zone-hover"); });
      region.addEventListener("mouseleave", function () { region.classList.remove("zone-hover"); });
    });

    // dock quick-nav chips: jump to a zone
    document.querySelectorAll(".dock-chip[data-zone]").forEach(function (ch) {
      ch.addEventListener("click", function () {
        var id = ch.getAttribute("data-zone");
        activate(id, { force: true });
        if (root.__RAISE_SHEET__ && matchMedia("(max-width:720px)").matches) root.__RAISE_SHEET__();
        var card = visibleCard(id);
        if (card) card.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "center" });
        suppressPickUntil = Date.now() + (reduced() ? 150 : 900);
      });
    });

    // Start in the scrolled-to-top state (Adam's rule: at the top of the
    // story you see the whole field) — nothing active, parcel framing.
    // The scroll picker activates zone 1 as soon as the narrative moves.
    mapCtl.reset();
  }

  /* =========================================================================
   * DIALOGS — provenance / about. R2 sheet-card modals.
   * ========================================================================= */
  function openDialog(id) {
    var d = document.getElementById(id);
    if (!d) return;
    d.classList.add("open");
    d.setAttribute("aria-hidden", "false");
    var close = d.querySelector(".dialog-close");
    if (close) close.focus();
  }
  function closeDialog(d) {
    d.classList.remove("open");
    d.setAttribute("aria-hidden", "true");
  }
  function wireDialogs() {
    document.querySelectorAll(".dialog").forEach(function (d) {
      d.addEventListener("click", function (e) { if (e.target === d) closeDialog(d); });
      var c = d.querySelector(".dialog-close");
      if (c) c.addEventListener("click", function () { closeDialog(d); });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") document.querySelectorAll(".dialog.open").forEach(closeDialog);
    });
    var chip = document.getElementById("prov-chip");
    if (chip) chip.addEventListener("click", function () { openDialog("provenance-dialog"); });
    // rail buttons
    var pb = document.getElementById("rail-provenance");
    if (pb) pb.addEventListener("click", function () { openDialog("provenance-dialog"); });
    var ab = document.getElementById("rail-about");
    if (ab) ab.addEventListener("click", function () { openDialog("about-dialog"); });
    var ho = document.getElementById("rail-howto");
    if (ho) ho.addEventListener("click", function () { openDialog("howto-dialog"); });
  }

  /* =========================================================================
   * FEATURE B — FIELD & DATE DIALOG (honest entry).
   *
   * Opens from the FIELD pill (row 1 left segment, now a <button>). Three
   * sections: current field (stated bounds + LIVE view bounds reused from the
   * readout), date (two REAL NWS days + an honest note for any other date —
   * never fabricated weather), location (recenter on this field, or an honest
   * capability card for anywhere else — no network calls anywhere).
   *
   * The date swap rewrites: the header date pill (#field-date / .field-date),
   * the field-pill label date, the sheet peek, and the weather tile hero/line/
   * sub — ALL from FORECASTS[key], never a parsed string. Any other date leaves
   * the display untouched and shows the honest inline note.
   * ========================================================================= */
  var FIELD_DATE_STATE = "2026-07-03"; // the day currently shown (default)
  function wireFieldDialog(mapCtl) {
    var D = root.FOCUS_DATA;
    if (!D) return;
    var FC = D.forecasts;

    // --- open from the field pill ---
    var fieldBtn = document.getElementById("field-pill");
    if (fieldBtn) fieldBtn.addEventListener("click", function () { openFieldDialog(); });
    // --- and from the view-bounds pill (mobile shows center-only; the dialog
    //     lists the full bounds) ---
    var vbBtn = document.getElementById("view-bounds-pill");
    if (vbBtn) vbBtn.addEventListener("click", function () { openFieldDialog(); });

    function fmtBounds(b) {
      if (!b) return "—";
      return "N " + AGRIOS_FOCUS_R2.fmtDeg(b.n) + " · S " + AGRIOS_FOCUS_R2.fmtDeg(b.s) +
             " · E " + AGRIOS_FOCUS_R2.fmtDeg(b.e) + " · W " + AGRIOS_FOCUS_R2.fmtDeg(b.w);
    }
    // stated bounds from the PARCEL_BBOX constants (N/S/E/W), 4-decimal.
    function statedBounds() {
      var P = AGRIOS_FOCUS_R2.PARCEL_BBOX;
      return "N " + AGRIOS_FOCUS_R2.fmtDeg(P.lat[1]) + " · S " + AGRIOS_FOCUS_R2.fmtDeg(P.lat[0]) +
             " · E " + AGRIOS_FOCUS_R2.fmtDeg(P.lon[1]) + " · W " + AGRIOS_FOCUS_R2.fmtDeg(P.lon[0]);
    }

    // ~acres from a stated-bounds rectangle — a COMPUTED fact, tagged as such.
    // Simple equirectangular area (fine at field scale); never shown without
    // stated bounds (acreage is not knowable from an unbounded read).
    function approxAcres(b) {
      var dy = (b.n - b.s) * 111320;
      var dx = (b.e - b.w) * 111320 * Math.cos(((b.n + b.s) / 2) * Math.PI / 180);
      return "~" + Math.round(Math.abs(dx * dy) / 4046.8564224) + " acres (from stated bounds)";
    }

    function openFieldDialog() {
      // populate current-field facts for the ACTIVE field — the baked Allerton
      // facts (analyst layer: acreage/crop/county) belong to Allerton ONLY. A
      // live read shows ITS name/coords, bounds only if STATED, acreage only
      // as a computed fact of those bounds. (Caught by Adam on the published
      // site: a live read's dialog still printed Allerton's facts.)
      var active = AGRIOS_FOCUS_R2.getActive && AGRIOS_FOCUS_R2.getActive();
      var noteEl = document.getElementById("fd-facts-note");
      if (active && active.live && active.read) {
        var f = active.field;
        setText("fd-name", (f && f.name) ? f.name : "unsaved read");
        setText("fd-coords", AGRIOS_FOCUS_R2.fmtDeg(active.read.lat) + ", " + AGRIOS_FOCUS_R2.fmtDeg(active.read.lon));
        setText("fd-stated", (f && f.bounds) ? fmtBounds(f.bounds) : "not stated — save the field and “use current view as bounds”");
        setText("fd-acreage", (f && f.bounds) ? approxAcres(f.bounds) : "—");
        if (noteEl) noteEl.textContent = "Stated bounds are your claim of record — drawn solid on the map once stated. Current view is live — it tracks whatever you pan or zoom to.";
      } else {
        setText("fd-name", D.field.name);
        setText("fd-coords", D.field.coords);
        setText("fd-stated", statedBounds());
        setText("fd-acreage", D.field.acreage);
        if (noteEl) noteEl.textContent = "Stated bounds are the field's fixed parcel (USGS/USDA extent). Current view is live — it tracks whatever you pan or zoom to on the map.";
      }
      setText("fd-view", fmtBounds(mapCtl.getBounds && mapCtl.getBounds()));
      // DATE section: a LIVE read shows the fetched forecast WINDOW (day chips +
      // a clamped date input); Allerton keeps its two baked held-day chips.
      // clear any transient location/date messages from a prior open
      hide("date-missing"); hide("loc-msg"); hide("capability-card");
      var di = document.getElementById("date-input");
      if (di) di.value = "";
      if (active && active.live && active.read) {
        buildLiveDateSelector(active.read);
      } else {
        restoreAllertonDateChips();
        // date chips labels + selected state
        reflectDate(FIELD_DATE_STATE);
        if (di) { di.min = "2020-01-01"; di.max = "2030-12-31"; }
      }
      var la = document.getElementById("loc-lat"), lo = document.getElementById("loc-lon");
      var phLat = (active && active.live && active.read) ? AGRIOS_FOCUS_R2.fmtDeg(active.read.lat) : (D.field.coordsLat || "40.8977");
      var phLon = (active && active.live && active.read) ? AGRIOS_FOCUS_R2.fmtDeg(active.read.lon) : (D.field.coordsLon || "−93.1970");
      if (la) { la.value = ""; la.placeholder = phLat; }
      if (lo) { lo.value = ""; lo.placeholder = phLon; }
      // SAVE THIS FIELD section (spec-saved-fields-v1): only when a live read is
      // active. Re-opening a saved field prefills its name/note/bounds to edit.
      refreshSaveSection();
      openDialog("field-dialog");
    }

    /* ---- SAVE THIS FIELD (spec-saved-fields-v1 §4) ----------------------- */
    var _editingBounds = null; // {n,s,e,w} staged in the inputs, or null

    function refreshSaveSection() {
      var sec = document.getElementById("save-field-section");
      if (!sec) return;
      // visible ONLY when a live read is the active field
      var live = AGRIOS_FOCUS_R2.getActive && AGRIOS_FOCUS_R2.getActive();
      var hint = document.getElementById("save-field-hint");
      var body = sec.querySelectorAll(".save-field-row, .save-bounds, .save-actions, #save-field-sub");
      if (!live || !live.live || !live.read) {
        // DISCOVERABLE, not hidden: explain how to get here (Adam hit this wall
        // 2026-07-05 — the feature was invisible from Allerton).
        sec.hidden = false;
        if (hint) hint.hidden = false;
        body.forEach(function (el) { el.hidden = true; });
        return;
      }
      if (hint) hint.hidden = true;
      body.forEach(function (el) { el.hidden = false; });
      var existing = (live.field && live.field.id) ? live.field : null;
      // name / note prefill (edit-in-place when re-opening a saved field)
      var nameEl = document.getElementById("save-name");
      var noteEl = document.getElementById("save-note");
      if (nameEl) nameEl.value = existing ? existing.name : "";
      if (noteEl) noteEl.value = existing ? (existing.note || "") : "";
      // bounds prefill: from the saved field's bounds, else empty (unbounded)
      _editingBounds = existing && existing.bounds ? {
        n: existing.bounds.n, s: existing.bounds.s, e: existing.bounds.e, w: existing.bounds.w
      } : null;
      writeBoundsInputs(_editingBounds);
      updateBoundsStatus();
      hide("save-msg");
      // heading: "Save this field" vs "Edit this field"
      setText("save-field-heading", existing ? "Edit this field" : "Save this field");
      setText("save-field-btn", existing ? "Update this field" : "Save this field");
    }
    function writeBoundsInputs(b) {
      var ids = { n: "save-bounds-n", s: "save-bounds-s", e: "save-bounds-e", w: "save-bounds-w" };
      Object.keys(ids).forEach(function (k) {
        var el = document.getElementById(ids[k]);
        if (el) el.value = (b && b[k] != null) ? AGRIOS_FOCUS_R2.fmtDeg(b[k]) : "";
      });
    }
    function readBoundsInputs() {
      function num(id) {
        var el = document.getElementById(id);
        var v = (el && el.value || "").trim().replace(/−/g, "-");
        if (v === "") return NaN;
        return parseFloat(v);
      }
      var n = num("save-bounds-n"), s = num("save-bounds-s"), e = num("save-bounds-e"), w = num("save-bounds-w");
      if ([n, s, e, w].every(function (v) { return isNaN(v); })) return null; // all empty → unbounded
      return { n: n, s: s, e: e, w: w };
    }
    function updateBoundsStatus() {
      var b = readBoundsInputs();
      var msg = b
        ? "Bounds stated — rendered as your claim: solid boundary, muted wash outside."
        : "No bounds stated — this field renders live, no wash. State bounds to draw your claim.";
      setText("save-bounds-status", msg);
    }

    // "Use current view as bounds" — read the CURRENT visible map bounds via the
    // existing inversion (mapCtl.getBounds → {n,s,e,w}) and fill the inputs.
    var useBtn = document.getElementById("save-bounds-use");
    if (useBtn) useBtn.addEventListener("click", function () {
      var b = mapCtl.getBounds && mapCtl.getBounds();
      if (!b) return;
      _editingBounds = { n: b.n, s: b.s, e: b.e, w: b.w };
      writeBoundsInputs(_editingBounds);
      updateBoundsStatus();
      hide("save-msg");
    });
    var clearBtn = document.getElementById("save-bounds-clear");
    if (clearBtn) clearBtn.addEventListener("click", function () {
      _editingBounds = null;
      writeBoundsInputs(null);
      updateBoundsStatus();
      hide("save-msg");
    });
    ["save-bounds-n", "save-bounds-s", "save-bounds-e", "save-bounds-w"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("input", updateBoundsStatus);
    });

    var saveBtn = document.getElementById("save-field-btn");
    if (saveBtn) saveBtn.addEventListener("click", function () {
      var F = root.AGRIOS_FIELDS;
      var live = AGRIOS_FOCUS_R2.getActive && AGRIOS_FOCUS_R2.getActive();
      if (!F || !live || !live.live || !live.read) return;
      var read = live.read;
      var existing = (live.field && live.field.id) ? live.field : null;
      var nameEl = document.getElementById("save-name");
      var noteEl = document.getElementById("save-note");
      var bounds = readBoundsInputs();
      var readKey = root.AGRIOS_LIVE ? root.AGRIOS_LIVE.cacheKey(read.lat, read.lon) : null;
      var res = F.saveField({
        id: existing ? existing.id : null,
        name: nameEl ? nameEl.value : "",
        note: noteEl ? noteEl.value : "",
        lat: read.lat, lon: read.lon,
        bounds: bounds,
        extent: read.gridBbox,               // validate bounds against the read extent
        createdAt: existing ? existing.createdAt : null,
        readKey: readKey
      });
      if (!res.ok) {
        setText("save-msg", res.error);
        show("save-msg");
        return;
      }
      hide("save-msg");
      // re-render with the saved field's identity so the bounds render (if any)
      // and the pill/header switch to the name — reuse setField's full path.
      AGRIOS_FOCUS_R2.setField(read, {
        id: res.field.id, name: res.field.name, bounds: res.field.bounds,
        boundsSetAt: res.field.boundsSetAt, createdAt: res.field.createdAt
      });
      var d = document.getElementById("field-dialog");
      if (d) closeDialog(d);
      if (root.AGRIOS_FOCUS_R2 && root.AGRIOS_FOCUS_R2.setFieldChipState) root.AGRIOS_FOCUS_R2.setFieldChipState(true, read);
    });

    // --- DATE: two paths. ALLERTON keeps its two baked held-day chips (Jul 3/4,
    // from FORECASTS). A LIVE read builds the day selector from the fetched
    // forecast WINDOW — the date becomes an instrument control (selecting a day
    // re-runs R1 for THAT day, no refetch). Both share #date-chips / #date-input.
    var chipsBox = document.querySelector(".date-chips");
    // capture the baked Allerton markup once, so the live path can rebuild it.
    var ALLERTON_CHIPS_HTML = chipsBox ? chipsBox.innerHTML : "";

    function reflectDate(key) {
      if (!chipsBox) return;
      chipsBox.querySelectorAll(".date-chip").forEach(function (c) {
        var on = c.getAttribute("data-date") === key;
        c.classList.toggle("date-chip--on", on);
        c.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
    // ALLERTON: restore + label the two baked chips (rebuilt each open so the
    // node identity is fresh; the delegated listener below stays wired).
    function restoreAllertonDateChips() {
      if (chipsBox) {
        chipsBox.setAttribute("aria-label", "Select a held forecast date");
        chipsBox.innerHTML = ALLERTON_CHIPS_HTML;
        var c3 = document.getElementById("date-chip-jul3");
        var c4 = document.getElementById("date-chip-jul4");
        if (c3 && FC["2026-07-03"]) c3.textContent = FC["2026-07-03"].chip;
        if (c4 && FC["2026-07-04"]) c4.textContent = FC["2026-07-04"].chip;
      }
      var cap = document.getElementById("date-window-cap");
      if (cap) cap.hidden = true;
      var facts = document.getElementById("date-day-facts");
      if (facts) facts.hidden = true;
    }
    // apply a REAL held Allerton day: rewrite header date, pill date, weather tile.
    function applyForecastDay(key) {
      var f = FC[key];
      if (!f) return;
      FIELD_DATE_STATE = key;
      reflectDate(key);
      // header/eyebrow + sheet date + field-pill label all show this day's label
      var dateLabel = (key === "2026-07-03") ? "July 3, 2026" : "July 4, 2026";
      document.querySelectorAll("#field-date, .field-date").forEach(function (el) { el.textContent = dateLabel; });
      var fpt = document.getElementById("field-pill-text");
      if (fpt) fpt.textContent = D.field.name + " · " + dateLabel;
      // weather tile: rewrite hero/line/sub from FORECASTS (no parsing).
      writeWeatherTiles(f);
    }
    function writeWeatherTiles(f) {
      document.querySelectorAll(".weather-card").forEach(function (card) {
        var num = card.querySelector(".wx-hero-num");
        var line = card.querySelector(".wx-line");
        var sub = card.querySelector(".wx-sub");
        if (num) num.textContent = f.tempF;
        if (line) line.textContent = f.line;
        if (sub) sub.textContent = f.sub;
      });
    }

    /* ---- LIVE forecast-window day selector (spec-date-window-v1) --------- */
    // Build a row of day chips from the read's fetched periods; below, the
    // selected day's day/night period facts + a "forecast window: …" caption.
    // Selecting an IN-WINDOW day: set read.dateStr, update the header pill, and
    // re-run setField(read, meta) → computeReading re-runs for that day (R1 can
    // re-rank). NO refetch — the cached read is reused. An OUT-OF-WINDOW date
    // (via the clamped input) shows the honest "no forecast held" note, no
    // recompute, no display change.
    function fmtHumanDate(dateStr) {
      var live = root.AGRIOS_LIVE;
      var lbl = (live && live.parsers.dayLabel) ? live.parsers.dayLabel(dateStr) : dateStr;
      return lbl; // e.g. "Sat 5" — no clock (NWS periods are 12h day/night)
    }
    // "YYYY-MM-DD" n days before the given ISO day (local date arithmetic). Used
    // to bound the chip row to ~21 days of today (spec-observed-on-demand-v1).
    function daysAgoStr(dateStr, n) {
      if (typeof dateStr !== "string" || dateStr.length < 10) return dateStr;
      var y = +dateStr.slice(0, 4), m = +dateStr.slice(5, 7), d = +dateStr.slice(8, 10);
      var dt = new Date(y, m - 1, d, 12, 0, 0);
      dt.setDate(dt.getDate() - n);
      return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") +
        "-" + String(dt.getDate()).padStart(2, "0");
    }
    function periodFact(p, suffix) {
      if (!p) return "";
      var t = (p.tempF != null ? p.tempF + "°" + (p.temperatureUnit || "F") : "—");
      var pop = (p.pop != null && p.pop > 0) ? " · " + p.pop + "% precip" : "";
      return '<div class="date-day-line"><span class="date-day-when">' + esc(p.name || suffix) + '</span>' +
        '<span class="date-day-wx">' + esc(t) + " · " + esc(p.shortForecast || "—") + esc(pop) + '</span></div>';
    }
    // OBSERVED day fact line (spec-time-axis-v1): measured pcpn + hi/lo, labeled
    // the record it is. A wet day (pcpn ≥ 0.1") is noted so the record reads as
    // clearly as the forecast — but it is stated as a record, no interpretation.
    function observedFact(day) {
      var pcpn = (day.pcpn != null) ? day.pcpn.toFixed(2) + "\" rain" : "rain n/a";
      var wet = (day.pcpn != null && day.pcpn >= 0.1) ? " · rain recorded" : "";
      var hilo = (day.maxt != null && day.mint != null) ? day.maxt + "° / " + day.mint + "°" : "temp n/a";
      return '<div class="date-day-line date-day-line--observed"><span class="date-day-when">observed</span>' +
        '<span class="date-day-wx">' + esc(pcpn) + esc(wet) + " · " + esc(hilo) + '</span></div>' +
        '<div class="date-day-src">observed · NOAA PRISM ~4km</div>';
    }
    function buildLiveDateSelector(read) {
      var live = root.AGRIOS_LIVE;
      if (!live || !chipsBox) return;
      // TIME AXIS (spec-time-axis-v1): the combined ribbon — OBSERVED past ←
      // today → FORECAST future — from the read's ACIS history + NWS periods.
      var win = live.parsers.timeAxis(read.history || [], read.forecasts || []);
      var today = win.todayStr;
      var inWin = function (ds) { return win.days.some(function (d) { return d.dateStr === ds; }); };
      // selected day: current read.dateStr if on the axis, else today if on it,
      // else the axis's first day (defensive default).
      var sel = (read.dateStr && inWin(read.dateStr)) ? read.dateStr
              : (inWin(today) ? today : win.firstDate);
      // day chips: observed chips (badged), a TODAY hinge marker, forecast chips.
      // The hinge marker is inserted before the first forecast (today-or-later)
      // chip — a small non-interactive divider. ≤~21 chips wrap on mobile.
      // CHIP-ROW BOUND (spec-observed-on-demand-v1): only days within ~21 days of
      // today get a chip. An on-demand-fetched day nearer than that shows as a
      // selectable observed chip; a far-past fetched day (e.g. 2019) is on the
      // axis and reachable via the input, but is NOT chipped — so the row stays
      // bounded no matter how many far dates get pulled into read.history.
      var chipStart = daysAgoStr(today, 21);
      chipsBox.setAttribute("aria-label", "Select a day on the time axis — observed record (past) or forecast (future)");
      var chipDays = win.days.filter(function (d) { return d.dateStr >= chipStart; });
      if (!chipDays.length) {
        chipsBox.innerHTML = '<p class="date-window-empty">No observed history or forecast held for this read.</p>';
      } else {
        var hingeShown = false;
        chipsBox.innerHTML = chipDays.map(function (d) {
          var marker = "";
          if (!hingeShown && d.kind === "forecast") {
            hingeShown = true;
            marker = '<span class="date-hinge" aria-hidden="true" title="today — observed record ends, forecast begins">today</span>';
          }
          var on = d.dateStr === sel;
          var obs = d.kind === "observed";
          return marker + '<button class="date-chip date-chip--' + d.kind + (on ? ' date-chip--on' : '') +
            '" data-date="' + esc(d.dateStr) + '" data-kind="' + d.kind +
            '" aria-pressed="' + (on ? "true" : "false") + '">' + esc(d.label) +
            (obs ? '<span class="date-chip-tag">observed</span>' : '') + '</button>';
        }).join("");
      }
      // native input clamp (spec-observed-on-demand-v1): the PAST min WIDENS to
      // PRISM's start (1981-01-01) — any past day is retrievable on demand from
      // the observed record. The max stays the forecast end (the future beyond it
      // is a projection nobody has). A past day inside the held axis recomputes
      // with no refetch; a past day before the held window becomes a single ACIS
      // on-demand fetch, handled below.
      var di = document.getElementById("date-input");
      if (di) { di.min = "1981-01-01"; di.max = win.lastDate || ""; di.value = ""; }
      // caption note: the observed record is fetched on demand back to PRISM's
      // start. Appended once so the existing "observed to … · forecast to …"
      // window caption still reads first.
      var cap0 = document.getElementById("date-window-cap");
      if (cap0) { cap0._onDemandNote = " · observed record back to 1981 (NOAA PRISM), fetched on demand"; }
      // render facts + caption for the selected day
      renderLiveDay(read, win, sel, false);
    }
    // Render selected-day facts + caption; when `apply` is true, also set
    // read.dateStr, update the pill, and re-run setField (recompute, no fetch).
    function renderLiveDay(read, win, dateStr, apply) {
      var day = null;
      for (var i = 0; i < win.days.length; i++) if (win.days[i].dateStr === dateStr) { day = win.days[i]; break; }
      // caption (spec-time-axis-v1): "observed to {today} · forecast to {last}
      // (NOAA PRISM + NWS)". If the observed side failed we degrade the caption
      // honestly to the forecast-only span.
      var cap = document.getElementById("date-window-cap");
      if (cap && win.firstDate) {
        var hasObserved = win.days.some(function (d) { return d.kind === "observed"; });
        var hasForecast = win.days.some(function (d) { return d.kind === "forecast"; });
        var lastForecast = null;
        for (var j = win.days.length - 1; j >= 0; j--) { if (win.days[j].kind === "forecast") { lastForecast = win.days[j].dateStr; break; } }
        var parts = [];
        if (hasObserved) parts.push("observed to " + fmtHumanDate(win.todayStr));
        if (hasForecast && lastForecast) parts.push("forecast to " + fmtHumanDate(lastForecast));
        cap.textContent = parts.join(" · ") + " (NOAA PRISM + NWS)" + (cap._onDemandNote || "");
        cap.hidden = false;
      }
      var facts = document.getElementById("date-day-facts");
      if (facts) {
        if (day && day.kind === "observed") {
          // OBSERVED day facts — the measured record, labeled as such.
          facts.innerHTML = observedFact(day);
          facts.hidden = false;
        } else if (day) {
          facts.innerHTML = periodFact(day.dayPeriod, "Day") + periodFact(day.nightPeriod, "Night");
          facts.hidden = false;
        } else { facts.hidden = true; }
      }
      // reflect chip highlight
      reflectDate(dateStr);
      hide("date-missing");
      if (!apply) return;
      // IN-WINDOW SELECT: mutate the cached read's date, refresh header pill +
      // weather tile via the FULL setField path (recompute, NO network call).
      read.dateStr = dateStr;
      var active = AGRIOS_FOCUS_R2.getActive && AGRIOS_FOCUS_R2.getActive();
      var meta = (active && active.field) ? active.field : null;
      AGRIOS_FOCUS_R2.setField(read, meta); // re-runs computeReading for the day
    }

    // Delegated click on #date-chips: dispatch to Allerton (baked) or live path
    // by the ACTIVE field — one listener survives innerHTML rebuilds.
    if (chipsBox) chipsBox.addEventListener("click", function (ev) {
      var btn = ev.target.closest ? ev.target.closest(".date-chip") : null;
      if (!btn) return;
      var key = btn.getAttribute("data-date");
      hide("date-missing");
      var di2 = document.getElementById("date-input");
      if (di2) di2.value = "";
      var active = AGRIOS_FOCUS_R2.getActive && AGRIOS_FOCUS_R2.getActive();
      if (active && active.live && active.read) {
        var win = root.AGRIOS_LIVE.parsers.timeAxis(active.read.history || [], active.read.forecasts || []);
        renderLiveDay(active.read, win, key, true);
      } else {
        applyForecastDay(key);
      }
    });
    // ON-DEMAND OBSERVED FETCH (spec-observed-on-demand-v1). A past day before the
    // held window is a single ACIS/PRISM fetch. State machine (one date section):
    //   held    — the day is already in read.history → recompute, NO fetch.
    //   fetching — an inline loading line while fetchObservedDay resolves.
    //   ok      — push the row into read.history (ascending), persist the CACHED
    //             read to localStorage so it survives reload, then recompute the
    //             SAME way an in-axis day does (setField, no further fetch).
    //   failed  — the honest inline note; display unchanged, no recompute.
    // The no-refetch invariant now applies to HELD days only.
    function onDemandObservedFetch(read, dateStr) {
      var live = root.AGRIOS_LIVE;
      if (!live || !live.fetchObservedDay) {
        setText("date-missing", "observed record unreachable for " + fmtHumanDate(dateStr) +
          " — this page can't run a live read here."); show("date-missing"); return;
      }
      // fetching state — inline loading line (reuses the date-section note slot)
      setText("date-missing", "fetching the observed record for " + fmtHumanDate(dateStr) + " — NOAA ACIS…");
      show("date-missing");
      live.fetchObservedDay(read.lat, read.lon, dateStr).then(function (row) {
        if (!row) {
          setText("date-missing", "observed record unreachable for " + fmtHumanDate(dateStr) +
            " — NOAA ACIS didn't answer; try again."); show("date-missing"); return;
        }
        // OK — insert ascending into read.history (replace any same-date entry)
        var hist = read.history || (read.history = []);
        var at = hist.length;
        for (var i = 0; i < hist.length; i++) {
          if (hist[i].dateStr === row.dateStr) { hist.splice(i, 1); at = i; break; }
          if (hist[i].dateStr > row.dateStr) { at = i; break; }
        }
        hist.splice(at, 0, row);
        // PERSIST — update the cached read in localStorage so the fetched day
        // survives a reload (Allerton is baked, never cached — guarded by live).
        try { live.cacheWrite(read); } catch (e) { /* quota/disabled — skip */ }
        // recompute the SAME way an in-axis day does (the axis now holds the day)
        hide("date-missing");
        var win2 = live.parsers.timeAxis(read.history || [], read.forecasts || []);
        renderLiveDay(read, win2, dateStr, true);
      }).catch(function (err) {
        if (err && err.futureDate) {
          // future-beyond-window: the unchanged honest refusal (no fetch path)
          var win3 = live.parsers.timeAxis(read.history || [], read.forecasts || []);
          setText("date-missing", "No record or forecast held for that date. This read holds the observed record " +
            fmtHumanDate(win3.firstDate) + "–" + fmtHumanDate(win3.todayStr) + " and the forecast through " +
            fmtHumanDate(win3.lastDate) + " only. The future beyond the forecast is a projection nobody has.");
          show("date-missing"); return;
        }
        setText("date-missing", "observed record unreachable for " + fmtHumanDate(dateStr) +
          " — NOAA ACIS didn't answer; try again."); show("date-missing");
      });
    }

    // free date input: Allerton → only the two held days change anything. Live →
    // an in-axis day recomputes (no fetch); a PAST day before the held window is
    // fetched on demand (state machine above); a FUTURE day beyond the forecast
    // keeps the honest refusal (a projection nobody has).
    var dateInput = document.getElementById("date-input");
    if (dateInput) dateInput.addEventListener("change", function () {
      var v = dateInput.value;
      var active = AGRIOS_FOCUS_R2.getActive && AGRIOS_FOCUS_R2.getActive();
      if (active && active.live && active.read) {
        var win = root.AGRIOS_LIVE.parsers.timeAxis(active.read.history || [], active.read.forecasts || []);
        var has = win.days.some(function (d) { return d.dateStr === v; });
        if (has) { hide("date-missing"); renderLiveDay(active.read, win, v, true); return; }
        // NOT held. A PAST day → fetch on demand; a FUTURE day → honest refusal.
        if (v && v < win.todayStr) {
          onDemandObservedFetch(active.read, v);
        } else {
          // FUTURE-BEYOND-FORECAST — the unchanged honest refusal, NO fetch.
          setText("date-missing", "No record or forecast held for that date. This read holds the observed record " +
            fmtHumanDate(win.firstDate) + "–" + fmtHumanDate(win.todayStr) + " and the forecast through " +
            fmtHumanDate(win.lastDate) + " only. The future beyond the forecast is a projection nobody has.");
          show("date-missing");
        }
        return;
      }
      if (FC[v]) { hide("date-missing"); applyForecastDay(v); }
      else {
        // NO forecast held — honest refusal, display unchanged.
        setText("date-missing", D.forecastMissingNote);
        show("date-missing");
      }
    });

    // --- LOCATION: read this field, or the honest capability card ---
    var readBtn = document.getElementById("loc-read");
    if (readBtn) readBtn.addEventListener("click", function () {
      var la = document.getElementById("loc-lat"), lo = document.getElementById("loc-lon");
      var latStr = (la && la.value || "").trim().replace(/−/g, "-");
      var lonStr = (lo && lo.value || "").trim().replace(/−/g, "-");
      // empty → treat as "this field" (placeholders show the field coords)
      var P = AGRIOS_FOCUS_R2.PARCEL_BBOX;
      var midLat = (P.lat[0] + P.lat[1]) / 2, midLon = (P.lon[0] + P.lon[1]) / 2;
      var lat = latStr === "" ? midLat : parseFloat(latStr);
      var lon = lonStr === "" ? midLon : parseFloat(lonStr);
      // basic validation: numeric + in-range
      if (isNaN(lat) || isNaN(lon)) {
        showLocMsg("Enter numeric latitude and longitude.");
        return;
      }
      if (lat < -90 || lat > 90) { showLocMsg("Latitude must be between −90 and 90."); return; }
      if (lon < -180 || lon > 180) { showLocMsg("Longitude must be between −180 and 180."); return; }
      hide("loc-msg");
      // within the stated parcel bbox → this field: close + recenter (reset).
      // (This preserves the baked Allerton as the in-field default.)
      var inField = lat >= P.lat[0] && lat <= P.lat[1] && lon >= P.lon[0] && lon <= P.lon[1];
      if (inField) {
        hide("capability-card");
        var d = document.getElementById("field-dialog");
        if (d) closeDialog(d);
        AGRIOS_FOCUS_R2.setField(null); // restore baked Allerton
        return;
      }
      // OFF-FIELD: a real live read — but only when served over http(s) with a
      // connection and the live engine present. On file:// / no engine, the
      // honest capability card (kept verbatim) + the network-need line.
      var canLive = root.AGRIOS_LIVE &&
        typeof fetch !== "undefined" &&
        root.location && /^https?:$/.test(root.location.protocol);
      if (!canLive) {
        setText("cap-lead", "This page can't run a live read here. For " +
          AGRIOS_FOCUS_R2.fmtDeg(lat) + ", " + AGRIOS_FOCUS_R2.fmtDeg(lon) +
          " a live AGRIOS fetches:");
        show("capability-card");
        setText("cap-network", "To go live from this Mac: double-click \u201CStart AGRIOS.command\u201D in the AgriosBuild folder \u2014 it starts a local server and reopens this page with live reads enabled. (The GitHub Pages version reads live as-is.)");
        show("cap-network");
        return;
      }
      // EPQS is US-only — warn (but still attempt; NWS/elevation will surface it).
      if (lat < 24 || lat > 50 || lon < -125 || lon > -66) {
        showLocMsg("Elevation (USGS EPQS) is US-only — a read outside the US will fail honestly.");
      }
      hide("capability-card");
      startLiveRead(lat, lon);
    });

    // ---- LIVE READ FLOW: progress panel (per-source R2 rows + Cancel) → on
    // completion, setField(read); on failure, honest per-source lines; on
    // elevation-total-failure, a retry offer; Cancel aborts cleanly. -----------
    var liveController = null;
    function startLiveRead(lat, lon) {
      var live = root.AGRIOS_LIVE;
      // cache hit? offer cached read + re-read live (spec §3 cache).
      var cached = live.cacheRead(lat, lon);
      if (cached && cached.read) {
        showCacheOffer(lat, lon, cached);
        return;
      }
      runLiveRead(lat, lon);
    }
    function runLiveRead(lat, lon) {
      var live = root.AGRIOS_LIVE;
      var dateEl = document.getElementById("date-input");
      var dateStr = (dateEl && dateEl.value) ? dateEl.value : null;
      showProgress();
      liveController = (typeof AbortController !== "undefined") ? new AbortController() : null;
      var signal = liveController && liveController.signal;
      live.fetchRead(lat, lon, {
        dateStr: dateStr,
        signal: signal,
        onProgress: updateProgressRow
      }).then(function (read) {
        live.cacheWrite(read);
        hideProgress();
        var d = document.getElementById("field-dialog");
        if (d) closeDialog(d);
        // If this read's coords match a SAVED field, restore its identity
        // (name + stated bounds) so a re-read keeps its claim (spec §4).
        var meta = null;
        if (root.AGRIOS_FIELDS) {
          var key = live.cacheKey(read.lat, read.lon);
          var saved = root.AGRIOS_FIELDS.findByReadKey(root.AGRIOS_FIELDS.loadRegistry(), key);
          if (saved) {
            root.AGRIOS_FIELDS.touchLastRead(saved.id);
            meta = { id: saved.id, name: saved.name, bounds: saved.bounds || null,
              boundsSetAt: saved.boundsSetAt != null ? saved.boundsSetAt : null, createdAt: saved.createdAt };
          }
        }
        AGRIOS_FOCUS_R2.setField(read, meta);
        setFieldChipState(true, read);
      }).catch(function (err) {
        if (err && err.aborted) { hideProgress(); return; } // clean cancel
        if (err && err.elevationFailed) {
          showProgressFail("Elevation itself failed — terrain can't be drawn without it.", true, lat, lon);
        } else {
          showProgressFail("The read could not complete: " + (err && err.message ? err.message : "network error") + ".", true, lat, lon);
        }
      });
    }
    function cancelLiveRead() {
      if (liveController) { try { liveController.abort(); } catch (e) {} }
      hideProgress();
    }
    root.__AGRIOS_RUN_LIVE__ = runLiveRead; // exposed for the retry button

    // ---- PROGRESS PANEL (R2 rows per source, live counts, Cancel) -----------
    var PROG_SOURCES = [
      { key: "elevation", label: "Elevation", detail: "USGS 3DEP EPQS · 972 points" },
      { key: "surround", label: "Surround terrain", detail: "USGS 3DEP EPQS · context ring, coarse 3× spacing (failable)" },
      { key: "soil", label: "Soil", detail: "USDA SSURGO · SDA" },
      { key: "soil-polygons", label: "Soil boundaries", detail: "USDA SSURGO polygons · SDA (heaviest fetch)" },
      { key: "weather", label: "Weather", detail: "NWS api.weather.gov" },
      { key: "history", label: "History", detail: "NOAA ACIS · PRISM ~4km observed (failable)" },
      { key: "roads", label: "Roads", detail: "Census TIGER" },
      { key: "hydro", label: "Streams & ponds", detail: "USGS NHD" },
      { key: "buildings", label: "Buildings", detail: "FEMA/ORNL USA Structures (slow, failable)" }
    ];
    function showProgress() {
      hide("capability-card"); hide("loc-msg");
      var host = document.getElementById("live-progress");
      if (!host) return;
      var rows = PROG_SOURCES.map(function (s) {
        return '<li class="prog-row" data-src="' + s.key + '">' +
          '<span class="prog-state" aria-hidden="true">◌</span>' +
          '<span class="prog-body"><span class="prog-label">' + s.label + '</span>' +
          '<span class="prog-detail">' + s.detail + '</span></span>' +
          '<span class="prog-count"></span></li>';
      }).join("");
      host.innerHTML = '<p class="prog-title">Reading this location…</p>' +
        '<ul class="prog-list">' + rows + '</ul>' +
        '<p class="prog-note" id="prog-note"></p>' +
        '<div class="prog-actions"><button type="button" id="prog-cancel" class="loc-read-btn prog-cancel">Cancel</button>' +
        '<button type="button" id="prog-retry" class="loc-read-btn" hidden>Retry the read</button></div>';
      host.hidden = false;
      var cancel = document.getElementById("prog-cancel");
      if (cancel) cancel.addEventListener("click", cancelLiveRead);
    }
    function updateProgressRow(source, info) {
      var row = document.querySelector('#live-progress .prog-row[data-src="' + source + '"]');
      if (!row) return;
      var st = row.querySelector(".prog-state"), ct = row.querySelector(".prog-count");
      if (info.state === "run") { row.classList.add("prog-row--run"); if (st) st.textContent = "◍"; }
      if (info.state === "done") { row.classList.remove("prog-row--run"); row.classList.add("prog-row--done"); if (st) st.textContent = "✓"; }
      if (info.state === "fail") { row.classList.remove("prog-row--run"); row.classList.add("prog-row--fail"); if (st) st.textContent = "✕"; }
      if (ct) {
        if (info.total > 1) ct.textContent = info.done + "/" + info.total;
        else if (info.state === "done") ct.textContent = info.note || "done";
        else if (info.state === "fail") ct.textContent = info.note || "unreachable";
        else ct.textContent = "…";
      }
      if (info.note && info.state === "done" && source === "elevation") {
        setText("prog-note", info.note);
      }
    }
    function hideProgress() {
      var host = document.getElementById("live-progress");
      if (host) { host.hidden = true; host.innerHTML = ""; }
    }
    function showProgressFail(msg, offerRetry, lat, lon) {
      setText("prog-note", msg);
      var cancel = document.getElementById("prog-cancel");
      if (cancel) cancel.textContent = "Back";
      var retry = document.getElementById("prog-retry");
      if (retry && offerRetry) {
        retry.hidden = false;
        retry.onclick = function () { hideProgress(); runLiveRead(lat, lon); };
      }
    }
    // cache-hit flow: offer the cached read (with its saved time) or a re-read.
    function showCacheOffer(lat, lon, cached) {
      var host = document.getElementById("live-progress");
      if (!host) return;
      var when = new Date(cached.savedAt).toLocaleString();
      host.innerHTML = '<p class="prog-title">Cached read from ' + when + '</p>' +
        '<p class="prog-note">A read for these coordinates is cached. Use it, or re-read live from the sources.</p>' +
        '<div class="prog-actions">' +
        '<button type="button" id="cache-use" class="loc-read-btn">Use cached read</button>' +
        '<button type="button" id="cache-reread" class="loc-read-btn prog-cancel">Re-read live</button></div>';
      host.hidden = false;
      var use = document.getElementById("cache-use");
      if (use) use.addEventListener("click", function () {
        hideProgress();
        var d = document.getElementById("field-dialog"); if (d) closeDialog(d);
        var meta = null;
        if (root.AGRIOS_FIELDS && root.AGRIOS_LIVE) {
          var saved = root.AGRIOS_FIELDS.findByReadKey(root.AGRIOS_FIELDS.loadRegistry(), root.AGRIOS_LIVE.cacheKey(lat, lon));
          if (saved) meta = { id: saved.id, name: saved.name, bounds: saved.bounds || null, boundsSetAt: saved.boundsSetAt != null ? saved.boundsSetAt : null, createdAt: saved.createdAt };
        }
        AGRIOS_FOCUS_R2.setField(cached.read, meta);
        setFieldChipState(true, cached.read);
      });
      var re = document.getElementById("cache-reread");
      if (re) re.addEventListener("click", function () { runLiveRead(lat, lon); });
    }

    function showLocMsg(m) { setText("loc-msg", m); show("loc-msg"); hide("capability-card"); }
    function setText(id, t) { var e = document.getElementById(id); if (e) e.textContent = t; }
    function show(id) { var e = document.getElementById(id); if (e) e.hidden = false; }
    function hide(id) { var e = document.getElementById(id); if (e) e.hidden = true; }
  }

  /* =========================================================================
   * LAYERS PANEL — charger-filter-pattern rows. Toggling shows/hides SVG groups.
   * ========================================================================= */
  function wireLayers(mapCtl) {
    var panel = document.getElementById("layers-panel");
    var btn = document.getElementById("ctl-layers");
    if (btn && panel) {
      btn.addEventListener("click", function () {
        var open = panel.classList.toggle("open");
        panel.setAttribute("aria-hidden", open ? "false" : "true");
        btn.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }
    var footnote = document.getElementById("plots-footnote");
    document.querySelectorAll(".layer-row[data-layer]").forEach(function (row) {
      row.addEventListener("click", function () {
        var on = !row.classList.contains("layer-row--on");
        row.classList.toggle("layer-row--on", on);
        row.setAttribute("aria-pressed", on ? "true" : "false");
        var name = row.getAttribute("data-layer");
        mapCtl.setLayer(name, on);
        // the speculative-plots framing footnote shows only while plots are on
        if (name === "plots" && footnote) footnote.hidden = !on;
      });
    });
    // close when clicking outside
    document.addEventListener("click", function (e) {
      if (!panel || !panel.classList.contains("open")) return;
      if (panel.contains(e.target) || (btn && btn.contains(e.target))) return;
      panel.classList.remove("open");
      panel.setAttribute("aria-hidden", "true");
      if (btn) btn.setAttribute("aria-expanded", "false");
    });
  }

  /* =========================================================================
   * DRAGGABLE BOTTOM SHEET (mobile). Reused mechanics from focus/focus.js.
   * ========================================================================= */
  function wireSheet() {
    var sheet = document.getElementById("sheet");
    var handle = document.getElementById("sheet-handle");
    if (!sheet || !handle) return;
    var snaps = { peek: 0.18, half: 0.5, full: 0.9 };
    var state = "peek";
    function setState(s) {
      state = s;
      sheet.style.setProperty("--sheet-h", (snaps[s] * 100).toFixed(1) + "vh");
      sheet.setAttribute("data-state", s);
    }
    setState("peek");
    root.__RAISE_SHEET__ = function () { if (state === "peek") setState("half"); };

    var dragging = false, startY = 0, startH = 0;
    function px() { return window.innerHeight; }
    handle.addEventListener("pointerdown", function (e) {
      dragging = true; startY = e.clientY;
      startH = sheet.getBoundingClientRect().height;
      handle.setPointerCapture(e.pointerId);
      sheet.classList.add("dragging");
    });
    handle.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var dy = startY - e.clientY;
      var h = Math.max(snaps.peek * px(), Math.min(snaps.full * px(), startH + dy));
      sheet.style.setProperty("--sheet-h", h + "px");
    });
    function endDrag() {
      if (!dragging) return;
      dragging = false;
      sheet.classList.remove("dragging");
      var h = sheet.getBoundingClientRect().height / px();
      var nearest = "peek", best = Infinity;
      Object.keys(snaps).forEach(function (k) {
        var d = Math.abs(snaps[k] - h);
        if (d < best) { best = d; nearest = k; }
      });
      setState(nearest);
    }
    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);
    handle.addEventListener("click", function () {
      if (!dragging) setState(state === "peek" ? "full" : (state === "full" ? "peek" : "full"));
    });
  }

  /* =========================================================================
   * THEME TOGGLE — rail button, sun/moon glyph, aria-pressed, localStorage
   * persistence. Light is the R2 default identity; dark is explicit opt-in
   * only (deliberately does NOT auto-follow prefers-color-scheme — see spec).
   * ========================================================================= */
  var THEME_KEY = "agrios-theme";

  // Apply whatever theme is in localStorage (else default LIGHT, i.e. no
  // data-theme attr at all) as early as possible — called before the map first
  // renders so the initial band/base-rect fills are already correct and there
  // is no light→dark flash on a stored-dark reload.
  function applyStoredTheme() {
    var stored = null;
    try { stored = root.localStorage.getItem(THEME_KEY); } catch (e) {}
    if (stored === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme"); // default: light
    return stored === "dark";
  }

  function wireTheme(mapCtl) {
    var btn = document.getElementById("rail-theme");
    var glyph = btn ? btn.querySelector(".rail-glyph") : null;
    function reflect(isDark) {
      if (btn) btn.setAttribute("aria-pressed", isDark ? "true" : "false");
      if (glyph) glyph.textContent = isDark ? "◑" : "◐";
    }
    reflect(document.documentElement.getAttribute("data-theme") === "dark");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var isDark = document.documentElement.getAttribute("data-theme") === "dark";
      var next = !isDark;
      if (next) document.documentElement.setAttribute("data-theme", "dark");
      else document.documentElement.removeAttribute("data-theme");
      reflect(next);
      if (mapCtl && mapCtl.retintMap) mapCtl.retintMap();
      try { root.localStorage.setItem(THEME_KEY, next ? "dark" : "light"); } catch (e) {}
    });
  }

  /* =========================================================================
   * FLOATING CIRCULAR CONTROLS — zoom ± / recenter / layers.
   * ========================================================================= */
  function wireControls(mapCtl) {
    var rc = document.getElementById("ctl-recenter");
    if (rc) rc.addEventListener("click", function () { mapCtl.reset(); });
    // zoom ± nudge the free view about its center (manual mode), so they work
    // whether or not a zone is active.
    var zi = document.getElementById("ctl-zoom-in"), zo = document.getElementById("ctl-zoom-out");
    if (zi) zi.addEventListener("click", function () { mapCtl.zoomBy(1.35); });
    if (zo) zo.addEventListener("click", function () { mapCtl.zoomBy(1 / 1.35); });
  }

  /* =========================================================================
   * FIELD CONTENT BUILDERS — rail/sheet content for the ACTIVE field.
   *
   * Allerton (baked): the bootstrap builds the worked reading (zone cards,
   * refusal, weather) at load and registers a rebuild fn via
   * registerAllertonContent — so switching back restores it EXACTLY.
   *
   * Live read (spec §4 — honest scope, LAW): banner (verbatim), stat tiles,
   * soil inventory card, structures inventory card, weather tile from REAL
   * periods, collection-low candidate card (rule stated — NO priority chip),
   * live provenance with REAL fetch timestamps. NO zone narratives, NO
   * confidence, NO refusals, NO priority chips anywhere in this path.
   * ========================================================================= */
  var _allertonContentFn = null;
  function registerAllertonContent(fn) { _allertonContentFn = fn; }
  function buildAllertonContent() { if (_allertonContentFn) _allertonContentFn(); }

  // ---- FIELD CHIP + SWITCHER (spec-saved-fields-v1 §4). The chip grows up into
  // a field switcher: a small R2 charger-row panel listing Allerton (the baked
  // worked example · analyst layer), the saved fields, and the current unsaved
  // read if there is one. The chip appears once ANY switch target exists (a
  // saved field or a live read). Its label reflects the ACTIVE field's name.
  var _lastLiveRead = null;
  function setFieldChipState(hasLive, read) {
    if (hasLive && read) _lastLiveRead = read;
    var chip = document.getElementById("field-chip");
    if (!chip) return;
    // the chip is shown whenever there is somewhere to switch to: a live read
    // this session, OR at least one saved field in the registry.
    var savedCount = 0;
    if (root.AGRIOS_FIELDS) { try { savedCount = root.AGRIOS_FIELDS.loadRegistry().fields.length; } catch (e) {} }
    if (!_lastLiveRead && savedCount === 0) { chip.hidden = true; return; }
    chip.hidden = false;
    var txt = document.getElementById("field-chip-text");
    if (txt) {
      // label = the ACTIVE field's name (bounded/unbounded saved field), else
      // its coords (unsaved read), else "Allerton, IA" (baked default).
      if (ACTIVE.live) {
        txt.textContent = (ACTIVE.field && ACTIVE.field.name)
          ? ACTIVE.field.name
          : (AGRIOS_FOCUS_R2.fmtDeg(ACTIVE.read.lat) + ", " + AGRIOS_FOCUS_R2.fmtDeg(ACTIVE.read.lon));
      } else {
        txt.textContent = "Allerton, IA";
      }
    }
  }

  // Restore a saved field from the read cache instantly (spec §4): setField the
  // cached read with the field's meta (name + bounds), stamp lastReadAt, and
  // drop a quiet "cached {time} · re-read" chip into the header wired to the
  // existing re-read flow (root.__AGRIOS_RUN_LIVE__).
  function restoreSavedField(field) {
    var live = root.AGRIOS_LIVE;
    if (!live || !field.readKey) { showCachedChip(field, null); return false; }
    var raw = null;
    try { raw = root.localStorage.getItem(field.readKey); } catch (e) {}
    var parsed = null;
    if (raw) { try { parsed = JSON.parse(raw); } catch (e) {} }
    if (!parsed || !parsed.read) { showCachedChip(field, null); return false; }
    AGRIOS_FOCUS_R2.setField(parsed.read, fieldMetaOf(field));
    if (root.AGRIOS_FIELDS) root.AGRIOS_FIELDS.touchLastRead(field.id);
    showCachedChip(field, parsed.savedAt);
    return true;
  }
  // the field meta setField needs (bounds identity + name + claim dates).
  function fieldMetaOf(field) {
    return { id: field.id, name: field.name, bounds: field.bounds || null,
      boundsSetAt: field.boundsSetAt != null ? field.boundsSetAt : null,
      createdAt: field.createdAt };
  }
  // "cached {time} · re-read" chip — a quiet header chip; the re-read half runs
  // the existing live-read flow for this field's coords.
  function showCachedChip(field, savedAt) {
    var host = document.querySelector(".pill-row");
    if (!host) return;
    var old = document.getElementById("cached-chip");
    if (old) old.remove();
    var when = savedAt ? root.AGRIOS_FIELDS.relativeTime(savedAt) : "cache";
    var chip = document.createElement("button");
    chip.id = "cached-chip";
    chip.className = "cached-chip";
    chip.setAttribute("aria-label", "Cached read " + when + " — re-read live from the sources");
    chip.innerHTML = '<span class="cached-chip-when">cached ' + esc(when) + '</span>' +
      '<span class="cached-chip-sep">·</span><span class="cached-chip-reread">re-read</span>';
    chip.addEventListener("click", function () {
      chip.remove();
      if (root.__AGRIOS_RUN_LIVE__) {
        // open the dialog so the re-read progress panel is visible, then run.
        var d = document.getElementById("field-dialog");
        if (d) { d.classList.add("open"); d.setAttribute("aria-hidden", "false"); }
        root.__AGRIOS_RUN_LIVE__(field.lat, field.lon);
      }
    });
    host.appendChild(chip);
  }
  function clearCachedChip() { var c = document.getElementById("cached-chip"); if (c) c.remove(); }

  function wireFieldChip() {
    var chip = document.getElementById("field-chip");
    if (!chip) return;
    chip.setAttribute("aria-haspopup", "menu");
    chip.setAttribute("aria-expanded", "false");
    chip.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleSwitcher();
    });
    // close the switcher on outside click / Escape
    document.addEventListener("click", function (e) {
      var panel = document.getElementById("field-switcher");
      if (!panel || panel.hidden) return;
      if (panel.contains(e.target) || chip.contains(e.target)) return;
      closeSwitcher();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      // spec-switcher-a11y-v1 §5: while an inline delete-confirm is open,
      // Escape cancels JUST the confirm (handled by switcherKeydown, which
      // stops propagation) — it must NOT also fall through and close the
      // whole panel. If no confirm is open, Escape closes normally.
      var panel = document.getElementById("field-switcher");
      if (panel && !panel.hidden && panel.querySelector(".switch-confirm:not([hidden])")) return;
      closeSwitcher();
    });
    // spec-switcher-a11y-v1 §3: one delegated keydown handler drives the menu's
    // keyboard contract (arrows/Home/End/Enter/Space/Delete/Backspace/Escape/Tab).
    var list = document.getElementById("switcher-list");
    if (list) list.addEventListener("keydown", switcherKeydown);
  }

  function toggleSwitcher() {
    var panel = document.getElementById("field-switcher");
    if (!panel) return;
    if (panel.hidden) openSwitcher(); else closeSwitcher();
  }
  // spec-switcher-a11y-v1 §1: opening the menu MUST move focus in — to the
  // active row if one is rendered, else the first row. Applies uniformly to
  // mouse-open too (simplest single rule; a real menu doesn't split behavior
  // by input device).
  function openSwitcher() {
    var panel = document.getElementById("field-switcher");
    var chip = document.getElementById("field-chip");
    if (!panel) return;
    buildSwitcher();
    panel.hidden = false;
    if (chip) chip.setAttribute("aria-expanded", "true");
    var list = document.getElementById("switcher-list");
    if (list) {
      var target = list.querySelector(".switch-row--active") || list.querySelector(".switch-row");
      if (target) focusSwitcherRow(target);
    }
  }
  // spec-switcher-a11y-v1 §4: focus returns to the chip on close, but ONLY if
  // focus was actually inside the panel when it closed (outside-click close
  // leaves focus wherever the user clicked — this rule is a no-op there since
  // activeElement won't be contained).
  function closeSwitcher() {
    var panel = document.getElementById("field-switcher");
    var chip = document.getElementById("field-chip");
    var focusWasInside = !!(panel && panel.contains(document.activeElement));
    if (panel) panel.hidden = true;
    if (chip) {
      chip.setAttribute("aria-expanded", "false");
      if (focusWasInside) chip.focus();
    }
  }
  // spec-switcher-a11y-v1 §2: roving tabindex — exactly one row is a Tab stop
  // (tabindex=0), every other row is -1. Moving focus rolls the rove forward.
  function focusSwitcherRow(row) {
    if (!row) return;
    var list = document.getElementById("switcher-list");
    if (list) {
      list.querySelectorAll(".switch-row").forEach(function (r) { r.setAttribute("tabindex", "-1"); });
    }
    row.setAttribute("tabindex", "0");
    row.focus();
  }

  // Build the switcher rows (spec §4): Allerton (worked example · analyst layer)
  // + saved rows (name / small coords / relative lastReadAt / 1-line note
  // preview / inline × with confirm) + an "unsaved read" row when the active
  // read is not in the registry.
  function buildSwitcher() {
    var list = document.getElementById("switcher-list");
    if (!list) return;
    var F = root.AGRIOS_FIELDS;
    var reg = F ? F.loadRegistry() : { fields: [] };
    var rows = "";

    // 1 · Allerton — always present, baked, labeled worked example.
    var allertonActive = !ACTIVE.live;
    rows += '<div class="switch-row switch-row--allerton' + (allertonActive ? ' switch-row--active' : '') +
      '" role="menuitem" tabindex="-1" data-target="allerton">' +
      '<div class="switch-main"><span class="switch-name">Allerton, IA</span>' +
      '<span class="switch-coords">40.8980, −93.1970</span></div>' +
      '<span class="switch-note">worked example — analyst layer</span></div>';

    // 2 · saved fields
    reg.fields.forEach(function (f) {
      var isActive = ACTIVE.live && ACTIVE.field && ACTIVE.field.id === f.id;
      var rel = F ? F.relativeTime(f.lastReadAt) : "";
      var coords = AGRIOS_FOCUS_R2.fmtDeg(f.lat) + ", " + AGRIOS_FOCUS_R2.fmtDeg(f.lon);
      rows += '<div class="switch-row switch-row--saved' + (isActive ? ' switch-row--active' : '') +
        '" role="menuitem" tabindex="-1" data-target="saved" data-id="' + esc(f.id) + '">' +
        '<div class="switch-main">' +
          '<span class="switch-name">' + esc(f.name) + (f.bounds ? ' <span class="switch-bounded" title="stated bounds">◱</span>' : '') + '</span>' +
          '<span class="switch-coords">' + esc(coords) + '</span>' +
          '<span class="switch-when">' + esc(rel) + '</span>' +
        '</div>' +
        (f.note ? '<span class="switch-note">' + esc(f.note) + '</span>' : '') +
        '<button class="switch-del" tabindex="-1" data-id="' + esc(f.id) + '" aria-label="Delete ' + esc(f.name) + '">×</button>' +
        '<span class="switch-confirm" data-id="' + esc(f.id) + '" hidden>Delete? <button class="switch-confirm-yes" data-id="' + esc(f.id) + '">Yes</button> <button class="switch-confirm-no">No</button></span>' +
        '</div>';
    });

    // 3 · the current UNSAVED read (a live read not matched to any saved field)
    if (ACTIVE.live && ACTIVE.read && (!ACTIVE.field || !ACTIVE.field.id)) {
      var uc = AGRIOS_FOCUS_R2.fmtDeg(ACTIVE.read.lat) + ", " + AGRIOS_FOCUS_R2.fmtDeg(ACTIVE.read.lon);
      rows += '<div class="switch-row switch-row--unsaved switch-row--active" role="menuitem" tabindex="-1" data-target="current">' +
        '<div class="switch-main"><span class="switch-name">unsaved read</span>' +
        '<span class="switch-coords">' + esc(uc) + '</span></div>' +
        '<span class="switch-note">not saved — name it in Field &amp; date to keep it</span></div>';
    }

    list.innerHTML = rows;
    wireSwitcherRows();
  }

  function wireSwitcherRows() {
    var list = document.getElementById("switcher-list");
    if (!list) return;
    // row activation (tap the row body, not the × / confirm)
    list.querySelectorAll(".switch-row").forEach(function (row) {
      function go(e) {
        if (e && (e.target.closest(".switch-del") || e.target.closest(".switch-confirm"))) return;
        var target = row.getAttribute("data-target");
        if (target === "allerton") { clearCachedChip(); AGRIOS_FOCUS_R2.setField(null); }
        else if (target === "current") { /* already showing it */ }
        else if (target === "saved") {
          var id = row.getAttribute("data-id");
          var f = root.AGRIOS_FIELDS && root.AGRIOS_FIELDS.findById(root.AGRIOS_FIELDS.loadRegistry(), id);
          if (f) restoreSavedField(f);
        }
        closeSwitcher();
      }
      row.addEventListener("click", go);
      row.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(e); }
      });
    });
    // delete (× → inline confirm → Yes removes registry entry only). Shared by
    // the pointer-only × AND the keyboard Delete/Backspace route (spec §5).
    list.querySelectorAll(".switch-del").forEach(function (del) {
      del.addEventListener("click", function (e) {
        e.stopPropagation();
        openDeleteConfirm(del.getAttribute("data-id"), false);
      });
    });
    list.querySelectorAll(".switch-confirm-yes").forEach(function (yes) {
      yes.addEventListener("click", function (e) {
        e.stopPropagation();
        var id = yes.getAttribute("data-id");
        var deletedIndex = rowIndexById(list, id);
        if (root.AGRIOS_FIELDS) root.AGRIOS_FIELDS.deleteField(id); // registry only
        buildSwitcher();
        setFieldChipState(!!_lastLiveRead, null);
        // spec §5: after Yes, focus the row now at the deleted row's index,
        // else the last row (the list is one row shorter).
        var freshRows = document.getElementById("switcher-list").querySelectorAll(".switch-row");
        var next = freshRows[deletedIndex] || freshRows[freshRows.length - 1];
        if (next) focusSwitcherRow(next);
      });
    });
    list.querySelectorAll(".switch-confirm-no").forEach(function (no) {
      no.addEventListener("click", function (e) {
        e.stopPropagation();
        var cf = e.target.closest(".switch-confirm");
        var id = cf ? cf.getAttribute("data-id") : null;
        buildSwitcher();
        // spec §5: after No, refocus that field's row (match by data-id).
        refocusRowById(id);
      });
    });
    // Escape while a confirm is open cancels it (rebuild) and refocuses that
    // field's row — it does NOT close the panel (spec §5). stopPropagation
    // keeps this from also reaching the document-level Escape-closes-panel
    // handler in wireFieldChip.
    list.querySelectorAll(".switch-confirm").forEach(function (cf) {
      cf.addEventListener("keydown", function (e) {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        var id = cf.getAttribute("data-id");
        buildSwitcher();
        refocusRowById(id);
      });
    });
  }
  // shared delete-confirm opener: hides the × for `id`, reveals its inline
  // confirm, and — for the keyboard route (spec §5) — moves focus to the
  // "No" button (the safe default for a destructive confirm).
  function openDeleteConfirm(id, focusNo) {
    var list = document.getElementById("switcher-list");
    if (!list || !id) return;
    var del = list.querySelector('.switch-del[data-id="' + cssEsc(id) + '"]');
    if (del) del.hidden = true;
    var cf = list.querySelector('.switch-confirm[data-id="' + cssEsc(id) + '"]');
    if (cf) {
      cf.hidden = false;
      if (focusNo) {
        var noBtn = cf.querySelector(".switch-confirm-no");
        if (noBtn) noBtn.focus();
      }
    }
  }
  // index of a row within #switcher-list by its data-id (saved rows only).
  function rowIndexById(list, id) {
    var rows = Array.prototype.slice.call(list.querySelectorAll(".switch-row"));
    for (var i = 0; i < rows.length; i++) { if (rows[i].getAttribute("data-id") === id) return i; }
    return -1;
  }
  // refocus a row by data-id after a rebuild (falls back to the first row —
  // the rebuilt list always has at least the Allerton row).
  function refocusRowById(id) {
    var list = document.getElementById("switcher-list");
    if (!list) return;
    var row = id ? list.querySelector('.switch-row[data-id="' + cssEsc(id) + '"]') : null;
    focusSwitcherRow(row || list.querySelector(".switch-row"));
  }
  // escape an id for use inside a CSS attribute selector (ids are [A-Za-z0-9])
  function cssEsc(s) { return String(s).replace(/["\\]/g, "\\$&"); }

  // spec-switcher-a11y-v1 §3: the delegated keydown handler for #switcher-list
  // — the menu's full keyboard contract. All handled keys except Tab call
  // preventDefault(); Tab is left alone so closeSwitcher()'s focus-return to
  // the chip lets the browser continue tabbing naturally from there.
  function switcherKeydown(e) {
    var list = document.getElementById("switcher-list");
    if (!list) return;
    var rows = Array.prototype.slice.call(list.querySelectorAll(".switch-row"));
    if (!rows.length) return;
    var row = e.target.closest(".switch-row");
    var i = row ? rows.indexOf(row) : -1;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (i === -1) i = 0;
      focusSwitcherRow(rows[(i + 1) % rows.length]); // wraps to first past the end
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (i === -1) i = 0;
      focusSwitcherRow(rows[(i - 1 + rows.length) % rows.length]); // wraps to last before the start
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      focusSwitcherRow(rows[0]);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      focusSwitcherRow(rows[rows.length - 1]);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      // activation is already handled by the per-row keydown listener (go());
      // nothing extra to do here.
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      // saved rows only — Allerton/unsaved rows have no delete affordance.
      if (row && row.classList.contains("switch-row--saved")) {
        e.preventDefault();
        openDeleteConfirm(row.getAttribute("data-id"), true);
      }
      return;
    }
    if (e.key === "Escape") {
      // handled by the document-level listener (closes the panel) unless a
      // confirm is open, in which case the per-confirm handler above cancels
      // it and stops propagation before this ever needs to act.
      return;
    }
    if (e.key === "Tab") {
      // do NOT preventDefault — let the browser continue tabbing from the
      // chip once closeSwitcher() returns focus there.
      closeSwitcher();
      return;
    }
  }

  // The v1 live-read banner — kept exported for the v1 assertions. The v2
  // computed path renders COMPUTED_BANNER (below) instead.
  var LIVE_BANNER = "LIVE READ — layers + facts from the sources, no interpretation. " +
    "The zone reading (boundary-loop passes 2–3, confidence, refusals) is the analyst layer — " +
    "Allerton shows a worked example.";

  // The permanent COMPUTED-READING banner — VERBATIM per spec v2 §2. It carries
  // the computed-reading text word-for-word; changing it fails review. This is
  // what the live (computed) rail/sheet shows at the top and the header honesty
  // line carries. The computed reading is DISTINCT from the analyst layer.
  var COMPUTED_BANNER = "COMPUTED READING — edges found by geometry, priorities by printed rules, " +
    "conflicts held open. No authored interpretation; Allerton shows the analyst layer.";

  // short on-map fact-label for a computed zone: "Lamoni · low band" (soil first
  // word + band). Facts only — never prose. Falls back to the band alone when
  // soil is unmapped (degraded / elevation-only zones).
  function czShortLabel(z) {
    var band = z.band === "low" ? "low band" : (z.band === "mid" ? "mid band" : "upper band");
    if (!z.soilName) return band;
    var first = String(z.soilName).split(/[ ,]/)[0];
    return first + " · " + band;
  }
  // Short labels live in a SMALLER label space than the engine's full fact
  // label — the drainage class is dropped — so two zones can print identically
  // here even when their full labels differ. Disambiguate collisions the same
  // way the engine does (spec-flag-zone-identity-v1 §C): append the zone's
  // compass-octant FACT, then the cell count if octants still collide. Returns
  // a { zoneId: shortLabel } map so dock chips and map labels agree exactly.
  function czShortLabelMap(zones) {
    var by = {}, out = {};
    zones.forEach(function (z) { var b = czShortLabel(z); (by[b] = by[b] || []).push(z); });
    Object.keys(by).forEach(function (base) {
      var group = by[base];
      if (group.length < 2) { out[group[0].id] = base; return; }
      var counts = {};
      group.forEach(function (z) {
        out[z.id] = z.octant ? base + " · " + z.octant : base;
        counts[out[z.id]] = (counts[out[z.id]] || 0) + 1;
      });
      group.forEach(function (z) {
        if (counts[out[z.id]] > 1) out[z.id] = out[z.id] + " (" + z.cellCount + " cells)";
      });
    });
    return out;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function fmtFt(v) { return (Math.round(v * 10) / 10).toFixed(1); }

  // Build the live rail/sheet content and swap header/pill/provenance to live.
  function buildLiveContent(read, reading) {
    var live = root.AGRIOS_LIVE;
    reading = reading || (root.AGRIOS_ENGINE && read.demGrid ? root.AGRIOS_ENGINE.computeReading(read) : null);
    var grid = read.demGrid.grid;
    // elevation facts (feet)
    var flat = [];
    grid.forEach(function (row) { row.forEach(function (v) { flat.push(v); }); });
    var minEl = Math.min.apply(null, flat), maxEl = Math.max.apply(null, flat);
    var relief = maxEl - minEl;
    // gradient direction: lowest cell → whole-grid mean, expressed as the shed
    // direction (from high toward low). Use the collection-low centroid vs grid
    // center for a simple, honest "water sheds toward" fact.
    var ny = grid.length, nx = grid[0].length;
    var cLon = (read.gridBbox.lon[0] + read.gridBbox.lon[1]) / 2;
    var cLat = (read.gridBbox.lat[0] + read.gridBbox.lat[1]) / 2;
    var shed = read.collectionLow
      ? live.bearingName(cLat, cLon, read.collectionLow.lat, read.collectionLow.lon)
      : null;
    var sampleM = Math.round(live.EXTENT_LON_M / (nx - 1));

    // --- coords + date header ---
    var latS = AGRIOS_FOCUS_R2.fmtDeg(read.lat), lonS = AGRIOS_FOCUS_R2.fmtDeg(read.lon);
    var coordName = latS + ", " + lonS;
    var dateLabel = read.dateStr || "today";

    // --- stat tiles (elevation range / relief / gradient / sampling) ---
    var tiles =
      statTile("Elevation range", fmtFt(minEl) + "–" + fmtFt(maxEl) + " ft",
        "USGS 3DEP · EPQS point service · " + nx + "×" + ny + " = " + (nx * ny) + " points" +
        (read.demGrid.holes_filled_by_neighbor_mean ? " · " + read.demGrid.holes_filled_by_neighbor_mean + " neighbor-filled" : "")) +
      statTile("Relief", fmtFt(relief) + " ft", "max − min over the read extent") +
      statTile("Water sheds toward", shed ? shed : "—", "from the read's high ground toward its lowest connected cells") +
      statTile("Sampling", "~" + sampleM + " m", "live-read resolution; a deeper read samples denser · 10 ft contour interval");

    // --- soil inventory card (list: name, drainage, slope, % by comppct) ---
    var soilRows = (read.soil.inventory || []).map(function (r) {
      return '<li class="soil-row">' +
        '<span class="soil-name">' + esc(r.muname || r.compname || "—") + '</span>' +
        '<span class="soil-meta">' +
          (r.drainagecl ? esc(r.drainagecl) : "drainage n/a") +
          (r.slope ? " · " + esc(r.slope) : "") +
          (r.comppct != null ? " · " + esc(r.comppct) + "% of unit" : "") +
        '</span></li>';
    }).join("");
    var soilFail = read.failures.some(function (f) { return f.source === "soil"; });
    var soilCard = '<article class="live-card"><h2 class="live-card-title">Soil inventory</h2>' +
      '<p class="live-card-sub">USDA SSURGO · Soil Data Access · map units intersecting the read extent</p>' +
      (soilFail
        ? '<p class="live-absence">SSURGO unreachable — no soil inventory for this read.</p>'
        : (soilRows ? '<ul class="soil-list">' + soilRows + '</ul>'
                    : '<p class="live-absence">No soil map units returned for this extent.</p>')) +
      '</article>';

    // --- structures inventory card (n roads named / n flowlines / n ponds) ---
    var B = read.boundaries;
    var namedRoads = (B.roads || []).filter(function (r) { return r.name; });
    var roadNames = {};
    namedRoads.forEach(function (r) { roadNames[r.name] = true; });
    var nRoadNames = Object.keys(roadNames).length;
    var nlow = read.collectionLow;
    var nearestLine = "";
    if (nlow && nlow.nearestFlowline) {
      nearestLine = '<li class="struct-row"><span class="struct-k">Nearest flowline to collection-low</span>' +
        '<span class="struct-v">' + Math.round(nlow.nearestFlowline.m) + " m " + esc(nlow.nearestFlowline.dir) +
        (nlow.nearestFlowline.name ? " · " + esc(nlow.nearestFlowline.name) : "") + '</span></li>';
    }
    var roadFail = read.failures.some(function (f) { return f.source === "roads"; });
    var hydroFail = read.failures.some(function (f) { return f.source === "hydro"; });
    var bldgFail = read.failures.some(function (f) { return f.source === "buildings"; });
    // ditch count (NHD CanalDitch FCODE 33600–33603) — surfaced only when present
    var nDitches = (B.streams || []).filter(function (s) { var fc = Number(s.fcode); return fc >= 33600 && fc <= 33603; }).length;
    // buildings: total + how many are occupancy-class Agriculture (FEMA/ORNL)
    var buildings = B.buildings || [];
    var nAgBldg = buildings.filter(function (b) { return b.occ != null && String(b.occ).trim().toLowerCase() === "agriculture"; }).length;
    var structCard = '<article class="live-card"><h2 class="live-card-title">Structures</h2>' +
      '<p class="live-card-sub">Census TIGER roads + USGS NHD flowlines &amp; waterbodies + FEMA/ORNL building footprints · context-grade, partly DEM-derived, footprints not survey</p>' +
      '<ul class="struct-list">' +
        (roadFail
          ? '<li class="struct-row"><span class="struct-k">Roads</span><span class="struct-v live-absence">TIGER unreachable — no road layer</span></li>'
          : '<li class="struct-row"><span class="struct-k">Roads</span><span class="struct-v">' + (B.roads || []).length + ' segments · ' + nRoadNames + ' named</span></li>') +
        (hydroFail
          ? '<li class="struct-row"><span class="struct-k">Streams / ponds</span><span class="struct-v live-absence">NHD unreachable — no stream layer</span></li>'
          : '<li class="struct-row"><span class="struct-k">Flowlines</span><span class="struct-v">' + (B.streams || []).length + ' segments' + (nDitches ? ' · ' + nDitches + ' ditch' + (nDitches === 1 ? '' : 'es') : '') + '</span></li>' +
            '<li class="struct-row"><span class="struct-k">Ponds (in-extent)</span><span class="struct-v">' + (B.waterbodies || []).length + '</span></li>') +
        (bldgFail
          ? '<li class="struct-row"><span class="struct-k">Buildings</span><span class="struct-v live-absence">buildings unreachable — no structures layer this read</span></li>'
          : '<li class="struct-row"><span class="struct-k">Buildings</span><span class="struct-v">' + buildings.length + ' footprints' + (nAgBldg ? ' · ' + nAgBldg + ' agricultural' : '') + '</span></li>') +
        nearestLine +
      '</ul></article>';

    // --- weather tile: OBSERVED (past day) vs FORECAST (today/future) tile ---
    // (spec-time-axis-v1). A selected past day shows the measured ACIS record
    // (pcpn + hi/lo, labeled "observed · NOAA PRISM ~4km"); today/future shows
    // the NWS forecast as before. The day is observed when it appears in the
    // ACIS history strictly before today AND is not the forecast hinge — the
    // engine's precip context already resolves the past to the record; here the
    // TILE mirrors that so the two are visibly, verbally distinct.
    var periods = read.forecasts || [];
    var history = read.history || [];
    var axisToday = live.parsers.timeAxis(history, periods).todayStr;
    var obsRow = null;
    if (read.dateStr && read.dateStr < axisToday) {
      for (var oi = 0; oi < history.length; oi++) { if (history[oi].dateStr === read.dateStr) { obsRow = history[oi]; break; } }
    }
    var historyFail = read.failures.some(function (f) { return f.source === "history"; });
    var weatherFail = read.failures.some(function (f) { return f.source === "weather"; });
    var wxCard;
    if (read.dateStr && read.dateStr < axisToday) {
      // PAST day → the observed record tile (or an honest absence).
      if (obsRow) {
        var pcpnTxt = (obsRow.pcpn != null) ? obsRow.pcpn.toFixed(2) + '" rain' : "rain n/a";
        var wetTxt = (obsRow.pcpn != null && obsRow.pcpn >= 0.1) ? " · rain recorded" : "";
        var hiTxt = (obsRow.maxt != null) ? obsRow.maxt + "°F" : "—";
        var loTxt = (obsRow.mint != null) ? obsRow.mint + "°F" : "—";
        wxCard = '<article class="live-card"><h2 class="live-card-title">Observed record</h2>' +
          '<p class="live-card-sub">observed · NOAA PRISM ~4km · the measured record for ' + esc(dateLabel) + '</p>' +
          '<div class="wx-periods"><div class="wx-period wx-period--observed">' +
            '<span class="wx-period-name">' + esc(dateLabel) + '</span>' +
            '<span class="wx-period-temp">' + esc(hiTxt) + " / " + esc(loTxt) + '</span>' +
            '<span class="wx-period-desc">' + esc(pcpnTxt) + esc(wetTxt) + '</span></div></div></article>';
      } else {
        wxCard = '<article class="live-card"><h2 class="live-card-title">Observed record</h2>' +
          '<p class="live-absence">' + (historyFail
            ? "observed record unavailable — no history for this read."
            : "observed record for " + esc(dateLabel) + " not held yet — pick it in the date panel to fetch it on demand (NOAA PRISM).") + '</p></article>';
      }
    } else {
      // TODAY / FUTURE → the NWS forecast tile (unchanged).
      var forDate = live.parsers.periodsForDate(periods, read.dateStr);
      var wxSource = (forDate.length ? forDate : periods).slice(0, 2);
      if (weatherFail) {
        wxCard = '<article class="live-card"><h2 class="live-card-title">Forecast</h2>' +
          '<p class="live-absence">api.weather.gov unreachable — no forecast for this read.</p></article>';
      } else if (!wxSource.length) {
        wxCard = '<article class="live-card"><h2 class="live-card-title">Forecast</h2>' +
          '<p class="live-absence">No NWS forecast period covers ' + esc(dateLabel) + '. NWS returns ~7 days; pick a nearer date.</p></article>';
      } else {
        var wxRows = wxSource.map(function (p) {
          return '<div class="wx-period"><span class="wx-period-name">' + esc(p.name) + '</span>' +
            '<span class="wx-period-temp">' + esc(p.tempF) + '°' + esc(p.temperatureUnit || "F") + '</span>' +
            '<span class="wx-period-desc">' + esc(p.shortForecast) + (p.pop != null ? ' · ' + esc(p.pop) + '% precip' : '') + '</span></div>';
        }).join("");
        wxCard = '<article class="live-card"><h2 class="live-card-title">Forecast</h2>' +
          '<p class="live-card-sub">NWS api.weather.gov · gridpoint forecast, real periods</p>' +
          '<div class="wx-periods">' + wxRows + '</div></article>';
      }
    }

    // (The v1 stand-alone "collection-low candidate" card is retired in v2: the
    // collection-low now feeds the computed zones' salience, the R1 rule, and the
    // F1 conflict flag; its cell count shows in the Pass-1 edges summary.)

    // --- COMPUTED ZONE CARDS (spec §5) — the computed reading. Each: fact-label
    // title, a rule chip (look-first/look/quiet + id; the rule text verbatim in a
    // hoverable/tappable title+detail), a "data support n/4 · sampled ~Xm" line,
    // stat tiles (soil / band / structure), and ONE template sentence (from the
    // finite checked-in TEMPLATES). data-zone id wires scroll-sync/dock exactly
    // like Allerton zones. Vocabulary is LAW: no analyst-layer numerals, no
    // percent on zones; chips ONLY look-first / look / quiet.
    var zoneCards = "", flagCards = "";
    if (reading) {
      zoneCards = (reading.zones || []).map(function (z) { return computedZoneCard(z, reading); }).join("");
      flagCards = (reading.flags || []).map(function (fl) { return heldOpenFlagCard(fl); }).join("");
    }
    var computedIntro = reading
      ? '<article class="live-card cz-intro"><h2 class="live-card-title">Computed zones</h2>' +
        '<p class="live-card-sub">boundary loop by geometry + printed rules · ' + esc(reading.version) + ' · ' + esc(reading.rulesStamp) + '</p>' +
        (reading.degraded
          ? '<p class="live-absence">Soil boundaries were unreachable — zones computed from elevation structure alone (no soil-conflict flags).</p>'
          : '<p class="cz-edges">' +
              (reading.edges.drainageTransitions.classesMeeting.length
                ? esc(reading.edges.drainageTransitions.classesMeeting.length) + ' drainage-class edge(s), '
                : 'no drainage-class edges, ') +
              esc(reading.edges.slopeBreakCells) + ' slope-break cells, ' +
              esc(reading.edges.flowlines) + ' flowline segment(s), ' +
              esc(reading.edges.roads) + ' road segment(s) found in Pass 1.</p>') +
        '</article>'
      : '';

    // SAVED-FIELD identity (spec-saved-fields-v1): a bounded saved field states
    // its bounds (the honest-bounds line + NAME in the pill); an unbounded saved
    // field keeps the "no field bounds stated" scope line, named only. The date
    // the claim was drawn is the field's boundsSetAt (or createdAt) — verbatim
    // pattern per spec §2.
    var fld = ACTIVE.field;
    var hasStatedBounds = !!(fld && fld.bounds);
    function claimDate(f) {
      var ms = (f.boundsSetAt != null ? f.boundsSetAt : f.createdAt);
      var dt = new Date(ms);
      if (isNaN(dt.getTime())) return "today";
      var mm = String(dt.getMonth() + 1).padStart(2, "0");
      var dd = String(dt.getDate()).padStart(2, "0");
      return dt.getFullYear() + "-" + mm + "-" + dd;
    }
    var statedBoundsLine = hasStatedBounds
      ? ("stated bounds: yours — a claim you made " + claimDate(fld) + ", drawn solid.")
      : "no field bounds stated — showing the full read extent";
    var extentSub = hasStatedBounds
      ? statedBoundsLine
      : ("no field bounds stated — showing the full read extent · sampled ~" + sampleM + " m");

    // --- assemble the rail/sheet card column (COMPUTED reading leads; the v1
    // read-extent / soil / structures / weather fact cards remain BELOW, spec §5)
    // Unsaved live read: a direct, visible entry to naming/saving (Adam couldn't
    // find the save flow from the dialog alone — this chip IS the doorway).
    var saveEntry = (!fld || !fld.id)
      ? '<button class="save-entry-chip">Save this field — name it, state bounds…</button>'
      : '';
    var content =
      saveEntry +
      '<div class="live-banner live-banner--computed" role="note">' + esc(COMPUTED_BANNER) + '</div>' +
      computedIntro + zoneCards + flagCards +
      '<article class="live-card"><h2 class="live-card-title">' + (hasStatedBounds ? "Stated bounds" : "Read extent") + '</h2>' +
        '<p class="live-card-sub">' + esc(statedBoundsLine) + '</p>' +
        '<div class="stat-tiles">' + tiles + '</div></article>' +
      soilCard + structCard + wxCard;

    var railMount = document.getElementById("rail-cards");
    var sheetMount = document.getElementById("sheet-cards");
    if (railMount) railMount.innerHTML = content;
    if (sheetMount) sheetMount.innerHTML = content;

    // computed-zone dock chips (spec §5) — replace the Allerton chips on a live
    // read. Built from the reading's zones (data-zone ids match the cards/map).
    buildComputedDock(reading);
    // save-entry chip → open the Field & date dialog at the save section
    document.querySelectorAll(".save-entry-chip").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var pill = document.querySelector(".field-pill");
        if (pill) pill.click(); // opens the Field & date dialog (wired there)
        var sec = document.getElementById("save-field-section");
        if (sec) sec.scrollIntoView({ block: "start", behavior: "auto" });
        var nm = document.getElementById("save-name");
        if (nm) nm.focus();
      });
    });
    // rule chips: tap/keyboard reveals the rule text verbatim (hover already
    // shows it via title/aria-label). The chip stops the event so tapping it
    // does NOT also activate the card's zone-focus.
    wireComputedChips();

    // header + pill. A SAVED field shows its NAME (pill row 1); coords move to
    // the Field & date dialog. An unsaved read shows coords as the field name.
    var displayName = (fld && fld.name) ? fld.name : coordName;
    setTxt("field-name", displayName);
    setTxt("field-date", dateLabel);
    setTxt("field-sub", extentSub);
    setTxt("field-honesty", COMPUTED_BANNER);
    setTxt("field-pill-text", displayName + " · " + dateLabel);
    var fnm = document.querySelector(".field-name"); if (fnm) fnm.textContent = displayName;
    document.querySelectorAll(".field-date").forEach(function (el) { el.textContent = dateLabel; });
    var fsm = document.querySelector(".field-sub-m"); if (fsm) fsm.textContent = hasStatedBounds ? (displayName + " · stated bounds") : "live read · no stated field bounds";

    // sheet peek
    setTxt("sheet-peek-zone", "Computed read · " + displayName);

    // live provenance dialog (REAL fetch timestamps + engine stamp)
    buildLiveProvenance(read, reading);
  }

  function statTile(label, value, cond) {
    return '<div class="stat-tile"><p class="stat-label">' + esc(label) + '</p>' +
      '<p class="stat-value">' + esc(value) + '</p>' +
      '<p class="stat-cond">' + esc(cond) + '</p></div>';
  }
  function setTxt(id, t) { var e = document.getElementById(id); if (e) e.textContent = t; }

  /* =========================================================================
   * COMPUTED ZONE CARD (spec §5). fact-label title · rule chip (look-first/look/
   * quiet + id; rule text verbatim in title+detail, hover/tap reveals) · data-
   * support line (n/4 · sampled ~Xm — NEVER a %, NEVER "confidence") · stat tiles
   * · ONE template sentence (from the finite TEMPLATES). data-zone wires sync.
   * ========================================================================= */
  function computedZoneCard(z, reading) {
    var chipClass = z.rule.chip === "look-first" ? "cz-chip--lookfirst"
      : (z.rule.chip === "look" ? "cz-chip--look" : "cz-chip--quiet");
    var chipText = z.rule.chip + (z.rule.id && z.rule.id !== "DEFAULT" ? " · " + z.rule.id : "");
    var ds = z.dataSupport;
    var supportLine = "data support " + ds.n + "/" + ds.m +
      (ds.samplingM != null ? " · sampled ~" + ds.samplingM + " m" : "");
    // stat tiles: soil / band / structure / cells — facts only
    var tiles =
      statTile("Soil", z.soilName ? esc(z.soilName) : "soil boundaries unreachable",
        (z.drainagecl ? esc(z.drainagecl) : "drainage n/a") + (z.slope ? " · " + esc(z.slope) : "")) +
      statTile("Band", (z.band === "low" ? "low" : (z.band === "mid" ? "mid" : "upper")),
        "parcel-free elevation tercile of the read") +
      statTile("Structure", (z.flowlineCrosses ? "flowline crosses" : (z.straddleBreak ? "slope break" : "none crossing")),
        z.hasLow ? "contains the collection-low" : "no collection-low inside") +
      // Buildings fact tile (spec §3): nearest FEMA/ORNL footprint to the zone
      // centroid, distance rounded to 10 m + its occupancy class — "within ~X m ·
      // nearest: Agriculture" — or "none nearby" when the read has no footprints.
      statTile("Buildings",
        (z.nearestBuildingM != null ? "within ~" + (Math.round(z.nearestBuildingM / 10) * 10) + " m" : "none nearby"),
        (z.nearestBuildingM != null ? "nearest: " + esc(z.nearestBuildingOcc || "Unclassified") : "no footprints in this read")) +
      // the empty socket, on purpose (Adam, 2026-07-05): every zone card shows
      // what ISN'T connected yet — the roadmap rendered as a waiting input.
      '<div class="stat-tile stat-tile--muted">' +
        '<p class="stat-label">On-farm layer</p>' +
        '<p class="stat-value stat-value--muted">not connected</p>' +
        '<p class="stat-cond">needs field hardware — soil probes, yield monitor, array telemetry. Connect them to light this layer.</p>' +
      '</div>'  +
      statTile("Size", z.cellCount + " cells", "connected component (drainage + band)");
    return '<article class="live-card cz-card" data-zone="' + esc(z.id) + '" tabindex="0" role="button" ' +
        'aria-label="' + esc(z.label) + ' — ' + esc(z.rule.chip) + ' (rule ' + esc(z.rule.id) + ')">' +
      '<div class="cz-card-head">' +
        '<h2 class="live-card-title cz-fact-label">' + esc(z.label) + '</h2>' +
        '<span class="cz-chip ' + chipClass + '" tabindex="0" title="' + esc(z.rule.text) + '" ' +
          'aria-label="' + esc(z.rule.text) + '">' + esc(chipText) + '</span>' +
      '</div>' +
      // hero numeral (the R2 74-degree move) — honest content: the SUPPORT
      // FRACTION at display scale, never a percentage (Adam missed the big
      // numeral's anchor on computed cards, 2026-07-05; the typography returns,
      // the semantics stay computed).
      '<div class="conf-row cz-hero-row">' +
        '<span class="conf-num cz-hero">' + ds.n + '<span class="cz-hero-frac">/' + ds.m + '</span></span>' +
        '<span class="conf-label">Data support<br><span class="cz-support-inline">' + esc(supportLine.replace(/^data support \d+\/\d+( · )?/, "")) + '</span></span>' +
      '</div>' +
      '<div class="stat-tiles">' + tiles + '</div>' +
      '<p class="cz-sentence">' + esc(z.template.sentence) + '</p>' +
      '<p class="cz-rule-text" hidden>' + esc(z.rule.text) + '</p>' +
      '</article>';
  }

  /* =========================================================================
   * HELD-OPEN FLAG CARD (spec §5). The two disagreeing sources VERBATIM + "the
   * public data cannot decide — ground truth needed." Reuses the refusal-block
   * treatment (amber, held open). Rendered after the zones.
   * ========================================================================= */
  function heldOpenFlagCard(fl) {
    // data-flag carries the INSTANCE uid so the popover's "Read why ↓" + the
    // cross-highlight land on THIS pond's card, not the first of its rule (§D).
    // The TITLE stays verbatim (computed-vocabulary LAW); for an F2 we add ONE
    // located fact line — a fact, not a rewrite — via fmtDeg (§B).
    var locatedLine = fl.where
      ? '<p class="flag-located">pond ≈ ' + esc(fl.where.octant) + ' of the read center · ' +
          esc(fmtDeg(fl.where.lat)) + ', ' + esc(fmtDeg(fl.where.lon)) + '</p>'
      : '';
    return '<article class="live-card flag-card" data-flag="' + esc(fl.uid) + '">' +
      '<h2 class="live-card-title flag-title"><span class="flag-mark">⟨?⟩</span> ' + esc(fl.title) + '</h2>' +
      '<div class="flag-reads">' +
        '<p class="flag-read"><span class="flag-src">' + esc(fl.readA.source) + '</span> ' + esc(fl.readA.text) + '</p>' +
        '<p class="flag-read"><span class="flag-src">' + esc(fl.readB.source) + '</span> ' + esc(fl.readB.text) + '</p>' +
      '</div>' +
      locatedLine +
      '<p class="flag-cannot">' + esc(fl.cannotDecide) + '</p>' +
      '</article>';
  }

  /* =========================================================================
   * COMPUTED CHIPS — reveal the fired rule text verbatim on tap/keyboard (hover
   * shows it via title/aria-label). The chip stops event propagation so tapping
   * it doesn't also fire the card's zone-focus. Toggles the hidden .cz-rule-text.
   * ========================================================================= */
  function wireComputedChips() {
    document.querySelectorAll(".cz-card .cz-chip").forEach(function (chip) {
      var card = chip.closest(".cz-card");
      var text = card ? card.querySelector(".cz-rule-text") : null;
      function toggle(e) {
        if (e) { e.stopPropagation(); e.preventDefault(); }
        if (!text) return;
        var show = text.hidden;
        text.hidden = !show;
        chip.setAttribute("aria-expanded", show ? "true" : "false");
      }
      chip.addEventListener("click", toggle);
      chip.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") toggle(e);
      });
    });
  }

  /* =========================================================================
   * COMPUTED DOCK (spec §5). On a live read the Allerton zone chips are replaced
   * by computed-zone chips (one per computed zone, data-zone ids matching the
   * cards + map). Rebuilt each read. The Allerton chips (in index.html) are
   * hidden by .is-live CSS; these are injected into #dock.
   * ========================================================================= */
  function buildComputedDock(reading) {
    var dock = document.getElementById("dock");
    if (!dock) return;
    // remove any previously-injected computed chips
    dock.querySelectorAll(".dock-chip--computed").forEach(function (el) { el.remove(); });
    if (!reading || !reading.zones || !reading.zones.length) return;
    var czShorts = czShortLabelMap(reading.zones); // collision-aware short labels
    reading.zones.forEach(function (z) {
      var b = document.createElement("button");
      b.className = "dock-chip dock-chip--computed";
      b.setAttribute("data-zone", z.id);
      var label = document.createElement("span");
      label.className = "dock-chip-label";
      label.textContent = czShorts[z.id];
      b.appendChild(label);
      dock.appendChild(b);
    });
  }

  // Live provenance — each fetched source WITH its real timestamp + limit, and
  // any failed source listed honestly (never fabricated). Stamps the engine
  // version + rules on a live (computed) read.
  function buildLiveProvenance(read, reading) {
    var ts = read.timestamps || {};
    function when(k) { return ts[k] ? new Date(ts[k]).toLocaleString() : "not fetched"; }
    var failMap = {};
    read.failures.forEach(function (f) { failMap[f.source] = f.consequence; });
    var polyNote = (read.soilBoundariesSimplified
      ? " · " + read.soilBoundariesSimplified + " ring(s) client-simplified (Douglas-Peucker, ~½ cell)"
      : "");
    var rows = [
      { key: "elevation", name: "USGS 3DEP", detail: "EPQS point service · " + read.demGrid.nx + "×" + read.demGrid.ny + " points · fetched " + when("elevation"), limit: read.demGrid.spacing_m },
      // SURROUND context terrain (spec-surround-context-v1) — FAILABLE. Listed
      // only when it succeeded or failed for this read (a pre-spec cached read has
      // no surround field and no failure entry → the row is omitted). The coarse
      // 3× spacing (v1.1) is stated in the limit, never hidden.
      { key: "surround", name: "USGS 3DEP (surround)", detail: "EPQS ring · " + (read.surround ? read.surround.ringPoints + " points" : "context ring") + " · coarse (3× core spacing) · fetched " + when("surround"), limit: read.surround ? read.surround.spacing : "context terrain beyond the read core — coarse (3× core spacing), context not survey", _optional: true },
      { key: "soil", name: "USDA SSURGO (attributes)", detail: "Soil Data Access · fetched " + when("soil"), limit: "mapped at 1:24,000 — map-unit boundary located to ±~40 m" },
      { key: "soil-polygons", name: "USDA SSURGO (boundaries)", detail: "SDA mupolygon geometry · Reduce(0.00005) · fetched " + when("soilPolygons") + polyNote, limit: "map-unit polygons, server-simplified; holes ignored at this scale" },
      { key: "weather", name: "NWS forecast", detail: "api.weather.gov gridpoint · fetched " + when("weather"), limit: "grid forecast, not a field observation" },
      { key: "roads", name: "Census TIGER", detail: "TIGERweb roads + rail · fetched " + when("roads"), limit: "context/access-grade positional accuracy (±~10 m class), not survey" },
      { key: "hydro", name: "USGS NHD", detail: "flowlines + waterbodies · fetched " + when("hydro"), limit: "large-scale, partly DEM-derived; waterbodies filtered to centroid-in-bbox" },
      { key: "buildings", name: "FEMA/ORNL USA Structures", detail: "building footprints · OCC_CLS/SQFEET/HEIGHT · fetched " + when("buildings"), limit: "ML+parcel-derived footprints, occupancy classed — not survey" }
    ];
    var html = rows.filter(function (r) {
      // the optional surround row appears only when it succeeded or failed for
      // this read (a pre-spec cached read has neither → omit it, never fabricate).
      if (r._optional && r.key === "surround") return !!read.surround || !!failMap.surround;
      return true;
    }).map(function (r) {
      var failed = failMap[r.key];
      return '<li><span class="prov-name">' + esc(r.name) + (failed ? ' — unreachable' : '') + '</span>' +
        '<span class="prov-detail">' + esc(r.detail) + '</span>' +
        '<span class="prov-limit">' + (failed ? 'consequence: ' + esc(failed) : 'limit: ' + esc(r.limit)) + '</span></li>';
    }).join("");
    // engine stamp row (spec §5 provenance): "engine v2.0 · rules R1–R4, F1–F2 printed"
    if (reading) {
      html += '<li><span class="prov-name">Computed reading engine</span>' +
        '<span class="prov-detail">' + esc(reading.version) + " · " + esc(reading.rulesStamp) + '</span>' +
        '<span class="prov-limit">' + (reading.degraded ? "degraded — elevation-only zones (soil boundaries unreachable)" : "zones + rules + held-open flags computed from the sources above") + '</span></li>';
    }
    var ps = document.getElementById("prov-sources");
    if (ps) ps.innerHTML = html;
    setTxt("prov-date", (ts.elevation ? new Date(ts.elevation).toLocaleString() : "this session"));
    var pu = document.getElementById("prov-unavailable");
    if (pu) pu.innerHTML = '<li>the analyst layer (authored narrative, confidence %, delta) — the computed reading uses printed rules + data support instead (Allerton shows the analyst layer)</li>' +
      '<li>on-farm soil moisture, ET0, agricultural debt (need field sensors)</li>' +
      // the honest non-layer (spec §4, verbatim): roadside ditches are not in public data.
      '<li>Roadside ditches are not mapped in public data. Roads are drawn as lines only; where a reading calls a road a hydrological interceptor, that is stated inference, not mapped geometry.</li>';
  }

  /* =========================================================================
   * PUBLIC API + init
   * ========================================================================= */
  var AGRIOS_FOCUS_R2 = {
    registerAllertonContent: registerAllertonContent,
    LIVE_BANNER: LIVE_BANNER,
    COMPUTED_BANNER: COMPUTED_BANNER,
    buildLiveContent: buildLiveContent,
    // saved fields (spec-saved-fields-v1): expose the active-field accessor +
    // chip-state helper so the Field & date dialog's SAVE section can read the
    // current live read and refresh the chip after a save.
    getActive: function () { return ACTIVE; },
    setFieldChipState: function (hasLive, read) { return setFieldChipState(hasLive, read); },
    marchingSquares: marchingSquares,
    stitch: stitch,
    contourLevels: contourLevels,
    buildContours: buildContours,
    buildBands: buildBands,
    buildFillLayer: buildFillLayer,
    lerpHex: lerpHex,
    chaikinSmooth: chaikinSmooth,
    catmullRomPath: catmullRomPath,
    ZONES: ZONES,
    PARCEL: PARCEL,
    GRID_BBOX: GRID_BBOX,
    PARCEL_BBOX: PARCEL_BBOX,
    zoneGrid: zoneGrid,
    buildPlots: buildPlots,
    parcelInteriorStats: parcelInteriorStats,

    // Feature A: view→bounds inversion + degree formatting, exposed for node
    // unit tests (verify.js feeds a known transform, asserts expected bounds).
    fmtDeg: fmtDeg,
    gxToLon: gxToLon,
    gyToLat: gyToLat,
    lonToGX: lonToGX,
    latToGY: latToGY,
    viewToBounds: viewToBounds,
    makeUnprojector: makeUnprojector,
    W: W, H: H, PAD: PAD,

    applyStoredTheme: applyStoredTheme,

    // ---- RE-INITIALIZABLE FIELD RENDER (spec §4 live-read architecture) ------
    // renderField() draws the map + wires scroll-sync from the CURRENT grid and
    // the ACTIVE config. It is called once at boot (baked Allerton) and again by
    // setField() for every field switch (Allerton ↔ live read). It tears the map
    // mount down and rebuilds it; the chrome (rail buttons, controls, layers,
    // theme, field dialog) is wired ONCE in init() against MAP_PROXY, which
    // always delegates to the current controller (root.__FOCUS_MAP__) — so a
    // re-render never orphans a handler.
    renderField: function (grid, opts) {
      opts = opts || {};
      var interval = opts.interval || 5, indexEvery = opts.indexEvery || 25;
      var nx = grid[0].length, ny = grid.length;
      var contours = buildContours(grid, interval, indexEvery);
      var bands = buildBands(grid, interval);
      var mount = document.getElementById("focus-map");
      if (!mount) return { contours: contours, bands: bands };
      while (mount.firstChild) mount.removeChild(mount.firstChild); // tear down
      var mapCtl = renderMap(mount, bands, contours, nx, ny, grid);
      root.__FOCUS_MAP__ = mapCtl;
      var scrollRoot = matchMedia("(max-width:720px)").matches
        ? document.getElementById("sheet-scroll")
        : document.getElementById("rail");
      wireScrollSync(mapCtl, scrollRoot);
      return { contours: contours, bands: bands, mapCtl: mapCtl };
    },

    // ---- setField(read | null, fieldMeta?) — the single entry point that
    // switches the active field. read===null (or omitted) restores the baked
    // ALLERTON field; a live read object (from AGRIOS_LIVE.assembleRead /
    // fetchRead / the read cache) switches to it: reassigns GRID_BBOX to the
    // read's extent, sets ACTIVE, rebuilds rail/sheet content, then renderField()
    // on the read's grid at the live 10 ft / 50 ft interval.
    //
    // fieldMeta (spec-saved-fields-v1) is the SAVED-FIELD identity for this read:
    //   { id, name, bounds|null, boundsSetAt, createdAt } — or null for an
    // unsaved read. When it carries BOUNDS, this is the honest-bounds path
    // (spec §2, DESIGN LAW): PARCEL_BBOX is set to the stated-bounds rectangle
    // so renderMap's EXISTING Allerton stated-bounds code runs unchanged — the
    // outside-mute wash, the solid hairline parcel boundary, and parcel framing.
    // The engine still computes over the FULL read extent (bounds are identity,
    // not blinders). An unbounded saved field renders live exactly like an
    // unsaved read (no wash). ACTIVE.field carries the meta for the header +
    // pill name.
    setField: function (read, fieldMeta) {
      applyStoredTheme();
      if (!read) {
        GRID_BBOX = ALLERTON_GRID_BBOX;
        PARCEL_BBOX = ALLERTON_PARCEL_BBOX;
        ACTIVE = { live: false, read: null, structures: null, collectionLow: null, reading: null, field: null };
        document.body.classList.remove("is-live");
        document.body.classList.remove("has-surround"); // Allerton bakes its own ext grid
        buildComputedDock(null); // remove any injected computed-zone dock chips
        recomputeParcel();
        buildAllertonContent();
        var rA = AGRIOS_FOCUS_R2.renderField(root.DEM_GRID_EXT.grid, { interval: 5, indexEvery: 25 });
        setFieldChipState(false, null);
        return rA;
      }
      GRID_BBOX = { lat: read.gridBbox.lat, lon: read.gridBbox.lon, nx: read.gridBbox.nx, ny: read.gridBbox.ny };
      // STATED-BOUNDS PATH: a saved field with bounds sets the PARCEL_BBOX-
      // equivalent (spec §2). bounds {n,s,e,w} → the PARCEL_BBOX {lat:[s,n],
      // lon:[w,e]} shape renderMap already knows. Everything downstream (wash,
      // boundary, framing, zoneless recenter) reuses Allerton's exact path.
      var boundsMeta = fieldMeta && fieldMeta.bounds ? fieldMeta.bounds : null;
      PARCEL_BBOX = boundsMeta
        ? { lat: [boundsMeta.s, boundsMeta.n], lon: [boundsMeta.w, boundsMeta.e] }
        : null; // no stated field bounds → live render, no wash (honest scope)
      // Run the COMPUTED BOUNDARY LOOP (spec v2 §4): the engine turns the read
      // into computed zones + held-open flags, deterministically. Stored on
      // ACTIVE so renderMap can trace the zones and buildLiveContent can card them.
      var reading = (root.AGRIOS_ENGINE && read.demGrid) ? root.AGRIOS_ENGINE.computeReading(read) : null;
      ACTIVE = { live: true, read: read, structures: read.boundaries, collectionLow: read.collectionLow, reading: reading, field: fieldMeta || null };
      document.body.classList.add("is-live");
      // context terrain beyond the read core (spec-surround-context-v1) — present
      // only when the failable surround ring succeeded; the Layers row + render
      // gate on it. A v4 cached read predating this spec has no surround field.
      document.body.classList.toggle("has-surround", !!(read.surround && read.surround.grid));
      recomputeParcel();
      buildLiveContent(read, reading);
      var rL = AGRIOS_FOCUS_R2.renderField(read.demGrid.grid, { interval: 10, indexEvery: 50 });
      setFieldChipState(true, read);
      return rL;
    },

    init: function (grid) {
      // apply any stored theme FIRST so the first paint (band/base-rect fills,
      // both computed from the live cascade) is already correct — no flash.
      applyStoredTheme();
      var r = AGRIOS_FOCUS_R2.renderField(grid, { interval: 5, indexEvery: 25 });
      // Chrome wired ONCE against a proxy that always hits the CURRENT controller
      // (root.__FOCUS_MAP__), so re-renders (setField) never orphan a handler.
      var MAP_PROXY = {
        focusZone: function () { return root.__FOCUS_MAP__.focusZone.apply(null, arguments); },
        reset: function () { return root.__FOCUS_MAP__.reset(); },
        setLayer: function () { return root.__FOCUS_MAP__.setLayer.apply(null, arguments); },
        retintMap: function () { return root.__FOCUS_MAP__.retintMap(); },
        zoomBy: function () { return root.__FOCUS_MAP__.zoomBy.apply(null, arguments); },
        setView: function () { return root.__FOCUS_MAP__.setView.apply(null, arguments); },
        getBounds: function () { return root.__FOCUS_MAP__.getBounds(); },
        get svg() { return root.__FOCUS_MAP__.svg; }
      };
      wireDialogs();
      wireFieldDialog(MAP_PROXY);
      wireLayers(MAP_PROXY);
      wireSheet();
      wireControls(MAP_PROXY);
      wireTheme(MAP_PROXY);
      wireFieldChip();
      // If a live read is cached from a prior session, surface the field chip so
      // the user can jump to it (Allerton stays the boot default).
      if (root.AGRIOS_LIVE) {
        var last = root.AGRIOS_LIVE.cacheReadLast();
        if (last && last.read) { _lastLiveRead = last.read; }
      }
      // The chip also surfaces whenever any SAVED field exists (spec §4) — the
      // switcher can restore it from the read cache even with no read this
      // session. setFieldChipState checks the registry itself.
      setFieldChipState(!!_lastLiveRead, null);
      return { contours: r.contours, bands: r.bands };
    }
  };

  root.AGRIOS_FOCUS_R2 = AGRIOS_FOCUS_R2;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { AGRIOS_FOCUS_R2: AGRIOS_FOCUS_R2 };
  }
})(typeof window !== "undefined" ? window : this);
