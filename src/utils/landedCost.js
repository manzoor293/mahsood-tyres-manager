// Presentation only: the saved landed line total remains authoritative.
export function formatLandedUnitCost(lineTotal, quantity) {
  if (
    !Number.isSafeInteger(lineTotal) ||
    lineTotal < 0 ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1
  )
    return "Unavailable";
  const total = BigInt(lineTotal),
    count = BigInt(quantity);
  const approximate = total % count !== 0n;
  const paise = (total + count / 2n) / count;
  const rupees = new Intl.NumberFormat("en-PK").format(paise / 100n);
  const fraction = paise % 100n;
  return `${approximate ? "≈ " : ""}Rs. ${rupees}${approximate || fraction ? `.${String(fraction).padStart(2, "0")}` : ""}`;
}
