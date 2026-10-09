import { Transform } from "class-transformer";
import {
  IsEmail,
  IsString,
  Length,
  MinLength,
  MaxLength,
  IsStrongPassword,
} from "class-validator";

export class CreateUserDto {
  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @Length(1, 50)
  firstName: string;

  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @Length(1, 50)
  lastName: string;

  @IsEmail()
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(6, { message: "Password must be at least 6 characters." })
  @MaxLength(72)
  @IsStrongPassword(
    {
      minLength: 0,
      minLowercase: 0,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 1,
    },
    {
      message:
        "Password must include an uppercase letter, a number and a special character.",
    },
  )
  password: string;
}
