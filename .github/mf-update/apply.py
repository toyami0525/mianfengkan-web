from pathlib import Path
import hashlib,base64

def edit(path,expected,replacements):
 p=Path(path);raw=p.read_bytes()
 sha=hashlib.sha1(f'blob {len(raw)}\0'.encode()+raw).hexdigest()
 assert sha==expected,(path,'unexpected source',sha)
 text=raw.decode()
 for old,new,count in replacements:
  assert text.count(old)==count,(path,'anchor count',old[:100],text.count(old),count)
  text=text.replace(old,new)
 p.write_text(text)

edit('components/AdminApp.tsx','d54e6b1da1748da6f05b2a6c6f5956e8f246fd7d',[
 ("import VenueClosureControl from '@/components/VenueClosureControl';","import VenueClosureControl from '@/components/VenueClosureControl';\nimport {linkPayrollCompanions,isPayrollCompanionLocked,hasPayrollSettlementActivity,isSavedPayrollLocked} from '@/lib/payroll-roster';",1),
 ("  const allStaff=(data.staff||[]).filter(r=>r.active!==false);\n  const ownerRow=allStaff.find(r=>String(r.id)===String(account.staff_id||''))", "  const allStaff=(data.staff||[]).filter(r=>r.active!==false);\n  if(!allStaff.length)return; // Do not erase a saved roster while profiles are still loading.\n  const ownerRow=allStaff.find(r=>String(r.id)===String(account.staff_id||''))",1),
 ("  const stored=localStorage.getItem(storageKey);\n  if(stored){", "  const stored=localStorage.getItem(storageKey);\n  const rosterLocked=isSavedPayrollLocked(localStorage.getItem(`mf-payroll-settlement:${dateKey}`));\n  if(stored){",1),
 ("     setPayrollStaffIds([...new Set(cleaned)]);return;", "     const restored=rosterLocked?[...new Set(cleaned)]:linkPayrollCompanions(cleaned,allStaff);\n     if(!rosterLocked)localStorage.setItem(storageKey,JSON.stringify(restored));\n     setPayrollStaffIds(restored);return;",1),
 ("  const unique=[...new Set(defaults)];", "  const unique=rosterLocked?[...new Set(defaults)]:linkPayrollCompanions(defaults,allStaff);",1),
 (" function savePayrollRoster(next:string[]){\n  const {ownerId}=payrollOwnerInfo();\n  const safe=[...new Set([ownerId,...next.map(String)])];", " function savePayrollRoster(next:string[]){\n  if(account?.role!=='owner'||isSavedPayrollLocked(localStorage.getItem(`mf-payroll-settlement:${businessDateKey(new Date())}`)))return;\n  const {ownerId}=payrollOwnerInfo();\n  const safe=linkPayrollCompanions([ownerId,...next.map(String)],data.staff||[]);",1),
 ("  if(String(id)===ownerId)return;", "  if(String(id)===ownerId||isPayrollCompanionLocked(String(id),payrollStaffIds,data.staff||[]))return;",1),
 ("  setMsg('本營業日薪資結算已重設。');", "  savePayrollRoster(payrollStaffIds);\n  setMsg('本營業日薪資結算已重設。');",1),
 ("name:String(r.name||'未命名館員'),isOwner:String(r.id)===ownerPayrollId", "name:String(r.name||'未命名館員'),role:String(r.role||'館員'),isOwner:String(r.id)===ownerPayrollId",1),
 ("name:account.staff_name||'館主',isOwner:true", "name:account.staff_name||'館主',role:'館主',isOwner:true",1),
 (" const payrollHasSettlementActivity=payrollSettledIds.size>0||payrollDistributedFood>0;", " const payrollHasSettlementActivity=hasPayrollSettlementActivity(payrollSettlement);",1),
 ("disabled={person.isOwner||payrollHasSettlementActivity}", "disabled={person.isOwner||payrollHasSettlementActivity||isPayrollCompanionLocked(person.id,payrollStaffIds,activeStaff)}",1),
 ("person.isOwner?'館主・固定計入':payrollSettledIds.has(person.id)?'館員・已結算':'館員'", "person.isOwner?'館主・固定計入':payrollSettledIds.has(person.id)?`${person.role}・已結算`:isPayrollCompanionLocked(person.id,payrollStaffIds,activeStaff)?`${person.role}・隨愛梨勾選`:person.role",1),
 ("館主固定計入。基本薪資固定為 150,000 Gil；", "館主固定計入。勾選愛梨時會一併勾選御用攝影師梓梓獸；荻野千尋、琥珀川白龍可各別勾選。既有已結算名單不會自動更動，需要調整請先重設本日結算。基本薪資固定為 150,000 Gil；",1),
])

