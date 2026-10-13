import "server-only";
import { notFound, redirect } from "next/navigation";
import type { Inspection, User, Vehicle } from "@/lib/types";
import { canSee } from "./inspections";
import { getStore } from "./store";

export interface InspectionView {
  insp: Inspection;
  truck: Vehicle | null;
  trailer: Vehicle | null;
}

export async function viewOf(insp: Inspection): Promise<InspectionView> {
  const store = getStore();
  const [truck, trailer] = await Promise.all([store.getVehicle(insp.truckId), insp.trailerId ? store.getVehicle(insp.trailerId) : null]);
  return { insp, truck, trailer };
}

/** For pages: an inspection this person may see, or a 404. */
export async function visibleInspection(user: User, id: string): Promise<InspectionView> {
  const insp = await getStore().getInspection(id);
  if (!insp || !canSee(user, insp)) notFound();
  return viewOf(insp);
}

/** For the inspector's own working screens: their draft; a signed-off one goes to its report. */
export async function ownDraftView(user: User, id: string): Promise<InspectionView> {
  const insp = await getStore().getInspection(id);
  if (!insp || insp.inspectorId !== user.id) notFound();
  if (insp.certifiedAt) redirect(`/inspect/${id}/done`);
  return viewOf(insp);
}

export function unitLine(v: InspectionView): string {
  return `Truck ${v.truck?.unit ?? "?"}${v.trailer ? ` · Trailer ${v.trailer.unit}` : " · No trailer"}`;
}
