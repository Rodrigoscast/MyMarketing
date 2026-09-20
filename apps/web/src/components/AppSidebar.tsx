"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, CalendarClock, FileVideo, Gauge, LogOut, Video } from "lucide-react";
import { Logo } from "@/components/Logo";
import { clearSession } from "@/lib/auth";

const navItems = [
  { href: "/app", label: "Visao geral", icon: Gauge },
  { href: "/app/videos", label: "Videos", icon: FileVideo },
  { href: "/app/canais", label: "Canais do YouTube", icon: Video },
  { href: "/app/calendario", label: "Calendario", icon: CalendarClock },
  { href: "/app/analytics", label: "Analytics", icon: BarChart3 },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/app") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    clearSession();
    router.push("/login");
  };

  return (
    <aside className="sidebar">
      <Logo href="/app" />
      <nav className="sidebar-nav" aria-label="Sistema">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} className={isActivePath(pathname, item.href) ? "active" : undefined} href={item.href}>
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        <button className="sidebar-logout" type="button" onClick={handleLogout}>
          <LogOut size={18} />
          Sair
        </button>
      </div>
    </aside>
  );
}
