// Gamificacao do Night City. Script classico: preserva funcoes globais usadas por app.js e data-action.
// Nao altera myData nem chaves salvas; apenas move logica de Street Cred, Eddies, loja, loot e conquistas.

/* ============================================================
   RETENCAO: Eddies (€$), escudos de streak, login, loot, loja
   ============================================================ */
function ensureRetentionData(){
  if(typeof myData.eddies!=='number')myData.eddies=0;
  if(!myData.eddiesDaily || typeof myData.eddiesDaily!=='object')myData.eddiesDaily={date:'',earned:0};
  if(typeof myData.streakShields!=='number')myData.streakShields=0;
  if(!Array.isArray(myData.shieldMilestones))myData.shieldMilestones=[];
  if(!myData.loginState || typeof myData.loginState!=='object')myData.loginState={streak:0,lastDate:'',lastBonus:0};
  if(!myData.lootState || typeof myData.lootState!=='object')myData.lootState={lastDate:'',history:[]};
  if(!Array.isArray(myData.lootState.history))myData.lootState.history=[];
  if(!Array.isArray(myData.shopUnlocks))myData.shopUnlocks=[];
  if(!myData.equippedCosmetics || typeof myData.equippedCosmetics!=='object')myData.equippedCosmetics={};
  if(typeof myData.wrappedSeen!=='string')myData.wrappedSeen='';
  if(!myData.seasonData || typeof myData.seasonData!=='object')myData.seasonData={};
}

// Unica forma de conceder eddies. Trava anti-cheat de 200/dia.
function awardEddies(amount,reason){
  if(RO())return 0;
  ensureRetentionData();
  if(myData.eddiesDaily.date!==dk())myData.eddiesDaily={date:dk(),earned:0};
  const room=Math.max(0,200-myData.eddiesDaily.earned);
  const grant=Math.min(Math.max(0,amount|0),room);
  myData.eddies+=grant;
  myData.eddiesDaily.earned+=grant;
  if(!myData.eddiesHistory) myData.eddiesHistory={};
  myData.eddiesHistory[dk()]=(myData.eddiesHistory[dk()]||0)+grant;
  return grant;
}

// Conta do criador tem saldo ilimitado de Eddies (so na propria conta, nao em friend-view).
function hasInfiniteEddies(){return isCreatorUser(me) && !viewFriend;}

function spendEddies(amount){
  if(RO())return false;
  ensureRetentionData();
  if(hasInfiniteEddies())return true; // saldo infinito: nao debita
  const cost=Math.max(0,amount|0);
  if(myData.eddies<cost){showCyberToast('EDDIES INSUFICIENTES','Saldo insuficiente.',4200);return false;}
  myData.eddies-=cost;
  return true;
}

function updateEddiesDisplay(){
  const txt=hasInfiniteEddies()?'€$∞':'€$'+(D().eddies||0);
  const e=document.getElementById('home-eddies');
  if(e)e.textContent=txt;
  const te=document.getElementById('tm-eddies-current');
  if(te)te.textContent=txt;
  const sb=document.getElementById('shop-balance');
  if(sb)sb.textContent=txt;
}

/* Escudos de streak (ICE): protegem correntes de habito ----------- */
function checkShieldMilestones(){
  if(RO())return;
  ensureRetentionData();
  const peak=maxStreak();
  for(let m=7;m<=peak;m+=7){
    if(myData.shieldMilestones.includes(m))continue;
    myData.shieldMilestones.push(m);
    myData.streakShields++;
    showCyberToast('ESCUDO DE STREAK GANHO','// ICE +1 // Corrente de '+m+' dias blindada.',6500);
  }
}

// Escudo gratuito por semana - 1 ICE automatico toda semana.
function checkWeeklyFreeShield(){
  if(RO())return;
  ensureRetentionData();
  const week=wk();
  if((myData.prefs||{}).lastWeeklyShield===week)return;
  myData.prefs=myData.prefs||{};
  myData.prefs.lastWeeklyShield=week;
  myData.streakShields=(myData.streakShields||0)+1;
  showCyberToast('ESCUDO SEMANAL','// ICE +1 // Escudo gratuito desta semana concedido.',6000);
}

// Encontra correntes vivas que acabaram de quebrar ontem.
function brokenStreakHabits(){
  const data=habitDataWithLiveWeek();
  const y=new Date();y.setDate(y.getDate()-1);
  const dby=new Date();dby.setDate(dby.getDate()-2);
  return getHabits().filter(h=>!habitDone(data,h,y) && habitDone(data,h,dby));
}

function useStreakShield(habitName){
  if(RO())return;
  ensureRetentionData();
  if(myData.streakShields<=0){showCyberToast('SEM ESCUDOS','Voce nao tem ICE para gastar. Mantenha correntes de 7 dias.',4200);return;}
  if(!habitName){const list=brokenStreakHabits();if(!list.length){showCyberToast('NADA A PROTEGER','Nenhuma corrente quebrou ontem.',4200);return;}habitName=list[0];}
  const y=new Date();y.setDate(y.getDate()-1);
  const wkey=weekKeyFor(y);
  const di=habitDayIndex(y);
  myData.habits=myData.habits||{};
  myData.habits[wkey]=myData.habits[wkey]||{};
  myData.habits[wkey][habitName+'_'+di]=true;
  myData.streakShields--;
  showCyberToast('ESCUDO ATIVADO','// ICE -1 // Corrente de '+htmlEscape(habitName)+' restaurada.',6000);
  celebrate('day');
  renderConsistencyPanel();
  renderStreakShield();
  updateStats();
  scheduleAutoSave();
}

function renderStreakShield(){
  const el=document.getElementById('streak-shield');
  if(!el)return;
  const count=D().streakShields||0;
  const data=habitDataWithLiveWeek();
  let risk=null;
  getHabits().forEach(h=>{
    const s=habitStreak(data,h);
    if(habitStreakAtRisk(data,h)&&s>=3&&(!risk||s>risk.days))risk={name:h,days:s};
  });
  const broken=RO()?[]:brokenStreakHabits();
  el.className='streak-shield'+(risk?' at-risk':'');
  let html=`<div class="ss-tag">ESCUDOS ICE</div><div class="ss-count">🛡 ${count}</div>`;
  if(risk){
    html+=`<div class="ss-warn">Corrente de ${risk.days} dias (${htmlEscape(risk.name)}) expira hoje. Marque o habito ou use um escudo.</div>`;
  }else if(broken.length && count>0){
    html+=`<div class="ss-warn">Corrente de ${htmlEscape(broken[0])} quebrou ontem. Use um escudo para recuperar.</div>`;
  }else{
    html+=`<div class="ss-info">Cada corrente de 7 dias rende 1 escudo. Use ICE para salvar streaks quebradas.</div>`;
  }
  if(!RO()&&count>0&&(risk||broken.length)){
    const target=broken.length?broken[0]:(risk?risk.name:'');
    html+=`<button type="button" class="dq-btn ss-btn" data-action="callNamed" data-fn="useStreakShield" data-arg0="${htmlEscape(target)}">USAR ESCUDO</button>`;
  }
  el.innerHTML=html;
}

/* ============================================================
   FEATURE 2: bonus de login escalonado + loot drops diarios
   ============================================================ */
function checkLoginBonus(){
  if(RO())return;
  ensureRetentionData();
  if(myData.loginState.lastDate===dk())return;
  const y=new Date();y.setDate(y.getDate()-1);
  const yKey=localDateKey(y);
  myData.loginState.streak=(myData.loginState.lastDate===yKey)?(myData.loginState.streak+1):1;
  myData.loginState.lastDate=dk();
  const bonus=[10,15,20,30,40,50,75][Math.min(myData.loginState.streak-1,6)];
  const got=awardEddies(bonus,'login');
  myData.loginState.lastBonus=bonus;
  updateEddiesDisplay();
  showCyberToast('BEM-VINDO DE VOLTA','// DIA '+myData.loginState.streak+' // +€$'+got,6500);
  scheduleAutoSave();
}

const LOOT_TABLE=[
  {w:50,tier:'common',label:'+€$10',eddies:10},
  {w:25,tier:'common',label:'+€$20',eddies:20},
  {w:12,tier:'rare',label:'Escudo ICE +1',shield:1},
  {w:8,tier:'rare',label:'+€$40',eddies:40},
  {w:5,tier:'epic',label:'Fragmento de lore + €$75',eddies:75}
];
function rollLootDrop(){
  if(RO())return;
  ensureRetentionData();
  if(myData.lootState.lastDate===dk())return;
  const total=LOOT_TABLE.reduce((s,x)=>s+x.w,0);
  let roll=Math.random()*total,pick=LOOT_TABLE[0];
  for(const item of LOOT_TABLE){if(roll<item.w){pick=item;break;}roll-=item.w;}
  let granted=pick.label;
  if(pick.eddies){const g=awardEddies(pick.eddies,'loot');granted=pick.label.replace(/\d+/,String(g||0));}
  if(pick.shield){myData.streakShields+=pick.shield;}
  myData.lootState.lastDate=dk();
  myData.lootState.history.unshift({date:dk(),reward:granted,tier:pick.tier});
  myData.lootState.history=myData.lootState.history.slice(0,30);
  const copy=pick.tier==='epic'?'DROP LENDARIO // a cidade reconhece seu grind.'
           :pick.tier==='rare'?'DROP RARO // o ICE caiu pra voce.'
           :'DROP COMUM // eddies extras na conta.';
  celebrate(pick.tier==='common'?'day':'levelup');
  showCyberToast('LOOT DROP // '+granted,copy,7000);
  updateEddiesDisplay();
  renderStreakShield();
}

/* ============================================================
   FEATURE 3: Loja / Black Market (eddies, cosmeticos, escudos)
   ============================================================ */
