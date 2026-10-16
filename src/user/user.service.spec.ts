import { BadRequestException } from "@nestjs/common";
import bcrypt from "bcryptjs";

import { UserService } from "@/user/user.service.js";
import { Prisma } from "@/generated/prisma/client.js";
import { BCRYPT_ROUNDS } from "@/auth/auth.constants.js";

const dto = {
  firstName: "Jan",
  lastName: "Kowalski",
  email: "jan@example.com",
  password: "Secret1!",
};

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError("Prisma error", {
    code,
    clientVersion: "test",
  });

const createMocks = () => {
  const prisma = {
    user: {
      create: vi.fn(async ({ data }) => ({ id: "user-1", ...data })),
      findUnique: vi.fn(),
    },
  };
  const service = new UserService(prisma as any);

  return { service, prisma };
};

describe("UserService", () => {
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    mocks = createMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("create", () => {
    it("stores the user with a bcrypt hash instead of the plain password", async () => {
      await mocks.service.create(dto);

      expect(mocks.prisma.user.create).toHaveBeenCalledOnce();
      const { data } = mocks.prisma.user.create.mock.calls[0][0];
      expect(data).toEqual({
        firstName: "Jan",
        lastName: "Kowalski",
        email: "jan@example.com",
        passwordHash: expect.any(String),
      });
      expect(data).not.toHaveProperty("password");
      expect(data.passwordHash).not.toBe(dto.password);
      expect(bcrypt.getRounds(data.passwordHash)).toBe(BCRYPT_ROUNDS);
      await expect(
        bcrypt.compare(dto.password, data.passwordHash),
      ).resolves.toBe(true);
    });

    it("normalizes the email", async () => {
      await mocks.service.create({ ...dto, email: "  JAN@Example.COM " });

      const { data } = mocks.prisma.user.create.mock.calls[0][0];
      expect(data.email).toBe("jan@example.com");
    });

    it("returns the created user", async () => {
      const result = await mocks.service.create(dto);

      expect(result).toMatchObject({ id: "user-1", email: "jan@example.com" });
    });

    it("maps a unique-constraint violation to a generic 400", async () => {
      mocks.prisma.user.create.mockRejectedValue(prismaError("P2002"));

      await expect(mocks.service.create(dto)).rejects.toThrow(
        new BadRequestException("Unable to create account"),
      );
    });

    it("rethrows other Prisma errors unchanged", async () => {
      const error = prismaError("P2003");
      mocks.prisma.user.create.mockRejectedValue(error);

      await expect(mocks.service.create(dto)).rejects.toBe(error);
    });

    it("rethrows non-Prisma errors unchanged", async () => {
      const error = new Error("connection lost");
      mocks.prisma.user.create.mockRejectedValue(error);

      await expect(mocks.service.create(dto)).rejects.toBe(error);
    });
  });

  describe("findOneWithEmail", () => {
    it("explicitly selects passwordHash despite the global omit", async () => {
      await mocks.service.findOneWithEmail("jan@example.com");

      expect(mocks.prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: "jan@example.com" },
        select: { id: true, firstName: true, email: true, passwordHash: true },
      });
    });

    it("returns the user when found", async () => {
      const user = {
        id: "user-1",
        firstName: "Jan",
        email: "jan@example.com",
        passwordHash: "hash",
      };
      mocks.prisma.user.findUnique.mockResolvedValue(user);

      await expect(
        mocks.service.findOneWithEmail("jan@example.com"),
      ).resolves.toBe(user);
    });

    it("returns null when no user matches", async () => {
      mocks.prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        mocks.service.findOneWithEmail("nobody@example.com"),
      ).resolves.toBeNull();
    });
  });
});
