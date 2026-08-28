import {NextResponse} from 'next/server';
import {adminSupabase} from '@/lib/supabase-admin';

type AnyRow=Record<string,any>;
type VipRow={guest_name:string;total:number;tier:string};

const COMPLETED_STATUSES=['completed','已完成'];
const TIP_PATTERN=/(打賞|小費|tip|tips|donation|贊助)/i;

function normalizeGuestName(value:any){
 return String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ');
}
function guestKey(value:any){return normalizeGuestName(value).toLocaleLowerCase('zh-Hant-TW')}
function vipTier(total:number){
 if(total>=5_000_000)return '丹頂上賓';
 if(total>=3_000_000)return '楓鶴貴賓';
 if(total>=1_500_000)return '白鶴貴客';
 if(total>=500_000)return '紅楓常客';
 return '楓葉旅人';
}
function reservationSpend(row:AnyRow){
 const service=String(row?.service_name??'');
 if(TIP_PATTERN.test(service))return 0;
 return Math.max(0,Number(row?.price||0));
}
function orderSpend(row:AnyRow){
 let items=row?.items;
 try{if(typeof items==='string')items=JSON.parse(items)}catch{items=null}
 if(Array.isArray(items)&&items.length){
  return items.reduce((sum:number,item:any)=>{
   const name=String(item?.name??'');
   if(TIP_PATTERN.test(name))return sum;
   const price=Math.max(0,Number(item?.price||0));
   const qty=Math.max(1,Number(item?.qty||1));
   return sum+price*qty;
  },0);
 }
 return Math.max(0,Number(row?.total||0));
}
async function fetchAll(table:'reservations'|'orders',columns:string){
 const db=adminSupabase();
 const pageSize=1000;const rows:AnyRow[]=[];
 for(let from=0;;from+=pageSize){
  const{data,error}=await db.from(table).select(columns).in('status',COMPLETED_STATUSES).range(from,from+pageSize-1);
  if(error)throw error;
  const chunk=(data||[]) as AnyRow[];rows.push(...chunk);
  if(chunk.length<pageSize)break;
 }
 return rows;
}

export async function GET(){
 try{
  const[reservations,orders]=await Promise.all([
   fetchAll('reservations','guest_name,service_name,price,status'),
   fetchAll('orders','guest_name,items,total,status'),
  ]);
  const map=new Map<string,{guest_name:string,total:number}>();
  const add=(rawName:any,amount:number)=>{
   const name=normalizeGuestName(rawName);const key=guestKey(name);
   if(!name||!key||amount<=0)return;
   const current=map.get(key)||{guest_name:name,total:0};
   current.total+=amount;
   if(name.length>current.guest_name.length)current.guest_name=name;
   map.set(key,current);
  };
  reservations.forEach(row=>add(row.guest_name,reservationSpend(row)));
  orders.forEach(row=>add(row.guest_name,orderSpend(row)));
  const ranking:VipRow[]=[...map.values()]
   .filter(row=>row.total>0)
   .sort((a,b)=>b.total-a.total||a.guest_name.localeCompare(b.guest_name,'zh-Hant-TW'))
   .slice(0,50)
   .map(row=>({...row,tier:vipTier(row.total)}));
  return NextResponse.json({ranking,updated_at:new Date().toISOString(),rules:{tips_count:false,completed_only:true}}, {headers:{'Cache-Control':'no-store, max-age=0'}});
 }catch(error){
  console.error('vip ranking failed',error);
  return NextResponse.json({error:error instanceof Error?error.message:'讀取消費排行失敗'},{status:500});
 }
}
