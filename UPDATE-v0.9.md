# Merope-C v0.9: art, admin and house photos

## What changed

- Added eleven original user-supplied image files to the **Art Gallery** catalog, for **43 artwork entries** total. Artwork dates and artist credits remain blank when not known. Sketches stay at the bottom. Review credits and permissions before sharing them publicly.
- The existing **Art Admin** lives inside a sectioned **Merope-C Admin Dashboard**. Art works now; other section labels are placeholders for later tools. The private admin remains on loopback port **8765**, reached by a Windows SSH tunnel.
- Art metadata is **saved immediately to SQLite**. An already-open public gallery checks `/api/gallery` every **2 seconds** while visible, so an edit appears shortly after saving, with no Git push. **The Nginx public API location must already be enabled.** Without it, the site uses a static JSON copy and cannot display private editor changes.
- **PERC House** has a link to a resident-only house photo gallery. Approved residents can upload photos (including multiple uploads), set a date, add up to eight optional hashtags, add an optional caption, browse photo tiles grouped by date, filter by hashtag, open a full-size image, or remove an image.
- Photo bytes are **never inside the GitHub repository or `/var/www/merope-c/`**. Both gallery metadata and image downloads require the resident session.
- The existing private service on **127.0.0.1:8767** can now serve the resident website itself through a separate SSH tunnel, so it is possible to test before publishing an HTTPS domain.
- All references to the old bot host NDGLU have been replaced by **Betelgeuse** in current site content. The My Circle device labels now consistently say **Name in use**.
- Reordered the About Me sections to show **What I am usually working on** before **Outside of ranked games**, and removed the orphaned closing paragraph.

## Updating existing Polaris installation

1. Extract the update ZIP into the existing **local Merope-C repository** on Windows and replace matching files. Do not replace `.git`. Commit and push with GitHub Desktop.
2. On Polaris:

```bash
cd ~/Merope-C
git pull --ff-only
sudo cp -a index.html pages css js assets data portfolio /var/www/merope-c/
sudo systemctl restart merope-c-gallery.service
sudo systemctl status merope-c-gallery.service --no-pager
```

The gallery service restart runs a migration that imports only **new** bundled image entries without overwriting prior admin edits or resurrecting items you've deleted. No new password is needed for the art admin.

3. To verify that edits can appear on the public gallery (not just the static fallback), check **on Polaris**:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1/api/gallery
```

Expected: `200`. If it is `404`, the two Nginx `location` blocks in `admin/nginx-gallery-snippet.conf` have not been added inside the current HTTP `server {}` site. Add those blocks only, then `sudo nginx -t && sudo systemctl reload nginx`. Do **not** expose `/admin` or `/api/admin` through Nginx.

## Test the house photo gallery privately from Windows

On Polaris, **only if** you have not yet created the house code:

```bash
cd ~/Merope-C
python3 admin/house_private.py init
```

Create the private code **on Polaris** and do not put it in GitHub or chat. If you already set it, don't reset it. Start or update the resident backend:

```bash
sudo cp ~/Merope-C/admin/merope-c-house.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now merope-c-house.service
sudo systemctl restart merope-c-house.service
sudo systemctl status merope-c-house.service --no-pager
```

**From a new PowerShell window on your Windows PC**, not inside Polaris:

```powershell
ssh -N -L 8767:127.0.0.1:8767 cococr@192.168.137.170
```

Replace that IP if Polaris changes its LAN address. Keep PowerShell open, then go to:

`http://localhost:8767/pages/house-access.html`

Enter the resident code you created. This address is private over the encrypted SSH tunnel, even though your **Windows localhost** URL is HTTP. It is not public website access. Your existing art admin uses a different tunnel on `8765`.

You can now add and view resident-only photos, tags, dates, and visitor entries. Photos are saved in a private folder on Polaris, so no Git push is required for new photo uploads.

### Later: residents access it without SSH

When you have a trustworthy HTTPS website, update the Nginx HTTPS `server {}` block with the **new** `admin/house-nginx-https-snippet.conf` which supports photo uploads of up to 16 MB HTTP request size. Do not add the private API to the site's plain HTTP server. The shared house code is suitable only for trusted residents; individual accounts would be better if the group grows.

## Where private files live

- `~/.config/merope-c/house/info.json` : contacts and house details (never commit).
- `~/.config/merope-c/house/access-code.json` : salted code verifier (never commit).
- `~/.config/merope-c/house/visitors.sqlite3` : private guest and photo metadata.
- `~/.config/merope-c/house/photos/` : original uploaded photos, private owner-only permissions.
- `~/.local/share/merope-c/gallery.sqlite3` : art metadata, not in Git.
- `/var/www/merope-c/uploads/` : art uploaded through the Art Admin, displayed publicly if marked visible.

Back up the private database and photo directory securely **outside** the webroot and Git. Ask people for permission before uploading identifiable party photos. Shared access codes cannot identify which resident uploaded or deleted a particular photo.
