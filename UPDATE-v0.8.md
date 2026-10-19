# Merope-C v0.8 website update

## Changes

- Restored **One site. Three orbits.** on the homepage and updated the smaller intro copy.
- Changed the Personal headline to **Games, art, code and everything else.** and corrected its section count to seven.
- Changed the Clouds avatar to a crop of existing user-supplied art. The big Personal hero uses a gaming/art/code/anime orbit instead.
- Removed Clouds from the PERC House page, added a clear house graphic and a small PERC Bot mascot.
- Expanded About Coco with the provided FACEIT profile, ranked-gaming history, AWARE team, streaming, design work, anime, lore, programming and projects.
- Replaced the barely visible background animation with an actual canvas starfield that drifts continuously, reacts to scrolling, and occasionally flashes a little brighter. The effect honors reduced-motion settings.
- Added real in-page playback using full-episode playlists from the rights holder TMS Entertainment. Not every anime is available for official embedding. Titles without an authorized source do not pretend to stream.
- Added live poster caching as an optional server-side helper. Includes 18 designed local SVG fallback covers that never show a broken image icon.
- Added a **resident login** link and private visitor-list backend. **No address, personal numbers, Wi-Fi credentials or house access codes are present in public files.** Resident pages need HTTPS and separate server setup.
- Existing art admin is unchanged, at port 8765 through an SSH tunnel. School portfolio is not expanded.

## Upload with GitHub Desktop

Extract the ZIP into your existing `Merope-C` local repository. Merge/replace files, **preserving `.git`**. Commit and push from GitHub Desktop.

On Polaris:

```bash
cd ~/Merope-C
git pull --ff-only
sudo cp -a index.html pages css js assets data portfolio /var/www/merope-c/
sudo chmod -R a+rX /var/www/merope-c
```

This refreshes the static site. The gallery admin remains separate and intact.

### Fix the starter anime posters on Polaris

The packaged fallback covers always work. To fetch **actual anime poster thumbnails** onto Polaris without relying on the visitor's browser to reach the external image CDN:

```bash
sudo install -d -o cococr -g www-data -m 755 /var/www/merope-c/assets/anime/posters
python3 ~/Merope-C/admin/cache_anime_posters.py
```

The script asks Jikan for the official MyAnimeList poster URLs and downloads validated JPEGs into the local web directory. It may take a minute and relies on Polaris internet/DNS. If unavailable, the SVG fallback covers still work. These images are anime promotional media from upstream sources, **not original art by Coco**; check publisher/API display permissions before distributing them more broadly. **Never commit cached poster files to public GitHub without permission.**

Open `http://<Polaris-IP>/pages/anime.html` and hard-refresh.

### In-page anime playback

The **Watch right here** section offers actual full episodes on the official *Anime! on TMS* YouTube channel. Choose God Mars, We Rent Tsukumogami or The Gutsy Frog. The shows play in the embedded YouTube player when YouTube makes them available in the viewer's region. There is also an official playlist link below the player in case embedding fails. The larger anime catalog is for browsing and can display trailers or official platform links for titles without embeddable episodes. This update is **not** a universal free player for copyrighted anime.

### Private PERC House access

The public PERC House page links to `pages/house-access.html`. The page has no sensitive data. The separate private service must be installed and proxied through an **HTTPS** Nginx virtual host before people can log in with an access code. Do **not** make the current plain-HTTP local server a public login page. Full instructions are in `HOUSE-PRIVATE-SETUP.md`. The art gallery admin at port 8765 is not replaced by this new service.
