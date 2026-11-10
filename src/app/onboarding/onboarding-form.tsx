"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorMessage } from "@/lib/api";

export function OnboardingForm({ hasExisting }: { hasExisting: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const org = await api.post<{ id: string }>("organizations", { name });
      await api.post("organizations/switch", { organizationId: org.id });
      if (projectName.trim()) {
        const project = await api.post<{ id: string }>("projects", { name: projectName.trim() });
        router.push(`/projects/${project.id}/import`);
      } else {
        router.push("/projects");
      }
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="org">Organization name</Label>
        <Input id="org" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="Northwind Studios" className="h-10 rounded-lg" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="project">
          First project <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input id="project" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Season 2 — Spanish & German dub" className="h-10 rounded-lg" />
        <p className="text-xs text-muted-foreground">You can import your existing spreadsheet right after.</p>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" className="h-10 rounded-lg px-5" disabled={pending || name.trim().length < 2}>
          {pending && <Loader2Icon className="size-4 animate-spin" />} {hasExisting ? "Create organization" : "Continue"}
        </Button>
        {hasExisting && (
          <Link href="/projects" className="text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </Link>
        )}
      </div>
    </form>
  );
}
