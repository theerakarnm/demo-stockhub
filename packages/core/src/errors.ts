/** Base error carrying a stable machine code. The API maps `code` to an HTTP status. */
export class StockHubError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Marks a deliberate template gap. Grep for this to find what is left to build. */
export class NotImplementedError extends StockHubError {
  constructor(what: string) {
    super('not_implemented', `${what} is not implemented yet`);
  }
}

export class InsufficientStockError extends StockHubError {
  constructor(variantId: string, requested: number, available: number) {
    super(
      'insufficient_stock',
      `Insufficient stock for ${variantId}: requested ${requested}, available ${available}`,
      {
        variantId,
        requested,
        available,
      },
    );
  }
}

export class UnmatchedSkuError extends StockHubError {
  constructor(platformSku: string) {
    super('unmatched_sku', `No internal variant is mapped to "${platformSku}"`, { platformSku });
  }
}

export class ForbiddenError extends StockHubError {
  constructor(permission: string) {
    super('forbidden', `Missing permission: ${permission}`, { permission });
  }
}
