export const CURRENCY_LABELS = ["USD", "GBP", "AUD", "JPY", "RUB"] as const;
export const CURRENCY_SYMBOLS = {
  USD: "$",
  GBP: "£",
  AUD: "A$",
  JPY: "¥",
  RUB: "₽",
} as const satisfies Record<(typeof CURRENCY_LABELS)[number], string>;

export type CurrencyLabel = (typeof CURRENCY_LABELS)[number];

export type CurrencySymbol = (typeof CURRENCY_SYMBOLS)[CurrencyLabel];

export type Currency = {
  [L in CurrencyLabel]: { label: L; symbol: (typeof CURRENCY_SYMBOLS)[L] };
}[CurrencyLabel];
