import { Currency } from "@/common/types.js";

interface Attribute {
  name: string;
  items: { value: string }[];
}

export interface CatalogProduct {
  id: string;
  name: string;
  inStock: boolean;
  attributes: Attribute[];
  prices: { amount: number; currency: Currency }[];
}
