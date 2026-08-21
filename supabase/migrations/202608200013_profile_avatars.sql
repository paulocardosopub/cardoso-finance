insert into storage.buckets (id, name, public)
values ('profile-avatars', 'profile-avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "profile avatars public read" on storage.objects;
drop policy if exists "profile avatars self upload" on storage.objects;
drop policy if exists "profile avatars self update" on storage.objects;
drop policy if exists "profile avatars self delete" on storage.objects;
create policy "profile avatars public read" on storage.objects for select using (bucket_id = 'profile-avatars');
create policy "profile avatars self upload" on storage.objects for insert to authenticated with check (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "profile avatars self update" on storage.objects for update to authenticated using (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "profile avatars self delete" on storage.objects for delete to authenticated using (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
