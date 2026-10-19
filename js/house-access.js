/* Private information never ships in this script or the public GitHub repo. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const base='/house-api'; let token='';
 const notice=$('house-access-msg'), login=$('house-login-section'), dash=$('house-dashboard');
 function say(msg){notice.textContent=msg;}
 function element(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=String(text);if(cls)n.className=cls;return n;}
 async function request(path,data,method='GET'){
  const options={method,credentials:'same-origin',headers:{'Accept':'application/json'}};
  if(method!=='GET'){options.headers['Content-Type']='application/json';options.headers['X-House-Token']=token;options.body=JSON.stringify(data||{});}
  const res=await fetch(base+path,options);let body=null;
  try{body=await res.json();}catch{throw Error('Resident service is not enabled on Polaris yet.');}
  if(!res.ok)throw Error(body?.error||'Could not access the resident service.');
  return body;
 }
 function addField(target,label,value,mode='text'){
  if(!value || (Array.isArray(value)&&!value.length))return;
  const node=element('article',null,'access-detail');node.append(element('h3',label));
  if(mode==='link'){
   try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol))return;
    const a=element('a','Open directions ↗');a.href=u.href;a.rel='noopener noreferrer';a.target='_blank';node.append(a);
   }catch{return;}
  }else if(mode==='contacts' && Array.isArray(value)){
   for(const c of value){if(!c||!c.name||!c.phone)continue;
    const row=element('div',null,'access-contact');row.append(element('strong',c.name),element('span',c.phone));node.append(row);
   }
  }else node.append(element('p',value));
  target.append(node);
 }
 async function renderData(){
  const details=$('house-details');details.replaceChildren();
  const info=await request('/info');
  if(Array.isArray(info.rules) && info.rules.length){
    const card=element('article',null,'access-detail access-rules');
    card.append(element('h3','House rules'));
    const list=element('ol');
    for(const rule of info.rules){if(typeof rule==='string' && rule.trim())list.append(element('li',rule));}
    card.append(list);details.append(card);
  }
  addField(details,'Address',info.address);addField(details,'Phone numbers',info.contacts,'contacts');
  addField(details,'Wi-Fi network',info.wifi_name);addField(details,'Wi-Fi password',info.wifi_password);
  addField(details,'Apple Maps',info.apple_maps,'link');addField(details,'Google Maps',info.google_maps,'link');
  addField(details,'Extra notes',info.notes);
  if(!details.children.length)details.append(element('p','Private house details have not been entered on the server yet.'));
  await renderVisitors();
  await renderPhotos();
 }
 async function renderVisitors(){
  const list=$('house-visitors');list.replaceChildren();const items=await request('/visitors');
  if(!items.length){list.append(element('p','No visitors entered yet.'));return;}
  for(const item of items){const card=element('div',null,'visitor-card');const content=element('div');
   content.append(element('strong',item.name),element('span',item.date));
   if(item.note)content.append(element('p',item.note));
   const b=element('button','Remove');b.type='button';b.addEventListener('click',async()=>{
    if(!confirm('Remove this visitor entry?'))return;
    try{await request('/visitors/delete',{id:item.id},'POST');await renderVisitors();}catch(e){$('house-visitor-message').textContent=e.message;}
   });card.append(content,b);list.append(card);
  }
 }
 async function loggedIn(t){token=t;login.hidden=true;dash.hidden=false;try{await renderData();}catch(e){$('house-visitor-message').textContent=e.message;}}
 $('house-login-form').addEventListener('submit',async e=>{
  e.preventDefault(); const field=$('house-code');say('Checking the code...');
  try{const r=await request('/login',{code:field.value},'POST');field.value='';await loggedIn(r.token);}
  catch(err){say(err.message);field.value='';}
 });
 $('house-visitor-form').addEventListener('submit',async e=>{
  e.preventDefault();const form=new FormData(e.currentTarget);const msg=$('house-visitor-message');
  try{await request('/visitors',{name:form.get('name'),date:form.get('date'),note:form.get('note')},'POST');e.currentTarget.reset();msg.textContent='Visitor added.';await renderVisitors();}
  catch(err){msg.textContent=err.message;}
 });
 $('house-logout').addEventListener('click',async()=>{
  try{await request('/logout',{},'POST');}catch{}token='';dash.hidden=true;login.hidden=false;say('The resident page is locked.');
 });
 if(location.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(location.hostname)){
  say('This page needs HTTPS before the private resident access code can be used.');
  $('house-code').disabled=true;return;
 }
 request('/me').then(r=>{if(r.authenticated)return loggedIn(r.token);say('Enter the code shared privately by the house residents.');})
 .catch(()=>say('Resident login is not enabled on this server yet. The public page does not contain private house details.'));
 // Private albums: metadata and original photos are fetched only after resident login.
 const photosRoot=$('house-photo-albums'), filtersRoot=$('house-photo-filters');
 const lightbox=$('house-photo-lightbox');
 const galleryState={photos:[],filter:''};
 const photoMessage=$('house-photo-message');
 async function renderPhotos(){
   galleryState.photos=await request('/photos');
   const allTags=[...new Set(galleryState.photos.flatMap(p=>p.tags||[]))].sort();
   if(galleryState.filter&&!allTags.includes(galleryState.filter))galleryState.filter='';
   filtersRoot.replaceChildren();
   for(const tag of ['',...allTags]){
     const b=element('button',tag?'#'+tag:'All photos');b.type='button';
     b.setAttribute('aria-pressed',String(galleryState.filter===tag));
     b.addEventListener('click',()=>{galleryState.filter=tag;drawPhotos()});
     filtersRoot.append(b);
   }
   drawPhotos();
 }
 function drawPhotos(){
   filtersRoot.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.textContent===(galleryState.filter?'#'+galleryState.filter:'All photos'))));
   photosRoot.replaceChildren();
   const current=galleryState.photos.filter(p=>!galleryState.filter||(p.tags||[]).includes(galleryState.filter));
   if(!current.length){photosRoot.append(element('p','No photos here yet. Add the first one above.'));return;}
   const days=new Map();for(const item of current){if(!days.has(item.date))days.set(item.date,[]);days.get(item.date).push(item)}
   for(const [date,items] of [...days.entries()].sort((a,b)=>b[0].localeCompare(a[0]))){
     const section=element('section',null,'house-photo-album');
     const nice=new Date(date+'T12:00:00').toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'});
     section.append(element('h3',nice));
     const grid=element('div',null,'house-photo-grid');
     for(const p of items){
       const b=element('button',null,'house-photo-tile');b.type='button';b.setAttribute('aria-label','Open photo from '+date);
       const img=element('img');img.src=p.url;img.loading='lazy';img.alt=p.caption||'PERC House photo from '+date;
       b.append(img);
       if(p.tags?.length)b.append(element('span',p.tags.map(t=>'#'+t).join(' ')));
       b.addEventListener('click',()=>showPhoto(p));grid.append(b);
     }
     section.append(grid);photosRoot.append(section);
   }
 }
 function showPhoto(p){
   const img=$('house-photo-full');img.src=p.url;img.alt=p.caption||'House photo from '+p.date;
   const details=$('house-photo-details');details.replaceChildren();
   details.append(element('strong',p.date));
   if(p.tags?.length)details.append(element('p',p.tags.map(t=>'#'+t).join(' ')));
   if(p.caption)details.append(element('p',p.caption));
   const remove=element('button','Remove photo','house-photo-delete');remove.type='button';
   remove.addEventListener('click',async()=>{
     if(!confirm('Remove this photo from the house album? This cannot be undone without a backup.'))return;
     try{await request('/photos/delete',{id:p.id},'POST');lightbox.close();img.removeAttribute('src');photoMessage.textContent='Photo removed.';await renderPhotos();}
     catch(e){photoMessage.textContent=e.message;}
   });details.append(remove);lightbox.showModal();
 }
 $('house-photo-close').addEventListener('click',()=>lightbox.close());
 lightbox.addEventListener('click',e=>{if(e.target===lightbox)lightbox.close()});
 // Resize large phone photos in the browser to keep uploads fast and remove camera metadata.
 async function preparePhoto(file){
   if(file.type==='image/gif'){
     if(file.size>10*1024*1024)throw Error('GIF '+file.name+' is larger than 10 MB.');
     return file;
   }
   if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Please choose JPG, PNG, WEBP or GIF.');
   try{
     const bitmap=await createImageBitmap(file);
     const max=2200;const ratio=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
     const w=Math.max(1,Math.round(bitmap.width*ratio)),h=Math.max(1,Math.round(bitmap.height*ratio));
     const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
     const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(bitmap,0,0,w,h);bitmap.close();
     const compressed=await new Promise(ok=>canvas.toBlob(ok,'image/jpeg',0.86));
     if(compressed&&compressed.size<=10*1024*1024)return compressed;
   }catch(e){/* browser cannot resize; try original if small enough */}
   if(file.size>10*1024*1024)throw Error(file.name+' is too large to upload.');
   return file;
 }
 async function base64File(file){
   return new Promise((resolve,reject)=>{
     const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);
     reader.onerror=()=>reject(Error('Could not read photo'));
     reader.readAsDataURL(file);
   });
 }
 $('house-photo-date').value=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
 $('house-photo-form').addEventListener('submit',async e=>{
   e.preventDefault();const form=e.currentTarget;const files=[...$('house-photo-files').files];if(!files.length)return;
   const date=$('house-photo-date').value,caption=form.elements.caption.value;
   const tags=[...new Set(String(form.elements.tags.value).split(/[\s,]+/).map(v=>v.trim().replace(/^#+/,'').toLowerCase()).filter(Boolean))];
   if(tags.length>8){photoMessage.textContent='Please use eight tags or fewer.';return;}
   const btn=$('house-photo-submit');btn.disabled=true;
   let done=0;
   try{
     for(const file of files){
       photoMessage.textContent=`Uploading photo ${done+1} of ${files.length}...`;
       const resized=await preparePhoto(file);
       await request('/photos/upload',{image_base64:await base64File(resized),date,tags,caption},'POST');
       done++;
     }
     form.reset();$('house-photo-date').value=date;
     photoMessage.textContent=`Uploaded ${done} photo${done===1?'':'s'} to the private house album.`;
     await renderPhotos();
   }catch(err){photoMessage.textContent=`${done} uploaded. ${err.message}`;await renderPhotos().catch(()=>{});}
   finally{btn.disabled=false;}
 });
})();
