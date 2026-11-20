/**
 * What a print and its publish run on, in one module so `services/printJob` loads it with a
 * single dynamic import when a print starts: the writer, the brief, the house stylesheet, the
 * paper boundary and the site's publisher. None of it is in the app's first chunk.
 */
export { WriterError, printFrontPage } from "@/services/frontPage";
export { loadEditionContext, rememberLocalPrint } from "@/services/editionContext";
export { PublishError, leadHeadline, publishToObserver } from "@/services/observerSite";
export { utcDay } from "@/lib/frontPage/observerSite";
