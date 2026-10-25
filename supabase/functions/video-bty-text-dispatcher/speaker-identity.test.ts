import { resolveThumbnailSpeaker as resolve, verifiedGuestParticipants } from "./speaker-identity.ts";
const group="Scott Hooper and Karolyn Hooper";
const cases:[string,string,string,"short"|"part",string|null][]=[
 ["Luke isolated host","Luke",group,"short","Luke Predmore"],
 ["full host","Luke Predmore",group,"short","Luke Predmore"],
 ["Scott guest participant","Scott Hooper",group,"short",group],
 ["Karolyn guest participant","Karolyn Hooper",group,"short",group],
 ["Scott first name","Scott",group,"short",group],
 ["Karolyn first name","Karolyn",group,"short",group],
 ["both guest names","Scott and Karolyn",group,"short",group],
 ["guest camera label","Guests",group,"short",group],
 ["full guest group",group,group,"short",group],
 ["unknown person rejected","John Hooper",group,"short",null],
 ["invented extra guest rejected","Scott and John",group,"short",null],
 ["single guest","Jennifer Jefferson","Jennifer Jefferson","short","Jennifer Jefferson"],
 ["single guest first name","Jennifer","Jennifer Jefferson","short","Jennifer Jefferson"],
 ["part guest-only","Luke",group,"part",group],
 ["host with no guest","Luke Predmore","","short","Luke Predmore"],
 ["unidentified guest with no verified participant","Guest","","short",null],
];
for(const [testName,raw,guest,type,expected] of cases){
 Deno.test(testName,()=>{const got=resolve(raw,guest,type);if(got!==expected)throw new Error(JSON.stringify({raw,got,expected}));});
}
Deno.test("verified source group split",()=>{const names=verifiedGuestParticipants(group);if(names.length!==2 || names[0]!=="Scott Hooper"||names[1]!=="Karolyn Hooper")throw Error(names.join("|"));});
