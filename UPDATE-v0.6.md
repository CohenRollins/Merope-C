# Merope-C v0.6 — Three Orbits

This patch reorganizes the public website into three primary destinations:

- School / Portfolio (`portfolio/index.html`) — unchanged coursework pace
- Personal (`pages/personal.html`) — Art, Lore, Anime Hub, Socials, My Circle, Anti-Glonk
- PERC House (`pages/house.html`) — house rules, Discord, visitor-register plan, and PERC Bot (`pages/perc.html`)

Also includes a redesigned homepage, a revised gallery header, responsive link cards, subtle star glints, and the v0.5 Anime Hub additions. The PERC Bot and Anti-Glonk page content remains intact.

## Privacy and visitors

This public patch intentionally does **not** contain your residential address, map coordinates, personal phone numbers, Wi-Fi name/password, or any visitor names. **Do not commit household details to public GitHub, even in a "private" HTML folder or hidden JavaScript object:** anyone can read repository contents and public web source. GitHub history can retain deleted secrets.

The public visitor section is currently a placeholder, not a working multi-user register. To support resident-only contact information and visitor management, build a separate server-side authenticated application on Polaris. Store private records outside the Nginx public document root and outside GitHub. Require HTTPS before remotely exposing it. Use a resident-specific login with separate authorization for guests. Do not store plaintext credentials in this repository.

The Discord invitation link *is public* in this patch. Remove it if membership should be invite-only.

## Deploy from GitHub Desktop

1. Extract this patch ZIP **into the root of your local Merope-C repository**, replacing the matching files, while preserving the `.git` folder and other project files.
2. Review changes in VS Code/GitHub Desktop and commit/push.
3. SSH to Polaris and run:

```bash
cd ~/Merope-C
git pull --ff-only
sudo cp -a index.html pages css js portfolio /var/www/merope-c/
```

No Nginx restart needed for static changes. Refresh with Ctrl+Shift+R.

## Anime Hub note

The patch also includes the v0.5 Anime files in case that update has not yet been pushed. The public Jikan catalog needs browser Internet access to show live results.
