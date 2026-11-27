"use client";

import * as React from "react";
import { Copy, FileCode, Image as ImageIcon, Share2 } from "lucide-react";
import { ClickIcon } from "@/components/ui/click-icon";
import { CheckIcon as AnimatedCheck } from "@animateicons/react/lucide/check-icon";
import { DownloadIcon as AnimatedDownload } from "@animateicons/react/lucide/download-icon";
import { toast } from "sonner";
import { render } from "@/lib/diagram";
import {
  exportFilename,
  exportSvg,
  type ExportedSvg,
  type ExportTheme,
  LIGHT_THEME,
  rasterSize,
  svgDataUrl,
} from "@/lib/diagram/export";
import { isSafeSvg } from "@/lib/diagram/safe";
import { shareCardSvg } from "@/lib/diagram/share-card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Whether the diagrams below offer "Copy image" and the downloads. Off unless a surface turns it on
 * (the course guides do); a diagram's own `exportable` prop wins. It is a context so that ```dg
 * blocks drawn by the Markdown renderer inside such a surface get the control too.
 */
const DiagramExportContext = React.createContext(false);

export function DiagramExport({
  enabled = true,
  children,
}: {
  enabled?: boolean;
  children: React.ReactNode;
}) {
  return <DiagramExportContext.Provider value={enabled}>{children}</DiagramExportContext.Provider>;
}

export interface DiagramProps {
  source: string;
  /**
   * Show the image menu (copy, PNG, SVG). Default: off, or what the nearest <DiagramExport> says.
   * Keep it off where the diagram is part of a question a student is answering.
   */
  exportable?: boolean;
  /** Adds "Download share image": a 1200 x 630 card with this title, course and the diagram. */
  share?: { title: string; course: string; topic?: string };
}

/** A diagram written in the diagram language (a ```dg block). Draws nothing it cannot draw correctly. */
export function Diagram({ source, exportable, share }: DiagramProps) {
  const inherited = React.useContext(DiagramExportContext);
  const canExport = exportable ?? inherited;
  const result = React.useMemo(() => render(source), [source]);
  const figure = React.useRef<HTMLElement>(null);
  if (!result.ok || !result.svg || !isSafeSvg(result.svg)) {
    return (
      <div className="not-prose my-3 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
        Diagram not available
      </div>
    );
  }
  return (
    <figure
      ref={figure}
      className="group/dg not-prose relative my-4 rounded-xl border border-border bg-card text-foreground shadow-xs animate-in fade-in zoom-in-95 duration-500 [--dg-accent:var(--primary)] [--dg-bg:var(--background)]"
      aria-label={result.alt}
    >
      <div
        className="flex justify-center overflow-x-auto p-4"
        dangerouslySetInnerHTML={{ __html: result.svg }}
      />
      {canExport && (
        <DiagramImageMenu
          figure={figure}
          svg={result.svg}
          alt={result.alt}
          source={source}
          share={share}
        />
      )}
    </figure>
  );
}

function DiagramImageMenu({
  figure,
  svg,
  alt,
  source,
  share,
}: {
  figure: React.RefObject<HTMLElement | null>;
  svg: string;
  alt: string;
  source: string;
  share?: DiagramProps["share"];
}) {
  const [copied, setCopied] = React.useState(false);
  const name = alt || "diagram";

  const picture = (): ExportedSvg | undefined =>
    exportSvg(svg, figure.current ? readTheme(figure.current) : LIGHT_THEME);

  const copy = async () => {
    const pic = picture();
    if (!pic) return;
    try {
      await copyPng(pic);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      toast.success("Image copied");
    } catch {
      toast.error("Could not copy the image. Try Download PNG instead.");
    }
  };
  const png = async (pic: ExportedSvg | undefined, filename: string) => {
    if (!pic) return;
    try {
      saveBlob(await rasterise(pic), filename);
    } catch {
      toast.error("Could not make the image. Try Download SVG instead.");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Save or copy this diagram as an image"
          title="Save image"
          className="absolute right-2 top-2 flex size-8 cursor-pointer items-center justify-center rounded-full border border-border bg-background/90 text-muted-foreground opacity-0 shadow-xs outline-none backdrop-blur-sm transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 group-hover/dg:opacity-100 group-focus-within/dg:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:size-7 [@media(hover:none)]:opacity-100"
        >
          {copied ? (
            <ClickIcon icon={AnimatedCheck} className="size-4" aria-hidden />
          ) : (
            <ClickIcon icon={AnimatedDownload} className="size-4" aria-hidden />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void copy()}>
          <Copy aria-hidden /> Copy image
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void png(picture(), exportFilename(name, "png"))}>
          <ImageIcon aria-hidden /> Download PNG
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            const pic = picture();
            if (pic)
              saveBlob(
                new Blob([pic.svg], { type: "image/svg+xml;charset=utf-8" }),
                exportFilename(name, "svg"),
              );
          }}
        >
          <FileCode aria-hidden /> Download SVG
        </DropdownMenuItem>
        {share && (
          <DropdownMenuItem
            onSelect={() =>
              void png(
                shareCardSvg(
                  { ...share, picture: { diagram: source } },
                  figure.current ? readTheme(figure.current) : LIGHT_THEME,
                ),
                exportFilename(`${share.title} share`, "png"),
              )
            }
          >
            <Share2 aria-hidden /> Download share image
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---- the browser half of the export: colours off the page, SVG -> canvas -> PNG ----

/**
 * Any CSS colour (the theme uses oklch) as #rrggbb, by letting a canvas paint it. A saved file may
 * be opened by something that only reads the old colour forms.
 */
function toHex(color: string, fallback: string): string {
  try {
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    if (!ctx || !color.trim()) return fallback;
    ctx.fillStyle = "#010203";
    ctx.fillStyle = color.trim();
    if (ctx.fillStyle === "#010203" && !/^#010203$/i.test(color.trim())) return fallback;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (a === 0) return fallback; // "transparent": no colour to speak of
    return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return fallback;
  }
}

/** The colours the diagram is drawn in right now (light or dark theme, the user's accent). */
function readTheme(figure: HTMLElement): ExportTheme {
  const cs = getComputedStyle(figure);
  const fg = toHex(cs.color, LIGHT_THEME.fg);
  const force = cs.getPropertyValue("--dg-force");
  return {
    fg,
    bg: toHex(cs.backgroundColor, LIGHT_THEME.bg),
    accent: toHex(cs.getPropertyValue("--dg-accent"), LIGHT_THEME.accent),
    force: force.trim() ? toHex(force, fg) : fg,
  };
}

function rasterise(pic: ExportedSvg): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = rasterSize(pic.width, pic.height);
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no canvas"));
      ctx.drawImage(img, 0, 0, size.width, size.height);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no image"))), "image/png");
    };
    img.onerror = () => reject(new Error("the picture could not be loaded"));
    img.src = svgDataUrl(pic.svg);
  });
}

async function copyPng(pic: ExportedSvg): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined")
    throw new Error("no image clipboard");
  // Handing over the promise (not the finished blob) keeps the write inside the click, as Safari requires.
  await navigator.clipboard.write([new ClipboardItem({ "image/png": rasterise(pic) })]);
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
