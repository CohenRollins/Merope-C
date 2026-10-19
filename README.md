# Merope-C — personal hub (v0.3 candidate)

This is a working update for **Merope-C**, hosted by **Polaris** (Dell PowerEdge R640 / Ubuntu / Nginx). It extends the earlier website instead of replacing its existing sections with a new framework.

## New in this update

- Black/charcoal/white website with CSS-only blue starfield; no third-party star images or JS animation.
- **My Circle** device constellation. The devices OGLE-TR, Scuti and Polaris retain their existing names; **Betelgeuse** (older Dell Inspiron) and **Rigel** (HP ZBook) are **proposals**, not changes made to any computer.
- Expanded lore for the two nations, the war, and five spoiler-light character dossiers with design slots.
- 32 gallery items: the prior 29 curated pieces plus three sketches, tagged to stay at the bottom. The `Newest` / `Oldest` controls use the original ZIP **modified timestamps**, not verified creation dates. Dates can be corrected in the editor.
- Tags for commission, ArtFight, my characters, other people's characters, sketches, original, fan art, collaborative art, and other.
- Private browser-based art manager: metadata editing, hide/show, gallery entry removal, new image uploads, and JSON metadata backup.
- The five user-supplied Twitch / X / LinkedIn links are grouped by category; local avatar **placeholders** are provided until the account's real profile photos are supplied and verified.
- Expanded *in-universe*, serious-tone fictional Anti-Glonk Directorate page; correct Glonk Twitch link.
- Minimal **portfolio/index.html** placeholder. Leave the school site unexpanded until the class assigns projects.

## 1. Upload from Windows to GitHub Desktop

Extract the contents of this ZIP into your existing **local `Merope-C` repository folder** (the one cloned through GitHub Desktop). Merge and replace the site files; keep your existing `.git` directory intact. Commit and **Push origin**. **Do not** upload `IMPORTANT.zip`, passwords, private school records, the entire art archives, or the original raw lore manuscript.

**Copyright note:** You supplied the art archives, but don't assume every picture is your own. Confirm commissioning/display permissions and credits before making the media publicly available. Since this repository is public, adding art is publishing it to GitHub even while the Polaris web server is local. The `ART_CREDITS_TO_CONFIRM.csv` review remains important.

## 2. Deploy static website to Polaris first

Connect using the server's *current* address (the address can change with Windows Internet Connection Sharing):

```powershell
ssh cococr@192.168.137.170
```

Inside the Polaris SSH session:

```bash
cd ~/Merope-C
git pull --ff-only
sudo mkdir -p /var/www/merope-c
sudo cp -a index.html css js pages assets data portfolio /var/www/merope-c/
sudo chmod -R a+rX /var/www/merope-c
```

Refresh `http://<current Polaris IP>/` (replace the IP). The homepage, circle, lore, social pages and gallery work without any server-side gallery manager. Without the manager, the gallery reads the included `data/gallery.json` and is read-only.

### Gallery assets and timestamps

- Web versions under `assets/art/` are optimized; original ZIPs were not edited.
- Previous reviews excluded duplicate or near-duplicate images; the extra sketches are included as tagged variants, not new duplicates.
- File timestamps were copied from the ZIP file entries. Edit to actual artwork dates when known.
- Filtering and ordering keep sketches at the bottom except when you explicitly choose the **Sketches** filter.
- Profile pictures in `assets/profiles/` are **clearly labeled placeholders**: swap them with verified exported avatars from the exact accounts. Don't confuse them with authentic account pictures.

## 3. Optional: Activate the private Gallery Editor

**Do this after the new static site is working.** The editor is not just browser localStorage; it uses a SQLite database on Polaris, so uploads and changes survive browser refreshes, Git pulls, and normal server restarts.

The backend uses Python's standard library and binds only to `127.0.0.1:8765`. Its private routes are **never exposed by Nginx**; you access the editor using an encrypted SSH tunnel. Use a strong unique password and never add the credentials to GitHub.

On Polaris run:

```bash
sudo install -d -o cococr -g www-data -m 755 /var/www/merope-c/uploads
python3 ~/Merope-C/admin/server.py init
```

The `init` command asks you privately for an admin password and writes only a salted password hash inside `~/.config/merope-c/` (not the repository). **Do not send the password to anyone.**

Then start the service:

```bash
sudo cp ~/Merope-C/admin/merope-c-gallery.service /etc/systemd/system/merope-c-gallery.service
sudo systemctl daemon-reload
sudo systemctl enable --now merope-c-gallery.service
sudo systemctl status merope-c-gallery.service
```

Press `q` to exit systemctl's status view. If it failed, check `sudo journalctl -u merope-c-gallery -n 35 --no-pager`.

Edit the **existing** Nginx site configuration with:

```bash
sudo nano /etc/nginx/sites-available/merope-c
```

Add the **two `location` blocks** from `admin/nginx-gallery-snippet.conf` *inside* its existing `server { ... }` block. Don't replace the whole site configuration or paste a second `server` block. Save and run:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

The public website now reads approved gallery metadata from **`/api/gallery`**, while uploads appear at `/uploads/<generated-name>`. Only the gallery's read endpoint is proxied; Nginx has **no** `/admin` or `/api/admin/*` routes.

To open the private editor on **Windows**, in a **new PowerShell window**, connect (use the current server IP):

```powershell
ssh -L 8765:127.0.0.1:8765 cococr@192.168.137.170
```

Leave that SSH window connected and open **`http://localhost:8765/admin`** in the Windows browser. Enter the password from `init`. Edit image titles, descriptions, dates, tags, credit, characters and visibility; upload new images up to 12 MB. Changes appear on the public gallery when reloaded. The administrator interface is intentionally **not accessible** through `http://192.168.137.x/admin`.

### Important security and backups

- Never expose TCP port **8765** to the internet or forward it from a router. Leave the service bound to `127.0.0.1`.
- Do not add a reverse proxy for `/admin` or `/api/admin/`; only use the exact public read route above.
- The login cookie is for **localhost over an SSH tunnel**; do not use password login over unencrypted public HTTP. Add HTTPS before considering any public administration.
- The editor's database stays under `~/.local/share/merope-c/gallery.sqlite3` and new uploads under `/var/www/merope-c/uploads/`. **Git does not back these up.** Back up both locations separately on a regular basis.
- To modify your admin password, do not share it in chat. Change the credentials privately on Polaris; backup first.
- The service doesn't modify the public GitHub repo. Gallery metadata and uploads are server-owned data.
- Uploading a new image requires confirmed rights, proper attribution and a sensible filename. Uploaded files retain original bytes (JPG/PNG/WEBP/GIF only), with a unique generated path. Deleting an entry does not delete its image file.
- Before publishing this server on the open internet, review rate limiting, upload security, firewalls, TLS, system updates, and backups with a qualified administrator.

## Future priorities

1. Confirm and swap account profile photos; verify art credits and permissions.
2. Make a proper gallery lightbox and editable character tags.
3. Stabilize Polaris networking and consider a Docker-based deployment when needed.
4. Integrate PERC Bot read-only stats after safeguarding bot credentials.
5. School portfolio grows only as the coursework requires it; no ahead-of-class development.
