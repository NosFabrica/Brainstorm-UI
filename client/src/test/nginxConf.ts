/** nginx.conf as the image ships it, for tests that hold its locations to what they promise. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const nginxConf = fs.readFileSync(path.join(ROOT, "nginx.conf"), "utf8");

/** Body of `location <matcher> {` … `}`, brace-counted so nested blocks survive. */
export function locationBody(matcher: string): string {
  const header = `location ${matcher} {`;
  const start = nginxConf.indexOf(header);
  if (start === -1) throw new Error(`no \`${header}\` in nginx.conf`);
  let depth = 0;
  for (let i = start + header.length - 1; i < nginxConf.length; i++) {
    if (nginxConf[i] === "{") depth++;
    else if (nginxConf[i] === "}" && --depth === 0) {
      return nginxConf.slice(start + header.length, i);
    }
  }
  throw new Error(`unterminated \`${header}\``);
}
