// Salvamento pendente e backup/exportacao. Mantem as chaves e a estrutura de myData.
const BACKUP_MAX_BYTES = 1024 * 1024 * 3;
const BACKUP_PAYLOAD_VERSION = 2;
let pendingBackupImport = null;

function pendingSaveKey(){
  return 'nc_pending_save_v1_'+(me||'anon');
}

function preImportBackupKey(){
  return 'nc_pre_import_backup_v1_'+(me||'anon');
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
    version:BACKUP_PAYLOAD_VERSION,
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

function backupImportSchema(){
  return {
    arrays:['books','projects','devlog','guitarlog','games','reflexoes','taskDefs','habitDefs','routines','skillDefs','guitarSkillDefs','districts','friendTargets','activityHistory','achievements','weeklyChallenges','shopUnlocks','shieldMilestones'],
    objects:['tasks','habits','skills','friendRequests','friendPermissions','profile','goals','reminders','customPages','pageObjectives','dailyReviews','prefs','quests','eddiesDaily','loginState','lootState','equippedCosmetics','seasonData'],
    numbers:['schemaVersion','eddies','streakShields'],
    strings:['friendTarget','lastSeenWeek','wrappedSeen'],
    booleans:[]
  };
}

function plainBackupObject(value){
  return value && typeof value === 'object' && !Array.isArray(value);
}

function validateBackupPayload(parsed){
  if(!plainBackupObject(parsed))throw new Error('JSON precisa ser um objeto.');
  const envelope=plainBackupObject(parsed.data);
  if(parsed.app && parsed.app !== 'night-city-life-system')throw new Error('Backup pertence a outro aplicativo.');
  if(parsed.version != null && (!Number.isFinite(Number(parsed.version)) || Number(parsed.version) > BACKUP_PAYLOAD_VERSION)){
    throw new Error('Versao de backup incompativel.');
  }
  const data=envelope ? parsed.data : parsed;
  if(!plainBackupObject(data))throw new Error('Campo data invalido.');
  const schemaVersion=Number(data.schemaVersion ?? parsed.schemaVersion ?? 0);
  if(schemaVersion && (!Number.isFinite(schemaVersion) || schemaVersion > (window.APP_SCHEMA_VERSION || 1))){
    throw new Error('schemaVersion incompativel com esta versao do app.');
  }
  const keys=Object.keys(data).filter(k=>SAVE_KEYS.includes(k));
  if(!keys.length)throw new Error('Nenhuma chave reconhecida no backup.');
  const schema=backupImportSchema();
  const typeByKey={};
  schema.arrays.forEach(k=>typeByKey[k]='array');
  schema.objects.forEach(k=>typeByKey[k]='object');
  schema.numbers.forEach(k=>typeByKey[k]='number');
  schema.strings.forEach(k=>typeByKey[k]='string');
  schema.booleans.forEach(k=>typeByKey[k]='boolean');
  keys.forEach(k=>{
    const v=data[k];
    if(v == null)return;
    const type=typeByKey[k];
    if(type==='array' && !Array.isArray(v))throw new Error('Chave '+k+' deveria ser uma lista.');
    if(type==='object' && !plainBackupObject(v))throw new Error('Chave '+k+' deveria ser um objeto.');
    if(type==='number' && typeof v !== 'number')throw new Error('Chave '+k+' deveria ser numero.');
    if(type==='string' && typeof v !== 'string')throw new Error('Chave '+k+' deveria ser texto.');
    if(type==='boolean' && typeof v !== 'boolean')throw new Error('Chave '+k+' deveria ser booleano.');
  });
  return {
    raw:parsed,
    data,
    partial:!!(parsed && parsed.partial),
    scope:parsed.scope || (envelope?'all':'legacy'),
    version:Number(parsed.version || 1),
    schemaVersion:schemaVersion || 0,
    keys
  };
}

function countBackupTasks(data){
  if(Array.isArray(data.taskDefs))return data.taskDefs.filter(t=>t && !t.archived).length;
  if(plainBackupObject(data.tasks)){
    const seen=new Set();
    Object.values(data.tasks).forEach(day=>{
      if(plainBackupObject(day))Object.keys(day).forEach(k=>seen.add(k));
    });
    return seen.size;
  }
  return 0;
}

function backupImportPreview(importInfo){
  const data=importInfo.data || {};
  return {
    tasks:countBackupTasks(data),
    books:Array.isArray(data.books) ? data.books.length : 0,
    projects:Array.isArray(data.projects) ? data.projects.length : 0,
    reviews:plainBackupObject(data.dailyReviews) ? Object.keys(data.dailyReviews).length : 0,
    prefs:plainBackupObject(data.prefs) ? Object.keys(data.prefs).length : 0
  };
}

function setText(id,value){
  const el=document.getElementById(id);
  if(el)el.textContent=String(value);
}

function showBackupImportPreview(importInfo){
  pendingBackupImport=importInfo;
  const preview=backupImportPreview(importInfo);
  setText('backup-import-summary','Backup '+(importInfo.partial?'parcial':'completo')+' validado. Escopo: '+backupScopeLabel(importInfo.scope)+'. Chaves reconhecidas: '+importInfo.keys.length+'.');
  setText('backup-preview-tasks',preview.tasks);
  setText('backup-preview-books',preview.books);
  setText('backup-preview-projects',preview.projects);
  setText('backup-preview-reviews',preview.reviews);
  setText('backup-preview-prefs',preview.prefs);
  const modal=document.getElementById('backup-import-preview');
  if(modal){
    modal.hidden=false;
    modal.classList.add('on');
  }
}

function cancelBackupImport(){
  pendingBackupImport=null;
  const modal=document.getElementById('backup-import-preview');
  if(modal){
    modal.classList.remove('on');
    modal.hidden=true;
  }
}

function createAutomaticPreImportBackup(){
  collectState();
  const payload=backupPayload('all');
  localStorage.setItem(preImportBackupKey(),JSON.stringify(payload));
  return payload;
}

function normalizedImportData(importInfo){
  const data={...(importInfo.data||{})};
  if(!importInfo.partial && typeof migrateData === 'function')return migrateData(data);
  return data;
}

async function confirmBackupImport(){
  if(!pendingBackupImport || !me || RO())return;
  const importInfo=pendingBackupImport;
  try{
    createAutomaticPreImportBackup();
    const data=normalizedImportData(importInfo);
    SAVE_KEYS.forEach(k=>{
      if(!Object.prototype.hasOwnProperty.call(data,k))return;
      if(importInfo.partial && k==='customPages')myData.customPages={...(myData.customPages||{}),...(data.customPages||{})};
      else if(importInfo.partial && k==='pageObjectives')myData.pageObjectives={...(myData.pageObjectives||{}),...(data.pageObjectives||{})};
      else myData[k]=data[k];
    });
    collectState();
    await Promise.all(SAVE_KEYS.map(k=>dbSet(me,k,myData[k] ?? null)));
    localStorage.setItem(lastSaveKey(),new Date().toISOString());
    cancelBackupImport();
    applyData();
    showCyberToast('BACKUP IMPORTADO','Backup automatico anterior salvo localmente e dados sincronizados.',7200);
  }catch(e){
    showCyberToast('ERRO NO BACKUP',e.message||'Nao foi possivel importar este arquivo.',6800);
  }finally{
    renderSystemStatus();
  }
}

async function importBackupFile(input){
  if(!input || !input.files || !input.files[0])return;
  if(!me){showCyberToast('LOGIN NECESSARIO','Entre antes de importar um backup.');input.value='';return;}
  const file=input.files[0];
  try{
    if(file.size > BACKUP_MAX_BYTES)throw new Error('Arquivo muito grande. Limite: 3 MB.');
    if(file.size <= 0)throw new Error('Arquivo vazio.');
    const text=await file.text();
    if(text.length > BACKUP_MAX_BYTES)throw new Error('Arquivo muito grande. Limite: 3 MB.');
    const parsed=JSON.parse(text);
    const importInfo=validateBackupPayload(parsed);
    showBackupImportPreview(importInfo);
  }catch(e){
    showCyberToast('ERRO NO BACKUP',e.message||'Nao foi possivel importar este arquivo.',6800);
  }finally{
    input.value='';
    renderSystemStatus();
  }
}
