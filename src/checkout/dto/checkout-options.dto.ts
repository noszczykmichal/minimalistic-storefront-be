import {
  type ShippingMethod,
  type PaymentMethod,
  SHIPPING_METHODS,
  PAYMENT_METHODS,
} from "@/checkout/checkout.constants.js";
import {
  CURRENCY_LABELS,
  CURRENCY_SYMBOLS,
  type CurrencySymbol,
} from "@/common/types.js";
import type { CurrencyLabel } from "@/common/types.js";
import { ApiProperty } from "@nestjs/swagger";

class CurrencyDto {
  @ApiProperty({ enum: CURRENCY_LABELS, enumName: "CurrencyLabel" })
  label: CurrencyLabel;

  @ApiProperty({ enum: CURRENCY_SYMBOLS, enumName: "CurrencySymbol" })
  symbol: CurrencySymbol;
}

class CostDto {
  @ApiProperty()
  amount: number;

  @ApiProperty({ type: CurrencyDto })
  currency: CurrencyDto[];
}

class ShippingOptionsDto {
  @ApiProperty({ enum: SHIPPING_METHODS, enumName: "ShippingMethod" })
  name: ShippingMethod;

  @ApiProperty({ type: CostDto })
  costs: CostDto[];
}

class PaymentMethodOptionsDto {
  @ApiProperty({ enum: PAYMENT_METHODS, enumName: "PaymentMethod" })
  name: PaymentMethod;

  @ApiProperty({ type: CostDto })
  costs: CostDto[];
}

export class CheckoutOptionsDto {
  @ApiProperty({ type: [ShippingOptionsDto] })
  shippingOptions: ShippingOptionsDto[];

  @ApiProperty({ type: PaymentMethodOptionsDto })
  paymentOptions: PaymentMethodOptionsDto[];
}
