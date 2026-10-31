// Concept 26 · Webhooks: Webhook-Signature is v1=hex(HMAC-SHA256(secret, "<timestamp>.<raw body>")).
using System.Security.Cryptography;
using System.Text;

namespace ApiConcepts.Api.Webhooks;

public static class WebhookSignature
{
    public static string Sign(string secret, long unixSeconds, byte[] body)
    {
        var message = Encoding.UTF8.GetBytes($"{unixSeconds}.").Concat(body).ToArray();
        return "v1=" + Convert.ToHexStringLower(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), message));
    }
}
