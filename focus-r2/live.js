/* =============================================================================
 * AGRIOS Focus — LIVE READ engine (spec-live-read-v1, focus-r2/ ONLY).
 *
 * "Read this location" performs a REAL, live, client-side read of any US ground
 * from the five public sources, then hands an assembled read to the existing map
 * machinery (AGRIOS_FOCUS_R2.setField). The static artifact becomes a working
 * instrument. No backend, no build step, vanilla JS.
 *
 * THE HONEST SCOPE (spec §2 — LAW): a live read produces LAYERS + FACTS, not
 * interpretation. Terrain, roads/streams/ponds, soil-unit inventory, real
 * forecast, computed facts, and ONE computed flag (collection-low candidate,
 * rule printed on it). NO zone narratives, NO confidence, NO refusals, NO
 * priority chips. Per-source failure is honest; nothing is ever fabricated.
 *
 * STRUCTURE
 *   · parsers   — PURE functions, node-exportable, unit-tested against the REAL
 *                 fixtures in checks/fixtures/. Given a raw API response, return
 *                 the shaped fact. No I/O, no globals.
 *   · fetchRead(lat, lon, opts) — the orchestrator: concurrency pool 10, 2
 *                 retries w/ jitter, AbortController, per-source progress
 *                 callbacks, neighbor-mean fill (count reported). BROWSER ONLY.
 *   · assembleRead(...) — pure: shapes parser outputs into the read object the
 *                 renderer consumes: { gridBbox (GRID_BBOX shape), demGrid
 *                 (DEM_GRID_EXT shape, row0=NORTH), boundaries (BOUNDARIES
 *                 shape), soil, forecasts, timestamps, failures[] }.
 *   · collectionLow(grid, gridBbox, flowlines) — pure: lowest-decile connected
 *                 component, its facts, and a map region (NO priority chip).
 *   · cache — localStorage key `agrios-read-{lat4},{lon4}` (helpers pure/testable).
 *
 * The SEVEN allowed hosts (spec §6 — verify greps this list; nothing else
 * appears in a fetch URL in this file):
 *   epqs.nationalmap.gov · api.weather.gov · sdmdataaccess.sc.egov.usda.gov
 *   tigerweb.geo.census.gov · hydro.nationalmap.gov · services2.arcgis.com
 *   data.rcc-acis.org (NOAA/RCC ACIS GridData — observed daily pcpn/maxt/mint
 *    from PRISM ~4km; the OBSERVED past of the time axis, spec-time-axis-v1)
 *   (services2.arcgis.com = FEMA/ORNL USA Structures — building footprints; a
 *    FAILABLE source: full-geometry queries can be slow, so it gets a generous
 *    timeout + 1 retry and, on failure, an honest per-source consequence line.
 *    data.rcc-acis.org is likewise FAILABLE — history fails → past days show an
 *    "observed record unavailable" honest note, forward still renders.)
 * ========================================================================== */
