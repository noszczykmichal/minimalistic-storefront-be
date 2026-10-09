import { Controller } from "@nestjs/common";
import { Post, Body } from "@nestjs/common";
import { CreateUserDto } from "@/user/dto/create-user.dto.js";
import { UserService } from "@/user/user.service.js";
import { CredentialsDto } from "@/auth/dto/credentials.dto.js";
import { AuthService } from "@/auth/auth.service.js";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly userService: UserService,
    private readonly authService: AuthService,
  ) {}

  @Post("login")
  async login(@Body() credentialsDto: CredentialsDto) {
    return await this.authService.login(
      credentialsDto.email,
      credentialsDto.password,
    );
  }

  @Post("signup")
  async createUser(@Body() createUserDto: CreateUserDto) {
    await this.userService.create(createUserDto);
  }
}
