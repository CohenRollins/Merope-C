# Merope-C Media Backend v0.11 – install on Polaris

This update wires the **existing** Anime Hub to an independent Python media service on Polaris. The media bridge supports **direct playback** of user-provided MP4/WebM files and configured Jellyfin item IDs. A built-in filename scanner removes the need to add each local file to JSON. No episodes, scraper, encrypted-token extractor, downloader, or torrent system are bundled. A catalog entry alone still does not guarantee a video source.

## 1. Deploy website files

Extract the v0.11 update ZIP **over v0.10** in your Windows GitHub Desktop local repository; commit/push. On Polaris:

```bash
cd ~/Merope-C
git pull --ff-only
sudo cp -a index.html pages css js assets data portfolio /var/www/merope-c/
```

The media server source stays at `~/Merope-C/admin/media_server.py`; **do not** copy the Python backend or private config into `/var/www`.

## 2. Initialize and enable the bridge on Polaris

```bash
mkdir -p ~/Media/Anime
python3 ~/Merope-C/admin/media_server.py init
sudo cp ~/Merope-C/admin/merope-c-media.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now merope-c-media.service
sudo systemctl status merope-c-media.service --no-pager
curl -s http://127.0.0.1:8768/api/media/health
```

Expect `"ok":true`. This is a **new localhost-only port 8768**. Art admin (8765), House (8767), and website remain separate. A private file `~/.config/merope-c/media/server.json` is created with mode 600. Keep it out of GitHub. The bridge reloads this file on each request, so updates don't require restarting.

## 3. Add a first local video

Place a playable MP4 or WebM in `~/Media/Anime` or a subfolder and name the file using the anime's MyAnimeList ID (the number in its MyAnimeList URL):

```text
~/Media/Anime/ReZero/MAL31240_S01E01_sub.mp4
~/Media/Anime/ReZero/MAL31240_S01E02_dub.webm
~/Media/Anime/Films/MAL199_movie.mp4
```

Pattern: `MAL<id>_S<season>E<episode>_<sub|dub|original>.<mp4|webm>`. Audio suffix is optional and defaults to `sub`. Films can use `MAL<id>_movie.mp4`. The scanner does **not** download or rename videos. It reads any matching user-provided files and serves only those under the configured media folder. If a name doesn't match, nothing is indexed. Browser support for actual audio/video codecs still matters, even when the extension is MP4.

Test the library:

```bash
python3 ~/Merope-C/admin/media_server.py list --id 31240
curl -s 'http://127.0.0.1:8768/api/media/sources?mal_id=31240'
```

The `sources` array will include a local `/api/media/play/...` URL if the media exists.

### Optional fake movie for a playback test

If `ffmpeg` is installed, this creates an *8-second test pattern, NOT an actual anime episode*:

```bash
mkdir -p ~/Media/Anime/Test
ffmpeg -hide_banner -y -f lavfi -i testsrc2=size=640x360:rate=24 \
  -f lavfi -i sine=frequency=440 -t 8 -c:v libx264 -pix_fmt yuv420p \
  -c:a aac -movflags +faststart ~/Media/Anime/Test/MAL31240_S01E01_sub.mp4
```

Open Re:Zero in the Anime Hub to confirm that the test pattern plays. Delete the test file after verification; it isn't the actual Re:Zero episode.

## 4. Let the website talk to the bridge (LAN only)

Do **not** expose port 8768 on your router. The backend only listens on 127.0.0.1. Let Nginx proxy the `/api/media/` path for LAN clients:

```bash
sudo cp ~/Merope-C/admin/nginx-media-lan-snippet.conf /etc/nginx/snippets/merope-c-media.conf
```

Open your current Merope-C Nginx `server { ... }` config and put this **inside its existing server block**:

```nginx
include /etc/nginx/snippets/merope-c-media.conf;
```

Then:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