const COSMETIC_THEMES={
  militech:{label:'Militech Tactical HUD',mood:'OPERACOES / VERDE TATICO',y:'#97C459',r:'#e45b62',c:'#7fb8c9',p:'#6e86a7',green:'#97C459',eddies:'#97C459',bg:'#060a08',bg2:'#0a120d',bg3:'#101b13',border:'#203323',text:'#d7e4d3',muted:'#8aa082',colorPrimary:'#97C459',primaryGlow:'rgba(151,196,89,.26)',ncActive:'#97C459',ncActiveGlow:'rgba(151,196,89,.2)',ncActiveGlowSoft:'rgba(151,196,89,.075)',scanlines:'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(151,196,89,.055) 3px,rgba(151,196,89,.055) 4px)',copy:{boot:'// MILITECH FIELD OPS - TACTICAL ROUTINE',save:'SYNC FIELD LOG',saving:'SYNCING...',saved:'FIELD LOG OK',review:'SEND DEBRIEF'}},
  kangtao:{label:'Kang Tao Heatline',mood:'CORPO ASIATICO / LARANJA QUENTE',y:'#ff8a3d',r:'#ff003c',c:'#ffd23d',p:'#6ee4ff',green:'#9fd35f',eddies:'#ff8a3d',bg:'#0c0806',bg2:'#15100c',bg3:'#21160d',border:'#3d2512',text:'#ead9c9',muted:'#a88c74',colorPrimary:'#ff8a3d',primaryGlow:'rgba(255,138,61,.24)',ncActive:'#ff8a3d',ncActiveGlow:'rgba(255,138,61,.22)',ncActiveGlowSoft:'rgba(255,138,61,.07)',scanlines:'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,138,61,.045) 2px,rgba(255,138,61,.045) 4px)',copy:{boot:'// KANG TAO SECURE LINE - PRECISION MODE',save:'LOCK DATA',saving:'LOCKING...',saved:'DATA LOCKED',review:'CLOSE CONTRACT'}},
  blackwall:{label:'Blackwall ICE Breach',mood:'NETRUNNER / AZUL GLACIAL',y:'#00d4ff',r:'#ff1744',c:'#89f7ff',p:'#7c3cff',green:'#62e6a7',eddies:'#89f7ff',bg:'#03070b',bg2:'#07101a',bg3:'#0b1724',border:'#12374a',text:'#d7f7ff',muted:'#82a8b8',colorPrimary:'#00d4ff',primaryGlow:'rgba(0,212,255,.28)',ncActive:'#00d4ff',ncActiveGlow:'rgba(0,212,255,.24)',ncActiveGlowSoft:'rgba(0,212,255,.08)',scanlines:'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,212,255,.07) 2px,rgba(0,212,255,.07) 3px)',copy:{boot:'// BLACKWALL ICEBREACH - JACK IN SAFE',save:'WRITE TO ICE',saving:'WRITING...',saved:'ICE SEALED',review:'END RUN'}},
  afterlife:{label:'Afterlife VIP Booth',mood:'PREMIUM / VERMELHO METALICO',y:'#d7d7df',r:'#ff2d55',c:'#7c8799',p:'#b21d35',green:'#8fbf7a',eddies:'#d7d7df',bg:'#07070b',bg2:'#101015',bg3:'#17171f',border:'#30232a',text:'#e5e3ea',muted:'#97919d',colorPrimary:'#d7d7df',primaryGlow:'rgba(255,45,85,.22)',ncActive:'#ff2d55',ncActiveGlow:'rgba(255,45,85,.22)',ncActiveGlowSoft:'rgba(255,45,85,.065)',scanlines:'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,45,85,.035) 3px,rgba(255,45,85,.035) 5px)',copy:{boot:'// AFTERLIFE VIP ACCESS - LEGENDS ONLY',save:'SIGN THE TAB',saving:'SIGNING...',saved:'TAB SIGNED',review:'CLOSE THE NIGHT'}},
  arasakaClean:{label:'Arasaka Executive Glass',mood:'CORPORATIVO / BRANCO FRIO',y:'#f2f3f7',r:'#d61f3c',c:'#aab7c8',p:'#6d7484',green:'#7aaa75',eddies:'#f2f3f7',bg:'#090a0d',bg2:'#11141a',bg3:'#181d25',border:'#303744',text:'#eef1f6',muted:'#a7afbc',colorPrimary:'#f2f3f7',primaryGlow:'rgba(242,243,247,.16)',ncActive:'#f2f3f7',ncActiveGlow:'rgba(242,243,247,.16)',ncActiveGlowSoft:'rgba(214,31,60,.055)',scanlines:'repeating-linear-gradient(0deg,transparent,transparent 4px,rgba(242,243,247,.035) 4px,rgba(242,243,247,.035) 5px)',copy:{boot:'// ARASAKA EXECUTIVE SUITE - CLEAN OPS',save:'FILE REPORT',saving:'FILING...',saved:'REPORT FILED',review:'SUBMIT REVIEW'}},
  moneyMode:{label:'Money Mode Ledger',mood:'FINANCAS / VERDE DINHEIRO',y:'#2fba69',r:'#c33a55',c:'#55aebf',p:'#8bbf4f',green:'#2fba69',eddies:'#2fba69',bg:'#050b08',bg2:'#09130d',bg3:'#0e1d13',border:'#183823',text:'#d9eadf',muted:'#82a58d',colorPrimary:'#2fba69',primaryGlow:'rgba(47,186,105,.24)',ncActive:'#2fba69',ncActiveGlow:'rgba(47,186,105,.22)',ncActiveGlowSoft:'rgba(47,186,105,.075)',scanlines:'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(47,186,105,.055) 3px,rgba(47,186,105,.055) 4px)',copy:{boot:'// MONEY MODE LEDGER - CASHFLOW ONLINE',save:'CLOSE LEDGER',saving:'CLOSING...',saved:'LEDGER OK',review:'BALANCE DAY'}},
  street:{label:'Street Chrome Pop',mood:'RUA / AMARELO LARANJA CIANO',y:'#ffd23d',r:'#ff5a36',c:'#00c2ff',p:'#c65cff',green:'#75c96b',eddies:'#ffd23d',bg:'#09080b',bg2:'#111018',bg3:'#1b1620',border:'#2f2840',text:'#eee4d0',muted:'#a99ea9',colorPrimary:'#ffd23d',primaryGlow:'rgba(255,210,61,.22)',ncActive:'#ffd23d',ncActiveGlow:'rgba(255,210,61,.24)',ncActiveGlowSoft:'rgba(255,90,54,.07)',scanlines:'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,210,61,.045) 2px,rgba(255,210,61,.045) 4px)',copy:{boot:'// STREET CHROME - FAST LANE ROUTINE',save:'TAG SAVE',saving:'TAGGING...',saved:'TAGGED',review:'WRAP THE BLOCK'}}
};
const SHOP_ITEMS=[
  {id:'loot_cache',name:'Cache de loot diario',desc:'Abre um cache com eddies, ICE ou um contrato bonus. Uma tentativa por dia.',cost:45,type:'utility',tab:'utility',limit:'daily'},
  {id:'reroll_daily',name:'Re-roll de missao diaria',desc:'Troca a quest diaria contextual uma vez por dia.',cost:35,type:'utility',tab:'utility',limit:'daily'},
  {id:'focus_boost',name:'Boost de foco',desc:'Dobra o bonus do proximo timer concluido hoje.',cost:60,type:'utility',tab:'utility',limit:'daily'},
  {id:'recovery_pass',name:'Passe de recuperacao',desc:'Ignora o carry de ontem e concede 1 ICE de recuperacao.',cost:45,type:'utility',tab:'utility',limit:'daily'},
  {id:'micro_contract',name:'Quickhack de Arranque',desc:'Contrato de 12 minutos para destravar agora. Ao concluir: +EUR$45 e bonus de foco inicial.',cost:20,type:'utility',tab:'mission',limit:'daily'},
  {id:'mission_boss',name:'Contrato Boss: Alvo Critico',desc:'Operacao de 60 minutos contra a maior trava do dia. Ao concluir: +EUR$150 e +1 ICE.',cost:90,type:'utility',tab:'mission',limit:'daily'},
  {id:'mission_finance',name:'Auditoria Relampago',desc:'Recon financeiro com caixa, vazamento e aporte. Ao concluir: +EUR$95 e item na aba Financas.',cost:45,type:'utility',tab:'mission',limit:'daily'},
  {id:'mission_body',name:'Contrato Corpo: Manutencao',desc:'Treino objetivo com aquecimento, bloco principal e registro. Ao concluir: +EUR$70.',cost:35,type:'utility',tab:'mission',limit:'daily'},
  {id:'mission_reset',name:'Protocolo Reset 3x3',desc:'Limpa tres pendencias, reorganiza agenda e define o proximo movimento. Ao concluir: +EUR$65.',cost:35,type:'utility',tab:'mission',limit:'daily'},
  {id:'mission_no_zero',name:'Seguro Anti-Zero',desc:'Missao minima para salvar um dia ruim sem inventar desculpa. Ao concluir: +EUR$35.',cost:15,type:'utility',tab:'mission',limit:'daily'},
  {id:'mission_combo',name:'Combo Fixer: 3 Entregas',desc:'Sequencia de tres contratos pequenos com pagamento no fechamento. Ao concluir todos: +EUR$130.',cost:70,type:'utility',tab:'mission',limit:'daily'},
  {id:'mission_silent',name:'Blackout de Distracao',desc:'Bloco silencioso sem apps paralelos, troca de aba ou notificacao. Ao concluir: +EUR$80.',cost:35,type:'utility',tab:'mission',limit:'daily'},
  {id:'mission_recovery',name:'Operacao Volta ao Controle',desc:'Plano realista para recuperar o dia depois de falhar ontem. Ao concluir: +EUR$75 e +1 ICE se estava em risco.',cost:40,type:'utility',tab:'mission',limit:'daily'},
  {id:'dev_sprint',name:'Sprint netrunner',desc:'Adiciona um contrato de dev com foco, entrega e revisao tecnica.',cost:80,type:'template',tab:'mission',limit:'weekly'},
  {id:'template_week_strong',name:'Semana Forte GTD',desc:'Monta review semanal completo com Agenda, Metas, lista de espera e checkpoint.',cost:140,type:'template',tab:'template',limit:'weekly'},
  {id:'template_smart_goal',name:'Meta SMART',desc:'Cria contrato de meta com indicador, marco de 7 dias, viabilidade e revisao.',cost:120,type:'template',tab:'template',limit:'weekly'},
  {id:'template_woop',name:'Plano WOOP',desc:'Monta desejo, resultado, obstaculo interno e plano se/entao na aba Metas.',cost:120,type:'template',tab:'template',limit:'weekly'},
  {id:'template_anti_procrastination',name:'Anti-Procrastinacao',desc:'Cria protocolo de destrave com diagnostico de travas e bloco de foco guiado.',cost:110,type:'template',tab:'template',limit:'weekly'},
  {id:'finance_kit',name:'Controle Financeiro Mensal',desc:'Monta caixa mensal, vencimentos, teto semanal, aporte e reserva de emergencia.',cost:130,type:'template',tab:'template',limit:'weekly'},
  {id:'reading_kit',name:'Leitura Consistente',desc:'Cria biblioteca inicial, rotina de leitura aplicavel e meta de acao por livro.',cost:95,type:'template',tab:'template',limit:'weekly'},
  {id:'template_premium',name:'Rotina Premium de Foco',desc:'Instala um sistema operacional diario com resultado principal, foco e fechamento.',cost:160,type:'template',tab:'template',limit:'weekly'},
  {id:'theme_blackwall',name:'Blackwall ICE Breach',desc:'Assinatura netrunner: fundo frio, scanlines ICE, botoes e textos de sistema proprios.',cost:260,type:'theme',tab:'cosmetic',theme:'blackwall'},
  {id:'theme_militech',name:'Militech Tactical HUD',desc:'Interface de operacao: verde tatico, paineis militares e comandos de campo.',cost:230,type:'theme',tab:'cosmetic',theme:'militech'},
  {id:'theme_kangtao',name:'Kang Tao Heatline',desc:'Tema corporativo quente: laranja, linhas de precisao e sensacao de hardware caro.',cost:230,type:'theme',tab:'cosmetic',theme:'kangtao'},
  {id:'theme_afterlife',name:'Afterlife VIP Booth',desc:'Tema premium: preto metalico, vermelho baixo, brilho de club e linguagem de lenda.',cost:300,type:'theme',tab:'cosmetic',theme:'afterlife'},
  {id:'theme_arasaka_clean',name:'Arasaka Executive Glass',desc:'Tema executivo: branco frio, vermelho discreto, paineis limpos e assinatura corporativa.',cost:280,type:'theme',tab:'cosmetic',theme:'arasakaClean'},
  {id:'theme_money_mode',name:'Money Mode Ledger',desc:'Tema financeiro: verde dinheiro, HUD de caixa e comandos de fechamento de ledger.',cost:280,type:'theme',tab:'cosmetic',theme:'moneyMode'},
  {id:'theme_street',name:'Street Chrome Pop',desc:'Tema de rua: amarelo, laranja e ciano com energia visual sem estourar saturacao.',cost:240,type:'theme',tab:'cosmetic',theme:'street'},
  {id:'title_lenda',name:'Titulo: Lenda de Night City',desc:'Titulo de perfil para operadores lendarios.',cost:400,type:'title',tab:'cosmetic',value:'LENDA DE NIGHT CITY'},
  {id:'title_fixer',name:'Titulo: Fixer local',desc:'Titulo de perfil para quem fecha contratos.',cost:180,type:'title',tab:'cosmetic',value:'FIXER LOCAL'},
  {id:'frame_samurai',name:'Frame de perfil Samurai',desc:'Moldura vermelha Samurai ao redor do perfil.',cost:150,type:'frame',tab:'cosmetic',value:'samurai'},
  {id:'frame_ice',name:'Frame de perfil ICE',desc:'Moldura azul para perfil em modo netrunner.',cost:150,type:'frame',tab:'cosmetic',value:'ice'},
  {id:'frame_afterlife',name:'Borda Afterlife',desc:'Moldura premium preta e vermelha para o perfil.',cost:190,type:'frame',tab:'cosmetic',value:'afterlife'},
  {id:'frame_money',name:'Borda Money Mode',desc:'Moldura verde dinheiro para perfil financeiro.',cost:170,type:'frame',tab:'cosmetic',value:'money'},
  {id:'frame_legend',name:'Borda Lenda Local',desc:'Moldura dourada para operador de alto impacto.',cost:260,type:'frame',tab:'cosmetic',value:'legend'},
  {id:'avatar_netrunner',name:'Avatar Netrunner',desc:'Retrato HUD com visor, circuito e assinatura ICE.',cost:180,type:'avatar',tab:'cosmetic',value:'netrunner'},
  {id:'avatar_fixer',name:'Avatar Fixer',desc:'Retrato de negociador com oculos, gola alta e chip de contrato.',cost:180,type:'avatar',tab:'cosmetic',value:'fixer'},
  {id:'avatar_ghost',name:'Avatar Ghost',desc:'Silhueta furtiva com mascara vazada e sinal baixo.',cost:200,type:'avatar',tab:'cosmetic',value:'ghost'},
  {id:'avatar_legend',name:'Avatar Lenda',desc:'Emblema premium com coroa, estrela e moldura de reputacao.',cost:280,type:'avatar',tab:'cosmetic',value:'legend'},
  {id:'shield',name:'Escudo ICE',desc:'Protege uma corrente quebrada.',cost:120,type:'shield',tab:'utility',limit:'weekly'}
];
window.COSMETIC_THEMES=COSMETIC_THEMES;
window.SHOP_ITEMS=SHOP_ITEMS;
let shopTab='utility';
function shopItem(id){return SHOP_ITEMS.find(i=>i.id===id);}
function shopOwns(id){return (D().shopUnlocks||[]).includes(id);}
function shopUsageKey(item){return item.limit==='weekly'?wk():dk();}
function shopUsageMap(){myData.prefs={...(myData.prefs||{})};myData.prefs.shopUsage={...(myData.prefs.shopUsage||{})};return myData.prefs.shopUsage;}
function shopUsed(item){return !!(item.limit && shopUsageMap()[item.id]===shopUsageKey(item));}
function markShopUsed(item){if(item.limit)shopUsageMap()[item.id]=shopUsageKey(item);}
function shopTabs(){return [['utility','Utilitarios'],['mission','Missoes'],['cosmetic','Cosmeticos'],['template','Templates']];}
function isShopTab(tab){return shopTabs().some(([id])=>id===tab);}
function refreshShopViews(){
  renderShop();
  if(typeof renderLojaPage==='function')renderLojaPage();
  if(typeof renderThemeControls==='function')renderThemeControls();
}

