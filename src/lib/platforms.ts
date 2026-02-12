export const PLATFORMS = {
  youtube_video: { label: "YouTube Video", icon: "Youtube" },
  youtube_short: { label: "YouTube Short", icon: "Youtube" },
  tiktok: { label: "TikTok", icon: "Music2" },
  instagram_reel: { label: "Instagram Reel", icon: "Instagram" },
  x: { label: "X (Twitter)", icon: "Twitter" },
  linkedin: { label: "LinkedIn", icon: "Linkedin" },
  facebook: { label: "Facebook", icon: "Facebook" },
} as const;

export type PlatformKey = keyof typeof PLATFORMS;

export const FORMAT_PLATFORMS: Record<string, PlatformKey[]> = {
  long: ["youtube_video", "x", "linkedin", "facebook"],
  short: ["youtube_short", "tiktok", "instagram_reel", "x", "linkedin", "facebook"],
};

export const HASHTAG_LIMITS: Record<PlatformKey, number> = {
  youtube_video: 15,
  youtube_short: 12,
  tiktok: 15,
  instagram_reel: 20,
  x: 3,
  linkedin: 7,
  facebook: 10,
};

export const JOB_STATUSES = ["new", "ready", "processing", "completed", "error"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
