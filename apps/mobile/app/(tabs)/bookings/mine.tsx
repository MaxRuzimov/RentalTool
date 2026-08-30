import { useCallback, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View, useColorScheme } from "react-native";
import BookingRow from "@/components/BookingRow";
import BookingsSegmentedNav from "@/components/BookingsSegmentedNav";
import CancelBookingButton from "@/components/CancelBookingButton";
import ContactInfo from "@/components/ContactInfo";
import LoggedOutGate from "@/components/LoggedOutGate";
import PrimaryButton from "@/components/PrimaryButton";
import ReviewRowSlot, { type ExistingReview } from "@/components/ReviewRowSlot";
import { useAuth } from "@/lib/auth/AuthProvider";
import { supabase } from "@/lib/supabase/client";
import { signImageUrls } from "@/lib/listings/storage";
import { todayISODate } from "@/lib/bookings/pricing";
import { Colors, Spacing } from "@/constants/theme";

type BookingRowData = {
  id: string;
  listing_id: string;
  start_date: string;
  end_date: string;
  status: string;
  listings: { title: string; price_amount: number; price_unit: string } | null;
};

/**
 * My bookings / renter view (spec §5.4) — port of
 * apps/web/src/app/bookings/mine/page.tsx.
 */
export default function MyBookingsScreen() {
  const router = useRouter();
  const { requestSent } = useLocalSearchParams<{ requestSent?: string }>();
  const { user, loading: authLoading } = useAuth();
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? Colors.dark : Colors.light;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bookings, setBookings] = useState<BookingRowData[]>([]);
  const [coverByListingId, setCoverByListingId] = useState<Map<string, string | null>>(new Map());
  const [contactByBookingId, setContactByBookingId] = useState<
    Map<string, { full_name: string | null; phone: string | null }>
  >(new Map());
  const [reviewByBookingId, setReviewByBookingId] = useState<Map<string, ExistingReview>>(new Map());
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;

    const { data: bookingsData } = await supabase
      .from("bookings")
      .select("id, listing_id, start_date, end_date, status, listings(title, price_amount, price_unit)")
      .eq("renter_id", user.id)
      .order("created_at", { ascending: false });

    const rows = (bookingsData ?? []) as unknown as BookingRowData[];
    setBookings(rows);

    const listingIds = rows.map((b) => b.listing_id);
    const { data: covers } =
      listingIds.length > 0
        ? await supabase.from("listing_images").select("listing_id, storage_path").in("listing_id", listingIds).eq("position", 0)
        : { data: [] as { listing_id: string; storage_path: string }[] };
    const urlByPath = await signImageUrls((covers ?? []).map((c) => c.storage_path));
    setCoverByListingId(new Map((covers ?? []).map((c) => [c.listing_id, urlByPath.get(c.storage_path) ?? null])));

    const approvedIds = rows.filter((b) => b.status === "approved").map((b) => b.id);
    const contactMap = new Map<string, { full_name: string | null; phone: string | null }>();
    await Promise.all(
      approvedIds.map(async (id) => {
        const { data } = await supabase.rpc("booking_contact", { booking_id: id });
        const row = data?.[0];
        if (row) contactMap.set(id, row);
      }),
    );
    setContactByBookingId(contactMap);

    const { data: reviewRows } = await supabase.from("reviews").select("booking_id, rating, comment").eq("renter_id", user.id);
    setReviewByBookingId(new Map((reviewRows ?? []).map((r) => [r.booking_id, { rating: r.rating, comment: r.comment }])));
  }, [user]);

  // Refetches whenever this screen (re)gains focus — covers the initial
  // mount, returning from the review modal after a successful submit (spec
  // §5.4.2), and returning from the request-to-rent flow (spec §5.3.3) —
  // not just a one-shot effect keyed on `user`.
  useFocusEffect(
    useCallback(() => {
      if (!user) {
        setLoading(false);
        return;
      }
      setLoading(true);
      fetchData().finally(() => setLoading(false));
    }, [user, fetchData]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }

  if (authLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!user) {
    return <LoggedOutGate message="Log in to see your bookings." />;
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const today = todayISODate();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={bookings}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.foreground }]}>My bookings</Text>
            <BookingsSegmentedNav active="mine" />
            {requestSent === "1" && !bannerDismissed && (
              <View style={[styles.banner, { backgroundColor: scheme === "dark" ? "rgba(22,163,74,0.15)" : "#f0fdf4" }]}>
                <Text style={{ color: colors.success, fontSize: 14, flex: 1 }}>
                  Request sent! The owner will respond soon.
                </Text>
                <Text style={{ color: colors.success, fontWeight: "600" }} onPress={() => setBannerDismissed(true)}>
                  ×
                </Text>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const listing = item.listings;
          if (!listing) return null;
          const canCancel = item.status === "pending" || item.status === "approved";
          const contact = contactByBookingId.get(item.id);
          const existingReview = reviewByBookingId.get(item.id) ?? null;
          const reviewEligible = !existingReview && item.status === "approved" && item.end_date < today;
          const showReviewSlot = Boolean(existingReview) || reviewEligible;

          return (
            <View style={styles.rowWrapper}>
              <BookingRow
                listingId={item.listing_id}
                listingTitle={listing.title}
                coverUrl={coverByListingId.get(item.listing_id) ?? null}
                startDate={item.start_date}
                endDate={item.end_date}
                priceAmount={listing.price_amount}
                priceUnit={listing.price_unit}
                status={item.status}
                contact={
                  showReviewSlot ? (
                    <ReviewRowSlot bookingId={item.id} eligible={reviewEligible} review={existingReview} />
                  ) : item.status === "approved" ? (
                    <ContactInfo fullName={contact?.full_name ?? null} phone={contact?.phone ?? null} />
                  ) : undefined
                }
                actions={canCancel ? <CancelBookingButton bookingId={item.id} onDone={fetchData} /> : undefined}
              />
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ color: colors.foreground }}>You haven&apos;t requested to rent anything yet.</Text>
            <PrimaryButton title="Browse listings" onPress={() => router.push("/browse")} />
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { padding: Spacing.lg, gap: Spacing.md },
  header: { gap: Spacing.md, marginBottom: Spacing.sm },
  title: { fontSize: 22, fontWeight: "600" },
  banner: {
    borderRadius: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  rowWrapper: { marginBottom: Spacing.md },
  empty: { alignItems: "center", gap: Spacing.lg, paddingVertical: Spacing.xl * 2 },
});