function applyCosmeticTheme(){
  const eq=(D().equippedCosmetics||{}).theme;
  const root=document.documentElement;
  const themeVars=['green','eddies','bg','bg2','bg3','border','text','muted','color-primary','primary-glow','nc-active','nc-active-glow','nc-active-glow-soft','scanlines','nc-plate','nc-scan-accent'];
  if(!eq || !COSMETIC_THEMES[eq]){
    delete root.dataset.cosmeticTheme;
    themeVars.forEach(name=>root.style.removeProperty('--'+name));
    return;
  }
  const theme=COSMETIC_THEMES[eq];
  root.dataset.cosmeticTheme=eq;
  Object.entries(theme).forEach(([k,v])=>{
    if(['label','mood','copy'].includes(k) || typeof v!=='string')return;
    const cssName='--'+k.replace(/[A-Z]/g,m=>'-'+m.toLowerCase());
    root.style.setProperty(cssName,v);
  });
  root.style.setProperty('--nc-plate',`linear-gradient(180deg,color-mix(in srgb,${theme.bg2||'var(--bg2)'} 92%,transparent),color-mix(in srgb,${theme.bg||'var(--bg)'} 98%,#000)),var(--hatch)`);
  root.style.setProperty('--nc-scan-accent',`linear-gradient(90deg,transparent,color-mix(in srgb,${theme.ncActive||theme.y} 36%,transparent),transparent)`);
  if(typeof updateThemeCopy==='function')updateThemeCopy();
}

function cosmeticTitle(){
  const eq=(D().equippedCosmetics||{});
  const out=[];
  if(eq.frame){const it=SHOP_ITEMS.find(i=>i.type==='frame'&&i.id===eq.frame);if(it)out.push(it.value);}
  if(eq.title){const it=SHOP_ITEMS.find(i=>i.type==='title'&&i.id===eq.title);if(it)out.push(it.value);}
  return out;
}

function addShopTasks(tasks,{prepend=false}={}){
  myData.taskDefs=Array.isArray(myData.taskDefs)&&myData.taskDefs.length?myData.taskDefs:JSON.parse(JSON.stringify(creatorDefaults(DEFAULT_TASKS)));
  const stamped=tasks.map((task,i)=>({id:Date.now()+i,updatedAt:new Date().toISOString(),...task}));
  const fresh=stamped.filter(task=>!myData.taskDefs.some(t=>String(t.text||'').toLowerCase()===String(task.text||'').toLowerCase()));
  if(!fresh.length)return false;
  myData.taskDefs=prepend?[...fresh,...myData.taskDefs]:[...myData.taskDefs,...fresh];
  renderTasks();syncTodayHabitsFromTasks();updateStats();
  return true;
}

function shopMissionTask(item,spec){
  const key=(item.id||'shop')+'-'+Date.now()+'-'+Math.floor(Math.random()*10000);
  const reward=spec.reward||{};
  const rewardText=[
    reward.eddies?'+EUR$'+reward.eddies:'',
    reward.shield?'ICE +'+reward.shield:'',
    reward.focusBoost?'FOCO BOOST':''
  ].filter(Boolean).join(' // ');
  return {
    id:Date.now(),
    text:spec.text,
    tag:spec.tag||'Loja',
    category:spec.category||'Contrato Premium',
    frequency:'Hoje',
    meta:spec.meta||'25 min',
    priority:true,
    hard:!!spec.hard,
    note:[spec.briefing,rewardText?('Recompensa: '+rewardText):''].filter(Boolean).join(' | '),
    shopMission:{key,itemId:item.id,label:item.name,reward,briefing:spec.briefing||'',rewardText}
  };
}

function addShopMissions(item,specs){
  return addShopTasks(specs.map(spec=>shopMissionTask(item,spec)),{prepend:true});
}

function addShopRoutine(title,steps){
  myData.routines=Array.isArray(myData.routines)?myData.routines:[];
  if(myData.routines.some(r=>String(r.title||'').toLowerCase()===String(title).toLowerCase()))return false;
  myData.routines.unshift({title,steps});
  renderRoutines();
  return true;
}

function seedShopPage(page,items){
  if(typeof seedCustomPageItems!=='function')return false;
  ensureCustomPagesData();
  seedCustomPageItems(page,items);
  renderExtraPage(page);
  return true;
}

