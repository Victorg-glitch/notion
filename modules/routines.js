// Rotinas da Home/Side Deck. Script global para manter compatibilidade com onclick inline.
function cloneDefaultRoutines(){
  return JSON.parse(JSON.stringify(creatorDefaults(DEFAULT_ROUTINES)));
}

function renderRoutines(){
  const el=document.getElementById('routine-list');
  if(!el)return;
  const routines=getRoutines();
  if(!routines.length){el.innerHTML=RO()?publicEmpty('SEM ROTINAS PUBLICAS','Este operador ainda nao montou blocos de rotina.'):emptyActionCard({title:'SEM ROTINAS CONFIGURADAS',body:'Crie uma rotina de manha ou noite para organizar seus habitos.',primaryLabel:'CRIAR ROTINA',primaryAction:'addRoutine()',secondaryLabel:'USAR ROTINA DA MANHA',secondaryAction:"createRoutineTemplate('manha')",compact:true});return;}
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

function createRoutineTemplate(kind){
  if(RO())return;
  myData.routines=myData.routines||[];
  const morning={title:'Rotina da manha',steps:['Beber agua','Revisar contratos do dia','Comecar pela menor tarefa']};
  const night={title:'Fechamento da noite',steps:['Marcar contratos feitos','Registrar reflexao curta','Separar primeiro passo de amanha']};
  myData.routines.push(kind==='noite'?night:morning);
  renderRoutineEditList();
  renderRoutines();
  scheduleAutoSave();
  showCyberToast('ROTINA ADICIONADA',(kind==='noite'?'Fechamento da noite':'Rotina da manha')+' pronta para editar.');
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
