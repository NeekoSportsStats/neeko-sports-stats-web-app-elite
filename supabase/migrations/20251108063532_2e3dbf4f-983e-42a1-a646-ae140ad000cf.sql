-- Drop existing policies on profiles table
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

-- Create new policies with explicit authentication requirement
CREATE POLICY "Authenticated users can view their own profile" 
ON public.profiles
FOR SELECT 
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Authenticated users can update their own profile" 
ON public.profiles
FOR UPDATE 
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Authenticated users can insert their own profile" 
ON public.profiles
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = id);