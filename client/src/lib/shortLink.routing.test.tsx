/**
 * The uppercase form of a short link has to route.
 *
 * The QR encodes `HTTPS://…/S/AB3XK9QZ` to reach QR's alphanumeric mode, so a
 * scan arrives at `/S/…`, not `/s/…`. If that ever stopped matching, every
 * scanned link would 404 while every copied link kept working — a failure that
 * hides in plain sight.
 *
 * Asserts against SHORT_LINK_ROUTE, the same constant App registers, so this
 * tests our pattern rather than restating wouter's behaviour.
 *
 * Issue: .scratch/shorturl/issues/05-qr-alphanumeric.md
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Route, Router, Switch } from "wouter";
import { memoryLocation } from "wouter/memory-location";

import { SHORT_LINK_ROUTE } from "./shortLink";

function routeTo(path: string) {
  const { hook } = memoryLocation({ path });
  render(
    <Router hook={hook}>
      <Switch>
        <Route path={SHORT_LINK_ROUTE}>
          {(params) => <div data-testid="matched">{params.code}</div>}
        </Route>
        <Route>
          <div data-testid="fell-through" />
        </Route>
      </Switch>
    </Router>,
  );
}

describe("the short-link route", () => {
  it("matches the lowercase form people copy", () => {
    routeTo("/s/ab3xk9qz");
    expect(screen.getByTestId("matched")).toHaveTextContent("ab3xk9qz");
  });

  it("matches the uppercase form a QR scan produces", () => {
    routeTo("/S/AB3XK9QZ");
    expect(screen.getByTestId("matched")).toHaveTextContent("AB3XK9QZ");
  });

  it("hands the code on exactly as typed, leaving case folding to the server", () => {
    routeTo("/S/Ab3xK9qZ");
    expect(screen.getByTestId("matched")).toHaveTextContent("Ab3xK9qZ");
  });

  it("does not swallow a deeper path", () => {
    routeTo("/s/ab3xk9qz/extra");
    expect(screen.getByTestId("fell-through")).toBeInTheDocument();
  });
});
