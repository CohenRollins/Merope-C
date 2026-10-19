# Merope-C v0.10 update

## Visual changes

- Larger, brighter canvas stars with gradual movement and occasional cross-shaped glints. Reduced-motion settings respected.
- Three top-level navigation dropdowns work on hover and keyboard focus. Keeps existing URLs.
- My Circle retains the five existing card designs, all labeled **Active**, and each flips to a placeholder history panel when clicked or activated with Enter/Space. History text is ready to replace when you send it.
- PERC House and its login page now explicitly welcome friends and visitors.

## Anime player

- Full episode player directly in the Anime Hub for configured MP4/WebM/HLS/embeddable sources.
- Select seasons, episodes, Sub/Dub, and sources. Resume locally on HTML5 video. A user can add their own playback links from the title modal; they stay only in that browser.
- Site-wide sources can be listed in `data/anime-sources.json`. See `ANIME-PLAYER-SETUP.md` for the format.
- No copyrighted episodes or unknown third-party streaming sources are bundled. A title will not play until a compatible source is added. External websites may prohibit embedding. The app does not bypass encryption or IP restrictions.

## Guest code setup

- New house codes can be 4 to 6 numeric digits, or retain a 12+ character code. Codes are never included in GitHub. The authentication remains server-side, using a salted hash. Failed attempts are limited.
- To **change an existing code**, on Polaris run `python3 ~/Merope-C/admin/house_private.py set-code` and then `sudo systemctl restart merope-c-house.service`. This does not touch contacts, photos, or visitor records.
- A four-digit PIN is significantly weaker and should be shared only with trusted guests. Public remote login still requires HTTPS and should not be enabled over plain HTTP.

## Install

Extract the update ZIP over the existing GitHub Desktop local repo, commit and push. Then on Polaris:

```bash
cd ~/Merope-C
git pull --ff-only
sudo cp -a index.html pages css js assets data portfolio /var/www/merope-c/
sudo systemctl restart merope-c-house.service
```

The house service must already be installed for the restart command to work. The gallery service and all image databases are unaffected. Use Ctrl+Shift+R to refresh the browser.

**Important:** The optional `data/anime-sources.json` is served publicly. Store no private URLs, tokens, or credentials inside it. Private media must be protected separately by the media server.
