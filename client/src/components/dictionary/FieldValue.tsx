/**
 * One field's value as its type says to draw it: a `url` field's http(s)
 * value is a link out, a `tel` or `email` field's value calls or mails, an
 * `address` field's value is what it names (AddressRef), and anything else is
 * text. The facts and "More fields" on an item's page draw values through it,
 * so a type means the same in both.
 */
import { AddressRef } from "@/components/dictionary/AddressRef";

export function FieldValue({ value, href, address }: { value: string; href: string | null; address: string | null }) {
  if (address) return <AddressRef address={address} />;
  if (href) {
    // A web page opens beside this one; a call or a mail is handed to the device.
    const web = /^https?:/i.test(href);
    return (
      <a
        href={href}
        {...(web ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
        className="text-brand-link hover:underline"
      >
        {value}
      </a>
    );
  }
  return <>{value}</>;
}
