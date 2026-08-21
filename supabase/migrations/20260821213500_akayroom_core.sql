-- Akayroom Core Schema — Agent B
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- Helper: updated_at trigger
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ==================== PROFILES ====================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (char_length(username) >= 3 and char_length(username) <= 32 and username ~ '^[a-zA-Z0-9_.]+$'),
  display_name text check (char_length(display_name) <= 32),
  avatar_url text,
  status text not null default 'online' check (status in ('online','idle','dnd','offline')),
  bio text check (char_length(bio) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists profiles_username_idx on public.profiles (username);
create index if not exists profiles_status_idx on public.profiles (status);
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.handle_updated_at();

-- ==================== SERVERS ====================
create table if not exists public.servers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) >= 2 and char_length(name) <= 100),
  description text check (char_length(description) <= 500),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  icon_url text,
  invite_code text not null unique default substring(md5(random()::text) from 1 for 8),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists servers_owner_idx on public.servers (owner_id);
create index if not exists servers_invite_code_idx on public.servers (invite_code);
drop trigger if exists servers_updated_at on public.servers;
create trigger servers_updated_at before update on public.servers for each row execute function public.handle_updated_at();

-- ==================== SERVER MEMBERS ====================
create table if not exists public.server_members (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','moderator','member')),
  joined_at timestamptz not null default now(),
  unique (server_id, user_id)
);
create index if not exists server_members_server_idx on public.server_members (server_id);
create index if not exists server_members_user_idx on public.server_members (user_id);

-- ==================== CHANNELS ====================
create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  name text not null check (char_length(name) >= 1 and char_length(name) <= 100),
  type text not null check (type in ('text','voice','announcement')),
  topic text check (char_length(topic) <= 300),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);
create index if not exists channels_server_idx on public.channels (server_id);
create index if not exists channels_server_position_idx on public.channels (server_id, position);
create unique index if not exists channels_server_name_type_unique on public.channels (server_id, name, type);

-- ==================== MESSAGES ====================
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  server_id uuid not null references public.servers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) >= 1 and char_length(content) <= 4000),
  reply_to uuid references public.messages(id) on delete set null,
  edited boolean not null default false,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists messages_channel_created_idx on public.messages (channel_id, created_at desc);
create index if not exists messages_server_idx on public.messages (server_id);
create index if not exists messages_user_idx on public.messages (user_id);
drop trigger if exists messages_updated_at on public.messages;
create trigger messages_updated_at before update on public.messages for each row execute function public.handle_updated_at();

-- ==================== FRIEND REQUESTS ====================
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','blocked','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_id != receiver_id),
  unique (sender_id, receiver_id)
);
create index if not exists friend_requests_sender_idx on public.friend_requests (sender_id);
create index if not exists friend_requests_receiver_idx on public.friend_requests (receiver_id);
drop trigger if exists friend_requests_updated_at on public.friend_requests;
create trigger friend_requests_updated_at before update on public.friend_requests for each row execute function public.handle_updated_at();

-- ==================== FRIENDSHIPS ====================
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, friend_id),
  check (user_id != friend_id)
);
create index if not exists friendships_user_idx on public.friendships (user_id);
create index if not exists friendships_friend_idx on public.friendships (friend_id);

-- ==================== NOTIFICATIONS ====================
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('friend_request','friend_accepted','server_invite','mention','system')),
  title text not null check (char_length(title) <= 200),
  body text check (char_length(body) <= 1000),
  data jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id);
create index if not exists notifications_read_idx on public.notifications (user_id, read);

-- ==================== HELPER FUNCTIONS (after tables) ====================
create or replace function public.is_server_member(sid uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.server_members where server_id = sid and user_id = auth.uid());
$$;
create or replace function public.is_server_owner(sid uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.servers where id = sid and owner_id = auth.uid());
$$;
create or replace function public.is_server_admin(sid uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.server_members 
    where server_id = sid and user_id = auth.uid() and role in ('owner','admin')
  ) or exists (select 1 from public.servers where id = sid and owner_id = auth.uid());
$$;

-- ==================== RLS ENABLE & POLICIES ====================
alter table public.profiles enable row level security;
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles for select using (auth.role() = 'authenticated');
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles for delete using (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare uname text;
begin
  uname := coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1));
  if exists (select 1 from public.profiles where username = uname) then
    uname := uname || '_' || substring(md5(random()::text), 1, 4);
  end if;
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    uname,
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', uname),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    avatar_url = excluded.avatar_url,
    updated_at = now();
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.servers enable row level security;
drop policy if exists "servers_select_all" on public.servers;
create policy "servers_select_all" on public.servers for select using (auth.role() = 'authenticated');
drop policy if exists "servers_insert" on public.servers;
create policy "servers_insert" on public.servers for insert with check (auth.role() = 'authenticated' and auth.uid() = owner_id);
drop policy if exists "servers_update_owner" on public.servers;
create policy "servers_update_owner" on public.servers for update using (auth.uid() = owner_id or public.is_server_admin(id)) with check (auth.uid() = owner_id or public.is_server_admin(id));
drop policy if exists "servers_delete_owner" on public.servers;
create policy "servers_delete_owner" on public.servers for delete using (auth.uid() = owner_id);

