-- Migration 003: Quota tracking table for YouTube API usage monitoring
-- Created: 2026-08-21

-- Tabela para registrar uso de quota da API do YouTube
CREATE TABLE IF NOT EXISTS public.api_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    operation TEXT NOT NULL, -- ex: VIDEOS_INSERT, VIDEOS_UPDATE, CHANNELS_LIST
    quota_cost INTEGER NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para queries de quota
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_org_date ON public.api_usage_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_operation ON public.api_usage_logs(operation);

-- RLS
ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_usage_logs_select_org" ON public.api_usage_logs
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM public.profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "api_usage_logs_insert_org" ON public.api_usage_logs
    FOR INSERT WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM public.profiles WHERE id = auth.uid()
        )
    );

-- View para quota diária por organização
CREATE OR REPLACE VIEW public.daily_quota_usage AS
SELECT
    organization_id,
    DATE(created_at AT TIME ZONE 'UTC') as usage_date,
    SUM(quota_cost) as total_quota_used,
    COUNT(*) as operation_count
FROM public.api_usage_logs
GROUP BY organization_id, DATE(created_at AT TIME ZONE 'UTC');

-- Grant
GRANT SELECT ON public.daily_quota_usage TO authenticated;