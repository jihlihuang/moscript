"use client";

import { useEffect, useRef, useState } from "react";
import { LogOut } from "lucide-react";

type Props = {
  returnTo?: string;
  className?: string;
  labelClassName?: string;
  onBeforeLogout?: () => void;
};

export function LogoutButton({ returnTo = "/", className, labelClassName, onBeforeLogout }: Props) {
  const [isPendingConfirm, setIsPendingConfirm] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!isPendingConfirm) return;
    const timer = setTimeout(() => setIsPendingConfirm(false), 3000);
    return () => clearTimeout(timer);
  }, [isPendingConfirm]);

  const handleClick = () => {
    if (!isPendingConfirm) {
      setIsPendingConfirm(true);
      return;
    }
    onBeforeLogout?.();
    formRef.current?.submit();
  };

  return (
    <form ref={formRef} action={`/api/auth/logout?returnTo=${returnTo}`} method="post" className="contents">
      <button
        type="button"
        onClick={handleClick}
        className={isPendingConfirm
          ? "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-red-500 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-100 sm:px-4"
          : className}
      >
        <LogOut className="h-4 w-4" />
        {isPendingConfirm
          ? "確認登出？"
          : labelClassName
            ? <span className={labelClassName}>登出</span>
            : "登出"}
      </button>
    </form>
  );
}
