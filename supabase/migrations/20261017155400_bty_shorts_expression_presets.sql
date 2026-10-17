-- Curated Short thumbnail expression presets: nonnegative faces, high-stakes atmosphere.
-- Database-enforced one-writer rotation with reproducible clip provenance.
CREATE TABLE IF NOT EXISTS public.ai_operations_thumbnail_expression_presets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 code text NOT NULL,
 name text NOT NULL,
 emotion_family text NOT NULL,
 valence text NOT NULL CHECK (valence IN ('positive','neutral','negative')),
 active boolean NOT NULL DEFAULT true,
 sort_order integer NOT NULL DEFAULT 0,
 energy_level smallint NOT NULL CHECK (energy_level BETWEEN 1 AND 5),
 tension_level smallint NOT NULL CHECK (tension_level BETWEEN 1 AND 5),
 facial_expression text NOT NULL,
 person_positioning text NOT NULL,
 gesture_action text NOT NULL,
 camera_framing text NOT NULL,
 pose_family text NOT NULL,
 eye_direction text NOT NULL,
 mouth_style text NOT NULL,
 brow_style text NOT NULL,
 head_angle text NOT NULL,
 shoulder_angle text NOT NULL,
 hook_text_placement text NOT NULL,
 prompt_fragment text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,code)
);
CREATE INDEX IF NOT EXISTS bty_expr_presets_active_idx ON public.ai_operations_thumbnail_expression_presets(tenant_id,emotion_family,sort_order) WHERE active;
ALTER TABLE public.ai_operations_thumbnail_expression_presets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_operations_thumbnail_expression_presets FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.ai_operations_thumbnail_expression_presets TO service_role;

