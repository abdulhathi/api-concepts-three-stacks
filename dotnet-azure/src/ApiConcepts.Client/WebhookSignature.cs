// Concept 26 · Webhooks: what a receiver runs to trust a delivery.
using System.Security.Cryptography;
using System.Text;

namespace ApiConcepts.Client;

public static class WebhookSignature
{
    public static readonly TimeSpan Tolerance = TimeSpan.FromSeconds(300);

    /// <summary>
    /// True when <paramref name="signatureHeader"/> (v1=hex) matches HMAC-SHA256(secret, "&lt;timestamp&gt;.&lt;rawBody&gt;")
    /// and the timestamp is within five minutes of <paramref name="now"/>. The comparison is constant time.
    /// </summary>
    public static bool Verify(string secret, string timestampHeader, string signatureHeader, byte[] rawBody, DateTimeOffset now)
    {
        if (!long.TryParse(timestampHeader, out var seconds) ||
            (now - DateTimeOffset.FromUnixTimeSeconds(seconds)).Duration() > Tolerance ||
            !signatureHeader.StartsWith("v1=", StringComparison.Ordinal))
        {
            return false;
        }

        var message = Encoding.UTF8.GetBytes($"{seconds}.").Concat(rawBody).ToArray();
        var expected = HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), message);
        try
        {
            return CryptographicOperations.FixedTimeEquals(expected, Convert.FromHexString(signatureHeader[3..]));
        }
        catch (FormatException)
        {
            return false;
        }
    }
}
