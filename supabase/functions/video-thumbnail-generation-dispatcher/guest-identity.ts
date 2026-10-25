/** Pure identity contract, shared by the dispatcher and its tests. */
export type GuestReference = {
  id: string; display_name: string; sort_order: number;
  reference_image_file_id: string | null; reference_image_url: string | null;
  reference_status: string; reference_source_type: string | null;
};
export type GuestManifest = { multi: boolean; ready: boolean; fingerprint: string; guests: GuestReference[] };
export function requireIndependentReferences(manifest: GuestManifest): GuestReference[] {
  if (!manifest.multi) return [];
  const guests = [...manifest.guests].sort((a,b) => a.sort_order-b.sort_order || a.id.localeCompare(b.id));
  const sources = guests.map(g => {
    const url=g.reference_image_url?.trim()||'';
    const driveId=g.reference_image_file_id?.trim() || url.match(/^https?:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/)?.[1] ||
      (/^https?:\/\/drive\.google\.com\//.test(url)?url.match(/[?&]id=([A-Za-z0-9_-]+)/)?.[1]:null);
    return driveId?'drive:'+driveId:url?'url:'+url:null;
  });
  if (!manifest.ready || guests.length < 2 || guests.some(g => g.reference_status !== 'approved') ||
      sources.some(s => !s) || new Set(sources).size !== guests.length) {
    throw new Error('Independent approved references are required for every guest.');
  }
  return guests;
}
export function multiGuestRules(guests: GuestReference[]): string {
  if (guests.length < 2) return '';
  return [
    'MULTI-GUEST IDENTITY RULES (HIGHEST PRIORITY; override singular template wording):',
    ...guests.map((g,i) => `Image ${String.fromCharCode(65+i)} = ${g.display_name} identity reference. This image identifies ONLY ${g.display_name}.`),
    'Preserve each identity independently. All listed guests must appear and be recognizable as separate, equal co-subjects; both guests must be recognizable for a two-guest episode.',
    'Do not merge faces, blend identities, substitute people, or invent approximations. Never use a combined photo as the sole identity reference.',
    'Do not include Luke Predmore/the host unless explicitly requested with his own labeled identity reference. Do not add other recognizable people.',
    'Fit every required face within the composition without cropping a face. Pose and expression guidance applies independently to each guest.',
  ].join('\n');
}
