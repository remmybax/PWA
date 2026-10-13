"use client";

import { useActionState } from "react";
import { pinSignIn } from "./actions";
import styles from "./signin.module.css";

export default function PinForm({ pinLength }: { pinLength: number }) {
  const [state, action, pending] = useActionState(pinSignIn, null);
  return (
    <form action={action} className={styles.pinForm}>
      <label className={styles.stack}>
        <span className="field-label">Mobile number</span>
        <input name="phone" className="input mono" type="tel" inputMode="tel" autoComplete="tel" required placeholder="(432) 555-1234" />
      </label>
      <label className={styles.stack}>
        <span className="field-label">PIN</span>
        <input
          name="pin"
          className="input mono"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          required
          maxLength={pinLength}
          pattern={`[0-9]{${pinLength}}`}
        />
      </label>
      {state?.error && <div className="field-error" role="alert">{state.error}</div>}
      <button className="btn btn-primary btn-big" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      <p className={styles.note}>Forgot your PIN or new here? A manager sets it for you.</p>
    </form>
  );
}
