using ApiConcepts.Api.Common;
using ApiConcepts.Api.Domain;

namespace ApiConcepts.Api.Storage;

public sealed class InMemoryProductRepository : IProductRepository
{
    private readonly Lock _gate = new();
    private readonly Dictionary<string, Product> _byId;

    public InMemoryProductRepository(IEnumerable<Product> seed) =>
        _byId = seed.ToDictionary(p => p.Id);

    public Page<Product> List(int limit, Cursor? after, string? tag)
    {
        lock (_gate)
        {
            var ordered = _byId.Values
                .Where(p => tag is null || p.Tags.Contains(tag))
                .OrderBy(p => p.CreatedAt)
                .ThenBy(p => p.Id, StringComparer.Ordinal);
            return Paging.Take(ordered, after, limit, p => new Cursor(p.CreatedAt, p.Id));
        }
    }

    public Product? Find(string id)
    {
        lock (_gate)
        {
            return _byId.GetValueOrDefault(id);
        }
    }

    public Product Add(Product product)
    {
        lock (_gate)
        {
            _byId[product.Id] = product;
            return product;
        }
    }

    public Change<Product>? Update(string id, Func<Product, Product> change)
    {
        lock (_gate)
        {
            if (!_byId.TryGetValue(id, out var before))
            {
                return null;
            }

            var after = change(before);
            _byId[id] = after;
            return new Change<Product>(before, after);
        }
    }

    public bool Remove(string id, Action<Product> guard)
    {
        lock (_gate)
        {
            if (!_byId.TryGetValue(id, out var product))
            {
                return false;
            }

            guard(product);
            return _byId.Remove(id);
        }
    }
}
