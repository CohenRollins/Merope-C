# Phase 3: Jellyfin readiness on Polaris (not public yet)

Merope-C is served statically by Nginx; its existing Anime Hub client asks `/api/media/sources?mal_id=...` and `/api/media/identity?mal_id=...`, but no compatible authenticated media API is deployed by this change. A successful connection probe is not a working player.

## Step 1: Verify localhost Jellyfin (SSH to Polaris)

```bash
cd ~/Merope-C
git pull --ff-only
systemctl status jellyfin --no-pager
sudo ss -ltnp | grep 8096 || true
curl --max-time 5 -sS http://127.0.0.1:8096/System/Info/Public
python3 admin/jellyfin_probe.py
```

If Jellyfin is in a container, its localhost port might differ. Set `JELLYFIN_URL=http://127.0.0.1:PORT` for the probe. The script will intentionally reject remote URLs. Do not change Cloudflare Tunnel or Nginx to expose Jellyfin yet.

## Step 2: Verify private, read-only API access

Obtain a Jellyfin API token through the authenticated Jellyfin administrator interface. Do NOT paste a token into GitHub, Discord, browser JavaScript, or chat. On Polaris, read it privately with hidden input:

```bash
read -rs -p "Jellyfin API key (hidden): " JELLYFIN_API_KEY; echo
export JELLYFIN_API_KEY
python3 admin/jellyfin_probe.py
unset JELLYFIN_API_KEY
```

The probe only reads public system info and, if a token was entered, library metadata. It never downloads or relays video.

## Architecture to implement *after* confirming results

- Keep Jellyfin bound to localhost or a trusted private interface.
- Implement a private Python media service under a NEW localhost port; Nginx should only proxy a narrow, authenticated `/api/media/` route when fully reviewed.
- Each session must authorize access to a particular user/library before returning a source URL. A client-supplied MAL, TMDB or Jellyfin item ID is not proof of authorization.
- Never send an admin API key to browsers. Never accept arbitrary URL parameters for server-side fetches or redirects.
- Map MAL/AniList IDs to Jellyfin items by verified provider identifiers or owner-approved mappings. Don't assume that episode numbering matches across sources.
- Use short-lived, signed playback grants or backend-authenticated media requests; bind grants to item, session and expiration.
- Respect media rights, household privacy, Cloudflare bandwidth/product terms, and Jellyfin account permissions.
- Test HTTP range requests, MIME, CORS, seek, iOS Safari native playback, desktop HLS.js, and session expiration.
- Do not proxy video through the same public admin gallery or resident-access services.

**Status:** local probe committed. No API, player backend, auth scheme or Nginx changes deployed.
