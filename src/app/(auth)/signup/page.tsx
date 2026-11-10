import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string; email?: string }> }) {
  const user = await getSessionUser();
  const { next, email } = await searchParams;
  if (user) redirect(next && next.startsWith("/") ? next : "/projects");
  return <SignupForm next={next && next.startsWith("/") ? next : "/onboarding"} defaultEmail={email ?? ""} />;
}
