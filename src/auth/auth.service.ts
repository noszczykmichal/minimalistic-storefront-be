import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcryptjs";

import { UserService } from "@/user/user.service.js";
import { BCRYPT_ROUNDS } from "./auth.constants.js";

const DUMMY_HASH = bcrypt.hashSync("dummy-password", BCRYPT_ROUNDS);

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) {}
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

    const payload = { sub: user.id, email: user.email };

    return {
      accessToken: await this.jwtService.signAsync(payload),
    };
  }
}
