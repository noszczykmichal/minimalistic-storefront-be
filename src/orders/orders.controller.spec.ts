import { GUARDS_METADATA } from "@nestjs/common/constants.js";
import { JwtGuard } from "@/auth/guards/jwt-auth.guard.js";
import { OrdersController } from "./orders.controller.js";
import type { OrdersService } from "./orders.service.js";
import type { CreateOrderDto } from "./dto/orders.dto.js";

const USER = { userId: "user-1", email: "user@example.com" };

const createOrderDto = {
  products: [{ productId: "p-1", quantity: 2, attributes: [] }],
  address: {
    firstName: "Jan",
    lastName: "Kowalski",
    addressLine1: "Main St 1",
    city: "Warsaw",
    postalCode: "00-001",
    country: "PL",
    phone: "+48123456789",
    email: "user@example.com",
  },
  billingCurrency: "USD",
  paymentMethod: "card",
  shippingMethod: "standard",
} as unknown as CreateOrderDto;

type Request = Parameters<OrdersController["create"]>[0];
const createRequest = () => ({ user: USER }) as unknown as Request;

describe("OrdersController", () => {
  let controller: OrdersController;
  let ordersService: { createOrder: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    ordersService = { createOrder: vi.fn() };
    controller = new OrdersController(
      ordersService as unknown as OrdersService,
    );
  });

  describe("create", () => {
    it("is protected by JwtGuard", () => {
      // Nest stores method guards on the handler function itself.
      const handler = Object.getOwnPropertyDescriptor(
        OrdersController.prototype,
        "create",
      )?.value as object;
      const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, handler);

      expect(guards).toEqual([JwtGuard]);
    });

    it("creates the order for the authenticated user", async () => {
      ordersService.createOrder.mockResolvedValue({ id: "order-1" });

      await controller.create(createRequest(), createOrderDto);

      expect(ordersService.createOrder).toHaveBeenCalledTimes(1);
      expect(ordersService.createOrder).toHaveBeenCalledWith(
        USER.userId,
        createOrderDto,
      );
    });

    it("returns the created order", async () => {
      const order = { id: "order-1" };
      ordersService.createOrder.mockResolvedValue(order);

      await expect(
        controller.create(createRequest(), createOrderDto),
      ).resolves.toBe(order);
    });

    it("propagates errors from the service", async () => {
      const error = new Error("Catalog unavailable");
      ordersService.createOrder.mockRejectedValue(error);

      await expect(
        controller.create(createRequest(), createOrderDto),
      ).rejects.toBe(error);
    });
  });
});
