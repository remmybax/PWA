import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePageUser } from "@/server/session";
import { getStore } from "@/server/store";
import { addVehicle, updateVehicle, type VehicleInput } from "@/server/fleet";
import { DeskShell } from "@/components/DeskShell";
import type { Vehicle } from "@/lib/types";

export const metadata = { title: "Fleet" };

function input(f: FormData): VehicleInput {
  const s = (k: string) => String(f.get(k) ?? "");
  return { kind: s("kind") === "trailer" ? "trailer" : "truck", unit: s("unit"), vin: s("vin"), year: s("year"), make: s("make"), model: s("model"), plate: s("plate"), notes: s("notes"), defaultTrailerId: s("defaultTrailerId") || null };
}

async function save(formData: FormData) {
  "use server";
  const me = await requirePageUser(["manager"]);
  const id = String(formData.get("id") ?? "");
  let error = "";
  try {
    if (id) await updateVehicle(me, id, { ...input(formData), active: formData.get("active") !== "0" });
    else await addVehicle(me, input(formData));
  } catch (e) {
    error = (e as Error).message;
  }
  revalidatePath("/dashboard/fleet");
  if (error) redirect(`/dashboard/fleet?error=${encodeURIComponent(error)}${id ? `&edit=${id}` : ""}`);
  redirect("/dashboard/fleet?saved=1");
}

function VehicleForm({ v, kind, trailers }: { v?: Vehicle; kind: "truck" | "trailer"; trailers: Vehicle[] }) {
  const field = (name: keyof Vehicle, label: string, opts: { mono?: boolean; required?: boolean; max?: number; placeholder?: string } = {}) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="field-label">{label}</span>
      <input
        name={name}
        className={`input ${opts.mono ? "mono" : ""}`}
        defaultValue={v ? String(v[name] ?? "") : ""}
        required={opts.required}
        maxLength={opts.max}
        placeholder={opts.placeholder}
      />
    </label>
  );
  return (
    <form action={save} className="box box-pad" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 12, alignItems: "end" }}>
      {v && <input type="hidden" name="id" value={v.id} />}
      <input type="hidden" name="kind" value={kind} />
      {field("unit", kind === "truck" ? "Truck unit #" : "Trailer unit #", { required: true, max: 20, mono: true, placeholder: kind === "truck" ? "107" : "T-206" })}
      {field("year", "Year", { mono: true, max: 4 })}
      {field("make", "Make", { max: 30 })}
      {field("model", "Model", { max: 40 })}
      {field("vin", "VIN", { mono: true, max: 17 })}
      {field("plate", "Plate", { mono: true, max: 15 })}
      {kind === "truck" && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="field-label">Usual trailer</span>
          <select name="defaultTrailerId" className="input" defaultValue={v?.defaultTrailerId ?? ""}>
            <option value="">None</option>
            {trailers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.unit}
              </option>
            ))}
          </select>
        </label>
      )}
      {field("notes", "Notes", { max: 300 })}
      {v && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="field-label">In use</span>
          <select name="active" className="input" defaultValue={v.active ? "1" : "0"}>
            <option value="1">Yes</option>
            <option value="0">Retired</option>
          </select>
        </label>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary">{v ? "Save" : `Add ${kind}`}</button>
        {v && (
          <Link href="/dashboard/fleet" className="btn btn-quiet">
            Cancel
          </Link>
        )}
      </div>
    </form>
  );
}

export default async function Fleet({ searchParams }: PageProps<"/dashboard/fleet">) {
  const user = await requirePageUser(["manager", "mechanic", "viewer"]);
  const { edit, error, saved } = await searchParams;
  const vehicles = (await getStore().listVehicles()).sort((a, b) => Number(b.active) - Number(a.active) || a.unit.localeCompare(b.unit, undefined, { numeric: true }));
  const trucks = vehicles.filter((v) => v.kind === "truck");
  const trailers = vehicles.filter((v) => v.kind === "trailer");
  const editing = typeof edit === "string" ? vehicles.find((v) => v.id === edit) : undefined;
  const manager = user.role === "manager";
  const unitOf = (id?: string | null) => vehicles.find((v) => v.id === id)?.unit ?? "—";

  const table = (list: Vehicle[], kind: "truck" | "trailer") => (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Unit</th>
            <th>Year / make / model</th>
            <th>VIN</th>
            <th>Plate</th>
            {kind === "truck" && <th>Usual trailer</th>}
            <th>Status</th>
            {manager && <th />}
          </tr>
        </thead>
        <tbody>
          {list.map((v) => (
            <tr key={v.id} style={{ opacity: v.active ? 1 : 0.55 }}>
              <td>
                <Link href={`/dashboard/trucks/${v.id}`} className="cell-link">
                  {v.unit}
                </Link>
              </td>
              <td>{[v.year, v.make, v.model].filter(Boolean).join(" ") || "—"}</td>
              <td className="num">{v.vin || "—"}</td>
              <td className="num">{v.plate || "—"}</td>
              {kind === "truck" && <td>{unitOf(v.defaultTrailerId)}</td>}
              <td>{v.active ? <span className="badge badge-ok">In use</span> : <span className="badge badge-grey">Retired</span>}</td>
              {manager && (
                <td>
                  <Link href={`/dashboard/fleet?edit=${v.id}`} className="btn btn-quiet" style={{ minHeight: 36 }}>
                    Edit
                  </Link>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!list.length && <div className="empty">None yet.</div>}
    </div>
  );

  return (
    <DeskShell user={user} current="/dashboard/fleet">
      <div>
        <h1 className="heading" style={{ fontSize: 32 }}>Fleet</h1>
        <p className="lead">Drivers can only inspect units on this list, so unit numbers stay consistent. Retiring a unit keeps its history.</p>
      </div>
      {typeof error === "string" && <div className="note-warn" role="alert">{error}</div>}
      {saved && <div className="note-ok" role="status">Saved.</div>}
      {editing && manager && (
        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 className="section-label">
            Edit {editing.kind} {editing.unit}
          </h2>
          <VehicleForm v={editing} kind={editing.kind} trailers={trailers} />
        </section>
      )}
      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h2 className="section-label">Trucks ({trucks.filter((v) => v.active).length})</h2>
        {manager && !editing && <VehicleForm kind="truck" trailers={trailers} />}
        {table(trucks, "truck")}
      </section>
      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h2 className="section-label">Trailers ({trailers.filter((v) => v.active).length})</h2>
        {manager && !editing && <VehicleForm kind="trailer" trailers={trailers} />}
        {table(trailers, "trailer")}
      </section>
    </DeskShell>
  );
}
