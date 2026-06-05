// Constantes e helpers puros de estado. Mantidos como script classico.
var SAVE_KEYS=[
  'schemaVersion',
  'tasks','habits','books','projects','devlog','guitarlog','games','reflexoes',
  'skills','taskDefs','habitDefs','routines','skillDefs','guitarSkillDefs',
  'districts','friendRequests','friendPermissions','friendTarget','friendTargets','profile','lastSeenWeek','goals','reminders','customPages','pageObjectives','dailyReviews','activityHistory','achievements','prefs','quests','weeklyChallenges',
  'eddies','eddiesDaily','streakShields','shieldMilestones','loginState','lootState','shopUnlocks','equippedCosmetics','wrappedSeen','seasonData',
  'eddiesHistory','tagStreaks','habitReminders','weeklyReviews'
];

function isPlainObject(value){
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asPlainObject(value){
  return isPlainObject(value) ? value : {};
}

function asArray(value){
  return Array.isArray(value) ? value : [];
}

function cloneJson(value){
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function localDateKey(date=new Date()){
  const y=date.getFullYear();
  const m=String(date.getMonth()+1).padStart(2,'0');
  const d=String(date.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+d;
}

var dk=()=>localDateKey();
var wk=()=>{
  const n=new Date(),j=new Date(n.getFullYear(),0,1);
  return 'w'+n.getFullYear()+'_'+Math.ceil(((n-j)/864e5+j.getDay()+1)/7);
};

function weekKeyFor(date){
  const j=new Date(date.getFullYear(),0,1);
  return 'w'+date.getFullYear()+'_'+Math.ceil(((date-j)/864e5+j.getDay()+1)/7);
}

function formatWeekKey(key){
  const m=String(key||'').match(/^w(\d{4})_(\d+)$/);
  return m ? 'SEMANA '+m[2]+' / '+m[1] : String(key||'SEMANA');
}

function habitDayIndex(date){
  return date.getDay()===0?6:date.getDay()-1;
}
