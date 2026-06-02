"use strict";

const AUTH_MODE = NC_CONFIG.AUTH_MODE || 'supabase';
const AUTH_ALLOW_LEGACY_MIGRATION = NC_CONFIG.AUTH_ALLOW_LEGACY_MIGRATION !== false;
const AUTH_EMAILS = NC_CONFIG.AUTH_EMAILS || {};
const AUTH_PENDING_PROFILE_KEY = 'nc_auth_pending_profile_v1';
const AUTH_KNOWN_ACCOUNTS_KEY = 'nc_known_accounts_v1';

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
  return localStorage.getItem(authEmailKey(username||'login')) || AUTH_EMAILS[username] || localStorage.getItem(authEmailKey('login')) || '';
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
  btn.style.display='none';
  btn.disabled=true;
}

function rememberProfileAuthEmail(username){
  const email=currentProfileAuthEmail(username);
  if(!validAuthEmail(email))throw new Error('Digite um email valido para o Supabase Auth antes de conectar.');
  localStorage.setItem(authEmailKey(username||'login'),email);
  return email;
}

function currentAccountDisplayName(){
  const input=document.getElementById('account-name-input');
  return String(input?.value || '').trim().slice(0,24);
}

function knownAuthAccounts(){
  try{
    const parsed=JSON.parse(localStorage.getItem(AUTH_KNOWN_ACCOUNTS_KEY)||'[]');
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
  localStorage.setItem(AUTH_KNOWN_ACCOUNTS_KEY,JSON.stringify(list.slice(0,Number(NC_CONFIG.ACCOUNT_LIMIT||5))));
}

function canCreateLocalAccount(email){
  const limit=Number(NC_CONFIG.ACCOUNT_LIMIT||5);
  const list=knownAuthAccounts();
  return list.some(a=>a.email===email) || list.length<limit;
}

function applyAuthUserProfile(user, displayName=''){
  if(!user?.id)return null;
  const fallback=typeof displayNameFromEmail==='function' ? displayNameFromEmail(user.email) : (user.email || user.id);
  const name=String(displayName || user.user_metadata?.display_name || fallback).trim().slice(0,24);
  if(typeof setRuntimeProfile==='function'){
    setRuntimeProfile(user.id,{name,email:user.email,avatar:'◎',role:'OPERADOR'});
  }
  if(user.email)localStorage.setItem(authEmailKey(user.id),String(user.email).toLowerCase());
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
  const pendingName=localStorage.getItem(AUTH_PENDING_PROFILE_KEY) || '';
  const uid=applyAuthUserProfile(user,pendingName);
  if(uid){
    if(pendingName && user.user_metadata?.display_name!==pendingName){
      await sb.auth.updateUser({data:{display_name:pendingName}});
      localStorage.removeItem(AUTH_PENDING_PROFILE_KEY);
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
  if(error)throw error;
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
  localStorage.setItem(AUTH_PENDING_PROFILE_KEY,displayName);
  const {data,error}=await sb.auth.signUp({
    email,
    password,
    options:{
      emailRedirectTo:authRedirectTo(),
      data:{display_name:displayName}
    }
  });
  if(error){
    localStorage.removeItem(AUTH_PENDING_PROFILE_KEY);
    throw error;
  }
  if(!data?.session){
    throw new Error('Verifique seu email e clique no link de confirmacao para voltar ao Night City.');
  }
  if(data?.user){
    applyAuthUserProfile(data.user,displayName);
    await sb.auth.updateUser({data:{display_name:displayName}});
  }
  localStorage.removeItem(AUTH_PENDING_PROFILE_KEY);
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

async function authSignInWithGoogleProfile(username){
  if(!authEnabled())throw new Error('Supabase Auth nao esta ativo.');
  if(!PROFILES[username])throw new Error('Selecione um perfil antes de entrar com Google.');
  localStorage.setItem(AUTH_PENDING_PROFILE_KEY,username);
  const {error}=await sb.auth.signInWithOAuth({
    provider:'google',
    options:{
      redirectTo:authRedirectTo(),
      queryParams:{prompt:'select_account'}
    }
  });
  if(error){
    localStorage.removeItem(AUTH_PENDING_PROFILE_KEY);
    throw error;
  }
}

async function authenticateProfile(username,password,legacyData){
  if(!authEnabled())return;
  await authSignInProfile(username,password);
}