(function (root) {
  "use strict";

  /* =========================================================================
   * GEOMETRY / EXTENT
   *
   * Centered bbox ~2.2 km (lon) × 1.65 km (lat) — ≈ the Allerton aspect. At mid
   * US latitudes 1° lat ≈ 111 km; 1° lon ≈ 111·cos(lat) km. We solve the
   * half-spans in degrees so the ground extent matches regardless of latitude.
   *   EXTENT_LON_M = 2200, EXTENT_LAT_M = 1650 (full spans)
   * Grid: 36 × 27 = 972 EPQS points (nx=36, ny=27); row 0 = NORTH.
   * ========================================================================= */
  var EXTENT_LON_M = 2200, EXTENT_LAT_M = 1650;
  var GRID_NX = 36, GRID_NY = 27;
  var M_PER_DEG_LAT = 111132;

  // bbox (GRID_BBOX shape) centered on lat/lon. Pure.
  function bboxFor(lat, lon) {
    var halfLat = (EXTENT_LAT_M / 2) / M_PER_DEG_LAT;
    var mPerDegLon = M_PER_DEG_LAT * Math.cos(lat * Math.PI / 180);
    var halfLon = (EXTENT_LON_M / 2) / mPerDegLon;
    return {
      lat: [lat - halfLat, lat + halfLat],
      lon: [lon - halfLon, lon + halfLon],
      nx: GRID_NX, ny: GRID_NY
    };
  }

  // grid point lon/lat for (ix, iy) where iy=0 is NORTH (max lat), iy=ny-1 SOUTH.
  // ix=0 is WEST (min lon). Matches the renderer's north-up convention directly.
  function gridPointLonLat(bbox, ix, iy) {
    var lon = bbox.lon[0] + (ix / (bbox.nx - 1)) * (bbox.lon[1] - bbox.lon[0]);
    var lat = bbox.lat[1] - (iy / (bbox.ny - 1)) * (bbox.lat[1] - bbox.lat[0]); // row 0 = north
    return { lon: lon, lat: lat };
  }

  /* =========================================================================
   * SURROUND EXTENT (spec-surround-context-v1) — a coarse, FAILABLE context ring.
   *
   * A bounded live read has (almost) no terrain OUTSIDE the stated bounds to dim
   * (the core grid stops at the read extent). Allerton reads correctly because
   * its baked example carries an extended surround grid; live reads had none. So
   * we READ more, coarsely, and say so — context terrain, never survey.
   *
   * The ext bbox = the core bbox padded +50% of its span on EACH side (ext span =
   * 2× core span). It is sampled at 3× the core cell spacing (COARSE — context,
   * not survey. Spec v1.1: v1 said 2×, but lattice density scales with AREA, so
   * 2× over the doubled span cost ~as many points as the core itself; for a live
   * instrument read time wins over surround fidelity). 3× doesn't divide the
   * doubled span evenly, so the lattice is CENTERED in the ext bbox (residue
   * split symmetrically) and the lattice's ACTUAL bbox — not the nominal ext —
   * is what the renderer georeferences against. surroundExtBbox and
   * surroundLattice are PURE — verify.js asserts the arithmetic on a synthetic
   * bbox (padding, 3× spacing, ring-only). Ring only: points that fall inside (or
   * on) the core bbox are skipped — the core already read them at full resolution.
   * ========================================================================= */
  var SURROUND_PAD = 0.5;      // +50% of the core span on each side
  var SURROUND_SPACING = 3;    // 3× the core cell spacing (coarse — spec v1.1)

  // ext bbox: core bbox grown by +50% of its span on each side. PURE.
  function surroundExtBbox(coreBbox) {
    var lonSpan = coreBbox.lon[1] - coreBbox.lon[0];
    var latSpan = coreBbox.lat[1] - coreBbox.lat[0];
    var padLon = lonSpan * SURROUND_PAD, padLat = latSpan * SURROUND_PAD;
    return {
      lon: [coreBbox.lon[0] - padLon, coreBbox.lon[1] + padLon],
      lat: [coreBbox.lat[0] - padLat, coreBbox.lat[1] + padLat]
    };
  }

  // the coarse (3× core spacing) lattice over the ext bbox, row 0 = NORTH.
  // CENTERED: 3× doesn't divide the doubled span evenly, so the residue is split
  // symmetrically (offX/offY) and `bbox` is the lattice's ACTUAL extent — the
  // renderer must georeference against bbox, never the nominal extBbox, or the
  // terrain would stretch. Returns { extBbox, bbox, nx, ny, sx, sy } (sx/sy =
  // surround cell spacing in degrees). PURE — the geometry the ring generator
  // and the renderer both derive from.
  function surroundLattice(coreBbox) {
    var extBbox = surroundExtBbox(coreBbox);
    var coreSx = (coreBbox.lon[1] - coreBbox.lon[0]) / (coreBbox.nx - 1);
    var coreSy = (coreBbox.lat[1] - coreBbox.lat[0]) / (coreBbox.ny - 1);
    var sx = coreSx * SURROUND_SPACING, sy = coreSy * SURROUND_SPACING;
    var lonSpan = extBbox.lon[1] - extBbox.lon[0], latSpan = extBbox.lat[1] - extBbox.lat[0];
    var nx = Math.floor(lonSpan / sx + 1e-9) + 1;
    var ny = Math.floor(latSpan / sy + 1e-9) + 1;
    var offX = (lonSpan - (nx - 1) * sx) / 2;  // symmetric residue, west/east
    var offY = (latSpan - (ny - 1) * sy) / 2;  // symmetric residue, north/south
    var x0 = extBbox.lon[0] + offX;            // west-most lattice lon
    var y0 = extBbox.lat[1] - offY;            // north-most lattice lat (row 0)
    return {
      extBbox: extBbox, nx: nx, ny: ny, sx: sx, sy: sy, x0: x0, y0: y0,
      bbox: { lon: [x0, x0 + (nx - 1) * sx], lat: [y0 - (ny - 1) * sy, y0] }
    };
  }

  // the RING points (lattice points that fall OUTSIDE the core bbox — the core
  // already holds the interior at full resolution). Returns [{ix,iy,lon,lat}].
  // A point on/inside the core bbox is skipped (>= / <= so a shared edge is not
  // re-fetched). PURE — verify.js checks the ring-only count on a synthetic bbox.
  function surroundRingPoints(coreBbox) {
    var lat = surroundLattice(coreBbox);
    var pts = [];
    for (var iy = 0; iy < lat.ny; iy++) {
      for (var ix = 0; ix < lat.nx; ix++) {
        var lon = lat.x0 + ix * lat.sx;
        var y = lat.y0 - iy * lat.sy; // row 0 = north
        var insideCore = (lon >= coreBbox.lon[0] && lon <= coreBbox.lon[1] &&
                          y >= coreBbox.lat[0] && y <= coreBbox.lat[1]);
        if (insideCore) continue; // core read it at full resolution — ring only
        pts.push({ ix: ix, iy: iy, lon: lon, lat: y });
      }
    }
    return pts;
  }

  // meters distance between two lon/lat points (equirectangular — fine at this scale)
  function metersBetween(lat1, lon1, lat2, lon2) {
    var mLat = M_PER_DEG_LAT;
    var mLon = M_PER_DEG_LAT * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
    var dy = (lat1 - lat2) * mLat, dx = (lon1 - lon2) * mLon;
    return Math.sqrt(dx * dx + dy * dy);
  }
  // 8-point compass bearing name from (from → to)
  function bearingName(fromLat, fromLon, toLat, toLon) {
    var mLon = M_PER_DEG_LAT * Math.cos(((fromLat + toLat) / 2) * Math.PI / 180);
    var dx = (toLon - fromLon) * mLon, dy = (toLat - fromLat) * M_PER_DEG_LAT;
    var ang = Math.atan2(dx, dy) * 180 / Math.PI; // 0 = N, 90 = E
    if (ang < 0) ang += 360;
    var dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"];
    return dirs[Math.round(ang / 45)];
  }

  /* =========================================================================
   * PARSERS — PURE. Each takes a raw API response (the exact fixture shape) and
   * returns a shaped fact. No I/O. Unit-tested against checks/fixtures/.
   * ========================================================================= */

  // EPQS point service → elevation value (feet). Fixture: {..., "value": 956.62..}
  // EPQS returns feet when units=Feet is requested; the value is used verbatim.
  // Returns null for a missing/failed point (never a fabricated default).
  function epqsValue(resp) {
    if (resp == null) return null;
    var v = (typeof resp === "object") ? resp.value : resp;
    if (v == null) return null;
    var n = (typeof v === "string") ? parseFloat(v) : v;
    return (typeof n === "number" && isFinite(n)) ? n : null;
  }

  // SDA POST result → soil inventory. Fixture_sda-spatial rows are:
  //   [mukey, muname, compname, drainagecl, slope_l, slope_h, comppct]
  // 33 rows for the Ames bbox. We keep each row as one inventory entry (a
  // major component of a map unit), with its drainage class + slope range +
  // comppct (% of the map unit that component is). No aggregation invented.
  function sdaRows(resp) {
    var table = (resp && resp.Table) ? resp.Table : [];
    return table.map(function (r) {
      // tolerate the 2-col AK shape (muname, musym) by null-filling
      var mukey = r[0], muname = r[1], compname = r[2];
      var drainage = r[3], slopeL = r[4], slopeH = r[5], comppct = r[6];
      var slope = null;
      if (slopeL != null && slopeH != null) slope = slopeL + "–" + slopeH + "%";
      else if (slopeL != null) slope = slopeL + "%";
      return {
        mukey: mukey != null ? String(mukey) : null,
        muname: muname != null ? String(muname) : null,
        compname: compname != null ? String(compname) : null,
        drainagecl: drainage != null ? String(drainage) : null,
        slope: slope,
        comppct: comppct != null ? Number(comppct) : null
      };
    });
  }
  // Roll the flat component rows into a display inventory: unique map units,
  // each with its major component's drainage/slope, ordered by comppct desc.
  // Pure summary over the parsed rows (still just facts).
  function soilInventory(rows) {
    // group by mukey (map unit), keep the highest-comppct component as the face
    var byMu = {};
    rows.forEach(function (r) {
      if (!r.mukey) return;
      var e = byMu[r.mukey];
      if (!e || (r.comppct != null && r.comppct > (e.comppct == null ? -1 : e.comppct))) {
        byMu[r.mukey] = r;
      }
    });
    var list = Object.keys(byMu).map(function (k) { return byMu[k]; });
    list.sort(function (a, b) { return (b.comppct == null ? 0 : b.comppct) - (a.comppct == null ? 0 : a.comppct); });
    return list;
  }

  // SDA POST result → SOIL POLYGON rows (spec v2 §3). fixture_sda-polygons.json
  // Table rows are:
  //   [mupolygonkey, mukey, muname, compname, drainagecl, slope_l, slope_h, wkt]
  // Returns the raw Table array unchanged (the engine's dedupeByPolygonKey does
  // the WKT parse + dedupe — kept pure + node-testable there, not here). This
  // parser only guards the shape (an array of arrays); no interpretation.
  function sdaPolygonRows(resp) {
    var table = (resp && resp.Table) ? resp.Table : [];
    return table.filter(function (r) { return Array.isArray(r) && r.length >= 8; });
  }

  // NWS forecast geojson → periods. Fixture: properties.periods[] with name,
  // temperature, temperatureUnit, shortForecast, probabilityOfPrecipitation.
  // Returns REAL period objects; the UI takes the periods covering the date.
  function nwsPeriods(resp) {
    var periods = (resp && resp.properties && resp.properties.periods) || [];
    return periods.map(function (p) {
      var pop = (p.probabilityOfPrecipitation && p.probabilityOfPrecipitation.value != null)
        ? p.probabilityOfPrecipitation.value : null;
      return {
        number: p.number,
        name: p.name,
        isDaytime: !!p.isDaytime,
        tempF: p.temperatureUnit === "F" ? p.temperature : p.temperature,
        temperatureUnit: p.temperatureUnit,
        shortForecast: p.shortForecast,
        pop: pop,
        startTime: p.startTime,
        windSpeed: p.windSpeed,
        windDirection: p.windDirection
      };
    });
  }
  // date "YYYY-MM-DD" → the forecast periods whose startTime local-date matches,
  // plus the next period (so a daytime + its night carry through). If none match
  // (date outside the ~7-day window) returns [] — the UI states it honestly.
  function periodsForDate(periods, dateStr) {
    if (!dateStr) return periods.slice(0, 2);
    var match = periods.filter(function (p) {
      return typeof p.startTime === "string" && p.startTime.slice(0, 10) === dateStr;
    });
    return match.length ? match : [];
  }

  // Derive the SELECTABLE forecast window from the fetched periods: dedupe by
  // calendar day (startTime local-date), keep the day-period + its night-period,
  // cap at 7 days. Pure, node-exported. Shape:
  //   { firstDate, lastDate, days: [ { dateStr, label, dayPeriod, nightPeriod } ] }
  // A live read holds EXACTLY what it fetched — the UI offers no day beyond this.
  function forecastWindow(periods) {
    var empty = { firstDate: null, lastDate: null, days: [] };
    if (!periods || !periods.length) return empty;
    var order = [], byDate = {};
    periods.forEach(function (p) {
      if (typeof p.startTime !== "string") return;
      var d = p.startTime.slice(0, 10);
      if (!byDate[d]) { byDate[d] = { dateStr: d, dayPeriod: null, nightPeriod: null }; order.push(d); }
      if (p.isDaytime) { if (!byDate[d].dayPeriod) byDate[d].dayPeriod = p; }
      else { if (!byDate[d].nightPeriod) byDate[d].nightPeriod = p; }
    });
    if (!order.length) return empty;
    var days = order.slice(0, 7).map(function (d) {
      var e = byDate[d];
      // label: a short weekday + day-of-month, derived from the date (no clock —
      // NWS periods are 12h day/night, not hourly). Falls back to the dateStr.
      var label = dayLabel(d);
      return { dateStr: d, label: label, dayPeriod: e.dayPeriod, nightPeriod: e.nightPeriod };
    });
    return { firstDate: days[0].dateStr, lastDate: days[days.length - 1].dateStr, days: days };
  }
  // "YYYY-MM-DD" → "Sat 5" (weekday abbrev + day-of-month). Parsed as a LOCAL
  // date (noon avoids any UTC-offset day-slip); pure, deterministic per string.
  var _WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function dayLabel(dateStr) {
    if (typeof dateStr !== "string" || dateStr.length < 10) return dateStr || "—";
    var y = +dateStr.slice(0, 4), m = +dateStr.slice(5, 7), d = +dateStr.slice(8, 10);
    if (!y || !m || !d) return dateStr;
    var dt = new Date(y, m - 1, d, 12, 0, 0);
    if (isNaN(dt.getTime())) return dateStr;
    return _WD[dt.getDay()] + " " + d;
  }

  /* =========================================================================
   * TIME AXIS (spec-time-axis-v1) — the COMBINED ribbon: OBSERVED past ← today →
   * FORECAST future. Pure, node-exported. Given the ACIS history rows and the
   * NWS forecast periods (plus an optional todayStr for deterministic tests —
   * defaults to the local calendar day), returns a single ascending day list
   * where each day is tagged kind:'observed'|'forecast', TODAY the hinge.
   *
   * Ordering rule (honest, no invented days): every ACIS day BEFORE today is an
   * 'observed' day (carrying pcpn/maxt/mint); every forecastWindow day today-or-
   * later is a 'forecast' day (carrying its NWS day/night periods). Today itself
   * is a forecast day (a projection) even if ACIS also returned it — the record
   * for "today" is incomplete, so the axis treats today as the forecast hinge.
   * A day present in BOTH sources is resolved to exactly one entry by this
   * before/at-today split (no duplicates). Shape:
   *   { todayStr, firstDate, lastDate,
   *     days: [ { dateStr, label, kind, pcpn?, maxt?, mint?,   // observed
   *               dayPeriod?, nightPeriod? } ] }               // forecast
   * ========================================================================= */
  function localTodayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
      "-" + String(d.getDate()).padStart(2, "0");
  }
  function timeAxis(history, forecastPeriods, todayStr) {
    var today = todayStr || localTodayStr();
    var byDate = {}, order = [];
    function ensure(ds) {
      if (!byDate[ds]) { byDate[ds] = { dateStr: ds }; order.push(ds); }
      return byDate[ds];
    }
    // OBSERVED — every history row strictly before today
    (history || []).forEach(function (h) {
      if (!h || typeof h.dateStr !== "string") return;
      if (h.dateStr >= today) return; // today+ belongs to the forecast side
      var e = ensure(h.dateStr);
      e.kind = "observed";
      e.pcpn = (h.pcpn != null) ? h.pcpn : null;
      e.maxt = (h.maxt != null) ? h.maxt : null;
      e.mint = (h.mint != null) ? h.mint : null;
    });
    // FORECAST — the derived forecast window, today-or-later (today is the hinge)
    var fwin = forecastWindow(forecastPeriods);
    fwin.days.forEach(function (d) {
      if (d.dateStr < today) return; // a stray past forecast day is ignored (observed owns the past)
      var e = ensure(d.dateStr);
      e.kind = "forecast";
      e.dayPeriod = d.dayPeriod || null;
      e.nightPeriod = d.nightPeriod || null;
    });
    order.sort(); // ISO date strings sort lexicographically = chronologically
    var days = order.map(function (ds) {
      var e = byDate[ds];
      e.label = dayLabel(ds);
      return e;
    });
    return {
      todayStr: today,
      firstDate: days.length ? days[0].dateStr : null,
      lastDate: days.length ? days[days.length - 1].dateStr : null,
      days: days
    };
  }

  // TIGERweb geojson → roads (+ railroads). Fixture: FeatureCollection of
  // LineString features, properties {NAME, MTFCC}. S1400 = local road, S1740 =
  // service road; the Railroads layer (MTFCC R10xx) rides the same shape.
  // Output matches BOUNDARIES.roads: { name, coords:[[lon,lat]...] }.
  function tigerGeojson(resp) {
    var feats = (resp && resp.features) || [];
    var out = [];
    feats.forEach(function (f) {
      if (!f.geometry) return;
      var t = f.geometry.type;
      var p = f.properties || {};
      var name = p.NAME || p.FULLNAME || null;
      var isRail = typeof p.MTFCC === "string" && p.MTFCC.charAt(0) === "R";
      if (t === "LineString") {
        out.push({ name: name, coords: f.geometry.coordinates, rail: isRail });
      } else if (t === "MultiLineString") {
        f.geometry.coordinates.forEach(function (line) {
          out.push({ name: name, coords: line, rail: isRail });
        });
      }
    });
    return out;
  }

  // NHD geojson → { streams:[{fcode,coords}], waterbodies:[{fcode,coords,inside}] }.
  // Flowlines (LineString): fcode 46003 (intermittent stream), 46006 (perennial
  // stream/river), 55800 (artificial path), 33400 (connector), AND 33600–33603
  // (CanalDitch — spec §4: accepted here, rendered --water thin dash-dot and
  // counted in the structures inventory when present). Every LineString fcode is
  // carried verbatim; the renderer keys treatment off the fcode. Waterbodies
  // (Polygon, fcode 39004 perennial etc.): filter by CENTROID-IN-BBOX to drop
  // the envelope-clip artifact (NHD returns polygons whose envelope overlaps the
  // query box but whose body is elsewhere). bbox is the GRID_BBOX-shaped extent.
  function nhdGeojson(resp, bbox) {
    var feats = (resp && resp.features) || [];
    var streams = [], waterbodies = [];
    feats.forEach(function (f) {
      if (!f.geometry) return;
      var p = f.properties || {};
      var fcode = p.fcode != null ? p.fcode : p.FCODE;
      var name = p.gnis_name || p.GNIS_NAME || null;
      var t = f.geometry.type;
      if (t === "LineString") {
        streams.push({ fcode: fcode, name: name, coords: f.geometry.coordinates });
      } else if (t === "MultiLineString") {
        f.geometry.coordinates.forEach(function (line) {
          streams.push({ fcode: fcode, name: name, coords: line });
        });
      } else if (t === "Polygon" || t === "MultiPolygon") {
        var rings = (t === "Polygon") ? [f.geometry.coordinates[0]]
          : f.geometry.coordinates.map(function (poly) { return poly[0]; });
        rings.forEach(function (ring) {
          if (!ring || ring.length < 3) return;
          var c = ringCentroid(ring);
          var inside = bbox
            ? (c.lon >= bbox.lon[0] && c.lon <= bbox.lon[1] && c.lat >= bbox.lat[0] && c.lat <= bbox.lat[1])
            : true;
          if (inside) waterbodies.push({ fcode: fcode, name: name, coords: ring });
        });
      }
    });
    return { streams: streams, waterbodies: waterbodies };
  }
  // centroid of a [[lon,lat]...] ring (average of vertices — sufficient for the
  // in-bbox test; the artifact polygons sit wholly outside the box).
  function ringCentroid(ring) {
    var sx = 0, sy = 0, n = 0;
    ring.forEach(function (c) { sx += c[0]; sy += c[1]; n++; });
    return { lon: sx / n, lat: sy / n };
  }

  // FEMA/ORNL USA Structures geojson → building footprints (spec §1). The real
  // Allerton response is a FeatureCollection of Polygon features whose properties
  // carry OCC_CLS (occupancy class), SQFEET, HEIGHT. We keep each footprint as
  // { occ, sqft, height, coords } where coords is the OUTER RING ([[lon,lat]...],
  // the first ring of the Polygon / first ring of each MultiPolygon part). No
  // interpretation — occupancy is the source's classification verbatim (these are
  // ML+parcel-derived footprints, occupancy classed, NOT survey). Returns [] for
  // anything unparseable; a footprint with a degenerate ring (<3 verts) is dropped.
  function femaGeojson(resp) {
    var feats = (resp && resp.features) || [];
    var out = [];
    feats.forEach(function (f) {
      if (!f.geometry) return;
      var p = f.properties || {};
      var occ = (p.OCC_CLS != null) ? String(p.OCC_CLS) : null;
      var sqft = (p.SQFEET != null) ? Number(p.SQFEET) : null;
      var height = (p.HEIGHT != null) ? Number(p.HEIGHT) : null;
      var t = f.geometry.type;
      function push(ring) {
        if (ring && ring.length >= 3) out.push({ occ: occ, sqft: sqft, height: height, coords: ring });
      }
      if (t === "Polygon") {
        push(f.geometry.coordinates[0]);
      } else if (t === "MultiPolygon") {
        f.geometry.coordinates.forEach(function (poly) { push(poly[0]); });
      }
    });
    return out;
  }

  // NOAA/RCC ACIS GridData → OBSERVED daily history (spec-time-axis-v1). The real
  // response shape is { "data": [ [dateStr, pcpn, maxt, mint], ... ] } where the
  // elems were requested in that order (pcpn, maxt, mint). Values arrive as
  // NUMBERS or, for a missing datum, the ACIS sentinel string "M" (missing) or
  // "T" (trace). We coerce to a number, mapping "T"→0 (a trace is a real record
  // of ~0") and "M"/unparseable→null (honest absence, never a fabricated 0).
  // Returns [{ dateStr, pcpn, maxt, mint }] in the source order (ascending). No
  // interpretation — the wet/dry judgment lives in the engine (precipObservedOnDate).
  function acisNum(v) {
    if (v == null) return null;
    if (typeof v === "number") return isFinite(v) ? v : null;
    var s = String(v).trim();
    if (s === "" || s === "M" || s === "m") return null; // ACIS missing sentinel
    if (s === "T" || s === "t") return 0;                // trace → ~0 (a real record)
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }
  function acisHistory(resp) {
    var rows = (resp && Array.isArray(resp.data)) ? resp.data : [];
    var out = [];
    rows.forEach(function (r) {
      if (!Array.isArray(r) || r.length < 1) return;
      var dateStr = (r[0] != null) ? String(r[0]) : null;
      if (!dateStr) return;
      out.push({
        dateStr: dateStr,
        pcpn: acisNum(r[1]),
        maxt: acisNum(r[2]),
        mint: acisNum(r[3])
      });
    });
    return out;
  }

  /* =========================================================================
   * GRID ASSEMBLY + NEIGHBOR FILL — PURE.
   *
   * assembleGrid(values, nx, ny): values is a flat array of length nx*ny in
   * ROW-MAJOR order with row 0 = NORTH, col 0 = WEST (the order fetchRead fills).
   * Returns { grid: [ny][nx] (row 0 = north), filled: count } after neighbor-mean
   * filling any null holes. A hole is filled from the mean of its present 4-
   * neighbors; if a hole has no present neighbor it stays null for a second pass.
   * The fill count is reported so the caption can state it honestly.
   * ========================================================================= */
  function assembleGrid(values, nx, ny) {
    // to 2D (row 0 = north already)
    var grid = [];
    for (var y = 0; y < ny; y++) {
      var row = [];
      for (var x = 0; x < nx; x++) row.push(values[y * nx + x]);
      grid.push(row);
    }
    var filled = 0;
    // iterate until no fill happens (bounded — grid is finite; holes shrink)
    var changed = true, guard = 0;
    while (changed && guard < nx * ny) {
      changed = false; guard++;
      for (var yy = 0; yy < ny; yy++) {
        for (var xx = 0; xx < nx; xx++) {
          if (grid[yy][xx] != null) continue;
          var sum = 0, k = 0;
          [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(function (d) {
            var ny2 = yy + d[1], nx2 = xx + d[0];
            if (ny2 < 0 || ny2 >= ny || nx2 < 0 || nx2 >= nx) return;
            var v = grid[ny2][nx2];
            if (v != null) { sum += v; k++; }
          });
          if (k > 0) { grid[yy][xx] = sum / k; filled++; changed = true; }
        }
      }
    }
    return { grid: grid, filled: filled };
  }

  /* =========================================================================
   * SURROUND EXT-GRID ASSEMBLY (spec-surround-context-v1) — PURE.
   *
   * Build the FULL coarse (3× core spacing) ext lattice (nx×ny, row 0 = NORTH)
   * the renderer draws bands/contours over, EXACTLY as Allerton's baked ext grid
   * is drawn. Two provenances, both honest, never fabricated:
   *   · RING cells (outside the core bbox): the fetched EPQS values (ringValues,
   *     keyed "ix,iy"). Null holes are neighbor-mean filled by assembleGrid.
   *   · INTERIOR cells (inside the core bbox): the core DEM downsampled by
   *     BILINEAR interpolation of the real core grid — no new detail invented
   *     (this is the SAME smoothing bound the contour engine already honors:
   *     coarser, never finer, than the source). Interior stays coarse.
   * The interior is real core data, coarsened — the surround never feeds the
   * engine (that reads the core grid only), so this grid is for the eye alone.
   * ========================================================================= */
  // bilinear sample of a [ny][nx] grid (row 0 = north) at fractional (fx, fy).
  // Clamped to the grid; returns null only if the grid is empty. PURE.
  function bilinearSample(grid, fx, fy) {
    var ny = grid.length; if (!ny) return null;
    var nx = grid[0].length; if (!nx) return null;
    fx = Math.max(0, Math.min(nx - 1, fx));
    fy = Math.max(0, Math.min(ny - 1, fy));
    var x0 = Math.floor(fx), y0 = Math.floor(fy);
    var x1 = Math.min(nx - 1, x0 + 1), y1 = Math.min(ny - 1, y0 + 1);
    var tx = fx - x0, ty = fy - y0;
    var a = grid[y0][x0], b = grid[y0][x1], c = grid[y1][x0], d = grid[y1][x1];
    if (a == null || b == null || c == null || d == null) return null;
    return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
  }

  // assemble the ext lattice into a { extBbox, bbox, nx, ny, grid, filled }.
  // coreBbox/coreGrid are the full-resolution core; ringValues is { "ix,iy": v }
  // for the fetched ring points. `bbox` is the lattice's ACTUAL extent (the
  // centered lattice, NOT the nominal extBbox) — the renderer georeferences
  // against it so the terrain never stretches. PURE.
  function surroundAssembleGrid(coreBbox, coreGrid, ringValues) {
    var lat = surroundLattice(coreBbox);
    var nx = lat.nx, ny = lat.ny;
    var flat = new Array(nx * ny).fill(null);
    var coreNx = coreBbox.nx, coreNy = coreBbox.ny;
    var coreLonSpan = coreBbox.lon[1] - coreBbox.lon[0];
    var coreLatSpan = coreBbox.lat[1] - coreBbox.lat[0];
    for (var iy = 0; iy < ny; iy++) {
      for (var ix = 0; ix < nx; ix++) {
        var lon = lat.x0 + ix * lat.sx;
        var y = lat.y0 - iy * lat.sy; // row 0 = north
        var insideCore = (lon >= coreBbox.lon[0] && lon <= coreBbox.lon[1] &&
                          y >= coreBbox.lat[0] && y <= coreBbox.lat[1]);
        if (insideCore && coreGrid) {
          // downsample the real core grid (bilinear) — coarser, never finer
          var fx = (lon - coreBbox.lon[0]) / coreLonSpan * (coreNx - 1);
          var fy = (coreBbox.lat[1] - y) / coreLatSpan * (coreNy - 1); // row 0 = north
          flat[iy * nx + ix] = bilinearSample(coreGrid, fx, fy);
        } else {
          var rv = ringValues["" + ix + "," + iy];
          flat[iy * nx + ix] = (rv == null ? null : rv);
        }
      }
    }
    var asm = assembleGrid(flat, nx, ny); // neighbor-fill any ring holes
    return {
      extBbox: lat.extBbox, bbox: lat.bbox, nx: nx, ny: ny, sx: lat.sx, sy: lat.sy,
      grid: asm.grid, filled: asm.filled
    };
  }

  /* =========================================================================
   * COLLECTION-LOW CANDIDATE — the ONE computed flag (spec §2/§4).
   * Rule: the lowest connected ~decile of cells. Compute the 10th-percentile
   * elevation threshold; take all cells at/below it; find 4-neighbor connected
   * components; keep the LARGEST; compute its centroid + facts (min elevation,
   * distance/direction to the nearest fetched flowline vertex if any). This is a
   * COMPUTED FLAG, not a judgment — the rule is printed beside it in the UI and
   * NO priority chip is attached. Pure.
   * ========================================================================= */
  function collectionLow(grid, gridBbox, flowlines) {
    var ny = grid.length, nx = grid[0].length;
    var flat = [];
    for (var y = 0; y < ny; y++) for (var x = 0; x < nx; x++) flat.push(grid[y][x]);
    var sorted = flat.slice().sort(function (a, b) { return a - b; });
    var thr = sorted[Math.floor(sorted.length * 0.10)];
    // mask of low cells
    var low = [];
    for (var yy = 0; yy < ny; yy++) { low.push([]); for (var xx = 0; xx < nx; xx++) low[yy].push(grid[yy][xx] <= thr); }
    // 4-neighbor connected components; keep the largest
    var seen = [];
    for (var y2 = 0; y2 < ny; y2++) { seen.push([]); for (var x2 = 0; x2 < nx; x2++) seen[y2].push(false); }
    var best = null;
    for (var y3 = 0; y3 < ny; y3++) {
      for (var x3 = 0; x3 < nx; x3++) {
        if (!low[y3][x3] || seen[y3][x3]) continue;
        var stack = [[x3, y3]], cells = [];
        seen[y3][x3] = true;
        while (stack.length) {
          var cur = stack.pop(); cells.push(cur);
          [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(function (d) {
            var cx = cur[0] + d[0], cy = cur[1] + d[1];
            if (cx < 0 || cx >= nx || cy < 0 || cy >= ny) return;
            if (low[cy][cx] && !seen[cy][cx]) { seen[cy][cx] = true; stack.push([cx, cy]); }
          });
        }
        if (!best || cells.length > best.cells.length) best = { cells: cells };
      }
    }
    if (!best) return null;
    // centroid (grid coords) + min elevation
    var sx = 0, sy = 0, minEl = Infinity, minCell = null;
    best.cells.forEach(function (c) {
      sx += c[0]; sy += c[1];
      var e = grid[c[1]][c[0]];
      if (e < minEl) { minEl = e; minCell = c; }
    });
    var gx = sx / best.cells.length, gy = sy / best.cells.length;
    // centroid lon/lat
    var lon = gridBbox.lon[0] + (gx / (nx - 1)) * (gridBbox.lon[1] - gridBbox.lon[0]);
    var lat = gridBbox.lat[1] - (gy / (ny - 1)) * (gridBbox.lat[1] - gridBbox.lat[0]);
    // nearest fetched flowline vertex (if any streams present)
    var nearest = null;
    (flowlines || []).forEach(function (fl) {
      (fl.coords || []).forEach(function (v) {
        var d = metersBetween(lat, lon, v[1], v[0]);
        if (!nearest || d < nearest.m) {
          nearest = { m: d, name: fl.name, dir: bearingName(lat, lon, v[1], v[0]) };
        }
      });
    });
    return {
      cells: best.cells,           // [[gx,gy]...] grid coords, for the map region
      cellCount: best.cells.length,
      gx: gx, gy: gy,              // centroid grid coords
      lon: lon, lat: lat,          // centroid lon/lat
      minElevation: minEl,
      thresholdElevation: thr,
      nearestFlowline: nearest,    // {m, name, dir} or null
      rule: "rule: lowest decile, connected — a computed flag, not a judgment"
    };
  }

  /* =========================================================================
   * ASSEMBLE READ — PURE. Shapes parser outputs into the read object the
   * renderer consumes. demGrid uses the DEM_GRID_EXT shape (row 0 = NORTH);
   * boundaries uses the BOUNDARIES shape (roads/streams/waterbodies).
   * failures[] carries per-source honest absence markers.
   * ========================================================================= */
  function assembleRead(input) {
    // input: { lat, lon, gridBbox, grid, filledCount, soilRows, periods,
    //          roads, streams, waterbodies, failures, timestamps, dateStr }
    var gridBbox = input.gridBbox;
    var grid = input.grid;
    var soilInv = soilInventory(input.soilRows || []);
    var lowFlag = grid ? collectionLow(grid, gridBbox, input.streams || []) : null;

    // Soil BOUNDARIES (spec v2 §3): parse the SDA polygon rows → deduped outer
    // rings with drainage attribution, via the engine (dedupeByPolygonKey +
    // wktToRings). A client Douglas-Peucker second pass runs ONLY on an extreme
    // ring (>2000 verts), tolerance ~half a grid cell — disclosed as render
    // simplification. Raw rows are ALSO carried (soilPolygonRows) so the engine's
    // computeReading() can dedupe them itself in node/tests where AGRIOS_ENGINE
    // may not have been attached to `root` yet.
    var soilPolyRows = input.soilPolygonRows || [];
    var soilPolygons = null, soilSimplified = 0;
    var ENG = root.AGRIOS_ENGINE;
    if (ENG && soilPolyRows.length) {
      soilPolygons = ENG.dedupeByPolygonKey(soilPolyRows);
      var cellDeg = (gridBbox.lon[1] - gridBbox.lon[0]) / (gridBbox.nx - 1);
      var tol = cellDeg / 2; // ~half a grid cell
      soilPolygons.forEach(function (p) {
        p.rings = p.rings.map(function (ring) {
          if (ring.length > 2000) { soilSimplified++; return ENG.douglasPeucker(ring, tol); }
          return ring;
        });
      });
    }

    var demGrid = grid ? {
      source: "USGS 3DEP via epqs.nationalmap.gov (live read)",
      units: "feet", wkid: 4326,
      bbox: { lat: gridBbox.lat, lon: gridBbox.lon },
      nx: gridBbox.nx, ny: gridBbox.ny,
      spacing_m: "~" + Math.round(EXTENT_LON_M / (gridBbox.nx - 1)) + " m between samples (live-read resolution)",
      holes_filled_by_neighbor_mean: input.filledCount || 0,
      grid: grid,
      row_order: "row 0 = NORTH (built north-up directly by the live engine)"
    } : null;

    var boundaries = {
      source: "Census TIGERweb + USGS NHD + FEMA/ORNL USA Structures (live read)",
      bbox: { lat: gridBbox.lat, lon: gridBbox.lon },
      roads: input.roads || [],
      streams: input.streams || [],
      waterbodies: input.waterbodies || [],
      buildings: input.buildings || [],   // FEMA/ORNL footprints (spec §1; failable)
      analysis: {
        roads: (input.roads || []).length,
        streams: (input.streams || []).length,
        waterbodies: (input.waterbodies || []).length,
        buildings: (input.buildings || []).length
      }
    };

    return {
      live: true,
      lat: input.lat, lon: input.lon,
      dateStr: input.dateStr || null,
      gridBbox: gridBbox,
      demGrid: demGrid,
      boundaries: boundaries,
      soil: { rows: input.soilRows || [], inventory: soilInv },
      soilPolygonRows: soilPolyRows,        // raw Table rows (engine dedupes if needed)
      soilPolygons: soilPolygons,           // parsed+deduped poly objects (or null)
      soilBoundariesSimplified: soilSimplified, // rings client-simplified (>2000 verts)
      forecasts: input.periods || [],
      history: input.history || [],       // ACIS observed daily rows (spec-time-axis-v1)
      // SURROUND context terrain (spec-surround-context-v1) — OPTIONAL. The coarse
      // (3× core spacing) ext grid { grid, bbox, spacing } beyond the read core, or
      // NULL when the failable surround fetch did not succeed. NOT part of the v4
      // cache guard (isV4Read unchanged): a v4 read without surround restores with
      // no context terrain until the next re-read. Never fed to the engine.
      surround: input.surround || null,
      collectionLow: lowFlag,
      timestamps: input.timestamps || {},
      failures: input.failures || []
    };
  }

  /* =========================================================================
   * CACHE — localStorage. key `agrios-read-{lat4},{lon4}` (4-decimal coords).
   * Helpers are pure/testable; read/write guard localStorage access. Allerton is
   * never cached (baked). ~150–300 KB per read — fine.
   * ========================================================================= */
  function cacheKey(lat, lon) {
    return "agrios-read-" + lat.toFixed(4) + "," + lon.toFixed(4);
  }
  function cacheWrite(read) {
    try {
      var payload = JSON.stringify({ savedAt: Date.now(), read: read });
      root.localStorage.setItem(cacheKey(read.lat, read.lon), payload);
      root.localStorage.setItem("agrios-read-last", cacheKey(read.lat, read.lon));
    } catch (e) { /* quota / disabled — silently skip, never fabricate */ }
  }
  // Cache-schema guard, graceful across versions. Each version adds a layer and
  // treats earlier entries as STALE (return null) so they re-read live rather
  // than feeding the engine a read missing a layer:
  //   v2 — adds soilPolygonRows
  //   v3 — adds boundaries.buildings (spec-buildings-v1)
  //   v4 — adds read.history (ACIS observed axis, spec-time-axis-v1)
  // A current read must pass ALL predicates (each is the intermediate gate).
  function isV2Read(parsed) {
    return !!(parsed && parsed.read && Object.prototype.hasOwnProperty.call(parsed.read, "soilPolygonRows"));
  }
  function isV3Read(parsed) {
    return !!(isV2Read(parsed) && parsed.read.boundaries &&
      Object.prototype.hasOwnProperty.call(parsed.read.boundaries, "buildings"));
  }
  function isV4Read(parsed) {
    return !!(isV3Read(parsed) && Object.prototype.hasOwnProperty.call(parsed.read, "history"));
  }
  function cacheRead(lat, lon) {
    try {
      var raw = root.localStorage.getItem(cacheKey(lat, lon));
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return isV4Read(parsed) ? parsed : null; // pre-v4 entry → stale, re-read live
    } catch (e) { return null; }
  }
  function cacheReadLast() {
    try {
      var k = root.localStorage.getItem("agrios-read-last");
      if (!k) return null;
      var raw = root.localStorage.getItem(k);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return isV4Read(parsed) ? parsed : null; // pre-v4 entry → stale
    } catch (e) { return null; }
  }

  /* =========================================================================
   * FETCH ORCHESTRATOR — BROWSER ONLY. Concurrency pool 10, 2 retries with
   * jitter, AbortController, per-source progress callbacks. Never fabricates: a
   * failed source yields a failure entry + absence marker; if elevation fails
   * entirely the whole read fails honestly (can't draw terrain without it).
   *
   * The FIVE hosts appear ONLY here in fetch URLs (spec §6). No other host.
   * ========================================================================= */
  var HOST = {
    epqs:  "https://epqs.nationalmap.gov/v1/json",
    nws:   "https://api.weather.gov",
    sda:   "https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest",
    tiger: "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Transportation/MapServer",
    nhd:   "https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer",
    fema:  "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/USA_Structures_View/FeatureServer/0/query",
    acis:  "https://data.rcc-acis.org/GridData"
  };

  function jitter(ms) { return ms + Math.floor(Math.random() * 150); }
  function sleep(ms, signal) {
    return new Promise(function (res, rej) {
      var t = setTimeout(res, ms);
      if (signal) signal.addEventListener("abort", function () { clearTimeout(t); rej(new DOMException("aborted", "AbortError")); }, { once: true });
    });
  }

  // fetch a URL with 2 retries + jitter, honoring the AbortController signal.
  function fetchRetry(url, opts, signal, retries) {
    retries = (retries == null) ? 2 : retries;
    var attempt = 0;
    function go() {
      var o = Object.assign({}, opts, { signal: signal });
      return fetch(url, o).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r;
      }).catch(function (err) {
        if (signal && signal.aborted) throw err;
        if (attempt < retries) { attempt++; return sleep(jitter(300 * attempt), signal).then(go); }
        throw err;
      });
    }
    return go();
  }

  // concurrency pool: run `tasks` (fns returning promises) at most `limit` at a
  // time; resolves when all settle. Each task handles its own errors.
  function pool(tasks, limit, signal) {
    return new Promise(function (resolve) {
      var i = 0, active = 0, done = 0, n = tasks.length;
      if (n === 0) return resolve();
      function next() {
        if (signal && signal.aborted) return; // stop scheduling
        while (active < limit && i < n) {
          var task = tasks[i++]; active++;
          task().then(finish, finish);
        }
      }
      function finish() {
        active--; done++;
        if (done >= n) resolve();
        else next();
      }
      next();
    });
  }

  /* fetchRead(lat, lon, opts) → Promise<read>. opts:
   *   { dateStr, onProgress(source, {done,total,state,note}), signal }
   * Sources: elevation (972 EPQS points, pooled), soil (SDA POST), weather
   * (NWS points → forecast), roads (TIGER), streams/ponds (NHD).
   * Elevation failure ⇒ reject with {elevationFailed:true} (honest whole-read
   * failure). Other source failures ⇒ recorded in failures[], read still built. */
  function fetchRead(lat, lon, opts) {
    opts = opts || {};
    var onP = opts.onProgress || function () {};
    var controller = opts.signal ? null : (typeof AbortController !== "undefined" ? new AbortController() : null);
    var signal = opts.signal || (controller && controller.signal);
    var gridBbox = bboxFor(lat, lon);
    var failures = [];
    var timestamps = {};

    // ---- ELEVATION: 972 points, pool of 10, progress "elevation N/972" ----
    var total = gridBbox.nx * gridBbox.ny;
    var values = new Array(total).fill(null);
    var elevDone = 0, elevFail = 0;
    onP("elevation", { done: 0, total: total, state: "run" });
    var elevTasks = [];
    for (var iy = 0; iy < gridBbox.ny; iy++) {
      for (var ix = 0; ix < gridBbox.nx; ix++) {
        (function (ix, iy) {
          var pt = gridPointLonLat(gridBbox, ix, iy);
          var idx = iy * gridBbox.nx + ix;
          var url = HOST.epqs + "?x=" + pt.lon.toFixed(6) + "&y=" + pt.lat.toFixed(6) + "&units=Feet&wkid=4326&includeDate=false";
          elevTasks.push(function () {
            return fetchRetry(url, { headers: { "Accept": "application/json" } }, signal, 2)
              .then(function (r) { return r.json(); })
              .then(function (j) {
                var v = epqsValue(j);
                if (v != null) values[idx] = v; else elevFail++;
              })
              .catch(function () { elevFail++; })
              .then(function () {
                elevDone++;
                if (elevDone % 12 === 0 || elevDone === total) {
                  onP("elevation", { done: elevDone, total: total, state: "run" });
                }
              });
          });
        })(ix, iy);
      }
    }

    // ---- SOIL: SDA POST (spatial query over the bbox WKT) ----
    function soilTask() {
      onP("soil", { done: 0, total: 1, state: "run" });
      var wkt = bboxWkt(gridBbox);
      var sql =
        "SELECT DISTINCT mu.mukey, mu.muname, c.compname, c.drainagecl, " +
        "co.slope_l, co.slope_h, c.comppct_r " +
        "FROM mapunit mu " +
        "INNER JOIN component c ON c.mukey = mu.mukey AND c.majcompflag = 'Yes' " +
        "LEFT JOIN component co ON co.cokey = c.cokey " +
        "WHERE mu.mukey IN (SELECT DISTINCT mukey FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('" + wkt + "')) " +
        "ORDER BY c.comppct_r DESC";
      var body = JSON.stringify({ query: sql, format: "JSON+COLUMNNAME" });
      return fetchRetry(HOST.sda, { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: body }, signal, 2)
        .then(function (r) { return r.json(); })
        .then(function (j) {
          timestamps.soil = new Date().toISOString();
          onP("soil", { done: 1, total: 1, state: "done" });
          return sdaRows(j);
        })
        .catch(function () {
          failures.push({ source: "soil", consequence: "no soil inventory for this read" });
          onP("soil", { done: 0, total: 1, state: "fail", note: "no soil inventory for this read" });
          return [];
        });
    }

    // ---- SOIL BOUNDARIES: SDA POST — map-unit POLYGONS with drainage attribution
    // (spec §3). The heaviest single fetch (~0.5–1 MB). The exact query shape from
    // the spec: mupolygonkey + attributes + mupolygongeo.Reduce(0.00005).STAsText()
    // over SDA_Get_Mupolygonkey_from_intersection_with_WktWgs84(bboxWKT). The
    // Reduce(0.00005) halves the payload server-side (Douglas-Peucker-like). Rows
    // are parsed to outer rings + deduped by mupolygonkey by the engine; a client
    // Douglas-Peucker second pass runs only if a ring is extreme (>2000 verts,
    // tolerance ~half a grid cell — disclosed as render simplification). Holes are
    // ignored at this scale (disclosed). Progress row "Soil boundaries".
    function soilPolyTask() {
      onP("soil-polygons", { done: 0, total: 1, state: "run" });
      var wkt = bboxWkt(gridBbox);
      var sql =
        "SELECT mp.mupolygonkey, mu.mukey, mu.muname, c.compname, c.drainagecl, " +
        "c.slope_l, c.slope_h, mp.mupolygongeo.Reduce(0.00005).STAsText() AS geom " +
        "FROM mupolygon mp " +
        "INNER JOIN mapunit mu ON mu.mukey = mp.mukey " +
        "LEFT JOIN component c ON c.mukey = mu.mukey AND c.majcompflag = 'Yes' " +
        "WHERE mp.mupolygonkey IN " +
        "(SELECT DISTINCT mupolygonkey FROM SDA_Get_Mupolygonkey_from_intersection_with_WktWgs84('" + wkt + "'))";
      var body = JSON.stringify({ query: sql, format: "JSON" });
      return fetchRetry(HOST.sda, { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: body }, signal, 2)
        .then(function (r) { return r.json(); })
        .then(function (j) {
          timestamps.soilPolygons = new Date().toISOString();
          var rows = sdaPolygonRows(j); // shape-guarded raw Table rows
          if (!rows.length) {
            // empty polygon set is a soft failure: degrade to elevation-only zones
            failures.push({ source: "soil-polygons", consequence: "soil boundaries unreachable — zone computation limited to elevation structure" });
            onP("soil-polygons", { done: 0, total: 1, state: "fail", note: "no soil boundaries returned" });
            return [];
          }
          onP("soil-polygons", { done: 1, total: 1, state: "done", note: rows.length + " polygons" });
          return rows; // shaped/deduped/parsed in assembleRead via the engine
        })
        .catch(function () {
          failures.push({ source: "soil-polygons", consequence: "soil boundaries unreachable — zone computation limited to elevation structure" });
          onP("soil-polygons", { done: 0, total: 1, state: "fail", note: "soil boundaries unreachable this read" });
          return [];
        });
    }

    // ---- WEATHER: NWS points → forecast ----
    function weatherTask() {
      onP("weather", { done: 0, total: 1, state: "run" });
      var ptsUrl = HOST.nws + "/points/" + lat.toFixed(4) + "," + lon.toFixed(4);
      return fetchRetry(ptsUrl, { headers: { "Accept": "application/geo+json", "User-Agent": "AGRIOS-Focus" } }, signal, 2)
        .then(function (r) { return r.json(); })
        .then(function (pj) {
          var fUrl = pj && pj.properties && pj.properties.forecast;
          if (!fUrl || fUrl.indexOf(HOST.nws) !== 0) throw new Error("no forecast url");
          return fetchRetry(fUrl, { headers: { "Accept": "application/geo+json", "User-Agent": "AGRIOS-Focus" } }, signal, 2);
        })
        .then(function (r) { return r.json(); })
        .then(function (fj) {
          timestamps.weather = new Date().toISOString();
          onP("weather", { done: 1, total: 1, state: "done" });
          return nwsPeriods(fj);
        })
        .catch(function () {
          failures.push({ source: "weather", consequence: "no forecast for this read" });
          onP("weather", { done: 0, total: 1, state: "fail", note: "no forecast for this read" });
          return [];
        });
    }

    // ---- ROADS: TIGER local roads (layer 0) + railroads (layer 9) ----
    function roadsTask() {
      onP("roads", { done: 0, total: 1, state: "run" });
      var geom = bboxEsri(gridBbox);
      function q(layer) {
        var url = HOST.tiger + "/" + layer + "/query?geometry=" + encodeURIComponent(geom) +
          "&geometryType=esriGeometryEnvelope&inSR=4326&outSR=4326&spatialRel=esriSpatialRelIntersects" +
          "&outFields=NAME,MTFCC&returnGeometry=true&f=geojson";
        return fetchRetry(url, { headers: { "Accept": "application/json" } }, signal, 2).then(function (r) { return r.json(); });
      }
      // Layer 8 = Local Roads (the layer rural fields actually have — layer 0 is
      // interstates-only and silently returned zero everywhere; caught 2026-07-05).
      // 6/2 add secondary/primary highways for fields near them; 9 = railroads.
      var empty = function () { return { features: [] }; };
      return Promise.all([q(8), q(6).catch(empty), q(2).catch(empty), q(9).catch(empty)])
        .then(function (res) {
          timestamps.roads = new Date().toISOString();
          var roads = tigerGeojson(res[0]).concat(tigerGeojson(res[1]), tigerGeojson(res[2]), tigerGeojson(res[3]));
          onP("roads", { done: 1, total: 1, state: "done" });
          return roads;
        })
        .catch(function () {
          failures.push({ source: "roads", consequence: "no road layer for this read" });
          onP("roads", { done: 0, total: 1, state: "fail", note: "no road layer for this read" });
          return [];
        });
    }

    // ---- STREAMS/PONDS: NHD flowlines (layer 6) + waterbodies (layer 12) ----
    function hydroTask() {
      onP("hydro", { done: 0, total: 1, state: "run" });
      var geom = bboxEsri(gridBbox);
      function q(layer, fields) {
        var url = HOST.nhd + "/" + layer + "/query?geometry=" + encodeURIComponent(geom) +
          "&geometryType=esriGeometryEnvelope&inSR=4326&outSR=4326&spatialRel=esriSpatialRelIntersects" +
          "&outFields=" + fields + "&returnGeometry=true&f=geojson";
        return fetchRetry(url, { headers: { "Accept": "application/json" } }, signal, 2).then(function (r) { return r.json(); });
      }
      return Promise.all([q(6, "fcode,gnis_name"), q(12, "fcode,gnis_name").catch(function () { return { features: [] }; })])
        .then(function (res) {
          timestamps.hydro = new Date().toISOString();
          var fl = nhdGeojson(res[0], gridBbox);
          var wb = nhdGeojson(res[1], gridBbox);
          onP("hydro", { done: 1, total: 1, state: "done" });
          return { streams: fl.streams, waterbodies: wb.waterbodies };
        })
        .catch(function () {
          failures.push({ source: "hydro", consequence: "no stream layer for this read" });
          onP("hydro", { done: 0, total: 1, state: "fail", note: "no stream layer for this read" });
          return { streams: [], waterbodies: [] };
        });
    }

    // ---- BUILDINGS: FEMA/ORNL USA Structures (spec §1) — FAILABLE. Full-geometry
    // queries can be slow (~10–60 s), so this task fetches lean (outFields limited
    // to OCC_CLS,SQFEET,HEIGHT, returnGeometry + f=geojson) with a GENEROUS ~60 s
    // timeout and 1 retry. On failure the read still renders — buildings are one
    // more honest layer, never a hard dependency; the consequence line is stated
    // verbatim ("buildings unreachable — no structures layer this read").
    function buildingsTask() {
      onP("buildings", { done: 0, total: 1, state: "run" });
      var geom = bboxEsri(gridBbox);
      var url = HOST.fema + "?geometry=" + encodeURIComponent(geom) +
        "&geometryType=esriGeometryEnvelope&inSR=4326&outSR=4326&spatialRel=esriSpatialRelIntersects" +
        "&outFields=OCC_CLS,SQFEET,HEIGHT&returnGeometry=true&f=geojson";
      // a per-source ~60 s timeout, chained to the parent abort signal so Cancel
      // still stops it cleanly. 1 retry (not 2 — a slow source, kept lean).
      var timedSignal = signal, timeoutId = null, localCtl = null;
      if (typeof AbortController !== "undefined") {
        localCtl = new AbortController();
        timedSignal = localCtl.signal;
        timeoutId = setTimeout(function () { try { localCtl.abort(); } catch (e) {} }, 60000);
        if (signal) signal.addEventListener("abort", function () { try { localCtl.abort(); } catch (e) {} }, { once: true });
      }
      return fetchRetry(url, { headers: { "Accept": "application/json" } }, timedSignal, 1)
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (timeoutId) clearTimeout(timeoutId);
          timestamps.buildings = new Date().toISOString();
          var footprints = femaGeojson(j);
          onP("buildings", { done: 1, total: 1, state: "done", note: footprints.length + " footprints" });
          return footprints;
        })
        .catch(function () {
          if (timeoutId) clearTimeout(timeoutId);
          failures.push({ source: "buildings", consequence: "buildings unreachable — no structures layer this read" });
          onP("buildings", { done: 0, total: 1, state: "fail", note: "buildings unreachable — no structures layer this read" });
          return [];
        });
    }

    // ---- HISTORY: NOAA/RCC ACIS GridData (spec-time-axis-v1) — FAILABLE. POST
    // the trailing ~14-day observed window (today-14 … today-1) at this lon/lat
    // from PRISM (~4km grid "21"), elems pcpn/maxt/mint. Parsed to observed daily
    // rows (acisHistory). On failure the read still renders — the past days show
    // an "observed record unavailable" honest note; the forward axis is unaffected.
    function historyTask() {
      onP("history", { done: 0, total: 1, state: "run" });
      var sdate = isoDaysAgo(14), edate = isoDaysAgo(1);
      var body = JSON.stringify({
        loc: lon.toFixed(4) + "," + lat.toFixed(4),   // ACIS GridData is "lon,lat"
        grid: "21",                                    // PRISM daily ~4km
        sdate: sdate, edate: edate,
        elems: [{ name: "pcpn" }, { name: "maxt" }, { name: "mint" }]
      });
      return fetchRetry(HOST.acis, { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: body }, signal, 2)
        .then(function (r) { return r.json(); })
        .then(function (j) {
          timestamps.history = new Date().toISOString();
          var rows = acisHistory(j);
          onP("history", { done: 1, total: 1, state: "done", note: rows.length + " observed day" + (rows.length === 1 ? "" : "s") });
          return rows;
        })
        .catch(function () {
          failures.push({ source: "history", consequence: "observed record unavailable — no history for this read" });
          onP("history", { done: 0, total: 1, state: "fail", note: "observed record unavailable — no history for this read" });
          return [];
        });
    }

    // ---- SURROUND TERRAIN: a coarse, FAILABLE context ring (spec-surround-
    // context-v1, spacing per v1.1). AFTER the core grid completes, fetch the
    // surround RING (ext bbox = core +50% each side, 3× spacing, ring only) at
    // the SAME EPQS host, same pool/retry/abort machinery, its own progress row
    // "Surround terrain" with an honest count. FAILABLE like History/Buildings:
    // any failure → a per-source consequence line + the read still succeeds with
    // surround: null (no context terrain until re-read). NEVER blocks or alters
    // the core read.
    function surroundTask(coreGrid) {
      var ring = surroundRingPoints(gridBbox);   // ring-only lattice points
      var ringTotal = ring.length;
      onP("surround", { done: 0, total: ringTotal, state: "run" });
      var ringValues = {};
      var sDone = 0, sFail = 0;
      var sTasks = ring.map(function (pt) {
        var url = HOST.epqs + "?x=" + pt.lon.toFixed(6) + "&y=" + pt.lat.toFixed(6) + "&units=Feet&wkid=4326&includeDate=false";
        return function () {
          return fetchRetry(url, { headers: { "Accept": "application/json" } }, signal, 2)
            .then(function (r) { return r.json(); })
            .then(function (j) {
              var v = epqsValue(j);
              if (v != null) ringValues["" + pt.ix + "," + pt.iy] = v; else sFail++;
            })
            .catch(function () { sFail++; })
            .then(function () {
              sDone++;
              if (sDone % 12 === 0 || sDone === ringTotal) {
                onP("surround", { done: sDone, total: ringTotal, state: "run" });
              }
            });
        };
      });
      return pool(sTasks, 10, signal).then(function () {
        // whole ring unreachable → honest failure, read still succeeds without it
        if (sFail >= ringTotal) {
          failures.push({ source: "surround", consequence: "surround terrain unreachable — no context terrain beyond the read core this read" });
          onP("surround", { done: sDone, total: ringTotal, state: "fail", note: "surround terrain unreachable — no context terrain this read" });
          return null;
        }
        timestamps.surround = new Date().toISOString();
        var ext = surroundAssembleGrid(gridBbox, coreGrid, ringValues);
        onP("surround", { done: ringTotal, total: ringTotal, state: "done",
          note: ringTotal + " points · coarse (3× core spacing)" });
        return {
          grid: ext.grid,
          // the lattice's ACTUAL bbox (centered), not the nominal ext — the
          // renderer georeferences against this so the terrain never stretches
          bbox: { lat: ext.bbox.lat, lon: ext.bbox.lon, nx: ext.nx, ny: ext.ny },
          spacing: "~" + Math.round(EXTENT_LON_M / (gridBbox.nx - 1) * SURROUND_SPACING) + " m between samples (coarse, 3× core spacing — context, not survey)",
          ringPoints: ringTotal,
          holes_filled_by_neighbor_mean: ext.filled
        };
      });
    }

    // run elevation pool + the four singleton sources together
    var elevPromise = pool(elevTasks, 10, signal).then(function () {
      timestamps.elevation = new Date().toISOString();
      if (elevFail >= total) {
        onP("elevation", { done: elevDone, total: total, state: "fail", note: "elevation unreachable — cannot draw terrain" });
        var e = new Error("elevation failed"); e.elevationFailed = true; throw e;
      }
      var asm = assembleGrid(values, gridBbox.nx, gridBbox.ny);
      onP("elevation", { done: total, total: total, state: "done",
        note: asm.filled ? (asm.filled + " point(s) neighbor-filled") : null });
      return asm;
    });

    // surround starts ONLY after the core grid is in hand (spec: "after the core
    // grid completes"). FAILABLE: any rejection resolves to null — never rejects
    // the read. If elevation itself failed, elevPromise already rejects the read,
    // so this catch just keeps the surround chain from throwing on its own.
    var surroundPromise = elevPromise.then(function (asm) {
      return surroundTask(asm.grid);
    }).catch(function () {
      failures.push({ source: "surround", consequence: "surround terrain unreachable — no context terrain beyond the read core this read" });
      return null;
    });

    return Promise.all([elevPromise, soilTask(), weatherTask(), roadsTask(), hydroTask(), soilPolyTask(), buildingsTask(), historyTask(), surroundPromise])
      .then(function (r) {
        if (signal && signal.aborted) { var ae = new Error("aborted"); ae.aborted = true; throw ae; }
        var asm = r[0], soilRows = r[1], periods = r[2], roads = r[3], hydro = r[4], soilPolyRows = r[5], buildings = r[6], history = r[7], surround = r[8];
        var read = assembleRead({
          lat: lat, lon: lon, dateStr: opts.dateStr,
          gridBbox: gridBbox, grid: asm.grid, filledCount: asm.filled,
          soilRows: soilRows, soilPolygonRows: soilPolyRows, periods: periods,
          roads: roads, streams: hydro.streams, waterbodies: hydro.waterbodies,
          buildings: buildings, history: history, surround: surround,
          failures: failures, timestamps: timestamps
        });
        return read;
      });
    // NOTE: if elevPromise rejects (elevationFailed), Promise.all rejects — the
    // caller offers a retry. The read is NOT built without terrain (honest). The
    // surround is FAILABLE and NEVER a reason the whole read fails.
  }

  /* =========================================================================
   * ON-DEMAND OBSERVED DAY (spec-observed-on-demand-v1) — BROWSER ONLY.
   *
   * The time axis holds only the trailing ~14 observed days a read fetched. But
   * ACIS/PRISM hold the observed record back to 1981 — so ANY past day is
   * retrievable on demand. fetchObservedDay POSTs a SINGLE-DAY GridData query at
   * this lon/lat (the SAME endpoint, grid "21" = PRISM ~4km, elems pcpn/maxt/mint)
   * and returns ONE observed row {dateStr,pcpn,maxt,mint} via the existing
   * acisHistory parser (reused — null-safe on the "M" sentinel). This is the
   * narrowing of the no-refetch rule: days already HELD recompute with no fetch;
   * a past day OUTSIDE the held window is a single on-demand fetch, clearly
   * labeled at the call site.
   *
   * GUARD: a future date (dateStr >= the read's local today) is rejected — the
   * future beyond the forecast window is a projection nobody has, not a record.
   * Rejects with an Error carrying .futureDate so the caller can distinguish it
   * from a network failure. Returns null only if ACIS returned no row for the day.
   * ========================================================================= */
  function fetchObservedDay(lat, lon, dateStr, signal) {
    var today = localTodayStr();
    if (dateStr == null || typeof dateStr !== "string" || dateStr.length < 10) {
      return Promise.reject(new Error("a valid YYYY-MM-DD date is required"));
    }
    if (dateStr >= today) {
      var fe = new Error("the future beyond the forecast window is a projection nobody has");
      fe.futureDate = true;
      return Promise.reject(fe);
    }
    var body = JSON.stringify({
      loc: lon.toFixed(4) + "," + lat.toFixed(4),   // ACIS GridData is "lon,lat"
      grid: "21",                                    // PRISM daily ~4km
      sdate: dateStr, edate: dateStr,                // one day
      elems: [{ name: "pcpn" }, { name: "maxt" }, { name: "mint" }]
    });
    return fetchRetry(HOST.acis, { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: body }, signal, 2)
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var rows = acisHistory(j);              // reuse the exact parser (null-safe on "M")
        if (!rows.length) return null;          // ACIS answered but held no row for the day
        return rows[0];                         // one {dateStr,pcpn,maxt,mint}
      });
  }

  // WKT POLYGON for the SDA spatial query (lon lat pairs, CCW ring, closed).
  function bboxWkt(b) {
    var w = b.lon[0], e = b.lon[1], s = b.lat[0], n = b.lat[1];
    return "POLYGON((" + w + " " + s + "," + e + " " + s + "," + e + " " + n + "," + w + " " + n + "," + w + " " + s + "))";
  }
  // "YYYY-MM-DD" for N days before the local today (ACIS sdate/edate). Uses local
  // midnight arithmetic so the window matches the calendar days the axis renders.
  function isoDaysAgo(n) {
    var d = new Date();
    d.setDate(d.getDate() - n);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
      "-" + String(d.getDate()).padStart(2, "0");
  }
  // Esri envelope JSON (xmin,ymin,xmax,ymax) for ArcGIS query geometry.
  function bboxEsri(b) {
    return JSON.stringify({ xmin: b.lon[0], ymin: b.lat[0], xmax: b.lon[1], ymax: b.lat[1], spatialReference: { wkid: 4326 } });
  }

  /* =========================================================================
   * EXPORT
   * ========================================================================= */
  var AGRIOS_LIVE = {
    // geometry
    bboxFor: bboxFor,
    gridPointLonLat: gridPointLonLat,
    metersBetween: metersBetween,
    bearingName: bearingName,
    GRID_NX: GRID_NX, GRID_NY: GRID_NY,
    EXTENT_LON_M: EXTENT_LON_M, EXTENT_LAT_M: EXTENT_LAT_M,
    // surround geometry (spec-surround-context-v1) — PURE, node-testable
    surroundExtBbox: surroundExtBbox,
    surroundLattice: surroundLattice,
    surroundRingPoints: surroundRingPoints,
    surroundAssembleGrid: surroundAssembleGrid,
    bilinearSample: bilinearSample,
    // parsers (pure)
    parsers: {
      epqsValue: epqsValue,
      sdaRows: sdaRows,
      sdaPolygonRows: sdaPolygonRows,
      soilInventory: soilInventory,
      nwsPeriods: nwsPeriods,
      periodsForDate: periodsForDate,
      forecastWindow: forecastWindow,
      timeAxis: timeAxis,
      dayLabel: dayLabel,
      tigerGeojson: tigerGeojson,
      nhdGeojson: nhdGeojson,
      femaGeojson: femaGeojson,
      acisHistory: acisHistory,
      ringCentroid: ringCentroid
    },
    // assembly (pure)
    assembleGrid: assembleGrid,
    collectionLow: collectionLow,
    assembleRead: assembleRead,
    // cache
    cacheKey: cacheKey,
    cacheWrite: cacheWrite,
    cacheRead: cacheRead,
    cacheReadLast: cacheReadLast,
    isV3Read: isV3Read,   // cache-schema v3 guard (spec-buildings-v1), node-testable
    isV4Read: isV4Read,   // cache-schema v4 guard (spec-time-axis-v1: history), node-testable
    // orchestrator (browser)
    fetchRead: fetchRead,
    fetchObservedDay: fetchObservedDay,   // on-demand single observed day (spec-observed-on-demand-v1)
    HOST: HOST
  };

  root.AGRIOS_LIVE = AGRIOS_LIVE;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { AGRIOS_LIVE: AGRIOS_LIVE };
  }
})(typeof window !== "undefined" ? window : this);
