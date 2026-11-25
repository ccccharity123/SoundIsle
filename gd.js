// Public, opt-in, Netease-source adapter. No gateway credentials are sent.
export function mountGD(){
 const base='https://music-api.gdstudio.xyz/api.php', cache=new Map(), times=[];
 const picIds=new Map();
 async function get(type,args,signal){
   if(signal?.aborted)throw new DOMException('请求已取消','AbortError');
   const url=base+'?'+new URLSearchParams({types:type,source:'netease',...args});
   const old=cache.get(url);
   if(old&&old.until>Date.now())return old.data;
   while(times.length&&times[0]<Date.now()-300000)times.shift();
   if(times.length>=45)throw Error('GD 音源请求较多，请稍后重试');
   times.push(Date.now());
   const response=await fetch(url,{signal,credentials:'omit',referrerPolicy:'no-referrer'});
   if(!response.ok)throw Error('GD HTTP '+response.status);
   const data=await response.json();
   if(signal?.aborted)throw new DOMException('请求已取消','AbortError');
   if(cache.size>=300)cache.delete(cache.keys().next().value);
   cache.set(url,{data,until:Date.now()+(type==='url'?30000:600000)});
   return data;
 }
 const https=x=>{try{const u=new URL(x);return u.protocol==='https:'?u.href:''}catch{return ''}};
 return {ready:()=>true,async get(path,signal){const u=new URL(path,'https://local.invalid'),id=u.searchParams.get('id');switch(u.pathname){case '/music/search':{const rows=await get('search',{name:u.searchParams.get('q'),count:20,pages:1},signal);return {songs:(Array.isArray(rows)?rows:[]).filter(x=>x.source==='netease'||!x.source).map(x=>{if(x.pic_id){if(picIds.size>=500)picIds.delete(picIds.keys().next().value);picIds.set(String(x.id),String(x.pic_id))}return {id:String(x.id),title:x.name,artists:Array.isArray(x.artist)?x.artist:[x.artist||''],album:x.album,cover:''}})}}case '/music/detail':{const pic=picIds.get(id);if(!pic)return {};const d=await get('pic',{id:pic,size:300},signal);return {cover:https(d.url)}}case '/music/lyric':{const d=await get('lyric',{id},signal);return {lyric:d.lyric||'',translation:d.tlyric||''}}case '/music/url':{const level=u.searchParams.get('level'),br=({jymaster:999,sky:999,jyeffect:999,hires:999,lossless:999,exhigh:320,higher:192,standard:128})[level]||320;const d=await get('url',{id,br},signal);const url=https(d.url);return {available:!!url,url,level:d.br?String(d.br)+'K':level,reason:url?'':'无可用 HTTPS 音源'}}default:throw Error('GD 不支持该操作')}}};
}
