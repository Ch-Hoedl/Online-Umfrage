import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('[cleanup-edit-locks] Starting cleanup...');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Release locks older than 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('surveys')
      .update({
        editing_by: null,
        editing_since: null
      })
      .not('editing_by', 'is', null)
      .lt('editing_since', tenMinutesAgo)
      .select('id, title');

    if (error) {
      console.error('[cleanup-edit-locks] Error:', error);
      throw error;
    }

    const count = data?.length || 0;
    console.log(`[cleanup-edit-locks] Released ${count} stale locks`);

    if (count > 0) {
      console.log('[cleanup-edit-locks] Unlocked surveys:', data.map(s => s.title).join(', '));
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        released: count,
        surveys: data 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (error) {
    console.error('[cleanup-edit-locks] Fatal error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})
