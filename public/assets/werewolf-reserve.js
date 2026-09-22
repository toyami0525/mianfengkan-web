(() => {
  'use strict';
  const $=id=>document.getElementById(id),form=$('werewolf-form');
  if (!form) return;
  let config=null,busy=false,requestId='',signature='',serverOffset=0;
  const states={pending:'待確認，尚未保證開場',confirmed:'已確認',completed:'已完成',cancelled:'已取消'};
  const errorBox=$('form-error'),submit=$('submit-booking');
  function showError(message){errorBox.textContent=message;errorBox.hidden=false;errorBox.focus();}
  function validateDate(){
    const value=$('date').value;
    let message='';
    if(value&&new Date(`${value}T12:00:00Z`).getUTCDay()===1) message='每週一固定休館，請選擇其他日期。';
    else if(value&&config?.closed_dates.includes(value)) message='這一天臨時休館，請選擇其他日期。';
    $('date').setCustomValidity(message);
    return message;
  }
  function sync(){
    $('summary-date').textContent=$('date').value||'尚未選擇';
    $('summary-time').textContent=$('time').value?`${$('time').value}（台灣時間）`:'尚未選擇';
    $('summary-players').textContent=$('players').value?`${$('players').value} 人`:'尚未填寫';
    validateDate();
  }
  form.addEventListener('input',()=>{errorBox.hidden=true;sync();});
  form.addEventListener('change',sync);
  async function loadConfig(){
    config=null;submit.disabled=true;$('retry-config').hidden=true;
    $('config-status').textContent='正在確認可預約日期…';
    try{
      const response=await fetch('/api/werewolf-reservations',{cache:'no-store',signal:AbortSignal.timeout(15000)});
      const data=await response.json();
      if(!response.ok||data.price!==500000||!Array.isArray(data.closed_dates)||!/^\d{4}-\d{2}-\d{2}$/.test(data.today)) throw new Error(data.error||'暫時無法確認可預約日期。');
      config=data;serverOffset=Date.parse(data.now)-Date.now();if(!Number.isFinite(serverOffset))serverOffset=0;
      $('date').min=data.today;$('venue-address').textContent=data.address||'穹頂皓天 7區22號';
      $('config-status').textContent='週二至週日開放預約申請；實際開場須經館主確認。';
      submit.disabled=busy;sync();
    }catch(error){$('config-status').textContent='暫時無法確認休館日期，請按下方按鈕重試；目前尚未送出預約。';$('retry-config').hidden=false;}
  }
  $('retry-config').addEventListener('click',loadConfig);
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    if(!config){showError('請先重新確認可預約日期。');return;}
    validateDate();if(!form.reportValidity())return;
    const data={guest_name:$('guest_name').value.trim(),guest_server:$('guest_server').value,contact:$('contact').value.trim(),date:$('date').value,time:$('time').value,players:Number($('players').value),notes:$('notes').value.trim(),agreed:$('agreed').checked,website:$('website').value};
    if(!data.guest_name){showError('請填寫角色名稱。');$('guest_name').focus();return;}
    const nextSignature=JSON.stringify(data);
    if(nextSignature!==signature||!requestId){
      if(Date.parse(`${data.date}T${data.time}:00+08:00`)<=Date.now()+serverOffset){showError('希望開始的時間已過，請改選其他時間。');return;}
      requestId=crypto.randomUUID();signature=nextSignature;
    }
    // Preserve this request ID when retrying after a timeout, even when the requested time has just passed.
    busy=true;errorBox.hidden=true;$('booking-fields').disabled=true;submit.disabled=true;submit.textContent='正在送出，請稍候…';
    try{
      const response=await fetch('/api/werewolf-reservations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,request_id:requestId}),signal:AbortSignal.timeout(20000)});
      const result=await response.json();
      if(!response.ok||result.ok!==true||!/^WW-\d+$/.test(result.booking_code)||result.price!==500000||!states[result.status]) throw new Error(result.error||'尚未收到送出確認，請稍後重試。');
      $('booking-code').textContent=result.booking_code;
      $('booking-result-state').textContent=`目前狀態：${states[result.status]}。`;
      $('booking-result-summary').textContent=`希望於 ${data.date} ${data.time}（台灣時間）遊玩，共 ${data.players} 人；整場費用 500,000 Gil。`;
      form.hidden=true;$('config-status').hidden=true;$('retry-config').hidden=true;$('booking-success').hidden=false;$('booking-success').focus();
    }catch(error){showError(error.name==='TimeoutError'||error.name==='AbortError'?'尚未收到送出確認。請保留本頁，稍後按原按鈕重試；同一次送出不會重複建單。':error instanceof TypeError?'網路暫時無法連線，填寫內容已保留，請稍後重試。':error.message||'暫時無法送出，請稍後重試。');}
    finally{busy=false;$('booking-fields').disabled=false;submit.disabled=!config;submit.textContent='送出狼人殺預約 ↗';}
  });
  sync();void loadConfig();
})();
