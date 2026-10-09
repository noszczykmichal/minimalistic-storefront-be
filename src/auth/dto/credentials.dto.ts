import { Transform } from "class-transformer";
import { IsEmail, IsNotEmpty, IsString } from "class-validator";

export class CredentialsDto {
  @IsEmail()
  @Transform(({ value }) =>
    typeof value === "string" ? value.toLowerCase().trim() : value,
  )
  email: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}
