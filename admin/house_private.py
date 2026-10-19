#!/usr/bin/env python3
"""PERC House private resident backend. Binds only to loopback; Nginx must enforce HTTPS.
No home address, passwords, or contacts are included in GitHub code.
"""
import base64
import datetime as dt
import getpass
import hashlib
import uuid
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

BASE=Path.home()/'.config'/'merope-c'/'house'
CREDS=BASE/'access-code.json'
DETAILS=BASE/'info.json'
DB=BASE/'visitors.sqlite3'
ROOT=Path(__file__).resolve().parent.parent
PHOTOS=BASE/'photos'
MAX_PHOTO_BYTES=10*1024*1024
MAX_REQUEST_BYTES=15*1024*1024
SESSIONS={}
ATTEMPTS={}
GLOBAL_ATTEMPTS=[]
LISTEN=('127.0.0.1',8767)
EXPIRES=60*60*2
DEFAULT={'address':'','contacts':[], 'wifi_name':'','wifi_password':'','apple_maps':'','google_maps':'','notes':'','rules':[]}

def _make_verifier():
    pw=getpass.getpass('House access PIN (4-6 digits, or stronger code of 12+ characters): ')
    cf=getpass.getpass('Repeat PIN or code: ')
    if not ((pw.isdigit() and 4<=len(pw)<=6) or len(pw)>=12) or pw!=cf:
        raise SystemExit('Use a matching 4-6 digit PIN or a 12+ character code. Nothing changed.')
    salt=secrets.token_bytes(16)
    digest=hashlib.pbkdf2_hmac('sha256',pw.encode(),salt,600_000)
    return {'salt':salt.hex(),'hash':digest.hex()}

