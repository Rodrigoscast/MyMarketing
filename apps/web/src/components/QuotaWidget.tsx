"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";

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

function formatNumber(num: number) {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

function formatResetTime(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function getQuotaTone(quota: QuotaStatus) {
  if (quota.critical) return "critical";
  if (quota.warning) return "warning";
  return "normal";
}

function getStatusText(quota: QuotaStatus) {
  if (quota.critical) return "Critico";
  if (quota.warning) return "Atencao";
  return "Normal";
}

function getStatusIcon(quota: QuotaStatus) {
  if (quota.critical || quota.warning) return <AlertTriangle size={15} />;
  return <CheckCircle size={15} />;
}

export function QuotaWidget() {
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchQuota = async () => {
    try {
      const data = await apiFetch<{ data: QuotaStatus }>("/api/analytics/quota");
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
    const interval = setInterval(fetchQuota, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="panel quota-widget">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">API YouTube</p>
            <h2>Quota diaria</h2>
          </div>
          <RefreshCw className="spin" size={20} />
        </div>
        <div className="quota-skeleton" />
      </div>
    );
  }

  if (!quota) return null;

  const tone = getQuotaTone(quota);
  const usedPercent = Math.round(quota.percentageUsed * 100);

  return (
    <div className="panel quota-widget">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">API YouTube</p>
          <h2>Quota diaria</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={() => {
            setRefreshing(true);
            fetchQuota();
          }}
          disabled={refreshing}
          aria-label="Atualizar quota"
        >
          <RefreshCw className={cn(refreshing && "spin")} size={19} />
        </button>
      </div>

      <div className="quota-body">
        <div className="quota-overview">
          <span className={`quota-status-pill ${tone}`}>
            {getStatusIcon(quota)}
            {getStatusText(quota)}
          </span>
          <div className="quota-reset">
            <span>Reset</span>
            <strong>{formatResetTime(quota.resetAt)}</strong>
          </div>
        </div>

        <div className="quota-meter" aria-label={`Uso da quota: ${usedPercent}%`}>
          <div className={`quota-meter-fill ${tone}`} style={{ width: `${Math.min(usedPercent, 100)}%` }} />
        </div>

        <div className="quota-stats">
          <div>
            <span>Usado</span>
            <strong>{formatNumber(quota.used)}</strong>
            <small>{usedPercent}%</small>
          </div>
          <div>
            <span>Limite</span>
            <strong>{formatNumber(quota.dailyLimit)}</strong>
            <small>unidades/dia</small>
          </div>
          <div>
            <span>Restante</span>
            <strong>{formatNumber(quota.remaining)}</strong>
            <small>unidades</small>
          </div>
        </div>

        <div className="quota-costs">
          <h3>Custo por operacao</h3>
          <div className="quota-cost-grid">
            {Object.entries(quota.costs).map(([key, cost]) => (
              <div className="quota-cost-item" key={key}>
                <span>{key.toLowerCase().replace(/_/g, " ")}</span>
                <strong>{cost}</strong>
              </div>
            ))}
          </div>
        </div>

        {(quota.warning || quota.critical) && (
          <div className={`quota-alert ${tone}`}>
            <AlertTriangle size={16} />
            <span>
              {quota.critical
                ? `Quota critica. Apenas ${formatNumber(quota.remaining)} unidades restantes. Evite uploads ate o reset.`
                : `Quota alta (${usedPercent}%). Considere agendar uploads para amanha.`
              }
            </span>
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
        const data = await apiFetch<{ data: QuotaStatus }>("/api/analytics/quota");
        setQuota(data.data);
      } catch (err) {
        console.error("Erro ao buscar quota:", err);
      }
    };

    fetchQuota();
    const interval = setInterval(fetchQuota, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (!quota) return null;

  const tone = getQuotaTone(quota);

  return (
    <div className={`quota-badge ${tone}`}>
      <span>
        {getStatusIcon(quota)}
        Quota: {Math.round(quota.percentageUsed * 100)}%
      </span>
      <strong>{quota.used}/{quota.dailyLimit}</strong>
    </div>
  );
}
