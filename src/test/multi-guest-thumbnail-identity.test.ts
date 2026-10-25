import { describe,it,expect } from 'vitest';
import { requireIndependentReferences, multiGuestRules, type GuestReference } from '../../supabase/functions/video-thumbnail-generation-dispatcher/guest-identity';
const guest=(id:string,name:string,order:number):GuestReference=>({id,display_name:name,sort_order:order,reference_status:'approved',reference_image_file_id:id,reference_image_url:null,reference_source_type:'source_video_frame'});
const a=guest('scott','Scott Hooper',0),b=guest('karolyn','Karolyn Hooper',1);
describe('independent thumbnail identities',()=>{
  it('preserves the existing single-guest dispatcher path',()=>{
    expect(requireIndependentReferences({multi:false,ready:true,fingerprint:'legacy',guests:[]})).toEqual([]);
    expect(multiGuestRules([])).toBe('');
  });
  it('orders two separate approved identities consistently',()=>{
    expect(requireIndependentReferences({multi:true,ready:true,fingerprint:'v1',guests:[b,a]})).toEqual([a,b]);
  });
  it('fails closed if one identity is missing, unapproved, or reused',()=>{
    for(const guests of [[a],[a,{...b,reference_status:'pending'}],[a,{...b,reference_image_file_id:'scott'}],[a,{...b,reference_image_file_id:null,reference_image_url:'https://drive.google.com/file/d/scott/view'}]])
      expect(()=>requireIndependentReferences({multi:true,ready:true,fingerprint:'v1',guests})).toThrow();
    expect(()=>requireIndependentReferences({multi:true,ready:false,fingerprint:'v1',guests:[a,b]})).toThrow();
  });
  it('labels references and requires both identities independently without Luke',()=>{
    const prompt=multiGuestRules([a,b]);
    expect(prompt).toContain('Image A = Scott Hooper identity reference');
    expect(prompt).toContain('Image B = Karolyn Hooper identity reference');
    expect(prompt).toContain('Preserve each identity independently');
    expect(prompt).toContain('both guests must be recognizable');
    expect(prompt).toContain('Do not include Luke Predmore/the host unless explicitly requested');
    expect(prompt).toContain('Do not merge faces, blend identities, substitute people, or invent approximations');
  });
});
