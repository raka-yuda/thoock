import Image from "next/image";
import { Aperture, LockKeyhole } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { LoginShowcase } from "@/components/login-showcase";

export default function LoginPage() {
  return (
    <main className="grid min-h-[100dvh] overflow-hidden bg-card lg:grid-cols-[.95fr_1.05fr]">
      <section className="relative flex min-h-[100dvh] flex-col overflow-hidden border-r bg-card px-7 py-7 sm:px-10 lg:px-9 lg:py-14">
        <div className="login-geometry pointer-events-none absolute inset-0" />
        <div className="relative flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-full bg-[#08754f] text-white">
            <Aperture className="size-7" />
          </span>
          <span className="text-2xl font-bold tracking-[-.045em]">Thoock</span>
        </div>
        <div className="relative mx-auto my-auto w-full max-w-md pb-12">
          <div className="-translate-y-2">
            <div className="login-auth-emblem mx-auto grid size-14 place-items-center text-emerald-800">
              <LockKeyhole className="relative z-10 size-6" strokeWidth={2.1} />
            </div>
            <h1 className="mt-6 text-center text-[length:var(--font-size-page-title)] font-semibold leading-[var(--line-height-heading)] tracking-[-.04em]">
              Welcome back
            </h1>
            <p className="mx-auto mt-2 max-w-sm text-center text-sm leading-relaxed text-muted-foreground">
              Sign in to continue your creative production workspace.
            </p>
          </div>
          <LoginForm />
          <div className="mt-6 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            <span>Private workspace · Single-user access</span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </div>
      </section>
      <section className="relative hidden min-h-[100dvh] overflow-hidden rounded-l-[1.75rem] bg-[#08754f] text-white lg:block">
        <Image
          src="/login/emerald-texture.png"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 55vw, 0px"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(3,74,49,.08),rgba(0,33,22,.28))]" />
        <LoginShowcase />
      </section>
    </main>
  );
}
