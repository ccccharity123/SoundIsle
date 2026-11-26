import { icon } from './icons.js';
import { closeLibraryMenus, libraryButton, libraryMenu } from './ui-library.js';
import { refreshSelect } from './ui-select.js';
import { uiConfirm, uiPrompt, uiToast } from './ui-dialog.js';

export function mountCloud(content,shared,music){
  const document=content.ownerDocument,window=document.defaultView;
  const element=(tag,className,text)=>{
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text!==undefined)node.textContent=text;
    return node;
  };
  const root=element('section','cap-cloud-library cap-library-panel');
  root.hidden=true;
  content.append(root);
  const bar=element('div','cap-playlist-bar');
  const lists=element('div','cap-playlist-rail');
  lists.setAttribute('role','group');
  lists.setAttribute('aria-label','网易云歌单');
  const note=element('p','cap-library-status');
  note.setAttribute('role','status');
  const tracks=element('div','cap-library-scroll');
  const controls=element('div','cap-cloud-controls');
  const choices=element('div','cap-library-scroll cap-cloud-choices');
  const ostNote=element('p','cap-library-status','剧情原声带 · 默认关闭');
  bar.append(lists);
  root.append(bar,controls,choices,tracks,note,ostNote);
  controls.hidden=true;
  choices.hidden=true;
  ostNote.hidden=true;

  let busy=false,disposed=false,refreshOnShow=false,viewRevision=0;
  let selected=null,offset=0,rows=[],loaded=false;
  const button=(parent,label,fn)=>libraryButton(parent,label,()=>run(fn));
  const action=(label,fn,options)=>Object.assign({label,action:()=>run(fn)},options);
  const api=(p,m='GET',q={})=>shared.cloud.request('/playlist/'+p+'?'+new URLSearchParams(q),m);
  async function run(fn){
    if(busy||disposed)return;
    busy=true;
    note.textContent='同步中…';
    try{
      const pending=fn();
      if(pending&&typeof pending.then==='function')await pending;
      note.textContent='已同步';
    }catch(error){
      note.textContent='同步失败：'+error.message+'。请刷新确认云端实际状态。';
      uiToast('云端同步失败：'+error.message,{doc:document,kind:'error'});
    }finally{
      busy=false;
      if(refreshOnShow&&!root.hidden&&!disposed){
        refreshOnShow=false;
        void run(refresh);
      }
    }
  }
  function reset(){
    closeLibraryMenus(root);
    selected=null;
    rows=[];
    tracks.replaceChildren();
  }

  const prefKey='capricorn_cloud_selection_v1';
  let prefs={};
  try{prefs=JSON.parse(window.localStorage.getItem(prefKey)||'{}')||{}}catch{}
  let currentKey='',allLists=[],manage=false,draft=null;
  const mode=element('select');
  mode.dataset.capSelect='segment';
  mode.setAttribute('aria-label','网易云歌单导入方式');
  for(const [value,label] of [['none','不导入'],['select','选择性导入'],['all','全部导入']]){
    const option=element('option','',label);
    option.value=value;
    mode.append(option);
  }
  const search=element('input');
  search.placeholder='搜索歌单';
  search.setAttribute('aria-label','搜索网易云歌单');
  search.type='search';
  const pref=()=>prefs[currentKey]||{mode:'select',ids:[],created:[]};
  function store(value){
    window.localStorage.setItem(prefKey,JSON.stringify({...prefs,[currentKey]:value}));
    prefs[currentKey]=value;
  }
  function updateSelected(){
    for(const child of lists.children){
      if(child.tagName==='BUTTON')child.setAttribute('aria-pressed',String(!!selected&&child.dataset.playlist===String(selected.id)));
    }
  }
  function render(){
    if(root.hidden||disposed)return;
    closeLibraryMenus(root);
    const left=lists.scrollLeft,top=choices.scrollTop;
    lists.replaceChildren();
    choices.replaceChildren();
    controls.hidden=!manage;
    choices.hidden=!manage;
    tracks.hidden=manage;
    if(!currentKey)return;
    const p=pref(),c=manage?draft:p;
    mode.value=c.mode;
    refreshSelect(mode);
    const bound=new Set(Object.entries(bindings).filter(([k])=>{
      try{return JSON.stringify(JSON.parse(k).slice(0,2))===currentKey}catch{return false}
    }).map(([,v])=>String(v.id)));
    const pinned=new Set([...p.created,...bound]);
    const q=search.value.trim().toLowerCase();
    for(const item of allLists){
      const id=String(item.id);
      if(!manage&&!pinned.has(id)&&p.mode!=='all'&&!(p.mode==='select'&&p.ids.includes(id)))continue;
      if(manage&&q&&!String(item.name).toLowerCase().includes(q))continue;
      const label=String(item.name)+' · '+item.count+' 首'+(item.private?' · 私密':'')+(item.owned?'':' · 收藏');
      if(manage){
        const row=element('label','cap-cloud-choice');
        const checkbox=element('input');
        checkbox.type='checkbox';
        checkbox.checked=pinned.has(id)||c.mode==='all'||(c.mode==='select'&&c.ids.includes(id));
        checkbox.disabled=pinned.has(id)||c.mode!=='select';
        checkbox.onchange=()=>{c.ids=checkbox.checked?[...new Set([...c.ids,id])]:c.ids.filter(x=>x!==id)};
        row.append(checkbox,document.createTextNode(label+(pinned.has(id)?' · 声屿关联':'')));
        choices.append(row);
      }else{
        const pill=button(lists,label,()=>open(item));
        pill.className='cap-playlist-pill';
        pill.dataset.playlist=id;
        pill.title=label;
        pill.textContent='';
        pill.append(element('span','cap-playlist-name',item.name),element('small','',item.count));
      }
    }
    if(!manage&&!lists.children.length)lists.append(element('span','cap-library-empty','暂无歌单，可在歌单管理中选择导入。'));
    if(manage&&!choices.children.length)choices.append(element('p','cap-library-empty','没有匹配歌单'));
    updateSelected();
    lists.scrollLeft=left;
    choices.scrollTop=top;
  }
  const controlButtons=element('div','cap-cloud-control-actions');
  const searchWrap=element('div','cap-lib-search-wrap');
  const searchIco=element('span','cap-lib-search-icon');
  searchIco.innerHTML=icon('search',15);
  searchWrap.append(searchIco,search);
  controls.append(mode,searchWrap,controlButtons);
  mode.onchange=()=>{if(draft){draft.mode=mode.value;render()}};
  search.oninput=render;
  button(controlButtons,'全选搜索结果',()=>{
    draft.mode='select';
    const q=search.value.trim().toLowerCase();
    draft.ids=[...new Set([...draft.ids,...allLists.filter(x=>String(x.name).toLowerCase().includes(q)).map(x=>String(x.id))])];
    render();
  });
  button(controlButtons,'清空选择',()=>{draft.mode='select';draft.ids=[];render()});
  button(controlButtons,'保存导入设置',async()=>{
    const value=draft,c=shared.cloud.capture(),d=await c.request('/playlist/list?offset=0');
    if(JSON.stringify([c.base,d.uid])!==currentKey)throw Error('账号已切换，请刷新');
    store(value);
    manage=false;draft=null;
    reset();
    render();
  });
  button(controlButtons,'取消',()=>{manage=false;draft=null;render()});

  async function refresh(){
    const revision=viewRevision,c=shared.cloud.capture();
    const {uid,all}=await catalog(c);
    if(disposed||revision!==viewRevision)return;
    loaded=true;
    currentKey=JSON.stringify([c.base,uid]);
    allLists=all;
    if(revision!==viewRevision)return;
    manage=false;draft=null;
    reset();
    render();
  }
  async function open(p,more=false){
    const revision=viewRevision;
    if(!more){
      reset();
      selected=p;
      offset=0;
      updateSelected();
      for(let s=0;s<4;s++){
        const sk=element('div','cap-skeleton-row');
        sk.setAttribute('aria-hidden','true');
        sk.innerHTML='<span class="cap-sk-art"></span><span class="cap-sk-lines"><i></i><i></i></span>';
        tracks.append(sk);
      }
    }
    const d=await api('tracks','GET',{id:p.id,offset});
    if(revision!==viewRevision||disposed)return;
    const top=tracks.scrollTop;
    offset+=d.songs.length;
    rows.push(...d.songs);
    closeLibraryMenus(root);
    tracks.replaceChildren();
    const editable=d.owned&&!d.special;
    if(editable){
      const tools=element('div','cap-cloud-track-tools');
      tools.append(element('strong','',p.name));
      libraryMenu(tools,'云端歌单操作','more',{items:[
        action('改名',async()=>{
          const name=await uiPrompt('输入新的云端歌单名称：',p.name,{doc:document,title:'重命名歌单',placeholder:'歌单名称'});
          if(name?.trim()){await api('rename','POST',{id:p.id,name});await refresh()}
        }),
        action('搜索添加歌曲',async()=>{
          const q=await uiPrompt('输入歌曲名称或歌手关键词：','',{doc:document,title:'搜索云端歌曲',placeholder:'歌名或歌手'});
          if(!q?.trim())return;
          const result=await shared.cloud.request('/music/search?q='+encodeURIComponent(q));
          const n=await uiPrompt(result.songs.map((t,i)=>(i+1)+'. '+t.title+' — '+t.artists.join('/')).join('\n'),'1',{doc:document,title:'选择要添加的歌曲序号'});
          const t=result.songs[Number(n)-1];
          if(t&&await uiConfirm('将「'+t.title+'」添加到云端歌单？',{doc:document,title:'添加歌曲',confirmText:'添加'})){ uiToast('正在添加到云端歌单…',{doc:document});
            await api('change','POST',{id:p.id,op:'add',tracks:t.id});await open(p);
          }
        },{icon:'search'}),
        action('删除云端歌单',async()=>{
          if(await uiConfirm('将从网易云永久删除「'+p.name+'」，此操作无法撤销。',{doc:document,title:'删除云端歌单',danger:true,confirmText:'永久删除'})){ 
            await api('delete','POST',{id:p.id,confirm:p.id});await refresh();
          }
        },{icon:'trash',danger:true}),
      ]});
      tracks.append(tools);
    }
    const safeCover=url=>{try{if(!url)return '';const u=new URL(url);return ['https:','http:'].includes(u.protocol)?u.href.replace(/^http:/,'https:'):'';}catch{return '';}};
    for(const [index,t] of rows.entries()){
      const row=element('div','si-track');
      const play=button(row,t.title,()=>music.playCloud(rows,index,p.name));
      play.className='cap-track-title';
      play.textContent='';
      const art=element('span','cap-track-art');
      art.setAttribute('aria-hidden','true');
      const coverUrl=safeCover(t.cover||t.coverUrl);
      if(coverUrl){
        const img=element('img');
        img.loading='lazy';
        img.decoding='async';
        img.alt='';
        img.src=coverUrl;
        img.onerror=()=>{art.innerHTML=icon('music-note',16);};
        art.append(img);
      }else{
        art.innerHTML=icon('music-note',16);
      }
      const textWrap=element('span','cap-track-meta');
      textWrap.append(element('span','si-song',t.title),element('small','si-muted si-song',t.artists.join('/')));
      play.append(art,textWrap);
      const menu=libraryMenu(row,'歌曲操作','more',{items:[
        action('播放',()=>music.playCloud(rows,index,p.name),{icon:'play'}),
        ...(editable?[action('移除',async()=>{
          if(await uiConfirm('从云端歌单移除「'+t.title+'」？',{doc:document,title:'移除歌曲',danger:true,confirmText:'移除'})){ 
            await api('change','POST',{id:p.id,op:'del',tracks:t.id});
            await open(p);
          }
        },{icon:'trash',danger:true})]:[]),
      ]});
      menu.classList.add('cap-action-menu');
      tracks.append(row);
    }
    if(!rows.length)tracks.append(element('p','cap-library-empty','当前歌单没有歌曲'));
    if(d.more&&d.songs.length){const moreBtn=button(tracks,'加载更多歌曲',()=>open(p,true));moreBtn.className='cap-cloud-more';}
    tracks.scrollTop=top;
  }

  async function createPrivate(){
    const name=await uiPrompt('输入新建私密歌单名称：','',{doc:document,title:'新建私密歌单',placeholder:'歌单名称'});
    if(name?.trim()){
      await refresh();
      const d=await api('create','POST',{name});
      const p=pref();
      store({...p,created:[...new Set([...p.created,String(d.id)])]});
      await refresh();
    }
  }
  const create=libraryButton(bar,'新建私密歌单',()=>run(createPrivate),'plus');
  create.className='cap-library-icon';
  libraryMenu(bar,'网易云歌单管理','sliders-horizontal',{items:[
    action('刷新账号歌单',()=>refresh(),{icon:'refresh'}),
    action('管理导入',async()=>{
      const revision=viewRevision;
      await refresh();
      if(revision!==viewRevision||disposed)return;
      draft=JSON.parse(JSON.stringify(pref()));manage=true;search.value='';render();
    },{icon:'list'}),
    {heading:'剧情原声带'},
    action('创建角色私密原声带',()=>bind(true)),
    action('绑定已有私密歌单',()=>bind(false)),
    action('立即同步',()=>syncOst()),
    action('解除当前角色同步',async()=>{
      const r=role(),c=shared.cloud.capture(),{uid}=await catalog(c);
      delete bindings[bindingKey(c,uid,r)];
      persist();
      setOstNote('已解除绑定，云端歌单保留');
      await refresh();
    }),
  ]});

  const bindingsKey='capricorn_ost_bindings_v1';
  let bindings={};
  try{bindings=JSON.parse(window.localStorage.getItem(bindingsKey)||'{}')||{}}catch{}
  const persist=()=>window.localStorage.setItem(bindingsKey,JSON.stringify(bindings));
  function setOstNote(message){
    ostNote.hidden=false;
    ostNote.textContent=message;
  }
  const role=()=>{const r=music.rolePlaylist();if(!r)throw Error('当前没有角色歌单');return r};
  async function catalog(c){
    let offset=0,all=[],uid='';
    for(let i=0;i<100;i++){
      const d=await c.request('/playlist/list?offset='+offset);
      if(uid&&uid!==d.uid)throw Error('账号已切换');
      uid=d.uid;
      all.push(...d.lists);
      offset+=d.lists.length;
      if(!d.more||!d.lists.length)return {uid,all};
    }
    throw Error('歌单过多，请手动管理');
  }
  const bindingKey=(c,uid,r)=>JSON.stringify([c.base,uid,r.id]);
  async function bind(create){
    const r=role(),c=shared.cloud.capture(),{uid,all}=await catalog(c);
    let id;
    if(create){
      const name=await uiPrompt('输入角色私密原声带名称：','声屿 · 剧情原声带',{doc:document,title:'创建角色私密原声带'});
      if(!name?.trim()||!await uiConfirm('创建私密歌单并自动上传当前角色已匹配的歌曲？',{doc:document,title:'确认同步',confirmText:'创建并同步'}))return;
      id=(await c.request('/playlist/create?'+new URLSearchParams({name}),'POST')).id;
    }else{
      const options=all.filter(p=>p.private&&p.owned&&!p.special);
      const n=await uiPrompt('输入要绑定的私密歌单编号：\n'+options.map((p,i)=>(i+1)+'. '+p.name).join('\n'),'',{doc:document,title:'绑定已有私密歌单',placeholder:'输入序号'});
      if(n===null)return;
      id=options[Number(n)-1]?.id;
      if(!id||!await uiConfirm('绑定此歌单并自动上传当前角色已匹配的歌曲？',{doc:document,title:'确认绑定',confirmText:'绑定并同步'}))return;
    }
    if(!/^\d{1,20}$/.test(id||''))throw Error('未取得歌单ID');
    bindings[bindingKey(c,uid,r)]={id,done:[]};
    persist();
    setOstNote('已开启剧情原声带同步');
    await syncOst();await refresh();
  }
  async function syncOst(){
    const r=music.rolePlaylist();
    if(!r||!shared.cloud||!Object.keys(bindings).length)return;
    const c=shared.cloud.capture();
    if(!Object.keys(bindings).some(k=>{try{const a=JSON.parse(k);return a[0]===c.base&&a[2]===r.id}catch{return false}}))return;
    const {uid,all}=await catalog(c),b=bindings[bindingKey(c,uid,r)];
    if(!b)return;
    const target=all.find(p=>p.id===b.id&&p.private&&p.owned&&!p.special);
    if(!target)throw Error('绑定歌单已不存在或不再私密');
    const ids=[...new Set(r.songs.map(t=>String(t.neteaseId||'')).filter(x=>/^\d{1,20}$/.test(x)))].filter(x=>!b.done.includes(x));
    if(!ids.length)return;
    let offset=0,existing=new Set();
    for(let i=0;i<200;i++){
      const d=await c.request('/playlist/tracks?'+new URLSearchParams({id:b.id,offset}));
      if(!d.owned||d.special)throw Error('歌单权限已改变');
      d.songs.forEach(t=>existing.add(String(t.id)));
      offset+=d.songs.length;
      if(!d.more||!d.songs.length)break;
      if(i===199)throw Error('歌单过大');
    }
    const batch=ids.slice(0,50),add=batch.filter(x=>!existing.has(x));
    if(add.length){
      const check=await c.request('/playlist/list?offset=0');
      if(check.uid!==uid)throw Error('账号已切换');
      await c.request('/playlist/change?'+new URLSearchParams({id:b.id,op:'add',tracks:add.join(',')}),'POST');
    }
    b.done=[...new Set([...b.done,...batch])];
    persist();
    setOstNote('原声带已同步 '+batch.length+' 首（含已存在歌曲）');
  }
  const timer=window.setInterval(()=>{
    if(busy||document.hidden||!shared.accountReady?.())return;
    void run(async()=>{
      try{await syncOst()}catch(error){setOstNote('原声带同步暂停：'+error.message)}
    });
  },120000);
  return {
    show(){
      if(!root.hidden||disposed)return;
      root.hidden=false;
      if(loaded){render();return;}
      if(busy)refreshOnShow=true;
      else void run(refresh);
    },
    hide(){
      if(root.hidden)return;
      root.hidden=true;
      closeLibraryMenus(root);
    },
    invalidate(){
      viewRevision++;
      loaded=false;currentKey='';allLists=[];manage=false;draft=null;
      reset();lists.replaceChildren();choices.replaceChildren();
      if(!root.hidden&&shared.accountReady?.()){
        if(busy)refreshOnShow=true;else void run(refresh);
      }
    },
    destroy(){
      disposed=true;
      viewRevision++;
      window.clearInterval(timer);
      closeLibraryMenus(root);
      root.remove();
    },
  };
}
