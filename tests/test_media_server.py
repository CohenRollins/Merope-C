"""Run with: python3 -m unittest discover -s tests -p 'test_media_server.py' -v"""
import importlib.util
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('media_server',Path(__file__).resolve().parents[1]/'admin'/'media_server.py')
media=importlib.util.module_from_spec(spec)
spec.loader.exec_module(media)

class JellyfinMock(BaseHTTPRequestHandler):
    seen=[]
    def log_message(self,*args):pass
    def do_GET(self):
        JellyfinMock.seen.append((self.path, self.headers.get('X-Emby-Token'), self.headers.get('Range')))
        if self.headers.get('Range')=='bytes=3-5':
            self.send_response(206)
            self.send_header('Content-Range','bytes 3-5/10')
            payload=b'345'
        else:
            self.send_response(200)
            payload=b'0123456789'
        self.send_header('Content-Length',str(len(payload)))
        self.send_header('Content-Type','video/mp4')
        self.end_headers()
        self.wfile.write(payload)

class TestMedia(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        root=Path(self.tmp.name)
        self.media_dir=root/'library';self.media_dir.mkdir()
        (self.media_dir/'Anime').mkdir()
        (self.media_dir/'Anime'/'MAL31240_S01E01_sub.mp4').write_bytes(b'0123456789' * 4)
        (self.media_dir/'Anime'/'MAL31240_S01E02_dub.webm').write_bytes(b'WEBM')
        (self.media_dir/'sensitive.txt').write_text('hidden')
        (root/'outside.mp4').write_bytes(b'SECRET')
        (self.media_dir/'symlink.mp4').symlink_to(root/'outside.mp4')
        self.config_path=root/'config.json'
        self.conf={'media_root':str(self.media_dir), 'jellyfin':{'base_url':'http://127.0.0.1:8096','api_key':''},'titles':{}}
        self.write()
        self.server=ThreadingHTTPServer(('127.0.0.1',0),media.MediaHandler)
        self.server.config_file=self.config_path
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.url=f'http://127.0.0.1:{self.server.server_address[1]}'
    def write(self):self.config_path.write_text(json.dumps(self.conf))
    def fetch(self,path,headers=None,method='GET'):
        return urllib.request.urlopen(urllib.request.Request(self.url+path,headers=headers or {},method=method),timeout=4)

    def test_health_and_sources(self):
        self.assertEqual(json.load(self.fetch('/api/media/health'))['version'],'0.11')
        s=json.load(self.fetch('/api/media/sources?mal_id=31240'))['sources']
        self.assertEqual(len(s),2)
        self.assertEqual((s[0]['season'],s[0]['episode'],s[0]['audio'],s[0]['type']), (1,1,'sub','mp4'))
        self.assertEqual((s[1]['episode'],s[1]['audio'],s[1]['type']), (2,'dub','webm'))
        self.assertNotIn('file',s[0]);self.assertNotIn('api_key',str(s))

    def test_range_seek_and_head(self):
        path='/api/media/play/31240/0'
        r=self.fetch(path,{'Range':'bytes=11-16'})
        self.assertEqual(r.status,206);self.assertEqual(r.headers.get('Content-Range'),'bytes 11-16/40')
        self.assertEqual(r.read(),b'123456')
        r=self.fetch(path,method='HEAD');self.assertEqual(r.status,200)
        self.assertEqual(int(r.headers['Content-Length']),40)
        self.assertEqual(self.fetch(path).read(),b'0123456789'*4)
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            self.fetch(path,{'Range':'bytes=999-1000'})
        self.assertEqual(ctx.exception.code,416)

    def test_title_id_and_traversal(self):
        with self.assertRaises(urllib.error.HTTPError) as ctx:self.fetch('/api/media/sources?mal_id=abc')
        self.assertEqual(ctx.exception.code,400)
        self.assertFalse(media.secure_media_file(self.conf,'../outside.mp4'))
        self.assertFalse(media.secure_media_file(self.conf,'symlink.mp4'))
        self.assertFalse(media.secure_media_file(self.conf,'sensitive.txt'))
        with self.assertRaises(urllib.error.HTTPError) as ctx:self.fetch('/api/media/play/31240/999')
        self.assertEqual(ctx.exception.code,404)

    def test_manual_local_mapping_and_missing_file(self):
        (self.media_dir/'MAL199_movie.mp4').write_bytes(b'abc123')
        self.conf['titles']={'199':[{'provider':'local','file':'MAL199_movie.mp4','season':0,'episode':0,'audio':'sub','label':'Local movie'},
                                    {'provider':'local','file':'../outside.mp4','season':1,'episode':1}]}
        self.write()
        sources=json.load(self.fetch('/api/media/sources?mal_id=199'))['sources']
        self.assertEqual(len(sources),2) # manually mapped + auto-indexed
        self.assertEqual(sources[0]['episode'],0)
        self.assertEqual(self.fetch('/api/media/play/199/0').read(),b'abc123')

    def test_jellyfin_proxy_forwards_token_only_upstream(self):
        mock=ThreadingHTTPServer(('127.0.0.1',0),JellyfinMock)
        t=threading.Thread(target=mock.serve_forever,daemon=True);t.start()
        self.addCleanup(mock.server_close);self.addCleanup(mock.shutdown)
        self.conf['jellyfin']['api_key']='PRIVATEKEY'
        self.conf['titles']={'12':[{'provider':'jellyfin','item_id':'a'*32,'season':1,'episode':1,'label':'Jellyfin'}]}
        self.write()
        with patch.object(media,'jellyfin_base',return_value=f'http://127.0.0.1:{mock.server_address[1]}'):
            src=json.load(self.fetch('/api/media/sources?mal_id=12'))['sources']
            self.assertNotIn('PRIVATEKEY',str(src))
            resp=self.fetch('/api/media/play/12/0',{'Range':'bytes=3-5'})
            self.assertEqual(resp.status,206)
            self.assertEqual(resp.read(),b'345')
        self.assertEqual(JellyfinMock.seen[-1][1],'PRIVATEKEY')
        self.assertEqual(JellyfinMock.seen[-1][2],'bytes=3-5')

if __name__=='__main__':unittest.main()
