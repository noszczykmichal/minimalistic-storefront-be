import { Controller, Get } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiOkResponse } from "@nestjs/swagger";

import {
  shippingOptions,
  paymentOptions,
} from "@/checkout/checkout.constants.js";
import { CheckoutOptionsDto } from "@/checkout/dto/checkout-options.dto.js";

@ApiTags("checkout")
@Controller("checkout")
export class CheckoutController {
  @Get("options")
  @ApiOperation({
    summary: "Available shipping and payment options with costs",
  })
  @ApiOkResponse({ type: CheckoutOptionsDto })
  async shippingAndPaymentOptions() {
    return { shippingOptions, paymentOptions };
  }
}
