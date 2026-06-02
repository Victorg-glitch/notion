"use strict";
const NC_CONFIG = window.NC_CONFIG || {};
const SUPA_URL = NC_CONFIG.SUPA_URL || 'https://wmglywfsrlcpsspouufp.supabase.co';
const SUPA_KEY = NC_CONFIG.SUPA_KEY || 'sb_publishable_X6xbf9gD2JxmBXxthWG6lQ_gM5hvxeW';
const WEB_PUSH_PUBLIC_KEY = NC_CONFIG.WEB_PUSH_PUBLIC_KEY || 'BAXYgFpb56ooYOLihzUYKchPIzfXgyQyJxNfI8jUavmH9-AuVvUcbMse8Bdv_0juXpC69b1SkM1q3WenhhVtzmM'; // VAPID public key para notificacoes com o site fechado.
let sb;
try {
  if(!window.supabase) throw new Error('Supabase SDK nao carregou');
  sb = supabase.createClient(SUPA_URL, SUPA_KEY);
} catch(e) {
  console.error('Supabase init failed:', e);
}

let PROFILES = NC_CONFIG.PROFILES || {
  victor: {name:'VICTOR', avatar:'🔴', color:'var(--y)', role:'NETRUNNER'},
  caio:   {name:'CAIO',   avatar:'🔵', color:'var(--c)', role:'CORPO'}
};
const LEGACY_PROFILE_IDS = Object.keys(PROFILES);
const ACCOUNT_LIMIT = Number(NC_CONFIG.ACCOUNT_LIMIT || 5);

let me=null, viewFriend=false, myData={}, friendData={};
let selProfile=null, isNewUser=false;
let reminders={}, reminderTimer=null;
let currentTheme='arasaka';
let motionMode='low';

function displayNameFromEmail(email){
  const raw=String(email||'').split('@')[0]||'OPERADOR';
  return raw.replace(/[._-]+/g,' ').trim().slice(0,24) || 'OPERADOR';
}

function setRuntimeProfile(username, profile={}){
  if(!username)return null;
  const fallbackName=displayNameFromEmail(profile.email || username);
  const name=String(profile.name || profile.display_name || fallbackName).trim().slice(0,24) || fallbackName;
  PROFILES[username]={
    name:name.toUpperCase(),
    avatar:profile.avatar || '◎',
    color:profile.color || 'var(--c)',
    role:profile.role || 'OPERADOR'
  };
  return PROFILES[username];
}

const SAVE_KEYS=[
  'tasks','habits','books','projects','devlog','guitarlog','games','reflexoes',
  'skills','taskDefs','habitDefs','routines','skillDefs','guitarSkillDefs',
  'districts','friendRequests','lastSeenWeek','goals','reminders','customPages','pageObjectives'
];

// Data access
function ensureDb(){
  if(!sb) throw new Error('Supabase indisponivel. Recarregue a pagina e tente novamente.');
}
async function dbGet(username){
  ensureDb();
  if(!PROFILES[username]) throw new Error('Perfil invalido');
  const {data,error}=await sb.from('user_data').select('data_key,data_value').eq('username',username);
  if(error) throw error;
  const out={};(data||[]).forEach(r=>out[r.data_key]=r.data_value);return out;
}
async function dbSet(username,key,value){
  ensureDb();
  if(!PROFILES[username]) throw new Error('Perfil invalido');
  const {error}=await sb.from('user_data').upsert({username,data_key:key,data_value:value,updated_at:new Date().toISOString()},{onConflict:'username,data_key'});
  if(error) throw error;
}

// Password and session
async function hashPwd(pwd){
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(pwd+':night_city_salt'));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

const SESSION_KEY='nc_session_v2';
function saveSession(u){ localStorage.setItem(SESSION_KEY,JSON.stringify({username:u,savedAt:Date.now()})); }
function loadSession(){
  const raw=localStorage.getItem(SESSION_KEY);
  if(!raw)return null;
  try{
    const parsed=JSON.parse(raw);
    return parsed && PROFILES[parsed.username] ? parsed.username : null;
  }catch(e){
    return PROFILES[raw] ? raw : null;
  }
}
function clearSession(){ localStorage.removeItem(SESSION_KEY); }

