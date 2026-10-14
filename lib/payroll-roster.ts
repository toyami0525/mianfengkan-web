/** Payroll-only companion rule. Never creates bookings or changes settlements. */
export type PayrollStaffProfile={id?:string;slug?:string;active?:boolean|null};
function member(staff:PayrollStaffProfile[],slug:string){
 return staff.find(row=>row.slug===slug&&row.active!==false&&Boolean(row.id));
}
export function linkPayrollCompanions(ids:string[],staff:PayrollStaffProfile[]):string[]{
 const result=[...new Set(ids.map(String))];
 const airi=member(staff,'airi'),photographer=member(staff,'zizishou');
 if(airi?.id&&photographer?.id&&result.includes(airi.id)&&!result.includes(photographer.id))result.push(photographer.id);
 return result;
}
export function isPayrollCompanionLocked(id:string,ids:string[],staff:PayrollStaffProfile[]):boolean{
 const airi=member(staff,'airi'),photographer=member(staff,'zizishou');
 return Boolean(airi?.id&&photographer?.id&&id===photographer.id&&ids.includes(airi.id));
}
/** Preserve an in-progress settlement instead of silently changing its roster. */
export function hasPayrollSettlementActivity(value:unknown):boolean{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const row=value as Record<string,unknown>;
 return Number(row.distributed_food||0)>0
  || Boolean(row.settled&&typeof row.settled==='object'&&Object.keys(row.settled).length)
  || Boolean(row.food_shares&&typeof row.food_shares==='object'&&Object.values(row.food_shares).some(v=>Number(v)>0));
}
export function isSavedPayrollLocked(raw:string|null):boolean{
 if(!raw)return false;
 try{return hasPayrollSettlementActivity(JSON.parse(raw))}catch{return true}
}
