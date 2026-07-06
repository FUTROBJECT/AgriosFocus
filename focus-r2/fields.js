/* =============================================================================
 * AGRIOS Focus — SAVED FIELDS registry (spec-saved-fields-v1, focus-r2/ ONLY).
 *
 * A live read can be NAMED, given STATED BOUNDS, annotated, and saved. Saved
 * fields become places the farmer knows ("Home place," not "41.72, −93.41").
 *
 * This module is the STORAGE + VALIDATION layer — the pure parts are node-
 * exportable + unit-tested (verify.js §5). It owns ONLY the registry
 * (localStorage `agrios-fields`); the READS themselves stay in the existing
 * read-cache mechanism (live.js `agrios-read-{lat4},{lon4}`), referenced here by
 * `readKey`. Deleting a field removes its registry entry only — the read cache
 * keeps its own lifecycle (spec §3/§4).
 *
 * THE HONEST-BOUNDS RULE (spec §2 — DESIGN LAW): stated bounds are the FARMER'S
 * claim of record. They are the PARCEL_BBOX-equivalent a bounded field feeds to
 * the renderer so Allerton's exact stated-bounds path runs unchanged (wash +
 * solid boundary + parcel framing). The read extent (the instrument's aperture)
 * is UNCHANGED; the engine still computes over the full extent. Bounds are
 * identity, not blinders. Validation (this file) enforces: inside the read
 * extent, N>S, E>W, span ≥ ~100 m and ≤ the extent.
 *
 * STRUCTURE
 *   · pure   — schema guard, validation (bounds + name), CRUD over a plain
 *              object (no I/O), relative-time formatting. Node-exportable.
 *   · store  — localStorage read/write of the registry (guarded; quota-safe).
 *
 * REGISTRY SCHEMA (spec §3):
 *   { v: 1, fields: [ { id, name, note, lat, lon, bounds|null, createdAt,
 *                       lastReadAt, readKey } ] }
 *   bounds (when set) = { n, s, e, w } decimal degrees (4 dp), inside the read
 *   extent. Cap: 8 fields; overflow is an HONEST ERROR, never silent eviction.
 * ========================================================================== */
