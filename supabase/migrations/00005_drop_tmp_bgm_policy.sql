-- 上传完成，撤销临时写策略：bgm 桶恢复只读（公共可读，无任何写权限）
drop policy if exists "tmp_bgm_anon_upload" on storage.objects;