import type { ReactNode } from "react";
import { useRouter } from "expo-router";
import { Image, Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import ImagePlaceholder from "@/components/ImagePlaceholder";
import StatusBadge from "@/components/StatusBadge";
import { Colors, Radius, Spacing } from "@/constants/theme";
import { dayCount, estimatePrice, formatDateRange, formatMoney } from "@/lib/bookings/pricing";

/**
 * One booking row, shared by /bookings/mine and /bookings/owner-requests
 * (spec §5.4/§5.4.1) — port of apps/web/src/components/bookings/
 * BookingListingRow.tsx. `topLabel` (renter name on the owner view) and the
 * `actions`/`contact` slots differ per page/section, passed in by the
 * caller.
 */
export default function BookingRow({
  listingId,
  listingTitle,
  coverUrl,
  startDate,
  endDate,
  priceAmount,
  priceUnit,
  status,
  topLabel,
  actions,
  contact,
}: {
  listingId: string;
  listingTitle: string;
  coverUrl: string | null;
  startDate: string;
  endDate: string;
  priceAmount: number;
  priceUnit: string;
  status: string;
  topLabel?: string;
  actions?: ReactNode;
  contact?: ReactNode;
}) {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? Colors.dark : Colors.light;

  const days = dayCount(startDate, endDate);
  const estimate = estimatePrice(priceAmount, priceUnit, days);

  return (
    <View style={[styles.row, { borderColor: colors.border }]}>
      <Pressable
        style={styles.top}
        onPress={() => router.push({ pathname: "/browse/[id]", params: { id: listingId } })}
      >
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={styles.thumb} />
        ) : (
          <ImagePlaceholder label={listingTitle} style={styles.thumb} />
        )}
        <View style={styles.body}>
          {topLabel ? <Text style={{ color: colors.muted, fontSize: 12 }}>{topLabel}</Text> : null}
          <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }} numberOfLines={1}>
            {listingTitle}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{formatDateRange(startDate, endDate)}</Text>
          <Text style={{ color: colors.foreground, fontSize: 13, marginTop: 2 }}>
            {estimate.kind === "exact" &&
              `Estimated total: ${formatMoney(estimate.total)} for ${estimate.days} ${estimate.days === 1 ? "day" : "days"}`}
            {estimate.kind === "rounded_weeks" &&
              `Estimated total: ${formatMoney(estimate.total)} for ${estimate.days} ${estimate.days === 1 ? "day" : "days"} — billed as ${estimate.weeks} ${estimate.weeks === 1 ? "week" : "weeks"}`}
            {estimate.kind === "hourly_no_total" && `${formatMoney(priceAmount)} / hour`}
          </Text>
        </View>
      </Pressable>

      <View style={styles.footer}>
        <StatusBadge status={status} />
      </View>

      {contact}
      {actions}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.card,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  top: { flexDirection: "row", gap: Spacing.md },
  thumb: { width: 64, height: 64, borderRadius: Radius.input },
  body: { flex: 1, justifyContent: "center", gap: 2 },
  footer: { flexDirection: "row", justifyContent: "flex-end" },
});
