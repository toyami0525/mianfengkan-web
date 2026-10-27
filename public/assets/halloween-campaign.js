/* The server controls publication. No client-side preview or activation override. */
(()=>{
 const host=document.getElementById('halloweenCampaign');
 if(!host)return;
 let sequence=0;
 const hide=()=>{host.hidden=true;host.replaceChildren()};
 const append=(parent,tag,className,text)=>{const element=document.createElement(tag);if(className)element.className=className;element.textContent=text;parent.append(element);return element};
 async function refresh(){
  const current=++sequence,controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
  try{
   const response=await fetch('/api/halloween-campaign',{cache:'no-store',signal:controller.signal});
   if(!response.ok)throw new Error('Campaign unavailable');
   const campaign=await response.json();
   if(current!==sequence)return;
   if(campaign.active!==true){hide();return}
   const amount=Number(campaign.threshold),limit=Number(campaign.per_day_limit);
   if(!Number.isSafeInteger(amount)||amount<=0||limit!==1||typeof campaign.title!=='string'||typeof campaign.reward_name!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(campaign.starts_on||'')||!/^\d{4}-\d{2}-\d{2}$/.test(campaign.ends_on||'')){hide();return}
   const content=document.createDocumentFragment();
   append(content,'span','mf-campaign-eyebrow','HALLOWEEN 2026');
   const heading=append(content,'h2','',campaign.title);heading.id='halloweenCampaignTitle';
   append(content,'p','mf-campaign-intro','把今夜的回憶，留在一張萬聖節限定簽繪裡。');
   const offer=append(content,'div','mf-campaign-offer','');
   append(offer,'span','','單日累計任意消費滿');
   append(offer,'strong','',amount.toLocaleString('zh-TW')+' Gil');
   append(offer,'b','','贈一張'+campaign.reward_name);
   append(content,'p','mf-campaign-dates',campaign.starts_on+' ～ '+campaign.ends_on);
   append(content,'p','mf-campaign-rules','以台北日期計算，每人每日限一張，不同日不累加。餐點、酒品、指名、拍立得與團體遊戲皆可累計；僅計已完成消費，打賞不列入。達標後請向館主領取贈品取件碼。');
   host.replaceChildren(content);host.setAttribute('aria-labelledby',heading.id);host.hidden=false;
  }catch{if(current===sequence)hide()}
  finally{clearTimeout(timeout)}
 }
 hide();void refresh();
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void refresh()});
 setInterval(()=>{if(document.visibilityState==='visible')void refresh()},60000);
})();
