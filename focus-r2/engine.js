/* =============================================================================
 * AGRIOS Focus — COMPUTED BOUNDARY-LOOP ENGINE (spec-live-read-v2-engine).
 *
 * PURE, node-exportable. No I/O, no globals, no DOM. Given the read grid, the
 * soil polygons, the fetched structures (roads / flowlines / ponds), the
 * collection-low region, and the forecast, it runs the boundary loop the way
 * the analyst reads Allerton — but by GEOMETRY and PRINTED RULES, not by an
 * author. Passes:
 *
 *   Pass 1 — EDGES:   real boundaries (drainage-class transitions, slope
 *                      breaks, the collection-low, flowlines/roads).
 *   Pass 2 — ZONES:   connected components of (drainagecl, band); min 12 cells;
 *                      top 6 by the spec's salience order; boundary traced via
 *                      component-mask marching squares + Chaikin.
 *   Pass 3 — RULES:   R1–R4 + default, EXACT conditions, stable ids, verbatim
 *                      rule TEXT (checked in and reviewable).
 *   FLAGS  — CONFLICT: F1, F2, F3(degraded) — held-open, EXACTLY the refusal
 *                      treatment. Two disagreeing sources shown verbatim.
 *
 * THE COMPUTED-READING VOCABULARY (spec §2 — LAW). The output is DISTINCT from
 * the analyst layer: chips are look-first / look / quiet (never priority);
 * corroboration is "data support n/m sources" (NEVER a % or "confidence");
 * facts + at most ONE template sentence whose blanks are facts (the template
 * list is FINITE and exported here for review). Conflicts are held open by
 * rule, not resolved.
 *
 * STRUCTURE (all pure):
 *   · wktToRings(wkt)                 — POLYGON / MULTIPOLYGON outer rings
 *   · dedupeByPolygonKey(rows)        — one row per mupolygonkey (spec §3)
 *   · douglasPeucker(ring, tol)       — simplify extreme rings (disclosed)
 *   · pointInRing / pointInPolygon    — ray cast, bbox pre-filtered
 *   · rasterize(gridBbox, polys)      — per-cell soil (mukey/drainage/name/slope)
 *   · classifyCells(...)              — band terciles, slopeBreak, inLow,
 *                                       nearFlow, nearRoad
 *   · pass1Edges(...)                 — the edges summary card data
 *   · pass2Zones(...)                 — compound zones (components, salience, trace)
 *   · pass3Rules(zone, ctx)           — R1–R4 + default (verbatim text, stable id)
 *   · conflictFlags(...)              — F1 / F2 / F3
 *   · dataSupport(zone, ctx)          — n/m named sources + sampling density
 *   · TEMPLATES / assembleSentence    — the FINITE template list + assembler
 *   · computeReading(read)            — the orchestrator (pure): runs it all
 *
 * Determinism: every ordering is a total order (ties broken by a stable key),
 * every component walk is deterministic (fixed neighbor order), no Math.random,
 * no Date, no iteration over unordered object keys where order matters. Same
 * input → same output, asserted in the verification suite.
 * ========================================================================== */
