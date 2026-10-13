import { redirect } from "next/navigation";
import { getStore } from "@/server/store";
import { demoSignInEnabled, getCurrentUser, homeFor, signIn } from "@/server/session";
import { usesPins } from "@/server/people";
import { PIN_LENGTH } from "@/server/pin";
import PinForm from "./PinForm";
import styles from "./signin.module.css";

export const metadata = { title: "Sign in" };

const ROLE_LABEL = { driver: "Driver", dispatch: "Dispatch · full access", viewer: "View and export" } as const;

async function signInAs(formData: FormData) {
  "use server";
  if (!demoSignInEnabled()) throw new Error("Demo sign-in is off");
  const id = String(formData.get("userId") ?? "");
  const user = await getStore().getUser(id);
  if (!user || !user.active) redirect("/signin");
  await signIn(user.id);
  redirect(homeFor(user));
}

export default async function SignInPage() {
  const current = await getCurrentUser();
  if (current) redirect(homeFor(current));

  const enabled = demoSignInEnabled();
  const users = enabled ? (await getStore().listUsers()).filter((u) => u.active) : [];

  return (
    <main className="phone">
      <header className="appbar">
        <img src="/indeca-logo.png" alt="Indeca Crude Xpress" />
      </header>
      <div className={styles.body}>
        <h1 className="heading" style={{ fontSize: 28 }}>Sign in</h1>
        {enabled ? (
          <>
            <p className={styles.note}>
              Demo build: pick who you are. Once the app is connected to Supabase, people sign in with their mobile number
              and a PIN from dispatch.
            </p>
            <form action={signInAs} className={styles.list}>
              {users.map((u) => (
                <button key={u.id} name="userId" value={u.id} className={styles.person}>
                  <span className={styles.name}>{u.name}</span>
                  <span className={styles.role}>{ROLE_LABEL[u.role]}</span>
                </button>
              ))}
            </form>
          </>
        ) : usesPins() ? (
          <PinForm pinLength={PIN_LENGTH} />
        ) : (
          <p className={styles.note}>Sign-in isn&apos;t set up on this server yet. Ask dispatch for access.</p>
        )}
      </div>
    </main>
  );
}
