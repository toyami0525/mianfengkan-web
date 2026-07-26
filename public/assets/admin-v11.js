const cfg = window.MF_CONFIG || {};
let client = null;
let currentRows = [];
const $ = (id) => document.getElementById(id);
const showMessage = (id, text, ok = false) => {
  const el = $(id);
  el.textContent = text;
  el.className = `form-message ${ok ? 'ok' : 'error'}`;
};
const configured = () => Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey && !cfg.supabaseUrl.includes('YOUR_'));
const splitServices = (value) => value.split(',').map((x) => x.trim()).filter(Boolean);
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function resetForm() {
  $('staffForm').reset();
  $('staffId').value = '';
  $('staffRole').value = '館員';
  $('staffSort').value = '100';
  $('staffEnabled').checked = true;
  $('formTitle').textContent = '新增館員';
  $('staffMessage').textContent = '';
}

function fillForm(row) {
  $('staffId').value = row.id;
  $('staffName').value = row.name || '';
  $('staffRole').value = row.role || '';
  $('staffSlug').value = row.slug || '';
  $('staffQuote').value = row.quote || '';
  $('staffBio').value = row.bio || '';
  $('staffServices').value = (row.services || []).join(',');
  $('staffPhoto1').value = row.photo_primary || '';
  $('staffPhoto2').value = row.photo_secondary || '';
  $('staffSort').value = row.sort_order ?? 100;
  $('staffEnabled').checked = row.enabled !== false;
  $('formTitle').textContent = `編輯館員：${row.name}`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderStaff() {
  $('staffCount').textContent = currentRows.length;
  $('enabledCount').textContent = currentRows.filter((row) => row.enabled).length;
  const box = $('staffAdminList');
  if (!currentRows.length) {
    box.innerHTML = '<p class="empty">尚無館員資料</p>';
    return;
  }
  box.innerHTML = currentRows.map((row) => `
    <article class="staff-admin-item">
      <div><b>${escapeHtml(row.name)}</b><small>${escapeHtml(row.role || '館員')} · ${row.enabled ? '顯示中' : '已停用'}</small></div>
      <div>
        <button class="table-btn" data-edit="${row.id}">編輯</button>
        <button class="table-btn" data-toggle="${row.id}">${row.enabled ? '停用' : '啟用'}</button>
        <button class="table-btn danger" data-delete="${row.id}">刪除</button>
      </div>
    </article>`).join('');
}

async function loadStaff() {
  const { data, error } = await client.from('staff').select('*').order('sort_order');
  if (error) return showMessage('staffMessage', `讀取失敗：${error.message}`);
  currentRows = data || [];
  renderStaff();
}

async function checkSession() {
  const { data: { session } } = await client.auth.getSession();
  $('loginPanel').hidden = Boolean(session);
  $('adminPanel').hidden = !session;
  if (session) await loadStaff();
}

$('loginBtn').addEventListener('click', async () => {
  const email = $('loginEmail').value.trim();
  const password = $('loginPassword').value;
  if (!email || !password) return showMessage('loginMessage', '請輸入電子郵件與密碼。');
  showMessage('loginMessage', '登入中…', true);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) return showMessage('loginMessage', `登入失敗：${error.message}`);
  showMessage('loginMessage', '登入成功。', true);
  await checkSession();
});

$('loginPassword').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') $('loginBtn').click();
});

$('logoutBtn').addEventListener('click', async () => {
  await client.auth.signOut();
  await checkSession();
});

$('staffForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const row = {
    name: $('staffName').value.trim(), role: $('staffRole').value.trim(), slug: $('staffSlug').value.trim(),
    quote: $('staffQuote').value.trim(), bio: $('staffBio').value.trim(), services: splitServices($('staffServices').value),
    photo_primary: $('staffPhoto1').value.trim(), photo_secondary: $('staffPhoto2').value.trim(),
    sort_order: Number($('staffSort').value || 100), enabled: $('staffEnabled').checked
  };
  const id = $('staffId').value;
  const query = id ? client.from('staff').update(row).eq('id', id) : client.from('staff').insert(row);
  const { error } = await query;
  if (error) return showMessage('staffMessage', `儲存失敗：${error.message}`);
  showMessage('staffMessage', '館員資料已儲存，前台會同步更新。', true);
  resetForm();
  await loadStaff();
});

$('staffAdminList').addEventListener('click', async (event) => {
  const edit = event.target.dataset.edit;
  const toggle = event.target.dataset.toggle;
  const remove = event.target.dataset.delete;
  if (edit) return fillForm(currentRows.find((row) => row.id === edit));
  if (toggle) {
    const row = currentRows.find((item) => item.id === toggle);
    const { error } = await client.from('staff').update({ enabled: !row.enabled }).eq('id', toggle);
    if (error) return alert(error.message);
    return loadStaff();
  }
  if (remove && confirm('確定要刪除此館員嗎？此動作無法復原。')) {
    const { error } = await client.from('staff').delete().eq('id', remove);
    if (error) return alert(error.message);
    await loadStaff();
  }
});

$('resetFormBtn').addEventListener('click', resetForm);
$('refreshStaffBtn').addEventListener('click', loadStaff);

if (!configured()) {
  $('setupNotice').hidden = false;
  $('loginPanel').hidden = true;
} else {
  client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  client.auth.onAuthStateChange(() => checkSession());
  checkSession();
}
