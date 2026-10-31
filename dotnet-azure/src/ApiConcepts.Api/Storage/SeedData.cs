using ApiConcepts.Api.Domain;

namespace ApiConcepts.Api.Storage;

public static class SeedData
{
    private static readonly DateTimeOffset Epoch = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    private static readonly (string Title, string Author, int Price, string[] Tags)[] Rows =
    [
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
    ];

    public static IReadOnlyList<Product> Products() =>
        Rows.Select((row, index) =>
        {
            var at = Epoch.AddMinutes(index);
            return new Product($"prd_{index + 1:00}", row.Title, row.Author, row.Price, "USD", row.Tags, 1, at, at);
        }).ToList();
}
