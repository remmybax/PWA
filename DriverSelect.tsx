"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export default function DriverSelect({ drivers, value }: { drivers: { id: string; name: string }[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#3A404C" }}>
      Driver
      <select
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(params);
          if (e.target.value) next.set("driver", e.target.value);
          else next.delete("driver");
          next.delete("sel");
          router.push(`${pathname}?${next}`);
        }}
        style={{ height: 44, padding: "0 12px", border: "1px solid #D5D8DE", background: "#fff", fontSize: 14 }}
      >
        <option value="">All drivers</option>
        {drivers.map((d) => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>
    </label>
  );
}
