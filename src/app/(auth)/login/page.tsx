import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getSessionUser();
  const { next } = await searchParams;
  if (user) redirect(next && next.startsWith("/") ? next : "/projects");
  return <LoginForm next={next && next.startsWith("/") ? next : "/projects"} />;
}
