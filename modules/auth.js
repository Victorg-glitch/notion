"use strict";

const AUTH_MODE = NC_CONFIG.AUTH_MODE || 'supabase';
const AUTH_ALLOW_LEGACY_MIGRATION = NC_CONFIG.AUTH_ALLOW_LEGACY_MIGRATION !== false;
const AUTH_EMAILS = NC_CONFIG.AUTH_EMAILS || {};
const AUTH_PENDING_PROFILE_KEY = 'nc_auth_pending_profile_v1';
const AUTH_KNOWN_ACCOUNTS_KEY = 'nc_known_accounts_v1';
const AUTH_PENDING_SIGNUP_KEY = 'nc_pending_signup_v1';
const AUTH_EMAIL_COOLDOWN_MS = Number(NC_CONFIG.AUTH_EMAIL_COOLDOWN_MS || 10 * 60 * 1000);

function authSessionStore(){
  return sessionStorage;
}

function authLocalStore(){
  return localStorage;
}

function authEnabled(){
  return AUTH_MODE === 'supabase';
}

function authRedirectTo(){
  return window.location.origin+window.location.pathname;
}

function profileAuthEmail(username){
  return currentProfileAuthEmail(username);
}

function authEmailKey(username){
  return 'nc_auth_email_v1_'+username;
}

function savedProfileAuthEmail(username){
  return authSessionStore().getItem(authEmailKey(username||'login')) || AUTH_EMAILS[username] || authSessionStore().getItem(authEmailKey('login')) || '';
}

function currentProfileAuthEmail(username){
  const input=document.getElementById('auth-email-input');
  return String(input?.value || savedProfileAuthEmail(username) || '').trim().toLowerCase();
}

function validAuthEmail(email){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email||'').trim());
}

function prepareAuthEmailField(username){
  const wrap=document.getElementById('auth-email-wrap');
  const input=document.getElementById('auth-email-input');
  if(!wrap || !input)return;
  wrap.style.display=authEnabled() ? 'block' : 'none';
  input.value=savedProfileAuthEmail(username||'login');
}

function prepareGoogleAuthButton(username){
  const btn=document.getElementById('google-auth-btn');
  if(!btn)return;
  btn.style.display=authEnabled() ? 'block' : 'none';
  btn.disabled=!authEnabled();
}

function rememberProfileAuthEmail(username){
  const email=currentProfileAuthEmail(username);
  if(!validAuthEmail(email))throw new Error('Digite um email valido para o Supabase Auth antes de conectar.');
  authSessionStore().setItem(authEmailKey(username||'login'),email);
  return email;
}

function currentAccountDisplayName(){
  const input=document.getElementById('account-name-input');
  return String(input?.value || '').trim().slice(0,24);
}

function knownAuthAccounts(){
  try{
    const parsed=JSON.parse(authLocalStore().getItem(AUTH_KNOWN_ACCOUNTS_KEY)||'[]');
    return Array.isArray(parsed) ? parsed : [];
  }catch(e){
    return [];
  }
}

function rememberAuthAccount(user, displayName=''){
  if(!user?.id)return;
  const name=String(displayName || user.user_metadata?.display_name || user.email || user.id).trim().slice(0,24);
  const email=String(user.email || '').toLowerCase();
  const list=knownAuthAccounts().filter(a=>a && a.id!==user.id);
  list.unshift({id:user.id,email,name,updatedAt:new Date().toISOString()});
  authLocalStore().setItem(AUTH_KNOWN_ACCOUNTS_KEY,JSON.stringify(list.slice(0,Number(NC_CONFIG.ACCOUNT_LIMIT||5))));
}

function canCreateLocalAccount(email){
  const limit=Number(NC_CONFIG.ACCOUNT_LIMIT||5);
  const list=knownAuthAccounts();
  return list.some(a=>a.email===email) || list.length<limit;
}

function pendingSignupMap(){
  try{
    const parsed=JSON.parse(authLocalStore().getItem(AUTH_PENDING_SIGNUP_KEY)||'{}');
    return parsed && typeof parsed==='object' ? parsed : {};
  }catch(e){
    return {};
  }
}

function savePendingSignupMap(map){
  authLocalStore().setItem(AUTH_PENDING_SIGNUP_KEY,JSON.stringify(map));
}

function rememberPendingSignup(email, displayName=''){
  const map=pendingSignupMap();
  map[email]={email,displayName,createdAt:Date.now()};
  savePendingSignupMap(map);
}

function clearPendingSignup(email){
  const map=pendingSignupMap();
  if(map[email]){
    delete map[email];
    savePendingSignupMap(map);
  }
}

function pendingSignupWaitText(email){
  const pending=pendingSignupMap()[email];
  if(!pending?.createdAt)return '';
  const remaining=AUTH_EMAIL_COOLDOWN_MS-(Date.now()-Number(pending.createdAt));
  if(remaining<=0)return '';
  const mins=Math.max(1,Math.ceil(remaining/60000));
  return mins+' min';
}

function pendingSignupMessage(email){
  const wait=pendingSignupWaitText(email);
  if(!wait)return '';
  return 'Conta aguardando confirmacao. Confirme o email recebido ou aguarde '+wait+' antes de pedir outro link.';
}

