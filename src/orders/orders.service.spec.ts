import { BadRequestException } from "@nestjs/common";
import type { CatalogService } from "@/catalog/catalog.service.js";
import type { CatalogProduct } from "@/catalog/catalog.types.js";
import type { PrismaService } from "@/prisma/prisma.service.js";
import type { BillingCurrency } from "@/generated/prisma/enums.js";
import { OrdersService } from "./orders.service.js";
import type { CreateOrderDto, OrderedProductDto } from "./dto/orders.dto.js";

const USER_ID = "user-1";

const SIZE = { name: "Size", items: [{ value: "S" }, { value: "M" }] };
const COLOR = { name: "Color", items: [{ value: "Red" }, { value: "Blue" }] };

const catalogProduct = (
  id: string,
  overrides: Partial<CatalogProduct> = {},
): CatalogProduct =>
  ({
    id,
    name: `Product ${id}`,
    inStock: true,
    attributes: [],
    prices: [
      { amount: 19.99, currency: { label: "USD", symbol: "$" } },
      { amount: 2000, currency: { label: "JPY", symbol: "¥" } },
    ],
    ...overrides,
  }) as CatalogProduct;

const ordered = (
  productId: string,
  overrides: Partial<OrderedProductDto> = {},
): OrderedProductDto => ({
  productId,
  quantity: 1,
  attributes: [],
  ...overrides,
});

const orderDto = (
  products: OrderedProductDto[],
  billingCurrency: BillingCurrency = "USD",
) =>
  ({
    products,
    billingCurrency,
    address: {},
    paymentMethod: "card",
    shippingMethod: "standard",
  }) as unknown as CreateOrderDto;

