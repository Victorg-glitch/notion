// Event binding centralizado para reduzir handlers inline e endurecer CSP.
// Usa whitelist explicita; nao usa eval nem Function constructor.
function bindUiEvents(){
  if(document.documentElement.dataset.eventsBound==='1')return;
  document.documentElement.dataset.eventsBound='1';

  const call=(name,...args)=>{
    const fn=window[name];
    if(typeof fn==='function')return fn(...args);
    console.warn('Acao UI indisponivel:',name);
  };
  const sharedTarget=(el)=>{
    const source=el.closest?.('[data-action="openSharedSection"],[data-action="viewPublicSharedSection"]') || el;
    return {
      owner:source.dataset.owner || source.dataset.friend || '',
      section:source.dataset.section || ''
    };
  };
  const namedAllow=new Set([
    'createStarterDevLog','createDevLogTemplate','createStarterGuitarLog','createGuitarPracticeTemplate',
    'createStarterGame','createGameQueueTemplate','createStarterRef','createReflectionTemplate',
    'createStarterBook','createReadingTemplate','addQuickBookSuggestion','createStarterProject','createProjectTemplate',
    'createStarterRoutine','addRoutine','createRoutineTemplate','openContractModal','autoBuildFromHome',
    'closeHomeModule','openHomeModule','openSettingsModule','downloadBackup','triggerImportBackup',
    'copyDiagnosticReport','clearDiagnosticReport',
    'restorePreImportBackup',
    'runSettingsAction','applyQuickTemplate','useStreakShield','buyShopItem','equipCosmetic','setShopTab',
    'startMission','snoozeMission','completeMissionDirect','openMissionFocus','closeMissionFocus',
    'toggleMissionFocusPause','completeMissionFromFocus','openCarryMissionFocus',
    'convertTomorrowCarryMission','ignoreTomorrowCarryMission','saveOwnFriendProfile','copyOwnFriendId',
    'saveFriendTarget','selectFriendContact','addSuggestedFriend','backToFriendList','sendFriendMessage',
    'respondFriendRequest','closeFriendChat','openFriendPanel','toggleFriend','openPublicFriendProfile',
    'closePublicFriendProfile','copyPublicFriendId','openChatFromPublicProfile','addFriendFromPublicProfile',
    'openSharedSection','viewPublicSharedSection','togglePageObjectiveEdit',
    'goPage','toggleCustomFocusEdit','createStarterForPage','toggleCustomItemEdit','delCustomItem',
    'saveCustomItemEdit','addCustomItem','addWeightLog','delWeightLog','duplicateTask','archiveTask',
    'exportWeeklyStats','completeWeeklyChallenge','completeDailyQuest','applyContractTemplate',
    'restoreTask','toggleTaskPriority','removeTaskItem','removeHabitItem','removeDistrict','delBook',
    'delProject','delDevLog','delGLog','delGame','delRef','removeSkillDef','removeRoutine',
    'removeRoutineStep','addRoutineStep','addDistrictFromTemplate','cycleBook','cycleCustomItem',
    'delCustomItem','saveCustomItemEdit','addCustomItem'
  ]);
  const numericArgsByFn={
    openContractModal:[0],toggleCustomItemEdit:[1],delCustomItem:[1],saveCustomItemEdit:[1],
    delWeightLog:[0],duplicateTask:[0],archiveTask:[0],applyContractTemplate:[0],restoreTask:[0],
    toggleTaskPriority:[0],removeTaskItem:[0],removeHabitItem:[0],removeDistrict:[0],delBook:[0],
    delProject:[0],delDevLog:[0],delGLog:[0],delGame:[0],delRef:[0],removeRoutine:[0],
    addRoutineStep:[0],cycleBook:[0],cycleCustomItem:[1],removeSkillDef:[1],removeRoutineStep:[0,1]
  };

  const clickActions={
    callNamed:(el)=>{
      const fn=el.dataset.fn;
      if(!namedAllow.has(fn))return;
      const args=[];
      for(let i=0;i<4;i++){
        if(!Object.prototype.hasOwnProperty.call(el.dataset,'arg'+i))continue;
        let value=el.dataset['arg'+i];
        const numericIndexes=numericArgsByFn[fn] || [];
        if(numericIndexes.includes(i) || (el.dataset.numberArgs||'').split(',').includes(String(i)))value=Number(value);
        args.push(value);
      }
      if(args.length===0 && Object.prototype.hasOwnProperty.call(el.dataset,'arg')){
        args.push(el.dataset.arg);
      }
      return call(fn,...args);
    },
    setLoginMode:(el)=>call('setLoginMode',el.dataset.value),
    togglePasswordVisibility:(el)=>call('togglePasswordVisibility',el.dataset.target,el),
    forgotPassword:()=>call('forgotPassword'),
    resetLoginForm:()=>call('resetLoginForm'),
    submitAuthForm:()=>call('submitAuthForm'),
    doGoogleLogin:()=>call('doGoogleLogin'),
    openOwnProfilePanel:()=>call('openOwnProfilePanel'),
    toggleThemeMenu:()=>call('toggleThemeMenu'),
    chooseTheme:(el)=>call('chooseTheme',el.dataset.theme),
    openGlobalSearch:()=>call('openGlobalSearch'),
    toggleFriend:()=>call('toggleFriend'),
    saveAll:()=>call('saveAll'),
    doLogout:()=>call('doLogout'),
    closeFriendChat:()=>call('closeFriendChat'),
    closeGlobalSearch:()=>call('closeGlobalSearch'),
    setSearchFilter:(el)=>call('setSearchFilter',el.dataset.filter),
    closeWeeklySummary:()=>call('closeWeeklySummary'),
    closeSetupWizard:()=>call('closeSetupWizard'),
    pickSetupMode:(el)=>call('pickSetupMode',el.dataset.mode),
    autoBuildRoutine:()=>call('autoBuildRoutine'),
    editBeforeActivate:()=>call('editBeforeActivate'),
    fillSetupDefaults:()=>call('fillSetupDefaults'),
    saveSetupWizard:()=>call('saveSetupWizard'),
    closeDailyReview:()=>call('closeDailyReview'),
    saveDailyReview:()=>call('saveDailyReview'),
    saveTomorrowMission:()=>call('saveDailyReview'),
    closeWrapped:()=>call('closeWrapped'),
    closeContractModal:()=>call('closeContractModal'),
    setContractMode:(el)=>call('setContractMode',el.dataset.mode),
    saveContractModal:()=>call('saveContractModal'),
    toggleTodayMode:(el)=>call('toggleTodayMode',el.dataset.enabled==='true'),
    openDailyReview:()=>call('openDailyReview'),
    toggleHomeMenu:(el)=>call('toggleHomeMenu',el.dataset.open==='true'),
    showWrapped:(el)=>call('showWrapped',Number(el.dataset.offset||0)),
    openContractModal:(el)=>call('openContractModal',el.dataset.index==null?undefined:Number(el.dataset.index)),
    applyContractTemplate:(el)=>call('applyContractTemplate',Number(el.dataset.index||0)),
    applyQuickTemplate:(el)=>call('applyQuickTemplate',el.dataset.template),
    openHomeModule:(el)=>call('openHomeModule',el.dataset.module),
    openSettingsModule:()=>call('openSettingsModule'),
    closeHomeModule:()=>call('closeHomeModule'),
    runSettingsAction:(el)=>call('runSettingsAction',el.dataset.settingAction),
    useStreakShield:(el)=>call('useStreakShield',el.dataset.target),
    buyShopItem:(el)=>call('buyShopItem',el.dataset.item),
    equipCosmetic:(el)=>call('equipCosmetic',el.dataset.item),
    setShopTab:(el)=>call('setShopTab',el.dataset.tab),
    startMission:()=>call('startMission'),
    snoozeMission:()=>call('snoozeMission'),
    completeMissionDirect:()=>call('completeMissionDirect'),
    openMissionFocus:()=>call('openMissionFocus'),
    openCarryMissionFocus:()=>call('openCarryMissionFocus'),
    convertTomorrowCarryMission:()=>call('convertTomorrowCarryMission'),
    ignoreTomorrowCarryMission:()=>call('ignoreTomorrowCarryMission'),
    closeMissionFocus:()=>call('closeMissionFocus'),
    setMissionFocusDuration:(el)=>call('setMissionFocusDuration',Number(el.dataset.minutes||25)),
    toggleMissionFocusPause:()=>call('toggleMissionFocusPause'),
    completeMissionFromFocus:()=>call('completeMissionFromFocus'),
    saveOwnFriendProfile:()=>call('saveOwnFriendProfile'),
    copyOwnFriendId:()=>call('copyOwnFriendId'),
    saveFriendTarget:()=>call('saveFriendTarget'),
    selectFriendContact:(el)=>call('selectFriendContact',el.dataset.friend),
    addSuggestedFriend:(el)=>call('addSuggestedFriend',el.dataset.friend),
    backToFriendList:()=>call('backToFriendList'),
    sendFriendMessage:()=>call('sendFriendMessage'),
    respondFriendRequest:(el)=>call('respondFriendRequest',el.dataset.friend,el.dataset.status),
    openPublicFriendProfile:(el)=>call('openPublicFriendProfile',el.dataset.friend),
    closePublicFriendProfile:()=>call('closePublicFriendProfile'),
    copyPublicFriendId:(el)=>call('copyPublicFriendId',el.dataset.friend),
    openChatFromPublicProfile:(el)=>call('openChatFromPublicProfile',el.dataset.friend),
    addFriendFromPublicProfile:(el)=>call('addFriendFromPublicProfile',el.dataset.friend),
    openSharedSection:(el)=>{const target=sharedTarget(el);return call('openSharedSection',target.owner,target.section);},
    viewPublicSharedSection:(el)=>{const target=sharedTarget(el);return call('openSharedSection',target.owner,target.section);},
    openFriendPanel:()=>call('openFriendPanel'),
    searchGoPage:(el)=>{call('closeGlobalSearch');call('goPage',el.dataset.page);},
    toggleCustomFocusEdit:(el)=>call('toggleCustomFocusEdit',el.dataset.page),
    togglePageObjectiveEdit:(el)=>call('togglePageObjectiveEdit',el.dataset.page),
    createStarterForPage:(el)=>call('createStarterForPage',el.dataset.page),
    cycleCustomItem:(el)=>call('cycleCustomItem',el.dataset.page,Number(el.dataset.id)),
    toggleCustomItemEdit:(el)=>call('toggleCustomItemEdit',el.dataset.page,Number(el.dataset.id)),
    delCustomItem:(el)=>call('delCustomItem',el.dataset.page,Number(el.dataset.id)),
    saveCustomItemEdit:(el)=>call('saveCustomItemEdit',el.dataset.page,Number(el.dataset.id)),
    addCustomItem:(el)=>call('addCustomItem',el.dataset.page),
    addWeightLog:()=>call('addWeightLog'),
    delWeightLog:(el)=>call('delWeightLog',Number(el.dataset.id)),
    toggleTask:(el)=>call('toggleTask',el),
    toggleTaskPriority:(el)=>call('toggleTaskPriority',Number(el.dataset.index)),
    duplicateTask:(el)=>call('duplicateTask',Number(el.dataset.index)),
    archiveTask:(el)=>call('archiveTask',Number(el.dataset.index)),
    restoreTask:(el)=>call('restoreTask',Number(el.dataset.index)),
    autoBuildFromHome:(el)=>call('autoBuildFromHome',el.dataset.focus),
    exportWeeklyStats:()=>call('exportWeeklyStats'),
    completeWeeklyChallenge:()=>call('completeWeeklyChallenge'),
    completeDailyQuest:()=>call('completeDailyQuest'),
    removeTaskItem:(el)=>call('removeTaskItem',Number(el.dataset.index)),
    removeHabitItem:(el)=>call('removeHabitItem',Number(el.dataset.index)),
    addDistrictFromTemplate:(el)=>call('addDistrictFromTemplate',document.getElementById(el.dataset.select)?.value),
    removeDistrict:(el)=>call('removeDistrict',Number(el.dataset.index)),
    cycleBook:(el)=>call('cycleBook',Number(el.dataset.id)),
    delBook:(el)=>call('delBook',Number(el.dataset.id)),
    delProject:(el)=>call('delProject',Number(el.dataset.id)),
    delDevLog:(el)=>call('delDevLog',Number(el.dataset.id)),
    delGLog:(el)=>call('delGLog',Number(el.dataset.id)),
    delGame:(el)=>call('delGame',Number(el.dataset.id)),
    delRef:(el)=>call('delRef',Number(el.dataset.id)),
    removeSkillDef:(el)=>call('removeSkillDef',el.dataset.kind,Number(el.dataset.index)),
    updateSkillLevel:(el)=>{
      if(RO())return;
      myData.skills=myData.skills||{};
      const sk=el.dataset.skill;
      const level=Number(el.dataset.level||0);
      myData.skills[sk]=(myData.skills[sk]||0)===level?level-1:level;
      call('renderSkills');call('renderGoals');call('scheduleAutoSave');
    },
    toggleR:(el)=>call('toggleR',el),
    removeRoutine:(el)=>call('removeRoutine',Number(el.dataset.index)),
    removeRoutineStep:(el)=>call('removeRoutineStep',Number(el.dataset.routine),Number(el.dataset.step)),
    addRoutineStep:(el)=>call('addRoutineStep',Number(el.dataset.index)),
    completeAllTasks:()=>call('completeAllTasks'),
    toggleArchivedTasks:()=>call('toggleArchivedTasks'),
    toggleCompactMode:()=>call('toggleCompactMode'),
    toggleTaskSort:()=>call('toggleTaskSort'),
    toggleFocusMode:()=>call('toggleFocusMode'),
    setTaskFilter:(el)=>call('setTaskFilter',el.dataset.filter),
    addTaskItem:()=>call('addTaskItem'),
    toggleEditTasks:()=>call('toggleEditTasks'),
    toggleEditGoals:()=>call('toggleEditGoals'),
    goPage:(el)=>call('goPage',el.dataset.page),
    openExternalUrl:(el)=>{if(el.dataset.url)window.open(el.dataset.url,'_blank','noopener');},
    resetWeeklyHabits:()=>call('resetWeeklyHabits'),
    toggleEditRoutines:()=>call('toggleEditRoutines'),
    addRoutine:()=>call('addRoutine'),
    toggleEditDistricts:()=>call('toggleEditDistricts'),
    addDistrictItem:()=>call('addDistrictItem'),
    requestReminderPermission:()=>call('requestReminderPermission'),
    enableClosedPush:()=>call('enableClosedPush'),
    testClosedPush:()=>call('testClosedPush'),
    testReminderNotification:()=>call('testReminderNotification'),
    toggleReminder:(el)=>call('toggleReminder',el.dataset.id),
    downloadBackup:()=>call('downloadBackup'),
    copyBackupJson:()=>call('copyBackupJson'),
    retryPendingLocalSave:()=>call('retryPendingLocalSave'),
    triggerImportBackup:()=>call('triggerImportBackup'),
    restorePreImportBackup:()=>call('restorePreImportBackup'),
    copyDiagnosticReport:()=>call('copyDiagnosticReport'),
    clearDiagnosticReport:()=>call('clearDiagnosticReport'),
    confirmBackupImport:()=>call('confirmBackupImport'),
    cancelBackupImport:()=>call('cancelBackupImport'),
    addBook:()=>call('addBook'),
    toggleEditSkillDefs:(el)=>call('toggleEditSkillDefs',el.dataset.kind),
    addSkillDef:(el)=>call('addSkillDef',el.dataset.kind),
    addProject:()=>call('addProject'),
    addDevLog:()=>call('addDevLog'),
    addGuitarLog:()=>call('addGuitarLog'),
    addGame:()=>call('addGame'),
    addReflexao:()=>call('addReflexao')
  };

  const changeActions={
    setTheme:(el)=>call('setTheme',el.value),
    setUiMode:(el)=>call('setUiMode',el.value),
    setMotionMode:(el)=>call('setMotionMode',el.value),
    setSoundPref:(el)=>call('setSoundPref',el.value),
    previewAutoRoutine:()=>call('previewAutoRoutine'),
    updateContractPreview:()=>call('updateContractPreview'),
    importBackupFile:(el)=>call('importBackupFile',el),
    updateReminderTime:(el)=>call('updateReminderTime',el.dataset.id,el.value),
    updateFriendPermission:(el)=>call('updateFriendPermission',el.dataset.area,el.checked),
    setDistrictPage:(el)=>call('setDistrictPage',Number(el.dataset.index),el.value),
    updateDistrictField:(el)=>{
      if(!myData?.districts?.[Number(el.dataset.index)])return;
      myData.districts[Number(el.dataset.index)][el.dataset.field]=el.value;
      call('renderDistricts');
    }
  };

  const inputActions={
    renderGlobalSearch:(el)=>call('renderGlobalSearch',el.value),
    updateContractPreview:()=>call('updateContractPreview'),
    normalizeEmail:(el)=>{el.value=el.value.trim().toLowerCase();},
    updatePageObjective:(el)=>call('updatePageObjective',el.dataset.page,el.value),
    updateCustomFocus:(el)=>call('updateCustomFocus',el.dataset.page,el.value),
    updateGoalField:(el)=>{
      myData.goals=myData.goals||{};
      const field=el.dataset.field;
      myData.goals[field]=el.dataset.number==='true'?Math.max(1,Number(el.value)||Number(el.dataset.fallback||1)):el.value;
      call('renderGoals');
      if(field==='monthlyBooks')call('updateBooksProg');
    },
    updateTaskDefField:(el)=>{
      call('syncTodayTasksFromDom');
      const idx=Number(el.dataset.index);
      if(myData?.taskDefs?.[idx])myData.taskDefs[idx][el.dataset.field]=el.value;
      call('renderTasks');call('syncTodayHabitsFromTasks');call('updateStats');
    },
    updateHabitDef:(el)=>{
      const idx=Number(el.dataset.index);
      if(myData?.habitDefs)myData.habitDefs[idx]=el.value;
      call('renderHabitsTable');call('renderConsistencyPanel');call('updateStats');
    },
    updateRoutineTitle:(el)=>{
      const idx=Number(el.dataset.index);
      if(myData?.routines?.[idx])myData.routines[idx].title=el.value;
      call('renderRoutines');
    },
    updateRoutineStep:(el)=>{
      const i=Number(el.dataset.routine), j=Number(el.dataset.step);
      if(myData?.routines?.[i]?.steps)myData.routines[i].steps[j]=el.value;
      call('renderRoutines');
    },
    updateDistrictField:(el)=>{
      if(!myData?.districts?.[Number(el.dataset.index)])return;
      myData.districts[Number(el.dataset.index)][el.dataset.field]=el.value;
      call('renderDistricts');
    },
    updateSkillDefField:(el)=>{
      const key=el.dataset.key, idx=Number(el.dataset.index), field=el.dataset.field;
      if(!myData?.[key]?.[idx])return;
      myData[key][idx][field]=el.dataset.number==='true'?Math.max(1,Math.min(10,parseInt(el.value)||5)):el.value;
      call('renderSkills');
    }
  };

  document.addEventListener('click',event=>{
    const el=event.target.closest('[data-action]');
    if(!el)return;
    const fn=clickActions[el.dataset.action];
    if(!fn)return;
    if(el.dataset.stopPropagation==='true')event.stopPropagation();
    event.preventDefault();
    fn(el,event);
  });

  document.addEventListener('dblclick',event=>{
    const el=event.target.closest('[data-dbl-action]');
    if(!el)return;
    event.preventDefault();
    if(el.dataset.stopPropagation==='true')event.stopPropagation();
    if(el.dataset.dblAction==='toggleTaskPriority')call('toggleTaskPriority',Number(el.dataset.index));
  });

  document.addEventListener('change',event=>{
    const el=event.target.closest('[data-change]');
    if(!el)return;
    const fn=changeActions[el.dataset.change];
    if(fn)fn(el,event);
  });

  document.addEventListener('input',event=>{
    const el=event.target.closest('[data-input]');
    if(!el)return;
    const fn=inputActions[el.dataset.input];
    if(fn)fn(el,event);
  });

  document.addEventListener('keydown',event=>{
    const el=event.target.closest('[data-enter-focus],[data-enter-action]');
    if(!el || event.key!=='Enter')return;
    if(el.dataset.enterFocus){
      document.getElementById(el.dataset.enterFocus)?.focus();
      return;
    }
    if(el.dataset.enterAction){
      event.preventDefault();
      call(el.dataset.enterAction);
    }
  });
}
