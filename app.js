"use strict";
const NC_CONFIG = window.NC_CONFIG || {};
const SUPA_URL = NC_CONFIG.SUPA_URL || 'https://wmglywfsrlcpsspouufp.supabase.co';
const SUPA_KEY = NC_CONFIG.SUPA_KEY || 'sb_publishable_X6xbf9gD2JxmBXxthWG6lQ_gM5hvxeW';
const WEB_PUSH_PUBLIC_KEY = NC_CONFIG.WEB_PUSH_PUBLIC_KEY || 'BAXYgFpb56ooYOLihzUYKchPIzfXgyQyJxNfI8jUavmH9-AuVvUcbMse8Bdv_0juXpC69b1SkM1q3WenhhVtzmM'; // VAPID public key para notificacoes com o site fechado.
const AUTH_STORAGE_MODE = NC_CONFIG.AUTH_STORAGE === 'session' ? 'session' : 'local';
const APP_VERSION = 'v0.4.77';
const APP_BUILD_LABEL = '2026.06.12-delete-contract-button';
window.NC_APP_VERSION = APP_VERSION;
window.NC_BUILD_LABEL = APP_BUILD_LABEL;
const DIAG_JS_ERROR_KEY = 'nc_diag_last_js_error_v1';
const DIAG_SUPABASE_KEY = 'nc_diag_last_supabase_error_v1';
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
      detectSessionInUrl:true,
      flowType:'implicit'
    }
  });
} catch(e) {
  console.error('Supabase init failed:', e);
  recordSupabaseFailure('init', e);
}

let PROFILES = NC_CONFIG.PROFILES || {
  victor: {name:'VICTOR', avatar:'🔴', color:'var(--y)', role:'NETRUNNER'},
  caio:   {name:'CAIO',   avatar:'🔵', color:'var(--c)', role:'CORPO'}
};
const LEGACY_PROFILE_IDS = Object.keys(PROFILES);
const ACCOUNT_LIMIT = Number(NC_CONFIG.ACCOUNT_LIMIT || 5);
const CREATOR_EMAILS = new Set((NC_CONFIG.CREATOR_EMAILS || ['victorgabrilvc@gmail.com']).map(e=>String(e).trim().toLowerCase()).filter(Boolean));
const INFINITE_EDDIES_USERS = new Set((NC_CONFIG.INFINITE_EDDIES_USERS || ['victor','caio']).map(v=>String(v).trim().toLowerCase()).filter(Boolean));
const INFINITE_EDDIES_EMAILS = new Set((NC_CONFIG.INFINITE_EDDIES_EMAILS || Array.from(CREATOR_EMAILS)).map(e=>String(e).trim().toLowerCase()).filter(Boolean));
const INFINITE_EDDIES_ALIAS_KEY = 'nc_infinite_eddies_aliases_v1';

let me=null, viewFriend=false, myData={}, friendData={};
let selProfile=null, isNewUser=false;
let reminders={}, reminderTimer=null;
let currentTheme='arasaka';
let motionMode='low';
let uiMode='cyber'; // 'cyber' (jargon) | 'simple' (termos comuns)
let authFormMode='login';
let signupRateLimitUntil=0;
let signupRateLimitTimer=null;
let friendPanelTab='friends';
let friendSuggestions=[];
let friendSuggestionsLoaded=false;
const pendingFriendProfileLoads=new Set();
let friendMessageChannel=null;
let friendMessageChannelId='';
let friendMessagePollTimer=null;
let friendRealtimeState={channelId:'',messagesLoaded:false,lastStatus:'idle',lastError:''};
let _lastTier=null;
let _lastSaveTs=null;
let _sessionStartCred=null;
let _taskFilter='all';
let _taskSortMode='smart';
const _pendingConfirm=new Map();
let _todayModeInit=false;
let _taskListHome=null;
let _missionOffset=0;
let _focusSession=null;
let _focusTimer=null;

function redactDiagnosticText(value){
  return String(value ?? '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g,'Bearer [token]')
    .replace(/sb_[A-Za-z0-9._-]+/g,'sb_[redacted]')
    .replace(/[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}/g,'[jwt]')
    .slice(0,900);
}

function shortSource(value){
  const raw=String(value||'');
  return redactDiagnosticText(raw.split(/[\\/]/).pop() || raw).slice(0,180);
}

function storeDiagnostic(key,payload){
  try{sessionStorage.setItem(key,JSON.stringify({...payload,at:new Date().toISOString()}));}catch(e){}
}

function readDiagnostic(key){
  try{return JSON.parse(sessionStorage.getItem(key)||'null');}catch(e){return null;}
}

function recordJsDiagnostic(type,error,source,line,column){
  const message=error?.message || error?.reason?.message || error?.reason || error || 'Erro desconhecido';
  storeDiagnostic(DIAG_JS_ERROR_KEY,{
    type,
    message:redactDiagnosticText(message),
    source:shortSource(source || error?.filename || ''),
    line:Number(line||error?.lineno||0)||0,
    column:Number(column||error?.colno||0)||0
  });
  try{renderSystemStatus();}catch(e){}
}

function recordSupabaseFailure(operation,error){
  storeDiagnostic(DIAG_SUPABASE_KEY,{
    operation:redactDiagnosticText(operation||'supabase'),
    message:redactDiagnosticText(error?.message || error?.error_description || error || 'Falha Supabase'),
    code:redactDiagnosticText(error?.code || error?.status || ''),
    hint:redactDiagnosticText(error?.hint || '')
  });
  try{renderSystemStatus();}catch(e){}
}

window.addEventListener('error',event=>{
  recordJsDiagnostic('error',event.error || event.message,event.filename,event.lineno,event.colno);
});
window.addEventListener('unhandledrejection',event=>{
  recordJsDiagnostic('unhandledrejection',event.reason);
});

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

function identityKey(value){
  return String(value||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/^@+/,'');
}

function isInfiniteEddiesAlias(value){
  const key=identityKey(value);
  return !!key && (INFINITE_EDDIES_USERS.has(key) || INFINITE_EDDIES_EMAILS.has(key));
}

function looseCaioIdentity(value){
  const key=identityKey(value);
  return key==='caio' || key.startsWith('caio') || key.includes('caio');
}

function infiniteEddiesAliasMap(){
  try{
    const parsed=JSON.parse(localStorage.getItem(INFINITE_EDDIES_ALIAS_KEY)||'{}');
    return parsed && typeof parsed==='object' ? parsed : {};
  }catch(e){
    return {};
  }
}

function rememberInfiniteEddiesAlias(username,alias){
  const id=identityKey(username);
  const key=identityKey(alias);
  if(!id || !isInfiniteEddiesAlias(key))return;
  const map=infiniteEddiesAliasMap();
  const list=Array.isArray(map[id]) ? map[id] : [];
  if(!list.includes(key))list.push(key);
  map[id]=list;
  try{localStorage.setItem(INFINITE_EDDIES_ALIAS_KEY,JSON.stringify(map));}catch(e){}
}

function knownAccountIdentityKeys(username=me){
  const id=identityKey(username);
  if(!id)return [];
  try{
    const parsed=JSON.parse(localStorage.getItem('nc_known_accounts_v1')||'[]');
    if(!Array.isArray(parsed))return [];
    return parsed
      .filter(account=>identityKey(account?.id)===id)
      .flatMap(account=>[account.id,account.email,account.name,String(account.email||'').split('@')[0]]);
  }catch(e){
    return [];
  }
}

function profileIdentityKeys(username=me){
  const raw=String(username||'').trim();
  const id=identityKey(raw);
  const profile=PROFILES[raw] || PROFILES[id] || {};
  const activeProfile=raw && raw===me && myData?.profile && typeof myData.profile==='object' ? myData.profile : {};
  const email=profileEmail(raw);
  const aliasMap=infiniteEddiesAliasMap();
  const values=[
    raw,
    id,
    email,
    email.split('@')[0],
    profile.name,
    profile.nick,
    profile.tag,
    activeProfile.name,
    activeProfile.nick,
    activeProfile.tag,
    displayNameFromEmail(email),
    ...(aliasMap[id]||[]),
    ...knownAccountIdentityKeys(raw)
  ];
  return new Set(values.map(identityKey).filter(Boolean));
}

function isInfiniteEddiesUser(username=me){
  const keys=profileIdentityKeys(username);
  return [...keys].some(key=>INFINITE_EDDIES_USERS.has(key) || INFINITE_EDDIES_EMAILS.has(key) || looseCaioIdentity(key));
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
    nick:String(profile.nick || PROFILES[username]?.nick || '').trim().slice(0,18),
    tag:String(profile.tag || PROFILES[username]?.tag || '').trim().slice(0,8),
    avatar:profile.avatar || '◎',
    email,
    color:profile.color || 'var(--c)',
    role:isCreatorEmail(email) ? 'CRIADOR' : (profile.role || profile.status || 'USUARIO')
  };
  return PROFILES[username];
}

// Data access
function ensureDb(){
  if(!sb) throw new Error('Supabase indisponivel. Recarregue a pagina e tente novamente.');
}
async function dbGet(username){
  ensureDb();
  if(!String(username||'').trim()) throw new Error('Perfil invalido');
  const {data,error}=await sb.from('user_data').select('data_key,data_value').eq('username',username);
  if(error){recordSupabaseFailure('dbGet:user_data',error);throw error;}
  const out={};(data||[]).forEach(r=>out[r.data_key]=r.data_value);return out;
}
async function dbSet(username,key,value){
  if(!navigator.onLine){
    try{
      const qKey='nc_offline_queue_v1';
      let queue=[];
      try{queue=JSON.parse(localStorage.getItem(qKey)||'[]');}catch(e){queue=[];}
      if(!Array.isArray(queue))queue=[];
      queue.push({key,value,timestamp:Date.now(),user:username});
      localStorage.setItem(qKey,JSON.stringify(queue));
    }catch(e){}
    return;
  }
  ensureDb();
  if(!String(username||'').trim()) throw new Error('Perfil invalido');
  const {error}=await sb.from('user_data').upsert({username,data_key:key,data_value:value,updated_at:new Date().toISOString()},{onConflict:'username,data_key'});
  if(error){recordSupabaseFailure('dbSet:'+key,error);throw error;}
}

async function flushOfflineQueue(){
  const raw=localStorage.getItem('nc_offline_queue_v1');
  if(!raw) return;
  let queue;
  try{ queue=JSON.parse(raw); }catch(e){ localStorage.removeItem('nc_offline_queue_v1'); return; }
  if(!Array.isArray(queue)||!queue.length) return;
  localStorage.removeItem('nc_offline_queue_v1');
  for(const item of queue){
    try{ await dbSet(item.user, item.key, item.value); }catch(e){ console.warn('[NC] flush falhou para',item.key,e); }
  }
}
// Grava varias chaves em uma unica requisicao (atomica do lado do cliente).
async function dbSetMany(username,entries){
  ensureDb();
  if(!String(username||'').trim()) throw new Error('Perfil invalido');
  const now=new Date().toISOString();
  const rows=entries.map(([key,value])=>({username,data_key:key,data_value:value,updated_at:now}));
  if(!rows.length)return;
  const {error}=await sb.from('user_data').upsert(rows,{onConflict:'username,data_key'});
  if(error){recordSupabaseFailure('dbSetMany:user_data',error);throw error;}
}

// Password and session
async function hashPwd(pwd){
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(pwd+':night_city_salt'));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

