process.on('uncaughtException',e=>{console.error(e.message,e.code,e.position);process.exit(1)});
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
import {readFile} from 'node:fs/promises';
const db=new PGlite();
await db.exec(`
create schema private;
create role anon; create role authenticated; create role service_role;
create table public.ai_operations_video_projects(
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null, guest_name text, guest_image_url text,
 organization_name text, source_file_name text default 'episode.mp4', source_file_id text default 'source', source_revision integer default 0,
 workflow_revision integer default 0, metadata jsonb default '{}',cover_image_file_id text,cover_image_url text,
 cover_input_fingerprint text,cover_metadata_revision integer default 0,last_progress_at timestamptz,updated_at timestamptz default now());
create table public.ai_operations_video_jobs(
 id bigint generated always as identity primary key,tenant_id uuid not null,project_id uuid references ai_operations_video_projects(id),clip_id uuid,
 job_type text constraint ai_operations_video_jobs_job_type_check check(job_type in ('generate_thumbnail','generate_project_cover','transcribe')),
 status text default 'queued',payload jsonb not null default '{}',workflow_revision integer default 0,
 input_fingerprint text,idempotency_key text unique,available_at timestamptz default now(),created_at timestamptz default now(),updated_at timestamptz default now(),
 attempts integer default 0,max_attempts integer default 3,worker_category text,claimed_by text,claimed_at timestamptz,started_at timestamptz,
 completed_at timestamptz,lease_expires_at timestamptz,error_message text,result jsonb default '{}');
create table public.ai_operations_video_settings(tenant_id uuid);
create table public.ai_operations_video_clips(id uuid,project_id uuid,clip_type text,pipeline_status text,
 cover_image_file_id text,cover_image_url text,thumbnail_input_fingerprint text,thumbnail_generation_revision integer default 0,updated_at timestamptz);
create table public.ai_operations_social_publications(project_id uuid,clip_id uuid,source_type text,status text,thumbnail_file_id text,thumbnail_url text,updated_at timestamptz);
create table public.profiles(id uuid,email text,is_active boolean);
create table public.tenant_memberships(tenant_id uuid,profile_id uuid);
create table public.crm_tasks(id uuid default gen_random_uuid(),tenant_id uuid,title text,description text,type text,priority text,status text,
 owner_id uuid,created_by_profile_id uuid,due_at timestamptz,tags text[],created_at timestamptz default now());
create table private.ai_operations_video_circuit_breakers(tenant_id uuid,worker_category text,status text,retry_after timestamptz,probe_job_id bigint,updated_at timestamptz);
create function public.heartbeat_ai_operations_video_worker(text,uuid,text,bigint,uuid,text,text,jsonb) returns void language sql as 'select';
`);
await db.exec(await readFile(new URL('../supabase/tests/fixtures/multi_guest_claim_baseline.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../supabase/migrations/20261025100208_multi_guest_thumbnail_identity.sql',import.meta.url),'utf8'));
console.log('PASS: migration compiles on PostgreSQL');
const tenant='00000000-0000-0000-0000-000000000001';
const single='11111111-1111-1111-1111-111111111111', pair='22222222-2222-2222-2222-222222222222';
await db.query(`insert into ai_operations_video_projects(id,tenant_id,guest_name) values ($1,$3,'One Guest'),($2,$3,'Scott Hooper and Karolyn Hooper')`,[single,pair,tenant]);
await db.query(`insert into ai_operations_video_jobs(tenant_id,project_id,job_type) values($1,$2,'generate_project_cover'),($1,$3,'generate_thumbnail')`,[tenant,pair,single]);
let rows=(await db.query(`select project_id,status from ai_operations_video_jobs where job_type in ('generate_thumbnail','generate_project_cover') order by id`)).rows;
if(rows[0].status!=='waiting'||rows[1].status!=='queued')throw Error(JSON.stringify(rows));
console.log('PASS: single guest unchanged; multi-guest combined URL cannot bypass queue gate');
rows=(await db.query(`select * from claim_next_ai_operations_video_job('test',array['generate_thumbnail','generate_project_cover'],600)`)).rows;
if(rows.length!==1||rows[0].project_id!==single)throw Error('Blocked episode starved the queue');
console.log('PASS: claim skips blocked episode');
rows=(await db.query(`select * from claim_next_ai_operations_video_job('bty-guest-reference-worker',array['extract_guest_reference_images'],3600)`)).rows;
if(rows.length!==1)throw Error('Extraction not enqueued');
const job=rows[0];
let guests=(await db.query(`select * from ai_operations_video_project_guests where project_id=$1 order by sort_order`,[pair])).rows;
if(guests.length!==2||guests[0].display_name!=='Scott Hooper')throw Error('Guest roster not detected');
const refs=guests.map((g,i)=>({guest_id:g.id,image_file_id:'file-'+i,source_file_id:'source',quality_score:.9,face_detection_confidence:.9,corroborating_frames:3,provenance:'unedited_frame_crop',identity_method:'verified_anchor'}));
try{await db.query(`select approve_ai_operations_video_guest_extraction($1,$2)`,[job.id,JSON.stringify(refs.slice(0,1))]);throw Error('Partial batch accepted');}catch(e){if(e.message==='Partial batch accepted')throw e;}
console.log('PASS: failure to extract one guest prevents approval');
await db.query(`select approve_ai_operations_video_guest_extraction($1,$2)`,[job.id,JSON.stringify(refs)]);
rows=(await db.query(`select get_ai_operations_video_guest_references($1) manifest`,[pair])).rows;
if(!rows[0].manifest.ready)throw Error('Approved references still blocked');
await db.query(`insert into ai_operations_video_jobs(tenant_id,project_id,job_type) values($1,$2,'generate_project_cover')`,[tenant,pair]);
rows=(await db.query(`select * from claim_next_ai_operations_video_job('bty-image-worker',array['generate_project_cover'],600)`)).rows;
if(rows.length!==1||!rows[0].payload.guest_reference_fingerprint)throw Error('Reference snapshot missing');
console.log('PASS: complete roster releases queue with identity snapshot');
await db.query(`insert into profiles values($1,'info@valorwell.org',true);`,[single]);
await db.query(`insert into tenant_memberships values($1,$2)`,[tenant,single]);
const task=(await db.query(`select request_ai_operations_video_guest_review($1,'unresolved') id`,[pair])).rows[0].id;
const again=(await db.query(`select request_ai_operations_video_guest_review($1,'unresolved') id`,[pair])).rows[0].id;
if(task!==again)throw Error('Duplicate review tasks');
console.log('PASS: CRM fallback is durable and idempotent');
const imageJob=rows[0];
await db.query(`update ai_operations_video_jobs set claimed_by='bty-image-worker',payload=payload||jsonb_build_object('generation_revision',(select cover_metadata_revision from ai_operations_video_projects where id=$2)) where id=$1`,[imageJob.id,pair]);
let applied=(await db.query(`select apply_ai_operations_video_guest_thumbnail($1,'new-cover','https://drive.google.com/file/d/new-cover/view') ok`,[imageJob.id])).rows[0].ok;
if(!applied)throw Error('Ready image not applied');
await db.query(`update ai_operations_video_project_guests set reference_status='needs_review' where id=$1`,[guests[0].id]);
applied=(await db.query(`select apply_ai_operations_video_guest_thumbnail($1,'old-cover','https://drive.google.com/file/d/old-cover/view') ok`,[imageJob.id])).rows[0].ok;
if(applied)throw Error('Stale identity overwrote image');
console.log('PASS: atomic apply rejects changed identities and canceled leases');
await db.exec('set role authenticated');
try{await db.query('select * from ai_operations_video_project_guests');throw Error('Client read allowed');}catch(e){if(e.message==='Client read allowed')throw e;}
try{await db.query(`select request_ai_operations_video_guest_review($1,'unauthorized')`,[pair]);throw Error('Client RPC allowed');}catch(e){if(e.message==='Client RPC allowed')throw e;}
await db.exec('reset role');
console.log('PASS: guest records and privileged RPCs deny client access');
await db.close();
