(function(root){
  'use strict';

  const APP_SCHEMA_VERSION = 1;

  const DEFAULT_REMINDERS_FOR_MIGRATION = [
    {id:'leitura',name:'Leitura',time:'22:00',enabled:false,message:'Hora da leitura. Fecha o dia com 30 minutos.'},
    {id:'violao',name:'Violao',time:'19:00',enabled:false,message:'Hora do violao. Mantem a streak viva.'},
    {id:'treino',name:'Treino',time:'17:30',enabled:false,message:'Hora do treino. Contrato fisico do dia.'},
    {id:'dev',name:'Dev',time:'17:00',enabled:false,message:'Hora do dev. Entra no modo netrunner.'}
  ];

  function isPlainObject(value){
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function normalizeBooleanMap(value){
    const out = {};
    if(Array.isArray(value)){
      value.forEach((item,index)=>{out[index]=!!item;});
      return out;
    }
    if(!isPlainObject(value))return out;
    Object.entries(value).forEach(([key,item])=>{
      out[key]=typeof item === 'boolean' ? item : !!item;
    });
    return out;
  }

  function normalizeTasks(tasks){
    const out = {};
    if(!isPlainObject(tasks))return out;
    Object.entries(tasks).forEach(([day,value])=>{
      out[day]=normalizeBooleanMap(value);
    });
    return out;
  }

  function normalizePrefs(prefs){
    const out = isPlainObject(prefs) ? {...prefs} : {};
    if(typeof out.sound !== 'boolean')out.sound = true;
    if(typeof out.haptics !== 'boolean')out.haptics = true;
    return out;
  }

  function normalizeReminderForMigration(reminder){
    const r = isPlainObject(reminder) ? reminder : {};
    return {
      ...r,
      id:String(r.id || ''),
      name:String(r.name || r.id || 'Lembrete'),
      time:String(r.time || '00:00'),
      enabled:!!r.enabled,
      message:String(r.message || '')
    };
  }

  function normalizeReminders(reminders){
    const source = isPlainObject(reminders) ? reminders : {};
    const out = {};
    DEFAULT_REMINDERS_FOR_MIGRATION.forEach(defaultReminder=>{
      out[defaultReminder.id]=normalizeReminderForMigration({
        ...defaultReminder,
        ...(isPlainObject(source[defaultReminder.id]) ? source[defaultReminder.id] : {})
      });
    });
    Object.entries(source).forEach(([id,value])=>{
      if(out[id])return;
      out[id]=normalizeReminderForMigration({id,...(isPlainObject(value) ? value : {})});
    });
    return out;
  }

  function normalizeDailyReviews(dailyReviews){
    const out = {};
    if(!isPlainObject(dailyReviews))return out;
    Object.entries(dailyReviews).forEach(([date,review])=>{
      if(isPlainObject(review)){
        out[date]={
          ...review,
          energy:String(review.energy || ''),
          focus:String(review.focus || ''),
          note:String(review.note || ''),
          tomorrow:String(review.tomorrow || '')
        };
      }else{
        out[date]={energy:'',focus:'',note:String(review ?? ''),tomorrow:''};
      }
    });
    return out;
  }

  function normalizeQuests(quests){
    const out = {};
    if(!isPlainObject(quests))return out;
    Object.entries(quests).forEach(([key,value])=>{
      out[key]=isPlainObject(value) ? {...value} : {value};
    });
    return out;
  }

  function migrateData(data){
    const source = isPlainObject(data) ? data : {};
    return {
      ...source,
      schemaVersion: APP_SCHEMA_VERSION,
      tasks: normalizeTasks(source.tasks),
      prefs: normalizePrefs(source.prefs),
      reminders: normalizeReminders(source.reminders),
      dailyReviews: normalizeDailyReviews(source.dailyReviews),
      quests: normalizeQuests(source.quests)
    };
  }

  function migrationChanged(before, after){
    return JSON.stringify(before || {}) !== JSON.stringify(after || {});
  }

  const api = {
    APP_SCHEMA_VERSION,
    migrateData,
    migrationChanged,
    normalizeTasks,
    normalizePrefs,
    normalizeReminders,
    normalizeDailyReviews,
    normalizeQuests
  };

  if(typeof module !== 'undefined' && module.exports)module.exports = api;
  root.APP_SCHEMA_VERSION = APP_SCHEMA_VERSION;
  root.migrateData = migrateData;
  root.migrationChanged = migrationChanged;
})(typeof window !== 'undefined' ? window : globalThis);