(function (root) {
  "use strict";

  var ENGINE_VERSION = "engine v2.0";
  var RULES_STAMP = "rules R1–R4, F1–F2 printed";

  /* =========================================================================
   * DRAINAGE CLASS NORMALIZATION. SSURGO drainagecl strings, case-insensitive.
   * The rule conditions test membership in these canonical sets.
   * ========================================================================= */
  var POOR_SET = { "very poorly drained": 1, "poorly drained": 1, "somewhat poorly drained": 1 };
  var WELL_SET = { "well drained": 1, "moderately well drained": 1, "somewhat excessively drained": 1, "excessively drained": 1 };
  function drainKey(d) { return (d == null ? "" : String(d)).trim().toLowerCase(); }
  function isPoorish(d) { return !!POOR_SET[drainKey(d)]; }
  function isWellish(d) { return !!WELL_SET[drainKey(d)]; }
  // strictly Poorly / Very poorly (R1 test uses the {Poorly, Very poorly,
  // Somewhat poorly} set per spec §4 R1; F1 tests Well/Mod-well).
  function isWellOrModWell(d) { var k = drainKey(d); return k === "well drained" || k === "moderately well drained"; }

  /* =========================================================================
   * WKT PARSING — POLYGON / MULTIPOLYGON → array of OUTER rings.
   *
   * Each outer ring is [[lon,lat], ...] (SSURGO WKT is "lon lat" order, WGS84).
   * Interior rings (holes) are IGNORED at this scale (disclosed in provenance):
   * a POLYGON's first ring is the outer boundary; subsequent rings are holes.
   * A MULTIPOLYGON is a list of such polygons — we take each polygon's outer
   * ring. Returns [] for anything unparseable (never throws on bad input).
   * ========================================================================= */
  function parseCoordList(s) {
    // "x1 y1, x2 y2, ..." → [[x1,y1],[x2,y2],...]
    var pts = [];
    var parts = s.split(",");
    for (var i = 0; i < parts.length; i++) {
      var xy = parts[i].trim().split(/\s+/);
      if (xy.length < 2) continue;
      var x = parseFloat(xy[0]), y = parseFloat(xy[1]);
      if (isFinite(x) && isFinite(y)) pts.push([x, y]);
    }
    return pts;
  }
  // Split the top-level "((...),(...)),((...))" body into ring-group strings by
  // paren depth. Returns an array of strings, each the content between the
  // OUTERMOST matched parens at the polygon level.
  function splitByDepth(body) {
    // For MULTIPOLYGON the body is "((ring),(hole)),((ring))"; we want each
    // "(...)" group at depth 1 (each polygon). For POLYGON the body is
    // "(ring),(hole)"; each "(...)" at depth 0 is a ring. This helper returns
    // the depth-1 substrings for the given body; the caller strips one layer.
    var groups = [], depth = 0, start = -1;
    for (var i = 0; i < body.length; i++) {
      var ch = body.charAt(i);
      if (ch === "(") { if (depth === 0) start = i + 1; depth++; }
      else if (ch === ")") { depth--; if (depth === 0 && start >= 0) { groups.push(body.slice(start, i)); start = -1; } }
    }
    return groups;
  }
  function wktToRings(wkt) {
    if (wkt == null) return [];
    var s = String(wkt).trim();
    var up = s.toUpperCase();
    var rings = [];
    if (up.indexOf("MULTIPOLYGON") === 0) {
      // strip "MULTIPOLYGON" and the outermost parens → "((ring),(hole)),((ring))"
      var mbody = s.slice(s.indexOf("(") + 1, s.lastIndexOf(")"));
      // each depth-1 group is ONE polygon "(ring),(hole)"
      var polys = splitByDepth(mbody);
      polys.forEach(function (polyBody) {
        // outer ring = first "(...)" group of this polygon
        var polyRings = splitByDepth(polyBody);
        if (polyRings.length) {
          var r = parseCoordList(polyRings[0]);
          if (r.length >= 3) rings.push(r);
        }
      });
    } else if (up.indexOf("POLYGON") === 0) {
      var body = s.slice(s.indexOf("(") + 1, s.lastIndexOf(")"));
      // depth-0 groups here are the rings "(outer),(hole)"; take the first (outer)
      var polyRings = splitByDepth(body);
      if (polyRings.length) {
        var r2 = parseCoordList(polyRings[0]);
        if (r2.length >= 3) rings.push(r2);
      }
    }
    return rings;
  }

  /* =========================================================================
   * DEDUPE BY mupolygonkey (spec §3). Fixture Table rows are:
   *   [mupolygonkey, mukey, muname, compname, drainagecl, slope_l, slope_h, wkt]
   * Multi-major-component map units duplicate a polygon across rows; keep the
   * component with the HIGHEST comppct if present, else the first seen. Rows
   * here carry no comppct (the live query may add it), so we keep first-seen and
   * prefer a higher comppct when one is present. Returns shaped poly objects.
   * ========================================================================= */
  function shapeRow(r) {
    // tolerate both the fixture array shape and an already-shaped object
    if (Array.isArray(r)) {
      return {
        mupolygonkey: r[0] != null ? String(r[0]) : null,
        mukey: r[1] != null ? String(r[1]) : null,
        muname: r[2] != null ? String(r[2]) : null,
        compname: r[3] != null ? String(r[3]) : null,
        drainagecl: r[4] != null ? String(r[4]) : null,
        slope_l: r[5] != null ? r[5] : null,
        slope_h: r[6] != null ? r[6] : null,
        wkt: r[7] != null ? String(r[7]) : null,
        comppct: r[8] != null ? Number(r[8]) : null
      };
    }
    return {
      mupolygonkey: r.mupolygonkey != null ? String(r.mupolygonkey) : null,
      mukey: r.mukey != null ? String(r.mukey) : null,
      muname: r.muname != null ? String(r.muname) : null,
      compname: r.compname != null ? String(r.compname) : null,
      drainagecl: r.drainagecl != null ? String(r.drainagecl) : null,
      slope_l: r.slope_l != null ? r.slope_l : null,
      slope_h: r.slope_h != null ? r.slope_h : null,
      wkt: r.wkt != null ? String(r.wkt) : null,
      comppct: r.comppct != null ? Number(r.comppct) : null
    };
  }
  function slopeLabel(lo, hi) {
    if (lo != null && hi != null) return lo + "–" + hi + "%";
    if (lo != null) return lo + "%";
    return null;
  }
  function dedupeByPolygonKey(rows) {
    var byKey = {};
    var order = []; // preserve first-seen order for determinism
    (rows || []).forEach(function (raw) {
      var r = shapeRow(raw);
      if (r.mupolygonkey == null) return;
      var e = byKey[r.mupolygonkey];
      if (!e) { byKey[r.mupolygonkey] = r; order.push(r.mupolygonkey); }
      else if (r.comppct != null && (e.comppct == null || r.comppct > e.comppct)) {
        // higher comppct component wins as the polygon's face
        byKey[r.mupolygonkey] = r;
      }
    });
    return order.map(function (k) {
      var r = byKey[k];
      var rings = wktToRings(r.wkt);
      // bbox pre-filter per poly (min/max lon/lat over all its rings)
      var minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
      rings.forEach(function (ring) {
        ring.forEach(function (p) {
          if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0];
          if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1];
        });
      });
      return {
        mupolygonkey: r.mupolygonkey,
        mukey: r.mukey,
        muname: r.muname,
        compname: r.compname,
        drainagecl: r.drainagecl,
        slope: slopeLabel(r.slope_l, r.slope_h),
        slope_l: r.slope_l, slope_h: r.slope_h,
        rings: rings,
        bbox: rings.length ? { minx: minx, maxx: maxx, miny: miny, maxy: maxy } : null
      };
    });
  }

  /* =========================================================================
   * DOUGLAS–PEUCKER simplification (disclosed as render simplification when a
   * ring is extreme, >2k verts, per spec §3). tolerance in DEGREES (~half a
   * grid cell). Pure; keeps endpoints; recursion bounded by ring length.
   * ========================================================================= */
  function perpDist(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var L2 = dx * dx + dy * dy;
    if (L2 === 0) { var ex = p[0] - a[0], ey = p[1] - a[1]; return Math.sqrt(ex * ex + ey * ey); }
    var t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2;
    t = Math.max(0, Math.min(1, t));
    var cx = a[0] + t * dx, cy = a[1] + t * dy;
    var qx = p[0] - cx, qy = p[1] - cy;
    return Math.sqrt(qx * qx + qy * qy);
  }
  function douglasPeucker(ring, tol) {
    if (!ring || ring.length < 3) return ring ? ring.slice() : [];
    var keep = new Array(ring.length).fill(false);
    keep[0] = true; keep[ring.length - 1] = true;
    var stack = [[0, ring.length - 1]];
    while (stack.length) {
      var seg = stack.pop(), lo = seg[0], hi = seg[1];
      var maxD = -1, idx = -1;
      for (var i = lo + 1; i < hi; i++) {
        var d = perpDist(ring[i], ring[lo], ring[hi]);
        if (d > maxD) { maxD = d; idx = i; }
      }
      if (maxD > tol && idx > 0) { keep[idx] = true; stack.push([lo, idx]); stack.push([idx, hi]); }
    }
    var out = [];
    for (var j = 0; j < ring.length; j++) if (keep[j]) out.push(ring[j]);
    return out;
  }

  /* =========================================================================
   * POINT-IN-POLYGON — ray casting on outer rings, bbox pre-filtered.
   * pointInRing: standard even-odd crossing test for a single ring.
   * pointInPolygon: any of the poly's OUTER rings contains the point (holes are
   * ignored at this scale, per spec §3 — disclosed).
   * ========================================================================= */
  function pointInRing(lon, lat, ring) {
    var inside = false, n = ring.length;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      var intersect = ((yi > lat) !== (yj > lat)) &&
        (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
  function pointInPolygon(lon, lat, poly) {
    if (poly.bbox) {
      if (lon < poly.bbox.minx || lon > poly.bbox.maxx || lat < poly.bbox.miny || lat > poly.bbox.maxy) return false;
    }
    for (var i = 0; i < poly.rings.length; i++) {
      if (pointInRing(lon, lat, poly.rings[i])) return true;
    }
    return false;
  }

  /* =========================================================================
   * GRID GEOMETRY. The read grid is row 0 = NORTH, col 0 = WEST (the live
   * engine's convention). Cell (x,y) centroid lon/lat is the grid POINT lon/lat
   * (points, not areas — the DEM is sampled at points; a "cell" here is one
   * sample). gridBbox = { lat:[s,n], lon:[w,e], nx, ny }.
   * ========================================================================= */
  function cellLonLat(gridBbox, x, y) {
    var nx = gridBbox.nx, ny = gridBbox.ny;
    var lon = gridBbox.lon[0] + (x / (nx - 1)) * (gridBbox.lon[1] - gridBbox.lon[0]);
    var lat = gridBbox.lat[1] - (y / (ny - 1)) * (gridBbox.lat[1] - gridBbox.lat[0]); // row 0 = north
    return { lon: lon, lat: lat };
  }
  function metersBetween(lat1, lon1, lat2, lon2) {
    var mLat = 111132;
    var mLon = mLat * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
    var dy = (lat1 - lat2) * mLat, dx = (lon1 - lon2) * mLon;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /* =========================================================================
   * RASTERIZE soil polygons onto the read grid (spec §4). Per cell centroid,
   * point-in-polygon over the deduped polys (bbox pre-filter). First containing
   * poly wins (deterministic: polys are in dedupe first-seen order). Returns a
   * [ny][nx] array of per-cell soil objects (or null where no poly covers).
   *   cell.soil = { mukey, drainagecl, name, slope } | null
   * ========================================================================= */
  function rasterize(gridBbox, polys) {
    var nx = gridBbox.nx, ny = gridBbox.ny;
    var soil = [];
    for (var y = 0; y < ny; y++) {
      var row = [];
      for (var x = 0; x < nx; x++) {
        var ll = cellLonLat(gridBbox, x, y);
        var found = null;
        for (var p = 0; p < polys.length; p++) {
          if (pointInPolygon(ll.lon, ll.lat, polys[p])) { found = polys[p]; break; }
        }
        row.push(found ? {
          mukey: found.mukey,
          drainagecl: found.drainagecl,
          name: found.muname || found.compname || null,
          slope: found.slope,
          mupolygonkey: found.mupolygonkey
        } : null);
      }
      soil.push(row);
    }
    return soil;
  }

  /* =========================================================================
   * CLASSIFY CELLS (spec §4). Each cell gets:
   *   soil       — from rasterize (may be null)
   *   band       — low/mid/up: parcel-FREE elevation terciles of the whole read
   *   inLow      — membership in the collectionLow component (cells list)
   *   slopeBreak — top-decile gradient magnitude cell
   *   nearFlow   — within 2 cells (Chebyshev) of a flowline cell
   *   nearRoad   — within 2 cells of a road cell
   * Pure. Returns { cells:[ny][nx], t1, t2, gradThreshold, flowMask, roadMask }.
   * ========================================================================= */
  // rasterize a set of polylines ([{coords:[[lon,lat]...]}]) to the cells they
  // pass nearest — mark the grid cell whose centroid is closest to each vertex,
  // plus cells the segment crosses (sampled). A boolean [ny][nx] mask.
  function polylineMask(gridBbox, lines) {
    var nx = gridBbox.nx, ny = gridBbox.ny;
    var mask = [];
    for (var y = 0; y < ny; y++) { mask.push([]); for (var x = 0; x < nx; x++) mask[y].push(false); }
    var lonSpan = gridBbox.lon[1] - gridBbox.lon[0], latSpan = gridBbox.lat[1] - gridBbox.lat[0];
    function mark(lon, lat) {
      var gx = Math.round((lon - gridBbox.lon[0]) / lonSpan * (nx - 1));
      var gy = Math.round((gridBbox.lat[1] - lat) / latSpan * (ny - 1));
      if (gx >= 0 && gx < nx && gy >= 0 && gy < ny) mask[gy][gx] = true;
    }
    (lines || []).forEach(function (ln) {
      var cs = ln.coords || [];
      for (var i = 0; i < cs.length; i++) {
        mark(cs[i][0], cs[i][1]);
        // sample along the segment to the next vertex so crossings register
        if (i + 1 < cs.length) {
          var a = cs[i], b = cs[i + 1];
          var steps = 8;
          for (var s = 1; s < steps; s++) {
            var t = s / steps;
            mark(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
          }
        }
      }
    });
    return mask;
  }
  // dilate a boolean mask by `r` cells (Chebyshev) → "within r cells" mask
  function dilate(mask, r) {
    var ny = mask.length, nx = mask[0].length;
    var out = [];
    for (var y = 0; y < ny; y++) { out.push([]); for (var x = 0; x < nx; x++) out[y].push(false); }
    for (var yy = 0; yy < ny; yy++) {
      for (var xx = 0; xx < nx; xx++) {
        if (!mask[yy][xx]) continue;
        for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
          var ny2 = yy + dy, nx2 = xx + dx;
          if (ny2 >= 0 && ny2 < ny && nx2 >= 0 && nx2 < nx) out[ny2][nx2] = true;
        }
      }
    }
    return out;
  }
  // centroid of a building footprint's outer ring ([[lon,lat]...]) — average of
  // vertices, sufficient at footprint scale. Pure.
  function buildingCentroid(b) {
    var ring = b.coords || [];
    var sx = 0, sy = 0, n = 0;
    ring.forEach(function (c) { sx += c[0]; sy += c[1]; n++; });
    return n ? { lon: sx / n, lat: sy / n, occ: b.occ } : null;
  }
  // mark the grid cell nearest each building CENTROID (spec §4). A boolean mask
  // [ny][nx] — one point per footprint, computed once. Pure.
  function buildingMask(gridBbox, buildings) {
    var nx = gridBbox.nx, ny = gridBbox.ny;
    var mask = [];
    for (var y = 0; y < ny; y++) { mask.push([]); for (var x = 0; x < nx; x++) mask[y].push(false); }
    var lonSpan = gridBbox.lon[1] - gridBbox.lon[0], latSpan = gridBbox.lat[1] - gridBbox.lat[0];
    (buildings || []).forEach(function (b) {
      var c = buildingCentroid(b);
      if (!c) return;
      var gx = Math.round((c.lon - gridBbox.lon[0]) / lonSpan * (nx - 1));
      var gy = Math.round((gridBbox.lat[1] - c.lat) / latSpan * (ny - 1));
      if (gx >= 0 && gx < nx && gy >= 0 && gy < ny) mask[gy][gx] = true;
    });
    return mask;
  }
  function classifyCells(grid, gridBbox, soil, collectionLow, structures) {
    var ny = grid.length, nx = grid[0].length;
    // --- band terciles over the whole read (parcel-free) ---
    var vals = [];
    for (var y = 0; y < ny; y++) for (var x = 0; x < nx; x++) vals.push(grid[y][x]);
    var sorted = vals.slice().sort(function (a, b) { return a - b; });
    var t1 = sorted[Math.floor(sorted.length / 3)];
    var t2 = sorted[Math.floor(2 * sorted.length / 3)];
    function bandOf(v) { return v < t1 ? "low" : (v < t2 ? "mid" : "up"); }

    // --- gradient magnitude per cell (central-ish difference), top decile ---
    var grad = [];
    var gradVals = [];
    for (var gy = 0; gy < ny; gy++) {
      grad.push([]);
      for (var gx = 0; gx < nx; gx++) {
        var xm = gx > 0 ? grid[gy][gx - 1] : grid[gy][gx];
        var xp = gx < nx - 1 ? grid[gy][gx + 1] : grid[gy][gx];
        var ym = gy > 0 ? grid[gy - 1][gx] : grid[gy][gx];
        var yp = gy < ny - 1 ? grid[gy + 1][gx] : grid[gy][gx];
        var dzdx = (xp - xm) / 2, dzdy = (yp - ym) / 2;
        var mag = Math.sqrt(dzdx * dzdx + dzdy * dzdy);
        grad[gy].push(mag); gradVals.push(mag);
      }
    }
    var gsorted = gradVals.slice().sort(function (a, b) { return a - b; });
    var gradThreshold = gsorted[Math.floor(gsorted.length * 0.9)];

    // --- collection-low membership mask ---
    var lowMask = [];
    for (var ly = 0; ly < ny; ly++) { lowMask.push([]); for (var lx = 0; lx < nx; lx++) lowMask[ly].push(false); }
    if (collectionLow && collectionLow.cells) {
      collectionLow.cells.forEach(function (c) {
        // cells are [gx,gy] grid coords
        if (c[1] >= 0 && c[1] < ny && c[0] >= 0 && c[0] < nx) lowMask[c[1]][c[0]] = true;
      });
    }

    // --- flowline / road / building proximity masks (within 2 cells) ---
    // buildings mark the cell nearest each footprint CENTROID (computed once),
    // then dilate by 2 like flow/road — spec §4 nearBuilding. A FACT only: no
    // rule reads it (see pass3Rules — NO new rules), it feeds the zone stat tile.
    var flowMask0 = polylineMask(gridBbox, (structures && structures.streams) || []);
    var roadMask0 = polylineMask(gridBbox, (structures && structures.roads) || []);
    var bldgMask0 = buildingMask(gridBbox, (structures && structures.buildings) || []);
    var flowNear = dilate(flowMask0, 2);
    var roadNear = dilate(roadMask0, 2);
    var bldgNear = dilate(bldgMask0, 2);

    var cells = [];
    for (var cy = 0; cy < ny; cy++) {
      cells.push([]);
      for (var cx = 0; cx < nx; cx++) {
        cells[cy].push({
          x: cx, y: cy,
          elevation: grid[cy][cx],
          soil: soil[cy][cx],
          band: bandOf(grid[cy][cx]),
          inLow: lowMask[cy][cx],
          slopeBreak: grad[cy][cx] >= gradThreshold,
          nearFlow: flowNear[cy][cx],
          nearRoad: roadNear[cy][cx],
          nearBuilding: bldgNear[cy][cx]
        });
      }
    }
    return { cells: cells, t1: t1, t2: t2, gradThreshold: gradThreshold, flowMask: flowMask0, roadMask: roadMask0, buildingMask: bldgMask0 };
  }

  /* =========================================================================
   * PASS 1 — EDGES (spec §4). A summary of the real boundaries found:
   *   · drainage transitions: adjacent cells whose drainagecl differs (count +
   *     which classes meet, deduped ordered pairs).
   *   · slope-break cells: count of top-decile gradient cells.
   *   · collection-low: present? cell count.
   *   · flowlines / roads: counts (from structures).
   * Deterministic ordering of the class-pair list (sorted by pair string).
   * ========================================================================= */
  function pass1Edges(classified, collectionLow, structures) {
    var cells = classified.cells;
    var ny = cells.length, nx = cells[0].length;
    var pairCounts = {};
    var transitionCells = 0;
    for (var y = 0; y < ny; y++) {
      for (var x = 0; x < nx; x++) {
        var c = cells[y][x];
        if (!c.soil || !c.soil.drainagecl) continue;
        // east + south neighbor (avoid double counting)
        [[1, 0], [0, 1]].forEach(function (d) {
          var nx2 = x + d[0], ny2 = y + d[1];
          if (nx2 >= nx || ny2 >= ny) return;
          var c2 = cells[ny2][nx2];
          if (!c2.soil || !c2.soil.drainagecl) return;
          var a = drainKey(c.soil.drainagecl), b = drainKey(c2.soil.drainagecl);
          if (a !== b) {
            transitionCells++;
            var lo = a < b ? c.soil.drainagecl : c2.soil.drainagecl;
            var hi = a < b ? c2.soil.drainagecl : c.soil.drainagecl;
            var key = lo + " ↔ " + hi;
            pairCounts[key] = (pairCounts[key] || 0) + 1;
          }
        });
      }
    }
    var pairs = Object.keys(pairCounts).sort().map(function (k) {
      return { classes: k, count: pairCounts[k] };
    });
    var slopeBreakCells = 0;
    for (var sy = 0; sy < ny; sy++) for (var sx = 0; sx < nx; sx++) if (cells[sy][sx].slopeBreak) slopeBreakCells++;
    // structures inventory (spec §3): building footprint count + how many are
    // occupancy-class Agriculture. A FACT summary for the Pass-1 edges card; no
    // rule reads it. Occupancy is matched case-insensitively against "agriculture".
    var buildings = (structures && structures.buildings) || [];
    var agricultural = 0;
    buildings.forEach(function (b) {
      if (b && b.occ != null && String(b.occ).trim().toLowerCase() === "agriculture") agricultural++;
    });
    return {
      drainageTransitions: { cellPairs: transitionCells, classesMeeting: pairs },
      slopeBreakCells: slopeBreakCells,
      collectionLow: collectionLow ? { present: true, cellCount: collectionLow.cellCount } : { present: false },
      flowlines: ((structures && structures.streams) || []).length,
      roads: ((structures && structures.roads) || []).length,
      structures: { count: buildings.length, agricultural: agricultural }
    };
  }

  /* =========================================================================
   * COMPONENT-MASK MARCHING SQUARES — trace the boundary of a boolean cell mask
   * into polyline(s) in grid coords, then Chaikin-smooth. Reuses the SAME
   * marching-squares idea as the contour engine, applied to a 0/1 field at
   * level 0.5. The host's chaikinSmooth/catmullRom draw it as a dotted-dash
   * computed-zone outline. Here we return the raw stitched rings (grid coords)
   * so the renderer can smooth + project exactly as it does contours.
   * ========================================================================= */
  function maskMarchingSquares(mask) {
    var ny = mask.length, nx = mask[0].length;
    var segs = [];
    function v(x, y) { return (x >= 0 && x < nx && y >= 0 && y < ny && mask[y][x]) ? 1 : 0; }
    var level = 0.5;
    function t() { return 0.5; } // 0→1 crossing is always at the midpoint for a binary field
    for (var y = 0; y < ny - 1; y++) {
      for (var x = 0; x < nx - 1; x++) {
        var tl = v(x, y), tr = v(x + 1, y), br = v(x + 1, y + 1), bl = v(x, y + 1);
        var idx = 0;
        if (tl >= level) idx |= 8;
        if (tr >= level) idx |= 4;
        if (br >= level) idx |= 2;
        if (bl >= level) idx |= 1;
        if (idx === 0 || idx === 15) continue;
        var top = { x: x + t(), y: y };
        var right = { x: x + 1, y: y + t() };
        var bottom = { x: x + t(), y: y + 1 };
        var left = { x: x, y: y + t() };
        function push(a, b) { segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }); }
        switch (idx) {
          case 1: push(left, bottom); break;
          case 2: push(bottom, right); break;
          case 3: push(left, right); break;
          case 4: push(top, right); break;
          case 5: push(left, top); push(bottom, right); break;
          case 6: push(top, bottom); break;
          case 7: push(left, top); break;
          case 8: push(left, top); break;
          case 9: push(top, bottom); break;
          case 10: push(left, bottom); push(top, right); break;
          case 11: push(top, right); break;
          case 12: push(left, right); break;
          case 13: push(bottom, right); break;
          case 14: push(left, bottom); break;
        }
      }
    }
    return segs;
  }
  // stitch segments → polylines (same joining logic as the host's stitch)
  function stitchSegs(segs) {
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
          if (key(ep[0].x, ep[0].y) === key(tail.x, tail.y)) { used[ci] = true; line.push(ep[1]); tail = ep[1]; grow = true; break; }
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
          if (key(ep2[0].x, ep2[0].y) === key(head.x, head.y)) { used[di] = true; line.unshift(ep2[1]); head = ep2[1]; grow = true; break; }
        }
      }
      paths.push(line);
    }
    return paths;
  }
  function traceMask(mask) {
    return stitchSegs(maskMarchingSquares(mask));
  }

  /* =========================================================================
   * PASS 2 — COMPOUND ZONES (spec §4).
   *
   * Connected components of cells sharing (drainagecl, band). 4-neighbor.
   * Minimum size 12 cells. Then take the TOP 6 by the salience order:
   *   (1) components containing the collection-low,
   *   (2) components whose drainagecl is Poorly / Very poorly,
   *   (3) components straddling a slope break,
   *   (4) largest remaining.
   * A component's salience is a tuple; sorted DESC, ties broken by size then by
   * a stable key (min cell index) — fully deterministic. Each zone's geometry =
   * the component-mask boundary trace (grid-coord polylines) for the renderer to
   * smooth + project (dotted-dash computed-zone style). Fact-label assembled
   * from soil name + drainage + band.
   * ========================================================================= */
  var MIN_ZONE_CELLS = 12;
  var MAX_ZONES = 6;
  function bandLabel(b) { return b === "low" ? "low band" : (b === "mid" ? "mid band" : "upper band"); }

  /* =========================================================================
   * gridOctant(gx, gy, nx, ny) — the 8-way compass octant of a grid point
   * relative to grid CENTER, computed IN GRID SPACE (spec-flag-zone-identity-v1).
   * The grid bakes ROW 0 = NORTH (top). A point in a row ABOVE center (smaller gy)
   * is therefore NORTH of center — the N/S terrain-mirror bug lives EXACTLY here,
   * so we keep the sign explicit: dySouth grows toward the SOUTH (larger gy), and
   * we feed −dySouth into atan2 so that 0° points NORTH (up-screen).
   *   dx      = gx − (nx−1)/2   (east positive)
   *   dySouth = gy − (ny−1)/2   (south positive, because row grows southward)
   *   angle   = atan2(dx, −dySouth)  → 0° = N, +90° = E, clockwise.
   * Purely lexical, no DOM, no fetch — the engine stays pure. A point AT the
   * center (dx = dySouth = 0) falls in the "N" bucket (angle 0), a harmless
   * degenerate case (a centered pond has no meaningful compass offset).
   * ========================================================================= */
  function gridOctant(gx, gy, nx, ny) {
    var dx = gx - (nx - 1) / 2;
    var dySouth = gy - (ny - 1) / 2;
    var ang = Math.atan2(dx, -dySouth) * 180 / Math.PI; // 0° = N, clockwise
    if (ang < 0) ang += 360;
    var table = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    var idx = Math.round(ang / 45) % 8; // 45° buckets centered on each direction
    return table[idx];
  }
  function pass2Zones(classified, collectionLow) {
    var cells = classified.cells;
    var ny = cells.length, nx = cells[0].length;
    var seen = [];
    for (var y = 0; y < ny; y++) { seen.push([]); for (var x = 0; x < nx; x++) seen[y].push(false); }
    function keyOf(c) {
      if (!c.soil || !c.soil.drainagecl) return null; // cells with no soil don't form zones
      return drainKey(c.soil.drainagecl) + "|" + c.band;
    }
    var comps = [];
    for (var sy = 0; sy < ny; sy++) {
      for (var sx = 0; sx < nx; sx++) {
        if (seen[sy][sx]) continue;
        var startC = cells[sy][sx];
        var k = keyOf(startC);
        if (k == null) { seen[sy][sx] = true; continue; }
        // BFS/DFS 4-neighbor over cells with the SAME key
        var stack = [[sx, sy]], compCells = [];
        seen[sy][sx] = true;
        while (stack.length) {
          var cur = stack.pop();
          compCells.push(cur);
          [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
            var ax = cur[0] + d[0], ay = cur[1] + d[1];
            if (ax < 0 || ax >= nx || ay < 0 || ay >= ny || seen[ay][ax]) return;
            if (keyOf(cells[ay][ax]) === k) { seen[ay][ax] = true; stack.push([ax, ay]); }
          });
        }
        if (compCells.length >= MIN_ZONE_CELLS) {
          comps.push({ key: k, cells: compCells, drainagecl: startC.soil.drainagecl, band: startC.band, soilName: startC.soil.name, slope: startC.soil.slope, mukey: startC.soil.mukey });
        }
      }
    }
    // salience per component
    comps.forEach(function (comp) {
      var hasLow = false, straddleBreak = false;
      var minIdx = Infinity;
      comp.cells.forEach(function (c) {
        var cell = cells[c[1]][c[0]];
        if (cell.inLow) hasLow = true;
        if (cell.slopeBreak) straddleBreak = true;
        var idx = c[1] * nx + c[0];
        if (idx < minIdx) minIdx = idx;
      });
      comp.hasLow = hasLow;
      comp.poorish = (drainKey(comp.drainagecl) === "poorly drained" || drainKey(comp.drainagecl) === "very poorly drained");
      comp.straddleBreak = straddleBreak;
      comp.minIdx = minIdx;
      // salience tuple (higher = more salient): [hasLow, poorish, straddle, size]
      comp.salience = [hasLow ? 1 : 0, comp.poorish ? 1 : 0, straddleBreak ? 1 : 0, comp.cells.length];
    });
    comps.sort(function (a, b) {
      for (var i = 0; i < 4; i++) { if (b.salience[i] !== a.salience[i]) return b.salience[i] - a.salience[i]; }
      // final deterministic tiebreak: smaller minIdx first
      return a.minIdx - b.minIdx;
    });
    var top = comps.slice(0, MAX_ZONES);
    // shape zones: geometry trace + fact label + centroid
    var shaped = top.map(function (comp, i) {
      var mask = [];
      for (var my = 0; my < ny; my++) { mask.push([]); for (var mx = 0; mx < nx; mx++) mask[my].push(false); }
      var sxs = 0, sys = 0;
      comp.cells.forEach(function (c) { mask[c[1]][c[0]] = true; sxs += c[0]; sys += c[1]; });
      var cxg = sxs / comp.cells.length, cyg = sys / comp.cells.length;
      var rings = traceMask(mask);
      var label = (comp.soilName ? comp.soilName : "unmapped soil") +
        " · " + (comp.drainagecl ? comp.drainagecl.toLowerCase() : "drainage n/a") +
        " · " + bandLabel(comp.band);
      return {
        id: "cz" + (i + 1),
        rank: i + 1,
        drainagecl: comp.drainagecl,
        band: comp.band,
        soilName: comp.soilName,
        slope: comp.slope,
        mukey: comp.mukey,
        cellCount: comp.cells.length,
        cells: comp.cells,
        hasLow: comp.hasLow,
        poorish: comp.poorish,
        straddleBreak: comp.straddleBreak,
        centroidGrid: { x: cxg, y: cyg },
        rings: rings,        // grid-coord polylines for the renderer to smooth/project
        label: label,
        // compass octant of the centroid — a per-zone FACT, always present. The
        // renderer needs it too: its SHORT labels (first soil word + band) drop
        // the drainage class, so they can collide even when full labels don't.
        octant: gridOctant(cxg, cyg, nx, ny),
        salience: comp.salience
      };
    });
    // TWIN-ZONE DISAMBIGUATION (spec-flag-zone-identity-v1 §C). Two connected
    // components of the same (soil, drainage, band) print an IDENTICAL fact label
    // ("Zook-Olmitz-Vesser · low band" twice), indistinguishable in dock + map.
    // Distinguishers must be FACTS: append the grid-space compass octant of each
    // zone's centroid (row 0 = NORTH, same gridOctant helper). If octants within a
    // group still collide, append the cell count as the final tiebreak. Groups of
    // one keep their clean label. Deterministic — order is the fixed salience sort.
    var byLabel = {};
    shaped.forEach(function (z) { (byLabel[z.label] = byLabel[z.label] || []).push(z); });
    Object.keys(byLabel).forEach(function (baseLabel) {
      var group = byLabel[baseLabel];
      if (group.length < 2) return; // no collision → label untouched
      group.forEach(function (z) {
        z.label = baseLabel + " · " + z.octant; // same per-zone octant fact
      });
      // still colliding after the octant suffix? tiebreak with the cell count.
      var octCounts = {};
      group.forEach(function (z) { octCounts[z.label] = (octCounts[z.label] || 0) + 1; });
      group.forEach(function (z) {
        if (octCounts[z.label] > 1) z.label = z.label + " (" + z.cellCount + " cells)";
      });
    });
    return shaped;
  }

  /* =========================================================================
   * PASS 3 — RULES (spec §4). EXACT conditions, stable ids, VERBATIM text.
   * Applied per zone; the FIRST rule that fires wins (ordered R1→R4); default is
   * quiet. Returns { id, chip, text } where chip ∈ {look-first, look, quiet}.
   *
   * ctx: { forecastHasPrecip } — the read-level facts the rules need.
   * A zone carries hasLow, drainagecl, band, straddleBreak, and (computed here)
   * flowlineCrosses / transitionCrossesBreak from its cells.
   *
   * The rule TEXT strings are checked into the verification suite verbatim.
   * ========================================================================= */
  var RULE_TEXT = {
    R1: "R1 look-first — the zone holds the collection-low, its soil drains poorly, and rain is in the forecast.",
    // Observed variant (spec-time-axis-v1): identical rule, but the precip FACT is
    // a measured record, not a projection — the text says so honestly. Selected
    // when the day's precip came from the observed history (past), not the forecast.
    R1_OBSERVED: "R1 look-first — the zone holds the collection-low, its soil drains poorly, and rain was recorded that day.",
    R2: "R2 look — a drainage-class transition crosses a slope break inside or beside this zone.",
    R3: "R3 look — a mapped flowline crosses this zone and its soil is not well drained.",
    R4: "R4 quiet — well or moderately well drained, upper band, no structure crossing.",
    DEFAULT: "no rule fired — quiet by default."
  };
  function pass3Rules(zone, ctx, classified) {
    var cells = classified.cells;
    // does a flowline cross the zone? (any zone cell nearFlow)
    var flowlineCrosses = false, transitionAdjBreak = false, anyStructureCrossing = false;
    zone.cells.forEach(function (c) {
      var cell = cells[c[1]][c[0]];
      if (cell.nearFlow) { flowlineCrosses = true; anyStructureCrossing = true; }
      if (cell.nearRoad) { anyStructureCrossing = true; }
    });
    // transition crosses a slope break inside/adjacent to the zone: a zone cell
    // that is a slope break AND borders a different drainage class.
    var nyC = cells.length, nxC = cells[0].length;
    var zoneDrain = drainKey(zone.drainagecl);
    zone.cells.forEach(function (c) {
      var cell = cells[c[1]][c[0]];
      if (!cell.slopeBreak) return;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var ax = c[0] + d[0], ay = c[1] + d[1];
        if (ax < 0 || ax >= nxC || ay < 0 || ay >= nyC) return;
        var nb = cells[ay][ax];
        if (nb.soil && nb.soil.drainagecl && drainKey(nb.soil.drainagecl) !== zoneDrain) transitionAdjBreak = true;
      });
    });
    zone.flowlineCrosses = flowlineCrosses;
    zone.transitionAdjBreak = transitionAdjBreak;

    // R1 look-first: collection-low ∈ zone AND drainagecl ∈ {Poorly, Very poorly,
    // Somewhat poorly} AND the day carries precip. The precip FACT may come from
    // the forecast (future/today) or the observed record (a past day) — the rule
    // logic is identical, but the printed text is honest to the source: the
    // observed variant reads "…rain was recorded that day." (spec-time-axis-v1).
    if (zone.hasLow && isPoorish(zone.drainagecl) && ctx.forecastHasPrecip) {
      var observed = ctx.precipKind === "observed";
      return { id: "R1", chip: "look-first", text: observed ? RULE_TEXT.R1_OBSERVED : RULE_TEXT.R1 };
    }
    // R2 look: drainage-class transition crosses a slope break inside/adjacent.
    if (transitionAdjBreak) {
      return { id: "R2", chip: "look", text: RULE_TEXT.R2 };
    }
    // R3 look: flowline crosses the zone AND drainagecl is not Well drained.
    if (flowlineCrosses && drainKey(zone.drainagecl) !== "well drained") {
      return { id: "R3", chip: "look", text: RULE_TEXT.R3 };
    }
    // R4 quiet: Well/Moderately well drained AND upper band AND no structure crossing.
    if (isWellOrModWell(zone.drainagecl) && zone.band === "up" && !anyStructureCrossing) {
      return { id: "R4", chip: "quiet", text: RULE_TEXT.R4 };
    }
    // Default: quiet.
    return { id: "DEFAULT", chip: "quiet", text: RULE_TEXT.DEFAULT };
  }

  /* =========================================================================
   * DATA SUPPORT per zone (spec §2/§4). Count of contributing sources — NEVER a
   * percentage, NEVER "confidence". The four possible sources:
   *   DEM structure    — always (band + collection-low are DEM-derived)
   *   soil survey      — the zone HAS a mapped drainagecl/soil (it always does,
   *                      since zones require soil; count it)
   *   NHD structure    — a flowline crosses / is near the zone
   *   forecast         — the forecast is relevant to the zone's fired rule (R1)
   * Returns { n, m, sources:[names], samplingM }.
   * ========================================================================= */
  function dataSupport(zone, rule, ctx) {
    var sources = [];
    sources.push("USGS 3DEP (DEM)");               // band + structure always DEM
    if (zone.soilName || zone.drainagecl) sources.push("USDA SSURGO");
    if (zone.flowlineCrosses) sources.push("USGS NHD");
    // R1's precip fact source: honest to where it came from (spec-time-axis-v1) —
    // the observed record (NOAA PRISM) for a past day, the NWS forecast otherwise.
    if (rule && rule.id === "R1" && ctx.forecastHasPrecip) {
      sources.push(ctx.precipKind === "observed" ? "NOAA PRISM (observed)" : "NWS forecast");
    }
    return { n: sources.length, m: 4, sources: sources, samplingM: ctx.samplingM };
  }

  /* =========================================================================
   * CONFLICT FLAGS — held-open by rule (spec §4). Each produces a flag card +
   * hatched band (the renderer draws it EXACTLY like the established refusal).
   *   F1: a cell cluster in the collection-low whose mapped drainagecl is
   *       Well / Moderately well drained → "DEM says water collects here; the
   *       soil survey says it drains."
   *   F2: a perennial pond centroid on a Well-drained mapped unit.
   *   F3: (degraded) soil polygons unavailable → single limitation flag.
   * Returns an array of flags. Each flag carries the TWO disagreeing sources
   * verbatim + the "cannot decide" line, plus a grid region for the band.
   * ========================================================================= */
  var CANNOT_DECIDE = "The public data cannot decide — ground truth needed.";
  function conflictFlags(classified, collectionLow, structures, gridBbox, degraded) {
    if (degraded) {
      return [{
        id: "F3",
        uid: "F3",
        degraded: true,
        title: "Zone reading limited",
        readA: { source: "engine", text: "soil boundaries unreachable this read" },
        readB: { source: "engine", text: "zone computation limited to elevation structure" },
        cannotDecide: "zone reading limited — soil boundaries unreachable this read.",
        cells: null
      }];
    }
    var cells = classified.cells;
    var ny = cells.length, nx = cells[0].length;
    var flags = [];

    // --- F1: collection-low cells mapped Well / Mod-well drained ---
    var f1cells = [];
    if (collectionLow && collectionLow.cells) {
      collectionLow.cells.forEach(function (c) {
        if (c[1] < 0 || c[1] >= ny || c[0] < 0 || c[0] >= nx) return;
        var cell = cells[c[1]][c[0]];
        if (cell.soil && isWellOrModWell(cell.soil.drainagecl)) f1cells.push(c);
      });
    }
    if (f1cells.length >= 3) { // a cluster, not a stray cell
      flags.push({
        id: "F1",
        // uid = rule id + ordinal within the rule (spec-flag-zone-identity-v1 §A).
        // At most one F1 fires per read, so its uid is simply "F1".
        uid: "F1",
        degraded: false,
        title: "DEM ↔ soil survey disagree at the collection-low",
        readA: { source: "USGS 3DEP (DEM)", text: "water collects here — the lowest connected cells sit in this pocket" },
        readB: { source: "USDA SSURGO", text: "this map unit drains (mapped " + (cells[f1cells[0][1]][f1cells[0][0]].soil.drainagecl || "well") + ")" },
        cannotDecide: CANNOT_DECIDE,
        cells: f1cells
      });
    }

    // --- F2: perennial pond centroid on a Well-drained mapped unit ---
    // Two ponds are TWO flags — but two NHD features resolving to the SAME grid
    // cell are ONE pond double-counted (duplicate NHD geometry), so we DEDUPE by
    // grid cell before emitting (spec §A). Each surviving F2 gets its own uid
    // ("F2a", "F2b", … in emission order) and a locating FACT `where`: the pond's
    // compass octant (grid-space, row 0 = NORTH) + its centroid lat/lon (§B).
    var f2seen = {};        // "gx,gy" → already flagged this cell
    var f2ordinal = 0;      // → a/b/c… suffix in emission order
    var f2letters = "abcdefghijklmnopqrstuvwxyz";
    (structures && structures.waterbodies || []).forEach(function (p) {
      if (p.fcode != null && Number(p.fcode) !== 39004) return; // perennial only
      if (!p.coords || p.coords.length < 3) return;
      // centroid
      var sx = 0, sy = 0, k = 0;
      p.coords.forEach(function (v) { sx += v[0]; sy += v[1]; k++; });
      var clon = sx / k, clat = sy / k;
      // which cell?
      var gx = Math.round((clon - gridBbox.lon[0]) / (gridBbox.lon[1] - gridBbox.lon[0]) * (nx - 1));
      var gy = Math.round((gridBbox.lat[1] - clat) / (gridBbox.lat[1] - gridBbox.lat[0]) * (ny - 1));
      if (gx < 0 || gx >= nx || gy < 0 || gy >= ny) return;
      var cellKey = gx + "," + gy;
      if (f2seen[cellKey]) return; // duplicate NHD feature for one pond — one flag
      var cell = cells[gy][gx];
      if (cell.soil && drainKey(cell.soil.drainagecl) === "well drained") {
        f2seen[cellKey] = true;
        var suffix = f2ordinal < f2letters.length ? f2letters.charAt(f2ordinal) : String(f2ordinal + 1);
        f2ordinal++;
        flags.push({
          id: "F2",               // id stays the RULE id (chips + rule vocabulary are LAW)
          uid: "F2" + suffix,     // instance identity: F2a, F2b, …
          degraded: false,
          title: "A perennial pond sits on a Well-drained map unit",
          readA: { source: "USGS NHD", text: "a perennial waterbody is mapped here (FCODE 39004)" },
          readB: { source: "USDA SSURGO", text: "this map unit is mapped Well drained" },
          cannotDecide: CANNOT_DECIDE,
          where: { octant: gridOctant(gx, gy, nx, ny), lat: clat, lon: clon },
          cells: [[gx, gy]]
        });
      }
    });

    return flags;
  }

  /* =========================================================================
   * TEMPLATE SENTENCES — the FINITE list (spec §2/§4). Each template's blanks
   * are FACTS ONLY. The assembler picks exactly ONE per zone by its fired rule,
   * and fills the blanks from the zone's facts. NO free prose is ever generated.
   * The list is exported so the verification suite can assert every rendered
   * sentence traces to a checked-in template.
   *
   * Blanks: {soil} {drainage} {band} {flowDist} {classesMeeting}
   * ========================================================================= */
  var TEMPLATES = [
    { id: "T-R1", rule: "R1", text: "{drainage} {soil} on the {band}; a mapped flowline crosses within {flowDist}." },
    { id: "T-R1b", rule: "R1", text: "{drainage} {soil} on the {band}; the collection-low sits inside it and rain is forecast." },
    { id: "T-R2", rule: "R2", text: "{soil} on the {band}; a {classesMeeting} transition crosses a slope break here." },
    { id: "T-R3", rule: "R3", text: "{drainage} {soil} on the {band}; a mapped flowline crosses within {flowDist}." },
    { id: "T-R4", rule: "R4", text: "{drainage} {soil} on the {band}; no structure crosses it." },
    { id: "T-DEFAULT", rule: "DEFAULT", text: "{drainage} {soil} on the {band}." }
  ];
  function bandPhrase(b) { return b === "low" ? "low band" : (b === "mid" ? "mid band" : "upper band"); }
  function titleCase(s) {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function fillTemplate(tpl, facts) {
    return tpl.replace(/\{(\w+)\}/g, function (m, k) {
      return facts[k] != null ? facts[k] : m;
    });
  }
  // pick the template for a zone's rule; R1 uses the flowline variant if a
  // flowline distance is known, else the collection-low variant.
  function assembleSentence(zone, rule, ctx) {
    var facts = {
      soil: zone.soilName || "unmapped soil",
      drainage: titleCase(zone.drainagecl ? String(zone.drainagecl).toLowerCase() : "drainage n/a"),
      band: bandPhrase(zone.band),
      flowDist: (ctx.nearestFlowM != null) ? (Math.round(ctx.nearestFlowM / 10) * 10 + " m") : "40 m",
      classesMeeting: ctx.classesMeeting || "drainage-class"
    };
    var tplId;
    if (rule.id === "R1") tplId = (ctx.nearestFlowM != null) ? "T-R1" : "T-R1b";
    else if (rule.id === "R2") tplId = "T-R2";
    else if (rule.id === "R3") tplId = "T-R3";
    else if (rule.id === "R4") tplId = "T-R4";
    else tplId = "T-DEFAULT";
    var tpl = null;
    for (var i = 0; i < TEMPLATES.length; i++) if (TEMPLATES[i].id === tplId) { tpl = TEMPLATES[i]; break; }
    if (!tpl) tpl = TEMPLATES[TEMPLATES.length - 1];
    return { templateId: tpl.id, sentence: fillTemplate(tpl.text, facts) };
  }

  /* =========================================================================
   * FORECAST RELEVANCE — does the read's forecast carry precipitation? Pure over
   * the NWS periods (pop >= 30% or a wet shortForecast). Used by R1.
   * ========================================================================= */
  function periodHasPrecip(p) {
    if (!p) return false;
    if (p.pop != null && p.pop >= 30) return true;
    var sf = (p.shortForecast || "").toLowerCase();
    return /rain|shower|thunderstorm|storm|snow/.test(sf);
  }
  function forecastHasPrecip(periods) {
    if (!periods || !periods.length) return false;
    for (var i = 0; i < periods.length; i++) {
      if (periodHasPrecip(periods[i])) return true;
    }
    return false;
  }
  // Precip scoped to ONE calendar day: scans only the periods whose startTime
  // local-date === dateStr (same pop>=30 / wet-shortForecast test). This is what
  // makes the date an instrument control — R1 (look-first) can legitimately
  // re-rank as the selected day changes. Pure; determinism per (grid, dateStr)
  // preserved. If no period covers the date (outside the fetched window) → false.
  function precipOnDate(periods, dateStr) {
    if (!periods || !periods.length || !dateStr) return false;
    for (var i = 0; i < periods.length; i++) {
      var p = periods[i];
      if (typeof p.startTime === "string" && p.startTime.slice(0, 10) === dateStr && periodHasPrecip(p)) return true;
    }
    return false;
  }
  // OBSERVED precip for a past day (spec-time-axis-v1). Scans the ACIS history
  // rows for dateStr; a real rain day is measured pcpn ≥ 0.1 in. This is the
  // OBSERVED analog of precipOnDate — a record, not a projection. Pure; false if
  // the day isn't in the history or its pcpn is missing/below the threshold.
  function precipObservedOnDate(history, dateStr) {
    if (!history || !history.length || !dateStr) return false;
    for (var i = 0; i < history.length; i++) {
      var h = history[i];
      if (h && h.dateStr === dateStr && typeof h.pcpn === "number" && h.pcpn >= 0.1) return true;
    }
    return false;
  }

  /* =========================================================================
   * ORCHESTRATOR — computeReading(read). Pure. Runs the whole loop and returns
   * the computed reading object the renderer consumes:
   *   {
   *     version, rulesStamp, degraded,
   *     edges,               // pass 1 summary
   *     zones: [ { id, rank, label, drainagecl, band, soilName, slope,
   *                cellCount, centroidGrid, rings (grid coords), rule
   *                {id,chip,text}, dataSupport {n,m,sources,samplingM},
   *                template {templateId, sentence} } ],
   *     flags: [ conflict flags ],
   *     dataSupportCounts,   // read-level rollup
   *     samplingM
   *   }
   *
   * `read` is the live-engine read object (demGrid, gridBbox, soilPolygons OR
   * soil.rows, boundaries, collectionLow, forecasts, failures). If soil polygons
   * are unavailable, runs in DEGRADED mode: elevation-only zones (band-only
   * components), no soil-conflict flags, an F3 limitation flag.
   * ========================================================================= */
  function computeReading(read) {
    var gridBbox = read.gridBbox;
    var grid = read.demGrid ? read.demGrid.grid : read.grid;
    var structures = read.boundaries || { roads: [], streams: [], waterbodies: [] };
    var collectionLow = read.collectionLow || null;
    var periods = read.forecasts || [];
    var samplingM = read.samplingM != null ? read.samplingM
      : (gridBbox && gridBbox.nx ? Math.round(2200 / (gridBbox.nx - 1)) : null);

    // soil polygons: prefer read.soilPolygons (deduped poly objects from live),
    // else dedupe from read.soil.rows / read.soilRows (raw Table rows).
    var polys = null;
    if (read.soilPolygons && read.soilPolygons.length != null) polys = read.soilPolygons;
    else if (read.soil && read.soil.polygons) polys = read.soil.polygons;
    else if (read.soilPolygonRows) polys = dedupeByPolygonKey(read.soilPolygonRows);

    var soilFailed = read.failures && read.failures.some(function (f) { return f.source === "soil-polygons" || f.source === "soil"; });
    var degraded = !polys || !polys.length || !!soilFailed;

    // rasterize (empty soil grid in degraded mode)
    var soil;
    if (degraded) {
      soil = [];
      var ny0 = grid.length, nx0 = grid[0].length;
      for (var y0 = 0; y0 < ny0; y0++) { soil.push([]); for (var x0 = 0; x0 < nx0; x0++) soil[y0].push(null); }
    } else {
      soil = rasterize(gridBbox, polys);
    }

    var classified = classifyCells(grid, gridBbox, soil, collectionLow, structures);
    var edges = pass1Edges(classified, collectionLow, structures);

    // date-AND-kind-scoped precip (spec-time-axis-v1). When the read carries a
    // selected dateStr:
    //   · if that day is in the OBSERVED history (a past day) → observed pcpn ≥
    //     0.1 in (precipObservedOnDate). The R1 fact is a measured RECORD.
    //   · else (today/future) → the forecast pop for THAT day (precipOnDate). The
    //     R1 fact is a PROJECTION.
    // With no selected date, the whole fetched forecast window (forecastHasPrecip).
    // precipKind tags which source supplied the fact so pass3Rules picks the
    // honest R1 text. Determinism per (grid, dateStr) holds — history + forecast
    // are both on the cached read; the day is looked up in the observed history
    // FIRST (the past owns the past), then the forecast.
    var history = read.history || [];
    var ctxHasPrecip, precipKind = null;
    if (read.dateStr) {
      if (precipObservedOnDate(history, read.dateStr)) {
        ctxHasPrecip = true; precipKind = "observed";
      } else if (history.some(function (h) { return h && h.dateStr === read.dateStr; })) {
        // the day IS an observed day but recorded < 0.1" — a dry past day, no precip
        ctxHasPrecip = false; precipKind = "observed";
      } else {
        ctxHasPrecip = precipOnDate(periods, read.dateStr); precipKind = "forecast";
      }
    } else {
      ctxHasPrecip = forecastHasPrecip(periods); precipKind = "forecast";
    }

    // zones: in degraded mode, components share BAND only (no drainagecl); we
    // synthesize a soil-free key so pass2 still finds elevation-structure zones.
    var zones;
    if (degraded) {
      zones = pass2ZonesDegraded(classified, collectionLow);
    } else {
      zones = pass2Zones(classified, collectionLow);
    }

    // per-zone rules + data support + template
    zones.forEach(function (z) {
      var rule = degraded ? { id: "DEFAULT", chip: "quiet", text: RULE_TEXT.DEFAULT } : pass3Rules(z, { forecastHasPrecip: ctxHasPrecip, precipKind: precipKind }, classified);
      z.rule = rule;
      // nearest flowline distance from the zone centroid (for the template)
      var cll = cellLonLat(gridBbox, z.centroidGrid.x, z.centroidGrid.y);
      var nearestFlowM = null;
      (structures.streams || []).forEach(function (fl) {
        (fl.coords || []).forEach(function (v) {
          var dm = metersBetween(cll.lat, cll.lon, v[1], v[0]);
          if (nearestFlowM == null || dm < nearestFlowM) nearestFlowM = dm;
        });
      });
      // nearest building footprint (by CENTROID) from the zone centroid — a FACT
      // for the zone's Buildings stat tile (spec §3). Distance in meters + the
      // nearest footprint's occupancy class; null when no buildings are present.
      var nearestBldgM = null, nearestBldgOcc = null;
      (structures.buildings || []).forEach(function (b) {
        var bc = buildingCentroid(b);
        if (!bc) return;
        var dm = metersBetween(cll.lat, cll.lon, bc.lat, bc.lon);
        if (nearestBldgM == null || dm < nearestBldgM) { nearestBldgM = dm; nearestBldgOcc = bc.occ; }
      });
      z.nearestBuildingM = nearestBldgM;
      z.nearestBuildingOcc = nearestBldgOcc;
      // classes meeting at this zone's boundary (for R2 template)
      var classesMeeting = null;
      edges.drainageTransitions.classesMeeting.forEach(function (cm) {
        if (classesMeeting == null && cm.classes.indexOf(z.drainagecl) >= 0) classesMeeting = cm.classes.replace(" ↔ ", "/");
      });
      var ctx = { forecastHasPrecip: ctxHasPrecip, precipKind: precipKind, samplingM: samplingM, nearestFlowM: nearestFlowM, classesMeeting: classesMeeting };
      z.dataSupport = dataSupport(z, rule, ctx);
      z.template = assembleSentence(z, rule, ctx);
      z.nearestFlowM = nearestFlowM;
    });

    var flags = conflictFlags(classified, collectionLow, structures, gridBbox, degraded);

    // read-level data-support rollup: which of the four sources are present
    var present = { dem: true, soil: !degraded, nhd: (structures.streams || []).length > 0, forecast: periods.length > 0 };
    var presentCount = (present.dem ? 1 : 0) + (present.soil ? 1 : 0) + (present.nhd ? 1 : 0) + (present.forecast ? 1 : 0);

    return {
      version: ENGINE_VERSION,
      rulesStamp: RULES_STAMP,
      degraded: degraded,
      samplingM: samplingM,
      edges: edges,
      zones: zones,
      flags: flags,
      dataSupportCounts: { present: present, n: presentCount, m: 4 },
      classified: { t1: classified.t1, t2: classified.t2, gradThreshold: classified.gradThreshold }
    };
  }

  /* =========================================================================
   * DEGRADED-MODE ZONES — elevation-only. Components share BAND (no soil).
   * Same salience order minus the poorish criterion (no drainage known).
   * ========================================================================= */
  function pass2ZonesDegraded(classified, collectionLow) {
    var cells = classified.cells;
    var ny = cells.length, nx = cells[0].length;
    var seen = [];
    for (var y = 0; y < ny; y++) { seen.push([]); for (var x = 0; x < nx; x++) seen[y].push(false); }
    var comps = [];
    for (var sy = 0; sy < ny; sy++) {
      for (var sx = 0; sx < nx; sx++) {
        if (seen[sy][sx]) continue;
        var band = cells[sy][sx].band;
        var stack = [[sx, sy]], compCells = [];
        seen[sy][sx] = true;
        while (stack.length) {
          var cur = stack.pop(); compCells.push(cur);
          [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
            var ax = cur[0] + d[0], ay = cur[1] + d[1];
            if (ax < 0 || ax >= nx || ay < 0 || ay >= ny || seen[ay][ax]) return;
            if (cells[ay][ax].band === band) { seen[ay][ax] = true; stack.push([ax, ay]); }
          });
        }
        if (compCells.length >= MIN_ZONE_CELLS) comps.push({ band: band, cells: compCells });
      }
    }
    comps.forEach(function (comp) {
      var hasLow = false, straddle = false, minIdx = Infinity;
      comp.cells.forEach(function (c) {
        var cell = cells[c[1]][c[0]];
        if (cell.inLow) hasLow = true;
        if (cell.slopeBreak) straddle = true;
        var idx = c[1] * nx + c[0]; if (idx < minIdx) minIdx = idx;
      });
      comp.hasLow = hasLow; comp.straddleBreak = straddle; comp.minIdx = minIdx;
      comp.salience = [hasLow ? 1 : 0, 0, straddle ? 1 : 0, comp.cells.length];
    });
    comps.sort(function (a, b) {
      for (var i = 0; i < 4; i++) { if (b.salience[i] !== a.salience[i]) return b.salience[i] - a.salience[i]; }
      return a.minIdx - b.minIdx;
    });
    return comps.slice(0, MAX_ZONES).map(function (comp, i) {
      var mask = [];
      for (var my = 0; my < ny; my++) { mask.push([]); for (var mx = 0; mx < nx; mx++) mask[my].push(false); }
      var sxs = 0, sys = 0;
      comp.cells.forEach(function (c) { mask[c[1]][c[0]] = true; sxs += c[0]; sys += c[1]; });
      return {
        id: "cz" + (i + 1), rank: i + 1,
        drainagecl: null, band: comp.band, soilName: null, slope: null, mukey: null,
        cellCount: comp.cells.length, cells: comp.cells,
        hasLow: comp.hasLow, poorish: false, straddleBreak: comp.straddleBreak,
        centroidGrid: { x: sxs / comp.cells.length, y: sys / comp.cells.length },
        rings: traceMask(mask),
        label: "elevation " + bandLabel(comp.band) + " · soil boundaries unreachable",
        salience: comp.salience
      };
    });
  }

  /* =========================================================================
   * EXPORT
   * ========================================================================= */
  var AGRIOS_ENGINE = {
    version: ENGINE_VERSION,
    rulesStamp: RULES_STAMP,
    // parsing / geometry
    wktToRings: wktToRings,
    dedupeByPolygonKey: dedupeByPolygonKey,
    douglasPeucker: douglasPeucker,
    pointInRing: pointInRing,
    pointInPolygon: pointInPolygon,
    cellLonLat: cellLonLat,
    metersBetween: metersBetween,
    // rasterize + classify
    rasterize: rasterize,
    classifyCells: classifyCells,
    polylineMask: polylineMask,
    buildingCentroid: buildingCentroid,
    buildingMask: buildingMask,
    dilate: dilate,
    // passes
    pass1Edges: pass1Edges,
    pass2Zones: pass2Zones,
    pass2ZonesDegraded: pass2ZonesDegraded,
    pass3Rules: pass3Rules,
    conflictFlags: conflictFlags,
    gridOctant: gridOctant,
    dataSupport: dataSupport,
    forecastHasPrecip: forecastHasPrecip,
    precipOnDate: precipOnDate,
    precipObservedOnDate: precipObservedOnDate,
    // geometry trace
    traceMask: traceMask,
    // templates
    TEMPLATES: TEMPLATES,
    assembleSentence: assembleSentence,
    RULE_TEXT: RULE_TEXT,
    // drainage helpers
    isPoorish: isPoorish,
    isWellish: isWellish,
    isWellOrModWell: isWellOrModWell,
    // orchestrator
    computeReading: computeReading,
    // constants
    MIN_ZONE_CELLS: MIN_ZONE_CELLS,
    MAX_ZONES: MAX_ZONES,
    CANNOT_DECIDE: CANNOT_DECIDE
  };

  root.AGRIOS_ENGINE = AGRIOS_ENGINE;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { AGRIOS_ENGINE: AGRIOS_ENGINE };
  }
})(typeof window !== "undefined" ? window : this);
