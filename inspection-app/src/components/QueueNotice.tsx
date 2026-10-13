"use client";

import { useEffect, useState } from "react";
import { flushOutbox, outboxCount } from "@/lib/client-api";
import { flushPhotos, queuedPhotos } from "@/lib/photo-queue";

/** On the review screen: warns about answers or photos still on the phone and tries to send them. */
export function QueueNotice({ inspectionId }: { inspectionId: string }) {
  const [counts, setCounts] = useState({ answers: 0, photos: 0 });
  useEffect(() => {
    let alive = true;
    async function check() {
      await flushPhotos();
      await flushOutbox();
      const photos = (await queuedPhotos(inspectionId)).length;
      if (alive) setCounts({ answers: outboxCount(inspectionId), photos });
    }
    check();
    const t = setInterval(check, 10000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [inspectionId]);
  if (!counts.answers && !counts.photos) return null;
  return (
    <div className="note-info" role="status">
      <strong>Still on this phone:</strong> {counts.answers ? `${counts.answers} answer(s)` : ""}
      {counts.answers && counts.photos ? " and " : ""}
      {counts.photos ? `${counts.photos} photo(s)` : ""}. They send when there&apos;s signal. Photos attach to their item when you open that section again.
    </div>
  );
}