The included snippet allows only `127.0.0.1` and the original Windows Internet Connection Sharing LAN `192.168.137.0/24`. **Check the subnet first**; if it has changed, edit the snippet. Only on-LAN visitors can request your media through Nginx. The current media service does not implement per-viewer authentication, so **never remove the allow/deny rules or publish `/api/media/` to the Internet as-is**. For remote access we'll configure HTTPS and authentication first.

Verify from Windows browser while on the home LAN: `http://192.168.137.170/api/media/health`, then refresh your Anime Hub and open a title that has an indexed source. If the health endpoint gives 403, the browser's IP doesn't match the allowlist. If it gives 502, the service isn't running.

## 5. Optional: run Jellyfin on Polaris

Jellyfin provides its own library and native playback UI. The media bridge's Jellyfin adapter currently **direct-plays** compatible files, rather than transcoding arbitrary MKV/codecs through the browser. Jellyfin's own UI supports broader playback options. Use Jellyfin with files you're entitled to store or stream.

Official Docker installation guide: https://jellyfin.org/docs/general/installation/container/

After Docker Engine and Docker Compose plugin are installed:

```bash
mkdir -p ~/.local/share/merope-c/jellyfin/{config,cache} ~/Media/Anime
cd ~/Merope-C
MEDIA_UID=$(id -u) MEDIA_GID=$(id -g) docker compose -f media/docker-compose.yml up -d
```

Jellyfin listens only on Polaris loopback port **8096**, not an open WAN port. On your **Windows PC PowerShell**, not on Polaris:

```powershell
ssh -N -L 8096:127.0.0.1:8096 cococr@192.168.137.170
```

Leave the window open and go to `http://localhost:8096` on Windows. Set up Jellyfin's initial admin user, add the **Anime** library from `/media/anime`, and create a dedicated Jellyfin API key in the Jellyfin dashboard.

On **Polaris**, edit your private media configuration:

```bash
nano ~/.config/merope-c/media/server.json
```

Set the `jellyfin.api_key` field to the key *there only*. Do not put it into GitHub, chat, a query string, the browser, or `data/anime-sources.json`.

List Jellyfin episodes to obtain their item IDs:

```bash
python3 ~/Merope-C/admin/media_server.py jellyfin-list --search 'Re:Zero'
```

Map a Jellyfin episode to the MyAnimeList ID:

```bash
python3 ~/Merope-C/admin/media_server.py add-jellyfin \
  --id 31240 --item-id REPLACE_WITH_32_HEX_ITEM_ID --season 1 --episode 1 \
  --audio sub --format mp4 --label 'Jellyfin'
```

The mapping is automatically available in the anime's video player. If it won't play, check whether the underlying video codec is supported by your browser. Jellyfin API keys remain on Polaris and are sent only from the bridge to `127.0.0.1:8096`.

**Important:** v0.11 does not automatically match arbitrary Jellyfin titles to MyAnimeList IDs. `add-jellyfin` handles an explicit mapping. Automatic metadata matching, transcoding, admin GUI, authenticated remote media access, and automatic authorized provider discovery are future features, not shipped capabilities.

## Troubleshooting

```bash
sudo systemctl status merope-c-media.service --no-pager
sudo journalctl -u merope-c-media.service -n 45 --no-pager
curl -i http://127.0.0.1:8768/api/media/health
curl -i 'http://127.0.0.1:8768/api/media/sources?mal_id=31240'
```

- **No sources:** check file naming, MAL ID, file permissions, media root, or Jellyfin mapping.
- **502 from Nginx:** bridge not running on 8768.
- **403 from Nginx:** LAN allowlist doesn't include your address. Do not simply delete restrictions.
- **Jellyfin source fails:** API key, item ID, Jellyfin container state, and browser codec compatibility.
- **Other browsers can't see source:** verify same network, Nginx include location, and reload; localStorage-only links remain browser-specific.
- **Existing sources in `data/anime-sources.json`:** continue working as before, independently of this backend.
