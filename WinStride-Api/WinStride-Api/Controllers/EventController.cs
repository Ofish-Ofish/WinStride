using Microsoft.AspNetCore.Mvc;
using WinStrideApi.Data;
using WinStrideApi.Models;
using Microsoft.EntityFrameworkCore;

namespace WinStride_Api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class EventController : ControllerBase
    {

        private readonly ApplicationDbContext _context;

        public EventController(ApplicationDbContext context)
        {
            _context = context;
        }

        [HttpGet("health")]
        public async Task<IActionResult> CheckHealth()
        {
            bool isDbUp = await _context.Database.CanConnectAsync();

            if (!isDbUp)
            {
                return StatusCode(503, "Database connection unavailable.");
            }

            return Ok(new { status = "Healthy", timestamp = DateTime.UtcNow});
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<WinEvent>>> GetWinEvents(
            [FromQuery] int? id,
            [FromQuery] List<int>? eventIds,
            [FromQuery] string? machineName,
            [FromQuery] string? logName,
            [FromQuery] string? level,
            [FromQuery] DateTime? startTime,
            [FromQuery] DateTime? endTime)
        {
            var query = _context.WinEvents.AsQueryable();

            if (id.HasValue)
            {
                query = query.Where(e => e.Id == id);
            }
            if (eventIds != null && eventIds.Count > 0)
            {
                query = query.Where(e => eventIds.Contains(e.EventId));
            }
            if (!string.IsNullOrEmpty(machineName))
            {
                query = query.Where(e => e.MachineName.Contains(machineName));
            }
            if (!string.IsNullOrEmpty(logName))
            {
                query = query.Where(e => e.LogName == logName);
            }
            if (!string.IsNullOrEmpty(level))
            {
                query = query.Where(e => e.Level == level);
            }
            if (startTime.HasValue)
            {
                var utcStart = DateTime.SpecifyKind(startTime.Value, DateTimeKind.Utc);
                query = query.Where(e => e.TimeCreated >= utcStart);
            }
            if (endTime.HasValue)
            {
                var utcEnd = DateTime.SpecifyKind(endTime.Value, DateTimeKind.Utc);
                query = query.Where(e => e.TimeCreated <= utcEnd);
            }

            return await query
                .OrderByDescending(e => e.TimeCreated)
                .Take(5000)
                .ToListAsync();
        }

        [HttpPost]
        public async Task<ActionResult<WinEvent>> PostWinEvent(WinEvent winEvent)
        {
            winEvent.TimeCreated = DateTime.SpecifyKind(winEvent.TimeCreated, DateTimeKind.Utc);

            _context.WinEvents.Add(winEvent);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetWinEvents), new { id = winEvent.Id }, winEvent);
        }
    }
}
