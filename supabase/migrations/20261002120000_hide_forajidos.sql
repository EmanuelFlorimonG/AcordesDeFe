-- Retirada de Forajidos (Hakuna Group Music). Conserva la fila y su historial.
-- No cambia categorías, tiempos litúrgicos, permisos ni referencias de Setlists.
begin;

update public.songs set status = 'hidden' where id = 'forajidos-hakuna';

do $$
begin
  if not exists (select 1 from public.songs where id = 'forajidos-hakuna' and status = 'hidden') then
    raise exception 'Forajidos no quedó oculta; verificar el catálogo antes de continuar';
  end if;
end;
$$;

commit;
