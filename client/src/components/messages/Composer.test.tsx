// @vitest-environment jsdom
/** The field empties the moment a message goes; only a send that made no bubble gives the draft back. */
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Composer } from "./Composer";

const setup = (onSend: (text: string) => Promise<boolean>) => {
  render(
    <Composer
      placeholder="Message Bob"
      me="me"
      profiles={new Map()}
      replyTo={null}
      onCancelReply={() => {}}
      timer={0}
      onSend={onSend}
      onSendFile={async () => true}
    />,
  );
  const field = screen.getByTestId("dm-composer") as HTMLTextAreaElement;
  fireEvent.change(field, { target: { value: "hello" } });
  return field;
};

const deferred = () => {
  let resolve!: (sent: boolean) => void;
  const promise = new Promise<boolean>((r) => (resolve = r));
  return { promise, resolve };
};

describe("Composer", () => {
  it("clears the field before the send finishes", () => {
    const onSend = vi.fn(() => new Promise<boolean>(() => {}));
    const field = setup(onSend);
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("hello");
    expect(field.value).toBe("");
  });

  it("gives the draft back when nothing was sent", async () => {
    const pending = deferred();
    const field = setup(() => pending.promise);
    fireEvent.click(screen.getByTestId("dm-send"));
    expect(field.value).toBe("");
    await act(async () => pending.resolve(false));
    expect(field.value).toBe("hello");
  });

  it("puts the draft back in front of anything typed since", async () => {
    const pending = deferred();
    const field = setup(() => pending.promise);
    fireEvent.keyDown(field, { key: "Enter" });
    fireEvent.change(field, { target: { value: "next" } });
    await act(async () => pending.resolve(false));
    expect(field.value).toBe("hello\nnext");
  });
});
