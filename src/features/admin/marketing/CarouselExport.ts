// ─── Carousel Export Utility ──────────────────────────────────────────────────
// Renders multiple React components to PNG using html-to-image.
// Each carousel slide is temporarily mounted off-screen, captured, then removed.
// ─────────────────────────────────────────────────────────────────────────────

import { toPng } from "html-to-image";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import type { ReactElement } from "react";

export interface CarouselSlide {
  filename: string;
  element: ReactElement;
  w: number;
  h: number;
}

export async function exportCarouselSlides(
  slides: CarouselSlide[],
  onProgress: (done: number, total: number) => void,
): Promise<void> {
  const container = document.createElement("div");
  container.style.cssText = "position:fixed;left:-99999px;top:0;z-index:-1;pointer-events:none;";
  document.body.appendChild(container);

  try {
    for (let i = 0; i < slides.length; i++) {
      const { filename, element, w, h } = slides[i];

      const wrapper = document.createElement("div");
      wrapper.style.cssText = `width:${w}px;height:${h}px;overflow:hidden;`;
      container.appendChild(wrapper);

      const root = createRoot(wrapper);

      await new Promise<void>((resolve) => {
        root.render(
          createElement("div", {
            style: { width: w, height: h, overflow: "hidden" },
          }, element),
        );
        // Give React one tick to commit the render
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });

      const inner = wrapper.firstElementChild as HTMLElement | null;
      if (inner) {
        const dataUrl = await toPng(inner, {
          width: w,
          height: h,
          pixelRatio: 1,
          style: { transform: "none" },
        });
        const link = document.createElement("a");
        link.download = filename;
        link.href = dataUrl;
        link.click();
        await new Promise<void>((r) => setTimeout(r, 120));
      }

      root.unmount();
      container.removeChild(wrapper);
      onProgress(i + 1, slides.length);
    }
  } finally {
    document.body.removeChild(container);
  }
}
