import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { CreateUserDto } from "@/user/dto/create-user.dto.js";

// Mirrors the global ValidationPipe options in main.ts.
const validateDto = async (plain: Record<string, unknown>) => {
  const dto = plainToInstance(CreateUserDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const constraints = Object.fromEntries(
    errors.map((error) => [error.property, error.constraints ?? {}]),
  );
  return { dto, errors, constraints };
};

const valid = {
  firstName: "Jan",
  lastName: "Kowalski",
  email: "jan@example.com",
  password: "Secret1!",
};

describe("CreateUserDto", () => {
  it("accepts a valid payload", async () => {
    const { errors } = await validateDto(valid);

    expect(errors).toEqual([]);
  });

  it("rejects unknown fields", async () => {
    const { constraints } = await validateDto({ ...valid, role: "admin" });

    expect(constraints.role).toHaveProperty("whitelistValidation");
  });

  it.each(["firstName", "lastName", "email", "password"])(
    "requires %s",
    async (field) => {
      const { [field as keyof typeof valid]: _, ...rest } = valid;

      const { constraints } = await validateDto(rest);

      expect(Object.keys(constraints)).toEqual([field]);
    },
  );

  describe.each(["firstName", "lastName"] as const)("%s", (field) => {
    it("is trimmed", async () => {
      const { dto, errors } = await validateDto({
        ...valid,
        [field]: "  Jan  ",
      });

      expect(errors).toEqual([]);
      expect(dto[field]).toBe("Jan");
    });

    it.each([
      ["empty", ""],
      ["whitespace only", "   "],
      ["longer than 50 characters", "a".repeat(51)],
    ])("rejects a value that is %s", async (_, value) => {
      const { constraints } = await validateDto({ ...valid, [field]: value });

      expect(constraints[field]).toHaveProperty("isLength");
    });

    it("accepts exactly 50 characters", async () => {
      const { errors } = await validateDto({
        ...valid,
        [field]: "a".repeat(50),
      });

      expect(errors).toEqual([]);
    });

    it("rejects a non-string value", async () => {
      const { constraints } = await validateDto({ ...valid, [field]: 123 });

      expect(constraints[field]).toHaveProperty("isString");
    });
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

    it.each(["not-an-email", "jan@", "@example.com", ""])(
      "rejects %j",
      async (email) => {
        const { constraints } = await validateDto({ ...valid, email });

        expect(constraints.email).toHaveProperty("isEmail");
      },
    );

    it("rejects a non-string value", async () => {
      const { constraints } = await validateDto({ ...valid, email: 123 });

      expect(constraints.email).toHaveProperty("isEmail");
    });

    it("rejects an email longer than 254 characters", async () => {
      // Local part and domain labels stay within their own limits, so only the total length fails.
      const email = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}.com`;
      expect(email).toHaveLength(258);

      const { constraints } = await validateDto({ ...valid, email });

      expect(constraints.email).toHaveProperty("maxLength");
    });
  });

  describe("password", () => {
    it.each([
      ["only the minimum length", "Abc1!x"],
      ["no lowercase letters", "SECRET1!"],
      ["exactly 72 characters", `Aa1!${"x".repeat(68)}`],
    ])("accepts a password with %s", async (_, password) => {
      const { errors } = await validateDto({ ...valid, password });

      expect(errors).toEqual([]);
    });

    it("rejects a password shorter than 6 characters", async () => {
      const { constraints } = await validateDto({
        ...valid,
        password: "Ab1!x",
      });

      expect(constraints.password).toEqual(
        expect.objectContaining({
          minLength: "Password must be at least 6 characters.",
        }),
      );
    });

    it("rejects a password longer than 72 characters", async () => {
      const { constraints } = await validateDto({
        ...valid,
        password: `Aa1!${"x".repeat(69)}`,
      });

      expect(constraints.password).toHaveProperty("maxLength");
    });

    it.each([
      ["an uppercase letter", "secret1!"],
      ["a number", "Secret!!"],
      ["a special character", "Secret11"],
    ])("rejects a password without %s", async (_, password) => {
      const { constraints } = await validateDto({ ...valid, password });

      expect(constraints.password).toEqual({
        isStrongPassword:
          "Password must include an uppercase letter, a number and a special character.",
      });
    });

    it("is not trimmed", async () => {
      const { dto } = await validateDto({ ...valid, password: " Secret1! " });

      expect(dto.password).toBe(" Secret1! ");
    });

    it("rejects a non-string value", async () => {
      const { constraints } = await validateDto({ ...valid, password: 123456 });

      expect(constraints.password).toHaveProperty("isString");
    });
  });
});
