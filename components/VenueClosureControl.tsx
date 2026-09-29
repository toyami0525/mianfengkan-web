'use client';
import {useEffect,useRef,useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import {fixedClosureDate,readVenueClosure,saveVenueClosure,taipeiClosureDate,validClosureDate,type VenueClosureChange} from '@/lib/venue-closures';
import styles from './VenueClosureControl.module.css';

type Props={db:SupabaseClient;onSaved:(result:VenueClosureChange)=>void};

export default function VenueClosureControl({db,onSaved}:Props){
 const[date,setDate]=useState(()=>taipeiClosureDate());
 const[state,setState]=useState<VenueClosureChange|null>(null);
 const[error,setError]=useState(''),[message,setMessage]=useState('');
 const[saving,setSaving]=useState(false),[revision,setRevision]=useState(0);
 const savingRef=useRef(false),mountedRef=useRef(false),readVersionRef=useRef(0);
 const onSavedRef=useRef(onSaved);
 const valid=validClosureDate(date),fixed=fixedClosureDate(date);
 const known=state?.work_date===date;

 useEffect(()=>{onSavedRef.current=onSaved},[onSaved]);
 useEffect(()=>{mountedRef.current=true;return()=>{mountedRef.current=false}},[]);
 useEffect(()=>{
  const version=++readVersionRef.current;
  const controller=new AbortController();
  setError('');setMessage('');setState(null);
  if(valid&&!fixed){
   void readVenueClosure(db,date,controller.signal).then(result=>{
    if(!controller.signal.aborted&&version===readVersionRef.current)setState(result);
   }).catch(reason=>{
    if(!controller.signal.aborted&&version===readVersionRef.current)setError(reason instanceof Error?reason.message:'讀取休館狀態失敗，請重試讀取');
   });
  }
  return()=>controller.abort();
 },[db,date,revision,valid,fixed]);
 // 回到此分頁時重新確認，避免另一個館主視窗的操作留下舊狀態。
 useEffect(()=>{
  const refresh=()=>{if(document.visibilityState==='visible'&&!savingRef.current){readVersionRef.current++;setState(null);setRevision(value=>value+1)}};
  window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
  return()=>{window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh)};
 },[]);

 async function save(){
  if(savingRef.current||!valid||fixed||!known||!state||error)return;
  const workDate=date,next=!state.closed;
  savingRef.current=true;setSaving(true);setError('');setMessage('');
  // 已開始的舊讀取不得覆蓋這次儲存結果。
  readVersionRef.current++;
  try{
   const result=await saveVenueClosure(db,workDate,next);
   if(mountedRef.current){
    setState(result);
    setMessage(next?`${workDate} 已設定為全館臨時休館。`:`已取消 ${workDate} 的臨時休館。`);
   }
   onSavedRef.current(result);
  }catch(reason){
   if(mountedRef.current){
    // 網路中斷時不猜測寫入結果；重新讀回後才能再次操作。
    setState(null);setError(reason instanceof Error?reason.message:'儲存結果無法確認，請重試讀取');
   }
  }finally{
   savingRef.current=false;
   if(mountedRef.current)setSaving(false);
  }
 }
 const status=!valid?'請先選擇日期':fixed?'每週一固定休館':error?'狀態尚未確認':!known?'讀取此日期狀態中…':state?.closed?'已設定：全館臨時休館':'尚未設定臨時休館';
 const buttonLabel=saving?'儲存中…':!valid?'請選擇日期':fixed?'週一固定休館':error?'請先重試讀取':!known?'讀取中…':state?.closed?'取消該日休館':'設定休館';
 return <>
  <div className={styles.control} aria-busy={saving||Boolean(valid&&!fixed&&!known&&!error)}>
   <div className={styles.selection}>
    <label htmlFor="venue-closure-date">休館日期</label>
    <input id="venue-closure-date" type="date" required value={date} disabled={saving}
     aria-describedby="venue-closure-status venue-closure-hint" onChange={event=>{
      if(savingRef.current)return;
      readVersionRef.current++;setState(null);setError('');setMessage('');setDate(event.target.value);
     }}/>
    <small id="venue-closure-status" role="status">{status}</small>
   </div>
   <div className={styles.actions}>
    <button type="button" className="ghost" disabled={saving} onClick={()=>{
     if(savingRef.current)return;
     readVersionRef.current++;setState(null);setError('');setMessage('');setDate(taipeiClosureDate());setRevision(value=>value+1);
    }}>今天</button>
    <button type="button" className={state?.closed?'ghost':'venue-close-btn'}
     disabled={saving||!valid||fixed||!known||Boolean(error)} onClick={()=>void save()}>{buttonLabel}</button>
   </div>
  </div>
  {error&&<div className={styles.error} role="alert"><span>{error}</span><button type="button" className="ghost" disabled={saving} onClick={()=>setRevision(value=>value+1)}>重試讀取</button></div>}
  {message&&<p className={styles.message} role="status">{message}</p>}
  <p className="hint" id="venue-closure-hint">可提前選擇日期設定全館休館，也可選回同一天取消。只影響所選日期，不改動其他日期或館員休假；每週一仍為固定休館。公開月曆會顯示休館，指名與點餐依該日期的休館設定阻擋。</p>
 </>;
}
