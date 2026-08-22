const menuBtn=document.querySelector('.menu-btn');const navLinks=document.querySelector('.nav-links');
menuBtn?.addEventListener('click',()=>{const open=navLinks.classList.toggle('open');menuBtn.setAttribute('aria-expanded',String(open))});
navLinks?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>navLinks.classList.remove('open')));
function toast(msg){const el=document.querySelector('.toast');if(!el)return;el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2200)}


// v2.8.0：所有公開頁面自動加入「排班月曆」入口。
(()=>{const nav=document.querySelector('.nav-links');if(!nav||nav.querySelector('a[href="schedule.html"]'))return;const a=document.createElement('a');a.href='schedule.html';a.textContent='排班月曆';if(location.pathname.endsWith('/schedule.html')||location.pathname.endsWith('schedule.html'))a.classList.add('active');const locationLink=nav.querySelector('a[href="location.html"]');if(locationLink)nav.insertBefore(a,locationLink);else{const reserve=nav.querySelector('.reserve-link');reserve?nav.insertBefore(a,reserve):nav.appendChild(a)}})();
