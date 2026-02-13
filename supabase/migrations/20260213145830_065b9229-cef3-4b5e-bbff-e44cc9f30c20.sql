
-- ============================================================
-- 1. Restructure social_content table
-- ============================================================

-- Drop existing data (table is empty / test data only)
DROP TABLE IF EXISTS public.social_content CASCADE;

CREATE TABLE public.social_content (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL,
  topic                  text NOT NULL,
  status                 text NOT NULL DEFAULT 'new',
  youtube_title          text,
  youtube_desc           text,
  facebook_desc          text,
  linkedin_desc          text,
  ig_tiktok_desc         text,
  image                  text,
  video_url              text,
  video_storage_path     text,
  video_original_filename text,
  video_mime_type        text,
  error                  text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.social_content ENABLE ROW LEVEL SECURITY;

-- RLS: owner access
CREATE POLICY "Users can select own content"
  ON public.social_content FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own content"
  ON public.social_content FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own content"
  ON public.social_content FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own content"
  ON public.social_content FOR DELETE
  USING (auth.uid() = user_id);

-- RLS: admin overrides
CREATE POLICY "Admins can select all content"
  ON public.social_content FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert all content"
  ON public.social_content FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update all content"
  ON public.social_content FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete all content"
  ON public.social_content FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- updated_at trigger
CREATE TRIGGER set_social_content_updated_at
  BEFORE UPDATE ON public.social_content
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 2. Create content_instructions table
-- ============================================================

CREATE TABLE public.content_instructions (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scope       text NOT NULL,
  instruction text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.content_instructions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated select"
  ON public.content_instructions FOR SELECT
  USING (true);

CREATE POLICY "Admin insert"
  ON public.content_instructions FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin update"
  ON public.content_instructions FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin delete"
  ON public.content_instructions FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER set_content_instructions_updated_at
  BEFORE UPDATE ON public.content_instructions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 3. Seed content_instructions
-- ============================================================

INSERT INTO public.content_instructions (scope, instruction) VALUES
('global', E'When the user provides a single input TOPIC, generate platform-optimized metadata for a video post aimed at veterans, military families/spouses, supporters of those who served, and micro-creators who want a mission-driven cause. The tone should be confident, practical, and action-oriented—mission-forward without hype.\n\nIf the user optionally includes: goal (donations / creator applications / awareness / recruitment) and link/CTA destination, use it; otherwise default CTA is: "Go to ValorWell.org".\n\nIf the user provides only TOPIC, assume: goal = "awareness + action", CTA destination = "ValorWell.org", audience = veterans, military families, supporters, micro-creators, plus LinkedIn professionals. Proceed without asking follow-up questions.\n\nDo not make medical promises or guarantees. Use phrasing like "support," "connect to care," "help navigating access," "bridge the gap," not "cure," "treat," "fix."'),

('youtube_title', E'55–75 characters (aim for clarity + curiosity).\nInclude at least one high-intent keyword relevant to the TOPIC in natural language.\nAvoid clickbait ("SHOCKING," "YOU WON''T BELIEVE").'),

('youtube_desc', E'Target 1,800–2,500 characters (not including hashtags).\nFirst 2 lines must be a strong hook and include the TOPIC in natural language.\nInclude a short "Why this matters" paragraph tied to veterans/military families.\nInclude 3–6 bullet points with practical takeaways or what viewers will learn.\nInclude a clear CTA near the top and again near the bottom:\n  Default CTA: "Go to ValorWell.org"\n  If goal is donations: "Donate / sponsor sessions"\n  If goal is creators: "Creators: apply to join the next competition"\nThe description should be keyword heavy, especially the first 300 characters, with keywords specifically for this topic/demographic.\nFinish with 5 hashtags.\nUse clean spacing; no walls of text.'),

('facebook_desc', E'Target 600–1,200 characters.\nMore conversational than YouTube, but still mission-forward.\nUse short paragraphs and 1–3 bullets maximum.\nInclude one clear CTA (default: ValorWell.org).\nDo not reuse the YouTube description verbatim. Rephrase for Facebook''s feed.\nThe description should be keyword heavy, especially the first 300 characters, with keywords specifically for this topic/demographic.\nFinish with 5 hashtags.'),

('linkedin_desc', E'Target 900–1,600 characters.\nAudience emphasis: professionals, partners, donors, veteran advocates, clinicians/therapists, community leaders, and mission-aligned creators.\nTone: credible, professional, impact-oriented; avoid slang, avoid "trend bait," avoid aggressive language.\nStructure:\n  1–2 line hook that frames the problem and the TOPIC\n  2–3 short paragraphs that explain the "bridge" concept and why it matters\n  Optional: 1 short bullet list (2–4 bullets) for clarity\n  One clear CTA (ValorWell.org). If goal is donations, include "Sponsor a session" language. If goal is creators, include "Creator challenge / competition" language.\nPrefer concrete phrasing like "access," "timelines," "care navigation," "community-funded support," "continuity of care."\nDo not attack the VA or institutions; keep it "gap-focused" and solutions-oriented.\nThe description should be keyword heavy, especially the first 300 characters.\nFinish with 5 hashtags.'),

('ig_tiktok_desc', E'Must be 200–300 characters total (including spaces, excluding hashtags).\nStructure:\n  1 hook sentence\n  1 mission/impact sentence\n  1 CTA sentence\nKeep it punchy and readable. No jargon walls.'),

('hashtags', E'For each platform, generate exactly 5 hashtags that are newly selected per post and tailored to the TOPIC.\nHashtags must be relevant; avoid generic filler like #fyp unless the TOPIC strongly suggests it.\nBalance:\n  2 "core audience" tags (veterans/military families/support)\n  2 "topic-specific" tags (based on TOPIC)\n  1 "action" tag (donate/fundraise/creator challenge/support)\nAvoid sensitive/controversial unrelated trend tags.\nPrefer CamelCase hashtags (e.g., #VeteranMentalHealth).\nDo not exceed 25 characters per hashtag when possible.\nIf a topic implies regulated claims, choose safer phrasing (#MentalHealthSupport instead of #PTSDTreatment, etc.).\nLinkedIn hashtags should skew more professional and partnership-friendly.');

-- ============================================================
-- 4. Drop old functions and triggers that reference deleted tables
-- ============================================================

DROP FUNCTION IF EXISTS public.init_platform_outputs_for_job() CASCADE;
DROP FUNCTION IF EXISTS public.owns_job(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.validate_content_job_status() CASCADE;
