export declare function normalizeEmail(value: unknown): string;
export declare function isValidEmail(value: unknown): value is string;
export declare function isValidCustomerPassword(
  value: unknown
): value is string;
export declare function hashAuthRateLimitKey(
  scope: string,
  identity: unknown
): string;
export declare function safeRedirectPath(
  value: unknown,
  fallback?: string
): string;
