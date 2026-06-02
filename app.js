"use strict";
const SUPA_URL = 'https://wmglywfsrlcpsspouufp.supabase.co';
const SUPA_KEY = 'sb_publishable_X6xbf9gD2JxmBXxthWG6lQ_gM5hvxeW';
const WEB_PUSH_PUBLIC_KEY = 'BAXYgFpb56ooYOLihzUYKchPIzfXgyQyJxNfI8jUavmH9-AuVvUcbMse8Bdv_0juXpC69b1SkM1q3WenhhVtzmM'; // VAPID public key para notificacoes com o site fechado.
let sb;
try {
  if(!window.supabase) throw new Error('Supabase SDK nao carregou');
  sb = supabase.createClient(SUPA_URL, SUPA_KEY);
} catch(e) {
  console.error('Supabase init failed:', e);
}

const PROFILES = {
  victor: {name:'VICTOR', avatar:'🔴', color:'var(--y)', role:'NETRUNNER'},
  caio:   {name:'CAIO',   avatar:'🔵', color:'var(--c)', role:'CORPO'}
};

let me=null, viewFriend=false, myData={}, friendData={};
let selProfile=null, isNewUser=false;
let reminders={}, reminderTimer=null;
let currentTheme='arasaka';

const SAVE_KEYS=[
  'tasks','habits','books','projects','devlog','guitarlog','games','reflexoes',
  'skills','taskDefs','habitDefs','routines','skillDefs','guitarSkillDefs',
  'districts','friendRequests','lastSeenWeek','goals','reminders'
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

const THEMES={
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
  drawer.dataset.ready='1';
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

function closeHomeModule(closeBodyClass=true){
  const screen=document.getElementById('home-module-screen');
  const body=document.getElementById('home-module-body');
  const store=document.getElementById('home-module-store');
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
  loadReminders();
  document.getElementById('login-screen').style.display='none';
  document.getElementById('nav-user').textContent=PROFILES[me].name;
  const mu=document.getElementById('mob-user');if(mu)mu.textContent=PROFILES[me].name;
  applyData(); updateStats(); updateCurrentDate(); renderFriendRequests(); renderReminders(); startReminderEngine();
  handleWeeklyRollover();
}

// App lifecycle
window.addEventListener('DOMContentLoaded', async ()=>{
  document.body.classList.add('force-motion','mobile-boot');
  setTimeout(()=>document.body.classList.remove('mobile-boot'),900);
  setupHomeSideMenu();
  applyTheme(localStorage.getItem('nc_theme_v1_anon')||'arasaka');
  updateCurrentDate();
  const saved=loadSession();
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
  document.getElementById('pwd-input').value='';
  document.getElementById('pwd-confirm').value='';
  checkIfNewUser(id);
}

async function checkIfNewUser(id){
  const st=document.getElementById('login-status');
  const fp=PROFILES[id];
  const btn=document.getElementById('login-btn');
  st.textContent='// VERIFICANDO... //';
  try{
    const data=await dbGet(id);
    if(selProfile!==id)return;
    isNewUser=!data.pwd_hash;
    if(isNewUser){
      document.getElementById('login-sub').textContent='CRIAR SENHA - '+fp.name;
      document.getElementById('pwd-label').textContent='CRIAR SENHA';
      document.getElementById('pwd-confirm-wrap').style.display='block';
      btn.textContent='CRIAR CONTA';
      st.textContent='// NOVO PERFIL - CRIE UMA SENHA //';
    } else {
      document.getElementById('login-sub').textContent='BEM-VINDO, '+fp.name;
      document.getElementById('pwd-label').textContent='SENHA';
      document.getElementById('pwd-confirm-wrap').style.display='none';
      btn.textContent='CONECTAR';
      st.textContent='// INSIRA SUA SENHA //';
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
  document.getElementById('step-password').style.display='none';
  document.getElementById('login-btn').disabled=true;
  document.getElementById('login-btn').textContent='CONECTAR AO SISTEMA';
  document.getElementById('login-sub').textContent='SELECIONE SEU PERFIL';
  document.getElementById('login-status').textContent='// AGUARDANDO SELECAO //';
  document.getElementById('pwd-input').value='';
  document.getElementById('pwd-confirm').value='';
  document.getElementById('pwd-confirm-wrap').style.display='none';
  document.querySelectorAll('.profile-card').forEach(c=>c.classList.remove('selected'));
  selProfile=null; isNewUser=false;
}

async function doLogin(){
  const btn=document.getElementById('login-btn'),st=document.getElementById('login-status');
  if(!selProfile || !PROFILES[selProfile]){ st.textContent='// SELECIONE UM PERFIL //'; return; }
  const pwd=document.getElementById('pwd-input').value;
  if(!pwd){ st.textContent='// DIGITE SUA SENHA //'; return; }
  btn.disabled=true; st.textContent='// AUTENTICANDO... //';
  try{
    const hash=await hashPwd(pwd);
    if(isNewUser){
      const confirm=document.getElementById('pwd-confirm').value;
      if(!confirm){ st.textContent='// CONFIRME A SENHA //'; btn.disabled=false; return; }
      if(pwd!==confirm){ st.textContent='// SENHAS NAO CONFEREM //'; btn.disabled=false; return; }
      if(pwd.length<4){ st.textContent='// MINIMO 4 CARACTERES //'; btn.disabled=false; return; }
      await dbSet(selProfile,'pwd_hash',hash);
    } else {
      const data=await dbGet(selProfile);
      if(data.pwd_hash!==hash){
        st.textContent='// SENHA INCORRETA //';
        btn.disabled=false;
        document.getElementById('pwd-input').value='';
        document.getElementById('pwd-input').focus();
        return;
      }
    }
    const username=selProfile;
    const data=await dbGet(username);
    saveSession(username);
    document.getElementById('pwd-input').value='';
    document.getElementById('pwd-confirm').value='';
    unlockApp(username,data);
  }catch(e){
    st.textContent='// ERRO: '+e.message+' //';
    btn.disabled=false;
  }
}

function doLogout(){
  if(autoSaveTimer){clearTimeout(autoSaveTimer);autoSaveTimer=null;}
  stopReminderEngine();
  clearSession();
  me=null; myData={};
  clearFriendUi();
  selProfile=null; isNewUser=false;
  document.getElementById('login-screen').style.display='flex';
  document.getElementById('step-select').style.display='block';
  document.getElementById('step-password').style.display='none';
  document.getElementById('login-btn').disabled=true;
  document.getElementById('login-btn').textContent='CONECTAR AO SISTEMA';
  document.getElementById('login-sub').textContent='SELECIONE SEU PERFIL';
  document.getElementById('pwd-input').value='';
  document.getElementById('pwd-confirm').value='';
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
  renderNavTabs();
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
  body.innerHTML=msgs.join('');
  const btns=[];
  if(receivedStatus==='pending'){
    btns.push(`<button class="friend-chat-btn primary" onclick="respondFriendRequest('${fid}','approved')">APROVAR ${fp.name}</button>`);
    btns.push(`<button class="friend-chat-btn danger" onclick="respondFriendRequest('${fid}','denied')">RECUSAR</button>`);
  }
  if(sentStatus==='approved'){
    btns.push(`<button class="friend-chat-btn primary" onclick="enterFriendProfile()">ENTRAR NO PERFIL</button>`);
  }else if(targetData && targetData.pwd_hash){
    btns.push(`<button class="friend-chat-btn primary" onclick="requestFriendAccess('${fid}')">${sentStatus==='denied'?'PEDIR NOVA PERMISSAO':'ENVIAR PEDIDO'}</button>`);
  }
  btns.push('<button class="friend-chat-btn" onclick="closeFriendChat()">FECHAR CANAL</button>');
  actions.innerHTML=btns.join('');
  chat.className='friend-chat on';
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
    if(!targetData.pwd_hash){
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
    if(!friendData.pwd_hash){
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
  closeHomeModule();
  toggleHomeMenu(false);
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-tab,.mob-tab').forEach(t=>t.classList.remove('active','loading'));
  const page=document.getElementById('page-'+id);
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
}

function triggerFx(el,cls='fx-touch',ms=420){
  if(!el)return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(()=>el.classList.remove(cls),ms);
}


// Defaults
const DEFAULT_TASKS = [
  {icon:'\u{1F4A7}', text:'Hidratacao - 2L', tag:''},
  {icon:'\u{1F4DA}', text:'Leitura - 30 min', tag:'Livro atual'},
  {icon:'\u{1F4BB}', text:'Netrunning - 30-60 min', tag:'App Rotina'},
  {icon:'\u{1F3B8}', text:'Jam Session - 15 min', tag:''},
  {icon:'\u{1F3CB}\u{FE0F}', text:'Treino - Corpo - 60 min', tag:''},
  {icon:'\u{1F3AE}', text:'Tempo Livre - 60 min', tag:''}
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
  ['\u{26A1}','Energia'],['\u{1F4A7}','Agua'],['\u{1F4DA}','Leitura'],['\u{1F4BB}','Dev'],['\u{1F3B8}','Violao'],
  ['\u{1F3CB}\u{FE0F}','Treino'],['\u{1F3AE}','Jogos'],['\u{1F9E0}','Reflexao'],['\u{1F4B0}','Dinheiro'],
  ['\u{1F4B3}','Financas'],['\u{1F4C8}','Investimentos'],['\u{1F6D2}','Compras'],['\u{1F3E0}','Casa'],
  ['\u{1F5D3}\u{FE0F}','Agenda'],['\u{1F37D}\u{FE0F}','Comida'],['\u{1F634}','Sono'],['\u{1F3AF}','Meta'],['\u{1F517}','Link']
];

function iconOptions(selected){
  return ICON_CHOICES.map(([icon,label])=>`<option value="${icon}" ${selected===icon?'selected':''}>${icon} ${label}</option>`).join('');
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
      <span class="task-icon">${htmlEscape(t.icon||'\u{26A1}')}</span>
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
      <select onchange="syncTodayTasksFromDom();myData.taskDefs[${i}].icon=this.value;renderTasks()" style="width:78px;font-size:12px;padding:5px 6px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--mono)">
        ${iconOptions(t.icon||'\u{26A1}')}
      </select>
      <input type="text" value="${t.text}" oninput="syncTodayTasksFromDom();myData.taskDefs[${i}].text=this.value;renderTasks();syncTodayHabitsFromTasks();updateStats()" style="flex:1;font-size:12px;padding:5px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--ui)">
      <input type="text" value="${t.tag||''}" placeholder="tag" oninput="syncTodayTasksFromDom();myData.taskDefs[${i}].tag=this.value;renderTasks();syncTodayHabitsFromTasks();updateStats()" style="width:90px;font-size:12px;padding:5px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--mono)">
      <span onclick="removeTaskItem(${i})" style="color:var(--r);cursor:pointer;font-size:14px;opacity:.6;padding:0 4px">✕</span>
    </div>`).join('');
}

function addTaskItem(){
  syncTodayTasksFromDom();
  if(!myData.taskDefs || !myData.taskDefs.length) myData.taskDefs = [...DEFAULT_TASKS];
  myData.taskDefs.push({icon:'\u{26A1}', text:'Nova missão', tag:''});
  renderTaskEditList();
  renderTasks();
  syncTodayHabitsFromTasks();
  updateStats();
  scheduleAutoSave();
}

function removeTaskItem(i){
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
      <span onclick="removeHabitItem(${i})" style="color:var(--r);cursor:pointer;font-size:14px;opacity:.6;padding:0 4px">✕</span>
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

function removeHabitItem(i){
  if(!myData.habitDefs) myData.habitDefs = [...DEFAULT_HABITS];
  myData.habitDefs.splice(i,1);
  renderHabitEditList();
  renderHabitsTable();
  renderConsistencyPanel();
  updateStats();
  scheduleAutoSave();
}

function resetWeeklyHabits(){
  if(RO())return;
  const ok=confirm('Resetar todos os habitos marcados desta semana?');
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
        <span onclick="removeRoutine(${i})" style="color:var(--r);cursor:pointer;font-size:14px;opacity:.6;padding:0 4px">x</span>
      </div>
      ${(r.steps||[]).map((s,j)=>`
        <div style="display:flex;gap:6px;margin-bottom:6px;align-items:center;padding-left:10px">
          <input type="text" value="${htmlEscape(s)}" oninput="myData.routines[${i}].steps[${j}]=this.value;renderRoutines()"
            style="flex:1;font-size:12px;padding:5px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--ui)">
          <span onclick="removeRoutineStep(${i},${j})" style="color:var(--r);cursor:pointer;font-size:13px;opacity:.6;padding:0 4px">x</span>
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

function removeRoutine(i){
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

function removeRoutineStep(i,j){
  if(!myData.routines || !myData.routines[i])return;
  myData.routines[i].steps.splice(j,1);
  renderRoutineEditList();
  renderRoutines();
  scheduleAutoSave();
}

function toggleR(h){h.querySelector('.rarrow').classList.toggle('open');h.nextElementSibling.classList.toggle('open');}

// Districts
const DEFAULT_DISTRICTS = [
  {icon:'📚', name:'Leitura',     color:'#97C459', page:'leitura'},
  {icon:'💻', name:'Programação', color:'#378ADD', page:'dev'},
  {icon:'🎸', name:'Violão',      color:'#e00f3a', page:'violao'},
  {icon:'🎮', name:'Jogos',       color:'#fcee09', page:'jogos'},
  {icon:'🧠', name:'Reflexões',   color:'#b44fff', page:'reflexoes'}
];
const DISTRICT_COLORS = ['#97C459','#378ADD','#e00f3a','#fcee09','#b44fff','#00d4ff','#fcee09','#f0997b','#d4537e'];
const DISTRICT_PAGES = ['leitura','dev','violao','jogos','reflexoes'];
const ICON_PAGES = ['home','notificacoes'].concat(DISTRICT_PAGES);
const PAGE_LABELS = {notificacoes:'Notificacoes',leitura:'Leitura',dev:'Dev',violao:'Violao',jogos:'Jogos',reflexoes:'Reflexoes'};
const PAGE_ICON_COLORS = {home:'var(--y)',notificacoes:'var(--c)',leitura:'var(--y)',dev:'var(--c)',violao:'var(--r)',jogos:'var(--y)',reflexoes:'var(--p)'};

function getDistricts(){
  const data=D();
  return (data.districts && data.districts.length) ? data.districts : DEFAULT_DISTRICTS;
}

function getNavDistricts(){
  const used = new Set();
  return getDistricts().filter(d => {
    if(!DISTRICT_PAGES.includes(d.page) || used.has(d.page)) return false;
    used.add(d.page);
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
    return `<div class="nav-tab icon-only ${active===page?'active':''}" data-page="${page}" title="${htmlEscape(name)}" aria-label="${htmlEscape(name)}" onclick="goPage('${page}')">${cyberIcon(page,color)}</div>`;
  }).join('');
  const mobHtml = items.map(d => {
    const page = d.page || 'home';
    const name = d.name || PAGE_LABELS[page] || page;
    const color = iconColorFor(d);
    return `<div class="mob-tab icon-only ${active===page?'active':''}" data-page="${page}" title="${htmlEscape(name)}" aria-label="${htmlEscape(name)}" onclick="goPage('${page}')">${cyberIcon(page,color)}</div>`;
  }).join('');
  if(nav) nav.innerHTML = tabHtml;
  if(mob) mob.innerHTML = mobHtml;
}

function renderDistricts(){
  const list = document.getElementById('district-list');
  if(!list){renderNavTabs();return;}
  const districts = getDistricts();
  list.innerHTML = districts.map(d => {
    const color = iconColorFor(d);
    return `
    <div class="dbtn" onclick="${DISTRICT_PAGES.includes(d.page) ? "goPage('"+d.page+"')" : d.url ? "window.open('"+d.url+"','_blank')" : ''}">
      ${cyberIcon(d.page,color)}
      <span class="district-emoji">${htmlEscape(d.icon||'\u{26A1}')}</span>
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

function renderDistrictEditList(){
  if(!myData.districts || !myData.districts.length) myData.districts = JSON.parse(JSON.stringify(DEFAULT_DISTRICTS));
  const el = document.getElementById('district-edit-list');
  if(!el) return;
  el.innerHTML = myData.districts.map((d,i) => `
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:10px;margin-bottom:8px">
      <div style="display:flex;gap:6px;margin-bottom:6px;align-items:center">
        <select onchange="myData.districts[${i}].icon=this.value;renderDistricts()"
          style="width:82px;font-size:12px;padding:5px 4px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--mono)">
          ${iconOptions(d.icon||'\u{26A1}')}
        </select>
        <input type="text" value="${d.name}" oninput="myData.districts[${i}].name=this.value;renderDistricts()"
          style="flex:1;font-size:12px;padding:5px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--ui)">
        <input type="color" value="${d.color}" oninput="myData.districts[${i}].color=this.value;renderDistricts()"
          style="width:32px;height:32px;border:none;border-radius:4px;background:none;cursor:pointer;padding:0">
        <span onclick="removeDistrict(${i})" style="color:var(--r);cursor:pointer;font-size:14px;opacity:.6;padding:0 4px">✕</span>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <span style="font-family:var(--mono);font-size:9px;color:var(--muted);letter-spacing:1px;white-space:nowrap">PÁGINA</span>
        <select onchange="myData.districts[${i}].page=this.value;myData.districts[${i}].url='';renderDistricts()"
          style="flex:1;font-size:11px;padding:4px 6px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--mono)">
          <option value="leitura" ${d.page==='leitura'?'selected':''}>📚 Leitura</option>
          <option value="dev" ${d.page==='dev'?'selected':''}>💻 Dev</option>
          <option value="violao" ${d.page==='violao'?'selected':''}>🎸 Violão</option>
          <option value="jogos" ${d.page==='jogos'?'selected':''}>🎮 Jogos</option>
          <option value="reflexoes" ${d.page==='reflexoes'?'selected':''}>🧠 Reflexões</option>
          <option value="url" ${d.url?'selected':''}>🔗 Link externo</option>
        </select>
      </div>
      ${d.url!==undefined && !DISTRICT_PAGES.includes(d.page) ? `
      <div style="display:flex;gap:6px;align-items:center;margin-top:6px">
        <span style="font-family:var(--mono);font-size:9px;color:var(--muted);letter-spacing:1px;white-space:nowrap">URL</span>
        <input type="text" value="${d.url||''}" placeholder="https://..." oninput="myData.districts[${i}].url=this.value"
          style="flex:1;font-size:11px;padding:4px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--mono)">
      </div>` : ''}
    </div>`).join('');
}

function addDistrictItem(){
  if(!myData.districts || !myData.districts.length) myData.districts = JSON.parse(JSON.stringify(DEFAULT_DISTRICTS));
  myData.districts.push({icon:'\u{1F4B0}', name:'Financas', color:'#97C459', page:'url', url:''});
  renderDistrictEditList();
  renderDistricts();
  scheduleAutoSave();
}

function removeDistrict(i){
  if(!myData.districts) myData.districts = JSON.parse(JSON.stringify(DEFAULT_DISTRICTS));
  myData.districts.splice(i,1);
  renderDistrictEditList();
  renderDistricts();
  scheduleAutoSave();
}

function addBook(){if(RO())return;const t=document.getElementById('btitle').value.trim(),a=document.getElementById('bauthor').value.trim(),s=document.getElementById('bstatus').value;if(!t)return;myData.books=myData.books||[];myData.books.unshift({id:Date.now(),title:t,author:a,status:s});document.getElementById('btitle').value='';document.getElementById('bauthor').value='';renderBooks();renderGoals();scheduleAutoSave();}
function cycleBook(id){if(RO())return;const b=myData.books||[],item=b.find(x=>x.id===id);if(!item)return;item.status={queue:'reading',reading:'done',done:'queue'}[item.status]||'queue';renderBooks();renderGoals();scheduleAutoSave();}
function delBook(id){if(RO())return;myData.books=(myData.books||[]).filter(b=>b.id!==id);renderBooks();renderGoals();scheduleAutoSave();}
function renderBooks(){
  const b=D().books||[],el=document.getElementById('book-list');
  if(!b.length){el.innerHTML='<div class="empty">NENHUM LIVRO</div>';updateBooksProg();return;}
  el.innerHTML=b.map((x,i)=>`<div class="item"><span class="item-num">${String(i+1).padStart(2,'0')}</span><div class="item-info"><div class="item-title">${x.title}</div>${x.author?`<div class="item-sub">${x.author}</div>`:''}</div><span class="badge ${x.status}" onclick="${RO()?'':('cycleBook('+x.id+')')}" ${RO()?'style="cursor:default"':''}>${{queue:'FILA',reading:'LENDO',done:'CONCLUÍDO'}[x.status]}</span>${RO()?'':('<span class="del-btn" onclick="delBook('+x.id+')">✕</span>')}</div>`).join('');
  updateBooksProg();
}
function updateBooksProg(){const b=D().books||[],done=b.filter(x=>x.status==='done').length,target=Number(getGoals().monthlyBooks)||1;document.getElementById('books-prog').textContent=done+' / '+target;document.getElementById('books-bar').style.width=Math.min(done/target*100,100)+'%';}

function addProject(){if(RO())return;const n=document.getElementById('pname').value.trim(),s=document.getElementById('pstatus').value,note=document.getElementById('pnote').value.trim();if(!n)return;myData.projects=myData.projects||[];myData.projects.unshift({id:Date.now(),name:n,status:s,note});document.getElementById('pname').value='';document.getElementById('pnote').value='';renderProjects();renderGoals();scheduleAutoSave();}
function delProject(id){if(RO())return;myData.projects=(myData.projects||[]).filter(p=>p.id!==id);renderProjects();renderGoals();scheduleAutoSave();}
function renderProjects(){
  const p=D().projects||[],el=document.getElementById('proj-list');
  if(!p.length){el.innerHTML='<div class="empty">NENHUM PROJETO</div>';return;}
  const sc={active:'ATIVO',pause:'PAUSADO',done:'CONCLUÍDO'},cc={active:'var(--c)',pause:'var(--y)',done:'#3b6d11'};
  el.innerHTML=p.map(x=>`<div class="item"><div class="item-info"><div class="item-title">${x.name}</div>${x.note?`<div class="item-sub">${x.note}</div>`:''}</div><span class="badge" style="color:${cc[x.status]};background:${cc[x.status]}11;border-color:${cc[x.status]}44">${sc[x.status]}</span>${RO()?'':('<span class="del-btn" onclick="delProject('+x.id+')">✕</span>')}</div>`).join('');
}

function addDevLog(){if(RO())return;const t=document.getElementById('devlog-in').value.trim();if(!t)return;myData.devlog=myData.devlog||[];myData.devlog.unshift({id:Date.now(),date:dk(),text:t});document.getElementById('devlog-in').value='';renderDevLog();scheduleAutoSave();}
function delDevLog(id){if(RO())return;myData.devlog=(myData.devlog||[]).filter(l=>l.id!==id);renderDevLog();scheduleAutoSave();}
function renderDevLog(){const l=D().devlog||[],el=document.getElementById('dev-log');if(!l.length){el.innerHTML='<div class="empty">NENHUM LOG</div>';return;}el.innerHTML=l.slice(0,15).map(x=>`<div class="log-entry"><div class="log-head"><span class="log-date">${x.date}</span>${RO()?'':('<span class="del-btn" onclick="delDevLog('+x.id+')">✕</span>')}</div><div class="log-text">${x.text}</div></div>`).join('');}

function addGuitarLog(){if(RO())return;const t=document.getElementById('glog-in').value.trim();if(!t)return;myData.guitarlog=myData.guitarlog||[];myData.guitarlog.unshift({id:Date.now(),date:dk(),text:t});document.getElementById('glog-in').value='';renderGuitarLog();updateGStreak();scheduleAutoSave();}
function delGLog(id){if(RO())return;myData.guitarlog=(myData.guitarlog||[]).filter(l=>l.id!==id);renderGuitarLog();scheduleAutoSave();}
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
      <span onclick="removeSkillDef('${kind}',${i})" style="color:var(--r);cursor:pointer;font-size:14px;opacity:.6;padding:0 4px">x</span>
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

function removeSkillDef(kind,i){
  const defs=ensureSkillDefs(kind);
  const removed=defs.splice(i,1)[0];
  if(removed && myData.skills) delete myData.skills[removed.id];
  renderSkillDefEditor(kind);
  renderSkills();
  scheduleAutoSave();
}

function addGame(){if(RO())return;const n=document.getElementById('gname').value.trim(),s=document.getElementById('gstatus').value,note=document.getElementById('gnote').value.trim();if(!n)return;myData.games=myData.games||[];myData.games.unshift({id:Date.now(),name:n,status:s,note});document.getElementById('gname').value='';document.getElementById('gnote').value='';renderGames();renderGoals();scheduleAutoSave();}
function delGame(id){if(RO())return;myData.games=(myData.games||[]).filter(g=>g.id!==id);renderGames();renderGoals();scheduleAutoSave();}
function renderGames(){const g=D().games||[],cur=document.getElementById('game-current'),list=document.getElementById('game-list');const playing=g.filter(x=>x.status==='playing');cur.innerHTML=playing.length?playing.map(x=>`<div class="irow"><span class="ikey">JOGO</span><div><div class="ival">${x.name}</div>${x.note?`<div class="item-sub">${x.note}</div>`:''}</div></div>`).join(''):'<div class="empty">NENHUM JOGO ATIVO</div>';const sc={playing:'JOGANDO',queue:'FILA',done:'ZERADO',dropped:'LARGADO'};list.innerHTML=g.length?g.map(x=>`<div class="item"><div class="item-info"><div class="item-title">${x.name}</div>${x.note?`<div class="item-sub">${x.note}</div>`:''}</div><span class="badge ${x.status}">${sc[x.status]}</span>${RO()?'':('<span class="del-btn" onclick="delGame('+x.id+')">✕</span>')}</div>`).join(''):'<div class="empty">NENHUM JOGO</div>';}

function addReflexao(){if(RO())return;const t=document.getElementById('rtitle').value.trim(),txt=document.getElementById('rtext').value.trim();if(!txt)return;myData.reflexoes=myData.reflexoes||[];myData.reflexoes.unshift({id:Date.now(),date:dk(),title:t,text:txt});document.getElementById('rtitle').value='';document.getElementById('rtext').value='';renderRefs();scheduleAutoSave();}
function delRef(id){if(RO())return;myData.reflexoes=(myData.reflexoes||[]).filter(r=>r.id!==id);renderRefs();scheduleAutoSave();}
function renderRefs(){const r=D().reflexoes||[],el=document.getElementById('ref-list');if(!r.length){el.innerHTML='<div class="empty">NENHUMA REFLEXÃO</div>';return;}el.innerHTML=r.map(x=>`<div class="log-entry" style="margin-bottom:10px"><div class="log-head"><span class="log-date">${x.date}</span>${x.title?`<span style="font-size:14px;font-weight:600;color:var(--p);margin-left:8px">${x.title}</span>`:''} ${RO()?'':('<span class="del-btn" onclick="delRef('+x.id+')">✕</span>')}</div><div class="log-text" style="margin-top:5px">${x.text}</div></div>`).join('');}
