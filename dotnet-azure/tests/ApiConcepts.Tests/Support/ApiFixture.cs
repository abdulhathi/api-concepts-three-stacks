using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using ApiConcepts.Api.Http;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace ApiConcepts.Tests.Support;

/// <summary>The whole API hosted in memory, with a fast timeout, fast webhook retries and captured side effects.</summary>
public sealed class ApiFixture : WebApplicationFactory<Program>
{
    public CapturingLogSink Log { get; } = new();

    public FakeReceiver Receiver { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("REQUEST_TIMEOUT_MS", "300");
        builder.UseSetting("WEBHOOK_RETRY_BASE_MS", "20");
        builder.ConfigureTestServices(services =>
        {
            services.AddSingleton<IRequestLogSink>(Log);
            services.AddHttpClient("webhooks").ConfigurePrimaryHttpMessageHandler(() => Receiver);
        });
    }

    /// <summary>A copy of this host with different settings (for example a longer report timeout).</summary>
    public WebApplicationFactory<Program> WithSettings(params (string Key, string Value)[] settings) =>
        WithWebHostBuilder(builder =>
        {
            foreach (var (key, value) in settings)
            {
                builder.UseSetting(key, value);
            }
        });

    public Task<string> TokenAsync(string client = "admin", string? scope = null) =>
        TokenAsync(this, client, scope);

    public static async Task<string> TokenAsync(WebApplicationFactory<Program> host, string client, string? scope = null)
    {
        using var http = host.CreateClient();
        var form = new Dictionary<string, string>
        {
            ["grant_type"] = "client_credentials",
            ["client_id"] = client,
            ["client_secret"] = $"{client}-secret",
        };
        if (scope is not null)
        {
            form["scope"] = scope;
        }

        var response = await http.PostAsync("/oauth/token", new FormUrlEncodedContent(form));
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("access_token").GetString()!;
    }

    /// <summary>An HttpClient that is already signed in as one of the demo clients.</summary>
    public Task<HttpClient> As(string client = "admin") => As(this, client);

    public static async Task<HttpClient> As(WebApplicationFactory<Program> host, string client)
    {
        var http = host.CreateClient();
        http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", await TokenAsync(host, client));
        return http;
    }
}

public sealed class CapturingLogSink : IRequestLogSink
{
    private readonly List<string> _lines = [];

    public IReadOnlyList<string> Lines
    {
        get
        {
            lock (_lines)
            {
                return [.. _lines];
            }
        }
    }

    public void Write(string line)
    {
        lock (_lines)
        {
            _lines.Add(line);
        }
    }
}
