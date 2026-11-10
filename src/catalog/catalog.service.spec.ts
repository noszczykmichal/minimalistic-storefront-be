import { Logger, ServiceUnavailableException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { CatalogService, PRODUCTS_QUERY } from "./catalog.service.js";
import type { CatalogProduct } from "./catalog.types.js";

const CATALOG_URL = "http://catalog.test/graphql";

const product = (id: string): CatalogProduct =>
  ({
    id,
    name: `Product ${id}`,
    inStock: true,
    attributes: [],
    prices: [{ amount: 10, currency: { label: "USD", symbol: "$" } }],
  }) as CatalogProduct;

const PRODUCTS = [product("a"), product("b"), product("c")];

const jsonResponse = (
  body: unknown,
  init: { ok?: boolean; status?: number } = {},
) =>
  ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: vi.fn().mockResolvedValue(body),
  }) as unknown as Response;

const productsResponse = (products: CatalogProduct[]) =>
  jsonResponse({ data: { category: { products } } });

describe("CatalogService", () => {
  let service: CatalogService;
  let config: { getOrThrow: ReturnType<typeof vi.fn> };
  let fetchMock: ReturnType<typeof vi.fn>;
  let loggerError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    config = { getOrThrow: vi.fn().mockReturnValue(CATALOG_URL) };
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    loggerError = vi
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    service = new CatalogService(config as unknown as ConfigService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("getProductsByIds", () => {
    it("POSTs the products query to the configured catalog URL", async () => {
      fetchMock.mockResolvedValue(productsResponse(PRODUCTS));

      await service.getProductsByIds(["a"]);

      expect(config.getOrThrow).toHaveBeenCalledWith("CATALOG_API_URL");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(CATALOG_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: PRODUCTS_QUERY }),
        signal: expect.any(AbortSignal),
      });
    });

    it("returns only the products with the requested ids", async () => {
      fetchMock.mockResolvedValue(productsResponse(PRODUCTS));

      await expect(service.getProductsByIds(["c", "a"])).resolves.toEqual([
        PRODUCTS[0],
        PRODUCTS[2],
      ]);
    });

    it("ignores ids that are not in the catalog", async () => {
      fetchMock.mockResolvedValue(productsResponse(PRODUCTS));

      await expect(service.getProductsByIds(["b", "missing"])).resolves.toEqual(
        [PRODUCTS[1]],
      );
    });

    it("returns an empty array when no ids match", async () => {
      fetchMock.mockResolvedValue(productsResponse(PRODUCTS));

      await expect(service.getProductsByIds(["missing"])).resolves.toEqual([]);
    });

    it("returns an empty array for an empty id list", async () => {
      fetchMock.mockResolvedValue(productsResponse(PRODUCTS));

      await expect(service.getProductsByIds([])).resolves.toEqual([]);
    });
  });

  describe("when the request fails", () => {
    const expectUnavailable = async () => {
      const promise = service.getProductsByIds(["a"]);
      await expect(promise).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(promise).rejects.toThrow("Catalog unavailable");
      expect(loggerError).toHaveBeenCalledWith(
        "Catalog request failed",
        expect.any(Error),
      );
    };

    it("throws 503 on a network error", async () => {
      fetchMock.mockRejectedValue(new TypeError("fetch failed"));

      await expectUnavailable();
    });

    it("throws 503 on a timeout", async () => {
      fetchMock.mockRejectedValue(
        new DOMException("The operation was aborted", "TimeoutError"),
      );

      await expectUnavailable();
    });

    it("throws 503 on a non-2xx response", async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, { ok: false, status: 500 }));

      await expectUnavailable();
    });

    it("throws 503 when the body is not valid JSON", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected token")),
      } as unknown as Response);

      await expectUnavailable();
    });

    it("throws 503 without calling fetch when CATALOG_API_URL is not set", async () => {
      config.getOrThrow.mockImplementation(() => {
        throw new TypeError(
          'Configuration key "CATALOG_API_URL" does not exist',
        );
      });

      await expectUnavailable();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("when the query fails", () => {
    const expectQueryFailed = async () => {
      const promise = service.getProductsByIds(["a"]);
      await expect(promise).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(promise).rejects.toThrow("Catalog query failed");
    };

    it("throws 503 when the response contains GraphQL errors", async () => {
      const errors = [{ message: "Cannot query field" }];
      fetchMock.mockResolvedValue(jsonResponse({ errors }));

      await expectQueryFailed();
      expect(loggerError).toHaveBeenCalledWith("Catalog query errors", errors);
    });

    it("throws 503 on errors even when partial data is returned", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          data: { category: { products: PRODUCTS } },
          errors: [{ message: "partial failure" }],
        }),
      );

      await expectQueryFailed();
    });

    it("throws 503 when the response has no data", async () => {
      fetchMock.mockResolvedValue(jsonResponse({}));

      await expectQueryFailed();
    });
  });
});