function applyShopUtility(item){
  myData.prefs={...(myData.prefs||{})};
  if(item.id==='loot_cache'){
    myData.lootState=myData.lootState&&typeof myData.lootState==='object'?myData.lootState:{lastDate:'',history:[]};
    const roll=Math.random();
    let label='Contrato bonus';
    if(roll<.45){
      const grant=awardEddies(25,'shop-cache');
      label='+EUR$'+grant;
    }else if(roll<.75){
      myData.streakShields=(myData.streakShields||0)+1;
      label='ICE +1';
      renderStreakShield();
    }else{
      myData.taskDefs=Array.isArray(myData.taskDefs)&&myData.taskDefs.length?myData.taskDefs:JSON.parse(JSON.stringify(creatorDefaults(DEFAULT_TASKS)));
      myData.taskDefs.unshift({id:Date.now(),text:'Cache bonus: fechar 1 pendencia pequena',tag:'Loot',category:'Loja',frequency:'Hoje',meta:'10 min',priority:true,updatedAt:new Date().toISOString()});
      renderTasks();syncTodayHabitsFromTasks();updateStats();
    }
    myData.lootState.lastShopCache=dk();
    myData.lootState.history=[...(myData.lootState.history||[]),{date:dk(),label,source:'shop'}].slice(-30);
    showCyberToast('CACHE ABERTO',label,5200);
    return true;
  }
  if(item.id==='reroll_daily'){
    myData.prefs.questReroll={date:dk(),seed:Date.now()};
    const q=typeof todaysQuest==='function'?todaysQuest():null;
    if(q && myData.quests)delete myData.quests[q.key];
    renderDailyQuest();
    return true;
  }
  if(item.id==='focus_boost'){
    myData.prefs.focusBoost={date:dk(),active:true};
    return true;
  }
  if(item.id==='recovery_pass'){
    const carry=typeof getTomorrowCarryMission==='function'?getTomorrowCarryMission():null;
    if(carry){myData.prefs.ignoredCarryMissions={...(myData.prefs.ignoredCarryMissions||{}),[carry.sourceDate]:dk()};renderTodayMode();}
    myData.streakShields=(myData.streakShields||0)+1;
    renderStreakShield();
    return true;
  }
  if(item.id==='micro_contract'){
    addShopMissions(item,[{text:'Quickhack de Arranque: iniciar em 12 minutos',tag:'Quickhack',category:'Contrato Premium',meta:'12 min',briefing:'Escolha uma pendencia pequena, abra apenas o necessario e conclua antes de pensar demais.',reward:{eddies:45,focusBoost:true}}]);
    return true;
  }
  if(item.id==='mission_boss'){
    addShopMissions(item,[{text:'Contrato Boss: quebrar o alvo critico',tag:'Boss',category:'Contrato Premium',meta:'60 min',hard:true,briefing:'Defina a tarefa que voce esta evitando. Entrega minima: um resultado visivel, nao apenas planejamento.',reward:{eddies:150,shield:1}}]);
    return true;
  }
  if(item.id==='mission_finance'){
    addShopMissions(item,[{text:'Auditoria Relampago: caixa, vazamento e aporte',tag:'Financas',category:'Contrato Premium',meta:'25 min',briefing:'Registre entrada, liste um vazamento de gasto e confirme o proximo aporte do objetivo.',reward:{eddies:95}}]);
    if(typeof seedCustomPageItems==='function'){
      ensureCustomPagesData();
      seedCustomPageItems('financas',[
        {title:'Auditoria Relampago',type:'Controle',metric:'Caixa + vazamento + aporte',priority:'Alta',due:'Hoje',progress:0,nextStep:'Registrar gasto vazado e confirmar aporte',note:'Missao premium da Loja. Fechar o contrato paga bonus em Eddies.'}
      ]);
      renderExtraPage('financas');
    }
    return true;
  }
  if(item.id==='mission_body'){
    addShopMissions(item,[{text:'Contrato Corpo: manutencao ativa',tag:'Corpo',category:'Contrato Premium',meta:'30 min',briefing:'Aquecimento curto, bloco principal e registro. Vale treino, caminhada rapida ou mobilidade bem feita.',reward:{eddies:70}}]);
    if(typeof seedCustomPageItems==='function'){
      ensureCustomPagesData();
      seedCustomPageItems('treino',[{title:'Contrato Corpo',type:'Treino',metric:'30 min',priority:'Media',due:'Hoje',progress:0,nextStep:'Executar bloco principal e registrar carga/tempo',note:'Missao premium da Loja com pagamento ao concluir.'}]);
      renderExtraPage('treino');
    }
    return true;
  }
  if(item.id==='mission_reset'){
    addShopMissions(item,[{text:'Protocolo Reset 3x3: limpar e reorganizar',tag:'Reset',category:'Contrato Premium',meta:'30 min',briefing:'Resolva 3 pendencias pequenas, remova 3 distracoes e escolha 3 proximos passos reais.',reward:{eddies:65}}]);
    return true;
  }
  if(item.id==='mission_no_zero'){
    addShopMissions(item,[{text:'Seguro Anti-Zero: uma prova de movimento',tag:'Sem Zero',category:'Contrato Premium',meta:'7 min',briefing:'Complete uma acao pequena o bastante para nao negociar com o cansaco. A prova precisa ser concreta.',reward:{eddies:35}}]);
    return true;
  }
  if(item.id==='mission_combo'){
    addShopMissions(item,[
      {text:'Combo Fixer 1/3: entrega rapida',tag:'Combo',category:'Contrato Premium',meta:'10 min',briefing:'Feche uma pendencia pequena que esteja ocupando espaco mental.',reward:{eddies:30}},
      {text:'Combo Fixer 2/3: entrega principal',tag:'Combo',category:'Contrato Premium',meta:'25 min',briefing:'Avance no contrato mais importante com uma entrega verificavel.',reward:{eddies:65}},
      {text:'Combo Fixer 3/3: fechamento e proximo passo',tag:'Combo',category:'Contrato Premium',meta:'8 min',briefing:'Registre o que foi feito e deixe o proximo passo pronto para amanha.',reward:{eddies:35}}
    ]);
    return true;
  }
  if(item.id==='mission_silent'){
    myData.prefs.silentMission={date:dk(),active:true};
    addShopMissions(item,[{text:'Blackout de Distracao: 30 min sem troca',tag:'Silencio',category:'Contrato Premium',meta:'30 min',briefing:'Silencie notificacoes, feche abas paralelas e trabalhe em uma unica frente por 30 minutos.',reward:{eddies:80}}]);
    return true;
  }
  if(item.id==='mission_recovery'){
    addShopMissions(item,[{text:'Operacao Volta ao Controle: recuperar sem exagero',tag:'Recuperacao',category:'Contrato Premium',meta:'22 min',briefing:'Escolha uma tarefa possivel, execute sem tentar pagar toda a divida do dia e registre o reinicio.',reward:{eddies:75,shield:1}}]);
    return true;
  }
  if(item.id==='mission_combo'){
    addShopTasks([
      {text:'Combo 1/3: resolver uma tarefa rapida',tag:'Combo',category:'Foco',frequency:'Hoje',meta:'10 min',priority:true},
      {text:'Combo 2/3: avançar no contrato principal',tag:'Combo',category:'Foco',frequency:'Hoje',meta:'20 min',priority:true},
      {text:'Combo 3/3: registrar fechamento do dia',tag:'Combo',category:'Review',frequency:'Hoje',meta:'5 min'}
    ],{prepend:true});
    return true;
  }
  if(item.id==='mission_silent'){
    myData.prefs.silentMission={date:dk(),active:true};
    addShopTasks([{text:'Missao Silenciosa: 30 min sem distrações',tag:'Silencio',category:'Foco',frequency:'Hoje',meta:'30 min',priority:true}],{prepend:true});
    return true;
  }
  if(item.id==='mission_recovery'){
    addShopTasks([
      {text:'Missao Recuperacao: escolher 1 tarefa possivel',tag:'Recuperacao',category:'Rotina',frequency:'Hoje',meta:'5 min',priority:true},
      {text:'Missao Recuperacao: executar sem compensar demais',tag:'Recuperacao',category:'Rotina',frequency:'Hoje',meta:'15 min'}
    ],{prepend:true});
    return true;
  }
  if(item.id==='dev_sprint'){
    myData.taskDefs=Array.isArray(myData.taskDefs)&&myData.taskDefs.length?myData.taskDefs:JSON.parse(JSON.stringify(creatorDefaults(DEFAULT_TASKS)));
    const tasks=[
      {text:'Sprint netrunner: escolher entrega pequena',tag:'Dev',category:'Dev',frequency:'Hoje',meta:'10 min'},
      {text:'Sprint netrunner: implementar e testar',tag:'Dev',category:'Dev',frequency:'Hoje',meta:'45 min'}
    ];
    tasks.forEach((task,i)=>{
      if(myData.taskDefs.some(t=>String(t.text||'').toLowerCase()===task.text.toLowerCase()))return;
      myData.taskDefs.push({id:Date.now()+i,priority:i===1,updatedAt:new Date().toISOString(),...task});
    });
    if(typeof seedCustomPageItems==='function'){
      ensureCustomPagesData();
      seedCustomPageItems('dev',[{title:'Sprint netrunner',type:'Dev',metric:'55 min',priority:'Alta',due:'Semana',progress:0,nextStep:'Definir entrega pequena',note:'Criado pela Loja para transformar estudo em entrega.'}]);
      renderExtraPage('dev');
    }
    renderTasks();syncTodayHabitsFromTasks();updateStats();
    return true;
  }
  if(item.id==='finance_kit'){
    addShopTasks([
      {text:'Sistema financeiro: fechar caixa da semana',tag:'Financas',category:'Financeiro',frequency:'Semana',meta:'25 min',priority:true},
      {text:'Sistema financeiro: registrar aporte e ajustar objetivo',tag:'Investimento',category:'Financeiro',frequency:'Semana',meta:'15 min',priority:true},
      {text:'Sistema financeiro: revisar gasto variavel antes de comprar',tag:'Compras',category:'Financeiro',frequency:'Dias uteis',meta:'5 min'}
    ]);
    seedShopPage('financas',[
      {title:'Mapa de renda do mes',type:'Entrada',metric:'Salario + extras',priority:'Alta',due:'Dia do pagamento',progress:0,nextStep:'Registrar valor liquido e data de recebimento',note:'Use este item como fonte oficial do mes. Some salario, freelas e entradas previstas.'},
      {title:'Base fixa obrigatoria',type:'Controle',metric:'Aluguel + contas + assinaturas',priority:'Alta',due:'Todo inicio de mes',progress:0,nextStep:'Listar cada custo fixo com vencimento',note:'Separe o que nao pode atrasar: moradia, energia, internet, transporte, fatura minima e assinaturas.'},
      {title:'Limite de gasto variavel',type:'Controle',metric:'Teto semanal',priority:'Alta',due:'Toda segunda',progress:0,nextStep:'Definir limite para mercado, delivery, lazer e impulso',note:'Divida o dinheiro livre em semanas. Se passar do teto, registrar motivo antes de comprar.'},
      {title:'Calendario de vencimentos',type:'Pagamento',metric:'Proximos 7 dias',priority:'Alta',due:'Diario',progress:0,nextStep:'Mover a proxima conta para o topo',note:'Liste pagamentos com data, valor e status: previsto, separado, pago.'},
      {title:'Aporte automatico do objetivo',type:'Aporte',metric:'Valor minimo semanal',priority:'Alta',due:'Semana',progress:0,nextStep:'Registrar aporte como investimento',note:'Todo aporte deve entrar como tipo Aporte para somar no saldo do objetivo financeiro.'},
      {title:'Regra anti-impulso 24h',type:'Compra',metric:'Compras nao essenciais',priority:'Media',due:'Sempre que quiser comprar',progress:0,nextStep:'Anotar item, preco e esperar 24h',note:'Se ainda fizer sentido depois de 24h, comprar dentro do limite variavel.'}
    ]);
    seedShopPage('investimentos',[
      {title:'Reserva de emergencia',type:'Carteira',metric:'1 mes de custos',priority:'Alta',due:'Mensal',progress:0,nextStep:'Calcular custo mensal essencial',note:'Primeiro alvo: juntar 1 mes de despesas obrigatorias antes de investimentos agressivos.'},
      {title:'Aporte recorrente',type:'Aporte',metric:'Mesmo dia toda semana',priority:'Alta',due:'Semana',progress:0,nextStep:'Definir dia fixo de aporte',note:'Valor pequeno e repetido ganha de valor grande que nunca acontece.'}
    ]);
    addShopRoutine('Fechamento financeiro semanal',[
      'Registrar entradas recebidas e pagamentos feitos',
      'Atualizar gastos variaveis por categoria',
      'Checar proximos vencimentos dos proximos 7 dias',
      'Registrar aporte como tipo Aporte',
      'Decidir 1 ajuste para proteger o saldo ate domingo'
    ]);
    return true;
  }
  if(item.id==='reading_kit'){
    addShopTasks([
      {text:'Sistema de leitura: ler bloco principal',tag:'Leitura',category:'Estudo',frequency:'3x semana',meta:'25 min',priority:true},
      {text:'Sistema de leitura: transformar anotacao em acao',tag:'Leitura',category:'Estudo',frequency:'Semana',meta:'15 min',priority:true},
      {text:'Sistema de leitura: revisar fila e proxima pagina',tag:'Leitura',category:'Planejamento',frequency:'Semana',meta:'10 min'}
    ]);
    myData.books=Array.isArray(myData.books)?myData.books:[];
    [
      {title:'Livro principal do mes',author:'Defina o titulo',status:'reading'},
      {title:'Livro de apoio / consulta',author:'Opcional',status:'queue'}
    ].forEach((book,i)=>{
      if(!myData.books.some(x=>String(x.title||'').toLowerCase()===book.title.toLowerCase()))myData.books.unshift({id:Date.now()+i,...book});
    });
    myData.goals={...(myData.goals||{}),monthlyBooks:myData.goals?.monthlyBooks||1};
    addShopRoutine('Metodo de leitura aplicavel',[
      'Antes de ler: escrever a pergunta que o capitulo precisa responder',
      'Durante: marcar no maximo 3 ideias uteis',
      'Depois: escrever resumo de 5 linhas sem copiar frase do livro',
      'Converter 1 ideia em acao pratica para esta semana',
      'Atualizar proxima pagina e manter o livro visivel na aba Leitura'
    ]);
    seedShopPage('metas',[
      {title:'Leitura aplicada do mes',type:'Conhecimento',metric:'1 livro + 4 acoes',priority:'Media',due:'30 dias',progress:0,nextStep:'Escolher livro principal e pergunta-guia',note:'O objetivo nao e so terminar livro. E aplicar uma ideia por semana.'}
    ]);
    if(typeof renderBooks==='function')renderBooks();
    return true;
  }
  if(item.id==='template_week_strong'){
    addShopTasks([
      {text:'Semana Forte: review completo de domingo',tag:'GTD',category:'Review',frequency:'Semana',meta:'45 min',priority:true},
      {text:'Semana Forte: checkpoint de quarta',tag:'GTD',category:'Review',frequency:'Semana',meta:'15 min',priority:true},
      {text:'Semana Forte: preparar segunda sem improviso',tag:'GTD',category:'Planejamento',frequency:'Semana',meta:'15 min'}
    ],{prepend:true});
    addShopRoutine('Review semanal GTD completo',[
      'Capturar tudo que ficou solto: contas, mensagens, ideias, tarefas e promessas',
      'Separar o que e lixo, referencia, algum dia ou compromisso real',
      'Revisar Metas, Financas, Treino, Dev e Agenda procurando pendencias sem proximo passo',
      'Escolher 3 resultados da semana, cada um com uma proxima acao fisica',
      'Bloquear tempo para as 3 acoes principais e um checkpoint de quarta',
      'Encerrar com lista de espera: pessoas, pagamentos ou respostas que dependem de terceiros'
    ]);
    seedShopPage('agenda',[
      {title:'Top 3 da semana',type:'Planejamento',metric:'3 resultados',priority:'Alta',due:'Domingo',progress:0,nextStep:'Escrever resultado 1 em formato concluido',note:'Exemplo: Fatura revisada, Treino A feito 3x, Tela X publicada.'},
      {title:'Checkpoint de quarta',type:'Revisao',metric:'15 min',priority:'Alta',due:'Quarta',progress:0,nextStep:'Ver se os 3 resultados ainda cabem na semana',note:'Cortar ou renegociar antes de virar bola de neve.'},
      {title:'Lista de espera',type:'Follow-up',metric:'Pessoas / pagamentos',priority:'Media',due:'Sexta',progress:0,nextStep:'Registrar quem precisa responder ou pagar',note:'Tudo que depende de alguem fica aqui para nao ocupar a cabeca.'}
    ]);
    seedShopPage('metas',[
      {title:'Resultado principal da semana',type:'Meta semanal',metric:'1 entrega visivel',priority:'Alta',due:'7 dias',progress:0,nextStep:'Definir entrega que prova progresso',note:'Se nao puder ser visto ou checado, ainda esta abstrato demais.'}
    ]);
    return true;
  }
  if(item.id==='template_smart_goal'){
    addShopTasks([
      {text:'Meta SMART: preencher contrato da meta',tag:'SMART',category:'Objetivo',frequency:'Hoje',meta:'25 min',priority:true},
      {text:'Meta SMART: executar primeiro marco de 7 dias',tag:'SMART',category:'Objetivo',frequency:'Semana',meta:'30 min',priority:true}
    ],{prepend:true});
    seedShopPage('metas',[
      {title:'Contrato da meta SMART',type:'Objetivo',metric:'Resultado especifico',priority:'Alta',due:'30 dias',progress:0,nextStep:'Escrever a meta em uma frase que comece com "Concluir..."',note:'Modelo: Concluir [resultado] medido por [numero/evidencia] ate [data], porque [motivo].'},
      {title:'Indicador de sucesso',type:'Medida',metric:'Numero ou evidencia',priority:'Alta',due:'Hoje',progress:0,nextStep:'Escolher 1 indicador principal e 1 evidencia visual',note:'Exemplos: R$ guardado, paginas publicadas, treinos feitos, aulas concluidas, peso registrado.'},
      {title:'Marco de 7 dias',type:'Milestone',metric:'Primeiro avanço',priority:'Alta',due:'7 dias',progress:0,nextStep:'Definir uma entrega pequena que confirme que a meta saiu do papel',note:'Se o marco falhar, reduza a meta antes de abandonar.'},
      {title:'Criterio de viabilidade',type:'Filtro',metric:'Tempo + recurso',priority:'Media',due:'Hoje',progress:0,nextStep:'Reservar horario real e remover 1 obstaculo',note:'Meta sem horario vira desejo. Escreva quando e onde vai executar.'},
      {title:'Revisao quinzenal da meta',type:'Revisao',metric:'Ajustar ou manter',priority:'Media',due:'15 dias',progress:0,nextStep:'Checar indicador e decidir proximo marco',note:'Nao mude a meta toda semana. Mude o plano, mantendo o resultado claro.'}
    ]);
    addShopRoutine('Execucao SMART em 30 dias',[
      'Ler o contrato da meta',
      'Atualizar indicador de sucesso',
      'Executar a menor proxima acao do marco de 7 dias',
      'Registrar bloqueio encontrado',
      'Decidir se o plano precisa de corte, apoio ou mais tempo'
    ]);
    return true;
  }
  if(item.id==='template_woop'){
    addShopTasks([
      {text:'WOOP: rodar plano se/entao no primeiro obstaculo',tag:'WOOP',category:'Planejamento',frequency:'Hoje',meta:'20 min',priority:true},
      {text:'WOOP: revisar se o obstaculo real mudou',tag:'WOOP',category:'Review',frequency:'Semana',meta:'15 min'}
    ],{prepend:true});
    seedShopPage('metas',[
      {title:'WOOP - Desejo',type:'Wish',metric:'1 desejo importante e realista',priority:'Alta',due:'Hoje',progress:0,nextStep:'Escrever o desejo em ate 12 palavras',note:'Escolha algo importante, mas possivel nesta fase. Nao use desejo vago.'},
      {title:'WOOP - Melhor resultado',type:'Outcome',metric:'Como saberei que valeu',priority:'Alta',due:'Hoje',progress:0,nextStep:'Descrever o beneficio concreto',note:'Escreva o melhor resultado: alivio, dinheiro, saude, entrega, confianca ou tempo livre.'},
      {title:'WOOP - Obstaculo interno',type:'Obstacle',metric:'Principal trava pessoal',priority:'Alta',due:'Hoje',progress:0,nextStep:'Nomear a trava que costuma aparecer',note:'Normalmente e cansaco, celular, medo, bagunca, vergonha, impulso ou falta de clareza.'},
      {title:'WOOP - Plano se/entao',type:'Plan',metric:'If / Then',priority:'Alta',due:'Hoje',progress:0,nextStep:'Escrever: Se [obstaculo], entao eu [acao curta]',note:'Exemplo: Se eu abrir rede social, entao bloqueio 25 min e volto para a primeira linha da tarefa.'}
    ]);
    addShopRoutine('WOOP antes de executar',[
      'Ler o desejo',
      'Visualizar o melhor resultado por 20 segundos',
      'Nomear o obstaculo interno mais provavel',
      'Executar o plano se/entao antes de negociar consigo mesmo',
      'Registrar se o obstaculo era real ou desculpa'
    ]);
    return true;
  }
  if(item.id==='template_anti_procrastination'){
    addShopTasks([
      {text:'Anti-procrastinacao: abrir tarefa e executar versao ridicula',tag:'Foco',category:'Rotina',frequency:'Hoje',meta:'10 min',priority:true},
      {text:'Anti-procrastinacao: fazer bloco de 25 min sem troca',tag:'Foco',category:'Rotina',frequency:'Dias uteis',meta:'25 min',priority:true},
      {text:'Anti-procrastinacao: fechar com proximo passo escrito',tag:'Review',category:'Rotina',frequency:'Dias uteis',meta:'5 min'}
    ],{prepend:true});
    addShopRoutine('Protocolo anti-procrastinacao completo',[
      'Escolher uma tarefa que esta sendo evitada ha mais de 24h',
      'Escrever a versao ridicula: algo que leva menos de 2 minutos',
      'Remover uma distracao fisica ou digital antes de comecar',
      'Abrir somente a tela/material da tarefa',
      'Executar 10 minutos sem avaliar qualidade',
      'Se destravar, continuar por 25 minutos; se nao, registrar exatamente onde travou',
      'Fechar deixando o proximo passo escrito para amanha'
    ]);
    seedShopPage('agenda',[
      {title:'Bloco anti-procrastinacao',type:'Foco',metric:'10 + 25 min',priority:'Alta',due:'Hoje',progress:0,nextStep:'Escolher tarefa evitada e escrever versao ridicula',note:'Nao comece pelo plano perfeito. Comece pelo menor gesto fisico possivel.'},
      {title:'Lista de travas recorrentes',type:'Diagnostico',metric:'3 travas',priority:'Media',due:'Semana',progress:0,nextStep:'Registrar a trava depois de cada bloco ruim',note:'Padroes comuns: celular, sono, medo de errar, tarefa grande demais, ambiente baguncado.'}
    ]);
    return true;
  }
  if(item.id==='template_premium'){
    addShopRoutine('Sistema operacional diario premium',[
      'Manha: escolher 1 resultado principal e 2 tarefas de suporte',
      'Antes do foco: limpar ambiente, abrir apenas a ferramenta necessaria e iniciar timer',
      'Durante: trabalhar em uma unica entrega ate existir evidência de progresso',
      'Tarde: revisar pendencias, mensagens e pagamentos rapidos',
      'Noite: registrar feito, pendente, aprendizado e primeira acao de amanha'
    ]);
    addShopTasks([
      {text:'Premium OS: resultado principal do dia',tag:'Foco',category:'Rotina',frequency:'Diario',meta:'10 min',priority:true},
      {text:'Premium OS: bloco de entrega profunda',tag:'Foco',category:'Rotina',frequency:'Diario',meta:'50 min',priority:true},
      {text:'Premium OS: fechamento e plano de amanha',tag:'Review',category:'Rotina',frequency:'Diario',meta:'12 min',priority:true}
    ]);
    seedShopPage('agenda',[
      {title:'Resultado principal de hoje',type:'Prioridade',metric:'1 entrega',priority:'Alta',due:'Diario',progress:0,nextStep:'Definir o que precisa existir ate o fim do dia',note:'Nao e lista de tarefas. E o resultado que faria o dia valer.'},
      {title:'Bloco de entrega profunda',type:'Foco',metric:'50 min',priority:'Alta',due:'Diario',progress:0,nextStep:'Abrir ferramenta e executar sem alternar contexto',note:'Progresso precisa deixar evidencia: arquivo, tela, treino, pagamento, anotacao ou decisao.'},
      {title:'Fechamento do dia',type:'Review',metric:'Feito / pendente / amanha',priority:'Alta',due:'Noite',progress:0,nextStep:'Escrever primeira acao de amanha',note:'O objetivo e acordar sabendo por onde continuar.'}
    ]);
    seedShopPage('metas',[
      {title:'Placar semanal premium',type:'Scorecard',metric:'5 dias operacionais',priority:'Media',due:'Semana',progress:0,nextStep:'Marcar quantos dias tiveram resultado principal concluido',note:'Use como painel de consistencia. Semana boa = 4 ou 5 dias com entrega real.'}
    ]);
    return true;
  }
  return false;
}