(function (root) {
  "use strict";

  var STORE_KEY = "agrios-fields";
  var SCHEMA_VERSION = 1;
  var CAP = 8;

  // spans in meters (spec §2): a stated field must be a real parcel, not a dot
  // and not the whole county — ≥ ~100 m on each axis, ≤ the read extent.
  var MIN_SPAN_M = 100;
  var M_PER_DEG_LAT = 111132; // matches live.js — equirectangular at mid-US scale

  function mPerDegLon(lat) { return M_PER_DEG_LAT * Math.cos(lat * Math.PI / 180); }

  /* =========================================================================
   * SCHEMA GUARD (pure). A stored registry of an unknown/absent version is
   * ignored GRACEFULLY (spec §3): we return the empty v1 registry rather than
   * feed the UI a shape it can't trust. A well-formed v1 registry passes
   * through with its fields array (defensively coerced to an array).
   * ========================================================================= */
  function emptyRegistry() { return { v: SCHEMA_VERSION, fields: [] }; }
  function isCurrentSchema(reg) {
    return !!(reg && reg.v === SCHEMA_VERSION && Array.isArray(reg.fields));
  }
  // normalize any parsed value into a trusted registry (or the empty one).
  function guardRegistry(parsed) {
    if (!isCurrentSchema(parsed)) return emptyRegistry();
    return { v: SCHEMA_VERSION, fields: parsed.fields.slice() };
  }

  /* =========================================================================
   * NAME VALIDATION (pure). Required, ≤ 40 chars after trim. Returns
   * { ok, name?, error? }.
   * ========================================================================= */
  function validateName(raw) {
    var name = (raw == null ? "" : String(raw)).trim();
    if (!name) return { ok: false, error: "Name is required." };
    if (name.length > 40) return { ok: false, error: "Name must be 40 characters or fewer." };
    return { ok: true, name: name };
  }
  function validateNote(raw) {
    var note = (raw == null ? "" : String(raw)).trim();
    if (note.length > 140) return { ok: false, error: "Note must be 140 characters or fewer." };
    return { ok: true, note: note };
  }

  /* =========================================================================
   * BOUNDS VALIDATION (pure — spec §2, each rule unit-testable).
   * bounds = { n, s, e, w }; extent = the read's gridBbox { lat:[s,n], lon:[w,e] }.
   * Rules, in order (first failure returned):
   *   1. all four are finite numbers
   *   2. N > S  and  E > W  (a real rectangle, right way up)
   *   3. inside the read extent (the instrument's aperture — bounds cannot claim
   *      ground the read never sampled)
   *   4. sane spans: each axis ≥ ~100 m AND ≤ the extent on that axis
   * Returns { ok, bounds?, error? }. On ok, bounds are rounded to 4 dp (the
   * stored precision + what the inputs show).
   * ========================================================================= */
  function round4(v) { return Math.round(v * 1e4) / 1e4; }

  function validateBounds(bounds, extent) {
    if (!bounds) return { ok: false, error: "No bounds to validate." };
    var n = Number(bounds.n), s = Number(bounds.s), e = Number(bounds.e), w = Number(bounds.w);
    // 1 · finite
    if (![n, s, e, w].every(function (v) { return typeof v === "number" && isFinite(v); })) {
      return { ok: false, error: "Enter four numeric bounds (N, S, E, W)." };
    }
    // 2 · orientation
    if (!(n > s)) return { ok: false, error: "North must be greater than South." };
    if (!(e > w)) return { ok: false, error: "East must be greater than West." };
    // 3 · inside the read extent (small epsilon tolerates 4-dp rounding at the edge)
    if (extent && extent.lat && extent.lon) {
      var EPS = 1e-4;
      var exS = extent.lat[0], exN = extent.lat[1], exW = extent.lon[0], exE = extent.lon[1];
      if (n > exN + EPS || s < exS - EPS || e > exE + EPS || w < exW - EPS) {
        return { ok: false, error: "Bounds must sit inside the read extent (the map you can see)." };
      }
    }
    // 4 · sane spans
    var midLat = (n + s) / 2;
    var spanLatM = (n - s) * M_PER_DEG_LAT;
    var spanLonM = (e - w) * mPerDegLon(midLat);
    if (spanLatM < MIN_SPAN_M || spanLonM < MIN_SPAN_M) {
      return { ok: false, error: "Bounds are too small — each side must be at least ~100 m." };
    }
    if (extent && extent.lat && extent.lon) {
      var extLatM = (extent.lat[1] - extent.lat[0]) * M_PER_DEG_LAT;
      var extLonM = (extent.lon[1] - extent.lon[0]) * mPerDegLon(midLat);
      // extent spans, plus the same 4-dp epsilon in meters, is the ceiling
      var EPS_M = 1e-4 * M_PER_DEG_LAT;
      if (spanLatM > extLatM + EPS_M || spanLonM > extLonM + EPS_M) {
        return { ok: false, error: "Bounds cannot be larger than the read extent." };
      }
    }
    return { ok: true, bounds: { n: round4(n), s: round4(s), e: round4(e), w: round4(w) } };
  }

  /* =========================================================================
   * PURE CRUD over a registry object (no I/O — the store wraps these).
   * Every op returns a NEW registry (or an { error } result) so the caller
   * decides when to persist. IDs are content-free tokens.
   * ========================================================================= */
  function genId(existing) {
    // short, collision-checked token (no Date/random dependency for the pure
    // path's determinism in tests: caller may pass a seed via opts.id).
    var base = "f", i = 1;
    var used = {};
    (existing || []).forEach(function (f) { used[f.id] = true; });
    while (used[base + i]) i++;
    return base + i;
  }

  // upsertField(reg, field, opts) — add a new field or update an existing one
  // (matched by id). Enforces the cap on ADD only (updating an existing field
  // never trips the cap). Returns { ok, registry } or { ok:false, error }.
  // `field` is a fully-shaped, already-validated entry (see buildEntry).
  function upsertField(reg, field) {
    reg = guardRegistry(reg);
    var fields = reg.fields.slice();
    var idx = -1;
    for (var i = 0; i < fields.length; i++) { if (fields[i].id === field.id) { idx = i; break; } }
    if (idx >= 0) {
      fields[idx] = field;                       // update in place — no cap check
      return { ok: true, registry: { v: SCHEMA_VERSION, fields: fields } };
    }
    if (fields.length >= CAP) {
      // HONEST OVERFLOW (spec §3): never evict another field's read silently.
      return { ok: false, error: "storage full — remove a field to save another" };
    }
    fields.push(field);
    return { ok: true, registry: { v: SCHEMA_VERSION, fields: fields } };
  }

  function removeField(reg, id) {
    reg = guardRegistry(reg);
    return { v: SCHEMA_VERSION, fields: reg.fields.filter(function (f) { return f.id !== id; }) };
  }

  function findByReadKey(reg, readKey) {
    reg = guardRegistry(reg);
    return reg.fields.filter(function (f) { return f.readKey === readKey; })[0] || null;
  }
  function findById(reg, id) {
    reg = guardRegistry(reg);
    return reg.fields.filter(function (f) { return f.id === id; })[0] || null;
  }

  // buildEntry(input) — shape + validate a registry entry from raw dialog input.
  // input: { id?, name, note, lat, lon, bounds|null, extent, createdAt?,
  //          lastReadAt?, readKey, existing? }
  // Returns { ok, field } or { ok:false, error, field:"name"|"note"|"bounds" }.
  // Pure: given a `now` (ms) it is fully deterministic (defaults to Date.now in
  // the store wrapper; tests pass one in).
  function buildEntry(input, now) {
    var nameV = validateName(input.name);
    if (!nameV.ok) return { ok: false, error: nameV.error, field: "name" };
    var noteV = validateNote(input.note);
    if (!noteV.ok) return { ok: false, error: noteV.error, field: "note" };
    var bounds = null;
    if (input.bounds) {
      var bV = validateBounds(input.bounds, input.extent);
      if (!bV.ok) return { ok: false, error: bV.error, field: "bounds" };
      bounds = bV.bounds;
    }
    var ts = (typeof now === "number") ? now : Date.now();
    var createdAt = input.createdAt != null ? input.createdAt : ts;
    return {
      ok: true,
      field: {
        id: input.id || genId(input.existing),
        name: nameV.name,
        note: noteV.note,
        lat: input.lat,
        lon: input.lon,
        bounds: bounds,                 // { n,s,e,w } | null
        createdAt: createdAt,
        // if bounds were (re)set this save, stamp when — the header line dates the claim
        boundsSetAt: bounds ? (input.boundsSetAt != null ? input.boundsSetAt : ts) : null,
        lastReadAt: input.lastReadAt != null ? input.lastReadAt : ts,
        readKey: input.readKey || null
      }
    };
  }

  /* =========================================================================
   * RELATIVE TIME (pure). "just now" / "3 min ago" / "2 hr ago" / "4 days ago"
   * / a date for older. Used by the switcher's lastReadAt line. Deterministic
   * given (then, now).
   * ========================================================================= */
  function relativeTime(then, now) {
    if (then == null) return "never read";
    now = (typeof now === "number") ? now : Date.now();
    var s = Math.max(0, Math.round((now - then) / 1000));
    if (s < 45) return "just now";
    var m = Math.round(s / 60);
    if (m < 60) return m + " min ago";
    var h = Math.round(m / 60);
    if (h < 24) return h + " hr ago";
    var d = Math.round(h / 24);
    if (d < 8) return d + (d === 1 ? " day ago" : " days ago");
    // older → a plain date (locale-free, stable: YYYY-MM-DD)
    var dt = new Date(then);
    var mm = String(dt.getMonth() + 1).padStart(2, "0");
    var dd = String(dt.getDate()).padStart(2, "0");
    return dt.getFullYear() + "-" + mm + "-" + dd;
  }

  /* =========================================================================
   * STORE (localStorage-guarded). Reads/writes the registry; every mutation
   * routes through the pure CRUD above. Quota/disabled localStorage is handled
   * honestly — a write failure surfaces as an error, never a silent drop.
   * ========================================================================= */
  function loadRegistry() {
    try {
      var raw = root.localStorage.getItem(STORE_KEY);
      if (!raw) return emptyRegistry();
      return guardRegistry(JSON.parse(raw));
    } catch (e) { return emptyRegistry(); }
  }
  function persist(reg) {
    try {
      root.localStorage.setItem(STORE_KEY, JSON.stringify(guardRegistry(reg)));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: "storage full — remove a field to save another" };
    }
  }

  // saveField(input) — validate + upsert + persist. input as buildEntry, minus
  // `existing` (loaded here). Returns { ok, field } or { ok:false, error, field? }.
  function saveField(input) {
    var reg = loadRegistry();
    var built = buildEntry({
      id: input.id, name: input.name, note: input.note,
      lat: input.lat, lon: input.lon, bounds: input.bounds, extent: input.extent,
      createdAt: input.createdAt, boundsSetAt: input.boundsSetAt,
      lastReadAt: input.lastReadAt, readKey: input.readKey,
      existing: reg.fields
    });
    if (!built.ok) return built;
    var up = upsertField(reg, built.field);
    if (!up.ok) return { ok: false, error: up.error, field: "cap" };
    var wrote = persist(up.registry);
    if (!wrote.ok) return { ok: false, error: wrote.error, field: "cap" };
    return { ok: true, field: built.field, registry: up.registry };
  }
  function deleteField(id) {
    var reg = removeField(loadRegistry(), id);
    persist(reg);
    return reg;
  }
  // touchLastRead(id, now) — stamp a field's lastReadAt (called after a re-read
  // restores its read). No-op if the field is gone.
  function touchLastRead(id, now) {
    var reg = loadRegistry();
    var f = findById(reg, id);
    if (!f) return reg;
    f.lastReadAt = (typeof now === "number") ? now : Date.now();
    var up = upsertField(reg, f);
    if (up.ok) persist(up.registry);
    return up.ok ? up.registry : reg;
  }

  /* =========================================================================
   * EXPORT
   * ========================================================================= */
  var AGRIOS_FIELDS = {
    STORE_KEY: STORE_KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    CAP: CAP,
    MIN_SPAN_M: MIN_SPAN_M,
    // pure
    emptyRegistry: emptyRegistry,
    guardRegistry: guardRegistry,
    isCurrentSchema: isCurrentSchema,
    validateName: validateName,
    validateNote: validateNote,
    validateBounds: validateBounds,
    round4: round4,
    genId: genId,
    upsertField: upsertField,
    removeField: removeField,
    findByReadKey: findByReadKey,
    findById: findById,
    buildEntry: buildEntry,
    relativeTime: relativeTime,
    // store (localStorage)
    loadRegistry: loadRegistry,
    persist: persist,
    saveField: saveField,
    deleteField: deleteField,
    touchLastRead: touchLastRead
  };

  root.AGRIOS_FIELDS = AGRIOS_FIELDS;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { AGRIOS_FIELDS: AGRIOS_FIELDS };
  }
})(typeof window !== "undefined" ? window : this);