alter table public.server_members enable row level security;
drop policy if exists "server_members_select" on public.server_members;
create policy "server_members_select" on public.server_members for select using (
  auth.role() = 'authenticated' and (
    auth.uid() = user_id or public.is_server_member(server_id) or public.is_server_owner(server_id)
  )
);
drop policy if exists "server_members_insert" on public.server_members;
create policy "server_members_insert" on public.server_members for insert with check (
  auth.role() = 'authenticated' and (
    auth.uid() = user_id or public.is_server_admin(server_id) or public.is_server_owner(server_id)
  )
);
drop policy if exists "server_members_update" on public.server_members;
create policy "server_members_update" on public.server_members for update using (
  public.is_server_admin(server_id) or public.is_server_owner(server_id) or auth.uid() = user_id
) with check (
  public.is_server_admin(server_id) or public.is_server_owner(server_id) or auth.uid() = user_id
);
drop policy if exists "server_members_delete" on public.server_members;
create policy "server_members_delete" on public.server_members for delete using (
  auth.uid() = user_id or public.is_server_admin(server_id) or public.is_server_owner(server_id)
);

-- handle_new_server after channels exists
create or replace function public.handle_new_server()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.server_members (server_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (server_id, user_id) do update set role = 'owner';
  insert into public.channels (server_id, name, type, topic, position, created_by)
  values 
    (new.id, 'general', 'text', 'General discussion', 0, new.owner_id),
    (new.id, 'General', 'voice', 'General voice', 1, new.owner_id);
  return new;
end;
$$;
drop trigger if exists on_server_created on public.servers;
create trigger on_server_created after insert on public.servers for each row execute function public.handle_new_server();

alter table public.channels enable row level security;
drop policy if exists "channels_select" on public.channels;
create policy "channels_select" on public.channels for select using (auth.role() = 'authenticated' and public.is_server_member(server_id));
drop policy if exists "channels_insert" on public.channels;
create policy "channels_insert" on public.channels for insert with check (auth.role() = 'authenticated' and public.is_server_member(server_id));
drop policy if exists "channels_update" on public.channels;
create policy "channels_update" on public.channels for update using (public.is_server_member(server_id) and (public.is_server_admin(server_id) or auth.uid() = created_by)) with check (public.is_server_member(server_id));
drop policy if exists "channels_delete" on public.channels;
create policy "channels_delete" on public.channels for delete using (public.is_server_admin(server_id) or auth.uid() = created_by);

alter table public.messages enable row level security;
drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages for select using (auth.role() = 'authenticated' and public.is_server_member(server_id));
drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages for insert with check (auth.role() = 'authenticated' and auth.uid() = user_id and public.is_server_member(server_id));
drop policy if exists "messages_update_own" on public.messages;
create policy "messages_update_own" on public.messages for update using (auth.uid() = user_id and not deleted) with check (auth.uid() = user_id);
drop policy if exists "messages_delete_own" on public.messages;
create policy "messages_delete_own" on public.messages for delete using (auth.uid() = user_id or public.is_server_admin(server_id));
drop policy if exists "messages_admin_update" on public.messages;
create policy "messages_admin_update" on public.messages for update using (public.is_server_admin(server_id)) with check (public.is_server_admin(server_id));

alter table public.friend_requests enable row level security;
drop policy if exists "friend_requests_select" on public.friend_requests;
create policy "friend_requests_select" on public.friend_requests for select using (auth.uid() = sender_id or auth.uid() = receiver_id);
drop policy if exists "friend_requests_insert" on public.friend_requests;
create policy "friend_requests_insert" on public.friend_requests for insert with check (auth.uid() = sender_id and sender_id != receiver_id);
drop policy if exists "friend_requests_update" on public.friend_requests;
create policy "friend_requests_update" on public.friend_requests for update using (auth.uid() = sender_id or auth.uid() = receiver_id) with check (auth.uid() = sender_id or auth.uid() = receiver_id);
drop policy if exists "friend_requests_delete" on public.friend_requests;
create policy "friend_requests_delete" on public.friend_requests for delete using (auth.uid() = sender_id or auth.uid() = receiver_id);

alter table public.friendships enable row level security;
drop policy if exists "friendships_select_own" on public.friendships;
create policy "friendships_select_own" on public.friendships for select using (auth.uid() = user_id);
drop policy if exists "friendships_insert_own" on public.friendships;
create policy "friendships_insert_own" on public.friendships for insert with check (auth.uid() = user_id);
drop policy if exists "friendships_delete_own" on public.friendships;
create policy "friendships_delete_own" on public.friendships for delete using (auth.uid() = user_id);
-- allow security definer trigger to bypass: create permissive for service_role is implicit

create or replace function public.handle_friend_request_accepted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'accepted' and old.status != 'accepted' then
    insert into public.friendships (user_id, friend_id)
    values (new.sender_id, new.receiver_id), (new.receiver_id, new.sender_id)
    on conflict (user_id, friend_id) do nothing;
    insert into public.notifications (user_id, type, title, body, data)
    values 
      (new.receiver_id, 'friend_accepted', 'Friend request accepted', 'You and ' || (select username from public.profiles where id = new.sender_id) || ' are now friends', jsonb_build_object('friend_id', new.sender_id, 'request_id', new.id)),
      (new.sender_id, 'friend_accepted', 'Friend request accepted', (select username from public.profiles where id = new.receiver_id) || ' accepted your request', jsonb_build_object('friend_id', new.receiver_id, 'request_id', new.id))
    on conflict do nothing;
  end if;
  if old.status = 'accepted' and new.status != 'accepted' then
    delete from public.friendships where (user_id = new.sender_id and friend_id = new.receiver_id) or (user_id = new.receiver_id and friend_id = new.sender_id);
  end if;
  return new;
end;
$$;
drop trigger if exists on_friend_request_status_change on public.friend_requests;
create trigger on_friend_request_status_change after update on public.friend_requests for each row execute function public.handle_friend_request_accepted();

alter table public.notifications enable row level security;
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications for select using (auth.uid() = user_id);
drop policy if exists "notifications_insert_own" on public.notifications;
create policy "notifications_insert_own" on public.notifications for insert with check (auth.role() = 'authenticated');
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications for delete using (auth.uid() = user_id);

create or replace function public.notify_friend_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'pending' then
    insert into public.notifications (user_id, type, title, body, data)
    values (
      new.receiver_id,
      'friend_request',
      'New friend request',
      (select username from public.profiles where id = new.sender_id) || ' sent you a friend request',
      jsonb_build_object('sender_id', new.sender_id, 'request_id', new.id)
    );
  end if;
  return new;
end;
$$;
drop trigger if exists on_friend_request_created on public.friend_requests;
create trigger on_friend_request_created after insert on public.friend_requests for each row execute function public.notify_friend_request();

-- Storage bucket
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
    on conflict (id) do nothing;
  end if;
end
$$;
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='storage' and table_name='objects') then
    begin drop policy if exists "Avatar public read" on storage.objects; create policy "Avatar public read" on storage.objects for select using (bucket_id = 'avatars'); exception when others then null; end;
    begin drop policy if exists "Avatar authenticated upload" on storage.objects; create policy "Avatar authenticated upload" on storage.objects for insert with check (bucket_id = 'avatars' and auth.role() = 'authenticated'); exception when others then null; end;
    begin drop policy if exists "Avatar owner update" on storage.objects; create policy "Avatar owner update" on storage.objects for update using (bucket_id = 'avatars' and auth.role() = 'authenticated') with check (bucket_id = 'avatars'); exception when others then null; end;
    begin drop policy if exists "Avatar owner delete" on storage.objects; create policy "Avatar owner delete" on storage.objects for delete using (bucket_id = 'avatars' and auth.role() = 'authenticated'); exception when others then null; end;
  end if;
end
$$;

-- Realtime
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'channels') then
    alter publication supabase_realtime add table public.channels;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friend_requests') then
    alter publication supabase_realtime add table public.friend_requests;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friendships') then
    alter publication supabase_realtime add table public.friendships;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'server_members') then
    alter publication supabase_realtime add table public.server_members;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'servers') then
    alter publication supabase_realtime add table public.servers;
  end if;
exception when others then raise log 'realtime setup failed: %', SQLERRM;
end
$$;

create or replace function public.get_user_servers()
returns setof public.servers language sql security definer set search_path = public as $$
  select s.* from public.servers s where s.id in (select server_id from public.server_members where user_id = auth.uid()) order by s.created_at desc;
$$;
create or replace function public.search_users(q text)
returns setof public.profiles language sql security definer set search_path = public as $$
  select * from public.profiles where username ilike '%' || q || '%' or display_name ilike '%' || q || '%' limit 20;
$$;
grant execute on function public.get_user_servers() to authenticated;
grant execute on function public.search_users(text) to authenticated;
grant execute on function public.is_server_member(uuid) to authenticated;
grant execute on function public.is_server_owner(uuid) to authenticated;
grant execute on function public.is_server_admin(uuid) to authenticated;

