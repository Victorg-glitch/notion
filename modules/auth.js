"use strict";

const AUTH_MODE = NC_CONFIG.AUTH_MODE || 'supabase';
const AUTH_ALLOW_LEGACY_MIGRATION = NC_CONFIG.AUTH_ALLOW_LEGACY_MIGRATION !== false;
const AUTH_EMAILS = NC_CONFIG.AUTH_EMAILS || {};

function authEnabled(){
  return AUTH_MODE === 'supabase';
}

function profileAuthEmail(username){
  return AUTH_EMAILS[username] || (username+'@night-city.local');
}

function profileConfigured(data){
  if(!data || typeof data!=='object')return false;
  if(data.pwd_hash)return true;
  return SAVE_KEYS.some(k=>data[k]!=null);
}

async function authSessionUsername(){
  if(!authEnabled() || !sb?.auth)return null;
  const {data,error}=await sb.auth.getSession();
  if(error)throw error;
  const username=data?.session?.user?.user_metadata?.night_city_username;
  return PROFILES[username] ? username : null;
}

async function authSignInProfile(username,password){
  const {data,error}=await sb.auth.signInWithPassword({
    email:profileAuthEmail(username),
    password
  });
  if(error)throw error;
  if(data?.user && data.user.user_metadata?.night_city_username!==username){
    await sb.auth.updateUser({data:{night_city_username:username, display_name:PROFILES[username].name}});
  }
  return data;
}

async function authSignUpProfile(username,password){
  const {data,error}=await sb.auth.signUp({
    email:profileAuthEmail(username),
    password,
    options:{data:{night_city_username:username, display_name:PROFILES[username].name}}
  });
  if(error)throw error;
  if(!data?.session){
    throw new Error('Conta Auth criada, mas precisa confirmacao de email no Supabase antes do login.');
  }
  return data;
}

async function authenticateProfile(username,password,legacyData){
  if(!authEnabled())return;
  try{
    await authSignInProfile(username,password);
    return;
  }catch(authError){
    if(!AUTH_ALLOW_LEGACY_MIGRATION)throw authError;
    if(legacyData?.pwd_hash){
      const hash=await hashPwd(password);
      if(legacyData.pwd_hash!==hash)throw authError;
    }
    await authSignUpProfile(username,password);
  }
}
