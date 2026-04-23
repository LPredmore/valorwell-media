# Memory: index.md
Updated: today

# Project Memory

## Core
- AI script writer & social media generator. Branded as **Flurra** (domain: getflurra.com), positioned as an AI teammate, not a tool.
- UI: Dark-first, deep navy `#101A2B` base with electric cyan/cobalt/mint brand gradient. Space Grotesk for display, Inter for body. Use `text-brand-gradient` for wordmark.
- First-person voice ("I'll…", "Hook me up…") on auth, onboarding, empty states, banners — NOT on buttons/table headers.
- Mascot at `src/assets/flurra-mascot.png` — auth/onboarding/header only.
- Storage: Cloudflare R2 for large videos (up to 5GB, 1hr length).
- Timezone: 'America/Chicago' (CST/CDT) for all scheduling and promotion logic.
- Admin Email: info@valorwell.org (used for script delivery).
- **Posting**: 100% via Upload-Post API across 10 platforms (TikTok, Instagram, YouTube, LinkedIn, Facebook, X, Threads, Pinterest, Reddit, Bluesky). 1 user = 1 tenant = 1 Upload-Post profile, provisioned async on signup. NO Fly.io, NO Publer, NO per-user Google OAuth.
- Auth: email/password only. No social sign-in.
- **Subscription required**: $15/mo or $9.99/mo annual via Stripe Embedded Checkout. SubscriptionGuard wraps /schedule, /ideas, /content/*, /instructions. /settings stays open so users can reach Billing tab.

## Memories
- [Flurra Brand](mem://design/flurra-brand) — Name, colors, typography, voice, mascot rules
- [Roles & Permissions](mem://auth/roles-and-permissions) — Admin roles and authentication rules
- [Database Schema](mem://database/schema-management) — Sync triggers between social_content and posted_content
- [Scheduling Logic](mem://features/scheduling-logic-and-promotion) — Auto-promote to unscheduled, timezone handling, immediate post
- [Content Views](mem://ui/content-management-views) — Consolidated /schedule tabs, real-time status panel
- [Cloudflare R2 Storage](mem://storage/cloudflare-r2) — S3 multipart uploads, XHR progress tracking for large files
- [Prompts & Instructions](mem://features/prompts-and-instructions) — Scoped prompts in content_instructions table
- [Channel Brief](mem://features/channel-brief) — Onboarding step 2 saves to user_content_instructions scope=channel_brief
- [Subscription Billing](mem://features/subscription-billing) — Stripe paywall, gating, billing tab, edge functions
- [Comp Accounts](mem://operations/comp-accounts) — SQL templates to grant/revoke permanent free access via subscribers.tier='comp'
- [Media Lightbox](mem://ui/media-lightbox) — Global ImageLightbox with blob conversion for safe downloads
- [Upload-Post Architecture](mem://integrations/upload-post-architecture) — Multi-tenant 10-platform posting via Upload-Post hosted OAuth + 6 edge fns + 2 cron jobs
- [Mobile Responsiveness](mem://ui/mobile-responsiveness) — Single-line truncation, hidden secondary columns
- [Tech Stack Overview](mem://project/tech-stack-overview) — OpenRouter GPT-4o-mini, browser Web Speech API
- [Ideas Management](mem://features/ideas-management) — CSV RFC 4180 upload, long-form derivation trigger
- [AI Pipeline](mem://features/ai-generation-pipeline) — Sequential Edge Function loop for 1:N Shorts extraction
- [Script Notifications](mem://features/script-delivery-notifications) — Resend API email formatting and delivery
- [Vite Config](mem://tech/vite-config) — optimizeDeps React/Tanstack Query deduplication
