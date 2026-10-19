# PERC House photos: getting started

House photos are **resident-only**. The public PERC House page links to the private resident portal but does not show the pictures or photo metadata to strangers. You can group house photo tiles by date, search by hashtag, and add an optional caption. Photos live on Polaris, not in GitHub.

**Run these commands on Polaris** after you have pushed the v0.9 files:

```bash
cd ~/Merope-C
git pull --ff-only
python3 admin/house_private.py init   # only if house access was never initialized
sudo cp admin/merope-c-house.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now merope-c-house.service
sudo systemctl restart merope-c-house.service
sudo systemctl status merope-c-house.service --no-pager
```

**From Windows PowerShell**, open a separate SSH tunnel:

```powershell
ssh -N -L 8767:127.0.0.1:8767 cococr@192.168.137.170
```

Open **http://localhost:8767/pages/house-access.html**, log in with the house code, and scroll to **House photo albums**. This works privately through SSH while the site is still LAN-only. Do not run the tunnel command from the `cococr@polaris` SSH prompt.

Photo file uploads are resized to JPEG on compatible browsers (up to 2200px on the longest side) to save space and strip most camera metadata. GIF files retain animation if small enough. Individual photo uploads max out at 10 MB after processing. Multiple selected pictures upload one at a time. Captions are optional; examples of hashtags are `#halloween2026` and `#gamenight`.

**Public access later:** The normal website can share the resident portal through the HTTPS-only Nginx snippet in `admin/house-nginx-https-snippet.conf`. Do not serve the login or gallery API over a plain HTTP connection. Keep port 8767 bound to `127.0.0.1` and do not port-forward it.

**Photos and database are not backed up by Git.** Securely back up both `~/.config/merope-c/house/visitors.sqlite3` and `~/.config/merope-c/house/photos/` independently. Ask guests before publishing their photographs, even to a small group. Anyone with the shared code can view and delete photos. Individual resident accounts and per-user permissions can come later.
