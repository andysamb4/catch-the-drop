const REVERSAL_THRESHOLD = 0.02; // 2%

/**
 * ZigZag(2%) reversal count: walks the trailing closes (oldest -> newest) tracking the
 * running extreme of the current swing, and counts each time price reverses more than
 * 2% off that extreme. Higher score = more frequent oscillation = more "yo-yo"-y.
 * Works with fewer than 90 days of history — the score just gets more meaningful as the
 * app accumulates more nightly bars for a ticker.
 */
export function computeYoyoScore(closes: number[]): number {
  if (closes.length < 2) return 0;

  let reversals = 0;
  let extreme = closes[0];
  let direction: "up" | "down" | null = null;

  for (let i = 1; i < closes.length; i++) {
    const price = closes[i];

    if (direction === null) {
      const changeFromExtreme = (price - extreme) / extreme;
      if (Math.abs(changeFromExtreme) >= REVERSAL_THRESHOLD) {
        direction = changeFromExtreme > 0 ? "up" : "down";
        extreme = price;
      }
      continue;
    }

    if (direction === "up") {
      if (price >= extreme) {
        extreme = price;
      } else if ((extreme - price) / extreme >= REVERSAL_THRESHOLD) {
        reversals++;
        direction = "down";
        extreme = price;
      }
    } else {
      if (price <= extreme) {
        extreme = price;
      } else if ((price - extreme) / extreme >= REVERSAL_THRESHOLD) {
        reversals++;
        direction = "up";
        extreme = price;
      }
    }
  }

  return reversals;
}
