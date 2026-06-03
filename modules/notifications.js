// Lembretes e Web Push. Mantem as mesmas chaves e o mesmo estado global `reminders`.
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
    showCyberToast('BACKEND PENDENTE','Para notificar com o site fechado, configure a VAPID public key e faca deploy da funcao Supabase.');
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
