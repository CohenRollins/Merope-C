# Personal Hub — starter

A no-build, mobile-responsive personal website starter for GitHub Pages. Pages: Home, Art, Lore, PERC Bot, Anime, Twitch, and Anti-Glonk.

## Run locally

Open `index.html` in your browser, or run a basic local server from this folder:

```powershell
py -m http.server 8000
```

Then open `http://localhost:8000/`. Stop with Ctrl+C.

## Publish

1. Create a public GitHub repository named `personal-hub` (no need to initialize it if publishing by pushing the files).
2. Add these files to the repository using GitHub Desktop, commit, and push to `main`.
3. In GitHub: Settings → Pages → Deploy from a branch → `main` → `/(root)` → Save.
4. Visit `https://YOUR_USERNAME.github.io/personal-hub/` after GitHub finishes deploying.

Links are relative, so they work both locally and on project GitHub Pages URLs.

## What to customize

- Site brand `YOURHUB` in each HTML page.
- Replace hero artwork placeholder with an approved, optimized illustration.
- Add artist credits, permission notes and relevant links to the gallery.
- Update contact, Twitch, GitHub and social links once ready.
- Develop second academic site in a separate `class-portfolio` repository and cross-link it.

## Future architecture

Keep private Jellyfin, Immich, file storage, bot tokens and databases off GitHub Pages. A future authenticated backend can provide *approved* public bot data independently.
