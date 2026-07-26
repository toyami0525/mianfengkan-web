
const MF_DEFAULT_STAFF = [
  {slug:'riku',name:'羽鶴璃久',role:'館主',quote:'「歡迎回來。願眠楓館，替您洗去旅途的疲憊。」',bio:'有著安靜而雅緻氣質的龍娘，負責館內整體接待與營運。偶爾會以不同模樣出現在館內，卻總能讓來訪的旅人安心落座。',services:['接待','餐食'],photo_primary:'assets/images/staff-riku-01.webp',photo_secondary:'assets/images/staff-riku-02.webp',sort_order:10,enabled:true},
  {slug:'wei',name:'微',role:'館員／看板娘',quote:'「小璃～加薪！～我要加薪～！」',bio:'店長的義姊、貪吃鬼，也是眠楓館的可愛擔當。雖然活潑好動，實際上卻十分體貼溫柔，總能讓館內氣氛變得輕鬆。',services:['接待','餐食','泡湯','按摩','枕邊談心'],photo_primary:'assets/images/staff-wei-01.webp',photo_secondary:'assets/images/staff-wei-02.webp',sort_order:20,enabled:true},
  {slug:'hanagata',name:'花形',role:'館員',quote:'一席之間，自有花香。',bio:'個人介紹與擅長服務將於後續公開。請期待她在眠楓館與各位旅人正式見面的那一天。',services:['接待','餐食','泡湯','按摩','枕邊談心'],photo_primary:'',photo_secondary:'',sort_order:30,enabled:true}
];
function mfEsc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function tagClass(x){return {'接待':'service-reception','餐食':'service-food','泡湯':'service-bath','按摩':'service-massage','枕邊談心':'service-talk','耳語陪伴':'service-talk'}[x]||''}
function staffCard(x,i){
 const reverse=i%2===1?' host-card-reverse':'';
 const visual=x.photo_primary?`<div class="host-visual host-photo"><img class="host-photo-main" src="${mfEsc(x.photo_primary)}" alt="${mfEsc(x.name)}館員照">${x.photo_secondary?`<figure class="host-photo-secondary"><img src="${mfEsc(x.photo_secondary)}" alt="${mfEsc(x.name)}第二張館員照"></figure>`:''}<div class="host-nameplate"><small>${mfEsc(x.role||'館員')}</small><strong>${mfEsc(x.name)}</strong></div></div>`:`<div class="host-visual host-pink"><span class="host-monogram">${mfEsc((x.name||'楓').slice(0,1))}</span><div class="host-nameplate"><small>${mfEsc(x.role||'館員')}</small><strong>${mfEsc(x.name)}</strong></div></div>`;
 return `<article class="host-card${reverse}">${visual}<div class="host-content"><span class="host-number">${['壱','弐','参','肆','伍','陸','柒','捌'][i]||String(i+1)}</span><p class="host-role">${mfEsc(x.role||'館員')}</p><h2>${mfEsc(x.name)}</h2><p class="host-quote">${mfEsc(x.quote||'')}</p><p class="host-bio">${mfEsc(x.bio||'')}</p><div class="host-services"><p class="host-services-title">提供服務</p><div class="host-tags">${(x.services||[]).map(t=>`<span class="${tagClass(t)}">${mfEsc(t)}</span>`).join('')}</div></div></div></article>`;
}
async function loadStaff(){
 let rows=MF_DEFAULT_STAFF;
 const cfg=window.MF_CONFIG||{};
 if(cfg.supabaseUrl&&cfg.supabaseAnonKey&&window.supabase){
   try{const client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);const {data,error}=await client.from('staff').select('*').eq('enabled',true).order('sort_order');if(error)throw error;if(data?.length)rows=data;}catch(e){console.warn('使用內建館員資料：',e.message)}
 }
 document.getElementById('staffList').innerHTML=rows.map(staffCard).join('')+`<article class="coming-card"><div class="coming-leaf">楓</div><span class="eyebrow">COMING SOON</span><h2>敬請期待</h2><p>新的館員正在準備與各位旅人見面。</p><div class="coming-line"></div><small>眠楓館 館員名錄</small></article>`;
}
document.addEventListener('DOMContentLoaded',loadStaff);
