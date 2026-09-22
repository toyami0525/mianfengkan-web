/** 狼人殺為獨立整場預約，不是每位玩家各計價。 */
export const WEREWOLF_PRICE = 500000;
export const WEREWOLF_SERVERS = ['伊弗利特','利維坦','巴哈姆特','泰坦','迦樓羅','鳳凰','奧汀'] as const;
export type WerewolfInput = {
  request_id:string; guest_name:string; guest_server:string; contact:string;
  starts_at:string; players:number; notes:string;
};
function text(value:unknown, label:string, max:number, required=false):string {
  if (typeof value !== 'string') throw new Error(`${label}格式不正確`);
  const result=value.trim();
  if ((required&&!result)||result.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)) throw new Error(`請檢查${label}`);
  return result;
}
export function validateWerewolfInput(value:unknown):WerewolfInput {
  if (!value||typeof value!=='object'||Array.isArray(value)) throw new Error('預約格式不正確');
  const b=value as Record<string,unknown>;
  if (b.agreed!==true) throw new Error('請先確認每場費用與預約須知');
  if (b.website) throw new Error('無法送出此預約');
  const request_id=text(b.request_id,'預約識別碼',36,true);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request_id)) throw new Error('請重新整理頁面後再試');
  const guest_name=text(b.guest_name,'角色名稱',80,true);
  const guest_server=text(b.guest_server,'伺服器',20,true);
  if (!(WEREWOLF_SERVERS as readonly string[]).includes(guest_server)) throw new Error('請選擇所屬伺服器');
  const contact=text(b.contact??'','聯絡方式',200);
  const notes=text(b.notes??'','備註',2000);
  if (typeof b.players!=='number'||!Number.isInteger(b.players)||b.players<1||b.players>99) throw new Error('請填寫有效的參加人數');
  const date=text(b.date,'日期',10,true),time=text(b.time,'時間',5,true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time)) throw new Error('請選擇日期與開始時間');
  const day=new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==date) throw new Error('日期不存在');
  if (day.getUTCDay()===1) throw new Error('每週一固定休館，請選擇其他日期');
  const hour=Number(time.slice(0,2)),minute=Number(time.slice(3));
  if (hour<21||hour>23||minute>59) throw new Error('請選擇台灣時間 21:00～23:59 開始');
  const starts_at=new Date(`${date}T${time}:00+08:00`).toISOString();
  // Future-time validation belongs in the transaction, AFTER the idempotency check.
  return {request_id,guest_name,guest_server,contact,starts_at,players:b.players,notes};
}
