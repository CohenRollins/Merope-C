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
  addField(details,'Address',info.address);addField(details,'Phone numbers',info.contacts,'contacts');
  addField(details,'Wi-Fi network',info.wifi_name);addField(details,'Wi-Fi password',info.wifi_password);
  addField(details,'Apple Maps',info.apple_maps,'link');addField(details,'Google Maps',info.google_maps,'link');
  addField(details,'Extra notes',info.notes);
  if(!details.children.length)details.append(element('p','Private house details have not been entered on the server yet.'));
  await renderVisitors();
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
})();