def change_code():
    if not CREDS.exists():raise SystemExit('Initialize the house service first using init.')
    data=_make_verifier()
    tmp=BASE/('access-code.'+secrets.token_hex(6)+'.tmp')
    fd=os.open(tmp,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    with os.fdopen(fd,'w') as f:json.dump(data,f)
    os.replace(tmp,CREDS)
    print('Access code changed. Restart merope-c-house.service to end earlier logins.')

def init():
    BASE.mkdir(mode=0o700,parents=True,exist_ok=True)
    os.chmod(BASE,0o700)
    if not CREDS.exists():
        data=_make_verifier()
        fd=os.open(CREDS,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
        with os.fdopen(fd,'w') as f:json.dump(data,f)
        print('Access code verifier stored in private config. The code itself was not saved.')
    else:print('Access code already set; not changing it.')
    if not DETAILS.exists():
        fd=os.open(DETAILS,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
        with os.fdopen(fd,'w') as f:json.dump(DEFAULT,f,indent=2)
        print('Private details template created at '+str(DETAILS))
    PHOTOS.mkdir(mode=0o700,parents=True,exist_ok=True)
    os.chmod(PHOTOS,0o700)
    with connect() as c:
        c.execute("CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, date TEXT NOT NULL, caption TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]', filename TEXT NOT NULL, mime TEXT NOT NULL, bytes INTEGER NOT NULL, created INTEGER NOT NULL)")
        c.execute('CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, date TEXT NOT NULL, note TEXT NOT NULL DEFAULT "", created INTEGER NOT NULL)')
    os.chmod(DB,0o600)

def connect():
    c=sqlite3.connect(DB,timeout=10)
    c.row_factory=sqlite3.Row
    return c

def photo_format(blob):
    """Restrict photos to browser-native raster formats, never SVG/HTML."""
    if blob.startswith(b'\x89PNG\r\n\x1a\n'):return ('png','image/png')
    if blob.startswith(b'\xff\xd8\xff') and blob.endswith(b'\xff\xd9'):return ('jpg','image/jpeg')
    if blob[:4]==b'RIFF' and blob[8:12]==b'WEBP':return ('webp','image/webp')
    if blob[:6] in (b'GIF87a',b'GIF89a'):return ('gif','image/gif')
    raise ValueError('Please upload a JPG, PNG, WEBP or GIF image.')

def normalized_tags(value):
    if not isinstance(value,list):raise ValueError('Invalid hashtags')
    values=[]
    for tag in value[:8]:
        tag=str(tag).strip().lower().lstrip('#')
        if not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,31}',tag):raise ValueError('Hashtags can contain letters, numbers, _ and -')
        if tag not in values:values.append(tag)
    return values

def init_photos():
    PHOTOS.mkdir(parents=True,exist_ok=True,mode=0o700)
    os.chmod(PHOTOS,0o700)
    with connect() as c:
        c.execute("CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, date TEXT NOT NULL, caption TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]', filename TEXT NOT NULL, mime TEXT NOT NULL, bytes INTEGER NOT NULL, created INTEGER NOT NULL)")
    os.chmod(DB,0o600)

class Server(BaseHTTPRequestHandler):
    server_version='PERC-House'
    sys_version=''
    def log_message(self,*a):pass  # Never log passcodes or private content.
    def respond(self,code,body,cookie=None):
        payload=json.dumps(body,ensure_ascii=False).encode()
        self.send_response(code)
        for k,v in [('Content-Type','application/json; charset=utf-8'),('Cache-Control','no-store, private'),('X-Content-Type-Options','nosniff'),('X-Frame-Options','DENY'),('Content-Length',str(len(payload)))]:self.send_header(k,v)
        if cookie:self.send_header('Set-Cookie',cookie)
        self.end_headers();self.wfile.write(payload)
    def request_path(self):return urlsplit(self.path).path
    def is_secure(self):
        # Only clients connected through SSH loopback or an HTTPS Nginx proxy are supported.
        host=self.headers.get('Host','').split(':')[0].lower()
        return self.headers.get('X-Forwarded-Proto')=='https' or host in ('localhost','127.0.0.1')
    def same_origin(self):
        origin=self.headers.get('Origin','')
        if not origin:return False
        host=self.headers.get('Host','')
        return origin in ('https://'+host, 'http://localhost:8767','http://127.0.0.1:8767')
    def session(self):
        cookie=self.headers.get('Cookie','')
        match=re.search(r'(?:^|;\s*)perc_house=([0-9a-f]{64})(?:;|$)',cookie)
        key=match.group(1) if match else ''
        s=SESSIONS.get(key)
        if s and s['until']>time.time():return s
        if key:SESSIONS.pop(key,None)
        return None
    def require_auth(self,write=False):
        s=self.session()
        if not s:self.respond(401,{'error':'Enter your house code to continue.'});return None
        if write and (not self.same_origin() or not hmac.compare_digest(s['csrf'],self.headers.get('X-House-Token',''))):
            self.respond(403,{'error':'Invalid request. Please reload and sign in again.'});return None
        return s
    def photo_file(self,ident):
        if not re.fullmatch(r'[a-f0-9]{32}',ident):return None
        with connect() as c:row=c.execute('SELECT filename,mime,bytes FROM photos WHERE id=?',(ident,)).fetchone()
        if not row:return None
        file=PHOTOS/row['filename']
        if file.parent!=PHOTOS or not re.fullmatch(r'[a-f0-9]{32}\.(png|jpg|webp|gif)',file.name) or not file.is_file():return None
        return file,row
    def send_photo(self,ident):
        record=self.photo_file(ident)
        if not record:return self.respond(404,{'error':'Photo not found'})
        file,row=record
        data=file.read_bytes()
        self.send_response(200)
        for k,v in [('Content-Type',row['mime']),('Content-Length',str(len(data))),('Cache-Control','private, no-store'),('X-Content-Type-Options','nosniff'),('X-Frame-Options','DENY'),('Content-Security-Policy',"default-src 'none'; sandbox")]:self.send_header(k,v)
        self.end_headers();self.wfile.write(data)
    def content(self):
        length=int(self.headers.get('Content-Length','0'))
        if length<1 or length>MAX_REQUEST_BYTES:raise ValueError('Request too large or empty')
        return json.loads(self.rfile.read(length))
    def do_GET(self):
        if not self.is_secure():return self.respond(403,{'error':'HTTPS required for resident access.'})
        path=self.request_path()
        # The same resident page can be opened privately over an SSH tunnel even
        # before the public website has HTTPS. Do not proxy this port publicly.
        static={'/pages/house-access.html':('pages/house-access.html','text/html; charset=utf-8'),'/css/style.css':('css/style.css','text/css; charset=utf-8'),'/css/house-access.css':('css/house-access.css','text/css; charset=utf-8'),'/js/main.js':('js/main.js','application/javascript; charset=utf-8'),'/js/house-access.js':('js/house-access.js','application/javascript; charset=utf-8')}
        if path in static:
            relative,mime=static[path];resource=ROOT/relative
            try:data=resource.read_bytes()
            except OSError:return self.respond(404,{'error':'Static file unavailable'})
            self.send_response(200)
            for k,v in [('Content-Type',mime),('Content-Length',str(len(data))),('Cache-Control','private, no-store'),('X-Content-Type-Options','nosniff'),('X-Frame-Options','DENY')]:self.send_header(k,v)
            self.end_headers();self.wfile.write(data);return
        if path=='/house-api/status':return self.respond(200,{'configured':CREDS.exists(),'authenticated':bool(self.session())})
        if path=='/house-api/me':
            s=self.session();return self.respond(200,{'authenticated':bool(s),'token':s['csrf'] if s else None})
        if path=='/house-api/info':
            if not self.require_auth():return
            try:info=json.loads(DETAILS.read_text())
            except (OSError,json.JSONDecodeError):return self.respond(500,{'error':'Private info not configured.'})
            allowed={k:info.get(k,DEFAULT[k]) for k in DEFAULT}
            return self.respond(200,allowed)
        if path=='/house-api/photos':
            if not self.require_auth():return
            with connect() as c:rows=c.execute('SELECT id,date,caption,tags,created FROM photos ORDER BY date DESC,created DESC LIMIT 500').fetchall()
            return self.respond(200,[{'id':r['id'],'date':r['date'],'caption':r['caption'],'tags':json.loads(r['tags']),'url':'/house-api/photos/media/'+r['id']} for r in rows])
        if path.startswith('/house-api/photos/media/'):
            if not self.require_auth():return
            return self.send_photo(path.rsplit('/',1)[-1])
        if path=='/house-api/visitors':
            if not self.require_auth():return
            with connect() as c: rows=c.execute('SELECT id,name,date,note FROM visits ORDER BY date DESC,id DESC LIMIT 200').fetchall()
            return self.respond(200,[dict(r) for r in rows])
        return self.respond(404,{'error':'Not found'})
    def do_POST(self):
        if not self.is_secure():return self.respond(403,{'error':'HTTPS required.'})
        if not self.same_origin():return self.respond(403,{'error':'Invalid request origin.'})
        path=self.request_path()
        try:
            if path=='/house-api/login':
                client=self.headers.get('X-Real-IP',self.client_address[0])
                recent=[t for t in ATTEMPTS.get(client,[]) if t>time.time()-1800]
                ATTEMPTS[client]=recent
                global GLOBAL_ATTEMPTS
                GLOBAL_ATTEMPTS=[t for t in GLOBAL_ATTEMPTS if t>time.time()-1800]
                if len(recent)>=4 or len(GLOBAL_ATTEMPTS)>=16:return self.respond(429,{'error':'Too many attempts. Try again in 30 minutes.'})
                pw=str(self.content().get('code',''))[:2048]
                cred=json.loads(CREDS.read_text())
                digest=hashlib.pbkdf2_hmac('sha256',pw.encode(),bytes.fromhex(cred['salt']),600_000)
                if not hmac.compare_digest(digest,bytes.fromhex(cred['hash'])):
                    recent.append(time.time());GLOBAL_ATTEMPTS.append(time.time());time.sleep(.5)
                    return self.respond(401,{'error':'That code did not work.'})
                ATTEMPTS.pop(client,None)
                sid=secrets.token_hex(32);csrf=secrets.token_hex(32)
                SESSIONS[sid]={'until':time.time()+EXPIRES,'csrf':csrf}
                flag='; Secure' if self.headers.get('X-Forwarded-Proto')=='https' else ''
                return self.respond(200,{'authenticated':True,'token':csrf},'perc_house='+sid+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+str(EXPIRES)+flag)
            if path=='/house-api/photos/upload':
                if not self.require_auth(True):return
                d=self.content()
                date=str(d.get('date',''))[:10]
                try:dt.date.fromisoformat(date)
                except ValueError:raise ValueError('Choose a valid photo date')
                caption=str(d.get('caption','')).strip()[:240]
                tags=normalized_tags(d.get('tags',[]))
                raw=str(d.get('image_base64',''))
                if len(raw)>MAX_PHOTO_BYTES*1.38+128:raise ValueError('Image is larger than 10 MB')
                blob=base64.b64decode(raw,validate=True)
                if not 32<=len(blob)<=MAX_PHOTO_BYTES:raise ValueError('Image is larger than 10 MB or empty')
                ext,mime=photo_format(blob)
                ident=uuid.uuid4().hex
                filename=ident+'.'+ext
                fd=os.open(PHOTOS/filename,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
                try:
                    with os.fdopen(fd,'wb') as out:out.write(blob)
                    with connect() as c:c.execute('INSERT INTO photos (id,date,caption,tags,filename,mime,bytes,created) VALUES (?,?,?,?,?,?,?,?)', (ident,date,caption,json.dumps(tags),filename,mime,len(blob),int(time.time())))
                except Exception:
                    (PHOTOS/filename).unlink(missing_ok=True)
                    raise
                return self.respond(200,{'ok':True,'id':ident})
            if path=='/house-api/photos/delete':
                if not self.require_auth(True):return
                ident=str(self.content().get('id',''))
                if not re.fullmatch(r'[a-f0-9]{32}',ident):raise ValueError('Invalid photo')
                with connect() as c:
                    row=c.execute('SELECT filename FROM photos WHERE id=?',(ident,)).fetchone()
                    if not row:raise ValueError('Photo not found')
                    c.execute('DELETE FROM photos WHERE id=?',(ident,))
                # Photo bytes are removed from the active private gallery. Backups stay independent.
                (PHOTOS/row['filename']).unlink(missing_ok=True)
                return self.respond(200,{'ok':True})
            if path=='/house-api/logout':
                s=self.require_auth(True)
                if not s:return
                cookie=self.headers.get('Cookie','')
                match=re.search('perc_house=([0-9a-f]{64})',cookie)
                if match:SESSIONS.pop(match.group(1),None)
                flag='; Secure' if self.headers.get('X-Forwarded-Proto')=='https' else ''
                return self.respond(200,{'ok':True},'perc_house=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'+flag)
            if path=='/house-api/visitors':
                s=self.require_auth(True)
                if not s:return
                d=self.content();name=str(d.get('name','')).strip()[:80]
                date=str(d.get('date','')).strip()[:10];note=str(d.get('note','')).strip()[:250]
                try:dt.date.fromisoformat(date)
                except ValueError:raise ValueError('Please choose a valid date')
                if not name:raise ValueError('Visitor name is required')
                with connect() as c:c.execute('INSERT INTO visits (name,date,note,created) VALUES (?,?,?,?)',(name,date,note,int(time.time())))
                return self.respond(200,{'ok':True})
            if path=='/house-api/visitors/delete':
                s=self.require_auth(True)
                if not s:return
                ident=int(self.content().get('id',0))
                if ident<1:raise ValueError('Invalid visitor entry')
                with connect() as c:c.execute('DELETE FROM visits WHERE id=?',(ident,))
                return self.respond(200,{'ok':True})
            return self.respond(404,{'error':'Not found'})
        except (ValueError,TypeError,json.JSONDecodeError):return self.respond(400,{'error':'Check the information and try again.'})
        except (FileNotFoundError,OSError):return self.respond(503,{'error':'The resident service needs initial setup.'})

if __name__=='__main__':
    if len(sys.argv)!=2 or sys.argv[1] not in ('init','run','set-code'):
        raise SystemExit('Usage: python3 admin/house_private.py init|run|set-code')
    if sys.argv[1]=='init':init()
    elif sys.argv[1]=='set-code':change_code()
    else:
        if not CREDS.exists() or not DETAILS.exists() or not DB.exists():raise SystemExit('First run: python3 admin/house_private.py init')
        init_photos()
        httpd=ThreadingHTTPServer(LISTEN,Server)
        print('Resident backend listening on 127.0.0.1:8767, only tunnel/HTTPS requests allowed',flush=True)
        httpd.serve_forever()
