import { CatalogService } from "@/catalog/catalog.service.js";
import { CreateOrderDto } from "./dto/orders.dto.js";
import { Injectable, BadRequestException } from "@nestjs/common";
import { toMinorUnits } from "@/checkout/checkout.constants.js";
import { PrismaService } from "@/prisma/prisma.service.js";
import { Prisma } from "@/generated/prisma/client.js";

@Injectable()
export class OrdersService {
  constructor(
    private readonly catalog: CatalogService,
    private prisma: PrismaService,
  ) {}

  async createOrder(userId: string, orderDto: CreateOrderDto) {
    const ids = orderDto.products.map((product) => product.productId);
    const productsFromCatalog = await this.catalog.getProductsByIds(ids);
    const orderItems: Prisma.OrderItemCreateWithoutOrderInput[] = [];

    const missingIds: string[] = [];
    const invalidOptionIds: string[] = [];
    const unavailableIds: string[] = [];
    const unavailableInBillingCurrency: string[] = [];

    for (const ordered of orderDto.products) {
      const product = productsFromCatalog.find(
        (p) => p.id === ordered.productId,
      );

      if (!product) {
        missingIds.push(ordered.productId);
        continue;
      }

      const selectedAreValid = ordered.attributes.every((attr) =>
        product.attributes.some(
          (a) =>
            a.name === attr.name && a.items.some((i) => i.value === attr.value),
        ),
      );

      const allAreSelected = product.attributes.every((a) =>
        ordered.attributes.some((attr) => attr.name === a.name),
      );

      if (!selectedAreValid || !allAreSelected) {
        invalidOptionIds.push(ordered.productId);
      }

      if (!product.inStock) {
        unavailableIds.push(ordered.productId);
      }

      const price = product.prices.find(
        (c) => c.currency.label === orderDto.billingCurrency,
      );

      if (!price) {
        unavailableInBillingCurrency.push(ordered.productId);
        continue;
      }

      orderItems.push({
        productId: product.id,
        quantity: ordered.quantity,
        attributes: ordered.attributes.map(({ name, value }) => ({
          name,
          value,
        })),
        unitPrice: toMinorUnits(price.amount, orderDto.billingCurrency),
      });
    }

    if (missingIds.length > 0) {
      throw new BadRequestException({
        code: "PRODUCT_NOT_AVAILABLE",
        message: "Some products are no longer available",
        productIds: missingIds,
      });
    }

    if (unavailableIds.length > 0) {
      throw new BadRequestException({
        code: "OUT_OF_STOCK",
        message: "Some of requested products are unavailable for purchase",
        productIds: unavailableIds,
      });
    }

    if (invalidOptionIds.length > 0) {
      throw new BadRequestException({
        code: "NOT_ALLOWED_OPTIONS",
        message: "Some products are not available with requested options",
        productIds: invalidOptionIds,
      });
    }

    if (unavailableInBillingCurrency.length > 0) {
      throw new BadRequestException({
        code: "UNAVAILABLE_BILLING_CURRENCY",
        message:
          "Some of requested products are unavailable in requested billing currency",
        productIds: unavailableInBillingCurrency,
      });
    }

    const totalPrice = orderItems.reduce(
      (acc, currentVal) => acc + currentVal.quantity * currentVal.unitPrice,
      0,
    );

    const order = await this.prisma.order.create({
      data: {
        userId,
        totalAmount: totalPrice,
        currency: orderDto.billingCurrency,
        items: { create: orderItems },
      },
    });

    return { id: order.id, message: "Order created" };
  }
}