const THEMES=NC_CONFIG.THEMES || {
  arasaka:{label:'Arasaka amarelo',y:'#fcee09',r:'#e00f3a',c:'#00d4ff',p:'#b44fff'},
  netrunner:{label:'Netrunner azul',y:'#00d4ff',r:'#ff2d55',c:'#7df9ff',p:'#b44fff'},
  maelstrom:{label:'Maelstrom vermelho',y:'#ff1744',r:'#ff003c',c:'#00d4ff',p:'#b44fff'},
  corpo:{label:'Corpo roxo',y:'#b44fff',r:'#e00f3a',c:'#00d4ff',p:'#d46bff'}
};
function themeKey(){return 'nc_theme_v1_'+(me||'anon');}
function applyTheme(id){
  const theme=THEMES[id]||THEMES.arasaka;
  currentTheme=THEMES[id]?id:'arasaka';
  Object.entries(theme).forEach(([k,v])=>{if(k!=='label')document.documentElement.style.setProperty('--'+k,v);});
  const sel=document.getElementById('theme-select');
  if(sel)sel.value=currentTheme;
  const msel=document.getElementById('theme-select-mobile');
  if(msel)msel.value=currentTheme;
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
  const nf=document.getElementById('nav-friend');if(nf)nf.textContent='AMIGO';
  const mf=document.getElementById('mob-friend');if(mf)mf.textContent='AMIGO';
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
    {idx:5,key:'rotinas',name:'Routines',color:'var(--y)'},
    {idx:6,key:'distritos',name:'Distritos',color:'var(--p)'}
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
  if(next)next.textContent=nextReminderText();
  if(count){
    const modules=document.querySelectorAll('#home-drawer-body .home-module-tab').length;
    count.textContent=String(modules).padStart(2,'0')+' MODULOS';
  }
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
  enhanceClickableControls();
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
  clearFriendUi();
  loadTheme();
  loadMotionMode();
  loadReminders();
  document.getElementById('login-screen').style.display='none';
  document.getElementById('nav-user').textContent=PROFILES[me].name;
  const mu=document.getElementById('mob-user');if(mu)mu.textContent=PROFILES[me].name;
  ensurePageObjectivesData();
  ensureCustomPagesData();
  applyData(); updateStats(); updateCurrentDate(); renderFriendRequests(); renderReminders(); startReminderEngine();
  handleWeeklyRollover();
  if(hasPendingLocalSave()) setTimeout(()=>retryPendingLocalSave(true),900);
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
  const loginBtn=document.getElementById('login-btn');if(loginBtn)loginBtn.disabled=false;
  updateCurrentDate();
  let saved=null;
  try{saved=await authSessionUsername();}catch(e){}
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
    }
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
  document.getElementById('login-btn').textContent='ENTRAR / CRIAR CONTA';
  document.getElementById('login-sub').textContent='ACESSO PESSOAL';
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
  backToSelect();
  const name=document.getElementById('account-name-input');
  if(name)name.focus();
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
      await authenticateProfile('login',pwd,null);
    }else if(isNewUser){
      data=await dbGet(selProfile);
      const confirm=document.getElementById('pwd-confirm').value;
      if(!confirm){ st.textContent='// CONFIRME A SENHA //'; btn.disabled=false; return; }
      if(pwd!==confirm){ st.textContent='// SENHAS NAO CONFEREM //'; btn.disabled=false; return; }
      if(pwd.length<4){ st.textContent='// MINIMO 4 CARACTERES //'; btn.disabled=false; return; }
      await dbSet(selProfile,'pwd_hash',await hashPwd(pwd));
    } else {
      data=await dbGet(selProfile);
      if(data.pwd_hash!==await hashPwd(pwd)){
        st.textContent='// SENHA INCORRETA //';
        btn.disabled=false;
        document.getElementById('pwd-input').value='';
        document.getElementById('pwd-input').focus();
        return;
      }
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

async function doGoogleLogin(){
  const btn=document.getElementById('google-auth-btn'),st=document.getElementById('login-status');
  if(!selProfile || !PROFILES[selProfile]){ st.textContent='// SELECIONE UM PERFIL //'; return; }
  if(btn)btn.disabled=true;
  st.textContent='// REDIRECIONANDO PARA GOOGLE AUTH... //';
  try{
    await authSignInWithGoogleProfile(selProfile);
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
  selProfile=null; isNewUser=false;
  document.getElementById('login-screen').style.display='flex';
  document.getElementById('step-select').style.display='block';
  document.getElementById('step-password').style.display='block';
  document.getElementById('login-btn').disabled=false;
  document.getElementById('login-btn').textContent='ENTRAR / CRIAR CONTA';
  document.getElementById('login-sub').textContent='ACESSO PESSOAL';
  document.getElementById('pwd-input').value='';
  document.getElementById('pwd-confirm').value='';
  const name=document.getElementById('account-name-input');if(name)name.value='';
  prepareAuthEmailField('login');
  document.getElementById('pwd-confirm-wrap').style.display='none';
  document.querySelectorAll('.profile-card').forEach(c=>c.classList.remove('selected'));
  document.getElementById('login-status').textContent='// SESSAO ENCERRADA //';
  document.getElementById('nav-user').textContent='--';
  const mu=document.getElementById('mob-user');if(mu)mu.textContent='--';
  document.getElementById('nav-sync').textContent='SALVAR';
  document.getElementById('nav-sync').className='nav-sync';
  goPage('home');
}
const AUTO_SAVE_DELAY=900;
let autoSaveTimer=null;

function scheduleAutoSave(){
  if(!me || RO())return;
  const btn=document.getElementById('nav-sync');
  if(autoSaveTimer)clearTimeout(autoSaveTimer);
  if(btn){btn.textContent='AUTO-SAVE...';btn.className='nav-sync saving';}
  autoSaveTimer=setTimeout(()=>{autoSaveTimer=null;saveAll();},AUTO_SAVE_DELAY);
}

async function saveAll(){
  if(!me || RO())return;
  if(autoSaveTimer){clearTimeout(autoSaveTimer);autoSaveTimer=null;}
  const btn=document.getElementById('nav-sync');
  btn.textContent='SALVANDO...';btn.className='nav-sync saving';
  try{
    collectState();
    await Promise.all(SAVE_KEYS.map(k=>dbSet(me,k,myData[k]||null)));
    clearPendingLocalSave();
    localStorage.setItem(lastSaveKey(),new Date().toISOString());
    renderSystemStatus();
    btn.textContent='SALVO ✓';btn.className='nav-sync saved';
    setTimeout(()=>{btn.textContent='SALVAR';btn.className='nav-sync';},2500);
  }catch(e){
    btn.textContent='ERRO ✕';btn.className='nav-sync error';
    setTimeout(()=>{btn.textContent='SALVAR';btn.className='nav-sync';},3000);
  }
}

document.addEventListener('input',e=>{
  if(e.target.closest('#task-edit-form,#habit-edit-form,#goals-edit-form,#routine-edit-form,#district-edit-form,#dev-skill-edit-form,#guitar-skill-edit-form'))scheduleAutoSave();
});
document.addEventListener('change',e=>{
  if(e.target.closest('#task-edit-form,#habit-edit-form,#goals-edit-form,#routine-edit-form,#district-edit-form,#dev-skill-edit-form,#guitar-skill-edit-form'))scheduleAutoSave();
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

function applyData(){
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
  enhanceClickableControls();
}

function friendId(){
  return me==='victor'?'caio':'victor';
}

function friendAccessStatus(data, requester){
  const req=(data.friendRequests||{})[requester];
  return req && req.status ? req.status : null;
}

function friendStatusLabel(status){
  if(status==='approved')return 'ACESSO LIBERADO';
  if(status==='pending')return 'AGUARDANDO RESPOSTA';
  if(status==='denied')return 'ACESSO RECUSADO';
  return 'CANAL FECHADO';
}

function friendMsg(kind, head, text){
  return `<div class="friend-msg ${kind}"><div class="friend-msg-head">${head}</div><div class="friend-msg-text">${text}</div></div>`;
}

function friendPermissionSummary(){
  return `<div class="friend-permissions">
    <span>PERMISSOES DO MODO AMIGO</span>
    <b>VISUALIZA: contratos, habitos, leitura, dev, violao, jogos, reflexoes, distritos e paginas custom.</b>
    <b>BLOQUEADO: editar, excluir, marcar checks, salvar, importar backup e alterar configuracoes.</b>
  </div>`;
}

function closeFriendChat(){
  const chat=document.getElementById('friend-chat');
  if(chat)chat.className='friend-chat';
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
  if(!chat || !body || !actions || !title || !sub || !icon || !me)return;
  const fid=friendId();
  const fp=PROFILES[fid];
  const mine=PROFILES[me];
  const sentStatus=targetData ? friendAccessStatus(targetData,me) : null;
  const received=(myData.friendRequests||{})[fid];
  const receivedStatus=received && received.status;
  title.textContent='COMMLINK // '+fp.name;
  sub.textContent='// PERMISSAO: '+friendStatusLabel(sentStatus)+' //';
  icon.textContent=fp.name.slice(0,2);
  const msgs=[
    friendMsg('system','NIGHT CITY RELAY','Canal privado entre '+mine.name+' e '+fp.name+'. O perfil do amigo so abre depois de permissao aprovada.'),
    friendMsg('me',mine.name,sentStatus==='approved'?'Credencial aceita. Posso acessar seu perfil em modo somente leitura.':sentStatus==='pending'?'Pedido enviado. Aguardando voce liberar o acesso.':sentStatus==='denied'?'Seu ultimo sinal recusou meu acesso. Posso solicitar uma nova chave.':'Solicitando abertura do canal de perfil.'),
    friendMsg('friend',fp.name,sentStatus==='approved'?'Acesso liberado. Entra, mas sem alterar meus dados.':sentStatus==='pending'?'Pedido recebido. Vou aprovar ou recusar quando entrar no meu painel.':sentStatus==='denied'?'Acesso negado no ultimo pedido.':'Canal fechado. Envie um pedido de permissao para ver meu perfil.'),
  ];
  if(receivedStatus==='pending')msgs.push(friendMsg('system','PEDIDO RECEBIDO',fp.name+' quer ver seu perfil. Aprove ou recuse direto por aqui.'));
  if(errorText)msgs.push(friendMsg('system','ERRO DE REDE',errorText));
  body.innerHTML=msgs.join('')+friendPermissionSummary();
  const btns=[];
  if(receivedStatus==='pending'){
    btns.push(`<button class="friend-chat-btn primary" onclick="respondFriendRequest('${fid}','approved')">APROVAR ${fp.name}</button>`);
    btns.push(`<button class="friend-chat-btn danger" onclick="respondFriendRequest('${fid}','denied')">RECUSAR</button>`);
  }
  if(sentStatus==='approved'){
    btns.push(`<button class="friend-chat-btn primary" onclick="enterFriendProfile()">ENTRAR NO PERFIL</button>`);
  }else if(profileConfigured(targetData)){
    btns.push(`<button class="friend-chat-btn primary" onclick="requestFriendAccess('${fid}')">${sentStatus==='denied'?'PEDIR NOVA PERMISSAO':'ENVIAR PEDIDO'}</button>`);
  }
  btns.push('<button class="friend-chat-btn" onclick="closeFriendChat()">FECHAR CANAL</button>');
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
      <span>${htmlEscape(r.type)}</span>
      <b>${htmlEscape(r.title)}</b>
      ${r.detail?`<em>${htmlEscape(r.detail)}</em>`:''}
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
  const pending=Object.entries(myData.friendRequests||{}).filter(([u,r])=>PROFILES[u] && r && r.status==='pending');
  if(!pending.length){
    rb.className='request-global';
    rb.innerHTML='';
    return;
  }
  const [requester]=pending[0];
  const fp=PROFILES[requester];
  rb.className='request-global on';
  rb.innerHTML=`${fp.avatar} ${fp.name} SOLICITOU ACESSO AO SEU PERFIL <span class="back-me" onclick="openFriendPanel()">ABRIR COMMLINK</span>`;
}

async function respondFriendRequest(requester,status){
  if(!me || RO() || !PROFILES[requester])return;
  myData.friendRequests=myData.friendRequests||{};
  myData.friendRequests[requester]={status,updatedAt:new Date().toISOString()};
  await dbSet(me,'friendRequests',myData.friendRequests);
  renderFriendRequests();
  let targetData=null;
  try{targetData=await dbGet(friendId());}catch(e){}
  renderFriendChat(targetData,status==='approved'?'Acesso aprovado. O amigo ja pode entrar no seu perfil.':'Pedido recusado.');
}

async function requestFriendAccess(fid){
  const fp=PROFILES[fid];
  let targetData=await dbGet(fid);
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
  setFriendButtonText('CARREGANDO...');
  try{
    const targetData=await dbGet(friendId());
    setFriendButtonText('AMIGO');
    if(!profileConfigured(targetData)){
      renderFriendChat(targetData,'O perfil de '+PROFILES[friendId()].name+' ainda nao foi configurado.');
      return;
    }
    renderFriendChat(targetData);
  }catch(e){
    setFriendButtonText('AMIGO');
    renderFriendChat(null,'Nao foi possivel abrir o commlink: '+e.message);
  }
}

async function enterFriendProfile(){
  if(!me)return;
  const fb=document.getElementById('friend-banner');
  const fid=friendId();
  try{
    friendData=await dbGet(fid);
    if(!profileConfigured(friendData)){
      renderFriendChat(friendData,'O perfil de '+PROFILES[fid].name+' ainda nao foi configurado.');
      return;
    }
    if(friendAccessStatus(friendData,me)!=='approved'){
      renderFriendChat(friendData,'Permissao ainda nao aprovada.');
      return;
    }
    viewFriend=true;
    const fp=PROFILES[fid];
    document.body.classList.add('friend-view');
    const rb=document.getElementById('request-banner');if(rb){rb.className='request-global';rb.innerHTML='';}
    document.getElementById('nav-user').textContent=PROFILES[me].name+' > '+fp.name;
    setFriendButtonText('VOLTAR');
    const mu=document.getElementById('mob-user');if(mu)mu.textContent=PROFILES[me].name+'>'+fp.name;
    if(fb){
      fb.className='friend-view-global on';
      fb.innerHTML=`${fp.avatar} COMMLINK ATIVO: PERFIL DE ${fp.name} - SOMENTE LEITURA <span class="back-me" onclick="toggleFriend()">VOLTAR PARA MEU PERFIL</span>`;
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
    document.getElementById('nav-user').textContent=PROFILES[me].name;
    setFriendButtonText('AMIGO');
    const mu=document.getElementById('mob-user');if(mu)mu.textContent=PROFILES[me].name;
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
  if(!myData.districts || !myData.districts.length) myData.districts = JSON.parse(JSON.stringify(DEFAULT_DISTRICTS));
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

function ensurePageObjectivesData(){
  if(!myData.pageObjectives || typeof myData.pageObjectives!=='object')myData.pageObjectives={};
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
  return `<div class="custom-empty"><span>${copy[0]}</span><b>${copy[1]}</b></div>`;
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
    item.due ? ['PRAZO',item.due] : null
  ].filter(Boolean);
  return `
    <div class="custom-item ${item.status||'todo'}" style="--page-color:${def.color||'var(--y)'}">
      <div class="custom-item-top">
        <span class="custom-status-dot"></span>
        <div class="custom-item-title">${htmlEscape(item.title||'Sem titulo')}</div>
      </div>
      ${meta.length?`<div class="custom-meta-grid">${meta.map(([k,v])=>`<span class="custom-meta"><b>${k}</b>${htmlEscape(v)}</span>`).join('')}</div>`:''}
      ${customItemDetailHtml(page,item)}
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
  const note=document.getElementById('custom-note-'+page)?.value.trim();
  if(!title)return;
  myData.customPages[page].items.unshift({id:Date.now(),title,type:type||'Objetivo',metric,priority,due,note,status:'active'});
  ['title','type','metric','due','note'].forEach(id=>{const el=document.getElementById('custom-'+id+'-'+page);if(el)el.value='';});
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
  item.note=get('note')?.value.trim() || '';
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
  ['weight-exercise','weight-value','weight-reps','weight-note'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  renderExtraPage('treino');
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

function getTasks(){ return (D().taskDefs && D().taskDefs.length) ? D().taskDefs : DEFAULT_TASKS; }
function getGoals(){ return {...DEFAULT_GOALS,...(D().goals||{})}; }
function taskHabitName(task,i){ return String((task && task.text) || ('Contrato '+(i+1))).trim(); }
function getHabits(){ return getTasks().map((task,i)=>taskHabitName(task,i)); }
function getRoutines(){ return (D().routines && D().routines.length) ? D().routines : DEFAULT_ROUTINES; }
function getSkillDefs(kind){
  const data=D();
  if(kind==='guitar') return (data.guitarSkillDefs && data.guitarSkillDefs.length) ? data.guitarSkillDefs : DEFAULT_GUITAR_SKILL_DEFS;
  return (data.skillDefs && data.skillDefs.length) ? data.skillDefs : DEFAULT_SKILL_DEFS;
}

// Home: tasks and habits
function renderTasks(){
  const tasks = getTasks();
  const saved = (D().tasks||{})[dk()]||{};
  const el = document.getElementById('task-list');
  if(!el) return;
  el.innerHTML = tasks.map((t,i) => `
    <div class="task${saved[i]?' done':''}${RO()?' readonly':''}" onclick="toggleTask(this)">
      <div class="task-box">✓</div>
      <span class="task-text">${t.text}</span>
      ${t.tag?`<span class="task-tag">${t.tag}</span>`:''}
    </div>`).join('');
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
  const tasks=getTasks();
  document.querySelectorAll('#task-list .task').forEach((t,i)=>{
    const name=taskHabitName(tasks[i],i);
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
  for(let i=0;i<370;i++){
    if(!habitDone(data,habit,cursor))break;
    count++;
    cursor.setDate(cursor.getDate()-1);
  }
  return count;
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

function renderConsistencyPanel(){
  const el=document.getElementById('consistency-panel');
  if(!el)return;
  const habits=getHabits();
  if(!habits.length){el.innerHTML='<div class="empty">NENHUM HABITO</div>';return;}
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
  el.innerHTML=`
    <div class="consistency-kpis">
      <div class="ckpi"><div class="ckpi-num">${weekPct}%</div><div class="ckpi-label">Semana</div></div>
      <div class="ckpi"><div class="ckpi-num">${monthPct}%</div><div class="ckpi-label">Mes atual</div></div>
      <div class="ckpi"><div class="ckpi-num">${htmlEscape(best?.name||'--')}</div><div class="ckpi-label">Melhor habito</div></div>
      <div class="ckpi"><div class="ckpi-num">${htmlEscape(worst?.name||'--')}</div><div class="ckpi-label">Pior habito</div></div>
    </div>
    <div class="consistency-grid">
      <div>
        ${rows.map(r=>`<div class="chart-row"><div class="chart-label" title="${htmlEscape(r.name)}">${htmlEscape(r.name)}</div><div class="chart-track"><div class="chart-fill" style="width:${r.pct}%"></div></div><div class="chart-value">${r.pct}%</div></div>`).join('')}
      </div>
      <div class="streak-list">
        ${rows.map(r=>`<div class="streak-item"><div class="streak-name">${htmlEscape(r.name)}</div><div class="streak-pill">${r.streak}D streak</div></div>`).join('')}
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
    </div>`;
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
  if(browser)browser.textContent=('Notification' in window) ? (Notification.permission||'default').toUpperCase() : 'INDISPONIVEL';
  if(worker)worker.textContent=('serviceWorker' in navigator) ? (navigator.serviceWorker.controller?'ATIVO':'SUPORTADO') : 'INDISPONIVEL';
  if(push){
    if(!webPushSupported())push.textContent='INDISPONIVEL';
    else if(!WEB_PUSH_PUBLIC_KEY)push.textContent='BACKEND';
    else currentPushSubscription().then(s=>{push.textContent=s?'ATIVO':'DESLIGADO';}).catch(()=>{push.textContent='ERRO';});
  }
  if(next)next.textContent=nextReminderText();
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
  sendReminder({...sample,name:'Teste',message:'Barra cyberpunk e notificacao nativa disparadas neste aparelho.'});
}

async function testClosedPush(){
  if(!me){showCyberToast('LOGIN NECESSARIO','Entre no sistema antes de testar Web Push.');return;}
  showCyberToast('TESTE WEB PUSH','Enviando pelo backend Supabase...');
  try{
    const res=await fetch(SUPA_URL+'/functions/v1/send-reminders',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({test:true,username:me})
    });
    const data=await res.json();
    if(!res.ok || !data.ok)throw new Error(data.error||'Falha no teste');
    showCyberToast('WEB PUSH ENVIADO',`Aceitos: ${data.sent||0} | Falhas: ${data.failed||0} | Ignorados: ${data.skipped||0}`,7200);
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
  const bookTitle=reading?.title || g.bookTitle;
  const devFocus=activeProject?.name || g.devFocus;
  const skillFocus=prioritySkillName();
  const gameFocus=playing?.name || g.gameFocus;
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
  myData.goals={...DEFAULT_GOALS,...(myData.goals||{})};
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

function toggleEditTasks(){
  const form = document.getElementById('task-edit-form');
  if(!form) return;
  const open = form.style.display === 'none';
  form.style.display = open ? 'block' : 'none';
  if(open) renderTaskEditList();
}

function renderTaskEditList(){
  const tasks = myData.taskDefs && myData.taskDefs.length ? myData.taskDefs : [...DEFAULT_TASKS];
  myData.taskDefs = tasks;
  const el = document.getElementById('task-edit-list');
  if(!el) return;
  el.innerHTML = tasks.map((t,i) => `
    <div style="display:flex;gap:6px;margin-bottom:6px;align-items:center">
      <input type="text" value="${t.text}" oninput="syncTodayTasksFromDom();myData.taskDefs[${i}].text=this.value;renderTasks();syncTodayHabitsFromTasks();updateStats()" style="flex:1;font-size:12px;padding:5px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--ui)">
      <input type="text" value="${t.tag||''}" placeholder="tag" oninput="syncTodayTasksFromDom();myData.taskDefs[${i}].tag=this.value;renderTasks();syncTodayHabitsFromTasks();updateStats()" style="width:90px;font-size:12px;padding:5px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--mono)">
      <button type="button" class="mini-remove" onclick="removeTaskItem(${i})">X</button>
    </div>`).join('');
}

function addTaskItem(){
  syncTodayTasksFromDom();
  if(!myData.taskDefs || !myData.taskDefs.length) myData.taskDefs = [...DEFAULT_TASKS];
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
  if(!myData.taskDefs) myData.taskDefs = [...DEFAULT_TASKS];
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
  const habits = myData.habitDefs && myData.habitDefs.length ? myData.habitDefs : [...DEFAULT_HABITS];
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
  if(!myData.habitDefs || !myData.habitDefs.length) myData.habitDefs = [...DEFAULT_HABITS];
  myData.habitDefs.push('Novo hábito');
  renderHabitEditList();
  renderHabitsTable();
  renderConsistencyPanel();
  updateStats();
  scheduleAutoSave();
}

async function removeHabitItem(i){
  if(!(await confirmDanger('Remover este habito do tracker?')))return;
  if(!myData.habitDefs) myData.habitDefs = [...DEFAULT_HABITS];
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

function toggleTask(el){if(RO())return;el.classList.toggle('done');triggerFx(el,'fx-done',430);syncTodayTasksFromDom();syncTodayHabitsFromTasks();updateStats();scheduleAutoSave();}
function toggleH(){return;}

function updateStats(){
  const tasks=document.querySelectorAll('#task-list .task');
  const total=tasks.length||getTasks().length;
  const done=[...tasks].filter(t=>t.classList.contains('done')).length;
  document.getElementById('s-tasks').textContent=done+'/'+total;
  document.getElementById('b-tasks').style.width=total?Math.round(done/total*100)+'%':'0%';
  const col=d.getDay()===0?6:d.getDay()-1;
  const tc=document.querySelectorAll('#habits-body tr td:nth-child('+(col+2)+') .hcell');
  const hTotal=tc.length||getHabits().length;
  const hd=[...tc].filter(c=>c.classList.contains('on')).length;
  document.getElementById('s-habits').textContent=hd+'/'+hTotal;
  document.getElementById('b-habits').style.width=hTotal?Math.round(hd/hTotal*100)+'%':'0%';
  const all=document.querySelectorAll('.hcell');
  const wTotal=all.length||getHabits().length*7;
  const wd=[...all].filter(c=>c.classList.contains('on')).length;
  document.getElementById('s-week').textContent=wd+'/'+wTotal;
  document.getElementById('b-week').style.width=wTotal?Math.round(wd/wTotal*100)+'%':'0%';
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
    home:['tasks','habits','taskDefs','habitDefs','routines','lastSeenWeek','goals'],
    notificacoes:['reminders'],
    leitura:['books','goals'],
    dev:['projects','devlog','skills','skillDefs','goals'],
    violao:['guitarlog','skills','guitarSkillDefs','goals'],
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
  if(user)user.textContent=me ? (PROFILES[me]?.name || me).toUpperCase() : '--';
  if(save)save.textContent=saved ? new Date(saved).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : 'PENDENTE';
  if(keys)keys.textContent=activeKeys+'/'+SAVE_KEYS.length;
  if(session)session.textContent=me ? (hasPendingLocalSave()?'PENDENTE':(RO()?'AMIGO':'ATIVA')) : 'OFF';
}

function cloneDefaultRoutines(){
  return JSON.parse(JSON.stringify(DEFAULT_ROUTINES));
}

function renderRoutines(){
  const el=document.getElementById('routine-list');
  if(!el)return;
  const routines=getRoutines();
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
  return (data.districts && data.districts.length) ? data.districts : DEFAULT_DISTRICTS;
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
      <span class="dname" style="color:${d.color}">${d.name}</span>
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
  if(!myData.districts || !myData.districts.length) myData.districts = JSON.parse(JSON.stringify(DEFAULT_DISTRICTS));
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
  if(!myData.districts || !myData.districts.length) myData.districts = JSON.parse(JSON.stringify(DEFAULT_DISTRICTS));
  addDistrictFromTemplate('financas');
}

async function removeDistrict(i){
  if(!(await confirmDanger('Remover este distrito da navegacao?')))return;
  if(!myData.districts) myData.districts = JSON.parse(JSON.stringify(DEFAULT_DISTRICTS));
  myData.districts.splice(i,1);
  renderDistrictEditList();
  renderDistricts();
  scheduleAutoSave();
}

function addBook(){if(RO())return;const t=document.getElementById('btitle').value.trim(),a=document.getElementById('bauthor').value.trim(),s=document.getElementById('bstatus').value;if(!t)return;myData.books=myData.books||[];myData.books.unshift({id:Date.now(),title:t,author:a,status:s});document.getElementById('btitle').value='';document.getElementById('bauthor').value='';renderBooks();renderGoals();scheduleAutoSave();}
function cycleBook(id){if(RO())return;const b=myData.books||[],item=b.find(x=>x.id===id);if(!item)return;item.status={queue:'reading',reading:'done',done:'queue'}[item.status]||'queue';renderBooks();renderGoals();scheduleAutoSave();}
async function delBook(id){if(RO())return;if(!(await confirmDanger('Excluir este livro?')))return;myData.books=(myData.books||[]).filter(b=>b.id!==id);renderBooks();renderGoals();scheduleAutoSave();}
function renderBooks(){
  const b=D().books||[],el=document.getElementById('book-list');
  if(!b.length){el.innerHTML='<div class="empty">NENHUM LIVRO</div>';updateBooksProg();return;}
  el.innerHTML=b.map((x,i)=>`<div class="item"><span class="item-num">${String(i+1).padStart(2,'0')}</span><div class="item-info"><div class="item-title">${x.title}</div>${x.author?`<div class="item-sub">${x.author}</div>`:''}</div><span class="badge ${x.status}" onclick="${RO()?'':('cycleBook('+x.id+')')}" ${RO()?'style="cursor:default"':''}>${{queue:'FILA',reading:'LENDO',done:'CONCLUÍDO'}[x.status]}</span>${RO()?'':('<span class="del-btn" onclick="delBook('+x.id+')">✕</span>')}</div>`).join('');
  updateBooksProg();
}
function updateBooksProg(){const b=D().books||[],done=b.filter(x=>x.status==='done').length,target=Number(getGoals().monthlyBooks)||1;document.getElementById('books-prog').textContent=done+' / '+target;document.getElementById('books-bar').style.width=Math.min(done/target*100,100)+'%';}

function addProject(){if(RO())return;const n=document.getElementById('pname').value.trim(),s=document.getElementById('pstatus').value,note=document.getElementById('pnote').value.trim();if(!n)return;myData.projects=myData.projects||[];myData.projects.unshift({id:Date.now(),name:n,status:s,note});document.getElementById('pname').value='';document.getElementById('pnote').value='';renderProjects();renderGoals();scheduleAutoSave();}
async function delProject(id){if(RO())return;if(!(await confirmDanger('Excluir este projeto?')))return;myData.projects=(myData.projects||[]).filter(p=>p.id!==id);renderProjects();renderGoals();scheduleAutoSave();}
function renderProjects(){
  const p=D().projects||[],el=document.getElementById('proj-list');
  if(!p.length){el.innerHTML='<div class="empty">NENHUM PROJETO</div>';return;}
  const sc={active:'ATIVO',pause:'PAUSADO',done:'CONCLUÍDO'},cc={active:'var(--c)',pause:'var(--y)',done:'#3b6d11'};
  el.innerHTML=p.map(x=>`<div class="item"><div class="item-info"><div class="item-title">${x.name}</div>${x.note?`<div class="item-sub">${x.note}</div>`:''}</div><span class="badge" style="color:${cc[x.status]};background:${cc[x.status]}11;border-color:${cc[x.status]}44">${sc[x.status]}</span>${RO()?'':('<span class="del-btn" onclick="delProject('+x.id+')">✕</span>')}</div>`).join('');
}

function addDevLog(){if(RO())return;const t=document.getElementById('devlog-in').value.trim();if(!t)return;myData.devlog=myData.devlog||[];myData.devlog.unshift({id:Date.now(),date:dk(),text:t});document.getElementById('devlog-in').value='';renderDevLog();scheduleAutoSave();}
async function delDevLog(id){if(RO())return;if(!(await confirmDanger('Excluir este log de estudo?')))return;myData.devlog=(myData.devlog||[]).filter(l=>l.id!==id);renderDevLog();scheduleAutoSave();}
function renderDevLog(){const l=D().devlog||[],el=document.getElementById('dev-log');if(!l.length){el.innerHTML='<div class="empty">NENHUM LOG</div>';return;}el.innerHTML=l.slice(0,15).map(x=>`<div class="log-entry"><div class="log-head"><span class="log-date">${x.date}</span>${RO()?'':('<span class="del-btn" onclick="delDevLog('+x.id+')">✕</span>')}</div><div class="log-text">${x.text}</div></div>`).join('');}

function addGuitarLog(){if(RO())return;const t=document.getElementById('glog-in').value.trim();if(!t)return;myData.guitarlog=myData.guitarlog||[];myData.guitarlog.unshift({id:Date.now(),date:dk(),text:t});document.getElementById('glog-in').value='';renderGuitarLog();updateGStreak();scheduleAutoSave();}
async function delGLog(id){if(RO())return;if(!(await confirmDanger('Excluir este log de violao?')))return;myData.guitarlog=(myData.guitarlog||[]).filter(l=>l.id!==id);renderGuitarLog();scheduleAutoSave();}
function renderGuitarLog(){const l=D().guitarlog||[],el=document.getElementById('guitar-log');if(!l.length){el.innerHTML='<div class="empty">NENHUM LOG</div>';return;}el.innerHTML=l.slice(0,15).map(x=>`<div class="log-entry"><div class="log-head"><span class="log-date">${x.date}</span>${RO()?'':('<span class="del-btn" onclick="delGLog('+x.id+')">✕</span>')}</div><div class="log-text">${x.text}</div></div>`).join('');}
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
  return JSON.parse(JSON.stringify(kind==='guitar'?DEFAULT_GUITAR_SKILL_DEFS:DEFAULT_SKILL_DEFS));
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

function addGame(){if(RO())return;const n=document.getElementById('gname').value.trim(),s=document.getElementById('gstatus').value,note=document.getElementById('gnote').value.trim();if(!n)return;myData.games=myData.games||[];myData.games.unshift({id:Date.now(),name:n,status:s,note});document.getElementById('gname').value='';document.getElementById('gnote').value='';renderGames();renderGoals();scheduleAutoSave();}
async function delGame(id){if(RO())return;if(!(await confirmDanger('Excluir este jogo?')))return;myData.games=(myData.games||[]).filter(g=>g.id!==id);renderGames();renderGoals();scheduleAutoSave();}
function renderGames(){const g=D().games||[],cur=document.getElementById('game-current'),list=document.getElementById('game-list');const playing=g.filter(x=>x.status==='playing');cur.innerHTML=playing.length?playing.map(x=>`<div class="irow"><span class="ikey">JOGO</span><div><div class="ival">${x.name}</div>${x.note?`<div class="item-sub">${x.note}</div>`:''}</div></div>`).join(''):'<div class="empty">NENHUM JOGO ATIVO</div>';const sc={playing:'JOGANDO',queue:'FILA',done:'ZERADO',dropped:'LARGADO'};list.innerHTML=g.length?g.map(x=>`<div class="item"><div class="item-info"><div class="item-title">${x.name}</div>${x.note?`<div class="item-sub">${x.note}</div>`:''}</div><span class="badge ${x.status}">${sc[x.status]}</span>${RO()?'':('<span class="del-btn" onclick="delGame('+x.id+')">✕</span>')}</div>`).join(''):'<div class="empty">NENHUM JOGO</div>';}

function addReflexao(){if(RO())return;const t=document.getElementById('rtitle').value.trim(),txt=document.getElementById('rtext').value.trim();if(!txt)return;myData.reflexoes=myData.reflexoes||[];myData.reflexoes.unshift({id:Date.now(),date:dk(),title:t,text:txt});document.getElementById('rtitle').value='';document.getElementById('rtext').value='';renderRefs();scheduleAutoSave();}
async function delRef(id){if(RO())return;if(!(await confirmDanger('Excluir esta reflexao?')))return;myData.reflexoes=(myData.reflexoes||[]).filter(r=>r.id!==id);renderRefs();scheduleAutoSave();}
function renderRefs(){const r=D().reflexoes||[],el=document.getElementById('ref-list');if(!r.length){el.innerHTML='<div class="empty">NENHUMA REFLEXÃO</div>';return;}el.innerHTML=r.map(x=>`<div class="log-entry" style="margin-bottom:10px"><div class="log-head"><span class="log-date">${x.date}</span>${x.title?`<span style="font-size:14px;font-weight:600;color:var(--p);margin-left:8px">${x.title}</span>`:''} ${RO()?'':('<span class="del-btn" onclick="delRef('+x.id+')">✕</span>')}</div><div class="log-text" style="margin-top:5px">${x.text}</div></div>`).join('');}
