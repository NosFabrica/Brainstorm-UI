/**
 * One field's value as its type says to draw it: a `url` field's http(s)
 * value is a link out, an `address` field's value is what it names
 * (AddressRef), and anything else is text. The facts and "More fields" on an
 * item's page draw values through it, so a type means the same in both.
 */
import { AddressRef } from "@/components/dictionary/AddressRef";

export function FieldValue({ value, href, address }: { value: string; href: string | null; address: string | null }) {
  if (address) return <AddressRef address={address} />;
  if (href)
    return (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-brand-link hover:underline">
        {value}
      </a>
    );
  return <>{value}</>;
}
