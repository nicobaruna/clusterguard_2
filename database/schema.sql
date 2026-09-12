CREATE TYPE user_role AS ENUM ('WARGA', 'PIC', 'SUPER_ADMIN');
CREATE TYPE sos_category AS ENUM ('MEDIS', 'BENCANA', 'KEAMANAN');
CREATE TYPE sos_status AS ENUM ('PENDING', 'RESOLVED');

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name VARCHAR NOT NULL,
  phone_number VARCHAR NOT NULL,
  house_number VARCHAR,
  role user_role NOT NULL DEFAULT 'WARGA',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sos_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  category sos_category NOT NULL,
  status sos_status NOT NULL DEFAULT 'PENDING',
  resolved_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  device_token TEXT NOT NULL,
  platform VARCHAR(20) NOT NULL DEFAULT 'ANDROID',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_token)
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sos_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "PICs can view events" ON public.sos_events
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('PIC', 'SUPER_ADMIN')
  ));

CREATE POLICY "Authenticated users can create sos events" ON public.sos_events
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Resolved events can be updated by PICs" ON public.sos_events
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('PIC', 'SUPER_ADMIN')
    )
  );

CREATE POLICY "Users can view own devices" ON public.user_devices
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own devices" ON public.user_devices
  FOR INSERT WITH CHECK (auth.uid() = user_id);
