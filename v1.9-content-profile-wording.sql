-- 眠楓館 v1.9：館員介紹內容與指名資格同步
-- 不刪除既有館員或歷史指名紀錄。

update public.staff
set
  role = '館主',
  quote = '「歡迎蒞臨『眠楓館』，由衷希望旅人們能在這裡洗去旅途的疲憊。」',
  bio = '看著安靜且雅緻氣質的龍娘（其實很怕生），負責館內整體接待與營運。偶爾會以不同模樣出現在館內，卻總能讓來訪的旅人安心落座。',
  enabled = true,
  accepting_reservations = false
where slug = 'riku' or name = '羽鶴璃久';

update public.staff
set
  role = '館員／看板娘',
  quote = '',
  bio = '館主的義姊、貪吃鬼，也是眠楓館的可愛擔當。活潑好動，實際上卻十分體貼溫柔，總能讓館內氣氛變得輕鬆愉快。',
  enabled = true,
  accepting_reservations = true
where slug = 'wei' or name = '微';

update public.staff
set enabled = false,
    accepting_reservations = false
where coalesce(slug, '') not in ('riku', 'wei')
  and name not in ('羽鶴璃久', '微');
