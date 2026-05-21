"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function PracticeKeyboardNav({
  prevHref,
  nextHref,
}: {
  prevHref?: string;
  nextHref?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft" && prevHref) router.push(prevHref);
      if (e.key === "ArrowRight" && nextHref) router.push(nextHref);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [prevHref, nextHref, router]);

  return null;
}
