import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View, useColorScheme } from "react-native";
import ApproveDeclineButtons from "@/components/ApproveDeclineButtons";
import BookingRow from "@/components/BookingRow";
import BookingsSegmentedNav from "@/components/BookingsSegmentedNav";
import CancelBookingButton from "@/components/CancelBookingButton";
import ContactInfo from "@/components/ContactInfo";
import LoggedOutGate from "@/components/LoggedOutGate";
import { useAuth } from "@/lib/auth/AuthProvider";
import { supabase } from "@/lib/supabase/client";
import { signImageUrls } from "@/lib/listings/storage";
import { Colors, Spacing } from "@/constants/theme";

type BookingRowData = {
  id: string;
  listing_id: string;
  renter_id: string;
  start_date: string;
  end_date: string;
  status: string;
  listings: { title: string; price_amount: number; price_unit: string; owner_id: string } | null;
};

/**
 * Owner requests (spec §5.4.1) — port of
 * apps/web/src/app/bookings/owner-requests/page.tsx: "Pending requests"
 * (Approve/Decline) + "History" (status badge, Cancel on approved rows).
 */
export default function OwnerRequestsScreen() {
  const { user, loading: authLoading } = useAuth();
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? Colors.dark : Colors.light;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bookings, setBookings] = useState<BookingRowData[]>([]);
  const [coverByListingId, setCoverByListingId] = useState<Map<string, string | null>>(new Map());
  const [renterNameById, setRenterNameById] = useState<Map<string, string | null>>(new Map());
  const [contactByBookingId, setContactByBookingId] = useState<
    Map<string, { full_name: string | null; phone: string | null }>
  >(new Map());

  const fetchData = useCallback(async () => {
    if (!user) return;

    const { data: bookingsData } = await supabase
      .from("bookings")
      .select(
        "id, listing_id, renter_id, start_date, end_date, status, listings!inner(title, price_amount, price_unit, owner_id)",
      )
      .eq("listings.owner_id", user.id)
      .order("created_at", { ascending: false });

    const rows = (bookingsData ?? []) as unknown as BookingRowData[];
    setBookings(rows);

    const listingIds = [...new Set(rows.map((b) => b.listing_id))];
    const { data: covers } =
      listingIds.length > 0
        ? await supabase.from("listing_images").select("listing_id, storage_path").in("listing_id", listingIds).eq("position", 0)
        : { data: [] as { listing_id: string; storage_path: string }[] };
    const urlByPath = await signImageUrls((covers ?? []).map((c) => c.storage_path));
    setCoverByListingId(new Map((covers ?? []).map((c) => [c.listing_id, urlByPath.get(c.storage_path) ?? null])));

    const renterIds = [...new Set(rows.map((b) => b.renter_id))];
    const { data: renterProfiles } =
      renterIds.length > 0
        ? await supabase.from("public_profiles").select("id, full_name").in("id", renterIds)
        : { data: [] as { id: string; full_name: string | null }[] };
    setRenterNameById(new Map((renterProfiles ?? []).map((p) => [p.id, p.full_name])));

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
  }, [user]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [user, fetchData]);

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

  const pending = bookings.filter((b) => b.status === "pending");
  const history = bookings.filter((b) => b.status !== "pending");

  function renderRow(item: BookingRowData, section: "pending" | "history") {
    const listing = item.listings;
    if (!listing) return null;
    const topLabel = renterNameById.get(item.renter_id) || "A renter";
    const contact = contactByBookingId.get(item.id);

    return (
      <View key={item.id} style={styles.rowWrapper}>
        <BookingRow
          listingId={item.listing_id}
          listingTitle={listing.title}
          coverUrl={coverByListingId.get(item.listing_id) ?? null}
          startDate={item.start_date}
          endDate={item.end_date}
          priceAmount={listing.price_amount}
          priceUnit={listing.price_unit}
          status={item.status}
          topLabel={topLabel}
          contact={
            item.status === "approved" ? (
              <ContactInfo fullName={contact?.full_name ?? null} phone={contact?.phone ?? null} />
            ) : undefined
          }
          actions={
            section === "pending" ? (
              <ApproveDeclineButtons bookingId={item.id} onDone={fetchData} />
            ) : item.status === "approved" ? (
              <CancelBookingButton bookingId={item.id} onDone={fetchData} />
            ) : undefined
          }
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={[{ key: "content" }]}
        keyExtractor={(item) => item.key}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={styles.listContent}
        renderItem={() => (
          <View>
            {bookings.length === 0 ? (
              <View style={styles.empty}>
                <Text style={{ color: colors.foreground }}>No booking requests yet.</Text>
                <Text style={{ color: colors.muted, fontSize: 13 }}>
                  Requests to rent your listings will show up here.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Pending requests</Text>
                  {pending.length === 0 ? (
                    <Text style={{ color: colors.muted, fontSize: 13 }}>No pending requests.</Text>
                  ) : (
                    pending.map((b) => renderRow(b, "pending"))
                  )}
                </View>

                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>History</Text>
                  {history.length === 0 ? (
                    <Text style={{ color: colors.muted, fontSize: 13 }}>No past requests yet.</Text>
                  ) : (
                    history.map((b) => renderRow(b, "history"))
                  )}
                </View>
              </>
            )}
          </View>
        )}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.foreground }]}>Requests to me</Text>
            <BookingsSegmentedNav active="owner-requests" />
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
  section: { gap: Spacing.md, marginBottom: Spacing.xl },
  sectionTitle: { fontSize: 15, fontWeight: "600" },
  rowWrapper: { marginBottom: Spacing.md },
  empty: { alignItems: "center", gap: Spacing.sm, paddingVertical: Spacing.xl * 2 },
});
