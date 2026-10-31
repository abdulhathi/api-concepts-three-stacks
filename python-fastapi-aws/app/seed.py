"""The 25 seed products from the spec; createdAt = 2026-01-01T00:00Z plus (n - 1) minutes."""

from datetime import UTC, datetime, timedelta

from app.models.products import Product

_SEED_START = datetime(2026, 1, 1, tzinfo=UTC)

_ROWS: list[tuple[str, str, int, list[str]]] = [
    ("HTTP from the Ground Up", "Maya Chen", 3499, ["http", "basics"]),
    ("Designing Resource APIs", "Luis Ortega", 4299, ["rest", "design"]),
    ("JSON in Practice", "Priya Raman", 2599, ["json", "basics"]),
    ("Tokens and Trust", "Samuel Okafor", 3999, ["security", "auth"]),
    ("OAuth Without Tears", "Hana Suzuki", 4499, ["security", "oauth"]),
    ("The GraphQL Field Guide", "Noah Fischer", 3799, ["graphql"]),
    ("Caching at the Edge", "Amira Haddad", 3299, ["caching", "performance"]),
    ("Rate Limits in Real Life", "Diego Alvarez", 2899, ["reliability"]),
    ("Retry, Back Off, Recover", "Grace Kim", 3199, ["reliability"]),
    ("Webhooks That Work", "Omar Siddiqui", 2999, ["webhooks", "events"]),
    ("Errors Worth Reading", "Elena Petrova", 2499, ["errors", "design"]),
    ("Pagination Patterns", "Kwame Mensah", 2199, ["design", "performance"]),
    ("Idempotent by Design", "Sofia Rossi", 3599, ["reliability", "design"]),
    ("Schemas First", "Ravi Patel", 3399, ["openapi", "design"]),
    ("CORS Explained", "Lena Novak", 1999, ["security", "browser"]),
    ("TLS for Developers", "Ahmed Karim", 4199, ["security", "https"]),
    ("Serverless APIs on AWS", "Julia Santos", 4799, ["aws", "cloud"]),
    ("Cloud Run in Production", "Ben Carter", 4599, ["gcp", "cloud"]),
    ("Shipping .NET on Azure", "Fatima Zahra", 4699, ["azure", "cloud"]),
    ("FastAPI Recipes", "Wei Zhang", 3899, ["python"]),
    ("TypeScript Services", "Chloe Martin", 3999, ["typescript", "node"]),
    ("Minimal APIs in C#", "Arjun Nair", 3799, ["csharp", "dotnet"]),
    ("Timeouts and Deadlines", "Isabel Cruz", 2799, ["reliability"]),
    ("Observability for APIs", "Tomás Silva", 4399, ["operations"]),
    ("The API Interview Handbook", "Nadia Rahman", 2999, ["career"]),
]


def seed_products() -> list[Product]:
    products = []
    for n, (title, author, price, tags) in enumerate(_ROWS, start=1):
        stamp = _SEED_START + timedelta(minutes=n - 1)
        products.append(
            Product(
                id=f"prd_{n:02d}",
                title=title,
                author=author,
                price_cents=price,
                tags=tags,
                version=1,
                created_at=stamp,
                updated_at=stamp,
            )
        )
    return products
