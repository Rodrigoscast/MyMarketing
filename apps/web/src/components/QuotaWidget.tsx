"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, CheckCircle, TrendingUp, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/Toast";

interface QuotaStatus {
  dailyLimit: number;
  used: number;
  remaining: number;
  percentageUsed: number;
  resetAt: string;
  warning: boolean;
  critical: boolean;
  costs: Record<string, number>;
  thresholds: {
    warning: number;
    critical: number;
  };
}

export function QuotaWidget() {
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { error: showError, success: showSuccess } = useToast();

  const fetchQuota = async () => {
    try {
      const res = await fetch("/api/analytics/quota");
      if (!res.ok) throw new Error("Falha ao buscar quota");
      const data = await res.json();
      setQuota(data.data);
    } catch (err) {
      console.error("Erro ao buscar quota:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchQuota();
    // Atualizar a cada 5 minutos
    const interval = setInterval(fetchQuota, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">API YouTube</p>
            <h2>Quota Diária</h2>
          </div>
          <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
        </div>
        <div className="chart-placeholder" style={{ height: "120px" }} />
      </div>
    );
  }

  if (!quota) return null;

  const getStatusColor = () => {
    if (quota.critical) return "bg-red-500";
    if (quota.warning) return "bg-amber-500";
    return "bg-teal-500";
  };

  const getStatusText = () => {
    if (quota.critical) return "Crítico";
    if (quota.warning) return "Atenção";
    return "Normal";
  };

  const getStatusIcon = () => {
    if (quota.critical) return <AlertTriangle className="w-5 h-5" />;
    if (quota.warning) return <AlertTriangle className="w-5 h-5" />;
    return <CheckCircle className="w-5 h-5" />;
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toString();
  };

  const formatResetTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">API YouTube</p>
          <h2>Quota Diária</h2>
        </div>
        <button
          onClick={() => { setRefreshing(true); fetchQuota(); }}
          disabled={refreshing}
          className="icon-button"
          aria-label="Atualizar quota"
        >
          <RefreshCw className={cn("w-5 h-5", refreshing && "animate-spin")} />
        </button>
      </div>

      <div className="space-y-4">
        {/* Barra de progresso principal */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", quota.critical ? "bg-red-100 text-red-700" : quota.warning ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700")}>
                {getStatusIcon()}
                {getStatusText()}
              </span>
              <span className="text-sm text-gray-500">
                Reseta às {formatResetTime(quota.resetAt)}
              </span>
            </div>
            <span className="font-mono text-lg font-semibold text-gray-900">
              {formatNumber(quota.used)} / {formatNumber(quota.dailyLimit)}
            </span>
          </div>

          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-500", getStatusColor())}
              style={{ width: `${Math.min(quota.percentageUsed * 100, 100)}%` }}
            />
          </div>

          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Usado: {quota.percentageUsed * 100}%</span>
            <span>Restante: {formatNumber(quota.remaining)}</span>
          </div>
        </div>

        {/* Custos das operações */}
        <div className="border-t border-gray-100 pt-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Custo por Operação</h3>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(quota.costs).map(([key, cost]) => (
              <div
                key={key}
                className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
              >
                <span className="text-xs font-medium text-gray-600 capitalize">{key.toLowerCase().replace(/_/g, " ")}</span>
                <span className="font-mono text-sm font-semibold text-gray-900">{cost} unidades</span>
              </div>
            ))}
          </div>
        </div>

        {/* Alertas */}
        {(quota.warning || quota.critical) && (
          <div className={cn("p-3 rounded-lg text-sm", quota.critical ? "bg-red-50 border border-red-200 text-red-800" : "bg-amber-50 border border-amber-200 text-amber-800")}>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>
                {quota.critical
                  ? `Quota crítica! Apenas ${formatNumber(quota.remaining)} unidades restantes. Evite uploads até reset.`
                  : `Quota alta (${Math.round(quota.percentageUsed * 100)}%). Considere agendar uploads para amanhã.`
                }
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function QuotaBadge() {
  const [quota, setQuota] = useState<QuotaStatus | null>(null);

  useEffect(() => {
    const fetchQuota = async () => {
      try {
        const res = await fetch("/api/analytics/quota");
        if (res.ok) {
          const data = await res.json();
          setQuota(data.data);
        }
      } catch (err) {
        console.error("Erro ao buscar quota:", err);
      }
    };
    fetchQuota();
    const interval = setInterval(fetchQuota, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (!quota) return null;

  return (
    <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium", quota.critical ? "bg-red-100 text-red-700" : quota.warning ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700")}>
      <span className="flex items-center gap-1">
        {quota.critical && <AlertTriangle className="w-3 h-3" />}
        {quota.warning && !quota.critical && <AlertTriangle className="w-3 h-3" />}
        {!quota.warning && !quota.critical && <CheckCircle className="w-3 h-3" />}
        Quota: {Math.round(quota.percentageUsed * 100)}%
      </span>
      <span className="font-mono">{quota.used}/{quota.dailyLimit}</span>
    </div>
  );
}