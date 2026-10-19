# Merope-C — personal website

Merope-C is a static personal site (HTML, CSS and JavaScript) hosted on the Polaris Ubuntu server with Nginx.

## Pages
- Home, art gallery, lore, PERC Bot, anime, socials, Anti-Glonk
- The academic/professional portfolio is intentionally **not** developed here. It will be handled separately at the pace of the web-development course.

## Art
- Images in `assets/art/` are web-optimized review copies.
- Crosschecked image hashes from `Comms.zip` against `all art.zip` so we can identify commissions without assuming ownership of everything in the main archive.
- `ART_CREDITS_TO_CONFIRM.csv` lists the selected pieces for artist credit and publishing-permission review.
- Do not publish unverified commissions or works created by others without permission and attribution.

## Deploy to Polaris (manual, after commit and push)
```bash
cd ~/Merope-C
git pull --ff-only
sudo cp -a index.html css js pages assets /var/www/merope-c/
```
Nginx normally does not need reloading for static file changes. The `IMPORTANT.zip` documents and raw lore manuscript should NOT be copied into the public GitHub repo or website directory.
