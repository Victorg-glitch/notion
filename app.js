"use strict";
const NC_CONFIG = window.NC_CONFIG || {};
const SUPA_URL = NC_CONFIG.SUPA_URL || 'https://wmglywfsrlcpsspouufp.supabase.co';
const SUPA_KEY = NC_CONFIG.SUPA_KEY || 'sb_publishable_X6xbf9gD2JxmBXxthWG6lQ_gM5hvxeW';
const WEB_PUSH_PUBLIC_KEY = NC_CONFIG.WEB_PUSH_PUBLIC_KEY || 'BAXYgFpb56ooYOLihzUYKchPIzfXgyQyJxNfI8jUavmH9-AuVvUcbMse8Bdv_0juXpC69b1SkM1q3WenhhVtzmM'; // VAPID public key para notificacoes com o site fechado.
const AUTH_STORAGE_MODE = NC_CONFIG.AUTH_STORAGE === 'local' ? 'local' : 'session';
function authStorageArea(){
  return AUTH_STORAGE_MODE === 'local' ? localStorage : sessionStorage;
}
const ncAuthStorage = {
  getItem(key){ return authStorageArea().getItem(key); },
  setItem(key,value){ authStorageArea().setItem(key,value); },
  removeItem(key){ authStorageArea().removeItem(key); }
};
let sb;
try {
  if(!window.supabase) throw new Error('Supabase SDK nao carregou');
  sb = supabase.createClient(SUPA_URL, SUPA_KEY, {
    auth:{
      storage:ncAuthStorage,
      persistSession:true,
      autoRefreshToken:true,
      detectSessionInUrl:true
    }
  });
} catch(e) {
  console.error('Supabase init failed:', e);
}

let PROFILES = NC_CONFIG.PROFILES || {
  victor: {name:'VICTOR', avatar:'🔴', color:'var(--y)', role:'NETRUNNER'},
  caio:   {name:'CAIO',   avatar:'🔵', color:'var(--c)', role:'CORPO'}
};
const LEGACY_PROFILE_IDS = Object.keys(PROFILES);
const ACCOUNT_LIMIT = Number(NC_CONFIG.ACCOUNT_LIMIT || 5);
const CREATOR_EMAILS = new Set((NC_CONFIG.CREATOR_EMAILS || ['victorgabrilvc@gmail.com']).map(e=>String(e).trim().toLowerCase()).filter(Boolean));

let me=null, viewFriend=false, myData={}, friendData={};
let selProfile=null, isNewUser=false;
let reminders={}, reminderTimer=null;
let currentTheme='arasaka';
let motionMode='low';
let authFormMode='login';
let friendPanelTab='friends';
let friendSuggestions=[];
let friendSuggestionsLoaded=false;
let friendMessageChannel=null;
let friendMessageChannelId='';
let friendMessagePollTimer=null;
let _lastTier=null;
let _lastSaveTs=null;
let _sessionStartCred=null;
let _taskFilter='all';
let _taskSortMode='smart';
const _pendingConfirm=new Map();
let _todayModeInit=false;
let _taskListHome=null;
let _missionOffset=0;

function displayNameFromEmail(email){
  const raw=String(email||'').split('@')[0]||'OPERADOR';
  return raw.replace(/[._-]+/g,' ').trim().slice(0,24) || 'OPERADOR';
}

function isCreatorEmail(email){
  return CREATOR_EMAILS.has(String(email||'').trim().toLowerCase());
}

function profileEmail(username){
  return String(PROFILES[username]?.email || (typeof savedProfileAuthEmail==='function' ? savedProfileAuthEmail(username) : '') || '').trim().toLowerCase();
}

function isCreatorUser(username=me){
  return isCreatorEmail(profileEmail(username));
}

function userRole(username=me){
  return isCreatorUser(username) ? 'CRIADOR' : 'USUARIO';
}

function userDisplayLabel(username=me){
  const p=PROFILES[username] || {};
  return ((p.name || displayNameFromEmail(username)).toUpperCase())+' // '+userRole(username);
}

function setRuntimeProfile(username, profile={}){
  if(!username)return null;
  const fallbackName=displayNameFromEmail(profile.email || username);
  const name=String(profile.name || profile.display_name || fallbackName).trim().slice(0,24) || fallbackName;
  const email=String(profile.email || PROFILES[username]?.email || '').trim().toLowerCase();
  PROFILES[username]={
    name:name.toUpperCase(),
    avatar:profile.avatar || '◎',
    email,
    color:profile.color || 'var(--c)',
    role:isCreatorEmail(email) ? 'CRIADOR' : (profile.role || 'USUARIO')
  };
  return PROFILES[username];
}

const SAVE_KEYS=[
  'tasks','habits','books','projects','devlog','guitarlog','games','reflexoes',
  'skills','taskDefs','habitDefs','routines','skillDefs','guitarSkillDefs',
  'districts','friendRequests','friendPermissions','friendTarget','friendTargets','profile','lastSeenWeek','goals','reminders','customPages','pageObjectives','dailyReviews','activityHistory','achievements','prefs','quests','weeklyChallenges',
  'eddies','eddiesDaily','streakShields','shieldMilestones','loginState','lootState','shopUnlocks','equippedCosmetics','wrappedSeen','seasonData'
];

// Data access
function ensureDb(){
  if(!sb) throw new Error('Supabase indisponivel. Recarregue a pagina e tente novamente.');
}
async function dbGet(username){
  ensureDb();
  if(!String(username||'').trim()) throw new Error('Perfil invalido');
  const {data,error}=await sb.from('user_data').select('data_key,data_value').eq('username',username);
  if(error) throw error;
  const out={};(data||[]).forEach(r=>out[r.data_key]=r.data_value);return out;
}
async function dbSet(username,key,value){
  ensureDb();
  if(!String(username||'').trim()) throw new Error('Perfil invalido');
  const {error}=await sb.from('user_data').upsert({username,data_key:key,data_value:value,updated_at:new Date().toISOString()},{onConflict:'username,data_key'});
  if(error) throw error;
}
// Grava varias chaves em uma unica requisicao (atomica do lado do cliente).
async function dbSetMany(username,entries){
  ensureDb();
  if(!String(username||'').trim()) throw new Error('Perfil invalido');
  const now=new Date().toISOString();
  const rows=entries.map(([key,value])=>({username,data_key:key,data_value:value,updated_at:now}));
  if(!rows.length)return;
  const {error}=await sb.from('user_data').upsert(rows,{onConflict:'username,data_key'});
  if(error) throw error;
}

// Password and session
async function hashPwd(pwd){
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(pwd+':night_city_salt'));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

const SESSION_KEY='nc_session_v2';
function sessionStorageArea(){ return sessionStorage; }
function saveSession(u){ sessionStorageArea().setItem(SESSION_KEY,JSON.stringify({username:u,savedAt:Date.now()})); }
function loadSession(){
  const raw=sessionStorageArea().getItem(SESSION_KEY);
  if(!raw)return null;
  try{
    const parsed=JSON.parse(raw);
    return parsed && PROFILES[parsed.username] ? parsed.username : null;
  }catch(e){
    return PROFILES[raw] ? raw : null;
  }
}
function clearSession(){ sessionStorageArea().removeItem(SESSION_KEY); }

const THEMES=NC_CONFIG.THEMES || {
  arasaka:{label:'Arasaka amarelo',y:'#fcee09',r:'#e00f3a',c:'#00d4ff',p:'#b44fff'},
  netrunner:{label:'Netrunner azul',y:'#00d4ff',r:'#ff2d55',c:'#7df9ff',p:'#b44fff'},
  maelstrom:{label:'Maelstrom vermelho',y:'#ff1744',r:'#ff003c',c:'#00d4ff',p:'#b44fff'},
  corpo:{label:'Corpo roxo',y:'#b44fff',r:'#e00f3a',c:'#00d4ff',p:'#d46bff'}
};
const THEME_COPY={
  arasaka:{boot:'// ARASAKA LIFE OS v2.077 - CONTRACT MODE',save:'SALVAR',saving:'SALVANDO...',saved:'SALVO ✓',review:'SALVAR REVISAO'},
  netrunner:{boot:'// NETRUNNER ICEBREAKER - JACK IN',save:'GRAVAR NO ICE',saving:'GRAVANDO...',saved:'ICE GRAVADO ✓',review:'FECHAR RUN'},
  maelstrom:{boot:'// MAELSTROM GRID - RUNS ATIVAS',save:'QUEIMAR SAVE',saving:'QUEIMANDO...',saved:'RUN SELADA ✓',review:'SELAR DIA'},
  corpo:{boot:'// CORPO OPS - RELATORIO EXECUTIVO',save:'ARQUIVAR DADOS',saving:'ARQUIVANDO...',saved:'DOSSIER OK ✓',review:'ENVIAR RELATORIO'}
};
function themeCopy(key){return (THEME_COPY[currentTheme]||THEME_COPY.arasaka)[key] || THEME_COPY.arasaka[key];}
function themeKey(){return 'nc_theme_v1_'+(me||'anon');}
function applyTheme(id){
  const theme=THEMES[id]||THEMES.arasaka;
  currentTheme=THEMES[id]?id:'arasaka';
  Object.entries(theme).forEach(([k,v])=>{if(k!=='label')document.documentElement.style.setProperty('--'+k,v);});
  const sel=document.getElementById('theme-select');
  if(sel)sel.textContent=currentTheme.toUpperCase();
  const msel=document.getElementById('theme-select-mobile');
  if(msel)msel.value=currentTheme;
  document.querySelectorAll('.theme-options button').forEach(btn=>btn.classList.toggle('active',btn.dataset.theme===currentTheme));
  updateThemeCopy();
}
function updateThemeCopy(){
  const pre=document.querySelector('#page-home .h-pre');
  if(pre)pre.textContent=themeCopy('boot');
  const save=document.getElementById('nav-sync');
  if(save && !save.classList.contains('saving') && !save.classList.contains('saved') && !save.classList.contains('error'))save.textContent=themeCopy('save');
  const review=document.getElementById('daily-review-save');
  if(review)review.textContent=themeCopy('review');
}
function loadTheme(){
  const saved=localStorage.getItem(themeKey())||localStorage.getItem('nc_theme_v1_anon')||'arasaka';
  applyTheme(saved);
}
function setTheme(id){
  applyTheme(id);
  localStorage.setItem(themeKey(),currentTheme);
  if(!me)localStorage.setItem('nc_theme_v1_anon',currentTheme);
}

function toggleThemeMenu(){
  document.getElementById('theme-menu')?.classList.toggle('open');
}

function closeThemeMenu(){
  document.getElementById('theme-menu')?.classList.remove('open');
}

function chooseTheme(id){
  setTheme(id);
  closeThemeMenu();
}

document.addEventListener('click',e=>{
  const menu=document.getElementById('theme-menu');
  if(menu && !menu.contains(e.target))menu.classList.remove('open');
});

function motionKey(){return 'nc_motion_v1_'+(me||'anon');}
function applyMotionMode(mode){
  motionMode=['high','low','off'].includes(mode)?mode:'low';
  document.body.classList.remove('motion-high','motion-low','motion-off');
  document.body.classList.add('motion-'+motionMode);
  const sel=document.getElementById('motion-select');
  if(sel)sel.value=motionMode;
}
function loadMotionMode(){
  applyMotionMode(localStorage.getItem(motionKey())||localStorage.getItem('nc_motion_v1_anon')||'low');
}
function setMotionMode(mode){
  applyMotionMode(mode);
  localStorage.setItem(motionKey(),motionMode);
  if(!me)localStorage.setItem('nc_motion_v1_anon',motionMode);
}

const DEFAULT_REMINDERS=[
  {id:'leitura',name:'Leitura',time:'22:00',enabled:false,message:'Hora da leitura. Fecha o dia com 30 minutos.'},
  {id:'violao',name:'Violao',time:'19:00',enabled:false,message:'Hora do violao. Mantem a streak viva.'},
  {id:'treino',name:'Treino',time:'17:30',enabled:false,message:'Hora do treino. Contrato fisico do dia.'},
  {id:'dev',name:'Dev',time:'17:00',enabled:false,message:'Hora do dev. Entra no modo netrunner.'}
];
function remindersKey(){return 'nc_reminders_v1_'+(me||'anon');}
function reminderSentKey(){return 'nc_reminder_sent_v1_'+(me||'anon');}
function cloneDefaultReminders(){return JSON.parse(JSON.stringify(DEFAULT_REMINDERS));}
function normalizeReminder(r){
  return {id:r.id,name:r.name,time:r.time||'00:00',enabled:!!r.enabled,message:r.message||''};
}
function serializedReminders(){
  const out={};
  Object.values(reminders||{}).forEach(r=>{out[r.id]=normalizeReminder(r);});
  return out;
}
function loadReminders(){
  const defaults=cloneDefaultReminders();
  try{
    const saved=myData.reminders || JSON.parse(localStorage.getItem(remindersKey())||'{}');
    reminders={};
    defaults.forEach(r=>reminders[r.id]=normalizeReminder({...r,...(saved[r.id]||{})}));
  }catch(e){
    reminders={};defaults.forEach(r=>reminders[r.id]=normalizeReminder(r));
  }
  myData.reminders=serializedReminders();
}
function saveReminders(){
  myData.reminders=serializedReminders();
  if(me)localStorage.setItem(remindersKey(),JSON.stringify(myData.reminders));
  scheduleAutoSave();
}
function getReminderSent(){
  try{return JSON.parse(localStorage.getItem(reminderSentKey())||'{}');}catch(e){return {};}
}
function setReminderSent(id,day){
  const sent=getReminderSent();
  sent[id]=day;
  localStorage.setItem(reminderSentKey(),JSON.stringify(sent));
}
function clearReminderSent(id){
  const sent=getReminderSent();
  delete sent[id];
  localStorage.setItem(reminderSentKey(),JSON.stringify(sent));
}

function localDateKey(date=new Date()){
  const y=date.getFullYear();
  const m=String(date.getMonth()+1).padStart(2,'0');
  const d=String(date.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+d;
}

function confirmDanger(message){
  const modal=document.getElementById('danger-confirm');
  const msg=document.getElementById('danger-confirm-message');
  const ok=document.getElementById('danger-confirm-ok');
  const cancel=document.getElementById('danger-confirm-cancel');
  const text=message || 'Confirmar esta acao?';
  if(!modal || !msg || !ok || !cancel) return Promise.resolve(window.confirm(text));
  msg.textContent=text;
  modal.hidden=false;
  modal.classList.add('on');
  return new Promise(resolve=>{
    let settled=false;
    const finish=value=>{
      if(settled)return;
      settled=true;
      ok.removeEventListener('click',onOk);
      cancel.removeEventListener('click',onCancel);
      modal.removeEventListener('click',onBackdrop);
      document.removeEventListener('keydown',onKey);
      modal.classList.remove('on');
      modal.hidden=true;
      resolve(value);
    };
    const onOk=()=>finish(true);
    const onCancel=()=>finish(false);
    const onBackdrop=e=>{if(e.target===modal)finish(false);};
    const onKey=e=>{if(e.key==='Escape')finish(false);};
    ok.addEventListener('click',onOk);
    cancel.addEventListener('click',onCancel);
    modal.addEventListener('click',onBackdrop);
    document.addEventListener('keydown',onKey);
    setTimeout(()=>ok.focus(),30);
  });
}

function pendingSaveKey(){
  return 'nc_pending_save_v1_'+(me||'anon');
}

function storePendingLocalSave(error){
  if(!me)return;
  try{
    const data={};
    SAVE_KEYS.forEach(k=>{data[k]=myData[k] ?? null;});
    localStorage.setItem(pendingSaveKey(),JSON.stringify({
      savedAt:new Date().toISOString(),
      reason:error?.message || String(error||'Falha no Supabase'),
      data
    }));
  }catch(e){}
}

function clearPendingLocalSave(){
  if(me)localStorage.removeItem(pendingSaveKey());
}

function hasPendingLocalSave(){
  return !!(me && localStorage.getItem(pendingSaveKey()));
}

function readPendingLocalSave(){
  if(!me)return null;
  try{
    const raw=localStorage.getItem(pendingSaveKey());
    return raw ? JSON.parse(raw) : null;
  }catch(e){
    return null;
  }
}

async function retryPendingLocalSave(silent=false){
  if(!me || RO())return false;
  const pending=readPendingLocalSave();
  if(!pending || !pending.data){
    if(!silent)showCyberToast('NADA PENDENTE','Nao existe salvamento local aguardando reenvio.');
    renderSystemStatus();
    return false;
  }
  try{
    await Promise.all(SAVE_KEYS.map(k=>dbSet(me,k,pending.data[k] ?? null)));
    SAVE_KEYS.forEach(k=>{myData[k]=pending.data[k] ?? null;});
    clearPendingLocalSave();
    localStorage.setItem(lastSaveKey(),new Date().toISOString());
    applyData();
    if(!silent)showCyberToast('SAVE REENVIADO','A fila local foi sincronizada com o Supabase.',6200);
    return true;
  }catch(e){
    if(!silent)showCyberToast('REENVIO FALHOU',e.message||'Supabase ainda indisponivel.',6800);
    renderSystemStatus();
    return false;
  }
}

function updateCurrentDate(){
  const now=new Date();
  const el=document.getElementById('current-date');
  if(el) el.textContent=dias[now.getDay()].toUpperCase()+', '+now.getDate()+' '+meses[now.getMonth()]+' '+now.getFullYear()+' - '+String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
}

function clearFriendUi(){
  viewFriend=false;
  friendData={};
  document.body.classList.remove('friend-view');
  const fb=document.getElementById('friend-banner');if(fb){fb.className='friend-view-global';fb.innerHTML='';}
  const rb=document.getElementById('request-banner');if(rb){rb.className='request-global';rb.innerHTML='';}
  const nf=document.getElementById('nav-friend');if(nf)nf.textContent='CHAT';
  const mf=document.getElementById('mob-friend');if(mf)mf.textContent='CHAT';
}

function setupHomeSideMenu(){
  const layout=document.querySelector('#page-home .home-layout');
  const drawer=document.getElementById('home-drawer-body');
  if(!layout || !drawer || drawer.dataset.ready)return;
  const cards=[...layout.children].filter(el=>el.classList && el.classList.contains('card'));
  const modules=[
    {idx:2,key:'notificacoes',name:'Central de notificacoes',color:'var(--c)'},
    {idx:3,key:'habits',name:'Habits tracker',color:'var(--c)'},
    {idx:4,key:'consistencia',name:'Painel de consistencia',color:'var(--c)'},
    {idx:6,key:'rotinas',name:'Routines',color:'var(--y)'},
    {idx:7,key:'distritos',name:'Distritos',color:'var(--p)'},
    {idx:8,key:'loja',name:'Loja // Black Market',color:'var(--y)'}
  ];
  const store=document.createElement('div');
  store.id='home-module-store';
  store.hidden=true;
  document.body.appendChild(store);
  const screen=document.createElement('div');
  screen.id='home-module-screen';
  screen.className='home-module-screen';
  screen.innerHTML='<div class="home-module-frame"><div class="home-module-head"><div><div class="home-module-kicker">// SIDE DECK MODULE //</div><div class="home-module-title" id="home-module-title">MODULO</div></div><button class="home-module-close" onclick="closeHomeModule()">FECHAR</button></div><div class="home-module-body" id="home-module-body"></div></div>';
  document.body.appendChild(screen);
  modules.forEach((m,n)=>{
    const card=cards[m.idx];
    if(!card)return;
    card.dataset.homeModule=m.key;
    card.dataset.homeModuleName=m.name;
    store.appendChild(card);
    drawer.insertAdjacentHTML('beforeend',`<button class="home-module-tab" style="--tab:${m.color}" onclick="openHomeModule('${m.key}')"><span>0${n+1}</span><b>${m.name}</b></button>`);
  });
  drawer.insertAdjacentHTML('beforeend',`<button class="home-module-tab" style="--tab:var(--p)" onclick="openSettingsModule()"><span>CFG</span><b>Configuracoes</b></button>`);
  drawer.dataset.ready='1';
  renderHomeQuickbar();
}

function renderHomeQuickbar(){
  const next=document.getElementById('home-next-alert');
  const count=document.getElementById('home-module-count');
  const top=document.getElementById('home-top-streak');
  const rank=document.getElementById('home-street-rank');
  const alert=nextReminderText();
  if(next)next.textContent=alert==='--'?'NENHUM ALERTA ATIVO':alert;
  if(count){
    const modules=document.querySelectorAll('#home-drawer-body .home-module-tab').length;
    count.textContent=String(modules).padStart(2,'0')+' MODULOS';
  }
  const streak=topStreakInfo();
  if(top){
    if(streak.days){
      const risk=habitStreakAtRisk(habitDataWithLiveWeek(),streak.name);
      top.textContent=`${streak.days} DIAS - ${streak.name}`+(risk?' (MANTENHA HOJE)':'');
      top.classList.toggle('streak-risk',risk);
    }else{
      top.textContent='SEM STREAK';
      top.classList.remove('streak-risk');
    }
  }
  if(rank){
    const prog=streetCredProgress(streetCredScore());
    rank.textContent=prog.max?`${prog.rank} - MAX`:`${prog.rank} - ${prog.into}/${prog.span} p/ ${prog.next}`;
  }
  const e=document.getElementById('home-eddies');
  if(e)e.textContent='€$'+(D().eddies||0);
}

function toggleHomeMenu(open){
  document.body.classList.toggle('home-menu-open',!!open);
}

function openHomeModule(key){
  const screen=document.getElementById('home-module-screen');
  const body=document.getElementById('home-module-body');
  const title=document.getElementById('home-module-title');
  if(!screen || !body)return;
  closeHomeModule(false);
  if(key==='notificacoes'){
    const page=document.getElementById('page-notificacoes');
    if(!page)return;
    body.dataset.sourcePage='page-notificacoes';
    [...page.children].forEach(el=>body.appendChild(el));
    if(title)title.textContent='Central de notificacoes';
    renderReminders();
  }else{
    const card=document.querySelector(`[data-home-module="${key}"]`);
    if(!card)return;
    body.appendChild(card);
    if(title)title.textContent=card.dataset.homeModuleName || 'MODULO';
  }
  toggleHomeMenu(false);
  document.body.classList.add('home-module-open');
  screen.classList.add('on');
}

function openSettingsModule(){
  const screen=document.getElementById('home-module-screen');
  const body=document.getElementById('home-module-body');
  const title=document.getElementById('home-module-title');
  if(!screen || !body)return;
  closeHomeModule(false);
  body.dataset.generated='settings';
  body.innerHTML=`
    <div class="settings-center">
      <div class="settings-intro">
        <span>// CENTRAL DE CONFIGURACOES //</span>
        <b>Edite o sistema por area sem procurar cada bloco manualmente.</b>
      </div>
      <div class="settings-motion">
        <label>
          <span>MOVIMENTO DO HUD</span>
          <select id="motion-select" onchange="setMotionMode(this.value)">
            <option value="high">Alta</option>
            <option value="low">Baixa</option>
            <option value="off">Desligada</option>
          </select>
        </label>
        <label>
          <span>SOM / FEEDBACK</span>
          <select id="sound-select" onchange="setSoundPref(this.value)">
            <option value="on">Ligado</option>
            <option value="off">Mudo</option>
          </select>
        </label>
      </div>
      <div class="settings-backup">
        <span>BACKUP DE DADOS</span>
        <div class="settings-backup-actions">
          <button type="button" class="btn btn-c" onclick="downloadBackup()">EXPORTAR JSON</button>
          <button type="button" class="btn" onclick="triggerImportBackup()">IMPORTAR JSON</button>
        </div>
      </div>
      <div class="settings-grid">
        ${settingsButton('homeTasks','Contratos do dia','Editar tarefas marcaveis da Home','var(--y)')}
        ${settingsButton('homeGoals','Intel e metas','Editar metas globais e fallbacks','var(--r)')}
        ${settingsButton('routines','Rotinas','Editar blocos e passos de rotina','var(--y)')}
        ${settingsButton('districts','Distritos','Editar abas, icones, cores e links','var(--p)')}
        ${settingsButton('notifications','Notificacoes','Permissoes, lembretes, Web Push e backup','var(--c)')}
        ${settingsButton('devSkills','Skills Dev','Editar nomes e niveis maximos','var(--c)')}
        ${settingsButton('guitarSkills','Tecnicas Violao','Editar tecnicas e niveis','var(--r)')}
        ${settingsButton('customPages','Paginas custom','Editar objetivos de treino, financas e extras','var(--p)')}
      </div>
    </div>`;
  if(title)title.textContent='Configuracoes';
  toggleHomeMenu(false);
  document.body.classList.add('home-module-open');
  screen.classList.add('on');
  applyMotionMode(motionMode);
  const soundSel=document.getElementById('sound-select');
  if(soundSel)soundSel.value=soundEnabled()?'on':'off';
  enhanceClickableControls();
}

function setSoundPref(mode){
  myData.prefs={...(myData.prefs||{}),sound:mode!=='off',haptics:mode!=='off'};
  if(mode!=='off')fxBlip('tick');
  scheduleAutoSave();
}

function settingsButton(action,title,desc,color){
  return `<button class="settings-tile" style="--set:${color}" onclick="runSettingsAction('${action}')"><span>${htmlEscape(title)}</span><b>${htmlEscape(desc)}</b></button>`;
}

function runSettingsAction(action){
  closeHomeModule();
  const later=fn=>setTimeout(fn,80);
  if(action==='homeTasks'){goPage('home');later(toggleEditTasks);return;}
  if(action==='homeGoals'){goPage('home');later(toggleEditGoals);return;}
  if(action==='routines'){goPage('home');later(()=>{openHomeModule('rotinas');setTimeout(toggleEditRoutines,80);});return;}
  if(action==='districts'){goPage('home');later(()=>{openHomeModule('distritos');setTimeout(toggleEditDistricts,80);});return;}
  if(action==='notifications'){goPage('notificacoes');return;}
  if(action==='devSkills'){goPage('dev');later(()=>toggleEditSkillDefs('dev'));return;}
  if(action==='guitarSkills'){goPage('violao');later(()=>toggleEditSkillDefs('guitar'));return;}
  if(action==='customPages'){goPage('treino');return;}
}

function closeHomeModule(closeBodyClass=true){
  const screen=document.getElementById('home-module-screen');
  const body=document.getElementById('home-module-body');
  const store=document.getElementById('home-module-store');
  if(body?.dataset.generated){
    body.innerHTML='';
    delete body.dataset.generated;
  }
  if(body && store){
    const target=body.dataset.sourcePage ? document.getElementById(body.dataset.sourcePage) : store;
    [...body.children].forEach(el=>(target||store).appendChild(el));
    delete body.dataset.sourcePage;
  }
  if(screen)screen.classList.remove('on');
  if(closeBodyClass)document.body.classList.remove('home-module-open');
}

function unlockApp(username,data){
  me=username;
  myData=data||{};
  if(myData.profile?.name) setRuntimeProfile(me,{name:myData.profile.name,avatar:myData.profile.avatar,role:myData.profile.status});
  document.body.classList.remove('auth-checking');
  clearFriendUi();
  loadTheme();
  loadMotionMode();
  loadReminders();
  document.getElementById('login-screen').style.display='none';
  document.getElementById('nav-user').textContent=userDisplayLabel(me);
  const mu=document.getElementById('mob-user');if(mu)mu.textContent=userDisplayLabel(me);
  ensurePageObjectivesData();
  ensureCustomPagesData();
  ensureRetentionData();
  applyData(); updateStats(); updateCurrentDate(); renderFriendRequests(); renderReminders(); startReminderEngine();
  handleWeeklyRollover();
  setProfileSetupHint(needsAccountSetup());
  if(needsAccountSetup())setTimeout(openSetupWizard,650);
  upsertPublicFriendProfile();
  if(hasPendingLocalSave()) setTimeout(()=>retryPendingLocalSave(true),900);
  setTimeout(bootLore,700);
}

const BOOT_LORE=[
  'Acordando em Night City. Os neons nunca dormem.',
  'Conexao com a rede Arasaka estabelecida. Bem-vindo de volta, runner.',
  'O dia em Night City comeca agora. Cumpra seus contratos.',
  'Sistema online. A cidade observa quem mantem a rotina.',
  'Jack in completo. Hora de transformar intencao em acao.'
];
function bootLore(){
  if(!me || RO())return;
  const line=BOOT_LORE[Math.floor(Math.random()*BOOT_LORE.length)];
  showCyberToast('NIGHT CITY',line,5200);
}

function needsAccountSetup(){
  if(!me || RO())return false;
  return !myData.profile || !myData.profile.setupDone || !myData.profile.name;
}

function openAccountSetup(){
  if(!me || RO())return;
  renderFriendChat(null,'Configure seu perfil publico e, se quiser, cole o ID do amigo.');
}

function setProfileSetupHint(active){
  const btn=document.getElementById('nav-profile');
  if(btn){
    btn.classList.toggle('needs-setup',!!active);
    btn.title=active?'Configure seu perfil publico':'Abrir perfil publico';
  }
}

function setupDistrictDefaults(){
  const base=[
    {page:'notificacoes',label:'Notificacoes',checked:true},
    {page:'leitura',label:'Leitura',checked:true},
    {page:'dev',label:'Dev',checked:true},
    {page:'violao',label:'Violao',checked:true},
    {page:'jogos',label:'Jogos',checked:false},
    {page:'reflexoes',label:'Reflexoes',checked:false},
    {page:'treino',label:'Treino',checked:true},
    {page:'financas',label:'Financas',checked:false}
  ];
  return base;
}

const QUICK_ROUTINE_TEMPLATES={
  saude:{label:'Saude',focus:'treino',time:'30',state:'baguncada'},
  estudos:{label:'Estudos',focus:'estudo',time:'30',state:'media'},
  lazer:{label:'Lazer',focus:'leitura',time:'15',state:'media'},
  estudante:{label:'Estudante',focus:'estudo',time:'30',state:'media'},
  programador:{label:'Programador iniciante',focus:'estudo',time:'60',state:'media'},
  academia:{label:'Academia e dieta',focus:'treino',time:'60',state:'baguncada'},
  organizar:{label:'Organizar vida',focus:'rotina',time:'30',state:'baguncada'},
  leitura:{label:'Leitura e foco',focus:'leitura',time:'30',state:'media'},
  financas:{label:'Financas pessoais',focus:'financas',time:'15',state:'media'}
};

function quickFocusLabel(focus){
  return {rotina:'Rotina',estudo:'Estudo',treino:'Treino',financas:'Financas',leitura:'Leitura',sono:'Sono'}[focus]||'Rotina';
}

function quickRoutineConfig(focus='rotina',state='media',time='30'){
  const short=time==='15';
  const long=time==='60' || time==='120';
  const duration=short?'15 min':time==='30'?'30 min':time==='60'?'1h':'2h';
  const base={
    objective:`Manter ${quickFocusLabel(focus).toLowerCase()} consistente com um plano simples de ${duration} por dia.`,
    districts:['notificacoes'],
    reminders:{leitura:'22:00',dev:'17:00',violao:'19:00',treino:'17:30'},
    tasks:[
      {text:'Hidratacao - 2L',tag:'Saude',category:'Saude',frequency:'Diario',meta:'2L',reminder:'09:00'},
      {text:'Revisao do dia',tag:'Check',category:'Rotina',frequency:'Diario',meta:'5 min',reminder:'21:30'}
    ]
  };
  const add=(task)=>base.tasks.push(task);
  const enable=(...pages)=>pages.forEach(p=>{if(!base.districts.includes(p))base.districts.push(p);});
  if(focus==='treino'){
    enable('treino','sono','comida');
    add({text:`Treino - ${long?'60 min':'45 min'}`,tag:'Corpo',category:'Treino',frequency:'Dias uteis',meta:long?'60 min':'45 min',reminder:'17:30'});
    add({text:'Proteina / refeicao planejada',tag:'Dieta',category:'Saude',frequency:'Diario',meta:'1 refeicao'});
    add({text:'Sono - dormir no horario',tag:'Sono',category:'Saude',frequency:'Diario',meta:'23:00',reminder:'22:30'});
  }else if(focus==='estudo'){
    enable('dev','leitura');
    add({text:`Estudo focado - ${duration}`,tag:'Foco',category:'Estudo',frequency:'Diario',meta:duration,reminder:'17:00'});
    add({text:'Projeto pequeno / exercicio',tag:'Dev',category:'Dev',frequency:'Dias uteis',meta:short?'15 min':'30 min'});
    add({text:'Log do que aprendi',tag:'GitHub',category:'Dev',frequency:'Diario',meta:'5 min'});
  }else if(focus==='financas'){
    enable('financas','compras','investimentos');
    add({text:'Conferir gastos do dia',tag:'Financas',category:'Financas',frequency:'Diario',meta:'10 min',reminder:'20:30'});
    add({text:'Registrar entrada/saida',tag:'Controle',category:'Financas',frequency:'Diario',meta:'5 min'});
    add({text:'Planejar proximo pagamento',tag:'Conta',category:'Casa',frequency:'Personalizado'});
  }else if(focus==='leitura'){
    enable('leitura');
    add({text:`Leitura - ${short?'10 min':'30 min'}`,tag:'Livro',category:'Leitura',frequency:'Diario',meta:short?'10 min':'30 min',reminder:'22:00'});
    add({text:'Anotar uma ideia do livro',tag:'Nota',category:'Leitura',frequency:'Diario',meta:'3 min'});
  }else if(focus==='sono'){
    enable('sono','saude');
    add({text:'Desligar telas antes de dormir',tag:'Sono',category:'Saude',frequency:'Diario',meta:'30 min antes',reminder:'22:15'});
    add({text:'Dormir no horario',tag:'Sono',category:'Saude',frequency:'Diario',meta:'23:00',reminder:'22:45'});
    add({text:'Preparar amanha',tag:'Rotina',category:'Casa',frequency:'Diario',meta:'10 min'});
  }else{
    enable('leitura','treino','dev');
    add({text:'Leitura - 15 min',tag:'Livro',category:'Leitura',frequency:'Diario',meta:'15 min',reminder:'22:00'});
    add({text:'Movimento / treino leve',tag:'Corpo',category:'Treino',frequency:'Dias uteis',meta:short?'15 min':'30 min',reminder:'17:30'});
    add({text:'Organizar proximo passo',tag:'Rotina',category:'Casa',frequency:'Diario',meta:'10 min'});
  }
  if(state==='baguncada')base.tasks=base.tasks.slice(0,5);
  if(state==='organizada' && focus!=='rotina')add({text:'Ajuste fino da rotina',tag:'Upgrade',category:'Rotina',frequency:'Diario',meta:'5 min'});
  base.focus=focus;
  base.state=state;
  base.time=time;
  base.firstReview={
    focus:'Executar o primeiro ciclo de '+quickFocusLabel(focus).toLowerCase(),
    tomorrow:'Manter o menor contrato e revisar o dia',
    note:'Primeira revisao criada pelo piloto automatico.'
  };
  return base;
}

function renderQuickTemplates(){
  const row=document.getElementById('setup-template-row');
  if(!row)return;
  const active=myData.profile?.setupTemplate || '';
  row.innerHTML=Object.entries(QUICK_ROUTINE_TEMPLATES).map(([id,t])=>`<button type="button" data-template="${id}" class="${active===id?'active':''}" onclick="applyQuickTemplate('${id}')">${htmlEscape(t.label)}</button>`).join('');
}

function applyQuickTemplate(id){
  const tpl=QUICK_ROUTINE_TEMPLATES[id];
  if(!tpl)return;
  document.getElementById('setup-focus').value=tpl.focus;
  document.getElementById('setup-state').value=tpl.state;
  document.getElementById('setup-time').value=tpl.time;
  document.getElementById('setup-template-row')?.querySelectorAll('button').forEach(btn=>btn.classList.toggle('active',btn.getAttribute('data-template')===id));
  const auto=document.getElementById('setup-autopilot');
  if(auto)auto.checked=true;
  auto?.closest('.setup-toggle')?.classList.add('on');
  myData.profile={...(myData.profile||{}),setupTemplate:id};
  previewAutoRoutine();
}

function previewAutoRoutine(){
  const cfg=quickRoutineConfig(
    document.getElementById('setup-focus')?.value,
    document.getElementById('setup-state')?.value,
    document.getElementById('setup-time')?.value
  );
  const preview=document.getElementById('setup-auto-preview');
  if(preview)preview.innerHTML=`
    <span>PREVIEW AUTOMATICO</span>
    <b>${htmlEscape(cfg.objective)}</b>
    <div>${cfg.tasks.slice(0,6).map(t=>`<em>${htmlEscape(t.text)}</em>`).join('')}</div>`;
  return cfg;
}

function applyAutoRoutineToSetup(){
  const cfg=previewAutoRoutine();
  const objective=document.getElementById('setup-objective');
  const tasks=document.getElementById('setup-tasks');
  if(objective)objective.value=cfg.objective;
  if(tasks)tasks.value=cfg.tasks.map(t=>t.text).join('\n');
  ['leitura','dev','violao','treino'].forEach(id=>{
    const el=document.getElementById('setup-rem-'+id);
    if(el && cfg.reminders[id])el.value=cfg.reminders[id];
  });
  document.querySelectorAll('#setup-districts input').forEach(input=>{
    input.checked=cfg.districts.includes(input.value) || ['notificacoes'].includes(input.value);
    input.closest('.setup-toggle')?.classList.toggle('on',input.checked);
  });
  return cfg;
}

function autoBuildRoutine(){
  applyAutoRoutineToSetup();
  saveSetupWizard(true);
}

function autoRoutineDistrictDefs(pages){
  return DISTRICT_PAGE_DEFS
    .filter(def=>pages.includes(def.page) && def.page!=='home')
    .map(def=>({
      icon:defaultIconForPage(def.page),
      name:def.label || PAGE_LABELS[def.page] || def.page,
      color:def.color || PAGE_ICON_COLORS[def.page] || 'var(--y)',
      page:def.page,
      url:''
    }));
}

function seedAutoRoutinePages(focus){
  ensureCustomPagesData();
  if(focus==='treino'){
    seedCustomPageItems('treino',[
      {title:'Treino A',type:'Treino',metric:'45 min',priority:'Alta',due:'Dias uteis',progress:0,nextStep:'Registrar primeira carga',note:'Puxada 3 x 10; Remada 3 x 10; Agachamento 3 x 10'},
      {title:'Preparar refeicao proteica',type:'Dieta',metric:'1 refeicao',priority:'Media',due:'Hoje',progress:0,nextStep:'Planejar a proxima refeicao',note:'Escolha uma proteina e uma base simples.'}
    ]);
    seedCustomPageItems('sono',[
      {title:'Sono 23h',type:'Rotina',metric:'23:00',priority:'Alta',due:'Diario',progress:0,nextStep:'Desligar telas 30 min antes',note:'Comece pequeno e acompanhe a consistencia.'}
    ]);
  }
  if(focus==='financas'){
    seedCustomPageItems('financas',[
      {title:'Conferir gastos do dia',type:'Controle',metric:'10 min',priority:'Alta',due:'Diario',progress:0,nextStep:'Registrar entradas e saidas',note:'Anote o gasto principal do dia.'},
      {title:'Reserva inicial',type:'Meta',metric:'R$ 100',priority:'Media',due:'Mes atual',progress:0,nextStep:'Separar primeiro valor',note:'Comece com um valor pequeno e repetivel.'}
    ]);
  }
  if(focus==='rotina'){
    seedCustomPageItems('treino',[
      {title:'Movimento leve',type:'Rotina',metric:'20 min',priority:'Media',due:'3x semana',progress:0,nextStep:'Escolher horario fixo',note:'Caminhada, alongamento ou treino curto.'}
    ]);
  }
}

function seedCustomPageItems(page,items){
  if(!myData.customPages?.[page])return;
  const current=myData.customPages[page].items||[];
  items.forEach(item=>{
    if(current.some(x=>String(x.title||'').toLowerCase()===String(item.title||'').toLowerCase()))return;
    current.push({id:Date.now()+Math.floor(Math.random()*999),status:'active',updatedAt:new Date().toISOString(),...item});
  });
  myData.customPages[page].items=current;
}

function seedFirstDailyReview(cfg){
  myData.dailyReviews=myData.dailyReviews||{};
  if(myData.dailyReviews[dk()]?.updatedAt)return;
  myData.dailyReviews[dk()]={
    date:dk(),
    energy:'Media',
    focus:cfg.firstReview?.focus || 'Executar primeira rotina',
    note:cfg.firstReview?.note || 'Primeira revisao criada pelo setup.',
    tomorrow:cfg.firstReview?.tomorrow || 'Repetir o menor contrato',
    done:[],
    pending:(cfg.tasks||[]).map(t=>t.text),
    setupPrompt:true
  };
}

function autoBuildFromHome(focus='rotina'){
  if(RO())return;
  const cfg=quickRoutineConfig(focus,'baguncada','30');
  myData.profile={...(myData.profile||{}),autoPilot:true,setupFocus:cfg.focus,setupState:cfg.state,setupTime:cfg.time,setupDone:true};
  myData.taskDefs=cfg.tasks.map(t=>({...t}));
  myData.pageObjectives={...(myData.pageObjectives||{}),home:cfg.objective};
  myData.districts=autoRoutineDistrictDefs(cfg.districts);
  loadReminders();
  Object.entries(cfg.reminders||{}).forEach(([id,time])=>{if(reminders[id]){reminders[id].time=time;reminders[id].enabled=true;}});
  myData.reminders=serializedReminders();
  saveReminders();
  seedAutoRoutinePages(focus);
  seedFirstDailyReview(cfg);
  applyData();
  syncTodayHabitsFromTasks();
  scheduleAutoSave();
  showCyberToast('PILOTO AUTOMATICO','Rotina base criada para '+quickFocusLabel(focus)+'.');
  spotlightFirstTask();
}

// Destaca o primeiro contrato pendente para o usuario sentir a recompensa rapido.
function spotlightFirstTask(){
  if(RO())return;
  setTimeout(()=>{
    goPage('home');
    setTimeout(()=>{
      const first=document.querySelector('#task-list .task:not(.done)');
      if(!first)return;
      first.classList.add('task-spotlight');
      try{first.scrollIntoView({behavior:'smooth',block:'center'});}catch(e){}
      showCyberToast('PRIMEIRO PASSO','Marque seu primeiro contrato para iniciar a sequencia.',6000);
      setTimeout(()=>first.classList.remove('task-spotlight'),4600);
    },360);
  },220);
}

function openSetupWizard(){
  if(!me || RO())return;
  const modal=document.getElementById('setup-wizard');
  if(!modal)return;
  document.getElementById('setup-name').value=myData.profile?.name || PROFILES[me]?.name || displayNameFromEmail(me);
  document.getElementById('setup-nick').value=profileNick(myData,me);
  document.getElementById('setup-objective').value=myData.pageObjectives?.home || myData.profile?.bio || '';
  document.getElementById('setup-tasks').value=getTasks().map(t=>t.text||'').filter(Boolean).join('\n');
  const districtHost=document.getElementById('setup-districts');
  if(districtHost){
    const active=new Set(getDistricts().map(d=>d.page));
    districtHost.innerHTML=setupDistrictDefaults().map(d=>`
      <label class="setup-toggle ${active.has(d.page)||d.checked?'on':''}">
        <input type="checkbox" value="${d.page}" ${active.has(d.page)||d.checked?'checked':''}>
        <span>${htmlEscape(d.label)}</span>
      </label>`).join('');
  }
  renderQuickTemplates();
  previewAutoRoutine();
  modal.classList.add('on');
}

function closeSetupWizard(){
  document.getElementById('setup-wizard')?.classList.remove('on');
}

function fillSetupDefaults(){
  const objective=document.getElementById('setup-objective');
  const tasks=document.getElementById('setup-tasks');
  const auto=document.getElementById('setup-autopilot');
  if(auto){auto.checked=true;auto.closest('.setup-toggle')?.classList.add('on');}
  const cfg=applyAutoRoutineToSetup();
  if(objective && !objective.value.trim())objective.value='Manter uma rotina diaria consistente com leitura, estudo, treino e revisao.';
  if(tasks && !tasks.value.trim())tasks.value=(cfg.tasks||[]).map(t=>t.text).join('\n');
}

function saveSetupWizard(){
  if(!me || RO())return;
  const autoPilot=!!document.getElementById('setup-autopilot')?.checked;
  const cfg=autoPilot ? applyAutoRoutineToSetup() : null;
  const name=document.getElementById('setup-name')?.value.trim().slice(0,28) || displayNameFromEmail(me);
  const nick=normalizeNick(document.getElementById('setup-nick')?.value || name);
  const objective=document.getElementById('setup-objective')?.value.trim() || 'Rotina principal configurada.';
  const tasksRaw=document.getElementById('setup-tasks')?.value || '';
  const tasks=(cfg?.tasks && cfg.tasks.length)
    ? cfg.tasks.map(t=>({...t})).slice(0,12)
    : tasksRaw.split(/\n+/).map(x=>x.trim()).filter(Boolean).slice(0,12).map(text=>({text,tag:''}));
  if(!tasks.length){
    showCyberToast('CONTRATO OBRIGATORIO','Crie pelo menos 1 contrato ou clique em um template para iniciar.');
    openSetupWizard();
    return;
  }
  myData.profile={
    ...(myData.profile||{}),
    name,nick,bio:objective,setupDone:true,status:myData.profile?.status||'Online',
    autoPilot,
    setupFocus:cfg?.focus || document.getElementById('setup-focus')?.value || myData.profile?.setupFocus || 'rotina',
    setupState:cfg?.state || document.getElementById('setup-state')?.value || myData.profile?.setupState || 'media',
    setupTime:cfg?.time || document.getElementById('setup-time')?.value || myData.profile?.setupTime || '30'
  };
  if(tasks.length)myData.taskDefs=tasks;
  myData.pageObjectives={...(myData.pageObjectives||{}),home:objective};
  const selected=cfg?.districts || [...document.querySelectorAll('#setup-districts input:checked')].map(i=>i.value);
  const districtDefs=autoRoutineDistrictDefs(selected);
  if(districtDefs.length)myData.districts=districtDefs;
  loadReminders();
  ['leitura','dev','violao','treino'].forEach(id=>{
    const el=document.getElementById('setup-rem-'+id);
    if(reminders[id] && el?.value){reminders[id].time=el.value;reminders[id].enabled=true;}
  });
  const firstReminder=tasks.find(t=>t.reminder)?.reminder || '21:30';
  if(!Object.values(reminders).some(r=>r.enabled) && reminders.leitura){
    reminders.leitura.enabled=true;
    reminders.leitura.time=firstReminder;
  }
  myData.reminders=serializedReminders();
  saveReminders();
  if(cfg){
    seedAutoRoutinePages(cfg.focus);
    seedFirstDailyReview(cfg);
  }
  setRuntimeProfile(me,{name,nick,email:profileEmail(me),role:userRole(me)});
  closeSetupWizard();
  applyData();
  renderTasks();
  syncTodayHabitsFromTasks();
  updateStats();
  scheduleAutoSave();
  upsertPublicFriendProfile();
  showCyberToast('ROTINA ATIVA','Setup inicial salvo. Sua Home agora foca no painel do dia.');
  spotlightFirstTask();
}

function dailyReviewData(date=dk()){
  return (D().dailyReviews||{})[date] || {};
}

// Contratos ativos para a data informada (respeita arquivamento e frequencia).
function activeTasksToday(date=new Date()){
  return allTaskDefs(D()).map((task,index)=>({...task,index})).filter(t=>!t.archivedAt && taskActiveOn(t,date));
}

function todayTaskSnapshot(){
  const tasks=activeTasksToday();
  const saved=(D().tasks||{})[dk()]||{};
  const done=[],pending=[];
  tasks.forEach((t,i)=>(saved[i]?done:pending).push(t.text||('Contrato '+(t.index+1))));
  return {done,pending,total:tasks.length};
}

// Returns pending tasks with full info ({i, taskIndex, text, tag}) for interactive mission card.
function todayPendingFull(){
  const tasks=activeTasksToday();
  const saved=(D().tasks||{})[dk()]||{};
  const pending=[];
  tasks.forEach((t,i)=>{
    if(!saved[i]) pending.push({i,taskIndex:t.index,text:t.text||('Contrato '+(t.index+1)),tag:t.tag||''});
  });
  return pending;
}

// Resumo do dia anterior para o nudge de continuidade.
function yesterdaySnapshot(){
  const y=new Date();y.setDate(y.getDate()-1);
  const key=localDateKey(y);
  const tasks=allTaskDefs(D()).map((task,index)=>({...task,index})).filter(t=>!t.archivedAt && taskActiveOn(t,y));
  const saved=(D().tasks||{})[key]||{};
  let done=0;tasks.forEach((t,i)=>{if(saved[i])done++;});
  return {done,total:tasks.length,key};
}

function renderDailyPanel(){
  const title=document.getElementById('daily-command-title');
  const sub=document.getElementById('daily-command-sub');
  if(!title || !sub)return;
  const snap=todayTaskSnapshot();
  const review=dailyReviewData();
  const pct=snap.total?Math.round(snap.done.length/snap.total*100):0;
  const auto=!!D().profile?.autoPilot;
  if(!snap.total){
    title.textContent='Montar painel do dia';
    sub.textContent='Quer que eu crie contratos, lembretes e distritos iniciais para voce?';
    return;
  }
  title.textContent=review.updatedAt?'Dia revisado':(auto?'Piloto automatico - '+pct+'%':'Fechar rotina - '+pct+'%');
  // Yesterday comparison (12)
  const yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);
  const yKey=localDateKey(yesterday);
  const ySaved=(D().tasks||{})[yKey]||{};
  const yDefs=allTaskDefs(D()).filter(t=>!t.archivedAt&&taskActiveOn(t,yesterday));
  const yDone=yDefs.filter((_,i)=>ySaved[i]).length;
  const yPct=yDefs.length?Math.round(yDone/yDefs.length*100):0;
  const baseText=review.updatedAt
    ? 'Plano de amanha: '+(review.focus || review.tomorrow || 'registrado')
    : (snap.pending[0] ? (auto?'Proximo passo: ':'Proximo contrato: ')+snap.pending[0] : 'Todos os contratos marcados. Registre o fechamento.');
  if(!review.updatedAt && yDefs.length){
    const diff=pct-yPct;
    const diffStr=diff>0?'+'+diff+'%':diff+'%';
    const diffColor=diff>0?'var(--c)':diff<0?'var(--r)':'var(--muted)';
    sub.innerHTML=`${snap.done.length}/${snap.total} contratos feitos hoje. Ontem: ${yPct}% (<span style="color:${diffColor}">${htmlEscape(diffStr)}</span>)`;
  }else{
    sub.innerHTML=htmlEscape(baseText);
  }
  renderYesterdayNudge();
}

// Mostra "ontem voce fez X/Y" no inicio do dia, para criar continuidade.
function renderYesterdayNudge(){
  const el=document.getElementById('yesterday-nudge');
  if(!el)return;
  const y=yesterdaySnapshot();
  const todayDone=todayTaskSnapshot().done.length;
  // some quando o dia ja engatou
  if(todayDone>0){el.className='yesterday-nudge';el.innerHTML='';return;}
  // Modo recuperacao: tinha uma boa corrente e ela quebrou.
  const cur=maxStreak();
  const peak=D().prefs?.peakStreak||0;
  if(cur===0 && peak>=4){
    el.className='yesterday-nudge on recover';
    el.innerHTML=`<span>RECUPERACAO</span> Sua maior corrente foi ${peak} dias. Recomece pequeno: marque 1 contrato e reacenda o ritmo.`;
    return;
  }
  if(!y.total){el.className='yesterday-nudge';el.innerHTML='';return;}
  if(y.done>=y.total){
    el.className='yesterday-nudge on good';
    el.innerHTML=`<span>ONTEM</span> ${y.done}/${y.total} contratos // dia limpo. Mantenha o ritmo hoje.`;
  }else{
    el.className='yesterday-nudge on';
    el.innerHTML=`<span>ONTEM</span> ${y.done}/${y.total} contratos // ${y.total-y.done} ficaram para tras. Bora fechar hoje.`;
  }
}

function openDailyReview(){
  if(!me || RO())return;
  const modal=document.getElementById('daily-review');
  if(!modal)return;
  const snap=todayTaskSnapshot();
  const review=dailyReviewData();
  const pct=snap.total?Math.round(snap.done.length/snap.total*100):0;
  const summary=document.getElementById('daily-review-summary');
  if(summary)summary.innerHTML=`
    <div class="daily-review-kpis">
      <div><span>CONCLUIDOS</span><b>${snap.done.length}/${snap.total}</b></div>
      <div><span>PROGRESSO</span><b>${pct}%</b></div>
      <div><span>PENDENTES</span><b>${snap.pending.length}</b></div>
    </div>
    <div class="daily-review-list">
      <b>Feitos</b><span>${snap.done.length?htmlEscape(snap.done.join(', ')):'Nada marcado ainda'}</span>
      <b>Pendentes</b><span>${snap.pending.length?htmlEscape(snap.pending.join(', ')):'Nenhum pendente'}</span>
    </div>`;
  document.getElementById('daily-energy').value=review.energy || 'Media';
  document.getElementById('daily-focus').value=review.focus || '';
  document.getElementById('daily-note').value=review.note || '';
  document.getElementById('daily-tomorrow').value=review.tomorrow || '';
  modal.classList.add('on');
}

function closeDailyReview(){
  document.getElementById('daily-review')?.classList.remove('on');
}

function addActivity(kind,details={}){
  if(RO())return;
  myData.activityHistory=Array.isArray(myData.activityHistory)?myData.activityHistory:[];
  myData.activityHistory.unshift({id:Date.now()+Math.floor(Math.random()*999),date:dk(),kind,...details});
  myData.activityHistory=myData.activityHistory.slice(0,300);
  checkAchievements();
}

function saveDailyReview(){
  if(!me || RO())return;
  const snap=todayTaskSnapshot();
  myData.dailyReviews=myData.dailyReviews||{};
  myData.dailyReviews[dk()]={
    date:dk(),
    energy:document.getElementById('daily-energy')?.value || 'Media',
    focus:document.getElementById('daily-focus')?.value.trim() || '',
    note:document.getElementById('daily-note')?.value.trim() || '',
    tomorrow:document.getElementById('daily-tomorrow')?.value.trim() || '',
    done:snap.done,
    pending:snap.pending,
    updatedAt:new Date().toISOString()
  };
  addActivity('review',{title:'Fechamento do dia',duration:0,difficulty:myData.dailyReviews[dk()].energy,note:myData.dailyReviews[dk()].note});
  const er=awardEddies(10,'review');
  checkAchievements();
  closeDailyReview();
  renderDailyPanel();
  rollLootDrop();
  updateStats();
  updateEddiesDisplay();
  scheduleAutoSave();
  const pct=snap.total?Math.round(snap.done.length/snap.total*100):0;
  showCyberToast('DIA FECHADO',`${snap.done.length}/${snap.total} contratos // ${pct}% concluido // +3 REP`+(er?' // +€$'+er:''),7200);
}

// App lifecycle
window.addEventListener('DOMContentLoaded', async ()=>{
  document.body.classList.add('mobile-boot');
  setTimeout(()=>document.body.classList.remove('mobile-boot'),900);
  setupHomeSideMenu();
  ensureExtraPages();
  applyTheme(localStorage.getItem('nc_theme_v1_anon')||'arasaka');
  loadMotionMode();
  prepareAuthEmailField('login');
  prepareGoogleAuthButton('login');
  setLoginMode(isPasswordRecoveryRoute()?'reset':'login');
  const loginBtn=document.getElementById('login-btn');if(loginBtn)loginBtn.disabled=false;
  updateCurrentDate();
  setInterval(updateSaveIndicator,60000);
  if(isPasswordRecoveryRoute()){
    document.body.classList.remove('auth-checking');
    return;
  }
  let saved=null;
  try{saved=await authSessionUsername();}catch(e){console.warn('Falha ao restaurar sessao:',e);}
  if(!saved)saved=loadSession();
  if(saved && PROFILES[saved]){
    const st=document.getElementById('login-status');
    if(st) st.textContent='// RECONECTANDO... //';
    try{
      const data=await dbGet(saved);
      unlockApp(saved,data);
    }catch(e){
      clearSession(); me=null; myData={};
      if(st) st.textContent='// SESSAO EXPIRADA - FACA LOGIN //';
      document.body.classList.remove('auth-checking');
    }
  }else{
    document.body.classList.remove('auth-checking');
  }
});

window.addEventListener('online',()=>{
  if(me && hasPendingLocalSave()) retryPendingLocalSave(true);
});

// Authentication
function selectProfile(id){
  if(!PROFILES[id])return;
  selProfile=id;
  isNewUser=false;
  document.querySelectorAll('.profile-card').forEach(c=>c.classList.remove('selected'));
  document.getElementById('pc-'+id).classList.add('selected');
  document.getElementById('step-select').style.display='none';
  document.getElementById('step-password').style.display='block';
  document.getElementById('login-btn').disabled=true;
  prepareAuthEmailField(id);
  document.getElementById('pwd-input').value='';
  document.getElementById('pwd-confirm').value='';
  checkIfNewUser(id);
}

async function checkIfNewUser(id){
  const st=document.getElementById('login-status');
  const fp=PROFILES[id];
  const btn=document.getElementById('login-btn');
  st.textContent='// VERIFICANDO... //';
  if(authEnabled()){
    if(selProfile!==id)return;
    isNewUser=false;
    document.getElementById('login-sub').textContent='SUPABASE AUTH - '+fp.name;
    document.getElementById('pwd-label').textContent='SENHA SUPABASE AUTH';
    document.getElementById('pwd-confirm-wrap').style.display='none';
    btn.textContent='CONECTAR / CRIAR AUTH';
    st.textContent='// AUTH: ENTRE OU CRIE A CONTA DESTE PERFIL //';
    btn.disabled=false;
    setTimeout(()=>{
      const email=document.getElementById('auth-email-input');
      const p=document.getElementById('pwd-input');
      if(selProfile!==id)return;
      if(email && !email.value) email.focus();
      else if(p) p.focus();
    },100);
    return;
  }
  try{
    const data=await dbGet(id);
    if(selProfile!==id)return;
    isNewUser=!profileConfigured(data);
    if(isNewUser){
      document.getElementById('login-sub').textContent=(authEnabled()?'CRIAR SUPABASE AUTH - ':'CRIAR SENHA - ')+fp.name;
      document.getElementById('pwd-label').textContent=authEnabled()?'CRIAR SENHA AUTH':'CRIAR SENHA';
      document.getElementById('pwd-confirm-wrap').style.display='block';
      btn.textContent=authEnabled()?'CRIAR AUTH':'CRIAR CONTA';
      st.textContent=authEnabled()?'// NOVO PERFIL - CRIE UMA CONTA AUTH //':'// NOVO PERFIL - CRIE UMA SENHA //';
    } else {
      document.getElementById('login-sub').textContent='BEM-VINDO, '+fp.name;
      document.getElementById('pwd-label').textContent=authEnabled()?'SENHA SUPABASE AUTH':'SENHA';
      document.getElementById('pwd-confirm-wrap').style.display='none';
      btn.textContent='CONECTAR';
      st.textContent=authEnabled()?'// AUTH ATIVO: INSIRA SUA SENHA //':'// INSIRA SUA SENHA //';
    }
    btn.disabled=false;
    setTimeout(()=>{ const p=document.getElementById('pwd-input'); if(p && selProfile===id) p.focus(); },100);
  }catch(e){
    if(selProfile!==id)return;
    btn.disabled=true;
    st.textContent='// ERRO: '+e.message+' //';
  }
}

function backToSelect(){
  document.getElementById('step-select').style.display='block';
  document.getElementById('step-password').style.display='block';
  document.getElementById('login-btn').disabled=false;
  setLoginMode('login');
  document.getElementById('login-status').textContent='// INSIRA EMAIL E SENHA //';
  document.getElementById('pwd-input').value='';
  document.getElementById('pwd-confirm').value='';
  const name=document.getElementById('account-name-input');if(name)name.value='';
  const email=document.getElementById('auth-email-input');if(email)email.value='';
  prepareAuthEmailField('login');
  document.getElementById('pwd-confirm-wrap').style.display='none';
  document.querySelectorAll('.profile-card').forEach(c=>c.classList.remove('selected'));
  selProfile=null; isNewUser=false;
}

function resetLoginForm(){
  document.getElementById('pwd-input').value='';
  document.getElementById('pwd-confirm').value='';
  const name=document.getElementById('account-name-input');if(name)name.value='';
  const email=document.getElementById('auth-email-input');if(email)email.value='';
  const target=authFormMode==='reset' ? document.getElementById('pwd-input') : authFormMode==='create' ? name : email;
  if(target)target.focus();
  document.getElementById('login-status').textContent=authFormMode==='reset'?'// DEFINA SUA NOVA SENHA //':authFormMode==='create'?'// CRIE SUA CONTA PESSOAL //':'// INSIRA EMAIL E SENHA //';
}

function setLoginMode(mode){
  authFormMode=mode==='create'?'create':mode==='reset'?'reset':'login';
  const create=authFormMode==='create';
  const reset=authFormMode==='reset';
  const nameWrap=document.getElementById('account-name-wrap');
  const emailWrap=document.getElementById('auth-email-wrap');
  const confirmWrap=document.getElementById('pwd-confirm-wrap');
  const btn=document.getElementById('login-btn');
  const sub=document.getElementById('login-sub');
  const hint=document.getElementById('login-hint');
  const pwd=document.getElementById('pwd-input');
  const loginTab=document.getElementById('login-mode-login');
  const createTab=document.getElementById('login-mode-create');
  if(nameWrap)nameWrap.style.display=create?'block':'none';
  if(emailWrap)emailWrap.style.display=reset?'none':'block';
  if(confirmWrap)confirmWrap.style.display=(create||reset)?'block':'none';
  if(btn)btn.textContent=reset?'ATUALIZAR SENHA':create?'CRIAR CONTA':'ENTRAR';
  if(sub)sub.textContent=reset?'REDEFINIR SENHA':create?'CRIAR CONTA':'LOGIN DE OPERADOR';
  if(hint)hint.textContent=reset?'Digite e confirme sua nova senha para concluir a recuperacao.':create?'Cadastre nome, email e senha. Limite inicial: '+ACCOUNT_LIMIT+' contas neste dispositivo.':'Entre com seu email e senha. Cada conta abre seus proprios dados.';
  if(pwd){
    pwd.autocomplete=(create||reset)?'new-password':'current-password';
    pwd.type='password';
  }
  const confirm=document.getElementById('pwd-confirm');if(confirm)confirm.type='password';
  const toggles=document.querySelectorAll('.login-mini-action');toggles.forEach(b=>{if(b.textContent==='OCULTAR')b.textContent='VER';});
  if(loginTab)loginTab.classList.toggle('active',authFormMode==='login');
  if(createTab)createTab.classList.toggle('active',create);
  prepareGoogleAuthButton('login');
  const st=document.getElementById('login-status');
  if(st)st.textContent=reset?'// DEFINA SUA NOVA SENHA //':create?'// CRIE SUA CONTA PESSOAL //':'// INSIRA EMAIL E SENHA //';
  setTimeout(()=>{
    const target=reset?document.getElementById('pwd-input'):create?document.getElementById('account-name-input'):document.getElementById('auth-email-input');
    if(target)target.focus();
  },60);
}

function isPasswordRecoveryRoute(){
  const raw=(window.location.hash||'')+' '+(window.location.search||'');
  return raw.includes('type=recovery');
}

function togglePasswordVisibility(inputId,btn){
  const input=document.getElementById(inputId);
  if(!input)return;
  const show=input.type==='password';
  input.type=show?'text':'password';
  if(btn)btn.textContent=show?'OCULTAR':'VER';
  input.focus();
}

function submitAuthForm(){
  if(authFormMode==='create')return doCreateAccount();
  if(authFormMode==='reset')return doUpdatePassword();
  return doLogin();
}

async function doLogin(){
  const btn=document.getElementById('login-btn'),st=document.getElementById('login-status');
  const email=document.getElementById('auth-email-input')?.value.trim();
  if(!email){ st.textContent='// DIGITE SEU EMAIL //'; return; }
  const pwd=document.getElementById('pwd-input').value;
  if(!pwd){ st.textContent='// DIGITE SUA SENHA //'; return; }
  btn.disabled=true; st.textContent='// AUTENTICANDO... //';
  try{
    let data=null;
    if(authEnabled()){
      await authSignInProfile('login',pwd);
    }
    const username=authEnabled() ? await authSessionUsername() : selProfile;
    if(!username || !PROFILES[username])throw new Error('Conta autenticada sem perfil local. Recarregue e tente novamente.');
    data=await dbGet(username);
    saveSession(username);
    document.getElementById('pwd-input').value='';
    document.getElementById('pwd-confirm').value='';
    unlockApp(username,data);
  }catch(e){
    st.textContent='// ERRO: '+e.message+' //';
    btn.disabled=false;
  }
}

async function doCreateAccount(){
  const btn=document.getElementById('login-btn'),st=document.getElementById('login-status');
  const name=document.getElementById('account-name-input')?.value.trim();
  const email=document.getElementById('auth-email-input')?.value.trim();
  const pwd=document.getElementById('pwd-input').value;
  const confirm=document.getElementById('pwd-confirm').value;
  if(!name){ st.textContent='// DIGITE O NOME DA CONTA //'; return; }
  if(!email){ st.textContent='// DIGITE SEU EMAIL //'; return; }
  if(!pwd){ st.textContent='// DIGITE SUA SENHA //'; return; }
  if(pwd.length<6){ st.textContent='// SENHA COM MINIMO 6 CARACTERES //'; return; }
  if(pwd!==confirm){ st.textContent='// SENHAS NAO CONFEREM //'; return; }
  btn.disabled=true; st.textContent='// CRIANDO CONTA... //';
  try{
    const created=await createAuthAccount(pwd);
    if(created?.requiresEmailConfirmation){
      setLoginMode('login');
      st.textContent='// EMAIL ENVIADO. CONFIRME NA CAIXA DE ENTRADA/SPAM E VOLTE EM LOGIN //';
      const emailInput=document.getElementById('auth-email-input');
      if(emailInput)emailInput.value=email.toLowerCase();
      document.getElementById('pwd-input').value='';
      document.getElementById('pwd-confirm').value='';
      return;
    }
    const username=await authSessionUsername();
    if(username && PROFILES[username]){
      const data=await dbGet(username);
      saveSession(username);
      document.getElementById('pwd-input').value='';
      document.getElementById('pwd-confirm').value='';
      unlockApp(username,data);
      return;
    }
    setLoginMode('login');
    st.textContent='// VERIFIQUE SEU EMAIL PARA ATIVAR A CONTA //';
  }catch(e){
    st.textContent='// '+(e.message||'ERRO AO CRIAR CONTA')+' //';
  }finally{
    btn.disabled=false;
  }
}

async function forgotPassword(){
  const st=document.getElementById('login-status');
  const email=document.getElementById('auth-email-input')?.value.trim();
  if(!email){ st.textContent='// DIGITE SEU EMAIL PARA RECUPERAR //'; document.getElementById('auth-email-input')?.focus(); return; }
  st.textContent='// ENVIANDO LINK DE RECUPERACAO... //';
  try{
    await sendPasswordResetEmail();
    st.textContent='// LINK DE RECUPERACAO ENVIADO AO EMAIL //';
  }catch(e){
    st.textContent='// ERRO RECUPERACAO: '+e.message+' //';
  }
}

async function doUpdatePassword(){
  const btn=document.getElementById('login-btn'),st=document.getElementById('login-status');
  const pwd=document.getElementById('pwd-input').value;
  const confirm=document.getElementById('pwd-confirm').value;
  if(!pwd){ st.textContent='// DIGITE A NOVA SENHA //'; return; }
  if(pwd.length<6){ st.textContent='// SENHA COM MINIMO 6 CARACTERES //'; return; }
  if(pwd!==confirm){ st.textContent='// SENHAS NAO CONFEREM //'; return; }
  btn.disabled=true; st.textContent='// ATUALIZANDO SENHA... //';
  try{
    await updateAuthPassword(pwd);
    const username=await authSessionUsername();
    if(username && PROFILES[username]){
      const data=await dbGet(username);
      saveSession(username);
      window.history.replaceState({},document.title,window.location.pathname);
      unlockApp(username,data);
      return;
    }
    st.textContent='// SENHA ATUALIZADA. FACA LOGIN //';
    setLoginMode('login');
  }catch(e){
    st.textContent='// ERRO AO ATUALIZAR: '+e.message+' //';
  }finally{
    btn.disabled=false;
  }
}

async function doGoogleLogin(){
  const btn=document.getElementById('google-auth-btn'),st=document.getElementById('login-status');
  if(NC_CONFIG.GOOGLE_AUTH_ENABLED !== true){
    st.textContent='// GOOGLE AUTH OFFLINE: ATIVE O PROVIDER NO SUPABASE //';
    return;
  }
  if(btn)btn.disabled=true;
  st.textContent='// REDIRECIONANDO PARA GOOGLE AUTH... //';
  try{
    await authSignInWithGoogleProfile('login');
  }catch(e){
    st.textContent='// ERRO GOOGLE AUTH: '+e.message+' //';
    if(btn)btn.disabled=false;
  }
}

async function doLogout(){
  if(autoSaveTimer){clearTimeout(autoSaveTimer);autoSaveTimer=null;}
  stopReminderEngine();
  if(authEnabled() && sb?.auth){
    try{await sb.auth.signOut();}catch(e){}
  }
  clearSession();
  me=null; myData={};
  clearFriendUi();
  setProfileSetupHint(false);
  selProfile=null; isNewUser=false;
  document.body.classList.remove('auth-checking');
  document.getElementById('login-screen').style.display='flex';
  document.getElementById('step-select').style.display='block';
  document.getElementById('step-password').style.display='block';
  document.getElementById('login-btn').disabled=false;
  setLoginMode('login');
  document.getElementById('pwd-input').value='';
  document.getElementById('pwd-confirm').value='';
  const name=document.getElementById('account-name-input');if(name)name.value='';
  prepareAuthEmailField('login');
  document.getElementById('pwd-confirm-wrap').style.display='none';
  document.querySelectorAll('.profile-card').forEach(c=>c.classList.remove('selected'));
  document.getElementById('login-status').textContent='// SESSAO ENCERRADA //';
  document.getElementById('nav-user').textContent='--';
  const mu=document.getElementById('mob-user');if(mu)mu.textContent='--';
  document.getElementById('nav-sync').textContent=themeCopy('save');
  document.getElementById('nav-sync').className='nav-sync';
  goPage('home');
}
const AUTO_SAVE_DELAY=900;
let autoSaveTimer=null;

function scheduleAutoSave(){
  if(!me || RO())return;
  const btn=document.getElementById('nav-sync');
  if(autoSaveTimer)clearTimeout(autoSaveTimer);
  if(btn){btn.textContent=themeCopy('saving');btn.className='nav-sync saving';}
  autoSaveTimer=setTimeout(()=>{autoSaveTimer=null;saveAll();},AUTO_SAVE_DELAY);
}

async function saveAll(){
  if(!me || RO())return;
  if(autoSaveTimer){clearTimeout(autoSaveTimer);autoSaveTimer=null;}
  const btn=document.getElementById('nav-sync');
  btn.textContent=themeCopy('saving');btn.className='nav-sync saving';
  try{
    collectState();
    await dbSetMany(me,SAVE_KEYS.map(k=>[k,myData[k]??null]));
    clearPendingLocalSave();
    localStorage.setItem(lastSaveKey(),new Date().toISOString());
    _lastSaveTs=Date.now();updateSaveIndicator();
    renderSystemStatus();
    btn.textContent='SALVO ✓';btn.className='nav-sync saved';
    setTimeout(()=>{btn.textContent=themeCopy('save');btn.className='nav-sync';},2500);
  }catch(e){
    console.error('saveAll falhou:',e);
    // guarda copia local para reenvio automatico ao reconectar
    try{storePendingLocalSave(e);}catch(_){}
    btn.textContent='ERRO ✕';btn.className='nav-sync error';
    setTimeout(()=>{btn.textContent=themeCopy('save');btn.className='nav-sync';},3000);
  }
}

document.addEventListener('input',e=>{
  if(e.target.closest('#task-edit-form,#habit-edit-form,#goals-edit-form,#routine-edit-form,#district-edit-form,#dev-skill-edit-form,#guitar-skill-edit-form'))scheduleAutoSave();
});
document.addEventListener('change',e=>{
  if(e.target.closest('#task-edit-form,#habit-edit-form,#goals-edit-form,#routine-edit-form,#district-edit-form,#dev-skill-edit-form,#guitar-skill-edit-form'))scheduleAutoSave();
  if(e.target.matches('.setup-toggle input')){
    e.target.closest('.setup-toggle')?.classList.toggle('on',e.target.checked);
    if(e.target.id==='setup-autopilot')previewAutoRoutine();
  }
});

// Acessibilidade: fecha o modal aberto ao pressionar Escape.
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  const closers=[
    ['contract-modal',closeContractModal],
    ['daily-review',closeDailyReview],
    ['global-search',closeGlobalSearch],
    ['setup-wizard',closeSetupWizard],
    ['weekly-summary',closeWeeklySummary],
    ['friend-chat',closeFriendChat],
    ['home-module-screen',closeHomeModule]
  ];
  for(const [id,fn] of closers){
    const el=document.getElementById(id);
    if(el && el.classList.contains('on') && typeof fn==='function'){fn();e.preventDefault();return;}
  }
  // ESC sai do modo foco
  if(document.body.classList.contains('focus-mode')){toggleFocusMode();e.preventDefault();}
});

// Quick-add global: tecla "n" abre um novo contrato de qualquer pagina.
document.addEventListener('keydown',e=>{
  if(e.key!=='n' && e.key!=='N')return;
  if(e.metaKey||e.ctrlKey||e.altKey)return;
  const t=e.target;
  if(t && (t.matches&&t.matches('input,textarea,select') || t.isContentEditable))return;
  if(!me || RO())return;
  if(document.querySelector('.global-search.on, #contract-modal.on'))return;
  e.preventDefault();
  if(typeof openContractModal==='function')openContractModal();
});
// Tecla "f" ativa modo foco.
document.addEventListener('keydown',e=>{
  if(e.key!=='f' && e.key!=='F')return;
  if(e.metaKey||e.ctrlKey||e.altKey)return;
  const t=e.target;
  if(t && (t.matches&&t.matches('input,textarea,select') || t.isContentEditable))return;
  if(document.querySelector('.global-search.on, #contract-modal.on'))return;
  toggleFocusMode();
});

const dk=()=>localDateKey();
const wk=()=>{const n=new Date(),j=new Date(n.getFullYear(),0,1);return 'w'+n.getFullYear()+'_'+Math.ceil(((n-j)/864e5+j.getDay()+1)/7)};
function weekKeyFor(date){
  const j=new Date(date.getFullYear(),0,1);
  return 'w'+date.getFullYear()+'_'+Math.ceil(((date-j)/864e5+j.getDay()+1)/7);
}
function formatWeekKey(key){
  const m=String(key||'').match(/^w(\d{4})_(\d+)$/);
  return m ? 'SEMANA '+m[2]+' / '+m[1] : String(key||'SEMANA');
}
function habitDayIndex(date){return date.getDay()===0?6:date.getDay()-1;}
const D=()=>viewFriend?friendData:myData;
const RO=()=>viewFriend;

function collectState(){
  syncTodayTasksFromDom();
  syncTodayHabitsFromTasks(false);
  // save custom defs
  if(myData.taskDefs) myData.taskDefs=myData.taskDefs;
}

/* ============================================================
   RETENCAO: Eddies (€$), escudos de streak, login, loot, loja
   ============================================================ */
function ensureRetentionData(){
  if(typeof myData.eddies!=='number')myData.eddies=0;
  if(!myData.eddiesDaily || typeof myData.eddiesDaily!=='object')myData.eddiesDaily={date:'',earned:0};
  if(typeof myData.streakShields!=='number')myData.streakShields=0;
  if(!Array.isArray(myData.shieldMilestones))myData.shieldMilestones=[];
  if(!myData.loginState || typeof myData.loginState!=='object')myData.loginState={streak:0,lastDate:'',lastBonus:0};
  if(!myData.lootState || typeof myData.lootState!=='object')myData.lootState={lastDate:'',history:[]};
  if(!Array.isArray(myData.lootState.history))myData.lootState.history=[];
  if(!Array.isArray(myData.shopUnlocks))myData.shopUnlocks=[];
  if(!myData.equippedCosmetics || typeof myData.equippedCosmetics!=='object')myData.equippedCosmetics={};
  if(typeof myData.wrappedSeen!=='string')myData.wrappedSeen='';
  if(!myData.seasonData || typeof myData.seasonData!=='object')myData.seasonData={};
}

// Unica forma de conceder eddies. Trava anti-cheat de 200/dia.
function awardEddies(amount,reason){
  if(RO())return 0;
  ensureRetentionData();
  if(myData.eddiesDaily.date!==dk())myData.eddiesDaily={date:dk(),earned:0};
  const room=Math.max(0,200-myData.eddiesDaily.earned);
  const grant=Math.min(Math.max(0,amount|0),room);
  myData.eddies+=grant;
  myData.eddiesDaily.earned+=grant;
  return grant;
}

// Conta do criador tem saldo ilimitado de Eddies (so na propria conta, nao em friend-view).
function hasInfiniteEddies(){return isCreatorUser(me) && !viewFriend;}

function spendEddies(amount){
  if(RO())return false;
  ensureRetentionData();
  if(hasInfiniteEddies())return true; // saldo infinito: nao debita
  const cost=Math.max(0,amount|0);
  if(myData.eddies<cost){showCyberToast('EDDIES INSUFICIENTES','Voce nao tem €$'+cost+'. Cumpra contratos para faturar.',4200);return false;}
  myData.eddies-=cost;
  return true;
}

function updateEddiesDisplay(){
  const txt=hasInfiniteEddies()?'€$∞':'€$'+(D().eddies||0);
  const e=document.getElementById('home-eddies');
  if(e)e.textContent=txt;
  const sb=document.getElementById('shop-balance');
  if(sb)sb.textContent=txt;
}

/* Escudos de streak (ICE): protegem correntes de habito ----------- */
function checkShieldMilestones(){
  if(RO())return;
  ensureRetentionData();
  const peak=maxStreak();
  for(let m=7;m<=peak;m+=7){
    if(myData.shieldMilestones.includes(m))continue;
    myData.shieldMilestones.push(m);
    myData.streakShields++;
    showCyberToast('ESCUDO DE STREAK GANHO','// ICE +1 // Corrente de '+m+' dias blindada.',6500);
  }
}

// Escudo gratuito por semana - 1 ICE automatico toda semana.
function checkWeeklyFreeShield(){
  if(RO())return;
  ensureRetentionData();
  const week=wk();
  if((myData.prefs||{}).lastWeeklyShield===week)return;
  myData.prefs=myData.prefs||{};
  myData.prefs.lastWeeklyShield=week;
  myData.streakShields=(myData.streakShields||0)+1;
  showCyberToast('ESCUDO SEMANAL','// ICE +1 // Escudo gratuito desta semana concedido.',6000);
}

// Encontra correntes vivas que acabaram de quebrar ontem.
function brokenStreakHabits(){
  const data=habitDataWithLiveWeek();
  const y=new Date();y.setDate(y.getDate()-1);
  const dby=new Date();dby.setDate(dby.getDate()-2);
  return getHabits().filter(h=>!habitDone(data,h,y) && habitDone(data,h,dby));
}

function useStreakShield(habitName){
  if(RO())return;
  ensureRetentionData();
  if(myData.streakShields<=0){showCyberToast('SEM ESCUDOS','Voce nao tem ICE para gastar. Mantenha correntes de 7 dias.',4200);return;}
  if(!habitName){const list=brokenStreakHabits();if(!list.length){showCyberToast('NADA A PROTEGER','Nenhuma corrente quebrou ontem.',4200);return;}habitName=list[0];}
  const y=new Date();y.setDate(y.getDate()-1);
  const wkey=weekKeyFor(y);
  const di=habitDayIndex(y);
  myData.habits=myData.habits||{};
  myData.habits[wkey]=myData.habits[wkey]||{};
  myData.habits[wkey][habitName+'_'+di]=true;
  myData.streakShields--;
  showCyberToast('ESCUDO ATIVADO','// ICE -1 // Corrente de '+htmlEscape(habitName)+' restaurada.',6000);
  celebrate('day');
  renderConsistencyPanel();
  renderStreakShield();
  updateStats();
  scheduleAutoSave();
}

function renderStreakShield(){
  const el=document.getElementById('streak-shield');
  if(!el)return;
  const count=D().streakShields||0;
  const data=habitDataWithLiveWeek();
  let risk=null;
  getHabits().forEach(h=>{
    const s=habitStreak(data,h);
    if(habitStreakAtRisk(data,h)&&s>=3&&(!risk||s>risk.days))risk={name:h,days:s};
  });
  const broken=RO()?[]:brokenStreakHabits();
  el.className='streak-shield'+(risk?' at-risk':'');
  let html=`<div class="ss-tag">ESCUDOS ICE</div><div class="ss-count">🛡 ${count}</div>`;
  if(risk){
    html+=`<div class="ss-warn">Corrente de ${risk.days} dias (${htmlEscape(risk.name)}) expira hoje. Marque o habito ou use um escudo.</div>`;
  }else if(broken.length && count>0){
    html+=`<div class="ss-warn">Corrente de ${htmlEscape(broken[0])} quebrou ontem. Use um escudo para recuperar.</div>`;
  }else{
    html+=`<div class="ss-info">Cada corrente de 7 dias rende 1 escudo. Use ICE para salvar streaks quebradas.</div>`;
  }
  if(!RO()&&count>0&&(risk||broken.length)){
    const target=broken.length?broken[0]:(risk?risk.name:'');
    html+=`<button type="button" class="dq-btn ss-btn" onclick="useStreakShield('${jsString(target)}')">USAR ESCUDO</button>`;
  }
  el.innerHTML=html;
}

/* ============================================================
   FEATURE 2: bonus de login escalonado + loot drops diarios
   ============================================================ */
function checkLoginBonus(){
  if(RO())return;
  ensureRetentionData();
  if(myData.loginState.lastDate===dk())return;
  const y=new Date();y.setDate(y.getDate()-1);
  const yKey=localDateKey(y);
  myData.loginState.streak=(myData.loginState.lastDate===yKey)?(myData.loginState.streak+1):1;
  myData.loginState.lastDate=dk();
  const bonus=[10,15,20,30,40,50,75][Math.min(myData.loginState.streak-1,6)];
  const got=awardEddies(bonus,'login');
  myData.loginState.lastBonus=bonus;
  updateEddiesDisplay();
  showCyberToast('BEM-VINDO DE VOLTA','// DIA '+myData.loginState.streak+' // +€$'+got,6500);
  scheduleAutoSave();
}

const LOOT_TABLE=[
  {w:50,tier:'common',label:'+€$10',eddies:10},
  {w:25,tier:'common',label:'+€$20',eddies:20},
  {w:12,tier:'rare',label:'Escudo ICE +1',shield:1},
  {w:8,tier:'rare',label:'+€$40',eddies:40},
  {w:5,tier:'epic',label:'Fragmento de lore + €$75',eddies:75}
];
function rollLootDrop(){
  if(RO())return;
  ensureRetentionData();
  if(myData.lootState.lastDate===dk())return;
  const total=LOOT_TABLE.reduce((s,x)=>s+x.w,0);
  let roll=Math.random()*total,pick=LOOT_TABLE[0];
  for(const item of LOOT_TABLE){if(roll<item.w){pick=item;break;}roll-=item.w;}
  let granted=pick.label;
  if(pick.eddies){const g=awardEddies(pick.eddies,'loot');granted=pick.label.replace(/\d+/,String(g||0));}
  if(pick.shield){myData.streakShields+=pick.shield;}
  myData.lootState.lastDate=dk();
  myData.lootState.history.unshift({date:dk(),reward:granted,tier:pick.tier});
  myData.lootState.history=myData.lootState.history.slice(0,30);
  const copy=pick.tier==='epic'?'DROP LENDARIO // a cidade reconhece seu grind.'
           :pick.tier==='rare'?'DROP RARO // o ICE caiu pra voce.'
           :'DROP COMUM // eddies extras na conta.';
  celebrate(pick.tier==='common'?'day':'levelup');
  showCyberToast('LOOT DROP // '+granted,copy,7000);
  updateEddiesDisplay();
  renderStreakShield();
}

/* ============================================================
   FEATURE 3: Loja / Black Market (eddies, cosmeticos, escudos)
   ============================================================ */
const COSMETIC_THEMES={
  militech:{label:'Tema Militech',y:'#3ddc84',r:'#e00f3a',c:'#00d4ff',p:'#b44fff'},
  kangtao:{label:'Tema Kang Tao',y:'#ff8a3d',r:'#ff003c',c:'#ffd23d',p:'#b44fff'}
};
const SHOP_ITEMS=[
  {id:'shield',name:'Escudo ICE',desc:'Protege uma corrente quebrada.',cost:120,type:'shield'},
  {id:'theme_militech',name:'Tema Militech',desc:'Acento verde tatico.',cost:200,type:'theme',theme:'militech'},
  {id:'theme_kangtao',name:'Tema Kang Tao',desc:'Acento laranja corpo.',cost:200,type:'theme',theme:'kangtao'},
  {id:'frame_samurai',name:'Moldura Samurai',desc:'Borda vermelha Samurai ao redor do seu nome.',cost:150,type:'frame',value:'samurai'},
  {id:'title_lenda',name:'Titulo: Lenda de Night City',desc:'Exibido no seu perfil.',cost:400,type:'title',value:'LENDA DE NIGHT CITY'}
];
function shopItem(id){return SHOP_ITEMS.find(i=>i.id===id);}
function shopOwns(id){return (D().shopUnlocks||[]).includes(id);}

function applyCosmeticTheme(){
  const eq=(D().equippedCosmetics||{}).theme;
  if(!eq || !COSMETIC_THEMES[eq])return;
  const theme=COSMETIC_THEMES[eq];
  Object.entries(theme).forEach(([k,v])=>{if(k!=='label')document.documentElement.style.setProperty('--'+k,v);});
}

function cosmeticTitle(){
  const eq=(D().equippedCosmetics||{});
  const out=[];
  if(eq.frame){const it=SHOP_ITEMS.find(i=>i.type==='frame'&&i.id===eq.frame);if(it)out.push(it.value);}
  if(eq.title){const it=SHOP_ITEMS.find(i=>i.type==='title'&&i.id===eq.title);if(it)out.push(it.value);}
  return out;
}

function buyShopItem(id){
  if(RO())return;
  ensureRetentionData();
  const item=shopItem(id);
  if(!item)return;
  if(item.type==='shield'){
    if(!spendEddies(item.cost))return;
    myData.streakShields++;
    showCyberToast('ESCUDO COMPRADO','// ICE +1 // -€$'+item.cost,5200);
  }else{
    if(shopOwns(id)){showCyberToast('JA ADQUIRIDO','Use EQUIPAR para ativar.',3800);return;}
    if(!spendEddies(item.cost))return;
    myData.shopUnlocks.push(id);
    showCyberToast('ITEM DESBLOQUEADO',htmlEscape(item.name)+' // -€$'+item.cost,5200);
  }
  fxBlip('win');
  renderShop();
  renderStreakShield();
  updateStats();
  updateEddiesDisplay();
  scheduleAutoSave();
}

function equipCosmetic(id){
  if(RO())return;
  ensureRetentionData();
  const item=shopItem(id);
  if(!item || !shopOwns(id))return;
  const slot=item.type; // theme|frame|title
  const already=myData.equippedCosmetics[slot]===(item.theme||id);
  myData.equippedCosmetics[slot]=already?'':(item.theme||id);
  if(item.type==='theme'){
    if(already){applyTheme(currentTheme);}else{applyCosmeticTheme();}
  }
  showCyberToast(already?'COSMETICO REMOVIDO':'COSMETICO EQUIPADO',htmlEscape(item.name),4200);
  renderShop();
  updateStats();
  scheduleAutoSave();
}

function renderShop(){
  const grid=document.getElementById('shop-grid');
  if(!grid)return;
  updateEddiesDisplay();
  grid.innerHTML=SHOP_ITEMS.map(item=>{
    let btn;
    if(item.type==='shield' || !shopOwns(item.id)){
      btn=`<button type="button" class="shop-btn" onclick="buyShopItem('${item.id}')"${RO()?' disabled':''}>COMPRAR €$${item.cost}</button>`;
    }else{
      const slot=item.type;
      const equipped=(D().equippedCosmetics||{})[slot]===(item.theme||item.id);
      btn=`<button type="button" class="shop-btn${equipped?' equipped':''}" onclick="equipCosmetic('${item.id}')"${RO()?' disabled':''}>${equipped?'EQUIPADO ✓':'EQUIPAR'}</button>`;
    }
    return `<div class="shop-item"><div class="shop-name">${htmlEscape(item.name)}</div><div class="shop-desc">${htmlEscape(item.desc)}</div>${btn}</div>`;
  }).join('');
}

/* ============================================================
   FEATURE 4: Wrapped mensal + temporadas (seasons)
   ============================================================ */
function monthKeyOffset(offset=0){
  const n=new Date();
  const d=new Date(n.getFullYear(),n.getMonth()+offset,1);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
}
function currentMonthKey(){return monthKeyOffset(0);}

function buildWrappedStats(monthOffset=-1){
  const data=D();
  const mk=monthKeyOffset(monthOffset);
  const [yy,mm]=mk.split('-').map(Number);
  const prefix=mk+'-';
  let tasksDone=0,perfectDays=0;
  const weekdayCount=[0,0,0,0,0,0,0];
  const cachedDefs=allTaskDefs(data);
  Object.entries(data.tasks||{}).forEach(([dayKey,saved])=>{
    if(!String(dayKey).startsWith(prefix)||!saved)return;
    const date=new Date(dayKey+'T12:00:00');
    if(isNaN(date))return;
    const defs=cachedDefs.filter(t=>!t.archivedAt&&taskActiveOn(t,date));
    const done=Object.values(saved).filter(Boolean).length;
    tasksDone+=done;
    if(done)weekdayCount[date.getDay()]+=done;
    if(defs.length&&defs.every((_,i)=>saved[i]))perfectDays++;
  });
  const habits=getHabits();
  let bestHabit='--',bestHabitDays=0;
  habits.forEach(h=>{
    let c=0;
    for(let day=1;day<=31;day++){
      const date=new Date(yy,mm-1,day);
      if(date.getMonth()!==mm-1)break;
      if(habitDone(data,h,date))c++;
    }
    if(c>bestHabitDays){bestHabitDays=c;bestHabit=h;}
  });
  const eddiesEarned=mk===currentMonthKey()?(data.eddies||0):0;
  const reviews=Object.keys(data.dailyReviews||{}).filter(k=>String(k).startsWith(prefix)).length;
  const achievements=Object.values(data.achievements||{}).filter(a=>String(a?.at||'').slice(0,7)===mk).length;
  const credApprox=tasksDone+reviews*3+perfectDays*5+achievements*5;
  const wd=['DOM','SEG','TER','QUA','QUI','SEX','SAB'];
  let topDay='--',topDayN=0;
  weekdayCount.forEach((n,i)=>{if(n>topDayN){topDayN=n;topDay=wd[i];}});
  return {monthKey:mk,label:wrappedLabel(mk),tasksDone,perfectDays,bestHabit,bestHabitDays,reviews,achievements,credApprox,eddiesEarned,topDay};
}

function wrappedLabel(mk){
  const months=['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
  const [y,m]=mk.split('-').map(Number);
  return months[m-1]+' '+y;
}

function showWrapped(monthOffset=-1){
  const modal=document.getElementById('wrapped-modal');
  const body=document.getElementById('wrapped-body');
  if(!modal||!body)return;
  const s=buildWrappedStats(monthOffset);
  body.innerHTML=`
    <div class="wrapped-kicker">// RECAP MENSAL //</div>
    <div class="wrapped-title">${htmlEscape(s.label)} WRAPPED</div>
    <div class="wrapped-grid">
      <div class="wrapped-kpi"><b>${s.tasksDone}</b><span>CONTRATOS FEITOS</span></div>
      <div class="wrapped-kpi"><b>${s.perfectDays}</b><span>DIAS PERFEITOS</span></div>
      <div class="wrapped-kpi"><b>${s.reviews}</b><span>DIAS FECHADOS</span></div>
      <div class="wrapped-kpi"><b>${s.achievements}</b><span>CONQUISTAS</span></div>
      <div class="wrapped-kpi"><b>+${s.credApprox}</b><span>REP (APROX)</span></div>
      <div class="wrapped-kpi"><b>€$${s.eddiesEarned}</b><span>EDDIES</span></div>
      <div class="wrapped-kpi wide"><b>${htmlEscape(s.bestHabit)}</b><span>MELHOR HABITO // ${s.bestHabitDays} DIAS</span></div>
      <div class="wrapped-kpi wide"><b>${htmlEscape(s.topDay)}</b><span>DIA MAIS ATIVO</span></div>
    </div>`;
  modal.classList.add('on');
}
function closeWrapped(){document.getElementById('wrapped-modal')?.classList.remove('on');}
function maybeAutoWrapped(){
  if(RO())return;
  ensureRetentionData();
  const cmk=currentMonthKey();
  if(myData.wrappedSeen===cmk)return;
  myData.wrappedSeen=cmk;
  scheduleAutoSave();
  const s=buildWrappedStats(-1);
  if(s.tasksDone||s.reviews||s.perfectDays)setTimeout(()=>showWrapped(-1),1200);
}

const SEASON_TIERS=[
  {at:0,name:'STREET KID'},
  {at:80,name:'OPERADOR',reward:{eddies:25}},
  {at:200,name:'FIXER',reward:{eddies:50}},
  {at:400,name:'LENDA',reward:{shield:1}}
];
function seasonName(){return 'SEASON '+currentMonthKey().replace('-','.');}
function seasonScore(){
  const data=D();
  const prefix=currentMonthKey()+'-';
  let n=0;
  Object.entries(data.tasks||{}).forEach(([k,saved])=>{
    if(!String(k).startsWith(prefix)||!saved)return;
    n+=Object.values(saved).filter(Boolean).length;
  });
  return n;
}
function seasonState(){
  const score=seasonScore();
  let tier=SEASON_TIERS[0],next=null;
  for(let i=0;i<SEASON_TIERS.length;i++){
    if(score>=SEASON_TIERS[i].at)tier=SEASON_TIERS[i];
    else{next=SEASON_TIERS[i];break;}
  }
  const span=next?next.at-tier.at:1;
  const into=score-tier.at;
  return {score,tier,next,pct:next?Math.min(100,Math.round(into/span*100)):100};
}
function checkSeasonTiers(){
  if(RO())return;
  ensureRetentionData();
  const cmk=currentMonthKey();
  myData.seasonData=myData.seasonData||{};
  if(myData.seasonData.month!==cmk)myData.seasonData={month:cmk,claimed:[]};
  if(!Array.isArray(myData.seasonData.claimed))myData.seasonData.claimed=[];
  const score=seasonScore();
  SEASON_TIERS.forEach(t=>{
    if(!t.reward||score<t.at||myData.seasonData.claimed.includes(t.at))return;
    myData.seasonData.claimed.push(t.at);
    if(t.reward.eddies){const g=awardEddies(t.reward.eddies,'season');showCyberToast('TIER DE SEASON // '+t.name,'+€$'+g+' // '+seasonName(),6000);}
    if(t.reward.shield){myData.streakShields+=t.reward.shield;showCyberToast('TIER DE SEASON // '+t.name,'ICE +'+t.reward.shield+' // '+seasonName(),6000);}
    updateEddiesDisplay();
    renderStreakShield();
  });
}
function renderSeasonBanner(){
  const el=document.getElementById('season-banner');
  if(!el)return;
  const st=seasonState();
  el.innerHTML=`
    <div class="season-main"><span>${seasonName()}</span><b>${st.tier.name}</b></div>
    <div class="season-bar"><div class="season-fill" style="width:${st.pct}%"></div></div>
    <div class="season-note">${st.next?st.score+'/'+st.next.at+' contratos p/ '+st.next.name:'TIER MAXIMO // '+st.score+' contratos'}</div>`;
}

function applyData(){
  ensureRetentionData();
  document.body.classList.toggle('autopilot-on',!!myData.profile?.autoPilot && !RO());
  ['book-form-wrap','proj-form-wrap','devlog-form-wrap','glog-form-wrap','game-form-wrap','ref-form','routine-edit-form','task-edit-form','habit-edit-form','goals-edit-form','dev-skill-edit-form','guitar-skill-edit-form','district-edit-form'].forEach(id=>{
    const el=document.getElementById(id);if(el && RO())el.style.display='none';
  });
  renderTasks();
  if(!RO()) syncTodayHabitsFromTasks(false);
  renderGoals();
  renderReminders();
  renderHabitsTable();
  renderConsistencyPanel();
  renderRoutines();
  renderDistricts();
  renderPageObjectives();
  renderExtraPages();
  renderNavTabs();
  renderSystemStatus();
  renderHomeQuickbar();
  renderDailyPanel();
  renderDailyQuest();
  renderWeeklyChallenge();
  renderStreakShield();
  renderShop();
  renderSeasonBanner();
  updateEddiesDisplay();
  renderDailyQuote();
  renderAchievements();
  renderProgressiveHints();
  if(localStorage.getItem('nc_compact'))document.body.classList.add('compact-tasks');
  renderTodayMode();
  if(!_todayModeInit){_todayModeInit=true;setTodayMode(localStorage.getItem('nc_today_mode')!=='0',false);}
  enhanceClickableControls();
  if(!RO()){updatePeakStreak();checkShieldMilestones();checkWeeklyFreeShield();checkLoginBonus();checkSeasonTiers();maybeAutoWrapped();checkAchievements();}
}

/* ============================================================
   MODO HOJE: tela focada no ciclo diario (progressive disclosure).
   Mostra so: proxima acao, contratos de hoje, progresso, revisao, recompensa.
   Reaproveita a lista de tarefas real (#task-list) movendo-a para o card.
   ============================================================ */
function setTodayMode(on,persist=true){
  const card=document.getElementById('today-mode-card');
  if(!card)return;
  document.body.classList.toggle('today-mode',on);
  const list=document.getElementById('task-list');
  const holder=document.getElementById('tm-tasks');
  if(on){
    if(list && holder && list.parentElement!==holder){
      _taskListHome={parent:list.parentElement,next:list.nextSibling};
      holder.appendChild(list);
    }
  }else if(list && _taskListHome && _taskListHome.parent){
    _taskListHome.parent.insertBefore(list,_taskListHome.next);
    _taskListHome=null;
  }
  if(persist)localStorage.setItem('nc_today_mode',on?'1':'0');
  renderTodayMode();
}
function toggleTodayMode(on){
  if(typeof on!=='boolean')on=!document.body.classList.contains('today-mode');
  setTodayMode(on,true);
  window.scrollTo({top:0,behavior:'smooth'});
}
// Avanca para a proxima tarefa pendente sem marcar como concluida.
function snoozeMission(){
  const pending=todayPendingFull();
  if(pending.length<2)return;
  _missionOffset=(_missionOffset+1)%pending.length;
  renderTodayMode();
  fxBlip('tick');
}

// Inicia a missao (cosmetic: marca card em progresso sem salvar dado).
function startMission(){
  const btn=document.getElementById('tm-start-btn');
  if(btn){btn.textContent='EM PROGRESSO...';btn.disabled=true;btn.id='tm-start-btn-active';}
  const mText=document.querySelector('#tm-next .tm-mission-text');
  if(mText)mText.style.color='var(--y)';
}

// Conclui a missao atual diretamente pelo card do Modo Hoje.
function completeMissionDirect(){
  if(RO())return;
  const pending=todayPendingFull();
  if(!pending.length)return;
  const task=pending[_missionOffset%pending.length];
  if(!task)return;
  const taskEls=document.querySelectorAll('#task-list .task');
  const el=taskEls[task.i];
  if(el&&!el.classList.contains('done')){
    el.classList.add('done');
    triggerFx(el,'fx-done',430);
  }
  _missionOffset=0;
  syncTodayTasksFromDom();
  syncTodayHabitsFromTasks();
  updateStats();
  const et=awardEddies(3,'task');
  updateEddiesDisplay();
  checkAchievements();
  scheduleAutoSave();
  // Contextual feedback + undo
  const snap=todayTaskSnapshot();
  const remaining=snap.pending.length;
  let sub='+1 REP'+(et?' // +€$'+et:'');
  if(snap.done.length===1) sub='Boa. Primeiro contrato fechado. '+sub;
  else if(remaining===0) sub='Dia limpo. Todos os contratos encerrados.';
  else if(remaining===1) sub='Falta 1 contrato para limpar o dia. '+sub;
  else sub='Faltam '+remaining+' contratos. '+sub;
  const _el=el;
  showActionToast('CONTRATO ENCERRADO',sub,'DESFAZER',()=>{
    if(_el){_el.classList.remove('done');syncTodayTasksFromDom();syncTodayHabitsFromTasks();updateStats();scheduleAutoSave();}
  },5000);
}

function renderTodayMode(){
  const card=document.getElementById('today-mode-card');
  if(!card)return;
  const snap=todayTaskSnapshot();
  const total=snap.total,done=snap.done.length,pct=total?Math.round(done/total*100):0;
  const nextEl=document.getElementById('tm-next');
  if(nextEl){
    const pending=todayPendingFull();
    if(!total){
      nextEl.className='tm-next';
      nextEl.innerHTML='<div class="tm-next-label">COMECE AQUI</div><div class="tm-next-text">Monte seus contratos do dia para destravar o ciclo.</div>';
    } else if(!pending.length){
      nextEl.className='tm-next done';
      nextEl.innerHTML='<div class="tm-next-label">DIA LIMPO ✓</div><div class="tm-next-text">Todos os contratos fechados. Feche o dia com a revisao.</div>';
    } else {
      const mIdx=_missionOffset%pending.length;
      const mission=pending[mIdx];
      const peak=(D().prefs||{}).peakStreak||0;
      const recovering=maxStreak()===0&&peak>=3;
      const recoverHtml=recovering
        ?'<div class="tm-recover">Corrente quebrada. Sua melhor foi '+peak+' dias. Recomece com 1 contrato.</div>'
        :'';
      const paginator=pending.length>1?'<span class="tm-paginator">'+(mIdx+1)+'/'+pending.length+'</span>':'';
      nextEl.className='tm-next active';
      nextEl.innerHTML=recoverHtml+
        '<div class="tm-mission-head"><div class="tm-next-label">MISSAO ATUAL '+paginator+'</div></div>'+
        '<div class="tm-mission-text">'+htmlEscape(mission.text)+'</div>'+
        (mission.tag?'<div class="tm-mission-tag">'+htmlEscape(mission.tag)+'</div>':'')+
        '<div class="tm-mission-reward">Recompensa: +1 REP // +€$3</div>'+
        '<div class="tm-actions">'+
          '<button type="button" id="tm-start-btn" class="tm-btn tm-btn-start" onclick="startMission()">COMEÇAR</button>'+
          '<button type="button" class="tm-btn tm-btn-skip" onclick="snoozeMission()">ADIAR</button>'+
          '<button type="button" class="tm-btn tm-btn-done" onclick="completeMissionDirect()">CONCLUIR ✓</button>'+
        '</div>';
    }
  }
  const prog=document.getElementById('tm-progress');
  if(prog)prog.innerHTML='<div class="tm-bar"><div class="tm-bar-fill" style="width:'+pct+'%"></div></div><div class="tm-count">'+done+'/'+total+' contratos // '+pct+'%</div>';
  const rew=document.getElementById('tm-reward');
  if(rew){
    const cred=streetCredScore();
    const rank=streetCredRank(cred);
    const streak=topStreakInfo().days;
    rew.innerHTML='<span class="tm-chip cred">€$ '+cred+' CRED</span><span class="tm-chip rank">'+htmlEscape(String(rank).toUpperCase())+'</span>'+(streak>0?'<span class="tm-chip streak">🔥 '+streak+'D STREAK</span>':'');
  }
}

// Guarda a maior corrente ja atingida (para o modo recuperacao).
function updatePeakStreak(){
  if(RO())return;
  const cur=maxStreak();
  const peak=myData.prefs?.peakStreak||0;
  if(cur>peak)myData.prefs={...(myData.prefs||{}),peakStreak:cur};
}

function friendId(){
  if(myData.friendTarget && String(myData.friendTarget).trim())return String(myData.friendTarget).trim();
  const first=friendList()[0];
  if(first)return first;
  return '';
}

function friendList(){
  const out=[];
  const push=id=>{
    id=String(id||'').trim();
    if(id && id!==me && !out.includes(id))out.push(id);
  };
  (Array.isArray(myData.friendTargets)?myData.friendTargets:[]).forEach(push);
  push(myData.friendTarget);
  return out;
}

function friendLabel(id){
  return (PROFILES[id]?.name || displayNameFromEmail(id)).toUpperCase();
}

function friendAccessStatus(data, requester){
  const req=(data.friendRequests||{})[requester];
  return req && req.status ? req.status : null;
}

const FRIEND_PERMISSION_AREAS=[
  {id:'home',label:'Home',keys:['tasks','habits','taskDefs','habitDefs','routines','goals','lastSeenWeek']},
  {id:'leitura',label:'Leitura',keys:['books']},
  {id:'dev',label:'Dev',keys:['projects','devlog','skills','skillDefs']},
  {id:'violao',label:'Violao',keys:['guitarlog','guitarSkillDefs','skills']},
  {id:'jogos',label:'Jogos',keys:['games']},
  {id:'reflexoes',label:'Reflexoes',keys:['reflexoes']},
  {id:'distritos',label:'Distritos',keys:['districts']},
  {id:'custom',label:'Paginas custom',keys:['customPages','pageObjectives']}
];

function defaultFriendPermissions(){
  return FRIEND_PERMISSION_AREAS.reduce((acc,a)=>{acc[a.id]=true;return acc;},{});
}

function getFriendPermissions(data=myData){
  return {...defaultFriendPermissions(),...(data.friendPermissions||{})};
}

function areaAllowed(perms, area){
  return perms[String(area||'')] !== false;
}

function applyFriendVisibility(raw){
  const src=raw||{};
  const perms=getFriendPermissions(src);
  const out=JSON.parse(JSON.stringify(src));
  const allowedKeys=new Set();
  FRIEND_PERMISSION_AREAS.forEach(area=>{
    if(areaAllowed(perms,area.id))area.keys.forEach(k=>allowedKeys.add(k));
  });
  FRIEND_PERMISSION_AREAS.forEach(area=>{
    if(areaAllowed(perms,area.id))return;
    area.keys.forEach(k=>{if(!allowedKeys.has(k))delete out[k];});
  });
  out.friendPermissions=perms;
  out.profile=src.profile||{};
  return out;
}

function profileSummary(data={}, username=''){
  const p=data.profile||{};
  const fp=PROFILES[username]||{};
  const name=String(p.name||fp.name||displayNameFromEmail(username)).slice(0,28);
  const status=String(p.status||fp.role||'OPERADOR').slice(0,32);
  const bio=String(p.bio||'Perfil Night City ainda sem bio.').slice(0,180);
  const publicStats=data.publicStats||{};
  const booksDone=Number(publicStats.booksDone ?? (data.books||[]).filter(x=>x.status==='done').length);
  const projectsDone=Number(publicStats.projectsDone ?? (data.projects||[]).filter(x=>x.status==='done').length);
  const gamesDone=Number(publicStats.gamesDone ?? (data.games||[]).filter(x=>x.status==='done').length);
  const logsDone=Number(publicStats.logsDone ?? ((data.devlog||[]).length+(data.guitarlog||[]).length));
  const level=Math.max(1,Math.min(99,1+Math.floor((booksDone*3+projectsDone*5+gamesDone*3+logsDone)/10)));
  const counts=[
    ['Livros lidos',booksDone],
    ['Projetos feitos',projectsDone],
    ['Jogos zerados',gamesDone],
    ['Logs',logsDone]
  ];
  return {name,status,bio,level,counts};
}

function normalizeNick(value){
  return String(value||'')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9_]/g,'')
    .slice(0,18);
}

function tagForUser(username=me){
  if(isCreatorUser(username))return '01';
  const raw=String(username||'');
  let hash=0;
  for(let i=0;i<raw.length;i++)hash=(hash*31+raw.charCodeAt(i))>>>0;
  return String(hash%10000).padStart(4,'0');
}

function profileNick(data=myData, username=me){
  const p=data.profile||{};
  return normalizeNick(p.nick || p.name || PROFILES[username]?.name || displayNameFromEmail(username)) || 'runner';
}

function friendHandle(data=myData, username=me){
  return profileNick(data,username)+'#'+tagForUser(username);
}

function publicProfilePayload(username=me,data=myData){
  const p=profileSummary(data,username);
  return {
    owner:username,
    nick:profileNick(data,username),
    tag:tagForUser(username),
    name:p.name,
    status:p.status,
    bio:p.bio,
    level:p.level,
    books_done:Number(p.counts[0]?.[1]||0),
    projects_done:Number(p.counts[1]?.[1]||0),
    games_done:Number(p.counts[2]?.[1]||0),
    logs_done:Number(p.counts[3]?.[1]||0),
    provider_google:false,
    updated_at:new Date().toISOString()
  };
}

function dataFromPublicProfile(row){
  if(!row)return null;
  return {
    profile:{name:row.name||'',nick:row.nick||'',status:row.status||'',bio:row.bio||'',setupDone:true},
    publicStats:{
      booksDone:Number(row.books_done||0),
      projectsDone:Number(row.projects_done||0),
      gamesDone:Number(row.games_done||0),
      logsDone:Number(row.logs_done||0)
    }
  };
}

async function upsertPublicFriendProfile(){
  if(!sb || !me)return;
  const payload=publicProfilePayload(me,myData);
  payload.provider_google=await currentAuthUsesGoogle();
  try{await sb.from('friend_profiles').upsert(payload,{onConflict:'owner'});}catch(e){console.warn('Falha ao publicar perfil:',e);}
}

async function getPublicFriendProfile(id){
  if(!sb || !id)return null;
  try{
    const {data,error}=await sb.from('friend_profiles').select('owner,nick,tag,name,status,bio,level,books_done,projects_done,games_done,logs_done,provider_google,updated_at').eq('owner',id).maybeSingle();
    if(error)throw error;
    const out=dataFromPublicProfile(data);
    if(out)ensureRuntimeProfileFromData(id,out);
    return out;
  }catch(e){return null;}
}

async function resolveFriendLookup(value){
  const raw=String(value||'').trim();
  if(!raw)return '';
  const match=raw.match(/^([a-zA-Z0-9_]{2,18})#(01|\d{4})$/);
  if(!match)return raw;
  const nick=normalizeNick(match[1]);
  const tag=match[2];
  try{
    const {data,error}=await sb.from('friend_profiles').select('owner,nick,tag,name').eq('nick',nick).eq('tag',tag).maybeSingle();
    if(error)throw error;
    return data?.owner || '';
  }catch(e){return '';}
}

function ensureRuntimeProfileFromData(username,data={}){
  if(!username)return;
  const p=data.profile||{};
  if(p.name || !PROFILES[username]){
    setRuntimeProfile(username,{
      name:p.name || displayNameFromEmail(username),
      avatar:p.avatar || '◎',
      role:p.status || 'OPERADOR'
    });
  }
}

function friendStatusLabel(status){
  if(status==='approved')return 'ACESSO LIBERADO';
  if(status==='pending')return 'AGUARDANDO RESPOSTA';
  if(status==='denied')return 'ACESSO RECUSADO';
  return 'CANAL FECHADO';
}

function friendMsg(kind, head, text){
  return `<div class="friend-msg ${htmlEscape(kind)}"><div class="friend-msg-head">${htmlEscape(head)}</div><div class="friend-msg-text">${htmlEscape(text)}</div></div>`;
}

function friendProfileCard(data, username, isMine=false){
  const p=profileSummary(data,username);
  return `<div class="steam-profile-card">
    <div class="steam-cover"></div>
    <div class="steam-profile-main no-avatar">
      <div class="steam-info">
        <div class="steam-name">${htmlEscape(p.name)}</div>
        <div class="steam-status">${htmlEscape(p.status)}</div>
        <div class="steam-bio">${htmlEscape(p.bio)}</div>
      </div>
      <div class="steam-level"><span>LVL</span><b>${String(p.level).padStart(2,'0')}</b></div>
    </div>
    <div class="steam-stats">${p.counts.map(c=>`<div><span>${htmlEscape(c[0])}</span><b>${c[1]}</b></div>`).join('')}</div>
  </div>`;
}

function friendProfileEditor(profile={}){
  const fallbackName=(profile.name || PROFILES[me]?.name || displayNameFromEmail(me) || '').replace(/^OPERADOR$/,'');
  const nick=profileNick({profile},me);
  return `<div class="friend-profile-editor">
    <div class="friend-editor-title">PERFIL PUBLICO</div>
    <div class="friend-editor-grid profile-only">
      <label>Nome<input id="friend-profile-name" maxlength="28" value="${htmlEscape(fallbackName)}" placeholder="Seu nome publico"></label>
      <label>Status<input id="friend-profile-status" maxlength="32" value="${htmlEscape(profile.status||'')}" placeholder="ex: Online / Treinando"></label>
      <label>Nick<input id="friend-profile-nick" maxlength="18" value="${htmlEscape(nick)}" placeholder="ex: caio"></label>
      <label>Tag<input value="${htmlEscape(tagForUser(me))}" readonly></label>
    </div>
    <div class="friend-id-chip">SEU NICK: <b>${htmlEscape(nick)}#${htmlEscape(tagForUser(me))}</b></div>
    <label class="friend-editor-bio">Bio<textarea id="friend-profile-bio" maxlength="180" placeholder="Resumo do seu perfil...">${htmlEscape(profile.bio||'')}</textarea></label>
    <button class="friend-chat-btn primary" type="button" onclick="saveOwnFriendProfile()">SALVAR PERFIL</button>
  </div>`;
}

function friendTabs(){
  return `<div class="friend-tabs">
    <button class="active" type="button">${friendPanelTab==='profile'?'PERFIL':friendPanelTab==='chat'?'CHAT':'AMIGOS'}</button>
  </div>`;
}

function friendAddPanel(){
  const currentFriend='';
  return `<div class="friend-add-panel">
    <div class="friend-editor-title">ADICIONAR AMIGO</div>
    <label>NICK#TAG OU ID<input id="friend-target-id" value="${htmlEscape(currentFriend)}" placeholder="ex: caio#4821 ou ID da conta"></label>
    <div class="friend-id-row">
      <div class="friend-id-chip">SEU NICK: <b>${htmlEscape(friendHandle(myData,me))}</b><br>SEU ID: <b>${htmlEscape(me||'')}</b></div>
      <button class="friend-chat-btn" type="button" onclick="copyOwnFriendId()">COPIAR ID</button>
    </div>
    <button class="friend-chat-btn primary" type="button" onclick="saveFriendTarget()">SALVAR AMIGO</button>
  </div>`;
}

function friendContactList(){
  const list=friendList();
  if(!list.length)return `<div class="friend-contact-panel">
    <div class="friend-editor-title">CONTATOS</div>
    <div class="friend-contact-empty">NENHUM CONTATO</div>
  </div>`;
  return `<div class="friend-contact-panel">
    <div class="friend-editor-title">CONTATOS</div>
    <div class="friend-contact-list">
      ${list.map(id=>`<button class="friend-contact ${id===friendId()?'active':''}" type="button" onclick="selectFriendContact('${jsString(id)}')">
        <span>${htmlEscape(friendLabel(id))}</span>
        <b>${id===friendId()?'CANAL ATIVO':'SELECIONAR'}</b>
      </button>`).join('')}
    </div>
  </div>`;
}

function friendSuggestionPanel(){
  return `<div class="friend-contact-panel friend-proximity-panel">
    <div class="friend-editor-title">AMIGOS POR PROXIMIDADE</div>
    <div id="friend-suggestions" class="friend-contact-list">
      ${renderFriendSuggestionRows()}
    </div>
  </div>`;
}

function renderFriendSuggestionRows(){
  if(!friendSuggestions.length)return `<div class="friend-contact-empty">${friendSuggestionsLoaded?'NENHUM PERFIL PROXIMO':'BUSCANDO PERFIS PUBLICOS...'}</div>`;
  return friendSuggestions.map(s=>`
    <button class="friend-contact proximity ${s.google?'google':''}" type="button" onclick="addSuggestedFriend('${jsString(s.id)}')">
      <span>${htmlEscape(s.name||friendLabel(s.id))}</span>
      <b>${s.tip?'DICA':s.google?'GOOGLE':'PUBLICO'}</b>
    </button>`).join('');
}

function renderFriendSuggestions(){
  const el=document.getElementById('friend-suggestions');
  if(el)el.innerHTML=renderFriendSuggestionRows();
}

async function currentAuthUsesGoogle(){
  try{
    const {data}=await sb.auth.getSession();
    const identities=data?.session?.user?.identities||[];
    return identities.some(i=>String(i.provider||'').toLowerCase()==='google');
  }catch(e){return false;}
}

async function loadFriendSuggestions(){
  friendSuggestionsLoaded=false;
  renderFriendSuggestions();
  const known=(typeof knownAuthAccounts==='function'?knownAuthAccounts():[])
    .filter(a=>a?.id && a.id!==me)
    .map(a=>({id:a.id,name:(a.name||a.email||a.id)+' #'+tagForUser(a.id),google:/(gmail|google)/i.test(a.email||'')}));
  let rows=[];
  try{
    const {data}=await sb.from('friend_profiles')
      .select('owner,nick,tag,name,status,provider_google,updated_at')
      .neq('owner',me)
      .order('updated_at',{ascending:false})
      .limit(24);
    rows=(data||[]).map(r=>({id:r.owner,name:(r.nick&&r.tag?`${r.nick}#${r.tag}`:(r.name||displayNameFromEmail(r.owner))),google:!!r.provider_google}));
  }catch(e){console.warn('Falha ao carregar sugestoes de amigos:',e);}
  const seen=new Set(friendList().concat([me]));
  friendSuggestions=[];
  [...known,...rows].sort((a,b)=>(b.google?1:0)-(a.google?1:0)).forEach(item=>{
    if(!item.id || seen.has(item.id) || friendSuggestions.some(x=>x.id===item.id))return;
    friendSuggestions.push(item);
  });
  const google=await currentAuthUsesGoogle();
  if(!google){
    friendSuggestions.unshift({id:'__google_tip__',name:'Use login Google para encontrar amigos com mais facilidade',google:false,tip:true});
  }
  friendSuggestionsLoaded=true;
  renderFriendSuggestions();
}

async function addSuggestedFriend(id){
  if(id==='__google_tip__'){
    renderFriendChat(null,'Dica: crie ou entre com Google para deixar sua conta mais facil de identificar nas sugestoes.');
    return;
  }
  const input=document.getElementById('friend-target-id');
  if(input)input.value=id;
  await saveFriendTarget();
}

function friendProfilePanel(){
  return `<div class="friend-setup-panel profile-tab">
    ${friendProfileCard(myData,me,true)}
    ${friendProfileEditor(myData.profile||{})}
    ${friendPermissionSummary()}
  </div>`;
}

function friendPermissionSummary(targetData=null){
  const perms=getFriendPermissions(myData);
  const visible=FRIEND_PERMISSION_AREAS.filter(a=>areaAllowed(perms,a.id)).map(a=>a.label).join(', ') || 'Nada';
  const locked=FRIEND_PERMISSION_AREAS.filter(a=>!areaAllowed(perms,a.id)).map(a=>a.label).join(', ') || 'Nenhuma area';
  const toggles=FRIEND_PERMISSION_AREAS.map(a=>`
    <label class="friend-perm-toggle ${areaAllowed(perms,a.id)?'on':''}">
      <input type="checkbox" ${areaAllowed(perms,a.id)?'checked':''} onchange="updateFriendPermission('${a.id}',this.checked)">
      <span>${htmlEscape(a.label)}</span>
    </label>`).join('');
  return `<div class="friend-permissions">
    <span>PERMISSOES DO MEU PERFIL</span>
    <b>VISIVEL PARA AMIGOS: ${htmlEscape(visible)}.</b>
    <b>BLOQUEADO: ${htmlEscape(locked)}. Edicao, checks, salvar e backup continuam bloqueados no modo amigo.</b>
    <div class="friend-perm-grid">${toggles}</div>
  </div>`;
}

async function saveOwnFriendProfile(){
  if(!me || RO())return;
  myData.profile=myData.profile||{};
  myData.profile.name=document.getElementById('friend-profile-name')?.value.trim().slice(0,28)||'';
  myData.profile.nick=normalizeNick(document.getElementById('friend-profile-nick')?.value||myData.profile.name);
  myData.profile.status=document.getElementById('friend-profile-status')?.value.trim().slice(0,32)||'';
  myData.profile.bio=document.getElementById('friend-profile-bio')?.value.trim().slice(0,180)||'';
  myData.profile.setupDone=true;
  await dbSet(me,'profile',myData.profile);
  setRuntimeProfile(me,{name:myData.profile.name,avatar:myData.profile.avatar,role:myData.profile.status});
  await upsertPublicFriendProfile();
  setProfileSetupHint(needsAccountSetup());
  renderFriendChat(await safeFriendData(),'Perfil atualizado.');
}

async function saveFriendTarget(){
  if(!me || RO())return;
  const lookup=document.getElementById('friend-target-id')?.value.trim()||'';
  const id=await resolveFriendLookup(lookup);
  if(!id){
    renderFriendChat(null,'Nick/tag nao encontrado. Confirme se o amigo ja entrou no app pelo menos uma vez.');
    return;
  }
  if(id===me){
    renderFriendChat(await safeFriendData(),'Esse e o seu proprio ID. Cole o ID do amigo.');
    return;
  }
  myData.friendTargets=friendList();
  if(!myData.friendTargets.includes(id))myData.friendTargets.unshift(id);
  myData.friendTarget=id;
  await Promise.all([dbSet(me,'friendTargets',myData.friendTargets),dbSet(me,'friendTarget',myData.friendTarget)]);
  renderFriendChat(await safeFriendData(),'Amigo salvo. Selecione o contato para conversar.');
}

async function selectFriendContact(id){
  if(!me || RO())return;
  id=String(id||'').trim();
  if(!id)return;
  myData.friendTargets=friendList();
  if(!myData.friendTargets.includes(id))myData.friendTargets.unshift(id);
  myData.friendTarget=id;
  friendPanelTab='chat';
  await dbSet(me,'friendTarget',myData.friendTarget);
  renderFriendChat(await safeFriendData());
}

function backToFriendList(){
  stopFriendRealtime();
  friendPanelTab='friends';
  renderFriendChat(null);
  loadFriendSuggestions();
}

async function copyOwnFriendId(){
  const id=me||'';
  if(!id)return;
  try{await navigator.clipboard.writeText(id);}catch(e){}
  renderFriendChat(await safeFriendData(),'Seu ID foi copiado. Envie para o amigo colar no Commlink dele.');
}

async function updateFriendPermission(area,allowed){
  if(!me || RO())return;
  myData.friendPermissions=getFriendPermissions(myData);
  myData.friendPermissions[area]=!!allowed;
  await dbSet(me,'friendPermissions',myData.friendPermissions);
  renderFriendChat(await safeFriendData(),'Permissoes atualizadas.');
}

async function safeFriendData(){
  if(!friendId())return null;
  const publicData=await getPublicFriendProfile(friendId());
  if(publicData)return publicData;
  try{
    const data=await dbGet(friendId());
    ensureRuntimeProfileFromData(friendId(),data);
    return data;
  }catch(e){return null;}
}

function friendChannelId(a=me,b=friendId()){
  return [String(a||''),String(b||'')].sort().join('__');
}

function stopFriendRealtime(){
  if(friendMessagePollTimer){
    clearInterval(friendMessagePollTimer);
    friendMessagePollTimer=null;
  }
  if(friendMessageChannel && sb){
    try{sb.removeChannel(friendMessageChannel);}catch(e){}
  }
  friendMessageChannel=null;
  friendMessageChannelId='';
}

function startFriendRealtime(){
  if(!sb || !me || !friendId() || friendPanelTab!=='chat')return;
  const channelId=friendChannelId();
  if(friendMessageChannel && friendMessageChannelId===channelId)return;
  stopFriendRealtime();
  friendMessageChannelId=channelId;
  try{
    friendMessageChannel=sb.channel('friend_messages_'+channelId)
      .on('postgres_changes',{
        event:'INSERT',
        schema:'public',
        table:'friend_messages',
        filter:'channel_id=eq.'+channelId
      },payload=>{
        const row=payload?.new;
        if(!row || row.channel_id!==friendChannelId())return;
        refreshFriendMessages();
      })
      .subscribe(status=>{
        const el=document.getElementById('friend-realtime-status');
        if(el)el.textContent=status==='SUBSCRIBED'?'TEMPO REAL':'SYNC '+status;
      });
  }catch(e){
    friendMessageChannel=null;
  }
  friendMessagePollTimer=setInterval(()=>{
    if(friendPanelTab==='chat' && document.getElementById('friend-message-list'))refreshFriendMessages();
  },5000);
}

async function loadFriendMessages(){
  if(!sb || !me || !friendId())return [];
  const {data,error}=await sb.from('friend_messages')
    .select('id,sender,receiver,body,created_at')
    .eq('channel_id',friendChannelId())
    .order('created_at',{ascending:true})
    .limit(80);
  if(error)throw error;
  return data||[];
}

function renderFriendMessageRows(rows=[]){
  const el=document.getElementById('friend-message-list');
  if(!el)return;
  if(!friendId()){
    el.innerHTML=friendMsg('system','SEM AMIGO','Cole o ID do amigo acima para abrir o chat.');
    return;
  }
  if(!rows.length){
    el.innerHTML=friendMsg('system','CHAT VAZIO','Envie a primeira mensagem para iniciar o canal.');
    return;
  }
  el.innerHTML=rows.map(m=>friendMsg(m.sender===me?'me':'friend',m.sender===me?(PROFILES[me]?.name||'EU'):(PROFILES[friendId()]?.name||'AMIGO'),m.body)).join('');
  el.scrollTop=el.scrollHeight;
}

async function refreshFriendMessages(){
  try{renderFriendMessageRows(await loadFriendMessages());}
  catch(e){renderFriendMessageRows([]);}
}

async function sendFriendMessage(){
  if(!me || !friendId())return;
  const input=document.getElementById('friend-message-input');
  const body=String(input?.value||'').trim().slice(0,500);
  if(!body)return;
  if(input)input.value='';
  const {error}=await sb.from('friend_messages').insert({
    channel_id:friendChannelId(),
    sender:me,
    receiver:friendId(),
    body
  });
  if(error){
    renderFriendChat(await safeFriendData(),'Erro ao enviar mensagem: '+error.message);
    return;
  }
  await refreshFriendMessages();
  startFriendRealtime();
}

function friendChatPanel(targetData=null){
  if(friendPanelTab==='friends')return `<div class="friend-chat-layout">
    ${friendAddPanel()}
    ${friendContactList()}
    ${friendSuggestionPanel()}
  </div>`;
  const name=friendLabel(friendId());
  return `<div class="friend-message-screen">
    <div class="friend-message-headline">
      <button class="friend-chat-btn" type="button" onclick="backToFriendList()">VOLTAR</button>
      <div>
        <div class="friend-section-title">MENSAGENS</div>
        <strong>${htmlEscape(name)}</strong>
        <span class="friend-realtime-status" id="friend-realtime-status">SYNC...</span>
      </div>
    </div>
    <div class="friend-message-panel solo">
      <div class="friend-message-list" id="friend-message-list"></div>
      <div class="friend-message-compose">
        <input id="friend-message-input" maxlength="500" placeholder="Enviar mensagem..." onkeydown="if(event.key==='Enter')sendFriendMessage()">
        <button class="friend-chat-btn primary" onclick="sendFriendMessage()">ENVIAR</button>
      </div>
    </div>
  </div>`;
}

async function setFriendPanelTab(tab){
  friendPanelTab=tab==='profile'?'profile':'chat';
  renderFriendChat(await safeFriendData());
}

async function openOwnProfilePanel(){
  if(!me)return;
  friendPanelTab='profile';
  renderFriendChat(await safeFriendData());
}

function closeFriendChat(){
  stopFriendRealtime();
  const chat=document.getElementById('friend-chat');
  const headTabs=document.getElementById('friend-head-tabs');
  if(chat)chat.className='friend-chat';
  if(headTabs)headTabs.innerHTML='';
}

function setFriendButtonText(text){
  const nf=document.getElementById('nav-friend');if(nf)nf.textContent=text;
  const mf=document.getElementById('mob-friend');if(mf)mf.textContent=text;
}

function renderFriendChat(targetData=null, errorText=''){
  const chat=document.getElementById('friend-chat');
  const body=document.getElementById('friend-chat-body');
  const actions=document.getElementById('friend-chat-actions');
  const title=document.getElementById('friend-chat-title');
  const sub=document.getElementById('friend-chat-sub');
  const icon=document.getElementById('friend-chat-icon');
  const headTabs=document.getElementById('friend-head-tabs');
  if(!chat || !body || !actions || !title || !sub || !icon || !me)return;
  const fid=friendId();
  if(fid && targetData)ensureRuntimeProfileFromData(fid,targetData);
  const fp=PROFILES[fid] || {name:fid?'AMIGO':'SEM AMIGO',avatar:'◎',role:'OPERADOR'};
  const mine=PROFILES[me];
  const sentStatus=targetData ? friendAccessStatus(targetData,me) : null;
  const received=fid ? (myData.friendRequests||{})[fid] : null;
  const receivedStatus=received && received.status;
  const profileMode=friendPanelTab==='profile';
  const friendsMode=friendPanelTab==='friends';
  const chatMode=friendPanelTab==='chat';
  const publicOnly=!!targetData?.publicStats;
  title.textContent=profileMode?'PERFIL // '+mine.name:(friendsMode?'COMMLINK // CONTATOS':'COMMLINK // '+fp.name);
  sub.textContent=profileMode?'// IDENTIDADE PUBLICA //':(friendsMode?'// SELECIONE UM CONTATO //':'// CANAL DE MENSAGENS //');
  icon.textContent=(profileMode?mine.name:(friendsMode?'NC':fp.name)).slice(0,2);
  if(headTabs)headTabs.innerHTML=friendTabs();
  body.innerHTML=(profileMode?friendProfilePanel():friendChatPanel(targetData))+(errorText?`<div class="friend-alert-line">${htmlEscape(errorText)}</div>`:'');
  if(friendPanelTab==='chat'){
    refreshFriendMessages();
    startFriendRealtime();
  }else{
    stopFriendRealtime();
  }
  const btns=[];
  if(chatMode && receivedStatus==='pending'){
    btns.push(`<button class="friend-chat-btn primary" onclick="respondFriendRequest('${htmlEscape(fid)}','approved')">APROVAR ${htmlEscape(fp.name)}</button>`);
    btns.push(`<button class="friend-chat-btn danger" onclick="respondFriendRequest('${htmlEscape(fid)}','denied')">RECUSAR</button>`);
  }
  btns.push(`<button class="friend-chat-btn" onclick="closeFriendChat()">${profileMode?'FECHAR PERFIL':'FECHAR CANAL'}</button>`);
  actions.innerHTML=btns.join('');
  chat.className='friend-chat on';
}

let globalSearchFilter='all';

function openGlobalSearch(){
  const modal=document.getElementById('global-search');
  const input=document.getElementById('global-search-input');
  if(!modal)return;
  modal.hidden=false;
  modal.classList.add('on');
  renderGlobalSearch('');
  setTimeout(()=>input?.focus(),80);
}

function closeGlobalSearch(){
  const modal=document.getElementById('global-search');
  if(!modal)return;
  modal.classList.remove('on');
  modal.hidden=true;
}

function setSearchFilter(filter){
  globalSearchFilter=filter||'all';
  document.querySelectorAll('.global-filter').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.filter===globalSearchFilter);
  });
  renderGlobalSearch(document.getElementById('global-search-input')?.value || '');
}

function searchCategory(type,page){
  const t=String(type||'').toUpperCase();
  if(t==='LIVRO')return 'books';
  if(t==='PROJETO')return 'projects';
  if(t==='JOGO')return 'games';
  if(['DEVLOG','VIOLAO','REFLEXAO'].includes(t))return 'logs';
  if(t==='OBJETIVO' || page)return 'goals';
  return 'all';
}

function searchIndex(){
  const data=D();
  const rows=[];
  const add=(type,title,detail,page)=>{
    if(!title)return;
    rows.push({type,title:String(title),detail:String(detail||''),page,category:searchCategory(type,page)});
  };
  (data.books||[]).forEach(x=>add('LIVRO',x.title,x.author||x.status,'leitura'));
  (data.projects||[]).forEach(x=>add('PROJETO',x.name,x.note||x.status,'dev'));
  (data.devlog||[]).forEach(x=>add('DEVLOG',x.text,x.date,'dev'));
  (data.guitarlog||[]).forEach(x=>add('VIOLAO',x.text,x.date,'violao'));
  (data.games||[]).forEach(x=>add('JOGO',x.name,x.note||x.status,'jogos'));
  (data.reflexoes||[]).forEach(x=>add('REFLEXAO',x.title||x.text,x.date,'reflexoes'));
  Object.entries(data.customPages||{}).forEach(([page,p])=>{
    (p.items||[]).forEach(x=>add(PAGE_LABELS[page]||page,x.title,[x.type,x.metric,x.note].filter(Boolean).join(' · '),page));
  });
  Object.entries(data.pageObjectives||{}).forEach(([page,text])=>add('OBJETIVO',text,PAGE_LABELS[page]||page,page));
  return rows;
}

function highlightMatch(text,query){
  if(!query)return htmlEscape(text);
  const escaped=htmlEscape(text);
  const escapedQ=htmlEscape(query);
  const idx=escaped.toLowerCase().indexOf(escapedQ.toLowerCase());
  if(idx<0)return escaped;
  return escaped.slice(0,idx)+'<mark class="search-mark">'+escaped.slice(idx,idx+escapedQ.length)+'</mark>'+escaped.slice(idx+escapedQ.length);
}

function renderGlobalSearch(query=''){
  const out=document.getElementById('global-search-results');
  if(!out)return;
  const q=String(query||'').trim().toLowerCase();
  const rows=searchIndex().filter(r=>{
    const byText=!q || (r.title+' '+r.detail+' '+r.type).toLowerCase().includes(q);
    const byFilter=globalSearchFilter==='all' || r.category===globalSearchFilter;
    return byText && byFilter;
  }).slice(0,40);
  if(!rows.length){
    out.innerHTML='<div class="custom-empty"><span>NENHUM RESULTADO</span><b>Tente buscar por livro, projeto, treino, jogo, objetivo ou data.</b></div>';
    return;
  }
  out.innerHTML=rows.map(r=>`
    <div class="global-result" onclick="closeGlobalSearch();goPage('${htmlEscape(r.page)}')">
      <span>${highlightMatch(r.type,query)}</span>
      <b>${highlightMatch(r.title,query)}</b>
      ${r.detail?`<em>${highlightMatch(r.detail,query)}</em>`:''}
    </div>`).join('');
  enhanceClickableControls();
}

function renderFriendRequests(){
  const rb=document.getElementById('request-banner');
  if(!rb)return;
  if(!me || RO()){
    rb.className='request-global';
    rb.innerHTML='';
    return;
  }
  const pending=Object.entries(myData.friendRequests||{}).filter(([u,r])=>u && r && r.status==='pending');
  if(!pending.length){
    rb.className='request-global';
    rb.innerHTML='';
    return;
  }
  const [requester]=pending[0];
  const fp=PROFILES[requester] || {name:requester.slice(0,8).toUpperCase(),avatar:'◎'};
  rb.className='request-global on';
  rb.innerHTML=`${htmlEscape(fp.avatar)} ${htmlEscape(fp.name)} SOLICITOU ACESSO AO SEU PERFIL <span class="back-me" onclick="openFriendPanel()">ABRIR COMMLINK</span>`;
}

async function respondFriendRequest(requester,status){
  if(!me || RO() || !requester)return;
  myData.friendRequests=myData.friendRequests||{};
  myData.friendRequests[requester]={status,updatedAt:new Date().toISOString()};
  await dbSet(me,'friendRequests',myData.friendRequests);
  renderFriendRequests();
  let targetData=null;
  try{targetData=await dbGet(friendId());}catch(e){console.warn('Falha ao carregar dados do amigo:',e);}
  renderFriendChat(targetData,status==='approved'?'Acesso aprovado. O amigo ja pode entrar no seu perfil.':'Pedido recusado.');
}

async function requestFriendAccess(fid){
  const fp=PROFILES[fid] || {name:fid.slice(0,8).toUpperCase()};
  let targetData=await dbGet(fid);
  ensureRuntimeProfileFromData(fid,targetData);
  const status=friendAccessStatus(targetData,me);
  if(status==='pending' || status==='approved'){
    renderFriendChat(targetData);
    return;
  }
  const reqs={...(targetData.friendRequests||{})};
  reqs[me]={status:'pending',updatedAt:new Date().toISOString()};
  await dbSet(fid,'friendRequests',reqs);
  targetData.friendRequests=reqs;
  renderFriendChat(targetData,'Pedido enviado para '+fp.name+'.');
}

async function openFriendPanel(){
  if(!me || viewFriend)return;
  friendPanelTab='friends';
  setFriendButtonText('AMIGO');
  renderFriendChat(null);
  loadFriendSuggestions();
}

async function enterFriendProfile(){
  if(!me)return;
  const fb=document.getElementById('friend-banner');
  const fid=friendId();
  if(!fid){
    renderFriendChat(null,'Configure o ID do amigo antes de entrar no perfil.');
    return;
  }
  try{
    const rawFriendData=await dbGet(fid);
    ensureRuntimeProfileFromData(fid,rawFriendData);
    if(!profileConfigured(rawFriendData)){
      renderFriendChat(rawFriendData,'O perfil de '+PROFILES[fid].name+' ainda nao foi configurado.');
      return;
    }
    if(friendAccessStatus(rawFriendData,me)!=='approved'){
      renderFriendChat(rawFriendData,'Permissao ainda nao aprovada.');
      return;
    }
    friendData=applyFriendVisibility(rawFriendData);
    viewFriend=true;
    const fp=PROFILES[fid];
    document.body.classList.add('friend-view');
    const rb=document.getElementById('request-banner');if(rb){rb.className='request-global';rb.innerHTML='';}
    document.getElementById('nav-user').textContent=userDisplayLabel(me)+' > '+fp.name;
    setFriendButtonText('VOLTAR');
    const mu=document.getElementById('mob-user');if(mu)mu.textContent=userDisplayLabel(me)+'>'+fp.name;
    if(fb){
      fb.className='friend-view-global on';
      fb.innerHTML=`${htmlEscape(fp.avatar)} COMMLINK ATIVO: PERFIL DE ${htmlEscape(fp.name)} - SOMENTE LEITURA <span class="back-me" onclick="toggleFriend()">VOLTAR PARA MEU PERFIL</span>`;
    }
    closeFriendChat();
    applyData();
    renderBooks();renderProjects();renderDevLog();renderGuitarLog();renderGames();renderRefs();renderSkills();updateStats();
  }catch(e){
    viewFriend=false;
    friendData={};
    setFriendButtonText('CHAT');
    renderFriendChat(null,'Nao foi possivel carregar o perfil do amigo: '+e.message);
  }
}

async function toggleFriend(){
  if(!me)return;
  const fb=document.getElementById('friend-banner');
  if(!viewFriend){
    await openFriendPanel();
    return;
  }else{
    viewFriend=false;
    friendData={};
    document.body.classList.remove('friend-view');
    document.getElementById('nav-user').textContent=userDisplayLabel(me);
    setFriendButtonText('AMIGO');
    const mu=document.getElementById('mob-user');if(mu)mu.textContent=userDisplayLabel(me);
    if(fb){fb.className='friend-view-global';fb.innerHTML='';}
  }
  applyData();
  renderBooks();renderProjects();renderDevLog();renderGuitarLog();renderGames();renderRefs();renderSkills();updateStats();
}
const d=new Date();
const dias=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const meses=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
// init after DOM ready


function goPage(id){
  ensureExtraPages();
  closeHomeModule();
  toggleHomeMenu(false);
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-tab,.mob-tab').forEach(t=>t.classList.remove('active','loading'));
  const page=document.getElementById('page-'+id);
  if(!page)return;
  page.classList.add('active','fx-page-in');
  setTimeout(()=>page.classList.remove('fx-page-in'),320);
  document.querySelectorAll('.nav-tab,.mob-tab').forEach(t=>{
    if(t.dataset.page===id){
      t.classList.add('active','loading');
      setTimeout(()=>t.classList.remove('loading'),760);
    }
  });
  window.scrollTo(0,0);
  if(id==='leitura')renderBooks();
  if(id==='notificacoes')renderReminders();
  if(id==='dev'){renderProjects();renderDevLog();renderSkills();}
  if(id==='violao'){renderGuitarLog();renderSkills();updateGStreak();}
  if(id==='jogos')renderGames();
  if(id==='reflexoes')renderRefs();
  if(DISTRICT_PAGES.includes(id))renderPageObjective(id);
  if(EXTRA_PAGE_MAP[id])renderExtraPage(id);
  if(id==='treino')suggestTreinoStarter();
  enhanceClickableControls();
}

function triggerFx(el,cls='fx-touch',ms=420){
  if(!el)return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(()=>el.classList.remove(cls),ms);
}

function enhanceClickableControls(){
  const selector=[
    '.nav-tab','.mob-tab','.dbtn','.back-btn','.home-module-row','.global-result',
    '.reminder-toggle','.custom-edit-btn','.del-btn','.mini-remove','.badge','.rhead',
    '.district-remove','.back-me'
  ].join(',');
  document.querySelectorAll(selector).forEach(el=>{
    if(el.tagName==='BUTTON' || el.tagName==='A')return;
    if(!el.hasAttribute('tabindex'))el.setAttribute('tabindex','0');
    if(!el.hasAttribute('role'))el.setAttribute('role','button');
  });
}

document.addEventListener('keydown',e=>{
  if(e.key!=='Enter' && e.key!==' ')return;
  const target=e.target.closest('.nav-tab,.mob-tab,.dbtn,.back-btn,.home-module-row,.global-result,.reminder-toggle,.custom-edit-btn,.del-btn,.mini-remove,.badge,.rhead,.district-remove,.back-me');
  if(!target)return;
  e.preventDefault();
  target.click();
});


// Defaults
const DEFAULT_TASKS = [
  {text:'Hidratacao - 2L', tag:''},
  {text:'Leitura - 30 min', tag:'Livro atual'},
  {text:'Netrunning - 30-60 min', tag:'App Rotina'},
  {text:'Jam Session - 15 min', tag:''},
  {text:'Treino - Corpo - 60 min', tag:''},
  {text:'Tempo Livre - 60 min', tag:''}
];
const DEFAULT_HABITS = ['Água 2L','Leitura','Netrunning','Jam Session','Treino','Tempo Livre'];

const DEFAULT_ROUTINES = [
  {title:'Morning', steps:['Acordar 6:30 - agua + cafe','Trabalho 7h - 11:30','Almoco 11:30 - 12:30']},
  {title:'Dias Livres - seg/qua', steps:['Academia 17:30 - 18:30','Violao 19:00 - 19:15','Jogos 19:30 - 21:30','Leitura 22:00 - 22:30']},
  {title:'Faculdade - ter/qui/sex', steps:['Netrunning 17:00 - 17:45','Violao 17:45 - 18:00','Faculdade 18:00 - 21:30','Leitura 22:00 - 22:20']},
  {title:'Weekend', steps:['Academia 9:00 - 10:00 (sab)','Leitura 10:15 - 11:00 (sab)','Netrunning 11:00 - 12:00 (sab)','Jogos 14:00 - 16:00+','Leitura 9:30 - 10:15 (dom)']}
];
const DEFAULT_SKILL_DEFS = [
  {id:'py-fund', name:'Python - Fundamentos', max:5},
  {id:'py-func', name:'Python - Funcoes', max:5},
  {id:'py-oop', name:'Python - OOP', max:5},
  {id:'git', name:'Git / GitHub', max:5},
  {id:'backend', name:'Backend / APIs', max:5},
  {id:'db', name:'Banco de Dados', max:5},
  {id:'cloud', name:'Cloud / Deploy', max:5}
];
const DEFAULT_GUITAR_SKILL_DEFS = [
  {id:'g-acordes', name:'Acordes basicos', max:5},
  {id:'g-dedilhado', name:'Dedilhado', max:5},
  {id:'g-ritmo', name:'Ritmos / Batidas', max:5},
  {id:'g-pestana', name:'Pestana', max:5},
  {id:'g-escalas', name:'Escalas', max:5}
];
const ICON_CHOICES = [
  ['energy','Energia'],['water','Agua'],['book','Leitura'],['code','Dev'],['guitar','Violao'],
  ['workout','Treino Forca'],['cardio','Treino Cardio'],['game','Jogos'],['mind','Reflexao'],
  ['money','Dinheiro'],['card','Cartao'],['invest','Investimento'],['cart','Compras'],
  ['homebase','Casa'],['calendar','Agenda'],['food','Comida'],['sleep','Sono'],['target','Meta'],['link','Link']
];

const ICON_LEGACY_MAP = {
  '\u{26A1}':'energy','\u{1F4A7}':'water','\u{1F4DA}':'book','\u{1F4BB}':'code','\u{1F3B8}':'guitar',
  '\u{1F3CB}\u{FE0F}':'workout','\u{1F3AE}':'game','\u{1F9E0}':'mind','\u{1F4B0}':'money',
  '\u{1F4B3}':'card','\u{1F4C8}':'invest','\u{1F6D2}':'cart','\u{1F3E0}':'homebase',
  '\u{1F5D3}\u{FE0F}':'calendar','\u{1F37D}\u{FE0F}':'food','\u{1F634}':'sleep','\u{1F3AF}':'target','\u{1F517}':'link'
};

const ICON_SVG = {
  energy:'<path class="frame" d="M13 2 5 13h6l-1 9 9-13h-6z"/><path class="line" d="M13 2 5 13h6l-1 9 9-13h-6z"/><path class="thin" d="M8 13h5M12 7l-2 4"/>',
  water:'<path class="frame" d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/><path class="line" d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/><path class="thin" d="M9 15c.4 2 2 3 4 3"/>',
  book:'<path class="frame" d="M5 4h9l4 4v13H5z"/><path class="line" d="M5 4h9l4 4v13H5zM14 4v4h4"/><path class="thin" d="M8 10h7M8 13h8M8 16h6M6 6H3v12h2"/>',
  code:'<path class="frame" d="M4 5h16v13H4z"/><path class="line" d="M4 5h16v13H4zM7 9l3 3-3 3M12 15h5"/><path class="thin" d="M7 3v2M12 3v2M17 3v2M7 18v3M12 18v3M17 18v3"/>',
  guitar:'<path class="frame" d="M5 15 9 11l4 4-4 4z"/><path class="line" d="M5 15 9 11l4 4-4 4zM12 12l7-7M16 5l3 3M8 15h2"/><path class="thin" d="M14 10 10 6M17 7l3-3"/>',
  workout:'<path class="frame" d="M3 10h3v4H3zM18 10h3v4h-3zM8 9h8v6H8z"/><path class="line" d="M3 10h3v4H3zM18 10h3v4h-3zM6 12h12M8 9h8v6H8z"/><path class="thin" d="M10 7v10M14 7v10"/>',
  cardio:'<path class="frame" d="M12 20 5 13a4 4 0 0 1 6-5 4 4 0 0 1 6 5z"/><path class="line" d="M12 20 5 13a4 4 0 0 1 6-5 4 4 0 0 1 6 5zM5 13h4l2-4 3 7 2-3h3"/>',
  game:'<path class="frame" d="M5 10h14l2 5-3 4-4-3h-4l-4 3-3-4z"/><path class="line" d="M5 10h14l2 5-3 4-4-3h-4l-4 3-3-4zM7 14h5M9.5 11.5v5"/><path class="fill" d="M16 13h2v2h-2zM18.5 15.5h2v2h-2z"/>',
  mind:'<path class="frame" d="M12 4 20 9v7l-8 4-8-4V9z"/><path class="line" d="M12 4 20 9v7l-8 4-8-4V9zM8 12l4-3 4 3M8 12l4 4 4-4"/><path class="fill" d="M7 11h2v2H7zM11 8h2v2h-2zM15 11h2v2h-2zM11 15h2v2h-2z"/>',
  money:'<path class="frame" d="M8 7h8l3 5v7H5v-7z"/><path class="line" d="M8 7h8l3 5v7H5v-7zM9 7l1-3h4l1 3M12 11v5M10 12h4M10 16h4"/><path class="thin" d="M7 12h3M14 12h5"/>',
  card:'<path class="frame" d="M4 7h16v12H4z"/><path class="line" d="M4 7h16v12H4zM4 11h16M7 15h5"/><path class="thin" d="M15 15h2M7 5h3M14 5h3"/>',
  invest:'<path class="frame" d="M4 19h17V6H4z"/><path class="line" d="M5 18h16M5 18V6M8 15l4-4 3 2 5-7"/><path class="thin" d="M8 8h3M8 11h2M16 6h4v4"/>',
  cart:'<path class="frame" d="M7 8h14l-2 8H9z"/><path class="line" d="M3 5h3l3 11h10l2-8H7M10 20h1M18 20h1"/><path class="thin" d="M10 11h7M11 14h5"/>',
  homebase:'<path class="frame" d="M4 10 12 3l8 7v10H5z"/><path class="line" d="M3 10 12 3l9 7M6 10v10h12V10M10 20v-6h4v6"/><path class="thin" d="M7 7h3M16 7h2"/>',
  calendar:'<path class="frame" d="M5 5h14v16H5z"/><path class="line" d="M5 5h14v16H5zM5 9h14M8 3v4M16 3v4"/><path class="thin" d="M8 12h3M13 12h3M8 15h3M13 15h3"/>',
  food:'<path class="frame" d="M7 3h3v18H7zM15 3h3v18h-3z"/><path class="line" d="M8 3v18M5 3v6a3 3 0 0 0 6 0V3M16 3v18M16 3c3 2 3 7 0 10"/>',
  sleep:'<path class="frame" d="M5 13h14v6H5z"/><path class="line" d="M4 19V8M5 13h14v6H5zM7 13v-3h5v3M14 8h6"/><path class="thin" d="M15 5h5l-5 5h5"/>',
  target:'<path class="frame" d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z"/><path class="line" d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 11v2M11 12h2"/>',
  link:'<path class="frame" d="M6 6h9l3 3v9H6z"/><path class="line" d="M8 16 16 8M11 8h5v5M6 6h9l3 3v9H6z"/><path class="thin" d="M9 19H4V9h2"/>'
};

function iconIdFor(value,page='url'){
  if(ICON_SVG[value]) return value;
  if(ICON_LEGACY_MAP[value]) return ICON_LEGACY_MAP[value];
  return ICON_SVG[page] ? page : 'link';
}

function iconOptions(selected){
  const current=iconIdFor(selected);
  return ICON_CHOICES.map(([id,label])=>`<option value="${id}" ${current===id?'selected':''}>${label}</option>`).join('');
}

function isSelectableIcon(icon){
  return !!ICON_SVG[iconIdFor(icon)];
}

function customIconSvg(icon,color,cls=''){
  const id=iconIdFor(icon);
  return `<span class="nc-icon ${cls}" style="--ic:${color || 'var(--y)'}" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${ICON_SVG[id]}</svg></span>`;
}

const EXTRA_PAGE_DEFS = [
  {page:'financas', label:'Financas', icon:'money', color:'#97C459', summary:'Controle de saldo, entradas, saidas e proximos pagamentos.'},
  {page:'cartao', label:'Cartao', icon:'card', color:'#00d4ff', summary:'Faturas, limites, compras recentes e datas de vencimento.'},
  {page:'investimentos', label:'Investimentos', icon:'invest', color:'#7df9ff', summary:'Carteira, aportes, metas e evolucao dos ativos.'},
  {page:'compras', label:'Compras', icon:'cart', color:'#fcee09', summary:'Lista de compras, prioridades e itens planejados.'},
  {page:'casa', label:'Casa', icon:'homebase', color:'#b44fff', summary:'Tarefas domesticas, manutencoes e organizacao da base.'},
  {page:'agenda', label:'Agenda', icon:'calendar', color:'#f0997b', summary:'Compromissos, prazos e eventos importantes.'},
  {page:'comida', label:'Comida', icon:'food', color:'#97C459', summary:'Refeicoes, mercado, dieta e preparos da semana.'},
  {page:'sono', label:'Sono', icon:'sleep', color:'#378ADD', summary:'Horario de dormir, qualidade do descanso e consistencia.'},
  {page:'metas', label:'Metas', icon:'target', color:'#e00f3a', summary:'Objetivos ativos, progresso e proximas acoes.'},
  {page:'treino', label:'Treino', icon:'workout', color:'#fcee09', summary:'Forca, series, cargas e rotina fisica.'},
  {page:'cardio', label:'Cardio', icon:'cardio', color:'#e00f3a', summary:'Corrida, caminhada, bicicleta e condicionamento.'}
];

const EXTRA_PAGE_MAP = Object.fromEntries(EXTRA_PAGE_DEFS.map(p=>[p.page,p]));

function districtTemplateOptions(){
  return EXTRA_PAGE_DEFS.map(def=>`<option value="${def.page}">${def.label}</option>`).join('');
}

function addDistrictFromTemplate(page){
  if(RO())return;
  const def=EXTRA_PAGE_MAP[page] || EXTRA_PAGE_DEFS[0];
  if(!def)return;
  if(!myData.districts || !myData.districts.length) myData.districts = JSON.parse(JSON.stringify(creatorDefaults(DEFAULT_DISTRICTS)));
  myData.districts.push({icon:def.icon, name:def.label, color:def.color, page:def.page, url:''});
  if(!myData.pageObjectives)myData.pageObjectives={};
  myData.pageObjectives[def.page]=myData.pageObjectives[def.page] || def.summary;
  ensureCustomPagesData();
  renderDistrictEditList();
  renderDistricts();
  renderExtraPage(def.page);
  scheduleAutoSave();
}

function defaultIconForPage(page){
  const builtIns = {leitura:'book',dev:'code',violao:'guitar',jogos:'game',reflexoes:'mind',notificacoes:'energy',home:'homebase',url:'link'};
  return EXTRA_PAGE_MAP[page]?.icon || builtIns[page] || 'link';
}

function defaultObjectiveForPage(page){
  if(!isCreatorUser())return '';
  const builtIns = {
    leitura:'Definir o livro atual, manter progresso mensal e registrar leituras concluídas.',
    dev:'Organizar skills, projetos ativos e logs de estudo para evoluir como netrunner.',
    violao:'Manter prática consistente, evoluir técnicas e proteger a streak diária.',
    jogos:'Controlar biblioteca, jogo atual e fila sem perder o foco da rotina.',
    reflexoes:'Registrar pensamentos, decisões e aprendizados importantes.'
  };
  return builtIns[page] || EXTRA_PAGE_MAP[page]?.summary || 'Defina o objetivo principal desta página.';
}

function pageObjectiveData(page){
  const data=D();
  const objectives=data.pageObjectives||{};
  return objectives[page] || defaultObjectiveForPage(page);
}

function pageLore(page){
  const copy={
    notificacoes:'City Center Relay - alertas, sinais e diagnostico de campo.',
    leitura:'Watson District - arquivos de conhecimento e progresso mensal.',
    dev:'Netrunner Den - codigo, projetos e skill tree em evolucao.',
    violao:'Afterlife Booth - pratica, ritmo e streak de tecnica.',
    jogos:'Japantown Arcade - biblioteca, fila e runs concluidas.',
    reflexoes:'Quiet Room - diario, decisoes e memoria tática.',
    financas:'Corpo Ledger - saldo, gastos e proximos pagamentos.',
    treino:'Combat Zone Gym - carga, series e evolucao fisica.',
    sono:'Night Shift Bay - descanso, horario e recuperacao.',
    comida:'Street Market - refeicoes, dieta e preparo da semana.',
    compras:'Supply Run - lista, prioridades e itens de base.'
  };
  return copy[page] || ((PAGE_LABELS[page]||page)+' District - objetivos, progresso e proximo passo.');
}

function ensurePageObjectivesData(){
  if(!myData.pageObjectives || typeof myData.pageObjectives!=='object')myData.pageObjectives={};
  if(!isCreatorUser())return;
  DISTRICT_PAGE_DEFS.forEach(def=>{
    if(!myData.pageObjectives[def.page]){
      myData.pageObjectives[def.page]=myData.customPages?.[def.page]?.focus || defaultObjectiveForPage(def.page);
    }
  });
}

function ensurePageObjectivePanels(){
  BASE_DISTRICT_PAGES.forEach(def=>{
    const pageEl=document.getElementById('page-'+def.page);
    if(!pageEl || document.getElementById('page-objective-'+def.page))return;
    const header=pageEl.querySelector('.dist-header');
    if(!header)return;
    const shell=document.createElement('div');
    shell.className='page-objective-shell';
    shell.id='page-objective-'+def.page;
    header.insertAdjacentElement('afterend',shell);
  });
}

function renderPageObjectives(){
  ensurePageObjectivePanels();
  DISTRICT_PAGES.forEach(page=>renderPageObjective(page));
}

function renderPageObjective(page){
  ensurePageObjectivePanels();
  const shell=document.getElementById('page-objective-'+page);
  if(!shell)return;
  const color=PAGE_ICON_COLORS[page] || EXTRA_PAGE_MAP[page]?.color || 'var(--y)';
  const label=PAGE_LABELS[page] || page;
  const text=pageObjectiveData(page);
  shell.innerHTML=`
    <div class="page-objective-panel" style="--page-color:${color}">
      <div class="page-objective-head"><span>OBJETIVO DA PAGINA</span><b>${htmlEscape(label)}</b></div>
      <div class="page-lore">${htmlEscape(pageLore(page))}</div>
      <div class="page-objective-text">${htmlEscape(text)}</div>
      ${RO()?'':`
      <div class="custom-focus-edit">
        <button class="custom-edit-toggle" onclick="togglePageObjectiveEdit('${page}')">EDITAR OBJETIVO</button>
        <textarea id="page-objective-input-${page}" class="custom-focus-input" placeholder="Defina o objetivo desta página..." oninput="updatePageObjective('${page}',this.value)">${htmlEscape(text)}</textarea>
      </div>`}
    </div>`;
}

function togglePageObjectiveEdit(page){
  const el=document.getElementById('page-objective-input-'+page);
  if(!el)return;
  el.classList.toggle('on');
  if(el.classList.contains('on'))el.focus();
}

function updatePageObjective(page,value){
  if(RO())return;
  ensurePageObjectivesData();
  myData.pageObjectives[page]=value;
  const text=document.querySelector('#page-objective-'+page+' .page-objective-text');
  if(text)text.textContent=value;
  const customText=document.getElementById('custom-focus-'+page);
  if(customText)customText.textContent=value;
  scheduleAutoSave();
}

function ensureExtraPages(){
  const host=document.querySelector('main') || document.body;
  if(!host)return;
  EXTRA_PAGE_DEFS.forEach(def=>{
    if(document.getElementById('page-'+def.page))return;
    const page=document.createElement('div');
    page.className='page';
    page.id='page-'+def.page;
    page.innerHTML=`
      <div class="dist-header">
        <div class="back-btn" onclick="goPage('home')">HOME</div>
        <div class="dist-title" style="color:${def.color}">${customIconSvg(def.icon,def.color,'district-emoji')} ${htmlEscape(def.label).toUpperCase()}</div>
      </div>
      <div class="custom-page-shell" id="custom-page-${def.page}"></div>`;
    host.appendChild(page);
  });
}

function ensureCustomPagesData(){
  if(!myData.customPages || typeof myData.customPages!=='object')myData.customPages={};
  EXTRA_PAGE_DEFS.forEach(def=>{
    if(!myData.customPages[def.page]){
      myData.customPages[def.page]={items:[], weightLogs:[]};
    }else{
      myData.customPages[def.page].items=Array.isArray(myData.customPages[def.page].items)?myData.customPages[def.page].items:[];
      myData.customPages[def.page].weightLogs=Array.isArray(myData.customPages[def.page].weightLogs)?myData.customPages[def.page].weightLogs:[];
    }
  });
}

function customPageData(page){
  const data=D();
  const def=EXTRA_PAGE_MAP[page];
  const pages=data.customPages||{};
  const current=pages[page]||{};
  return {
    focus:pageObjectiveData(page),
    items:Array.isArray(current.items)?current.items:[],
    weightLogs:Array.isArray(current.weightLogs)?current.weightLogs:[]
  };
}

function customStatusLabel(status){
  return {todo:'PENDENTE',active:'ATIVO',done:'CONCLUIDO',hold:'PAUSADO'}[status]||'PENDENTE';
}

function customStatusNext(status){
  return {todo:'active',active:'done',done:'hold',hold:'todo'}[status]||'active';
}

function customPageMode(page){
  if(['financas','cartao','investimentos','compras'].includes(page))return 'finance';
  if(['treino','cardio','sono','comida'].includes(page))return 'routine';
  return 'objective';
}

function customTypePlaceholder(page){
  return {
    finance:'ex: entrada, saida, aporte',
    routine:'ex: treino, refeicao, horario',
    objective:'ex: meta, etapa, tarefa'
  }[customPageMode(page)];
}

function customTitlePlaceholder(page){
  return {
    finance:'ex: Guardar R$ 500',
    routine:'ex: Treino A - superiores',
    objective:'ex: Finalizar modulo inicial'
  }[customPageMode(page)];
}

function customNotePlaceholder(page){
  return {
    finance:'Valor, data, recorrencia ou observacao...',
    routine:'Carga, duracao, frequencia ou regra...',
    objective:'Prazo, motivo ou proximos passos...'
  }[customPageMode(page)];
}

function customMetricPlaceholder(page){
  return {
    finance:'ex: R$ 500 / mensal',
    routine:'ex: 3x por semana',
    objective:'ex: 80% / 30 dias'
  }[customPageMode(page)];
}

function renderExtraPages(){
  ensureExtraPages();
  EXTRA_PAGE_DEFS.forEach(def=>renderExtraPage(def.page));
}

function renderExtraPage(page){
  ensureExtraPages();
  const def=EXTRA_PAGE_MAP[page];
  const host=document.getElementById('custom-page-'+page);
  if(!def || !host)return;
  const data=customPageData(page);
  const total=data.items.length;
  const active=data.items.filter(x=>x.status==='active').length;
  const done=data.items.filter(x=>x.status==='done').length;
  const next=data.items.find(x=>x.status==='active') || data.items.find(x=>x.status!=='done');
  const mode=customPageMode(page);
  const modeLabel={finance:'OPERACOES',routine:'ROTINA',objective:'OBJETIVOS'}[mode];
  host.innerHTML=`
    <div class="custom-dashboard custom-mode-${mode}">
      <div class="custom-hero card" style="--page-color:${def.color}">
        <div class="ct">${htmlEscape(def.label)} <span class="custom-chip">${modeLabel}</span></div>
        <div class="custom-brief">
          <span class="custom-brief-label">OBJETIVO PRINCIPAL</span>
          <div class="custom-focus" id="custom-focus-${page}">${htmlEscape(data.focus)}</div>
        </div>
        ${RO()?'':`
        <div class="custom-focus-edit">
          <button class="custom-edit-toggle" onclick="toggleCustomFocusEdit('${page}')">EDITAR OBJETIVO</button>
          <textarea id="custom-focus-input-${page}" class="custom-focus-input" placeholder="Defina o objetivo desta aba..." oninput="updateCustomFocus('${page}',this.value)">${htmlEscape(data.focus)}</textarea>
        </div>`}
      </div>
      <div class="custom-kpis">
        ${customKpiHtml(page,total,active,done)}
      </div>
      <div class="card full custom-list-card" style="--page-color:${def.color}">
        <div class="ct">${customPlanTitle(page)}</div>
        <div class="custom-next">${next?`<span>PROXIMO</span><b>${htmlEscape(next.title)}</b>`:'<span>PROXIMO</span><b>NENHUM ITEM ATIVO</b>'}</div>
        <div id="custom-items-${page}" class="custom-items">
          ${data.items.length?data.items.map(item=>customItemHtml(page,item)).join(''):customEmptyHtml(page)}
        </div>
        ${RO()?'':customPageFormHtml(page)}
      </div>
      ${page==='treino'?customWeightPanelHtml(data):''}
    </div>`;
}

function customEmptyHtml(page){
  const mode=customPageMode(page);
  const copy={
    finance:['SEM REGISTROS','Adicione uma meta, compra, aporte ou conta para acompanhar o fluxo.'],
    routine:['SEM ROTINA ATIVA','Crie um treino, habito, horario ou bloco recorrente para executar.'],
    objective:['SEM OBJETIVOS','Adicione uma etapa com meta, prioridade e prazo para iniciar o plano.']
  }[mode];
  const cta=customStarterLabel(page);
  return `<div class="custom-empty action-empty">
    <span>${copy[0]}</span>
    <b>${copy[1]}</b>
    ${RO()?'':`<button type="button" onclick="createStarterForPage('${page}')">${cta}</button>`}
  </div>`;
}

function customStarterLabel(page){
  if(page==='treino')return 'CRIAR TREINO A BASICO';
  if(page==='financas')return 'CRIAR FINANCAS BASE';
  if(page==='sono')return 'CRIAR ROTINA DE SONO';
  if(page==='comida')return 'CRIAR PLANO DE COMIDA';
  if(page==='compras')return 'CRIAR LISTA BASE';
  return 'CRIAR PRIMEIRO OBJETIVO';
}

function createStarterForPage(page){
  if(RO())return;
  ensureCustomPagesData();
  const starters={
    treino:[
      {title:'Treino A',type:'Treino',metric:'45 min',priority:'Alta',due:'Dias uteis',progress:0,nextStep:'Registrar primeira carga',note:'Puxada 3 x 10; Remada 3 x 10; Agachamento 3 x 10'}
    ],
    financas:[
      {title:'Conferir gastos do dia',type:'Controle',metric:'10 min',priority:'Alta',due:'Diario',progress:0,nextStep:'Anotar maior gasto',note:'Registre entradas, saidas e proximo pagamento.'}
    ],
    sono:[
      {title:'Dormir no horario',type:'Rotina',metric:'23:00',priority:'Alta',due:'Diario',progress:0,nextStep:'Desligar telas 30 min antes',note:'Use o lembrete para reduzir atrito.'}
    ],
    comida:[
      {title:'Refeicao planejada',type:'Dieta',metric:'1 refeicao',priority:'Media',due:'Hoje',progress:0,nextStep:'Escolher proteina',note:'Monte uma opcao simples para repetir.'}
    ],
    compras:[
      {title:'Lista essencial',type:'Compra',metric:'3 itens',priority:'Media',due:'Semana',progress:0,nextStep:'Adicionar item principal',note:'Comece com o que falta para a semana.'}
    ],
    dev:[
      {title:'Projeto pequeno',type:'Dev',metric:'30 min',priority:'Alta',due:'Hoje',progress:0,nextStep:'Criar uma tela ou funcao',note:'Defina uma entrega pequena.'}
    ]
  };
  seedCustomPageItems(page,starters[page] || [{title:'Primeiro objetivo',type:'Meta',metric:'1 passo',priority:'Media',due:'Hoje',progress:0,nextStep:'Definir proximo passo',note:'Comece pequeno.'}]);
  renderExtraPage(page);
  scheduleAutoSave();
  showCyberToast('MODULO INICIADO',(PAGE_LABELS[page]||page)+' recebeu um objetivo base.');
}

function customPlanTitle(page){
  return {finance:'Fluxo e prioridades',routine:'Execucao da rotina',objective:'Plano de acao'}[customPageMode(page)];
}

function customKpiHtml(page,total,active,done){
  const mode=customPageMode(page);
  const labels={
    finance:['REGISTROS','EM ABERTO','QUITADOS'],
    routine:['SESSOES','EM CURSO','FEITAS'],
    objective:['ITENS','ATIVOS','FEITOS']
  }[mode];
  const values=[total,active,done];
  return labels.map((label,i)=>`
    <div class="stat custom-kpi-card">
      <div class="custom-kpi-code">0${i+1}</div>
      <div class="stat-num">${String(values[i]).padStart(2,'0')}</div>
      <div class="stat-label">${label}</div>
    </div>`).join('');
  renderArchivedTasks();
}

function customItemHtml(page,item){
  const def=EXTRA_PAGE_MAP[page]||{};
  const editOpen=item.editing && !RO();
  const meta=[
    item.type ? ['TIPO',item.type] : null,
    item.metric ? ['META',item.metric] : null,
    item.priority ? ['PRIORIDADE',item.priority] : null,
    item.due ? ['PRAZO',item.due] : null,
    item.progress ? ['PROGRESSO',item.progress+'%'] : null,
    item.updatedAt ? ['ATUALIZADO',new Date(item.updatedAt).toLocaleDateString('pt-BR')] : null
  ].filter(Boolean);
  return `
    <div class="custom-item ${item.status||'todo'}" style="--page-color:${def.color||'var(--y)'}">
      <div class="custom-item-top">
        <span class="custom-status-dot"></span>
        <div class="custom-item-title">${htmlEscape(item.title||'Sem titulo')}</div>
      </div>
      ${meta.length?`<div class="custom-meta-grid">${meta.map(([k,v])=>`<span class="custom-meta"><b>${k}</b>${htmlEscape(v)}</span>`).join('')}</div>`:''}
      ${customItemDetailHtml(page,item)}
      ${item.nextStep?`<div class="custom-next-step"><span>PROXIMO PASSO</span><b>${htmlEscape(item.nextStep)}</b></div>`:''}
      <div class="custom-item-actions">
        <span class="badge ${item.status||'todo'}" onclick="${RO()?'':`cycleCustomItem('${page}',${item.id})`}">${customStatusLabel(item.status)}</span>
        ${RO()?'':`<span class="custom-edit-btn" onclick="toggleCustomItemEdit('${page}',${item.id})">${editOpen?'FECHAR':'EDITAR'}</span>`}
        ${RO()?'':`<span class="del-btn" onclick="delCustomItem('${page}',${item.id})">X</span>`}
      </div>
      ${editOpen?customItemEditHtml(page,item):''}
    </div>`;
}

function customItemDetailHtml(page,item){
  if(!item.note)return '';
  const mode=customPageMode(page);
  const raw=String(item.note||'');
  if(mode==='routine'){
    const lines=raw.split(/\n|;/).map(x=>x.trim()).filter(Boolean);
    if(lines.length>1){
      return `<div class="custom-routine-note">${lines.map((line,i)=>`
        <div class="custom-routine-line"><span>${String(i+1).padStart(2,'0')}</span><b>${htmlEscape(line)}</b></div>
      `).join('')}</div>`;
    }
  }
  return `<div class="custom-item-note">${htmlEscape(raw)}</div>`;
}

function customItemEditHtml(page,item){
  return `
    <div class="custom-edit-panel">
      <div class="custom-form-grid">
        <label><span class="flabel">TITULO</span><input type="text" id="edit-title-${page}-${item.id}" value="${htmlEscape(item.title||'')}"></label>
        <label><span class="flabel">TIPO</span><input type="text" id="edit-type-${page}-${item.id}" value="${htmlEscape(item.type||'')}"></label>
        <label><span class="flabel">META / MEDIDA</span><input type="text" id="edit-metric-${page}-${item.id}" value="${htmlEscape(item.metric||'')}"></label>
        <label><span class="flabel">PRIORIDADE</span><select id="edit-priority-${page}-${item.id}">
          <option value="Alta" ${item.priority==='Alta'?'selected':''}>Alta</option>
          <option value="Media" ${!item.priority||item.priority==='Media'?'selected':''}>Media</option>
          <option value="Baixa" ${item.priority==='Baixa'?'selected':''}>Baixa</option>
        </select></label>
        <label><span class="flabel">PRAZO</span><input type="text" id="edit-due-${page}-${item.id}" value="${htmlEscape(item.due||'')}"></label>
        <label><span class="flabel">PROGRESSO %</span><input type="number" min="0" max="100" id="edit-progress-${page}-${item.id}" value="${Number(item.progress)||0}"></label>
        <label><span class="flabel">PROXIMO PASSO</span><input type="text" id="edit-next-${page}-${item.id}" value="${htmlEscape(item.nextStep||'')}"></label>
      </div>
      <label><span class="flabel">NOTA</span><textarea id="edit-note-${page}-${item.id}">${htmlEscape(item.note||'')}</textarea></label>
      <div class="btns">
        <button class="btn btn-y" onclick="saveCustomItemEdit('${page}',${item.id})">SALVAR</button>
        <button class="btn" onclick="toggleCustomItemEdit('${page}',${item.id})" style="color:var(--muted);border-color:var(--border)">CANCELAR</button>
      </div>
    </div>`;
}

function customPageFormHtml(page){
  return `
    <div class="add-form custom-add-form">
      <div class="sdiv">ADICIONAR OBJETIVO</div>
      <div class="custom-form-grid">
        <label><span class="flabel">TITULO</span><input type="text" id="custom-title-${page}" placeholder="${customTitlePlaceholder(page)}"></label>
        <label><span class="flabel">TIPO</span><input type="text" id="custom-type-${page}" placeholder="${customTypePlaceholder(page)}"></label>
        <label><span class="flabel">META / MEDIDA</span><input type="text" id="custom-metric-${page}" placeholder="${customMetricPlaceholder(page)}"></label>
        <label><span class="flabel">PRIORIDADE</span><select id="custom-priority-${page}"><option value="Alta">Alta</option><option value="Media" selected>Media</option><option value="Baixa">Baixa</option></select></label>
        <label><span class="flabel">PRAZO</span><input type="text" id="custom-due-${page}" placeholder="ex: sexta, 10/06, diario"></label>
        <label><span class="flabel">PROGRESSO %</span><input type="number" min="0" max="100" id="custom-progress-${page}" placeholder="0"></label>
        <label><span class="flabel">PROXIMO PASSO</span><input type="text" id="custom-next-${page}" placeholder="ex: revisar, pagar, treinar A"></label>
      </div>
      <label><span class="flabel">NOTA</span><textarea id="custom-note-${page}" placeholder="${customNotePlaceholder(page)}"></textarea></label>
      <div class="btns"><button class="btn btn-y" onclick="addCustomItem('${page}')">ADICIONAR</button></div>
    </div>`;
}

function toggleCustomFocusEdit(page){
  const el=document.getElementById('custom-focus-input-'+page);
  if(!el)return;
  el.classList.toggle('on');
  if(el.classList.contains('on'))el.focus();
}

function updateCustomFocus(page,value){
  if(RO())return;
  updatePageObjective(page,value);
}

function addCustomItem(page){
  if(RO())return;
  ensureCustomPagesData();
  const title=document.getElementById('custom-title-'+page)?.value.trim();
  const type=document.getElementById('custom-type-'+page)?.value.trim();
  const metric=document.getElementById('custom-metric-'+page)?.value.trim();
  const priority=document.getElementById('custom-priority-'+page)?.value || 'Media';
  const due=document.getElementById('custom-due-'+page)?.value.trim();
  const progress=Math.max(0,Math.min(100,Number(document.getElementById('custom-progress-'+page)?.value)||0));
  const nextStep=document.getElementById('custom-next-'+page)?.value.trim();
  const note=document.getElementById('custom-note-'+page)?.value.trim();
  if(!title)return;
  myData.customPages[page].items.unshift({id:Date.now(),title,type:type||'Objetivo',metric,priority,due,progress,nextStep,note,status:'active',updatedAt:new Date().toISOString()});
  ['title','type','metric','due','progress','next','note'].forEach(id=>{const el=document.getElementById('custom-'+id+'-'+page);if(el)el.value='';});
  const pr=document.getElementById('custom-priority-'+page);if(pr)pr.value='Media';
  renderExtraPage(page);
  scheduleAutoSave();
}

function toggleCustomItemEdit(page,id){
  if(RO())return;
  ensureCustomPagesData();
  const items=myData.customPages[page]?.items||[];
  items.forEach(item=>{item.editing = item.id===id ? !item.editing : false;});
  renderExtraPage(page);
}

function saveCustomItemEdit(page,id){
  if(RO())return;
  ensureCustomPagesData();
  const item=myData.customPages[page]?.items.find(x=>x.id===id);
  if(!item)return;
  const get=idPart=>document.getElementById('edit-'+idPart+'-'+page+'-'+id);
  item.title=get('title')?.value.trim() || item.title;
  item.type=get('type')?.value.trim() || 'Objetivo';
  item.metric=get('metric')?.value.trim() || '';
  item.priority=get('priority')?.value || 'Media';
  item.due=get('due')?.value.trim() || '';
  item.progress=Math.max(0,Math.min(100,Number(get('progress')?.value)||0));
  item.nextStep=get('next')?.value.trim() || '';
  item.note=get('note')?.value.trim() || '';
  item.updatedAt=new Date().toISOString();
  item.editing=false;
  renderExtraPage(page);
  scheduleAutoSave();
}

function customWeightPanelHtml(data){
  const logs=(data.weightLogs||[]).slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')) || b.id-a.id);
  const best=logs.reduce((max,l)=>Math.max(max,Number(l.weight)||0),0);
  const last=logs[0];
  const stats=weightExerciseStats(logs);
  return `
    <div class="card full custom-weight-card" style="--page-color:#fcee09">
      <div class="ct">Carga por dia <span class="custom-chip">EVOLUCAO</span></div>
      <div class="custom-weight-kpis">
        <div class="custom-weight-kpi"><span>ULTIMA</span><b>${last?htmlEscape(last.weight+' kg'):'--'}</b></div>
        <div class="custom-weight-kpi"><span>RECORDE</span><b>${best?best+' kg':'--'}</b></div>
        <div class="custom-weight-kpi"><span>REGISTROS</span><b>${logs.length}</b></div>
      </div>
      ${stats.length?`
      <div class="custom-weight-progress">
        <div class="sdiv">EVOLUCAO POR EXERCICIO</div>
        <div class="custom-weight-stats">
          ${stats.map(s=>`
            <div class="custom-weight-stat ${s.delta>0?'up':s.delta<0?'down':''}">
              <div><span>${htmlEscape(s.name)}</span><b>${htmlEscape(s.latest+' kg')}</b></div>
              <div><span>RECORDE</span><b>${htmlEscape(s.best+' kg')}</b></div>
              <div><span>VAR</span><b>${s.delta===0?'--':htmlEscape((s.delta>0?'+':'')+s.delta+' kg')}</b></div>
              <i style="--w:${s.best?Math.max(8,Math.min(100,Math.round(s.latest/s.best*100))):0}%"></i>
            </div>`).join('')}
        </div>
      </div>`:''}
      ${RO()?'':`
      <div class="add-form custom-weight-form">
        <div class="sdiv">REGISTRAR TREINO</div>
        <div class="custom-weight-grid">
          <label><span class="flabel">DATA</span><input type="date" id="weight-date" value="${localDateKey()}"></label>
          <label><span class="flabel">EXERCICIO / DIA</span><input type="text" id="weight-exercise" placeholder="ex: Treino A, Supino, Remada"></label>
          <label><span class="flabel">PESO KG</span><input type="number" id="weight-value" min="0" step="0.5" placeholder="ex: 40"></label>
          <label><span class="flabel">REPS</span><input type="text" id="weight-reps" placeholder="ex: 3x10"></label>
        </div>
        <label><span class="flabel">NOTA</span><input type="text" id="weight-note" placeholder="ex: subiu 2kg, facil, dificil..."></label>
        <div class="btns"><button class="btn btn-y" onclick="addWeightLog()">SALVAR CARGA</button></div>
      </div>`}
      <div class="custom-weight-list">
        ${logs.length?logs.map(log=>weightLogHtml(log)).join(''):'<div class="custom-empty"><span>SEM CARGAS</span><b>Registre o peso de cada treino para comparar ultima carga, recorde e evolucao por exercicio.</b></div>'}
      </div>
    </div>`;
}

function weightExerciseStats(logs){
  const groups={};
  logs.forEach(log=>{
    const name=String(log.exercise||'Treino').trim()||'Treino';
    const key=name.toLowerCase();
    (groups[key]=groups[key]||{name,items:[]}).items.push(log);
  });
  return Object.values(groups).map(g=>{
    const byDate=g.items.slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')) || b.id-a.id);
    const latest=Number(byDate[0]?.weight)||0;
    const previous=Number(byDate[1]?.weight)||0;
    const best=g.items.reduce((max,l)=>Math.max(max,Number(l.weight)||0),0);
    return {name:g.name,latest,best,delta:previous?Number((latest-previous).toFixed(1)):0,count:g.items.length};
  }).sort((a,b)=>b.count-a.count || b.latest-a.latest).slice(0,6);
}

function weightLogHtml(log){
  return `
    <div class="custom-weight-row">
      <div>
        <div class="custom-weight-date">${htmlEscape(log.date||'--')}</div>
        <div class="custom-weight-title">${htmlEscape(log.exercise||'Treino')}</div>
        ${log.note?`<div class="custom-item-note">${htmlEscape(log.note)}</div>`:''}
      </div>
      <div class="custom-weight-load">${htmlEscape(log.weight||'0')}<span>kg</span></div>
      <div class="custom-weight-reps">${htmlEscape(log.reps||'--')}</div>
      ${RO()?'':`<span class="del-btn" onclick="delWeightLog(${log.id})">X</span>`}
    </div>`;
}

function addWeightLog(){
  if(RO())return;
  ensureCustomPagesData();
  const date=document.getElementById('weight-date')?.value || localDateKey();
  const exercise=document.getElementById('weight-exercise')?.value.trim();
  const weight=document.getElementById('weight-value')?.value;
  const reps=document.getElementById('weight-reps')?.value.trim();
  const note=document.getElementById('weight-note')?.value.trim();
  if(!exercise || !weight)return;
  myData.customPages.treino.weightLogs.unshift({id:Date.now(),date,exercise,weight,reps,note});
  addActivity('treino',{title:exercise,weight:Number(weight)||0,reps,difficulty:'Media',note});
  ['weight-exercise','weight-value','weight-reps','weight-note'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  renderExtraPage('treino');
  renderEvolutionHistory();
  scheduleAutoSave();
}

async function delWeightLog(id){
  if(RO())return;
  if(!(await confirmDanger('Excluir este registro de carga?')))return;
  ensureCustomPagesData();
  myData.customPages.treino.weightLogs=(myData.customPages.treino.weightLogs||[]).filter(x=>x.id!==id);
  renderExtraPage('treino');
  scheduleAutoSave();
}

function cycleCustomItem(page,id){
  if(RO())return;
  ensureCustomPagesData();
  const item=myData.customPages[page]?.items.find(x=>x.id===id);
  if(!item)return;
  item.status=customStatusNext(item.status);
  if(item.status==='done')item.progress=100;
  item.updatedAt=new Date().toISOString();
  renderExtraPage(page);
  scheduleAutoSave();
}

async function delCustomItem(page,id){
  if(RO())return;
  if(!(await confirmDanger('Excluir este objetivo desta pagina?')))return;
  ensureCustomPagesData();
  myData.customPages[page].items=myData.customPages[page].items.filter(x=>x.id!==id);
  renderExtraPage(page);
  scheduleAutoSave();
}

const DEFAULT_GOALS = {
  bookTitle:'Crime e Castigo',
  monthlyBooks:2,
  devFocus:'App de Rotina',
  skillFocus:'Violao - fundamentos',
  gameFocus:'Cyberpunk 2077',
  guitarMinutes:15
};

function creatorDefaults(value){
  return isCreatorUser() ? value : [];
}

function creatorGoalDefaults(){
  return isCreatorUser() ? DEFAULT_GOALS : {};
}

function allTaskDefs(data=D()){
  return (data.taskDefs && data.taskDefs.length) ? data.taskDefs : creatorDefaults(DEFAULT_TASKS);
}
function getTasks(){ return allTaskDefs(D()).filter(t=>!t.archivedAt); }
function getGoals(){ return {...creatorGoalDefaults(),...(D().goals||{})}; }
function taskHabitName(task,i){ return String((task && task.text) || ('Contrato '+(i+1))).trim(); }
function getHabits(){ return getTasks().map((task,i)=>taskHabitName(task,i)); }
function getRoutines(){ return (D().routines && D().routines.length) ? D().routines : creatorDefaults(DEFAULT_ROUTINES); }
function getSkillDefs(kind){
  const data=D();
  if(kind==='guitar') return (data.guitarSkillDefs && data.guitarSkillDefs.length) ? data.guitarSkillDefs : creatorDefaults(DEFAULT_GUITAR_SKILL_DEFS);
  return (data.skillDefs && data.skillDefs.length) ? data.skillDefs : creatorDefaults(DEFAULT_SKILL_DEFS);
}

// Home: tasks and habits
// Define se um contrato deve aparecer na data informada conforme a frequencia.
function taskActiveOn(task,date){
  const f=task && task.frequency;
  const dow=date.getDay(); // 0=Dom ... 6=Sab
  if(f==='Dias uteis')return dow>=1 && dow<=5;
  if(f==='Fim de semana')return dow===0 || dow===6;
  return true; // Diario / Hoje / Personalizado / sem frequencia
}

function taskCategoryColor(category){
  const map={'Saude':'var(--r)','Dev':'var(--c)','Estudo':'var(--c)','Dev/Estudo':'var(--c)','Treino':'#fcee09','Leitura':'#97C459','Casa':'#b44fff','Lazer':'#f97316'};
  return map[String(category||'').trim()] || 'var(--border)';
}

function renderTasks(){
  // Clean up any pending confirm timers and state before re-rendering
  _pendingConfirm.forEach((timer)=>clearTimeout(timer));
  _pendingConfirm.clear();
  const all = allTaskDefs(D());
  const activeDefs = all.map((task,index)=>({...task,index})).filter(t=>!t.archivedAt);
  const tasks = activeTasksToday();
  const saved = (D().tasks||{})[dk()]||{};
  const el = document.getElementById('task-list');
  if(!el) return;
  if(!tasks.length){
    // Diferencia "nunca teve contrato" de "hoje e dia de descanso"
    if(activeDefs.length){
      el.innerHTML=`<div class="smart-empty compact"><span>DIA DE DESCANSO</span><b>Nenhum contrato programado para hoje. Aproveite ou crie um avulso.</b>${RO()?'':`<div class="smart-actions"><button type="button" onclick="openContractModal()">+ CONTRATO AVULSO</button></div>`}</div>`;
      renderArchivedTasks();
      return;
    }
    el.innerHTML=RO()
      ? '<div class="empty">NENHUM CONTRATO ATIVO</div>'
      : `<div class="smart-empty">
          <span>SEU PRIMEIRO CONTRATO COM NIGHT CITY</span>
          <b>Escolha uma base automatica ou crie uma tarefa simples agora.</b>
          <div class="smart-actions">
            <button type="button" onclick="autoBuildFromHome('rotina')">SIM, MONTAR AUTOMATICO</button>
            <button type="button" onclick="autoBuildFromHome('estudo')">SO ESTUDO</button>
            <button type="button" onclick="autoBuildFromHome('treino')">SO TREINO</button>
            <button type="button" onclick="openContractModal()">+ CONTRATO</button>
          </div>
        </div>`;
    renderArchivedTasks();
    return;
  }
  // Yesterday pending check
  const yDate=new Date();yDate.setDate(yDate.getDate()-1);
  const yKey=localDateKey(yDate);
  const ySaved=(D().tasks||{})[yKey]||{};
  const yTasks=allTaskDefs(D()).map((task,index)=>({...task,index})).filter(t=>!t.archivedAt && taskActiveOn(t,yDate));
  const yPendingTexts=new Set(yTasks.filter((_,i)=>!ySaved[i]).map(t=>t.text));
  // Sort: uncompleted first, completed last (preserve original order within each group)
  const withDone=tasks.map((t,i)=>({t,i,done:!!saved[i]}));
  // Sort: smart = done last + priority first; original = keep order (25)
  if(_taskSortMode==='smart'){
    withDone.sort((a,b)=>{
      if(a.done!==b.done)return a.done?1:-1;
      if(!!b.t.priority!==!!a.t.priority)return a.t.priority?-1:1;
      return 0;
    });
  }
  // Time estimate for pending tasks (5)
  const pendingMins=withDone.filter(x=>!x.done).reduce((s,{t})=>s+parseMinutes(t.meta),0);
  const timeEl=document.getElementById('task-time-estimate');
  if(timeEl)timeEl.textContent=pendingMins>0?(pendingMins>=60?Math.round(pendingMins/60)+'h'+(pendingMins%60?` ${pendingMins%60}min`:''):pendingMins+' min'):'';
  // Filter tasks (10)
  const filtered=_taskFilter==='done'?withDone.filter(x=>x.done):_taskFilter==='pending'?withDone.filter(x=>!x.done):withDone;
  el.innerHTML = filtered.map(({t,i,done}) => {
    const catColor=taskCategoryColor(t.category);
    const wasYesterdayPending=yPendingTexts.has(t.text);
    return `
    <div class="task${done?' done':''}${RO()?' readonly':''}${t.priority?' priority':''}" data-task-index="${t.index}" style="--cat-color:${catColor}" onclick="toggleTask(this)" ondblclick="event.stopPropagation();toggleTaskPriority(${t.index})">
      ${RO()?'':`<button type="button" class="task-drag-handle" aria-label="Arrastar contrato" title="Segure e arraste para ordenar" onpointerdown="startTaskDrag(event,${t.index})">≡</button>`}
      ${t.priority?'<span class="task-pin">⚡</span>':''}
      <div class="task-box">✓</div>
      <div class="task-main">
        <span class="task-text">${htmlEscape(t.text)}${wasYesterdayPending&&!done?` <span class="task-yesterday">ONTEM</span>`:''}</span>
        <span class="task-meta">${htmlEscape([t.category,t.frequency,t.reminder?('Lembrete '+t.reminder):''].filter(Boolean).join(' // '))}</span>
      </div>
      ${t.tag?`<span class="task-tag">${htmlEscape(t.tag)}</span>`:''}
      ${RO()?'':`<div class="task-actions" onclick="event.stopPropagation()">
        <button type="button" onclick="openContractModal(${t.index})">EDITAR</button>
        <button type="button" onclick="duplicateTask(${t.index})">DUPLICAR</button>
        <button type="button" class="danger" onclick="archiveTask(${t.index})">ARQUIVAR</button>
      </div>`}
    </div>`;
  }).join('');
  // Update complete-all button visibility
  const allDone=withDone.length>0&&withDone.every(x=>x.done);
  const cab=document.getElementById('complete-all-btn');
  if(cab)cab.style.display=allDone?'none':'';
}

function syncTodayTasksFromDom(){
  if(RO())return;
  const ts={};
  document.querySelectorAll('#task-list .task').forEach((t,i)=>ts[i]=t.classList.contains('done'));
  if(!myData.tasks)myData.tasks={};
  myData.tasks[dk()]=ts;
}

function renderHabitsTable(){
  const habits = getHabits();
  const saved = (D().habits||{})[wk()]||{};
  const tbody = document.getElementById('habits-body');
  if(!tbody) return;
  if(!habits.length){
    tbody.innerHTML=RO()?'<tr><td colspan="8">NENHUM HABITO</td></tr>':`<tr><td colspan="8"><div class="smart-empty compact"><span>SEM HABITOS</span><b>Crie seu primeiro contrato para ativar o tracker semanal.</b><div class="smart-actions"><button type="button" onclick="openContractModal()">+ CRIAR PRIMEIRO CONTRATO</button></div></div></td></tr>`;
    return;
  }
  tbody.innerHTML = habits.map(h => {
    const cells = ['SEG','TER','QUA','QUI','SEX','SAB','DOM'].map((_,i) =>
      `<td><div class="hcell readonly${saved[h+'_'+i]?' on':''}" title="Marcado automaticamente pelos contratos">✓</div></td>`
    ).join('');
    return `<tr><td title="${htmlEscape(h)}">${htmlEscape(h)}</td>${cells}</tr>`;
  }).join('');
}

function syncTodayHabitsFromTasks(render=true){
  if(RO())return;
  if(!myData.habits)myData.habits={};
  const key=wk();
  const col=habitDayIndex(new Date());
  const week={...(myData.habits[key]||{})};
  Object.keys(week).forEach(k=>{if(k.endsWith('_'+col))delete week[k];});
  const defs=allTaskDefs(D());
  const active=defs.map((task,index)=>({...task,index})).filter(t=>!t.archivedAt);
  // mapeia indice original -> posicao na lista de habitos (getHabits usa getTasks)
  const habitPos={};active.forEach((t,pos)=>{habitPos[t.index]=pos;});
  document.querySelectorAll('#task-list .task').forEach(t=>{
    const idx=Number(t.dataset.taskIndex);
    const pos=habitPos[idx];
    if(pos===undefined)return;
    const name=taskHabitName(defs[idx],pos);
    week[name+'_'+col]=t.classList.contains('done');
  });
  myData.habits[key]=week;
  if(render){
    renderHabitsTable();
    renderConsistencyPanel();
  }
}

function habitDataWithLiveWeek(){
  const data = {...(D().habits||{})};
  const rows = document.querySelectorAll('#habits-body tr');
  if(rows.length){
    const live = {};
    rows.forEach(r=>{
      const name = r.querySelector('td')?.textContent || '';
      r.querySelectorAll('.hcell').forEach((c,i)=>live[name+'_'+i]=c.classList.contains('on'));
    });
    data[wk()] = live;
  }
  return data;
}

function habitDone(data,habit,date){
  const week = data[weekKeyFor(date)] || {};
  return !!week[habit+'_'+habitDayIndex(date)];
}

function habitPercentForWeeks(data,habits,weeks){
  let done=0,total=0;
  habits.forEach(h=>weeks.forEach(w=>{
    const week=data[w]||{};
    for(let i=0;i<7;i++){total++;if(week[h+'_'+i])done++;}
  }));
  return total?Math.round(done/total*100):0;
}

function habitPercentForDates(data,habits,dates){
  let done=0,total=0;
  habits.forEach(h=>dates.forEach(date=>{
    total++;
    if(habitDone(data,h,date))done++;
  }));
  return total?Math.round(done/total*100):0;
}

function monthHabitDates(){
  const now=new Date();
  const dates=[];
  for(let day=1;day<=now.getDate();day++){
    dates.push(new Date(now.getFullYear(),now.getMonth(),day));
  }
  return dates;
}

function habitStreak(data,habit){
  let count=0;
  const cursor=new Date();
  // Se hoje ainda nao foi marcado, nao zera a sequencia: conta a partir de ontem
  // (a sequencia continua "viva" ate o fim do dia).
  if(!habitDone(data,habit,cursor))cursor.setDate(cursor.getDate()-1);
  for(let i=0;i<370;i++){
    if(!habitDone(data,habit,cursor))break;
    count++;
    cursor.setDate(cursor.getDate()-1);
  }
  return count;
}

// True quando a tarefa de hoje ainda nao foi feita mas a sequencia segue viva.
function habitStreakAtRisk(data,habit){
  return habitStreak(data,habit)>0 && !habitDone(data,habit,new Date());
}

function recentWeekKeys(count=6){
  const out=[];
  const cursor=new Date();
  for(let i=0;i<count;i++){
    const key=weekKeyFor(cursor);
    if(!out.includes(key))out.unshift(key);
    cursor.setDate(cursor.getDate()-7);
  }
  return out;
}

function monthDateSet(rows){
  const now=new Date();
  const prefix=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-';
  return new Set((rows||[]).map(x=>x.date).filter(d=>String(d||'').startsWith(prefix)));
}

function monthlyGoalRows(){
  const g=getGoals();
  const days=Math.max(1,monthHabitDates().length);
  const books=D().books||[];
  const doneBooks=books.filter(x=>x.status==='done').length;
  const bookTarget=Math.max(1,Number(g.monthlyBooks)||1);
  const devDays=monthDateSet(D().devlog||[]).size;
  const guitarDays=monthDateSet(D().guitarlog||[]).size;
  const weightDays=monthDateSet(D().customPages?.treino?.weightLogs||[]).size;
  return [
    {name:'Livros',value:doneBooks+'/'+bookTarget,pct:Math.min(100,Math.round(doneBooks/bookTarget*100))},
    {name:'Dev logs',value:devDays+'/'+days+' dias',pct:Math.min(100,Math.round(devDays/days*100))},
    {name:'Violao',value:guitarDays+'/'+days+' dias',pct:Math.min(100,Math.round(guitarDays/days*100))},
    {name:'Treino',value:weightDays+'/'+Math.min(days,16)+' sessoes',pct:Math.min(100,Math.round(weightDays/Math.min(days,16)*100))}
  ];
}

function streakTooltip(data,habit){
  const out=[];
  const cursor=new Date();
  for(let i=13;i>=0;i--){
    const d=new Date(cursor);
    d.setDate(cursor.getDate()-i);
    out.push(habitDone(data,habit,d)?'✅':'⬜');
  }
  return out.join('');
}

function renderConsistencyPanel(){
  const el=document.getElementById('consistency-panel');
  if(!el)return;
  try{
  const habits=getHabits();
  if(!habits.length){el.innerHTML=RO()?'<div class="empty">NENHUM HABITO</div>':`<div class="smart-empty"><span>SEM CONSISTENCIA</span><b>A consistencia nasce do primeiro contrato marcado.</b><div class="smart-actions"><button type="button" onclick="autoBuildFromHome('rotina')">MONTAR ROTINA BASICA</button><button type="button" onclick="openContractModal()">+ CRIAR PRIMEIRO CONTRATO</button></div></div>`;return;}
  const data=habitDataWithLiveWeek();
  const currentWeek=wk();
  const weekPct=habitPercentForWeeks(data,habits,[currentWeek]);
  const monthPct=habitPercentForDates(data,habits,monthHabitDates());
  const rows=habits.map(h=>{
    let done=0;
    const week=data[currentWeek]||{};
    for(let i=0;i<7;i++)if(week[h+'_'+i])done++;
    return {name:h,pct:Math.round(done/7*100),streak:habitStreak(data,h)};
  });
  const best=[...rows].sort((a,b)=>b.pct-a.pct || b.streak-a.streak)[0];
  const worst=[...rows].sort((a,b)=>a.pct-b.pct || a.streak-b.streak)[0];
  const weekTrend=recentWeekKeys(6).map(key=>({key,pct:habitPercentForWeeks(data,habits,[key])}));
  const goalRows=monthlyGoalRows();
  // Extra kpis (6, 11, 14, 16, 20, 23)
  const bd=bestDayOfWeek(data,habits);
  const perfectDays=countPerfectDays();
  const pStreak=perfectDayStreak();
  const habitMonthPcts=habits.map(h=>({name:h,pct:habitPercentForDates(data,[h],monthHabitDates())}));
  const topHabit=[...habitMonthPcts].sort((a,b)=>b.pct-a.pct)[0];
  const lastMonthPct=habitPercentForDates(data,habits,lastMonthHabitDates());
  const monthDiff=monthPct-lastMonthPct;
  const achUnlocked=Object.keys(D().achievements||{}).length;
  el.innerHTML=`
    <div class="consistency-kpis">
      <div class="ckpi"><div class="ckpi-num">${weekPct}%</div><div class="ckpi-label">Semana</div></div>
      <div class="ckpi"><div class="ckpi-num">${monthPct}%</div><div class="ckpi-label">Mes atual</div></div>
      <div class="ckpi"><div class="ckpi-num">${htmlEscape(best?.name||'--')}</div><div class="ckpi-label">Melhor habito</div></div>
      <div class="ckpi"><div class="ckpi-num">${htmlEscape(worst?.name||'--')}</div><div class="ckpi-label">Pior habito</div></div>
      <div class="ckpi"><div class="ckpi-num">${bd.day}</div><div class="ckpi-label">Melhor dia (${bd.pct}%)</div></div>
      <div class="ckpi"><div class="ckpi-num">${perfectDays}</div><div class="ckpi-label">Dias perfeitos</div></div>
      <div class="ckpi"><div class="ckpi-num">${pStreak}</div><div class="ckpi-label">Streak perfeito</div></div>
      <div class="ckpi"><div class="ckpi-num">${htmlEscape(topHabit?.name.split(/[-–]/)[0].trim()||'--')}</div><div class="ckpi-label">Top habito mes (${topHabit?.pct||0}%)</div></div>
      <div class="ckpi"><div class="ckpi-num" style="color:${monthDiff>0?'var(--c)':monthDiff<0?'var(--r)':'inherit'}">${monthDiff>=0?'+':''}${monthDiff}%</div><div class="ckpi-label">vs mes passado</div></div>
      <div class="ckpi"><div class="ckpi-num">${achUnlocked}/${ACHIEVEMENTS.length}${achUnlocked===ACHIEVEMENTS.length?' ✓':''}</div><div class="ckpi-label">Conquistas</div></div>
    </div>
    <div class="consistency-grid">
      <div>
        ${rows.map(r=>`<div class="chart-row"><div class="chart-label" title="${htmlEscape(r.name)}">${htmlEscape(r.name)}</div><div class="chart-track"><div class="chart-fill" style="width:${r.pct}%"></div></div><div class="chart-value">${r.pct}%</div></div>`).join('')}
      </div>
      <div class="streak-list">
        ${rows.map(r=>`<div class="streak-item" title="${streakTooltip(data,r.name)}"><div class="streak-name">${htmlEscape(r.name)}</div><div class="streak-pill">${r.streak}D streak</div></div>`).join('')}
      </div>
      <div class="history-panel">
        <div class="history-title">Historico semanal</div>
        <div class="history-strip">
          ${weekTrend.map(w=>`<div class="history-bar" title="${formatWeekKey(w.key)}: ${w.pct}%"><span style="height:${Math.max(4,w.pct)}%"></span><b>${w.pct}%</b></div>`).join('')}
        </div>
      </div>
      <div class="history-panel">
        <div class="history-title">Metas do mes</div>
        ${goalRows.map(r=>`<div class="chart-row goal-row"><div class="chart-label">${htmlEscape(r.name)}</div><div class="chart-track"><div class="chart-fill goal-fill" style="width:${r.pct}%"></div></div><div class="chart-value">${htmlEscape(r.value)}</div></div>`).join('')}
      </div>
      <div class="history-panel full-span">
        ${(()=>{try{return monthHeatmapHtml();}catch(e){return '';}})()}
      </div>
      <div class="history-panel full-span" id="evolution-history-panel">
        ${evolutionHistoryHtml()}
      </div>
    </div>
    <div style="text-align:right;margin-top:8px"><button class="btn" onclick="exportWeeklyStats()" style="font-size:9px;padding:5px 12px;color:var(--muted);border-color:var(--border)">EXPORTAR STATS</button></div>`;
  }catch(e){
    console.error('[NC] renderConsistencyPanel falhou:',e);
    el.innerHTML=`<div class="empty" style="color:var(--r)">ERRO AO RENDERIZAR PAINEL — veja o console (F12) para detalhes: ${String(e)}</div>`;
  }
}

function dayCompletionPct(data,habits,date){
  if(!habits.length)return 0;
  let done=0;habits.forEach(h=>{if(habitDone(data,h,date))done++;});
  return Math.round(done/habits.length*100);
}

// Mapa de calor do mes atual (estilo GitHub), colorido por % de habitos do dia.
function monthHeatmapHtml(){
  const data=habitDataWithLiveWeek();
  const habits=getHabits();
  const now=new Date();
  const year=now.getFullYear(),month=now.getMonth();
  const days=new Date(year,month+1,0).getDate();
  const firstDow=(new Date(year,month,1).getDay()+6)%7; // 0=Seg
  const today=now.getDate();
  let cells='';
  for(let i=0;i<firstDow;i++)cells+='<div class="hm-cell hm-empty"></div>';
  for(let dnum=1;dnum<=days;dnum++){
    const date=new Date(year,month,dnum);
    const future=dnum>today;
    const pct=future?-1:dayCompletionPct(data,habits,date);
    const lvl=future?'future':pct===0?'l0':pct<34?'l1':pct<67?'l2':pct<100?'l3':'l4';
    cells+=`<div class="hm-cell hm-${lvl}${dnum===today?' hm-today':''}" title="Dia ${dnum}: ${future?'--':pct+'%'}"></div>`;
  }
  const dows=['S','T','Q','Q','S','S','D'];
  return `<div class="history-title">Mapa do mes</div>
    <div class="heatmap">
      <div class="hm-dows">${dows.map(l=>`<span>${l}</span>`).join('')}</div>
      <div class="hm-grid">${cells}</div>
    </div>
    <div class="hm-legend"><span>menos</span><i class="hm-cell hm-l0"></i><i class="hm-cell hm-l1"></i><i class="hm-cell hm-l2"></i><i class="hm-cell hm-l3"></i><i class="hm-cell hm-l4"></i><span>mais</span></div>`;
}

function progressiveHintKey(id){
  return 'nc_hint_'+(me||'anon')+'_'+id;
}

function showProgressiveHintOnce(id,title,message,duration=6200){
  if(!me || RO())return false;
  const key=progressiveHintKey(id);
  if(localStorage.getItem(key))return false;
  localStorage.setItem(key,new Date().toISOString());
  showCyberToast(title,message,duration);
  return true;
}

function renderProgressiveHints(){
  if(!me || RO())return;
  const reviews=myData.dailyReviews||{};
  const reviewed=Object.values(reviews).some(r=>r && r.updatedAt);
  if(!reviewed && getTasks().length){
    showProgressiveHintOnce('daily_review','FECHAR O DIA','Use a revisao diaria para registrar pendentes, nota do dia e plano de amanha.');
  }
  const habits=getHabits();
  const data=habitDataWithLiveWeek();
  const best=habits.map(h=>({name:h,streak:habitStreak(data,h)})).sort((a,b)=>b.streak-a.streak)[0];
  if(best && best.streak>=3){
    showProgressiveHintOnce('weekly_goal','META SEMANAL',best.name+' chegou a '+best.streak+' dias. Considere criar uma meta semanal.');
  }
  if(getTasks().length>=1){
    showProgressiveHintOnce('key_shortcut','ATALHO RAPIDO','Pressione N em qualquer lugar para criar um novo contrato sem abrir o menu.');
  }
}

function suggestTreinoStarter(){
  if(RO())return;
  ensureCustomPagesData();
  if((myData.customPages?.treino?.items||[]).length)return;
  showProgressiveHintOnce('treino_ab','TREINO A/B','Este modulo ainda esta vazio. Use CRIAR TREINO A BASICO para comecar rapido.');
}

function topStreakInfo(){
  const habits=getHabits();
  const data=habitDataWithLiveWeek();
  return habits.map(h=>({name:h,days:habitStreak(data,h)})).sort((a,b)=>b.days-a.days)[0] || {name:'--',days:0};
}

function streetCredScore(){
  const data=D();
  const today=dk();
  // Cache allTaskDefs once to avoid re-computing for every historical day
  const cachedTaskDefs=allTaskDefs(data);
  // Cap each day's task contribution at that day's actual task definition count (anti-exploit)
  const taskDone=Object.entries(data.tasks||{}).reduce((sum,[dayKey,dayTasks])=>{
    if(!dayTasks||dayKey>today)return sum; // ignore future-dated task entries
    const dayDate=new Date(dayKey+'T12:00:00');
    const dayDefs=cachedTaskDefs.filter(t=>!t.archivedAt&&taskActiveOn(t,dayDate));
    const cap=Math.max(dayDefs.length,1);
    const dayDone=Object.values(dayTasks).filter(Boolean).length;
    return sum+Math.min(dayDone,cap);
  },0);
  // Only count reviews for past/present dates (no future-planted entries)
  const reviews=Object.entries(data.dailyReviews||{}).filter(([k,r])=>r?.updatedAt&&k<=today).length;
  const books=(data.books||[]).filter(b=>b.status==='done').length;
  const projects=(data.projects||[]).filter(p=>p.status==='done').length;
  const games=(data.games||[]).filter(g=>g.status==='done').length;
  const logs=(data.devlog||[]).length+(data.guitarlog||[]).length+(data.activityHistory||[]).length;
  const streak=topStreakInfo().days;
  // Only count quests/challenges with a date key <= today
  const quests=Object.keys(data.quests||{}).filter(k=>k<=today).length;
  const weekToday=wk();
  const weeklyChallenges=Object.keys(data.weeklyChallenges||{}).filter(k=>k<=weekToday).length;
  const achievements=Object.keys(data.achievements||{}).length;
  return taskDone + reviews*3 + books*10 + projects*12 + games*8 + logs*2 + streak*5 + quests*QUEST_CRED + achievements*5 + weeklyChallenges*WEEKLY_CRED;
}

const STREET_CRED_TIERS=[
  {min:0,name:'Recruta'},
  {min:40,name:'Runner iniciante'},
  {min:100,name:'Operador ativo'},
  {min:250,name:'Fixer confiavel'},
  {min:500,name:'Lenda local'}
];

function streetCredRank(score){
  let name='Recruta';
  for(const t of STREET_CRED_TIERS)if(score>=t.min)name=t.name;
  return name;
}

// Progresso ate o proximo rank: {rank, next, into, span, pct, max}
function streetCredProgress(score){
  let idx=0;
  for(let i=0;i<STREET_CRED_TIERS.length;i++)if(score>=STREET_CRED_TIERS[i].min)idx=i;
  const cur=STREET_CRED_TIERS[idx];
  const nxt=STREET_CRED_TIERS[idx+1]||null;
  if(!nxt)return {rank:cur.name,next:null,into:0,span:0,pct:100,max:true};
  const span=nxt.min-cur.min;
  const into=score-cur.min;
  return {rank:cur.name,next:nxt.name,into,span,pct:Math.min(100,Math.round(into/span*100)),max:false,remaining:nxt.min-score};
}

/* ============================================================
   FEEDBACK SENSORIAL: som (WebAudio, sem assets) + haptico
   ============================================================ */
let _audioCtx=null;
function soundEnabled(){return (myData.prefs?.sound)!==false;}
function audioCtx(){
  if(!soundEnabled())return null;
  try{
    if(!_audioCtx)_audioCtx=new (window.AudioContext||window.webkitAudioContext)();
    if(_audioCtx.state==='suspended')_audioCtx.resume();
    return _audioCtx;
  }catch(e){return null;}
}
// kind: 'tick' | 'win' | 'levelup'
function fxBlip(kind='tick'){
  const ctx=audioCtx();
  if(!ctx)return;
  try{
    const now=ctx.currentTime;
    const seq = kind==='win' ? [[660,0],[880,0.08],[1180,0.16]]
              : kind==='levelup' ? [[523,0],[784,0.1],[1046,0.2],[1318,0.3]]
              : [[880,0]];
    seq.forEach(([freq,off])=>{
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.type=kind==='tick'?'square':'triangle';
      osc.frequency.value=freq;
      gain.gain.setValueAtTime(0.0001,now+off);
      gain.gain.exponentialRampToValueAtTime(0.16,now+off+0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001,now+off+0.14);
      osc.connect(gain);gain.connect(ctx.destination);
      osc.start(now+off);osc.stop(now+off+0.16);
    });
  }catch(e){}
}
function fxHaptic(ms=15){
  if((myData.prefs?.haptics)===false)return;
  try{if(navigator.vibrate)navigator.vibrate(ms);}catch(e){}
}
// Celebracao em tela cheia (glitch + flash). kind muda a intensidade.
function celebrate(kind='day'){
  // som/haptico sempre; o efeito visual respeita o modo de movimento
  fxHaptic(kind==='levelup'?[20,40,20]:[15,30,15]);
  fxBlip(kind==='levelup'?'levelup':'win');
  if(motionMode==='off')return;
  let layer=document.getElementById('celebrate-layer');
  if(!layer){
    layer=document.createElement('div');
    layer.id='celebrate-layer';
    document.body.appendChild(layer);
  }
  layer.className='celebrate-'+kind+' on';
  setTimeout(()=>{layer.classList.remove('on');},kind==='levelup'?1400:1000);
}

/* ============================================================
   CONQUISTAS / ACHIEVEMENTS
   ============================================================ */
const ACHIEVEMENTS=[
  {id:'first_contract',name:'PRIMEIRO CONTRATO',desc:'Marcou seu primeiro contrato.',cred:5,test:d=>tasksCompletedTotal(d)>=1},
  {id:'day_complete',name:'DIA LIMPO',desc:'Concluiu todos os contratos de um dia.',cred:10,test:d=>!!d._dayComplete},
  {id:'streak_7',name:'CORRENTE DE 7',desc:'Sequencia de 7 dias em um habito.',cred:15,test:d=>maxStreak(d)>=7},
  {id:'streak_30',name:'CORRENTE DE 30',desc:'Sequencia de 30 dias. Disciplina de runner.',cred:40,test:d=>maxStreak(d)>=30},
  {id:'streak_100',name:'INQUEBRAVEL',desc:'100 dias seguidos. Lenda de Night City.',cred:100,test:d=>maxStreak(d)>=100},
  {id:'bookworm',name:'RATO DE BIBLIOTECA',desc:'Concluiu seu primeiro livro.',cred:10,test:d=>(d.books||[]).some(b=>b.status==='done')},
  {id:'builder',name:'DECK BUILDER',desc:'Concluiu seu primeiro projeto.',cred:12,test:d=>(d.projects||[]).some(p=>p.status==='done')},
  {id:'polyglot',name:'MULTITAREFA',desc:'Logou dev e violao no mesmo dia.',cred:12,test:d=>sameDayDevGuitar(d)},
  {id:'night_owl',name:'CORUJA',desc:'Fechou o dia 5 vezes.',cred:15,test:d=>Object.values(d.dailyReviews||{}).filter(r=>r?.updatedAt).length>=5},
  {id:'streak_3',name:'PRIMEIROS PASSOS',desc:'Sequencia de 3 dias em qualquer habito.',cred:5,test:d=>maxStreak(d)>=3},
  {id:'streak_14',name:'DUAS SEMANAS',desc:'14 dias seguidos. Runner de verdade.',cred:20,test:d=>maxStreak(d)>=14},
  {id:'perfect_day',name:'DIA LIMPO TOTAL',desc:'100% dos contratos em um dia.',cred:15,test:d=>!!d._dayComplete},
  {id:'first_review',name:'FECHAMENTO',desc:'Fez a primeira revisao do dia.',cred:5,test:d=>Object.values(d.dailyReviews||{}).some(r=>r?.updatedAt)},
  {id:'night_owl_pro',name:'CORUJA VETERANA',desc:'Fechou o dia 15 vezes.',cred:25,test:d=>Object.values(d.dailyReviews||{}).filter(r=>r?.updatedAt).length>=15},
  {id:'bookworm_pro',name:'DEVORADOR',desc:'5 livros concluidos.',cred:20,test:d=>(d.books||[]).filter(b=>b.status==='done').length>=5},
  {id:'week_perfect',name:'SEMANA IMPLACAVEL',desc:'7 quests diarias completadas.',cred:30,test:d=>Object.keys(d.quests||{}).length>=7},
  {id:'cred_100',name:'OPERADOR DE ELITE',desc:'Acumulou 100 de Street Cred.',cred:20,test:d=>streetCredScore()>=100}
];
function tasksCompletedTotal(d){return Object.values(d.tasks||{}).reduce((s,day)=>s+Object.values(day||{}).filter(Boolean).length,0);}
function maxStreak(d){const data=habitDataWithLiveWeek();return getHabits().reduce((m,h)=>Math.max(m,habitStreak(data,h)),0);}
function sameDayDevGuitar(d){
  const dev=new Set((d.devlog||[]).map(x=>x.date));
  return (d.guitarlog||[]).some(x=>dev.has(x.date));
}
function unlockedAchievements(){return (D().achievements)||{};}
function checkAchievements(extra){
  if(RO())return;
  myData.achievements=myData.achievements||{};
  const ctx={...myData,...(extra||{})};
  let changed=false;
  ACHIEVEMENTS.forEach(a=>{
    if(myData.achievements[a.id])return;
    let ok=false;try{ok=a.test(ctx);}catch(e){ok=false;}
    if(ok){
      myData.achievements[a.id]={at:new Date().toISOString()};
      changed=true;
      setTimeout(()=>{
        celebrate('levelup');
        showCyberToast('CONQUISTA DESBLOQUEADA',a.name+' // +'+a.cred+' REP',7000);
      },250);
    }
  });
  if(changed){renderAchievements();updateStats();scheduleAutoSave();}
}
function renderAchievements(){
  const el=document.getElementById('achievement-list');
  if(!el)return;
  try{
    const got=unlockedAchievements();
    el.innerHTML=ACHIEVEMENTS.map(a=>{
      const on=!!got[a.id];
      return `<div class="ach-item${on?' on':''}"><div class="ach-ico">${on?'◆':'◇'}</div><div class="ach-info"><div class="ach-name">${htmlEscape(a.name)}</div><div class="ach-desc">${htmlEscape(a.desc)}</div></div><div class="ach-cred">+${a.cred}</div></div>`;
    }).join('');
  }catch(e){
    console.error('[NC] renderAchievements falhou:',e);
    el.innerHTML=`<div class="empty" style="color:var(--r)">ERRO: ${String(e)}</div>`;
  }
}

/* ============================================================
   DESAFIO SEMANAL
   ============================================================ */
const WEEKLY_CHALLENGES=[
  'Complete todos os contratos por 5 dias esta semana.',
  'Faca 3 ou mais revisoes de dia esta semana.',
  'Mantenha pelo menos um habito por 7 dias seguidos.',
  'Adicione um novo livro, projeto ou jogo esta semana.',
  'Registre um log de dev ou violao por 3 dias.',
  'Bata sua meta de leitura do mes.',
  'Complete a missao diaria por 5 dias seguidos.'
];
const WEEKLY_CRED=15;
function thisWeeksChallenge(){
  const key=wk();
  const idx=[...key].reduce((a,c)=>a+c.charCodeAt(0),0)%WEEKLY_CHALLENGES.length;
  return {key,idx,text:WEEKLY_CHALLENGES[idx]};
}
function weeklyChallengeDone(){const c=thisWeeksChallenge();return !!((D().weeklyChallenges||{})[c.key]);}
function completeWeeklyChallenge(){
  if(RO())return;
  const c=thisWeeksChallenge();
  myData.weeklyChallenges=myData.weeklyChallenges||{};
  if(myData.weeklyChallenges[c.key])return;
  myData.weeklyChallenges[c.key]={idx:c.idx,at:new Date().toISOString()};
  const ew=awardEddies(40,'weekly');
  renderWeeklyChallenge();
  updateStats();
  celebrate('day');
  showCyberToast('DESAFIO SEMANAL CONCLUIDO','+'+WEEKLY_CRED+' REP'+(ew?' // +€$'+ew:'')+' // SEMANA DOMINADA',7500);
  scheduleAutoSave();
}
function renderWeeklyChallenge(){
  const el=document.getElementById('weekly-challenge');
  if(!el)return;
  const c=thisWeeksChallenge();
  const done=weeklyChallengeDone();
  const now=new Date();
  // Days until next Monday (week reset). getDay(): 0=Sun,1=Mon,...,6=Sat
  const daysLeft=now.getDay()===0?1:8-now.getDay();
  const daysLabel=daysLeft===1?'1D // ULTIMO DIA':daysLeft+'D';
  el.className='weekly-challenge'+(done?' done':'');
  el.innerHTML=`<div class="dq-tag wc-tag">DESAFIO SEMANAL</div><div class="dq-text">${htmlEscape(c.text)}</div><span class="dq-tag" style="margin-left:auto">${htmlEscape(daysLabel)}</span>${RO()?'':`<button type="button" class="dq-btn" onclick="completeWeeklyChallenge()">${done?'CONCLUIDO ✓':'RESGATAR +'+WEEKLY_CRED+' REP'}</button>`}`;
}

/* ============================================================
   MISSAO DIARIA: micro-desafio rotativo que da REP extra
   ============================================================ */
const DAILY_QUESTS=[
  'Feche o dia com uma revisao curta.',
  'Registre 1 log de evolucao (dev, violao ou leitura).',
  'Complete todos os contratos do dia.',
  'Escreva 1 reflexao, mesmo que curta.',
  'Revise sua meta principal da semana.',
  'Dedique 5 minutos a mais ao seu habito mais dificil.',
  'Planeje os contratos de amanha.',
  'Adicione ou atualize 1 item de leitura, dev ou jogo.'
];
const QUEST_CRED=8;

// Missao baseada em comportamento real do usuario (devlog, leitura, ontem).
function contextualQuest(){
  const data=D();
  const key=dk();
  const today=new Date();
  const yesterday=new Date();yesterday.setDate(today.getDate()-1);
  const yKey=localDateKey(yesterday);

  const devlogs=data.devlog||[];
  const lastDevLog=devlogs[0]?.date||null;
  const daysSinceDev=lastDevLog?Math.max(0,Math.floor((today-new Date(lastDevLog+'T12:00:00'))/864e5)):999;

  const books=data.books||[];
  const lastBookUpdate=books.map(b=>b.updatedAt||b.added||'').filter(Boolean).sort().pop()||null;
  const daysSinceBook=lastBookUpdate?Math.max(0,Math.floor((today-new Date(lastBookUpdate))/864e5)):999;

  const yDefs=allTaskDefs(data).map((t,i)=>({...t,_i:i})).filter(t=>!t.archivedAt&&taskActiveOn(t,yesterday));
  const ySaved=(data.tasks||{})[yKey]||{};
  const yDone=yDefs.filter((_,i)=>ySaved[i]).length;
  const failedYesterday=yDefs.length>0&&yDone/yDefs.length<0.5;

  const snap=todayTaskSnapshot();
  const allDoneEarly=snap.total>0&&snap.pending.length===0;

  if(failedYesterday){
    return {key,text:'Missao recuperacao: complete so 1 contrato hoje e reacenda o ritmo.',contextual:true};
  }
  if(daysSinceDev>=3&&daysSinceDev<999){
    return {key,text:'Sem log de dev ha '+daysSinceDev+' dias. Abra seu projeto e registre uma sessao hoje.',contextual:true};
  }
  if(daysSinceBook>=5&&daysSinceBook<999){
    return {key,text:'Sem progresso de leitura ha '+daysSinceBook+' dias. Avance uma pagina e registre.',contextual:true};
  }
  if(allDoneEarly){
    return {key,text:'Dia limpo! Bonus: escreva uma reflexao sobre o que aprendeu hoje.',contextual:true};
  }
  const idx=[...key].reduce((a,c)=>a+c.charCodeAt(0),0)%DAILY_QUESTS.length;
  return {key,idx,text:DAILY_QUESTS[idx]};
}

function todaysQuest(){return contextualQuest();}
function questDone(){const q=todaysQuest();return !!((D().quests||{})[q.key]);}
function completeDailyQuest(){
  if(RO())return;
  const q=todaysQuest();
  myData.quests=myData.quests||{};
  if(myData.quests[q.key])return;
  myData.quests[q.key]={idx:q.idx??-1,at:new Date().toISOString()};
  const eq=awardEddies(20,'quest');
  renderDailyQuest();
  updateStats();
  celebrate('day');
  showCyberToast('MISSAO DIARIA CONCLUIDA','+'+QUEST_CRED+' REP'+(eq?' // +€$'+eq:'')+' // '+htmlEscape(q.text),6500);
  scheduleAutoSave();
}
function renderDailyQuest(){
  const el=document.getElementById('daily-quest');
  if(!el)return;
  const q=todaysQuest();
  const done=questDone();
  const tag=q.contextual?'MISSAO CONTEXTUAL':'MISSAO DIARIA';
  el.className='daily-quest'+(done?' done':'')+(q.contextual?' contextual':'');
  el.innerHTML=`<div class="dq-tag">${tag}</div><div class="dq-text">${htmlEscape(q.text)}</div>${RO()?'':`<button type="button" class="dq-btn" onclick="completeDailyQuest()">${done?'CONCLUIDA ✓':'RESGATAR +'+QUEST_CRED+' REP'}</button>`}`;
}

function evolutionHistoryHtml(){
  const rows=Array.isArray(D().activityHistory)?D().activityHistory:[];
  const counts=rows.reduce((acc,r)=>{acc[r.kind]=(acc[r.kind]||0)+1;return acc;},{});
  const kinds=['leitura','dev','violao','treino','review'];
  const recent=rows.slice(0,8);
  return `
    <div class="history-title">Historico real de evolucao</div>
    <div class="evolution-kinds">
      ${kinds.map(k=>`<div class="evolution-chip"><span>${k.toUpperCase()}</span><b>${counts[k]||0}</b></div>`).join('')}
    </div>
    <div class="evolution-list">
      ${recent.length?recent.map(r=>`
        <div class="evolution-row">
          <span>${htmlEscape(r.date||'--')}</span>
          <b>${htmlEscape((r.kind||'log').toUpperCase())}</b>
          <em>${htmlEscape(r.title||r.note||'Registro')}</em>
          ${r.weight?`<strong>${htmlEscape(r.weight)}kg</strong>`:''}
          ${r.duration?`<strong>${htmlEscape(r.duration)}min</strong>`:''}
        </div>`).join(''):'<div class="empty">SEM HISTORICO ESTRUTURADO AINDA</div>'}
    </div>`;
}

function renderEvolutionHistory(){
  const el=document.getElementById('evolution-history-panel');
  if(el)el.innerHTML=evolutionHistoryHtml();
}

/* ============================================================
   MODO FOCO (3)
   ============================================================ */
function toggleFocusMode(){
  const on=document.body.classList.toggle('focus-mode');
  showCyberToast(on?'MODO FOCO ATIVO':'MODO FOCO DESATIVADO',on?'Pressione F ou ESC para sair.':'Visao completa restaurada.',3500);
  if(on){
    try{document.getElementById('task-list')?.scrollIntoView({behavior:'smooth',block:'start'});}catch(e){}
  }
}

/* ============================================================
   FRASES CYBERPUNK (7)
   ============================================================ */
const CYBER_QUOTES=[
  'A noite pertence aos runners.',
  'Nao confie em corporacoes. Nao confie em ninguem.',
  'Edicoes de estilo sao permanentes. Escolha sabiamente.',
  'A melhor arma e uma mente disciplinada.',
  'Night City nao te deve nada. Cobre com trabalho.',
  'Rotina e o hack mais poderoso.',
  'Cada habito e um implante que voce instala em si mesmo.',
  'Os fracos param. Os runners adaptam.',
  'Seu corpo, seu sistema operacional.',
  'Consistencia bate talento todo dia.'
];
function todaysQuote(){
  const key=dk();
  const idx=[...key].reduce((a,c)=>a+c.charCodeAt(0),0)%CYBER_QUOTES.length;
  return CYBER_QUOTES[idx];
}
function renderDailyQuote(){
  const el=document.getElementById('daily-quote');
  if(el)el.textContent='// '+todaysQuote()+' //';
}

/* ============================================================
   SAVE INDICATOR (8)
   ============================================================ */
function updateSaveIndicator(){
  const el=document.getElementById('save-indicator');
  if(!el)return;
  if(!_lastSaveTs){el.textContent='';return;}
  const mins=Math.round((Date.now()-_lastSaveTs)/60000);
  el.textContent=mins<1?'SYNC AGORA':'SYNC '+mins+'MIN';
}

/* ============================================================
   COMPACT MODE (9)
   ============================================================ */
function toggleCompactMode(){
  document.body.classList.toggle('compact-tasks');
  const on=document.body.classList.contains('compact-tasks');
  localStorage.setItem('nc_compact',on?'1':'');
}

/* ============================================================
   TASK FILTER (10)
   ============================================================ */
function setTaskFilter(f){
  _taskFilter=f;
  document.querySelectorAll('.task-filter-btn').forEach(b=>b.classList.toggle('active',b.dataset.filter===f));
  renderTasks();
}

/* ============================================================
   DIAS PERFEITOS (11, 16)
   ============================================================ */
function countPerfectDays(){
  const tasksByDay=D().tasks||{};
  let count=0;
  Object.entries(tasksByDay).forEach(([dateKey,saved])=>{
    const date=new Date(dateKey.replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3'));
    if(isNaN(date))return;
    const defs=allTaskDefs(D()).filter(t=>!t.archivedAt&&taskActiveOn(t,date));
    if(!defs.length)return;
    if(defs.every((_,i)=>saved[i]))count++;
  });
  return count;
}
function perfectDayStreak(){
  const cursor=new Date();
  let streak=0;
  for(let i=0;i<60;i++){
    const key=localDateKey(cursor);
    const saved=(D().tasks||{})[key]||{};
    const defs=allTaskDefs(D()).filter(t=>!t.archivedAt&&taskActiveOn(t,cursor));
    if(!defs.length){cursor.setDate(cursor.getDate()-1);continue;}
    if(!defs.every((_,idx)=>saved[idx]))break;
    streak++;
    cursor.setDate(cursor.getDate()-1);
  }
  return streak;
}

/* ============================================================
   MELHOR DIA DA SEMANA (6)
   ============================================================ */
function bestDayOfWeek(data,habits){
  if(!habits || !habits.length) return {day:'--',pct:0};
  const dow=['Seg','Ter','Qua','Qui','Sex','Sab','Dom'];
  const counts=Array(7).fill(0);const totals=Array(7).fill(0);
  Object.values(data).forEach(week=>{
    habits.forEach(h=>{
      for(let i=0;i<7;i++){totals[i]++;if(week[h+'_'+i])counts[i]++;}
    });
  });
  const pcts=totals.map((t,i)=>t?Math.round(counts[i]/t*100):0);
  const maxPct=Math.max(...pcts);
  if(!isFinite(maxPct)) return {day:'--',pct:0};
  const best=pcts.indexOf(maxPct);
  return {day:dow[best]||'--',pct:pcts[best]||0};
}

/* ============================================================
   ULTIMO MES (20)
   ============================================================ */
function lastMonthHabitDates(){
  const now=new Date();
  const year=now.getMonth()===0?now.getFullYear()-1:now.getFullYear();
  const month=now.getMonth()===0?11:now.getMonth()-1;
  const days=new Date(year,month+1,0).getDate();
  const dates=[];
  for(let d=1;d<=days;d++)dates.push(new Date(year,month,d));
  return dates;
}

/* ============================================================
   EXPORTAR STATS (15)
   ============================================================ */
function exportWeeklyStats(){
  const tasks=activeTasksToday();
  const saved=(D().tasks||{})[dk()]||{};
  const done=tasks.filter((_,i)=>saved[i]).length;
  const cred=streetCredScore();
  const streak=topStreakInfo();
  const perfect=countPerfectDays();
  const rank=streetCredRank(cred);
  const text=[
    '🌆 NIGHT CITY — RESUMO',
    `📅 ${new Date().toLocaleDateString('pt-BR')}`,
    `✅ Contratos hoje: ${done}/${tasks.length}`,
    `⚡ Street Cred: ${cred} (${rank})`,
    `🔥 Maior streak: ${streak.days} dias — ${streak.name}`,
    `🏆 Dias perfeitos: ${perfect}`,
    `🎯 Conquistas: ${Object.keys(D().achievements||{}).length}`,
  ].join('\n');
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(()=>showCyberToast('STATS COPIADOS','Resumo copiado para o clipboard.',4000)).catch(()=>showCyberToast('STATS SEMANAIS',text,12000));
  }else{
    showCyberToast('STATS SEMANAIS',text,12000);
  }
}

/* ============================================================
   LORE DE RANK (17)
   ============================================================ */
const RANK_LORE={
  'Runner iniciante':'Voce acaba de entrar no jogo. Night City ainda nao sabe seu nome.',
  'Operador ativo':'Seu nome comeca a circular nos corredores. Os fixers estao de olho.',
  'Fixer confiavel':'Os grandes contratos chegam ate voce. A corporacao te nota.',
  'Lenda local':'Night City conhece seu nome. Poucos chegaram aqui.'
};

/* ============================================================
   AVATAR DE RANK (19)
   ============================================================ */
function rankAvatar(score){
  const tier=streetCredRank(score);
  const avatars={'Recruta':'◈','Runner iniciante':'◆','Operador ativo':'◉','Fixer confiavel':'⬡','Lenda local':'★'};
  return avatars[tier]||'◈';
}

/* ============================================================
   TOGGLE PRIORITY (4)
   ============================================================ */
function toggleTaskPriority(i){
  if(!myData.taskDefs||!myData.taskDefs[i])return;
  myData.taskDefs[i].priority=!myData.taskDefs[i].priority;
  renderTasks();
  renderTaskEditList();
  scheduleAutoSave();
}

/* ============================================================
   PARSE MINUTES (5)
   ============================================================ */
function parseMinutes(meta){
  if(!meta)return 0;
  const m=String(meta).toLowerCase();
  const h=m.match(/(\d+)\s*h/);const min=m.match(/(\d+)\s*min/);
  return (h?parseInt(h[1])*60:0)+(min?parseInt(min[1]):0);
}

/* ============================================================
   TOGGLE TASK SORT (25)
   ============================================================ */
function toggleTaskSort(){
  _taskSortMode=_taskSortMode==='smart'?'original':'smart';
  renderTasks();
}

function summarizeHabitWeek(weekKey){
  const week=(myData.habits||{})[weekKey]||{};
  const names=[...new Set(Object.keys(week).map(k=>k.replace(/_\d$/,'')))];
  if(!names.length){
    return {percent:0,best:null,worst:null,rows:[],done:0,total:0};
  }
  let done=0,total=0;
  const rows=names.map(name=>{
    let count=0;
    for(let i=0;i<7;i++){
      total++;
      if(week[name+'_'+i]){done++;count++;}
    }
    return {name,count,pct:Math.round(count/7*100)};
  }).sort((a,b)=>b.pct-a.pct || b.count-a.count);
  return {
    percent:total?Math.round(done/total*100):0,
    best:rows[0]||null,
    worst:[...rows].sort((a,b)=>a.pct-b.pct || a.count-b.count)[0]||null,
    rows,done,total
  };
}

function showWeeklySummary(weekKey){
  const modal=document.getElementById('weekly-summary');
  if(!modal)return;
  const summary=summarizeHabitWeek(weekKey);
  document.getElementById('week-summary-sub').textContent='// '+formatWeekKey(weekKey)+' ENCERRADA //';
  document.getElementById('week-summary-percent').textContent=summary.percent+'%';
  document.getElementById('week-summary-best').textContent=summary.best?summary.best.name:'--';
  document.getElementById('week-summary-worst').textContent=summary.worst?summary.worst.name:'--';
  const list=document.getElementById('week-summary-list');
  list.innerHTML=summary.rows.length ? summary.rows.map(r=>`
    <div class="chart-row">
      <div class="chart-label" title="${htmlEscape(r.name)}">${htmlEscape(r.name)}</div>
      <div class="chart-track"><div class="chart-fill" style="width:${r.pct}%"></div></div>
      <div class="chart-value">${r.count}/7</div>
    </div>`).join('') : '<div class="empty">SEM DADOS NA SEMANA ANTERIOR</div>';
  modal.classList.add('on');
}

function closeWeeklySummary(){
  const modal=document.getElementById('weekly-summary');
  if(modal)modal.classList.remove('on');
}

async function handleWeeklyRollover(){
  if(!me || RO())return;
  const current=wk();
  const last=typeof myData.lastSeenWeek==='string' ? myData.lastSeenWeek : null;
  if(!last){
    myData.lastSeenWeek=current;
    try{await dbSet(me,'lastSeenWeek',current);}catch(e){scheduleAutoSave();}
    return;
  }
  if(last===current)return;
  showWeeklySummary(last);
  myData.lastSeenWeek=current;
  try{await dbSet(me,'lastSeenWeek',current);}catch(e){scheduleAutoSave();}
}

function notificationStatusText(){
  if(!('Notification' in window))return 'Notification API indisponivel neste navegador';
  if(Notification.permission==='granted')return 'Notificacoes permitidas neste navegador';
  if(Notification.permission==='denied')return 'Notificacoes bloqueadas pelo navegador';
  return 'Clique em PERMITIR para ativar notificacoes';
}

function nextReminderText(){
  const active=Object.values(reminders||{}).filter(r=>r.enabled && r.time).sort((a,b)=>a.time.localeCompare(b.time));
  if(!active.length)return '--';
  const now=new Date();
  const nowMin=now.getHours()*60+now.getMinutes();
  const next=active.find(r=>{
    const [h,m]=(r.time||'00:00').split(':').map(Number);
    return h*60+m>=nowMin;
  }) || active[0];
  return next.name.toUpperCase()+' '+next.time;
}

async function registerNotificationWorker(){
  if(!('serviceWorker' in navigator))return null;
  try{
    const reg=await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;
    renderNotificationDiagnostics();
    return reg;
  }catch(e){
    console.warn('Service worker indisponivel:',e);
    renderNotificationDiagnostics();
    return null;
  }
}

function urlBase64ToUint8Array(base64String){
  const padding='='.repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
  const rawData=atob(base64);
  return Uint8Array.from([...rawData].map(ch=>ch.charCodeAt(0)));
}

function webPushSupported(){
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function currentPushSubscription(){
  if(!webPushSupported())return null;
  try{
    const reg=await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  }catch(e){return null;}
}

async function savePushSubscription(sub){
  if(!sb || !me || !sub)return;
  const payload={
    username:me,
    endpoint:sub.endpoint,
    subscription:sub.toJSON(),
    user_agent:navigator.userAgent,
    enabled:true,
    updated_at:new Date().toISOString()
  };
  const {error}=await sb.from('push_subscriptions').upsert(payload,{onConflict:'endpoint'});
  if(error)throw error;
}

async function enableClosedPush(){
  if(!webPushSupported()){
    showCyberToast('PUSH INDISPONIVEL','Este navegador nao suporta Web Push em segundo plano.');
    renderNotificationDiagnostics();
    return;
  }
  if(!WEB_PUSH_PUBLIC_KEY){
    showCyberToast('BACKEND PENDENTE','Para notificar com o site fechado, configure a VAPID public key e faça deploy da funcao Supabase.');
    renderNotificationDiagnostics();
    return;
  }
  const perm=Notification.permission==='granted' ? 'granted' : await Notification.requestPermission();
  if(perm!=='granted'){
    showCyberToast('PERMISSAO NEGADA','O navegador bloqueou notificacoes neste aparelho.');
    renderNotificationDiagnostics();
    return;
  }
  try{
    const reg=await registerNotificationWorker();
    const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(WEB_PUSH_PUBLIC_KEY)});
    await savePushSubscription(sub);
    showCyberToast('PUSH FECHADO ATIVO','Este aparelho foi inscrito para receber Web Push quando o site estiver fechado.');
  }catch(e){
    console.error(e);
    showCyberToast('ERRO NO PUSH','Nao foi possivel registrar este aparelho. Confira tabela push_subscriptions e chaves VAPID.');
  }
  renderNotificationDiagnostics();
}

function renderNotificationDiagnostics(){
  const browser=document.getElementById('notify-browser');
  const worker=document.getElementById('notify-worker');
  const push=document.getElementById('notify-push');
  const next=document.getElementById('notify-next');
  const last=document.getElementById('notify-last-test');
  const endpoint=document.getElementById('notify-push-endpoint');
  if(browser)browser.textContent=('Notification' in window) ? (Notification.permission||'default').toUpperCase() : 'INDISPONIVEL';
  if(worker)worker.textContent=('serviceWorker' in navigator) ? (navigator.serviceWorker.controller?'ATIVO':'SUPORTADO') : 'INDISPONIVEL';
  if(push){
    if(!webPushSupported())push.textContent='INDISPONIVEL';
    else if(!WEB_PUSH_PUBLIC_KEY)push.textContent='BACKEND';
    else currentPushSubscription().then(s=>{push.textContent=s?'ATIVO':'DESLIGADO';}).catch(()=>{push.textContent='ERRO';});
  }
  if(next)next.textContent=nextReminderText();
  if(last)last.textContent=localStorage.getItem('nc_last_notification_test_v1_'+(me||'anon'))||'--';
  if(endpoint){
    if(!webPushSupported())endpoint.textContent='INDISPONIVEL';
    else currentPushSubscription().then(s=>{
      endpoint.textContent=s?.endpoint ? '...'+s.endpoint.slice(-10) : 'SEM INSCRICAO';
    }).catch(()=>{endpoint.textContent='ERRO';});
  }
}

function renderReminders(){
  renderNotificationDiagnostics();
  const el=document.getElementById('reminder-list');
  if(!el)return;
  const items=Object.values(reminders||{});
  el.innerHTML=items.map(r=>`
    <div class="reminder-row">
      <div><div class="reminder-name">${htmlEscape(r.name)}</div><div class="reminder-sub">${r.enabled?'ATIVO':'DESLIGADO'} ? ${htmlEscape(r.message)}</div></div>
      <input class="reminder-time" type="time" value="${htmlEscape(r.time||'00:00')}" onchange="updateReminderTime('${r.id}',this.value)" ${RO()?'disabled':''}>
      <div class="reminder-toggle ${r.enabled?'on':''}" onclick="toggleReminder('${r.id}')">${r.enabled?'ON':'OFF'}</div>
    </div>`).join('');
  const st=document.getElementById('reminder-status');
  if(st)st.textContent='// '+notificationStatusText().toUpperCase()+' //';
}

async function requestReminderPermission(){
  if(!('Notification' in window)){
    showCyberToast('NIGHT CITY ALERT', 'Este navegador nao suporta notificacoes nativas. A barra interna continua ativa.');
    return;
  }
  const perm=await Notification.requestPermission();
  if(perm==='granted') await registerNotificationWorker();
  renderReminders();
  if(perm==='granted') showCyberToast('PERMISSAO ATIVA', 'Este aparelho esta autorizado para receber alertas.');
  else showCyberToast('PERMISSAO NEGADA', 'Ative notificacoes nas configuracoes do navegador para receber alertas nativos.');
}

function updateReminderTime(id,value){
  if(RO() || !reminders[id])return;
  reminders[id].time=value||reminders[id].time;
  clearReminderSent(id);
  saveReminders();
  renderReminders();
}

function toggleReminder(id){
  if(RO() || !reminders[id])return;
  triggerFx(window.event?.currentTarget);
  reminders[id].enabled=!reminders[id].enabled;
  clearReminderSent(id);
  saveReminders();
  renderReminders();
  if(reminders[id].enabled && (!('Notification' in window) || Notification.permission!=='granted')) requestReminderPermission();
}

function showCyberToast(title,message,duration=5200){
  const stack=document.getElementById('notify-stack');
  if(!stack)return;
  const toast=document.createElement('div');
  toast.className='cyber-toast';
  toast.style.setProperty('--dur',duration+'ms');
  toast.innerHTML=`<div class="toast-head"><span>${htmlEscape(title)}</span><span class="toast-time">${Math.ceil(duration/1000)}s</span></div><div class="toast-body">${htmlEscape(message)}</div><div class="toast-progress"></div>`;
  stack.appendChild(toast);
  const timeEl=toast.querySelector('.toast-time');
  const started=Date.now();
  const tick=setInterval(()=>{
    const left=Math.max(0,Math.ceil((duration-(Date.now()-started))/1000));
    if(timeEl)timeEl.textContent=left+'s';
  },250);
  setTimeout(()=>{
    clearInterval(tick);
    toast.style.animation='toastOut .18s ease forwards';
    setTimeout(()=>toast.remove(),220);
  },duration);
}

// Toast com botao de acao (ex: DESFAZER). onAction roda se o usuario clicar.
function showActionToast(title,message,actionLabel,onAction,duration=5200){
  const stack=document.getElementById('notify-stack');
  if(!stack){onAction&&null;return;}
  const toast=document.createElement('div');
  toast.className='cyber-toast';
  toast.style.setProperty('--dur',duration+'ms');
  toast.innerHTML=`<div class="toast-head"><span>${htmlEscape(title)}</span><span class="toast-time">${Math.ceil(duration/1000)}s</span></div><div class="toast-body">${htmlEscape(message)}</div><button type="button" class="toast-action">${htmlEscape(actionLabel)}</button><div class="toast-progress"></div>`;
  stack.appendChild(toast);
  const timeEl=toast.querySelector('.toast-time');
  const started=Date.now();
  let done=false;
  const close=()=>{clearInterval(tick);toast.style.animation='toastOut .18s ease forwards';setTimeout(()=>toast.remove(),220);};
  const tick=setInterval(()=>{
    const left=Math.max(0,Math.ceil((duration-(Date.now()-started))/1000));
    if(timeEl)timeEl.textContent=left+'s';
  },250);
  toast.querySelector('.toast-action').onclick=()=>{
    if(done)return;done=true;
    try{onAction&&onAction();}catch(e){console.error('Undo falhou:',e);}
    close();
  };
  setTimeout(()=>{if(!done){done=true;close();}},duration);
}

// Exclusao otimista com opcao de desfazer (sem modal de confirmacao).
function deleteWithUndo(label,arrayName,id,after){
  if(RO())return;
  const arr=myData[arrayName]||[];
  const idx=arr.findIndex(x=>x.id===id);
  if(idx<0)return;
  const removed=arr[idx];
  arr.splice(idx,1);
  if(after)after();
  scheduleAutoSave();
  showActionToast('REMOVIDO',label+' apagado.','DESFAZER',()=>{
    myData[arrayName]=myData[arrayName]||[];
    const at=Math.min(idx,myData[arrayName].length);
    myData[arrayName].splice(at,0,removed);
    if(after)after();
    scheduleAutoSave();
    showCyberToast('RESTAURADO',label+' recuperado.');
  },6000);
}

async function sendReminder(r,visual=true){
  if(visual)showCyberToast('Night City - '+r.name,r.message);
  if(!('Notification' in window) || Notification.permission!=='granted')return;
  const options={body:r.message,tag:'nc-'+r.id,renotify:false,data:{url:location.href}};
  try{
    const reg=('serviceWorker' in navigator) ? await navigator.serviceWorker.ready : null;
    if(reg && reg.showNotification){await reg.showNotification('Night City - '+r.name,options);return;}
  }catch(e){console.warn('Service worker notification failed:',e);}
  try{
    const n=new Notification('Night City - '+r.name,options);
    n.onclick=()=>{window.focus();n.close();};
  }catch(e){console.warn('Notification failed:',e);}
}

function testReminderNotification(){
  const sample=Object.values(reminders||{}).find(r=>r.enabled) || Object.values(reminders||{})[0] || {id:'test',name:'Teste',message:'Sistema de notificacoes operacional.'};
  localStorage.setItem('nc_last_notification_test_v1_'+(me||'anon'),new Date().toLocaleString('pt-BR'));
  sendReminder({...sample,name:'Teste',message:'Barra cyberpunk e notificacao nativa disparadas neste aparelho.'});
  renderNotificationDiagnostics();
}

async function testClosedPush(){
  if(!me){showCyberToast('LOGIN NECESSARIO','Entre no sistema antes de testar Web Push.');return;}
  showCyberToast('TESTE WEB PUSH','Enviando pelo backend Supabase...');
  try{
    const {data:sessionData}=await sb.auth.getSession();
    const token=sessionData?.session?.access_token;
    const res=await fetch(SUPA_URL+'/functions/v1/send-reminders',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        ...(token?{Authorization:'Bearer '+token}:{}),
        apikey:SUPA_KEY
      },
      body:JSON.stringify({test:true,username:me})
    });
    const data=await res.json();
    if(!res.ok || !data.ok)throw new Error(data.error||'Falha no teste');
    localStorage.setItem('nc_last_notification_test_v1_'+(me||'anon'),new Date().toLocaleString('pt-BR'));
    showCyberToast('WEB PUSH ENVIADO',`Aceitos: ${data.sent||0} | Falhas: ${data.failed||0} | Ignorados: ${data.skipped||0}`,7200);
    renderNotificationDiagnostics();
  }catch(e){
    showCyberToast('ERRO WEB PUSH',e.message||String(e),7200);
  }
}

function checkReminders(force=false){
  if(!me || RO() || !reminders)return;
  const now=new Date();
  const hm=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
  const today=localDateKey(now);
  const sent=getReminderSent();
  Object.values(reminders).forEach(r=>{
    if(!r.enabled)return;
    const due=force ? false : r.time===hm;
    if(due && sent[r.id]!==today){
      sendReminder(r);
      setReminderSent(r.id,today);
      renderReminders();
    }
  });
  // Alerta de streak em risco: 1x/dia apos as 18h
  if(now.getHours()>=18 && sent['streak_risk']!==today){
    const data=habitDataWithLiveWeek();
    let risk=null;
    getHabits().forEach(h=>{const s=habitStreak(data,h);if(habitStreakAtRisk(data,h)&&s>=3&&(!risk||s>risk.days))risk={name:h,days:s};});
    if(risk){
      sendReminder({id:'streak_risk',name:'STREAK EM RISCO',message:'Sua corrente de '+risk.days+' dias ('+risk.name+') expira hoje. Marque o habito ou use um escudo.'});
      setReminderSent('streak_risk',today);
    }
  }
}

function startReminderEngine(){
  stopReminderEngine();
  registerNotificationWorker();
  checkReminders();
  reminderTimer=setInterval(checkReminders,15000);
}

function stopReminderEngine(){
  if(reminderTimer){clearInterval(reminderTimer);reminderTimer=null;}
}

document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkReminders();});

function prioritySkillName(){
  const defs=getSkillDefs('dev');
  const vals=D().skills||{};
  if(!defs.length)return getGoals().skillFocus;
  const ranked=[...defs].sort((a,b)=>{
    const av=Number(vals[a.id]||0)/(Number(a.max)||5);
    const bv=Number(vals[b.id]||0)/(Number(b.max)||5);
    return av-bv;
  });
  return ranked[0]?.name || getGoals().skillFocus;
}

function renderGoals(){
  const g=getGoals();
  const data=D();
  const done=(data.books||[]).filter(x=>x.status==='done').length;
  const reading=(data.books||[]).find(x=>x.status==='reading');
  const activeProject=(data.projects||[]).find(x=>x.status==='active');
  const playing=(data.games||[]).find(x=>x.status==='playing');
  const bookTitle=reading?.title || g.bookTitle || 'Configure uma meta';
  const devFocus=activeProject?.name || g.devFocus || 'Sem projeto ativo';
  const skillFocus=prioritySkillName() || g.skillFocus || 'Sem skill definida';
  const gameFocus=playing?.name || g.gameFocus || 'Sem jogo ativo';
  const intel=document.getElementById('goals-intel');
  if(intel){
    intel.innerHTML=`
      <div class="irow"><span class="ikey">LIVRO</span><div><div class="ival">${htmlEscape(bookTitle)}</div><div class="ibadge">meta: ${Number(g.monthlyBooks)||1}/mes · ${done} de ${Number(g.monthlyBooks)||1}</div></div></div>
      <div class="irow"><span class="ikey">DEV</span><div class="ival">${htmlEscape(devFocus)}</div></div>
      <div class="irow"><span class="ikey">SKILL</span><div class="ival">${htmlEscape(skillFocus)}</div></div>
      <div class="irow"><span class="ikey">JOGO</span><div class="ival">${htmlEscape(gameFocus)}</div></div>`;
  }
  const gg=document.getElementById('guitar-goal');
  if(gg)gg.textContent=(Number(g.guitarMinutes)||15)+' min/dia';
  updateBooksProg();
}

function toggleEditGoals(){
  if(RO())return;
  if(!document.getElementById('page-home')?.classList.contains('active')){
    goPage('home');
    setTimeout(toggleEditGoals,0);
    return;
  }
  const form=document.getElementById('goals-edit-form');
  if(!form){goPage('home');setTimeout(toggleEditGoals,0);return;}
  const open=form.style.display==='none';
  form.style.display=open?'block':'none';
  if(open)renderGoalsEditList();
}

function renderGoalsEditList(){
  myData.goals={...creatorGoalDefaults(),...(myData.goals||{})};
  const g=myData.goals;
  const el=document.getElementById('goals-edit-list');
  if(!el)return;
  el.innerHTML=`
    <label class="flabel">LIVRO FALLBACK</label><input type="text" value="${htmlEscape(g.bookTitle)}" oninput="myData.goals.bookTitle=this.value;renderGoals()">
    <label class="flabel">META LIVROS/MES</label><input type="number" min="1" max="99" value="${Number(g.monthlyBooks)||1}" oninput="myData.goals.monthlyBooks=Math.max(1,Number(this.value)||1);renderGoals();updateBooksProg()">
    <label class="flabel">DEV FALLBACK</label><input type="text" value="${htmlEscape(g.devFocus)}" oninput="myData.goals.devFocus=this.value;renderGoals()">
    <label class="flabel">SKILL FALLBACK</label><input type="text" value="${htmlEscape(g.skillFocus)}" oninput="myData.goals.skillFocus=this.value;renderGoals()">
    <label class="flabel">JOGO FALLBACK</label><input type="text" value="${htmlEscape(g.gameFocus)}" oninput="myData.goals.gameFocus=this.value;renderGoals()">
    <label class="flabel">VIOLAO MIN/DIA</label><input type="number" min="1" max="999" value="${Number(g.guitarMinutes)||15}" oninput="myData.goals.guitarMinutes=Math.max(1,Number(this.value)||15);renderGoals()">`;
}

const CONTRACT_TEMPLATES=[
  {label:'Beber agua',name:'Hidratacao',category:'Saude',meta:'2L',frequency:'Diario',reminder:'09:00'},
  {label:'Ler 30 min',name:'Leitura',category:'Leitura',meta:'30 min',frequency:'Diario',reminder:'22:00'},
  {label:'Treinar',name:'Treino',category:'Treino',meta:'45 min',frequency:'Dias uteis',reminder:'17:30'},
  {label:'Estudar',name:'Estudo',category:'Estudo',meta:'30 min',frequency:'Diario',reminder:'17:00'},
  {label:'Violao',name:'Violao',category:'Lazer',meta:'15 min',frequency:'Diario',reminder:'19:00'},
  {label:'Dormir cedo',name:'Sono',category:'Saude',meta:'23:00',frequency:'Diario',reminder:'22:30'}
];
let editingTaskIndex=null;
let taskDragState=null;
let taskDragSuppressUntil=0;

function ensureEditableTaskDefs(){
  if(!myData.taskDefs || !myData.taskDefs.length)myData.taskDefs=JSON.parse(JSON.stringify(getTasks().length?getTasks():creatorDefaults(DEFAULT_TASKS)));
  myData.taskDefs=myData.taskDefs.map(t=>typeof t==='string'?{text:t,tag:''}:{...t});
  ensureTaskIds(myData.taskDefs);
  return myData.taskDefs;
}

function ensureTaskIds(defs){
  (defs||[]).forEach((t,i)=>{
    if(t && !t.id)t.id=Date.now()+i+Math.floor(Math.random()*999);
  });
}

function taskIdentity(task){
  return String(task?.id || task?.text || '');
}

function contractTextFromFields(){
  const name=document.getElementById('contract-name')?.value.trim()||'Novo contrato';
  const meta=document.getElementById('contract-meta')?.value.trim();
  return meta ? `${name} - ${meta}` : name;
}

function updateContractPreview(){
  const el=document.getElementById('contract-preview');
  if(el)el.textContent=contractTextFromFields();
}

function setContractMode(mode='quick'){
  const quick=mode!=='advanced';
  const box=document.querySelector('#contract-modal .contract-box');
  if(box)box.classList.toggle('quick-mode',quick);
  document.getElementById('contract-mode-quick')?.classList.toggle('active',quick);
  document.getElementById('contract-mode-advanced')?.classList.toggle('active',!quick);
}

function renderContractSuggestions(){
  const host=document.getElementById('contract-suggestions');
  if(!host)return;
  host.innerHTML=CONTRACT_TEMPLATES.map((t,i)=>`<button type="button" onclick="applyContractTemplate(${i})">${htmlEscape(t.label)}</button>`).join('');
}

function fillContractForm(task={}){
  const set=(id,value)=>{const el=document.getElementById(id);if(el)el.value=value||'';};
  const text=String(task.text||'');
  const meta=task.meta || '';
  const name=task.name || (meta && text.endsWith(' - '+meta) ? text.slice(0,-(' - '+meta).length) : text);
  set('contract-name',name);
  set('contract-category',task.category||'Saude');
  set('contract-frequency',task.frequency||'Diario');
  set('contract-meta',meta || task.tag || '');
  set('contract-reminder',task.reminder||'');
  set('contract-note',task.note||'');
  updateContractPreview();
}

function applyContractTemplate(i){
  const t=CONTRACT_TEMPLATES[i];
  if(!t)return;
  fillContractForm({name:t.name,text:t.name,category:t.category,frequency:t.frequency,meta:t.meta,tag:t.meta,reminder:t.reminder});
}

function openContractModal(index=null){
  if(RO())return;
  editingTaskIndex=Number.isInteger(index)?index:null;
  renderContractSuggestions();
  const title=document.getElementById('contract-modal-title');
  if(title)title.textContent=editingTaskIndex===null?'NOVO CONTRATO':'EDITAR CONTRATO';
  const defs=ensureEditableTaskDefs();
  fillContractForm(editingTaskIndex===null?{}:(defs[editingTaskIndex]||{}));
  setContractMode(editingTaskIndex===null?'quick':'advanced');
  document.getElementById('contract-modal')?.classList.add('on');
  setTimeout(()=>document.getElementById('contract-name')?.focus(),60);
}

function closeContractModal(){
  document.getElementById('contract-modal')?.classList.remove('on');
  editingTaskIndex=null;
}

function contractPayloadFromForm(existing={}){
  const text=contractTextFromFields();
  const meta=document.getElementById('contract-meta')?.value.trim()||'';
  return {
    ...existing,
    text,
    name:document.getElementById('contract-name')?.value.trim()||text,
    tag:meta,
    meta,
    category:document.getElementById('contract-category')?.value||'Saude',
    frequency:document.getElementById('contract-frequency')?.value||'Diario',
    reminder:document.getElementById('contract-reminder')?.value||'',
    note:document.getElementById('contract-note')?.value.trim()||'',
    updatedAt:new Date().toISOString()
  };
}

function saveContractModal(){
  if(RO())return;
  syncTodayTasksFromDom();
  const defs=ensureEditableTaskDefs();
  const rawName=document.getElementById('contract-name')?.value.trim()||'';
  if(!rawName){
    showCyberToast('CONTRATO VAZIO','Digite um nome rapido para salvar.');
    document.getElementById('contract-name')?.focus();
    return;
  }
  const payload=contractPayloadFromForm();
  if(editingTaskIndex===null)defs.push({...payload,id:Date.now()});
  else defs[editingTaskIndex]=contractPayloadFromForm(defs[editingTaskIndex]||{});
  closeContractModal();
  renderTasks();
  syncTodayHabitsFromTasks();
  updateStats();
  scheduleAutoSave();
}

function activeTaskIndexes(){
  return ensureEditableTaskDefs().map((t,i)=>t.archivedAt?null:i).filter(i=>i!==null);
}

function checkedTasksByIdentity(defs){
  const saved=(myData.tasks||{})[dk()]||{};
  const map=new Map();
  defs.map((t,i)=>t.archivedAt?null:i).filter(i=>i!==null).forEach((idx,pos)=>{
    map.set(taskIdentity(defs[idx]),!!saved[pos]);
  });
  return map;
}

function restoreChecksAfterTaskOrder(defs,checked){
  if(!myData.tasks)myData.tasks={};
  const next={};
  defs.map((t,i)=>t.archivedAt?null:i).filter(i=>i!==null).forEach((idx,pos)=>{
    next[pos]=!!checked.get(taskIdentity(defs[idx]));
  });
  myData.tasks[dk()]=next;
}

function clearTaskDragMarkers(){
  document.querySelectorAll('#task-list .task').forEach(el=>el.classList.remove('dragging','drag-before','drag-after','drag-target'));
}

function startTaskDrag(event,index){
  if(RO())return;
  event.preventDefault();
  event.stopPropagation();
  const source=event.currentTarget.closest('.task');
  if(!source)return;
  taskDragState={from:index,target:null,position:'after',startX:event.clientX,startY:event.clientY,moved:false};
  source.classList.add('dragging');
  document.body.classList.add('task-dragging');
  window.addEventListener('pointermove',handleTaskDragMove,{passive:false});
  window.addEventListener('pointerup',finishTaskDrag,{once:true});
  window.addEventListener('pointercancel',cancelTaskDrag,{once:true});
}

function handleTaskDragMove(event){
  if(!taskDragState)return;
  event.preventDefault();
  const dx=Math.abs(event.clientX-taskDragState.startX);
  const dy=Math.abs(event.clientY-taskDragState.startY);
  if(dx+dy>8)taskDragState.moved=true;
  const target=document.elementFromPoint(event.clientX,event.clientY)?.closest?.('.task');
  document.querySelectorAll('#task-list .task.drag-before,#task-list .task.drag-after,#task-list .task.drag-target').forEach(el=>el.classList.remove('drag-before','drag-after','drag-target'));
  if(!target || !target.dataset.taskIndex || Number(target.dataset.taskIndex)===taskDragState.from)return;
  const box=target.getBoundingClientRect();
  const position=event.clientY > box.top + box.height/2 ? 'after' : 'before';
  taskDragState.target=Number(target.dataset.taskIndex);
  taskDragState.position=position;
  target.classList.add('drag-target',position==='after'?'drag-after':'drag-before');
}

function finishTaskDrag(){
  if(!taskDragState)return;
  const state=taskDragState;
  cleanupTaskDrag();
  taskDragSuppressUntil=Date.now()+350;
  if(state.moved && state.target!==null && state.target!==state.from){
    reorderTaskByDrag(state.from,state.target,state.position);
  }
}

function cancelTaskDrag(){
  cleanupTaskDrag();
  taskDragSuppressUntil=Date.now()+350;
}

function cleanupTaskDrag(){
  window.removeEventListener('pointermove',handleTaskDragMove);
  clearTaskDragMarkers();
  document.body.classList.remove('task-dragging');
  taskDragState=null;
}

function reorderTaskByDrag(fromIndex,targetIndex,position='after'){
  if(RO())return;
  syncTodayTasksFromDom();
  const defs=ensureEditableTaskDefs();
  const from=defs.findIndex((_,i)=>i===fromIndex);
  const targetId=taskIdentity(defs[targetIndex]);
  if(from<0 || !targetId)return;
  const checked=checkedTasksByIdentity(defs);
  const [item]=defs.splice(from,1);
  const target=defs.findIndex(t=>taskIdentity(t)===targetId);
  if(target<0){defs.splice(from,0,item);return;}
  const insertAt=position==='after'?target+1:target;
  defs.splice(insertAt,0,item);
  restoreChecksAfterTaskOrder(defs,checked);
  renderTasks();
  syncTodayHabitsFromTasks();
  updateStats();
  scheduleAutoSave();
}

function moveTask(index,dir){
  if(RO())return;
  syncTodayTasksFromDom();
  const defs=ensureEditableTaskDefs();
  const active=activeTaskIndexes();
  const pos=active.indexOf(index);
  const swapWith=active[pos+dir];
  if(pos<0 || swapWith==null)return;
  [defs[index],defs[swapWith]]=[defs[swapWith],defs[index]];
  renderTasks();
  syncTodayHabitsFromTasks();
  updateStats();
  scheduleAutoSave();
}

function duplicateTask(index){
  if(RO())return;
  const defs=ensureEditableTaskDefs();
  const src=defs[index];
  if(!src)return;
  defs.splice(index+1,0,{...src,id:Date.now(),text:(src.text||'Contrato')+' copia',archivedAt:null,updatedAt:new Date().toISOString()});
  renderTasks();
  syncTodayHabitsFromTasks();
  updateStats();
  scheduleAutoSave();
}

async function archiveTask(index){
  if(RO())return;
  if(!(await confirmDanger('Arquivar este contrato? O historico semanal ja salvo sera preservado.')))return;
  syncTodayTasksFromDom();
  const defs=ensureEditableTaskDefs();
  if(!defs[index])return;
  defs[index].archivedAt=new Date().toISOString();
  renderTasks();
  syncTodayHabitsFromTasks();
  updateStats();
  scheduleAutoSave();
}

function restoreTask(index){
  if(RO())return;
  const defs=ensureEditableTaskDefs();
  if(!defs[index])return;
  delete defs[index].archivedAt;
  defs[index].updatedAt=new Date().toISOString();
  renderTasks();
  syncTodayHabitsFromTasks();
  updateStats();
  scheduleAutoSave();
}

function toggleArchivedTasks(){
  const el=document.getElementById('task-archive-list');
  if(!el)return;
  el.hidden=!el.hidden;
  renderArchivedTasks();
}

function renderArchivedTasks(){
  const el=document.getElementById('task-archive-list');
  if(!el)return;
  const defs=allTaskDefs(D()).map((task,index)=>({...task,index})).filter(t=>t.archivedAt);
  if(el.hidden)return;
  el.innerHTML=defs.length?`
    <div class="task-archive-title">// CONTRATOS ARQUIVADOS //</div>
    ${defs.map(t=>`<div class="task-archive-row">
      <span>${htmlEscape(t.text||'Contrato')}</span>
      ${RO()?'':`<button type="button" onclick="restoreTask(${t.index})">RESTAURAR</button>`}
    </div>`).join('')}`:'<div class="empty">NENHUM CONTRATO ARQUIVADO</div>';
}

function toggleEditTasks(){
  openContractModal();
  return;
  const form = document.getElementById('task-edit-form');
  if(!form) return;
  const open = form.style.display === 'none';
  form.style.display = open ? 'block' : 'none';
  if(open) renderTaskEditList();
}

function renderTaskEditList(){
  const tasks = myData.taskDefs && myData.taskDefs.length ? myData.taskDefs : JSON.parse(JSON.stringify(creatorDefaults(DEFAULT_TASKS)));
  myData.taskDefs = tasks;
  const el = document.getElementById('task-edit-list');
  if(!el) return;
  el.innerHTML = tasks.map((t,i) => `
    <div style="display:flex;gap:6px;margin-bottom:6px;align-items:center">
      <input type="text" value="${htmlEscape(t.text)}" oninput="syncTodayTasksFromDom();myData.taskDefs[${i}].text=this.value;renderTasks();syncTodayHabitsFromTasks();updateStats()" style="flex:1;font-size:12px;padding:5px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--ui)">
      <input type="text" value="${htmlEscape(t.tag||'')}" placeholder="tag" oninput="syncTodayTasksFromDom();myData.taskDefs[${i}].tag=this.value;renderTasks();syncTodayHabitsFromTasks();updateStats()" style="width:90px;font-size:12px;padding:5px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--mono)">
      <button type="button" title="Prioridade" onclick="toggleTaskPriority(${i})" style="font-family:var(--mono);font-size:11px;padding:4px 7px;border:1px solid ${t.priority?'var(--y)':'var(--border)'};background:${t.priority?'rgba(252,238,9,.1)':'transparent'};color:${t.priority?'var(--y)':'var(--muted)'};border-radius:3px;cursor:pointer">⚡</button>
      <button type="button" class="mini-remove" onclick="removeTaskItem(${i})">X</button>
    </div>`).join('');
}

function addTaskItem(){
  syncTodayTasksFromDom();
  if(!myData.taskDefs || !myData.taskDefs.length) myData.taskDefs = JSON.parse(JSON.stringify(creatorDefaults(DEFAULT_TASKS)));
  myData.taskDefs.push({text:'Nova missão', tag:''});
  renderTaskEditList();
  renderTasks();
  syncTodayHabitsFromTasks();
  updateStats();
  scheduleAutoSave();
}

async function removeTaskItem(i){
  if(!(await confirmDanger('Remover este contrato do dia?')))return;
  syncTodayTasksFromDom();
  if(!myData.taskDefs) myData.taskDefs = JSON.parse(JSON.stringify(creatorDefaults(DEFAULT_TASKS)));
  myData.taskDefs.splice(i,1);
  renderTaskEditList();
  renderTasks();
  syncTodayHabitsFromTasks();
  updateStats();
  scheduleAutoSave();
}

function toggleEditHabits(){
  const form = document.getElementById('habit-edit-form');
  if(!form) return;
  const open = form.style.display === 'none';
  form.style.display = open ? 'block' : 'none';
  if(open) renderHabitEditList();
}

function renderHabitEditList(){
  const habits = myData.habitDefs && myData.habitDefs.length ? myData.habitDefs : JSON.parse(JSON.stringify(creatorDefaults(DEFAULT_HABITS)));
  myData.habitDefs = habits;
  const el = document.getElementById('habit-edit-list');
  if(!el) return;
  el.innerHTML = habits.map((h,i) => `
    <div style="display:flex;gap:6px;margin-bottom:6px;align-items:center">
      <input type="text" value="${h}" oninput="myData.habitDefs[${i}]=this.value;renderHabitsTable();renderConsistencyPanel();updateStats()" style="flex:1;font-size:12px;padding:5px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--ui)">
      <button type="button" class="mini-remove" onclick="removeHabitItem(${i})">X</button>
    </div>`).join('');
}

function addHabitItem(){
  if(!myData.habitDefs || !myData.habitDefs.length) myData.habitDefs = JSON.parse(JSON.stringify(creatorDefaults(DEFAULT_HABITS)));
  myData.habitDefs.push('Novo hábito');
  renderHabitEditList();
  renderHabitsTable();
  renderConsistencyPanel();
  updateStats();
  scheduleAutoSave();
}

async function removeHabitItem(i){
  if(!(await confirmDanger('Remover este habito do tracker?')))return;
  if(!myData.habitDefs) myData.habitDefs = JSON.parse(JSON.stringify(creatorDefaults(DEFAULT_HABITS)));
  myData.habitDefs.splice(i,1);
  renderHabitEditList();
  renderHabitsTable();
  renderConsistencyPanel();
  updateStats();
  scheduleAutoSave();
}

async function resetWeeklyHabits(){
  if(RO())return;
  const ok=await confirmDanger('Resetar todos os habitos marcados desta semana? O historico de outras semanas sera preservado.');
  if(!ok)return;
  if(!myData.habits)myData.habits={};
  myData.habits[wk()]={};
  syncTodayHabitsFromTasks(false);
  renderHabitsTable();
  renderConsistencyPanel();
  updateStats();
  scheduleAutoSave();
}

function toggleTask(el){
  if(RO() || Date.now()<taskDragSuppressUntil)return;
  const wasDone=el.classList.contains('done');
  const isPending=el.classList.contains('confirm-pending');
  // Two-tap verification: first click on incomplete task enters confirm mode
  if(!wasDone && !isPending){
    el.classList.add('confirm-pending');
    const timer=setTimeout(()=>{el.classList.remove('confirm-pending');_pendingConfirm.delete(el);},4000);
    _pendingConfirm.set(el,timer);
    fxBlip('tick');
    showCyberToast('CONFIRMAR CONCLUSAO','Clique novamente no contrato para confirmar.',3800);
    return;
  }
  if(isPending){clearTimeout(_pendingConfirm.get(el));_pendingConfirm.delete(el);el.classList.remove('confirm-pending');}
  el.classList.toggle('done');
  triggerFx(el,'fx-done',430);
  syncTodayTasksFromDom();
  syncTodayHabitsFromTasks();
  updateStats();
  const nowDone=el.classList.contains('done');
  if(nowDone && !wasDone){
    const total=document.querySelectorAll('#task-list .task').length;
    const done=document.querySelectorAll('#task-list .task.done').length;
    if(total && done===total){
      awardEddies(3,'task');
      const ep=awardEddies(15,'perfect');
      celebrate('day');
      showCyberToast('MISSAO DO DIA CONCLUIDA','NETRUNNER DE ELITE // +'+Math.max(3,total)+' REP'+(ep?' // +€$'+ep:''),7200);
      checkAchievements({_dayComplete:true});
      updateEddiesDisplay();
    }else{
      const et=awardEddies(3,'task');
      fxBlip('tick');fxHaptic(15);
      // Contextual completion message
      const tAll=document.querySelectorAll('#task-list .task');
      const tDone=[...tAll].filter(t=>t.classList.contains('done')).length;
      const tRemaining=tAll.length-tDone;
      let sub='+1 REP'+(et?' // +€$'+et:'');
      if(tDone===1) sub='Boa. Primeiro contrato fechado. '+sub;
      else if(tRemaining===1) sub='Falta 1 contrato para limpar o dia. '+sub;
      else if(tRemaining>1) sub='Faltam '+tRemaining+' contratos para limpar o dia. '+sub;
      const _el=el;
      showActionToast('CONTRATO ENCERRADO',sub,'DESFAZER',()=>{
        _el.classList.remove('done');
        syncTodayTasksFromDom();
        syncTodayHabitsFromTasks();
        updateStats();
        scheduleAutoSave();
      },5000);
      checkAchievements();
      updateEddiesDisplay();
    }
  }
  scheduleAutoSave();
}
async function completeAllTasks(){
  if(RO())return;
  const tasks=activeTasksToday();
  if(!tasks.length)return;
  const ok=await confirmDanger('Concluir todos os '+tasks.length+' contratos do dia de uma vez?');
  if(!ok)return;
  if(!myData.tasks)myData.tasks={};
  const saved=myData.tasks[dk()]||{};
  tasks.forEach((_,i)=>{saved[i]=true;});
  myData.tasks[dk()]=saved;
  renderTasks();
  updateStats();
  syncTodayHabitsFromTasks();
  checkAchievements({_dayComplete:true});
  celebrate('day');
  showCyberToast(tasks.length+' CONTRATOS CONCLUIDOS','Todos os contratos encerrados // NETRUNNER DE ELITE',7200);
  scheduleAutoSave();
}

function updateStats(){
  const tasks=document.querySelectorAll('#task-list .task');
  const total=tasks.length||activeTasksToday().length;
  const done=[...tasks].filter(t=>t.classList.contains('done')).length;
  document.getElementById('s-tasks').textContent=done+'/'+total;
  document.getElementById('b-tasks').style.width=total?Math.round(done/total*100)+'%':'0%';
  // Update document title with progress percentage
  const pct=total>0?Math.round(done/total*100):0;
  document.title=total>0?`[${pct}%] NIGHT CITY — LIFE SYSTEM`:'NIGHT CITY — LIFE SYSTEM';
  const col=d.getDay()===0?6:d.getDay()-1;
  const tc=document.querySelectorAll('#habits-body tr td:nth-child('+(col+2)+') .hcell');
  const hTotal=tc.length||getHabits().length;
  const hd=[...tc].filter(c=>c.classList.contains('on')).length;
  document.getElementById('s-habits').textContent=hd+'/'+hTotal;
  const hPct=hTotal?Math.round(hd/hTotal*100):0;
  const habitsBar=document.getElementById('b-habits');
  if(habitsBar){habitsBar.style.width=hPct+'%';habitsBar.className='stat-fill '+(hPct>=70?'c':hPct>=35?'':' r').trim();}
  const all=document.querySelectorAll('.hcell');
  const wTotal=all.length||getHabits().length*7;
  const wd=[...all].filter(c=>c.classList.contains('on')).length;
  document.getElementById('s-week').textContent=wd+'/'+wTotal;
  document.getElementById('b-week').style.width=wTotal?Math.round(wd/wTotal*100)+'%':'0%';
  const cred=streetCredScore();
  const credEl=document.getElementById('s-cred');
  const credBar=document.getElementById('b-cred');
  if(credEl)credEl.textContent=cred;
  if(credBar)credBar.style.width=Math.min(100,cred%100)+'%';
  // Cred earned today (18)
  if(_sessionStartCred===null)_sessionStartCred=cred;
  const credToday=cred-_sessionStartCred;
  const credTodayEl=document.getElementById('cred-today');
  if(credTodayEl)credTodayEl.textContent=credToday>0?'+'+credToday+' HOJE':'';
  // Rank up detection
  const newTier=streetCredRank(cred);
  if(_lastTier!==null && _lastTier!==newTier){
    const oldIdx=STREET_CRED_TIERS.findIndex(t=>t.name===_lastTier);
    const newIdx=STREET_CRED_TIERS.findIndex(t=>t.name===newTier);
    if(newIdx>oldIdx) rankUpCelebration(newTier);
  }
  _lastTier=newTier;
  // Avatar evolui com rank (19)
  const navUser=document.getElementById('nav-user');
  if(navUser && me){
    const eqc=(D().equippedCosmetics||{});
    const titleItem=eqc.title?SHOP_ITEMS.find(i=>i.type==='title'&&i.id===eqc.title):null;
    const prefix=titleItem?titleItem.value+' ':'';
    const frameItem=eqc.frame?SHOP_ITEMS.find(i=>i.type==='frame'&&i.id===eqc.frame):null;
    const frameKey=frameItem?(frameItem.value||'samurai'):'';
    navUser.textContent=rankAvatar(cred)+' '+prefix+userDisplayLabel(me);
    navUser.dataset.frame=frameKey;
    const mobUser=document.getElementById('mob-user');
    if(mobUser && !viewFriend)mobUser.dataset.frame=frameKey;
  }
  applyCosmeticTheme();
  updateEddiesDisplay();
  renderHomeQuickbar();
  renderDailyPanel();
  renderTodayMode();
}

function rankUpCelebration(newRank){
  const lore=RANK_LORE[newRank]||'Voce subiu de rank.';
  showCyberToast('RANK UP — '+newRank.toUpperCase(),lore,9000);
  celebrate('day');
}

function htmlEscape(v){
  return String(v ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function jsString(v){
  return String(v ?? '').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\r/g,'\\r').replace(/\n/g,'\\n');
}

function safeExternalUrl(url){
  try{
    const u=new URL(String(url||''),location.href);
    return ['http:','https:'].includes(u.protocol) ? u.href : '';
  }catch(e){
    storePendingLocalSave(e);
    showCyberToast('SAVE PENDENTE','Falha no Supabase. Uma copia local foi guardada para exportacao/backup.',6800);
    return '';
  }
}

function lastSaveKey(){
  return 'nc_last_save_v1_'+(me||'anon');
}

function selectedBackupScope(){
  return document.getElementById('backup-scope')?.value || 'all';
}

function backupScopeLabel(scope){
  if(scope==='all')return 'completo';
  return (PAGE_LABELS[scope] || scope || 'area').toString().toLowerCase().replace(/\s+/g,'-');
}

function backupDataForScope(scope='all'){
  const data={};
  if(scope==='all'){
    SAVE_KEYS.forEach(k=>{data[k]=myData[k] ?? null;});
    return data;
  }
  const keyMap={
    home:['tasks','habits','taskDefs','habitDefs','routines','lastSeenWeek','goals','dailyReviews','activityHistory'],
    notificacoes:['reminders'],
    leitura:['books','goals'],
    dev:['projects','devlog','skills','skillDefs','goals','activityHistory'],
    violao:['guitarlog','skills','guitarSkillDefs','goals','activityHistory'],
    jogos:['games','goals'],
    reflexoes:['reflexoes']
  };
  (keyMap[scope]||[]).forEach(k=>{data[k]=myData[k] ?? null;});
  if(myData.pageObjectives && Object.prototype.hasOwnProperty.call(myData.pageObjectives,scope)){
    data.pageObjectives={[scope]:myData.pageObjectives[scope]};
  }
  if(myData.customPages && Object.prototype.hasOwnProperty.call(myData.customPages,scope)){
    data.customPages={[scope]:myData.customPages[scope]};
  }
  return data;
}

function backupPayload(scope=selectedBackupScope()){
  const full=scope==='all';
  return {
    app:'night-city-life-system',
    version:2,
    scope,
    scopeLabel:backupScopeLabel(scope),
    partial:!full,
    exportedAt:new Date().toISOString(),
    username:me,
    data:backupDataForScope(scope)
  };
}

function backupFileName(scope=selectedBackupScope()){
  return 'night-city-'+(me||'perfil')+'-'+backupScopeLabel(scope)+'-'+localDateKey()+'.json';
}

function downloadBackup(){
  if(!me){showCyberToast('LOGIN NECESSARIO','Entre antes de exportar um backup.');return;}
  collectState();
  const scope=selectedBackupScope();
  const blob=new Blob([JSON.stringify(backupPayload(scope),null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=backupFileName(scope);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showCyberToast('BACKUP EXPORTADO','Arquivo JSON gerado para '+backupScopeLabel(scope)+'.');
  renderSystemStatus();
}

async function copyBackupJson(){
  if(!me){showCyberToast('LOGIN NECESSARIO','Entre antes de copiar um backup.');return;}
  collectState();
  const scope=selectedBackupScope();
  const text=JSON.stringify(backupPayload(scope),null,2);
  try{
    await navigator.clipboard.writeText(text);
    showCyberToast('BACKUP COPIADO','JSON de '+backupScopeLabel(scope)+' copiado para a area de transferencia.');
  }catch(e){
    showCyberToast('COPIA BLOQUEADA','Use EXPORTAR BACKUP se o navegador bloquear a area de transferencia.');
  }
  renderSystemStatus();
}

function triggerImportBackup(){
  if(RO())return;
  const input=document.getElementById('backup-import-file');
  if(input)input.click();
}

async function importBackupFile(input){
  if(!input || !input.files || !input.files[0])return;
  if(!me){showCyberToast('LOGIN NECESSARIO','Entre antes de importar um backup.');input.value='';return;}
  if(!(await confirmDanger('Importar este backup vai substituir as chaves do perfil atual. Continuar?'))){input.value='';return;}
  try{
    const text=await input.files[0].text();
    const parsed=JSON.parse(text);
    const data=parsed && parsed.data ? parsed.data : parsed;
    if(!data || typeof data!=='object')throw new Error('Arquivo invalido');
    const partial=!!(parsed && parsed.partial);
    SAVE_KEYS.forEach(k=>{
      if(!Object.prototype.hasOwnProperty.call(data,k))return;
      if(partial && k==='customPages')myData.customPages={...(myData.customPages||{}),...(data.customPages||{})};
      else if(partial && k==='pageObjectives')myData.pageObjectives={...(myData.pageObjectives||{}),...(data.pageObjectives||{})};
      else myData[k]=data[k];
    });
    collectState();
    await Promise.all(SAVE_KEYS.map(k=>dbSet(me,k,myData[k]||null)));
    localStorage.setItem(lastSaveKey(),new Date().toISOString());
    applyData();
    showCyberToast('BACKUP IMPORTADO','Dados aplicados e sincronizados no Supabase.',6800);
  }catch(e){
    showCyberToast('ERRO NO BACKUP',e.message||'Nao foi possivel importar este arquivo.',6800);
  }finally{
    input.value='';
    renderSystemStatus();
  }
}

function renderSystemStatus(){
  const user=document.getElementById('system-user');
  const save=document.getElementById('system-save');
  const keys=document.getElementById('system-keys');
  const session=document.getElementById('system-session');
  if(!user && !save && !keys && !session)return;
  const saved=localStorage.getItem(lastSaveKey());
  const activeKeys=SAVE_KEYS.filter(k=>myData[k]!=null).length;
  if(user)user.textContent=me ? userDisplayLabel(me) : '--';
  if(save)save.textContent=saved ? new Date(saved).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : 'PENDENTE';
  if(keys)keys.textContent=activeKeys+'/'+SAVE_KEYS.length;
  if(session)session.textContent=me ? (hasPendingLocalSave()?'PENDENTE':(RO()?'AMIGO':'ATIVA')) : 'OFF';
}

function cloneDefaultRoutines(){
  return JSON.parse(JSON.stringify(creatorDefaults(DEFAULT_ROUTINES)));
}

function renderRoutines(){
  const el=document.getElementById('routine-list');
  if(!el)return;
  const routines=getRoutines();
  if(!routines.length){el.innerHTML=RO()?'<div class="empty">NENHUMA ROTINA</div>':`<div class="smart-empty compact"><span>SEM ROTINAS CONFIGURADAS</span><b>Crie uma rotina de manha ou noite para organizar seus habitos.</b><div class="smart-actions"><button type="button" onclick="addRoutine()">CRIAR ROTINA</button></div></div>`;return;}
  el.innerHTML=routines.map(r=>`
    <div class="routine">
      <div class="rhead" onclick="toggleR(this)">${htmlEscape(r.title||'Rotina')}<span class="rarrow">></span></div>
      <div class="rbody"><div class="rbody-in">${(r.steps||[]).map(s=>`<div class="rstep">${htmlEscape(s)}</div>`).join('')}</div></div>
    </div>`).join('');
}

function toggleEditRoutines(){
  if(RO())return;
  const form=document.getElementById('routine-edit-form');
  if(!form)return;
  const open=form.style.display==='none';
  form.style.display=open?'block':'none';
  if(open)renderRoutineEditList();
}

function renderRoutineEditList(){
  if(!myData.routines || !myData.routines.length) myData.routines=cloneDefaultRoutines();
  const el=document.getElementById('routine-edit-list');
  if(!el)return;
  el.innerHTML=myData.routines.map((r,i)=>`
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:10px;margin-bottom:8px">
      <div style="display:flex;gap:6px;margin-bottom:8px;align-items:center">
        <input type="text" value="${htmlEscape(r.title||'')}" oninput="myData.routines[${i}].title=this.value;renderRoutines()"
          style="flex:1;font-size:12px;padding:5px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--ui)">
        <button type="button" class="mini-remove" onclick="removeRoutine(${i})">X</button>
      </div>
      ${(r.steps||[]).map((s,j)=>`
        <div style="display:flex;gap:6px;margin-bottom:6px;align-items:center;padding-left:10px">
          <input type="text" value="${htmlEscape(s)}" oninput="myData.routines[${i}].steps[${j}]=this.value;renderRoutines()"
            style="flex:1;font-size:12px;padding:5px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--ui)">
          <button type="button" class="mini-remove" onclick="removeRoutineStep(${i},${j})">X</button>
        </div>`).join('')}
      <button class="btn" onclick="addRoutineStep(${i})" style="font-size:9px;padding:5px 10px;color:var(--c);border-color:var(--border);background:transparent">+ PASSO</button>
    </div>`).join('');
}

function addRoutine(){
  if(!myData.routines || !myData.routines.length) myData.routines=cloneDefaultRoutines();
  myData.routines.push({title:'Nova rotina',steps:['Novo passo']});
  renderRoutineEditList();
  renderRoutines();
  scheduleAutoSave();
}

async function removeRoutine(i){
  if(!(await confirmDanger('Remover esta rotina?')))return;
  if(!myData.routines) myData.routines=cloneDefaultRoutines();
  myData.routines.splice(i,1);
  renderRoutineEditList();
  renderRoutines();
  scheduleAutoSave();
}

function addRoutineStep(i){
  if(!myData.routines || !myData.routines[i])return;
  myData.routines[i].steps=myData.routines[i].steps||[];
  myData.routines[i].steps.push('Novo passo');
  renderRoutineEditList();
  renderRoutines();
  scheduleAutoSave();
}

async function removeRoutineStep(i,j){
  if(!(await confirmDanger('Remover este passo da rotina?')))return;
  if(!myData.routines || !myData.routines[i])return;
  myData.routines[i].steps.splice(j,1);
  renderRoutineEditList();
  renderRoutines();
  scheduleAutoSave();
}

function toggleR(h){h.querySelector('.rarrow').classList.toggle('open');h.nextElementSibling.classList.toggle('open');}

// Districts
const DEFAULT_DISTRICTS = [
  {icon:'book', name:'Leitura', color:'#97C459', page:'leitura'},
  {icon:'code', name:'Programacao', color:'#378ADD', page:'dev'},
  {icon:'guitar', name:'Violao', color:'#e00f3a', page:'violao'},
  {icon:'game', name:'Jogos', color:'#fcee09', page:'jogos'},
  {icon:'mind', name:'Reflexoes', color:'#b44fff', page:'reflexoes'}
];
const DISTRICT_COLORS = ['#97C459','#378ADD','#e00f3a','#fcee09','#b44fff','#00d4ff','#fcee09','#f0997b','#d4537e'];
const BASE_DISTRICT_PAGES = [
  {page:'leitura', label:'Leitura', icon:'book', color:'var(--y)'},
  {page:'dev', label:'Dev', icon:'code', color:'var(--c)'},
  {page:'violao', label:'Violao', icon:'guitar', color:'var(--r)'},
  {page:'jogos', label:'Jogos', icon:'game', color:'var(--y)'},
  {page:'reflexoes', label:'Reflexoes', icon:'mind', color:'var(--p)'}
];
const DISTRICT_PAGE_DEFS = BASE_DISTRICT_PAGES.concat(EXTRA_PAGE_DEFS);
const DISTRICT_PAGES = DISTRICT_PAGE_DEFS.map(p=>p.page);
const ICON_PAGES = ['home','notificacoes'].concat(DISTRICT_PAGES);
const PAGE_LABELS = Object.assign(
  {notificacoes:'Notificacoes'},
  Object.fromEntries(DISTRICT_PAGE_DEFS.map(p=>[p.page,p.label]))
);
const PAGE_ICON_COLORS = Object.assign(
  {home:'var(--y)',notificacoes:'var(--c)'},
  Object.fromEntries(DISTRICT_PAGE_DEFS.map(p=>[p.page,p.color]))
);

function getDistricts(){
  const data=D();
  return (data.districts && data.districts.length) ? data.districts : creatorDefaults(DEFAULT_DISTRICTS);
}

function getNavDistricts(){
  const used = new Set();
  return getDistricts().filter(d => {
    const key = DISTRICT_PAGES.includes(d.page) ? d.page : (d.url || d.name || 'url');
    if(used.has(key)) return false;
    used.add(key);
    return true;
  });
}

function iconColorFor(d){
  const page = d?.page || 'url';
  return PAGE_ICON_COLORS[page] || d?.color || 'var(--y)';
}

function cyberIcon(page,color){
  const iconPage = ICON_PAGES.includes(page) ? page : 'url';
  const icons = {
    home:`<path class="frame" d="M4 10 12 3l8 7v10H5z"/><path class="line" d="M3 10 12 3l9 7M6 10v10h12V10M10 20v-6h4v6"/><path class="thin" d="M7 7h3M16 7h2"/>`,
    notificacoes:`<path class="frame" d="M7 8a5 5 0 0 1 10 0v5l3 4H4l3-4z"/><path class="line" d="M7 8a5 5 0 0 1 10 0v5l3 4H4l3-4zM10 20h4M12 3V1"/><path class="thin" d="M4 7 2 5M20 7l2-2M9 10h6"/>`,
    leitura:`<path class="frame" d="M5 4h9l4 4v13H5z"/><path class="line" d="M5 4h9l4 4v13H5zM14 4v4h4"/><path class="thin" d="M8 10h7M8 13h8M8 16h6M6 6H3v12h2"/>`,
    dev:`<path class="frame" d="M4 5h16v13H4z"/><path class="line" d="M4 5h16v13H4zM7 9l3 3-3 3M12 15h5"/><path class="thin" d="M7 3v2M12 3v2M17 3v2M7 18v3M12 18v3M17 18v3"/>`,
    violao:`<path class="frame" d="M5 15 9 11l4 4-4 4z"/><path class="line" d="M5 15 9 11l4 4-4 4zM12 12l7-7M16 5l3 3M8 15h2"/><path class="thin" d="M14 10 10 6M17 7l3-3"/>`,
    jogos:`<path class="frame" d="M5 10h14l2 5-3 4-4-3h-4l-4 3-3-4z"/><path class="line" d="M5 10h14l2 5-3 4-4-3h-4l-4 3-3-4zM7 14h5M9.5 11.5v5"/><path class="fill" d="M16 13h2v2h-2zM18.5 15.5h2v2h-2z"/>`,
    reflexoes:`<path class="frame" d="M12 4 20 9v7l-8 4-8-4V9z"/><path class="line" d="M12 4 20 9v7l-8 4-8-4V9zM8 12l4-3 4 3M8 12l4 4 4-4"/><path class="fill" d="M7 11h2v2H7zM11 8h2v2h-2zM15 11h2v2h-2zM11 15h2v2h-2z"/>`,
    url:`<path class="frame" d="M6 6h9l3 3v9H6z"/><path class="line" d="M8 16 16 8M11 8h5v5M6 6h9l3 3v9H6z"/><path class="thin" d="M9 19H4V9h2"/>`
  };
  return `<span class="nc-icon ico-${iconPage}" style="--ic:${color || 'var(--y)'}" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false">${icons[iconPage]}</svg></span>`;
}

function customNavIcon(d,page,color){
  if(page!=='home'){
    return customIconSvg(d?.icon || defaultIconForPage(page),color || d?.color || 'var(--y)','ico-custom');
  }
  return cyberIcon(page,color);
}

function navActionFor(d,page){
  if(page==='home') return "goPage('home')";
  if(DISTRICT_PAGES.includes(page)) return `goPage('${page}')`;
  if(d && d.url){
    const url=safeExternalUrl(d.url);
    return url ? `window.open('${jsString(url)}','_blank','noopener')` : "return false";
  }
  return "return false";
}

function renderNavTabs(){
  const nav = document.getElementById('nav-tabs');
  const mob = document.getElementById('mob-tabs');
  if(!nav && !mob) return;
  const active = (document.querySelector('.page.active')?.id || 'page-home').replace('page-','');
  const items = [{page:'home', name:'Home', color:'var(--y)'}].concat(getNavDistricts());
  const tabHtml = items.map(d => {
    const page = d.page || 'home';
    const name = d.name || PAGE_LABELS[page] || page;
    const color = iconColorFor(d);
    return `<div class="nav-tab icon-only ${active===page?'active':''}" data-page="${page}" title="${htmlEscape(name)}" aria-label="${htmlEscape(name)}" onclick="${navActionFor(d,page)}">${customNavIcon(d,page,color)}</div>`;
  }).join('');
  const mobHtml = items.map(d => {
    const page = d.page || 'home';
    const name = d.name || PAGE_LABELS[page] || page;
    const color = iconColorFor(d);
    return `<div class="mob-tab icon-only ${active===page?'active':''}" data-page="${page}" title="${htmlEscape(name)}" aria-label="${htmlEscape(name)}" onclick="${navActionFor(d,page)}">${customNavIcon(d,page,color)}</div>`;
  }).join('');
  if(nav) nav.innerHTML = tabHtml;
  if(mob) mob.innerHTML = mobHtml;
  enhanceClickableControls();
}

function renderDistricts(){
  const list = document.getElementById('district-list');
  if(!list){renderNavTabs();return;}
  const districts = getDistricts();
  list.innerHTML = districts.map(d => {
    const color = iconColorFor(d);
    const action = DISTRICT_PAGES.includes(d.page) ? `goPage('${jsString(d.page)}')` : navActionFor(d,d.page);
    return `
    <div class="dbtn" onclick="${action}">
      ${customIconSvg(d.icon||defaultIconForPage(d.page),color,'district-emoji')}
      <span class="dname" style="color:${color}">${htmlEscape(d.name||'')}</span>
      <span class="darrow">→</span>
    </div>`;
  }).join('');
  renderNavTabs();
}

function toggleEditDistricts(){
  const form = document.getElementById('district-edit-form');
  if(!form) return;
  const open = form.style.display === 'none';
  form.style.display = open ? 'block' : 'none';
  if(open) renderDistrictEditList();
}

function districtPageOptions(d){
  const current = d?.url ? 'url' : (d?.page || 'url');
  const internal = DISTRICT_PAGE_DEFS.map(def =>
    `<option value="${def.page}" ${current===def.page?'selected':''}>${def.label}</option>`
  ).join('');
  return internal + `<option value="url" ${current==='url'?'selected':''}>Link externo</option>`;
}

function setDistrictPage(i,value){
  if(!myData.districts || !myData.districts[i])return;
  const d=myData.districts[i];
  d.page=value;
  if(value==='url'){
    d.url=d.url||'';
    d.icon=d.icon||'link';
  }else{
    d.url='';
    d.icon=defaultIconForPage(value);
  }
  renderDistrictEditList();
  renderDistricts();
  scheduleAutoSave();
}

function renderDistrictEditList(){
  if(!myData.districts || !myData.districts.length) myData.districts = JSON.parse(JSON.stringify(creatorDefaults(DEFAULT_DISTRICTS)));
  const el = document.getElementById('district-edit-list');
  if(!el) return;
  const templatePanel = `
    <div class="district-template-panel">
      <label class="district-field">
        <span class="district-field-label">Criar por template</span>
        <select id="district-template-select" class="district-select">${districtTemplateOptions()}</select>
      </label>
      <button class="btn btn-y" type="button" onclick="addDistrictFromTemplate(document.getElementById('district-template-select').value)">ADICIONAR TEMPLATE</button>
    </div>`;
  el.innerHTML = templatePanel + myData.districts.map((d,i) => {
    const showUrl = d.url!==undefined && !DISTRICT_PAGES.includes(d.page);
    const urlField = showUrl ? `
      <div class="district-field district-url-wrap">
        <span class="district-field-label">URL externa</span>
        <input class="district-url" type="text" value="${htmlEscape(d.url||'')}" placeholder="https://..." oninput="myData.districts[${i}].url=this.value">
      </div>` : '';
    return `
    <div class="district-config-card">
      <div class="district-config-head">
        <label class="district-field">
          <span class="district-field-label">Icone</span>
          <select class="district-select" onchange="myData.districts[${i}].icon=this.value;renderDistricts()">
            ${iconOptions(d.icon||defaultIconForPage(d.page)||'link')}
          </select>
        </label>
        <label class="district-field">
          <span class="district-field-label">Nome da aba</span>
          <input class="district-input" type="text" value="${htmlEscape(d.name||'')}" oninput="myData.districts[${i}].name=this.value;renderDistricts()">
        </label>
        <label class="district-field">
          <span class="district-field-label">Cor</span>
          <input class="district-color" type="color" value="${d.color||'#97C459'}" oninput="myData.districts[${i}].color=this.value;renderDistricts()">
        </label>
        <span class="district-remove" onclick="removeDistrict(${i})">X</span>
      </div>
      <div class="district-config-route">
        <label class="district-field">
          <span class="district-field-label">Destino</span>
          <select class="district-select" onchange="setDistrictPage(${i},this.value)">
            ${districtPageOptions(d)}
          </select>
        </label>
        <div class="district-field">
          <span class="district-field-label">Preview</span>
          <div class="dbtn" style="margin:0;pointer-events:none">
            ${customIconSvg(d.icon||defaultIconForPage(d.page),iconColorFor(d),'district-emoji')}
            <span class="dname" style="color:${d.color||'#97C459'}">${htmlEscape(d.name||'Nova aba')}</span>
            <span class="darrow">-></span>
          </div>
        </div>
      </div>
      ${urlField}
    </div>`;
  }).join('');
}
function addDistrictItem(){
  if(!myData.districts || !myData.districts.length) myData.districts = JSON.parse(JSON.stringify(creatorDefaults(DEFAULT_DISTRICTS)));
  addDistrictFromTemplate('financas');
}

async function removeDistrict(i){
  if(!(await confirmDanger('Remover este distrito da navegacao?')))return;
  if(!myData.districts) myData.districts = JSON.parse(JSON.stringify(creatorDefaults(DEFAULT_DISTRICTS)));
  myData.districts.splice(i,1);
  renderDistrictEditList();
  renderDistricts();
  scheduleAutoSave();
}

function addBook(){if(RO())return;const t=document.getElementById('btitle').value.trim(),a=document.getElementById('bauthor').value.trim(),s=document.getElementById('bstatus').value;if(!t)return;myData.books=myData.books||[];myData.books.unshift({id:Date.now(),title:t,author:a,status:s});addActivity('leitura',{title:t,status:s,note:a});document.getElementById('btitle').value='';document.getElementById('bauthor').value='';showProgressiveHintOnce('book_month_goal','META DE LEITURA','Livro adicionado. Defina uma meta mensal para acompanhar progresso.');renderBooks();renderGoals();renderEvolutionHistory();scheduleAutoSave();}
function cycleBook(id){if(RO())return;const b=myData.books||[],item=b.find(x=>x.id===id);if(!item)return;item.status={queue:'reading',reading:'done',done:'queue'}[item.status]||'queue';renderBooks();renderGoals();checkAchievements();scheduleAutoSave();}
function delBook(id){deleteWithUndo('Livro','books',id,()=>{renderBooks();renderGoals();});}
function renderBooks(){
  const b=D().books||[],el=document.getElementById('book-list');
  if(!b.length){el.innerHTML=RO()?'<div class="empty">NENHUM LIVRO</div>':`<div class="smart-empty compact"><span>LEITURA VAZIA</span><b>Adicione seu livro atual ou crie uma meta mensal.</b><div class="smart-actions"><button type="button" onclick="createStarterBook()">CRIAR LEITURA BASE</button></div></div>`;updateBooksProg();return;}
  const labels={queue:'FILA',reading:'LENDO',done:'CONCLUIDO'};
  el.innerHTML=b.map((x,i)=>`<div class="item"><span class="item-num">${String(i+1).padStart(2,'0')}</span><div class="item-info"><div class="item-title">${htmlEscape(x.title)}</div>${x.author?`<div class="item-sub">${htmlEscape(x.author)}</div>`:''}</div><span class="badge ${htmlEscape(x.status)}" onclick="${RO()?'':('cycleBook('+Number(x.id)+')')}" ${RO()?'style="cursor:default"':''}>${labels[x.status]||'FILA'}</span>${RO()?'':('<span class="del-btn" onclick="delBook('+Number(x.id)+')">X</span>')}</div>`).join('');
  updateBooksProg();
}
function updateBooksProg(){const b=D().books||[],done=b.filter(x=>x.status==='done').length,target=Number(getGoals().monthlyBooks)||1;document.getElementById('books-prog').textContent=done+' / '+target;document.getElementById('books-bar').style.width=Math.min(done/target*100,100)+'%';}

function createStarterBook(){
  if(RO())return;
  myData.books=myData.books||[];
  if(!myData.books.length)myData.books.unshift({id:Date.now(),title:'Livro atual',author:'',status:'reading'});
  myData.goals={...(myData.goals||{}),monthlyBooks:myData.goals?.monthlyBooks||1};
  addActivity('leitura',{title:'Meta de leitura criada',status:'reading'});
  renderBooks();renderGoals();renderEvolutionHistory();scheduleAutoSave();
  showCyberToast('LEITURA ATIVA','Livro base criado. Edite o titulo quando escolher o livro.');
}

function addProject(){if(RO())return;const n=document.getElementById('pname').value.trim(),s=document.getElementById('pstatus').value,note=document.getElementById('pnote').value.trim();if(!n)return;myData.projects=myData.projects||[];myData.projects.unshift({id:Date.now(),name:n,status:s,note});addActivity('dev',{title:n,status:s,note});document.getElementById('pname').value='';document.getElementById('pnote').value='';renderProjects();renderGoals();renderEvolutionHistory();scheduleAutoSave();}
function delProject(id){deleteWithUndo('Projeto','projects',id,()=>{renderProjects();renderGoals();});}
function renderProjects(){
  const p=D().projects||[],el=document.getElementById('proj-list');
  if(!p.length){el.innerHTML=RO()?'<div class="empty">NENHUM PROJETO</div>':`<div class="smart-empty compact"><span>DEV SEM PROJETO</span><b>Crie um projeto pequeno para gerar constancia.</b><div class="smart-actions"><button type="button" onclick="createStarterProject()">CRIAR PROJETO BASE</button></div></div>`;return;}
  const sc={active:'ATIVO',pause:'PAUSADO',done:'CONCLUIDO'},cc={active:'var(--c)',pause:'var(--y)',done:'#3b6d11'};
  el.innerHTML=p.map(x=>`<div class="item"><div class="item-info"><div class="item-title">${htmlEscape(x.name)}</div>${x.note?`<div class="item-sub">${htmlEscape(x.note)}</div>`:''}</div><span class="badge" style="color:${cc[x.status]||'var(--muted)'};background:${cc[x.status]||'var(--muted)'}11;border-color:${cc[x.status]||'var(--muted)'}44">${sc[x.status]||'ATIVO'}</span>${RO()?'':('<span class="del-btn" onclick="delProject('+Number(x.id)+')">X</span>')}</div>`).join('');
}

function createStarterProject(){
  if(RO())return;
  myData.projects=myData.projects||[];
  if(!myData.projects.length)myData.projects.unshift({id:Date.now(),name:'Projeto pequeno',status:'active',note:'Entrega de 30 min por dia.'});
  addActivity('dev',{title:'Projeto base criado',duration:30});
  renderProjects();renderGoals();renderEvolutionHistory();scheduleAutoSave();
  showCyberToast('PROJETO ATIVO','Projeto base criado para iniciar sem tela vazia.');
}

function addDevLog(){if(RO())return;const t=document.getElementById('devlog-in').value.trim();if(!t)return;myData.devlog=myData.devlog||[];myData.devlog.unshift({id:Date.now(),date:dk(),text:t});addActivity('dev',{title:'Log de estudo',duration:30,difficulty:'Media',note:t});document.getElementById('devlog-in').value='';renderDevLog();renderEvolutionHistory();scheduleAutoSave();}
function delDevLog(id){deleteWithUndo('Log de estudo','devlog',id,renderDevLog);}
function renderDevLog(){const l=D().devlog||[],el=document.getElementById('dev-log');if(!l.length){el.innerHTML=RO()?'<div class="empty">NENHUM LOG</div>':`<div class="smart-empty compact"><span>SEM LOGS DE ESTUDO</span><b>Registre sua sessao de hoje para manter o historico.</b><div class="smart-actions"><button type="button" onclick="createStarterDevLog()">CRIAR PRIMEIRO LOG</button></div></div>`;return;}el.innerHTML=l.slice(0,15).map(x=>`<div class="log-entry"><div class="log-head"><span class="log-date">${htmlEscape(x.date)}</span>${RO()?'':('<span class="del-btn" onclick="delDevLog('+Number(x.id)+')">X</span>')}</div><div class="log-text">${htmlEscape(x.text)}</div></div>`).join('');}

function createStarterDevLog(){if(RO())return;myData.devlog=myData.devlog||[];if(!myData.devlog.length)myData.devlog.unshift({id:Date.now(),date:dk(),text:'Primeira sessao de estudo registrada.'});addActivity('dev',{title:'Log de estudo',duration:30,note:'Inicio do historico'});renderDevLog();renderEvolutionHistory();scheduleAutoSave();showCyberToast('LOG INICIADO','Historico de estudo ativado. Registre cada sessao.');}

function addGuitarLog(){if(RO())return;const t=document.getElementById('glog-in').value.trim();if(!t)return;myData.guitarlog=myData.guitarlog||[];myData.guitarlog.unshift({id:Date.now(),date:dk(),text:t});addActivity('violao',{title:'Pratica de violao',duration:Number(getGoals().guitarMinutes)||15,difficulty:'Media',note:t});document.getElementById('glog-in').value='';renderGuitarLog();updateGStreak();renderEvolutionHistory();scheduleAutoSave();}
function delGLog(id){deleteWithUndo('Log de violao','guitarlog',id,()=>{renderGuitarLog();updateGStreak();});}
function renderGuitarLog(){const l=D().guitarlog||[],el=document.getElementById('guitar-log');if(!l.length){el.innerHTML=RO()?'<div class="empty">NENHUM LOG</div>':`<div class="smart-empty compact"><span>SEM PRATICAS REGISTRADAS</span><b>Anote o que praticou hoje para construir seu streak.</b><div class="smart-actions"><button type="button" onclick="createStarterGuitarLog()">REGISTRAR PRIMEIRA PRATICA</button></div></div>`;return;}el.innerHTML=l.slice(0,15).map(x=>`<div class="log-entry"><div class="log-head"><span class="log-date">${htmlEscape(x.date)}</span>${RO()?'':('<span class="del-btn" onclick="delGLog('+Number(x.id)+')">X</span>')}</div><div class="log-text">${htmlEscape(x.text)}</div></div>`).join('');}

function createStarterGuitarLog(){if(RO())return;myData.guitarlog=myData.guitarlog||[];if(!myData.guitarlog.length)myData.guitarlog.unshift({id:Date.now(),date:dk(),text:'Primeira pratica registrada. Aquecimento e acordes basicos.'});addActivity('violao',{title:'Pratica de violao',duration:Number(getGoals().guitarMinutes)||15,note:'Inicio do historico'});renderGuitarLog();updateGStreak();renderEvolutionHistory();scheduleAutoSave();showCyberToast('STREAK INICIADO','Primeira pratica registrada. Nao quebre a corrente.');}
function updateGStreak(){const l=D().guitarlog||[],dates=[...new Set(l.map(x=>x.date))].sort().reverse();let streak=0,cur=new Date();for(let i=0;i<dates.length;i++){const exp=localDateKey(cur);if(dates[i]===exp){streak++;cur.setDate(cur.getDate()-1);}else break;}const el=document.getElementById('g-streak');if(el)el.textContent=streak+' dia'+(streak!==1?'s':'');}

function renderSkills(){
  renderSkillGroup('dev');
  renderSkillGroup('guitar');
}

function renderSkillGroup(kind){
  const wrap=document.getElementById(kind==='guitar'?'guitar-skills':'skill-list');
  if(!wrap)return;
  const defs=getSkillDefs(kind);
  wrap.innerHTML=defs.map(d=>`<div class="skill-item"><span class="skill-name">${htmlEscape(d.name)}</span><div class="skill-dots" data-sk="${htmlEscape(d.id)}" data-max="${parseInt(d.max)||5}"></div></div>`).join('');
  wrap.querySelectorAll('.skill-dots').forEach(w=>{
    const sk=w.dataset.sk,max=parseInt(w.dataset.max)||5,val=(D().skills||{})[sk]||0;
    w.innerHTML='';
    for(let i=0;i<max;i++){
      const dot=document.createElement('div');
      dot.className='sdot'+(i<val?' on':'')+(RO()?' readonly':'');
      if(!RO()){
        const idx=i;
        dot.onclick=()=>{myData.skills=myData.skills||{};myData.skills[sk]=(myData.skills[sk]||0)===idx+1?idx:idx+1;renderSkills();renderGoals();scheduleAutoSave();};
      }
      w.appendChild(dot);
    }
  });
}

function cloneSkillDefaults(kind){
  return JSON.parse(JSON.stringify(creatorDefaults(kind==='guitar'?DEFAULT_GUITAR_SKILL_DEFS:DEFAULT_SKILL_DEFS)));
}

function skillDefKey(kind){
  return kind==='guitar'?'guitarSkillDefs':'skillDefs';
}

function ensureSkillDefs(kind){
  const key=skillDefKey(kind);
  if(!myData[key] || !myData[key].length) myData[key]=cloneSkillDefaults(kind);
  myData[key].forEach((d,i)=>{
    if(!d.id)d.id=(kind==='guitar'?'g-skill-':'skill-')+Date.now()+'-'+i;
    if(!d.max)d.max=5;
  });
  return myData[key];
}

function toggleEditSkillDefs(kind){
  if(RO())return;
  const form=document.getElementById(kind==='guitar'?'guitar-skill-edit-form':'dev-skill-edit-form');
  if(!form)return;
  const open=form.style.display==='none';
  form.style.display=open?'block':'none';
  if(open)renderSkillDefEditor(kind);
}

function renderSkillDefEditor(kind){
  const defs=ensureSkillDefs(kind);
  const el=document.getElementById(kind==='guitar'?'guitar-skill-edit-list':'dev-skill-edit-list');
  if(!el)return;
  el.innerHTML=defs.map((d,i)=>`
    <div style="display:flex;gap:6px;margin-bottom:6px;align-items:center">
      <input type="text" value="${htmlEscape(d.name||'')}" oninput="myData.${skillDefKey(kind)}[${i}].name=this.value;renderSkills()"
        style="flex:1;font-size:12px;padding:5px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--ui)">
      <input type="number" min="1" max="10" value="${parseInt(d.max)||5}" oninput="myData.${skillDefKey(kind)}[${i}].max=Math.max(1,Math.min(10,parseInt(this.value)||5));renderSkills()"
        style="width:54px;font-size:12px;padding:5px 6px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--mono)">
      <button type="button" class="mini-remove" onclick="removeSkillDef('${kind}',${i})">X</button>
    </div>`).join('');
}

function addSkillDef(kind){
  const defs=ensureSkillDefs(kind);
  const id=(kind==='guitar'?'g-skill-':'skill-')+Date.now();
  defs.push({id,name:kind==='guitar'?'Nova tecnica':'Nova skill',max:5});
  renderSkillDefEditor(kind);
  renderSkills();
  scheduleAutoSave();
}

async function removeSkillDef(kind,i){
  if(!(await confirmDanger('Remover esta skill/tecnica?')))return;
  const defs=ensureSkillDefs(kind);
  const removed=defs.splice(i,1)[0];
  if(removed && myData.skills) delete myData.skills[removed.id];
  renderSkillDefEditor(kind);
  renderSkills();
  scheduleAutoSave();
}

function addGame(){if(RO())return;const n=document.getElementById('gname').value.trim(),s=document.getElementById('gstatus').value,note=document.getElementById('gnote').value.trim();if(!n)return;myData.games=myData.games||[];myData.games.unshift({id:Date.now(),name:n,status:s,note});addActivity('jogos',{title:n,status:s,note});document.getElementById('gname').value='';document.getElementById('gnote').value='';renderGames();renderGoals();renderEvolutionHistory();scheduleAutoSave();}
function delGame(id){deleteWithUndo('Jogo','games',id,()=>{renderGames();renderGoals();});}
function renderGames(){const g=D().games||[],cur=document.getElementById('game-current'),list=document.getElementById('game-list');const playing=g.filter(x=>x.status==='playing');cur.innerHTML=playing.length?playing.map(x=>`<div class="irow"><span class="ikey">JOGO</span><div><div class="ival">${htmlEscape(x.name)}</div>${x.note?`<div class="item-sub">${htmlEscape(x.note)}</div>`:''}</div></div>`).join(''):RO()?'<div class="empty">NENHUM JOGO ATIVO</div>':`<div class="smart-empty compact"><span>NENHUM JOGO ATIVO</span><b>Adicione o jogo que esta jogando agora.</b><div class="smart-actions"><button type="button" onclick="createStarterGame()">ADICIONAR JOGO ATUAL</button></div></div>`;const sc={playing:'JOGANDO',queue:'FILA',done:'ZERADO',dropped:'LARGADO'};list.innerHTML=g.length?g.map(x=>`<div class="item"><div class="item-info"><div class="item-title">${htmlEscape(x.name)}</div>${x.note?`<div class="item-sub">${htmlEscape(x.note)}</div>`:''}</div><span class="badge ${htmlEscape(x.status)}">${sc[x.status]||'FILA'}</span>${RO()?'':('<span class="del-btn" onclick="delGame('+Number(x.id)+')">X</span>')}</div>`).join(''):RO()?'<div class="empty">NENHUM JOGO</div>':`<div class="smart-empty compact"><span>BIBLIOTECA VAZIA</span><b>Registre jogos para acompanhar seu progresso.</b></div>`;}

function createStarterGame(){if(RO())return;myData.games=myData.games||[];if(!myData.games.length)myData.games.unshift({id:Date.now(),name:'Jogo atual',status:'playing',note:''});addActivity('jogos',{title:'Jogo adicionado',status:'playing'});renderGames();renderGoals();renderEvolutionHistory();scheduleAutoSave();showCyberToast('JOGO ATIVO','Biblioteca iniciada. Edite o nome para o jogo que esta jogando.');}

function addReflexao(){if(RO())return;const t=document.getElementById('rtitle').value.trim(),txt=document.getElementById('rtext').value.trim();if(!txt)return;myData.reflexoes=myData.reflexoes||[];myData.reflexoes.unshift({id:Date.now(),date:dk(),title:t,text:txt});document.getElementById('rtitle').value='';document.getElementById('rtext').value='';renderRefs();scheduleAutoSave();}
function delRef(id){deleteWithUndo('Reflexao','reflexoes',id,renderRefs);}
function renderRefs(){const r=D().reflexoes||[],el=document.getElementById('ref-list');if(!r.length){el.innerHTML=RO()?'<div class="empty">NENHUMA REFLEXAO</div>':`<div class="smart-empty compact"><span>DIARIO VAZIO</span><b>Escreva o que esta pensando agora. Nao precisa ser perfeito.</b><div class="smart-actions"><button type="button" onclick="createStarterRef()">ESCREVER PRIMEIRA ENTRADA</button></div></div>`;return;}el.innerHTML=r.map(x=>`<div class="log-entry" style="margin-bottom:10px"><div class="log-head"><span class="log-date">${htmlEscape(x.date)}</span>${x.title?`<span style="font-size:14px;font-weight:600;color:var(--p);margin-left:8px">${htmlEscape(x.title)}</span>`:''} ${RO()?'':('<span class="del-btn" onclick="delRef('+Number(x.id)+')">X</span>')}</div><div class="log-text" style="margin-top:5px">${htmlEscape(x.text)}</div></div>`).join('');}

function createStarterRef(){if(RO())return;const prompt=document.getElementById('rtext');if(prompt){prompt.value='Como estou me sentindo hoje e o que quero mudar.';prompt.focus();}showCyberToast('DIARIO ABERTO','Escreva livremente. Seus dados ficam so com voce.');}
