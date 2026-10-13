import type { User } from "@/lib/types";

/** White header with the logo and the person's name + Sign out. */
export function AppBar({ user, children, desk }: { user?: User | null; children?: React.ReactNode; desk?: boolean }) {
  return (
    <header className={`appbar ${desk ? "desk-bar" : ""}`}>
      <a href={user?.role === "driver" || !user ? "/" : "/dashboard"} aria-label="Home">
        <img src="/indeca-logo.png" alt="Indeca Crude Xpress" />
      </a>
      {children}
      {user && (
        <form action="/signout" method="post" className="who">
          <span>{user.name}</span>
          <button className="signout">Sign out</button>
        </form>
      )}
    </header>
  );
}
