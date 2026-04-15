import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = (Deno.env.get('EXTERNAL_DB_URL') || Deno.env.get('SUPABASE_URL'))!;
const SERVICE_KEY = (Deno.env.get('EXTERNAL_DB_SERVICE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

function brtToCron(brtTime: string): string {
  // brtTime = "HH:MM", convert BRT to UTC (+3h)
  const [h, m] = brtTime.split(':').map(Number);
  const utcH = (h + 3) % 24;
  return `${m} ${utcH} * * *`;
}

function cronToBrt(cron: string): string | null {
  // cron = "M H * * *"
  const parts = cron.split(' ');
  if (parts.length < 5) return null;
  const m = parseInt(parts[0]);
  const h = parseInt(parts[1]);
  if (isNaN(m) || isNaN(h)) return null;
  const brtH = (h - 3 + 24) % 24;
  return `${String(brtH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const body = await req.json();
    const { action } = body;

    // GET all current schedules
    if (action === 'get_schedules') {
      const { data, error } = await supabase.rpc('get_cron_jobs');
      if (error) {
        // Fallback: query cron.job directly via REST won't work, use app_data
        const { data: appData } = await supabase
          .from('app_data')
          .select('data_value')
          .eq('data_key', 'daily_sync_schedules')
          .maybeSingle();
        
        return new Response(JSON.stringify({ 
          schedules: appData?.data_value || {} 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Parse cron jobs into module schedules
      const schedules: Record<string, string> = {};
      if (data) {
        for (const job of data) {
          if (job.jobname?.startsWith('sync-')) {
            const moduleKey = job.jobname.replace('sync-', '').replace(/-/g, '_');
            const brt = cronToBrt(job.schedule);
            if (brt) schedules[moduleKey] = brt;
          }
        }
      }

      return new Response(JSON.stringify({ schedules }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // SET schedule for a module
    if (action === 'set_schedule') {
      const { module_key, time_brt, enabled } = body;
      if (!module_key) throw new Error('module_key required');

      const jobName = `sync-${module_key.replace(/_/g, '-')}`;
      const cronExpr = time_brt ? brtToCron(time_brt) : null;

      // Unschedule existing job
      try {
        await supabase.rpc('unschedule_cron_job', { job_name: jobName });
      } catch {}

      // If enabled and has time, create new schedule
      if (enabled && cronExpr && time_brt) {
        const sqlBody = `{"module": "${module_key}"}`;
        await supabase.rpc('schedule_cron_job', {
          job_name: jobName,
          cron_expression: cronExpr,
          function_name: 'daily-sync',
          request_body: sqlBody,
        });
      }

      // Save to app_data for persistence
      const { data: existing } = await supabase
        .from('app_data')
        .select('data_value')
        .eq('data_key', 'daily_sync_schedules')
        .maybeSingle();

      const schedules = (existing?.data_value as Record<string, string>) || {};
      if (enabled && time_brt) {
        schedules[module_key] = time_brt;
      } else {
        delete schedules[module_key];
      }

      await supabase.from('app_data').upsert({
        data_key: 'daily_sync_schedules',
        data_value: schedules as any,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'data_key' });

      return new Response(JSON.stringify({ success: true, schedules }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // SYNC all schedules from app_data to cron (rebuild all jobs)
    if (action === 'sync_all') {
      const { data: modulesData } = await supabase
        .from('app_data')
        .select('data_value')
        .eq('data_key', 'daily_sync_modules')
        .maybeSingle();

      const { data: schedulesData } = await supabase
        .from('app_data')
        .select('data_value')
        .eq('data_key', 'daily_sync_schedules')
        .maybeSingle();

      const modules = (modulesData?.data_value as Record<string, boolean>) || {};
      const schedules = (schedulesData?.data_value as Record<string, string>) || {};

      const results: string[] = [];

      for (const [key, time] of Object.entries(schedules)) {
        const jobName = `sync-${key.replace(/_/g, '-')}`;
        const isEnabled = modules[key] === true;

        // Unschedule first
        try {
          await supabase.rpc('unschedule_cron_job', { job_name: jobName });
        } catch {}

        if (isEnabled && time) {
          const cronExpr = brtToCron(time);
          const sqlBody = `{"module": "${key}"}`;
          await supabase.rpc('schedule_cron_job', {
            job_name: jobName,
            cron_expression: cronExpr,
            function_name: 'daily-sync',
            request_body: sqlBody,
          });
          results.push(`✅ ${key}: ${time} BRT (${cronExpr})`);
        } else {
          results.push(`⏭️ ${key}: desabilitado`);
        }
      }

      // Also handle verify job
      const verifyJobName = 'sync-verify';
      try {
        await supabase.rpc('unschedule_cron_job', { job_name: verifyJobName });
      } catch {}

      // Find latest time and add 10 min for verify
      const times = Object.entries(schedules)
        .filter(([k]) => modules[k])
        .map(([_, t]) => t)
        .sort();

      if (times.length > 0) {
        const lastTime = times[times.length - 1];
        const [lh, lm] = lastTime.split(':').map(Number);
        const verifyMin = lm + 10;
        const verifyH = lh + Math.floor(verifyMin / 60);
        const verifyTime = `${String(verifyH % 24).padStart(2, '0')}:${String(verifyMin % 60).padStart(2, '0')}`;
        const verifyCron = brtToCron(verifyTime);

        await supabase.rpc('schedule_cron_job', {
          job_name: verifyJobName,
          cron_expression: verifyCron,
          function_name: 'daily-sync',
          request_body: '{"module": "verify"}',
        });
        results.push(`🔍 verify: ${verifyTime} BRT`);
      }

      return new Response(JSON.stringify({ success: true, results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('manage-cron error:', e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
