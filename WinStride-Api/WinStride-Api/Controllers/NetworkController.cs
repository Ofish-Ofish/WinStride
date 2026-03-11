using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OData.Query;
using Microsoft.AspNetCore.OData.Routing.Controllers;
using Microsoft.EntityFrameworkCore;
using WinStrideApi.Data;
using WinStrideApi.Models;

namespace WinStrideApi.Controllers
{
    [Authorize]
    public class NetworkController : ODataController
    {
        private readonly ApplicationDbContext _context;

        public NetworkController(ApplicationDbContext context)
        {
            _context = context;
        }

        [HttpGet("odata/NetworkConnections")]
        [EnableQuery]
        public IQueryable<TCPView> Get()
        {
            return _context.NetworkConnections;
        }

        [HttpPost("api/network/sync")]
        public async Task<IActionResult> SyncConnections([FromBody] List<TCPView> incomingConnections)
        {
            if (incomingConnections == null || !incomingConnections.Any())
            {
                return BadRequest("No data received.");
            }

            string machineName = incomingConnections.First().MachineName;

            var existingConnections = await _context.NetworkConnections
                .Where(c => c.MachineName == machineName)
                .ToListAsync();

            Func<TCPView, string> keyGen = (c) =>
                $"{c.Protocol}-{c.LocalAddress}:{c.LocalPort}-{c.RemoteAddress}:{c.RemotePort}-{c.ProcessId}";

            var existingLookup = existingConnections
                .GroupBy(keyGen)
                .ToDictionary(g => g.Key, g => g.First());

            var incomingKeys = incomingConnections.Select(keyGen).ToHashSet();
            var toDelete = existingConnections
                .Where(e => !incomingKeys.Contains(keyGen(e)))
                .ToList();

            if (toDelete.Any())
            {
                _context.NetworkConnections.RemoveRange(toDelete);
            }

            var processedInThisBatch = new HashSet<string>();

            foreach (var incoming in incomingConnections)
            {
                var incomingKey = keyGen(incoming);

                if (processedInThisBatch.Contains(incomingKey)) continue;
                processedInThisBatch.Add(incomingKey);

                if (existingLookup.TryGetValue(incomingKey, out var existing))
                {
                    existing.State = incoming.State;
                    existing.SentBytes = incoming.SentBytes;
                    existing.RecvBytes = incoming.RecvBytes;
                    existing.SentPackets = incoming.SentPackets;
                    existing.RecvPackets = incoming.RecvPackets;
                    existing.ProcessId = incoming.ProcessId;
                    existing.ProcessName = incoming.ProcessName;
                    existing.ModuleName = incoming.ModuleName;
                    existing.BatchId = incoming.BatchId;
                    existing.TimeCreated = DateTime.UtcNow;
                }
                else
                {
                    _context.NetworkConnections.Add(incoming);
                }
            }

            try
            {
                await _context.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Database error: {ex.Message}");
            }

            return Ok(new
            {
                message = "Sync complete",
                activeCount = incomingConnections.Count,
                removedCount = toDelete.Count
            });
        }
    }
}
