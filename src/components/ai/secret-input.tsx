"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { Input } from "@/components/ui/input";

/** Replace-only secret field: never pre-filled, never echoes a stored value. */
export function SecretInput({ id, value, onChange, placeholder, disabled }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input id={id} type={show ? "text" : "password"} autoComplete="off" spellCheck={false} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} className="pr-10 font-mono" data-1p-ignore data-lpignore="true" />
      <button type="button" onClick={() => setShow((s) => !s)} className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={show ? "Hide key" : "Show key while typing"}>
        {show ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
      </button>
    </div>
  );
}
