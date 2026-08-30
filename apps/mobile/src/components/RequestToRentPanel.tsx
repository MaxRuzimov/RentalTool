import { useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View, useColorScheme } from "react-native";
import DateField from "@/components/DateField";
import PrimaryButton from "@/components/PrimaryButton";
import { Colors, Radius, Spacing } from "@/constants/theme";
import { dayCount, estimatePrice, formatMoney, todayISODate } from "@/lib/bookings/pricing";
import { createBookingRequest } from "@/lib/bookings/actions";

/**
 * "Request to rent this tool" panel (spec §5.3, §5.3.1, §5.3.2, §5.3.3) —
 * states A (logged in, not owner) and B (logged out) live here; state C
 * ("This is your listing.") is rendered directly by the parent screen since
 * this component is never mounted for that case.
 */
export default function RequestToRentPanel({
  listingId,
  priceAmount,
  priceUnit,
  loggedIn,
}: {
  listingId: string;
  priceAmount: number;
  priceUnit: string;
  loggedIn: boolean;
}) {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = scheme === "dark" ? Colors.dark : Colors.light;

  const today = useMemo(() => todayISODate(), []);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleStartDateChange(value: string) {
    setStartDate(value);
    if (endDate && endDate < value) {
      setEndDate(value);
    }
  }

  const validationMessage = !startDate
    ? "Please choose a start date."
    : !endDate || endDate < startDate
      ? "End date must be on or after the start date."
      : null;
  const datesValid = validationMessage === null;

  const days = datesValid ? dayCount(startDate, endDate) : 0;
  const estimate = datesValid ? estimatePrice(priceAmount, priceUnit, days) : null;

  async function handleSubmit() {
    if (!datesValid) return;
    setSubmitting(true);
    setError(null);

    const result = await createBookingRequest(listingId, startDate, endDate);
    setSubmitting(false);

    if (result.status === "error") {
      setError(result.message);
      return;
    }

    router.push({ pathname: "/bookings/mine", params: { requestSent: "1" } });
  }

  return (
    <View style={[styles.panel, { borderColor: colors.border }]}>
      <Text style={[styles.heading, { color: colors.foreground }]}>Request to rent this tool</Text>

      <View style={styles.dateRow}>
        <DateField label="Start date" value={startDate} minValue={today} onChange={handleStartDateChange} />
        <DateField label="End date" value={endDate} minValue={startDate || today} onChange={setEndDate} />
      </View>

      {validationMessage && <Text style={{ color: colors.error, fontSize: 14 }}>{validationMessage}</Text>}

      {estimate && (
        <View style={styles.estimate}>
          {estimate.kind === "exact" && (
            <>
              <Text style={{ color: colors.foreground, fontSize: 14 }}>
                Estimated total: <Text style={{ fontWeight: "600" }}>{formatMoney(estimate.total)}</Text> for{" "}
                {estimate.days} {estimate.days === 1 ? "day" : "days"}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>({formatMoney(priceAmount)} / day)</Text>
            </>
          )}
          {estimate.kind === "rounded_weeks" && (
            <>
              <Text style={{ color: colors.foreground, fontSize: 14 }}>
                Estimated total: <Text style={{ fontWeight: "600" }}>{formatMoney(estimate.total)}</Text> for{" "}
                {estimate.days} {estimate.days === 1 ? "day" : "days"} — billed as {estimate.weeks}{" "}
                {estimate.weeks === 1 ? "week" : "weeks"}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>({formatMoney(priceAmount)} / week)</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>Rounded up to the nearest full week.</Text>
            </>
          )}
          {estimate.kind === "hourly_no_total" && (
            <Text style={{ color: colors.foreground, fontSize: 14 }}>
              {formatMoney(priceAmount)} / hour — total cost depends on hours used. Confirm the total with the
              owner.
            </Text>
          )}
        </View>
      )}

      {error && <Text style={{ color: colors.error, fontSize: 14 }}>{error}</Text>}

      {loggedIn ? (
        <PrimaryButton
          title={submitting ? "Sending request…" : "Request to rent"}
          onPress={handleSubmit}
          disabled={submitting || !datesValid}
          loading={submitting}
        />
      ) : (
        <PrimaryButton title="Log in to request this tool" onPress={() => router.push("/login")} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.card,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  heading: { fontSize: 14, fontWeight: "600" },
  dateRow: { flexDirection: "row", gap: Spacing.md },
  estimate: { gap: 2 },
});