const SESSION_KEY='nc_session_v2';
function sessionStorageArea(){ return localStorage; }
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
  corpo:{label:'Corpo roxo',y:'#b44fff',r:'#e00f3a',c:'#00d4ff',p:'#d46bff'},
  militech:{label:'Militech verde',y:'#97C459',r:'#e00f3a',c:'#00d4ff',p:'#b44fff'}
};
const THEME_COPY={
  arasaka:{boot:'// ARASAKA LIFE OS v2.077 - CONTRACT MODE',save:'SALVAR',saving:'SALVANDO...',saved:'SALVO ✓',review:'SALVAR REVISAO'},
  netrunner:{boot:'// NETRUNNER ICEBREAKER - JACK IN',save:'GRAVAR NO ICE',saving:'GRAVANDO...',saved:'ICE GRAVADO ✓',review:'FECHAR RUN'},
  maelstrom:{boot:'// MAELSTROM GRID - RUNS ATIVAS',save:'QUEIMAR SAVE',saving:'QUEIMANDO...',saved:'RUN SELADA ✓',review:'SELAR DIA'},
  corpo:{boot:'// CORPO OPS - RELATORIO EXECUTIVO',save:'ARQUIVAR DADOS',saving:'ARQUIVANDO...',saved:'DOSSIER OK ✓',review:'ENVIAR RELATORIO'}
};
function themeCopy(key){
  const cosmeticKey=(myData?.equippedCosmetics||{}).theme;
  const cosmetic=cosmeticKey && window.COSMETIC_THEMES ? window.COSMETIC_THEMES[cosmeticKey] : null;
  return cosmetic?.copy?.[key] || (THEME_COPY[currentTheme]||THEME_COPY.arasaka)[key] || THEME_COPY.arasaka[key];
}
function themeKey(){return 'nc_theme_v1_'+(me||'anon');}
const _THEME_DATA_MAP={arasaka:'corpo',netrunner:'netrunner',maelstrom:'arasaka',corpo:'maelstrom',militech:'militech'};
function themeEsc(value){
  return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function ownedShopThemeItems(){
  const items=window.SHOP_ITEMS||[];
  const owned=new Set(myData?.shopUnlocks||[]);
  return items.filter(item=>item.type==='theme' && owned.has(item.id));
}
function themeSelectLabel(){
  const cosmeticKey=(myData?.equippedCosmetics||{}).theme;
  const cosmetic=cosmeticKey && window.COSMETIC_THEMES ? window.COSMETIC_THEMES[cosmeticKey] : null;
  return cosmetic?.label || (THEMES[currentTheme]?.label || currentTheme).replace(/^Tema\s+/i,'').toUpperCase();
}
function renderThemeControls(){
  const selectedValue=(myData?.equippedCosmetics||{}).theme ? 'shop:'+(myData.equippedCosmetics.theme) : currentTheme;
  const options=document.getElementById('theme-options');
  const baseRows=Object.entries(THEMES).map(([id,t])=>
    `<button type="button" class="${selectedValue===id?'active':''}" data-action="chooseTheme" data-theme="${themeEsc(id)}"><span>${themeEsc((t.label||id).toUpperCase())}</span><small>PADRAO</small></button>`
  ).join('');
  const bought=ownedShopThemeItems();
  const boughtRows=bought.map(item=>{
    const theme=window.COSMETIC_THEMES?.[item.theme]||{};
    const value='shop:'+item.theme;
    return `<button type="button" class="shop-theme-option ${selectedValue===value?'active':''}" data-action="chooseTheme" data-theme="${themeEsc(value)}"><span>${themeEsc(theme.label||item.name)}</span><small>${themeEsc(theme.mood||'COMPRADO')}</small></button>`;
  }).join('');
  if(options){
    options.innerHTML=
      '<div class="theme-options-group"><b>PADRAO</b>'+baseRows+'</div>'+
      '<div class="theme-options-group"><b>COMPRADOS</b>'+(boughtRows||'<div class="theme-empty">COMPRE TEMAS NA LOJA</div>')+'</div>';
  }
  const mobile=document.getElementById('theme-select-mobile');
  if(mobile){
    mobile.innerHTML=Object.entries(THEMES).map(([id,t])=>`<option value="${themeEsc(id)}">${themeEsc((t.label||id).toUpperCase())}</option>`).join('')+
      (bought.length?'<optgroup label="COMPRADOS">'+bought.map(item=>{
        const theme=window.COSMETIC_THEMES?.[item.theme]||{};
        return `<option value="shop:${themeEsc(item.theme)}">${themeEsc(theme.label||item.name)}</option>`;
      }).join('')+'</optgroup>':'');
    mobile.value=selectedValue;
  }
  const sel=document.getElementById('theme-select');
  if(sel)sel.textContent=themeSelectLabel();
}
function applyTheme(id){
  const theme=THEMES[id]||THEMES.arasaka;
  currentTheme=THEMES[id]?id:'arasaka';
  Object.entries(theme).forEach(([k,v])=>{if(k!=='label')document.documentElement.style.setProperty('--'+k,v);});
  document.documentElement.dataset.theme=_THEME_DATA_MAP[currentTheme]||'corpo';
  renderThemeControls();
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
  if(String(id||'').startsWith('shop:')){
    const themeId=String(id).slice(5);
    const item=(window.SHOP_ITEMS||[]).find(entry=>entry.type==='theme' && entry.theme===themeId);
    if(!item || !Array.isArray(myData?.shopUnlocks) || !myData.shopUnlocks.includes(item.id)){
      renderThemeControls();
      return;
    }
    myData.equippedCosmetics={...(myData.equippedCosmetics||{}),theme:themeId};
    applyTheme(currentTheme);
    if(typeof applyCosmeticTheme==='function')applyCosmeticTheme();
    updateThemeCopy();
    renderThemeControls();
    if(typeof refreshShopViews==='function')refreshShopViews();
    if(typeof scheduleAutoSave==='function')scheduleAutoSave();
    return;
  }
  if(myData?.equippedCosmetics)myData.equippedCosmetics.theme='';
  applyTheme(id);
  if(typeof applyCosmeticTheme==='function')applyCosmeticTheme();
  localStorage.setItem(themeKey(),currentTheme);
  if(!me)localStorage.setItem('nc_theme_v1_anon',currentTheme);
  renderThemeControls();
  if(typeof refreshShopViews==='function')refreshShopViews();
  if(typeof scheduleAutoSave==='function')scheduleAutoSave();
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

/* ============================================================
   MODO SIMPLES vs CYBERPUNK
   Troca o vocabulario tematico (Contratos, Distritos, Street Cred...)
   por termos comuns (Tarefas, Areas, Progresso...) sem reescrever cada
   string na fonte. Usa um glossario aplicado aos nos de texto da UI.
   ============================================================ */
function uiModeKey(){return 'nc_ui_mode_'+(me||'anon');}
// Pares ordenados (frases compostas e plurais antes dos singulares).
const LEXICON_PAIRS=[
  ['STREET CRED','PROGRESSO'],['Street Cred','Progresso'],['street cred','progresso'],
  ['BLACK MARKET','LOJA'],['Black Market','Loja'],['black market','loja'],
  ['CONTRATOS','TAREFAS'],['Contratos','Tarefas'],['contratos','tarefas'],
  ['CONTRATO','TAREFA'],['Contrato','Tarefa'],['contrato','tarefa'],
  ['DISTRITOS','ÁREAS'],['Distritos','Áreas'],['distritos','áreas'],
  ['DISTRITO','ÁREA'],['Distrito','Área'],['distrito','área'],
  ['COMMLINK','MENSAGENS'],['Commlink','Mensagens'],['commlink','mensagens'],
  ['NETRUNNER','OPERADOR'],['Netrunner','Operador'],['netrunner','operador'],
  ['EDDIES','MOEDAS'],['Eddies','Moedas'],['eddies','moedas'],
  ['MISSÕES','METAS'],['Missões','Metas'],['MISSAO','META'],['MISSÃO','META'],['Missão','Meta'],['Missao','Meta'],['missão','meta'],['missao','meta'],
  ['INTEL','RESUMO'],['Intel','Resumo'],
  ['HUD','PAINEL']
];
const _LEXICON_RE=new RegExp(LEXICON_PAIRS.map(([a])=>a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');
const _LEXICON_MAP=Object.fromEntries(LEXICON_PAIRS);
/* Concordancia de genero: CONTRATO(m)->TAREFA(f), DISTRITO(m)->AREA(f) e
   EDDIES(m)->MOEDAS(f) trocam o genero do substantivo, entao artigos,
   pronomes e participios vizinhos precisam acompanhar
   (ex.: "PRIMEIRO TAREFA PENDENTE" -> "PRIMEIRA TAREFA PENDENTE"). */
const _GENDER_PRE={o:'a',os:'as',um:'uma',uns:'umas',do:'da',dos:'das',no:'na',nos:'nas',ao:'à',aos:'às',pelo:'pela',pelos:'pelas',este:'esta',estes:'estas',esse:'essa',esses:'essas',aquele:'aquela',aqueles:'aquelas',neste:'nesta',nesse:'nessa',naquele:'naquela',seu:'sua',seus:'suas',meu:'minha',meus:'minhas',nenhum:'nenhuma',algum:'alguma',outro:'outra',outros:'outras',mesmo:'mesma',primeiro:'primeira',primeiros:'primeiras',novo:'nova',novos:'novas',segundo:'segunda','último':'última',ultimo:'ultima','próximo':'próxima',proximo:'proxima'};
const _GENDER_POS={'concluído':'concluída','concluídos':'concluídas',concluido:'concluida',concluidos:'concluidas',feito:'feita',feitos:'feitas',encerrado:'encerrada',encerrados:'encerradas',arquivado:'arquivada',arquivados:'arquivadas',ativo:'ativa',ativos:'ativas',criado:'criada',criados:'criadas',fechado:'fechada',fechados:'fechadas',marcado:'marcada',marcados:'marcadas',programado:'programada',programados:'programadas','obrigatório':'obrigatória',obrigatorio:'obrigatoria',vazio:'vazia',vazios:'vazias','diário':'diária',diario:'diaria','diários':'diárias',diarios:'diarias',avulso:'avulsa',avulsos:'avulsas','específico':'específica',especifico:'especifica','físico':'física',fisico:'fisica','público':'pública',publico:'publica','públicos':'públicas',publicos:'publicas',salvo:'salva',salvos:'salvas',dobrado:'dobrada',dobrados:'dobradas',pronto:'pronta',prontos:'prontas'};
const _LEX_LETTER='A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u00FF';
const _LEX_FEM_ADJ='(?:primeiras?|novas?|outras?|mesmas?|segundas?|últimas?|ultimas?|próximas?|proximas?)';
const _LEX_FEM_NOUN='(?:'+_LEX_FEM_ADJ+'\\s+)?(?:tarefas?|áreas?|areas?|moedas?|lojas?)';
const _GENDER_PRE_RE=new RegExp('(^|[^'+_LEX_LETTER+'])('+Object.keys(_GENDER_PRE).join('|')+')(\\s+)(?='+_LEX_FEM_NOUN+'(?:[^'+_LEX_LETTER+']|$))','gi');
const _GENDER_POS_RE=new RegExp('(^|[^'+_LEX_LETTER+'])((?:tarefas?|áreas?|areas?|moedas?|lojas?))(\\s+)('+Object.keys(_GENDER_POS).join('|')+')(?=[^'+_LEX_LETTER+']|$)','gi');
function _lexMatchCase(src,out){
  if(src===src.toUpperCase()&&src!==src.toLowerCase())return out.toUpperCase();
  if(src.charAt(0)===src.charAt(0).toUpperCase())return out.charAt(0).toUpperCase()+out.slice(1);
  return out;
}
function _fixLexGender(str){
  const pre=s=>s.replace(_GENDER_PRE_RE,(m,p,w,sp)=>p+_lexMatchCase(w,_GENDER_PRE[w.toLowerCase()]||w)+sp);
  // duas passadas: cobre cadeias como "seu primeiro contrato" -> "sua primeira tarefa"
  let out=pre(pre(str));
  out=out.replace(_GENDER_POS_RE,(m,p,noun,sp,w)=>p+noun+sp+_lexMatchCase(w,_GENDER_POS[w.toLowerCase()]||w));
  return out;
}
function lexifyString(str){
  return _fixLexGender(str.replace(_LEXICON_RE,m=>_LEXICON_MAP[m]??m));
}
const _lexCache=new WeakMap(); // textNode -> string original (cyberpunk)
let _lexObserver=null, _lexQueued=false;
function applyLexicon(){
  const simple=uiMode==='simple';
  document.body.classList.toggle('simple-ui',simple);
  const skip=new Set(['SCRIPT','STYLE','TEXTAREA','INPUT','SELECT','NOSCRIPT','CODE']);
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{
    acceptNode(n){
      if(!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const p=n.parentElement;
      if(!p || skip.has(p.tagName)) return NodeFilter.FILTER_REJECT;
      if(p.closest('#login-screen,[data-no-lex]')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes=[];let cur;
  while((cur=walker.nextNode()))nodes.push(cur);
  nodes.forEach(n=>{
    let orig=_lexCache.get(n);
    if(orig===undefined){orig=n.nodeValue;_lexCache.set(n,orig);}
    const target=simple?lexifyString(orig):orig;
    if(n.nodeValue!==target)n.nodeValue=target;
  });
}
// Reaplica o glossario quando o DOM muda (renders dinamicos) — so no modo simples.
function scheduleLexicon(){
  if(uiMode!=='simple'||_lexQueued)return;
  _lexQueued=true;
  requestAnimationFrame(()=>{_lexQueued=false;applyLexicon();});
}
function initLexiconObserver(){
  if(_lexObserver)return;
  _lexObserver=new MutationObserver(()=>scheduleLexicon());
  // Observa apenas insercao/remocao de nos (childList). Alterar nodeValue nao
  // dispara childList, evitando loop infinito.
  _lexObserver.observe(document.body,{childList:true,subtree:true});
}
function loadUiMode(){
  const saved=localStorage.getItem(uiModeKey())||localStorage.getItem('nc_ui_mode_anon')||'cyber';
  uiMode=saved==='simple'?'simple':'cyber';
  initLexiconObserver();
  applyLexicon();
  const sel=document.getElementById('uimode-select');
  if(sel)sel.value=uiMode;
}
function setUiMode(mode){
  uiMode=mode==='simple'?'simple':'cyber';
  localStorage.setItem(uiModeKey(),uiMode);
  if(!me)localStorage.setItem('nc_ui_mode_anon',uiMode);
  if(me && !RO()){myData.profile={...(myData.profile||{}),uiMode};scheduleAutoSave();}
  initLexiconObserver();
  applyLexicon();
  const sel=document.getElementById('uimode-select');
  if(sel)sel.value=uiMode;
  showCyberToast(uiMode==='simple'?'MODO SIMPLES ATIVO':'MODO CYBERPUNK ATIVO',
    uiMode==='simple'?'Vocabulario comum: tarefas, areas, progresso.':'Vocabulario tematico: contratos, distritos, street cred.',4200);
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
  const _prevFocus=document.activeElement;
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
      _prevFocus?.focus();
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
  setFriendButtonText(me?'AMIGO':'CARREGANDO...');
}

function setupHomeSideMenu(){
  const layout=document.querySelector('#page-home .home-layout');
  const drawer=document.getElementById('home-drawer-body');
  if(!layout || !drawer || drawer.dataset.ready)return;
  const cards=[...layout.children].filter(el=>el.classList && el.classList.contains('card'));
  const modules=[
    {idx:2,key:'notificacoes',name:'Central de notificacoes',color:'var(--c)'},
    {idx:7,key:'loja',name:'Loja // Black Market',color:'var(--y)'}
  ];
  const store=document.createElement('div');
  store.id='home-module-store';
  store.hidden=true;
  document.body.appendChild(store);
  const screen=document.createElement('div');
  screen.id='home-module-screen';
  screen.className='home-module-screen';
  screen.innerHTML='<div class="home-module-frame"><div class="home-module-head"><div><div class="home-module-kicker">// SIDE DECK MODULE //</div><div class="home-module-title" id="home-module-title">MODULO</div></div><button class="home-module-close" data-action="callNamed" data-fn="closeHomeModule">FECHAR</button></div><div class="home-module-body" id="home-module-body"></div></div>';
  document.body.appendChild(screen);
  modules.forEach((m,n)=>{
    const card=cards[m.idx];
    if(!card)return;
    card.dataset.homeModule=m.key;
    card.dataset.homeModuleName=m.name;
    store.appendChild(card);
  });
  const pageBtn=(code,label,page,color='var(--c)')=>
    `<button class="home-module-tab shell-nav" style="--tab:${color}" data-action="goPage" data-page="${page}"><span>${code}</span><b>${label}</b></button>`;
  const moduleBtn=(code,label,key,color='var(--y)')=>
    `<button class="home-module-tab shell-nav" style="--tab:${color}" data-action="callNamed" data-fn="openHomeModule" data-arg0="${key}"><span>${code}</span><b>${label}</b></button>`;
  const actionBtn=(code,label,fn,color='var(--p)')=>
    `<button class="home-module-tab shell-nav" style="--tab:${color}" data-action="callNamed" data-fn="${fn}"><span>${code}</span><b>${label}</b></button>`;
  const districtBtn=(d,i)=>{
    const page=d?.page || '';
    const color=iconColorFor(d);
    const attrs=navAttrsFor(d,page);
    if(!attrs)return '';
    const label=htmlEscape(d?.name || PAGE_LABELS[page] || 'Distrito');
    return `<button class="home-module-tab shell-nav operator-shortcut" style="--tab:${color}" ${attrs}><span>${String(i+1).padStart(2,'0')}</span><b>${label}</b></button>`;
  };
  const operatorShortcuts=()=>getDistricts().map(districtBtn).filter(Boolean).join('') || '<div class="home-drawer-empty">Seus atalhos aparecem aqui. Adicione abas em Navbar / Icones.</div>';
  const _GROUP_ICONS={'Início':'//','Meus Atalhos':'>_','Progresso':'◈','Biblioteca':'≡','Logs':'◉','Mais Páginas':'▸','Sistema':'⚙'};
  const group=(label,items,open=false,badgeKey='')=>{
    const icon=_GROUP_ICONS[label]||'';
    return `<details class="home-drawer-group" data-group-key="${htmlEscape(label)}" ${open?'open':''}>`+
      `<summary><span>${icon?`<b class="group-icon">${icon}</b>`:''}${label}${badgeKey?`<em class="drawer-badge" id="badge-${badgeKey}"></em>`:''}</span>`+
      `<button class="group-reorder-btn" type="button" data-action="moveGroupUp" aria-label="Mover para cima" tabindex="-1">▲</button>`+
      `<button class="group-reorder-btn" type="button" data-action="moveGroupDown" aria-label="Mover para baixo" tabindex="-1">▼</button>`+
      `</summary><div class="home-drawer-group-body"><div class="home-drawer-group-inner">${items}</div></div></details>`;
  };
  const extras=EXTRA_PAGE_DEFS.map((def,i)=>
    `<div class="drawer-page-row" style="--tab:${def.color}">
      ${pageBtn(String(i+1).padStart(2,'0'),def.label,def.page,def.color)}
      <button class="drawer-add-nav" type="button" title="Adicionar ${htmlEscape(def.label)} na navbar" data-action="callNamed" data-fn="addDistrictFromTemplate" data-arg0="${htmlEscape(def.page)}">+</button>
    </div>`
  ).join('');
  drawer.innerHTML=
    `<div class="drawer-search-wrap"><input type="text" class="drawer-search" id="drawer-search" placeholder="FILTRAR..." aria-label="Filtrar módulos" autocomplete="off" spellcheck="false" data-input="filterDrawer"><button class="drawer-search-clear" id="drawer-search-clear" type="button" data-action="clearDrawerSearch" aria-label="Limpar filtro" hidden>✕</button></div>`+
    group('Início',
      pageBtn('→','Modo Hoje','home','var(--y)')+
      actionBtn('＋','Novo Contrato','openShellContracts','var(--y)'),
      true
    )+
    group('Meus Atalhos',
      actionBtn('NAV','Navbar / Icones','openNavbarEditor','var(--p)')+
      `<div class="home-drawer-shortcuts" id="home-drawer-shortcuts">${operatorShortcuts()}</div>`,
      false,'atalhos'
    )+
    group('Progresso',
      pageBtn('🔔','Lembretes','notificacoes','var(--c)'),
      false,'progresso'
    )+
    group('Biblioteca',
      pageBtn('📚','Leitura','leitura','#97C459')+
      pageBtn('💻','Projetos','dev','#378ADD')+
      pageBtn('🎮','Jogos','jogos','#fcee09')+
      pageBtn('📓','Reflexões','reflexoes','#b44fff'),
      false,'biblioteca'
    )+
    group('Logs',
      pageBtn('⌨','Dev / Logs','dev','#378ADD')+
      pageBtn('🎸','Violão / Logs','violao','#e00f3a'),
      false,'criacao'
    )+
    group('Mais Páginas',extras,false,'extras')+
    group('Sistema',
      moduleBtn('💾','Backup','notificacoes','var(--c)')+
      actionBtn('💬','Commlink','openShellCommlink','var(--c)')+
      actionBtn('👤','Perfil','openShellProfile','var(--p)')+
      actionBtn('NAV','Navbar / Icones','openNavbarEditor','var(--p)')+
      actionBtn('⚙','Configurações','openSettingsModule','var(--p)'),
      false
    );
  drawer.dataset.ready='1';
  _restoreGroupOrder(drawer);
  const _drawerSaved=JSON.parse(localStorage.getItem('_drawerGroups')||'{}');
  drawer.querySelectorAll('.home-drawer-group').forEach(det=>{
    const key=det.dataset.groupKey;
    if(!key)return;
    if(key in _drawerSaved)det.open=_drawerSaved[key];
    det.addEventListener('toggle',()=>{
      const st=JSON.parse(localStorage.getItem('_drawerGroups')||'{}');
      st[key]=det.open;
      localStorage.setItem('_drawerGroups',JSON.stringify(st));
    },{passive:true});
    // Smooth open/close animation using scrollHeight
    det.addEventListener('click',e=>{
      const summ=e.target.closest('summary');
      if(!summ||e.target.classList.contains('group-reorder-btn'))return;
      e.preventDefault();
      const gb=det.querySelector('.home-drawer-group-body');
      if(!gb)return;
      if(det.open){
        gb.style.height=gb.scrollHeight+'px';
        gb.offsetHeight;
        gb.style.height='0';
        const done=()=>{gb.style.height='';det.removeAttribute('open');};
        gb.addEventListener('transitionend',done,{once:true});
        setTimeout(done,280);
      } else {
        det.setAttribute('open','');
        const h=gb.scrollHeight;
        gb.style.height='0';
        gb.offsetHeight;
        gb.style.height=h+'px';
        const done=()=>{gb.style.height='';};
        gb.addEventListener('transitionend',done,{once:true});
        setTimeout(done,280);
      }
    });
  });
  initDrawerSwipe();
  renderHomeQuickbar();
}

function renderHomeDrawerShortcuts(){
  const host=document.getElementById('home-drawer-shortcuts');
  if(!host)return;
  host.innerHTML=getDistricts().map((d,i)=>{
    const page=d?.page || '';
    const color=iconColorFor(d);
    const attrs=navAttrsFor(d,page);
    if(!attrs)return '';
    const label=htmlEscape(d?.name || PAGE_LABELS[page] || 'Distrito');
    return `<button class="home-module-tab shell-nav operator-shortcut" style="--tab:${color}" ${attrs}><span>${String(i+1).padStart(2,'0')}</span><b>${label}</b></button>`;
  }).filter(Boolean).join('') || '<div class="home-drawer-empty">Seus atalhos aparecem aqui. Adicione abas em Navbar / Icones.</div>';
  renderShellActiveState();
}

function refreshDrawerBadges(){
  const snap=todayTaskSnapshot();
  const taskText=snap.total>0?`${snap.done.length}/${snap.total}`:'';
  const reading=(myData.books||[]).filter(b=>b.status==='reading').length;
  const projects=(myData.projects||[]).filter(p=>p.status==='active').length;
  const shortcuts=getDistricts().length;
  const extrasCount=EXTRA_PAGE_DEFS.length;
  const badges={progresso:taskText,biblioteca:reading||'',criacao:projects||'',atalhos:shortcuts||'',extras:extrasCount||''};
  Object.entries(badges).forEach(([k,v])=>{
    const el=document.getElementById(`badge-${k}`);
    if(el)el.textContent=String(v);
  });
}
function moveGroupUp(det){
  if(!det)return;
  let prev=det.previousElementSibling;
  while(prev&&!prev.classList.contains('home-drawer-group'))prev=prev.previousElementSibling;
  if(!prev)return;
  det.parentNode.insertBefore(det,prev);
  _saveGroupOrder();
}
function moveGroupDown(det){
  if(!det)return;
  let next=det.nextElementSibling;
  while(next&&!next.classList.contains('home-drawer-group'))next=next.nextElementSibling;
  if(!next)return;
  det.parentNode.insertBefore(next,det);
  _saveGroupOrder();
}
function _saveGroupOrder(){
  const body=document.getElementById('home-drawer-body');
  if(!body)return;
  const order=[...body.querySelectorAll('.home-drawer-group')].map(g=>g.dataset.groupKey).filter(Boolean);
  localStorage.setItem('_drawerOrder',JSON.stringify(order));
}
function _restoreGroupOrder(body){
  const order=JSON.parse(localStorage.getItem('_drawerOrder')||'[]');
  if(!order.length)return;
  const groups=[...body.querySelectorAll('.home-drawer-group')];
  order.forEach(key=>{
    const g=groups.find(g=>g.dataset.groupKey===key);
    if(g)body.appendChild(g);
  });
}
function filterDrawer(q){
  q=(q||'').trim().toLowerCase();
  const clear=document.getElementById('drawer-search-clear');
  if(clear)clear.hidden=!q;
  document.querySelectorAll('#home-drawer-body .home-drawer-group').forEach(grp=>{
    if(!q){grp.hidden=false;grp.querySelectorAll('.home-module-tab').forEach(t=>t.hidden=false);return;}
    const tabs=grp.querySelectorAll('.home-module-tab');
    let visible=0;
    tabs.forEach(tab=>{
      const match=tab.textContent.toLowerCase().includes(q);
      tab.hidden=!match;
      if(match)visible++;
    });
    grp.hidden=visible===0;
    if(visible>0&&!grp.open)grp.open=true;
  });
}
function clearDrawerSearch(){
  const input=document.getElementById('drawer-search');
  if(input){input.value='';input.focus();}
  filterDrawer('');
}
function openActiveGroup(){
  const body=document.getElementById('home-drawer-body');
  if(!body)return;
  const active=body.querySelector('.home-module-tab.active');
  if(!active)return;
  const g=active.closest('.home-drawer-group');
  if(g&&!g.open)g.open=true;
}
function initDrawerSwipe(){
  const drawer=document.getElementById('home-drawer');
  if(!drawer||drawer.dataset.swipe)return;
  drawer.dataset.swipe='1';
  let _sx=0,_sy=0,_active=false;
  drawer.addEventListener('touchstart',e=>{_sx=e.touches[0].clientX;_sy=e.touches[0].clientY;_active=true;},{passive:true});
  drawer.addEventListener('touchend',e=>{
    if(!_active)return;_active=false;
    const dx=e.changedTouches[0].clientX-_sx;
    const dy=Math.abs(e.changedTouches[0].clientY-_sy);
    if(dx<-70&&dy<80)toggleHomeMenu(false);
  },{passive:true});
  drawer.addEventListener('touchcancel',()=>{_active=false;},{passive:true});
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
    const tmRank=document.getElementById('tm-rank-current');
    if(tmRank)tmRank.textContent=prog.rank;
  }
  const eddiesText=typeof hasInfiniteEddies==='function'&&hasInfiniteEddies()?'€$∞':'€$'+(D().eddies||0);
  const e=document.getElementById('home-eddies');
  if(e)e.textContent=eddiesText;
  const es=document.getElementById('home-eddies-status');
  if(es)es.textContent=eddiesText;
  const te=document.getElementById('tm-eddies-current');
  if(te)te.textContent=eddiesText;
}

function _blockBodyScroll(e){
  const drawer=document.getElementById('home-drawer');
  if(drawer&&drawer.contains(e.target))return;
  e.preventDefault();
}
function toggleHomeMenu(open){
  if(open){
    document.addEventListener('touchmove',_blockBodyScroll,{passive:false});
    document.documentElement.classList.add('home-menu-open');
    renderShellActiveState();refreshDrawerBadges();openActiveGroup();
  } else {
    document.removeEventListener('touchmove',_blockBodyScroll);
    document.documentElement.classList.remove('home-menu-open');
    document.body.classList.remove('home-menu-open');
    filterDrawer('');
    const si=document.getElementById('drawer-search');
    if(si)si.value='';
    return;
  }
  document.body.classList.add('home-menu-open');
}

function renderShellActiveState(){
  const active=(document.querySelector('.page.active')?.id || 'page-home').replace('page-','');
  document.querySelectorAll('#home-drawer-body .home-module-tab').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.page===active);
  });
}

function openShellContracts(){
  toggleHomeMenu(false);
  goPage('home');
  setTodayMode(true,false);
  setTimeout(()=>document.querySelector('[data-action="openContractModal"]')?.focus?.(),80);
}

function openShellCommlink(){
  toggleHomeMenu(false);
  toggleFriend();
}

function openShellProfile(){
  toggleHomeMenu(false);
  openOwnProfilePanel();
}

function openNavbarEditor(){
  const screen=document.getElementById('home-module-screen');
  const body=document.getElementById('home-module-body');
  const title=document.getElementById('home-module-title');
  if(!screen || !body)return;
  closeHomeModule(false);
  body.dataset.generated='navbarEditor';
  body.innerHTML=`
    <div class="card nc-card p navbar-editor-card" style="--ca:var(--p)">
      <div class="ct p">NAVBAR / ICONES</div>
      <div class="module-section-head" style="--page-color:var(--p)">
        <div><span>ABAS DA NAVBAR</span></div>
        <strong id="districts-head-status">0 abas</strong>
        <button type="button" data-action="addDistrictItem">+ NOVA</button>
      </div>
      <div id="district-list"></div>
      <div id="district-edit-form" style="display:block;margin-top:10px;border-top:1px solid var(--border);padding-top:10px">
        <div class="edit-section-label">EDITAR ICONES DA NAVBAR</div>
        <div id="district-edit-list"></div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-y" data-action="addDistrictItem" style="font-size:9px;padding:5px 10px">+ NOVO</button>
          <button class="btn" data-action="callNamed" data-fn="closeHomeModule" style="font-size:9px;padding:5px 10px;color:var(--muted);border-color:var(--border)">FECHAR</button>
        </div>
      </div>
    </div>`;
  if(title)title.textContent='Navbar / Icones';
  toggleHomeMenu(false);
  document.body.classList.add('home-module-open');
  screen.classList.add('on');
  renderDistrictEditList();
  renderDistricts();
  enhanceClickableControls();
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
          <span>VOCABULARIO</span>
          <select id="uimode-select" data-change="setUiMode">
            <option value="cyber">Cyberpunk (contratos, distritos)</option>
            <option value="simple">Simples (tarefas, areas)</option>
          </select>
        </label>
        <label>
          <span>MOVIMENTO DO HUD</span>
          <select id="motion-select" data-change="setMotionMode">
            <option value="high">Alta</option>
            <option value="low">Baixa</option>
            <option value="off">Desligada</option>
          </select>
        </label>
        <label>
          <span>SOM / FEEDBACK</span>
          <select id="sound-select" data-change="setSoundPref">
            <option value="on">Ligado</option>
            <option value="off">Mudo</option>
          </select>
        </label>
      </div>
      <div class="settings-backup">
        <span>BACKUP DE DADOS</span>
        <div class="settings-backup-actions">
          <button type="button" class="btn btn-c" data-action="callNamed" data-fn="downloadBackup">EXPORTAR JSON</button>
          <button type="button" class="btn" data-action="callNamed" data-fn="triggerImportBackup">IMPORTAR JSON</button>
        </div>
      </div>
      <div class="settings-grid">
        ${settingsButton('homeTasks','Contratos do dia','Editar tarefas marcaveis da Home','var(--y)')}
        ${settingsButton('homeGoals','Intel e metas','Editar metas globais e fallbacks','var(--r)')}
        ${settingsButton('districts','Navbar e icones','Editar abas, icones, cores e links','var(--p)')}
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
  const uiSel=document.getElementById('uimode-select');
  if(uiSel)uiSel.value=uiMode;
  enhanceClickableControls();
}

function setSoundPref(mode){
  myData.prefs={...(myData.prefs||{}),sound:mode!=='off',haptics:mode!=='off'};
  if(mode!=='off')fxBlip('tick');
  scheduleAutoSave();
}

function settingsButton(action,title,desc,color){
  return `<button class="settings-tile" style="--set:${color}" data-action="callNamed" data-fn="runSettingsAction" data-arg0="${action}"><span>${htmlEscape(title)}</span><b>${htmlEscape(desc)}</b></button>`;
}

function runSettingsAction(action){
  closeHomeModule();
  const later=fn=>setTimeout(fn,80);
  if(action==='homeTasks'){goPage('home');later(toggleEditTasks);return;}
  if(action==='homeGoals'){goPage('home');later(toggleEditGoals);return;}
  if(action==='districts'){later(openNavbarEditor);return;}
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

async function persistMigratedData(username){
  try{
    await dbSetMany(username,['schemaVersion','tasks','prefs','reminders','dailyReviews','quests'].map(k=>[k,myData[k]??null]));
    localStorage.setItem(lastSaveKey(),new Date().toISOString());
  }catch(e){
    console.warn('Falha ao salvar migracao de schema:',e);
    try{storePendingLocalSave(e);}catch(_){}
  }
}

async function unlockApp(username,data){
  me=username;
  const rawData=data||{};
  const migrated=typeof migrateData==='function' ? migrateData(rawData) : rawData;
  const changed=typeof migrationChanged==='function' ? migrationChanged(rawData,migrated) : JSON.stringify(rawData)!==JSON.stringify(migrated);
  myData=migrated;
  if(changed)await persistMigratedData(username);
  if(myData.profile?.name) setRuntimeProfile(me,{name:myData.profile.name,avatar:myData.profile.avatar,role:myData.profile.status});
  document.body.classList.remove('auth-checking');
  clearFriendUi();
  loadTheme();
  loadMotionMode();
  if(myData.profile?.uiMode && !localStorage.getItem(uiModeKey()))localStorage.setItem(uiModeKey(),myData.profile.uiMode);
  loadUiMode();
  loadReminders();
  document.getElementById('login-screen').style.display='none';
  document.getElementById('nav-user').textContent=userDisplayLabel(me);
  const mu=document.getElementById('mob-user');if(mu)mu.textContent=userDisplayLabel(me);
  const ds=document.getElementById('drawer-user-sub');if(ds)ds.textContent=userDisplayLabel(me);
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
  row.innerHTML=Object.entries(QUICK_ROUTINE_TEMPLATES).map(([id,t])=>`<button type="button" data-template="${id}" class="${active===id?'active':''}" data-action="callNamed" data-fn="applyQuickTemplate" data-arg0="${id}">${htmlEscape(t.label)}</button>`).join('');
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
    <span>COM BASE NAS SUAS RESPOSTAS, SUA ROTINA INICIAL SERA:</span>
    <b>${htmlEscape(cfg.objective)}</b>
    <ul class="preview-list">${cfg.tasks.slice(0,6).map(t=>`<li>${htmlEscape(t.text)}${t.reminder?` <small>· ${htmlEscape(t.reminder)}</small>`:''}</li>`).join('')}</ul>
    <div class="preview-note">${cfg.districts.length} ${cfg.districts.length===1?'area':'areas'} ativadas · ${cfg.tasks.length} ${cfg.tasks.length===1?'tarefa':'tarefas'} · 1 revisao noturna</div>`;
  return cfg;
}

// Escolhe o vocabulario no onboarding (Cyberpunk x Simples).
function pickSetupMode(mode){
  document.getElementById('setup-mode-cyber')?.classList.toggle('active',mode==='cyber');
  document.getElementById('setup-mode-simple')?.classList.toggle('active',mode==='simple');
  setUiMode(mode);
}

// "Editar antes": aplica a base no formulario e leva o usuario aos campos editaveis.
function editBeforeActivate(){
  applyAutoRoutineToSetup();
  const auto=document.getElementById('setup-autopilot');
  if(auto)auto.checked=false;
  auto?.closest('.setup-toggle')?.classList.remove('on');
  document.querySelector('.setup-grid')?.scrollIntoView({behavior:'smooth',block:'start'});
  showCyberToast('EDITE A BASE','Ajuste objetivo, contratos e lembretes. Depois clique em ATIVAR ROTINA.',5000);
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

/* ============================================================
   ONBOARDING: checklist de primeiros passos na Home.
   Visivel ate o usuario cumprir as etapas (ou dispensar no X).
   Estado em myData.prefs.onboardingDone — prefs ja esta em SAVE_KEYS
   e e normalizado em modules/migrations.js, sem chave nova.
   ============================================================ */
function onboardingStepsState(){
  const d=D();
  return [
    {label:'Criar sua conta',done:true},
    {label:'Configurar o sistema',done:!!d.profile?.setupDone,action:'openSetupWizard',cta:'CONFIGURAR'},
    {label:'Criar seu primeiro contrato',done:allTaskDefs(d).filter(t=>!t.archivedAt).length>0,action:'openContractModal',cta:'+ CRIAR'},
    {label:'Concluir um contrato',done:tasksCompletedTotal(d)>=1},
    {label:'Fechar o dia com uma revisao',done:Object.keys(d.dailyReviews||{}).length>0,action:'openDailyReview',cta:'REVISAR'}
  ];
}
function renderOnboardingChecklist(){
  const el=document.getElementById('onboarding-checklist');
  if(!el)return;
  if(!me || RO()){el.innerHTML='';return;}
  const prefs=myData.prefs||{};
  if(prefs.onboardingDone){if(el.innerHTML)el.innerHTML='';return;}
  const steps=onboardingStepsState();
  const doneCount=steps.filter(s=>s.done).length;
  // Tudo feito (ou usuario claramente veterano): gradua e nao mostra mais.
  if(doneCount===steps.length || tasksCompletedTotal(D())>=15){
    myData.prefs={...prefs,onboardingDone:true};
    el.innerHTML='';
    scheduleAutoSave();
    return;
  }
  el.innerHTML=`<div class="onboarding-card">
    <div class="onboarding-head">
      <span>// PRIMEIROS PASSOS ${doneCount}/${steps.length} //</span>
      <button type="button" class="onboarding-skip" data-action="dismissOnboarding" title="Ocultar este guia" aria-label="Ocultar guia de primeiros passos">✕</button>
    </div>
    ${steps.map(s=>`<div class="onboarding-step ${s.done?'done':''}">
      <span class="onboarding-check">${s.done?'✓':'○'}</span>
      <b>${s.label}</b>
      ${!s.done&&s.action?`<button type="button" class="onboarding-go" data-action="${s.action}">${s.cta||'ABRIR'}</button>`:''}
    </div>`).join('')}
  </div>`;
}
function dismissOnboarding(){
  if(!me || RO())return;
  myData.prefs={...(myData.prefs||{}),onboardingDone:true};
  renderOnboardingChecklist();
  scheduleAutoSave();
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
  document.getElementById('setup-mode-cyber')?.classList.toggle('active',uiMode!=='simple');
  document.getElementById('setup-mode-simple')?.classList.toggle('active',uiMode==='simple');
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
  showCyberToast('PRIMEIRA MISSAO PRONTA','Setup salvo. O Modo Hoje agora mostra o proximo passo.');
  spotlightFirstTask();
}

function dailyReviewData(date=dk()){
  return (D().dailyReviews||{})[date] || {};
}

function yesterdayDateKey(){
  const y=new Date();
  y.setDate(y.getDate()-1);
  return localDateKey(y);
}

function tomorrowDateKey(){
  const t=new Date();
  t.setDate(t.getDate()+1);
  return localDateKey(t);
}

function getTomorrowCarryMission(){
  const sourceDate=yesterdayDateKey();
  const review=(D().dailyReviews||{})[sourceDate];
  const savedMission=review?.tomorrowMission || null;
  const savedText=String(savedMission?.text||'').trim();
  const legacyText=String(review?.tomorrow||'').trim();
  const text=savedText || legacyText;
  if(!text)return null;
  if(savedMission?.targetDate && savedMission.targetDate!==dk())return null;
  if(savedMission?.consumed)return null;
  const prefs=D().prefs||{};
  if(prefs.ignoredCarryMissions?.[sourceDate]===dk())return null;
  if(prefs.completedCarryMissions?.[sourceDate]===dk())return null;
  if(prefs.convertedCarryMissions?.[sourceDate])return null;
  const defs=allTaskDefs(D());
  if(defs.some(t=>t?.carryFrom===sourceDate || String(t?.text||'').trim().toLowerCase()===text.toLowerCase()))return null;
  return {sourceDate,targetDate:savedMission?.targetDate || dk(),text,tag:review.focus || 'Plano de ontem'};
}

function carryMissionStatusMeta(carry){
  const prefs=D().prefs||{};
  const sourceDate=carry?.sourceDate;
  if(!sourceDate)return {key:'pending',label:'PENDENTE',text:'Plano de ontem pronto para virar acao hoje.'};
  if(prefs.completedCarryMissions?.[sourceDate]===dk())return {key:'completed',label:'CONCLUIDA',text:'Missao herdada encerrada hoje.'};
  if(prefs.convertedCarryMissions?.[sourceDate])return {key:'converted',label:'CONVERTIDA',text:'Missao transformada em contrato do dia.'};
  if(prefs.ignoredCarryMissions?.[sourceDate]===dk())return {key:'ignored',label:'IGNORADA',text:'Missao ocultada apenas no painel de hoje.'};
  if(prefs.startedCarryMissions?.[sourceDate]===dk())return {key:'started',label:'FOCO INICIADO',text:'Foco aberto. Conclua a sessao para registrar a execucao.'};
  return {key:'pending',label:'PENDENTE',text:'Plano de ontem pronto para virar acao hoje.'};
}

function markTomorrowCarryConsumed(sourceDate,reason){
  if(!sourceDate)return;
  myData.dailyReviews=myData.dailyReviews||{};
  const review=myData.dailyReviews[sourceDate];
  if(review?.tomorrowMission){
    review.tomorrowMission={...review.tomorrowMission,consumed:true,consumedAt:new Date().toISOString(),consumedReason:reason||'used'};
  }
}

function ignoreTomorrowCarryMission(){
  if(RO())return;
  const carry=getTomorrowCarryMission();
  if(!carry)return;
  markTomorrowCarryConsumed(carry.sourceDate,'ignored');
  myData.prefs={...(myData.prefs||{})};
  myData.prefs.ignoredCarryMissions={...(myData.prefs.ignoredCarryMissions||{}),[carry.sourceDate]:dk()};
  renderTodayMode();
  scheduleAutoSave();
  showCyberToast('MISSAO IGNORADA','Ela nao volta hoje. A revisao original fica preservada.',4800);
}

function convertTomorrowCarryMission(){
  if(RO())return;
  const carry=getTomorrowCarryMission();
  if(!carry)return;
  syncTodayTasksFromDom();
  const defs=ensureEditableTaskDefs();
  if(defs.some(t=>t?.carryFrom===carry.sourceDate || String(t?.text||'').trim().toLowerCase()===carry.text.toLowerCase())){
    markTomorrowCarryConsumed(carry.sourceDate,'converted');
    myData.prefs={...(myData.prefs||{})};
    myData.prefs.convertedCarryMissions={...(myData.prefs.convertedCarryMissions||{}),[carry.sourceDate]:dk()};
    renderTodayMode();
    scheduleAutoSave();
    showCyberToast('CONTRATO JA EXISTE','Sem duplicar: a missao herdada ja esta no painel de hoje.',5200);
    return;
  }
  defs.push({
    id:Date.now(),
    text:carry.text,
    tag:carry.tag,
    category:'Rotina',
    frequency:'Hoje',
    onlyDate:dk(),
    carryFrom:carry.sourceDate,
    createdFrom:'dailyReview.tomorrow',
    updatedAt:new Date().toISOString()
  });
  markTomorrowCarryConsumed(carry.sourceDate,'converted');
  myData.prefs={...(myData.prefs||{})};
  myData.prefs.convertedCarryMissions={...(myData.prefs.convertedCarryMissions||{}),[carry.sourceDate]:dk()};
  addActivity('carry',{title:'Plano convertido em contrato',status:'converted',note:carry.text});
  renderTasks();
  syncTodayHabitsFromTasks();
  updateStats();
  renderTodayMode();
  scheduleAutoSave();
  showCyberToast('CONTRATO CRIADO','Missao herdada virou contrato de hoje.',5200);
}

function openCarryMissionFocus(){
  if(RO())return;
  const carry=getTomorrowCarryMission();
  if(!carry)return;
  myData.prefs={...(myData.prefs||{})};
  myData.prefs.startedCarryMissions={...(myData.prefs.startedCarryMissions||{}),[carry.sourceDate]:dk()};
  addActivity('carry',{title:'Foco iniciado na missao herdada',status:'started',note:carry.text});
  renderTodayMode();
  scheduleAutoSave();
  showCyberToast('FOCO INICIADO','Status atualizado. Finalize para concluir a missao herdada.',4600);
  openMissionFocus({text:carry.text,tag:carry.tag,carryDate:carry.sourceDate});
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

function todayReviewDone(){
  const review=(D().dailyReviews||{})[dk()];
  return !!(review && (review.updatedAt || review.note || review.tomorrow || review.focus));
}

function todayGuideMeta(total,done,carry){
  if(carry)return {tone:'carry',text:'Comece pela missao herdada ou converta em contrato.'};
  if(!total)return {tone:'empty',text:'Sem contratos hoje. Crie uma missao pequena para abrir o dia.'};
  if(done>=total && !todayReviewDone())return {tone:'review',text:'Tudo feito. Faca a revisao diaria para fechar o ciclo.'};
  if(done>=total)return {tone:'done',text:'Tudo feito. Continue amanhã.'};
  return {tone:'focus',text:'Comece um foco na missao principal de hoje.'};
}

function renderTodayGuide(total,done,carry){
  const guide=document.getElementById('tm-guide');
  if(!guide)return;
  const meta=todayGuideMeta(total,done,carry);
  guide.className='tm-guide '+meta.tone;
  guide.innerHTML='<b>'+htmlEscape(meta.text)+'</b>';
}

function currentWeekDates(){
  const now=new Date();
  const start=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const day=start.getDay()===0?6:start.getDay()-1;
  start.setDate(start.getDate()-day);
  return Array.from({length:7},(_,i)=>{
    const date=new Date(start);
    date.setDate(start.getDate()+i);
    return date;
  });
}

function weeklyProgressData(){
  const dates=currentWeekDates();
  const keys=dates.map(date=>localDateKey(date));
  const keySet=new Set(keys);
  let contractsDone=0,contractsTotal=0;
  dates.forEach(date=>{
    const dayKey=localDateKey(date);
    const tasks=activeTasksToday(date);
    const saved=(D().tasks||{})[dayKey]||{};
    tasks.forEach((_,i)=>{
      contractsTotal++;
      if(saved[i])contractsDone++;
    });
  });
  const history=Array.isArray(D().activityHistory)?D().activityHistory:[];
  const focusRows=history.filter(row=>row&&row.kind==='focus'&&keySet.has(row.date));
  const focusDone=focusRows.filter(row=>row.status==='completed').length;
  const focusMinutes=focusRows.reduce((sum,row)=>sum+(Number(row.duration)||0),0);
  const reviews=keys.filter(key=>(D().dailyReviews||{})[key]?.updatedAt).length;
  const books=Array.isArray(D().books)?D().books:[];
  const reading=books.filter(book=>book&&book.status==='reading').length;
  const booksDone=books.filter(book=>book&&book.status==='done').length;
  const pct=contractsTotal?Math.round((contractsDone/contractsTotal)*100):0;
  let summary='Complete uma missao hoje para ligar a semana.';
  if(contractsDone>0)summary='Semana ativa. Cada contrato fechado sustenta o ritmo.';
  if(focusDone>0)summary='Foco registrado. Seu avanco semanal ja saiu do zero.';
  if(reviews>=3)summary='Revisoes mantidas. O sistema esta aprendendo seu ritmo.';
  if(contractsTotal&&contractsDone>=contractsTotal)summary='Semana limpa ate aqui. Proteja o ritmo ate domingo.';
  const next=contractsDone
    ?'Feche a semana com mais uma sessao de foco.'
    :'Uma missao por dia ja mantem o sistema vivo.';
  return {contractsDone,contractsTotal,pct,focusDone,focusMinutes,reviews,reading,booksDone,summary,next};
}

function renderWeeklyProgressCard(){
  const el=document.getElementById('tm-weekly-progress');
  if(!el)return;
  const week=weeklyProgressData();
  const totalLabel=week.contractsTotal?week.contractsDone+'/'+week.contractsTotal:'0/0';
  el.innerHTML=
    '<div class="tm-week-head">'+
      '<b>RESUMO DA SEMANA</b>'+
      '<strong>'+week.pct+'%</strong>'+
    '</div>'+
    '<div class="tm-week-bar"><i style="width:'+week.pct+'%"></i></div>'+
    '<div class="tm-week-grid">'+
      '<div class="tm-week-kpi"><span>CONTRATOS</span><b>'+totalLabel+'</b></div>'+
      '<div class="tm-week-kpi"><span>FOCOS</span><b>'+week.focusDone+'</b></div>'+
      '<div class="tm-week-kpi"><span>MINUTOS</span><b>'+week.focusMinutes+'</b></div>'+
      '<div class="tm-week-kpi"><span>REVISOES</span><b>'+week.reviews+'</b></div>'+
      '<div class="tm-week-kpi"><span>LEITURA</span><b>'+week.reading+'/'+week.booksDone+'</b></div>'+
    '</div>';
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
    title.textContent='Configurar painel';
    sub.textContent='Criar rotina inicial?';
    return;
  }
  title.textContent=review.updatedAt?'Dia revisado':(auto?'AUTOPILOT '+pct+'%':'ROTINA '+pct+'%');
  // Yesterday comparison (12)
  const yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);
  const yKey=localDateKey(yesterday);
  const ySaved=(D().tasks||{})[yKey]||{};
  const yDefs=allTaskDefs(D()).filter(t=>!t.archivedAt&&taskActiveOn(t,yesterday));
  const yDone=yDefs.filter((_,i)=>ySaved[i]).length;
  const yPct=yDefs.length?Math.round(yDone/yDefs.length*100):0;
  const baseText=review.updatedAt
    ? (review.tomorrow ? 'Missao de amanha: '+review.tomorrow : 'Revisão salva. Defina o foco de amanhã.')
    : (snap.pending[0] ? (auto?'Proximo passo: ':'Proximo contrato: ')+snap.pending[0] : 'Todos feitos. Registre o dia.');
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
    el.innerHTML=`<span>RECUPERAÇÃO</span> Melhor corrente: ${peak} dias. Marque 1 contrato para reacender.`;
    return;
  }
  if(!y.total){el.className='yesterday-nudge';el.innerHTML='';return;}
  if(y.done>=y.total){
    el.className='yesterday-nudge on good';
    el.innerHTML=`<span>ONTEM</span> ${y.done}/${y.total} // dia limpo.`;
  }else{
    el.className='yesterday-nudge on';
    el.innerHTML=`<span>ONTEM</span> ${y.done}/${y.total} // ${y.total-y.done} pendente${y.total-y.done!==1?'s':''}.`;
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

function openWeeklyReview(){
  if(RO())return;
  const modal=document.getElementById('weekly-review-modal');
  if(!modal)return;
  const key=wk();
  const existing=myData.weeklyReviews?.[key]||{};
  document.getElementById('wr-worked').value=existing.worked||'';
  document.getElementById('wr-stop').value=existing.stop||'';
  document.getElementById('wr-focus').value=existing.focus||'';
  const habits=getHabits();
  const data=habitDataWithLiveWeek();
  const weekPct=habitPercentForWeeks(data,habits,[key]);
  const metricsEl=document.getElementById('wr-metrics');
  if(metricsEl) metricsEl.textContent=`Semana ${key}: ${weekPct}% de consistencia nos habitos`;
  modal.classList.add('on');
}

function saveWeeklyReview(){
  if(RO())return;
  const key=wk();
  if(!myData.weeklyReviews) myData.weeklyReviews={};
  myData.weeklyReviews[key]={
    worked:document.getElementById('wr-worked')?.value.trim()||'',
    stop:document.getElementById('wr-stop')?.value.trim()||'',
    focus:document.getElementById('wr-focus')?.value.trim()||'',
    date:dk()
  };
  document.getElementById('weekly-review-modal')?.classList.remove('on');
  showCyberToast('DEBRIEF SEMANAL SALVO','Reflexao registrada no sistema.',3500);
  scheduleAutoSave();
}

function closeWeeklyReview(){
  document.getElementById('weekly-review-modal')?.classList.remove('on');
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
  const today=dk();
  const tomorrowText=document.getElementById('daily-tomorrow')?.value.trim() || '';
  const targetDate=tomorrowDateKey();
  const previousReview=(myData.dailyReviews||{})[today] || {};
  const previousMission=previousReview.tomorrowMission || {};
  const tomorrowMission=tomorrowText ? {
    ...(previousMission || {}),
    text:tomorrowText,
    targetDate,
    createdAt:previousMission?.createdAt || new Date().toISOString(),
    updatedAt:new Date().toISOString(),
    source:'daily-review',
    consumed:previousMission?.text===tomorrowText && previousMission?.targetDate===targetDate ? !!previousMission?.consumed : false
  } : null;
  myData.dailyReviews=myData.dailyReviews||{};
  myData.dailyReviews[today]={
    ...previousReview,
    date:today,
    energy:document.getElementById('daily-energy')?.value || 'Media',
    focus:document.getElementById('daily-focus')?.value.trim() || '',
    note:document.getElementById('daily-note')?.value.trim() || '',
    tomorrow:tomorrowText,
    tomorrowMission,
    done:snap.done,
    pending:snap.pending,
    updatedAt:new Date().toISOString()
  };
  addActivity('review',{title:'Fechamento',duration:0,difficulty:myData.dailyReviews[today].energy,note:myData.dailyReviews[today].note});
  const er=awardEddies(10,'review');
  checkAchievements();
  closeDailyReview();
  renderDailyPanel();
  rollLootDrop();
  updateStats();
  updateEddiesDisplay();
  scheduleAutoSave();
  const pct=snap.total?Math.round(snap.done.length/snap.total*100):0;
  const tomorrowMsg=tomorrowText?'missao de amanha armada':'sem missao de amanha';
  showCyberToast('PROGRESSO REGISTRADO',`REVISAO SALVA // ${snap.done.length}/${snap.total} contratos // ${pct}% concluido // ${tomorrowMsg}`+(er?' // +EUR$'+er:''),7200);
}

// App lifecycle
window.addEventListener('DOMContentLoaded', async ()=>{
  bindUiEvents();
  renderAppVersion();
  window.addEventListener('online', flushOfflineQueue);
  window.addEventListener('offline', ()=>{ const si=document.getElementById('save-indicator'); if(si){si.textContent='OFFLINE';si.classList.add('offline');} });
  document.body.classList.add('mobile-boot');
  setTimeout(()=>document.body.classList.remove('mobile-boot'),900);
  setupHomeSideMenu();
  ensureExtraPages();
  applyTheme(localStorage.getItem('nc_theme_v1_anon')||'arasaka');
  loadMotionMode();
  loadUiMode();
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
    saveSession(saved); // garante persistencia mesmo apos OAuth redirect
    const st=document.getElementById('login-status');
    if(st) st.textContent='// RECONECTANDO... //';
    try{
      const data=await dbGet(saved);
      await unlockApp(saved,data);
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
  document.getElementById('login-status').textContent='// LOGIN //';
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
  document.getElementById('login-status').textContent=authFormMode==='reset'?'// DEFINA SUA NOVA SENHA //':authFormMode==='create'?'// CRIE SUA CONTA PESSOAL //':'// LOGIN //';
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
  if(hint)hint.textContent=reset?'Digite e confirme sua nova senha para concluir a recuperacao.':create?'Cadastre nome, email e senha. Limite inicial: '+ACCOUNT_LIMIT+' contas neste dispositivo.':'Email e senha para entrar.';
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
  if(st)st.textContent=reset?'// DEFINA SUA NOVA SENHA //':create?'// CRIE SUA CONTA PESSOAL //':'// LOGIN //';
  updateSignupRateLimitUi();
  setTimeout(()=>{
    const target=reset?document.getElementById('pwd-input'):create?document.getElementById('account-name-input'):document.getElementById('auth-email-input');
    if(target)target.focus();
  },60);
}

function isSignupRateLimitError(error){
  if(typeof isAuthEmailRateLimitError==='function' && isAuthEmailRateLimitError(error))return true;
  const msg=String(error?.message || error || '').toLowerCase();
  return Number(error?.status)===429 || msg.includes('email rate limit exceeded') || msg.includes('email rate limit') || msg.includes('rate limit');
}

function signupRateLimitRemainingSeconds(){
  return Math.max(0,Math.ceil((signupRateLimitUntil-Date.now())/1000));
}

function updateSignupRateLimitUi(){
  const btn=document.getElementById('login-btn');
  const actions=document.getElementById('signup-rate-limit-actions');
  const remaining=signupRateLimitRemainingSeconds();
  const active=authFormMode==='create' && remaining>0;
  if(actions)actions.classList.toggle('hidden',!active);
  if(!btn)return;
  if(active){
    btn.disabled=true;
    btn.textContent='AGUARDE '+remaining+'S';
  }else{
    btn.disabled=false;
    btn.textContent=authFormMode==='reset'?'ATUALIZAR SENHA':authFormMode==='create'?'CRIAR CONTA':'ENTRAR';
  }
}

function startSignupRateLimitCooldown(){
  signupRateLimitUntil=Date.now()+60000;
  const actions=document.getElementById('signup-rate-limit-actions');
  if(actions)actions.classList.remove('hidden');
  if(signupRateLimitTimer)clearInterval(signupRateLimitTimer);
  updateSignupRateLimitUi();
  signupRateLimitTimer=setInterval(()=>{
    updateSignupRateLimitUi();
    if(signupRateLimitRemainingSeconds()<=0){
      clearInterval(signupRateLimitTimer);
      signupRateLimitTimer=null;
      updateSignupRateLimitUi();
    }
  },1000);
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
  btn.disabled=true; st.textContent='// AUTH... //';
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
    await unlockApp(username,data);
  }catch(e){
    st.textContent='// ERRO: '+e.message+' //';
    btn.disabled=false;
  }
}

async function doCreateAccount(){
  const btn=document.getElementById('login-btn'),st=document.getElementById('login-status');
  if(signupRateLimitRemainingSeconds()>0){
    updateSignupRateLimitUi();
    st.textContent='// LIMITE DE ENVIO DE EMAIL ATINGIDO. AGUARDE ALGUMAS HORAS OU ENTRE COM GOOGLE. //';
    return;
  }
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
      await unlockApp(username,data);
      return;
    }
    setLoginMode('login');
    st.textContent='// VERIFIQUE SEU EMAIL PARA ATIVAR A CONTA //';
  }catch(e){
    if(isSignupRateLimitError(e)){
      startSignupRateLimitCooldown();
      st.textContent='// LIMITE DE ENVIO DE EMAIL ATINGIDO. AGUARDE ALGUMAS HORAS OU ENTRE COM GOOGLE. //';
    }else{
      st.textContent='// '+(e.message||'ERRO AO CRIAR CONTA')+' //';
    }
  }finally{
    if(signupRateLimitRemainingSeconds()>0)updateSignupRateLimitUi();
    else btn.disabled=false;
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
      await unlockApp(username,data);
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
  st.textContent='// GOOGLE... //';
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
  const _ns=document.getElementById('nav-sync');
  if(_ns){_ns.textContent=themeCopy('save');_ns.className='nav-sync';}
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
  if(btn){btn.textContent=themeCopy('saving');btn.className='nav-sync saving';}
  try{
    collectState();
    await dbSetMany(me,SAVE_KEYS.map(k=>[k,myData[k]??null]));
    await publishFriendSharedSections();
    clearPendingLocalSave();
    localStorage.setItem(lastSaveKey(),new Date().toISOString());
    _lastSaveTs=Date.now();updateSaveIndicator();
    renderSystemStatus();
    if(btn){btn.textContent='SALVO ✓';btn.className='nav-sync saved';
    setTimeout(()=>{btn.textContent=themeCopy('save');btn.className='nav-sync';},2500);}
  }catch(e){
    console.error('saveAll falhou:',e);
    // guarda copia local para reenvio automatico ao reconectar
    try{storePendingLocalSave(e);}catch(_){}
    if(btn){btn.textContent='ERRO ✕';btn.className='nav-sync error';
    setTimeout(()=>{btn.textContent=themeCopy('save');btn.className='nav-sync';},3000);}
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
    ['backup-import-preview',cancelBackupImport],
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

const D=()=>viewFriend?friendData:myData;
const RO=()=>viewFriend;

function collectState(){
  syncTodayTasksFromDom();
  syncTodayHabitsFromTasks(false);
  // save custom defs
  if(myData.taskDefs) myData.taskDefs=myData.taskDefs;
}


/* Gamificacao: retencao, eddies, loot, loja, wrapped e season movido para modules/gamification.js */

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
  renderOnboardingChecklist();
  if(localStorage.getItem('nc_compact'))document.body.classList.add('compact-tasks');
  renderTodayMode();
  if(!_todayModeInit){_todayModeInit=true;setTodayMode(true,false);}
  enhanceClickableControls();
  if(uiMode==='simple')applyLexicon();
  if(!RO()){updatePeakStreak();checkShieldMilestones();checkWeeklyFreeShield();checkLoginBonus();checkSeasonTiers();maybeAutoWrapped();checkAchievements();generateWeeklyChallenge();renderContextualChallenge();}
}

function generateWeeklyChallenge(){
  if(RO()) return null;
  const key=wk();
  if(myData.weeklyChallenges?.[key]?.generated) return myData.weeklyChallenges[key];
  const habits=getHabits();
  const data=habitDataWithLiveWeek();
  const lastWeekKeys=recentWeekKeys(2);
  const lastWeekKey=lastWeekKeys[0];
  const lastWeekPct=habitPercentForWeeks(data,habits,[lastWeekKey]);
  const rows=habits.map(h=>({name:h,pct:habitPercentForWeeks(data,[h],[lastWeekKey])}));
  const worst=rows.sort((a,b)=>a.pct-b.pct)[0];
  const tagStreakEntries=Object.entries(myData.tagStreaks||{}).sort((a,b)=>b[1].current-a[1].current);
  const topTag=tagStreakEntries[0];
  let challenge;
  if(worst && worst.pct<50){
    challenge={text:'Completar '+worst.name+' por 5 dias esta semana',tag:'habito',target:5,reward:20,generated:'habit_low'};
  } else if(topTag && topTag[1].current>=3){
    challenge={text:'Manter streak de '+topTag[0]+' por mais 7 dias',tag:topTag[0],target:7,reward:25,generated:'tag_streak'};
  } else if(lastWeekPct>=80){
    challenge={text:'Fechar todos os dias com 100% de habitos por 3 dias seguidos',tag:'perfeicao',target:3,reward:30,generated:'perfect_days'};
  } else {
    const taskCount=allTaskDefs(D()).filter(t=>!t.archivedAt).length;
    challenge={text:'Completar todos os '+taskCount+' contratos por 4 dias esta semana',tag:'contratos',target:4,reward:15,generated:'task_completion'};
  }
  challenge.week=key;
  challenge.completed=false;
  if(!myData.weeklyChallenges) myData.weeklyChallenges={};
  if(!myData.weeklyChallenges[key]?.generated){
    myData.weeklyChallenges[key]=challenge;
    scheduleAutoSave();
  }
  return challenge;
}

function renderContextualChallenge(){
  const el=document.getElementById('contextual-challenge');
  if(!el)return;
  const key=wk();
  const challenge=myData.weeklyChallenges?.[key]?.generated?myData.weeklyChallenges[key]:null;
  if(!challenge){el.innerHTML='';return;}
  const accepted=!!challenge.accepted;
  el.className='weekly-challenge'+(accepted?' done':'');
  el.innerHTML=`<div class="dq-tag wc-tag">DESAFIO CONTEXTUAL</div><div class="dq-text">${htmlEscape(challenge.text)}</div><span class="dq-tag" style="margin-left:auto">+€$${challenge.reward}</span>${RO()?'':`<button type="button" class="dq-btn" data-action="acceptContextualChallenge">${accepted?'ACEITO ✓':'ACEITAR DESAFIO'}</button>`}`;
}

function acceptContextualChallenge(){
  if(RO())return;
  const key=wk();
  if(!myData.weeklyChallenges?.[key]?.generated)return;
  myData.weeklyChallenges[key].accepted=true;
  renderContextualChallenge();
  showCyberToast('DESAFIO ACEITO','Compromisso registrado. Complete para ganhar €$'+myData.weeklyChallenges[key].reward+'.',4000);
  scheduleAutoSave();
}

/* ============================================================
   MODO HOJE: painel principal do dia.
   Mantem a missao no topo e a lista real de contratos no card inferior.
   ============================================================ */
function setTodayMode(on,persist=true){
  const card=document.getElementById('today-mode-card');
  if(!card)return;
  document.body.classList.toggle('today-mode',on);
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
  const shopReward=grantShopMissionReward(allTaskDefs(D())[task.taskIndex]);
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
  sub='PROGRESSO SEMANAL // '+sub;
  const _el=el;
  showActionToast('PROGRESSO REGISTRADO',sub,'DESFAZER',()=>{
    if(_el){_el.classList.remove('done');applyTodayModeTaskLimit();syncTodayTasksFromDom();syncTodayHabitsFromTasks();updateStats();scheduleAutoSave();}
  },5000);
}

function currentMissionForFocus(){
  const pending=todayPendingFull();
  if(!pending.length)return null;
  return pending[_missionOffset%pending.length] || pending[0];
}

// Abre o foco direto a partir de um contrato especifico (botao inline na lista).
function openTaskFocus(taskIndex){
  if(RO())return;
  const idx=parseInt(taskIndex,10);
  const pending=todayPendingFull();
  const pos=pending.findIndex(p=>p.taskIndex===idx);
  if(pos<0){
    showCyberToast('CONTRATO JA CONCLUIDO','Este contrato nao esta pendente.',3200);
    return;
  }
  _missionOffset=pos;
  openMissionFocus(pending[pos]);
}

function focusElapsedSeconds(){
  if(!_focusSession)return 0;
  const running=_focusSession.pausedAt?0:Math.max(0,Date.now()-(_focusSession.lastStartedAt||Date.now()));
  return Math.floor(((_focusSession.elapsedMs||0)+running)/1000);
}

function focusRemainingSeconds(){
  if(!_focusSession)return 0;
  return Math.max(0,Math.ceil((_focusSession.durationMs-focusElapsedSeconds()*1000)/1000));
}

function formatFocusTime(seconds){
  seconds=Math.max(0,Number(seconds)||0);
  const m=String(Math.floor(seconds/60)).padStart(2,'0');
  const s=String(seconds%60).padStart(2,'0');
  return m+':'+s;
}

function clampFocusMinutes(value){
  if(String(value ?? '').trim()==='')return 25;
  const raw=Number(value);
  const n=Number.isFinite(raw) ? Math.round(raw) : 25;
  return Math.max(1,Math.min(180,n));
}

function preferredFocusMinutes(){
  return clampFocusMinutes(myData?.prefs?.focusMinutes || 25);
}

function renderFocusDurationControls(minutes=null){
  const current=clampFocusMinutes(minutes ?? (_focusSession ? Math.round(_focusSession.durationMs/60000) : preferredFocusMinutes()));
  const label=document.getElementById('focus-duration-label');
  const custom=document.getElementById('focus-custom-minutes');
  if(label)label.textContent=current+' MIN';
  if(custom && document.activeElement!==custom)custom.value=String(current);
  document.querySelectorAll('.mission-focus-options button').forEach(btn=>{
    btn.classList.toggle('active',Number(btn.dataset.minutes)===current);
  });
}

function renderMissionFocus(){
  const panel=document.getElementById('mission-focus');
  if(!panel || !_focusSession)return;
  const mission=_focusSession.mission || {};
  const name=document.getElementById('focus-mission-name');
  const tag=document.getElementById('focus-mission-tag');
  const timer=document.getElementById('focus-timer');
  const status=document.getElementById('focus-status');
  const pause=document.getElementById('focus-pause-btn');
  if(name)name.textContent=mission.text || 'MISSAO ATUAL';
  if(tag)tag.textContent=mission.tag || 'SEM TAG';
  if(timer)timer.textContent=formatFocusTime(focusRemainingSeconds());
  if(status){
    if(_focusSession.pomodoroMode){
      status.textContent=_focusSession.inBreak?'Pausa. Respire.':'Ciclo '+((_focusSession.cycleCount||0)+1)+' em andamento.';
    }else{
      status.textContent=_focusSession.completed?'Missao concluida.'
        : _focusSession.rewarded?'Timer concluído. Bônus liberado.'
        : _focusSession.pausedAt?'Pausado.'
        : 'Foco ativo.';
    }
  }
  if(pause)pause.textContent=_focusSession.pausedAt?'CONTINUAR':'PAUSAR';
  const pomBtn=document.getElementById('focus-pomodoro-btn');
  if(pomBtn) pomBtn.textContent=_focusSession.pomodoroMode?(_focusSession.inBreak?'EM PAUSA':'POMODORO ON'):'POMODORO OFF';
  renderFocusDurationControls(Math.round(_focusSession.durationMs/60000));
}

function persistFocusSession(status){
  if(!_focusSession || _focusSession.logged)return;
  const elapsed=Math.max(0,Math.round(focusElapsedSeconds()/60));
  addActivity('focus',{
    title:_focusSession.mission?.text || 'Missao em foco',
    status,
    duration:elapsed,
    difficulty:'Foco',
    note:(_focusSession.mission?.tag || 'Sem tag')+' // timer '+Math.round(_focusSession.durationMs/60000)+' min'+(_focusSession.rewarded?' // bonus timer':'')
  });
  _focusSession.logged=true;
  renderEvolutionHistory();
  scheduleAutoSave();
}

function stopMissionFocusTimer(){
  if(_focusTimer){
    clearInterval(_focusTimer);
    _focusTimer=null;
  }
}

function tickMissionFocus(){
  if(!_focusSession || _focusSession.pausedAt)return;
  if(focusRemainingSeconds()<=0){
    if(_focusSession.pomodoroMode && !_focusSession.inBreak){
      _focusSession.cycleCount=(_focusSession.cycleCount||0)+1;
      _focusSession.inBreak=true;
      _focusSession.lastStartedAt=Date.now();
      _focusSession.durationMs=5*60*1000;
      _focusSession.elapsedMs=0;
      _focusSession.rewarded=false;
      fxBlip('win');
      const ep=awardEddies(2,'pomodoro_cycle');
      updateEddiesDisplay();
      showCyberToast('CICLO '+_focusSession.cycleCount+' CONCLUIDO','Pausa. Respire.'+(ep?' // +€$'+ep:''),4000);
    } else if(_focusSession.pomodoroMode && _focusSession.inBreak){
      _focusSession.inBreak=false;
      _focusSession.lastStartedAt=Date.now();
      _focusSession.durationMs=25*60*1000;
      _focusSession.elapsedMs=0;
      _focusSession.rewarded=false;
      fxBlip('tick');
      showCyberToast('PAUSA ENCERRADA','Ciclo '+((_focusSession.cycleCount||0)+1)+' iniciado.',3000);
    } else {
      if(!_focusSession.rewarded){
        _focusSession.rewarded=true;
        const boost=myData.prefs?.focusBoost?.date===dk()&&myData.prefs.focusBoost.active;
        const bonus=awardEddies(boost?4:2,'focus_timer');
        if(boost)myData.prefs.focusBoost.active=false;
        updateEddiesDisplay();
        fxBlip('win');
        if(motionMode!=='off')celebrate('day');
        const missionName=_focusSession.mission?.text || 'a missão';
        showActionToast('TIMER CONCLUÍDO','Marcar "'+missionName+'" como feita?'+(boost?' // BOOST':'')+(bonus?' // +€$'+bonus:''),'CONCLUIR',()=>completeMissionFromFocus(),9000);
        scheduleAutoSave();
      }
      stopMissionFocusTimer();
    }
  }
  renderMissionFocus();
}

function togglePomodoroMode(){
  if(!_focusSession) return;
  _focusSession.pomodoroMode=!_focusSession.pomodoroMode;
  _focusSession.cycleCount=0;
  _focusSession.inBreak=false;
  _focusSession.durationMs=_focusSession.pomodoroMode?25*60*1000:(_focusSession.durationMs||25*60*1000);
  _focusSession.elapsedMs=0;
  _focusSession.lastStartedAt=Date.now();
  _focusSession.rewarded=false;
  if(!_focusTimer)_focusTimer=setInterval(tickMissionFocus,1000);
  renderMissionFocus();
}

function openMissionFocus(overrideMission=null){
  if(RO())return;
  const mission=overrideMission || currentMissionForFocus();
  if(!mission){
    showCyberToast('SEM MISSAO PENDENTE','Crie ou reabra um contrato antes de iniciar o foco.',4200);
    return;
  }
  stopMissionFocusTimer();
  const focusMinutes=preferredFocusMinutes();
  _focusSession={
    id:Date.now(),
    mission,
    durationMs:focusMinutes*60000,
    elapsedMs:0,
    lastStartedAt:Date.now(),
    pausedAt:null,
    rewarded:false,
    completed:false,
    logged:false,
    pomodoroMode:false,
    cycleCount:0,
    inBreak:false
  };
  const panel=document.getElementById('mission-focus');
  if(panel){
    panel.classList.add('on');
    panel.setAttribute('aria-hidden','false');
  }
  _focusTimer=setInterval(tickMissionFocus,1000);
  renderMissionFocus();
  addActivity('focus',{title:mission.text,status:'started',duration:0,difficulty:'Foco',note:mission.tag||''});
  scheduleAutoSave();
  fxBlip('tick');
}

function setMissionFocusDuration(minutes){
  const min=clampFocusMinutes(minutes);
  myData.prefs={...(myData.prefs||{}),focusMinutes:min};
  if(_focusSession){
    _focusSession.durationMs=min*60000;
    _focusSession.elapsedMs=0;
    _focusSession.lastStartedAt=Date.now();
    _focusSession.pausedAt=null;
    _focusSession.rewarded=false;
    if(!_focusTimer)_focusTimer=setInterval(tickMissionFocus,1000);
    renderMissionFocus();
  }else{
    renderFocusDurationControls(min);
  }
  scheduleAutoSave();
}

function previewMissionFocusDuration(value){
  renderFocusDurationControls(clampFocusMinutes(value));
}

function setMissionFocusDurationInput(value){
  setMissionFocusDuration(value);
}

function toggleMissionFocusPause(){
  if(!_focusSession)return;
  if(_focusSession.pausedAt){
    _focusSession.lastStartedAt=Date.now();
    _focusSession.pausedAt=null;
    if(!_focusTimer)_focusTimer=setInterval(tickMissionFocus,1000);
  }else{
    _focusSession.elapsedMs=(focusElapsedSeconds()*1000);
    _focusSession.pausedAt=Date.now();
    stopMissionFocusTimer();
  }
  renderMissionFocus();
}

function closeMissionFocus(){
  if(_focusSession && !_focusSession.completed)persistFocusSession('exited');
  stopMissionFocusTimer();
  _focusSession=null;
  const panel=document.getElementById('mission-focus');
  if(panel){
    panel.classList.remove('on');
    panel.setAttribute('aria-hidden','true');
  }
}

function completeMissionFromFocus(){
  if(!_focusSession)return;
  _focusSession.completed=true;
  persistFocusSession('completed');
  if(_focusSession.mission?.carryDate){
    myData.prefs={...(myData.prefs||{})};
    markTomorrowCarryConsumed(_focusSession.mission.carryDate,'completed');
    myData.prefs.completedCarryMissions={...(myData.prefs.completedCarryMissions||{}),[_focusSession.mission.carryDate]:dk()};
    const bonus=awardEddies(3,'carry_focus');
    updateEddiesDisplay();
    showCyberToast('RITMO MANTIDO','Missao herdada concluida // +1 avanco na semana'+(bonus?' // +EUR$'+bonus:''),5600);
    renderTodayMode();
    scheduleAutoSave();
  }else{
    completeMissionDirect();
  }
  closeMissionFocus();
}

function todayShortcutIdentity(item){
  return item.page ? 'page:'+item.page
    : item.module ? 'module:'+item.module
    : item.action ? 'action:'+item.action
    : item.url ? 'url:'+item.url
    : item.label;
}

function todayShortcutAttrs(item){
  if(item.attrs)return item.attrs;
  if(item.page)return `data-action="goPage" data-page="${htmlEscape(item.page)}"`;
  if(item.module)return `data-action="openHomeModule" data-module="${htmlEscape(item.module)}"`;
  if(item.action)return `data-action="${htmlEscape(item.action)}"`;
  if(item.fn)return `data-action="callNamed" data-fn="${htmlEscape(item.fn)}"`;
  if(item.url)return `data-action="openExternalUrl" data-url="${htmlEscape(item.url)}"`;
  return '';
}

function todayShortcutCandidates(){
  const out=[];
  const seen=new Set();
  const add=item=>{
    if(!item)return;
    const id=todayShortcutIdentity(item);
    const attrs=todayShortcutAttrs(item);
    if(!attrs || seen.has(id))return;
    seen.add(id);
    out.push({...item,attrs});
  };
  const custom=Array.isArray(D().districts) ? D().districts : [];
  custom.slice(0,4).forEach((d,i)=>{
    const page=d?.page || '';
    const attrs=navAttrsFor(d,page);
    if(!attrs)return;
    add({
      label:d?.name || PAGE_LABELS[page] || 'Distrito',
      sub:'Distrito ativo',
      code:String(i+1).padStart(2,'0'),
      color:iconColorFor(d),
      page:DISTRICT_PAGES.includes(page)?page:'',
      url:d?.url || '',
      attrs
    });
  });
  [
    {label:'Contratos',sub:'Missoes do dia',code:'NEW',fn:'openShellContracts',color:'var(--y)'},
    {label:'Revisao',sub:'Fechar o dia',code:'REV',action:'openDailyReview',color:'var(--y)'},
    {label:'Leitura',sub:'Biblioteca',code:'BK',page:'leitura',color:'#97C459'},
    {label:'Projetos',sub:'Dev / entregas',code:'PJ',page:'dev',color:'#378ADD'},
    {label:'Mercado',sub:'Black Market',code:'MK',module:'loja',color:'var(--y)'},
    {label:'Commlink',sub:'Canal social',code:'CM',action:'toggleFriend',color:'var(--c)'},
    {label:'Backup',sub:'Diagnostico',code:'SYS',module:'notificacoes',color:'var(--c)'}
  ].forEach(add);
  return out;
}

function renderTodayShortcuts(){
  const host=document.getElementById('tm-shortcuts');
  if(!host)return;
  const all=todayShortcutCandidates();
  const visible=all.length>6 ? all.slice(0,5) : all.slice(0,6);
  if(!visible.length){
    host.innerHTML='';
    return;
  }
  const more=all.length>visible.length
    ? '<button type="button" class="tm-shortcut tm-shortcut-more" data-action="toggleHomeMenu" data-open="true"><span>+</span><b>VER MAIS</b><em>Side Deck</em></button>'
    : '';
  host.innerHTML=
    '<div class="tm-shortcuts-head"><span>ATALHOS DO OPERADOR</span><b>areas rapidas</b></div>'+
    '<div class="tm-shortcuts-grid">'+
      visible.map(item=>
        `<button type="button" class="tm-shortcut" style="--shortcut:${htmlEscape(item.color || 'var(--c)')}" ${item.attrs}>`+
          `<span>${htmlEscape(item.code || 'NC')}</span><b>${htmlEscape(item.label)}</b><em>${htmlEscape(item.sub || 'Abrir area')}</em>`+
        '</button>'
      ).join('')+
      more+
    '</div>';
}

function renderTodayMode(){
  const card=document.getElementById('today-mode-card');
  if(!card)return;
  const snap=todayTaskSnapshot();
  const total=snap.total,done=snap.done.length,pct=total?Math.round(done/total*100):0;
  const pending=todayPendingFull();
  const carry=getTomorrowCarryMission();
  const nextEl=document.getElementById('tm-next');
  if(nextEl){
    if(carry){
      const carryStatus=carryMissionStatusMeta(carry);
      nextEl.className='tm-next carry';
      nextEl.innerHTML=
        '<div class="tm-mission-head"><div class="tm-next-label">ONTEM</div><span class="tm-carry-status '+htmlEscape(carryStatus.key)+'">'+htmlEscape(carryStatus.label)+'</span></div>'+
        '<div class="tm-mission-text">'+htmlEscape(carry.text)+'</div>'+
        '<div class="tm-mission-tag">'+htmlEscape(carry.tag)+'</div>'+
        '<div class="tm-carry-actions">'+
          '<button type="button" class="tm-btn tm-btn-start" data-action="openCarryMissionFocus">COMEÇAR FOCO</button>'+
          '<button type="button" class="tm-btn tm-btn-done" data-action="convertTomorrowCarryMission">CONVERTER EM CONTRATO</button>'+
          '<button type="button" class="tm-btn tm-btn-skip" data-action="ignoreTomorrowCarryMission">IGNORAR</button>'+
        '</div>';
    }else if(!total){
      nextEl.className='tm-next';
      nextEl.innerHTML='<div class="tm-next-label">SEM MISSÃO</div><div class="tm-empty-actions"><button type="button" class="tm-btn tm-btn-done" data-action="openContractModal">+ CONTRATO</button></div>';
    } else if(!pending.length){
      nextEl.className='tm-next done';
      nextEl.innerHTML='<div class="tm-next-label">DIA LIMPO ✓</div>';
    } else {
      const mIdx=_missionOffset%pending.length;
      const mission=pending[mIdx];
      const peak=(D().prefs||{}).peakStreak||0;
      const recovering=maxStreak()===0&&peak>=3;
      const recoverHtml=recovering
        ?'<div class="tm-recover">Nova sequência — dia 1.</div>'
        :'';
      const paginator=pending.length>1?'<span class="tm-paginator">'+(mIdx+1)+'/'+pending.length+'</span>':'';
      const missionActions='<div class="tm-mission-actions">'+
        '<button type="button" class="tm-btn tm-btn-done" data-action="callNamed" data-fn="completeMissionDirect">✓ Concluir</button>'+
        (pending.length>1?'<button type="button" class="tm-btn tm-btn-skip" data-action="callNamed" data-fn="snoozeMission">⏭ Adiar</button>':'')+
        '</div>';
      nextEl.className='tm-next active';
      nextEl.innerHTML=recoverHtml+
        '<div class="tm-mission-head"><div class="tm-next-label">MISSÃO '+paginator+'</div></div>'+
        '<div class="tm-mission-text">'+htmlEscape(mission.text)+'</div>'+
        (mission.tag?'<div class="tm-mission-tag">'+htmlEscape(mission.tag)+'</div>':'')+
        missionActions;
      const missionHead=nextEl.querySelector('.tm-mission-head');
      if(missionHead){
        const queue=pending.length>1?'<div class="tm-queue"><span>FILA</span><b>'+(mIdx+1)+'/'+pending.length+'</b></div>':'';
        missionHead.innerHTML='<div class="tm-next-label">PROXIMO PASSO</div>'+queue;
      }
      const recoverNode=nextEl.querySelector('.tm-recover');
      if(recoverNode)recoverNode.innerHTML='<span>NOVA SEQUENCIA</span><b>DIA 1</b>';
    }
  }
  renderTodayGuide(total,done,carry);
  const prog=document.getElementById('tm-progress');
  if(prog){
    const left=Math.max(0,total-done);
    const status=total?left+' restante'+(left!==1?'s':''):'aguardando';
    prog.innerHTML='<div class="tm-progress-head"><span>HOJE</span><b>'+pct+'%</b></div><div class="tm-bar"><div class="tm-bar-fill" style="width:'+pct+'%"></div></div>'+(total?'<div class="tm-count">'+done+'/'+total+'</div>':'');
  }
  renderWeeklyProgressCard();
  const rew=document.getElementById('tm-reward');
  if(rew){
    const streak=topStreakInfo().days;
    rew.innerHTML=streak>0?'<div class="tm-status-line">STREAK '+streak+'D</div>':'';
    rew.hidden=!streak;
  }
  const retention=document.getElementById('tm-retention');
  if(retention){
    const msg=!total?'Crie um contrato.':done>=total?'Continue amanhã.':'';
    retention.textContent=msg;
    retention.hidden=!msg;
  }
  renderTodayShortcuts();
  applyTodayModeTaskLimit();
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

function isUuidLike(value){
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value||''));
}

function friendProfileSource(id,data=null){
  const p=data?.profile || {};
  const cached=PROFILES[id] || {};
  return {
    name:String(p.name || cached.name || '').trim(),
    nick:String(p.nick || cached.nick || '').trim(),
    tag:String(p.tag || cached.tag || '').trim(),
    status:String(p.status || cached.role || '').trim()
  };
}

function resolveFriendDisplay(friend,data=null){
  const id=String(typeof friend==='string'?friend:(friend?.owner || friend?.id || '')).trim();
  const src=friendProfileSource(id,data || (typeof friend==='object'?friend:null));
  const handle=src.nick && src.tag ? `${src.nick}#${src.tag}` : src.nick;
  let name=src.name;
  if(!name || isUuidLike(name) || name===id)name=handle || '';
  const loading=!!id && !src.name && !handle;
  if(!name)name=loading ? 'Carregando operador...' : 'Sem amigo';
  const secondary=handle || (src.status && !isUuidLike(src.status) ? src.status : '') || (id ? shortPublicId(id) : '--');
  return {
    id,
    name:loading ? name : String(name).toUpperCase(),
    secondary,
    handle,
    status:src.status || 'OPERADOR',
    shortId:id ? shortPublicId(id) : '--',
    loading
  };
}

function friendLabel(id){
  return resolveFriendDisplay(id).name;
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

function defaultFriendPermissions(allowed=false){
  return FRIEND_PERMISSION_AREAS.reduce((acc,a)=>{acc[a.id]=!!allowed;return acc;},{});
}

function getFriendPermissions(data=myData){
  const hasSaved=!!data && Object.prototype.hasOwnProperty.call(data,'friendPermissions');
  return {...defaultFriendPermissions(hasSaved),...(data.friendPermissions||{})};
}

function areaAllowed(perms, area){
  return perms[String(area||'')] !== false;
}

function applyFriendVisibility(raw){
  const src=typeof migrateData==='function' ? migrateData(raw||{}) : (raw||{});
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

function profileEquippedItem(data,type){
  const eq=data?.equippedCosmetics||{};
  const id=eq[type];
  const items=window.SHOP_ITEMS||[];
  if(!id || !items.length)return null;
  return items.find(item=>item.type===type && item.id===id) || null;
}

function profileFrameKey(data){
  const frame=profileEquippedItem(data,'frame');
  return frame?.value || '';
}

const PROFILE_AVATAR_SVGS={
  netrunner:`<svg viewBox="0 0 64 64" class="profile-avatar-svg" aria-hidden="true" focusable="false"><defs><linearGradient id="pa-net" x1="10" y1="8" x2="54" y2="58"><stop stop-color="#89f7ff"/><stop offset=".55" stop-color="#00d4ff"/><stop offset="1" stop-color="#7c3cff"/></linearGradient></defs><path class="pa-bg" d="M14 8h36l8 8v32l-8 8H14l-8-8V16z"/><path class="pa-line" d="M20 21l5-8h14l5 8 5 3v16l-7 10H22l-7-10V24z"/><path class="pa-fill" d="M22 27h20l5 4v8l-5 5H22l-5-5v-8z"/><path class="pa-dark" d="M21 31h22v7H21z"/><path class="pa-glow" d="M24 34h6M34 34h7M14 24H7M50 24h7M32 13V6M21 50l-5 8M43 50l5 8"/><path class="pa-line thin" d="M26 20h12M28 45h8M13 33h5M46 33h5"/></svg>`,
  fixer:`<svg viewBox="0 0 64 64" class="profile-avatar-svg" aria-hidden="true" focusable="false"><defs><linearGradient id="pa-fix" x1="8" y1="10" x2="54" y2="56"><stop stop-color="#ffd23d"/><stop offset=".58" stop-color="#ff8a3d"/><stop offset="1" stop-color="#ff5a36"/></linearGradient></defs><path class="pa-bg" d="M11 14l8-8h26l8 8v35l-7 9H18l-7-9z"/><path class="pa-line" d="M20 22l6-8h12l6 8v13l-5 8H25l-5-8z"/><path class="pa-dark" d="M19 29h26v6H19z"/><path class="pa-fill" d="M23 40h18l4 11H19z"/><path class="pa-glow" d="M23 32h7M34 32h7M14 49h36M48 19h8v8h-8M8 22h8M28 13l-3-7M36 13l3-7"/><path class="pa-line thin" d="M26 45h12M28 50h8M50 21l4 4"/></svg>`,
  ghost:`<svg viewBox="0 0 64 64" class="profile-avatar-svg" aria-hidden="true" focusable="false"><defs><linearGradient id="pa-ghost" x1="11" y1="8" x2="54" y2="58"><stop stop-color="#d7d7df"/><stop offset=".52" stop-color="#7c8799"/><stop offset="1" stop-color="#00d4ff"/></linearGradient></defs><path class="pa-bg" d="M13 11h38l6 8-4 34-10 5H21l-10-5-4-34z"/><path class="pa-fill" d="M22 18h20l8 11-4 18-9 6H27l-9-6-4-18z"/><path class="pa-dark" d="M22 30h7l3 4 3-4h7l-4 12H26z"/><path class="pa-line" d="M22 18h20l8 11-4 18-9 6H27l-9-6-4-18zM18 46l-8 8M46 46l8 8"/><path class="pa-glow" d="M25 32h5M34 32h5M28 43h8M14 24H7M50 24h7M32 10V4"/><path class="pa-line thin" d="M21 25l8-4M43 25l-8-4"/></svg>`,
  legend:`<svg viewBox="0 0 64 64" class="profile-avatar-svg" aria-hidden="true" focusable="false"><defs><linearGradient id="pa-leg" x1="9" y1="5" x2="55" y2="60"><stop stop-color="#fff857"/><stop offset=".45" stop-color="#fcee09"/><stop offset="1" stop-color="#b44fff"/></linearGradient></defs><path class="pa-bg" d="M32 4l8 9 12-2-2 13 9 8-9 8 2 13-12-2-8 9-8-9-12 2 2-13-9-8 9-8-2-13 12 2z"/><path class="pa-fill" d="M23 24l5 5 4-12 4 12 5-5 3 17H20z"/><path class="pa-dark" d="M22 43h20v6H22z"/><path class="pa-line" d="M32 8l7 9 11-1-3 11 8 5-8 5 3 11-11-1-7 9-7-9-11 1 3-11-8-5 8-5-3-11 11 1z"/><path class="pa-glow" d="M32 16v-8M32 56v-8M16 32H8M56 32h-8M24 43h16M28 35h8"/><path class="pa-line thin" d="M23 24l5 5 4-12 4 12 5-5 3 17H20z"/></svg>`,
  'netrunner-hud':`<svg viewBox="0 0 64 64" class="profile-avatar-svg profile-avatar-imported" aria-hidden="true" focusable="false"><defs><clipPath id="pa-oct-netrunner-hud"><path d="M14 2h36l12 12v36L50 62H14L2 50V14z"></path></clipPath></defs><g clip-path="url(#pa-oct-netrunner-hud)"><rect width="64" height="64" fill="#0d0d1a"></rect><rect width="64" height="64" fill="#00d4ff" opacity=".06"></rect><g fill="#000" opacity=".18"><rect y="6" width="64" height="2"></rect><rect y="14" width="64" height="2"></rect><rect y="22" width="64" height="2"></rect><rect y="30" width="64" height="2"></rect><rect y="38" width="64" height="2"></rect><rect y="46" width="64" height="2"></rect><rect y="54" width="64" height="2"></rect></g><g stroke="#00d4ff" stroke-width="1" opacity=".22"><path d="M8 8v7M8 19v4M56 10v5M56 21v6M12 36v6M52 34v8"></path></g><path d="M20 20c0-8 5-12 12-12s12 4 12 12" fill="none" stroke="#00d4ff" stroke-width="2" stroke-linecap="square"></path><path d="M18 20h4v8h-4zM42 20h4v8h-4z" fill="#00d4ff" opacity=".25"></path><path d="M18 20h4v8h-4zM42 20h4v8h-4z" fill="none" stroke="#00d4ff" stroke-width="1.6"></path><path d="M46 20l5-6M51 14h3" stroke="#00d4ff" stroke-width="1.4" stroke-linecap="square"></path><path d="M23 16h18v14l-5 8h-8l-5-8z" fill="#00d4ff" opacity=".14"></path><path d="M23 16h18v14l-5 8h-8l-5-8z" fill="none" stroke="#00d4ff" stroke-width="2" stroke-linecap="square"></path><path d="M27 16v-3h10v3" fill="none" stroke="#00d4ff" stroke-width="1.2" opacity=".7"></path><path d="M32 13v3" stroke="#00d4ff" stroke-width="1" opacity=".6"></path><path d="M22 22h20v6H22z" fill="#00d4ff" opacity=".3"></path><path d="M22 22h20v6H22z" fill="none" stroke="#00d4ff" stroke-width="1.8"></path><path d="M25 25h5M33 25h3M38.5 25h1.5" stroke="#0d0d1a" stroke-width="1.6"></path><path d="M24 23.2h16" stroke="#0d0d1a" stroke-width=".8" opacity=".7"></path><path d="M28 32h8M29 35h6" stroke="#00d4ff" stroke-width="1.2" opacity=".75"></path><path d="M30.5 37.5h3" stroke="#00d4ff" stroke-width="1" opacity=".6"></path><path d="M26 38c-2 3-2 5-5 7M38 38c2 3 2 5 5 7" fill="none" stroke="#00d4ff" stroke-width="1.3" opacity=".8"></path><path d="M24 41c-1.5 2-2.5 3-5 4" fill="none" stroke="#00d4ff" stroke-width="1" opacity=".5"></path><path d="M12 58c2-9 9-13 20-13s18 4 20 13" fill="#00d4ff" opacity=".14"></path><path d="M12 58c2-9 9-13 20-13s18 4 20 13" fill="none" stroke="#00d4ff" stroke-width="2" stroke-linecap="square"></path><path d="M22 48l10 4 10-4" fill="none" stroke="#00d4ff" stroke-width="1.3" opacity=".8"></path><path d="M16 52h8M40 52h8" stroke="#00d4ff" stroke-width="1.1" opacity=".6"></path><path d="M29 50h6v6h-6z" fill="none" stroke="#00d4ff" stroke-width="1.4"></path><path d="M30.5 52h3M30.5 54h3" stroke="#00d4ff" stroke-width="1"></path><path d="M26 53h1.6M36.5 53h1.6" stroke="#00d4ff" stroke-width="1.6"></path></g><path d="M14 2h36l12 12v36L50 62H14L2 50V14z" fill="none" stroke="#00d4ff" stroke-width="2"></path><path d="M14 2h6M2 14v6M62 50v-6M50 62h-6" stroke="#00d4ff" stroke-width="3.5" opacity=".85"></path></svg>`,
  'samurai-mask':`<svg viewBox="0 0 64 64" class="profile-avatar-svg profile-avatar-imported" aria-hidden="true" focusable="false"><defs><clipPath id="pa-oct-samurai-mask"><path d="M14 2h36l12 12v36L50 62H14L2 50V14z"></path></clipPath></defs><g clip-path="url(#pa-oct-samurai-mask)"><rect width="64" height="64" fill="#0d0d1a"></rect><rect width="64" height="64" fill="#e00f3a" opacity=".06"></rect><g fill="#000" opacity=".18"><rect y="6" width="64" height="2"></rect><rect y="14" width="64" height="2"></rect><rect y="22" width="64" height="2"></rect><rect y="30" width="64" height="2"></rect><rect y="38" width="64" height="2"></rect><rect y="46" width="64" height="2"></rect><rect y="54" width="64" height="2"></rect></g><g stroke="#e00f3a" stroke-width="1" opacity=".18"><path d="M32 2v5M14 6l4 5M50 6l-4 5M6 18l6 3M58 18l-6 3"></path></g><path d="M32 3v8" stroke="#e00f3a" stroke-width="2" stroke-linecap="square"></path><path d="M23 7c2.5 3.5 5.5 5 9 5s6.5-1.5 9-5" fill="none" stroke="#e00f3a" stroke-width="2" stroke-linecap="square"></path><path d="M27 6c1.5 2 3 3 5 3s3.5-1 5-3" fill="none" stroke="#e00f3a" stroke-width="1" opacity=".6"></path><path d="M20 22c0-7.5 5.5-12 12-12s12 4.5 12 12v3H20z" fill="#e00f3a" opacity=".18"></path><path d="M20 22c0-7.5 5.5-12 12-12s12 4.5 12 12v3H20z" fill="none" stroke="#e00f3a" stroke-width="2" stroke-linecap="square"></path><path d="M32 10v15M26 12c-2 2.8-3 6-3 13M38 12c2 2.8 3 6 3 13M29 10.5c-1 3-1.5 8-1.5 14.5M35 10.5c1 3 1.5 8 1.5 14.5" stroke="#e00f3a" stroke-width=".9" opacity=".55"></path><path d="M24 20h.01M32 18h.01M40 20h.01" stroke="#e00f3a" stroke-width="2" stroke-linecap="round"></path><path d="M20 22l-7-4v9l7 2M44 22l7-4v9l-7 2" fill="#e00f3a" opacity=".16"></path><path d="M20 22l-7-4v9l7 2M44 22l7-4v9l-7 2" fill="none" stroke="#e00f3a" stroke-width="1.6" stroke-linecap="square"></path><path d="M15 21v6M49 21v6" stroke="#e00f3a" stroke-width=".9" opacity=".55"></path><path d="M19 25h26" stroke="#e00f3a" stroke-width="2.6"></path><path d="M21 27h22" stroke="#e00f3a" stroke-width="1" opacity=".5"></path><path d="M24 30l7 1.5M40 30l-7 1.5" stroke="#e00f3a" stroke-width="2.2"></path><path d="M23 33v4l5 6h8l5-6v-4" fill="#e00f3a" opacity=".12"></path><path d="M23 33v4l5 6h8l5-6v-4" fill="none" stroke="#e00f3a" stroke-width="1.8" stroke-linecap="square"></path><path d="M32 32v4" stroke="#e00f3a" stroke-width="1.2" opacity=".8"></path><path d="M27 37h10M28.5 40h7" stroke="#e00f3a" stroke-width="1.1" opacity=".75"></path><path d="M29 37v3M32 37v3.5M35 37v3" stroke="#e00f3a" stroke-width=".8" opacity=".6"></path><path d="M23 41l-4 5M41 41l4 5" stroke="#e00f3a" stroke-width="1.5" opacity=".85"></path><path d="M25 43l-3 4M39 43l3 4" stroke="#e00f3a" stroke-width="1" opacity=".55"></path><path d="M12 58c2-9 9-13 20-13s18 4 20 13" fill="#e00f3a" opacity=".14"></path><path d="M12 58c2-9 9-13 20-13s18 4 20 13" fill="none" stroke="#e00f3a" stroke-width="2" stroke-linecap="square"></path><path d="M13 51h11M40 51h11M14 54.5h9M41 54.5h9M15 58h8M41 58h8" stroke="#e00f3a" stroke-width="1.1" opacity=".6"></path><path d="M17 52.8h.01M21 52.8h.01M43 52.8h.01M47 52.8h.01" stroke="#e00f3a" stroke-width="1.8" stroke-linecap="round" opacity=".8"></path><path d="M45 45L59 31" stroke="#e00f3a" stroke-width="2" stroke-linecap="square"></path><path d="M47.5 47.5l-4-4" stroke="#e00f3a" stroke-width="1.6"></path><path d="M44.5 44l2-2" stroke="#e00f3a" stroke-width="2.6"></path><path d="M56 33l1.2 1.2M54 35l1.2 1.2" stroke="#e00f3a" stroke-width=".9" opacity=".7"></path><path d="M30 48h4v4h-4z" fill="#e00f3a"></path><path d="M30 52l-2 3M34 52l2 3" stroke="#e00f3a" stroke-width="1.1" opacity=".7"></path></g><path d="M14 2h36l12 12v36L50 62H14L2 50V14z" fill="none" stroke="#e00f3a" stroke-width="2"></path><path d="M14 2h6M2 14v6M62 50v-6M50 62h-6" stroke="#e00f3a" stroke-width="3.5" opacity=".85"></path></svg>`,
  'corpo-agent':`<svg viewBox="0 0 64 64" class="profile-avatar-svg profile-avatar-imported" aria-hidden="true" focusable="false"><defs><clipPath id="pa-oct-corpo-agent"><path d="M14 2h36l12 12v36L50 62H14L2 50V14z"></path></clipPath></defs><g clip-path="url(#pa-oct-corpo-agent)"><rect width="64" height="64" fill="#0d0d1a"></rect><rect width="64" height="64" fill="#fcee09" opacity=".05"></rect><g fill="#000" opacity=".18"><rect y="6" width="64" height="2"></rect><rect y="14" width="64" height="2"></rect><rect y="22" width="64" height="2"></rect><rect y="30" width="64" height="2"></rect><rect y="38" width="64" height="2"></rect><rect y="46" width="64" height="2"></rect><rect y="54" width="64" height="2"></rect></g><g stroke="#fcee09" stroke-width="1" opacity=".18"><path d="M7 28V14h6v14M51 28V12h6v16M10 17h.01M10 21h.01M54 15h.01M54 19h.01M54 23h.01"></path></g><path d="M23 10h18v7H23z" fill="#fcee09" opacity=".22"></path><path d="M23 17v-7h18v7" fill="none" stroke="#fcee09" stroke-width="2" stroke-linecap="square"></path><path d="M26 10v6M30 10v6M34 10v6M38 10v6" stroke="#fcee09" stroke-width=".9" opacity=".55"></path><path d="M23 12h18" stroke="#fcee09" stroke-width=".8" opacity=".4"></path><path d="M23 17h18v13l-5 7h-8l-5-7z" fill="#fcee09" opacity=".12"></path><path d="M23 17h18v13l-5 7h-8l-5-7z" fill="none" stroke="#fcee09" stroke-width="2" stroke-linecap="square"></path><path d="M26 24h5" stroke="#fcee09" stroke-width="2"></path><path d="M35 22h6v5h-6z" fill="none" stroke="#fcee09" stroke-width="1.6"></path><path d="M38 24.5h.01" stroke="#fcee09" stroke-width="2.4" stroke-linecap="round"></path><path d="M41 24.5h4M35 22l-2-2" stroke="#fcee09" stroke-width="1" opacity=".6"></path><path d="M24 28l3 2" stroke="#fcee09" stroke-width=".9" opacity=".5"></path><path d="M22 24h-2v4h2" fill="none" stroke="#fcee09" stroke-width="1.2" opacity=".7"></path><path d="M29 33h6" stroke="#fcee09" stroke-width="1.4"></path><path d="M29 36h4" stroke="#fcee09" stroke-width=".9" opacity=".5"></path><path d="M26 42l6 5 6-5" fill="none" stroke="#fcee09" stroke-width="1.6" stroke-linecap="square"></path><path d="M30 45h4l1.5 8-3.5 4-3.5-4z" fill="#fcee09" opacity=".85"></path><path d="M10 58c3-8 10-12 22-12s19 4 22 12" fill="#fcee09" opacity=".12"></path><path d="M10 58l4-8 9-4M54 58l-4-8-9-4" fill="none" stroke="#fcee09" stroke-width="2" stroke-linecap="square"></path><path d="M23 46l7 7-2 5M41 46l-7 7 2 5" fill="none" stroke="#fcee09" stroke-width="1.4" opacity=".85"></path><path d="M16 54h5l-1 3h-4z" fill="none" stroke="#fcee09" stroke-width="1" opacity=".7"></path><path d="M44 52h4v4h-4z" fill="#fcee09" opacity=".3"></path><path d="M44 52h4v4h-4z" fill="none" stroke="#fcee09" stroke-width="1.1"></path><path d="M45 54h2" stroke="#fcee09" stroke-width="1"></path><path d="M32 54v.01M32 58v.01" stroke="#fcee09" stroke-width="1.6" stroke-linecap="round" opacity=".7"></path></g><path d="M14 2h36l12 12v36L50 62H14L2 50V14z" fill="none" stroke="#fcee09" stroke-width="2"></path><path d="M14 2h6M2 14v6M62 50v-6M50 62h-6" stroke="#fcee09" stroke-width="3.5" opacity=".85"></path></svg>`
};

function profileAvatarKey(data,score=0){
  const avatar=profileEquippedItem(data,'avatar');
  const raw=avatar?.value;
  if(PROFILE_AVATAR_SVGS[raw])return raw;
  const legacy={'⌁':'netrunner','⬡':'fixer','◌':'ghost','★':'legend'}[raw];
  return legacy || '';
}

function profileAvatarGlyph(data,score=0){
  const key=profileAvatarKey(data,score);
  return key ? '' : rankAvatar(score);
}

function profileAvatarHtml(data,score=0,cls=''){
  const key=profileAvatarKey(data,score);
  if(key)return `<span class="profile-avatar-icon profile-avatar-${key} ${cls}">${PROFILE_AVATAR_SVGS[key]}</span>`;
  return `<span class="profile-avatar-fallback ${cls}">${htmlEscape(rankAvatar(score))}</span>`;
}

function updateOperatorCosmetics(){
  const navUser=document.getElementById('nav-user');
  if(!navUser || !me)return;
  const data=D();
  const cred=streetCredScore();
  const eqc=data.equippedCosmetics||{};
  const shopItems=window.SHOP_ITEMS||[];
  const titleItem=eqc.title?shopItems.find(i=>i.type==='title'&&i.id===eqc.title):null;
  const frameItem=eqc.frame?shopItems.find(i=>i.type==='frame'&&i.id===eqc.frame):null;
  const prefix=titleItem?titleItem.value+' ':'';
  const frameKey=frameItem?(frameItem.value||'samurai'):'';
  const label=prefix+userDisplayLabel(me);
  navUser.innerHTML=profileAvatarHtml(data,cred,'nav-avatar')+'<span class="nav-user-name">'+htmlEscape(label)+'</span>';
  navUser.dataset.frame=frameKey;
  const mobUser=document.getElementById('mob-user');
  if(mobUser && !viewFriend){
    mobUser.innerHTML=profileAvatarHtml(data,cred,'mobile-avatar')+'<span class="nav-user-name">'+htmlEscape(label)+'</span>';
    mobUser.dataset.frame=frameKey;
  }
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
    profile:{
      name:row.name||'',
      nick:row.nick||'',
      tag:row.tag||'',
      status:row.status||'CANAL FECHADO',
      bio:row.bio||'Dados detalhados liberados apenas entre amigos autorizados.',
      setupDone:true
    },
    publicStats:{
      level:Number(row.level||1),
      booksDone:Number(row.books_done||0),
      projectsDone:Number(row.projects_done||0),
      gamesDone:Number(row.games_done||0),
      logsDone:Number(row.logs_done||0)
    }
  };
}

function sectionLabel(section){
  return (FRIEND_PERMISSION_AREAS.find(a=>a.id===section)?.label || section || '').toUpperCase();
}

function sharedMetric(label,value){
  return {label:String(label||'').slice(0,28),value:String(value??'--').slice(0,48)};
}

function sanitizeSharedBook(book){
  return {
    title:String(book?.title||'').slice(0,80),
    author:String(book?.author||'').slice(0,80),
    status:String(book?.status||'queue').slice(0,24)
  };
}

function buildSharedSectionPayload(section,data=myData,username=me){
  const summary=profileSummary(data,username);
  const books=Array.isArray(data.books)?data.books:[];
  const projects=Array.isArray(data.projects)?data.projects:[];
  const games=Array.isArray(data.games)?data.games:[];
  const devlog=Array.isArray(data.devlog)?data.devlog:[];
  const guitarlog=Array.isArray(data.guitarlog)?data.guitarlog:[];
  const reflexoes=Array.isArray(data.reflexoes)?data.reflexoes:[];
  const districts=Array.isArray(data.districts)?data.districts:[];
  const tasks=data.tasks?.[dk()]||{};
  const taskDefs=Array.isArray(data.taskDefs)?data.taskDefs.filter(t=>!t.archived):[];
  const doneToday=Object.values(tasks).filter(Boolean).length;
  const payload={
    section,
    label:sectionLabel(section),
    owner:username,
    name:summary.name,
    level:summary.level,
    status:summary.status,
    updatedAt:new Date().toISOString(),
    metrics:[],
    items:[]
  };
  if(section==='home'){
    payload.summary='Resumo publico do dia e consistencia geral.';
    payload.metrics=[
      sharedMetric('Streak',String(typeof maxStreak==='function'?maxStreak():0)),
      sharedMetric('Contratos hoje',`${doneToday}/${taskDefs.length}`),
      sharedMetric('Level',String(summary.level)),
      sharedMetric('Status',summary.status)
    ];
  }else if(section==='leitura'){
    const reading=books.filter(b=>b.status==='reading').length;
    const done=books.filter(b=>b.status==='done').length;
    payload.summary='Biblioteca publica e progresso de leitura.';
    payload.metrics=[
      sharedMetric('Lendo agora',reading),
      sharedMetric('Concluidos',done),
      sharedMetric('Total',books.length),
      sharedMetric('Meta mensal',String(data.goals?.booksMonthly || data.prefs?.booksMonthlyGoal || 'nao definida'))
    ];
    payload.items=books.slice(0,12).map(sanitizeSharedBook).filter(b=>b.title);
  }else if(section==='dev'){
    payload.summary='Resumo publico de projetos e estudo.';
    payload.metrics=[
      sharedMetric('Projetos',projects.length),
      sharedMetric('Ativos',projects.filter(p=>p.status==='active').length),
      sharedMetric('Logs',devlog.length)
    ];
    payload.items=projects.slice(0,8).map(p=>({title:String(p.name||'Projeto').slice(0,80),status:String(p.status||'active').slice(0,24)}));
  }else if(section==='violao'){
    payload.summary='Resumo publico de pratica musical.';
    payload.metrics=[sharedMetric('Logs',guitarlog.length),sharedMetric('Streak',String(typeof guitarStreak==='function'?guitarStreak():0))];
  }else if(section==='jogos'){
    payload.summary='Resumo publico da biblioteca de jogos.';
    payload.metrics=[sharedMetric('Jogando',games.filter(g=>g.status==='playing').length),sharedMetric('Zerados',games.filter(g=>g.status==='done').length),sharedMetric('Total',games.length)];
    payload.items=games.slice(0,10).map(g=>({title:String(g.name||'Jogo').slice(0,80),status:String(g.status||'queue').slice(0,24)}));
  }else if(section==='reflexoes'){
    payload.summary='Resumo publico de atividade no diario, sem textos privados.';
    payload.metrics=[sharedMetric('Entradas',reflexoes.length),sharedMetric('Ultima entrada',reflexoes[0]?.date||'--')];
  }else if(section==='distritos'){
    payload.summary='Distritos publicos ativos.';
    payload.metrics=[sharedMetric('Distritos',districts.length)];
    payload.items=districts.slice(0,12).map(d=>({title:String(d.name||'Distrito').slice(0,60),status:String(d.page||'link').slice(0,24)}));
  }else if(section==='custom'){
    const pages=Object.keys(data.customPages||{});
    payload.summary='Paginas custom publicadas.';
    payload.metrics=[sharedMetric('Paginas',pages.length)];
    payload.items=pages.slice(0,12).map(p=>({title:String(data.pageObjectives?.[p]?.title||p).slice(0,80),status:'custom'}));
  }
  return payload;
}

async function publishFriendSharedSections(){
  if(!sb || !me || RO())return;
  const perms=getFriendPermissions(myData);
  const allowed=FRIEND_PERMISSION_AREAS.filter(a=>areaAllowed(perms,a.id)).map(a=>a.id);
  const blocked=FRIEND_PERMISSION_AREAS.filter(a=>!areaAllowed(perms,a.id)).map(a=>a.id);
  const rows=allowed.map(section=>({
    owner:me,
    section,
    payload:buildSharedSectionPayload(section,myData,me),
    updated_at:new Date().toISOString()
  }));
  try{
    if(rows.length)await sb.from('friend_shared_sections').upsert(rows,{onConflict:'owner,section'});
    if(blocked.length)await sb.from('friend_shared_sections').delete().eq('owner',me).in('section',blocked);
  }catch(e){
    recordSupabaseFailure('friend_shared_sections:publish',e);
    console.warn('Falha ao publicar secoes compartilhadas:',e);
  }
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
    const {data,error}=await sb.from('friend_profiles').select('owner,nick,tag,name,status,bio,level,updated_at').eq('owner',id).maybeSingle();
    if(error)throw error;
    const out=dataFromPublicProfile(data);
    if(out)ensureRuntimeProfileFromData(id,out);
    return out;
  }catch(e){}
  try{
    const {data,error}=await sb.from('friend_profile_directory').select('owner,nick,tag,name,level').eq('owner',id).maybeSingle();
    if(error)throw error;
    const out=dataFromPublicProfile(data);
    if(out)ensureRuntimeProfileFromData(id,out);
    return out;
  }catch(e){return null;}
}

function publicOperatorEmpty(message='Carregando perfil publico...'){
  return `<div class="friend-alert-line">${htmlEscape(message)}</div>`;
}

function publicOperatorRow(label,value){
  return `<div class="public-profile-row"><span>${htmlEscape(label)}</span><b>${htmlEscape(value||'--')}</b></div>`;
}

function shortPublicId(owner){
  const raw=String(owner||'');
  if(raw.length<=14)return raw;
  return raw.slice(0,8)+'...'+raw.slice(-4);
}

function publicProfileSection(title,subtitle,body,extraClass=''){
  return `<section class="public-profile-section ${htmlEscape(extraClass)}">
    <div class="public-profile-section-head">
      <span>${htmlEscape(title)}</span>
      ${subtitle?`<small>${htmlEscape(subtitle)}</small>`:''}
    </div>
    ${body}
  </section>`;
}

function sharedSectionsTabs(owner,sections=[]){
  const available=Array.isArray(sections)?sections:[];
  const safeOwner=htmlEscape(owner);
  const tabs=[`<button class="active" type="button" data-action="openPublicFriendProfile" data-friend="${safeOwner}">PERFIL</button>`]
    .concat(available.map(row=>`<button type="button" data-action="openSharedSection" data-owner="${safeOwner}" data-friend="${safeOwner}" data-section="${htmlEscape(row.section)}">${htmlEscape(sectionLabel(row.section))}</button>`));
  return `<div class="public-profile-shared-tabs">${tabs.join('')}</div>`;
}

function setSharedSectionActive(section){
  document.querySelectorAll('.public-profile-shared-tabs button').forEach(btn=>{
    const active=btn.dataset.section===section || (!section && btn.dataset.action==='openPublicFriendProfile');
    btn.classList.toggle('active',active);
  });
}

function renderSharedSectionPayload(row){
  const body=document.getElementById('public-profile-shared-content');
  if(!body)return;
  body.removeAttribute('hidden');
  if(!row?.payload){
    body.innerHTML=publicProfileSection('SEÇÃO COMPARTILHADA','sem dados publicados','<div class="public-profile-note">Sem dados compartilhados.</div>','shared-section');
    return;
  }
  const payload=row.payload||{};
  const metrics=(Array.isArray(payload.metrics)?payload.metrics:[])
    .map(m=>publicOperatorRow(m.label,m.value)).join('') || '<div class="public-profile-note">Sem dados compartilhados.</div>';
  const items=(Array.isArray(payload.items)?payload.items:[]).slice(0,12)
    .map(item=>`<div class="public-profile-item"><b>${htmlEscape(item.title||item.name||'Item')}</b><span>${htmlEscape(item.status||item.author||'PUBLICO')}</span></div>`).join('');
  body.innerHTML=publicProfileSection(
    sectionLabel(payload.section||row.section),
    'dados sanitizados de friend_shared_sections',
    `<div class="public-profile-note">${htmlEscape(payload.summary||'Sem dados compartilhados.')}</div>
     <div class="public-profile-grid">${metrics}</div>
     ${items?`<div class="public-profile-items">${items}</div>`:'<div class="public-profile-note">Sem itens.</div>'}`,
    'shared-section'
  );
}

function renderPublicOperatorProfile(result){
  const body=document.getElementById('public-profile-body');
  if(!body)return;
  if(result?.error){
    body.innerHTML=publicOperatorEmpty(result.error);
    return;
  }
  const pub=result?.publicProfile;
  if(!pub){
    body.innerHTML=publicOperatorEmpty('Perfil não encontrado.');
    return;
  }
  const detail=result?.details;
  const hasDetails=!!detail;
  const updated=pub.updated_at ? new Date(pub.updated_at).toLocaleString('pt-BR') : '--';
  const publicRows=[
    ['OWNER',shortPublicId(pub.owner)],
    ['NICK',pub.nick],
    ['TAG',pub.tag],
    ['NOME',pub.name],
    ['LEVEL',String(pub.level ?? '--')],
    ['UPDATED_AT',updated]
  ].map(([k,v])=>publicOperatorRow(k,v)).join('');
  const detailsBody=detail?`<div class="public-profile-details">
      ${publicOperatorRow('STATUS',detail.status)}
      ${publicOperatorRow('BIO',detail.bio)}
      ${publicOperatorRow('ATUALIZADO',detail.updated_at ? new Date(detail.updated_at).toLocaleString('pt-BR') : '--')}
    </div>`:`<div class="public-profile-note">Sem detalhes.</div>`;
  const alreadyFriend=friendList().includes(pub.owner);
  const sharedSections=Array.isArray(result?.sharedSections)?result.sharedSections:[];
  const actions=`<div class="public-profile-actions">
    <button class="friend-chat-btn primary" type="button" data-action="openChatFromPublicProfile" data-friend="${htmlEscape(pub.owner)}">ABRIR CHAT</button>
    <button class="friend-chat-btn" type="button" data-action="copyPublicFriendId" data-friend="${htmlEscape(pub.owner)}">COPIAR ID</button>
    ${alreadyFriend?'':`<button class="friend-chat-btn" type="button" data-action="addFriendFromPublicProfile" data-friend="${htmlEscape(pub.owner)}">ADICIONAR AMIGO</button>`}
  </div>`;
  body.innerHTML=`<div class="public-profile-card">
    <div class="steam-cover"></div>
    <div class="public-profile-identity">
      <div>
        <span>${hasDetails?'CONTATO AUTORIZADO':'PERFIL PÚBLICO'}</span>
        <strong>${htmlEscape(pub.name || pub.nick || 'SEM NOME')}</strong>
        <small>${htmlEscape((pub.nick&&pub.tag)?`${pub.nick}#${pub.tag}`:shortPublicId(pub.owner))}</small>
      </div>
      <div class="public-profile-badges">
        <em>${hasDetails?'CONTATO AUTORIZADO':'PERFIL PÚBLICO'}</em>
        <code>ID ${htmlEscape(shortPublicId(pub.owner))}</code>
      </div>
      <div class="steam-level"><span>LVL</span><b>${String(pub.level ?? 1).padStart(2,'0')}</b></div>
    </div>
    ${actions}
    <div class="public-profile-shared">
      <div class="public-profile-section-head">
        <span>SEÇÕES COMPARTILHADAS</span>
        <small>${sharedSections.length?`${sharedSections.length} liberadas`:'nenhuma seção'}</small>
      </div>
      ${sharedSections.length?sharedSectionsTabs(pub.owner,sharedSections):'<div class="public-profile-note">Nenhuma seção liberada pelo operador.</div>'}
    </div>
    <div id="public-profile-shared-content"></div>
    ${publicProfileSection('DADOS PÚBLICOS','via public.friend_profile_directory',`<div class="public-profile-grid">${publicRows}</div>`,'public-only')}
    ${publicProfileSection('DETALHES LIBERADOS PELA RLS',hasDetails?'via public.friend_profiles':'sem permissao para dados privados',detailsBody,'rls-details')}
  </div>`;
}

async function fetchPublicOperatorProfile(owner){
  if(!sb || !owner)return {error:'Perfil não encontrado.'};
  try{
    const {data:publicProfile,error:directoryError}=await sb
      .from('friend_profile_directory')
      .select('owner,nick,tag,name,level,updated_at')
      .eq('owner',owner)
      .maybeSingle();
    if(directoryError)throw directoryError;
    if(!publicProfile)return {error:'Perfil não encontrado.'};
    let details=null;
    let sharedSections=[];
    try{
      const {data,error}=await sb
        .from('friend_profiles')
        .select('owner,status,bio,updated_at')
        .eq('owner',owner)
        .maybeSingle();
      if(!error && data)details=data;
    }catch(e){}
    try{
      const {data,error}=await sb
        .from('friend_shared_sections')
        .select('section,payload,updated_at')
        .eq('owner',owner);
      if(!error && Array.isArray(data))sharedSections=data;
    }catch(e){}
    return {publicProfile,details,sharedSections};
  }catch(e){
    return {error:'Erro de rede ao carregar perfil publico: '+(e.message||'falha desconhecida')};
  }
}

function recordSharedSectionFailure(owner,section,reason,error){
  recordSupabaseFailure('friend_shared_sections:open',{
    message:reason || error?.message || 'Falha ao abrir secao compartilhada',
    code:error?.code || error?.status || '',
    hint:'owner='+shortPublicId(owner)+'; section='+String(section||'')
  });
}

async function openSharedSection(owner,section){
  owner=String(owner||'').trim();
  section=String(section||'').trim();
  const host=document.getElementById('public-profile-shared-content');
  if(!host)return;
  setSharedSectionActive(section);
  try{host.scrollIntoView({block:'nearest',behavior:motionMode==='off'?'auto':'smooth'});}catch(e){}
  host.removeAttribute('hidden');
  host.innerHTML=publicProfileSection('SEÇÃO COMPARTILHADA','carregando','<div class="public-profile-note">Carregando seção compartilhada...</div>','shared-section');
  if(!owner || !section){
    recordSharedSectionFailure(owner,section,'identificador ausente');
    host.innerHTML=publicProfileSection('SEÇÃO BLOQUEADA','sem identificador','<div class="public-profile-note">Esta seção não foi liberada pelo operador.</div>','shared-section');
    return;
  }
  try{
    const {data,error}=await sb
      .from('friend_shared_sections')
      .select('section,payload,updated_at')
      .eq('owner',owner)
      .eq('section',section)
      .maybeSingle();
    if(error)throw error;
    if(!data){
      recordSharedSectionFailure(owner,section,'secao nao liberada');
      host.innerHTML=publicProfileSection(sectionLabel(section),'sem payload','<div class="public-profile-note">Esta seção não foi liberada pelo operador.</div>','shared-section');
      return;
    }
    renderSharedSectionPayload(data);
    try{host.scrollIntoView({block:'nearest',behavior:motionMode==='off'?'auto':'smooth'});}catch(e){}
  }catch(e){
    recordSharedSectionFailure(owner,section,'RLS ou rede',e);
    host.innerHTML=publicProfileSection(sectionLabel(section),'RLS ou rede','<div class="public-profile-note">Esta seção não foi liberada pelo operador.</div>','shared-section');
  }
}

async function viewPublicSharedSection(owner,section){
  return openSharedSection(owner,section);
}
window.openSharedSection=openSharedSection;
window.viewPublicSharedSection=viewPublicSharedSection;

async function openPublicFriendProfile(owner){
  owner=String(owner||friendId()||'').trim();
  const modal=document.getElementById('public-profile-modal');
  const body=document.getElementById('public-profile-body');
  if(!modal || !body)return;
  modal.hidden=false;
  modal.classList.add('on');
  body.innerHTML=publicOperatorEmpty(owner?'Carregando...':'Selecione um contato.');
  if(!owner)return;
  renderPublicOperatorProfile(await fetchPublicOperatorProfile(owner));
}

function closePublicFriendProfile(){
  const modal=document.getElementById('public-profile-modal');
  if(!modal)return;
  modal.classList.remove('on');
  modal.hidden=true;
}

async function copyPublicFriendId(owner){
  owner=String(owner||'').trim();
  if(!owner)return;
  try{await navigator.clipboard.writeText(owner);}catch(e){}
  const body=document.getElementById('public-profile-body');
  if(body){
    const note=document.createElement('div');
    note.className='public-profile-note';
    note.textContent='ID copiado para a area de transferencia.';
    body.prepend(note);
    setTimeout(()=>note.remove(),2400);
  }
}

async function addFriendFromPublicProfile(owner){
  owner=String(owner||'').trim();
  if(!owner || !me || owner===me)return;
  myData.friendTargets=friendList();
  if(!myData.friendTargets.includes(owner))myData.friendTargets.unshift(owner);
  myData.friendTarget=owner;
  await Promise.all([dbSet(me,'friendTargets',myData.friendTargets),dbSet(me,'friendTarget',myData.friendTarget)]);
  renderPublicOperatorProfile(await fetchPublicOperatorProfile(owner));
  renderFriendChat(await safeFriendData(),'Contato adicionado pelo perfil publico.');
}

async function openChatFromPublicProfile(owner){
  owner=String(owner||'').trim();
  if(!owner || !me)return;
  closePublicFriendProfile();
  if(!friendList().includes(owner)){
    myData.friendTargets=friendList();
    myData.friendTargets.unshift(owner);
    await dbSet(me,'friendTargets',myData.friendTargets);
  }
  myData.friendTarget=owner;
  friendPanelTab='chat';
  await dbSet(me,'friendTarget',myData.friendTarget);
  renderFriendChat(await safeFriendData());
}

async function resolveFriendLookup(value){
  const raw=String(value||'').trim();
  if(!raw)return '';
  const match=raw.match(/^([a-zA-Z0-9_]{2,18})#(01|\d{4})$/);
  if(!match)return raw;
  const nick=normalizeNick(match[1]);
  const tag=match[2];
  try{
    const {data,error}=await sb.from('friend_profile_directory').select('owner,nick,tag,name,level').eq('nick',nick).eq('tag',tag).maybeSingle();
    if(error)throw error;
    return data?.owner || '';
  }catch(e){return '';}
}

function ensureRuntimeProfileFromData(username,data={}){
  if(!username)return;
  const p=data.profile||{};
  [p.name,p.nick,p.tag,PROFILES[username]?.name,PROFILES[username]?.nick,profileEmail(username)].forEach(alias=>rememberInfiniteEddiesAlias(username,alias));
  if(p.name || !PROFILES[username]){
    setRuntimeProfile(username,{
      name:p.name || displayNameFromEmail(username),
      nick:p.nick || '',
      tag:p.tag || '',
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
  const frame=profileFrameKey(data);
  const avatar=profileAvatarHtml(data,streetCredScore(),'steam-avatar-art');
  return `<div class="steam-profile-card" ${frame?`data-frame="${htmlEscape(frame)}"`:''}>
    <div class="steam-cover"></div>
    <div class="steam-profile-main">
      <div class="steam-avatar">${avatar}</div>
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
    <button class="friend-chat-btn primary" type="button" data-action="callNamed" data-fn="saveOwnFriendProfile">SALVAR PERFIL</button>
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
      <button class="friend-chat-btn" type="button" data-action="callNamed" data-fn="copyOwnFriendId">COPIAR ID</button>
    </div>
    <button class="friend-chat-btn primary" type="button" data-action="callNamed" data-fn="saveFriendTarget">SALVAR AMIGO</button>
  </div>`;
}

function queueFriendProfileResolve(id){
  id=String(id||'').trim();
  if(!id || pendingFriendProfileLoads.has(id) || !sb)return;
  const display=resolveFriendDisplay(id);
  if(!display.loading)return;
  pendingFriendProfileLoads.add(id);
  getPublicFriendProfile(id)
    .then(data=>{
      if(data)ensureRuntimeProfileFromData(id,data);
      if(document.getElementById('friend-chat')?.classList.contains('on') && friendPanelTab==='friends')renderFriendChat(null);
      if(document.getElementById('friend-chat')?.classList.contains('on') && friendPanelTab==='chat' && friendId()===id)renderFriendChat(data||null);
    })
    .catch(e=>recordSupabaseFailure('friend_profile:display_lookup',{message:e?.message||'Falha ao resolver nome do contato',hint:'friend='+shortPublicId(id)}))
    .finally(()=>pendingFriendProfileLoads.delete(id));
}

function friendContactList(){
  const list=friendList();
  if(!list.length)return `<div class="friend-contact-panel">
    <div class="friend-editor-title">CONTATOS</div>
    <div class="friend-contact-empty"><span>CANAL SEM CONTATOS</span><b>Nick#tag ou ID da conta acima.</b></div>
  </div>`;
  return `<div class="friend-contact-panel">
    <div class="friend-editor-title">CONTATOS</div>
    <div class="friend-contact-list">
      ${list.map(id=>{
        const display=resolveFriendDisplay(id);
        if(display.loading)setTimeout(()=>queueFriendProfileResolve(id),0);
        return `<div class="friend-contact ${id===friendId()?'active':''}">
        <button class="friend-contact-main" type="button" data-action="callNamed" data-fn="selectFriendContact" data-arg0="${htmlEscape(id)}">
          <span>${htmlEscape(display.name)}</span>
          <b>${htmlEscape(display.secondary)} ${id===friendId()?'// CANAL ATIVO':'// SELECIONAR'}</b>
        </button>
        <button class="friend-contact-profile" type="button" data-action="openPublicFriendProfile" data-friend="${htmlEscape(id)}">VER PERFIL</button>
      </div>`;
      }).join('')}
    </div>
  </div>`;
}

// friendSuggestionPanel / renderFriendSuggestionRows / renderFriendSuggestions
// — proximidade pausada; funções mantidas sem chamadores para evitar quebra de referências.
function friendSuggestionPanel(){ return ''; }
function renderFriendSuggestionRows(){ return ''; }
function renderFriendSuggestions(){}

async function currentAuthUsesGoogle(){
  try{
    const {data}=await sb.auth.getSession();
    const identities=data?.session?.user?.identities||[];
    return identities.some(i=>String(i.provider||'').toLowerCase()==='google');
  }catch(e){return false;}
}

// loadFriendSuggestions — descoberta por proximidade pausada; no-op até reativar.
async function loadFriendSuggestions(){ /* pausado */ }

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
  const achUnlocked=Object.keys(myData.achievements||{});
  const achSection=`<div class="profile-achievements">
  <div class="profile-section-title">CONQUISTAS (${achUnlocked.length}/${ACHIEVEMENTS.length})</div>
  <div class="ach-badges">
    ${ACHIEVEMENTS.map(a=>{const on=!!myData.achievements?.[a.id];return `<div class="ach-badge${on?' on':''}" title="${htmlEscape(a.name)}: ${htmlEscape(a.desc)}">${on?'◆':'◇'}<span>${htmlEscape(a.name)}</span></div>`;}).join('')}
  </div>
</div>`;
  return `<div class="friend-setup-panel profile-tab">
    ${friendProfileCard(myData,me,true)}
    ${achSection}
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
      <input type="checkbox" ${areaAllowed(perms,a.id)?'checked':''} data-change="updateFriendPermission" data-area="${htmlEscape(a.id)}">
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
  await publishFriendSharedSections();
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
  await publishFriendSharedSections();
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

function shortFriendChannelId(channelId=friendChannelId()){
  const raw=String(channelId||'');
  if(!raw)return '';
  return raw.length>18 ? raw.slice(0,18)+'...' : raw;
}

function isPermissionLikeError(error){
  const text=String(error?.message || error?.details || error?.hint || error?.code || error?.status || error || '').toLowerCase();
  return /permission|rls|unauthorized|forbidden|jwt|auth|42501|401|403/.test(text);
}

function setFriendRealtimeStatus(text){
  const el=document.getElementById('friend-realtime-status');
  if(el)el.textContent=text;
}

function recordFriendRealtimeIssue(status,error){
  friendRealtimeState.lastStatus=String(status||'UNKNOWN');
  friendRealtimeState.lastError=redactDiagnosticText(error?.message || error?.details || error?.hint || error || '');
  recordSupabaseFailure('friend_messages:realtime:'+friendRealtimeState.lastStatus,{
    message:friendRealtimeState.lastError || 'Falha na assinatura realtime do Commlink',
    code:error?.code || error?.status || friendRealtimeState.lastStatus,
    hint:'channel='+shortFriendChannelId(friendRealtimeState.channelId)+'; messagesLoaded='+(friendRealtimeState.messagesLoaded?'yes':'no')
  });
}

function friendRealtimeFallbackText(error){
  if(isPermissionLikeError(error))return 'Sem permissão para sincronizar canal.';
  if(friendRealtimeState.messagesLoaded)return 'Mensagens carregadas. Realtime indisponível.';
  return 'Realtime indisponível. Usando polling.';
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
  friendRealtimeState={channelId:'',messagesLoaded:false,lastStatus:'idle',lastError:''};
}

function startFriendRealtime(){
  if(!sb || !me || !friendId() || friendPanelTab!=='chat')return;
  const channelId=friendChannelId();
  if(friendMessageChannel && friendMessageChannelId===channelId)return;
  stopFriendRealtime();
  friendMessageChannelId=channelId;
  friendRealtimeState={channelId,messagesLoaded:false,lastStatus:'connecting',lastError:''};
  setFriendRealtimeStatus('SINCRONIZANDO...');
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
      .subscribe((status,error)=>{
        friendRealtimeState.lastStatus=status;
        if(status==='SUBSCRIBED'){
          setFriendRealtimeStatus('TEMPO REAL');
          return;
        }
        if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){
          recordFriendRealtimeIssue(status,error);
          setFriendRealtimeStatus(friendRealtimeFallbackText(error));
          return;
        }
        setFriendRealtimeStatus('SINCRONIZANDO...');
      });
  }catch(e){
    recordFriendRealtimeIssue('CREATE_FAILED',e);
    setFriendRealtimeStatus(friendRealtimeFallbackText(e));
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
  if(error){
    recordSupabaseFailure('friend_messages:select',error);
    throw error;
  }
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
  try{
    const rows=await loadFriendMessages();
    friendRealtimeState.messagesLoaded=true;
    renderFriendMessageRows(rows);
    if(friendRealtimeState.lastStatus && ['CHANNEL_ERROR','TIMED_OUT','CLOSED','CREATE_FAILED'].includes(friendRealtimeState.lastStatus)){
      setFriendRealtimeStatus(friendRealtimeFallbackText(friendRealtimeState.lastError));
    }
  }catch(e){
    friendRealtimeState.messagesLoaded=false;
    recordSupabaseFailure('friend_messages:refresh',e);
    renderFriendMessageRows([]);
    setFriendRealtimeStatus(isPermissionLikeError(e)?'Sem permissão para sincronizar canal.':'Erro ao carregar mensagens.');
  }
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
  </div>`;
  const display=resolveFriendDisplay(friendId(),targetData);
  if(display.loading)setTimeout(()=>queueFriendProfileResolve(friendId()),0);
  return `<div class="friend-message-screen">
    <div class="friend-message-headline">
      <button class="friend-chat-btn" type="button" data-action="callNamed" data-fn="backToFriendList">VOLTAR</button>
      <div>
        <div class="friend-section-title">MENSAGENS</div>
        <strong>${htmlEscape(display.name)}</strong>
        <small>${htmlEscape(display.secondary)}</small>
        <span class="friend-realtime-status" id="friend-realtime-status">SYNC...</span>
      </div>
      <button class="friend-chat-btn" type="button" data-action="openPublicFriendProfile" data-friend="${htmlEscape(friendId())}">VER PERFIL</button>
    </div>
    <div class="friend-message-panel solo">
      <div class="friend-message-list" id="friend-message-list"></div>
      <div class="friend-message-compose">
        <input id="friend-message-input" maxlength="500" placeholder="Enviar mensagem..." data-enter-action="sendFriendMessage">
        <button class="friend-chat-btn primary" data-action="callNamed" data-fn="sendFriendMessage">ENVIAR</button>
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
  const df=document.getElementById('drawer-friend-btn');if(df)df.textContent='💬 '+text;
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
  const friendDisplay=resolveFriendDisplay(fid,targetData);
  if(fid && friendDisplay.loading)setTimeout(()=>queueFriendProfileResolve(fid),0);
  const fp=PROFILES[fid] || {name:fid?'AMIGO':'SEM AMIGO',avatar:'◎',role:'OPERADOR'};
  const mine=PROFILES[me];
  const sentStatus=targetData ? friendAccessStatus(targetData,me) : null;
  const received=fid ? (myData.friendRequests||{})[fid] : null;
  const receivedStatus=received && received.status;
  const profileMode=friendPanelTab==='profile';
  const friendsMode=friendPanelTab==='friends';
  const chatMode=friendPanelTab==='chat';
  const publicOnly=!!targetData?.publicStats;
  title.textContent=profileMode?'PERFIL // '+mine.name:(friendsMode?'COMMLINK // CONTATOS':'COMMLINK // '+friendDisplay.name);
  sub.textContent=profileMode?'// IDENTIDADE PUBLICA //':(friendsMode?'// SELECIONE UM CONTATO //':'// '+friendDisplay.secondary+' //');
  icon.textContent=(profileMode?mine.name:(friendsMode?'NC':friendDisplay.name)).slice(0,2);
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
    btns.push(`<button class="friend-chat-btn primary" data-action="callNamed" data-fn="respondFriendRequest" data-arg0="${fid}" data-arg1="approved">APROVAR ${htmlEscape(friendDisplay.name)}</button>`);
    btns.push(`<button class="friend-chat-btn danger" data-action="callNamed" data-fn="respondFriendRequest" data-arg0="${fid}" data-arg1="denied">RECUSAR</button>`);
  }
  btns.push(`<button class="friend-chat-btn" data-action="callNamed" data-fn="closeFriendChat">${profileMode?'FECHAR PERFIL':'FECHAR CANAL'}</button>`);
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
    <div class="global-result" data-action="searchGoPage" data-page="${htmlEscape(r.page)}">
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
  rb.innerHTML=`${htmlEscape(fp.avatar)} ${htmlEscape(fp.name)} SOLICITOU ACESSO AO SEU PERFIL <span class="back-me" data-action="callNamed" data-fn="openFriendPanel">ABRIR COMMLINK</span>`;
}

async function respondFriendRequest(requester,status){
  if(!me || RO() || !requester)return;
  myData.friendRequests=myData.friendRequests||{};
  myData.friendRequests[requester]={status,updatedAt:new Date().toISOString()};
  const writes=[dbSet(me,'friendRequests',myData.friendRequests)];
  if(status==='approved'){
    myData.friendTargets=friendList();
    if(!myData.friendTargets.includes(requester))myData.friendTargets.unshift(requester);
    writes.push(dbSet(me,'friendTargets',myData.friendTargets));
  }
  await Promise.all(writes);
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
      fb.innerHTML=`${htmlEscape(fp.avatar)} COMMLINK ATIVO: PERFIL DE ${htmlEscape(fp.name)} - SOMENTE LEITURA <span class="back-me" data-action="callNamed" data-fn="toggleFriend">VOLTAR PARA MEU PERFIL</span>`;
    }
    closeFriendChat();
    applyData();
    renderBooks();renderProjects();renderDevLog();renderGuitarLog();renderGames();renderRefs();renderSkills();updateStats();
  }catch(e){
    viewFriend=false;
    friendData={};
    setFriendButtonText('AMIGO');
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


const _PAGE_TITLES={home:'HOME',leitura:'LEITURA',dev:'DEV',treino:'TREINO',violao:'VIOLÃO',jogos:'JOGOS',reflexoes:'REFLEXÕES',notificacoes:'NOTIFICAÇÕES',amigos:'AMIGOS',loja:'LOJA'};
function goPage(id){
  ensureExtraPages();
  closeHomeModule();
  toggleHomeMenu(false);
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-tab,.mob-tab').forEach(t=>t.classList.remove('active','loading'));
  const page=document.getElementById('page-'+id);
  if(!page)return;
  document.title=(_PAGE_TITLES[id]||id.toUpperCase())+' — NIGHT CITY';
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
  renderShellActiveState();
  enhanceClickableControls();
}

function focusElement(id){
  const el=document.getElementById(id);
  if(!el)return;
  el.scrollIntoView({block:'center',behavior:motionMode==='off'?'auto':'smooth'});
  el.focus?.();
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
    '.reminder-toggle','.reminder-delete','.custom-edit-btn','.del-btn','.mini-remove','.badge','.rhead',
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
  const target=e.target.closest('.nav-tab,.mob-tab,.dbtn,.back-btn,.home-module-row,.global-result,.reminder-toggle,.reminder-delete,.custom-edit-btn,.del-btn,.mini-remove,.badge,.rhead,.district-remove,.back-me');
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
  {page:'financas', label:'Financas', icon:'money', color:'#2fba69', summary:'Controle de saldo, entradas, saidas e proximos pagamentos.'},
  {page:'cartao', label:'Cartao', icon:'card', color:'#00d4ff', summary:'Faturas, limites, compras recentes e datas de vencimento.'},
  {page:'investimentos', label:'Investimentos', icon:'invest', color:'#7df9ff', summary:'Carteira, aportes, metas e evolucao dos ativos.'},
  {page:'compras', label:'Compras', icon:'cart', color:'#fcee09', summary:'Lista de compras, prioridades e itens planejados.'},
  {page:'casa', label:'Casa', icon:'homebase', color:'#b44fff', summary:'Tarefas domesticas, manutencoes e organizacao da base.'},
  {page:'agenda', label:'Agenda', icon:'calendar', color:'#f0997b', summary:'Compromissos, prazos e eventos importantes.'},
  {page:'comida', label:'Comida', icon:'food', color:'#97C459', summary:'Refeicoes, mercado, dieta e preparos da semana.'},
  {page:'sono', label:'Sono', icon:'sleep', color:'#378ADD', summary:'Horario de dormir, qualidade do descanso e consistencia.'},
  {page:'metas', label:'Metas', icon:'target', color:'#e00f3a', summary:'Objetivos ativos, progresso e proximas acoes.'},
  {page:'treino', label:'Treino', icon:'workout', color:'#fcee09', summary:'Forca, series, cargas e rotina fisica.'},
  {page:'cardio', label:'Cardio', icon:'cardio', color:'#e00f3a', summary:'Corrida, caminhada, bicicleta e condicionamento.'},
  {page:'loja', label:'Loja', icon:'cart', color:'#b44fff', summary:'Temas de faccao, utilidades e boosts com Eddies.'}
];

const EXTRA_PAGE_MAP = Object.fromEntries(EXTRA_PAGE_DEFS.map(p=>[p.page,p]));

function districtTemplateOptions(){
  return EXTRA_PAGE_DEFS.map(def=>`<option value="${def.page}">${def.label}</option>`).join('');
}

function districtDestinationOptions(selected='url'){
  const current=selected || 'url';
  const base=`<option value="url" ${current==='url'?'selected':''}>Link externo / aba livre</option>`;
  const internal=DISTRICT_PAGE_DEFS.map(def=>`<option value="${def.page}" ${current===def.page?'selected':''}>${def.label}</option>`).join('');
  return base+internal;
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

function addCustomDistrictItem(){
  if(RO())return;
  if(!myData.districts || !myData.districts.length) myData.districts = JSON.parse(JSON.stringify(creatorDefaults(DEFAULT_DISTRICTS)));
  const destination=document.getElementById('district-new-page')?.value || 'url';
  const def=EXTRA_PAGE_MAP[destination] || DISTRICT_PAGE_DEFS.find(p=>p.page===destination);
  const isUrl=destination==='url' || !def;
  const rawUrl=document.getElementById('district-new-url')?.value.trim() || '';
  const url=isUrl ? safeExternalUrl(rawUrl) : '';
  if(isUrl && rawUrl && !url){
    showCyberToast('LINK INVALIDO','Use um link começando com http:// ou https://.',4200);
    return;
  }
  const name=(document.getElementById('district-new-name')?.value.trim() || def?.label || 'Nova aba').slice(0,28);
  const icon=iconIdFor(document.getElementById('district-new-icon')?.value || def?.icon || (isUrl?'link':''));
  const color=document.getElementById('district-new-color')?.value || def?.color || '#00d4ff';
  const entry={icon,name,color,page:isUrl?'url':def.page,url:isUrl?url:''};
  myData.districts.push(entry);
  if(!isUrl){
    if(!myData.pageObjectives)myData.pageObjectives={};
    myData.pageObjectives[def.page]=myData.pageObjectives[def.page] || def.summary || defaultObjectiveForPage(def.page);
    ensureCustomPagesData();
    renderExtraPage(def.page);
  }
  ['district-new-name','district-new-url'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  renderDistrictEditList();
  renderDistricts();
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
        <button class="custom-edit-toggle" data-action="callNamed" data-fn="togglePageObjectiveEdit" data-arg0="${page}">EDITAR OBJETIVO</button>
        <textarea id="page-objective-input-${page}" class="custom-focus-input" placeholder="Defina o objetivo desta página..." data-input="updatePageObjective" data-page="${htmlEscape(page)}">${htmlEscape(text)}</textarea>
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
    page.innerHTML=`<div class="custom-page-shell" id="custom-page-${def.page}"></div>`;
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
    weightLogs:Array.isArray(current.weightLogs)?current.weightLogs:[],
    weightStarterOpen:!!current.weightStarterOpen
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

function setTabHeaderStatus(page,text){
  const el=document.getElementById(page+'-head-status');
  if(el)el.textContent=text;
}

function tabCountLabel(count,singular,plural){
  return count+' '+(count===1?singular:plural);
}

function tabHeaderHtml({page,title,purpose,status,color,actionLabel,actionFn='createStarterForPage',actionArg=page}){
  const action=RO()?'':`<button type="button" class="page-head-action" data-action="callNamed" data-fn="${htmlEscape(actionFn)}" data-arg0="${htmlEscape(actionArg)}">${htmlEscape(actionLabel||'CRIAR ITEM')}</button>`;
  return `<div class="dist-header page-head custom-page-head" style="--page-color:${htmlEscape(color||'var(--c)')}">
    <div class="back-btn" data-action="goPage" data-page="home">HOME</div>
    <div class="page-head-main">
      <div class="dist-title">${htmlEscape(title)}</div>
      <p>${htmlEscape(purpose)}</p>
    </div>
    <div class="page-head-status" id="${htmlEscape(page)}-head-status">${htmlEscape(status)}</div>
    ${action}
  </div>`;
}

let financeFilter='all';
let financeMonth=new Date().toISOString().slice(0,7);
function setFinanceFilter(filter,page='financas'){
  financeFilter=['all','in','out','invest'].includes(filter)?filter:'all';
  renderFinancePage(page);
}

function setFinanceMonth(action,page='financas'){
  const current=/^\d{4}-\d{2}$/.test(financeMonth)?financeMonth:new Date().toISOString().slice(0,7);
  const [year,month]=current.split('-').map(Number);
  const date=new Date(year,month-1,1);
  if(action==='prev')date.setMonth(date.getMonth()-1);
  else if(action==='next')date.setMonth(date.getMonth()+1);
  else if(action==='current')financeMonth=new Date().toISOString().slice(0,7);
  else if(/^\d{4}-\d{2}$/.test(String(action||'')))financeMonth=String(action);
  if(action==='prev'||action==='next')financeMonth=date.toISOString().slice(0,7);
  renderFinancePage(page);
}

function financeMonthLabel(key=financeMonth){
  if(!/^\d{4}-\d{2}$/.test(String(key||'')))return 'MES ATUAL';
  const [year,month]=key.split('-').map(Number);
  return new Date(year,month-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).toUpperCase();
}

function financeMonthKeyForItem(item){
  if(item?.financeMonth && /^\d{4}-\d{2}$/.test(String(item.financeMonth)))return item.financeMonth;
  const updated=String(item?.updatedAt||'');
  if(/^\d{4}-\d{2}/.test(updated))return updated.slice(0,7);
  const due=String(item?.due||'');
  const dm=due.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if(dm){
    const now=new Date();
    const year=dm[3]?Number(String(dm[3]).padStart(4,'20')):now.getFullYear();
    const month=String(Math.max(1,Math.min(12,Number(dm[2])))).padStart(2,'0');
    return `${year}-${month}`;
  }
  return new Date().toISOString().slice(0,7);
}

function financeItemInMonth(item,key=financeMonth){
  return financeMonthKeyForItem(item)===key;
}

function financeAmountFromText(text){
  const raw=String(text||'').replace(/\./g,'').replace(/,/g,'.');
  const match=raw.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) || 0 : 0;
}

function financeDirection(item){
  const title=String(item.title||'').toLowerCase();
  const type=String(item.type||'').toLowerCase();
  const primary=[title,type].join(' ');
  const hay=[title,type,item.metric,item.note].map(x=>String(x||'').toLowerCase()).join(' ');
  if(/\b(aporte|investimento|investir|investido|reserva)\b/.test(primary))return 'invest';
  if(/\b(objetivo|meta financeira|meta)\b/.test(primary))return 'goal';
  if(/\b(entrada|renda|receita|sal[aá]rio|freela|b[oô]nus|pix recebido|dep[oó]sito|recebimento)\b/.test(hay))return 'in';
  if(/\b(sa[ií]da|gasto|despesa|compra|conta|fatura|cart[aã]o|aluguel|mercado|pagar|pagamento)\b/.test(hay))return 'out';
  if(/\b(aporte|investimento|investir|investido|reserva)\b/.test(hay))return 'invest';
  if(/\b(objetivo|meta financeira|meta)\b/.test(hay))return 'goal';
  return 'neutral';
}

function financeAmount(item){
  const dir=financeDirection(item);
  const text=[item.metric,item.note,item.title].join(' ');
  const hasMoneyMark=/r\$|€\$|\$|reais?|real|eddies/i.test(text);
  if(!hasMoneyMark && dir==='neutral')return 0;
  if(!hasMoneyMark && /\b(min|mins|minuto|minutos|hora|horas|h|dias?|semana|semanal|diario|diaria)\b/i.test(text))return 0;
  const value=financeAmountFromText(text);
  if(!value)return 0;
  return dir==='out' ? -Math.abs(value) : Math.abs(value);
}

function financeMoney(value){
  if(!value)return '--';
  const prefix=value<0?'-R$ ':'R$ ';
  return prefix+Math.abs(value).toLocaleString('pt-BR',{maximumFractionDigits:0});
}

function financeGoalStats(items){
  const investedItems=items.filter(item=>financeDirection(item)==='invest');
  const goalItems=items.filter(item=>financeDirection(item)==='goal');
  const invested=investedItems.reduce((sum,item)=>sum+Math.abs(financeAmount(item)),0);
  const target=goalItems.reduce((sum,item)=>sum+Math.abs(financeAmount(item)),0);
  const pct=target?Math.min(100,Math.round(invested/target*100)):0;
  return {invested,target,pct,investedCount:investedItems.length,goalCount:goalItems.length};
}

function financeRowsByType(items){
  const map=new Map();
  const goalStats=financeGoalStats(items);
  items.forEach(item=>{
    const dir=financeDirection(item);
    if(dir==='invest' || dir==='goal')return;
    const key=String(item.type||'Geral').trim() || 'Geral';
    const current=map.get(key) || {name:key,total:0,count:0,done:0};
    current.total+=Math.abs(financeAmount(item));
    current.count+=1;
    if(item.status==='done')current.done+=1;
    map.set(key,current);
  });
  const rows=Array.from(map.values()).sort((a,b)=>b.total-a.total || b.count-a.count);
  if(goalStats.invested || goalStats.target){
    rows.unshift({
      name:'Objetivo',
      total:goalStats.invested,
      target:goalStats.target,
      pct:goalStats.pct,
      count:goalStats.investedCount,
      metaCount:goalStats.goalCount
    });
  }
  return rows.slice(0,5);
}

function financeSparkHtml(items){
  const base=items.slice(0,12).map((item,i)=>Math.max(12,Math.min(48,Math.abs(financeAmount(item))/40 + 12 + (i%4)*5)));
  const bars=base.length?base:[14,22,16,30,20,36,24,42];
  return `<div class="finance-spark">${bars.map(h=>`<i style="height:${Math.round(h)}px"></i>`).join('')}</div>`;
}

function financeTransactionHtml(page,item){
  const def=EXTRA_PAGE_MAP[page]||{};
  const amount=financeAmount(item);
  const dir=financeDirection(item);
  const editOpen=item.editing && !RO();
  return `<div class="finance-txn ${dir}" style="--page-color:${def.color||'var(--y)'}">
    ${customIconSvg(dir==='in'||dir==='invest'?'invest':dir==='out'?'cart':'money',dir==='in'?'var(--green)':dir==='invest'?'var(--c)':dir==='out'?'var(--r)':def.color,'finance-txn-icon')}
    <div class="finance-txn-info">
      <b>${htmlEscape(item.title||'Lancamento')}</b>
      <span>${htmlEscape(item.type||'Geral')} ${item.due?'// '+htmlEscape(item.due):''}</span>
    </div>
    <div class="finance-txn-amt">${financeMoney(amount)}</div>
    <div class="finance-txn-actions">
      <span class="badge ${item.status||'todo'}" ${RO()?'':`data-action="cycleCustomItem" data-page="${htmlEscape(page)}" data-id="${Number(item.id)}"`}>${customStatusLabel(item.status)}</span>
      ${RO()?'':`<span class="custom-edit-btn" data-action="callNamed" data-fn="toggleCustomItemEdit" data-arg0="${page}" data-arg1="${item.id}">${editOpen?'FECHAR':'EDITAR'}</span>`}
      ${RO()?'':`<span class="del-btn finance-delete-btn" title="Excluir registro" data-action="callNamed" data-fn="delCustomItem" data-arg0="${page}" data-arg1="${item.id}">X</span>`}
    </div>
    ${editOpen?`<div class="finance-txn-edit">${customItemEditHtml(page,item)}</div>`:''}
  </div>`;
}

function renderFinancePage(page){
  ensureExtraPages();
  const def=EXTRA_PAGE_MAP[page];
  const host=document.getElementById('custom-page-'+page);
  if(!def || !host)return;
  const data=customPageData(page);
  const items=data.items||[];
  const monthKey=/^\d{4}-\d{2}$/.test(financeMonth)?financeMonth:new Date().toISOString().slice(0,7);
  financeMonth=monthKey;
  const cashItems=items.filter(item=>['in','out'].includes(financeDirection(item)) && financeItemInMonth(item,monthKey));
  const investItems=items.filter(item=>financeDirection(item)==='invest');
  const monthlyInvested=investItems.filter(item=>financeItemInMonth(item,monthKey)).reduce((sum,item)=>sum+Math.abs(financeAmount(item)),0);
  const goalItems=items.filter(item=>['invest','goal'].includes(financeDirection(item)));
  const visibleItems=items.filter(item=>{
    const dir=financeDirection(item);
    return ['invest','goal'].includes(dir) || financeItemInMonth(item,monthKey);
  });
  const entries=cashItems.filter(item=>financeDirection(item)==='in').reduce((sum,item)=>sum+Math.abs(financeAmount(item)),0);
  const exits=cashItems.filter(item=>financeDirection(item)==='out').reduce((sum,item)=>sum+Math.abs(financeAmount(item)),0);
  const goalStats=financeGoalStats(items);
  const invested=goalStats.invested;
  const goalTarget=goalStats.target;
  const goalPct=goalStats.pct;
  const balance=entries-exits-monthlyInvested;
  const active=visibleItems.filter(x=>x.status==='active').length;
  const done=items.filter(x=>x.status==='done').length;
  const typeRows=financeRowsByType([...cashItems,...goalItems]);
  host.innerHTML=`
    <div class="custom-dashboard custom-mode-finance finance-dashboard finance-static-dashboard">
      <div class="finance-static-header">
        <button type="button" class="finance-back" data-action="goPage" data-page="home"><span>&lsaquo;</span> VOLTAR</button>
        <div class="finance-title">${customIconSvg('money','var(--green)','finance-title-icon')}<b>${htmlEscape(def.label)}</b></div>
        <div class="finance-flow">${financeMonthLabel(monthKey)} // ${active} abertos</div>
      </div>

      <div class="finance-month-switch">
        <button type="button" data-action="callNamed" data-fn="setFinanceMonth" data-arg0="prev" data-arg1="${page}">&lsaquo;</button>
        <b>${financeMonthLabel(monthKey)}</b>
        <button type="button" data-action="callNamed" data-fn="setFinanceMonth" data-arg0="next" data-arg1="${page}">&rsaquo;</button>
        <button type="button" data-action="callNamed" data-fn="setFinanceMonth" data-arg0="current" data-arg1="${page}">ATUAL</button>
      </div>

      <div class="finance-top-grid">
        <div class="finance-balance-card finance-static-balance">
          <span>SALDO ESTIMADO // EDDIES</span>
          <b>${financeMoney(balance)}</b>
          <em>${entries||exits||monthlyInvested?`Entradas ${financeMoney(entries)} // Saidas ${financeMoney(exits)} // Aportes ${financeMoney(monthlyInvested)}`:'Adicione valores em META / MEDIDA para calcular fluxo.'}</em>
          ${financeSparkHtml(items)}
        </div>

        <div class="finance-goal-panel">
          <div class="finance-panel-title"><span></span><b>OBJETIVO FINANCEIRO</b></div>
          <div class="custom-brief">
            <span class="custom-brief-label">OBJETIVO PRINCIPAL</span>
            <div class="custom-focus" id="custom-focus-${page}">${htmlEscape(data.focus)}</div>
          </div>
          <div class="finance-goal-line"><span>SALDO DO OBJETIVO</span><b>${financeMoney(invested)}${goalTarget?' / '+financeMoney(goalTarget):''}</b></div>
          <div class="finance-goal-track"><i style="width:${goalPct}%"></i></div>
          ${RO()?'':`
          <div class="custom-focus-edit">
            <button class="custom-edit-toggle" data-action="callNamed" data-fn="toggleCustomFocusEdit" data-arg0="${page}">EDITAR OBJETIVO</button>
            <textarea id="custom-focus-input-${page}" class="custom-focus-input" placeholder="Defina o objetivo desta aba..." data-input="updateCustomFocus" data-page="${htmlEscape(page)}">${htmlEscape(data.focus)}</textarea>
          </div>`}
          <div class="finance-tags"><span>${financeMoney(entries)} ENTRADAS</span><span>${financeMoney(exits)} SAIDAS</span><span>${financeMoney(monthlyInvested)} APORTES</span></div>
        </div>
      </div>

      <div class="custom-kpis finance-kpis finance-static-kpis">
        <div class="stat custom-kpi-card"><div class="stat-num">${financeMoney(entries)}</div><div class="stat-label"><span></span> ENTRADAS</div></div>
        <div class="stat custom-kpi-card"><div class="stat-num">${financeMoney(-exits)}</div><div class="stat-label"><span></span> SAIDAS</div></div>
        <div class="stat custom-kpi-card active"><div class="stat-num">${financeMoney(invested)}</div><div class="stat-label"><span></span> OBJETIVO</div></div>
        <div class="stat custom-kpi-card"><div class="stat-num">${financeMoney(balance)}</div><div class="stat-label"><span></span> SALDO</div></div>
      </div>

      <div class="finance-static-grid">
        <div class="finance-left-stack">
          <div class="card finance-budget-card finance-static-card">
            <div class="finance-card-head">
            <div class="ct">${customIconSvg('money','var(--y)','finance-mini-icon')} ORCAMENTO</div>
              <span>${typeRows.length} categorias // ${financeMonthLabel(monthKey)}</span>
            </div>
            <div class="finance-budget-list">
              ${typeRows.length?typeRows.map(row=>{
                const pct=Number.isFinite(row.pct)?row.pct:Math.min(100,Math.round((row.done/Math.max(1,row.count))*100));
                const meta=row.target ? `${financeMoney(row.total)} / ${financeMoney(row.target)}` : `${financeMoney(row.total)} // ${row.count} registros`;
                return `<div class="finance-budget-row">
                  <span><b>${htmlEscape(row.name)}</b><em>${meta}</em></span>
                  <div class="finance-bar"><i style="width:${pct}%"></i></div>
                </div>`;
              }).join(''):`<div class="custom-empty"><span>SEM ORCAMENTO</span><b>Cadastre lancamentos com tipo e valor para ver o fluxo por categoria.</b></div>`}
            </div>
          </div>

          <div class="finance-alert">
            <b>// INTEL FINANCEIRO //</b>
            <span>${items.length?'Revise os registros abertos e feche os quitados para manter o saldo confiavel.':'Crie o primeiro lancamento para ativar o painel financeiro.'}</span>
          </div>
        </div>

        <div class="card finance-ledger-card finance-static-card">
          <div class="finance-card-head">
            <div class="ct">${customIconSvg('invest','var(--green)','finance-mini-icon')} TRANSACOES</div>
            <span>${visibleItems.length} registros</span>
          </div>
          <div class="finance-filter-tabs finance-static-tabs">
            <button type="button" class="${financeFilter==='all'?'active':''}" data-action="callNamed" data-fn="setFinanceFilter" data-arg0="all" data-arg1="${page}">TODOS</button>
            <button type="button" class="${financeFilter==='in'?'active':''}" data-action="callNamed" data-fn="setFinanceFilter" data-arg0="in" data-arg1="${page}">ENTRADAS</button>
            <button type="button" class="${financeFilter==='out'?'active':''}" data-action="callNamed" data-fn="setFinanceFilter" data-arg0="out" data-arg1="${page}">SAIDAS</button>
            <button type="button" class="${financeFilter==='invest'?'active':''}" data-action="callNamed" data-fn="setFinanceFilter" data-arg0="invest" data-arg1="${page}">APORTES</button>
          </div>
          <div id="custom-items-${page}" class="finance-txns finance-static-txns">
            ${(()=>{const filtered=financeFilter==='all'?visibleItems:visibleItems.filter(item=>financeDirection(item)===financeFilter);return filtered.length?filtered.map(item=>financeTransactionHtml(page,item)).join(''):customEmptyHtml(page);})()}
          </div>
          ${RO()?'':customPageFormHtml(page)}
        </div>
      </div>
    </div>`;
}

function renderLojaPage(){
  ensureExtraPages();
  const host=document.getElementById('custom-page-loja');
  if(!host)return;
  const balance=typeof hasInfiniteEddies==='function'&&hasInfiniteEddies()?'€$∞':'€$'+(D().eddies||0);
  const ownedCount=(D().shopUnlocks||[]).length;
  const TABS=[['utility','UTILITÁRIOS'],['mission','MISSOES'],['cosmetic','COSMÉTICOS'],['template','TEMPLATES']];
  const currentTab=typeof shopTab!=='undefined'?shopTab:'utility';
  const shopItems=window.SHOP_ITEMS||[];
  const items=shopItems.filter(item=>(item.tab||'cosmetic')===currentTab);
  const equipped=D().equippedCosmetics||{};
  const activeThemeData=equipped.theme && window.COSMETIC_THEMES ? window.COSMETIC_THEMES[equipped.theme] : null;
  const activeTheme=activeThemeData?.label || (equipped.theme?String(equipped.theme).toUpperCase():'PADRÃO');
  const activeMood=activeThemeData?.mood || 'ASSINATURA PADRAO';
  const prefs=D().prefs||{};
  const focusBoost=prefs.focusBoost?.date===dk() && prefs.focusBoost?.active;
  const dailyUses=Object.entries(prefs.shopUsage||{}).filter(([,v])=>v===dk()).length;
  const weeklyUses=Object.entries(prefs.shopUsage||{}).filter(([,v])=>v===wk()).length;
  const currentTabLabel=TABS.find(t=>t[0]===currentTab)?.[1]||'';
  host.innerHTML=`
    <div class="custom-dashboard loja-dashboard">
      <div class="dist-header page-head custom-page-head" style="--page-color:#b44fff">
        <div class="back-btn" data-action="goPage" data-page="home">HOME</div>
        <div class="page-head-main">
          <div class="dist-title">BLACK MARKET</div>
          <p>Temas de faccao, utilidades e boosts com Eddies.</p>
        </div>
        <div class="page-head-status">${htmlEscape(balance)}</div>
      </div>
      <div class="loja-market-head">
        <div class="loja-market-title"><span>// MERCADO NEGRO //</span><b>BLACK MARKET</b><em>Gaste eddies em skins, boosts e protocolos.</em></div>
        <div class="loja-wallet"><span>SALDO</span><b>${htmlEscape(balance)}</b><small>${htmlEscape(String(ownedCount))} desbloqueios</small></div>
      </div>
      <div class="loja-ops-grid">
        <div class="loja-op-card"><span>ICE</span><b>${Number(D().streakShields||0)}</b><small>escudos para proteger streak</small></div>
        <div class="loja-op-card ${focusBoost?'on':''}"><span>FOCO</span><b>${focusBoost?'ATIVO':'OFF'}</b><small>boost do proximo timer</small></div>
        <div class="loja-op-card"><span>HOJE</span><b>${dailyUses}</b><small>itens diarios usados</small></div>
        <div class="loja-op-card"><span>SEMANA</span><b>${weeklyUses}</b><small>itens semanais usados</small></div>
      </div>
      <div class="loja-tabs">
        ${TABS.map(([id,label])=>`<button type="button" class="${currentTab===id?'active':''}" data-action="callNamed" data-fn="setLojaTab" data-arg0="${htmlEscape(id)}">${htmlEscape(label)}</button>`).join('')}
      </div>
      <div class="loja-market-status"><span>ABA ${htmlEscape(currentTabLabel)}</span><span>TEMA ${htmlEscape(activeTheme)}</span><span>${htmlEscape(activeMood)}</span></div>
      <div class="loja-items">
        ${items.length?items.map(item=>{
          const owned=typeof shopOwns==='function'&&shopOwns(item.id);
          const used=typeof shopUsed==='function'&&shopUsed(item);
          const usable=item.type==='shield'||item.type==='utility'||item.type==='template';
          const meta=typeof shopVisualMeta==='function'?shopVisualMeta(item):{icon:'cart',tone:'yellow',label:'LOOT'};
          const colorMap={yellow:'var(--y)',cyan:'var(--c)',purple:'var(--p)',red:'var(--r)',green:'var(--green)'};
          const color=colorMap[meta.tone]||'var(--y)';
          let btn;
          if(usable||!owned){
            const disabled=RO()||used||(owned&&!usable);
            const label=used?'LIMITE USADO':(owned&&!usable?'DESBLOQUEADO':'EUR$'+item.cost);
            btn=`<button type="button" class="shop-btn${used?' locked':''}" data-action="callNamed" data-fn="buyShopItem" data-arg0="${htmlEscape(item.id)}"${disabled?' disabled':''} >${htmlEscape(label)}</button>`;
          }else{
            const slot=item.type;
            const isEquipped=(D().equippedCosmetics||{})[slot]===(item.theme||item.id);
            btn=`<button type="button" class="shop-btn${isEquipped?' equipped':''}" data-action="callNamed" data-fn="equipCosmetic" data-arg0="${htmlEscape(item.id)}"${RO()?' disabled':''} >${isEquipped?'EQUIPADO':'EQUIPAR'}</button>`;
          }
          const state=usable?(used?'USADO':'DISPONIVEL'):(owned?'DESBLOQUEADO':'BLOQUEADO');
          const limit=item.limit?(item.limit==='weekly'?'SEMANAL':'DIÁRIO'):'PERMANENTE';
          const themeData=item.type==='theme' && item.theme && window.COSMETIC_THEMES ? window.COSMETIC_THEMES[item.theme] : null;
          const swatch=item.type==='theme'?`<div class="shop-skin-swatch ${htmlEscape(item.theme||'default')}"><span></span><b>${htmlEscape(themeData?.mood||'VISUAL HUD')}</b></div>`:'';
          const avatarPreview=item.type==='avatar'&&PROFILE_AVATAR_SVGS[item.value]?`<div class="shop-avatar-preview">${profileAvatarHtml({equippedCosmetics:{avatar:item.id}},0,'shop-avatar-art')}</div>`:'';
          return `<div class="shop-item ${owned?'unlocked':'locked'} shop-${htmlEscape(item.type)}" data-shop-tone="${htmlEscape(meta.tone)}">
            <div class="shop-item-top"><div class="shop-glyph">${customIconSvg(meta.icon,color,'shop-glyph-svg')}</div><div class="shop-meta"><span>${htmlEscape(limit)}</span><span>${htmlEscape(state)}</span></div></div>
            ${swatch}
            ${avatarPreview}
            <div class="shop-tag">${htmlEscape(meta.label)}</div>
            <div class="shop-name">${htmlEscape(item.name)}</div>
            <div class="shop-desc">${htmlEscape(item.desc)}</div>
            <div class="shop-foot"><span class="shop-price">${owned&&!usable?'ADQUIRIDO':'EUR$'+htmlEscape(String(item.cost))}</span>${btn}</div>
          </div>`;
        }).join(''):`<div class="custom-empty"><span>SEM ITENS</span><b>Nenhum item nesta categoria no momento.</b></div>`}
      </div>
    </div>`;
}

function setLojaTab(tab){
  if(typeof shopTab!=='undefined')shopTab=(typeof isShopTab==='function'?isShopTab(tab):['utility','mission','cosmetic','template'].includes(tab))?tab:'utility';
  renderLojaPage();
}

function renderExtraPage(page){
  ensureExtraPages();
  const def=EXTRA_PAGE_MAP[page];
  const host=document.getElementById('custom-page-'+page);
  if(!def || !host)return;
  if(page==='loja'){renderLojaPage();return;}
  if(page==='financas'){
    renderFinancePage(page);
    return;
  }
  const data=customPageData(page);
  const total=data.items.length;
  const active=data.items.filter(x=>x.status==='active').length;
  const done=data.items.filter(x=>x.status==='done').length;
  const next=data.items.find(x=>x.status==='active') || data.items.find(x=>x.status!=='done');
  const mode=customPageMode(page);
  const modeLabel={finance:'OPERACOES',routine:'ROTINA',objective:'OBJETIVOS'}[mode];
  const purpose={finance:'Controle de fluxo, contas e prioridades financeiras.',routine:'Rotina executavel com proximo passo visivel.',objective:'Objetivos customizados com progresso e prioridade.'}[mode];
  const treinoEmpty=page==='treino' && !data.items.length && !(data.weightLogs||[]).length && !data.weightStarterOpen;
  host.innerHTML=`
    <div class="custom-dashboard custom-mode-${mode}">
      ${tabHeaderHtml({page,title:def.label,purpose,status:tabCountLabel(total,'item','itens')+' // '+active+' ativos',color:def.color,actionLabel:customStarterLabel(page)})}
      <div class="custom-hero card" style="--page-color:${def.color}">
        <div class="ct">${htmlEscape(def.label)} <span class="custom-chip">${modeLabel}</span></div>
        <div class="custom-brief">
          <span class="custom-brief-label">OBJETIVO PRINCIPAL</span>
          <div class="custom-focus" id="custom-focus-${page}">${htmlEscape(data.focus)}</div>
        </div>
        ${RO()?'':`
        <div class="custom-focus-edit">
          <button class="custom-edit-toggle" data-action="callNamed" data-fn="toggleCustomFocusEdit" data-arg0="${page}">EDITAR OBJETIVO</button>
          <textarea id="custom-focus-input-${page}" class="custom-focus-input" placeholder="Defina o objetivo desta aba..." data-input="updateCustomFocus" data-page="${htmlEscape(page)}">${htmlEscape(data.focus)}</textarea>
        </div>`}
      </div>
      <div class="custom-kpis">
        ${customKpiHtml(page,total,active,done)}
      </div>
      ${page==='treino'&&!treinoEmpty?treinoSessionHtml(data):''}
      <div class="card full custom-list-card" style="--page-color:${def.color}">
        <div class="ct">${customPlanTitle(page)}</div>
        <div class="custom-next">${next?`<span>PROXIMO</span><b>${htmlEscape(next.title)}</b>`:'<span>PROXIMO</span><b>NENHUM ITEM ATIVO</b>'}</div>
        <div id="custom-items-${page}" class="custom-items">
          ${treinoEmpty?treinoEmptyHtml():data.items.length?data.items.map(item=>customItemHtml(page,item)).join(''):customEmptyHtml(page)}
        </div>
        ${RO()||treinoEmpty?'':customPageFormHtml(page)}
      </div>
      ${page==='treino'&&!treinoEmpty?customWeightPanelHtml(data):''}
    </div>`;
}

function treinoEmptyHtml(){
  return `<div class="treino-empty">
    <div class="treino-empty-main">
      ${customIconSvg('workout','#fcee09','treino-empty-icon')}
      <div>
        <span>ACADEMIA VAZIA</span>
        <b>Comece com um treino simples e registre carga apenas quando fizer a sessao.</b>
      </div>
    </div>
    ${RO()?'':`<div class="treino-empty-actions">
      <button type="button" data-action="callNamed" data-fn="createStarterForPage" data-arg0="treino">CRIAR TREINO A</button>
      <button type="button" data-action="callNamed" data-fn="showTreinoWeightStarter">REGISTRAR CARGA</button>
    </div>`}
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
    ${RO()?'':`<button type="button" data-action="callNamed" data-fn="createStarterForPage" data-arg0="${page}">${cta}</button>`}
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

function showTreinoWeightStarter(){
  if(RO())return;
  ensureCustomPagesData();
  myData.customPages.treino.weightStarterOpen=true;
  renderExtraPage('treino');
  setTimeout(()=>document.getElementById('weight-exercise')?.focus(),80);
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
        <span class="badge ${item.status||'todo'}" ${RO()?'':`data-action="cycleCustomItem" data-page="${htmlEscape(page)}" data-id="${Number(item.id)}"`}>${customStatusLabel(item.status)}</span>
        ${RO()?'':`<span class="custom-edit-btn" data-action="callNamed" data-fn="toggleCustomItemEdit" data-arg0="${page}" data-arg1="${item.id}">${editOpen?'FECHAR':'EDITAR'}</span>`}
        ${RO()?'':`<span class="del-btn" data-action="callNamed" data-fn="delCustomItem" data-arg0="${page}" data-arg1="${item.id}">X</span>`}
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
        <button class="btn btn-y" data-action="callNamed" data-fn="saveCustomItemEdit" data-arg0="${page}" data-arg1="${item.id}">SALVAR</button>
        <button class="btn" data-action="callNamed" data-fn="toggleCustomItemEdit" data-arg0="${page}" data-arg1="${item.id}" style="color:var(--muted);border-color:var(--border)">CANCELAR</button>
      </div>
    </div>`;
}

function customPageFormHtml(page){
  return `
    <div class="add-form custom-add-form">
      <div class="sdiv">ADICIONAR OBJETIVO</div>
      ${page==='financas'?financeQuickAddHtml(page):''}
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
      <div class="btns"><button class="btn btn-y" data-action="callNamed" data-fn="addCustomItem" data-arg0="${page}">ADICIONAR</button></div>
    </div>`;
}

function financeQuickAddHtml(page){
  const actions=[
    ['salario','SALARIO','Entrada mensal'],
    ['aporte','APORTE','Investimento'],
    ['gasto','GASTO','Saida / conta'],
    ['objetivo','OBJETIVO','Meta financeira']
  ];
  return `<div class="finance-quick-add" aria-label="Adicionar lancamento rapido">
    ${actions.map(([kind,label,desc])=>`<button type="button" data-action="callNamed" data-fn="applyFinanceQuickAdd" data-arg0="${htmlEscape(kind)}" data-arg1="${htmlEscape(page)}"><span>${htmlEscape(label)}</span><b>${htmlEscape(desc)}</b></button>`).join('')}
  </div>`;
}

function applyFinanceQuickAdd(kind,page='financas'){
  if(RO() || page!=='financas')return;
  const today=new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
  const presets={
    salario:{
      title:'Salario',
      type:'Entrada',
      metric:'R$ ',
      priority:'Alta',
      due:'Mensal',
      progress:'0',
      next:'Confirmar recebimento',
      note:'Receita principal do mes.'
    },
    aporte:{
      title:'Aporte',
      type:'Investimento',
      metric:'R$ ',
      priority:'Media',
      due:today,
      progress:'0',
      next:'Registrar destino do aporte',
      note:'Aporte para reserva, corretora ou objetivo.'
    },
    gasto:{
      title:'Gasto',
      type:'Saida',
      metric:'R$ ',
      priority:'Media',
      due:today,
      progress:'0',
      next:'Conferir categoria e comprovante',
      note:'Despesa registrada no fluxo do dia.'
    },
    objetivo:{
      title:'Objetivo financeiro',
      type:'Objetivo',
      metric:'R$ ',
      priority:'Alta',
      due:'Meta',
      progress:'0',
      next:'Definir valor alvo e prazo',
      note:'Meta financeira para acompanhar progresso.'
    }
  };
  const preset=presets[kind]||presets.gasto;
  const set=(id,value)=>{const el=document.getElementById(`custom-${id}-${page}`);if(el)el.value=value;};
  set('title',preset.title);
  set('type',preset.type);
  set('metric',preset.metric);
  set('due',preset.due);
  set('progress',preset.progress);
  set('next',preset.next);
  set('note',preset.note);
  const priority=document.getElementById(`custom-priority-${page}`);
  if(priority)priority.value=preset.priority;
  const metric=document.getElementById(`custom-metric-${page}`);
  metric?.focus?.();
  metric?.setSelectionRange?.(metric.value.length,metric.value.length);
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
  const item={id:Date.now(),title,type:type||'Objetivo',metric,priority,due,progress,nextStep,note,status:'active',updatedAt:new Date().toISOString()};
  if(page==='financas' && ['in','out','invest'].includes(financeDirection(item)))item.financeMonth=financeMonth;
  myData.customPages[page].items.unshift(item);
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
  if(page==='financas'){
    const dir=financeDirection(item);
    if(['in','out','invest'].includes(dir))item.financeMonth=item.financeMonth||financeMonth;
    else delete item.financeMonth;
  }
  item.editing=false;
  renderExtraPage(page);
  scheduleAutoSave();
}

function customWeightPanelHtml(data){
  const logs=(data.weightLogs||[]).slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')) || b.id-a.id);
  const best=logs.reduce((max,l)=>Math.max(max,Number(l.weight)||0),0);
  const last=logs[0];
  const stats=weightExerciseStats(logs);
  const compact=!logs.length && !data.weightStarterOpen;
  return `
    <div class="card full custom-weight-card" style="--page-color:#fcee09">
      <div class="ct">Carga por dia <span class="custom-chip">EVOLUCAO</span></div>
      ${compact?`<div class="custom-empty treino-weight-empty"><span>SEM CARGAS</span><b>Registre uma carga depois do primeiro treino. O formulario fica escondido para manter a aba limpa.</b>${RO()?'':`<button type="button" data-action="callNamed" data-fn="showTreinoWeightStarter">REGISTRAR PRIMEIRA CARGA</button>`}</div>`:`
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
        <div class="btns"><button class="btn btn-y" data-action="callNamed" data-fn="addWeightLog">SALVAR CARGA</button></div>
      </div>`}
      <div class="custom-weight-list">
        ${logs.length?logs.map(log=>weightLogHtml(log)).join(''):'<div class="custom-empty"><span>SEM CARGAS</span><b>Registre o peso de cada treino para comparar ultima carga, recorde e evolucao por exercicio.</b></div>'}
      </div>
      `}
    </div>`;
}

function treinoSessionHtml(data){
  const logs=(data.weightLogs||[]);
  const today=localDateKey();
  const todayLogs=logs.filter(l=>l.date===today);
  const last7=[];
  for(let i=6;i>=0;i--){
    const d=new Date(); d.setDate(d.getDate()-i);
    const dk2=localDateKey(d);
    const has=logs.some(l=>l.date===dk2);
    const days=['DOM','SEG','TER','QUA','QUI','SEX','SÁB'];
    last7.push({label:days[d.getDay()],date:dk2,active:has,today:dk2===today});
  }
  const split=String(data.split||'').toUpperCase()||'';
  const SPLITS=['PUSH','PULL','LEGS','FULL BODY','CARDIO','REST'];
  return `
    <div class="treino-session-panel card" style="--page-color:#fcee09">
      <div class="ct">// SESSÃO DE HOJE // <span class="custom-chip">${todayLogs.length} exercícios hoje</span></div>
      <div class="treino-split-row">
        <span class="treino-split-label">SPLIT DO DIA</span>
        <div class="treino-split-opts">
          ${SPLITS.map(s=>`<button type="button" class="treino-split-btn${split===s?' active':''}" data-action="callNamed" data-fn="setTreinoSplit" data-arg0="${htmlEscape(s)}">${htmlEscape(s)}</button>`).join('')}
        </div>
      </div>
      <div class="treino-week-grid">
        ${last7.map(d=>`
          <div class="treino-week-day ${d.active?'on':''} ${d.today?'today':''}">
            <span>${d.label}</span>
            <div class="treino-week-cell">${d.active?customIconSvg('workout','#fcee09','twc-icon'):customIconSvg('sleep','var(--border)','twc-icon')}</div>
          </div>`).join('')}
      </div>
    </div>`;
}

function setTreinoSplit(split){
  if(RO())return;
  ensureCustomPagesData();
  const allowed=['PUSH','PULL','LEGS','FULL BODY','CARDIO','REST'];
  if(!allowed.includes(split))return;
  myData.customPages.treino.split=split;
  scheduleAutoSave();
  renderExtraPage('treino');
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
      ${RO()?'':`<span class="del-btn" data-action="callNamed" data-fn="delWeightLog" data-arg0="${log.id}">X</span>`}
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
  myData.customPages.treino.weightStarterOpen=false;
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
  if(task?.onlyDate)return localDateKey(date)===String(task.onlyDate);
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
      el.innerHTML=RO()
        ? publicEmpty('DIA DE DESCANSO','Este operador nao programou contratos publicos para hoje.')
        : emptyActionCard({
          title:'DIA DE DESCANSO',
          body:'Nenhum contrato programado para hoje. Use descanso real ou crie uma acao avulsa.',
          primaryLabel:'+ CONTRATO AVULSO',
          primaryAction:'openContractModal()',
          secondaryLabel:'USAR ROTINA BASICA',
          secondaryAction:"autoBuildFromHome('rotina')",
          compact:true
        });
      renderArchivedTasks();
      return;
    }
    el.innerHTML=RO()
      ? publicEmpty('PERFIL SEM CONTRATOS VISIVEIS','Sem dados compartilhados.')
      : emptyActionCard({
          title:'PRIMEIRO CONTRATO PENDENTE',
          body:'Comece com uma acao de 10 minutos ou deixe o sistema montar uma rotina base.',
          primaryLabel:'+ CRIAR PRIMEIRO CONTRATO',
          primaryAction:'openContractModal()',
          secondaryLabel:'USAR ROTINA BASICA',
          secondaryAction:"autoBuildFromHome('rotina')"
        });
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
    <div class="task${done?' done':''}${RO()?' readonly':''}${t.priority?' priority':''}" data-task-index="${t.index}" style="--cat-color:${catColor}" data-action="toggleTask" data-dbl-action="toggleTaskPriority" data-stop-propagation="true" data-index="${t.index}">
      ${RO()?'':`<button type="button" class="task-drag-handle" aria-label="Arrastar contrato" title="Segure e arraste para ordenar" data-action="startTaskDrag" data-index="${t.index}">≡</button>`}
      ${t.priority?'<span class="task-pin">⚡</span>':''}
      <div class="task-box">✓</div>
      <div class="task-main">
        <span class="task-text">${htmlEscape(t.text)}${wasYesterdayPending&&!done?` <span class="task-yesterday">ONTEM</span>`:''}${t.hard?'<span class="task-hard-badge">⚡ DIFÍCIL</span>':''}</span>
        <span class="task-meta">${htmlEscape([t.category,t.frequency,t.reminder?('Lembrete '+t.reminder):''].filter(Boolean).join(' // '))}</span>
      </div>
      ${t.shopMission?.rewardText?`<span class="task-reward">${htmlEscape(t.shopMission.rewardText)}</span>`:''}
      ${t.tag?`<span class="task-tag">${htmlEscape(t.tag)}</span>`:''}
      ${(!RO() && !done)?`<button type="button" class="task-focus-btn" data-action="callNamed" data-fn="openTaskFocus" data-arg0="${t.index}" data-stop-propagation="true" title="Iniciar foco neste contrato">◎</button>`:''}
      ${RO()?'':`<button type="button" class="task-delete-btn" data-action="callNamed" data-fn="deleteTask" data-arg0="${t.index}" data-stop-propagation="true" title="Excluir contrato" aria-label="Excluir contrato">X</button>`}
      ${RO()?'':`<div class="task-actions" data-stop-propagation="true">
        <button type="button" data-action="callNamed" data-fn="openContractModal" data-arg0="${t.index}">EDITAR</button>
        <button type="button" data-action="callNamed" data-fn="duplicateTask" data-arg0="${t.index}">DUPLICAR</button>
        <button type="button" class="danger" data-action="callNamed" data-fn="archiveTask" data-arg0="${t.index}">ARQUIVAR</button>
      </div>`}
    </div>`;
  }).join('');
  // Update complete-all button visibility
  const allDone=withDone.length>0&&withDone.every(x=>x.done);
  const cab=document.getElementById('complete-all-btn');
  if(cab)cab.style.display=allDone?'none':'';
  applyTodayModeTaskLimit();
}

// Modo Hoje: mostra so os 5 contratos pendentes mais relevantes; concluidos somem da vista.
function applyTodayModeTaskLimit(){
  if(!document.body.classList.contains('today-mode'))return;
  const items=[...document.querySelectorAll('#tm-tasks .task')];
  let pendingShown=0;
  items.forEach(el=>{
    const done=el.classList.contains('done');
    let hide=done;
    if(!done){
      pendingShown++;
      if(pendingShown>5)hide=true;
    }
    el.classList.toggle('tm-hide',hide);
  });
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
    tbody.innerHTML=RO()?`<tr><td colspan="8">${publicEmpty('TRACKER SEM DADOS PUBLICOS','Sem dados compartilhados.')}</td></tr>`:`<tr><td colspan="8"><div class="smart-empty compact"><span>SEM HABITOS</span><b>Crie seu primeiro contrato para ativar o tracker semanal.</b><div class="smart-actions"><button type="button" data-action="callNamed" data-fn="openContractModal">+ CRIAR PRIMEIRO CONTRATO</button></div></div></td></tr>`;
    return;
  }
  tbody.innerHTML = habits.map(h => {
    const cells = ['SEG','TER','QUA','QUI','SEX','SAB','DOM'].map((_,i) =>
      `<td><div class="hcell readonly${saved[h+'_'+i]?' on':''}" title="Marcado automaticamente pelos contratos">✓</div></td>`
    ).join('');
    const reminderTime=(myData.habitReminders||{})[h]?.time||'';
    return `<tr><td title="${htmlEscape(h)}">${htmlEscape(h)}</td>${cells}<td class="habit-reminder-cell"><input type="time" class="habit-time-input" data-habit="${htmlEscape(h)}" data-change="setHabitReminder" value="${htmlEscape(reminderTime)}"></td></tr>`;
  }).join('');
}

function setHabitReminder(input){
  if(RO())return;
  const habit=input.dataset.habit;
  const time=input.value;
  if(!myData.habitReminders) myData.habitReminders={};
  myData.habitReminders[habit]={time, enabled:!!time};
  scheduleAutoSave();
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

function progressRing(pct,color='var(--y)',size=52){
  const r=20,c=2*Math.PI*r,dash=c*(Math.min(100,Math.max(0,pct))/100);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--border)" stroke-width="3"/><circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${dash} ${c-dash}" transform="rotate(-90 ${size/2} ${size/2})"/></svg>`;
}

function renderConsistencyPanel(){
  const el=document.getElementById('consistency-panel');
  if(!el)return;
  try{
  const habits=getHabits();
  if(!habits.length){el.innerHTML=RO()?publicEmpty('CONSISTENCIA NAO PUBLICADA','Sem dados compartilhados.'):`<div class="smart-empty"><span>SEM CONSISTENCIA</span><b>Marque seu primeiro contrato.</b><div class="smart-actions"><button type="button" data-action="callNamed" data-fn="autoBuildFromHome" data-arg0="rotina">MONTAR ROTINA BASICA</button><button type="button" data-action="callNamed" data-fn="openContractModal">+ CRIAR PRIMEIRO CONTRATO</button></div></div>`;return;}
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
      <div class="ckpi ckpi-ring" title="Semana atual">
        <div class="ckpi-ring-wrap">${progressRing(weekPct,weekPct<35?'var(--r)':weekPct<70?'var(--y)':'var(--c)')}<div class="ckpi-ring-num">${weekPct}%</div></div>
        <div class="ckpi-label">📅 semana</div>
      </div>
      <div class="ckpi ckpi-ring" title="Mes atual">
        <div class="ckpi-ring-wrap">${progressRing(monthPct,monthPct<35?'var(--r)':monthPct<70?'var(--y)':'var(--c)')}<div class="ckpi-ring-num">${monthPct}%</div></div>
        <div class="ckpi-label">📆 mes</div>
      </div>
      <div class="ckpi" title="Melhor habito da semana"><div class="ckpi-icon">⬆</div><div class="ckpi-num">${htmlEscape((best?.name||'--').split(/[\s-–]/)[0])}</div></div>
      <div class="ckpi" title="Pior habito da semana"><div class="ckpi-icon">⬇</div><div class="ckpi-num">${htmlEscape((worst?.name||'--').split(/[\s-–]/)[0])}</div></div>
      <div class="ckpi" title="Melhor dia da semana (${bd.pct}%)"><div class="ckpi-icon">🗓</div><div class="ckpi-num">${bd.day}</div></div>
      <div class="ckpi" title="Dias perfeitos no mes"><div class="ckpi-icon">⭐</div><div class="ckpi-num">${perfectDays}</div></div>
      <div class="ckpi" title="Streak de dias perfeitos"><div class="ckpi-icon">🔥</div><div class="ckpi-num">${pStreak}d</div></div>
      <div class="ckpi" title="Top habito do mes (${topHabit?.pct||0}%)"><div class="ckpi-icon">🏆</div><div class="ckpi-num">${htmlEscape((topHabit?.name||'--').split(/[\s-–]/)[0])}</div></div>
      <div class="ckpi" title="Variacao vs mes passado"><div class="ckpi-icon">${monthDiff>=0?'↑':'↓'}</div><div class="ckpi-num" style="color:${monthDiff>0?'var(--c)':monthDiff<0?'var(--r)':'inherit'}">${monthDiff>=0?'+':''}${monthDiff}%</div></div>
      <div class="ckpi" title="Conquistas desbloqueadas"><div class="ckpi-icon">🏅</div><div class="ckpi-num">${achUnlocked}/${ACHIEVEMENTS.length}</div></div>
    </div>
    <div class="consistency-grid">
      <div>
        ${rows.map(r=>`<div class="chart-row"><div class="chart-label" title="${htmlEscape(r.name)}">${htmlEscape(r.name.split(/[\s-–]/)[0])}</div><div class="chart-track"><div class="chart-fill" style="width:${r.pct}%;background:${r.pct<35?'var(--r)':r.pct<70?'linear-gradient(90deg,var(--y),var(--c))':'linear-gradient(90deg,var(--c),var(--y))'}"></div></div></div>`).join('')}
      </div>
      <div class="streak-list">
        ${rows.map(r=>`<div class="streak-item" title="${streakTooltip(data,r.name)}"><div class="streak-name">${htmlEscape(r.name.split(/[\s-–]/)[0])}</div><div class="streak-pill${r.streak===0?' streak-zero':''}">${r.streak>0?r.streak+'🔥':'—'}</div></div>`).join('')}
        ${(()=>{const tagStreakEntries=Object.entries(myData.tagStreaks||{}).sort((a,b)=>b[1].current-a[1].current).slice(0,3);if(!tagStreakEntries.length)return '';return tagStreakEntries.map(([tag,s])=>`<div class="streak-item"><div class="streak-name">#${htmlEscape(tag)}</div><div class="streak-pill">${s.current}🔥</div></div>`).join('');})()}
      </div>
      <div class="history-panel">
        <div class="history-title" title="Consistencia das ultimas 6 semanas">📊</div>
        <div class="history-strip">
          ${weekTrend.map(w=>`<div class="history-bar" title="${formatWeekKey(w.key)}: ${w.pct}%"><span style="height:${Math.max(4,w.pct)}%;background:${w.pct<35?'var(--r)':w.pct<70?'var(--y)':'var(--c)'}"></span></div>`).join('')}
        </div>
      </div>
      <div class="history-panel">
        <div class="history-title" title="Eddies ganhos por dia (14 dias)">€$</div>
        <div class="history-strip history-strip-14">
          ${(()=>{const eddiesHistKeys=Array.from({length:14},(_,i)=>{const d=new Date();d.setDate(d.getDate()-13+i);return localDateKey(d);});const eddiesHist=myData.eddiesHistory||{};const maxEd=Math.max(1,...eddiesHistKeys.map(k=>eddiesHist[k]||0));return eddiesHistKeys.map(k=>`<div class="history-bar" title="${k}: €$${eddiesHist[k]||0}"><span style="height:${Math.max(4,Math.round(((eddiesHist[k]||0)/maxEd)*100))}%"></span></div>`).join('');})()}
        </div>
      </div>
      <div class="history-panel">
        <div class="history-title" title="Metas do mes">◎</div>
        ${goalRows.map(r=>`<div class="chart-row goal-row"><div class="chart-label" title="${htmlEscape(r.name)}">${htmlEscape(r.name.split(/[\s-–]/)[0])}</div><div class="chart-track"><div class="chart-fill goal-fill" style="width:${r.pct}%"></div></div><div class="chart-value">${htmlEscape(r.value)}</div></div>`).join('')}
      </div>
      <div class="history-panel full-span">
        ${(()=>{try{return monthHeatmapHtml();}catch(e){return '';}})()}
      </div>
      <div class="history-panel full-span" id="evolution-history-panel">
        ${evolutionHistoryHtml()}
      </div>
    </div>
    <div style="text-align:right;margin-top:8px"><button class="btn" data-action="callNamed" data-fn="exportWeeklyStats" style="font-size:9px;padding:5px 12px;color:var(--muted);border-color:var(--border)">↓ STATS</button></div>`;
  }catch(e){
    console.error('[NC] renderConsistencyPanel falhou:',e);
    el.innerHTML=`<div class="empty" style="color:var(--r)">ERRO AO RENDERIZAR PAINEL — veja o console (F12) para detalhes: ${htmlEscape(String(e))}</div>`;
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


/* Gamificacao: Street Cred movido para modules/gamification.js */
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


/* Gamificacao: conquistas, desafios e quests movido para modules/gamification.js */

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
  if(!navigator.onLine){el.textContent='OFFLINE';el.classList.add('offline');return;}
  el.classList.remove('offline');
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


/* Gamificacao: exportacao de stats e rank visual movido para modules/gamification.js */
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

function toastDurationMs(duration){
  const requested=Number(duration)||3600;
  return Math.max(1800,Math.min(requested,3600));
}

function showCyberToast(title,message,duration=3600){
  const stack=document.getElementById('notify-stack');
  if(!stack)return;
  duration=toastDurationMs(duration);
  const toast=document.createElement('div');
  toast.className='cyber-toast';
  toast.style.setProperty('--dur',duration+'ms');
  toast.innerHTML=`<div class="toast-head"><span>${htmlEscape(title)}</span><span class="toast-time">${Math.ceil(duration/1000)}s</span><button type="button" class="toast-close" aria-label="Fechar notificacao">×</button></div><div class="toast-body">${htmlEscape(message)}</div><div class="toast-progress"></div>`;
  stack.appendChild(toast);
  const timeEl=toast.querySelector('.toast-time');
  const started=Date.now();
  let closed=false;
  const close=()=>{
    if(closed)return;
    closed=true;
    clearInterval(tick);
    toast.style.animation='toastOut .18s ease forwards';
    setTimeout(()=>toast.remove(),220);
  };
  const tick=setInterval(()=>{
    const left=Math.max(0,Math.ceil((duration-(Date.now()-started))/1000));
    if(timeEl)timeEl.textContent=left+'s';
  },250);
  toast.querySelector('.toast-close')?.addEventListener('click',close);
  setTimeout(close,duration);
}

// Toast com botao de acao (ex: DESFAZER). onAction roda se o usuario clicar.
function showActionToast(title,message,actionLabel,onAction,duration=3600){
  const stack=document.getElementById('notify-stack');
  if(!stack){onAction&&null;return;}
  duration=toastDurationMs(duration);
  const toast=document.createElement('div');
  toast.className='cyber-toast';
  toast.style.setProperty('--dur',duration+'ms');
  toast.innerHTML=`<div class="toast-head"><span>${htmlEscape(title)}</span><span class="toast-time">${Math.ceil(duration/1000)}s</span><button type="button" class="toast-close" aria-label="Fechar notificacao">×</button></div><div class="toast-body">${htmlEscape(message)}</div><button type="button" class="toast-action">${htmlEscape(actionLabel)}</button><div class="toast-progress"></div>`;
  stack.appendChild(toast);
  const timeEl=toast.querySelector('.toast-time');
  const started=Date.now();
  let done=false;
  const close=()=>{
    if(done)return;
    done=true;
    clearInterval(tick);
    toast.style.animation='toastOut .18s ease forwards';
    setTimeout(()=>toast.remove(),220);
  };
  const tick=setInterval(()=>{
    const left=Math.max(0,Math.ceil((duration-(Date.now()-started))/1000));
    if(timeEl)timeEl.textContent=left+'s';
  },250);
  toast.querySelector('.toast-close')?.addEventListener('click',close);
  toast.querySelector('.toast-action')?.addEventListener('click',()=>{
    if(done)return;done=true;
    try{onAction&&onAction();}catch(e){console.error('Undo falhou:',e);}
    clearInterval(tick);
    toast.style.animation='toastOut .18s ease forwards';
    setTimeout(()=>toast.remove(),220);
  });
  setTimeout(close,duration);
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
    <label class="flabel">LIVRO FALLBACK</label><input type="text" value="${htmlEscape(g.bookTitle)}" data-input="updateGoalField" data-field="bookTitle">
    <label class="flabel">META LIVROS/MES</label><input type="number" min="1" max="99" value="${Number(g.monthlyBooks)||1}" data-input="updateGoalField" data-field="monthlyBooks" data-number="true" data-fallback="1">
    <label class="flabel">DEV FALLBACK</label><input type="text" value="${htmlEscape(g.devFocus)}" data-input="updateGoalField" data-field="devFocus">
    <label class="flabel">SKILL FALLBACK</label><input type="text" value="${htmlEscape(g.skillFocus)}" data-input="updateGoalField" data-field="skillFocus">
    <label class="flabel">JOGO FALLBACK</label><input type="text" value="${htmlEscape(g.gameFocus)}" data-input="updateGoalField" data-field="gameFocus">
    <label class="flabel">VIOLAO MIN/DIA</label><input type="number" min="1" max="999" value="${Number(g.guitarMinutes)||15}" data-input="updateGoalField" data-field="guitarMinutes" data-number="true" data-fallback="15">`;
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
let _dragRafId=null;

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
  host.innerHTML=CONTRACT_TEMPLATES.map((t,i)=>`<button type="button" data-action="callNamed" data-fn="applyContractTemplate" data-arg0="${i}">${htmlEscape(t.label)}</button>`).join('');
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
  const hardEl=document.getElementById('contract-hard'); if(hardEl) hardEl.checked=!!(task.hard);
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
    hard:!!(document.getElementById('contract-hard')?.checked),
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
  const source=event.target.closest('.task');
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
  if(_dragRafId)return;
  const x=event.clientX,y=event.clientY;
  _dragRafId=requestAnimationFrame(()=>{
    _dragRafId=null;
    if(!taskDragState)return;
    const target=document.elementFromPoint(x,y)?.closest?.('.task');
    document.querySelectorAll('#task-list .task.drag-before,#task-list .task.drag-after,#task-list .task.drag-target').forEach(el=>el.classList.remove('drag-before','drag-after','drag-target'));
    if(!target || !target.dataset.taskIndex || Number(target.dataset.taskIndex)===taskDragState.from)return;
    const box=target.getBoundingClientRect();
    const position=y > box.top + box.height/2 ? 'after' : 'before';
    taskDragState.target=Number(target.dataset.taskIndex);
    taskDragState.position=position;
    target.classList.add('drag-target',position==='after'?'drag-after':'drag-before');
  });
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
  window.removeEventListener('pointerup',finishTaskDrag);
  window.removeEventListener('pointercancel',cancelTaskDrag);
  if(_dragRafId){cancelAnimationFrame(_dragRafId);_dragRafId=null;}
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

async function deleteTask(index){
  if(RO())return;
  if(!(await confirmDanger('Excluir este contrato? O historico semanal ja salvo sera preservado, mas o contrato saira da rotina.')))return;
  syncTodayTasksFromDom();
  const defs=ensureEditableTaskDefs();
  const removed=defs[index];
  if(!removed)return;
  const checked=checkedTasksByIdentity(defs);
  defs.splice(index,1);
  restoreChecksAfterTaskOrder(defs,checked);
  renderTasks();
  syncTodayHabitsFromTasks();
  updateStats();
  scheduleAutoSave();
  showCyberToast('CONTRATO EXCLUIDO',(removed.text||'Contrato')+' removido da rotina.');
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
      ${RO()?'':`<button type="button" data-action="callNamed" data-fn="restoreTask" data-arg0="${t.index}">RESTAURAR</button>`}
    </div>`).join('')}`:emptyActionCard({
      title:'ARQUIVO LIMPO',
      body:'Contratos arquivados aparecem aqui para voce recuperar sem perder historico.',
      primaryLabel:'+ NOVO CONTRATO',
      primaryAction:'openContractModal()',
      secondaryLabel:'MONTAR ROTINA BASICA',
      secondaryAction:"autoBuildFromHome('rotina')",
      compact:true
    });
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
      <input type="text" value="${htmlEscape(t.text)}" data-input="updateTaskDefField" data-index="${i}" data-field="text" style="flex:1;font-size:12px;padding:5px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--ui)">
      <input type="text" value="${htmlEscape(t.tag||'')}" placeholder="tag" data-input="updateTaskDefField" data-index="${i}" data-field="tag" style="width:90px;font-size:12px;padding:5px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--mono)">
      <button type="button" title="Prioridade" data-action="callNamed" data-fn="toggleTaskPriority" data-arg0="${i}" style="font-family:var(--mono);font-size:11px;padding:4px 7px;border:1px solid ${t.priority?'var(--y)':'var(--border)'};background:${t.priority?'rgba(252,238,9,.1)':'transparent'};color:${t.priority?'var(--y)':'var(--muted)'};border-radius:3px;cursor:pointer">⚡</button>
      <button type="button" class="mini-remove" data-action="callNamed" data-fn="removeTaskItem" data-arg0="${i}">X</button>
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
      <input type="text" value="${htmlEscape(h)}" data-input="updateHabitDef" data-index="${i}" style="flex:1;font-size:12px;padding:5px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--ui)">
      <button type="button" class="mini-remove" data-action="callNamed" data-fn="removeHabitItem" data-arg0="${i}">X</button>
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

function updateTagStreaks(){
  if(RO())return;
  const today=dk();
  const saved=(myData.tasks||{})[today]||{};
  const defs=allTaskDefs(D());
  if(!myData.tagStreaks) myData.tagStreaks={};
  // Coleta tags com pelo menos 1 tarefa completada hoje
  const completedTags=new Set();
  defs.forEach((t,i)=>{if(saved[i] && t.tag) completedTags.add(t.tag);});
  // Atualiza streaks
  completedTags.forEach(tag=>{
    const s=myData.tagStreaks[tag]||{current:0,best:0,lastDate:''};
    const yesterday=localDateKey(new Date(Date.now()-864e5));
    if(s.lastDate===yesterday||s.lastDate==='') s.current=(s.lastDate===''?0:s.current)+1;
    else if(s.lastDate!==today) s.current=1;
    s.best=Math.max(s.best,s.current);
    s.lastDate=today;
    myData.tagStreaks[tag]=s;
  });
}

function grantShopMissionReward(task){
  const mission=task?.shopMission;
  if(!mission?.key || RO())return {text:'',paid:false};
  myData.prefs={...(myData.prefs||{})};
  myData.prefs.shopMissionRewards={...(myData.prefs.shopMissionRewards||{})};
  if(myData.prefs.shopMissionRewards[mission.key])return {text:'',paid:false};
  const reward=mission.reward||{};
  const parts=[];
  if(reward.eddies){
    const got=awardEddies(Number(reward.eddies)||0,'shop_mission');
    if(got)parts.push('+EUR$'+got);
  }
  if(reward.shield){
    myData.streakShields=(myData.streakShields||0)+(Number(reward.shield)||0);
    parts.push('ICE +'+reward.shield);
    if(typeof renderStreakShield==='function')renderStreakShield();
  }
  if(reward.focusBoost){
    myData.prefs.focusBoost={date:dk(),active:true};
    parts.push('FOCO BOOST');
  }
  myData.prefs.shopMissionRewards[mission.key]={date:dk(),itemId:mission.itemId,label:mission.label,reward:parts};
  if(parts.length)showCyberToast('CONTRATO PREMIUM PAGO',(mission.label||'Missao da Loja')+' // '+parts.join(' // '),6200);
  updateEddiesDisplay();
  return {text:parts.join(' // '),paid:parts.length>0};
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
  applyTodayModeTaskLimit();
  syncTodayTasksFromDom();
  syncTodayHabitsFromTasks();
  updateStats();
  const nowDone=el.classList.contains('done');
  if(nowDone && !wasDone){
    const total=document.querySelectorAll('#task-list .task').length;
    const done=document.querySelectorAll('#task-list .task.done').length;
    const taskIdx=parseInt(el.dataset.taskIndex);
    const taskDef=!isNaN(taskIdx) ? allTaskDefs(D())[taskIdx] : null;
    const isHardTask=!!taskDef?.hard;
    const shopReward=grantShopMissionReward(taskDef);
    if(total && done===total){
      awardEddies(3,'task');
      const ep=awardEddies(15,'perfect');
      celebrate('day');
      showCyberToast('MISSAO DO DIA CONCLUIDA','NETRUNNER DE ELITE // +'+Math.max(3,total)+' REP'+(ep?' // +€$'+ep:''),7200);
      checkAchievements({_dayComplete:true});
      updateEddiesDisplay();
    }else{
      const et=awardEddies(isHardTask?6:3,'task');
      fxBlip('tick');fxHaptic(15);
      // Contextual completion message
      const tAll=document.querySelectorAll('#task-list .task');
      const tDone=[...tAll].filter(t=>t.classList.contains('done')).length;
      const tRemaining=tAll.length-tDone;
      let sub='+1 REP'+(et?' // +€$'+et:'')+(isHardTask?' // MISSAO DIFICIL BONUS':'');
      if(tDone===1) sub='Boa. Primeiro contrato fechado. '+sub;
      else if(tRemaining===1) sub='Falta 1 contrato para limpar o dia. '+sub;
      else if(tRemaining>1) sub='Faltam '+tRemaining+' contratos para limpar o dia. '+sub;
      const _el=el;
      showActionToast('CONTRATO ENCERRADO',sub,'DESFAZER',()=>{
        _el.classList.remove('done');
        applyTodayModeTaskLimit();
        syncTodayTasksFromDom();
        syncTodayHabitsFromTasks();
        updateStats();
        scheduleAutoSave();
      },5000);
      checkAchievements();
      updateEddiesDisplay();
    }
  }
  updateTagStreaks();
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
  const _now=new Date();const col=_now.getDay()===0?6:_now.getDay()-1;
  const tc=document.querySelectorAll('#habits-body tr td:nth-child('+(col+2)+') .hcell');
  const hTotal=tc.length||getHabits().length;
  const hd=[...tc].filter(c=>c.classList.contains('on')).length;
  const habitsStat=document.getElementById('s-habits');
  if(habitsStat)habitsStat.textContent=hd+'/'+hTotal;
  const hPct=hTotal?Math.round(hd/hTotal*100):0;
  const habitsBar=document.getElementById('b-habits');
  if(habitsBar){habitsBar.style.width=hPct+'%';habitsBar.className='nc-stat-fill stat-fill '+(hPct>=70?'c':hPct>=35?'':' r').trim();}
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
    updateOperatorCosmetics();
  }
  applyCosmeticTheme();
  updateEddiesDisplay();
  renderHomeQuickbar();
  renderDailyPanel();
  renderTodayMode();
  renderOnboardingChecklist();
}


/* Gamificacao: celebracao de rank movido para modules/gamification.js */

function appCacheVersion(){
  const pick=(selector)=>document.querySelector(selector)?.src?.match(/[?&]v=([^&]+)/)?.[1] || '';
  const app=pick('script[src*="app.js"]') || 'sem-cache-bust';
  const gm=pick('script[src*="modules/gamification.js"]');
  return gm ? `app ${app} // gamification ${gm}` : `app ${app}`;
}

function currentDiagnosticUrl(){
  try{return location.origin+location.pathname;}catch(e){return 'indisponivel';}
}

function renderAppVersion(){
  const label=`NC build ${APP_VERSION}`;
  const full=`Build ${APP_VERSION} // ${APP_BUILD_LABEL}`;
  const badge=document.getElementById('app-version-badge');
  const footer=document.getElementById('footer-app-version');
  if(badge)badge.textContent=label;
  if(footer)footer.textContent=full;
}

function pwaDisplayStatus(){
  const standalone=window.matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone;
  if(standalone)return 'INSTALADO/STANDALONE';
  return 'NAVEGADOR';
}

function realtimeDiagnosticStatus(){
  const state=friendRealtimeState || {};
  const status=String(state.lastStatus || 'idle').toUpperCase();
  if(status==='SUBSCRIBED' || status==='OK')return 'ATIVO';
  if(state.messagesLoaded && ['CHANNEL_ERROR','TIMED_OUT','CLOSED','CREATE_FAILED'].includes(status))return 'FALLBACK';
  if(['CHANNEL_ERROR','TIMED_OUT','CLOSED','CREATE_FAILED'].includes(status))return 'INDISPONIVEL';
  return status==='IDLE' ? 'INDISPONIVEL' : status;
}

function diagnosticPayload(){
  const js=readDiagnostic(DIAG_JS_ERROR_KEY);
  const supa=readDiagnostic(DIAG_SUPABASE_KEY);
  const saved=me ? localStorage.getItem(lastSaveKey()) : '';
  const activeKeys=SAVE_KEYS.filter(k=>myData[k]!=null).length;
  const swUpdate=typeof serviceWorkerUpdateState==='function'
    ? serviceWorkerUpdateState()
    : {state:('serviceWorker' in navigator)?(navigator.serviceWorker.controller?'ATIVO':'SUPORTADO'):'INDISPONIVEL',updateAvailable:false,lastCheck:'NUNCA'};
  return {
    appVersion:APP_VERSION,
    buildLabel:APP_BUILD_LABEL,
    cacheVersion:appCacheVersion(),
    currentUrl:currentDiagnosticUrl(),
    userAgent:redactDiagnosticText(navigator.userAgent || 'indisponivel').slice(0,220),
    user:me ? userDisplayLabel(me) : 'OFF',
    lastSave:saved || 'PENDENTE',
    pendingSave:me && hasPendingLocalSave() ? 'SIM' : 'NAO',
    serviceWorker:swUpdate.state,
    updateAvailable:swUpdate.updateAvailable?'SIM':'NAO',
    lastUpdateCheck:swUpdate.lastCheck || 'NUNCA',
    push:'VERIFICANDO',
    pwa:pwaDisplayStatus(),
    realtime:realtimeDiagnosticStatus(),
    lastJsError:js ? `${js.type}: ${js.message}` : 'NENHUM',
    lastSupabaseFailure:supa ? `${supa.operation}: ${supa.message}` : 'NENHUMA',
    schemaVersion:String(myData.schemaVersion || window.APP_SCHEMA_VERSION || 1),
    savedKeys:`${activeKeys}/${SAVE_KEYS.length}`
  };
}

async function diagnosticReportText(){
  const p=diagnosticPayload();
  try{
    const sub=typeof currentPushSubscription==='function' ? await currentPushSubscription() : null;
    p.push=sub?'ATIVO':'DESLIGADO';
  }catch(e){
    p.push='ERRO';
  }
  return [
    'NIGHT CITY // DIAGNOSTICO',
    'appVersion: '+p.appVersion,
    'buildLabel: '+p.buildLabel,
    'cacheVersion: '+p.cacheVersion,
    'currentUrl: '+p.currentUrl,
    'userAgent: '+p.userAgent,
    'usuario: '+p.user,
    'ultimo_save: '+p.lastSave,
    'save_pendente: '+p.pendingSave,
    'service_worker: '+p.serviceWorker,
    'updateAvailable: '+p.updateAvailable,
    'lastUpdateCheck: '+p.lastUpdateCheck,
    'push: '+p.push,
    'pwa: '+p.pwa,
    'realtime: '+p.realtime,
    'schemaVersion: '+p.schemaVersion,
    'chaves_salvas: '+p.savedKeys,
    'ultimo_erro_js: '+p.lastJsError,
    'ultima_falha_supabase: '+p.lastSupabaseFailure
  ].map(redactDiagnosticText).join('\n');
}

async function copyDiagnosticReport(){
  const text=await diagnosticReportText();
  try{
    await navigator.clipboard.writeText(text);
    showCyberToast('DIAGNOSTICO COPIADO','Relatorio local copiado sem tokens, senha ou email completo.',4800);
  }catch(e){
    showCyberToast('DIAGNOSTICO',text,12000);
  }
}

function clearDiagnosticReport(){
  try{
    sessionStorage.removeItem(DIAG_JS_ERROR_KEY);
    sessionStorage.removeItem(DIAG_SUPABASE_KEY);
  }catch(e){}
  renderSystemStatus();
  showCyberToast('DIAGNOSTICO LIMPO','Erros locais desta sessao foram apagados.',4200);
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
  const diag=diagnosticPayload();
  const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=String(value);};
  set('diag-version',diag.appVersion+' // '+diag.buildLabel+' // '+diag.cacheVersion);
  set('diag-user',diag.user);
  set('diag-save',diag.lastSave==='PENDENTE'?'PENDENTE':new Date(diag.lastSave).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}));
  set('diag-pending',diag.pendingSave);
  set('diag-worker',diag.serviceWorker);
  set('diag-update',diag.updateAvailable);
  set('diag-update-check',diag.lastUpdateCheck==='NUNCA'?'NUNCA':new Date(diag.lastUpdateCheck).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}));
  set('diag-pwa',diag.pwa);
  set('diag-realtime',diag.realtime);
  set('diag-js-error',diag.lastJsError);
  set('diag-supabase-error',diag.lastSupabaseFailure);
  set('diag-schema',diag.schemaVersion);
  set('diag-keys',diag.savedKeys);
  if(typeof currentPushSubscription==='function'){
    currentPushSubscription().then(sub=>set('diag-push',sub?'ATIVO':'DESLIGADO')).catch(()=>set('diag-push','ERRO'));
  }else set('diag-push','INDISPONIVEL');
}

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

function navAttrsFor(d,page){
  if(page==='home' || DISTRICT_PAGES.includes(page))return `data-action="goPage" data-page="${htmlEscape(page)}"`;
  if(d && d.url){
    const url=safeExternalUrl(d.url);
    return url ? `data-action="openExternalUrl" data-url="${htmlEscape(url)}"` : '';
  }
  return '';
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
    return `<div class="nav-tab icon-only ${active===page?'active':''}" data-page="${page}" title="${htmlEscape(name)}" aria-label="${htmlEscape(name)}" ${navAttrsFor(d,page)}>${customNavIcon(d,page,color)}</div>`;
  }).join('');
  const mobHtml = items.map(d => {
    const page = d.page || 'home';
    const name = d.name || PAGE_LABELS[page] || page;
    const color = iconColorFor(d);
    return `<div class="mob-tab icon-only ${active===page?'active':''}" data-page="${page}" title="${htmlEscape(name)}" aria-label="${htmlEscape(name)}" ${navAttrsFor(d,page)}>${customNavIcon(d,page,color)}</div>`;
  }).join('');
  if(nav) nav.innerHTML = tabHtml;
  if(mob) mob.innerHTML = mobHtml;
  enhanceClickableControls();
}

function renderDistricts(){
  const list = document.getElementById('district-list');
  renderHomeDrawerShortcuts();
  const allDistricts=getDistricts();
  setTabHeaderStatus('districts',tabCountLabel(allDistricts.length,'aba','abas'));
  if(!list){renderNavTabs();return;}
  const districts = allDistricts;
  if(!districts.length){
    list.innerHTML=RO()
      ? publicEmpty('SIDE DECK PRIVADO','Sem dados compartilhados.')
      : emptyActionCard({
        title:'SEM ABAS ATIVAS',
        body:'Ative um distrito para separar uma area importante do sistema.',
        primaryLabel:'CONFIGURAR ABAS',
        primaryAction:'toggleEditDistricts()',
        compact:true
      });
    renderNavTabs();
    return;
  }
  list.innerHTML = districts.map(d => {
    const color = iconColorFor(d);
    const actionAttrs = DISTRICT_PAGES.includes(d.page) ? `data-action="goPage" data-page="${htmlEscape(d.page)}"` : navAttrsFor(d,d.page);
    return `
    <div class="dbtn" ${actionAttrs}>
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
        <span class="district-field-label">Destino da nova aba</span>
        <select id="district-new-page" class="district-select">${districtDestinationOptions('url')}</select>
      </label>
      <label class="district-field">
        <span class="district-field-label">Nome</span>
        <input id="district-new-name" class="district-input" type="text" maxlength="28" placeholder="ex: Spotify, Estudos, Banco">
      </label>
      <label class="district-field">
        <span class="district-field-label">URL externa</span>
        <input id="district-new-url" class="district-url" type="text" placeholder="https://...">
      </label>
      <label class="district-field">
        <span class="district-field-label">Icone</span>
        <select id="district-new-icon" class="district-select">${iconOptions('link')}</select>
      </label>
      <label class="district-field">
        <span class="district-field-label">Cor</span>
        <input id="district-new-color" class="district-color" type="color" value="#00d4ff">
      </label>
      <button class="btn btn-y" type="button" data-action="callNamed" data-fn="addCustomDistrictItem">ADICIONAR ABA</button>
    </div>
    <div class="district-template-panel district-template-compact">
      <label class="district-field">
        <span class="district-field-label">Template rapido</span>
        <select id="district-template-select" class="district-select">${districtTemplateOptions()}</select>
      </label>
      <button class="btn btn-y" type="button" data-action="addDistrictFromTemplate" data-select="district-template-select">ADICIONAR TEMPLATE</button>
    </div>`;
  el.innerHTML = templatePanel + myData.districts.map((d,i) => {
    const showUrl = d.url!==undefined && !DISTRICT_PAGES.includes(d.page);
    const urlField = showUrl ? `
      <div class="district-field district-url-wrap">
        <span class="district-field-label">URL externa</span>
        <input class="district-url" type="text" value="${htmlEscape(d.url||'')}" placeholder="https://..." data-input="updateDistrictField" data-index="${i}" data-field="url">
      </div>` : '';
    return `
    <div class="district-config-card">
      <div class="district-config-head">
        <label class="district-field">
          <span class="district-field-label">Icone</span>
          <select class="district-select" data-change="updateDistrictField" data-index="${i}" data-field="icon">
            ${iconOptions(d.icon||defaultIconForPage(d.page)||'link')}
          </select>
        </label>
        <label class="district-field">
          <span class="district-field-label">Nome da aba</span>
          <input class="district-input" type="text" value="${htmlEscape(d.name||'')}" data-input="updateDistrictField" data-index="${i}" data-field="name">
        </label>
        <label class="district-field">
          <span class="district-field-label">Cor</span>
          <input class="district-color" type="color" value="${htmlEscape(d.color||'#97C459')}" data-input="updateDistrictField" data-index="${i}" data-field="color">
        </label>
        <span class="district-remove" data-action="callNamed" data-fn="removeDistrict" data-arg0="${i}">X</span>
      </div>
      <div class="district-config-route">
        <label class="district-field">
          <span class="district-field-label">Destino</span>
          <select class="district-select" data-change="setDistrictPage" data-index="${i}">
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
  myData.districts.push({icon:'link', name:'Nova aba', color:'#00d4ff', page:'url', url:''});
  renderDistrictEditList();
  renderDistricts();
  scheduleAutoSave();
}

async function removeDistrict(i){
  if(!(await confirmDanger('Remover este distrito da navegacao?')))return;
  if(!myData.districts) myData.districts = JSON.parse(JSON.stringify(creatorDefaults(DEFAULT_DISTRICTS)));
  myData.districts.splice(i,1);
  renderDistrictEditList();
  renderDistricts();
  scheduleAutoSave();
}

function addBook(){if(RO())return;const t=document.getElementById('btitle').value.trim(),a=document.getElementById('bauthor').value.trim(),s=document.getElementById('bstatus').value;if(!t)return;myData.books=myData.books||[];myData.books.unshift({id:Date.now(),title:t,author:a,status:s});addActivity('leitura',{title:t,status:s,note:a});document.getElementById('btitle').value='';document.getElementById('bauthor').value='';showProgressiveHintOnce('book_month_goal','META DE LEITURA','Livro adicionado. Defina uma meta mensal para acompanhar progresso.');renderBooks();renderGoals();renderEvolutionHistory();scheduleAutoSave();showCyberToast('LIVRO ADICIONADO',t+(a?' // '+a:''),4200);}
function cycleBook(id){if(RO())return;const b=myData.books||[],item=b.find(x=>x.id===id);if(!item)return;item.status={queue:'reading',reading:'done',done:'queue'}[item.status]||'queue';renderBooks();renderGoals();checkAchievements();scheduleAutoSave();}
function delBook(id){deleteWithUndo('Livro','books',id,()=>{renderBooks();renderGoals();});}
function renderBooks(){
  const savedBooks=D().books||[],el=document.getElementById('book-list');
  if(!el)return;
  const b=savedBooks;
  const reading=b.filter(x=>x.status==='reading').length;
  const done=b.filter(x=>x.status==='done').length;
  setTabHeaderStatus('leitura',tabCountLabel(b.length,'livro','livros')+' - '+done+' concluido');
  const count=document.getElementById('reading-library-count');
  if(count)count.textContent=b.length+' titulos';
  if(!b.length){
    el.innerHTML=RO()?publicEmpty('BIBLIOTECA VAZIA','Este operador ainda nao cadastrou leituras.'):emptyActionCard({title:'BIBLIOTECA VAZIA',body:'Comece com um livro atual e uma meta pequena para manter ritmo.',primaryLabel:'ADICIONAR LEITURA',primaryAction:'createStarterBook()',compact:true});
    updateBooksProg();
    return;
  }
  const labels={queue:'FILA',reading:'LENDO',done:'FEITO'};
  el.innerHTML=b.map(x=>{
    const idAttr=!RO()?`data-action="cycleBook" data-id="${Number(x.id)}"`:'style="cursor:default"';
    return `<div class="reading-book">
      <div class="reading-book-cover">${cyberIcon('leitura','var(--green)')}</div>
      <div class="reading-book-info"><div class="reading-book-title">${htmlEscape(x.title)}</div>${x.author?`<div class="reading-book-sub">${htmlEscape(x.author)}</div>`:''}</div>
      <span class="reading-book-badge ${htmlEscape(x.status)}" ${idAttr}>${labels[x.status]||'FILA'}</span>
      ${!RO()?`<span class="del-btn" data-action="delBook" data-id="${Number(x.id)}">X</span>`:''}
    </div>`;
  }).join('');
  updateBooksProg();
}
function updateBooksProg(){const b=D().books||[],done=b.filter(x=>x.status==='done').length,target=Math.max(1,Number(getGoals().monthlyBooks)||3);const prog=document.getElementById('books-prog'),bar=document.getElementById('books-bar');if(prog)prog.textContent=done+' / '+target;if(bar)bar.style.width=Math.min(done/target*100,100)+'%';}

function createStarterBook(){
  if(RO())return;
  myData.books=myData.books||[];
  if(!myData.books.length)myData.books.unshift({id:Date.now(),title:'Livro atual',author:'',status:'reading'});
  myData.goals={...(myData.goals||{}),monthlyBooks:myData.goals?.monthlyBooks||1};
  addActivity('leitura',{title:'Meta de leitura criada',status:'reading'});
  renderBooks();renderGoals();renderEvolutionHistory();scheduleAutoSave();
  showCyberToast('LEITURA ATIVA','Livro base criado. Edite o titulo quando escolher o livro.');
}

// Sugestao rapida de leitura para destravar quem nao sabe por onde comecar.
const QUICK_BOOK_SUGGESTIONS=[
  {title:'Habitos Atomicos',author:'James Clear'},
  {title:'O Poder do Habito',author:'Charles Duhigg'},
  {title:'Essencialismo',author:'Greg McKeown'},
  {title:'Mindset',author:'Carol Dweck'},
  {title:'A Coragem de Ser Imperfeito',author:'Brene Brown'}
];
function addQuickBookSuggestion(){
  if(RO())return;
  myData.books=myData.books||[];
  const pick=QUICK_BOOK_SUGGESTIONS[Math.floor(Math.random()*QUICK_BOOK_SUGGESTIONS.length)];
  myData.books.unshift({id:Date.now(),title:pick.title,author:pick.author,status:'reading'});
  myData.goals={...(myData.goals||{}),monthlyBooks:myData.goals?.monthlyBooks||1};
  addActivity('leitura',{title:pick.title,status:'reading',note:pick.author});
  renderBooks();renderGoals();renderEvolutionHistory();scheduleAutoSave();
  showCyberToast('SUGESTAO ADICIONADA',pick.title+' // '+pick.author+' // edite ou troque quando quiser.',5000);
}

function addProject(){if(RO())return;const n=document.getElementById('pname').value.trim(),s=document.getElementById('pstatus').value,note=document.getElementById('pnote').value.trim();if(!n)return;myData.projects=myData.projects||[];myData.projects.unshift({id:Date.now(),name:n,status:s,note});addActivity('dev',{title:n,status:s,note});document.getElementById('pname').value='';document.getElementById('pnote').value='';renderProjects();renderGoals();renderEvolutionHistory();scheduleAutoSave();showCyberToast('PROJETO CRIADO',n,4200);}
function delProject(id){deleteWithUndo('Projeto','projects',id,()=>{renderProjects();renderGoals();});}
function renderProjects(){
  const p=D().projects||[],el=document.getElementById('proj-list');
  const logs=(D().devlog||[]).length;
  setTabHeaderStatus('dev',tabCountLabel(p.length,'projeto','projetos')+' // '+logs+' logs');
  if(!p.length){el.innerHTML=RO()?publicEmpty('NENHUM PROJETO PUBLICO','Sem dados compartilhados.'):emptyActionCard({title:'SEM PROJETO ATIVO',body:'Crie uma entrega pequena para transformar estudo em resultado visivel.',primaryLabel:'NOVO PROJETO',primaryAction:'createStarterProject()',compact:true});return;}
  const sc={active:'ATIVO',pause:'PAUSADO',done:'CONCLUIDO'},cc={active:'var(--c)',pause:'var(--y)',done:'#3b6d11'};
  el.innerHTML=p.map(x=>`<div class="item"><div class="item-info"><div class="item-title">${htmlEscape(x.name)}</div>${x.note?`<div class="item-sub">${htmlEscape(x.note)}</div>`:''}</div><span class="badge" style="color:${cc[x.status]||'var(--muted)'};background:${cc[x.status]||'var(--muted)'}11;border-color:${cc[x.status]||'var(--muted)'}44">${sc[x.status]||'ATIVO'}</span>${RO()?'':`<span class="del-btn" data-action="delProject" data-id="${Number(x.id)}">X</span>`}</div>`).join('');
}

function createStarterProject(){
  if(RO())return;
  myData.projects=myData.projects||[];
  if(!myData.projects.length)myData.projects.unshift({id:Date.now(),name:'Projeto pequeno',status:'active',note:'Entrega de 30 min por dia.'});
  addActivity('dev',{title:'Projeto base criado',duration:30});
  renderProjects();renderGoals();renderEvolutionHistory();scheduleAutoSave();
  showCyberToast('PROJETO ATIVO','Projeto base criado para iniciar sem tela vazia.');
}

function createProjectTemplate(){
  if(RO())return;
  myData.projects=myData.projects||[];
  myData.projects.unshift({id:Date.now(),name:'App de rotina - MVP',status:'active',note:'Criar uma melhoria pequena, testar e registrar log.'});
  addActivity('dev',{title:'Template de projeto',duration:30,note:'App de rotina - MVP'});
  renderProjects();renderGoals();renderEvolutionHistory();scheduleAutoSave();
  showCyberToast('TEMPLATE DEV','Projeto simples criado. Ajuste o nome quando quiser.');
}

function addDevLog(){if(RO())return;const t=document.getElementById('devlog-in').value.trim();if(!t)return;myData.devlog=myData.devlog||[];myData.devlog.unshift({id:Date.now(),date:dk(),text:t});addActivity('dev',{title:'Log de estudo',duration:30,difficulty:'Media',note:t});document.getElementById('devlog-in').value='';renderDevLog();renderEvolutionHistory();scheduleAutoSave();showCyberToast('LOG SALVO','Sessao de estudo registrada.',3800);}
function delDevLog(id){deleteWithUndo('Log de estudo','devlog',id,renderDevLog);}
function renderDevLog(){const l=D().devlog||[],el=document.getElementById('dev-log');setTabHeaderStatus('dev',tabCountLabel((D().projects||[]).length,'projeto','projetos')+' // '+l.length+' logs');if(!l.length){el.innerHTML=RO()?publicEmpty('SEM LOGS DE ESTUDO','Este operador ainda nao registrou sessoes de estudo.'):emptyActionCard({title:'SEM LOG DE ESTUDO',body:'Registre a sessao de hoje para criar historico real.',primaryLabel:'CRIAR LOG',primaryAction:'createStarterDevLog()',compact:true});return;}el.innerHTML=l.slice(0,15).map(x=>`<div class="log-entry"><div class="log-head"><span class="log-date">${htmlEscape(x.date)}</span>${RO()?'':`<span class="del-btn" data-action="delDevLog" data-id="${Number(x.id)}">X</span>`}</div><div class="log-text">${htmlEscape(x.text)}</div></div>`).join('');}

function createStarterDevLog(){if(RO())return;myData.devlog=myData.devlog||[];if(!myData.devlog.length)myData.devlog.unshift({id:Date.now(),date:dk(),text:'Primeira sessao de estudo registrada.'});addActivity('dev',{title:'Log de estudo',duration:30,note:'Inicio do historico'});renderDevLog();renderEvolutionHistory();scheduleAutoSave();showCyberToast('LOG INICIADO','Historico de estudo ativado. Registre cada sessao.');}

function createDevLogTemplate(){if(RO())return;myData.devlog=myData.devlog||[];myData.devlog.unshift({id:Date.now(),date:dk(),text:'Estudo 30 min: revisei um conceito, pratiquei um exercicio e defini o proximo passo.'});addActivity('dev',{title:'Estudo 30 min',duration:30,difficulty:'Media',note:'Template rapido'});renderDevLog();renderEvolutionHistory();scheduleAutoSave();showCyberToast('LOG 30 MIN','Sessao modelo adicionada. Edite o texto se precisar.');}

function addGuitarLog(){if(RO())return;const t=document.getElementById('glog-in').value.trim();if(!t)return;myData.guitarlog=myData.guitarlog||[];myData.guitarlog.unshift({id:Date.now(),date:dk(),text:t});addActivity('violao',{title:'Pratica de violao',duration:Number(getGoals().guitarMinutes)||15,difficulty:'Media',note:t});document.getElementById('glog-in').value='';renderGuitarLog();updateGStreak();renderEvolutionHistory();scheduleAutoSave();showCyberToast('PRATICA REGISTRADA','Sessao de violao salva. Sequencia protegida.',3800);}
function delGLog(id){deleteWithUndo('Log de violao','guitarlog',id,()=>{renderGuitarLog();updateGStreak();});}
function renderGuitarLog(){const l=D().guitarlog||[],el=document.getElementById('guitar-log');setTabHeaderStatus('violao',tabCountLabel(l.length,'pratica','praticas'));if(!l.length){el.innerHTML=RO()?publicEmpty('SEM PRATICAS REGISTRADAS','Este operador ainda nao registrou praticas de violao.'):emptyActionCard({title:'SEM PRATICA REGISTRADA',body:'Anote qualquer treino, ate 5 minutos, para proteger sua sequencia.',primaryLabel:'REGISTRAR PRATICA',primaryAction:'createStarterGuitarLog()',compact:true});return;}el.innerHTML=l.slice(0,15).map(x=>`<div class="log-entry"><div class="log-head"><span class="log-date">${htmlEscape(x.date)}</span>${RO()?'':`<span class="del-btn" data-action="delGLog" data-id="${Number(x.id)}">X</span>`}</div><div class="log-text">${htmlEscape(x.text)}</div></div>`).join('');}

function createStarterGuitarLog(){if(RO())return;myData.guitarlog=myData.guitarlog||[];if(!myData.guitarlog.length)myData.guitarlog.unshift({id:Date.now(),date:dk(),text:'Primeira pratica registrada. Aquecimento e acordes basicos.'});addActivity('violao',{title:'Pratica de violao',duration:Number(getGoals().guitarMinutes)||15,note:'Inicio do historico'});renderGuitarLog();updateGStreak();renderEvolutionHistory();scheduleAutoSave();showCyberToast('STREAK INICIADO','Primeira pratica registrada. Nao quebre a corrente.');}

function createGuitarPracticeTemplate(){if(RO())return;myData.guitarlog=myData.guitarlog||[];myData.guitarlog.unshift({id:Date.now(),date:dk(),text:'Aquecimento 5 min, troca de acordes 5 min, musica lenta 5 min.'});addActivity('violao',{title:'Aquecimento 15 min',duration:15,difficulty:'Facil',note:'Template rapido'});renderGuitarLog();updateGStreak();renderEvolutionHistory();scheduleAutoSave();showCyberToast('PRATICA MODELO','Aquecimento de 15 min registrado.');}
function updateGStreak(){const l=D().guitarlog||[],dates=[...new Set(l.map(x=>x.date))].sort().reverse();let streak=0,cur=new Date();for(let i=0;i<dates.length;i++){const exp=localDateKey(cur);if(dates[i]===exp){streak++;cur.setDate(cur.getDate()-1);}else break;}const el=document.getElementById('g-streak');if(el)el.textContent=streak+' dia'+(streak!==1?'s':'');}

function renderSkills(){
  renderSkillGroup('dev');
  renderSkillGroup('guitar');
}

function renderSkillGroup(kind){
  const wrap=document.getElementById(kind==='guitar'?'guitar-skills':'skill-list');
  if(!wrap)return;
  const defs=getSkillDefs(kind);
  if(!defs.length){wrap.innerHTML=`<div class="smart-empty compact"><span>${kind==='guitar'?'SEM TECNICAS':'SEM SKILLS'}</span><b>Clique em ✏️ para adicionar ${kind==='guitar'?'tecnicas':'skills'} ao tracker.</b></div>`;return;}
  wrap.innerHTML=defs.map(d=>`<div class="skill-item"><span class="skill-name">${htmlEscape(d.name)}</span><div class="skill-dots" data-sk="${htmlEscape(d.id)}" data-max="${parseInt(d.max)||5}"></div></div>`).join('');
  wrap.querySelectorAll('.skill-dots').forEach(w=>{
    const sk=w.dataset.sk,max=parseInt(w.dataset.max)||5,val=(D().skills||{})[sk]||0;
    w.innerHTML='';
    for(let i=0;i<max;i++){
      const dot=document.createElement('div');
      dot.className='sdot'+(i<val?' on':'')+(RO()?' readonly':'');
      if(!RO()){
        dot.dataset.action='updateSkillLevel';
        dot.dataset.skill=sk;
        dot.dataset.level=String(i+1);
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
      <input type="text" value="${htmlEscape(d.name||'')}" data-input="updateSkillDefField" data-key="${skillDefKey(kind)}" data-index="${i}" data-field="name"
        style="flex:1;font-size:12px;padding:5px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--ui)">
      <input type="number" min="1" max="10" value="${parseInt(d.max)||5}" data-input="updateSkillDefField" data-key="${skillDefKey(kind)}" data-index="${i}" data-field="max" data-number="true"
        style="width:54px;font-size:12px;padding:5px 6px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--mono)">
      <button type="button" class="mini-remove" data-action="callNamed" data-fn="removeSkillDef" data-arg0="${kind}" data-arg1="${i}">X</button>
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

function addGame(){if(RO())return;const n=document.getElementById('gname').value.trim(),s=document.getElementById('gstatus').value,note=document.getElementById('gnote').value.trim();if(!n)return;myData.games=myData.games||[];myData.games.unshift({id:Date.now(),name:n,status:s,note});addActivity('jogos',{title:n,status:s,note});document.getElementById('gname').value='';document.getElementById('gnote').value='';renderGames();renderGoals();renderEvolutionHistory();scheduleAutoSave();showCyberToast('JOGO ADICIONADO',n,3800);}
function delGame(id){deleteWithUndo('Jogo','games',id,()=>{renderGames();renderGoals();});}
function renderGames(){const g=D().games||[],cur=document.getElementById('game-current'),list=document.getElementById('game-list');const playing=g.filter(x=>x.status==='playing');setTabHeaderStatus('jogos',tabCountLabel(g.length,'jogo','jogos')+' // '+playing.length+' ativo');cur.innerHTML=playing.length?playing.map(x=>`<div class="irow"><span class="ikey">JOGO</span><div><div class="ival">${htmlEscape(x.name)}</div>${x.note?`<div class="item-sub">${htmlEscape(x.note)}</div>`:''}</div></div>`).join(''):RO()?publicEmpty('NENHUM JOGO ATIVO','Este operador nao esta jogando nada no momento.'):emptyActionCard({title:'SEM JOGO EM FOCO',body:'Escolha o jogo atual para acompanhar progresso sem abrir dez frentes.',primaryLabel:'ADICIONAR JOGO ATUAL',primaryAction:'createStarterGame()',compact:true});const sc={playing:'JOGANDO',queue:'FILA',done:'ZERADO',dropped:'LARGADO'};list.innerHTML=g.length?g.map(x=>`<div class="item"><div class="item-info"><div class="item-title">${htmlEscape(x.name)}</div>${x.note?`<div class="item-sub">${htmlEscape(x.note)}</div>`:''}</div><span class="badge ${htmlEscape(x.status)}">${sc[x.status]||'FILA'}</span>${RO()?'':`<span class="del-btn" data-action="delGame" data-id="${Number(x.id)}">X</span>`}</div>`).join(''):RO()?publicEmpty('BIBLIOTECA VAZIA','Este operador ainda nao cadastrou jogos.'):emptyActionCard({title:'BIBLIOTECA VAZIA',body:'Monte uma fila simples: atual, proximo e concluidos.',primaryLabel:'ADICIONAR JOGO',primaryAction:'createStarterGame()',compact:true});}

function createStarterGame(){if(RO())return;myData.games=myData.games||[];if(!myData.games.length)myData.games.unshift({id:Date.now(),name:'Jogo atual',status:'playing',note:''});addActivity('jogos',{title:'Jogo adicionado',status:'playing'});renderGames();renderGoals();renderEvolutionHistory();scheduleAutoSave();showCyberToast('JOGO ATIVO','Biblioteca iniciada. Edite o nome para o jogo que esta jogando.');}

function createGameQueueTemplate(){if(RO())return;myData.games=myData.games||[];const now=Date.now();myData.games.unshift({id:now,name:'Jogo atual',status:'playing',note:'Registrar progresso semanal.'},{id:now+1,name:'Proximo da fila',status:'queue',note:'Escolher depois de concluir o atual.'});addActivity('jogos',{title:'Fila de jogos criada',status:'queue'});renderGames();renderGoals();renderEvolutionHistory();scheduleAutoSave();showCyberToast('FILA CRIADA','Jogo atual e proximo da fila adicionados.');}

function addReflexao(){if(RO())return;const t=document.getElementById('rtitle').value.trim(),txt=document.getElementById('rtext').value.trim();if(!txt)return;myData.reflexoes=myData.reflexoes||[];myData.reflexoes.unshift({id:Date.now(),date:dk(),title:t,text:txt});document.getElementById('rtitle').value='';document.getElementById('rtext').value='';renderRefs();scheduleAutoSave();showCyberToast('ENTRADA SALVA',t||'Reflexao registrada.',3800);}
function delRef(id){deleteWithUndo('Reflexao','reflexoes',id,renderRefs);}
function renderRefs(){const r=D().reflexoes||[],el=document.getElementById('ref-list');setTabHeaderStatus('reflexoes',tabCountLabel(r.length,'entrada','entradas'));if(!r.length){el.innerHTML=RO()?publicEmpty('DIARIO PRIVADO','Este operador nao compartilhou reflexoes.'):emptyActionCard({title:'DIARIO VAZIO',body:'Registre feito, pendente e plano de amanha em poucas linhas.',primaryLabel:'ESCREVER ENTRADA',primaryAction:'createStarterRef()',compact:true});return;}el.innerHTML=r.map(x=>`<div class="log-entry"><div class="log-head"><span class="log-date">${htmlEscape(x.date)}</span>${x.title?`<span class="log-title">${htmlEscape(x.title)}</span>`:''} ${RO()?'':`<span class="del-btn" data-action="delRef" data-id="${Number(x.id)}">X</span>`}</div><div class="log-text">${htmlEscape(x.text)}</div></div>`).join('');}

function createStarterRef(){if(RO())return;const prompt=document.getElementById('rtext');if(prompt){prompt.value='Como estou me sentindo hoje e o que quero mudar.';prompt.focus();}showCyberToast('DIARIO ABERTO','Escreva livremente. Seus dados ficam so com voce.');}

function createReflectionTemplate(){if(RO())return;myData.reflexoes=myData.reflexoes||[];myData.reflexoes.unshift({id:Date.now(),date:dk(),title:'Check-in rapido',text:'Hoje eu fiz: ... | Ficou pendente: ... | Amanha o foco sera: ...'});renderRefs();scheduleAutoSave();showCyberToast('CHECK-IN CRIADO','Reflexao modelo adicionada para voce completar depois.');}
