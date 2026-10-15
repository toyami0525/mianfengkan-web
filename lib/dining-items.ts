export const FOOD_PRICES: Record<string, number> = {
  '蛋包飯':7000,'扇貝咖哩':9000,'加雷馬披薩':9000,'醬炒飯':7000,'懸掛番茄沙拉':9000,'羊駝奶油麵':7000,'犎牛牛排':15000,
  '圓扇刺刺梨蛋糕':6000,'巧克力奶油蛋糕':6000,'白桃塔':8000,'蜂蜜牛角麵包':8000,'烏雞布丁':8000,
  '奶油熱巧克力':5000,'蜜瓜果汁':7000,'白桃汁':7000,'抹茶':7000,'路易波士紅茶':7000,
};
export const FOOD_CATEGORIES: Record<string, string> = {
  '蛋包飯':'主食',  '扇貝咖哩':'主食',  '加雷馬披薩':'主食',  '醬炒飯':'主食',  '懸掛番茄沙拉':'主食',  '羊駝奶油麵':'主食',  '犎牛牛排':'主食',  '圓扇刺刺梨蛋糕':'甜點',  '巧克力奶油蛋糕':'甜點',  '白桃塔':'甜點',  '蜂蜜牛角麵包':'甜點',  '烏雞布丁':'甜點',  '奶油熱巧克力':'飲品',  '蜜瓜果汁':'飲品',  '白桃汁':'飲品',  '抹茶':'飲品',  '路易波士紅茶':'飲品'
};
export const LIQUOR_PRICES: Record<string, number> = {
  '純米酒・宵紅葉':15000,
  '純米吟釀・月白':15000,
  '本釀造・青嵐':15000,
  '生酒・夢紫':15000,
  '梅酒・金梅':15000,
};
export const LIQUOR_LIMIT = 2;

export class DiningInputError extends Error {}
export type DiningItem={name:string;qty:number;price:number};
/** No per-item business cap. Reject unsafe arithmetic instead of silently clamping quantities. */
export function parseDiningItems(raw:unknown){
 if(!Array.isArray(raw))throw new DiningInputError('請選擇餐點或酒品');
 const byName=new Map<string,DiningItem>();
 const catalog={...FOOD_PRICES,...LIQUOR_PRICES};
 for(const value of raw){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new DiningInputError('餐點格式不正確');
  const name=value.name;
  if(typeof name!=='string'||!Object.prototype.hasOwnProperty.call(catalog,name))throw new DiningInputError('餐點品項不正確，請重新整理菜單');
  const qty=value.qty===undefined?1:value.qty;
  if(typeof qty!=='number'||!Number.isSafeInteger(qty)||qty<0)throw new DiningInputError('餐點數量請輸入 0 或正整數');
  if(qty===0)continue;
  const combined=qty+(byName.get(name)?.qty||0),price=catalog[name];
  if(!Number.isSafeInteger(combined)||!Number.isSafeInteger(combined*price))throw new DiningInputError('餐點數量過大，請分筆送出');
  byName.set(name,{name,qty:combined,price});
 }
 const items=[...byName.values()];
 if(!items.length)throw new DiningInputError('請至少選擇一份餐點或一瓶酒品');
 const mealItems=items.filter(item=>Object.prototype.hasOwnProperty.call(FOOD_PRICES,item.name));
 const liquorItems=items.filter(item=>Object.prototype.hasOwnProperty.call(LIQUOR_PRICES,item.name));
 const liquorCount=liquorItems.reduce((sum,item)=>sum+item.qty,0);
 if(liquorCount>LIQUOR_LIMIT)throw new DiningInputError(`每次點餐酒品合計最多 ${LIQUOR_LIMIT} 瓶`);
 const foodTotal=mealItems.reduce((sum,item)=>sum+item.price*item.qty,0);
 const liquorTotal=liquorItems.reduce((sum,item)=>sum+item.price*item.qty,0);
 if(!Number.isSafeInteger(foodTotal+liquorTotal))throw new DiningInputError('餐點金額過大，請分筆送出');
 return {items,foodTotal,liquorTotal,liquorCount};
}
