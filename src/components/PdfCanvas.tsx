import { useEffect, useRef, useState } from 'react';

/**
 * Renders a PDF to canvases.
 *
 * This module is the only importer of pdf.js, and it is reached exclusively
 * through a lazy route, so the renderer never lands in the initial bundle —
 * it costs nothing until a document is actually opened.
 *
 * A renderer is necessary rather than convenient: iOS Safari does not reliably
 * display PDFs inside an iframe or embed, and iOS is the platform this screen
 * exists for.
 */
export default function PdfCanvas({ blob }: { blob: Blob }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    async function render() {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();

        const data = await blob.arrayBuffer();
        if (cancelled) return;

        const pdf = await pdfjs.getDocument({ data }).promise;
        if (cancelled) return;
        setPages(pdf.numPages);

        // Cap the backing store so a many-page document cannot exhaust memory
        // on a phone, while still being sharp enough for a barcode scanner.
        const scale = Math.min(window.devicePixelRatio || 1, 2);

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          if (cancelled) return;
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = 'w-full h-auto rounded-lg bg-white';
          const context = canvas.getContext('2d');
          if (!context) continue;

          container!.appendChild(canvas);
          await page.render({ canvas, canvasContext: context, viewport }).promise;
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not display this PDF.');
        }
      }
    }

    void render();
    return () => {
      cancelled = true;
      container.replaceChildren();
    };
  }, [blob]);

  return (
    <div>
      {error ? (
        <p className="px-4 py-8 text-center text-sm text-warning">{error}</p>
      ) : null}
      {!error && pages === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted">Rendering…</p>
      ) : null}
      <div ref={containerRef} className="space-y-3" />
    </div>
  );
}
