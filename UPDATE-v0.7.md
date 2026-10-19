# Merope-C v0.7 update

## Changed

- Homepage no longer centers all attention on Clouds. It now introduces the three website sections and includes a link to About Me.
- New personal `pages/about.html` featuring Coco's gaming history, AWARE team logo, streaming, art, writing and code.
- Clouds remains as a small site mascot using a crop of existing supplied art, not an AI-generated image.
- Removed templated hero filler text, condensed some gallery wording, and replaced visible em dashes with ordinary punctuation.
- Anime Hub comes with 18 built-in anime picks and genre/search filters that work even if Jikan cannot be reached. Live catalog still attempts to load and will replace the starter picks when accessible. External artwork thumbnails may still require internet access.
- `ART-ADMIN-START-HERE.md` explains exactly how to activate the existing SSH-only art editor on Polaris.
- Public gallery metadata API no longer returns private admin notes, original filenames, or internal image hashes.
- School portfolio, PERC House private information, and bot details remain unchanged.

## Deploy

Extract this ZIP into your local Merope-C repository, preserving `.git`. Commit and push from GitHub Desktop. Then in Polaris SSH:

```bash
cd ~/Merope-C
git pull --ff-only
sudo cp -a index.html pages css js assets /var/www/merope-c/
```

No Nginx restart is needed for these static files. If the admin backend is installed, restart it separately when updating its Python code: `sudo systemctl restart merope-c-gallery`.

## Privacy

Keep apartment contact details, Wi-Fi credentials, full raw art archives, private material and any credentials out of public GitHub. User-supplied competition milestones are presented as Coco's personal background and have not been independently verified.
