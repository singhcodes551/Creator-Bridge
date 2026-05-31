import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://thiwdslfzsdebanyziir.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_eiQNgkdzM2eRfzD9kVYsAw_Cych-FlM'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)