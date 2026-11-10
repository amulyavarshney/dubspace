"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.email({ email, password });
    setPending(false);
    if (error) {
      setError(error.message ?? "Invalid email or password");
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <div>
      <h1 className="text-center text-2xl font-semibold tracking-tight">Welcome back</h1>
      <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-10 rounded-lg" />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
          </div>
          <div className="relative">
            <Input id="password" type={show ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-10 rounded-lg pr-10" />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={show ? "Hide password" : "Show password"}>
              {show ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
            </button>
          </div>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" className="h-10 w-full rounded-lg" disabled={pending || !email || !password}>
          {pending && <Loader2Icon className="size-4 animate-spin" />} Sign in
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href={`/signup${next !== "/projects" ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-foreground underline underline-offset-4">
          Sign up
        </Link>
      </p>
    </div>
  );
}
