import Link from "next/link";
import { BarChart3 } from "lucide-react";

type LogoProps = {
  compact?: boolean;
};

export function Logo({ compact = false }: LogoProps) {
  return (
    <Link href="/" className="logo" aria-label="MyMarketing">
      <span className="logo-mark">
        <BarChart3 size={compact ? 17 : 20} strokeWidth={2.4} />
      </span>
      {!compact && <span>MyMarketing</span>}
    </Link>
  );
}
