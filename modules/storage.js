// Salvamento pendente e backup/exportacao. Mantem as chaves e a estrutura de myData.
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
