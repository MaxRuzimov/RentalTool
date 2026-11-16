"use client";

// M19 (spec docs/design/location-autocomplete-spec.md): reusable ARIA
// combobox for the `location` field, used by both /listings's filter bar
// (a plain GET form, Server Component page) and ListingForm (a Client
// Component with its own submit handler). See the spec for the full state
// machine/keyboard-handling rationale — this implements it as written.

import { useRef, useState, type KeyboardEvent } from "react";
import { getLocationSuggestions } from "@/app/listings/locationSuggestions";

export type LocationSuggestion = {
  label: string;
  lat: number;
  lng: number;
};

export type LocationAutocompleteFieldProps = {
  id: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  inputClassName?: string;
  /** Optional label text. Ignored when `hideLabel` is true (for call sites,
   * like ListingForm, that already render their own associated <label>). */
  label?: string;
  hideLabel?: boolean;
  /** Not wired to anything in either call site today — kept available for
   * a future pass (spec §9). */
  onSelect?: (suggestion: LocationSuggestion) => void;
};

const DEFAULT_INPUT_CLASSNAME =
  "w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-zinc-400 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 dark:placeholder:text-zinc-500";

const DEBOUNCE_MS = 400;
const MIN_QUERY_LENGTH = 3;

type Status = "idle" | "loading" | "results" | "no-results" | "error";

export default function LocationAutocompleteField({
  id,
  name,
  defaultValue,
  placeholder,
  required,
  inputClassName,
  label,
  hideLabel,
  onSelect,
}: LocationAutocompleteFieldProps) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonically increasing per fetch — not an AbortController (spec §4.3:
  // a Server Action's server-side work can't be client-aborted). Instead,
  // discard any resolved response whose sequence number isn't the latest.
  const requestSeq = useRef(0);

  function scheduleFetch(queryText: string) {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      void runFetch(queryText);
    }, DEBOUNCE_MS);
  }

  async function runFetch(queryText: string) {
    const seq = ++requestSeq.current;
    setStatus("loading");
    try {
      const results = await getLocationSuggestions(queryText);
      if (seq !== requestSeq.current) return; // stale — a newer keystroke superseded this call

      if (results.length > 0) {
        setSuggestions(results);
        setStatus("results");
        setIsOpen(true);
        setHighlightedIndex(-1);
      } else {
        setSuggestions([]);
        setStatus("no-results");
        setIsOpen(true);
        setHighlightedIndex(-1);
      }
    } catch (err) {
      if (seq !== requestSeq.current) return;
      console.error("LocationAutocompleteField: getLocationSuggestions failed", err);
      setStatus("error");
      setSuggestions([]);
    }
  }

  function handleChange(nextValue: string) {
    setValue(nextValue);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    const trimmed = nextValue.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setStatus("idle");
      setIsOpen(false);
      setHighlightedIndex(-1);
      return;
    }

    scheduleFetch(trimmed);
  }

  function selectSuggestion(suggestion: LocationSuggestion) {
    setValue(suggestion.label);
    setIsOpen(false);
    setHighlightedIndex(-1);
    onSelect?.(suggestion);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        if (!isOpen && suggestions.length > 0) {
          setIsOpen(true);
          return;
        }
        setHighlightedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
        return;
      }
      case "ArrowUp": {
        event.preventDefault();
        setHighlightedIndex((prev) => Math.max(prev - 1, -1));
        return;
      }
      case "Enter": {
        if (isOpen && highlightedIndex >= 0 && suggestions[highlightedIndex]) {
          event.preventDefault();
          selectSuggestion(suggestions[highlightedIndex]);
        }
        // Otherwise: let native Enter behavior proceed (submits the GET
        // filter form on /listings, or is handled by ListingForm's own
        // submit handler) — this is the detail that keeps this component
        // safe to drop into a plain form with no JS submit handler at all.
        return;
      }
      case "Escape": {
        if (isOpen) {
          setIsOpen(false);
          setHighlightedIndex(-1);
        }
        return;
      }
      default:
        return;
    }
  }

  function handleBlur() {
    setIsOpen(false);
  }

  const listboxId = `${id}-listbox`;

  return (
    <div className="relative flex w-full flex-col gap-1">
      {label && !hideLabel && (
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
      )}
      <input
        id={id}
        name={name}
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={highlightedIndex >= 0 ? `${id}-option-${highlightedIndex}` : undefined}
        autoComplete="off"
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className={inputClassName ?? DEFAULT_INPUT_CLASSNAME}
      />
      {isOpen && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-lg border border-line bg-surface shadow-md"
        >
          {status === "results" &&
            suggestions.map((s, i) => (
              <li
                key={`${s.lat},${s.lng}`}
                id={`${id}-option-${i}`}
                role="option"
                aria-selected={i === highlightedIndex}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectSuggestion(s);
                }}
                onMouseEnter={() => setHighlightedIndex(i)}
                className={`flex min-h-11 items-center px-3 py-2 text-sm cursor-pointer ${
                  i === highlightedIndex ? "bg-primary/10 text-foreground" : "text-foreground"
                }`}
              >
                {s.label}
              </li>
            ))}
          {status === "no-results" && (
            <li className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400" aria-live="polite">
              No matches — you can still use what you typed.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