photographer='''        ${row.slug === 'airi' ? `<button type="button" class="photographer-photo" data-photo aria-label="放大御用攝影師梓梓獸的照片"><img src="assets/images/staff-zizishou-20261014.avif" alt="御用攝影師・梓梓獸" width="640" height="360" loading="lazy" decoding="async"><span class="photographer-caption"><small>御用攝影師</small><strong>梓梓獸</strong></span></button>` : ''}
'''
edit('public/assets/staff-directory.js','26711eb1ca4af6f114d80365bb5b32fcac422288',[
 ('        <div class="nameplate">',photographer+'        <div class="nameplate">',1),
 ("    if (houseCat) setupViewer(houseCat);", "    if (houseCat) setupViewer(houseCat);\n    const performers = document.getElementById('performers-panel');\n    if (performers) setupViewer(performers);",1),
])

performers='''
<section id="performers-panel" class="staff-directory-panel" role="tabpanel" aria-labelledby="performers-tab" hidden>
  <header class="performers-heading"><h2>演奏家</h2><p>MUSICIANS OF MIANFENGKAN</p></header>
  <article class="performers-profile" aria-label="荻野千尋與琥珀川白龍">
    <button type="button" class="performers-photo" data-photo aria-label="放大荻野千尋與琥珀川白龍的合照"><img src="assets/images/performers-chihiro-haku-20261014.avif" alt="演奏家・荻野千尋與琥珀川白龍合照" width="1100" height="619" loading="lazy" decoding="async"><span class="performers-photo-hint" aria-hidden="true">點擊查看合照</span></button>
    <div class="performers-names"><div id="ogino-chihiro"><p>演奏家</p><h3>荻野千尋</h3></div><div id="kohakugawa-haku"><p>演奏家</p><h3>琥珀川白龍</h3></div></div>
  </article>
</section>
'''
edit('public/staff.html','a92b2dfd8c0a9d8b66c7d7837a4a1362ef7605bf',[
 ('</head>','<link rel="stylesheet" href="assets/staff-support.css?v=20261014">\n</head>',1),
 ('    <button type="button" class="staff-directory-tab" id="house-cat-tab"', '    <button type="button" class="staff-directory-tab" id="performers-tab" role="tab" aria-controls="performers-panel" aria-selected="false" tabindex="-1">演奏家</button>\n    <button type="button" class="staff-directory-tab" id="house-cat-tab"',1),
 ('\n<section id="house-cat-panel"',performers+'\n<section id="house-cat-panel"',1),
 ('assets/house-cat.js?v=20260924','assets/house-cat.js?v=20261014',1),
 ('assets/staff-directory.js?v=20261010-airi-quote-photos','assets/staff-directory.js?v=20261014',1),
])
edit('public/assets/house-cat.js','e857bf6382099dd22f30c9a8de5c8c16e728afba',[
 ("const hash = tab.id === 'house-cat-tab' ? '#house-cat' : '';", "const hash = tab.id === 'house-cat-tab' ? '#house-cat' : tab.id === 'performers-tab' ? '#performers' : '';",1),
 ("selectTab(tabs.find(tab => tab.id === 'house-cat-tab' && window.location.hash === '#house-cat') || tabs[0]);", "const hash = window.location.hash;\n    const id = hash === '#house-cat' ? 'house-cat-tab' : ['#performers','#ogino-chihiro','#kohakugawa-haku'].includes(hash) ? 'performers-tab' : 'staff-directory-tab';\n    selectTab(tabs.find(tab => tab.id === id) || tabs[0]);",1),
])

for prefix,name,digest in [
 ('zizi','staff-zizishou-20261014.avif','be976db2bae63f3cbf87b8ac7819e228e41e2b753c8232c815d1e28530b77408'),
 ('performers','performers-chihiro-haku-20261014.avif','e9da092f595e0aa106b6366fa8ff87904869a8f99c12820702809e719e15d6fd')]:
 parts=sorted(Path('.github/mf-update/assets').glob(prefix+'.*.txt'))
 assert parts,'missing image source'
 data=base64.b64decode(''.join(p.read_text().strip() for p in parts),validate=True)
 assert hashlib.sha256(data).hexdigest()==digest,('image checksum',name)
 Path('public/assets/images',name).write_bytes(data)
print('Exact source edits applied; both uploaded-photo checksums verified.')