function buyShopItem(id){
  if(RO())return;
  ensureRetentionData();
  const item=shopItem(id);
  if(!item)return;
  if(shopUsed(item)){showCyberToast('LIMITE ATINGIDO',item.limit==='weekly'?'Item semanal ja usado.':'Item diario ja usado.',4200);refreshShopViews();return;}
  if(item.type==='utility' || item.type==='template'){
    if(!spendEddies(item.cost))return;
    if(!applyShopUtility(item)){if(!hasInfiniteEddies())myData.eddies+=item.cost;return;}
    markShopUsed(item);
    showCyberToast('ITEM ATIVADO',htmlEscape(item.name)+' // -EUR$'+item.cost,5200);
  }else if(item.type==='shield'){
    if(!spendEddies(item.cost))return;
    myData.streakShields++;
    markShopUsed(item);
    showCyberToast('ESCUDO COMPRADO','// ICE +1 // -EUR$'+item.cost,5200);
  }else{
    if(shopOwns(id)){showCyberToast('JA ADQUIRIDO','Use EQUIPAR para ativar.',3800);return;}
    if(!spendEddies(item.cost))return;
    myData.shopUnlocks.push(id);
    showCyberToast('ITEM DESBLOQUEADO',htmlEscape(item.name)+' // -EUR$'+item.cost,5200);
  }
  fxBlip('win');
  refreshShopViews();renderStreakShield();updateStats();updateEddiesDisplay();scheduleAutoSave();
}

function equipCosmetic(id){
  if(RO())return;
  ensureRetentionData();
  const item=shopItem(id);
  if(!item || !shopOwns(id))return;
  const slot=item.type;
  const value=item.theme||id;
  const already=myData.equippedCosmetics[slot]===value;
  myData.equippedCosmetics[slot]=already?'':value;
  if(item.type==='theme'){
    if(already){applyTheme(currentTheme);}else{applyCosmeticTheme();}
  }
  showCyberToast(already?'COSMETICO REMOVIDO':'COSMETICO EQUIPADO',htmlEscape(item.name),4200);
  if(typeof updateOperatorCosmetics==='function')updateOperatorCosmetics();
  if(typeof renderThemeControls==='function')renderThemeControls();
  refreshShopViews();updateStats();scheduleAutoSave();
}

function setShopTab(tab){shopTab=isShopTab(tab)?tab:'utility';refreshShopViews();}

