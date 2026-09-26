"use client";

import { createContext, useContext } from "react";
import { toast as notify, ToastContainer } from "react-toastify";

export type ToastType = "success" | "error" | "warning" | "info";

interface ToastOptions {
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
  success: (title: string, message?: string) => string;
  error: (title: string, message?: string) => string;
  warning: (title: string, message?: string) => string;
  info: (title: string, message?: string) => string;
}

const ToastContext = createContext<ToastContextValue | null>(null);

function showToast(options: ToastOptions) {
  const content = (
    <div>
      <strong>{options.title}</strong>
      {options.message && <div>{options.message}</div>}
    </div>
  );
  const config = { autoClose: options.duration === 0 ? (false as const) : options.duration ?? 5000 };
  const id = options.type === "warning"
    ? notify.warn(content, config)
    : notify[options.type](content, config);

  return String(id);
}

const toastContextValue: ToastContextValue = {
  toast: showToast,
  dismiss: (id) => notify.dismiss(id),
  success: (title, message) => showToast({ type: "success", title, message }),
  error: (title, message) => showToast({ type: "error", title, message }),
  warning: (title, message) => showToast({ type: "warning", title, message }),
  info: (title, message) => showToast({ type: "info", title, message }),
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <ToastContext.Provider value={toastContextValue}>
      {children}
      <ToastContainer position="bottom-right" newestOnTop theme="light" />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}