"use client";

import { useState, useCallback, createContext, useContext, ReactNode } from "react";
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

const TOAST_CONFIG: Record<ToastType, { icon: React.ReactNode; bg: string; border: string; text: string }> = {
  success: {
    icon: <CheckCircle className="w-5 h-5 text-green-500" />,
    bg: "bg-green-50",
    border: "border-green-200",
    text: "text-green-800",
  },
  error: {
    icon: <AlertCircle className="w-5 h-5 text-red-500" />,
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-800",
  },
  warning: {
    icon: <AlertTriangle className="w-5 h-5 text-amber-500" />,
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-800",
  },
  info: {
    icon: <Info className="w-5 h-5 text-blue-500" />,
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-800",
  },
};

interface ToastContextValue {
  toasts: Toast[];
  toast: (options: Omit<Toast, "id">) => string;
  dismiss: (id: string) => void;
  success: (title: string, message?: string) => string;
  error: (title: string, message?: string) => string;
  warning: (title: string, message?: string) => string;
  info: (title: string, message?: string) => string;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((options: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2, 9);
    const newToast: Toast = { ...options, id };
    setToasts((prev) => [...prev, newToast]);

    const duration = options.duration ?? 5000;
    if (duration > 0) {
      setTimeout(() => dismiss(id), duration);
    }

    return id;
  }, [dismiss]);

  const helpers = {
    success: (title: string, message?: string) => toast({ type: "success", title, message }),
    error: (title: string, message?: string) => toast({ type: "error", title, message }),
    warning: (title: string, message?: string) => toast({ type: "warning", title, message }),
    info: (title: string, message?: string) => toast({ type: "info", title, message }),
  };

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss, ...helpers }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[350px] max-w-full" role="region" aria-label="Notificações">
      {toasts.map((toast) => {
        const config = TOAST_CONFIG[toast.type];
        return (
          <div
            key={toast.id}
            className={cn(
              "flex items-start gap-3 p-4 rounded-lg shadow-lg border animate-slide-in",
              config.bg,
              config.border,
              config.text
            )}
            role="alert"
            aria-live="polite"
          >
            <div className="flex-shrink-0 mt-0.5">{config.icon}</div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{toast.title}</p>
              {toast.message && <p className="text-sm opacity-90 mt-0.5">{toast.message}</p>}
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              className="flex-shrink-0 p-1 rounded hover:bg-black/10 transition-colors"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}