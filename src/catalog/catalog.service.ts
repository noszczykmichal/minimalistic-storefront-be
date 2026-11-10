import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CatalogProduct } from "./catalog.types.js";

export const PRODUCTS_QUERY = `
  query Products {
    category(input: { title: "all" }) {
      products {
        id
        name
        inStock
        attributes {
          name
          items { value }
        }
        prices {
          amount
          currency { label symbol }
        }
      }
    }
  }
`;

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(private config: ConfigService) {}

  private async query<T>(query: string): Promise<T> {
    let json: { data?: T; errors?: unknown[] };

    try {
      const res = await fetch(
        this.config.getOrThrow<string>("CATALOG_API_URL"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
          signal: AbortSignal.timeout(5_000),
        },
      );

      if (!res.ok) {
        throw new Error(`Catalog responded with ${res.status}`);
      }

      json = await res.json();
    } catch (error) {
      this.logger.error("Catalog request failed", error);
      throw new ServiceUnavailableException("Catalog unavailable");
    }

    if (json.errors || !json.data) {
      this.logger.error("Catalog query errors", json.errors);
      throw new ServiceUnavailableException("Catalog query failed");
    }

    return json.data;
  }

  async getProductsByIds(ids: string[]): Promise<CatalogProduct[]> {
    const data = await this.query<{ category: { products: CatalogProduct[] } }>(
      PRODUCTS_QUERY,
    );

    return data.category.products.filter((p) => ids.includes(p.id));
  }
}
