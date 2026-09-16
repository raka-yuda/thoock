"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const slides = [
  {
    image: "/login/dashboard.png",
    alt: "Thoock creative production dashboard",
    title: "Research. Create. Prepare.",
    description:
      "Move promising ideas into submission-ready image packs with one focused workflow.",
  },
  {
    image: "/login/generation.png",
    alt: "Thoock image generation history",
    title: "Generate with control.",
    description:
      "Choose the provider, understand the cost, and keep every production attempt visible.",
  },
  {
    image: "/login/review.png",
    alt: "Thoock image review queue",
    title: "Review. Refine. Export.",
    description:
      "Inspect the real output, complete human checks, and package only work you approve.",
  },
] as const;

export function LoginShowcase() {
  const [active, setActive] = useState(0);
  const show = useCallback((index: number) => {
    setActive((index + slides.length) % slides.length);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(
      () => setActive((current) => (current + 1) % slides.length),
      5600,
    );
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section
      className="relative z-10 flex h-full min-h-[100dvh] flex-col overflow-hidden px-12 py-16 xl:px-[5.75rem] xl:py-24"
      aria-roledescription="carousel"
      aria-label="Thoock product tour"
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") show(active + 1);
        if (event.key === "ArrowLeft") show(active - 1);
      }}
    >
      <div className="w-full max-w-2xl">
        <div key={active} className="page-enter min-h-44">
          <h2 className="text-[length:var(--font-size-display)] font-semibold leading-[var(--line-height-heading)] tracking-[-.045em] text-white">
            {slides[active].title}
          </h2>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-emerald-50/88">
            {slides[active].description}
          </p>
        </div>
        <div className="mt-7 flex items-center gap-2" role="tablist">
          {slides.map((slide, index) => (
            <button
              key={slide.image}
              type="button"
              role="tab"
              aria-selected={active === index}
              aria-label={`Show slide ${index + 1}: ${slide.title}`}
              onClick={() => show(index)}
              className={cn(
                "h-2 rounded-full bg-emerald-300/45 outline-none transition-[width,background-color,transform] duration-300 hover:scale-110 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-900",
                active === index ? "w-7 bg-white" : "w-2",
              )}
            />
          ))}
        </div>
      </div>

      <div
        data-slot="login-showcase-stage"
        className="relative mt-12 min-h-0 flex-1 [perspective-origin:30%_5%] [perspective:1200px]"
      >
        <div
          data-slot="login-showcase-screen"
          className="absolute left-[2%] top-16 w-[138%] origin-top-left [transform-style:preserve-3d] [transform:rotateX(10deg)_rotateY(-16deg)_rotateZ(8deg)]"
        >
          <div className="[perspective:1200px]">
            <div className="[transform:rotateX(45deg)_rotateZ(18deg)] aspect-[1505/1045] overflow-hidden rounded-[1.35rem] border-[3px] border-white/80 bg-[#f7faf8] shadow-[0_52px_120px_-30px_rgba(0,0,0,.78),0_8px_18px_-8px_rgba(0,0,0,.42)]">
              <div
                className="login-showcase-track flex h-full"
                style={{ transform: `translate3d(-${active * 100}%, 0, 0)` }}
              >
                {slides.map((slide, index) => (
                  <div
                    key={slide.image}
                    className="relative h-full w-full shrink-0"
                    role="tabpanel"
                    aria-hidden={active !== index}
                  >
                    <Image
                      src={slide.image}
                      alt={slide.alt}
                      fill
                      priority={index === 0}
                      sizes="(min-width: 1024px) 58vw, 0px"
                      className="object-cover object-top"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <span className="sr-only" aria-live="polite">
        Slide {active + 1} of {slides.length}: {slides[active].title}
      </span>
    </section>
  );
}
