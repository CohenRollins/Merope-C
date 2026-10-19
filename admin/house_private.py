#!/usr/bin/env python3
"""PERC House private resident backend. Binds only to loopback; Nginx must enforce HTTPS.
No home address, passwords, or contacts are included in GitHub code.
"""
import datetime as dt
import getpass
import hashlib
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
SESSIONS={}
ATTEMPTS={}
LISTEN=('127.0.0.1',8767)
EXPIRES=60*60*2
DEFAULT={'address':'','contacts':[], 'wifi_name':'','wifi_password':'','apple_maps':'','google_maps':'','notes':''}

def init():
    BASE.mkdir(mode=0o700,parents=True,exist_ok=True)
    os.chmod(BASE,0o700)
    if not CREDS.exists():
        pw=getpass.getpass('Set private house access code (12+ characters): ')
        cf=getpass.getpass('Repeat access code: ')
        if len(pw)<12 or pw!=cf:
            raise SystemExit('Codes do not match or are too short. Nothing saved.')
        salt=secrets.token_bytes(16)
        digest=hashlib.pbkdf2_hmac('sha256',pw.encode(),salt,600_000)
        fd=os.open(CREDS,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
        with os.fdopen(fd,'w') as f:json.dump({'salt':salt.hex(),'hash':digest.hex()},f)
        print('Access code verifier stored in private config. The code itself was not saved.')
    else:print('Access code already set; not changing it.')
    if not DETAILS.exists():
        fd=os.open(DETAILS,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
        with os.fdopen(fd,'w') as f:json.dump(DEFAULT,f,indent=2)
        print('Private details template created at '+str(DETAILS))
    with connect() as c:
        c.execute('CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, date TEXT NOT NULL, note TEXT NOT NULL DEFAULT "", created INTEGER NOT NULL)')
    os.chmod(DB,0o600)

def connect():
    c=sqlite3.connect(DB,timeout=10)
    c.row_factory=sqlite3.Row
    return c

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
    def content(self):
        length=int(self.headers.get('Content-Length','0'))
        if length<1 or length>8192:raise ValueError('Request too large or empty')
        return json.loads(self.rfile.read(length))
    def do_GET(self):
        if not self.is_secure():return self.respond(403,{'error':'HTTPS required for resident access.'})
        path=self.request_path()
        if path=='/house-api/status':return self.respond(200,{'configured':CREDS.exists(),'authenticated':bool(self.session())})
        if path=='/house-api/me':
            s=self.session();return self.respond(200,{'authenticated':bool(s),'token':s['csrf'] if s else None})
        if path=='/house-api/info':
            if not self.require_auth():return
            try:info=json.loads(DETAILS.read_text())
            except (OSError,json.JSONDecodeError):return self.respond(500,{'error':'Private info not configured.'})
            allowed={k:info.get(k,DEFAULT[k]) for k in DEFAULT}
            return self.respond(200,allowed)
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
                recent=[t for t in ATTEMPTS.get(client,[]) if t>time.time()-900]
                ATTEMPTS[client]=recent
                if len(recent)>=6:return self.respond(429,{'error':'Too many attempts. Try again later.'})
                pw=str(self.content().get('code',''))[:2048]
                cred=json.loads(CREDS.read_text())
                digest=hashlib.pbkdf2_hmac('sha256',pw.encode(),bytes.fromhex(cred['salt']),600_000)
                if not hmac.compare_digest(digest,bytes.fromhex(cred['hash'])):
                    recent.append(time.time());time.sleep(.5)
                    return self.respond(401,{'error':'That code did not work.'})
                ATTEMPTS.pop(client,None)
                sid=secrets.token_hex(32);csrf=secrets.token_hex(32)
                SESSIONS[sid]={'until':time.time()+EXPIRES,'csrf':csrf}
                flag='; Secure' if self.headers.get('X-Forwarded-Proto')=='https' else ''
                return self.respond(200,{'authenticated':True,'token':csrf},'perc_house='+sid+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+str(EXPIRES)+flag)
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
    if len(sys.argv)!=2 or sys.argv[1] not in ('init','run'):
        raise SystemExit('Usage: python3 admin/house_private.py init|run')
    if sys.argv[1]=='init':init()
    else:
        if not CREDS.exists() or not DETAILS.exists() or not DB.exists():raise SystemExit('First run: python3 admin/house_private.py init')
        httpd=ThreadingHTTPServer(LISTEN,Server)
        print('Resident backend listening on 127.0.0.1:8767, only tunnel/HTTPS requests allowed',flush=True)
        httpd.serve_forever()
