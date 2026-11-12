-- 修正临时上传策略：storage 服务以内部角色执行，需对 public 开放（仅限 bgm 桶）
drop policy if exists "tmp_bgm_anon_upload" on storage.objects;

create policy "tmp_bgm_anon_upload"
  on storage.objects
  for insert
  to public
  with check (bucket_id = 'bgm');