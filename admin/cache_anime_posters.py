#!/usr/bin/env python3
"""Optional private-server poster cache for curated starter anime.
Retrieves image URLs from Jikan/MyAnimeList using stdlib urllib. Do not commit
cached artwork to a public GitHub repository without checking usage rights.
"""
from pathlib import Path
import json,time,urllib.request,urllib.error,sys
IDS=[5114,9253,11061,1535,1,31240,52991,40748,38000,32182,50265,21,20583,37521,47917,199,32281,28851]
OUTPUT=Path('/var/www/merope-c/assets/anime/posters')
UA={'User-Agent':'Merope-C-Poster-Cache/0.8 (personal collection; no bulk indexing)','Accept':'application/json'}

def get(url,headers=UA):
 req=urllib.request.Request(url,headers=headers)
 with urllib.request.urlopen(req,timeout=18) as response:
  data=response.read(3_000_000)
  return data

def main():
 OUTPUT.mkdir(parents=True,exist_ok=True)
 ok=0
 for i,id in enumerate(IDS):
  out=OUTPUT/f'mal-{id}.jpg'
  if out.exists() and out.stat().st_size>1000:
   print(f'[{i+1}/{len(IDS)}] {id} already cached');ok+=1;continue
  try:
   obj=json.loads(get(f'https://api.jikan.moe/v4/anime/{id}'))['data']
   imgs=obj.get('images',{}).get('jpg',{})
   source=imgs.get('large_image_url') or imgs.get('image_url')
   if not source or not source.startswith('https://'):
    raise ValueError('No secure poster URL from Jikan')
   blob=get(source,{'User-Agent':UA['User-Agent'],'Referer':'https://myanimelist.net/'})
   if not blob.startswith(b'\xff\xd8\xff') or len(blob)<1000:
    raise ValueError('Invalid JPEG downloaded')
   out.write_bytes(blob);out.chmod(0o644);ok+=1
   print(f'[{i+1}/{len(IDS)}] saved {id} ({len(blob)} bytes)')
  except (OSError,urllib.error.URLError,ValueError,KeyError,TimeoutError) as e:
   print(f'[{i+1}/{len(IDS)}] {id} unavailable: {type(e).__name__}: {e}',file=sys.stderr)
  time.sleep(1.4)
 print(f'Done: {ok}/{len(IDS)} actual posters. The site will use designed local fallbacks where missing.')
if __name__=='__main__':main()