function shopVisualMeta(item){
  if(item.type==='theme')return {icon:'cart',tone:'cyan',label:'SKIN DE FACCAO'};
  if(item.type==='title')return {icon:'target',tone:'purple',label:'TITULO'};
  if(item.type==='frame')return {icon:'homebase',tone:'red',label:'FRAME'};
  if(item.type==='avatar')return {icon:'mind',tone:'cyan',label:'ICONE'};
  if(item.type==='template')return {icon:'book',tone:'green',label:'TEMPLATE'};
  if(item.type==='shield')return {icon:'sleep',tone:'cyan',label:'ICE'};
  if(item.id==='loot_cache')return {icon:'cart',tone:'yellow',label:'CACHE'};
  if(item.id==='micro_contract')return {icon:'target',tone:'red',label:'MISSAO'};
  if(item.id==='dev_sprint')return {icon:'code',tone:'cyan',label:'SPRINT'};
  if(item.id==='finance_kit')return {icon:'money',tone:'green',label:'KIT'};
  if(item.id==='reading_kit')return {icon:'book',tone:'green',label:'ARQUIVO'};
  if(item.id==='focus_boost')return {icon:'energy',tone:'red',label:'BOOST'};
  if(item.id==='recovery_pass')return {icon:'sleep',tone:'cyan',label:'RECUPERACAO'};
  if(item.id==='reroll_daily')return {icon:'target',tone:'yellow',label:'UTILIDADE'};
  if(/^mission_/.test(item.id))return {icon:'target',tone:item.id==='mission_finance'?'green':item.id==='mission_body'?'red':item.id==='mission_recovery'?'cyan':'yellow',label:'MISSAO'};
  return {icon:'cart',tone:'yellow',label:'LOOT'};
}

function shopGlyph(item){
  const meta=shopVisualMeta(item);
  const colorMap={yellow:'var(--y)',cyan:'var(--c)',purple:'var(--p)',red:'var(--r)',green:'var(--green)'};
  const color=colorMap[meta.tone]||'var(--y)';
  if(typeof customIconSvg==='function')return customIconSvg(meta.icon,color,'shop-glyph-svg');
  return '<span class="shop-glyph-fallback" aria-hidden="true">◇</span>';
}

function renderShop(){
  const grid=document.getElementById('shop-grid');
  if(!grid)return;
  updateEddiesDisplay();
  const tabs=shopTabs();
  const items=SHOP_ITEMS.filter(item=>(item.tab||'cosmetic')===shopTab);
  const balance=hasInfiniteEddies()?'€$∞':'€$'+(D().eddies||0);
  const equipped=D().equippedCosmetics||{};
  const ownedCount=(D().shopUnlocks||[]).length;
  const activeTheme=equipped.theme?htmlEscape(String(equipped.theme).toUpperCase()):'PADRAO';
  grid.innerHTML='<div class="shop-market-shell">'+
    '<div class="shop-market-head">'+
      '<div class="shop-market-title"><span class="shop-market-kicker">// MERCADO NEGRO //</span><b>BLACK MARKET</b><em>Gaste eddies em skins, boosts e protocolos uteis.</em></div>'+
      '<div class="shop-wallet"><span>SALDO</span><b>'+balance+'</b><small>'+ownedCount+' desbloqueios</small></div>'+
    '</div>'+
    '<div class="shop-tabs">'+tabs.map(([id,label])=>'<button type="button" class="'+(shopTab===id?'active':'')+'" data-action="setShopTab" data-tab="'+id+'">'+label+'</button>').join('')+'</div>'+
    '<div class="shop-market-status"><span>ABA '+htmlEscape((tabs.find(t=>t[0]===shopTab)||tabs[0])[1]).toUpperCase()+'</span><span>TEMA '+activeTheme+'</span></div>'+
    '<div class="shop-market-items">'+items.map(item=>{
    const owned=shopOwns(item.id);
    const used=shopUsed(item);
    const usable=item.type==='shield'||item.type==='utility'||item.type==='template';
    const meta=shopVisualMeta(item);
    let btn;
    if(usable || !owned){
      const disabled=RO()||used||(owned&&!usable);
      const label=used?'LIMITE USADO':(owned&&!usable?'DESBLOQUEADO':'COMPRAR EUR$'+item.cost);
      btn='<button type="button" class="shop-btn '+(used?'locked':'')+'" data-action="callNamed" data-fn="buyShopItem" data-arg0="'+htmlEscape(item.id)+'"'+(disabled?' disabled':'')+'>'+label+'</button>';
    }else{
      const slot=item.type;
      const equipped=(D().equippedCosmetics||{})[slot]===(item.theme||item.id);
      btn='<button type="button" class="shop-btn'+(equipped?' equipped':'')+'" data-action="callNamed" data-fn="equipCosmetic" data-arg0="'+htmlEscape(item.id)+'"'+(RO()?' disabled':'')+'>'+(equipped?'EQUIPADO':'EQUIPAR')+'</button>';
    }
    const state=usable?(used?'USADO':'DISPONIVEL'):(owned?'DESBLOQUEADO':'BLOQUEADO');
    const limit=item.limit?(item.limit==='weekly'?'SEMANAL':'DIARIO'):'PERMANENTE';
    const swatch=item.type==='theme'?'<div class="shop-skin-swatch '+htmlEscape(item.theme||'default')+'"><span></span></div>':'';
    const avatarPreview=item.type==='avatar'&&typeof profileAvatarHtml==='function'?'<div class="shop-avatar-preview">'+profileAvatarHtml({equippedCosmetics:{avatar:item.id}},0,'shop-avatar-art')+'</div>':'';
    return '<div class="shop-item '+(owned?'unlocked':'locked')+' shop-'+htmlEscape(item.type)+'" data-shop-tone="'+htmlEscape(meta.tone)+'">'+
      '<div class="shop-item-top"><div class="shop-glyph">'+shopGlyph(item)+'</div><div class="shop-meta"><span>'+limit+'</span><span>'+state+'</span></div></div>'+
      swatch+
      avatarPreview+
      '<div class="shop-tag">'+htmlEscape(meta.label)+'</div>'+
      '<div class="shop-name">'+htmlEscape(item.name)+'</div>'+
      '<div class="shop-desc">'+htmlEscape(item.desc)+'</div>'+
      '<div class="shop-foot"><span class="shop-price">'+(owned&&!usable?'ADQUIRIDO':'EUR$'+item.cost)+'</span>'+btn+'</div>'+
    '</div>';
  }).join('')+'</div></div>';
}

/* ============================================================
   FEATURE 4: Wrapped mensal + temporadas (seasons)
   ============================================================ */
function monthKeyOffset(offset=0){
  const n=new Date();
  const d=new Date(n.getFullYear(),n.getMonth()+offset,1);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
}
function currentMonthKey(){return monthKeyOffset(0);}

function buildWrappedStats(monthOffset=-1){
  const data=D();
  const mk=monthKeyOffset(monthOffset);
  const [yy,mm]=mk.split('-').map(Number);
  const prefix=mk+'-';
  let tasksDone=0,perfectDays=0;
  const weekdayCount=[0,0,0,0,0,0,0];
  const weekdayActiveDays=[0,0,0,0,0,0,0];
  const dayRows=[];
  const cachedDefs=allTaskDefs(data);
  Object.entries(data.tasks||{}).forEach(([dayKey,saved])=>{
    if(!String(dayKey).startsWith(prefix)||!saved)return;
    const date=new Date(dayKey+'T12:00:00');
    if(isNaN(date))return;
    const defs=cachedDefs.filter(t=>!t.archivedAt&&taskActiveOn(t,date));
    const done=Object.values(saved).filter(Boolean).length;
    tasksDone+=done;
    if(done){weekdayCount[date.getDay()]+=done;weekdayActiveDays[date.getDay()]++;}
    if(defs.length&&defs.every((_,i)=>saved[i]))perfectDays++;
    dayRows.push({dayKey,date,done,total:defs.length,pct:defs.length?Math.round(done/defs.length*100):0});
  });
  const habits=getHabits();
  let bestHabit='--',bestHabitDays=0,worstHabit='--',worstHabitDays=999;
  habits.forEach(h=>{
    let c=0;
    for(let day=1;day<=31;day++){
      const date=new Date(yy,mm-1,day);
      if(date.getMonth()!==mm-1)break;
      if(habitDone(data,h,date))c++;
    }
    if(c>bestHabitDays){bestHabitDays=c;bestHabit=h;}
    if(c<worstHabitDays){worstHabitDays=c;worstHabit=h;}
  });
  if(worstHabitDays===999){worstHabit='--';worstHabitDays=0;}
  const eddiesEarned=mk===currentMonthKey()?(data.eddies||0):0;
  const reviews=Object.keys(data.dailyReviews||{}).filter(k=>String(k).startsWith(prefix)).length;
  const achievements=Object.values(data.achievements||{}).filter(a=>String(a?.at||'').slice(0,7)===mk).length;
  const credApprox=tasksDone+reviews*3+perfectDays*5+achievements*5;
  const wd=['DOM','SEG','TER','QUA','QUI','SEX','SAB'];
  const wdFull=['domingo','segunda','terca','quarta','quinta','sexta','sabado'];
  let topDay='--',topDayN=0,topDayIndex=-1;
  weekdayCount.forEach((n,i)=>{if(n>topDayN){topDayN=n;topDay=wd[i];topDayIndex=i;}});
  let weakDay='--',weakDayN=Infinity,weakDayIndex=-1;
  weekdayCount.forEach((n,i)=>{if(weekdayActiveDays[i]&&n<weakDayN){weakDayN=n;weakDay=wd[i];weakDayIndex=i;}});
  if(weakDayN===Infinity){weakDayN=0;weakDay='--';}
  const activeDays=dayRows.filter(d=>d.done>0).length;
  const daysWithPlan=dayRows.length;
  const dataLevel=tasksDone+reviews+bestHabitDays;
  const nextMonth=wrappedLabel(monthKeyOffset(monthOffset+1));
  const diagnosis=dataLevel<3
    ? 'Dados ainda insuficientes. O relatorio ja detectou pouco historico, entao a melhor leitura e comecar pequeno e registrar mais dias.'
    : perfectDays>=4
      ? 'Mes consistente: voce fechou varios dias completos e manteve um ciclo de execucao claro.'
      : activeDays>=8
        ? 'Mes ativo, mas irregular: voce apareceu bastante, porem ainda deixou dias escaparem.'
        : 'Mes de baixa frequencia: houve progresso, mas o sistema ainda precisa de uma rotina minima para criar tracao.';
  const bestPattern=topDayIndex>=0
    ? 'Voce funciona melhor em '+wdFull[topDayIndex]+'. Esse foi o dia com mais contratos concluidos.'
    : 'Ainda nao existe um dia forte detectado. Marque contratos por alguns dias para o padrao aparecer.';
  const weakPoint=weakDayIndex>=0&&weakDayIndex!==topDayIndex
    ? 'Seu ponto fraco foi '+wdFull[weakDayIndex]+'. Houve atividade, mas ela ficou abaixo do seu melhor padrao.'
    : worstHabit!=='--'&&bestHabitDays>0
      ? 'Seu ponto fraco foi o habito '+worstHabit+', com '+worstHabitDays+' dias registrados.'
      : 'Ponto fraco ainda indefinido: faltam dados suficientes para apontar um gargalo real.';
  const suggestion=weakDayIndex>=0
    ? 'No proximo mes, proteja '+wdFull[weakDayIndex]+' com uma tarefa minima de 5 minutos.'
    : bestHabit!=='--'
      ? 'No proximo mes, mantenha '+bestHabit+' como ancora e adicione so uma meta pequena.'
      : 'No proximo mes, escolha um contrato diario simples e registre a revisao por 3 dias.';
  const seasonMission=weakDayIndex>=0
    ? 'Missao de '+nextMonth+': proteger '+wdFull[weakDayIndex]+' com uma tarefa minima.'
    : topDayIndex>=0
      ? 'Missao de '+nextMonth+': repetir o padrao de '+wdFull[topDayIndex]+' em mais um dia da semana.'
      : 'Missao de '+nextMonth+': criar 1 contrato base e fechar 3 revisoes.';
  return {monthOffset,monthKey:mk,label:wrappedLabel(mk),tasksDone,perfectDays,bestHabit,bestHabitDays,worstHabit,worstHabitDays,reviews,achievements,credApprox,eddiesEarned,topDay,topDayN,weakDay,weakDayN,activeDays,daysWithPlan,diagnosis,bestPattern,weakPoint,suggestion,seasonMission};
}

