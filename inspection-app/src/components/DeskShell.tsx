import type { User } from "@/lib/types";
import { AppBar } from "./AppBar";

const LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/inspections", label: "Inspections" },
  { href: "/dashboard/defects", label: "Defects" },
  { href: "/dashboard/documents", label: "Documents" },
  { href: "/dashboard/fleet", label: "Fleet" },
  { href: "/dashboard/people", label: "People", managers: true },
];

/** Desktop frame for the dashboard pages: header, nav, centred content. */
export function DeskShell({ user, current, children }: { user: User; current: string; children: React.ReactNode }) {
  return (
    <div className="desk">
      <AppBar user={user} desk>
        <nav className="desk-nav" aria-label="Dashboard">
          {LINKS.filter((l) => !l.managers || user.role === "manager").map((l) => (
            <a key={l.href} href={l.href} aria-current={current === l.href ? "page" : undefined}>
              {l.label}
            </a>
          ))}
          {user.role !== "viewer" && <a href="/">Inspect a truck</a>}
        </nav>
      </AppBar>
      <main className="desk-main">{children}</main>
    </div>
  );
}
