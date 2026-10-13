"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { sectionsFor } from "@/lib/checklist";
import { itemProblem } from "@/lib/inspection";
import type { ItemResult } from "@/lib/types";
import { flushOutbox, outboxCount } from "@/lib/client-api";
import { ArrowRight, ChevronLeft } from "@/components/icons";
import { ItemCard } from "./ItemCard";
import styles from "./section.module.css";

export function SectionScreen({
  inspectionId,
  sectionId,
  hasTrailer,
  initial,
  stamp,
  unitLine,
  today,
}: {
  inspectionId: string;
  sectionId: string;
  hasTrailer: boolean;
  initial: Record<string, ItemResult>;
  stamp: string;
  unitLine: string;
  today: string;
}) {
  const sections = useMemo(() => sectionsFor(hasTrailer), [hasTrailer]);
  const index = sections.findIndex((s) => s.id === sectionId);
  const section = sections[index];
  const next = sections[index + 1];
  const [results, setResults] = useState(initial);
  const [waiting, setWaiting] = useState(0);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setWaiting(outboxCount(inspectionId));
    setOnline(navigator.onLine);
    const up = async () => {
      setOnline(true);
      setWaiting(await flushOutbox());
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    const t = setInterval(async () => {
      if (outboxCount(inspectionId)) setWaiting(await flushOutbox());
    }, 15000);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      clearInterval(t);
    };
  }, [inspectionId]);

  const done = section.items.filter((i) => !itemProblem(i, results[i.id], today)).length;
  const firstOpen = section.items.find((i) => itemProblem(i, results[i.id], today));

  return (
    <>
      <div className={styles.top}>
        <div className={styles.topRow}>
          <Link href={`/inspect/${inspectionId}`} className={styles.back} aria-label="All sections">
            <ChevronLeft size={24} />
          </Link>
          <div className={styles.topText}>
            <div className={styles.topTitle}>{section.title}</div>
            <div className={styles.topSub}>
              {unitLine} · Section {index + 1} of {sections.length}
            </div>
          </div>
          <div className={styles.count}>
            {done}/{section.items.length}
          </div>
        </div>
        <div className="bar" aria-hidden="true">
          <span style={{ width: `${(done / section.items.length) * 100}%` }} />
        </div>
        {(!online || waiting > 0) && (
          <div className={styles.offline} role="status">
            {!online ? "No signal. Keep going: answers are kept on the phone." : `${waiting} answer${waiting === 1 ? "" : "s"} waiting to send…`}
          </div>
        )}
      </div>

      <div className={styles.list}>
        <p className={styles.intro}>{section.intro}</p>
        {section.items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            initial={results[item.id]}
            inspectionId={inspectionId}
            stamp={stamp}
            today={today}
            onChange={(id, r) => setResults((x) => ({ ...x, [id]: r }))}
          />
        ))}
      </div>

      <div className={styles.foot}>
        {firstOpen ? (
          <a href={`#item-${firstOpen.id}`} className="btn btn-quiet" style={{ flex: 1 }}>
            Next unanswered
          </a>
        ) : null}
        {next ? (
          <Link href={`/inspect/${inspectionId}/${next.id}`} className="btn btn-primary" style={{ flex: 2, minHeight: 52 }}>
            Next: {next.short} <ArrowRight />
          </Link>
        ) : (
          <Link href={`/inspect/${inspectionId}/review`} className="btn btn-orange" style={{ flex: 2, minHeight: 52 }}>
            Review and sign <ArrowRight />
          </Link>
        )}
      </div>
    </>
  );
}
