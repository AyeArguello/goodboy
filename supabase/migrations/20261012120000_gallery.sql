-- Photo gallery managed from the admin panel.
--
-- * The files live in the public Storage bucket `gallery` (nothing is kept in
--   the repository any more); this table holds the metadata the site needs to
--   lay them out (size for the masonry, caption for the alt text).
-- * At most 25 photos, enforced here by a trigger so no client, server action
--   or script can go past it, even with concurrent uploads.
-- * Everybody can read the table (the gallery is public); writing is only
--   possible through the admin RPCs below (is_admin() is checked inside) or the
--   service role.

create table gallery_photos (
  id uuid primary key default gen_random_uuid(),
  -- Object path inside the `gallery` bucket (random name, no user-supplied text).
  storage_path text not null unique
    check (storage_path ~ '^g/[0-9a-f-]{36}\.(jpg|png|webp)$'),
  caption text not null default '' check (char_length(caption) <= 120),
  width int not null check (width between 1 and 10000),
  height int not null check (height between 1 and 10000),
  created_at timestamptz not null default now()
);

create index gallery_photos_created_idx on gallery_photos (created_at desc);

alter table gallery_photos enable row level security;

create policy gallery_photos_public_read on gallery_photos
  for select to anon, authenticated using (true);

revoke all on gallery_photos from public, anon, authenticated;
grant select on gallery_photos to anon, authenticated;

-- ---------------------------------------------------------------------
-- The 25-photo limit. The advisory lock serializes inserts so two uploads
-- racing for the last place cannot both succeed.
-- ---------------------------------------------------------------------
create or replace function gallery_photos_enforce_limit() returns trigger
language plpgsql set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('gallery_photos_limit'));
  if (select count(*) from gallery_photos) >= 25 then
    raise exception 'GALLERY_FULL' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function gallery_photos_enforce_limit() from public, anon, authenticated;

create trigger gallery_photos_limit
  before insert on gallery_photos
  for each row execute function gallery_photos_enforce_limit();

-- ---------------------------------------------------------------------
-- Admin RPCs. The file is uploaded to Storage by the server first; these only
-- register or unregister it.
-- ---------------------------------------------------------------------
create or replace function admin_add_gallery_photo(
  p_storage_path text,
  p_caption text,
  p_width int,
  p_height int
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  insert into gallery_photos (storage_path, caption, width, height)
  values (p_storage_path, coalesce(trim(p_caption), ''), p_width, p_height)
  returning id into v_id;

  return v_id;
end;
$$;

-- Returns the Storage path so the caller can remove the file too.
create or replace function admin_delete_gallery_photo(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_path text;
begin
  if not is_admin() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  delete from gallery_photos where id = p_id returning storage_path into v_path;
  if v_path is null then
    raise exception 'PHOTO_NOT_FOUND' using errcode = 'P0001';
  end if;

  return v_path;
end;
$$;

revoke all on function admin_add_gallery_photo(text, text, int, int)
  from public, anon, authenticated;
revoke all on function admin_delete_gallery_photo(uuid)
  from public, anon, authenticated;
grant execute on function admin_add_gallery_photo(text, text, int, int) to authenticated;
grant execute on function admin_delete_gallery_photo(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Public bucket for the photos. Created here when the storage schema already
-- exists (hosted projects); for `supabase start` it is also declared in
-- supabase/config.toml. Public read only: writes go through the service role.
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'gallery', 'gallery', true, 5242880,
      array['image/jpeg', 'image/png', 'image/webp']
    )
    on conflict (id) do update
      set public = true,
          file_size_limit = 5242880,
          allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
  end if;
end;
$$;