/** Runs createOrder and returns the BadRequestException's response body. */
const rejectionOf = async (promise: Promise<unknown>) => {
  const error: unknown = await promise.then(
    () => {
      throw new Error("Expected createOrder to reject");
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(BadRequestException);
  return (error as BadRequestException).getResponse();
};

describe("OrdersService", () => {
  let service: OrdersService;
  let catalog: { getProductsByIds: ReturnType<typeof vi.fn> };
  let prisma: { order: { create: ReturnType<typeof vi.fn> } };

  const givenCatalog = (...products: CatalogProduct[]) =>
    catalog.getProductsByIds.mockResolvedValue(products);

  const createdOrderData = () =>
    (prisma.order.create.mock.calls[0][0] as { data: Record<string, unknown> })
      .data;

  beforeEach(() => {
    catalog = { getProductsByIds: vi.fn().mockResolvedValue([]) };
    prisma = {
      order: { create: vi.fn().mockResolvedValue({ id: "order-1" }) },
    };
    service = new OrdersService(
      catalog as unknown as CatalogService,
      prisma as unknown as PrismaService,
    );
  });

  describe("createOrder", () => {
    describe("success", () => {
      it("looks up all ordered products in the catalog", async () => {
        givenCatalog(catalogProduct("a"), catalogProduct("b"));

        await service.createOrder(
          USER_ID,
          orderDto([ordered("a"), ordered("b")]),
        );

        expect(catalog.getProductsByIds).toHaveBeenCalledWith(["a", "b"]);
      });

      it("returns the created order's id", async () => {
        givenCatalog(catalogProduct("a"));

        await expect(
          service.createOrder(USER_ID, orderDto([ordered("a")])),
        ).resolves.toEqual({ id: "order-1", message: "Order created" });
      });

      it("stores the order for the user with items priced in minor units", async () => {
        givenCatalog(
          catalogProduct("a", { attributes: [SIZE] }),
          catalogProduct("b", {
            prices: [{ amount: 5.5, currency: { label: "USD", symbol: "$" } }],
          }),
        );

        await service.createOrder(
          USER_ID,
          orderDto([
            ordered("a", {
              quantity: 2,
              attributes: [{ name: "Size", value: "M" }],
            }),
            ordered("b", { quantity: 3 }),
          ]),
        );

        expect(prisma.order.create).toHaveBeenCalledTimes(1);
        expect(prisma.order.create).toHaveBeenCalledWith({
          data: {
            userId: USER_ID,
            // 2 × 1999 + 3 × 550
            totalAmount: 5648,
            currency: "USD",
            items: {
              create: [
                {
                  productId: "a",
                  quantity: 2,
                  attributes: [{ name: "Size", value: "M" }],
                  unitPrice: 1999,
                },
                {
                  productId: "b",
                  quantity: 3,
                  attributes: [],
                  unitPrice: 550,
                },
              ],
            },
          },
        });
      });

      it("uses the price in the billing currency", async () => {
        givenCatalog(catalogProduct("a"));

        await service.createOrder(
          USER_ID,
          orderDto([ordered("a", { quantity: 2 })], "JPY"),
        );

        expect(createdOrderData()).toMatchObject({
          currency: "JPY",
          // JPY has no minor units: 2 × 2000
          totalAmount: 4000,
          items: { create: [expect.objectContaining({ unitPrice: 2000 })] },
        });
      });

      it("rounds floating-point prices to whole minor units", async () => {
        givenCatalog(
          catalogProduct("a", {
            // 1.005 * 100 = 100.49999999999999 in floating point, so it rounds to 100
            prices: [
              { amount: 1.005, currency: { label: "USD", symbol: "$" } },
            ],
          }),
        );

        await service.createOrder(
          USER_ID,
          orderDto([ordered("a", { quantity: 3 })]),
        );

        const data = createdOrderData();
        expect(Number.isInteger(data.totalAmount)).toBe(true);
        expect(data).toMatchObject({
          totalAmount: 300,
          items: { create: [expect.objectContaining({ unitPrice: 100 })] },
        });
      });

      it("accepts a product with all required attributes selected", async () => {
        givenCatalog(catalogProduct("a", { attributes: [SIZE, COLOR] }));

        await service.createOrder(
          USER_ID,
          orderDto([
            ordered("a", {
              attributes: [
                { name: "Color", value: "Blue" },
                { name: "Size", value: "S" },
              ],
            }),
          ]),
        );

        expect(prisma.order.create).toHaveBeenCalledTimes(1);
      });

      it("stores only the attribute name and value", async () => {
        givenCatalog(catalogProduct("a", { attributes: [SIZE] }));
        const attribute = { name: "Size", value: "S", extra: "ignored" };

        await service.createOrder(
          USER_ID,
          orderDto([ordered("a", { attributes: [attribute] })]),
        );

        expect(createdOrderData()).toMatchObject({
          items: {
            create: [
              expect.objectContaining({
                attributes: [{ name: "Size", value: "S" }],
              }),
            ],
          },
        });
      });

      it("stores the same product ordered twice as separate items", async () => {
        givenCatalog(catalogProduct("a", { attributes: [SIZE] }));

        await service.createOrder(
          USER_ID,
          orderDto([
            ordered("a", { attributes: [{ name: "Size", value: "S" }] }),
            ordered("a", { attributes: [{ name: "Size", value: "M" }] }),
          ]),
        );

        expect(createdOrderData()).toMatchObject({
          totalAmount: 3998,
          items: {
            create: [
              expect.objectContaining({ productId: "a" }),
              expect.objectContaining({ productId: "a" }),
            ],
          },
        });
      });
    });

    describe("PRODUCT_NOT_AVAILABLE", () => {
      it("rejects products missing from the catalog", async () => {
        givenCatalog(catalogProduct("a"));

        await expect(
          rejectionOf(
            service.createOrder(
              USER_ID,
              orderDto([ordered("a"), ordered("gone"), ordered("also-gone")]),
            ),
          ),
        ).resolves.toEqual({
          code: "PRODUCT_NOT_AVAILABLE",
          message: "Some products are no longer available",
          productIds: ["gone", "also-gone"],
        });
      });
    });

    describe("OUT_OF_STOCK", () => {
      it("rejects products that are not in stock", async () => {
        givenCatalog(
          catalogProduct("a", { inStock: false }),
          catalogProduct("b"),
          catalogProduct("c", { inStock: false }),
        );

        await expect(
          rejectionOf(
            service.createOrder(
              USER_ID,
              orderDto([ordered("a"), ordered("b"), ordered("c")]),
            ),
          ),
        ).resolves.toEqual({
          code: "OUT_OF_STOCK",
          message: "Some of requested products are unavailable for purchase",
          productIds: ["a", "c"],
        });
      });
    });

    describe("NOT_ALLOWED_OPTIONS", () => {
      const expectNotAllowed = async (
        attributes: OrderedProductDto["attributes"],
      ) => {
        givenCatalog(catalogProduct("a", { attributes: [SIZE, COLOR] }));

        await expect(
          rejectionOf(
            service.createOrder(
              USER_ID,
              orderDto([ordered("a", { attributes })]),
            ),
          ),
        ).resolves.toEqual({
          code: "NOT_ALLOWED_OPTIONS",
          message: "Some products are not available with requested options",
          productIds: ["a"],
        });
      };

      it("rejects a value the attribute does not offer", () =>
        expectNotAllowed([
          { name: "Size", value: "XXL" },
          { name: "Color", value: "Red" },
        ]));

      it("rejects an attribute the product does not have", () =>
        expectNotAllowed([
          { name: "Size", value: "S" },
          { name: "Color", value: "Red" },
          { name: "Material", value: "Wool" },
        ]));

      it("rejects a value that belongs to a different attribute", () =>
        expectNotAllowed([
          { name: "Size", value: "Red" },
          { name: "Color", value: "S" },
        ]));

      it("rejects when a required attribute is not selected", () =>
        expectNotAllowed([{ name: "Size", value: "S" }]));

      it("rejects when no attributes are selected", () => expectNotAllowed([]));

      it("rejects attributes on a product that has none", async () => {
        givenCatalog(catalogProduct("a"));

        await expect(
          rejectionOf(
            service.createOrder(
              USER_ID,
              orderDto([
                ordered("a", { attributes: [{ name: "Size", value: "S" }] }),
              ]),
            ),
          ),
        ).resolves.toMatchObject({ code: "NOT_ALLOWED_OPTIONS" });
      });

      it("matches attribute names and values case-sensitively", () =>
        expectNotAllowed([
          { name: "size", value: "S" },
          { name: "Color", value: "red" },
        ]));
    });

    describe("UNAVAILABLE_BILLING_CURRENCY", () => {
      it("rejects products without a price in the billing currency", async () => {
        givenCatalog(catalogProduct("a"), catalogProduct("b"));

        await expect(
          rejectionOf(
            service.createOrder(
              USER_ID,
              orderDto([ordered("a"), ordered("b")], "GBP"),
            ),
          ),
        ).resolves.toEqual({
          code: "UNAVAILABLE_BILLING_CURRENCY",
          message:
            "Some of requested products are unavailable in requested billing currency",
          productIds: ["a", "b"],
        });
      });
    });

    describe("error precedence", () => {
      // "gone" is missing; "a" is out of stock, has an invalid option and no
      // GBP price; "b" has only an invalid option and no GBP price; "c" has
      // only no GBP price.
      const products = () => [
        catalogProduct("a", { inStock: false, attributes: [SIZE] }),
        catalogProduct("b", { attributes: [SIZE] }),
        catalogProduct("c"),
      ];
      const items = [ordered("gone"), ordered("a"), ordered("b"), ordered("c")];

      const codeFor = async (orderedItems: OrderedProductDto[]) => {
        givenCatalog(...products());
        const body = await rejectionOf(
          service.createOrder(USER_ID, orderDto(orderedItems, "GBP")),
        );
        return body as { code: string; productIds: string[] };
      };

      it("reports missing products first", async () => {
        await expect(codeFor(items)).resolves.toMatchObject({
          code: "PRODUCT_NOT_AVAILABLE",
          productIds: ["gone"],
        });
      });

      it("then out-of-stock products", async () => {
        await expect(codeFor(items.slice(1))).resolves.toMatchObject({
          code: "OUT_OF_STOCK",
          productIds: ["a"],
        });
      });

      it("then invalid options", async () => {
        await expect(codeFor(items.slice(2))).resolves.toMatchObject({
          code: "NOT_ALLOWED_OPTIONS",
          productIds: ["b"],
        });
      });

      it("then the billing currency", async () => {
        await expect(codeFor(items.slice(3))).resolves.toMatchObject({
          code: "UNAVAILABLE_BILLING_CURRENCY",
          productIds: ["c"],
        });
      });
    });

    describe("on rejection", () => {
      it("does not store the order", async () => {
        givenCatalog(
          catalogProduct("a"),
          catalogProduct("b", { inStock: false }),
        );

        await expect(
          service.createOrder(USER_ID, orderDto([ordered("a"), ordered("b")])),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.order.create).not.toHaveBeenCalled();
      });
    });

    describe("dependency failures", () => {
      it("propagates catalog errors without storing anything", async () => {
        const error = new Error("Catalog unavailable");
        catalog.getProductsByIds.mockRejectedValue(error);

        await expect(
          service.createOrder(USER_ID, orderDto([ordered("a")])),
        ).rejects.toBe(error);
        expect(prisma.order.create).not.toHaveBeenCalled();
      });

      it("propagates database errors", async () => {
        givenCatalog(catalogProduct("a"));
        const error = new Error("connection lost");
        prisma.order.create.mockRejectedValue(error);

        await expect(
          service.createOrder(USER_ID, orderDto([ordered("a")])),
        ).rejects.toBe(error);
      });
    });
  });
});
