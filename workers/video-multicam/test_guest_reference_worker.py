import unittest
from unittest.mock import patch
import guest_reference_worker as runner


class GuestReferenceWorkerTests(unittest.TestCase):
    def test_failed_extraction_creates_task_before_returning_review(self):
        calls=[]
        def api(action,**kwargs):
            calls.append((action,kwargs))
            if action=='guest_refs_claim':
                return {'job':{'id':42},'guests':[{'id':'s'},{'id':'k'}], 'sources':[]}
            return {'task_id':'review-42'}
        with patch.object(runner.worker,'api',side_effect=api), patch.object(runner,'extract_references',side_effect=ValueError('Karolyn unresolved')):
            self.assertEqual(runner.main(),{'status':'manual_review','task_id':'review-42'})
        self.assertEqual(calls[-1],('guest_refs_review',{'job_id':42,'reason':'Karolyn unresolved'}))

    def test_task_creation_failure_remains_a_failure(self):
        with patch.object(runner.worker,'api',side_effect=[{'job':{'id':42},'sources':[],'guests':[]},{}]), patch.object(runner,'extract_references',side_effect=ValueError('unresolved')):
            with self.assertRaisesRegex(RuntimeError,'not persisted'):
                runner.main()

    def test_no_job_does_not_extract(self):
        with patch.object(runner.worker,'api',return_value={'job':None}), patch.object(runner,'extract_references') as extractor:
            self.assertEqual(runner.main(),{'status':'idle'})
            extractor.assert_not_called()


if __name__=='__main__':
    unittest.main()
