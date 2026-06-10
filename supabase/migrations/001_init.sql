-- Dark Ages: Supabase Schema
-- Run this in the Supabase SQL editor (Dashboard > SQL Editor > New query)

create extension if not exists citext;

-- ─── PROFILES ────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  username  citext unique not null,
  email     text,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;

create policy "profiles_select" on public.profiles for select using (true);
create policy "profiles_insert" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update" on public.profiles for update using (auth.uid() = id);

-- ─── GAMES ───────────────────────────────────────────────────────────────────
create table if not exists public.games (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  host          uuid references public.profiles(id),
  status        text not null default 'lobby' check (status in ('lobby','active','finished')),
  max_players   int  not null default 2,
  map_radius    int  not null default 7,
  seed          int,
  round         int  default 1,
  current_slot  int  default 0,
  state_blob    text,
  invite_token  uuid unique default gen_random_uuid(),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
alter table public.games enable row level security;

create policy "games_select" on public.games for select
  using (id in (select game_id from public.game_players where profile_id = auth.uid()));

create policy "games_insert" on public.games for insert
  with check (auth.uid() = host);

-- ─── GAME PLAYERS ────────────────────────────────────────────────────────────
create table if not exists public.game_players (
  game_id     uuid references public.games(id) on delete cascade,
  slot        int  not null,
  profile_id  uuid references public.profiles(id),
  color_idx   int  default 0,
  eliminated  boolean default false,
  joined_at   timestamptz default now(),
  primary key (game_id, slot),
  unique (game_id, profile_id)
);
alter table public.game_players enable row level security;

create policy "game_players_select" on public.game_players for select
  using (game_id in (select game_id from public.game_players gp2 where gp2.profile_id = auth.uid()));

create policy "game_players_insert" on public.game_players for insert
  with check (auth.uid() = profile_id);

-- ─── FRIENDSHIPS ─────────────────────────────────────────────────────────────
create table if not exists public.friendships (
  requester_id  uuid references public.profiles(id) on delete cascade,
  addressee_id  uuid references public.profiles(id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending','accepted')),
  created_at    timestamptz default now(),
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
alter table public.friendships enable row level security;

create policy "friendships_select" on public.friendships for select
  using (requester_id = auth.uid() or addressee_id = auth.uid());

create policy "friendships_insert" on public.friendships for insert
  with check (requester_id = auth.uid());

create policy "friendships_update" on public.friendships for update
  using (addressee_id = auth.uid());

-- ─── PUSH SUBSCRIPTIONS ──────────────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid references public.profiles(id) on delete cascade,
  endpoint    text unique not null,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz default now()
);
alter table public.push_subscriptions enable row level security;

create policy "push_subs_all" on public.push_subscriptions for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ─── FUNCTIONS ───────────────────────────────────────────────────────────────

-- submit_turn: validates caller is current player, writes new blob
create or replace function public.submit_turn(
  p_game_id          uuid,
  p_new_blob         text,
  p_next_slot        int,
  p_next_round       int,
  p_eliminated_slots int[] default '{}'::int[]
) returns void language plpgsql security definer as $$
declare
  v_current_slot int;
  v_my_slot      int;
begin
  select current_slot into v_current_slot from public.games where id = p_game_id;
  select slot        into v_my_slot      from public.game_players
    where game_id = p_game_id and profile_id = auth.uid();

  if v_my_slot is null or v_my_slot <> v_current_slot then
    raise exception 'Nicht dein Zug';
  end if;

  if array_length(p_eliminated_slots, 1) > 0 then
    update public.game_players
      set eliminated = true
      where game_id = p_game_id and slot = any(p_eliminated_slots);
  end if;

  update public.games
    set state_blob   = p_new_blob,
        current_slot = p_next_slot,
        round        = p_next_round,
        updated_at   = now()
    where id = p_game_id;
end; $$;

-- start_game: host triggers map generation result, transitions lobby → active
create or replace function public.start_game(
  p_game_id   uuid,
  p_seed      int,
  p_state_blob text
) returns void language plpgsql security definer as $$
begin
  if not exists (select 1 from public.games where id = p_game_id and host = auth.uid() and status = 'lobby') then
    raise exception 'Nicht der Host oder Spiel nicht in Lobby';
  end if;

  update public.games
    set status     = 'active',
        seed       = p_seed,
        state_blob = p_state_blob,
        current_slot = 0,
        round      = 1,
        updated_at = now()
    where id = p_game_id;
end; $$;

-- join_game_by_token: any logged-in user can join a lobby via invite token
create or replace function public.join_game_by_token(
  p_invite_token uuid
) returns uuid language plpgsql security definer as $$
declare
  v_game_id    uuid;
  v_max        int;
  v_next_slot  int;
begin
  select id, max_players into v_game_id, v_max
    from public.games
    where invite_token = p_invite_token and status = 'lobby';

  if v_game_id is null then
    raise exception 'Lobby nicht gefunden oder bereits gestartet';
  end if;

  if exists (select 1 from public.game_players where game_id = v_game_id and profile_id = auth.uid()) then
    return v_game_id;
  end if;

  select coalesce(max(slot), -1) + 1 into v_next_slot
    from public.game_players where game_id = v_game_id;

  if v_next_slot >= v_max then
    raise exception 'Lobby ist voll';
  end if;

  insert into public.game_players (game_id, slot, profile_id, color_idx)
    values (v_game_id, v_next_slot, auth.uid(), v_next_slot);

  return v_game_id;
end; $$;

-- invite_friend_to_game: host adds a friend by username (bypasses RLS)
create or replace function public.invite_friend_to_game(
  p_game_id         uuid,
  p_friend_username citext
) returns void language plpgsql security definer as $$
declare
  v_friend_id  uuid;
  v_next_slot  int;
  v_max        int;
  v_status     text;
begin
  select max_players, status into v_max, v_status
    from public.games where id = p_game_id and host = auth.uid();

  if v_status is null then raise exception 'Nicht der Host'; end if;
  if v_status <> 'lobby' then raise exception 'Spiel bereits gestartet'; end if;

  select id into v_friend_id from public.profiles where username = p_friend_username;
  if v_friend_id is null then raise exception 'Spieler nicht gefunden'; end if;

  if exists (select 1 from public.game_players where game_id = p_game_id and profile_id = v_friend_id) then
    raise exception 'Spieler bereits in der Lobby';
  end if;

  select coalesce(max(slot), -1) + 1 into v_next_slot
    from public.game_players where game_id = p_game_id;

  if v_next_slot >= v_max then raise exception 'Lobby ist voll'; end if;

  insert into public.game_players (game_id, slot, profile_id, color_idx)
    values (p_game_id, v_next_slot, v_friend_id, v_next_slot);
end; $$;

-- get_lobby_preview: return lobby info for invite link preview (bypasses RLS)
create or replace function public.get_lobby_preview(
  p_invite_token uuid
) returns json language plpgsql security definer as $$
declare
  v_game record;
  v_players json;
begin
  select id, name, status, max_players into v_game
    from public.games where invite_token = p_invite_token;

  if v_game.id is null then return null; end if;

  select json_agg(json_build_object('slot', gp.slot, 'username', pr.username))
    into v_players
    from public.game_players gp
    join public.profiles pr on pr.id = gp.profile_id
    where gp.game_id = v_game.id;

  return json_build_object(
    'id',          v_game.id,
    'name',        v_game.name,
    'status',      v_game.status,
    'max_players', v_game.max_players,
    'players',     coalesce(v_players, '[]'::json)
  );
end; $$;