ALTER TABLE public.ai_operations_video_clips ADD COLUMN IF NOT EXISTS thumbnail_expression_preset_id uuid REFERENCES public.ai_operations_thumbnail_expression_presets(id);
ALTER TABLE public.ai_operations_video_clips ADD COLUMN IF NOT EXISTS thumbnail_expression_family text;
ALTER TABLE public.ai_operations_video_clips ADD COLUMN IF NOT EXISTS thumbnail_expression_selection_reason text;
ALTER TABLE public.ai_operations_video_clips ADD COLUMN IF NOT EXISTS thumbnail_expression_selection_version integer;
ALTER TABLE public.ai_operations_video_clips ADD COLUMN IF NOT EXISTS thumbnail_expression_locked boolean NOT NULL DEFAULT false;
ALTER TABLE public.ai_operations_video_clips ADD COLUMN IF NOT EXISTS thumbnail_expression_selected_at timestamptz;
CREATE INDEX IF NOT EXISTS bty_clips_expression_preset_idx ON public.ai_operations_video_clips(thumbnail_expression_preset_id) WHERE thumbnail_expression_preset_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.ai_operations_thumbnail_expression_usage (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tenant_id uuid NOT NULL,
 project_id uuid NOT NULL REFERENCES public.ai_operations_video_projects(id) ON DELETE CASCADE,
 clip_id uuid NOT NULL REFERENCES public.ai_operations_video_clips(id) ON DELETE CASCADE,
 preset_id uuid NOT NULL REFERENCES public.ai_operations_thumbnail_expression_presets(id),
 speaker_name text NOT NULL,
 emotion_family text NOT NULL,
 generation_revision integer NOT NULL,
 selection_reason text NOT NULL,
 selected_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(clip_id,generation_revision)
);
CREATE INDEX IF NOT EXISTS bty_expression_usage_recent_idx ON public.ai_operations_thumbnail_expression_usage(tenant_id,selected_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS bty_expression_usage_speaker_idx ON public.ai_operations_thumbnail_expression_usage(tenant_id,lower(speaker_name),selected_at DESC);
ALTER TABLE public.ai_operations_thumbnail_expression_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_operations_thumbnail_expression_usage FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.ai_operations_thumbnail_expression_usage TO service_role;

INSERT INTO public.ai_operations_thumbnail_expression_presets (
 tenant_id,code,name,emotion_family,valence,active,sort_order,energy_level,tension_level,
 facial_expression,person_positioning,gesture_action,camera_framing,pose_family,
 eye_direction,mouth_style,brow_style,head_angle,shoulder_angle,hook_text_placement,prompt_fragment
)
SELECT '00000000-0000-0000-0000-000000000001'::uuid,
 j.code,j.name,j.emotion_family,j.valence,j.active,j.sort_order,j.energy_level,j.tension_level,
 j.facial_expression,j.person_positioning,j.gesture_action,j.camera_framing,j.pose_family,
 j.eye_direction,j.mouth_style,j.brow_style,j.head_angle,j.shoulder_angle,j.hook_text_placement,j.prompt_fragment
FROM jsonb_to_recordset('[{"code":"bty-short-01","name":"Surprised discovery","emotion_family":"surprise","valence":"positive","energy_level":4,"tension_level":5,"facial_expression":"eyes lifted wide, raised brows and a genuine spark of discovery","person_positioning":"leaning forward with shoulders open","gesture_action":"one open palm lifted as if saying look at this","camera_framing":"chest-up dynamic three-quarter","pose_family":"surprise-forward","eye_direction":"direct and alert","mouth_style":"natural expressive smile or animated speaking mouth","brow_style":"visibly lifted","head_angle":"slight left tilt","shoulder_angle":"open square shoulders","hook_text_placement":"top_right","prompt_fragment":"Maintain a tense, urgent narrative collage and the immutable on-image hook. The subject looks neutral-to-positive; do not turn tension into anger, sadness, grief, despair, fear or misery.","active":true,"sort_order":1},{"code":"bty-short-02","name":"Mind-blown realization","emotion_family":"surprise","valence":"positive","energy_level":4,"tension_level":5,"facial_expression":"bright open eyes and a half-open delighted gasp, not fear","person_positioning":"slight backward recoil with upright torso","gesture_action":"both hands subtly spread in amazement","camera_framing":"tight mid-shot, face dominant","pose_family":"wide-eyed-reveal","eye_direction":"engaged near lens","mouth_style":"natural expressive smile or animated speaking mouth","brow_style":"visibly lifted","head_angle":"slight right tilt","shoulder_angle":"dynamic three-quarter angle","hook_text_placement":"top_left","prompt_fragment":"Maintain a tense, urgent narrative collage and the immutable on-image hook. The subject looks neutral-to-positive; do not turn tension into anger, sadness, grief, despair, fear or misery.","active":true,"sort_order":2},{"code":"bty-short-03","name":"Unbelievable but true","emotion_family":"surprise","valence":"positive","energy_level":4,"tension_level":5,"facial_expression":"playful incredulity, arched eyebrows and intrigued open-mouth smile","person_positioning":"torso angled toward story collage","gesture_action":"one palm-up what-just-happened gesture","camera_framing":"shoulder-level three-quarter crop","pose_family":"surprise-side-turn","eye_direction":"toward story cue then lens","mouth_style":"natural expressive smile or animated speaking mouth","brow_style":"visibly lifted","head_angle":"mostly upright","shoulder_angle":"open square shoulders","hook_text_placement":"top_right","prompt_fragment":"Maintain a tense, urgent narrative collage and the immutable on-image hook. The subject looks neutral-to-positive; do not turn tension into anger, sadness, grief, despair, fear or misery.","active":true,"sort_order":3},{"code":"bty-short-04","name":"Sudden breakthrough","emotion_family":"surprise","valence":"positive","energy_level":4,"tension_level":5,"facial_expression":"sharp eyebrow lift and an energized lightbulb realization","person_positioning":"stepping forward with alert posture","gesture_action":"finger lifted lightly to mark the key point","camera_framing":"tight chest-up, diagonal framing","pose_family":"breakthrough-lean","eye_direction":"direct with a subtle sideward glance","mouth_style":"natural expressive smile or animated speaking mouth","brow_style":"visibly lifted","head_angle":"slight left tilt","shoulder_angle":"dynamic three-quarter angle","hook_text_placement":"top_left","prompt_fragment":"Maintain a tense, urgent narrative collage and the immutable on-image hook. The subject looks neutral-to-positive; do not turn tension into anger, sadness, grief, despair, fear or misery.","active":true,"sort_order":4},{"code":"bty-short-05","name":"Astonished grin","emotion_family":"surprise","valence":"positive","energy_level":4,"tension_level":5,"facial_expression":"authentic astonished smile with widened alert eyes","person_positioning":"upright and engaged, slight head tilt","gesture_action":"hand near chest expressing amazement","camera_framing":"medium close-up with clean hook space","pose_family":"surprised-smile","eye_direction":"direct and alert","mouth_style":"natural expressive smile or animated speaking mouth","brow_style":"visibly lifted","head_angle":"slight right tilt","shoulder_angle":"open square shoulders","hook_text_placement":"top_right","prompt_fragment":"Maintain a tense, urgent narrative collage and the immutable on-image hook. The subject looks neutral-to-positive; do not turn tension into anger, sadness, grief, despair, fear or misery.","active":true,"sort_order":5},{"code":"bty-short-06","name":"Focused wow moment","emotion_family":"surprise","valence":"neutral","energy_level":4,"tension_level":5,"facial_expression":"incredulous wide eyes, lifted brows, composed mouth, no anxiety","person_positioning":"lean toward lens with shoulders squared","gesture_action":"open hand paused mid-reaction","camera_framing":"tight face-and-shoulders","pose_family":"curious-wow","eye_direction":"engaged near lens","mouth_style":"relaxed, composed and attentive","brow_style":"visibly lifted","head_angle":"mostly upright","shoulder_angle":"dynamic three-quarter angle","hook_text_placement":"top_left","prompt_fragment":"Maintain a tense, urgent narrative collage and the immutable on-image hook. The subject looks neutral-to-positive; do not turn tension into anger, sadness, grief, despair, fear or misery.","active":true,"sort_order":6},{"code":"bty-short-07","name":"Big win energy","emotion_family":"excitement","valence":"positive","energy_level":4,"tension_level":5,"facial_expression":"bright excited eyes and delighted emphatic smile","person_positioning":"leaning into moment with animated shoulders","gesture_action":"compact fist-pump gesture","camera_framing":"close-up with dynamic negative space","pose_family":"energized-win","eye_direction":"toward story cue then lens","mouth_style":"natural expressive smile or animated speaking mouth","brow_style":"engaged, expressive","head_angle":"slight left tilt","shoulder_angle":"open square shoulders","hook_text_placement":"top_right","prompt_fragment":"Maintain a tense, urgent narrative collage and the immutable on-image hook. The subject looks neutral-to-positive; do not turn tension into anger, sadness, grief, despair, fear or misery.","active":true,"sort_order":7},{"code":"bty-short-08","name":"Energized storyteller","emotion_family":"excitement","valence":"positive","energy_level":4,"tension_level":5,"facial_expression":"animated speaking expression, wide engaged eyes and slight smile","person_positioning":"forward engaged posture with diagonal shoulders","gesture_action":"one hand open in mid-explanation","camera_framing":"chest-up lively three-quarter","pose_family":"animated-explainer","eye_direction":"direct with a subtle sideward glance","mouth_style":"natural expressive smile or animated speaking mouth","brow_style":"engaged, expressive","head_angle":"slight right tilt","shoulder_angle":"dynamic three-quarter angle","hook_text_placement":"top_left","prompt_fragment":"Maintain a tense, urgent narrative collage and the immutable on-image hook. The subject looks neutral-to-positive; do not turn tension into anger, sadness, grief, despair, fear or misery.","active":true,"sort_order":8},{"code":"bty-short-09","name":"Can-you-believe-it laugh","emotion_family":"excitement","valence":"positive","energy_level":4,"tension_level":5,"facial_expression":"open joyful surprised grin and sparkling eyes","person_positioning":"slight backward lean and relaxed shoulders","gesture_action":"hand lifted near chest mid-laugh","camera_framing":"tight upper torso with diagonal crop","pose_family":"excited-disbelief","eye_direction":"direct and alert","mouth_style":"natural expressive smile or animated speaking mouth","brow_style":"engaged, expressive","head_angle":"mostly upright","shoulder_angle":"open square shoulders","hook_text_placement":"top_right","prompt_fragment":"Maintain a tense, urgent narrative collage and the immutable on-image hook. The subject looks neutral-to-positive; do not turn tension into anger, sadness, grief, despair, fear or misery.","active":true,"sort_order":9},{"code":"bty-short-10","name":"Passionate emphasis","emotion_family":"excitement","valence":"positive","energy_level":4,"tension_level":5,"facial_expression":"passionate alert eyes, raised brows and confident open speech","person_positioning":"upright confident presentation stance","gesture_action":"one hand extended to emphasize the reveal","camera_framing":"medium close-up with kinetic angle","pose_family":"emphatic-presenter","eye_direction":"engaged near lens","mouth_style":"natural expressive smile or animated speaking mouth","brow_style":"engaged, expressive","head_angle":"slight left tilt","shoulder_angle":"dynamic three-quarter angle","hook_text_placement":"top_left","prompt_fragment":"Maintain a tense, urgent narrative collage and the immutable on-image hook. The subject looks neutral-to-positive; do not turn tension into anger, sadness, grief, despair, fear or misery.","active":true,"sort_order":10},{"code":"bty-short-11","name":"Excited announcement","emotion_family":"excitement","valence":"positive","energy_level":4,"tension_level":5,"facial_expression":"eager surprised smile and focused eye contact","person_positioning":"lean forward with shoulders lifted naturally","gesture_action":"two hands slightly apart presenting exciting news","camera_framing":"chest-up energetic composition","pose_family":"announcement-pose","eye_direction":"toward story cue then lens","mouth_style":"natural expressive smile or animated speaking mouth","brow_style":"engaged, expressive","head_angle":"slight right tilt","shoulder_angle":"open square shoulders","hook_text_placement":"top_right","prompt_fragment":"Maintain a tense, urgent narrative collage and the immutable on-image hook. The subject looks neutral-to-positive; do not turn tension into anger, sadness, grief, despair, fear or misery.","active":true,"sort_order":11},{"code":"bty-short-12","name":"Listen closely","emotion_family":"urgent-neutral","valence":"neutral","energy_level":3,"tension_level":5,"facial_expression":"highly focused eyes, engaged brows and composed attentive mouth","person_positioning":"forward-leaning posture without alarm","gesture_action":"small controlled palm-up emphasis","camera_framing":"tight face-focused crop","pose_family":"focused-warning","eye_direction":"direct with a subtle sideward glance","mouth_style":"relaxed, composed and attentive","brow_style":"subtly lifted","head_angle":"mostly upright","shoulder_angle":"dynamic three-quarter angle","hook_text_placement":"top_left","prompt_fragment":"Maintain a tense, urgent narrative collage and the immutable on-image hook. The subject looks neutral-to-positive; do not turn tension into anger, sadness, grief, despair, fear or misery.","active":true,"sort_order":12},{"code":"bty-short-13","name":"Important turning point","emotion_family":"urgent-neutral","valence":"neutral","energy_level":3,"tension_level":5,"facial_expression":"concentrated alert expression, slight brow raise, no distress","person_positioning":"shoulders squared and grounded","gesture_action":"single open hand indicating a pivotal moment","camera_framing":"centered chest-up dramatic lighting","pose_family":"turning-point","eye_direction":"direct and alert","mouth_style":"relaxed, composed and attentive","brow_style":"subtly lifted","head_angle":"slight left tilt","shoulder_angle":"open square shoulders","hook_text_placement":"top_right","prompt_fragment":"Maintain a tense, urgent narrative collage and the immutable on-image hook. The subject looks neutral-to-positive; do not turn tension into anger, sadness, grief, despair, fear or misery.","active":true,"sort_order":13},{"code":"bty-short-14","name":"Intense focus","emotion_family":"urgent-neutral","valence":"neutral","energy_level":3,"tension_level":5,"facial_expression":"steady direct gaze, attentive lifted eyelids and relaxed jaw","person_positioning":"head leaned slightly forward, open shoulders","gesture_action":"minimal grounded gesture at mid-chest","camera_framing":"close facial framing","pose_family":"quiet-intensity","eye_direction":"engaged near lens","mouth_style":"relaxed, composed and attentive","brow_style":"subtly lifted","head_angle":"slight right tilt","shoulder_angle":"dynamic three-quarter angle","hook_text_placement":"top_left","prompt_fragment":"Maintain a tense, urgent narrative collage and the immutable on-image hook. The subject looks neutral-to-positive; do not turn tension into anger, sadness, grief, despair, fear or misery.","active":true,"sort_order":14},{"code":"bty-short-15","name":"The stakes are real","emotion_family":"urgent-neutral","valence":"neutral","energy_level":3,"tension_level":5,"facial_expression":"serious attentive eyes, subtle raised brows, resolved neutral mouth","person_positioning":"upright and composed presentation stance","gesture_action":"restrained outward palm to emphasize facts","camera_framing":"mid shot, strong negative space","pose_family":"measured-urgency","eye_direction":"toward story cue then lens","mouth_style":"relaxed, composed and attentive","brow_style":"subtly lifted","head_angle":"mostly upright","shoulder_angle":"open square shoulders","hook_text_placement":"top_right","prompt_fragment":"Maintain a tense, urgent narrative collage and the immutable on-image hook. The subject looks neutral-to-positive; do not turn tension into anger, sadness, grief, despair, fear or misery.","active":true,"sort_order":15},{"code":"bty-short-16","name":"Wait really","emotion_family":"disbelief","valence":"positive","energy_level":4,"tension_level":5,"facial_expression":"amused questioning brows, bright eyes and barely open smile","person_positioning":"head tipped slightly, open torso","gesture_action":"palm turned up in intrigued question","camera_framing":"three-quarter chest-up crop","pose_family":"questioning-surprise","eye_direction":"direct with a subtle sideward glance","mouth_style":"natural expressive smile or animated speaking mouth","brow_style":"engaged, expressive","head_angle":"slight left tilt","shoulder_angle":"dynamic three-quarter angle","hook_text_placement":"top_left","prompt_fragment":"Maintain a tense, urgent narrative collage and the immutable on-image hook. The subject looks neutral-to-positive; do not turn tension into anger, sadness, grief, despair, fear or misery.","active":true,"sort_order":16},{"code":"bty-short-17","name":"Intrigued disbelief","emotion_family":"disbelief","valence":"neutral","energy_level":4,"tension_level":5,"facial_expression":"curious raised eyebrow, lively eyes, composed mouth","person_positioning":"slight lean-in and angled shoulders","gesture_action":"single hand suspended as if asking how","camera_framing":"tight shoulder and face crop","pose_family":"inquisitive-lean","eye_direction":"direct and alert","mouth_style":"relaxed, composed and attentive","brow_style":"engaged, expressive","head_angle":"slight right tilt","shoulder_angle":"open square shoulders","hook_text_placement":"top_right","prompt_fragment":"Maintain a tense, urgent narrative collage and the immutable on-image hook. The subject looks neutral-to-positive; do not turn tension into anger, sadness, grief, despair, fear or misery.","active":true,"sort_order":17},{"code":"bty-short-18","name":"Delighted double take","emotion_family":"disbelief","valence":"positive","energy_level":4,"tension_level":5,"facial_expression":"delighted sideways glance with raised brows and soft grin","person_positioning":"half-turned torso with head turning back","gesture_action":"open hand mid-double-take","camera_framing":"dynamic diagonal mid-close framing","pose_family":"double-take","eye_direction":"engaged near lens","mouth_style":"natural expressive smile or animated speaking mouth","brow_style":"engaged, expressive","head_angle":"mostly upright","shoulder_angle":"dynamic three-quarter angle","hook_text_placement":"top_left","prompt_fragment":"Maintain a tense, urgent narrative collage and the immutable on-image hook. The subject looks neutral-to-positive; do not turn tension into anger, sadness, grief, despair, fear or misery.","active":true,"sort_order":18},{"code":"bty-short-19","name":"That changes everything","emotion_family":"disbelief","valence":"neutral","energy_level":4,"tension_level":5,"facial_expression":"focused curious realization, slightly widened eyes, calm mouth","person_positioning":"leaning forward and turning toward key detail","gesture_action":"one hand indicating an off-frame point","camera_framing":"dramatic off-center close-up","pose_family":"aha-disbelief","eye_direction":"toward story cue then lens","mouth_style":"relaxed, composed and attentive","brow_style":"engaged, expressive","head_angle":"slight left tilt","shoulder_angle":"open square shoulders","hook_text_placement":"top_right","prompt_fragment":"Maintain a tense, urgent narrative collage and the immutable on-image hook. The subject looks neutral-to-positive; do not turn tension into anger, sadness, grief, despair, fear or misery.","active":true,"sort_order":19},{"code":"bty-short-20","name":"Here''s the point","emotion_family":"confident","valence":"positive","energy_level":4,"tension_level":5,"facial_expression":"confident clear-eyed expression with small assured smile","person_positioning":"grounded upright posture","gesture_action":"one finger lifted for a key takeaway","camera_framing":"balanced chest-up with negative space","pose_family":"confident-point","eye_direction":"direct with a subtle sideward glance","mouth_style":"natural expressive smile or animated speaking mouth","brow_style":"engaged, expressive","head_angle":"slight right tilt","shoulder_angle":"dynamic three-quarter angle","hook_text_placement":"top_left","prompt_fragment":"Maintain a tense, urgent narrative collage and the immutable on-image hook. The subject looks neutral-to-positive; do not turn tension into anger, sadness, grief, despair, fear or misery.","active":true,"sort_order":20},{"code":"bty-short-21","name":"Knowing reveal","emotion_family":"confident","valence":"positive","energy_level":4,"tension_level":5,"facial_expression":"warm knowing half-smile and deliberate engaging eye contact","person_positioning":"slightly forward and relaxed shoulders","gesture_action":"open palm presenting the evidence","camera_framing":"medium close-up with angle","pose_family":"knowing-reveal","eye_direction":"direct and alert","mouth_style":"natural expressive smile or animated speaking mouth","brow_style":"engaged, expressive","head_angle":"mostly upright","shoulder_angle":"open square shoulders","hook_text_placement":"top_right","prompt_fragment":"Maintain a tense, urgent narrative collage and the immutable on-image hook. The subject looks neutral-to-positive; do not turn tension into anger, sadness, grief, despair, fear or misery.","active":true,"sort_order":21},{"code":"bty-short-22","name":"Ready to explain","emotion_family":"confident","valence":"positive","energy_level":4,"tension_level":5,"facial_expression":"engaged steady gaze and upbeat assured expression","person_positioning":"animated but controlled forward posture","gesture_action":"one hand tracing a concise explanation","camera_framing":"tight three-quarter portrait crop","pose_family":"confident-explainer","eye_direction":"engaged near lens","mouth_style":"natural expressive smile or animated speaking mouth","brow_style":"engaged, expressive","head_angle":"slight left tilt","shoulder_angle":"dynamic three-quarter angle","hook_text_placement":"top_left","prompt_fragment":"Maintain a tense, urgent narrative collage and the immutable on-image hook. The subject looks neutral-to-positive; do not turn tension into anger, sadness, grief, despair, fear or misery.","active":true,"sort_order":22},{"code":"bty-short-23","name":"Breakthrough optimism","emotion_family":"hopeful","valence":"positive","energy_level":4,"tension_level":5,"facial_expression":"eyes alight with determined hope and restrained genuine smile","person_positioning":"upright with shoulders back","gesture_action":"open palm lifting toward the story''s positive turn","camera_framing":"chest-up heroic diagonal angle","pose_family":"hopeful-breakthrough","eye_direction":"toward story cue then lens","mouth_style":"natural expressive smile or animated speaking mouth","brow_style":"engaged, expressive","head_angle":"slight right tilt","shoulder_angle":"open square shoulders","hook_text_placement":"top_right","prompt_fragment":"Maintain a tense, urgent narrative collage and the immutable on-image hook. The subject looks neutral-to-positive; do not turn tension into anger, sadness, grief, despair, fear or misery.","active":true,"sort_order":23},{"code":"bty-short-24","name":"Determined momentum","emotion_family":"hopeful","valence":"positive","energy_level":4,"tension_level":5,"facial_expression":"bright focused eyes, energized resolved smile, brows engaged","person_positioning":"leaning confidently toward the viewer","gesture_action":"subtle forward-reaching open hand","camera_framing":"tight dynamic centered portrait","pose_family":"positive-determination","eye_direction":"direct with a subtle sideward glance","mouth_style":"natural expressive smile or animated speaking mouth","brow_style":"engaged, expressive","head_angle":"mostly upright","shoulder_angle":"dynamic three-quarter angle","hook_text_placement":"top_left","prompt_fragment":"Maintain a tense, urgent narrative collage and the immutable on-image hook. The subject looks neutral-to-positive; do not turn tension into anger, sadness, grief, despair, fear or misery.","active":true,"sort_order":24}]'::jsonb) AS j (
 code text,name text,emotion_family text,valence text,active boolean,sort_order int,energy_level smallint,
 tension_level smallint,facial_expression text,person_positioning text,gesture_action text,camera_framing text,
 pose_family text,eye_direction text,mouth_style text,brow_style text,head_angle text,shoulder_angle text,
 hook_text_placement text,prompt_fragment text
)
ON CONFLICT(tenant_id,code) DO UPDATE SET
 name=EXCLUDED.name,emotion_family=EXCLUDED.emotion_family,valence=EXCLUDED.valence,
 active=EXCLUDED.active,sort_order=EXCLUDED.sort_order,energy_level=EXCLUDED.energy_level,
 tension_level=EXCLUDED.tension_level,facial_expression=EXCLUDED.facial_expression,
 person_positioning=EXCLUDED.person_positioning,gesture_action=EXCLUDED.gesture_action,
 camera_framing=EXCLUDED.camera_framing,pose_family=EXCLUDED.pose_family,
 eye_direction=EXCLUDED.eye_direction,mouth_style=EXCLUDED.mouth_style,brow_style=EXCLUDED.brow_style,
 head_angle=EXCLUDED.head_angle,shoulder_angle=EXCLUDED.shoulder_angle,
 hook_text_placement=EXCLUDED.hook_text_placement,prompt_fragment=EXCLUDED.prompt_fragment,
 updated_at=now();

-- Service-only assignment: locks rotation, validates workflow/hook, writes denormalized
-- metadata + immutable usage audit in a single transaction, so simultaneous jobs cannot
-- choose the same newly used preset.
CREATE OR REPLACE FUNCTION public.assign_bty_short_expression(
 p_clip_id uuid,p_tenant_id uuid,p_workflow_revision integer,
 p_hook_fingerprint text,p_metadata_fingerprint text,p_primary_speaker text,
 p_core_visual text,p_hook_placement text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
 c public.ai_operations_video_clips%ROWTYPE;
 p public.ai_operations_thumbnail_expression_presets%ROWTYPE;
 revision integer;
 how text;
 randomize integer;
BEGIN
 IF p_primary_speaker IS NULL OR btrim(p_primary_speaker)='' OR
    p_metadata_fingerprint IS NULL OR btrim(p_metadata_fingerprint)='' THEN
   RAISE EXCEPTION 'Missing expression assignment arguments';
 END IF;
 -- Prevent two simultaneous jobs from picking the same preset despite short queues.
 PERFORM pg_advisory_xact_lock(hashtextextended('bty-expression:'||p_tenant_id::text,0));
 SELECT * INTO c FROM public.ai_operations_video_clips WHERE id=p_clip_id FOR UPDATE;
 IF NOT FOUND OR c.clip_type<>'short' OR c.workflow_revision<>p_workflow_revision OR
    c.hook_input_fingerprint IS DISTINCT FROM p_hook_fingerprint OR
    c.hook_text IS NULL OR btrim(c.hook_text)='' THEN
    RAISE EXCEPTION 'Stale or invalid short expression assignment';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.ai_operations_video_projects v
   WHERE v.id=c.project_id AND v.tenant_id=p_tenant_id) THEN
   RAISE EXCEPTION 'Project tenant mismatch';
 END IF;
 IF c.thumbnail_metadata_input_fingerprint=p_metadata_fingerprint
    AND c.thumbnail_expression_preset_id IS NOT NULL THEN
  RETURN jsonb_build_object('preset_id',c.thumbnail_expression_preset_id,
    'revision',c.thumbnail_generation_revision,'reused',true);
 END IF;
 IF c.thumbnail_expression_locked AND c.thumbnail_expression_preset_id IS NOT NULL THEN
   SELECT * INTO p FROM public.ai_operations_thumbnail_expression_presets
     WHERE id=c.thumbnail_expression_preset_id AND tenant_id=p_tenant_id AND active=true;
   IF NOT FOUND THEN RAISE EXCEPTION 'Locked preset missing/inactive'; END IF;
   how:='locked_preset';
 ELSE
   WITH recent AS (
     SELECT u.*, row_number() OVER(ORDER BY selected_at DESC,id DESC) AS rn
     FROM public.ai_operations_thumbnail_expression_usage u
     WHERE u.tenant_id=p_tenant_id
   ), ranking AS (
     SELECT x.id,
       COALESCE((SELECT count(*) FROM recent r WHERE r.rn<=8 AND r.preset_id=x.id),0) AS same_recent,
       COALESCE((SELECT count(*) FROM recent r WHERE r.rn<=6 AND r.emotion_family=x.emotion_family),0) AS family_recent,
       COALESCE((SELECT count(*) FROM recent r WHERE r.selected_at>now()-interval '14 days'
         AND lower(r.speaker_name)=lower(p_primary_speaker) AND r.preset_id=x.id),0) AS same_speaker_recent,
       COALESCE((SELECT count(*) FROM recent r WHERE r.preset_id=x.id),0) AS use_count,
       COALESCE((SELECT count(*) FROM recent r WHERE r.emotion_family=x.emotion_family),0) AS family_all
     FROM public.ai_operations_thumbnail_expression_presets x
     WHERE x.tenant_id=p_tenant_id AND x.active=true AND x.valence<>'negative'
       AND x.energy_level>=3 AND x.tension_level>=3
   )
   SELECT a.* INTO p FROM public.ai_operations_thumbnail_expression_presets a
   JOIN ranking r ON r.id=a.id
   ORDER BY
     CASE WHEN r.same_recent=0 AND r.family_recent<2 AND r.same_speaker_recent=0 THEN 0
          WHEN r.same_recent=0 AND r.family_recent<2 THEN 1
          WHEN r.same_recent=0 THEN 2 ELSE 3 END,
     r.family_recent,r.same_speaker_recent,r.use_count,r.family_all,
     a.sort_order;
   IF NOT FOUND THEN RAISE EXCEPTION 'No active nonnegative Short expression presets'; END IF;
   how:='controlled_rotation_v1';
 END IF;
 revision:=coalesce(c.thumbnail_generation_revision,0)+1;
 UPDATE public.ai_operations_video_clips SET
   primary_speaker=p_primary_speaker,
   person_positioning=p.person_positioning,
   facial_expression=p.facial_expression,
   gesture_action=p.gesture_action,camera_framing=p.camera_framing,
   pose_family=p.pose_family,core_visual=coalesce(p_core_visual,''),
   hook_text_placement=coalesce(nullif(p_hook_placement,''),p.hook_text_placement),
   thumbnail_expression_preset_id=p.id,
   thumbnail_expression_family=p.emotion_family,
   thumbnail_expression_selection_reason=how,
   thumbnail_expression_selection_version=1,
   thumbnail_expression_selected_at=now(),
   thumbnail_generation_revision=revision,
   thumbnail_metadata_input_fingerprint=p_metadata_fingerprint,
   thumbnail_input_fingerprint=NULL,
   cover_image_file_id=NULL,cover_image_url=NULL,
   pipeline_status='thumbnail_metadata_ready',
   last_progress_at=now(),updated_at=now()
 WHERE id=c.id;
 INSERT INTO public.ai_operations_thumbnail_expression_usage
   (tenant_id,project_id,clip_id,preset_id,speaker_name,emotion_family,generation_revision,selection_reason)
 VALUES (p_tenant_id,c.project_id,c.id,p.id,p_primary_speaker,p.emotion_family,revision,how);
 RETURN jsonb_build_object('preset_id',p.id,'code',p.code,'name',p.name,
    'emotion_family',p.emotion_family,'valence',p.valence,'reason',how,'revision',revision);
END;
$$;
REVOKE ALL ON FUNCTION public.assign_bty_short_expression(uuid,uuid,integer,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assign_bty_short_expression(uuid,uuid,integer,text,text,text,text,text) TO service_role;
