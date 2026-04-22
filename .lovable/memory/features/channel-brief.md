---
name: Channel brief instruction scope
description: Onboarding step 2 channel brief stored as user_content_instructions scope=channel_brief
type: feature
---

The user's channel description (what their channel is about, audience, tone, topics, taglines) is captured in onboarding step 2 and stored as a row in `user_content_instructions` with `scope = 'channel_brief'`.

A default placeholder row exists in `content_instruction_defaults` with the same scope, so it's auto-seeded for new users via the `seed_user_instructions` trigger and shows up in `InstructionsView` (Settings → Instructions) labeled "Channel Brief". Users can edit or restore the default at any time.

The AI generation pipeline already pulls all active rows from `user_content_instructions` for the user, so the channel brief is automatically included in idea + script prompts without any additional code changes.
