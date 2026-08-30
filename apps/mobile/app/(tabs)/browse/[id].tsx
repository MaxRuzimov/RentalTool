import { useCallback, useEffect, useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import ImagePlaceholder from "@/components/ImagePlaceholder";
import RequestToRentPanel from "@/components/RequestToRentPanel";
import ReviewsList, { type ReviewListItem } from "@/components/ReviewsList";
import StarRating from "@/components/StarRating";
import { useAuth } from "@/lib/auth/AuthProvider";
import { supabase } from "@/lib/supabase/client";
import { signImageUrls } from "@/lib/listings/storage";
import { categoryLabel, formatPrice } from "@/lib/listings/categories";
import { Colors, Radius, Spacing } from "@/constants/theme";

type Listing = {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  category: string;
  price_amount: number;
  price_unit: string;
  location: string;
};

type Owner = { full_name: string | null; avatar_url: string | null; city: string | null };

/**
 * Listing detail (spec §5.3) — same vertical content order and data-fetch
 * shape as apps/web/src/app/listings/[id]/page.tsx: cover photo, thumbnail
 * strip, title/price/category/rating, description, owner block, the
 * request-to-rent panel (or owner note), reviews list. "Edit listing" is
 * never rendered (§4.1 — no edit screen on mobile at all).
 */
export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? Colors.dark : Colors.light;

  const [loading, setLoading] = useState(true);
  const [listing, setListing] = useState<Listing | null>(null);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [owner, setOwner] = useState<Owner | null>(null);
  const [reviews, setReviews] = useState<ReviewListItem[]>([]);

  const fetchAll = useCallback(async () => {
    setLoading(true);

    const { data: listingRow } = await supabase
      .from("listings")
      .select("id, owner_id, title, description, category, price_amount, price_unit, location")
      .eq("id", id)
      .maybeSingle();

    if (!listingRow) {
      setListing(null);
      setLoading(false);
      return;
    }
    setListing(listingRow);

    const { data: images } = await supabase
      .from("listing_images")
      .select("storage_path")
      .eq("listing_id", id)
      .order("position", { ascending: true });

    const urlByPath = await signImageUrls((images ?? []).map((img) => img.storage_path));
    setPhotoUrls(
      (images ?? [])
        .map((img) => urlByPath.get(img.storage_path))
        .filter((url): url is string => Boolean(url)),
    );

    const { data: ownerRow } = await supabase
      .from("public_profiles")
      .select("full_name, avatar_url, city")
      .eq("id", listingRow.owner_id)
      .maybeSingle();
    setOwner(ownerRow ?? null);

    const { data: reviewRows } = await supabase
      .from("reviews")
      .select("id, rating, comment, created_at, renter_id")
      .eq("listing_id", id)
      .order("created_at", { ascending: false });

    const reviewerIds = [...new Set((reviewRows ?? []).map((r) => r.renter_id))];
    const { data: reviewers } =
      reviewerIds.length > 0
        ? await supabase.from("public_profiles").select("id, full_name").in("id", reviewerIds)
        : { data: [] as { id: string; full_name: string | null }[] };
    const nameByReviewerId = new Map((reviewers ?? []).map((r) => [r.id, r.full_name]));

    setReviews(
      (reviewRows ?? []).map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.created_at,
        reviewerName: nameByReviewerId.get(r.renter_id) ?? null,
      })),
    );

    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!listing) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.foreground }}>Listing not found.</Text>
      </View>
    );
  }

  const isOwner = user?.id === listing.owner_id;
  const reviewCount = reviews.length;
  const averageRating = reviewCount > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount : 0;

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: listing.title }} />
      {photoUrls.length > 0 ? (
        <View>
          <Image source={{ uri: photoUrls[0] }} style={styles.cover} />
          {photoUrls.length > 1 && (
            <ScrollView horizontal style={styles.thumbStrip} showsHorizontalScrollIndicator={false}>
              {photoUrls.slice(1).map((url) => (
                <Image key={url} source={{ uri: url }} style={styles.thumb} />
              ))}
            </ScrollView>
          )}
        </View>
      ) : (
        <ImagePlaceholder label={listing.title} style={styles.cover} />
      )}

      <Text style={[styles.title, { color: colors.foreground }]}>{listing.title}</Text>
      <Text style={[styles.price, { color: colors.foreground }]}>
        {formatPrice(listing.price_amount, listing.price_unit)}
      </Text>
      <Text style={{ color: colors.muted, fontSize: 13 }}>
        {categoryLabel(listing.category)} · {listing.location}
      </Text>

      {reviewCount > 0 ? (
        <View style={styles.ratingRow}>
          <StarRating rating={averageRating} size="sm" />
          <Text style={{ color: colors.foreground, fontSize: 13 }}>
            {averageRating.toFixed(1)} ({reviewCount} review{reviewCount === 1 ? "" : "s"})
          </Text>
        </View>
      ) : (
        <Text style={{ color: colors.muted, fontSize: 13 }}>No reviews yet</Text>
      )}

      <Text style={[styles.description, { color: colors.foreground }]}>{listing.description}</Text>

      <View style={[styles.ownerBlock, { borderColor: colors.border }]}>
        {owner?.avatar_url ? (
          <Image source={{ uri: owner.avatar_url }} style={styles.avatar} />
        ) : null}
        <View>
          <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "500" }}>
            {owner?.full_name || "A tool owner on RentalTool"}
          </Text>
          {owner?.city ? <Text style={{ color: colors.muted, fontSize: 12 }}>{owner.city}</Text> : null}
        </View>
      </View>

      <View style={styles.section}>
        {isOwner ? (
          <Text style={{ color: colors.muted, fontSize: 14 }}>
            This is your listing.{" "}
            <Text
              style={{ color: colors.foreground, fontWeight: "600" }}
              onPress={() => router.push("/bookings/owner-requests")}
            >
              View requests
            </Text>
          </Text>
        ) : (
          <RequestToRentPanel
            listingId={listing.id}
            priceAmount={listing.price_amount}
            priceUnit={listing.price_unit}
            loggedIn={Boolean(user)}
          />
        )}
      </View>

      <View style={[styles.section, { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
        <ReviewsList reviews={reviews} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: Spacing.lg, gap: Spacing.xs, paddingBottom: Spacing.xl * 2 },
  cover: { width: "100%", aspectRatio: 16 / 9, borderRadius: Radius.card },
  thumbStrip: { marginTop: Spacing.sm },
  thumb: { width: 72, height: 72, borderRadius: Radius.input, marginRight: Spacing.sm },
  title: { fontSize: 22, fontWeight: "600", marginTop: Spacing.lg },
  price: { fontSize: 17, fontWeight: "500" },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: Spacing.xs },
  description: { fontSize: 14, marginTop: Spacing.md, lineHeight: 20 },
  ownerBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginTop: Spacing.lg,
    paddingTop: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  section: { marginTop: Spacing.lg, paddingTop: Spacing.lg, gap: Spacing.md },
});
