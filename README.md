# AGRIOS Focus

A daily focus map for a farm field, answering one question: **where is my money at risk today, and why?**

Open the app and point it at any US field. It reads the field live, in your browser, from seven public data sources — no account, no server, no on-farm hardware:

- **USGS 3DEP (EPQS)** — elevation, sampled as a 972-point grid (plus a coarse surround ring for context)
- **USDA SSURGO (Soil Data Access)** — soil map units and polygons
- **NWS** — the actual forecast window (~7 days)
- **NOAA / RCC ACIS (PRISM)** — the observed weather record, on demand back to 1981
- **US Census TIGER** — roads and rail
- **USGS NHD** — streams, ponds, ditches
- **FEMA/ORNL USA Structures** — buildings

From those facts it runs a three-pass **boundary loop**: find the edges (soil, slope, drainage), find where edges meet (compound zones no single layer shows), then filter through the selected day's weather via a small set of **printed rules**. Every zone gets a chip (look-first / look / quiet), the rule text verbatim, and a data-support count — never an invented confidence score.

## The honesty stance

This instrument's design constraint is epistemic honesty:

- **Facts and printed rules only.** The computed reading contains no authored narrative and no fabricated numbers. Every sentence traces to a checked-in template with fact-filled blanks.
- **Conflicts are held open.** When public sources disagree (a mapped pond on a "well-drained" soil unit; a DEM low on a unit mapped as draining), the app prints both readings and states that the data cannot decide — it never resolves what it cannot know.
- **Failures are explicit.** Each source can fail independently; the read says which did and what is therefore absent. Nothing is backfilled.
- **Coarseness is stated.** Surround terrain is fetched at 3× the core spacing and labeled "context, not survey."
- **Only the future beyond the forecast is refused.** Any past date fetches the observed record on demand.

The included Allerton, Iowa reading is a worked example of the separate *analyst* layer — reasoned interpretation, clearly labeled as such and kept vocabulary-distinct from the computed reading.

## Run it

Static files; no build step. It needs http (not `file://`) for the live reads:

```
python3 -m http.server 8843
# then open http://127.0.0.1:8843/
```

or double-click `Start AGRIOS.command` on macOS. Served from GitHub Pages, it works as-is.

## Verify

The behavior above is enforced by an assertion suite — honesty gates included:

```
node focus-r2/checks/verify.js   # 891 assertions
```

## Status

A working research prototype from the AGRIOS project (an agricultural intelligence and safety layer for agrivoltaic and precision-ag systems), built research-through-design. It is an instrument for *looking*, not survey-grade analysis — it tells you where to point your tools, not what to do.
