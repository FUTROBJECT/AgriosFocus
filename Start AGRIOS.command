#!/bin/bash
# =============================================================================
# Start AGRIOS — double-click launcher
# Live reads (elevation/soil/weather/roads/water for any US field) need the
# page served over http, not opened as a file. This starts a tiny local
# server for the AgriosBuild folder and opens AGRIOS Focus in your browser.
# Stop it anytime by closing this Terminal window (or just leave it running).
#
# The server sends Cache-Control: no-store on EVERYTHING, so a plain reload
# always gets the current files — index.html included (the ?v= cache-busts
# cover the assets, but the HTML itself had no guard; a stale index.html
# quietly pins old CSS/JS, which burned a whole debugging round on 2026-07-05).
# =============================================================================
cd "$(dirname "$0")"
PORT=8843

if lsof -i :$PORT >/dev/null 2>&1; then
  echo "AGRIOS server already running on port $PORT — opening the page."
  echo "(If you updated the code and things look stale, close the OLD server's"
  echo " Terminal window first, then double-click this launcher again.)"
else
  echo "Starting AGRIOS local server on http://127.0.0.1:$PORT (no-cache) ..."
  python3 - "$PORT" >/dev/null 2>&1 <<'PYEOF' &
import sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), NoCacheHandler).serve_forever()
PYEOF
  sleep 1
fi

open "http://127.0.0.1:$PORT/focus-r2/index.html"
echo ""
echo "AGRIOS Focus is open in your browser. Live reads are enabled."
echo "This window keeps the local server running — you can minimize it."
wait
