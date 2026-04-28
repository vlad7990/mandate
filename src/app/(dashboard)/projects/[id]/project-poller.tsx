"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 1500;
const TIMEOUT_MS = 60_000;

export function ProjectPoller({ analysisReady }: { analysisReady: boolean }) {
  const router = useRouter();
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (analysisReady) return;

    if (startedAtRef.current == null) {
      startedAtRef.current = Date.now();
    }

    const id = setInterval(() => {
      if (
        startedAtRef.current != null &&
        Date.now() - startedAtRef.current > TIMEOUT_MS
      ) {
        clearInterval(id);
        return;
      }
      router.refresh();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(id);
  }, [analysisReady, router]);

  return null;
}
