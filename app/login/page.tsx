'use client';
import {FormEvent,useState} from 'react';
import {supabase} from '@/lib/supabase';

const LOGIN_EMAILS:Record<string,string>={
 '格林':'gelin@mianfengkan.local',
};

export default function Login(){
 const[loginId,setLoginId]=useState('');
 const[password,setPassword]=useState('');
 const[msg,setMsg]=useState('');
 async function go(e:FormEvent){
  e.preventDefault();setMsg('登入中…');
  const id=loginId.trim();
  const email=LOGIN_EMAILS[id]||(id.includes('@')?id:'');
  if(!email){setMsg('找不到此遊戲角色 ID，請確認文字是否完全相同。');return}
  try{
   const{error}=await supabase().auth.signInWithPassword({email,password});
   if(error)throw error;
   location.href='/admin';
  }catch(x){setMsg(x instanceof Error?x.message:'登入失敗')}
 }
 return <main className="auth"><form className="login-card" onSubmit={go}><div className="seal">楓</div><p className="eyebrow">MIANFENGKAN STAFF</p><h1>眠楓館・館員登入</h1><label>遊戲角色 ID<input value={loginId} onChange={e=>setLoginId(e.target.value)} autoComplete="username" placeholder="請輸入：格林" required/></label><label>密碼<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/></label><button>登入</button><p className="message">{msg}</p><a href="/index.html">返回網站</a></form></main>
}
