# PERC House private resident access

The house address, residents' phone numbers, Wi-Fi credentials, private directions, code verifier and visitor entries must stay **off GitHub and out of static HTML**.

The site has a `pages/house-access.html` login. Its content comes only from `admin/house_private.py` after a successful login. The backend listens at **127.0.0.1:8767** on Polaris and is completely separate from the art admin at port 8765. You must **not expose 8767 on the router or in a public firewall rule**.

## Part 1. Install on Polaris

The v0.8 files must already be pushed to GitHub and pulled into `~/Merope-C`.

```bash
cd ~/Merope-C
python3 admin/house_private.py init
```

Choose a **unique private access code with 12 or more characters** and enter it directly into your own terminal. Do not type it into this chat or GitHub. This saves only its salted verification hash, not the original code.

The command creates this file **on Polaris only**:

```text
/home/cococr/.config/merope-c/house/info.json
```

Open it with:

```bash
nano ~/.config/merope-c/house/info.json
```

Edit its JSON fields on Polaris, using this **empty example** as a guide:

```json
{
  "address": "",
  "contacts": [
    { "name": "", "phone": "" }
  ],
  "wifi_name": "",
  "wifi_password": "",
  "apple_maps": "",
  "google_maps": "",
  "notes": ""
}
```

Remove the blank contact row if not used. Do not commit this private file to GitHub. Anyone with the access code will be able to read these details.

Start the service:

```bash
sudo cp ~/Merope-C/admin/merope-c-house.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now merope-c-house.service
sudo systemctl status merope-c-house.service --no-pager
```

Use this for service errors:

```bash
sudo journalctl -u merope-c-house.service -n 40 --no-pager
```

It should say `active (running)`. The service is deliberately not directly reachable from other computers.

## Part 2. HTTPS is required for residents to use it

**Do not paste the Nginx snippet into the site's existing plain-HTTP configuration.** First get a real domain/subdomain pointing to Polaris and a trusted HTTPS certificate, and make sure networking/firewall rules are set correctly.

When a trusted HTTPS site is working, add the Nginx location block from `admin/house-nginx-https-snippet.conf` to the **HTTPS** `server { }` block for Merope-C. Keep the HTTP block as a redirect to HTTPS only. Test:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Residents can then visit `https://YOUR-SITE/pages/house-access.html`, enter the access code, and see house details. Sessions are HTTP-only secure cookies and expire after two hours. The app has basic rate limiting and allows residents to add and remove visitor entries. **A shared code is suitable for a small trusted group, not high-security multi-user identity management.** Change the code if it leaks; individual accounts would be better later.

For the moment, Merope-C is still on an HTTP address through Windows Internet Connection Sharing. This means the code login on the public house page won't operate yet. This is intentional, not a broken link. Do not put private data into the public page as a shortcut.

## Part 3. Backups and ongoing maintenance

Private records live in:

- `~/.config/merope-c/house/info.json`
- `~/.config/merope-c/house/access-code.json` (hashed code only)
- `~/.config/merope-c/house/visitors.sqlite3`

Back these up securely **outside the public website and Git repo**. Restrict access to your Ubuntu account. Do not publish backups.

For added security, individual resident accounts, per-user audit trails, HTTPS enforcement, and stronger rate limiting should be considered before making the home information widely reachable on the internet.
