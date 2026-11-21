"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

type Kind = "network" | "class";

const COPY: Record<Kind, { eyebrow: string; title: string; body: string }> = {
  network: {
    eyebrow: "Teacher invitation",
    title: "You're invited to use Scorpio",
    body: "The Scorpio team has given you access. Create your account to get started.",
  },
  class: {
    eyebrow: "Class invitation",
    title: "You're invited to join a class",
    body: "Your teacher has saved you a seat. Create your account and you'll land straight in the class.",
  },
};

const COLORS = ["#7c3aed", "#a78bfa", "#c4b5fd", "#8b5cf6", "#ddd6fe", "#6d28d9"];

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vr: number;
  color: string;
};

function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const pieces: Piece[] = [];
    const burst = (originX: number, dir: number) => {
      for (let i = 0; i < 70; i++) {
        const angle = -Math.PI / 2 + dir * (0.15 + Math.random() * 0.7);
        const speed = 9 + Math.random() * 10;
        pieces.push({
          x: originX,
          y: height * 0.85,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          w: 5 + Math.random() * 5,
          h: 3 + Math.random() * 4,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.4,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
        });
      }
    };
    burst(width * 0.1, 1);
    burst(width * 0.9, -1);

    let frame = 0;
    let raf = 0;
    const tick = () => {
      frame++;
      ctx.clearRect(0, 0, width, height);
      for (const p of pieces) {
        p.vy += 0.28;
        p.vx *= 0.99;
        p.vy *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, Math.min(1, 1 - (frame - 120) / 60));
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (frame < 180) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, width, height);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[60] h-full w-full"
    />
  );
}

export function InviteCelebration({ kind, code }: { kind: Kind; code: string }) {
  const storageKey = `scorpio-invite-celebrated:${code}`;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!code) return;
    try {
      if (sessionStorage.getItem(storageKey)) return;
    } catch {
      // Storage blocked: show it once for this mount.
    }
    const t = setTimeout(() => {
      try {
        sessionStorage.setItem(storageKey, "1");
      } catch {}
      setOpen(true);
    }, 350);
    return () => clearTimeout(t);
  }, [code, storageKey]);

  const copy = COPY[kind];

  return (
    <CelebrationDialog
      open={open}
      onOpenChange={setOpen}
      eyebrow={copy.eyebrow}
      title={copy.title}
      body={copy.body}
      action="Get started"
    />
  );
}

/** The confetti + logo dialog shared by invite links and the pilot welcome. */
export function CelebrationDialog({
  open,
  onOpenChange,
  eyebrow,
  title,
  body,
  action,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eyebrow: string;
  title: string;
  body: React.ReactNode;
  action: string;
  children?: React.ReactNode;
}) {
  return (
    <>
      {open && <Confetti />}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent showCloseButton={false} className="sm:max-w-md overflow-hidden p-0 gap-0">
          <div className="h-1 w-full bg-primary" />
          <div className="px-8 pt-10 pb-8 text-center">
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
              className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full border border-primary/20 bg-accent"
            >
              <Logo size={30} className="text-primary" />
            </motion.div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
              {eyebrow}
            </p>
            <DialogTitle className="mt-3 text-2xl font-semibold tracking-tight">
              {title}
            </DialogTitle>
            <DialogDescription className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              {body}
            </DialogDescription>
            {children}
            <Button className="mt-8 w-full cursor-pointer" onClick={() => onOpenChange(false)}>
              {action}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
