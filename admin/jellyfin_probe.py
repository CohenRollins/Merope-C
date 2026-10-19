#!/usr/bin/env python3
"""Read-only, localhost-only Jellyfin readiness probe for Merope-C.
Run on Polaris, never deploy under /var/www. No API keys are printed.
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

def main():
    base = os.environ.get("JELLYFIN_URL", "http://127.0.0.1:8096").rstrip("/")
    key = os.environ.get("JELLYFIN_API_KEY", "").strip()
    try:
        u = urllib.parse.urlsplit(base)
        if u.scheme != "http" or u.hostname not in ("127.0.0.1", "localhost", "::1") or u.username or u.password or u.query or u.fragment or u.path not in ("", "/"):
            print("ERROR: JELLYFIN_URL must be a localhost HTTP origin, e.g. http://127.0.0.1:8096")
            return 2
        if not (1 <= (u.port or 0) <= 65535):
            print("ERROR: specify Jellyfin's local port in JELLYFIN_URL")
            return 2
    except ValueError:
        print("ERROR: invalid JELLYFIN_URL")
        return 2
    def request(route, authenticated=False):
        headers = {"Accept": "application/json"}
        if authenticated:
            if not key:
                raise ValueError("JELLYFIN_API_KEY is missing")
            headers["Authorization"] = f'MediaBrowser Token="{key}"'
        req = urllib.request.Request(base + route, headers=headers)
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.load(resp)
    print("Jellyfin origin:", base)
    try:
        info = request("/System/Info/Public")
        print("Reachable: yes")
        print("Server name:", info.get("ServerName", "(not provided)"))
        print("Version:", info.get("Version", "(not provided)"))
    except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
        print("Reachable: no; check service/port. Error class:", type(exc).__name__)
        return 1
    if not key:
        print("API key: not supplied; library enumeration NOT tested")
        print("Next: set a temporary environment variable privately and rerun (do not paste the key into chat).")
        return 0
    try:
        counts = request("/Library/VirtualFolders", authenticated=True)
        print("Authenticated library access: yes")
        print("Library count:", len(counts) if isinstance(counts, list) else "unknown")
        for lib in (counts if isinstance(counts,list) else []):
            print("Library:", str(lib.get("Name", "unnamed"))[:72], "| type:", str(lib.get("CollectionType", "unspecified"))[:32])
    except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
        print("Authenticated library access: failed. Error class:", type(exc).__name__)
        if isinstance(exc, urllib.error.HTTPError):
            print("HTTP status:", exc.code)
        return 1
    print("Readiness: local metadata connection confirmed; no streaming endpoint enabled.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
