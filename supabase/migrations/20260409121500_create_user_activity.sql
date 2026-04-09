-- Tabela principal de eventos
CREATE TABLE IF NOT EXISTS public.user_activity_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type    text NOT NULL,
  module        text NOT NULL CHECK (module IN ('market_intel','demand_planning','purchase_orders','session')),
  metadata      jsonb DEFAULT '{}',
  session_id    uuid,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_user_activity_user_time ON user_activity_events (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_module ON user_activity_events (user_id, module, occurred_at DESC);

-- Segurança e Políticas de Acesso
ALTER TABLE public.user_activity_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users see own events" ON public.user_activity_events;
CREATE POLICY "users see own events" ON public.user_activity_events
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users insert own events" ON public.user_activity_events;
CREATE POLICY "users insert own events" ON public.user_activity_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- VIEW de Métricas Diárias Múltiplas (Real-Time em substituição à Materialized View)
CREATE OR REPLACE VIEW public.user_daily_metrics AS
SELECT
  user_id,
  date_trunc('day', occurred_at AT TIME ZONE 'America/Sao_Paulo') AS day,
  COUNT(*)                                                          AS total_actions,
  COUNT(*) FILTER (WHERE module = 'market_intel')                   AS market_intel_actions,
  COUNT(*) FILTER (WHERE module = 'demand_planning')                AS demand_actions,
  COUNT(*) FILTER (WHERE module = 'purchase_orders')                AS po_actions,
  COUNT(DISTINCT session_id)                                        AS sessions,
  SUM(CASE WHEN event_type = 'report_exported' THEN 1 ELSE 0 END)  AS reports_exported,
  SUM(CASE WHEN event_type = 'purchase_order_created' THEN 1 ELSE 0 END) AS pos_created
FROM public.user_activity_events
GROUP BY user_id, date_trunc('day', occurred_at AT TIME ZONE 'America/Sao_Paulo');

-- VIEW de Resumo Semanal (Real-Time construída sobre a Daily)
CREATE OR REPLACE VIEW public.user_weekly_summary AS
SELECT
  user_id,
  date_trunc('week', day) AS week_start,
  SUM(total_actions)      AS total_actions,
  SUM(market_intel_actions) AS market_intel_actions,
  SUM(demand_actions)       AS demand_actions,
  SUM(po_actions)           AS po_actions,
  COUNT(DISTINCT day)       AS active_days,
  SUM(reports_exported)     AS reports_exported,
  SUM(pos_created)          AS pos_created
FROM public.user_daily_metrics
GROUP BY user_id, date_trunc('week', day);
