-- Create missions table
CREATE TABLE public.missions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_id UUID,
  is_active BOOLEAN DEFAULT false
);

-- Enable RLS
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;

-- Create policies for missions
CREATE POLICY "Allow public reads for testing" 
ON public.missions 
FOR SELECT 
USING (true);

CREATE POLICY "Allow public inserts for testing" 
ON public.missions 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public updates for testing" 
ON public.missions 
FOR UPDATE 
USING (true);

CREATE POLICY "Allow public deletes for testing" 
ON public.missions 
FOR DELETE 
USING (true);

-- Add mission_id to photos table
ALTER TABLE public.photos 
ADD COLUMN mission_id UUID REFERENCES public.missions(id) ON DELETE SET NULL;

-- Create index for better performance
CREATE INDEX idx_photos_mission_id ON public.photos(mission_id);
CREATE INDEX idx_missions_is_active ON public.missions(is_active);