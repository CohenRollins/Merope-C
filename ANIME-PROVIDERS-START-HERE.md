# Merope-C Anime Hub v0.12: Multi-provider player

This update changes only the Anime Hub player, its CSS and copy, and the Polaris media bridge. Existing Jellyfin configuration, mapped titles, and the other site pages are preserved.

## Changes

- An episode and season selector (including manual season adjustments when MAL and TMDB numbering disagree)
- Sub / Dub / Original preference selector
- Seven documented external embed candidates: VidLink Anime, Videasy, VidSrc, CineSrc, ScreenScape, Embed API Stream, and its older legacy embed endpoint. The last two might overlap upstream.
- Any local MP4/HLS, Jellyfin, or previously configured custom sources appear alongside these candidates for the selected episode.
- MAL to TMDB/IMDb ID mapping via AniMap, fetched by Polaris on the existing `/api/media/identity?mal_id=...` API. VidLink Anime uses MAL directly.
- If AniMap cannot identify a title, use the *Wrong anime or missing players? Edit title IDs* section. Overrides live only in that browser.
- Player embeds are loaded only after a viewer clicks **Load selected player**. Switching providers replaces the iframe and keeps selected season, episode, and audio.

**Limitations:** A documented embed URL is not proof that its player offers a selected episode, nor proof that iframe playback succeeds. External sources may have ads, logging or popups (the iframe is sandboxed to reduce unwanted behavior). External embeds cannot automatically sync their watch progress to Merope-C in this release. Only browser-playable local sources preserve precise resume position. There is no copyrighted-media extraction, download system, or DRM decryption in this update. Anime season numbering sometimes differs between MyAnimeList and TMDB. Video source and licensing decisions remain the responsibility of the site operator.

## Install

1. Extract the **update ZIP** into your Merope-C repository on Windows, commit, and push with GitHub Desktop.
2. On Polaris:

   ```bash
   cd ~/Merope-C
   git pull --ff-only
   python3 -m py_compile admin/media_server.py
   sudo cp -a index.html pages css js assets data portfolio /var/www/merope-c/
   sudo systemctl restart merope-c-media.service
   curl -s http://127.0.0.1/api/media/health
   curl -s 'http://127.0.0.1/api/media/identity?mal_id=31240'
   ```

3. Use your normal Windows browser to visit `http://192.168.137.170/pages/anime.html`, press Ctrl+Shift+R, open Re:ZERO, and select a source. Select **Jellyfin** to recheck your known working test, or **VidLink Anime** to test the external iframe.

No Nginx change is needed because `/api/media/` is already proxied to Polaris. The media bridge's ANIMap request requires outbound HTTPS connectivity. A failed lookup means only providers that accept MAL IDs can be constructed until you enter the show's TMDB ID manually. There is **no need to expose ports 8768 or 8096 to the Internet**.

## Privacy and security

The backend sends only the MAL ID to AniMap's fixed HTTPS API. It does not send a Jellyfin token or private files. The API rejects nonnumeric MAL IDs and never proxies an arbitrary URL. Third-party video embeds are not requested until the visitor clicks Load. Do not put Jellyfin keys, cookies or house credentials in the repo.

## Provider documentation used for URL formats

- VidLink: https://vidlink.pro/
- Videasy: https://videasy.ws/docs.html
- VidSrc: https://vidsrc.sh/vidsrc/docs/
- CineSrc: https://cinesrc.st/docs
- ScreenScape: https://embed.screenscape.me/
- Embed API Stream: https://watch.embed-api.stream/
- Legacy endpoint: https://www.embed-api.stream/
- AniMap: https://animap.id/docs/map
