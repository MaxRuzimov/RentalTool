"use client";

import { useRef, useState, type FormEvent } from "react";
import { LISTING_CATEGORIES, PRICE_UNITS } from "@/lib/listings/categories";
import {
  ACCEPT_ATTR,
  MAX_FILE_SIZE_BYTES,
  MAX_IMAGES,
  isAcceptedImageFile,
} from "@/lib/listings/images";
import {
  createListing,
  updateListing,
  deleteListing,
  type ListingActionState,
} from "@/app/listings/actions";
import { isRedirectError } from "@/lib/forms/isRedirectError";

export type ListingFormInitialValues = {
  title: string;
  description: string;
  category: string;
  price_amount: string;
  price_unit: string;
  location: string;
};

export type ListingFormInitialImage = { id: string; url: string };

type StagedPhoto =
  | { key: string; kind: "existing"; id: string; url: string }
  | { key: string; kind: "new"; file: File; previewUrl: string };

const DEFAULT_VALUES: ListingFormInitialValues = {
  title: "",
  description: "",
  category: "",
  price_amount: "",
  price_unit: "day",
  location: "",
};

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

export default function ListingForm({
  mode,
  listingId,
  initial,
  initialImages = [],
}: {
  mode: "create" | "edit";
  listingId?: string;
  initial?: ListingFormInitialValues;
  initialImages?: ListingFormInitialImage[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const values = initial ?? DEFAULT_VALUES;

  const [photos, setPhotos] = useState<StagedPhoto[]>(
    initialImages.map((img) => ({ key: img.id, kind: "existing", id: img.id, url: img.url })),
  );
  const [photoNote, setPhotoNote] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [state, setState] = useState<ListingActionState>({ status: "idle" });

  const atCap = photos.length >= MAX_IMAGES;

  function handleFilesSelected(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;

    const notes: string[] = [];
    const accepted: StagedPhoto[] = [];
    let remainingSlots = MAX_IMAGES - photos.length;

    for (const file of Array.from(fileList)) {
      if (remainingSlots <= 0) {
        notes.push("Maximum 6 photos — some files were not added.");
        break;
      }
      if (!isAcceptedImageFile(file)) {
        notes.push(`${file.name} is not a supported photo type — skipped.`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        notes.push(`${file.name} is larger than 5MB — skipped.`);
        continue;
      }
      accepted.push({
        key: newKey(),
        kind: "new",
        file,
        previewUrl: URL.createObjectURL(file),
      });
      remainingSlots -= 1;
    }

    setPhotos((prev) => [...prev, ...accepted]);
    setPhotoNote(notes.length > 0 ? notes.join(" ") : null);

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removePhoto(key: string) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.key === key);
      if (target?.kind === "new") URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.key !== key);
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formRef.current) return;

    setState({ status: "idle" });
    setSubmitting(true);
    setUploading(photos.some((p) => p.kind === "new"));

    const formData = new FormData(formRef.current);
    // Text/select/number fields are already captured by `new FormData(form)`
    // above via their `name` attributes; photos are appended manually since
    // they live in React state (add/remove), not directly bound to the
    // native file input's value (see §4 of the spec for the UX this drives).
    formData.delete("photos_input");
    for (const photo of photos) {
      if (photo.kind === "existing") {
        formData.append("kept_image_id", photo.id);
      } else {
        formData.append("new_photos", photo.file, photo.file.name);
      }
    }

    // M14 fix: the action call itself can throw — not just resolve with an
    // `{ status: "error" }` object — if the request never reaches the Next.js
    // server at all (e.g. the network drops mid-submit). Without this
    // try/catch that throw was an unhandled promise rejection: `submitting`
    // never got reset, so the button stayed stuck "Publishing…"/"Saving…"
    // forever with no feedback (a real, distinct failure mode from a
    // Supabase-level error — see the M14 task's explicit note on this).
    try {
      const result =
        mode === "create"
          ? await createListing(formData)
          : await updateListing(listingId as string, formData);

      // A successful create/update redirects server-side and never returns
      // a value here (redirect() throws internally, and is NOT caught below
      // — see the catch block's comment) — only error states reach this
      // line.
      setState(result);
    } catch (err) {
      // redirect() (a successful submit) works by throwing a Next.js
      // control-flow error with a `NEXT_REDIRECT` digest, which must be
      // allowed to propagate so the navigation actually happens — only a
      // genuine failure (anything else) should be swallowed and surfaced as
      // an inline error.
      if (isRedirectError(err)) {
        throw err;
      }
      console.error("ListingForm submit failed", err);
      setState({
        status: "error",
        message:
          mode === "create"
            ? "Could not publish your listing. Please try again."
            : "Could not save changes. Please try again.",
      });
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-surface-muted px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {mode === "create" ? "List a tool" : "Edit listing"}
        </h1>

        <form ref={formRef} onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="title" className="text-sm font-medium text-foreground">
              Title
            </label>
            <input
              id="title"
              name="title"
              type="text"
              required
              maxLength={100}
              defaultValue={values.title}
              placeholder="e.g. DeWalt 20V Cordless Drill"
              className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-zinc-400 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 dark:placeholder:text-zinc-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="description" className="text-sm font-medium text-foreground">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              required
              maxLength={2000}
              rows={6}
              defaultValue={values.description}
              placeholder="Condition, accessories included, pickup instructions…"
              className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-zinc-400 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 dark:placeholder:text-zinc-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="category" className="text-sm font-medium text-foreground">
              Category
            </label>
            <select
              id="category"
              name="category"
              required
              defaultValue={values.category}
              className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-zinc-400 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 dark:placeholder:text-zinc-500"
            >
              <option value="" disabled>
                Select a category
              </option>
              {LISTING_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="price_amount" className="text-sm font-medium text-foreground">
                Price
              </label>
              <div className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 outline-none focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                <span className="text-sm text-zinc-500 dark:text-zinc-400">$</span>
                <input
                  id="price_amount"
                  name="price_amount"
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  defaultValue={values.price_amount}
                  className="w-full bg-transparent text-sm text-foreground outline-none"
                />
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="price_unit" className="text-sm font-medium text-foreground">
                Per
              </label>
              <select
                id="price_unit"
                name="price_unit"
                required
                defaultValue={values.price_unit}
                className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-zinc-400 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 dark:placeholder:text-zinc-500"
              >
                {PRICE_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="location" className="text-sm font-medium text-foreground">
              Location
            </label>
            <input
              id="location"
              name="location"
              type="text"
              required
              defaultValue={values.location}
              placeholder="e.g. Etobicoke, ON"
              className="w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-zinc-400 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 dark:placeholder:text-zinc-500"
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">Photos</span>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Listings with at least one photo get far more interest — add one if you can.
            </p>

            <label
              className={`flex h-24 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-line-strong text-sm text-zinc-500 dark:text-zinc-400 ${
                atCap ? "pointer-events-none opacity-50" : "hover:border-primary"
              }`}
            >
              {atCap ? "Maximum 6 photos." : "Add photos"}
              <input
                id="photos_input"
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPT_ATTR}
                disabled={atCap}
                onChange={(e) => handleFilesSelected(e.target.files)}
                className="hidden"
              />
            </label>

            {photoNote && <p className="text-xs text-danger">{photoNote}</p>}

            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {photos.map((photo) => (
                  <div
                    key={photo.key}
                    className="relative aspect-square overflow-hidden rounded-lg border border-line"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.kind === "existing" ? photo.url : photo.previewUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(photo.key)}
                      aria-label="Remove photo"
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs leading-none text-white hover:bg-black/80"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {uploading && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Uploading photos…</p>
            )}
          </div>

          {state.status === "error" && <p className="text-sm text-danger">{state.message}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 flex h-11 w-full items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover active:bg-primary-active disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {mode === "create"
              ? submitting
                ? "Publishing…"
                : "Publish listing"
              : submitting
                ? "Saving…"
                : "Save changes"}
          </button>
        </form>

        {mode === "edit" && listingId && <DeleteListingLink listingId={listingId} />}
      </div>
    </div>
  );
}

function DeleteListingLink({ listingId }: { listingId: string }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm("Delete this listing? This cannot be undone.")) return;
    setDeleting(true);
    setError(null);

    try {
      // On success this redirects server-side to /listings/mine and this
      // component unmounts before the state updates below ever run.
      const result = await deleteListing(listingId);
      setDeleting(false);

      if (result.status === "error") {
        setError(result.message ?? "Could not delete this listing. Please try again.");
      }
    } catch (err) {
      // See ListingForm's handleSubmit for why a NEXT_REDIRECT digest must
      // be allowed to propagate rather than being treated as a failure.
      if (isRedirectError(err)) {
        throw err;
      }
      // M14 fix: the action call itself can throw (e.g. the request never
      // reaches the Next.js server at all) — without this catch, that left
      // the button stuck "Deleting…" forever with no feedback.
      console.error("DeleteListingLink delete failed", err);
      setDeleting(false);
      setError("Could not delete this listing. Please try again.");
    }
  }

  return (
    <div className="mt-6 border-t border-line pt-4">
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="text-sm font-medium text-danger hover:underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
      >
        {deleting ? "Deleting…" : "Delete listing"}
      </button>
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}
