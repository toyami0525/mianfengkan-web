import {NextResponse} from 'next/server';
import {adminSupabase} from '@/lib/supabase-admin';

type AnyRow=Record<string,any>;
type VipRow={guest_name:string;guest_server:string;total:number;tier:string};

const COMPLETED_STATUSES=['completed','已完成'];
const TIP_PATTERN=/(打賞|小費|tip|tips|donation|贊助)/i;
const LEGACY_TEST_GUEST_NAMES=['羽鶴璃久','羽鶴璃久2','路','Lina'];
// 只排除這個時間點以前既有的測試資料；之後同名正式消費會正常計入。
const LEGACY_TEST_CUTOFF='2026-08-28T11:03:00.000Z';

function normalizeText(value:any){return String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ')}
function textKey(value:any){return normalizeText(value).toLocaleLowerCase('zh-Hant-TW')}
const LEGACY_TEST_GUEST_KEYS=new Set(LEGACY_TEST_GUEST_NAMES.map(textKey));
function isLegacyTestRow(rawName:any,createdAt:any){
 const key=textKey(rawName);if(!LEGACY_TEST_GUEST_KEYS.has(key))return false;
 const t=Date.parse(String(createdAt??''));const cutoff=Date.parse(LEGACY_TEST_CUTOFF);
 return Number.isFinite(t)&&t<=cutoff;
}
function vipTier(total:number){
 if(total>=5_000_000)return '丹頂上賓';
 if(total>=3_000_000)return '楓鶴貴賓';
 if(total>=1_500_000)return '白鶴貴客';
 if(total>=500_000)return '紅楓常客';
 return '楓葉旅人';
}
function reservationSpend(row:AnyRow){
 const service=String(row?.service_name??'');if(TIP_PATTERN.test(service))return 0;
 return Math.max(0,Number(row?.price||0));
}
function orderSpend(row:AnyRow){
 let items=row?.items;try{if(typeof items==='string')items=JSON.parse(items)}catch{items=null}
 if(Array.isArray(items)&&items.length){
  return items.reduce((sum:number,item:any)=>{
   const name=String(item?.name??'');if(TIP_PATTERN.test(name))return sum;
   return sum+Math.max(0,Number(item?.price||0))*Math.max(1,Number(item?.qty||1));
  },0);
 }
 return Math.max(0,Number(row?.total||0));
}
async function fetchAll(table:'reservations'|'orders',columns:string){
 const db=adminSupabase();const pageSize=1000;const rows:AnyRow[]=[];
 for(let from=0;;from+=pageSize){
  const{data,error}=await db.from(table).select(columns).in('status',COMPLETED_STATUSES).range(from,from+pageSize-1);
  if(error)throw error;const chunk=(data||[]) as AnyRow[];rows.push(...chunk);if(chunk.length<pageSize)break;
 }
 return rows;
}

export async function GET(){
 try{
  const[reservations,orders]=await Promise.all([
   fetchAll('reservations','guest_name,guest_server,service_name,price,status,created_at'),
   fetchAll('orders','guest_name,guest_server,items,total,status,created_at'),
  ]);
  const known=new Map<string,{guest_name:string;guest_server:string,total:number}>();
  const legacy=new Map<string,{guest_name:string;total:number}>();
  const add=(row:AnyRow,amount:number)=>{
   const name=normalizeText(row.guest_name);const nameKey=textKey(name);const server=normalizeText(row.guest_server);const serverKey=textKey(server);
   if(!name||!nameKey||amount<=0||isLegacyTestRow(name,row.created_at))return;
   if(serverKey){
    const key=`${nameKey}::${serverKey}`;const current=known.get(key)||{guest_name:name,guest_server:server,total:0};
    current.total+=amount;known.set(key,current);return;
   }
   const current=legacy.get(nameKey)||{guest_name:name,total:0};current.total+=amount;legacy.set(nameKey,current);
  };
  reservations.forEach(row=>add(row,reservationSpend(row)));
  orders.forEach(row=>add(row,orderSpend(row)));

  // 舊資料沒有伺服器：若同角色名稱後來只出現於一個伺服器，自動併入該伺服器；
  // 若同名橫跨多個伺服器，則保留為「未記錄伺服器」避免誤併。
  for(const[nameKey,old]of legacy){
   const matches=[...known.entries()].filter(([key])=>key.startsWith(`${nameKey}::`));
   if(matches.length===1){matches[0][1].total+=old.total;continue}
   known.set(`${nameKey}::__legacy__`,{guest_name:old.guest_name,guest_server:'',total:old.total});
  }

  const ranking:VipRow[]=[...known.values()].filter(row=>row.total>0)
   .sort((a,b)=>b.total-a.total||a.guest_name.localeCompare(b.guest_name,'zh-Hant-TW')||a.guest_server.localeCompare(b.guest_server,'zh-Hant-TW'))
   .slice(0,50).map(row=>({...row,tier:vipTier(row.total)}));
  return NextResponse.json({ranking,updated_at:new Date().toISOString(),rules:{tips_count:false,completed_only:true,server_identity:true}}, {headers:{'Cache-Control':'no-store, max-age=0'}});
 }catch(error){
  console.error('vip ranking failed',error);
  return NextResponse.json({error:error instanceof Error?error.message:'讀取消費排行失敗'},{status:500});
 }
}
