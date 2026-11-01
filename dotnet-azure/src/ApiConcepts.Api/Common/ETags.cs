// Concept 19 · Caching: entity tags and the If-None-Match / If-Match comparisons.
using System.Security.Cryptography;
using Microsoft.Net.Http.Headers;

namespace ApiConcepts.Api.Common;

public static class ETags
{
    public static string ForProduct(string id, int version) => $"\"{id}-v{version}\"";

    public static string WeakHash(byte[] body) => $"W/\"{Convert.ToHexStringLower(SHA256.HashData(body))[..32]}\"";

    /// <summary>If-None-Match uses weak comparison: W/ prefixes are ignored; "*" matches anything.</summary>
    public static bool IfNoneMatchHits(HttpRequest request, string etag)
    {
        var values = request.Headers.IfNoneMatch;
        if (values.Count == 0)
        {
            return false;
        }

        return EntityTagHeaderValue.TryParseList(values, out var tags) &&
               tags.Any(tag => tag.Equals(EntityTagHeaderValue.Any) || Same(tag.Tag.ToString(), etag));
    }

    /// <summary>If-Match is a precondition: when present it must match the current ETag, by strong comparison (a W/ tag never matches).</summary>
    public static void RequireIfMatch(HttpRequest request, string currentEtag)
    {
        var values = request.Headers.IfMatch;
        if (values.Count == 0)
        {
            return;
        }

        var matches = EntityTagHeaderValue.TryParseList(values, out var tags) &&
                      tags.Any(tag => tag.Equals(EntityTagHeaderValue.Any) || (!tag.IsWeak && tag.Tag.ToString() == currentEtag));
        if (!matches)
        {
            throw new ProblemException(
                ProblemType.PreconditionFailed,
                $"If-Match does not match the current ETag {currentEtag}.");
        }
    }

    private static bool Same(string a, string b) => StripWeak(a) == StripWeak(b);

    private static string StripWeak(string tag) => tag.StartsWith("W/", StringComparison.Ordinal) ? tag[2..] : tag;
}
