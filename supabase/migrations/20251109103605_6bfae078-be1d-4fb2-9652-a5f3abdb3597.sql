-- Fix infinite recursion in user_roles RLS policy
-- Drop the problematic policy that directly queries user_roles table
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;

-- Recreate it using the has_role() security definer function to avoid recursion
CREATE POLICY "Admins can manage all roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));