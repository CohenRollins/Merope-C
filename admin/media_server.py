#!/usr/bin/env python3
"""Merope-C v0.11 media bridge.

Loopback-only read-only API. Maps MAL IDs to user-owned media files or individually
configured Jellyfin items. No arbitrary URLs, cookies, token forwarding to browsers,
web scraping, encrypted stream decoding or generic remote proxy endpoints.
"""
from __future__ import annotations

import argparse
import json
import logging
import mimetypes
import os
import re
import socket
import threading
import time
import sys
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from shutil import copyfileobj

HOST = '127.0.0.1'
PORT = 8768
CONFIG = Path.home() / '.config' / 'merope-c' / 'media' / 'server.json'
MEDIA_ROOT = Path.home() / 'Media' / 'Anime'
FILE_RE = re.compile(r'(?i)^MAL(?P<id>\d{1,8})_S(?P<season>\d{1,3})E(?P<ep>\d{1,4})(?:_(?P<audio>sub|dub|original))?\.(?P<ext>mp4|webm)$')
MOVIE_RE = re.compile(r'(?i)^MAL(?P<id>\d{1,8})_movie(?:_(?P<audio>sub|dub|original))?\.(?P<ext>mp4|webm)$')
SAFE_ID = re.compile(r'^\d{1,8}$')
JF_ID = re.compile(r'^[a-fA-F0-9]{32}$')
MAX_RANGE = 16 * 1024 * 1024  # cap a single range; players request additional bytes as needed
CHUNK = 128 * 1024
IDENTITY_CACHE = {}
IDENTITY_LOCK = threading.Lock()


def anime_identity(mal_id, fetcher=None):
    """Resolve a MAL ID using the public AniMap metadata endpoint (no media access)."""
    if not valid_id(mal_id):
        raise ValueError('Invalid MyAnimeList ID')
    now = time.monotonic()
    with IDENTITY_LOCK:
        existing = IDENTITY_CACHE.get(mal_id)
        if existing and existing[0] > now:
            return existing[1]
    result = {'mal_id': mal_id, 'tmdb': {'tv': None, 'movie': None},
              'imdb_id': None, 'matched': False, 'source': 'AniMap'}
    url = 'https://animap.id/api/map/mal/' + mal_id
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Merope-C/0.12 (anime metadata ID mapping)',
        'Accept': 'application/json', 'Accept-Encoding': 'identity'})
    try:
        opener = fetcher or urllib.request.build_opener(NoRedirect).open
        with opener(req, timeout=7) as res:
            if res.status != 200:
                raise ValueError('Mapping server returned a non-success response')
            data = json.loads(res.read(150_001).decode('utf-8'))
        item = data[0] if isinstance(data, list) and data else data
        if not isinstance(item, dict):
            raise ValueError('Invalid metadata entry')
        tmdb = item.get('tmdb_id', [])
        if isinstance(tmdb, list):
            for record in tmdb:
                if not isinstance(record, dict):
                    continue
                kind = record.get('type')
                ident = record.get('id')
                if kind in ('tv','movie') and isinstance(ident, int) and 0 < ident < 10**10 and result['tmdb'][kind] is None:
                    result['tmdb'][kind] = ident
        imdb = item.get('imdb_id', [])
        if isinstance(imdb, list):
            result['imdb_id'] = next((v for v in imdb if isinstance(v,str) and re.fullmatch(r'tt\d{5,12}',v)), None)
        result['matched'] = any(result['tmdb'].values()) or bool(result['imdb_id'])
        result['title'] = str(item.get('title') or '')[:120]
        result['status'] = 'ok'
        ttl = 86400
    except (urllib.error.URLError, urllib.error.HTTPError, ValueError, OSError, TimeoutError, json.JSONDecodeError, UnicodeError) as exc:
        logging.info('Anime ID map %s unavailable: %s', mal_id, type(exc).__name__)
        result['status'] = 'unavailable'
        ttl = 1800
    with IDENTITY_LOCK:
        if len(IDENTITY_CACHE) >= 250:
            IDENTITY_CACHE.clear()
        IDENTITY_CACHE[mal_id] = (time.monotonic() + ttl, result)
    return result


