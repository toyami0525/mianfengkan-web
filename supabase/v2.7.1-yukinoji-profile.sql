-- 眠楓館 v2.7.1：更新雪之寺羽狩館員介紹
-- 可重複執行。

update public.staff
set bio = '黃金港忍者部隊退役的優閒忍者，沒事就會參與狩獵怪物的傭兵招募，最喜歡的事情是揮舞雙刃享受戰鬥，但在眠楓館卻以繪師的姿態現身……？',
    quote = '「要是有忍術畫圖之術一瞬間完成就好了…啊、啊！客人您在啊。」',
    updated_at = now()
where slug = 'yukinoji-hakari' or name = '雪之寺羽狩';
