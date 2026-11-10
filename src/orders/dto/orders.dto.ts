import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsInt,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  Matches,
  IsOptional,
  IsEnum,
  IsIn,
} from "class-validator";

import {
  PAYMENT_METHODS,
  SHIPPING_METHODS,
  type PaymentMethod,
  type ShippingMethod,
} from "@/checkout/checkout.constants.js";
import { BillingCurrency } from "@/generated/prisma/enums.js";

const Trim = () =>
  Transform(({ value }) => (typeof value === "string" ? value.trim() : value));

class SelectedAttributeDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  value: string;
}

export class OrderedProductDto {
  @ApiProperty()
  @IsString()
  productId: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ type: SelectedAttributeDto })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelectedAttributeDto)
  attributes: SelectedAttributeDto[];
}

class AddressDto {
  @ApiProperty()
  @Trim()
  @MinLength(1)
  @IsString()
  firstName: string;

  @ApiProperty()
  @Trim()
  @MinLength(1)
  @IsString()
  lastName: string;

  @ApiProperty()
  @Trim()
  @MinLength(3)
  @IsString()
  addressLine1: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  addressLine2?: string;

  @ApiProperty()
  @Trim()
  @MinLength(2)
  @IsString()
  city: string;

  @ApiProperty()
  @Trim()
  @MinLength(3)
  @MaxLength(10)
  @IsString()
  postalCode: string;

  @ApiProperty()
  @Trim()
  @MinLength(1)
  @IsString()
  country: string;

  @ApiProperty()
  @Trim()
  @IsString()
  @Matches(/^\+?[0-9\s-]{7,13}$/)
  phone: string;

  @ApiProperty()
  @Trim()
  @Transform(({ value }) =>
    typeof value === "string" ? value.toLowerCase().trim() : value,
  )
  @IsEmail()
  email: string;
}

export class CreateOrderDto {
  @ApiProperty({ type: OrderedProductDto })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderedProductDto)
  products: OrderedProductDto[];

  @ApiProperty({ type: AddressDto })
  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;

  @ApiProperty({ enum: BillingCurrency })
  @IsEnum(BillingCurrency)
  billingCurrency: BillingCurrency;

  @ApiProperty({ enum: PAYMENT_METHODS })
  @IsIn(PAYMENT_METHODS)
  paymentMethod: PaymentMethod;

  @ApiProperty({ enum: SHIPPING_METHODS })
  @IsIn(SHIPPING_METHODS)
  shippingMethod: ShippingMethod;
}
