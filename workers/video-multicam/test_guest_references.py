import unittest
from guest_references import ReviewRequired, cluster_faces, select_guest_clusters


def guest(id, name):
    return {'id':id,'display_name':name,'speaker_aliases':[]}


def frames(speaker, vector, source='video'):
    return [{'embedding':vector,'source_id':source,'speaker':speaker,'time':i,
             'quality':.9,'isolated_crop':True} for i in range(3)]


class GuestReferenceTests(unittest.TestCase):
    def test_single_guest_source(self):
        result=select_guest_clusters([guest('s','Scott')], frames('Scott',[0,0]))
        self.assertEqual(set(result), {'s'})

    def test_two_guests_independent_clusters(self):
        result=select_guest_clusters([guest('s','Scott'),guest('k','Karolyn')],
            frames('Scott',[0,0],'scott')+frames('Karolyn',[1,1],'karolyn'))
        self.assertEqual(set(result), {'s','k'})
        self.assertNotEqual(result['s']['source_id'],result['k']['source_id'])

    def test_missing_guest_blocks_entire_batch(self):
        with self.assertRaises(ReviewRequired):
            select_guest_clusters([guest('s','Scott'),guest('k','Karolyn')],frames('Scott',[0,0]))

    def test_shared_camera_requires_verified_name_anchors(self):
        candidates=frames('Scott and Karolyn',[0,0])+frames('Scott and Karolyn',[1,1])
        guests=[guest('s','Scott'),guest('k','Karolyn')]
        with self.assertRaises(ReviewRequired):
            select_guest_clusters(guests,candidates)
        candidates += [{**candidates[0],'anchor_guest_id':'s','is_anchor':True},
                       {**candidates[-1],'anchor_guest_id':'k','is_anchor':True}]
        self.assertEqual(set(select_guest_clusters(guests,candidates,{'s':{'verified':True},'k':{'verified':True}})),{'s','k'})

    def test_no_cluster_reuse_or_small_sample_approval(self):
        with self.assertRaises(ReviewRequired):
            select_guest_clusters([guest('s','Scott')],frames('Scott',[0,0])[:2])
        with self.assertRaises(ReviewRequired):
            select_guest_clusters([guest('s','Scott'),guest('k','Scott')],frames('Scott',[0,0]))

    def test_crop_containing_second_face_is_rejected(self):
        with self.assertRaises(ReviewRequired):
            select_guest_clusters([guest('s','Scott')],[{**c,'isolated_crop':False} for c in frames('Scott',[0,0])])

    def test_complete_link_prevents_identity_bridging(self):
        self.assertEqual(len(cluster_faces([{'embedding':[x]} for x in [0,.3,.6]])),2)

    def test_nonfinite_embedding_rejected(self):
        with self.assertRaises(ReviewRequired):
            cluster_faces([{'embedding':[0]},{'embedding':[float('nan')]}])


if __name__=='__main__':
    unittest.main()
