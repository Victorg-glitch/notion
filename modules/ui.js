// Helpers visuais globais. Mantidos como script classico para preservar a UI atual.
// Estado vazio para a visao publica (read-only): comunica status sem CTA de acao.
function publicEmpty(label,hint){
  return `<div class="smart-empty compact public-empty"><span>${htmlEscape(label)}</span><b>${htmlEscape(hint)}</b></div>`;
}

function callActionAttrs(action){
  const raw=String(action||'').trim();
  const m=raw.match(/^([a-zA-Z_$][\w$]*)\((?:'([^']*)')?\)$/) || raw.match(/^([a-zA-Z_$][\w$]*)$/);
  if(!m)return '';
  const arg=m[2] == null ? '' : ` data-arg="${htmlEscape(m[2])}"`;
  return `data-action="callNamed" data-fn="${htmlEscape(m[1])}"${arg}`;
}

function emptyActionCard(opts){
  const compact=opts.compact===false?'':' compact';
  const secondary=opts.secondaryLabel&&opts.secondaryAction
    ? `<button type="button" class="secondary" ${callActionAttrs(opts.secondaryAction)}>${htmlEscape(opts.secondaryLabel)}</button>`
    : '';
  return `<div class="smart-empty${compact}">
    <span>${htmlEscape(opts.title)}</span>
    <b>${htmlEscape(opts.body)}</b>
    <div class="smart-actions">
      <button type="button" ${callActionAttrs(opts.primaryAction)}>${htmlEscape(opts.primaryLabel)}</button>
      ${secondary}
    </div>
  </div>`;
}
