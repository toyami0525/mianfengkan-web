(() => {
  const form = document.getElementById('surveyForm');
  const anonymous = document.getElementById('anonymous');
  const guest = document.getElementById('guestName');
  const staff = document.getElementById('staffName');
  const comments = document.getElementById('comments');
  const errorBox = document.getElementById('surveyError');
  const submit = document.getElementById('surveySubmit');
  const services = [...form.querySelectorAll('input[name="services"]')];
  const stars = [...form.querySelectorAll('input[name="rating"]')];
  const descriptions = ['','很不滿意','不太滿意','普通','滿意','非常滿意'];
  let submitting = false;
  // Keep the identifier across retries without storing any guest data.
  const submissionId = crypto.randomUUID();
  anonymous.addEventListener('change', () => {
    guest.disabled = anonymous.checked;
    guest.required = !anonymous.checked;
    if (anonymous.checked) guest.value = '';
    guest.placeholder = anonymous.checked ? '匿名旅人' : '您的角色名稱';
    document.getElementById('anonymousHelp').hidden = !anonymous.checked;
  });
  document.getElementById('noStaff').addEventListener('click', () => {staff.value='無';staff.focus();});
  stars.forEach(input => input.addEventListener('change', () => {
    const value = Number(input.value);
    stars.forEach(star => star.parentElement.classList.toggle('is-selected',Number(star.value)<=value));
    document.getElementById('ratingHint').textContent = `${value} 星 · ${descriptions[value]}`;
  }));
  services.forEach(input => input.addEventListener('change', () => {
    if (input.checked) {
      services.forEach(other => {
        if (other !== input && (input.value==='只點餐而已'||other.value==='只點餐而已')) other.checked=false;
      });
    }
  }));
  comments.addEventListener('input', () => {document.getElementById('commentCount').textContent=String(comments.value.length);});
  function showError(message) {errorBox.textContent=message;errorBox.hidden=false;errorBox.focus();}
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting) return;
    errorBox.hidden=true;
    if (!form.reportValidity()) return;
    const selected = services.filter(input=>input.checked).map(input=>input.value);
    if (!selected.length) {showError('請至少選擇一項本次服務。');return;}
    if (!anonymous.checked && !guest.value.trim()) {showError('請填寫客人姓名，或選擇匿名。');return;}
    if (!staff.value.trim()) {showError('請填寫服務館員，沒有則填「無」。');return;}
    submitting=true;submit.disabled=true;submit.textContent='正在送出…';form.setAttribute('aria-busy','true');
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(),20000);
    try {
      const response = await fetch('/api/survey',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({
        submission_id:submissionId,is_anonymous:anonymous.checked,guest_name:anonymous.checked?null:guest.value.trim(),
        staff_name:staff.value.trim(),rating:Number(form.querySelector('input[name="rating"]:checked').value),services:selected,comments:comments.value.trim(),
      })});
      const result = await response.json();
      if (!response.ok || result.ok!==true) throw new Error(result.error||'暫時無法送出，請稍後再試。');
      form.reset();form.hidden=true;
      const success=document.getElementById('surveySuccess');success.hidden=false;success.focus();
    } catch (error) {showError(error.name==='AbortError'?'連線等候較久，請再試一次；已收到的回覆不會重複新增。':error.message||'連線失敗，您的填答仍保留，請稍後再試。');}
    finally {clearTimeout(timer);submitting=false;submit.disabled=false;submit.textContent='送出今晚的回饋';form.removeAttribute('aria-busy');}
  });
  fetch('/api/survey',{cache:'no-store'}).then(async response=>{
    if (!response.ok) throw new Error();
    const result=await response.json();
    const list=document.getElementById('staffNames');
    (result.staff||[]).forEach(name=>{const option=document.createElement('option');option.value=String(name);list.appendChild(option);});
  }).catch(()=>{document.getElementById('staffHelp').textContent='館員名單暫時無法載入，您仍可直接填寫姓名，或填「無」。';});
})();
