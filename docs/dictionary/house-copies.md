# House copies to publish on staging

Headers the house key (the server's NIP-05 `_`, `be7bf5de…` on staging) should hold so
the tier-three views (ADR 0007) and every tier-two surface agree. Each is published
through Settings › Dictionary › "Publish your own version" while signed in as the house,
or by whoever holds that key. Nothing here is signed by a person's key.

## GitHub Accounts: the handle leads

Today's house copy makes the description the title and the handle the summary, so the
results card, the popup row and "More GitHub accounts" say "Vinney Cavallo / vcavallo"
while the account's page (tier three) says "vcavallo / Vinney Cavallo". Flip the two
display hints; everything else stays as published.

```json
["d", "github-accounts"]
["names", "GitHub Account", "GitHub Accounts"]
["description", "A list of github handles/accounts"]
["required", "github-username"]
["field-type", "github-username", "text"]
["optional", "description", "Who it belongs to"]
["display", "title", "github-username"]
["display", "summary", "description"]
["image", "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png"]
["link", "f19f39daf75388ff0f19cc37dde5ae1b90124b0d60e35659160c48dc690deca4", "wss://dcosl.brainstorm.world", "username", "github-username"]
["b", "39998:b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450:github-accounts", "pointer"]
```

## Books: no house copy needed

Since 2026-10-20 the community header (`39998:6aca05b8…:books`, signed by the Unbnd
librarian) declares its own fields, so a book reads correctly with no copy: names
"Book" / "Books", a description, the item fields under the names Open Library's seed
gave them (`title` required; `author`, `cover`, `isbn` recommended; the rest optional), `cover` typed as a URL, display hints (title, author as summary, cover as
image, Published and Pages as facts), the list's image and two link templates. Unbnd's
seeder republishes that header on every run, so a change to it belongs in Unbnd, not in a
copy here.

The two templates, in button order, both kind 9999 items on the URL Templates list:

- Open Library work, `https://openlibrary.org/works/{id}` from `open-library-id`:
  `e722c94c9ee31ed28b79687b17daa313c0d02a9936a1c07dc73fbab4288fbc10`
- Goodreads book (ISBN-10), `https://www.goodreads.com/book/isbn/{isbn10}` from
  `isbn10`: `a3037637a77a5b0338639f570b6cf24aa292a1bea322e18d2f4e69144df0cb57`.
  ISBN-10 because Goodreads found every sampled book by it, where ISBN-13 missed a
  textbook edition.

Don't pin the older Goodreads template (`8382b369…`). It was signed with private key `1`,
a key anyone can sign as, so anyone could delete it out from under a list.
