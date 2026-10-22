export type ErrorCode =
  | 'VALIDATION_ERROR' | 'MALFORMED_JSON' | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE' | 'CORS_ORIGIN_DENIED' | 'RATE_LIMITED'
  | 'NOT_FOUND' | 'PRODUCT_NOT_FOUND' | 'CATEGORY_NOT_FOUND' | 'INFORMATION_NOT_FOUND'
  | 'UNAUTHORIZED' | 'FORBIDDEN' | 'ACCOUNT_CONFLICT'
  | 'INVALID_PRODUCT_CONFIGURATION' | 'PRODUCT_UNAVAILABLE' | 'CART_LIMIT_EXCEEDED' | 'CART_ITEM_NOT_FOUND'
  | 'EMPTY_CART' | 'INVALID_CART' | 'ORDER_AMOUNT_EXCEEDED' | 'IDEMPOTENCY_CONFLICT' | 'CHECKOUT_BUSY'
  | 'ORDER_NOT_FOUND' | 'ORDER_INVALID_TRANSITION'
  | 'SERVICE_NOT_READY' | 'INTERNAL_ERROR';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details: unknown = null,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