def default_config():
    return {
        'media_root': str(MEDIA_ROOT),
        'jellyfin': {'base_url': 'http://127.0.0.1:8096', 'api_key': ''},
        'titles': {}
    }


def init_config(path=CONFIG):
    if path.exists():
        return False
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.write_text(json.dumps(default_config(), indent=2) + '\n', encoding='utf-8')
    os.chmod(path, 0o600)
    return True


def read_config(path=CONFIG):
    if not path.is_file():
        return default_config()
    raw = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(raw, dict):
        raise ValueError('media config must be a JSON object')
    conf = default_config()
    conf.update(raw)
    if not isinstance(conf['titles'], dict):
        raise ValueError('titles must be an object')
    return conf


def valid_id(value):
    return isinstance(value, str) and SAFE_ID.fullmatch(value) is not None


def local_root(conf):
    return Path(os.path.expanduser(conf['media_root'])).resolve()


def secure_media_file(conf, raw):
    if not isinstance(raw, str) or not raw or raw.startswith('/') or '\\' in raw:
        return None
    if any(p in ('', '.', '..') for p in Path(raw).parts):
        return None
    root = local_root(conf)
    file = (root / raw).resolve()
    try:
        file.relative_to(root)
    except ValueError:
        return None
    if not file.is_file() or file.suffix.lower() not in ('.mp4', '.webm'):
        return None
    return file


def scan_files(conf, requested_id):
    root = local_root(conf)
    if not root.is_dir():
        return []
    out = []
    # Limit traversal to 5 directory levels; don't follow symlinked directories.
    for base, dirs, filenames in os.walk(root, followlinks=False):
        relative = Path(base).relative_to(root)
        dirs[:] = sorted(d for d in dirs if not (Path(base) / d).is_symlink() and len(relative.parts) < 5 and not d.startswith('.'))
        for name in sorted(filenames):
            parsed = FILE_RE.fullmatch(name) or MOVIE_RE.fullmatch(name)
            if not parsed or parsed.group('id') != requested_id:
                continue
            relative_path = str((Path(base) / name).relative_to(root))
            if not secure_media_file(conf, relative_path):
                continue
            is_movie = '_movie' in name.lower()
            out.append({
                'provider': 'local', 'file': relative_path,
                'season': 0 if is_movie else int(parsed.groupdict().get('season') or 1),
                'episode': 0 if is_movie else int(parsed.groupdict().get('ep') or 1),
                'audio': (parsed.groupdict().get('audio') or 'sub').lower(),
                'label': 'Polaris library (auto-indexed)'
            })
    return out[:250]


def jellyfin_base(conf):
    jf = conf.get('jellyfin') or {}
    base = str(jf.get('base_url') or '').rstrip('/')
    parsed = urllib.parse.urlsplit(base)
    # Restrict credentials to Jellyfin on the SAME host; never create an open proxy.
    if parsed.scheme != 'http' or parsed.hostname not in ('localhost', '127.0.0.1') or parsed.port != 8096 or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:
        return None
    return base


def entries_for(conf, title_id):
    if not valid_id(title_id):
        return []
    supplied = conf.get('titles', {}).get(title_id, [])
    supplied = supplied if isinstance(supplied, list) else []
    entries = []
    for item in supplied[:250] + scan_files(conf, title_id):
        if not isinstance(item, dict):
            continue
        provider = item.get('provider')
        if provider == 'local':
            file = secure_media_file(conf, item.get('file'))
            if file is None:
                continue
            video_type = 'webm' if file.suffix.lower() == '.webm' else 'mp4'
        elif provider == 'jellyfin':
            if not jellyfin_base(conf) or not (conf.get('jellyfin') or {}).get('api_key'):
                continue
            if not isinstance(item.get('item_id'), str) or not JF_ID.fullmatch(item['item_id']):
                continue
            video_type = 'webm' if item.get('format') == 'webm' else 'mp4'
        else:
            continue
        try:
            season, episode = int(item.get('season', 1)), int(item.get('episode', 1))
            if not (0 <= season <= 999 and 0 <= episode <= 9999):
                continue
        except (TypeError, ValueError):
            continue
        entries.append({**item, 'provider': provider, 'season': season, 'episode': episode,
                        'audio': str(item.get('audio', 'sub')).lower() if item.get('audio') in ('sub','dub','original') else 'sub',
                        'label': str(item.get('label', provider.capitalize()))[:70], '_type': video_type})
    return entries


