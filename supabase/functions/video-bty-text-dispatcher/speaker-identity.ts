/** Ground BTY visual speaker identity in verified recording participants.
 * The multicamera input has one host channel and one guest channel. When
 * several guests share that channel, it does NOT identify which individual
 * voice spoke a sentence. Keep the verified guest group as the visual identity.
 */
export function verifiedGuestParticipants(group: string): string[] {
  return group.trim().split(/\s+(?:and|&)\s+/i).map(name => name.trim()).filter(Boolean);
}
function canon(raw: string): string {
  return String(raw || "").normalize("NFKC").replace(/\([^)]*\)/g, " ")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
export function resolveThumbnailSpeaker(
  proposed: string, guestGroup: string, type: "short" | "part",
): string | null {
  const group = guestGroup.trim();
  if (type === "part") return group || null;
  const raw = canon(proposed);
  if (!raw) return null;
  if (["luke", "luke predmore", "host"].includes(raw)) return "Luke Predmore";
  if (!group) return null;
  if (raw === canon(group) || raw === "guest" || raw === "guests" ||
      raw === "the guest" || raw === "the guests") return group;
  const members = verifiedGuestParticipants(group);
  const names = members.map(full => canon(full));
  // First-name-only identification is safe ONLY as a verified group label,
  // and only when that first name identifies one member unambiguously.
  function identifiesVerifiedMember(value: string): boolean {
    return names.some((name, index) => {
      const first = name.split(" ")[0];
      return value === name ||
        (value === first && names.filter(n => n.split(" ")[0] === first).length === 1);
    });
  }
  if (identifiesVerifiedMember(raw)) return group;
  // e.g. "Scott and Karolyn" also identifies the verified guest camera group.
  const parts = raw.split(/\s+and\s+/).filter(Boolean);
  if (parts.length > 1 && parts.every(identifiesVerifiedMember)) return group;
  return null; // Unknown names stay rejected; don't invent an identity.
}
