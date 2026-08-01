(async function(){
 try{
  const response=await fetch('/api/site-content',{cache:'no-store'});
  if(!response.ok)return;
  const settings=await response.json();
  const venue=settings.venue||{},homepage=settings.homepage||{},rules=settings.rules;
  document.querySelectorAll('.brand strong').forEach(el=>{if(venue.name)el.textContent=venue.name});
  const homeTitle=document.querySelector('.home-logo h1');if(homeTitle&&venue.name)homeTitle.textContent=venue.name;
  const tagline=document.querySelector('.home-logo .tagline');if(tagline&&homepage.tagline)tagline.textContent=homepage.tagline;
  const services=document.querySelector('.home-logo .services');if(services&&homepage.services_text)services.textContent=homepage.services_text;
  const address=document.querySelector('.home-drawer .address');
  if(address){const lines=['FF14 繁中版'+(venue.address?'｜'+venue.address:''),venue.business_hours||''].filter(Boolean);if(venue.business_status==='closed')lines.unshift('今日休館');if(venue.business_status==='preparing')lines.unshift('準備中');address.innerHTML=lines.join('<br>')}
  if(Array.isArray(rules)&&rules.length){
   const box=document.querySelector('.rules');
   if(box)box.innerHTML=rules.map(rule=>`<article class="rule"><div><h2>${escapeHtml(rule.title||'')}</h2><p>${escapeHtml(rule.content||'')}</p></div></article>`).join('');
  }
 }catch(error){console.warn('網站設定載入失敗',error)}
 function escapeHtml(value){return String(value).replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]))}
})();
