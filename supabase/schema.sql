-- Draft Room: gemeinsame Einstellungen (Team-Design, "Mein Team", Draft-Board) für alle Liga-Mitglieder.
-- Einmal im Supabase-Dashboard unter SQL Editor einfügen und ausführen.
--
-- Kein echtes Login (Supabase Auth) im Einsatz – die "Identität" ist weiterhin ein frei gewählter
-- Name, genau wie der Rest der Seite bisher vertrauensbasiert ist (10 bekannte Personen, kein
-- öffentlicher Zugriff auf die Liga). Die RLS-Policies sind entsprechend offen für die anon-Rolle:
-- sie verhindern keinen Missbrauch durch böswillige Dritte, nur versehentliches Fehlverhalten der
-- Website selbst. Falls das später zu wenig sein sollte, bräuchte es echte Supabase-Auth-Accounts.

create table if not exists public.draftroom_settings (
  name text primary key,
  theme text,
  my_team text,
  draft_board jsonb,
  updated_at timestamptz not null default now()
);

alter table public.draftroom_settings enable row level security;

create policy draftroom_settings_select_anon
  on public.draftroom_settings for select
  to anon
  using (true);

create policy draftroom_settings_insert_anon
  on public.draftroom_settings for insert
  to anon
  with check (true);

create policy draftroom_settings_update_anon
  on public.draftroom_settings for update
  to anon
  using (true)
  with check (true);

create policy draftroom_settings_delete_anon
  on public.draftroom_settings for delete
  to anon
  using (true);
