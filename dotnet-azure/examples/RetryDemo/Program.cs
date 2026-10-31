// Concepts 23 and 25 · Retries and exponential backoff: call the flaky endpoint and print every attempt and its delay.
//
//   dotnet run --project examples/RetryDemo            (server on http://localhost:8003)
//   BASE_URL=https://my-app.azurewebsites.net dotnet run --project examples/RetryDemo
using ApiConcepts.Client;
using Microsoft.Extensions.DependencyInjection;

var services = new ServiceCollection();
services.AddApiConceptsClient(options =>
{
    options.BaseUrl = Environment.GetEnvironmentVariable("BASE_URL") ?? "http://localhost:8003";
    options.ClientId = "reader";
    options.ClientSecret = "reader-secret";
    options.OnRetry = retry => Console.WriteLine(
        $"attempt {retry.Attempt} failed ({retry.Reason}); retrying in {retry.Delay.TotalMilliseconds:0} ms");
});

await using var provider = services.BuildServiceProvider();
var client = provider.GetRequiredService<ApiClient>();

// A fresh key per run, so the server's counter starts at zero: calls 1 and 2 fail with 503, call 3 succeeds.
var key = $"demo-{Guid.NewGuid():N}"[..16];
try
{
    var result = await client.GetFlakyAsync(key, failTimes: 2);
    Console.WriteLine($"attempt {result.Attempts} succeeded: key={result.Key}");
}
catch (ApiException e)
{
    Console.WriteLine($"gave up: HTTP {e.StatusCode} {e.ProblemSlug} - {e.Message}");
    return 1;
}

return 0;
