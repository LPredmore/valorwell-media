begin;

update public.ai_operations_video_prompt_profiles
set is_active=false,updated_at=now()
where tenant_id='00000000-0000-0000-0000-000000000001'
  and profile_key='bty_image_part'
  and is_active=true;

insert into public.ai_operations_video_prompt_profiles(
  tenant_id,profile_key,version,is_active,system_prompt,instruction_prompt,config,created_at,updated_at
) values(
  '00000000-0000-0000-0000-000000000001',
  'bty_image_part',
  4,
  true,
  'You are the art-direction layer for a finished Beyond The Yellow long-form Part thumbnail. Translate the supplied structured creative brief, the guest reference image, and the Part transcript into one production-ready image-generation prompt. The episode guest is the ONLY visible recognizable person in the finished thumbnail. Preserve the guest''s recognizable identity and preserve the exact hook text verbatim. Never add Luke Predmore/the host or any second recognizable person.

Every Long Form Part thumbnail uses the same controlled high-contrast production palette:
- Emergency Red: #FF3333 as the primary alarm/focal red; #FF0000 may be used only for the hottest urgency accent.
- Electric Cyan: #00E5FF as the dominant cyan/teal contrast field; #00FFFF may be used for the brightest cyan highlight.
- Pure OLED Black: #000000 as the structural background and negative-space base.

This palette governs graphic design, background fields, lighting accents, typography emphasis, borders, glow, symbols, and visual hierarchy. It must NOT unnaturally recolor the guest''s skin, hair, eyes, or identity-defining features.',
  'Create a finished 16:9 YouTube thumbnail using the same high-energy reaction-thumbnail philosophy as the Beyond The Yellow Shorts thumbnails, adapted for a single-person long-form composition centered entirely on the episode guest.

REFERENCE IMAGE RULES:
- Reference Image A is the episode guest identified in the creative brief.
- The guest MUST be visibly and recognizably the primary subject.
- The guest is the ONLY visible recognizable person.
- Do NOT include Luke Predmore/the host, a second talking head, another recognizable face, a host silhouette, or a staged two-person interaction.
- Preserve the guest''s identity from the supplied reference image. Do not substitute or blend faces.

MANDATORY COLOR SYSTEM:
- PURE OLED BLACK #000000 is the structural base and negative space. Use it aggressively to isolate the guest, hook, and focal elements from the YouTube interface.
- ELECTRIC CYAN #00E5FF is the dominant contrast/background color. #00FFFF may be used as the brightest cyan highlight or edge light.
- EMERGENCY RED #FF3333 is the scarce focal/alarm color. #FF0000 may be used only for the strongest urgency point.
- Red must remain scarce enough to feel dangerous. Do NOT wash the whole thumbnail in red.
- Cyan should create the main chromatic field or high-tech contrast environment.
- Black should create hard separation, negative space, deep shadows, or bordering.
- As a design target, favor roughly 45-60% black/near-black structure, 25-40% cyan field/highlights, and 5-15% red focal accents. Treat these as visual-balance guidance, not literal pixel accounting.
- Do not introduce competing saturated palette colors such as green, purple, orange, or yellow.
- Natural photographic colors are allowed where necessary to preserve the guest''s real skin tone, hair, clothing, or story-specific objects.
- White #FFFFFF may be used sparingly ONLY when typography legibility requires it; white is a utility neutral, not a fourth design color.
- For hook typography, use black/cyan/white for the readable base and reserve red for the most emotionally explosive word or very small number of words when that improves impact.

CREATIVE DIRECTION:
- Use the exact on-image hook verbatim. Do not rewrite, extend, paraphrase, or correct it.
- Make the hook visually aggressive, immediately legible on mobile, and integrated into the composition.
- Make the guest''s expression, pose, eyeline, gesture, scale, and framing exaggeratedly relevant to the actual Part.
- Favor visual dynamics such as disbelief, shock, tension, revelation, anger, grief, relief, urgency, or contradiction when the transcript supports them.
- Build background imagery and visual metaphor around the specific story in this Part, not a generic podcast studio.
- Use strong subject separation, layered depth, and a premium scroll-stopping composition.
- Use props, environmental cues, typography, lighting, framing, or symbolic background elements for visual complexity instead of adding a second person.
- The red/cyan/black color system should strengthen the story rather than become decorative noise.
- Do not make the result look like a stretched Shorts thumbnail or a reusable podcast template.
- Do not depict an event, object, consequence, or interaction that the transcript does not support.
- Treat typography as part of the finished image.

The result should feel like a dramatic, high-stakes visual moment built around the guest alone, with violent red-vs-cyan contrast isolated by OLED black, and make the viewer need to know what happened in this Part.',
  '{"width":1280,"height":720,"palette":{"contrast_hot":"#00FFFF","utility_white":"#FFFFFF","negative_space":"#000000","focal_alarm_hot":"#FF0000","contrast_primary":"#00E5FF","focal_alarm_primary":"#FF3333"},"guest_only":true,"aspect_ratio":"16:9","include_host":false,"include_guest":true,"palette_roles":{"red":"scarce_focal_alarm","cyan":"dominant_contrast_field","black":"structural_base_negative_space","white":"typography_utility_only"},"palette_locked":true,"palette_version":1,"exact_hook_required":true,"two_person_composition":false,"shorts_style_philosophy":true,"palette_balance_guidance":{"red_percent":"5-15","cyan_percent":"25-40","black_percent":"45-60"},"required_reference_images":1,"single_person_composition":true,"preserve_natural_subject_color":true,"prohibit_competing_saturated_hues":true}'::jsonb,
  now(),now()
)
on conflict (tenant_id,profile_key,version) do nothing;

update public.ai_operations_video_clips c
set thumbnail_input_fingerprint=private.ai_operations_video_sha256_json(jsonb_build_object(
      'step','generate_thumbnail_v6_guest_only_part',
      'clip_id',c.id,
      'clip_type',c.clip_type,
      'workflow_revision',c.workflow_revision,
      'hook_input_fingerprint',c.hook_input_fingerprint,
      'thumbnail_metadata_input_fingerprint',c.thumbnail_metadata_input_fingerprint,
      'hook_text',c.hook_text,
      'primary_speaker',c.primary_speaker,
      'person_positioning',c.person_positioning,
      'facial_expression',c.facial_expression,
      'gesture_action',c.gesture_action,
      'camera_framing',c.camera_framing,
      'pose_family',c.pose_family,
      'core_visual',c.core_visual,
      'hook_text_placement',c.hook_text_placement,
      'generation_revision',c.thumbnail_generation_revision,
      'aspect_ratio','16:9',
      'image_model',s.image_model_id,
      'text_model',s.text_model_id,
      'prompt_profile','bty_image_part',
      'prompt_version',4,
      'ai_config_revision',s.ai_config_revision,
      'host_reference_file_id',null,
      'guest_name',p.guest_name,
      'guest_image_url',p.guest_image_url
    )),
    updated_at=now()
from public.ai_operations_video_projects p
join public.ai_operations_video_settings s on s.tenant_id=p.tenant_id
where p.id=c.project_id
  and p.tenant_id='00000000-0000-0000-0000-000000000001'
  and c.clip_type='part'
  and c.cover_image_file_id is not null
  and c.thumbnail_input_fingerprint is not null;

commit;
