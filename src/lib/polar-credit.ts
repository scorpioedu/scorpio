/** The fields of a Polar order the AI credit webhook reads. */
export type PolarOrderData = {
  id: string;
  paid?: boolean;
  netAmount?: number;
  platformFeeAmount?: number;
  refundedAmount?: number;
  currency?: string;
  customerId?: string;
  metadata?: { kind?: string; organizationId?: string; userId?: string };
};

/**
 * Credit for a paid AI credit order: what Scorpio actually receives, i.e. the net amount (before
 * tax) minus Polar's fee. Credit is sold at cost, so the fee is not absorbed.
 */
export function orderCreditCents(order: PolarOrderData): number {
  const net = Number(order.netAmount) || 0;
  const fee = Number(order.platformFeeAmount) || 0;
  return Math.max(0, net - fee);
}