function wrappedLabel(mk){
  const months=['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
  const [y,m]=mk.split('-').map(Number);
  return months[m-1]+' '+y;
}

function showWrapped(monthOffset=-1){
  const modal=document.getElementById('wrapped-modal');
  const body=document.getElementById('wrapped-body');
  if(!modal||!body)return;
  const s=buildWrappedStats(monthOffset);
  const current=monthOffset>=0;
  body.innerHTML=`
    <div class="wrapped-kicker">// RELATORIO MENSAL //</div>
    <div class="wrapped-title">${htmlEscape(s.label)} WRAPPED</div>
    <div class="wrapped-nav">
      <button type="button" data-action="showWrapped" data-offset="${monthOffset-1}">MES ANTERIOR</button>
      <button type="button" data-action="showWrapped" data-offset="${monthOffset+1}"${current?' disabled':''}>PROXIMO</button>
    </div>
    <div class="wrapped-story">
      <div><span>DIAGNOSTICO</span><p>${htmlEscape(s.diagnosis)}</p></div>
      <div><span>MELHOR PADRAO</span><p>${htmlEscape(s.bestPattern)}</p></div>
      <div><span>PONTO FRACO</span><p>${htmlEscape(s.weakPoint)}</p></div>
      <div><span>PROXIMO MES</span><p>${htmlEscape(s.suggestion)}</p></div>
      <div class="mission"><span>PROXIMA SEASON</span><p>${htmlEscape(s.seasonMission)}</p></div>
    </div>
    <div class="wrapped-grid">
      <div class="wrapped-kpi"><b>${s.tasksDone}</b><span>CONTRATOS FEITOS</span></div>
      <div class="wrapped-kpi"><b>${s.perfectDays}</b><span>DIAS PERFEITOS</span></div>
      <div class="wrapped-kpi"><b>${s.reviews}</b><span>DIAS FECHADOS</span></div>
      <div class="wrapped-kpi"><b>${s.achievements}</b><span>CONQUISTAS</span></div>
      <div class="wrapped-kpi"><b>+${s.credApprox}</b><span>REP (APROX)</span></div>
      <div class="wrapped-kpi"><b>EUR$${s.eddiesEarned}</b><span>EDDIES</span></div>
      <div class="wrapped-kpi wide"><b>${htmlEscape(s.bestHabit)}</b><span>MELHOR HABITO // ${s.bestHabitDays} DIAS</span></div>
      <div class="wrapped-kpi wide"><b>${htmlEscape(s.topDay)}</b><span>DIA MAIS ATIVO // ${s.topDayN} CONTRATOS</span></div>
      <div class="wrapped-kpi wide"><b>${htmlEscape(s.weakDay)}</b><span>DIA MAIS FRACO COM ATIVIDADE // ${s.weakDayN} CONTRATOS</span></div>
    </div>`;
  modal.classList.add('on');
}

function closeWrapped(){document.getElementById('wrapped-modal')?.classList.remove('on');}
function maybeAutoWrapped(){
  if(RO())return;
  ensureRetentionData();
  const cmk=currentMonthKey();
  if(myData.wrappedSeen===cmk)return;
  myData.wrappedSeen=cmk;
  scheduleAutoSave();
  const s=buildWrappedStats(-1);
  if(s.tasksDone||s.reviews||s.perfectDays)setTimeout(()=>showWrapped(-1),1200);
}

const SEASON_TIERS=[
  {at:0,name:'STREET KID'},
  {at:80,name:'OPERADOR',reward:{eddies:25}},
  {at:200,name:'FIXER',reward:{eddies:50}},
  {at:400,name:'LENDA',reward:{shield:1}}
];
function seasonName(){return 'SEASON '+currentMonthKey().replace('-','.');}
function seasonScore(){
  const data=D();
  const prefix=currentMonthKey()+'-';
  let n=0;
  Object.entries(data.tasks||{}).forEach(([k,saved])=>{
    if(!String(k).startsWith(prefix)||!saved)return;
    n+=Object.values(saved).filter(Boolean).length;
  });
  return n;
}
function seasonState(){
  const score=seasonScore();
  let tier=SEASON_TIERS[0],next=null;
  for(let i=0;i<SEASON_TIERS.length;i++){
    if(score>=SEASON_TIERS[i].at)tier=SEASON_TIERS[i];
    else{next=SEASON_TIERS[i];break;}
  }
  const span=next?next.at-tier.at:1;
  const into=score-tier.at;
  return {score,tier,next,pct:next?Math.min(100,Math.round(into/span*100)):100};
}
function checkSeasonTiers(){
  if(RO())return;
  ensureRetentionData();
  const cmk=currentMonthKey();
  myData.seasonData=myData.seasonData||{};
  if(myData.seasonData.month!==cmk)myData.seasonData={month:cmk,claimed:[]};
  if(!Array.isArray(myData.seasonData.claimed))myData.seasonData.claimed=[];
  const score=seasonScore();
  SEASON_TIERS.forEach(t=>{
    if(!t.reward||score<t.at||myData.seasonData.claimed.includes(t.at))return;
    myData.seasonData.claimed.push(t.at);
    if(t.reward.eddies){const g=awardEddies(t.reward.eddies,'season');showCyberToast('TIER DE SEASON // '+t.name,'+€$'+g+' // '+seasonName(),6000);}
    if(t.reward.shield){myData.streakShields+=t.reward.shield;showCyberToast('TIER DE SEASON // '+t.name,'ICE +'+t.reward.shield+' // '+seasonName(),6000);}
    updateEddiesDisplay();
    renderStreakShield();
  });
}
function renderSeasonBanner(){
  const el=document.getElementById('season-banner');
  if(!el)return;
  const st=seasonState();
  el.innerHTML=`
    <div class="season-main"><span>${seasonName()}</span><b>${st.tier.name}</b></div>
    <div class="season-bar"><div class="season-fill" style="width:${st.pct}%"></div></div>
    <div class="season-note">${st.next?st.score+'/'+st.next.at+' contratos p/ '+st.next.name:'TIER MAXIMO // '+st.score+' contratos'}</div>`;
}

function streetCredScore(){
  const data=D();
  const today=dk();
  // Cache allTaskDefs once to avoid re-computing for every historical day
  const cachedTaskDefs=allTaskDefs(data);
  // Cap each day's task contribution at that day's actual task definition count (anti-exploit)
  const taskDone=Object.entries(data.tasks||{}).reduce((sum,[dayKey,dayTasks])=>{
    if(!dayTasks||dayKey>today)return sum; // ignore future-dated task entries
    const dayDate=new Date(dayKey+'T12:00:00');
    const dayDefs=cachedTaskDefs.filter(t=>!t.archivedAt&&taskActiveOn(t,dayDate));
    const cap=Math.max(dayDefs.length,1);
    const dayDone=Object.values(dayTasks).filter(Boolean).length;
    return sum+Math.min(dayDone,cap);
  },0);
  // Only count reviews for past/present dates (no future-planted entries)
  const reviews=Object.entries(data.dailyReviews||{}).filter(([k,r])=>r?.updatedAt&&k<=today).length;
  const books=(data.books||[]).filter(b=>b.status==='done').length;
  const projects=(data.projects||[]).filter(p=>p.status==='done').length;
  const games=(data.games||[]).filter(g=>g.status==='done').length;
  const logs=(data.devlog||[]).length+(data.guitarlog||[]).length+(data.activityHistory||[]).length;
  const streak=topStreakInfo().days;
  // Only count quests/challenges with a date key <= today
  const quests=Object.keys(data.quests||{}).filter(k=>k<=today).length;
  const weekToday=wk();
  const weeklyChallenges=Object.keys(data.weeklyChallenges||{}).filter(k=>k<=weekToday).length;
  const achievements=Object.keys(data.achievements||{}).length;
  return taskDone + reviews*3 + books*10 + projects*12 + games*8 + logs*2 + streak*5 + quests*QUEST_CRED + achievements*5 + weeklyChallenges*WEEKLY_CRED;
}

const STREET_CRED_TIERS=[
  {min:0,name:'Recruta'},
  {min:40,name:'Runner iniciante'},
  {min:100,name:'Operador ativo'},
  {min:250,name:'Fixer confiavel'},
  {min:500,name:'Lenda local'}
];

function streetCredRank(score){
  let name='Recruta';
  for(const t of STREET_CRED_TIERS)if(score>=t.min)name=t.name;
  return name;
}

// Progresso ate o proximo rank: {rank, next, into, span, pct, max}
function streetCredProgress(score){
  let idx=0;
  for(let i=0;i<STREET_CRED_TIERS.length;i++)if(score>=STREET_CRED_TIERS[i].min)idx=i;
  const cur=STREET_CRED_TIERS[idx];
  const nxt=STREET_CRED_TIERS[idx+1]||null;
  if(!nxt)return {rank:cur.name,next:null,into:0,span:0,pct:100,max:true};
  const span=nxt.min-cur.min;
  const into=score-cur.min;
  return {rank:cur.name,next:nxt.name,into,span,pct:Math.min(100,Math.round(into/span*100)),max:false,remaining:nxt.min-score};
}

/* ============================================================
   CONQUISTAS / ACHIEVEMENTS
   ============================================================ */
const ACHIEVEMENTS=[
  {id:'first_contract',name:'PRIMEIRO CONTRATO',desc:'Marcou seu primeiro contrato.',cred:5,test:d=>tasksCompletedTotal(d)>=1},
  {id:'day_complete',name:'DIA LIMPO',desc:'Concluiu todos os contratos de um dia.',cred:10,test:d=>!!d._dayComplete},
  {id:'streak_7',name:'CORRENTE DE 7',desc:'Sequencia de 7 dias em um habito.',cred:15,test:d=>maxStreak(d)>=7},
  {id:'streak_30',name:'CORRENTE DE 30',desc:'Sequencia de 30 dias. Disciplina de runner.',cred:40,test:d=>maxStreak(d)>=30},
  {id:'streak_100',name:'INQUEBRAVEL',desc:'100 dias seguidos. Lenda de Night City.',cred:100,test:d=>maxStreak(d)>=100},
  {id:'bookworm',name:'RATO DE BIBLIOTECA',desc:'Concluiu seu primeiro livro.',cred:10,test:d=>(d.books||[]).some(b=>b.status==='done')},
  {id:'builder',name:'DECK BUILDER',desc:'Concluiu seu primeiro projeto.',cred:12,test:d=>(d.projects||[]).some(p=>p.status==='done')},
  {id:'polyglot',name:'MULTITAREFA',desc:'Logou dev e violao no mesmo dia.',cred:12,test:d=>sameDayDevGuitar(d)},
  {id:'night_owl',name:'CORUJA',desc:'Fechou o dia 5 vezes.',cred:15,test:d=>Object.values(d.dailyReviews||{}).filter(r=>r?.updatedAt).length>=5},
  {id:'streak_3',name:'PRIMEIROS PASSOS',desc:'Sequencia de 3 dias em qualquer habito.',cred:5,test:d=>maxStreak(d)>=3},
  {id:'streak_14',name:'DUAS SEMANAS',desc:'14 dias seguidos. Runner de verdade.',cred:20,test:d=>maxStreak(d)>=14},
  {id:'perfect_day',name:'DIA LIMPO TOTAL',desc:'100% dos contratos em um dia.',cred:15,test:d=>!!d._dayComplete},
  {id:'first_review',name:'FECHAMENTO',desc:'Fez a primeira revisao do dia.',cred:5,test:d=>Object.values(d.dailyReviews||{}).some(r=>r?.updatedAt)},
  {id:'night_owl_pro',name:'CORUJA VETERANA',desc:'Fechou o dia 15 vezes.',cred:25,test:d=>Object.values(d.dailyReviews||{}).filter(r=>r?.updatedAt).length>=15},
  {id:'bookworm_pro',name:'DEVORADOR',desc:'5 livros concluidos.',cred:20,test:d=>(d.books||[]).filter(b=>b.status==='done').length>=5},
  {id:'week_perfect',name:'SEMANA IMPLACAVEL',desc:'7 quests diarias completadas.',cred:30,test:d=>Object.keys(d.quests||{}).length>=7},
  {id:'cred_100',name:'OPERADOR DE ELITE',desc:'Acumulou 100 de Street Cred.',cred:20,test:d=>streetCredScore()>=100}
];
function tasksCompletedTotal(d){return Object.values(d.tasks||{}).reduce((s,day)=>s+Object.values(day||{}).filter(Boolean).length,0);}
function maxStreak(d){const data=habitDataWithLiveWeek();return getHabits().reduce((m,h)=>Math.max(m,habitStreak(data,h)),0);}
function sameDayDevGuitar(d){
  const dev=new Set((d.devlog||[]).map(x=>x.date));
  return (d.guitarlog||[]).some(x=>dev.has(x.date));
}
function unlockedAchievements(){return (D().achievements)||{};}
function checkAchievements(extra){
  if(RO())return;
  myData.achievements=myData.achievements||{};
  const ctx={...myData,...(extra||{})};
  let changed=false;
  ACHIEVEMENTS.forEach(a=>{
    if(myData.achievements[a.id])return;
    let ok=false;try{ok=a.test(ctx);}catch(e){ok=false;}
    if(ok){
      myData.achievements[a.id]={at:new Date().toISOString()};
      changed=true;
      setTimeout(()=>{
        celebrate('levelup');
        showCyberToast('CONQUISTA DESBLOQUEADA',a.name+' // +'+a.cred+' REP',7000);
      },250);
    }
  });
  if(changed){renderAchievements();updateStats();scheduleAutoSave();}
}
function renderAchievements(){
  const el=document.getElementById('achievement-list');
  if(!el)return;
  try{
    const got=unlockedAchievements();
    el.innerHTML=ACHIEVEMENTS.map(a=>{
      const on=!!got[a.id];
      return `<div class="ach-item${on?' on':''}"><div class="ach-ico">${on?'◆':'◇'}</div><div class="ach-info"><div class="ach-name">${htmlEscape(a.name)}</div><div class="ach-desc">${htmlEscape(a.desc)}</div></div><div class="ach-cred">+${a.cred}</div></div>`;
    }).join('');
  }catch(e){
    console.error('[NC] renderAchievements falhou:',e);
    el.innerHTML=`<div class="empty" style="color:var(--r)">ERRO: ${htmlEscape(String(e))}</div>`;
  }
}

/* ============================================================
   DESAFIO SEMANAL
   ============================================================ */
const WEEKLY_CHALLENGES=[
  'Complete todos os contratos por 5 dias esta semana.',
  'Faca 3 ou mais revisoes de dia esta semana.',
  'Mantenha pelo menos um habito por 7 dias seguidos.',
  'Adicione um novo livro, projeto ou jogo esta semana.',
  'Registre um log de dev ou violao por 3 dias.',
  'Bata sua meta de leitura do mes.',
  'Complete a missao diaria por 5 dias seguidos.'
];
const WEEKLY_CRED=15;
function thisWeeksChallenge(){
  const key=wk();
  const idx=[...key].reduce((a,c)=>a+c.charCodeAt(0),0)%WEEKLY_CHALLENGES.length;
  return {key,idx,text:WEEKLY_CHALLENGES[idx]};
}
function weeklyChallengeDone(){const c=thisWeeksChallenge();return !!((D().weeklyChallenges||{})[c.key]);}
function completeWeeklyChallenge(){
  if(RO())return;
  const c=thisWeeksChallenge();
  myData.weeklyChallenges=myData.weeklyChallenges||{};
  if(myData.weeklyChallenges[c.key])return;
  myData.weeklyChallenges[c.key]={idx:c.idx,at:new Date().toISOString()};
  const ew=awardEddies(40,'weekly');
  renderWeeklyChallenge();
  updateStats();
  celebrate('day');
  showCyberToast('DESAFIO SEMANAL CONCLUIDO','+'+WEEKLY_CRED+' REP'+(ew?' // +€$'+ew:'')+' // SEMANA DOMINADA',7500);
  scheduleAutoSave();
}
function renderWeeklyChallenge(){
  const el=document.getElementById('weekly-challenge');
  if(!el)return;
  const c=thisWeeksChallenge();
  const done=weeklyChallengeDone();
  const now=new Date();
  // Days until next Monday (week reset). getDay(): 0=Sun,1=Mon,...,6=Sat
  const daysLeft=now.getDay()===0?1:8-now.getDay();
  const daysLabel=daysLeft===1?'1D // ULTIMO DIA':daysLeft+'D';
  el.className='weekly-challenge'+(done?' done':'');
  el.innerHTML=`<div class="dq-tag wc-tag">DESAFIO SEMANAL</div><div class="dq-text">${htmlEscape(c.text)}</div><span class="dq-tag" style="margin-left:auto">${htmlEscape(daysLabel)}</span>${RO()?'':`<button type="button" class="dq-btn" data-action="callNamed" data-fn="completeWeeklyChallenge">${done?'CONCLUIDO ✓':'RESGATAR +'+WEEKLY_CRED+' REP'}</button>`}`;
}

/* ============================================================
   MISSAO DIARIA: micro-desafio rotativo que da REP extra
   ============================================================ */
const DAILY_QUESTS=[
  'Feche o dia com uma revisao curta.',
  'Registre 1 log de evolucao (dev, violao ou leitura).',
  'Complete todos os contratos do dia.',
  'Escreva 1 reflexao, mesmo que curta.',
  'Revise sua meta principal da semana.',
  'Dedique 5 minutos a mais ao seu habito mais dificil.',
  'Planeje os contratos de amanha.',
  'Adicione ou atualize 1 item de leitura, dev ou jogo.'
];
const QUEST_CRED=8;

// Missao baseada em comportamento real do usuario (devlog, leitura, ontem).
function contextualQuest(){
  const data=D();
  const key=dk();
  const reroll=data.prefs?.questReroll;
  if(reroll?.date===key){
    const seed=String(reroll.seed||Date.now());
    const idx=[...key+seed].reduce((a,c)=>a+c.charCodeAt(0),0)%DAILY_QUESTS.length;
    return {key:key+'-reroll-'+idx,idx,text:DAILY_QUESTS[idx],rerolled:true};
  }
  const today=new Date();
  const yesterday=new Date();yesterday.setDate(today.getDate()-1);
  const yKey=localDateKey(yesterday);

  const devlogs=data.devlog||[];
  const lastDevLog=devlogs[0]?.date||null;
  const daysSinceDev=lastDevLog?Math.max(0,Math.floor((today-new Date(lastDevLog+'T12:00:00'))/864e5)):999;

  const books=data.books||[];
  const lastBookUpdate=books.map(b=>b.updatedAt||b.added||'').filter(Boolean).sort().pop()||null;
  const daysSinceBook=lastBookUpdate?Math.max(0,Math.floor((today-new Date(lastBookUpdate))/864e5)):999;

  const yDefs=allTaskDefs(data).map((t,i)=>({...t,_i:i})).filter(t=>!t.archivedAt&&taskActiveOn(t,yesterday));
  const ySaved=(data.tasks||{})[yKey]||{};
  const yDone=yDefs.filter((_,i)=>ySaved[i]).length;
  const failedYesterday=yDefs.length>0&&yDone/yDefs.length<0.5;

  const snap=todayTaskSnapshot();
  const allDoneEarly=snap.total>0&&snap.pending.length===0;

  if(failedYesterday){
    return {key,text:'Missao recuperacao: complete so 1 contrato hoje e reacenda o ritmo.',contextual:true};
  }
  if(daysSinceDev>=3&&daysSinceDev<999){
    return {key,text:'Sem log de dev ha '+daysSinceDev+' dias. Abra seu projeto e registre uma sessao hoje.',contextual:true};
  }
  if(daysSinceBook>=5&&daysSinceBook<999){
    return {key,text:'Sem progresso de leitura ha '+daysSinceBook+' dias. Avance uma pagina e registre.',contextual:true};
  }
  if(allDoneEarly){
    return {key,text:'Dia limpo! Bonus: escreva uma reflexao sobre o que aprendeu hoje.',contextual:true};
  }
  const idx=[...key].reduce((a,c)=>a+c.charCodeAt(0),0)%DAILY_QUESTS.length;
  return {key,idx,text:DAILY_QUESTS[idx]};
}

function todaysQuest(){return contextualQuest();}
function questDone(){const q=todaysQuest();return !!((D().quests||{})[q.key]);}
function completeDailyQuest(){
  if(RO())return;
  const q=todaysQuest();
  myData.quests=myData.quests||{};
  if(myData.quests[q.key])return;
  myData.quests[q.key]={idx:q.idx??-1,at:new Date().toISOString()};
  const eq=awardEddies(20,'quest');
  renderDailyQuest();
  updateStats();
  celebrate('day');
  showCyberToast('MISSAO DIARIA CONCLUIDA','+'+QUEST_CRED+' REP'+(eq?' // +€$'+eq:'')+' // '+htmlEscape(q.text),6500);
  scheduleAutoSave();
}
function renderDailyQuest(){
  const el=document.getElementById('daily-quest');
  if(!el)return;
  const q=todaysQuest();
  const done=questDone();
  const tag=q.rerolled?'MISSAO RE-ROLLED':(q.contextual?'MISSAO CONTEXTUAL':'MISSAO DIARIA');
  el.className='daily-quest'+(done?' done':'')+(q.contextual||q.rerolled?' contextual':'');
  el.innerHTML=`<div class="dq-tag">${tag}</div><div class="dq-text">${htmlEscape(q.text)}</div>${RO()?'':`<button type="button" class="dq-btn" data-action="callNamed" data-fn="completeDailyQuest">${done?'CONCLUIDA ✓':'RESGATAR +'+QUEST_CRED+' REP'}</button>`}`;
}

/* ============================================================
   EXPORTAR STATS (15)
   ============================================================ */
function exportWeeklyStats(){
  const tasks=activeTasksToday();
  const saved=(D().tasks||{})[dk()]||{};
  const done=tasks.filter((_,i)=>saved[i]).length;
  const cred=streetCredScore();
  const streak=topStreakInfo();
  const perfect=countPerfectDays();
  const rank=streetCredRank(cred);
  const text=[
    '🌆 NIGHT CITY — RESUMO',
    `📅 ${new Date().toLocaleDateString('pt-BR')}`,
    `✅ Contratos hoje: ${done}/${tasks.length}`,
    `⚡ Street Cred: ${cred} (${rank})`,
    `🔥 Maior streak: ${streak.days} dias — ${streak.name}`,
    `🏆 Dias perfeitos: ${perfect}`,
    `🎯 Conquistas: ${Object.keys(D().achievements||{}).length}`,
  ].join('\n');
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(()=>showCyberToast('STATS COPIADOS','Resumo copiado para o clipboard.',4000)).catch(()=>showCyberToast('STATS SEMANAIS',text,12000));
  }else{
    showCyberToast('STATS SEMANAIS',text,12000);
  }
}

/* ============================================================
   LORE DE RANK (17)
   ============================================================ */
const RANK_LORE={
  'Runner iniciante':'Voce acaba de entrar no jogo. Night City ainda nao sabe seu nome.',
  'Operador ativo':'Seu nome comeca a circular nos corredores. Os fixers estao de olho.',
  'Fixer confiavel':'Os grandes contratos chegam ate voce. A corporacao te nota.',
  'Lenda local':'Night City conhece seu nome. Poucos chegaram aqui.'
};

/* ============================================================
   AVATAR DE RANK (19)
   ============================================================ */
function rankAvatar(score){
  const tier=streetCredRank(score);
  const avatars={'Recruta':'◈','Runner iniciante':'◆','Operador ativo':'◉','Fixer confiavel':'⬡','Lenda local':'★'};
  return avatars[tier]||'◈';
}

function rankUpCelebration(newRank){
  const lore=RANK_LORE[newRank]||'Voce subiu de rank.';
  showCyberToast('RANK UP — '+newRank.toUpperCase(),lore,9000);
  celebrate('day');
}
