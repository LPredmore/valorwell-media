
CREATE POLICY "Authenticated select" ON public.content_ideas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin insert" ON public.content_ideas FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin update" ON public.content_ideas FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin delete" ON public.content_ideas FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
