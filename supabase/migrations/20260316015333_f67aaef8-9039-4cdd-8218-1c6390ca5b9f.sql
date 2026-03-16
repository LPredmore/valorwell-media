
-- Add parent tracking to both tables
ALTER TABLE social_content
  ADD COLUMN parent_content_id uuid REFERENCES social_content(id) ON DELETE SET NULL;

ALTER TABLE posted_content
  ADD COLUMN parent_content_id uuid;

-- Prevent duplicate instruction scopes
ALTER TABLE content_instructions
  ADD CONSTRAINT content_instructions_scope_unique UNIQUE (scope);

-- Seed the extraction instruction
INSERT INTO content_instructions (scope, instruction, is_active)
VALUES ('shorts_extraction', 'You are a Shorts Strategist. Given a long-form video script, extract 3-5 compelling standalone short-form video segments.

Each segment should:
- Be a self-contained story or insight that works without context from the full video
- Be 30-60 seconds when spoken aloud (roughly 75-150 words)
- Open with a strong hook that grabs attention in the first 2 seconds
- End with a clear takeaway, call to action, or thought-provoking statement
- Include a "Bridge CTA" — a brief mention encouraging viewers to watch the full video for more depth (e.g., "I go deeper on this in the full video" or "There''s a lot more to this story")
- Preserve the speaker''s voice, tone, and style from the original script
- Focus on the most emotionally resonant, surprising, or practically useful moments

Prioritize segments that will perform well as YouTube Shorts, TikTok, and Instagram Reels.', true)
ON CONFLICT (scope) DO NOTHING;
