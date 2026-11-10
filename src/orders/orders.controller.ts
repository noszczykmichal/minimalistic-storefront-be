import { JwtGuard } from "@/auth/guards/jwt-auth.guard.js";
import { Controller, Post, UseGuards, Req, Body } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { OrdersService } from "./orders.service.js";
import { CreateOrderDto } from "./dto/orders.dto.js";

type AuthUser = { userId: string; email: string };

@ApiTags("orders")
@ApiBearerAuth()
@Controller("orders")
export class OrdersController {
  constructor(private readonly orderService: OrdersService) {}

  @UseGuards(JwtGuard)
  @Post()
  async create(
    @Req() req: Request & { user: AuthUser },
    @Body() createOrderDto: CreateOrderDto,
  ) {
    return this.orderService.createOrder(req.user.userId, createOrderDto);
  }
}