function authErrorMessage(error){
  const msg=String(error?.message || error || '');
  const lower=msg.toLowerCase();
  if(lower.includes('email rate limit') || lower.includes('rate limit')){
    return 'Limite de envio de email atingido. Aguarde, verifique entrada/spam e tente LOGIN depois de confirmar o email.';
  }
  if(lower.includes('already registered') || lower.includes('user already registered')){
    return 'Este email ja tem conta. Use LOGIN ou ESQUECI A SENHA.';
  }
  if(lower.includes('invalid login credentials')){
    return 'Email ou senha incorretos. Se voce acabou de criar a conta, confirme o email antes de entrar.';
  }
  if(lower.includes('unsupported provider') || lower.includes('provider is not enabled')){
    return 'Login com Google ainda nao esta ativado no Supabase. Ative Authentication > Providers > Google.';
  }
  return msg;
}

function applyAuthUserProfile(user, displayName=''){
  if(!user?.id)return null;
  const fallback=typeof displayNameFromEmail==='function' ? displayNameFromEmail(user.email) : (user.email || user.id);
  const name=String(displayName || user.user_metadata?.display_name || fallback).trim().slice(0,24);
  if(typeof setRuntimeProfile==='function'){
    setRuntimeProfile(user.id,{name,email:user.email,avatar:'◎',role:'OPERADOR'});
  }
  if(user.email)authSessionStore().setItem(authEmailKey(user.id),String(user.email).toLowerCase());
  rememberAuthAccount(user,name);
  return user.id;
}

function profileConfigured(data){
  if(!data || typeof data!=='object')return false;
  return SAVE_KEYS.some(k=>data[k]!=null);
}

async function authSessionUsername(){
  if(!authEnabled() || !sb?.auth)return null;
  const {data,error}=await sb.auth.getSession();
  if(error)throw error;
  const user=data?.session?.user;
  if(!user)return null;
  const pendingName=authSessionStore().getItem(AUTH_PENDING_PROFILE_KEY) || '';
  const uid=applyAuthUserProfile(user,pendingName);
  if(uid){
    if(pendingName && user.user_metadata?.display_name!==pendingName){
      await sb.auth.updateUser({data:{display_name:pendingName}});
      authSessionStore().removeItem(AUTH_PENDING_PROFILE_KEY);
    }
    return uid;
  }
  return null;
}

async function authSignInProfile(username,password){
  const email=rememberProfileAuthEmail(username||'login');
  const {data,error}=await sb.auth.signInWithPassword({
    email,
    password
  });
  if(error)throw new Error(authErrorMessage(error));
  clearPendingSignup(email);
  if(data?.user){
    const displayName=data.user.user_metadata?.display_name || currentAccountDisplayName() || displayNameFromEmail(data.user.email);
    applyAuthUserProfile(data.user,displayName);
    if(data.user.user_metadata?.display_name!==displayName){
      await sb.auth.updateUser({data:{display_name:displayName}});
      data.user.user_metadata={...(data.user.user_metadata||{}),display_name:displayName};
    }
  }
  return data;
}

async function authSignUpProfile(username,password){
  const email=rememberProfileAuthEmail(username||'login');
  if(!canCreateLocalAccount(email))throw new Error('Limite inicial de '+(NC_CONFIG.ACCOUNT_LIMIT||5)+' contas atingido neste dispositivo.');
  const displayName=currentAccountDisplayName() || displayNameFromEmail(email);
  const pendingMessage=pendingSignupMessage(email);
  if(pendingMessage)throw new Error(pendingMessage);
  authSessionStore().setItem(AUTH_PENDING_PROFILE_KEY,displayName);
  const {data,error}=await sb.auth.signUp({
    email,
    password,
    options:{
      emailRedirectTo:authRedirectTo(),
      data:{display_name:displayName}
    }
  });
  if(error){
    rememberPendingSignup(email,displayName);
    throw new Error(authErrorMessage(error));
  }
  if(!data?.session){
    rememberPendingSignup(email,displayName);
    return {requiresEmailConfirmation:true,email};
  }
  if(data?.user){
    applyAuthUserProfile(data.user,displayName);
    await sb.auth.updateUser({data:{display_name:displayName}});
  }
  authSessionStore().removeItem(AUTH_PENDING_PROFILE_KEY);
  clearPendingSignup(email);
  return data;
}

async function createAuthAccount(password){
  return authSignUpProfile('login',password);
}

async function sendPasswordResetEmail(){
  if(!authEnabled())throw new Error('Supabase Auth nao esta ativo.');
  const email=rememberProfileAuthEmail('login');
  const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:authRedirectTo()});
  if(error)throw error;
  return email;
}

async function updateAuthPassword(password){
  if(!authEnabled())throw new Error('Supabase Auth nao esta ativo.');
  const {data,error}=await sb.auth.updateUser({password});
  if(error)throw error;
  if(data?.user)applyAuthUserProfile(data.user);
  return data;
}

async function authSignInWithGoogleProfile(username='login'){
  if(!authEnabled())throw new Error('Supabase Auth nao esta ativo.');
  const displayName=currentAccountDisplayName();
  if(displayName)authSessionStore().setItem(AUTH_PENDING_PROFILE_KEY,displayName);
  const {error}=await sb.auth.signInWithOAuth({
    provider:'google',
    options:{
      redirectTo:authRedirectTo(),
      queryParams:{prompt:'select_account'}
    }
  });
  if(error){
    authSessionStore().removeItem(AUTH_PENDING_PROFILE_KEY);
    throw new Error(authErrorMessage(error));
  }
}

async function authenticateProfile(username,password,legacyData){
  if(!authEnabled())return;
  await authSignInProfile(username,password);
}
