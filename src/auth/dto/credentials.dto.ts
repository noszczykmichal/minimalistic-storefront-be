import { Transform } from "class-transformer";
import { IsEmail, IsNotEmpty, IsString, MaxLength } from "class-validator";

export class CredentialsDto {
  @IsEmail()
  @Transform(({ value }) =>
    typeof value === "string" ? value.toLowerCase().trim() : value,
  )
  @MaxLength(254)
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password!: string;
}
