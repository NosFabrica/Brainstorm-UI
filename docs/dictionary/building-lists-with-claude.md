# Building DList headers and items with Claude

`client/src/lib/listCheck.ts` checks a list header and its items using the code Brainstorm
renders them with: tags go in, and problems plus the item as it will read come out. Give it
to Claude so Claude checks its own lists instead of judging them by eye.

## Setup

```sh
git clone https://github.com/NosFabrica/Brainstorm-UI && cd Brainstorm-UI && npm install
```

Save this as `check.ts` anywhere, with `<repo>` replaced by the checkout's absolute path:

```ts
import { readFileSync } from "node:fs";
import { checkHeader, checkItem } from "<repo>/client/src/lib/listCheck";

// { "header": [[tag], …], "items": [[[tag], …], …], "templateEvents": [event, …] }
const { header, items = [], templateEvents = [] } = JSON.parse(readFileSync(process.argv[2], "utf8"));
const out = {
  header: checkHeader(header),
  items: items.map((tags: string[][]) => checkItem(header, tags, templateEvents)),
};
console.log(JSON.stringify(out, null, 2));
```

Run it from the repo root (`vite-node` resolves the repo's `@/` imports from there):

```sh
npx vite-node /path/to/check.ts /path/to/list.json
```

## What to tell Claude

Paste this into your project's `CLAUDE.md` or into a prompt:

```md
## Building DList headers and items

Tag rules: <repo>/docs/dictionary/dlist-presentation-conventions.md.
Check every header and item with `cd <repo> && npx vite-node <check.ts> <list.json>`
before showing it to me or publishing it. Don't judge by eye.

1. Write the header as tags, with its ["d", …] included.
2. Fix every problem in `header.problems` and run the check again, until none are left.
3. Fetch the URL template events named in `header.templateIds`, using the filter
   {"ids": [...]} on the relay in the header's `link` tag (else wss://dcosl.brainstorm.world),
   and put them in "templateEvents".
4. For each item, fix every problem with `blocking: true`. For the others, fix the data
   or tell me why it's fine as it is.
5. Read each item's `resolved` (title, summary, image, link, media, location, facts,
   links[].href) and confirm it reads the way a person would want.
```

## What comes back

- `checkHeader(tags)` → `{ problems, templateIds }`
- `checkItem(headerTags, itemTags, templateEvents?)` → `{ problems, resolved }`

Each problem is `{ code, field, message, blocking }`. `blocking` means Brainstorm's
editor won't publish it. The codes:

- **Header:** `unpublishable` (blocking), `dropped-tag`.
- **Item:**
  - `required-missing` (blocking), `untitled`
  - `not-a-url`, `not-an-address`
  - `image-unusable`, `link-unusable`, `media-unusable`, `location-unusable`
  - `repeated`, `undeclared`
  - `template-not-given`, `template-invalid`, `template-unfilled`

## Where List Management comes in

Once a list is published, its **Items** tab in List Management runs the same checks over every
item the relays returned, up to 10,000, and shows them as one table, with the problems that
recur across the list. An item deleted since it was read stays listed until the page is reloaded.
Open it at `/settings?tab=dictionary&manage=lists&list=<coordinate>&view=items`, and add
`&item=<event id>` to open one item. It only reads, so it's a quick way to see what a bulk
publish did before you share the list.

**Depends on List Management (#207):**

- `checkHeader` reports what List Management's import would do to a header:
  - `dropped-tag` is a tag that import would drop.
  - `unpublishable` is something its editor won't publish.
  - Some of these rules are stricter than the DList NIP (`disallowed`, a `b` pointing at
    another list). If you publish the header with another tool, read them as "the editor
    would change this", not "invalid".
- To publish a header from Brainstorm itself, use Settings › Dictionary › List Management →
  **New list** → **Import from JSON…**.
  It takes the header's tags as a bare array or as `{ "d", "tags", "example", "notes" }`.
  Its **Copy instructions** button gives the tag grammar plus the URL templates that exist
  right now, with their ids. That's useful context to give Claude before step 1.
- Items go in one at a time, through the editor's item form. There's no bulk item import.

**Doesn't depend on it:**

- `checkItem`'s problems and `resolved` come from Brainstorm's item renderers
  (`itemPresentation`, `dlistFields`, `displayHints`, `linkTemplates`), which are already on
  `staging`. They hold however the item is published. `checkItem` borrows one helper from
  List Management (`linkReadouts`), so it ships with #207, but what it reports doesn't change.
- The tag rules in `dlist-presentation-conventions.md`.
- Publishing headers and items with any Nostr tool. Brainstorm reads them the same way.
