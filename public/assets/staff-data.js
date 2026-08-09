const MF_DEFAULT_STAFF = [
  {
    slug:'riku',name:'羽鶴璃久',role:'館主',
    quote:'「歡迎蒞臨『眠楓館』，由衷希望旅人們能在這裡洗去旅途的疲憊。」',
    bio:'看著安靜且雅緻氣質的龍娘（其實很怕生），負責館內整體接待與營運。偶爾會以不同模樣出現在館內，卻總能讓來訪的旅人安心落座。',
    services:['接待','餐食'],
    photo_primary:'assets/images/staff-riku-01.webp',photo_secondary:'assets/images/staff-riku-02.webp',
    sort_order:10,active:true
  },
  {
    slug:'wei',name:'微',role:'館員／看板娘',
    quote:'「小璃！錢錢！沒有……加薪！～加薪！～」',
    bio:'館主的義姊、貪吃鬼，也是眠楓館的可愛擔當。活潑好動，實際上卻十分體貼溫柔，總能讓館內氣氛變得輕鬆愉快。',
    services:['泡湯搓澡','按摩','枕邊談心'],
    photo_primary:'assets/images/staff-wei-01.webp',photo_secondary:'assets/images/staff-wei-02.webp',
    sort_order:20,active:true
  },
  {
    slug:'musufiru',name:'慕斯菲露',role:'館員',
    quote:'「旅人似浮雲，入館坐一席。至於這片刻怎麼過，客倌可得小心交給我。」',
    bio:'古典為底，玩心作陪，風雅是外衣，小小捉弄是藏不住的餘興。待客從容，卻不愛過分奉承，若肯配合一點，這段時光大概會很有趣。',
    services:['泡湯搓澡','按摩','枕邊談心','小遊戲','拍立得'],
    photo_primary:'assets/images/staff-musufiru-01.webp',photo_secondary:'assets/images/staff-musufiru-02.webp',
    sort_order:30,active:true
  },
  {
    slug:'yukinoji-hakari',name:'雪之寺羽狩',role:'館員',
    quote:'「活殺自在、地之印、人之印、冰晶亂流之術！客人，還有哪裡需要加強嗎？……客、客人？」',
    bio:'黃金港忍者部隊退役的優閒忍者，沒事就會參與狩獵怪物的傭兵招募，最喜歡的事情是揮舞雙刃享受戰鬥，今天也會用25萬的傷害給客人的雙肩來上一場華麗的按摩。',
    services:['泡湯搓澡','按摩','枕邊談心','拍立得'],
    photo_primary:'assets/images/staff-yukinoji-01.webp',photo_secondary:'assets/images/staff-yukinoji-02.webp',
    sort_order:40,active:true
  },
  {
    slug:'hong-hong-hong-taidafeng',name:'轟轟轟太大風',role:'館員',
    quote:'「觀迎光臨～又辛苦一天了呢～今天要先進餐～？先泡澡～？還是……全都要～？$$$」',
    bio:'異國的敖龍少女，言語相似亦相異，煩請各位客人稍等少女組織言語呢。遠似冰，近似火，深愛恐怖亦疼愛可愛。以反差為萌點（自稱）的敖龍少女期待與各位客人在眠楓館共創美好回憶。',
    services:['泡湯搓澡','按摩','枕邊談心'],
    photo_primary:'assets/images/staff-hong-01.webp',photo_secondary:'assets/images/staff-hong-02.webp',
    sort_order:50,active:true
  },
  {
    slug:'grin',name:'格林',role:'館員',
    quote:'「若您不介意，還請在停留於溫泉會館的時光裡，與我分享屬於您的故事。」',
    bio:'出身不明的敖龍族少女，於和風溫泉會館工作。喜歡閱讀與寫作，總將旅人的故事悄悄收藏進字裡行間。性格如小狗般黏人，害怕寂寞，也害怕被拋棄，總是容易紅了眼眶。',
    services:['泡湯搓澡','按摩','枕邊談心'],
    photo_primary:'assets/images/staff-grin-01.webp',photo_secondary:'assets/images/staff-grin-02.webp',
    sort_order:60,active:true
  }
  ,{
    slug:'shenaixue',name:'神噯雪',role:'館員',
    quote:'「如果在艾歐澤亞發現了性感辣妹的話，記得向我匯報！！」',
    bio:'我是拳聖・哈蒙，對你非常信任，因此有一事相求！',
    services:['枕邊談心'],
    photo_primary:'assets/images/staff-shenaixue-01.webp',photo_secondary:'assets/images/staff-shenaixue-02.webp',
    sort_order:70,active:true
  },
  {
    slug:'zixuan',name:'子瑄',role:'館員',
    quote:'「今晚也請讓瑄瑄陪您度過一段放鬆又溫暖的時光 喵♡」',
    bio:'一隻喜歡閃亮亮收藏品的小貓，總是會被漂亮的東西吸引走。\n\n如今在一間靜謐的日式湯屋擔任招待，喜歡替每位旅人準備暖暖的湯泉與放鬆的時光。輕柔的水聲、淡淡的木香，都是瑄瑄最喜歡的日常。\n\n雖然偶爾有些迷糊，卻總會帶著笑容迎接每一位來訪的主人。\n\n願每位踏入湯屋的旅人，都能卸下疲憊，在溫暖的湯屋時光中放鬆身心，帶著笑容離開。',
    services:['泡湯搓澡','按摩','枕邊談心'],
    photo_primary:'assets/images/staff-zixuan-01.webp',photo_secondary:'assets/images/staff-zixuan-02.webp',
    sort_order:80,active:true
  }
  ,{
    slug:'feitong',name:'緋瞳',role:'館員',
    quote:'「呀齁～♥   就看我咻咻地把顧客您的不開心、不舒服全部都解決掉吧！嘻嘻 ✧*｡٩( ꈍᴗꈍ)و 猛擊！星遁天珠！、猛擊！星遁天珠！、猛擊！星遁天珠！」',
    bio:'十分年幼的敖龍族孩子，元氣十足、總是蹦蹦跳跳的，對於任何事情都有著強烈的好奇心～ 其中最喜歡穿搭．．．以及．．．噓～不可以在這裡說 ♥ 個性古靈精怪，偶爾還有些調皮搗蛋，但絕對！絕對！是個好孩子唷 ！',
    services:['泡湯搓澡','按摩','枕邊談心'],
    photo_primary:'assets/images/staff-feitong-01.webp',photo_secondary:'assets/images/staff-feitong-02.webp',
    sort_order:90,active:true
  }


];
function mfEsc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function tagClass(x){return {'接待':'service-reception','餐食':'service-food','泡湯':'service-bath','泡湯搓澡':'service-bath','按摩':'service-massage','按摩服務':'service-massage','枕邊談心':'service-talk','耳語陪伴':'service-talk','小遊戲':'service-game','拍立得':'service-polaroid'}[x]||''}
function staffCard(x,i){
 const reverse=i%2===1?' host-card-reverse':'';
 const visual=x.photo_primary?`<div class="host-visual host-photo"><img class="host-photo-main" src="${mfEsc(x.photo_primary)}" alt="${mfEsc(x.name)}館員照">${x.photo_secondary?`<figure class="host-photo-secondary"><img src="${mfEsc(x.photo_secondary)}" alt="${mfEsc(x.name)}第二張館員照"></figure>`:''}<div class="host-nameplate"><small>${mfEsc(x.role||'館員')}</small><strong>${mfEsc(x.name)}</strong></div></div>`:`<div class="host-visual host-pink"><span class="host-monogram">${mfEsc((x.name||'楓').slice(0,1))}</span><div class="host-nameplate"><small>${mfEsc(x.role||'館員')}</small><strong>${mfEsc(x.name)}</strong></div></div>`;
 return `<article class="host-card${reverse}">${visual}<div class="host-content"><span class="host-number">${['壱','弐','参','肆','伍','陸','柒','捌'][i]||String(i+1)}</span><p class="host-role">${mfEsc(x.role||'館員')}</p><h2>${mfEsc(x.name)}</h2><p class="host-quote">${mfEsc(x.quote||'')}</p><p class="host-bio">${mfEsc(x.bio||'')}</p><div class="host-services"><p class="host-services-title">提供服務</p><div class="host-tags">${(x.services||[]).map(t=>`<span class="${tagClass(t)}">${mfEsc(t)}</span>`).join('')}</div></div></div></article>`;
}
async function loadStaff(){
 let rows=MF_DEFAULT_STAFF;
 const cfg=window.MF_CONFIG||{};
 if(cfg.supabaseUrl&&cfg.supabaseAnonKey&&window.supabase){
   try{
     const client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
     const {data,error}=await client.from('staff').select('*').eq('active',true).order('sort_order');
     if(error)throw error;
     if(data?.length){
       const localBySlug=Object.fromEntries(MF_DEFAULT_STAFF.map(x=>[x.slug,x]));
       rows=data
         .filter(x=>localBySlug[x.slug])
         .map(x=>{
           const local=localBySlug[x.slug];
           return {
             ...local,
             ...x,
             services:Array.isArray(x.services)&&x.services.length?x.services:local.services,
             photo_primary:local.photo_primary,
             photo_secondary:local.photo_secondary
           };
         });
       const present=new Set(rows.map(x=>x.slug));
       rows.push(...MF_DEFAULT_STAFF.filter(x=>!present.has(x.slug)));
       rows.sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
     }
   }catch(e){console.warn('使用內建館員資料：',e.message)}
 }
 document.getElementById('staffList').innerHTML=rows.map(staffCard).join('')+`<article class="coming-card"><div class="coming-leaf">楓</div><span class="eyebrow">COMING SOON</span><h2>敬請期待</h2><p>新的館員正在準備與各位旅人見面。</p><div class="coming-line"></div><small>眠楓館 館員名錄</small></article>`;
}
document.addEventListener('DOMContentLoaded',loadStaff);