def public_sources(conf, title_id):
    out = []
    for i, entry in enumerate(entries_for(conf, title_id)):
        out.append({'season': entry['season'], 'episode': entry['episode'],
                    'audio': entry['audio'], 'label': entry['label'], 'type': entry['_type'],
                    'url': f'/api/media/play/{title_id}/{i}'})
    return out


def parse_range(value, size):
    if not value:
        return (0, min(size - 1, MAX_RANGE - 1)) if size else (0, -1), False
    m = re.fullmatch(r'bytes=(\d*)-(\d*)', value.strip())
    if not m or (not m[1] and not m[2]):
        raise ValueError('Invalid byte range')
    if not size:
        raise ValueError('Empty file')
    if m[1]:
        start = int(m[1]); end = int(m[2]) if m[2] else size-1
    else:
        count = int(m[2]); start = max(0,size-count); end = size-1
    if start >= size or end < start:
        raise ValueError('Unsatisfiable byte range')
    end = min(end,size-1,start+MAX_RANGE-1)
    return (start,end), True


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class MediaHandler(BaseHTTPRequestHandler):
    server_version = 'MeropeMedia/0.12'
    sys_version = ''

    def log_message(self, fmt, *args):
        logging.info('%s %s', self.address_string(), fmt % args)

    def send_json(self, code, payload):
        data = json.dumps(payload, separators=(',',':')).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(data)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.end_headers()
        if self.command != 'HEAD': self.wfile.write(data)

    def do_HEAD(self): self.handle_request()
    def do_GET(self): self.handle_request()

    def handle_request(self):
        path=urllib.parse.urlsplit(self.path)
        try:
            conf=read_config(self.server.config_file)
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            logging.error('Bad media server configuration: %s', exc)
            return self.send_json(503, {'error':'Media configuration error'})
        if path.path == '/api/media/health':
            return self.send_json(200, {'ok':True,'service':'Merope-C media bridge','version':'0.12','configured':bool(conf.get('titles')),'local_media_root_exists':local_root(conf).is_dir(),
                                        'jellyfin_configured':bool((conf.get('jellyfin') or {}).get('api_key'))})
        if path.path == '/api/media/identity':
            args = urllib.parse.parse_qs(path.query)
            title_id = args.get('mal_id', [''])[0]
            if not valid_id(title_id):
                return self.send_json(400, {'error': 'Expected numeric mal_id'})
            return self.send_json(200, anime_identity(title_id))
        if path.path == '/api/media/sources':
            args=urllib.parse.parse_qs(path.query)
            title_id=args.get('mal_id',[''])[0]
            if not valid_id(title_id): return self.send_json(400,{'error':'Expected numeric mal_id'})
            return self.send_json(200, {'mal_id':title_id,'sources':public_sources(conf,title_id)})
        match=re.fullmatch(r'/api/media/play/(\d{1,8})/(\d{1,4})', path.path)
        if not match: return self.send_json(404,{'error':'Unknown endpoint'})
        title_id, idx = match[1], int(match[2])
        entries=entries_for(conf,title_id)
        if idx >= len(entries): return self.send_json(404, {'error':'Source no longer available'})
        entry=entries[idx]
        if entry['provider']=='local': return self.serve_local(conf,entry)
        if entry['provider']=='jellyfin': return self.serve_jellyfin(conf,entry)
        return self.send_json(404,{'error':'Unknown provider'})

    def serve_local(self,conf,entry):
        file=secure_media_file(conf, entry['file'])
        if not file: return self.send_json(404, {'error':'Media file missing'})
        size=file.stat().st_size
        requested=self.headers.get('Range')
        try:
            (start,end),partial=parse_range(requested,size)
        except ValueError:
            self.send_response(416)
            self.send_header('Content-Range',f'bytes */{size}')
            self.send_header('Content-Length','0')
            self.end_headers()
            return
        # If no Range, stream entire file, not just one 16MiB segment.
        if not partial:
            start,end = 0,max(-1,size-1)
        length=end-start+1
        self.send_response(206 if partial else 200)
        self.send_header('Content-Type','video/webm' if entry['_type']=='webm' else 'video/mp4')
        self.send_header('Accept-Ranges','bytes')
        self.send_header('Content-Length',str(length))
        self.send_header('Cache-Control','private, no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        if partial:self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
        self.end_headers()
        if self.command=='HEAD' or length<=0:return
        try:
            with file.open('rb') as f:
                f.seek(start)
                remaining=length
                while remaining>0:
                    block=f.read(min(CHUNK,remaining))
                    if not block:break
                    self.wfile.write(block)
                    remaining-=len(block)
        except (ConnectionError, BrokenPipeError, OSError) as exc:
            logging.debug('Local playback ended: %s',exc)

    def serve_jellyfin(self,conf,entry):
        base=jellyfin_base(conf)
        token=(conf.get('jellyfin') or {}).get('api_key')
        if not base or not token:return self.send_json(503,{'error':'Jellyfin not configured'})
        # Item ID is a 32-character hexadecimal identifier from private admin config.
        url=base+'/Videos/'+entry['item_id']+'/stream?static=true'
        headers={'Authorization': f'MediaBrowser Token="{token}"','Accept-Encoding':'identity','User-Agent':'Merope-C-Media/0.11'}
        if self.headers.get('Range'):headers['Range']=self.headers['Range']
        req=urllib.request.Request(url,headers=headers,method=self.command)
        opener=urllib.request.build_opener(NoRedirect)
        try:
            upstream=opener.open(req,timeout=15)
        except urllib.error.HTTPError as exc:
            logging.warning('Jellyfin HTTP %d for item %s', exc.code, entry['item_id'])
            return self.send_json(502, {'error':'Jellyfin playback unavailable'})
        except (OSError,urllib.error.URLError,TimeoutError) as exc:
            logging.warning('Jellyfin connection error: %s',type(exc).__name__)
            return self.send_json(502,{'error':'Jellyfin could not be reached'})
        with upstream:
            if upstream.status not in (200,206):
                return self.send_json(502,{'error':'Jellyfin returned unsupported status'})
            self.send_response(upstream.status)
            for header in ('Content-Type','Content-Length','Content-Range','Accept-Ranges'):
                v=upstream.headers.get(header)
                if v:self.send_header(header,v)
            if not upstream.headers.get('Content-Type'):
                self.send_header('Content-Type','video/webm' if entry['_type']=='webm' else 'video/mp4')
            self.send_header('Cache-Control','private, no-store')
            self.send_header('X-Content-Type-Options','nosniff')
            self.end_headers()
            if self.command=='HEAD':return
            try:
                while True:
                    data=upstream.read(CHUNK)
                    if not data:break
                    self.wfile.write(data)
            except (BrokenPipeError,ConnectionError,OSError):
                pass


def jellyfin_list(conf, search=''):
    base=jellyfin_base(conf)
    token=(conf.get('jellyfin') or {}).get('api_key')
    if not base or not token:
        raise ValueError('Configure the local Jellyfin API key in your private server.json first')
    qs=urllib.parse.urlencode({'Recursive':'true','IncludeItemTypes':'Episode,Movie',
                               'SearchTerm':search,'Limit':'40','Fields':'Path'})
    req=urllib.request.Request(base+'/Items?'+qs,headers={'Authorization': f'MediaBrowser Token="{token}"','Accept':'application/json'},method='GET')
    with urllib.request.build_opener(NoRedirect).open(req,timeout=15) as response:
        data=json.load(response)
    for item in data.get('Items',[]):
        if not isinstance(item,dict):continue
        print(f"{item.get('Id','')} | {item.get('SeriesName') or item.get('Name')} | "
              f"S{(item.get('ParentIndexNumber') or 0):02}E{(item.get('IndexNumber') or 0):02} | "
              f"{item.get('Container','unknown format')}")


def add_jellyfin(path, title_id, item_id, season, episode, audio, label, fmt):
    if not valid_id(title_id) or not JF_ID.fullmatch(item_id):
        raise ValueError('Invalid MAL ID or Jellyfin item ID')
    if not (0<=season<=999 and 0<=episode<=9999):
        raise ValueError('Season or episode out of range')
    if fmt not in ('mp4','webm') or audio not in ('sub','dub','original'):
        raise ValueError('Invalid audio or format')
    conf=read_config(path)
    path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    conf['titles'].setdefault(title_id,[]).append({
        'provider':'jellyfin','item_id':item_id,'season':season,'episode':episode,
        'audio':audio,'label':label,'format':fmt
    })
    temp=path.with_suffix('.tmp')
    with temp.open('w',encoding='utf-8') as f:
        os.chmod(temp,0o600)
        json.dump(conf,f,indent=2)
        f.write('\n')
    temp.replace(path)

def main(argv=None):
    parser=argparse.ArgumentParser(description='Merope-C media bridge on 127.0.0.1:8768')
    parser.add_argument('action',choices=['init','run','list','jellyfin-list','add-jellyfin'],nargs='?',default='run')
    parser.add_argument('--config',type=Path,default=CONFIG)
    parser.add_argument('--id',help='MyAnimeList anime ID')
    parser.add_argument('--search',default='',help='Search Jellyfin item titles')
    parser.add_argument('--item-id',help='32-character Jellyfin item ID')
    parser.add_argument('--season',type=int,default=1)
    parser.add_argument('--episode',type=int,default=1)
    parser.add_argument('--audio',choices=['sub','dub','original'],default='sub')
    parser.add_argument('--format',choices=['mp4','webm'],default='mp4')
    parser.add_argument('--label',default='Jellyfin')
    args=parser.parse_args(argv)
    if args.action=='init':
        print('Created private config: ' + str(args.config) if init_config(args.config) else 'Existing config preserved: '+str(args.config))
        return 0
    conf=read_config(args.config)
    if args.action=='list':
        if not args.id or not valid_id(args.id): parser.error('--id must be a MAL anime ID')
        print(json.dumps(public_sources(conf,args.id),indent=2))
        return 0
    logging.basicConfig(level=logging.INFO,format='%(asctime)s %(levelname)s %(message)s')
    if args.action=='jellyfin-list':
        try: jellyfin_list(conf,args.search)
        except (OSError,ValueError,urllib.error.URLError) as exc:
            print(f'Jellyfin lookup failed: {type(exc).__name__}: {exc}',file=sys.stderr)
            return 1
        return 0
    if args.action=='add-jellyfin':
        if not args.id or not args.item_id: parser.error('--id and --item-id required')
        try: add_jellyfin(args.config,args.id,args.item_id,args.season,args.episode,args.audio,args.label,args.format)
        except ValueError as exc:parser.error(str(exc))
        print('Jellyfin item mapped. Refresh the Anime Hub; no service restart needed.')
        return 0
    srv=ThreadingHTTPServer((HOST,PORT),MediaHandler)
    srv.config_file=args.config
    print(f'Merope-C media bridge listening on http://{HOST}:{PORT}',flush=True)
    try:srv.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:pass
    finally:srv.server_close()
    return 0


if __name__=='__main__':sys.exit(main())
