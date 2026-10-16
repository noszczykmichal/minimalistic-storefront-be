import { randomBytes, createHash } from "node:crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcryptjs";

import { UserService } from "@/user/user.service.js";
import {
  BCRYPT_ROUNDS,
  REFRESH_TTL_MS,
  ACCESS_TOKEN_TTL_SECONDS,
} from "@/auth/auth.constants.js";
import { PrismaService } from "@/prisma/prisma.service.js";
import type { Prisma } from "@/generated/prisma/client.js";

const DUMMY_HASH = bcrypt.hashSync("dummy-password", BCRYPT_ROUNDS);

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  private async createSession(
    userId: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const refreshToken = randomBytes(32).toString("base64url");

    await db.session.create({
      data: {
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });

    return refreshToken;
  }

  async login(email: string, password: string) {
    const user = await this.userService.findOneWithEmail(
      email.toLowerCase().trim(),
    );
    const passwordOk = await bcrypt.compare(
      password,
      user?.passwordHash ?? DUMMY_HASH,
    );

    if (!user || !passwordOk) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
    });
    const refreshToken = await this.createSession(user.id);

    return {
      accessToken,
      refreshToken,
      user: { firstName: user.firstName, email: user.email },
      accessTokenExpiresAt: Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000,
    };
  }

  async refresh(refreshToken: string) {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: { select: { id: true, firstName: true, email: true } } },
    });

    if (!session) {
      throw new UnauthorizedException();
    }

    if (session.expiresAt < new Date()) {
      await this.prisma.session.deleteMany({ where: { id: session.id } });
      throw new UnauthorizedException();
    }

    const newRefreshToken = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.session.deleteMany({
        where: { id: session.id },
      });

      if (count === 0) {
        throw new UnauthorizedException();
      }

      return this.createSession(session.userId, tx);
    });

    const accessToken = await this.jwtService.signAsync({
      sub: session.user.id,
      email: session.user.email,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: { firstName: session.user.firstName, email: session.user.email },
      accessTokenExpiresAt: Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000,
    };
  }

  async logout(refreshToken: string) {
    await this.prisma.session.deleteMany({
      where: { tokenHash: hashToken(refreshToken) },
    });
  }
}
