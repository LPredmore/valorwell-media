-- BTY Short expression production regression. Run as privileged operator only.
-- All synthetic rows and triggered jobs roll back; no real clip or publication is changed.
BEGIN;
CREATE TEMP TABLE bty_expression_test_results(
 n integer, code text, family text, valence text
) ON COMMIT DROP;
DO $$
DECLARE
 i integer; cid uuid; assigned jsonb; chosen text; locked jsonb;
BEGIN
 FOR i IN 1..18 LOOP
  INSERT INTO public.ai_operations_video_clips(
   project_id,start_seconds,end_seconds,transcript_text,clip_type,parent_file_id,
   workflow_revision,hook_input_fingerprint,hook_text,status
  )
  SELECT project_id,100000+i*40,100030+i*40,
    'Synthetic BTY Short expression regression','short',parent_file_id,
    workflow_revision,hook_input_fingerprint,'EXACT HOOK UNCHANGED','proposed'
  FROM public.ai_operations_video_clips
  WHERE clip_type='short' AND hook_input_fingerprint IS NOT NULL
  ORDER BY created_at DESC LIMIT 1
  RETURNING id INTO cid;
  IF cid IS NULL THEN RAISE EXCEPTION 'No safe existing clip fixture'; END IF;
  assigned:=public.assign_bty_short_expression(
    cid,'00000000-0000-0000-0000-000000000001',
    (SELECT workflow_revision FROM public.ai_operations_video_clips WHERE id=cid),
    (SELECT hook_input_fingerprint FROM public.ai_operations_video_clips WHERE id=cid),
    'test-fp-'||i, CASE WHEN i%2=0 THEN 'Test Guest' ELSE 'Luke Predmore' END,
    'Tense red-and-cyan contextual story collage','top_left');
  INSERT INTO bty_expression_test_results VALUES(
    i,assigned->>'code',assigned->>'emotion_family',assigned->>'valence');
  IF (SELECT hook_text FROM public.ai_operations_video_clips WHERE id=cid)
       IS DISTINCT FROM 'EXACT HOOK UNCHANGED' THEN
    RAISE EXCEPTION 'Hook changed on assignment %',i;
  END IF;
  IF i=18 THEN
    SELECT code INTO chosen FROM public.ai_operations_thumbnail_expression_presets
    WHERE active=true AND valence<>'negative' AND code<>assigned->>'code'
    ORDER BY sort_order DESC LIMIT 1;
    locked:=public.override_bty_short_expression(
      cid,'00000000-0000-0000-0000-000000000001',chosen,true);
    IF locked->>'code'<>chosen OR locked->>'locked'<>'true' THEN
      RAISE EXCEPTION 'Override failed';
    END IF;
    assigned:=public.assign_bty_short_expression(
      cid,'00000000-0000-0000-0000-000000000001',
      (SELECT workflow_revision FROM public.ai_operations_video_clips WHERE id=cid),
      (SELECT hook_input_fingerprint FROM public.ai_operations_video_clips WHERE id=cid),
      'test-fp-regenerate','Luke Predmore','Tense narrative collage','top_left');
    IF assigned->>'code'<>chosen OR assigned->>'reason'<>'locked_preset' THEN
      RAISE EXCEPTION 'Locked override not honored on regeneration';
    END IF;
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM bty_expression_test_results WHERE valence='negative') THEN
   RAISE EXCEPTION 'Negative preset selected';
 END IF;
 IF EXISTS(
   SELECT 1 FROM (
     SELECT n,code,lead(n) OVER(PARTITION BY code ORDER BY n) AS next_use
     FROM bty_expression_test_results
   ) x WHERE x.next_use-x.n<=8
 ) THEN RAISE EXCEPTION 'Repeated exact preset inside last 8 Shorts'; END IF;
 IF (SELECT count(DISTINCT family) FROM bty_expression_test_results)<6 THEN
   RAISE EXCEPTION 'Insufficient family diversity';
 END IF;
END $$;
SELECT COUNT(*) tested,COUNT(DISTINCT code) unique_presets,
       COUNT(DISTINCT family) emotion_families,
       COUNT(*) FILTER (WHERE valence='negative') negative
FROM bty_expression_test_results;
ROLLBACK;
