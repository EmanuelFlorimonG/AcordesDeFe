-- =============================================================================
-- GENESARET · Phase 6B
-- Proposals are sent only through the Edge Function `submit-song`, which
-- checks Cloudflare Turnstile first. The browser can no longer call the
-- database function directly, so a script can't skip the human check.
--
-- Earlier migrations are applied and never edited; everything here is a new
-- function or a CREATE OR REPLACE with the same signature.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- submit_song_submission_verified: the sending logic of 20260919120000, word
-- for word, except where the source comes from. Only the Edge Function
-- (service_role) may call it, after Turnstile passed, and it passes the
-- visitor's IP: the function's own request headers are the Edge Function's,
-- not the visitor's. The IP is hashed exactly like request_source_hash() does,
-- so sending and checking count the same source.
-- -----------------------------------------------------------------------------

create or replace function public.submit_song_submission_verified(p_payload jsonb, p_client_ip text)
returns table (tracking_code text, edit_token text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_type text;
  v_target text;
  v_song jsonb;
  v_title text;
  v_content text;
  v_name text;
  v_email text;
  v_source_hash text;
  v_code text;
  v_token text;
  v_request uuid;
  v_existing_code text;
  v_existing_hash text;
  v_attempt integer := 0;
begin
  -- Shape and size.
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or octet_length(p_payload::text) > 65536
     or p_payload -> 'schemaVersion' is distinct from '1'::jsonb then
    raise exception 'GENESARET:invalid:payload';
  end if;

  -- Retry identity: both or neither, well formed.
  v_token := nullif(p_payload ->> 'editToken', '');
  if v_token is not null and v_token !~ '^[0-9a-f]{64}$' then
    raise exception 'GENESARET:invalid:token';
  end if;
  if nullif(p_payload ->> 'requestId', '') is not null then
    if (p_payload ->> 'requestId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or v_token is null then
      raise exception 'GENESARET:invalid:request';
    end if;
    v_request := (p_payload ->> 'requestId')::uuid;
  end if;

  -- A retry of a proposal already stored: the same sender gets the same answer.
  if v_request is not null then
    select s.tracking_code, s.edit_token_hash into v_existing_code, v_existing_hash
    from public.song_submissions s where s.client_request_id = v_request;
    if found then
      if v_existing_hash = encode(extensions.digest(v_token, 'sha256'), 'hex') then
        return query select v_existing_code, v_token;
        return;
      end if;
      raise exception 'GENESARET:invalid:request';
    end if;
  end if;

  v_type := p_payload ->> 'type';
  v_target := nullif(p_payload ->> 'targetSongId', '');
  v_song := p_payload -> 'song';

  if v_type is null or v_type not in ('create', 'update') then
    raise exception 'GENESARET:invalid:type';
  end if;
  if v_type = 'create' and v_target is not null then
    raise exception 'GENESARET:invalid:target';
  end if;
  if v_type = 'update' and (v_target is null or not exists (
    select 1 from public.songs s where s.id = v_target and s.status = 'published'
  )) then
    raise exception 'GENESARET:invalid:target';
  end if;

  if v_song is null or jsonb_typeof(v_song) <> 'object' or v_song -> 'schemaVersion' is distinct from '1'::jsonb then
    raise exception 'GENESARET:invalid:song';
  end if;
  v_title := btrim(coalesce(v_song ->> 'title', ''));
  v_content := coalesce(v_song ->> 'content', '');
  if char_length(v_title) not between 1 and 120 or char_length(btrim(v_content)) = 0 or char_length(v_content) > 20000 then
    raise exception 'GENESARET:invalid:song';
  end if;

  v_name := nullif(btrim(coalesce(p_payload -> 'contributor' ->> 'name', '')), '');
  v_email := lower(nullif(btrim(coalesce(p_payload -> 'contributor' ->> 'email', '')), ''));
  if char_length(v_name) > 80 then
    raise exception 'GENESARET:invalid:contributor';
  end if;
  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$') then
    raise exception 'GENESARET:invalid:contributor';
  end if;

  -- Rate limit (sends only): 5 per source in 10 minutes, 200 in total per hour.
  v_source_hash := encode(extensions.digest(coalesce(nullif(btrim(p_client_ip), ''), 'unknown'), 'sha256'), 'hex');
  delete from public.submission_rate_events e where e.created_at < now() - interval '1 day';
  if (select count(*) from public.submission_rate_events e
      where e.kind = 'submit' and e.source_hash = v_source_hash and e.created_at > now() - interval '10 minutes') >= 5
     or (select count(*) from public.submission_rate_events e
         where e.kind = 'submit' and e.created_at > now() - interval '1 hour') >= 200 then
    raise exception 'GENESARET:rate_limited';
  end if;
  insert into public.submission_rate_events (source_hash, kind) values (v_source_hash, 'submit');

  loop
    v_code := public.generate_tracking_code();
    exit when not exists (select 1 from public.song_submissions s where s.tracking_code = v_code);
    v_attempt := v_attempt + 1;
    if v_attempt >= 5 then
      raise exception 'GENESARET:unavailable';
    end if;
  end loop;
  v_token := coalesce(v_token, encode(extensions.gen_random_bytes(32), 'hex'));

  begin
    insert into public.song_submissions
      (type, target_song_id, proposed_song, contributor_name, contributor_email, tracking_code, edit_token_hash, client_request_id)
    values
      (v_type, v_target, v_song, v_name, v_email, v_code, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_request);
  exception when unique_violation then
    -- Two retries of the same proposal arrived at once: the first one stored it.
    select s.tracking_code, s.edit_token_hash into v_existing_code, v_existing_hash
    from public.song_submissions s where s.client_request_id = v_request;
    if found and v_existing_hash = encode(extensions.digest(v_token, 'sha256'), 'hex') then
      return query select v_existing_code, v_token;
      return;
    end if;
    raise exception 'GENESARET:unavailable';
  end;

  return query select v_code, v_token;
end;
$$;

-- New functions in `public` are executable by anon and authenticated by
-- default in Supabase: taken away explicitly. Only the Edge Function may call it.
revoke execute on function public.submit_song_submission_verified(jsonb, text) from public, anon, authenticated;
grant execute on function public.submit_song_submission_verified(jsonb, text) to service_role;

-- -----------------------------------------------------------------------------
-- submit_song_submission: kept (same signature) as a thin wrapper over the
-- function above, with the source taken from its own request as before, so
-- there is one implementation. Nobody from the API may call it any more.
-- -----------------------------------------------------------------------------

create or replace function public.submit_song_submission(p_payload jsonb)
returns table (tracking_code text, edit_token text)
language sql
volatile
security definer
set search_path = ''
as $$
  select * from public.submit_song_submission_verified(
    p_payload,
    split_part(coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', 'unknown'), ',', 1)
  );
$$;

revoke execute on function public.submit_song_submission(jsonb) from public, anon, authenticated;

-- get_submission_status is unchanged: anyone may still check a proposal by its code.
