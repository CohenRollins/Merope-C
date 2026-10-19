#!/usr/bin/env python3
"""Merope-C local-only art admin; stdlib-only. Bind to 127.0.0.1; NEVER expose admin port publicly."""
import base64, datetime, getpass, hashlib, hmac, json, os, re, secrets, sqlite3, sys, time, uuid
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
HOME = Path.home()
DATA_DIR = HOME / '.local' / 'share' / 'merope-c'
CONFIG_DIR = HOME / '.config' / 'merope-c'
DB = DATA_DIR / 'gallery.sqlite3'
CREDS = CONFIG_DIR / 'admin-credentials.json'
UPLOAD_DIR = Path('/var/www/merope-c/uploads')
PANEL = ROOT / 'admin' / 'panel.html'
MAX_BYTES = 12 * 1024 * 1024
SESSIONS = {}
LABELS = {'commission','artfight','my-character','other-person','sketch','original','fanart','collab','other'}

def prep():
    DATA_DIR.mkdir(parents=True,exist_ok=True,mode=0o700)
    CONFIG_DIR.mkdir(parents=True,exist_ok=True,mode=0o700)
    # Only the owner should be able to read the credentials/database.
    os.chmod(DATA_DIR,0o700);os.chmod(CONFIG_DIR,0o700)

