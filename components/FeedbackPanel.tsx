'use client';
import {useEffect, useMemo, useState} from 'react';
import {supabase} from '@/lib/supabase';

type Feedback = {
  id:string; created_at:string; is_anonymous:boolean; guest_name:string|null;
  staff_name:string; rating:number; services:string[]; comments:string;
};
const PAGE_SIZE = 20;
const date = (value:string) => new Date(value).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false});

export default function FeedbackPanel() {
  const db = useMemo(() => supabase(), []);
  const [rows,setRows] = useState<Feedback[]>([]);
  const [page,setPage] = useState(0);
  const [count,setCount] = useState(0);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [refresh,setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    void (async () => {
      try {
        const {data,error:queryError,count:total} = await db.from('guest_feedback')
          .select('id,created_at,is_anonymous,guest_name,staff_name,rating,services,comments',{count:'exact'})
          .order('created_at',{ascending:false}).order('id',{ascending:false})
          .range(page*PAGE_SIZE,(page+1)*PAGE_SIZE-1);
        if (queryError) throw queryError;
        if (active) {setRows(data || []); setCount(total || 0);}
      } catch {
        if (active) setError('調查回覆暫時無法載入，請重新整理；若登入已過期，請重新登入。');
      } finally {if (active) setLoading(false);}
    })();
    return () => {active=false;};
  },[db,page,refresh]);
  return <section className="feedback-panel" aria-label="滿意度調查回覆">
    <div className="feedback-toolbar"><div><h2>旅人的回饋</h2><p>僅館主可查看。匿名回覆不會記錄姓名。</p></div><button type="button" disabled={loading} onClick={() => setRefresh(value=>value+1)}>重新整理回覆</button></div>
    <p className="hint"><a href="/survey.html" target="_blank" rel="noopener noreferrer">開啟滿意度調查頁</a>{!loading&&!error&&`　共 ${count} 份回覆`}</p>
    {error ? <p role="alert">{error}</p> : loading ? <p role="status">正在讀取回覆…</p> : rows.length ? <div className="feedback-list">{rows.map(row=><article className="feedback-response" key={row.id}>
      <header><div><h3>{row.is_anonymous?'匿名旅人':row.guest_name}</h3><time dateTime={row.created_at}>{date(row.created_at)}</time></div><span className="feedback-stars" aria-label={`${row.rating} 顆星，滿分 5 星`}>{'★'.repeat(row.rating)}{'☆'.repeat(5-row.rating)}</span></header>
      <p><strong>服務館員：</strong>{row.staff_name}</p><p><strong>體驗服務：</strong>{row.services.join('、')}</p>
      <p className="feedback-comment">{row.comments||'未留下文字意見。'}</p>
    </article>)}</div> : <p className="empty-state">目前還沒有回覆，收到旅人的填答後會顯示在這裡。</p>}
    <div className="feedback-pagination"><button type="button" disabled={loading||page===0} onClick={()=>setPage(value=>value-1)}>上一頁</button><span>第 {page+1} 頁</span><button type="button" disabled={loading||(page+1)*PAGE_SIZE>=count} onClick={()=>setPage(value=>value+1)}>下一頁</button></div>
  </section>;
}
