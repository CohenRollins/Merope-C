# Playing full episodes inside Merope-C

The new video player works with user-configured MP4, WebM, HLS and embeddable video sources. The anime catalog is metadata. A title being listed does not mean the site can automatically retrieve its copyrighted episodes. This release does not extract encrypted playback tokens, circumvent access controls, or proxy video from unauthorized streaming websites.

## Quick way: add your own source in the browser

1. Open an anime title in the Anime Hub.
2. Expand **Add a playback link**.
3. Enter season, episode, Sub/Dub, source type, name and a playable URL.
4. Click Save source. It shows an in-site player for that source. Links you add this way are saved only in that browser's localStorage.

An external embed service must allow being displayed in an iframe. Some refuse embedding or impose restrictions.

## Shared sources for the website

Edit `data/anime-sources.json`. Add entries under the anime's MyAnimeList ID, for example:

```json
{
  "titles": {
    "31240": [
      {"season":1,"episode":1,"audio":"sub","label":"My library","type":"mp4","url":"/media/anime/31240/S01E01.mp4"},
      {"season":1,"episode":2,"audio":"dub","label":"My library","type":"embed","url":"https://media.example.org/embed/episode2"}
    ]
  }
}
```

The URLs above are **examples**; no video files or permissions are bundled. Put authorized media in the served location and verify video URLs resolve. A remote embed may refuse to work. Supported types: `mp4`, `webm`, `hls`, `embed`. Browsers supporting HLS play `.m3u8` natively. Other browsers load Hls.js from jsDelivr when it is accessible. If that CDN is blocked, direct MP4/WebM still works.

The existing gallery and house data remain independent from the video-player configuration.
