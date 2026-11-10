"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function SignupForm({ next, defaultEmail }: { next: string; defaultEmail: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setPending(true);
    setError(null);
    const { error } = await authClient.signUp.email({ name: name.trim(), email, password });
    setPending(false);
    if (error) {
      setError(error.message ?? "Could not create your account");
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <div>
      <h1 className="text-center text-2xl font-semibold tracking-tight">Create your account</h1>
      <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} className="h-10 rounded-lg" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-10 rounded-lg" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="h-10 rounded-lg" />
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" className="h-10 w-full rounded-lg" disabled={pending || !name || !email || !password}>
          {pending && <Loader2Icon className="size-4 animate-spin" />} Create account
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-foreground underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}
