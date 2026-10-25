"""Claim one extraction job using the existing GitHub OIDC / Drive boundary."""
import json
import tempfile
from pathlib import Path
import worker
from guest_references import extract_references


def main():
    prepared = worker.api('guest_refs_claim')
    if not prepared.get('job'):
        return {'status':'idle'}
    job = prepared['job']
    worker._TOKEN_REFRESH_ACTION = 'guest_refs_token'
    worker._TOKEN_REFRESH_CONTEXT = {'job_id':job['id']}
    try:
        with tempfile.TemporaryDirectory(prefix='bty-guest-references-') as tmp:
            root = Path(tmp)
            paths = {}
            for source in prepared['sources']:
                path = root / (source['id']+'.mp4')
                worker.fetch_source(source,path)
                if path.stat().st_size != int(source['size']):
                    raise ValueError('Source video size mismatch')
                paths[source['id']] = path
            references = extract_references(prepared['guests'],prepared['sources'],paths,root)
            for reference in references:
                path = reference.pop('path')
                reference['image_file_id'] = worker.upload_guest_jpeg(path,
                    f"BTY-guest-{job['id']}-{reference['guest_id']}.jpg",prepared['output_folder_id'])
            return worker.api('guest_refs_complete',job_id=job['id'],references=references)
    except Exception as exc:
        # Task persistence failure is a failed workflow, never a successful fallback.
        result = worker.api('guest_refs_review',job_id=job['id'],reason=str(exc)[:1800])
        if not result.get('task_id'):
            raise RuntimeError('Guest identity review task was not persisted') from exc
        return {'status':'manual_review','task_id':result['task_id']}


if __name__ == '__main__':
    print(json.dumps(main()))
