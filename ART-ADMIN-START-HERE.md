# Opening the Merope-C art admin

The gallery manager is not a public webpage. That is intentional. It's built in `admin/server.py` and `admin/panel.html`, and runs on Polaris behind a local SSH tunnel.

### First-time activation (on Polaris)

1. Update your code using `git pull --ff-only` in `~/Merope-C`.
2. Keep the Nginx public website running independently. Check `sudo systemctl status nginx`.
3. Prepare a directory for uploads:

```bash
sudo install -d -o cococr -g www-data -m 755 /var/www/merope-c/uploads
```

4. Initialize a password (enter it only in your own terminal, never in GitHub or this chat):

```bash
python3 ~/Merope-C/admin/server.py init
```

5. Install the background service:

```bash
sudo cp ~/Merope-C/admin/merope-c-gallery.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now merope-c-gallery.service
sudo systemctl status merope-c-gallery.service --no-pager
```

6. In `/etc/nginx/sites-available/merope-c`, paste the two `location` blocks from `admin/nginx-gallery-snippet.conf` **inside** the existing `server { ... }`. Don't expose `/admin`, `/api/admin`, or port 8765 in Nginx.
7. Run `sudo nginx -t && sudo systemctl reload nginx` after checking the configuration.

### Open the panel from Windows

```powershell
ssh -L 8765:127.0.0.1:8765 cococr@<CURRENT-POLARIS-IP>
```

Keep PowerShell open, and visit **http://localhost:8765/admin** on your Windows PC. Sign in with the password you created in step 4.

### If it won't open

On Polaris:

```bash
sudo systemctl status merope-c-gallery.service --no-pager
sudo journalctl -u merope-c-gallery -n 40 --no-pager
curl -I http://127.0.0.1:8765/admin
```

If the last test returns **501 or 200**, the server is listening (this small service doesn't implement HEAD for every route); try `curl -s -o /dev/null -w '%{http_code}
' http://127.0.0.1:8765/admin` and expect `200`.

Never post or store the admin password online. Keep port 8765 bound only to 127.0.0.1. Back up `~/.local/share/merope-c/gallery.sqlite3` and `/var/www/merope-c/uploads/` separately from Git.
