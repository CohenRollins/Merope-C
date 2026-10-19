# Merope-C v0.4: PERC, Anti-Glonk and drifting stars

Changes made to **website files only**. No bot code, admin passwords, school coursework or live server settings changed.

## Highlights
- PERC page redesigned, with actual supplied PERC mascot on transparent background and the project banner.
- Includes PERC v1.0.02 beta, ranks, cycles, takeover arena, public commands and technical overview. Developer is **Coco**; **Cohen** occurs only in the acronym Patrick / Ella / Ryan / Cohen.
- Anti-Glonk now uses earnest, exaggerated mock-command tone: Glonks are defeated opponents **inside video games**, with clear in-game elimination orders. Steam group: https://steamcommunity.com/groups/GLONKSMUSTDIE
- Added correct Steam link to Glonk socials and Twitch link to the Glonk page.
- Blacker background with layered blue-white starfield drifting a few pixels on scroll. Reduced-motion preference disables movement. No extra dependencies.
- School portfolio stays unchanged (basic class placeholder).
- Existing art gallery, image-credit records, lore, Circle, and admin service are preserved.

## Install using GitHub Desktop
1. **Back up** your local Merope-C folder or make a commit of outstanding work.
2. Extract the contents of this ZIP **into the cloned Merope-C repository root**; merge and replace existing website files. Keep `.git` intact.
3. Check the changes in GitHub Desktop, commit `Merope-C v0.4: PERC, Anti-Glonk and starfield`, then Push origin.
4. SSH into Polaris and run:

```bash
cd ~/Merope-C
git pull --ff-only
sudo cp -a index.html css js pages assets /var/www/merope-c/
```

No Nginx restart is needed for HTML/CSS/JS/image updates. Force refresh in browser with Ctrl+Shift+R.

If this ZIP has old gallery data, **do not** overwrite Polaris's live `~/.local/share/merope-c/gallery.sqlite3` or `/var/www/merope-c/uploads/`. The archive contains only version-controlled initial gallery metadata, not active user uploads. Be careful publishing commissions: confirm display permission and artist credit before uploading to your public GitHub.
