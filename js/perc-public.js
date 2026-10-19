/* Public PERC Bot overview. No Discord token, private data or privileged APIs.
   Future Polaris integration: GET /api/perc/public, a sanitized read-only feed.
   A missing endpoint is NOT evidence that Betelgeuse is offline. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const text = (id, value) => {const node = $(id);if(node) node.textContent = value;};
  const showRows = (id, rows, labelKey, detailKey) => {
    const root = $(id);if(!root) return;
    root.replaceChildren();
    if(!Array.isArray(rows) || !rows.length) return;
    const list = document.createElement('div');
    for(const entry of rows.slice(0, 30)){
      if(!entry || typeof entry[labelKey] !== 'string') continue;
      const row = document.createElement('div');
      row.className = 'perc-pulse-row';
      const name = document.createElement('span');name.textContent = entry[labelKey].slice(0, 80);
      const detail = document.createElement('small');
      const value = entry[detailKey];
      detail.textContent = typeof value === 'string' || typeof value === 'number' ? String(value).slice(0, 100) : '';
      row.append(name,detail);list.append(row);
    }
    if(list.children.length)root.append(list);
  };
  async function refresh(){
    try {
      const res = await fetch('/api/perc/public', {cache:'no-store',credentials:'omit'});
      if(!res.ok) throw new Error('Feed not connected');
      const data = await res.json();
      if(!data || data.schema_version !== 1 || typeof data.generated_at !== 'string')throw new Error('Unverified feed');
      const age = Date.now() - Date.parse(data.generated_at);
      if(!Number.isFinite(age) || age < -120000 || age > 180000)throw new Error('Outdated feed');
      if(data.status === 'online') text('perc-live-status','Online');
      else if(data.status === 'offline')text('perc-live-status','Offline');
      else if(data.status === 'unresponsive')text('perc-live-status','Unresponsive');
      else text('perc-live-status','Status unavailable');
      text('perc-live-check','Last verified: '+new Date(data.generated_at).toLocaleTimeString());
      if(data.cycle && typeof data.cycle.name === 'string')text('perc-cycle-name',data.cycle.name);
      if(data.cycle && typeof data.cycle.summary === 'string')text('perc-cycle-summary',data.cycle.summary);
      if(Array.isArray(data.leaderboard))showRows('perc-leaderboard-content',data.leaderboard,'name','summary');
      if(Array.isArray(data.champions)) {
        text('perc-champion-count',data.champions.length+' champion'+(data.champions.length===1?'':'s'));
        showRows('perc-champions-content',data.champions,'name','trophies');
      }
    }catch{
      text('perc-live-status','Not connected');
      text('perc-live-check','Live monitoring coming later');
      text('perc-cycle-summary','Live rankings pending integration');
    }
  }
  refresh();
  window.setInterval(refresh,60000);
})();
