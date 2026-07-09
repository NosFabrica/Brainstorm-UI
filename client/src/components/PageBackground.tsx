import { GlossBackground } from "@/components/GlossBackground";

/**
 * The shared page backdrop. Delegates to {@link GlossBackground} so every page
 * (info/marketing pages via InfoPageLayout, plus the app pages that render this
 * directly) shares the one glossy white + soft aurora standard — no grids, no
 * floating code-graph.
 */
export default function PageBackground() {
  return <GlossBackground />;
}
