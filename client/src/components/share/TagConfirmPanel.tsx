import { useId, useState } from "react";
import { TAG_DESCRIPTION_MAX } from "@/lib/tagEdit";

/**
 * What a picker is about to publish: a tag people already use, or one that
 * doesn't exist yet and is named here.
 */
export type PendingTag = { kind: "existing"; label: string; description?: string } | { kind: "new"; name: string };

/**
 * What the reader decided:
 * - `existing`: add the tag they picked;
 * - `new`: create this one, with these words;
 * - `match`: the name they typed is a tag people already use (`label`, as the
 *   picker knows it), so add that one instead of making a second.
 */
export type TagDecision =
  { kind: "existing" } | { kind: "new"; name: string; description?: string } | { kind: "match"; label: string };

const FIELD =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-accent/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";
const LABEL = "text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";
const HINT = "text-[11px] leading-snug text-slate-400 dark:text-slate-500";

/**
 * The step between picking a tag and publishing it, the same in every picker
 * (a profile's, a post's): a tag is a public statement with no delete, so
 * nothing goes out on the first press.
 *
 * Both paths are one layout, a tag's Name and its Description. For a tag
 * people already use they are read: what it is called, what its creator said
 * it means. For a new one they are written: the name as typed, still editable,
 * and a description that is optional and the creator's to change later
 * (components/tags/TagDescriptionEditor). Create stays off until there is a
 * name.
 *
 * A name that is already a tag (`known`) is the one case where a description
 * would be thrown away, so the form says so when it happens and becomes the
 * read view of that tag, in place of a standing caveat on every form.
 */
export function TagConfirmPanel({
  pending,
  target,
  reach,
  known = [],
  testId,
  onCancel,
  onConfirm,
}: {
  pending: PendingTag;
  /** What is being tagged: "this profile", "this post". */
  target: string;
  /** Who sees it and where: "Anyone can see this on the post". */
  reach: string;
  /** The tags the picker offers, so a new name that is one of them is caught here. */
  known?: ReadonlyArray<{ label: string; description?: string }>;
  /** The picker's test-id prefix: "share-tag", "note-tag". */
  testId: string;
  onCancel: () => void;
  onConfirm: (decision: TagDecision) => void;
}) {
  const nameId = useId();
  const descriptionId = useId();
  const isNew = pending.kind === "new";
  const [name, setName] = useState(isNew ? pending.name : "");
  const [description, setDescription] = useState("");
  const cleanName = name.trim();
  const match = isNew ? known.find((k) => k.label.toLowerCase() === cleanName.toLowerCase()) : undefined;
  // What is read rather than written: the tag picked, or the one the typed name turned out to be.
  const shown = pending.kind === "existing" ? pending : match;
  const blocked = isNew && !cleanName;

  const decide = (): TagDecision =>
    pending.kind === "existing"
      ? { kind: "existing" }
      : match
        ? { kind: "match", label: match.label }
        : { kind: "new", name: cleanName, description: description.trim() || undefined };

  return (
    <form
      className="p-3.5"
      data-testid={`${testId}-confirm`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!blocked) onConfirm(decide());
      }}
    >
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        {isNew ? "Create a new tag" : `Tag ${target}`}
      </p>

      <div className="mt-3">
        {isNew ? (
          <>
            <label htmlFor={nameId} className={LABEL}>
              Name
            </label>
            <input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="Name this tag"
              className={FIELD}
              data-testid={`${testId}-name`}
            />
          </>
        ) : (
          <>
            <p className={LABEL}>Name</p>
            <p
              className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100"
              data-testid={`${testId}-view-name`}
            >
              {pending.label}
            </p>
          </>
        )}
      </div>

      <div className="mt-3">
        {shown ? (
          <>
            <p className={LABEL}>Description</p>
            {match && (
              <p className="mt-1 text-xs font-medium text-slate-700 dark:text-slate-200">
                This tag already exists, so you'll add the one people use.
              </p>
            )}
            <p
              className={
                shown.description
                  ? "mt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-200"
                  : "mt-1 text-sm text-slate-400 dark:text-slate-500"
              }
              data-testid={`${testId}-view-description`}
            >
              {shown.description || "No description yet."}
            </p>
          </>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor={descriptionId} className={LABEL}>
                Description
              </label>
              <span className={HINT}>Optional</span>
            </div>
            <textarea
              id={descriptionId}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={TAG_DESCRIPTION_MAX}
              placeholder="What does this tag mean?"
              className={`${FIELD} resize-none`}
              data-testid={`${testId}-description`}
            />
            <div className={`mt-1 flex items-baseline justify-between gap-2 ${HINT}`}>
              <span>You can edit it later.</span>
              <span className="tabular-nums">
                {description.trim().length}/{TAG_DESCRIPTION_MAX}
              </span>
            </div>
          </>
        )}
      </div>

      <p className="mt-3 border-t border-slate-100 pt-2.5 text-[11px] leading-relaxed text-slate-500 dark:border-slate-800 dark:text-slate-400">
        {reach}. A tag can't be deleted, only disagreed with later.
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          data-testid={`${testId}-confirm-cancel`}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={blocked}
          className="rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          data-testid={`${testId}-confirm-add`}
        >
          {isNew && !match ? "Create tag" : "Add tag"}
        </button>
      </div>
    </form>
  );
}
