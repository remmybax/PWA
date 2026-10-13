import { redirect } from "next/navigation";
import Link from "next/link";
import { requirePageUser } from "@/server/session";
import { getStore } from "@/server/store";
import { startInspection } from "@/server/inspections";
import { fleetBoard } from "@/server/fleet";
import { AppBar } from "@/components/AppBar";
import { ChevronLeft } from "@/components/icons";
import { SetupForm } from "./SetupForm";

export const metadata = { title: "New inspection" };

async function start(_prev: { error: string } | null, formData: FormData): Promise<{ error: string } | null> {
  "use server";
  const user = await requirePageUser(["driver", "manager", "mechanic"]);
  let id: string;
  try {
    const insp = await startInspection(user, {
      truckId: String(formData.get("truckId") ?? ""),
      trailerId: String(formData.get("trailerId") ?? "") || null,
      location: String(formData.get("location") ?? ""),
    });
    id = insp.id;
  } catch (e) {
    return { error: (e as Error).message };
  }
  redirect(`/inspect/${id}`);
}

export default async function NewInspection({ searchParams }: PageProps<"/inspect/new">) {
  const user = await requirePageUser(["driver", "manager", "mechanic"]);
  const { truck } = await searchParams;
  const board = await fleetBoard(getStore());
  const trucks = board.trucks.map((t) => ({
    id: t.truck.id,
    unit: t.truck.unit,
    label: `${t.truck.unit} · ${t.truck.year} ${t.truck.make} ${t.truck.model}`.trim(),
    defaultTrailerId: t.trailer?.id ?? t.truck.defaultTrailerId ?? null,
    due: t.dueStatus,
  }));
  const trailers = board.vehicles
    .filter((v) => v.kind === "trailer" && v.active)
    .sort((a, b) => a.unit.localeCompare(b.unit, undefined, { numeric: true }))
    .map((v) => ({ id: v.id, label: `${v.unit} · ${v.make} ${v.model}`.trim() }));

  return (
    <main className="phone">
      <AppBar user={user} />
      <div className="body-pad">
        <Link href="/" className="btn btn-quiet" style={{ alignSelf: "flex-start" }}>
          <ChevronLeft /> Back
        </Link>
        <h1 className="heading" style={{ fontSize: 28 }}>New truck inspection</h1>
        <p className="lead">
          Pick the truck and the trailer hooked to it. You&apos;ll walk the truck, photograph the paperwork and count the supplies. Plan on 30 to 45
          minutes; you can stop and pick it up again later.
        </p>
        <SetupForm action={start} trucks={trucks} trailers={trailers} preselect={typeof truck === "string" ? truck : ""} />
      </div>
    </main>
  );
}
