// Utilitarios puros de seguranca e validacao.
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

function cleanText(value,maxLength=500){
  return String(value ?? '').trim().slice(0,maxLength);
}

function validKey(value){
  return /^[a-zA-Z0-9_-]+$/.test(String(value||''));
}
