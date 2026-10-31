using ApiConcepts.Api.Common;
using ApiConcepts.Api.Domain;

namespace ApiConcepts.Api.Storage;

public sealed class InMemoryOrderRepository : IOrderRepository
{
    private readonly Lock _gate = new();
    private readonly Dictionary<string, Order> _byId = [];

    public Order Add(Order order)
    {
        lock (_gate)
        {
            _byId[order.Id] = order;
            return order;
        }
    }

    public Order? Find(string id)
    {
        lock (_gate)
        {
            return _byId.GetValueOrDefault(id);
        }
    }

    public Page<Order> List(int limit, Cursor? after, Func<Order, bool> visible)
    {
        lock (_gate)
        {
            var ordered = _byId.Values
                .Where(visible)
                .OrderBy(o => o.CreatedAt)
                .ThenBy(o => o.Id, StringComparer.Ordinal);
            return Paging.Take(ordered, after, limit, o => new Cursor(o.CreatedAt, o.Id));
        }
    }

    public Change<Order>? Update(string id, Func<Order, Order> change)
    {
        lock (_gate)
        {
            if (!_byId.TryGetValue(id, out var before))
            {
                return null;
            }

            var after = change(before);
            _byId[id] = after;
            return new Change<Order>(before, after);
        }
    }

    public IReadOnlyList<Order> All()
    {
        lock (_gate)
        {
            return [.. _byId.Values];
        }
    }
}
