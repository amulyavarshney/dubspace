"use client";

import { AlertTriangleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ErrorState({ title = "Something went wrong", message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center rounded-2xl border border-danger/30 bg-danger-soft/40 px-6 py-10 text-center">
      <AlertTriangleIcon className="mb-3 size-5 text-danger" />
      <h3 className="text-sm font-semibold">{title}</h3>
      {message && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{message}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
