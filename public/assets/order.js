const foods=[
 ['主食','蛋包飯',5000],['主食','扇貝咖哩',7000],['主食','加雷馬披薩',7000],['主食','醬炒飯',5000],['主食','懸掛番茄沙拉',7000],['主食','羊駝奶油麵',5000],
 ['甜點','圓扇刺刺梨蛋糕',4000],['甜點','巧克力奶油蛋糕',4000],['甜點','白桃塔',6000],['甜點','蜂蜜牛角麵包',6000],['甜點','烏雞布丁',6000],
 ['飲品','奶油熱巧克力',3000],['飲品','蜜瓜果汁',5000],['飲品','白桃汁',5000],['飲品','抹茶',5000],['飲品','路易波士紅茶',5000]
].map((x,i)=>({id:i+1,category:x[0],name:x[1],price:x[2]}));
const box=document.getElementById('foodChoices');
box.innerHTML=foods.map(f=>`<label class="food-row"><span><small>${f.category}</small><b>${f.name}</b></span><span>${f.price.toLocaleString('zh-TW')} Gil</span><input class="food-qty" type="number" min="0" max="99" value="0" data-id="${f.id}" aria-label="${f.name}數量"></label>`).join('');
function selectedItems(){return [...document.querySelectorAll('.food-qty')].map(x=>({food:foods.find(f=>f.id===Number(x.dataset.id)),qty:Number(x.value)||0})).filter(x=>x.qty>0)}
function updateSummary(){const items=selectedItems(),lines=document.getElementById('orderLines'),total=document.getElementById('orderTotal');lines.innerHTML=items.length?items.map(x=>`<div><span>${x.food.name} × ${x.qty}</span><b>${(x.food.price*x.qty).toLocaleString('zh-TW')} Gil</b></div>`).join(''):'尚未選擇餐點';total.textContent=items.reduce((n,x)=>n+x.food.price*x.qty,0).toLocaleString('zh-TW')+' Gil'}
box.addEventListener('input',updateSummary);
document.getElementById('orderForm').addEventListener('submit',async e=>{
 e.preventDefault();
 const form=e.currentTarget,button=form.querySelector('button[type="submit"]');
 const guest=document.getElementById('orderGuest').value.trim(),items=selectedItems();
 if(!guest){toast('請填寫客人名稱');return}
 if(!items.length){toast('請至少選擇一項餐點');return}
 const total=items.reduce((n,x)=>n+x.food.price*x.qty,0);
 button.disabled=true;button.textContent='傳送中…';
 try{
  const response=await fetch('/api/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({guest_name:guest,items:items.map(x=>({name:x.food.name,qty:x.qty,price:x.food.price})),total})});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error||'送出點餐失敗');
  form.reset();document.querySelectorAll('.food-qty').forEach(x=>x.value=0);updateSummary();toast('點餐內容已送出');
 }catch(error){toast(error instanceof Error?error.message:'送出點餐失敗，請稍後再試')}
 finally{button.disabled=false;button.textContent='送出點餐內容'}
});
updateSummary();
