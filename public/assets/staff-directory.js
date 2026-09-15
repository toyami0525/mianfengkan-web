/* 館員介紹的兩欄版；僅更新展示資料，不新增資料庫館員／登入帳號／指名項目。 */
(() => {
  'use strict';
  if (typeof MF_DEFAULT_STAFF === 'undefined' || !Array.isArray(MF_DEFAULT_STAFF)) return;
  if (typeof window.loadStaff === 'function') {
    document.removeEventListener('DOMContentLoaded', window.loadStaff);
  }

  const local = MF_DEFAULT_STAFF.map(row => ({ ...row, services: [...(row.services || [])] }));
  const owner = local.find(row => row.slug === 'riku');
  if (!owner) return;
  owner.photo_primary = 'assets/images/staff-riku-20260915-01.jpg';
  owner.photo_secondary = 'assets/images/staff-riku-20260915-02.jpg';
  const deputy = {
    slug: 'croseviel', name: '克羅塞維爾', role: '副館主',
    bio: '一身深色和服，一頂熟悉的禮帽。待人周到、偶爾帶些戲謔的副館主，總能從容照看館內大小事。只是，那舉杯與低語的姿態，難免令人似曾相識——至於換一身衣裳後的故事，他笑而不語。',
    quote: '「在哪看過我？呵～美麗的女士，這份疑問……不妨等到午夜鐘聲過後再來驗證　如何～？」',
    services: [...owner.services],
    photo_primary: 'assets/images/staff-croseviel-01.jpg',
    photo_secondary: 'assets/images/staff-croseviel-02.jpg',
    sort_order: 15, active: true
  };
  const previousDeputy = local.findIndex(row => row.slug === deputy.slug);
  if (previousDeputy >= 0) local[previousDeputy] = deputy;
  else local.push(deputy);

  const focus = {
    riku: ['50% 40%', '50% 36%'],
    croseviel: ['45% 37%', '50% 39%'],
    wei: ['50% 24%', '50% 30%'],
    musufiru: ['50% 40%', '50% 30%'],
    'yukinoji-hakari': ['13% 36%', '31% 34%'],
    sai: ['45% 40%', '45% 30%']
  };
  const esc = (value = '') => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  function card(row, index, leader = false) {
    const position = focus[row.slug] || ['50% 36%', '50% 34%'];
    const services = Array.isArray(row.services) ? row.services : [];
    const primary = row.photo_primary;
    const secondary = row.photo_secondary;
    return `<article class="mf-staff-card${leader ? ' lead' : ''}${services.length ? ' has-services' : ''}" id="${esc(row.slug)}" style="--main-position:${position[0]};--inset-position:${position[1]}">
      <div class="photo-area">
        ${primary ? `<button type="button" class="photo-main-button" data-photo aria-label="放大${esc(row.name)}的主照片"><img class="photo-main" src="${esc(primary)}" alt="${esc(row.name)}主照片" decoding="async"${leader ? '' : ' loading="lazy"'}></button>` : '<div class="photo-placeholder" aria-hidden="true">楓</div>'}
        ${secondary ? `<button type="button" class="photo-inset" data-photo aria-label="放大${esc(row.name)}的小照片"><img src="${esc(secondary)}" alt="${esc(row.name)}第二張照片" decoding="async"${leader ? '' : ' loading="lazy"'}></button>` : ''}
        <div class="nameplate"><p>${esc(row.role || '館員')}</p><h2>${esc(row.name)}</h2></div>
        <span class="photo-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
      </div>
      <div class="staff-copy"><p class="quote">${esc(row.quote || '')}</p><p class="bio">${esc(row.bio || '')}</p>
        ${services.length ? `<div class="services"><span class="services-label">提供服務</span>${services.map(service => `<span class="service" data-type="${esc(service)}">${esc(service)}</span>`).join('')}</div>` : ''}
      </div>
    </article>`;
  }

  function render(rows) {
    const list = document.getElementById('staffList');
    if (!list) return;
    const main = rows.find(row => row.slug === 'riku') || owner;
    // 副館主的展示項目跟隨本次實際顯示的館主項目，但不寫入指名／帳號系統。
    const vice = { ...deputy, services: [...(main.services || [])] };
    const others = rows.filter(row => row.slug !== 'riku' && row.slug !== 'croseviel')
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    list.className = 'mf-staff-directory';
    list.innerHTML = `<section class="pair-grid leadership" aria-label="館主與副館主">${card(main, 0, true)}${card(vice, 1, true)}</section>
      <div class="section-heading"><h2>館員名錄</h2><span>THE PEOPLE OF MIANFENGKAN</span></div>
      <section class="pair-grid gallery" aria-label="館員名錄">${others.map((row, i) => card(row, i + 2)).join('')}
        <article class="mf-staff-card coming"><span class="seal" aria-hidden="true">楓</span><span class="eyebrow">COMING SOON</span><h2>敬請期待</h2><p>新的館員正在準備與各位旅人見面。</p></article>
      </section>`;
    setupViewer(list);
  }

  function setupViewer(list) {
    let dialog = document.getElementById('mf-staff-photo-viewer');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'mf-staff-photo-viewer';
      dialog.className = 'mf-staff-photo-viewer';
      dialog.setAttribute('aria-labelledby', 'mf-staff-photo-title');
      dialog.innerHTML = '<header><span id="mf-staff-photo-title"></span><button type="button" aria-label="關閉照片">關閉 ×</button></header><img alt="">';
      document.body.append(dialog);
      dialog.querySelector('button').addEventListener('click', () => dialog.close());
      dialog.addEventListener('click', event => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
      });
      dialog.addEventListener('close', () => dialog.querySelector('img').removeAttribute('src'));
    }
    list.onclick = event => {
      const trigger = event.target.closest('button[data-photo]');
      if (!trigger || !list.contains(trigger)) return;
      const image = trigger.querySelector('img');
      if (!image || !image.naturalWidth) return;
      const full = dialog.querySelector('img');
      full.src = image.currentSrc || image.src;
      full.alt = image.alt;
      dialog.querySelector('#mf-staff-photo-title').textContent = image.alt;
      if (!dialog.open) dialog.showModal();
    };
  }

  async function loadDirectory() {
    // 先顯示完整內建名錄，資料庫慢速或離線時也不會留白。
    render(local);
    const cfg = window.MF_CONFIG || {};
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) return;
    let client;
    try {
      client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
      const { data, error } = await client.from('staff').select('*').eq('active', true).order('sort_order');
      if (error) throw error;
      if (!data?.length) return;
      // 沿用原網站的名錄範圍與照片來源，不因資料庫舊照片欄位蓋回舊圖。
      const bySlug = new Map(local.map(row => [row.slug, row]));
      const merged = data.filter(row => bySlug.has(row.slug)).map(row => {
        const fallback = bySlug.get(row.slug);
        return { ...fallback, ...row,
          services: Array.isArray(row.services) && row.services.length ? row.services : fallback.services,
          photo_primary: fallback.photo_primary, photo_secondary: fallback.photo_secondary
        };
      });
      const present = new Set(merged.map(row => row.slug));
      merged.push(...local.filter(row => !present.has(row.slug)));
      render(merged);
    } catch (error) {
      console.warn('館員介紹使用內建資料：', error.message || error);
    } finally {
      if (client?.removeAllChannels) client.removeAllChannels();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadDirectory, { once: true });
  else loadDirectory();
})();
