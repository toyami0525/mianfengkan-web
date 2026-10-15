/** Airi's queue products; never use prices submitted by a browser. */
export const AIRI_CHAT = '談天說地';
export const AIRI_SIGNED = '簽繪拍立得';
export const AIRI_COMBO = '談天說地＋簽繪拍立得';
export const AIRI_SERVICE_NAMES = [AIRI_CHAT, AIRI_SIGNED, AIRI_COMBO];
export type AiriService = {name:string;price:number;original_price:number;pickup:boolean};
export function airiServiceSelection(names:string[]):AiriService|null {
 const unique=[...new Set(names)];
 // Selecting the two single services together receives the same bundle discount.
 const name=unique.length===2&&unique.includes(AIRI_CHAT)&&unique.includes(AIRI_SIGNED)
   ? AIRI_COMBO : unique.length===1?unique[0]:null;
 if(name===AIRI_CHAT)return {name,price:150000,original_price:150000,pickup:false};
 if(name===AIRI_SIGNED)return {name,price:300000,original_price:300000,pickup:true};
 if(name===AIRI_COMBO)return {name,price:400000,original_price:450000,pickup:true};
 return null;
}
