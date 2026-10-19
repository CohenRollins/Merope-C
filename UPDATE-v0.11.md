# Merope-C v0.11 – first media backend

## New

- A separate Python read-only media service in `admin/media_server.py`, bound only to `127.0.0.1:8768`, using the Python standard library.
- Media API: `/api/media/health`, `/api/media/sources?mal_id=<id>`, and `/api/media/play/<id>/<source-number>`.
- Local file scanner for named MP4/WebM files, with byte-range support for smooth seek playback.
- Jellyfin adapter for explicitly mapped items with API key stored only in private Polaris configuration. For v0.11 this is direct playback of browser-compatible video; transcoding isn't implemented.
- `init`, `list`, `jellyfin-list`, and `add-jellyfin` CLI actions.
- Existing Anime Hub player automatically fetches sources from the Polaris API, merges them with existing browser-added and static sources, and supports source switching.
- LAN-restricted Nginx configuration example, service file, and optional Jellyfin Docker Compose file.
- Unit and integration tests for path traversal rejection, API responses, local ranges, and Jellyfin header isolation.

## Not included

- No anime video files or bulk-download tools.
- No automatic third-party streaming-site extraction or bypass of encrypted tokens.
- No universal automatic ID mapping from Jellyfin to MAL, codec transcoding, public authenticated media service, or guaranteed full-episode catalog.

## Install

This ZIP **requires v0.10** already installed. Extract it into your local repo, commit/push, pull to Polaris, and follow `MEDIA-BACKEND-START-HERE.md` for service and Nginx installation. Do not put private media or credentials in public website assets.
