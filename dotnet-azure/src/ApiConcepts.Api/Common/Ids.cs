using System.Security.Cryptography;

namespace ApiConcepts.Api.Common;

public static class Ids
{
    public static string New(string prefix) => prefix + Hex(6);

    public static string Hex(int bytes) => Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(bytes));
}
