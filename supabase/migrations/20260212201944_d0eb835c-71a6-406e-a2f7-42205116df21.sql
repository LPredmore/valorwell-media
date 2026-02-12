
-- Fix search_path on pre-existing functions
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.init_platform_outputs_for_job() SET search_path = public;
ALTER FUNCTION public.validate_content_job_status() SET search_path = public;
