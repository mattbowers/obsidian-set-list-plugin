import { App, Component, loadPdfJs, TFile } from "obsidian";

interface PdfJsViewport {
	width: number;
	height: number;
}

interface PdfJsPage {
	getViewport(params: { scale: number }): PdfJsViewport;
	render(params: { canvasContext: CanvasRenderingContext2D; viewport: PdfJsViewport; transform?: number[] }): {
		promise: Promise<void>;
	};
}

interface PdfJsDocument {
	numPages: number;
	getPage(pageNumber: number): Promise<PdfJsPage>;
	destroy(): void;
}

interface PdfJsLib {
	getDocument(params: { data: ArrayBuffer }): { promise: Promise<PdfJsDocument> };
}

/** pdf.js's SpreadMode.EVEN semantics, reimplemented manually since this renders pages directly
 *  rather than using pdf.js's own PDFViewer widget: pages 1-2, 3-4, 5-6, etc. paired side by side,
 *  no lone first page. Page numbers are 1-based, matching pdf.js's own convention. */
function buildSpreads(pageCount: number): number[][] {
	const spreads: number[][] = [];
	for (let p = 1; p <= pageCount; p += 2) {
		spreads.push(p + 1 <= pageCount ? [p, p + 1] : [p]);
	}
	return spreads;
}

async function renderPageToCanvas(page: PdfJsPage, scale: number): Promise<HTMLCanvasElement> {
	const viewport = page.getViewport({ scale });
	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Could not get 2D canvas context");

	const dpr = window.devicePixelRatio || 1;
	canvas.width = Math.floor(viewport.width * dpr);
	canvas.height = Math.floor(viewport.height * dpr);
	canvas.style.width = `${viewport.width}px`;
	canvas.style.height = `${viewport.height}px`;

	await page.render({
		canvasContext: ctx,
		viewport,
		transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
	}).promise;

	return canvas;
}

/** Resolves once `container` has a real layout width, for a leaf that's still 0-width when
 *  renderPdf runs (e.g. restored mid-layout from a saved workspace, or opened in a background
 *  tab/split) — rendering spreads against a 0 width would scale every canvas down to nothing,
 *  with nothing else in Stage view triggering a re-render once the leaf actually lays out. */
function waitForNonZeroWidth(container: HTMLElement, component: Component): Promise<void> {
	if (container.clientWidth > 0) return Promise.resolve();
	return new Promise((resolve) => {
		const observer = new ResizeObserver(() => {
			if (container.clientWidth > 0) {
				observer.disconnect();
				resolve();
			}
		});
		observer.observe(container);
		component.register(() => {
			observer.disconnect();
			resolve();
		});
	});
}

/** Renders a PDF song's pages directly via Obsidian's own pdf.js (`loadPdfJs()`, a public API —
 *  see CLAUDE.md's PDF-rendering section) as 2-page spreads, bypassing the `![[file.pdf]]`
 *  embed/`MarkdownRenderer.render()` path entirely: no toolbar, zoom, text layer, or annotations,
 *  just the pages themselves, stacked vertically in Stage view's existing scroll flow.
 *
 *  `component` is expected to be a fresh, single-use Component owned by the caller (see
 *  SetListStageView.render()) that gets unloaded — via SetListStageView swapping in a new one on
 *  the next navigation, or via the whole Stage view closing — no later than the next song render.
 *  This function registers its own pdf.js document to be destroyed on that unload, and checks a
 *  matching `cancelled` flag between every await so a superseded render stops touching the
 *  document (and stops appending canvases into a container that's no longer current) instead of
 *  racing the newer one. */
export async function renderPdf(app: App, component: Component, container: HTMLElement, file: TFile): Promise<void> {
	let pdfDoc: PdfJsDocument;
	try {
		const pdfjsLib = (await loadPdfJs()) as PdfJsLib;
		const data = await app.vault.readBinary(file);
		pdfDoc = await pdfjsLib.getDocument({ data }).promise;
	} catch (e) {
		console.error("Failed to load PDF", file.path, e);
		container.createDiv({ cls: "set-list-song-missing", text: "Could not load PDF" });
		return;
	}

	let cancelled = false;
	component.register(() => {
		cancelled = true;
		pdfDoc.destroy();
	});

	// Fit each spread to the visible Stage view viewport's height, not the container's width, so
	// a full page (or pair) is visible at once without extra scrolling — the point of Stage view.
	// Falls back to window.innerHeight if the ancestor isn't found (shouldn't happen in practice).
	const availableHeight = container.closest<HTMLElement>(".set-list-stage-view")?.clientHeight ?? window.innerHeight;

	await waitForNonZeroWidth(container, component);
	if (cancelled) return;

	for (const spread of buildSpreads(pdfDoc.numPages)) {
		const pages = await Promise.all(spread.map((n) => pdfDoc.getPage(n)));
		if (cancelled) return;

		const viewports = pages.map((page) => page.getViewport({ scale: 1 }));
		const heightScale = availableHeight / Math.max(...viewports.map((v) => v.height));
		// Capped by width too, so a wide spread (e.g. two portrait pages scaled to fill a short,
		// wide window) can't overflow the container horizontally.
		const widthScale = container.clientWidth / viewports.reduce((sum, v) => sum + v.width, 0);
		const scale = Math.min(heightScale, widthScale);

		const spreadEl = container.createDiv({ cls: "set-list-pdf-spread" });
		for (const page of pages) {
			const canvas = await renderPageToCanvas(page, scale);
			if (cancelled) return;
			spreadEl.appendChild(canvas);
		}
	}
}
