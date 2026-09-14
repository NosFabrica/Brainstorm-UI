/**
 * Addresses in a bio. On Nostr a bare `name@domain` is more often a
 * Fediverse handle, a lightning address or a NIP-05 than an email (census of
 * 600 profiles, 2026-09-05: 2 labelled emails, 22 handles), so only an
 * address the author calls mail — "email:", "mail:", "contact", or written
 * as mailto: — becomes a mail link. Everything else stays as written.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ShareBio } from "@/components/share/ShareBio";

describe("ShareBio — email addresses", () => {
  it("an address the author labels as email opens the mail app", () => {
    render(<ShareBio text={"building relay.tools\n\nemail: cloudfodder@relay.tools"} />);
    const link = screen.getByTestId("bio-email");
    expect(link).toHaveTextContent("cloudfodder@relay.tools");
    expect(link).toHaveAttribute("href", "mailto:cloudfodder@relay.tools");
    expect(link.tagName).toBe("A");
  });

  it("the other ways people say it — mail, e-mail, contact — and a written mailto: count too", () => {
    render(<ShareBio text={"Mail - jvantol@gmail.com · E-mail: a@b.co · Contact hello@relay.tools · mailto:me@x.org"} />);
    const links = screen.getAllByTestId("bio-email");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["mailto:jvantol@gmail.com", "mailto:a@b.co", "mailto:hello@relay.tools", "mailto:me@x.org"]);
    // The mailto: prefix is the author's markup, not something to read.
    expect(links[3]).toHaveTextContent("me@x.org");
    expect(links[3]).not.toHaveTextContent("mailto:");
  });

  it("a bare address — a Fediverse handle, a lightning address — stays as written", () => {
    const { container } = render(<ShareBio text={"find me at suedioh77@mas.to · zap me: cloud@ln.rogue.earth"} />);
    expect(screen.queryByTestId("bio-email")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(container).toHaveTextContent("suedioh77@mas.to");
    expect(container).toHaveTextContent("cloud@ln.rogue.earth");
  });

  it("the label does not turn a mention or a site into mail", () => {
    render(<ShareBio text={"email me via https://relay.tools/contact"} />);
    expect(screen.queryByTestId("bio-email")).toBeNull();
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://relay.tools/contact");
  });
});
