using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OData.Query;
using Microsoft.AspNetCore.OData.Routing.Controllers;
using Microsoft.EntityFrameworkCore;
using WinStrideApi.Data;
using WinStrideApi.Models;

namespace WinStride_Api.Controllers
{
    [Authorize]
    public class EventController : ODataController
    {
        private readonly ApplicationDbContext _context;

        public EventController(ApplicationDbContext context)
        {
            _context = context;
        }

        [HttpGet("api/Event/health")]
        public async Task<IActionResult> CheckHealth()
        {
            bool isDbUp = await _context.Database.CanConnectAsync();

            if (!isDbUp)
            {
                return StatusCode(503, "Database connection unavailable.");
            }

            return Ok(new { status = "Healthy", timestamp = DateTime.UtcNow});
        }

        [EnableQuery(MaxTop = 5000, MaxNodeCount = 500)]
        public IQueryable<WinEvent> Get()
        {
            return _context.WinEvents.OrderByDescending(e => e.TimeCreated);
        }

        [HttpPost("api/Event/batch")]
        public async Task<ActionResult> PostWinEvents([FromBody] List<WinEvent> winEvents)
        {
            if (winEvents == null || !winEvents.Any())
            {
                return BadRequest("No events provided.");
            }
            foreach (var winEvent in winEvents)
            {
                winEvent.TimeCreated = winEvent.TimeCreated.ToUniversalTime();
            }
            _context.WinEvents.AddRange(winEvents);
            await _context.SaveChangesAsync();
            return Ok(new { count = winEvents.Count, message = "Batch uploaded successfully." });
        }
    }
}
