import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePageUser } from "@/server/session";
import { getStore } from "@/server/store";
import { addPerson, resetPin, updatePerson, usesPins, ROLES } from "@/server/people";
import { PIN_LENGTH } from "@/server/pin";
import { formatPhone } from "@/server/supabase";
import type { Role } from "@/lib/types";
import { DeskShell } from "@/components/DeskShell";
import styles from "./people.module.css";

export const metadata = { title: "People & access" };

const ROLE_TEXT: Record<Role, { label: string; help: string }> = {
  driver: { label: "Driver", help: "Does inspections, sees only their own" },
  manager: { label: "Manager", help: "Everything: dashboard, fleet, people, marks defects repaired" },
  mechanic: { label: "Mechanic / shop", help: "Sees the dashboard, marks defects repaired, can inspect" },
  viewer: { label: "View only", help: "Sees the dashboard and reports, changes nothing" },
};

const PIN_PATTERN = `[0-9]{${PIN_LENGTH}}`;

function back(error: string, ok?: string): never {
  revalidatePath("/dashboard/people");
  if (error) redirect(`/dashboard/people?error=${encodeURIComponent(error)}`);
  redirect(ok ? `/dashboard/people?saved=${ok}` : "/dashboard/people");
}

async function add(formData: FormData) {
  "use server";
  const me = await requirePageUser(["manager"]);
  let error = "";
  try {
    await addPerson(me, {
      name: String(formData.get("name") ?? ""),
      role: String(formData.get("role")) as Role,
      phone: String(formData.get("phone") ?? ""),
      pin: String(formData.get("pin") ?? ""),
    });
  } catch (e) {
    error = (e as Error).message;
  }
  back(error, "person");
}

async function newPin(formData: FormData) {
  "use server";
  const me = await requirePageUser(["manager"]);
  let error = "";
  try {
    await resetPin(me, String(formData.get("id")), String(formData.get("pin") ?? ""));
  } catch (e) {
    error = (e as Error).message;
  }
  back(error, "pin");
}

async function update(formData: FormData) {
  "use server";
  const me = await requirePageUser(["manager"]);
  const id = String(formData.get("id"));
  const name = formData.get("name");
  const role = formData.get("role");
  const active = formData.get("active");
  let error = "";
  try {
    await updatePerson(me, id, {
      ...(name !== null ? { name: String(name) } : {}),
      ...(role ? { role: String(role) as Role } : {}),
      ...(active !== null ? { active: active === "1" } : {}),
    });
  } catch (e) {
    error = (e as Error).message;
  }
  back(error);
}

const SAVED: Record<string, string> = {
  person: "Added. Give them their mobile number and PIN to sign in.",
  pin: "PIN changed. Give it to them in person or by phone.",
};

export default async function PeoplePage({ searchParams }: PageProps<"/dashboard/people">) {
  const me = await requirePageUser(["manager"]);
  const { error, saved } = await searchParams;
  const pins = usesPins();
  const people = (await getStore().listUsers()).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));

  return (
    <DeskShell user={me} current="/dashboard/people">
      <div className={styles.main} style={{ padding: 0, maxWidth: "none" }}>
        <h1 className="heading" style={{ fontSize: 28 }}>People &amp; access</h1>
        <p className={styles.lead}>
          Only people listed here can sign in{pins ? `, with their mobile number and a ${PIN_LENGTH}-digit PIN you choose` : ""}. Switching someone
          off keeps their past inspections.
        </p>

        {typeof error === "string" && <div className={styles.error} role="alert">{error}</div>}
        {typeof saved === "string" && SAVED[saved] && pins && <div className={styles.saved} role="status">{SAVED[saved]}</div>}

        <form action={add} className={`${styles.addForm} ${pins ? styles.addFormPins : ""}`}>
          <label className={styles.stack}>
            <span className="field-label">Name</span>
            <input name="name" className="input" required maxLength={80} placeholder="First and last name" />
          </label>
          {pins && (
            <>
              <label className={styles.stack}>
                <span className="field-label">Mobile number</span>
                <input name="phone" className="input mono" required inputMode="tel" autoComplete="off" placeholder="(432) 555-1234" />
              </label>
              <label className={styles.stack}>
                <span className="field-label">PIN ({PIN_LENGTH} digits)</span>
                <input name="pin" className="input mono" required inputMode="numeric" pattern={PIN_PATTERN} maxLength={PIN_LENGTH} autoComplete="off" />
              </label>
            </>
          )}
          <label className={styles.stack}>
            <span className="field-label">Access</span>
            <select name="role" className="input" defaultValue="driver">
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_TEXT[r].label}</option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary">Add person</button>
        </form>

        <div className={styles.table} role="table">
          <div className={styles.head} role="row">
            <div role="columnheader">Name</div>
            <div role="columnheader">Access</div>
            <div role="columnheader">Status</div>
          </div>
          {people.map((p) => (
            <div key={p.id} role="row" className={`${styles.row} ${p.active ? "" : styles.inactive}`}>
              <div role="cell">
                <form action={update} className={styles.inline}>
                  <input type="hidden" name="id" value={p.id} />
                  <input name="name" defaultValue={p.name} className="input" required maxLength={80} aria-label={`Name for ${p.name}`} />
                  <button className="btn btn-quiet">Save</button>
                </form>
                <div className={styles.help}>
                  {p.phone ? formatPhone(p.phone) : ""}
                  {p.id === me.id && <span className={styles.you} style={{ marginLeft: p.phone ? 8 : 0 }}>You</span>}
                </div>
              </div>
              <div role="cell">
                <form action={update} className={styles.inline}>
                  <input type="hidden" name="id" value={p.id} />
                  <select name="role" defaultValue={p.role} className="input" style={{ width: 170 }} aria-label={`Access for ${p.name}`}>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{ROLE_TEXT[r].label}</option>
                    ))}
                  </select>
                  <button className="btn btn-quiet">Save</button>
                </form>
                <div className={styles.help}>{ROLE_TEXT[p.role].help}</div>
                {pins && (
                  <form action={newPin} className={styles.inline} style={{ marginTop: 8 }}>
                    <input type="hidden" name="id" value={p.id} />
                    <input
                      name="pin"
                      className="input mono"
                      style={{ width: 170 }}
                      required
                      inputMode="numeric"
                      pattern={PIN_PATTERN}
                      maxLength={PIN_LENGTH}
                      placeholder="New PIN"
                      autoComplete="off"
                      aria-label={`New PIN for ${p.name}`}
                    />
                    <button className="btn btn-quiet">Set PIN</button>
                  </form>
                )}
              </div>
              <div role="cell">
                <form action={update}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="active" value={p.active ? "0" : "1"} />
                  <button className={p.active ? "btn btn-quiet" : "btn btn-outline"}>{p.active ? "Switch off" : "Switch on"}</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DeskShell>
  );
}
