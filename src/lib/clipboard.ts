export function formatPlatformOutput(title: string | null, body: string | null, hashtags: string[] | null): string {
  const parts: string[] = [];
  if (title) parts.push(title);
  if (body) parts.push(body);
  if (hashtags && hashtags.length > 0) parts.push(hashtags.join(" "));
  return parts.join("\n\n");
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
