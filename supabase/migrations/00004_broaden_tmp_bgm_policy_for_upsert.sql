-- 临时策略升级为全操作：支持 upsert 与清理探测文件（稍后撤销）
drop policy if exists "tmp_bgm_anon_upload" on storage.objects;

create policy "tmp_bgm_anon_upload"
  on storage.objects
  for all
  to public
  using (bucket_id = 'bgm')
  with check (bucket_id = 'bgm');