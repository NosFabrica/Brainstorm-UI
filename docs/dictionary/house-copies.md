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

## Books: no house copy exists

The community header (`39998:6aca05b8…:books`) declares no fields, so a book's page reads
"Untitled books" with 17 fields folded away. A copy that declares what the items carry
(as Open Library seeded them) and names two templates:

```json
["d", "books"]
["names", "Book", "Books"]
["description", "Books, by title and author. Seeded from Open Library."]
["required", "title"]
["recommended", "author"]
["recommended", "cover", "Cover image"]
["recommended", "isbn", "ISBN-13"]
["optional", "isbn10", "ISBN-10"]
["optional", "open-library-id", "Open Library work id, e.g. OL19722168W"]
["optional", "year", "Year first published"]
["optional", "pages", "Page count"]
["optional", "lang", "Language, ISO 639-2"]
["optional", "subject", "A subject; repeats"]
["optional", "format"]
["optional", "source", "Where this record came from"]
["field-type", "cover", "url"]
["display", "title", "title"]
["display", "summary", "author"]
["display", "image", "cover"]
["display", "fact", "year", "Published"]
["display", "fact", "pages", "Pages"]
["display", "fact", "subject", "Subjects"]
["image", "<a book icon URL, content-addressed>"]
["link", "8382b369db6f7d3dc96be27513609a61491f33c2afcc6f7c005c8bd7cc190c83", "wss://dcosl.brainstorm.world", "isbn10", "isbn10"]
["link", "<Open Library work template id>", "wss://dcosl.brainstorm.world", "id", "open-library-id"]
["b", "39998:6aca05b812da97601151776d13de04ae71afc9d86da1408f0e72cffef72ece4b:books", "pointer"]
```

Two notes:

- The Goodreads template (`8382b369…`) names its placeholder `{isbn10}`, but Goodreads
  resolves an ISBN-13 at the same path (checked 2026-10-12: `/book/isbn/9781610397216`
  redirects to the book), so binding `isbn` is fine too; `isbn10` is bound here because
  every Open Library item carries it.
- An Open Library template (`https://openlibrary.org/works/{id}`) does not exist on the
  URL Templates list yet (its six items on 2026-10-12: Divine profile and video,
  OpenStreetMap location, BTC Map place, Goodreads book, GitHub profile); file one there
  first, then pin its id.
