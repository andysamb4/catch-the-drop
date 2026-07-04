/** LONG profits when price rises, SHORT profits when price falls. */
export function calcRealizedPL(
  direction: "LONG" | "SHORT",
  entryPrice: number,
  exitPrice: number,
  quantity: number
): number {
  const perShare = direction === "LONG" ? exitPrice - entryPrice : entryPrice - exitPrice;
  return perShare * quantity;
}

export function calcHoldingDays(entryDate: Date, exitDate: Date): number {
  return Math.round((exitDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
}
