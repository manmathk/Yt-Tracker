require('dotenv').config();
const path = require('path');
const express = require('express');
const channels = require('./data/channels.json');
const app = express();
const PORT = process.env.PORT || 3000;
const ENV_API_KEY = process.env.YOUTUBE_API_KEY || '';
const REFRESH_MS = Math.max(30_000, Number(process.env.REFRESH_MS) || 60_000);
const cache = { updatedAt: 0, channels: [], error: null };
let resolvedChannels = null;
let refreshing = null;
function publicChannel(item, fallback) { const s=item.statistics||{}; return {id:item.id,handle:fallback.handle,configuredName:fallback.name,name:item.snippet?.title||fallback.name,avatar:item.snippet?.thumbnails?.high?.url||item.snippet?.thumbnails?.default?.url||null,subscribers:s.hiddenSubscriberCount?null:Number(s.subscriberCount||0),hiddenSubscriberCount:Boolean(s.hiddenSubscriberCount),fetchedAt:Date.now()}; }
async function youtubeRequest(params, apiKey) { const url=new URL('https://www.googleapis.com/youtube/v3/channels'); Object.entries({...params,key:apiKey}).forEach(([k,v])=>url.searchParams.set(k,v)); const r=await fetch(url); const b=await r.json(); if(!r.ok) throw new Error(b?.error?.message||`YouTube API error (${r.status})`); return b; }
async function resolveChannelIds(apiKey) { if(resolvedChannels)return resolvedChannels; const resolved=[]; for(const c of channels){const r=await youtubeRequest({part:'id',forHandle:c.handle},apiKey); const i=r.items?.[0]; if(i?.id)resolved.push({...c,id:i.id});} if(!resolved.length)throw new Error('No configured YouTube channels could be resolved.'); resolvedChannels=resolved; return resolved; }
async function refreshCache(apiKey) { if(!apiKey)throw new Error('No YouTube API key configured. Open /config.html and enter your key.'); if(refreshing)return refreshing; refreshing=(async()=>{const resolved=await resolveChannelIds(apiKey); const d=await youtubeRequest({part:'snippet,statistics',id:resolved.map(c=>c.id).join(',')},apiKey); const byId=new Map((d.items||[]).map(i=>[i.id,i])); cache.channels=resolved.map(c=>byId.get(c.id)?publicChannel(byId.get(c.id),c):null).filter(Boolean); cache.updatedAt=Date.now(); cache.error=null;})(); try{await refreshing;}finally{refreshing=null;} }
app.disable('x-powered-by'); app.use(express.json({limit:'10kb'})); app.use(express.static(path.join(__dirname,'public'),{extensions:['html']}));
app.get('/api/health',(_req,res)=>res.json({ok:Boolean(cache.channels.length),updatedAt:cache.updatedAt||null,error:cache.error}));
app.post('/api/config',async(req,res)=>{const key=typeof req.body?.apiKey==='string'?req.body.apiKey.trim():''; if(!key)return res.status(400).json({ok:false,error:'API key is required.'}); try{await refreshCache(key); res.json({ok:true,updatedAt:cache.updatedAt,refreshMs:REFRESH_MS});}catch(e){res.status(400).json({ok:false,error:e.message});}});
app.get('/api/channels',async(req,res)=>{const key=typeof req.get('x-youtube-api-key')==='string'?req.get('x-youtube-api-key').trim():ENV_API_KEY; try{if(!key&&!cache.channels.length)throw new Error('No YouTube API key configured. Open /config.html.'); if(key)await refreshCache(key); res.set('Cache-Control','no-store'); res.json({ok:true,updatedAt:cache.updatedAt,refreshMs:REFRESH_MS,channels:cache.channels,configured:Boolean(key)});}catch(e){cache.error=e.message;if(cache.channels.length)return res.json({ok:true,stale:true,updatedAt:cache.updatedAt,refreshMs:REFRESH_MS,error:cache.error,channels:cache.channels});res.status(500).json({ok:false,error:cache.error});}});
app.get(/^(?!\/api(?:\/|$)).*/,(_req,res)=>res.sendFile(path.join(__dirname,'public','live.html')));
app.listen(PORT,()=>console.log(`[yt-tracker] listening on http://localhost:${PORT}`));
