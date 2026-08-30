import { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import {
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import ImagePlaceholder from "@/components/ImagePlaceholder";
import PrimaryButton from "@/components/PrimaryButton";
import SelectField from "@/components/SelectField";
import { useAuth } from "@/lib/auth/AuthProvider";
import { supabase } from "@/lib/supabase/client";
import { signImageUrls } from "@/lib/listings/storage";
import {
  LISTING_CATEGORIES,
  PRICE_UNITS,
  formatPrice,
  type ListingCategory,
  type PriceUnit,
} from "@/lib/listings/categories";
import { Colors, Radius, Spacing } from "@/constants/theme";

// No "load more"/infinite scroll for M8, same cap as web (spec §5.2, M4 §12).
const INDEX_LIMIT = 60;

type ListingCard = {
  id: string;
  title: string;
  category: string;
  price_amount: number;
  price_unit: string;
  location: string;
  coverUrl: string | null;
};

type Filters = {
  category: ListingCategory | undefined;
  location: string;
  priceMin: string;
  priceMax: string;
  priceUnit: PriceUnit;
};

const EMPTY_FILTERS: Filters = { category: undefined, location: "", priceMin: "", priceMax: "", priceUnit: "day" };

function parseValidPrice(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

export default function BrowseScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? Colors.dark : Colors.light;

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<Filters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS);

  const [listings, setListings] = useState<ListingCard[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const hasActiveFilter =
    appliedFilters.category !== undefined ||
    Boolean(appliedFilters.location.trim()) ||
    parseValidPrice(appliedFilters.priceMin) !== undefined ||
    parseValidPrice(appliedFilters.priceMax) !== undefined;

  const fetchListings = useCallback(async (filters: Filters) => {
    let min = parseValidPrice(filters.priceMin);
    let max = parseValidPrice(filters.priceMax);
    if (min !== undefined && max !== undefined && min > max) {
      [min, max] = [max, min];
    }
    const trimmedLocation = filters.location.trim();

    let query = supabase
      .from("listings")
      .select("id, title, category, price_amount, price_unit, location")
      .eq("status", "published");

    if (filters.category) {
      query = query.eq("category", filters.category);
    }
    if (trimmedLocation) {
      query = query.ilike("location", `%${trimmedLocation}%`);
    }
    if (min !== undefined || max !== undefined) {
      query = query.eq("price_unit", filters.priceUnit);
      if (min !== undefined) query = query.gte("price_amount", min);
      if (max !== undefined) query = query.lte("price_amount", max);
    }

    const { data, error } = await query.order("created_at", { ascending: false }).limit(INDEX_LIMIT);

    if (error) {
      console.error(error);
      setListings([]);
      return;
    }

    const rows = data ?? [];
    const listingIds = rows.map((l) => l.id);
    const { data: covers } =
      listingIds.length > 0
        ? await supabase
            .from("listing_images")
            .select("listing_id, storage_path")
            .in("listing_id", listingIds)
            .eq("position", 0)
        : { data: [] as { listing_id: string; storage_path: string }[] };

    const urlByPath = await signImageUrls((covers ?? []).map((c) => c.storage_path));
    const coverByListingId = new Map((covers ?? []).map((c) => [c.listing_id, urlByPath.get(c.storage_path) ?? null]));

    setListings(rows.map((l) => ({ ...l, coverUrl: coverByListingId.get(l.id) ?? null })));
  }, []);

  useEffect(() => {
    fetchListings(appliedFilters);
  }, [appliedFilters, fetchListings]);

  async function handleRefresh() {
    setRefreshing(true);
    await fetchListings(appliedFilters);
    setRefreshing(false);
  }

  function applyFilters() {
    setAppliedFilters(draftFilters);
    setFiltersOpen(false);
  }

  function clearFilters() {
    setDraftFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={listings ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.foreground }]}>Browse listings</Text>

            <Pressable onPress={() => setFiltersOpen((v) => !v)}>
              <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 14 }}>
                {filtersOpen ? "Hide filters" : "Filters"}
              </Text>
            </Pressable>

            {filtersOpen && (
              <View style={[styles.filterPanel, { borderColor: colors.border }]}>
                <SelectField
                  label="Category"
                  value={draftFilters.category}
                  options={LISTING_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
                  placeholder="All categories"
                  onChange={(value) =>
                    setDraftFilters((f) => ({ ...f, category: value as ListingCategory | undefined }))
                  }
                />

                <View style={styles.field}>
                  <Text style={[styles.label, { color: colors.foreground }]}>Location</Text>
                  <TextInput
                    value={draftFilters.location}
                    onChangeText={(v) => setDraftFilters((f) => ({ ...f, location: v }))}
                    placeholder="e.g. Etobicoke"
                    placeholderTextColor={colors.muted}
                    style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                  />
                </View>

                <View style={styles.priceRow}>
                  <View style={[styles.field, { flex: 1 }]}>
                    <Text style={[styles.label, { color: colors.foreground }]}>Min price</Text>
                    <TextInput
                      value={draftFilters.priceMin}
                      onChangeText={(v) => setDraftFilters((f) => ({ ...f, priceMin: v }))}
                      placeholder="Min $"
                      placeholderTextColor={colors.muted}
                      keyboardType="decimal-pad"
                      style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                    />
                  </View>
                  <View style={[styles.field, { flex: 1 }]}>
                    <Text style={[styles.label, { color: colors.foreground }]}>Max price</Text>
                    <TextInput
                      value={draftFilters.priceMax}
                      onChangeText={(v) => setDraftFilters((f) => ({ ...f, priceMax: v }))}
                      placeholder="Max $"
                      placeholderTextColor={colors.muted}
                      keyboardType="decimal-pad"
                      style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                    />
                  </View>
                </View>

                <SelectField
                  label="Per"
                  value={draftFilters.priceUnit}
                  options={PRICE_UNITS.map((u) => ({ value: u.value, label: u.label }))}
                  placeholder="day"
                  onChange={(value) => setDraftFilters((f) => ({ ...f, priceUnit: (value as PriceUnit) ?? "day" }))}
                />

                <PrimaryButton title="Apply filters" onPress={applyFilters} />
                {hasActiveFilter && (
                  <Pressable onPress={clearFilters}>
                    <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 14, textAlign: "center" }}>
                      Clear filters
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={[styles.card, { borderColor: colors.border }]}
            onPress={() => router.push({ pathname: "/browse/[id]", params: { id: item.id } })}
          >
            {item.coverUrl ? (
              <Image source={{ uri: item.coverUrl }} style={styles.thumb} />
            ) : (
              <ImagePlaceholder label={item.title} style={styles.thumb} />
            )}
            <View style={styles.cardBody}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "500" }}>
                {formatPrice(item.price_amount, item.price_unit)}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>
                {item.location}
              </Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          listings === null ? null : hasActiveFilter ? (
            <View style={styles.empty}>
              <Text style={{ color: colors.foreground }}>No tools match your filters.</Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>Try adjusting your search.</Text>
              <Pressable onPress={clearFilters}>
                <Text style={{ color: colors.foreground, fontWeight: "600" }}>Clear filters</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={{ color: colors.foreground }}>No listings yet.</Text>
              {!user && (
                <Text style={{ color: colors.foreground, fontWeight: "600" }} onPress={() => router.push("/signup")}>
                  Sign up
                </Text>
              )}
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: Spacing.lg, gap: Spacing.md },
  header: { gap: Spacing.md, marginBottom: Spacing.sm },
  title: { fontSize: 22, fontWeight: "600" },
  filterPanel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.card,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  field: { gap: Spacing.xs },
  label: { fontSize: 14, fontWeight: "500" },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.input,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    fontSize: 14,
  },
  priceRow: { flexDirection: "row", gap: Spacing.md },
  card: {
    flexDirection: "row",
    gap: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.card,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  thumb: { width: 64, height: 64, borderRadius: Radius.input },
  cardBody: { flex: 1, justifyContent: "center", gap: 2 },
  cardTitle: { fontSize: 15, fontWeight: "600" },
  empty: {
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.xl * 2,
  },
});
