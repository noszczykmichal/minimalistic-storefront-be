import { Currency } from "@/common/types.js";
import { BillingCurrency } from "@/generated/prisma/enums.js";

export const SHIPPING_METHODS = [
  "flatRate",
  "bestWay",
  "in-store/online_payment",
  "in-store/payment_on_collection",
] as const;

export type ShippingMethod = (typeof SHIPPING_METHODS)[number];

export interface Cost {
  amount: number;
  currency: Currency;
}

export interface Option<T> {
  name: T;
  costs: Cost[];
}

export const shippingOptions: Option<ShippingMethod>[] = [
  {
    name: "flatRate",
    costs: [
      { amount: 5.0, currency: { label: "USD", symbol: "$" } },
      { amount: 3.59, currency: { label: "GBP", symbol: "£" } },
      { amount: 6.49, currency: { label: "AUD", symbol: "A$" } },
      { amount: 539.95, currency: { label: "JPY", symbol: "¥" } },
      { amount: 378.89, currency: { label: "RUB", symbol: "₽" } },
    ],
  },
  {
    name: "bestWay",
    costs: [
      { amount: 10.0, currency: { label: "USD", symbol: "$" } },
      { amount: 7.19, currency: { label: "GBP", symbol: "£" } },
      { amount: 12.9, currency: { label: "AUD", symbol: "A$" } },
      { amount: 1079.95, currency: { label: "JPY", symbol: "¥" } },
      { amount: 756.29, currency: { label: "RUB", symbol: "₽" } },
    ],
  },
  {
    name: "in-store/online_payment",
    costs: [
      { amount: 0, currency: { label: "USD", symbol: "$" } },
      { amount: 0, currency: { label: "GBP", symbol: "£" } },
      { amount: 0, currency: { label: "AUD", symbol: "A$" } },
      { amount: 0, currency: { label: "JPY", symbol: "¥" } },
      { amount: 0, currency: { label: "RUB", symbol: "₽" } },
    ],
  },
  {
    name: "in-store/payment_on_collection",
    costs: [
      { amount: 0.99, currency: { label: "USD", symbol: "$" } },
      { amount: 0.79, currency: { label: "GBP", symbol: "£" } },
      { amount: 1.29, currency: { label: "AUD", symbol: "A$" } },
      { amount: 106.95, currency: { label: "JPY", symbol: "¥" } },
      { amount: 74.89, currency: { label: "RUB", symbol: "₽" } },
    ],
  },
];

export const PAYMENT_METHODS = [
  "credit_card",
  "bank_transfer",
  "cash_on_collection",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const paymentOptions: Option<PaymentMethod>[] = [
  {
    name: "credit_card",
    costs: [
      { amount: 0, currency: { label: "USD", symbol: "$" } },
      { amount: 0, currency: { label: "GBP", symbol: "£" } },
      { amount: 0, currency: { label: "AUD", symbol: "A$" } },
      { amount: 0, currency: { label: "JPY", symbol: "¥" } },
      { amount: 0, currency: { label: "RUB", symbol: "₽" } },
    ],
  },
  {
    name: "bank_transfer",
    costs: [
      { amount: 0, currency: { label: "USD", symbol: "$" } },
      { amount: 0, currency: { label: "GBP", symbol: "£" } },
      { amount: 0, currency: { label: "AUD", symbol: "A$" } },
      { amount: 0, currency: { label: "JPY", symbol: "¥" } },
      { amount: 0, currency: { label: "RUB", symbol: "₽" } },
    ],
  },
  {
    name: "cash_on_collection",
    costs: [
      { amount: 1.99, currency: { label: "USD", symbol: "$" } },
      { amount: 1.49, currency: { label: "GBP", symbol: "£" } },
      { amount: 2.59, currency: { label: "AUD", symbol: "A$" } },
      { amount: 214.9, currency: { label: "JPY", symbol: "¥" } },
      { amount: 150.49, currency: { label: "RUB", symbol: "₽" } },
    ],
  },
];

export const MINOR_UNITS: Record<BillingCurrency, number> = {
  USD: 2,
  GBP: 2,
  AUD: 2,
  JPY: 0,
  RUB: 2,
};

export const toMinorUnits = (amount: number, currency: BillingCurrency) =>
  Math.round(amount * 10 ** MINOR_UNITS[currency]);
