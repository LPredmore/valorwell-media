"""Independent, authentic guest portraits. Unknown name-to-face mappings fail closed.

128-D dlib embeddings cluster faces across sampled frames. A source speaker label
can identify a cluster ONLY when exactly one person appears throughout that source.
Shared-camera footage requires an operator-verified anchor per guest; cluster order,
clothing and left/right guesses never assign names automatically.
"""
from __future__ import annotations

import math
import subprocess
import tempfile
from pathlib import Path
from guest_portrait import candidate_times, crop_box


class ReviewRequired(ValueError):
    pass


def distance(a, b):
    if len(a) != len(b) or not a or not all(math.isfinite(float(x)) for x in (*a, *b)):
        raise ReviewRequired("Invalid face embedding")
    return math.sqrt(sum((float(x)-float(y))**2 for x, y in zip(a, b)))


def cluster_faces(candidates, threshold=0.45):
    """Complete-link clustering avoids joining people through a chain of lookalikes."""
    clusters = []
    for candidate in candidates:
        matches = [c for c in clusters if all(distance(candidate['embedding'], x['embedding']) <= threshold for x in c)]
        if len(matches) > 1:
            raise ReviewRequired("Ambiguous face cluster overlap")
        if matches:
            matches[0].append(candidate)
        else:
            clusters.append([candidate])
    return clusters


def select_guest_clusters(guests, candidates, anchors=None):
    clusters = cluster_faces(candidates)
    selected = {}
    used = set()
    for guest in guests:
        anchors_for_guest = (anchors or {}).get(guest['id'])
        aliases = {str(n).strip().casefold() for n in [guest['display_name'], *guest.get('speaker_aliases', [])]}
        if anchors_for_guest:
            matches = [i for i,c in enumerate(clusters) if any(x.get('anchor_guest_id') == guest['id'] for x in c)]
        else:
            source_ids = {x['source_id'] for x in candidates if x.get('speaker', '').strip().casefold() in aliases}
            matches = [i for i,c in enumerate(clusters) if any(x['source_id'] in source_ids for x in c)]
        if len(matches) != 1 or matches[0] in used:
            raise ReviewRequired(f"Cannot confidently assign a unique face cluster to {guest['display_name']}")
        index = matches[0]
        cluster = clusters[index]
        # Separate timestamps must corroborate the identity; an anchor alone is not enough.
        if len({(x['source_id'], x['time']) for x in cluster if not x.get('is_anchor')}) < 3:
            raise ReviewRequired(f"Insufficient independent frames for {guest['display_name']}")
        usable = [x for x in cluster if x['quality'] >= .65 and x['isolated_crop']]
        if not usable:
            raise ReviewRequired(f"No sharp, isolated crop for {guest['display_name']}")
        selected[guest['id']] = max(usable, key=lambda x: x['quality'])
        used.add(index)
    return selected


def sample_source(path, source, anchors=None):
    import cv2
    import face_recognition
    import dlib
    from core import probe
    duration = probe(path)['duration']
    times = [(t, None) for t in candidate_times(duration, 24)]
    times += [(float(a['time_seconds']), gid) for gid,a in (anchors or {}).items() if a['source_file_id'] == source['id']]
    candidates = []
    for timestamp, anchor_id in times:
        with tempfile.TemporaryDirectory(prefix='bty-faces-') as temp:
            frame_path = Path(temp) / 'frame.jpg'
            subprocess.run(['ffmpeg','-hide_banner','-nostdin','-loglevel','error','-y',
                            '-ss',str(timestamp),'-i',str(path),'-frames:v','1','-vf','scale=1280:-2',str(frame_path)],
                           check=True, capture_output=True, timeout=100)
            frame = cv2.imread(str(frame_path))
        if frame is None:
            continue
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        height,width = frame.shape[:2]
        detections, detection_scores, _ = dlib.get_frontal_face_detector().run(rgb, 1, 0)
        boxes = [(max(0,d.top()), min(width,d.right()), min(height,d.bottom()), max(0,d.left())) for d in detections]
        embeddings = face_recognition.face_encodings(rgb, boxes, num_jitters=1, model='small')
        height,width = frame.shape[:2]
        for box, embedding, detector_score in zip(boxes, embeddings, detection_scores):
            confidence = 1 / (1 + math.exp(-float(detector_score)))
            if confidence < .8:
                continue
            top,right,bottom,left = box
            fw,fh = right-left,bottom-top
            region = cv2.cvtColor(frame[top:bottom,left:right], cv2.COLOR_BGR2GRAY)
            if not region.size or min(fw,fh) < 65:
                continue
            focus = float(cv2.Laplacian(region,cv2.CV_64F).var())
            brightness = float(region.mean())
            quality = min(1.0,focus/100)*.6 + min(1.0,min(fw,fh)/150)*.4
            if not 48 <= brightness <= 215 or focus < 40:
                continue
            l,t,r,b = crop_box(width,height,(left,top,fw,fh))
            # A portrait must not contain any other detected face, even partly.
            isolated = all(other == box or min(r,other[1]) <= max(l,other[3]) or
                           min(b,other[2]) <= max(t,other[0]) for other in boxes)
            assigned_anchor = None
            if anchor_id:
                a = anchors[anchor_id]['bbox']  # normalized x,y,width,height, verified by an operator
                ax,ay,aw,ah = [float(z) for z in a]
                cx,cy = (left+right)/2/width,(top+bottom)/2/height
                if ax <= cx <= ax+aw and ay <= cy <= ay+ah:
                    assigned_anchor = anchor_id
            candidates.append({'embedding':embedding.tolist(),'source_id':source['id'],
                'speaker':source.get('speaker',''),'time':timestamp,'quality':quality,
                'isolated_crop':isolated,'image':frame[t:b,l:r].copy(),'confidence':confidence,
                'anchor_guest_id':assigned_anchor,'is_anchor':anchor_id is not None,
                'face_box':[left/width,top/height,fw/width,fh/height]})
    return candidates


def extract_references(guests, sources, source_paths, destination):
    import cv2
    anchors = {g['id']:g['reference_evidence']['identity_anchor'] for g in guests
               if g.get('reference_evidence',{}).get('identity_anchor')}
    candidates = []
    for source in sources:
        candidates.extend(sample_source(source_paths[source['id']],source,anchors))
    selected = select_guest_clusters(guests,candidates,anchors)
    results = []
    for guest in guests:
        item = selected[guest['id']]
        path = destination / (guest['id']+'.jpg')
        if not cv2.imwrite(str(path),cv2.resize(item['image'],(800,1000)),[cv2.IMWRITE_JPEG_QUALITY,93]):
            raise ReviewRequired('Portrait write failed')
        results.append({'guest_id':guest['id'],'path':path,'quality_score':round(item['quality'],4),
            # Logistic dlib detector margin; heuristic, not a calibrated probability.
            'face_detection_confidence':round(item['confidence'],4),'source_file_id':item['source_id'],
            'selected_time_seconds':item['time'],'face_box':item['face_box'],
            'identity_method':'verified_anchor' if guest['id'] in anchors else 'unique_source_speaker',
            'provenance':'unedited_frame_crop','corroborating_frames':sum(1 for c in candidates
                if distance(c['embedding'],item['embedding']) <= .45 and not c.get('is_anchor'))})
    return results