def init():
    prep()
    if CREDS.exists():
        print('Credentials already exist. Nothing overwritten.');return
    pw=getpass.getpass('Create local gallery admin password (12+ characters): ')
    confirm=getpass.getpass('Repeat password: ')
    if len(pw)<12 or pw!=confirm:
        print('Password too short or does not match.');sys.exit(1)
    salt=secrets.token_bytes(16)
    digest=hashlib.pbkdf2_hmac('sha256',pw.encode(),salt,600_000)
    fd=os.open(str(CREDS),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f:json.dump({'salt':salt.hex(),'digest':digest.hex()},f)
    pw=''; print('Gallery admin password hash created; your actual password was not saved.')

def connect():
    c=sqlite3.connect(DB,timeout=30)
    c.row_factory=sqlite3.Row
    return c

def startdb():
    prep()
    with connect() as c:
        c.execute('CREATE TABLE IF NOT EXISTS art (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT "", src TEXT NOT NULL, source_file TEXT NOT NULL DEFAULT "", file_date TEXT NOT NULL DEFAULT "", date_type TEXT NOT NULL DEFAULT "archive-modified", tags TEXT NOT NULL DEFAULT "[]", artist TEXT NOT NULL DEFAULT "", characters TEXT NOT NULL DEFAULT "", notes TEXT NOT NULL DEFAULT "", permission_confirmed INTEGER NOT NULL DEFAULT 0, published INTEGER NOT NULL DEFAULT 1, uploaded INTEGER NOT NULL DEFAULT 0, sha256 TEXT NOT NULL DEFAULT "")')
        c.execute('CREATE TABLE IF NOT EXISTS deleted_art (id TEXT PRIMARY KEY)')
        # New bundled art appears after a service restart without overwriting
        # edits already made in the admin. Removed entries stay removed.
        source=json.loads((ROOT/'data'/'gallery.json').read_text(encoding='utf-8'))
        for a in source:
            present=c.execute('SELECT 1 FROM art WHERE id=?',(a['id'],)).fetchone()
            removed=c.execute('SELECT 1 FROM deleted_art WHERE id=?',(a['id'],)).fetchone()
            if not present and not removed:put(c,a,create=True)
    os.chmod(DB,0o600)

def validated(a):
    def txt(key,n=400):return str(a.get(key,'')).strip()[:n]
    date=txt('file_date',10)
    if date:
        try: datetime.date.fromisoformat(date)
        except ValueError: raise ValueError('Invalid date. Use YYYY-MM-DD.')
    tagvalues=a.get('tags',[])
    if not isinstance(tagvalues,list):raise ValueError('Tags must be an array')
    tags=sorted(set(str(x).strip().lower() for x in tagvalues if str(x).strip()))
    if any(x not in LABELS for x in tags):raise ValueError('Unknown tag')
    return {'title':txt('title',160) or 'Untitled','description':txt('description',1000),'file_date':date,'date_type':txt('date_type',40) or 'corrected', 'tags':tags, 'artist':txt('artist',160), 'characters':txt('characters',300), 'notes':txt('notes',1000), 'permission_confirmed':bool(a.get('permission_confirmed',False)), 'published':bool(a.get('published',True))}

def put(c,a,create=False):
    d=validated(a)
    if create:
        c.execute('INSERT INTO art (id,title,description,src,source_file,file_date,date_type,tags,artist,characters,notes,permission_confirmed,published,uploaded,sha256) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        (a['id'],d['title'],d['description'],a['src'],a.get('source_file',''),d['file_date'],d['date_type'],json.dumps(d['tags']),d['artist'],d['characters'],d['notes'],int(d['permission_confirmed']),int(d['published']),int(bool(a.get('uploaded'))),a.get('sha256','')))
    else:
        vals=(d['title'],d['description'],d['file_date'],d['date_type'],json.dumps(d['tags']),d['artist'],d['characters'],d['notes'],int(d['permission_confirmed']),int(d['published']),a['id'])
        result=c.execute('UPDATE art SET title=?, description=?, file_date=?, date_type=?, tags=?, artist=?, characters=?, notes=?, permission_confirmed=?, published=? WHERE id=?', vals)
        if not result.rowcount:raise ValueError('Art entry not found')

def gallery():
    with connect() as c:
        rows=[dict(row) for row in c.execute('SELECT * FROM art')]
    for a in rows:
        a['tags']=json.loads(a['tags']);a['published']=bool(a['published']);a['uploaded']=bool(a['uploaded']);a['permission_confirmed']=bool(a['permission_confirmed'])
    return rows

def detect(blob):
    if blob.startswith(b'\x89PNG\r\n\x1a\n'):return 'png'
    if blob.startswith(b'\xff\xd8\xff'):return 'jpg'
    if blob[:4]==b'RIFF' and blob[8:12]==b'WEBP':return 'webp'
    if blob[:6] in (b'GIF87a',b'GIF89a'):return 'gif'
    raise ValueError('Only PNG, JPEG, WebP, GIF images are supported')

class Handler(BaseHTTPRequestHandler):
    def log_message(self,fmt,*args):
        print('%s %s'%(self.address_string(),fmt%args),flush=True)
    def send(self,code,obj,cookie=None):
        data=json.dumps(obj,ensure_ascii=False).encode('utf-8')
        self.send_response(code);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Content-Length',str(len(data)))
        if cookie:self.send_header('Set-Cookie',cookie)
        self.end_headers();self.wfile.write(data)
    def get_session(self):
        cookie=self.headers.get('Cookie','')
        m=re.search(r'(?:^|;\s*)mc_session=([0-9a-f]{64})',cookie)
        key=m.group(1) if m else ''
        s=SESSIONS.get(key)
        if s and s['expires']>time.time():return s
        if key:SESSIONS.pop(key,None)
        return None
    def allowed_origin(self):
        origin=self.headers.get('Origin','')
        # Local admin only, tunneled over SSH.
        return origin in ('http://localhost:8765','http://127.0.0.1:8765')
    def require_admin(self,csrf=False):
        session=self.get_session()
        if not session:
            self.send(401,{'error':'Please log in'});return None
        if csrf and (not self.allowed_origin() or not hmac.compare_digest(self.headers.get('X-CSRF-Token',''),session['csrf'])):
            self.send(403,{'error':'Invalid request token/origin'});return None
        return session
    def do_GET(self):
        path=urlsplit(self.path).path
        if path.startswith('/assets/art/') or path.startswith('/uploads/'):
            # Read-only previews for the SSH-tunneled editor, never arbitrary filesystem access.
            name=path.rsplit('/',1)[-1]
            if not re.fullmatch(r'[a-zA-Z0-9_.-]+',name) or name.startswith('.'):
                self.send(404,{'error':'Not found'});return
            base = ROOT/'assets'/'art' if path.startswith('/assets/art/') else UPLOAD_DIR
            target=base/name
            if not target.is_file() or target.suffix.lower() not in ('.png','.jpg','.jpeg','.webp','.gif'):
                self.send(404,{'error':'Not found'});return
            mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif'}[target.suffix.lower()]
            data=target.read_bytes()
            self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Cache-Control','private, max-age=120');self.send_header('Content-Length',str(len(data)));self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(data);return
        if path=='/api/gallery':
            # Safe public read endpoint: published entries only.
            self.send(200,[{key:a[key] for key in ('id','title','description','src','file_date','date_type','tags','artist','characters','permission_confirmed','published')} for a in gallery() if a['published']]);return
        if path=='/admin':
            doc=PANEL.read_bytes()
            self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(doc)));self.send_header('X-Content-Type-Options','nosniff');self.send_header('X-Frame-Options','DENY');self.end_headers();self.wfile.write(doc);return
        if path=='/api/me':
            session=self.get_session();self.send(200,{'authenticated':bool(session),'csrf':session['csrf'] if session else ''});return
        if path=='/api/admin/gallery':
            if not self.require_admin():return
            self.send(200,gallery());return
        if path=='/api/admin/export':
            if not self.require_admin():return
            self.send(200,gallery());return
        self.send(404,{'error':'Not found'})
    def payload(self):
        size=int(self.headers.get('Content-Length','0'))
        if size<0 or size>MAX_BYTES*1.38+8192:raise ValueError('Upload or request too large')
        return json.loads(self.rfile.read(size))
    def do_POST(self):
        path=urlsplit(self.path).path
        try:
            if path=='/api/login':
                if not self.allowed_origin():self.send(403,{'error':'Invalid login origin'});return
                data=self.payload()
                cred=json.loads(CREDS.read_text())
                guess=hashlib.pbkdf2_hmac('sha256',str(data.get('password','')).encode(),bytes.fromhex(cred['salt']),600_000)
                if not hmac.compare_digest(guess,bytes.fromhex(cred['digest'])):
                    time.sleep(.8);self.send(401,{'error':'Incorrect password'});return
                token=secrets.token_hex(32)
                SESSIONS[token]={'expires':time.time()+8*3600,'csrf':secrets.token_hex(24)}
                self.send(200,{'authenticated':True,'csrf':SESSIONS[token]['csrf']},'mc_session='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800');return
            if path=='/api/logout':
                if not self.require_admin(csrf=True):return
                cookie=self.headers.get('Cookie',''); m=re.search('mc_session=([0-9a-f]{64})',cookie)
                if m:SESSIONS.pop(m.group(1),None)
                self.send(200,{'ok':True},'mc_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return
            if path in ('/api/admin/update','/api/admin/upload','/api/admin/delete'):
                if not self.require_admin(csrf=True):return
                data=self.payload()
                if path.endswith('update'):
                    with connect() as c:put(c,data)
                    self.send(200,{'ok':True});return
                if path.endswith('delete'):
                    ident=str(data.get('id',''))
                    with connect() as c:
                        r=c.execute('SELECT uploaded,src FROM art WHERE id=?',(ident,)).fetchone()
                        if not r:raise ValueError('Entry not found')
                        c.execute('DELETE FROM art WHERE id=?',(ident,))
                        c.execute('INSERT OR IGNORE INTO deleted_art (id) VALUES (?)',(ident,))
                    # Never automatically delete any original or uploaded image; orphaned files can be cleaned after backup.
                    self.send(200,{'ok':True});return
                if path.endswith('upload'):
                    raw=data.get('image_base64','')
                    blob=base64.b64decode(raw,validate=True)
                    if len(blob)>MAX_BYTES or len(blob)<32:raise ValueError('Image must be between 32 bytes and 12MB')
                    ext=detect(blob)
                    sha=hashlib.sha256(blob).hexdigest()
                    with connect() as c:
                        duplicate=c.execute('SELECT id FROM art WHERE sha256=?',(sha,)).fetchone()
                    if duplicate:raise ValueError('That exact image already exists (ID '+duplicate[0]+')')
                    UPLOAD_DIR.mkdir(parents=True,exist_ok=True)
                    ident=uuid.uuid4().hex
                    filename=ident+'.'+ext
                    target=UPLOAD_DIR/filename
                    fd=os.open(str(target),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o644)
                    with os.fdopen(fd,'wb') as f:f.write(blob)
                    a={'id':ident,'title':data.get('title') or 'New artwork','description':data.get('description',''),'artist':data.get('artist',''),'characters':data.get('characters',''),'notes':data.get('notes',''),'tags':data.get('tags',[]),'file_date':data.get('file_date',''),'date_type':'corrected','permission_confirmed':data.get('permission_confirmed',False),'published':data.get('published',True),'src':'/uploads/'+filename,'source_file':str(data.get('filename',''))[:160],'uploaded':True,'sha256':sha}
                    with connect() as c:put(c,a,create=True)
                    self.send(200,{'ok':True,'id':ident});return
            self.send(404,{'error':'Not found'})
        except (ValueError,KeyError,TypeError,json.JSONDecodeError) as err:self.send(400,{'error':str(err)})
        except Exception as err:
            print('Request error',type(err).__name__,flush=True)
            self.send(500,{'error':'Internal error; see server logs'})

if __name__=='__main__':
    if len(sys.argv)<2 or sys.argv[1] not in ('init','run'):
        print('Usage: python3 admin/server.py init|run');sys.exit(2)
    if sys.argv[1]=='init':init()
    else:
        if not CREDS.exists():print('Run init first');sys.exit(1)
        if not UPLOAD_DIR.exists():print('Create /var/www/merope-c/uploads and set ownership before starting');sys.exit(1)
        startdb()
        server=ThreadingHTTPServer(('127.0.0.1',8765),Handler)
        print('Merope-C gallery backend on loopback port 8765 (SSH tunnel only)',flush=True)
        server.serve_forever()
