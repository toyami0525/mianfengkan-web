const menuBtn=document.querySelector('.menu-btn');const navLinks=document.querySelector('.nav-links');
menuBtn?.addEventListener('click',()=>{const open=navLinks.classList.toggle('open');menuBtn.setAttribute('aria-expanded',String(open))});
navLinks?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>navLinks.classList.remove('open')));
function toast(msg){const el=document.querySelector('.toast');if(!el)return;el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2200)}


// v2.8.0：所有公開頁面自動加入「排班月曆」入口。
(()=>{const nav=document.querySelector('.nav-links');if(!nav||nav.querySelector('a[href="schedule.html"]'))return;const a=document.createElement('a');a.href='schedule.html';a.textContent='排班月曆';if(location.pathname.endsWith('/schedule.html')||location.pathname.endsWith('schedule.html'))a.classList.add('active');const locationLink=nav.querySelector('a[href="location.html"]');if(locationLink)nav.insertBefore(a,locationLink);else{const reserve=nav.querySelector('.reserve-link');reserve?nav.insertBefore(a,reserve):nav.appendChild(a)}})();


// v2.8.11：所有公開頁面自動加入「VIP 貴客榜」入口。
(()=>{const nav=document.querySelector('.nav-links');if(!nav||nav.querySelector('a[href="vip.html"]'))return;const a=document.createElement('a');a.href='vip.html';a.textContent='VIP 貴客榜';if(location.pathname.endsWith('/vip.html')||location.pathname.endsWith('vip.html'))a.classList.add('active');const locationLink=nav.querySelector('a[href="location.html"]');if(locationLink)nav.insertBefore(a,locationLink);else{const reserve=nav.querySelector('.reserve-link');reserve?nav.insertBefore(a,reserve):nav.appendChild(a)}})();

// v2.8.9：全站 Discord 浮動連結圖標（從館主後台 venue.discord 讀取）
(async()=>{
 if(document.getElementById('mianfengkan-discord-link'))return;
 try{
  const response=await fetch('/api/site-content',{cache:'no-store'});
  if(!response.ok)return;
  const settings=await response.json();
  const raw=String(settings?.venue?.discord||'').trim();
  const href=normalizeDiscordUrl(raw);
  if(!href)return;
  mountDiscordLink(href);
 }catch(error){console.warn('Discord 連結載入失敗',error)}
 function normalizeDiscordUrl(value){
  if(!value)return'';
  let url=value;
  if(/^discord\.gg\//i.test(url)||/^discord\.com\//i.test(url)||/^www\.discord\.com\//i.test(url))url='https://'+url;
  try{const parsed=new URL(url);if(!/^https?:$/.test(parsed.protocol))return'';return parsed.href}catch{return''}
 }
 function mountDiscordLink(href){
  if(document.getElementById('mianfengkan-discord-link'))return;
  if(!document.getElementById('mianfengkan-discord-style')){
   const style=document.createElement('style');style.id='mianfengkan-discord-style';style.textContent=`
    #mianfengkan-discord-link{position:fixed;left:22px;bottom:22px;z-index:90;width:54px;height:54px;border-radius:50%;display:grid;place-items:center;color:#fff;background:linear-gradient(145deg,rgba(38,29,43,.96),rgba(22,18,29,.96));border:1px solid rgba(223,177,112,.62);box-shadow:0 10px 30px rgba(0,0,0,.34),0 0 0 4px rgba(119,72,95,.10);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);transition:transform .22s ease,box-shadow .22s ease,border-color .22s ease;text-decoration:none}
    #mianfengkan-discord-link:hover{transform:translateY(-3px) scale(1.04);border-color:rgba(239,194,126,.92);box-shadow:0 14px 36px rgba(0,0,0,.42),0 0 0 5px rgba(141,79,105,.16)}
    #mianfengkan-discord-link:focus-visible{outline:2px solid #f0c98d;outline-offset:4px}
    #mianfengkan-discord-link svg{width:29px;height:29px;display:block;filter:drop-shadow(0 2px 6px rgba(0,0,0,.22))}
    #mianfengkan-discord-link .mf-dc-tip{position:absolute;left:64px;white-space:nowrap;padding:7px 10px;border-radius:9px;background:rgba(18,14,20,.94);border:1px solid rgba(223,177,112,.28);color:#f8efe4;font:12px/1.2 sans-serif;letter-spacing:.06em;opacity:0;transform:translateX(-5px);pointer-events:none;transition:.18s}
    #mianfengkan-discord-link:hover .mf-dc-tip,#mianfengkan-discord-link:focus-visible .mf-dc-tip{opacity:1;transform:none}
    @media(max-width:700px){#mianfengkan-discord-link{left:14px;bottom:14px;width:48px;height:48px}#mianfengkan-discord-link svg{width:26px;height:26px}#mianfengkan-discord-link .mf-dc-tip{display:none}}
   `;document.head.appendChild(style)
  }
  const a=document.createElement('a');a.id='mianfengkan-discord-link';a.href=href;a.target='_blank';a.rel='noopener noreferrer';a.setAttribute('aria-label','加入眠楓館 Discord');a.title='加入眠楓館 Discord';
  a.innerHTML=`<svg viewBox="0 0 64 64" aria-hidden="true" fill="none"><path fill="currentColor" d="M20.2 18.5c7.7-3.1 15.9-3.1 23.6 0 5.7 8.4 7.1 16.5 6.3 24.4-5.2 3.9-10.2 6-15.1 6.9l-3-4.1c1.8-.5 3.6-1.1 5.3-2-8.1 3.7-18.1 3.7-26.2 0 1.7.9 3.5 1.5 5.3 2l-3 4.1C8.5 48.9 3.5 46.8-1.7 42.9c-.8-7.9.6-16 6.3-24.4 4.2-1.7 8.4-2.7 12.6-3.1l1.5 2.9c.5-.1 1-.2 1.5-.3Zm-3.4 16.9c0 3.5 2.5 6.3 5.6 6.3s5.6-2.8 5.6-6.3-2.5-6.3-5.6-6.3-5.6 2.8-5.6 6.3Zm19.2 0c0 3.5 2.5 6.3 5.6 6.3s5.6-2.8 5.6-6.3-2.5-6.3-5.6-6.3-5.6 2.8-5.6 6.3Z" transform="translate(7 0) scale(.82)"/></svg><span class="mf-dc-tip">Discord｜加入眠楓館</span>`;
  document.body.appendChild(a)
 }
})();
