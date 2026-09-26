type LoadingStateProps = {
  label: string;
  variant?: "page" | "panel" | "inline";
};

export function LoadingState({ label, variant = "panel" }: LoadingStateProps) {
  return (
    <div className={`loading-state loading-state-${variant}`} role="status" aria-live="polite">
      <span className="loading-indicator" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
