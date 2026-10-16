#!/usr/bin/env bash
# Bootstrap the Dictionary's concept list, all signed by one key (Vinney's):
#   1. the "Dictionary Concept Curator" tag — the house applies it to curators'
#      profiles in the Brainstorm UI;
#   2. the "Demo Dictionary Concepts" list header (kind 39998);
#   3. one entry (kind 39999) on that list for each concept the Dictionary shows
#      today (client/src/config/dictionary.config.json, URL Templates aside).
#
# Every event is built, signed and checked before anything is published, and
# you confirm before it goes out. Re-running is safe: an event already published
# unchanged is skipped. Ctrl-C is safe at any point before you answer "y".
#
# Needs nak and jq. Run from anywhere:  bash scripts/bootstrap-dictionary-concepts.sh
# Writes what it published to ./dictionary-bootstrap.json.
set -euo pipefail

ME=2efaa715bbb46dd5be6b7da8d7700266d11674b913b8178addb5c2e63d987331
# Where these events go, and where the concepts' own headers are read from.
RELAYS=(wss://dcosl.brainstorm.world wss://tags.brainstorm.world/relay)
CONCEPT_RELAYS=(wss://dcosl.brainstorm.world wss://tags.brainstorm.world/relay)
HINT=wss://dcosl.brainstorm.world

# The tag: the same shape Brainstorm writes when a tag is created while tagging
# a person (lib/tagging-sdk buildTagElement): one `z` per tag-concept namespace
# (config/tagging.config.json zHandlePubkeys) and the person-tag hint.
TAG_NAME="Dictionary Concept Curator"
TAG_DESCRIPTION="Submits lists that are worth including in a dictionary of concepts"
TAG_SLUG=dictionary-concept-curator
TAG_NAMESPACES=(
  82b75e474dda005e912bcbb910391c60c2b89cc7faf5d3c30b7c59a324973833
  a68dbf561cfe3da1b76f1e65c7d4d9cc116f79921b38a815fd75cb5460b4b599
)

LIST_D=demo-dictionary-concepts
LIST="39998:$ME:$LIST_D"

# "coordinate|name" — the concepts the Dictionary shows today.
CONCEPTS=(
  "39998:b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450:github-accounts|GitHub Accounts"
  "39998:b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450:food-and-drink-places|Food and Drink Places"
  "39998:b83a28b7e4e5d20bd960c5faeb6625f95529166b8bdb045d42634a2f35919450:divine-videos|Divine Videos"
  "39998:77599c5c4a7ba08456679d812a414037f4b01c975fb4f577187df11d189f80d3:b504f5a8-949f-4d31-ad14-8afcebde2b34|V4V Songs"
  "39998:6aca05b812da97601151776d13de04ae71afc9d86da1408f0e72cffef72ece4b:books|Books"
)

OUT=dictionary-bootstrap.json

die() { echo "STOPPED, nothing published: $*" >&2; exit 1; }
command -v nak >/dev/null && command -v jq >/dev/null || die "needs nak and jq"
W=$(mktemp -d)
trap 'rm -rf "$W"' EXIT

# The newest event at an address on the given relays, or nothing.
latest() { # kind pubkey d relay...
  local k=$1 pk=$2 d=$3
  shift 3
  for r in "$@"; do nak req -k "$k" -a "$pk" -d "$d" "$r" </dev/null 2>/dev/null || true; done |
    jq -sc 'sort_by(.created_at) | last // empty'
}

echo "1/5 Building the events…"
{
  jq -nc --arg slug "$TAG_SLUG" --arg name "$TAG_NAME" --arg desc "$TAG_DESCRIPTION" '
    {kind: 39999,
     content: ({tag: {slug: $slug, name: $name, description: $desc}} | tojson),
     tags: ([["d", $slug]] + ($ARGS.positional | map(["z", "39998:\(.):tag"])) + [["z", "tag-for-nostr-pubkey"]])}
  ' --args "${TAG_NAMESPACES[@]}"
  jq -nc --arg d "$LIST_D" --arg self "$LIST" '
    {kind: 39998, content: "",
     tags: [["d", $d],
            ["names", "Demo Dictionary Concept", "Demo Dictionary Concepts"],
            ["description", "Lists that make good candidates for Dictionary Concepts"],
            ["required", "a", "The concept list header, by coordinate (kind 39998)"],
            ["recommended", "name", "The concept name, as its list calls itself"],
            ["optional", "removed", "Any value takes the concept out of the Dictionary"],
            ["field-type", "a", "address"],
            ["display", "title", "name"],
            ["b", $self, "pointer"],
            ["alt", "A list of the concepts the Brainstorm Dictionary shows"]]}'
  for entry in "${CONCEPTS[@]}"; do
    jq -nc --arg coord "${entry%%|*}" --arg name "${entry#*|}" --arg list "$LIST" --arg hint "$HINT" '
      {kind: 39999, content: "",
       tags: [["d", $coord], ["z", $list], ["a", $coord, $hint], ["name", $name],
              ["alt", "Demo Dictionary Concept: \($name)"]]}'
  done
} > "$W/all.jsonl"

echo "2/5 Checking the concepts exist, and what's already published…"
for entry in "${CONCEPTS[@]}"; do
  coord=${entry%%|*}
  rest=${coord#*:}
  [ -n "$(latest 39998 "${rest%%:*}" "${rest#*:}" "${CONCEPT_RELAYS[@]}")" ] || die "no header found at $coord"
done
: > "$W/todo.jsonl"
while IFS= read -r ev <&3; do
  k=$(jq -r .kind <<<"$ev")
  d=$(jq -r '.tags[] | select(.[0] == "d") | .[1]' <<<"$ev")
  live=$(latest "$k" "$ME" "$d" "${RELAYS[@]}")
  if [ -z "$live" ]; then
    echo "  new       $k:…:$d"
    echo "$ev" >> "$W/todo.jsonl"
  elif jq -e --argjson want "$ev" '.tags == $want.tags and .content == $want.content' <<<"$live" >/dev/null; then
    echo "  unchanged $k:…:$d (skipped)"
  else
    echo "  replace   $k:…:$d (a different version is published)"
    echo "$ev" >> "$W/todo.jsonl"
  fi
done 3< "$W/all.jsonl"
[ -s "$W/todo.jsonl" ] || { echo "Everything is already published. Nothing to do."; exit 0; }

echo "3/5 Signing. Paste your nsec, hex key or bunker:// URL (not shown, not saved):"
read -rs SEC
echo
[ -n "$SEC" ] || die "no key given"
: > "$W/signed.jsonl"
while IFS= read -r ev <&3; do
  NOSTR_SECRET_KEY="$SEC" nak event <<<"$ev" >> "$W/signed.jsonl" || die "signing failed"
done 3< "$W/todo.jsonl"
unset SEC

echo "4/5 Checking every signed event…"
paste -d '\n' "$W/todo.jsonl" "$W/signed.jsonl" | jq -sc '[range(0; length; 2) as $i | {want: .[$i], got: .[$i + 1]}] | .[]' > "$W/pairs.jsonl"
while IFS= read -r pair <&3; do
  jq -e --arg me "$ME" '.got.pubkey == $me and .got.kind == .want.kind and .got.tags == .want.tags and .got.content == .want.content' <<<"$pair" >/dev/null ||
    die "a signed event isn't what was built (signed by $(jq -r .got.pubkey <<<"$pair"); wrong key?)"
  jq -c .got <<<"$pair" | nak verify || die "a signed event has a bad signature"
  # nak re-signs a piped event whenever a key is in the environment, so publishing runs with none — check it passes through unchanged.
  [ "$(jq -c .got <<<"$pair" | env -u NOSTR_SECRET_KEY nak event | jq -r .id)" = "$(jq -r .got.id <<<"$pair")" ] ||
    die "nak would alter an event when publishing"
done 3< "$W/pairs.jsonl"

echo
echo "All $(wc -l < "$W/signed.jsonl") events are yours and intact:"
jq -r '"  kind \(.kind)  \(.tags[] | select(.[0] == "d") | .[1])"' "$W/signed.jsonl"
read -rp "5/5 Publish to ${RELAYS[*]}? [y/N] " OK
[ "$OK" = y ] || [ "$OK" = Y ] || die "you didn't say y"
while IFS= read -r ev <&3; do
  env -u NOSTR_SECRET_KEY nak event "${RELAYS[@]}" <<<"$ev" >/dev/null ||
    echo "  (a relay reported an error above; re-running this script is safe)" >&2
done 3< "$W/signed.jsonl"

echo
echo "Checking what the relays now hold…"
missing=0
while IFS= read -r ev <&3; do
  k=$(jq -r .kind <<<"$ev")
  d=$(jq -r '.tags[] | select(.[0] == "d") | .[1]' <<<"$ev")
  live=$(latest "$k" "$ME" "$d" "${RELAYS[@]}" | jq -r '.id // empty')
  [ -n "$live" ] || { echo "  not found yet: $k:…:$d"; missing=1; }
done 3< "$W/all.jsonl"

TAG_ID=$(latest 39999 "$ME" "$TAG_SLUG" "${RELAYS[@]}" | jq -r '.id // empty')
jq -n --arg list "$LIST" --arg tag "39999:$ME:$TAG_SLUG" --arg tagId "$TAG_ID" --arg me "$ME" \
  '{demoDictionaryList: $list, curatorTag: $tag, curatorTagEventId: $tagId, author: $me,
    concepts: $ARGS.positional}' --args "${CONCEPTS[@]%%|*}" > "$OUT"
echo
cat "$OUT"
echo
[ "$missing" = 0 ] && echo "Done. Send $OUT back to Claude." ||
  echo "Published, but not every event is visible yet. Re-run in a minute: it skips what's there and fills in the rest."
