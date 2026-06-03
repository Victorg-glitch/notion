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

  const clickActions={
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
    closeWrapped:()=>call('closeWrapped'),
    closeContractModal:()=>call('closeContractModal'),
    setContractMode:(el)=>call('setContractMode',el.dataset.mode),
    saveContractModal:()=>call('saveContractModal'),
    toggleTodayMode:(el)=>call('toggleTodayMode',el.dataset.enabled==='true'),
    openDailyReview:()=>call('openDailyReview'),
    toggleHomeMenu:(el)=>call('toggleHomeMenu',el.dataset.open==='true'),
    showWrapped:(el)=>call('showWrapped',Number(el.dataset.offset||0)),
    openContractModal:()=>call('openContractModal'),
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
    resetWeeklyHabits:()=>call('resetWeeklyHabits'),
    toggleEditRoutines:()=>call('toggleEditRoutines'),
    addRoutine:()=>call('addRoutine'),
    toggleEditDistricts:()=>call('toggleEditDistricts'),
    addDistrictItem:()=>call('addDistrictItem'),
    requestReminderPermission:()=>call('requestReminderPermission'),
    enableClosedPush:()=>call('enableClosedPush'),
    testClosedPush:()=>call('testClosedPush'),
    testReminderNotification:()=>call('testReminderNotification'),
    downloadBackup:()=>call('downloadBackup'),
    copyBackupJson:()=>call('copyBackupJson'),
    retryPendingLocalSave:()=>call('retryPendingLocalSave'),
    triggerImportBackup:()=>call('triggerImportBackup'),
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
    previewAutoRoutine:()=>call('previewAutoRoutine'),
    updateContractPreview:()=>call('updateContractPreview'),
    importBackupFile:(el)=>call('importBackupFile',el)
  };

  const inputActions={
    renderGlobalSearch:(el)=>call('renderGlobalSearch',el.value),
    updateContractPreview:()=>call('updateContractPreview'),
    normalizeEmail:(el)=>{el.value=el.value.trim().toLowerCase();}
  };

  document.addEventListener('click',event=>{
    const el=event.target.closest('[data-action]');
    if(!el)return;
    const fn=clickActions[el.dataset.action];
    if(!fn)return;
    event.preventDefault();
    fn(el,event);
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
