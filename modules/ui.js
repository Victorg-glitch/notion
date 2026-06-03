// Helpers visuais globais. Mantidos como script classico para preservar os onclick inline.
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

// Estado vazio para a visao publica (read-only): comunica status sem CTA de acao.
function publicEmpty(label,hint){
  return `<div class="smart-empty compact public-empty"><span>${htmlEscape(label)}</span><b>${htmlEscape(hint)}</b></div>`;
}

function emptyActionCard(opts){
  const compact=opts.compact===false?'':' compact';
  const secondary=opts.secondaryLabel&&opts.secondaryAction
    ? `<button type="button" class="secondary" onclick="${opts.secondaryAction}">${htmlEscape(opts.secondaryLabel)}</button>`
    : '';
  return `<div class="smart-empty${compact}">
    <span>${htmlEscape(opts.title)}</span>
    <b>${htmlEscape(opts.body)}</b>
    <div class="smart-actions">
      <button type="button" onclick="${opts.primaryAction}">${htmlEscape(opts.primaryLabel)}</button>
      ${secondary}
    </div>
  </div>`;
}
