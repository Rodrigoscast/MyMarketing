import Link from "next/link";
import { BarChart3 } from "lucide-react";

type LogoProps = {
  compact?: boolean;
  href?: string;
};

export function Logo({ compact = false, href = "/" }: LogoProps) {
  return (
    <Link href={href} className="logo" aria-label="MyMarketing">
      <span className="logo-mark">
        <BarChart3 size={compact ? 17 : 20} strokeWidth={2.4} />
      </span>
      {!compact && <span>MyMarketing</span>}
    </Link>
  );
}
