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

    const result =
      mode === "create"
        ? await createListing(formData)
        : await updateListing(listingId as string, formData);

    // A successful create/update redirects server-side and never returns a
    // value here (redirect() throws internally) — only error states reach
    // this line.
    setSubmitting(false);
    setUploading(false);
    setState(result);
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16 dark:bg-black">
      <div className="w-full max-w-md rounded-2xl border border-black/[.08] bg-white p-8 dark:border-white/[.145] dark:bg-[#0a0a0a]">
        <h1 className="text-2xl font-semibold text-foreground">
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
              className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm text-foreground dark:border-white/[.145]"
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
              className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm text-foreground dark:border-white/[.145]"
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
              className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm text-foreground dark:border-white/[.145]"
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

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="price_amount" className="text-sm font-medium text-foreground">
                Price
              </label>
              <div className="flex items-center gap-2 rounded-lg border border-black/[.08] px-3 py-2 dark:border-white/[.145]">
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
                className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm text-foreground dark:border-white/[.145]"
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
              className="rounded-lg border border-black/[.08] bg-transparent px-3 py-2 text-sm text-foreground dark:border-white/[.145]"
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">Photos</span>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Listings with at least one photo get far more interest — add one if you can.
            </p>

            <label
              className={`flex h-24 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-black/[.15] text-sm text-zinc-500 dark:border-white/[.2] dark:text-zinc-400 ${
                atCap ? "pointer-events-none opacity-50" : "hover:border-black/[.3] dark:hover:border-white/[.4]"
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

            {photoNote && <p className="text-xs text-red-600">{photoNote}</p>}

            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {photos.map((photo) => (
                  <div
                    key={photo.key}
                    className="relative aspect-square overflow-hidden rounded-lg border border-black/[.08] dark:border-white/[.145]"
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

          {state.status === "error" && <p className="text-sm text-red-600">{state.message}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 flex h-11 w-full items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
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

    // On success this redirects server-side to /listings/mine and this
    // component unmounts before the state updates below ever run.
    const result = await deleteListing(listingId);
    setDeleting(false);

    if (result.status === "error") {
      setError(result.message ?? "Could not delete this listing. Please try again.");
    }
  }

  return (
    <div className="mt-6 border-t border-black/[.08] pt-4 dark:border-white/[.145]">
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
      >
        {deleting ? "Deleting…" : "Delete listing"}
      </button>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
