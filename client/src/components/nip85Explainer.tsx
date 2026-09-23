import type { ReactNode } from "react";
import { ExternalLink, FileSignature, HeartHandshake, Rocket } from "lucide-react";

// The NIP-85 explainer copy, shared verbatim between the consent card shown at
// the "calculate my scores" step and the dashboard's ActivateBrainstormModal —
// one voice for what selecting Brainstorm as service provider means, wherever
// the question is asked.

export const NIP85_URL = "https://github.com/nostr-protocol/nips/blob/master/85.md";

export interface Nip85ExplainerSection {
  key: string;
  icon: ReactNode;
  title: string;
  content: ReactNode;
}

export const nip85ExplainerSections: Nip85ExplainerSection[] = [
  {
    key: "what",
    icon: <FileSignature className="h-4 w-4" />,
    title: "What does this mean?",
    content: (
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          Selecting Brainstorm as your Service Provider signs a nostr note (kind 10040)
          that tells compatible clients where to find the scores we publish on your behalf.
        </p>
        <a
          href={NIP85_URL}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-link hover:text-brand-primary transition-colors"
          data-testid="link-nip85-learn-more-what"
        >
          Learn more in NIP-85: Trusted Assertions
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    ),
  },
  {
    key: "why",
    icon: <HeartHandshake className="h-4 w-4" />,
    title: "Why this matters",
    content: (
      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
        Harness your extended and trusted nostr community to help you eliminate spam and find
        the content that best suits your interests and values. Take control over your time and
        attention. Steer clear of the information gatekeepers and the advertisers who only see
        you as their product!
      </p>
    ),
  },
  {
    key: "next",
    icon: <Rocket className="h-4 w-4" />,
    title: "What happens next",
    content: (
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          We will calculate scores for your entire nostr network, entirely from YOUR
          perspective, using standard nostr follows, mutes, and reports. This usually takes
          5–10 minutes.
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          We next publish those scores as nostr notes (called Trusted Assertions) which makes
          them available for use by clients and apps throughout the nostr network.
        </p>
        <a
          href={NIP85_URL}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-link hover:text-brand-primary transition-colors"
          data-testid="link-nip85-learn-more-next"
        >
          Learn more about NIP-85: Trusted Assertions
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    ),
  },
];
