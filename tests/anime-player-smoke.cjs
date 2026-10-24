// Run: node tests/anime-player-smoke.cjs
// No network, browser, or npm dependencies. Checks the player controls/URLs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
class Element {
  constructor(tag) {
    this.tagName=tag; this.children=[]; this.listeners={}; this.parentElement=null;
    this.textContent=''; this.dataset={}; this.style={}; this.attributes={};
    this.contentWindow=tag==='iframe'?{}:null; this._value=undefined;
  }
  append(...children) {
    for(const child of children) {
      if(child instanceof Element) child.parentElement=this;
      this.children.push(child);
    }
  }
  replaceChildren(...children) { this.children=[]; this.append(...children); }
  after(child) { this.parentElement?.append(child); }
  closest(tag) {
    for(let node=this;node;node=node.parentElement) if(node.tagName===tag)return node;
    return null;
  }
  addEventListener(type, fn) { (this.listeners[type]??=[]).push(fn); }
  dispatchEvent(event) { for(const fn of this.listeners[event.type]??[])fn(event); }
  click() { this.dispatchEvent({type:'click'}); }
  setAttribute(key,val) {this.attributes[key]=val;}
  querySelectorAll() {return [];}
  contains(target) {return target===this||this.children.some(node=>node?.contains?.(target));}
  remove() {}
  get value() {
    return this._value??this.children.find(child=>child?.tagName==='option'&&!child.disabled)?.value??'';
  }
  set value(value) {this._value=value;}
}
const descendants = node => [node,...node.children.flatMap(x=>x instanceof Element?descendants(x):[])];
const root=new Element('div'),storage=new Map(),windowListeners={};
const window={
  addEventListener(type,fn){(windowListeners[type]??=[]).push(fn);},
  removeEventListener(type,fn){windowListeners[type]=(windowListeners[type]??[]).filter(x=>x!==fn);},
  dispatchEvent(){}
};
const document={
  createElement:tag=>new Element(tag),
  getElementById:id=>id==='anime-detail-player'?root:null
};
const localStorage={
  getItem:key=>storage.get(key)??null,
  setItem:(key,value)=>storage.set(key,value)
};
const fetch=async url=>({
  ok:true,
  json:async()=>url.includes('anime-sources')?{titles:{}}:
    url.includes('/sources?')?{sources:[]}:{tmdb:{},status:'ok'}
});
const source=fs.readFileSync(path.resolve(__dirname,'../js/anime-player.js'),'utf8');
vm.runInNewContext(source,{
  window,document,localStorage,fetch,URL,
  location:{href:'https://merope-c.com/pages/anime.html'},
  Event:class{constructor(type){this.type=type;}}
},{filename:'anime-player.js'});
const title={mal_id:31240,title:'Re:Zero',type:'TV'};
window.meropePlayer.open(title);
const find=predicate=>descendants(root).find(predicate);
const select=find(el=>el.tagName==='select'&&el.children.some(o=>o?.textContent==='Embed API Stream'));
const button=find(el=>el.tagName==='button'&&el.textContent==='▶ Play episode');
const episodeInputs=descendants(root).filter(el=>el.tagName==='input'&&el.className==='anime-number-field');
const audioSelect=descendants(root).find(el=>el.tagName==='select'&&el.children.some(o=>o?.value==='dub'));
assert.equal(audioSelect?.disabled,true,'external provider manages its own audio');
assert.ok(select&&button&&episodeInputs.length===2,'expected player controls');
assert.equal(select.value,'remote:embedstream','prefer provider that played episode 1');
assert.equal(find(el=>el.tagName==='iframe'),undefined,'do not load iframe until click');
button.click();
const first=find(el=>el.tagName==='iframe');
assert.match(first.src,/^https:\/\/watch\.embed-api\.stream\/embed\/tv\/65942\/1\/1$/);
assert.equal(first.sandbox,undefined,'Embed API requires unsandboxed outer iframe');
assert.equal(button.textContent,'↻ Retry episode');
episodeInputs[1].value='2';
episodeInputs[1].dispatchEvent({type:'change'});
const second=find(el=>el.tagName==='iframe');
assert.notEqual(first,second,'change episode reloads the iframe');
assert.match(second.src,/\/65942\/1\/2$/);
assert.equal(select.value,'remote:embedstream','do not switch providers between episodes');
select.value='remote:vidlink';
select.dispatchEvent({type:'change'});
const other=find(el=>el.tagName==='iframe');
assert.ok(other.sandbox,'untrusted provider remains sandboxed');
assert.equal(audioSelect.disabled,false,'VidLink anime restores SUB/DUB selector');
assert.match(other.src,/\/anime\/31240\/2\/sub/);
window.meropePlayer.close();
window.meropePlayer.open(title);
const reopened=find(el=>el.tagName==='select'&&el.children.some(o=>o?.textContent==='Embed API Stream'));
assert.equal(reopened.value,'remote:vidlink','restore last user-selected provider');
console.log('PASS: click-to-start, provider preference, sandbox allowlist, episode continuity, and saved preference');
