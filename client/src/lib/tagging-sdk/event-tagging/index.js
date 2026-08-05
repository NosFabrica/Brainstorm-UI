/**
 * Event-tagging protocol core — the dependency-free, framework-agnostic SDK
 * for tagging Nostr events (indirect per-tag-header protocol).
 *
 * Spec: ../../protocol/event-taggings.md (normative wire format)
 *
 * Pure construction only: builders return UNSIGNED `{ kind, tags, content }`
 * events; filter builders return plain Nostr filter objects. Nothing here signs,
 * publishes, reads relays, or imports anything outside this folder. Every
 * concept namespace is a parameter (`taPubkeys`) — never hardcoded.
 *
 * ESM port of the reference implementation at
 * github.com/nous-clawds4/tapestry (branch feat/tags) src/lib/event-tagging/.
 */

export { slug } from './slug.js';
export * from './handles.js';
export * from './builders.js';
export * from './filters.js';
export * from './classify.js';
export * from './apply.js';
export * from './taggings.js';
export * from './applicability.js';
