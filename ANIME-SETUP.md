# Merope-C Anime Hub v0.5

This is an update for the **existing static Nginx site**, not a migration to React/Next.js. It replaces the placeholder Anime page with a live Jikan / MyAnimeList anime catalog.

## Included in this patch

- `pages/anime.html` – Anime library page, live search, navigation, details dialog.
- `css/anime.css` – Isolated styling compatible with the current black/blue Merope-C starfield.
- `js/anime.js` – No-framework catalog, filters, pagination, favorites, episode checklist, official trailers and official-provider links.
- `pages/circle.html` – Betelgeuse and Rigel are confirmed names; removes "suggested" and "proposed" wording.

## Publish via GitHub Desktop

1. Extract the **contents** into your existing local `Merope-C` repository folder and replace matching files. **Do not** replace the `.git` directory, other pages, assets, or the existing `js/main.js`.
2. In GitHub Desktop, commit `Add working anime hub; confirm Circle names` and click **Push origin**.
3. SSH to Polaris (replace IP with current): `ssh cococr@192.168.137.170`.
4. Run:

   ```bash
   cd ~/Merope-C
   git pull --ff-only
   sudo install -m 644 css/anime.css /var/www/merope-c/css/anime.css
   sudo install -m 644 js/anime.js /var/www/merope-c/js/anime.js
   sudo install -m 644 pages/anime.html /var/www/merope-c/pages/anime.html
   sudo install -m 644 pages/circle.html /var/www/merope-c/pages/circle.html
   ```

5. Hard-refresh `http://<current-polaris-ip>/pages/anime.html` with Ctrl+Shift+R. No Nginx restart or new service required.

## What works

- Browsing top anime, currently airing anime and movies; all titles, genres and detail metadata load from Jikan.
- Search debounces requests by 320 ms to avoid excess API traffic, and errors/rate limits show a useful message.
- Genre filters: All, Action, Adventure, Fantasy, Sci-Fi, Supernatural, Drama, Comedy.
- Save/remove anime; the `My list` tab works even when Jikan temporarily fails because title snapshots are stored in the browser.
- Details open without navigating away; episode listings have checkboxes that persist in browser storage; more pages load if available.
- Official YouTube trailers play in an embed when available. Official streaming links from Jikan appear if listed, with clearly marked searches on Crunchyroll and Netflix as fallbacks.
- Accessible dialog and keyboard interactions; reduced motion; mobile layouts.

## Important limitations / next steps

- Needs a live internet connection **in the visitor's browser** to retrieve the anime catalog, posters and trailers. Polaris itself does not need an API key.
- Favorites and watched checkmarks are only in the **individual browser's localStorage**, not synced between PC/phone or multiple users. Do not clear site data if you want to retain them.
- Jikan is a third-party read-only API and can rate-limit or become temporarily unavailable. Not all titles have full episode metadata or streaming providers.
- This is an anime **discovery / trailer / personal-watchlist hub**, **not** a full licensed-episode streaming backend. The supplied Cabinet architecture relies on additional Next.js server routes and third-party source scraping / stream decryption. Those routes are not present in this static deployment. Playing whole anime episodes on the site would require an authorized embed/API or rights to host the media.
- Jikan sources data originating with MyAnimeList; streaming availability is region-dependent and source metadata can be out of date.
- Artwork credits and class portfolio remain untouched.
