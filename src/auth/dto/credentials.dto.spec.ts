import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { CredentialsDto } from "@/auth/dto/credentials.dto.js";

// Mirrors the global ValidationPipe options in main.ts.
const validateDto = async (plain: Record<string, unknown>) => {
  const dto = plainToInstance(CredentialsDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const constraints = Object.fromEntries(
    errors.map((error) => [error.property, error.constraints ?? {}]),
  );
  return { dto, errors, constraints };
};

const valid = { email: "jan@example.com", password: "anything" };

describe("CredentialsDto", () => {
  it("accepts a valid payload", async () => {
    const { errors } = await validateDto(valid);

    expect(errors).toEqual([]);
  });

  it("rejects unknown fields", async () => {
    const { constraints } = await validateDto({ ...valid, remember: true });

    expect(constraints.remember).toHaveProperty("whitelistValidation");
  });

  it.each(["email", "password"])("requires %s", async (field) => {
    const { [field as keyof typeof valid]: _, ...rest } = valid;

    const { constraints } = await validateDto(rest);

    expect(Object.keys(constraints)).toEqual([field]);
  });

  describe("email", () => {
    it("is trimmed and lowercased", async () => {
      const { dto, errors } = await validateDto({
        ...valid,
        email: "  JAN@Example.COM ",
      });

      expect(errors).toEqual([]);
      expect(dto.email).toBe("jan@example.com");
    });

    it.each(["not-an-email", "jan@", ""])("rejects %j", async (email) => {
      const { constraints } = await validateDto({ ...valid, email });

      expect(constraints.email).toHaveProperty("isEmail");
    });

    it("rejects a non-string value", async () => {
      const { constraints } = await validateDto({ ...valid, email: 123 });

      expect(constraints.email).toHaveProperty("isEmail");
    });

    it("rejects an email longer than 254 characters", async () => {
      const email = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}.com`;

      const { constraints } = await validateDto({ ...valid, email });

      expect(constraints.email).toHaveProperty("maxLength");
    });
  });

  describe("password", () => {
    it("does not enforce signup strength rules", async () => {
      // Login must accept whatever was set, so only presence and length matter.
      const { errors } = await validateDto({ ...valid, password: "a" });

      expect(errors).toEqual([]);
    });

    it("rejects an empty password", async () => {
      const { constraints } = await validateDto({ ...valid, password: "" });

      expect(constraints.password).toHaveProperty("isNotEmpty");
    });

    it("accepts exactly 72 characters", async () => {
      const { errors } = await validateDto({
        ...valid,
        password: "x".repeat(72),
      });

      expect(errors).toEqual([]);
    });

    it("rejects a password longer than 72 characters", async () => {
      const { constraints } = await validateDto({
        ...valid,
        password: "x".repeat(73),
      });

      expect(constraints.password).toHaveProperty("maxLength");
    });

    it("rejects a non-string value", async () => {
      const { constraints } = await validateDto({ ...valid, password: 123 });

      expect(constraints.password).toHaveProperty("isString");
    });
  });
});
