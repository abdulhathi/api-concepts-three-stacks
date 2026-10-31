// Concept 13 · OAuth 2.0: the registered demo clients. Dev only: in production these live in an identity provider.
using System.Security.Cryptography;
using System.Text;

namespace ApiConcepts.Api.Auth;

public sealed record Plan(string Name, int RequestsPerMinute)
{
    public static readonly Plan Free = new("free", 5);
    public static readonly Plan Standard = new("standard", 1000);
}

public sealed record DemoClient(string Id, string Secret, IReadOnlyList<string> Scopes, Plan Plan)
{
    public bool SecretMatches(string candidate) =>
        CryptographicOperations.FixedTimeEquals(Hash(candidate), Hash(Secret));

    // Hashing first makes both inputs the same length, so the comparison leaks nothing about the secret.
    private static byte[] Hash(string value) => SHA256.HashData(Encoding.UTF8.GetBytes(value));
}

public sealed class DemoClients
{
    private static readonly string[] Reader = ["products:read", "orders:read"];
    private static readonly string[] Writer = ["products:read", "products:write", "orders:read", "orders:write"];

    private readonly Dictionary<string, DemoClient> _clients = new[]
    {
        new DemoClient("reader", "reader-secret", Reader, Plan.Standard),
        new DemoClient("writer", "writer-secret", Writer, Plan.Standard),
        new DemoClient("partner", "partner-secret", Writer, Plan.Standard),
        new DemoClient("admin", "admin-secret", [.. Writer, "admin"], Plan.Standard),
        new DemoClient("free", "free-secret", ["products:read"], Plan.Free),
    }.ToDictionary(c => c.Id);

    public DemoClient? Find(string id) => _clients.GetValueOrDefault(id);
}
