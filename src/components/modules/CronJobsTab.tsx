import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Trash2, Clock, AlertCircle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

interface CronJob {
  jobid: number;
  jobname: string;
  schedule: string;
  command: string;
  nodename: string;
  nodeport: number;
  database: string;
  username: string;
  active: boolean;
}

// Converte expressão cron UTC para horário BRT legível
function cronToBrt(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return cron;

  // Padrão de intervalo (ex: "*/10 * * * *")
  if (parts[0].startsWith('*/')) return `A cada ${parts[0].replace('*/', '')} minuto(s)`;
  if (parts[1].startsWith('*/')) return `A cada ${parts[1].replace('*/', '')} hora(s)`;
  if (parts[0].includes('/')) return `A cada ${parts[0].split('/')[1]} minuto(s)`;

  const m = parseInt(parts[0]);
  const h = parseInt(parts[1]);
  const dom = parts[2];
  const dow = parts[4];

  if (isNaN(m) || isNaN(h)) return cron;

  const brtH = (h - 3 + 24) % 24;
  const timeStr = `${String(brtH).padStart(2, '0')}:${String(m).padStart(2, '0')} BRT`;

  if (dom === '*' && dow === '*') return `Todo dia às ${timeStr}`;
  if (dom === '*' && dow !== '*') {
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return `${days[parseInt(dow)] ?? dow} às ${timeStr}`;
  }
  return cron;
}

function jobCategory(jobname: string): { label: string; variant: 'default' | 'secondary' | 'outline' } {
  if (jobname.startsWith('sync-')) return { label: 'Sync', variant: 'default' };
  if (jobname.startsWith('ml-')) return { label: 'Bot ML', variant: 'secondary' };
  if (jobname.includes('snapshot')) return { label: 'Snapshot', variant: 'outline' };
  if (jobname.includes('market')) return { label: 'Mercado', variant: 'outline' };
  return { label: 'Sistema', variant: 'outline' };
}

export function CronJobsTab() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingJob, setDeletingJob] = useState<CronJob | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-cron', {
        body: { action: 'list_all_jobs' },
      });
      if (error) throw error;
      setJobs(data?.jobs ?? []);
    } catch (err: any) {
      toast.error(`Erro ao carregar jobs: ${err?.message ?? 'Erro desconhecido'}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const handleDelete = async () => {
    if (!deletingJob) return;
    setDeleting(true);
    try {
      const { error } = await supabase.functions.invoke('manage-cron', {
        body: { action: 'delete_job', job_name: deletingJob.jobname },
      });
      if (error) throw error;
      setJobs(prev => prev.filter(j => j.jobname !== deletingJob.jobname));
      toast.success(`Job "${deletingJob.jobname}" removido com sucesso.`);
    } catch (err: any) {
      toast.error(`Erro ao deletar job: ${err?.message}`);
    } finally {
      setDeleting(false);
      setDeletingJob(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Jobs agendados (pg_cron)</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {jobs.length} job{jobs.length !== 1 ? 's' : ''} encontrado{jobs.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchJobs} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          <span className="ml-1.5">Atualizar</span>
        </Button>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Carregando jobs...
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
          <AlertCircle className="w-8 h-8 opacity-40" />
          <p className="text-sm">Nenhum cron job encontrado.</p>
          <p className="text-xs">Os jobs aparecem aqui após serem criados via SQL ou pela interface.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => {
            const cat = jobCategory(job.jobname);
            return (
              <div
                key={job.jobid}
                className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-accent/30 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-mono font-medium text-foreground truncate">
                        {job.jobname}
                      </span>
                      <Badge variant={cat.variant} className="text-[10px] px-1.5 py-0 shrink-0">
                        {cat.label}
                      </Badge>
                      {!job.active && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 text-yellow-500 border-yellow-500/30">
                          Inativo
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-xs text-muted-foreground">
                        {cronToBrt(job.schedule)}
                      </span>
                      <span className="text-xs text-muted-foreground/40 font-mono">
                        ({job.schedule})
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  className="p-1.5 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0 ml-2"
                  onClick={() => setDeletingJob(job)}
                  title="Deletar job"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog de confirmação */}
      <AlertDialog open={!!deletingJob} onOpenChange={(open) => !open && setDeletingJob(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deletar cron job?</AlertDialogTitle>
            <AlertDialogDescription>
              O job <span className="font-mono font-semibold">"{deletingJob?.jobname}"</span> será
              removido permanentemente do pg_cron e deixará de executar imediatamente.
              <br /><br />
              Para recriar, será necessário rodar o SQL de agendamento novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Deletar job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
