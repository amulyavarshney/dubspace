import { Logo } from "@/components/layout/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-4 pt-10 pb-16">
      <Logo href="/" />
      <div className="mt-24 w-full max-w-[320px]">{children}</div>
    </div>
  );
}
