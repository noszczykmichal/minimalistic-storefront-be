import {
  Controller,
  HttpCode,
  Res,
  UnauthorizedException,
  Post,
  Body,
  Req,
} from "@nestjs/common";
import type { CookieOptions, Request, Response } from "express";
import { CreateUserDto } from "@/user/dto/create-user.dto.js";
import { UserService } from "@/user/user.service.js";
import { CredentialsDto } from "@/auth/dto/credentials.dto.js";
import { AuthService } from "@/auth/auth.service.js";
import { REFRESH_TTL_MS, SESSION_COOKIE } from "./auth.constants.js";
import {
  ApiTags,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
} from "@nestjs/swagger";
import {
  LogoutResponseDto,
  SessionResponseDto,
} from "./dto/session-response.dto.js";

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly userService: UserService,
    private readonly authService: AuthService,
  ) {}

  @Post("login")
  @HttpCode(200)
  @ApiOkResponse({
    type: SessionResponseDto,
    description: "Sets the session cookie",
  })
  @ApiUnauthorizedResponse({ description: "Invalid email or password" })
  async login(
    @Body() credentialsDto: CredentialsDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user, accessTokenExpiresAt } =
      await this.authService.login(
        credentialsDto.email,
        credentialsDto.password,
      );

    res.cookie(SESSION_COOKIE, refreshToken, {
      ...cookieOptions,
      maxAge: REFRESH_TTL_MS,
    });

    return { accessToken, user, accessTokenExpiresAt };
  }

  @Post("refresh")
  @HttpCode(200)
  @ApiCookieAuth()
  @ApiOkResponse({
    type: SessionResponseDto,
    description: "Rotates the session cookie",
  })
  @ApiUnauthorizedResponse({ description: "Missing or invalid session cookie" })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) {
      throw new UnauthorizedException();
    }

    const { accessToken, refreshToken, user, accessTokenExpiresAt } =
      await this.authService.refresh(token);
    res.cookie(SESSION_COOKIE, refreshToken, {
      ...cookieOptions,
      maxAge: REFRESH_TTL_MS,
    });

    return { accessToken, user, accessTokenExpiresAt };
  }

  @Post("logout")
  @HttpCode(200)
  @ApiCookieAuth()
  @ApiOkResponse({
    type: LogoutResponseDto,
    description: "Clears the session cookie",
  })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) {
      await this.authService.logout(token);
    }
    res.clearCookie(SESSION_COOKIE, cookieOptions);

    return { message: "Logout" };
  }

  @Post("signup")
  @ApiCreatedResponse({ description: "User created" })
  async createUser(@Body() createUserDto: CreateUserDto) {
    await this.userService.create(createUserDto);
  }
}
