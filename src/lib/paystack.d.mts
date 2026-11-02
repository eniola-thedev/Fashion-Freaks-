export type PaystackTransaction = {
  reference: string;
  status: string;
  amount: number;
  currency: string;
  customer: {
    email: string;
  };
};

export type PayableOrder = {
  paymentReference: string | null;
  total: number;
  customerEmail: string;
};

export function verifyPaystackSignature(
  rawBody: string,
  signature: string | null,
  secretKey: string
): boolean;

export function parsePaystackTransaction(
  value: unknown
): PaystackTransaction | null;

export function matchesPaystackTransaction(
  transaction: PaystackTransaction,
  order: PayableOrder
): boolean;
