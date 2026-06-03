// Helpers visuais globais. Mantidos como script classico para preservar a UI atual.
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
