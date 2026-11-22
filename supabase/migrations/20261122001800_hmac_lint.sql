-- Stage 5.7 follow-up (hosted db lint warnings on migration 1700): convert_to() is STABLE, so
-- the HMAC helper is STABLE, and the FOR loop declares its own counter.
create or replace function private.hmac_sha256_hex(p_key text, p_message text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_key bytea := convert_to(p_key, 'UTF8');
  v_ipad bytea;
  v_opad bytea;
begin
  if length(v_key) > 64 then
    v_key := sha256(v_key);
  end if;
  v_key := v_key || decode(repeat('00', 64 - length(v_key)), 'hex');
  v_ipad := v_key;
  v_opad := v_key;
  for i in 0..63 loop
    v_ipad := set_byte(v_ipad, i, get_byte(v_key, i) # 54);
    v_opad := set_byte(v_opad, i, get_byte(v_key, i) # 92);
  end loop;
  return encode(sha256(v_opad || sha256(v_ipad || convert_to(p_message, 'UTF8'))), 'hex');
end;
$$;
