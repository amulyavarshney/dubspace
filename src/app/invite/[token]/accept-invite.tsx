"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/api";

export function AcceptInvite({ token, projectId }: { token: string; projectId: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function accept() {
    setPending(true);
    try {
      await api.post("invitations/accept", { token });
      toast.success("Invitation accepted");
      router.push(projectId ? `/projects/${projectId}` : "/projects");
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
      setPending(false);
    }
  }
  return (
    <Button className="mt-6 h-10 w-full rounded-lg" onClick={accept} disabled={pending}>
      {pending && <Loader2Icon className="size-4 animate-spin" />} Accept invitation
    </Button>
  );
}
