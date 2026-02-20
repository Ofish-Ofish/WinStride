using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OData.Query;
using Microsoft.AspNetCore.OData.Routing.Controllers;
using Microsoft.EntityFrameworkCore;
using WinStrideApi.Data;
using WinStrideApi.Models;

namespace WinStride_Api.Controllers
{
    public class HeartbeatController : ODataController
    {
        private readonly ApplicationDbContext _context;

        public HeartbeatController(ApplicationDbContext context)
        {
            _context = context;
        }

        [EnableQuery]
        public IQueryable<Heartbeat> Get()
        {
            return _context.Heartbeats;
        }

        [HttpPost]
        public async Task<IActionResult> Post([FromBody] Heartbeat incoming)
        {
            if (incoming == null || string.IsNullOrEmpty(incoming.MachineName))
            {
                return BadRequest("Invalid heartbeat data.");
            }

            incoming.LastSeen = DateTime.SpecifyKind(incoming.LastSeen, DateTimeKind.Utc);

            Heartbeat? existing = await _context.Heartbeats
                .FirstOrDefaultAsync(h => h.MachineName == incoming.MachineName);

            if (existing == null)
            {
                _context.Heartbeats.Add(incoming);
            }
            else
            {
                existing.LastSeen = DateTime.UtcNow;
                existing.IsAlive = true;
                _context.Heartbeats.Update(existing);
            }

            await _context.SaveChangesAsync();
            return Ok();
        }
    }
}