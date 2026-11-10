import Link from "next/link";
import { Logo } from "@/components/layout/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <Logo />
      <h1 className="mt-10 text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">The page you are looking for does not exist or you do not have access to it.</p>
      <Link href="/projects" className="mt-6 text-sm underline underline-offset-4">
        Back to projects
      </Link>
    </div>
  );
}
