-- Add payroll identities for the approved photographer and musicians.
-- No login accounts, reservations, orders, permissions or past settlements change.
DO $migration$
DECLARE
  person record;
  matches integer;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mf-support-staff-20261014',0));
  IF NOT EXISTS (SELECT 1 FROM public.staff WHERE slug='airi' AND name='愛梨') THEN
    RAISE EXCEPTION 'Cannot locate the existing Airi profile; review before adding payroll companions';
  END IF;
  FOR person IN
    SELECT * FROM (VALUES
      ('zizishou','梓梓獸','御用攝影師',111,'assets/images/staff-zizishou-20261014.avif'),
      ('ogino-chihiro','荻野千尋','演奏家',120,'assets/images/performers-chihiro-haku-20261014.avif'),
      ('kohakugawa-haku','琥珀川白龍','演奏家',130,'assets/images/performers-chihiro-haku-20261014.avif')
    ) AS wanted(slug,name,role,sort_order,photo)
  LOOP
    SELECT count(*) INTO matches FROM public.staff s
      WHERE s.slug=person.slug OR s.name=person.name;
    IF matches>1 OR (matches=1 AND NOT EXISTS (
      SELECT 1 FROM public.staff s WHERE s.slug=person.slug AND s.name=person.name
    )) THEN
      RAISE EXCEPTION 'Conflicting staff identity for %; do not overwrite existing people',person.name;
    END IF;
    IF matches=0 THEN
      INSERT INTO public.staff(slug,name,role,sort_order,active,accepting_reservations,services,photo_1)
      VALUES(person.slug,person.name,person.role,person.sort_order,true,false,ARRAY[]::text[],person.photo);
    END IF;
  END LOOP;
END;
$migration$;
