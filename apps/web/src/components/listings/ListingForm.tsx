"use client";

import { useRef, useState, type FormEvent, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import Spinner from "@/components/ui/Spinner";
import { createClient } from "@/lib/supabase/client";
import { LISTING_CATEGORIES, PRICE_UNITS } from "@/lib/listings/categories";
import {
  ACCEPT_ATTR,
  MAX_FILE_SIZE_BYTES,
  MAX_IMAGES,
  isAcceptedImageFile,
} from "@/lib/listings/images";
import {
  MAX_VIDEO_DURATION_SECONDS,
  MAX_VIDEO_FILE_SIZE_BYTES,
  VIDEO_ACCEPT_ATTR,
  getVideoDuration,
  isAcceptedVideoFile,
} from "@/lib/listings/video";
import {
  createListing,
  updateListing,
  deleteListing,
  type ListingActionState,
} from "@/app/listings/actions";
import { syncListingMedia, type VideoSyncInstruction } from "@/lib/listings/clientUpload";
import { isRedirectError } from "@/lib/forms/isRedirectError";
import LocationAutocompleteField from "@/components/listings/LocationAutocompleteField";

export type ListingFormInitialValues = {
  title: string;
  description: string;
  category: string;
  price_amount: string;
  price_unit: string;
  location: string;
};

export type ListingFormInitialImage = { id: string; url: string };
export type ListingFormInitialVideo = { id: string; url: string };

type StagedPhoto =
  | { key: string; kind: "existing"; id: string; url: string }
  | { key: string; kind: "new"; file: File; previewUrl: string };

type StagedVideo =
  | { kind: "existing"; id: string; url: string }
  | { kind: "new"; file: File; previewUrl: string };

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
  initialVideo,
}: {
  mode: "create" | "edit";
  listingId?: string;
  initial?: ListingFormInitialValues;
  initialImages?: ListingFormInitialImage[];
  initialVideo?: ListingFormInitialVideo;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const values = initial ?? DEFAULT_VALUES;

  const [photos, setPhotos] = useState<StagedPhoto[]>(
    initialImages.map((img) => ({ key: img.id, kind: "existing", id: img.id, url: img.url })),
  );
  const [photoNote, setPhotoNote] = useState<string | null>(null);
  // The existing video's id (if any) never changes after mount — kept
  // outside `video` state so that removing it client-side (which sets
  // `video` to null) can still be distinguished from "never had a video" on
  // submit (see handleSubmit's `remove_video` flag below).
  const [initialVideoId] = useState<string | null>(initialVideo?.id ?? null);
  const [video, setVideo] = useState<StagedVideo | null>(
    initialVideo ? { kind: "existing", id: initialVideo.id, url: initialVideo.url } : null,
  );
  const [videoNote, setVideoNote] = useState<string | null>(null);
  const [checkingVideo, setCheckingVideo] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [state, setState] = useState<ListingActionState>({ status: "idle" });

  const atCap = photos.length >= MAX_IMAGES;

  function handleFilesSelected(
    fileList: FileList | null,
    inputRef: RefObject<HTMLInputElement | null>,
  ) {
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

    if (inputRef.current) inputRef.current.value = "";
  }

  function removePhoto(key: string) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.key === key);
      if (target?.kind === "new") URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.key !== key);
    });
  }

  async function handleVideoSelected(
    fileList: FileList | null,
    inputRef: RefObject<HTMLInputElement | null>,
  ) {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];

    function reject(message: string) {
      setVideoNote(message);
      if (inputRef.current) inputRef.current.value = "";
    }

    if (!isAcceptedVideoFile(file)) {
      reject(`${file.name} is not a supported video type — skipped.`);
      return;
    }
    if (file.size > MAX_VIDEO_FILE_SIZE_BYTES) {
      reject(`${file.name} is larger than 75MB — skipped.`);
      return;
    }

    setCheckingVideo(true);
    try {
      const duration = await getVideoDuration(file);
      if (duration > MAX_VIDEO_DURATION_SECONDS) {
        reject("Videos must be 60 seconds or shorter — skipped.");
        return;
      }
    } catch (err) {
      console.error("getVideoDuration failed", err);
      reject(`${file.name} could not be read — skipped.`);
      return;
    } finally {
      setCheckingVideo(false);
    }

    setVideo({ kind: "new", file, previewUrl: URL.createObjectURL(file) });
    setVideoNote(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeVideo() {
    setVideo((prev) => {
      if (prev?.kind === "new") URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formRef.current) return;

    setState({ status: "idle" });
    setSubmitting(true);

    // Fields-only payload (spec §8 addendum): no file bytes travel through
    // this FormData/Server Action call anymore. Photos/video live in React
    // state and are uploaded separately, straight from the browser to
    // Supabase Storage, only after the fields below have been saved. Note
    // this is already true of `new FormData(formRef.current)` itself: the
    // photo/video `<input type="file">` elements below are deliberately left
    // without a `name` attribute, so the browser never serializes them into
    // FormData in the first place — there's nothing to strip here.
    const formData = new FormData(formRef.current);

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

      if (result.status === "error") {
        setState(result);
        return;
      }
      if (result.status !== "success") {
        // createListing/updateListing never actually resolve "idle" — this
        // is just here so TypeScript's narrowing below is sound.
        return;
      }

      const savedListingId = result.listingId;
      const newPhotoFiles = photos.filter((p) => p.kind === "new").map((p) => p.file);
      const keptImageIds = photos.filter((p) => p.kind === "existing").map((p) => p.id);
      const videoInstruction: VideoSyncInstruction =
        video?.kind === "new"
          ? { kind: "new", file: video.file }
          : !video && initialVideoId
            ? { kind: "remove" }
            : { kind: "none" };

      setUploading(newPhotoFiles.length > 0 || videoInstruction.kind === "new");

      let photosFailed = false;
      let videoFailed = false;

      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          // Session disappeared between the server action succeeding and
          // now — extremely unlikely, but the listing's fields are already
          // saved, so surface this the same way a media-upload failure is
          // surfaced rather than silently losing the save.
          photosFailed = newPhotoFiles.length > 0;
          videoFailed = videoInstruction.kind === "new";
        } else {
          const syncResult = await syncListingMedia(supabase, {
            ownerId: user.id,
            listingId: savedListingId,
            keptImageIds,
            newPhotoFiles,
            video: videoInstruction,
          });
          photosFailed = syncResult.photosFailed;
          videoFailed = syncResult.videoFailed;
        }
      } catch (err) {
        console.error("ListingForm media sync failed", err);
        photosFailed = photosFailed || newPhotoFiles.length > 0;
        videoFailed = videoFailed || videoInstruction.kind === "new";
      } finally {
        setUploading(false);
      }

      const failureParams = new URLSearchParams();
      if (photosFailed) failureParams.set("photoError", "1");
      if (videoFailed) failureParams.set("videoError", "1");
      const query = failureParams.toString();

      router.push(`/listings/${savedListingId}${query ? `?${query}` : ""}`);
    } catch (err) {
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
            <LocationAutocompleteField
              id="location"
              name="location"
              hideLabel
              required
              defaultValue={values.location}
              placeholder="e.g. Etobicoke, ON"
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">Photos</span>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Listings with at least one photo get far more interest — add one if you can.
            </p>

            <div className="flex flex-col gap-2 sm:flex-row">
              <label
                className={`flex h-24 flex-1 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-line-strong text-sm text-zinc-500 dark:text-zinc-400 ${
                  atCap ? "pointer-events-none opacity-50" : "hover:border-primary"
                }`}
              >
                {atCap ? "Maximum 6 photos." : "Take photo"}
                <input
                  id="camera_input"
                  ref={cameraInputRef}
                  type="file"
                  accept={ACCEPT_ATTR}
                  capture="environment"
                  disabled={atCap}
                  onChange={(e) => handleFilesSelected(e.target.files, cameraInputRef)}
                  className="hidden"
                />
              </label>

              <label
                className={`flex h-24 flex-1 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-line-strong text-sm text-zinc-500 dark:text-zinc-400 ${
                  atCap ? "pointer-events-none opacity-50" : "hover:border-primary"
                }`}
              >
                {atCap ? "Maximum 6 photos." : "Choose from gallery"}
                <input
                  id="photos_input"
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ACCEPT_ATTR}
                  disabled={atCap}
                  onChange={(e) => handleFilesSelected(e.target.files, fileInputRef)}
                  className="hidden"
                />
              </label>
            </div>

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
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-foreground">Video (optional)</span>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Show the tool in action — up to 60 seconds.
            </p>

            {videoNote && <p className="text-xs text-danger">{videoNote}</p>}

            {video ? (
              <div className="relative">
                <video
                  controls
                  src={video.kind === "existing" ? video.url : video.previewUrl}
                  className="aspect-video max-h-64 w-full rounded-lg border border-line bg-black object-cover"
                />
                <button
                  type="button"
                  onClick={removeVideo}
                  aria-label="Remove video"
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs leading-none text-white hover:bg-black/80"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <label
                className={`flex h-24 w-full cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-line-strong text-sm text-zinc-500 dark:text-zinc-400 ${
                  checkingVideo ? "pointer-events-none opacity-50" : "hover:border-primary"
                }`}
              >
                {checkingVideo ? "Checking video…" : "Add video"}
                <input
                  id="video_input"
                  ref={videoInputRef}
                  type="file"
                  accept={VIDEO_ACCEPT_ATTR}
                  disabled={checkingVideo}
                  onChange={(e) => handleVideoSelected(e.target.files, videoInputRef)}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {uploading && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {photos.some((p) => p.kind === "new") && video?.kind === "new"
                ? "Uploading photos and video…"
                : video?.kind === "new"
                  ? "Uploading video…"
                  : "Uploading photos…"}
            </p>
          )}

          {state.status === "error" && <p className="text-sm text-danger">{state.message}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 flex h-11 w-full items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover active:bg-primary-active disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {submitting && <Spinner className="mr-2 h-4 w-4" />}
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
