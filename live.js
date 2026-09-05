const leaderboard=document.getElementById('leaderboard'),template=document.getElementById('rowTemplate'),statusDot=document.getElementById('statusDot'),statusText=document.getElementById('statusText'),refreshText=document.getElementById('refreshText');
const state=new Map();
const REFRESH_MS=20000;
const STORAGE_KEY='yt_tracker_projection_v3';

function fmt(v){
  if(!Number.isFinite(v))return '—';
  if(v>=1e9)return `${(v/1e9).toFixed(2)}B`;
  if(v>=1e6)return `${(v/1e6).toFixed(2)}M`;
  if(v>=1e3)return Math.round(v).toLocaleString('en-US');
  return Math.round(v).toLocaleString('en-US');
}
function setStatus(c,t){statusDot.className=`status-dot ${c||''}`;statusText.textContent=t}
function clamp(v,min,max){return Math.min(max,Math.max(min,v))}
function baselineRate(v){
  if(v>=500000000)return 5.0;
  if(v>=300000000)return 4.0;
  if(v>=150000000)return 3.0;
  if(v>=100000000)return 2.5;
  if(v>=50000000)return 1.8;
  return 1.2;
}
function saveMemory(){
  try{
    const out={};
    state.forEach((s,id)=>{out[id]={anchor:s.anchor,anchorAt:s.anchorAt,rate:s.rate,last:s.last,lastAt:s.lastAt,rank:s.rank}});
    localStorage.setItem(STORAGE_KEY,JSON.stringify(out));
  }catch{}
}
function loadMemory(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);if(!raw)return;
    const data=JSON.parse(raw);
    Object.entries(data).forEach(([id,s])=>{
      if(!Number.isFinite(s.anchor))return;
      state.set(id,{...s,rate:Number.isFinite(s.rate)?s.rate:baselineRate(s.anchor),from:s.anchor,to:s.anchor,at:Date.now()});
    });
  }catch{}
}
function projection(id){
  const s=state.get(id);if(!s||!Number.isFinite(s.anchor))return NaN;
  const elapsed=Math.max(0,(Date.now()-s.anchorAt)/1000);
  const rate=clamp(Number(s.rate)||baselineRate(s.anchor),0,200);
  return s.anchor+elapsed*rate;
}
function displayCount(id){const s=state.get(id);return s?projection(id):NaN}
function updateState(c,oldRank){
  const now=Date.now(),v=c.subscribers;
  let s=state.get(c.id);
  if(!s){
    s={anchor:v,anchorAt:now,rate:baselineRate(v),last:v,lastAt:now,rank:oldRank??null,from:v,to:v,at:now};
    state.set(c.id,s);return;
  }
  const dt=Math.max(1,(now-(s.lastAt||now))/1000);
  const delta=v-(Number(s.last)||v);
  if(delta>0){
    const observed=delta/dt;
    if(Number.isFinite(observed))s.rate=clamp((Number(s.rate)||baselineRate(v))*0.65+observed*0.35,0.4,200);
  }else if(delta<0){
    const observed=delta/dt;
    if(Number.isFinite(observed))s.rate=clamp((Number(s.rate)||baselineRate(v))*0.8+Math.max(0,observed)*0.2,0.4,200);
  }else{
    s.rate=clamp((Number(s.rate)||baselineRate(v))*0.9995,0.4,200);
  }
  const previousProjection=projection(c.id);
  if(v!==s.last){
    s.anchor=v;
    s.anchorAt=now;
  }else if(Number.isFinite(previousProjection)&&previousProjection>v){
    s.anchor=previousProjection;
    s.anchorAt=now;
  }
  s.last=v;s.lastAt=now;s.from=s.anchor;s.to=s.anchor;s.at=now;
}
function updateRow(c,i){
  let r=leaderboard.querySelector(`[data-id="${CSS.escape(c.id)}"]`);
  if(!r){r=template.content.firstElementChild.cloneNode(true);r.dataset.id=c.id}
  r.querySelector('.rank').textContent=String(i+1).padStart(2,'0');
  r.querySelector('.channel-name').textContent=c.name;
  r.querySelector('.avatar').src=c.avatar||'';
  r.querySelector('.avatar').alt=`${c.name} avatar`;
  r.querySelector('.count').textContent=fmt(displayCount(c.id));
  const s=state.get(c.id),m=r.querySelector('.movement'),old=s?.rank;
  m.textContent=old==null?'•':old>i+1?'↑':old<i+1?'↓':'•';
  m.className=`movement ${old>i+1?'up':old<i+1?'down':''}`;
  r.classList.toggle('top',i<3);
  const change=r.querySelector('.change');
  if(change){
    const rate=Math.max(0,Number(s?.rate)||0);
    change.textContent=`~${rate.toFixed(rate>=10?0:1)}/sec EST.`;
    change.className='change up';
  }
  return r;
}
function render(cs){
  cs=cs.filter(c=>Number.isFinite(c.subscribers));
  cs.sort((a,b)=>b.subscribers-a.subscribers);
  const frag=document.createDocumentFragment();
  cs.forEach((c,i)=>{const old=state.get(c.id)?.rank;updateState(c,old);state.get(c.id).rank=i+1;frag.appendChild(updateRow(c,i))});
  leaderboard.replaceChildren(frag);
  saveMemory();
}
async function load(){
  try{
    const key=localStorage.getItem('yt_tracker_api_key');
    if(!key)throw Error('Open config.html and enter your YouTube API key.');
    const list=await fetch('data/channels.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Channel data unavailable');return r.json()});
    const ids=list.map(x=>x.id).join(',');
    if(!ids)throw Error('No channel IDs configured.');
    const url='https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id='+encodeURIComponent(ids)+'&key='+encodeURIComponent(key);
    const r=await fetch(url,{cache:'no-store'});const d=await r.json();
    if(!r.ok)throw Error(d.error?.message||'YouTube API request failed');
    const map=new Map((d.items||[]).map(x=>[x.id,x]));
    const rows=list.map(c=>{const x=map.get(c.id);return x?{id:x.id,name:x.snippet?.title||c.name,avatar:x.snippet?.thumbnails?.high?.url||x.snippet?.thumbnails?.default?.url,subscribers:x.statistics?.hiddenSubscriberCount?null:Number(x.statistics?.subscriberCount||0)}:null}).filter(Boolean);
    render(rows);
    setStatus('online','LIVE');
    refreshText.textContent=`API ${new Date().toLocaleTimeString()} · ${REFRESH_MS/1000}s polling · EST. projection`;
  }catch(e){setStatus('error','SETUP NEEDED');refreshText.textContent=e.message}
}
function tick(){
  state.forEach((_,id)=>{
    const r=leaderboard.querySelector(`[data-id="${CSS.escape(id)}"]`);if(!r)return;
    r.querySelector('.count').textContent=fmt(displayCount(id));
    const s=state.get(id),change=r.querySelector('.change');
    if(change){const rate=Math.max(0,Number(s?.rate)||0);change.textContent=`~${rate.toFixed(rate>=10?0:1)}/sec EST.`}
  });
  requestAnimationFrame(tick);
}
loadMemory();load();setInterval(load,REFRESH_MS);tick();