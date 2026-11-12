-- 背景音乐公共存储桶（含临时 anon 上传策略，上传完成后将撤销）
insert into storage.buckets (id, name, public)
values ('bgm', 'bgm', true)
on conflict (id) do nothing;

create policy "tmp_bgm_anon_upload"
  on storage.objects
  for insert
  to anon
  with check (bucket_id = 'bgm');