using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OData.Query;
using Microsoft.AspNetCore.OData.Routing.Controllers;
using WinStrideApi.Data;
using WinStrideApi.Models;
using Microsoft.EntityFrameworkCore;

namespace WinStride_Api.Controllers
{
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

        [EnableQuery(MaxTop = 5000)]
        public IQueryable<WinEvent> Get()
        {
            return _context.WinEvents.OrderByDescending(e => e.TimeCreated);
        }

        [HttpPost("api/Event")]
        public async Task<ActionResult<WinEvent>> PostWinEvent(WinEvent winEvent)
        {
            winEvent.TimeCreated = winEvent.TimeCreated.ToUniversalTime();

            _context.WinEvents.Add(winEvent);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(Get), new { id = winEvent.Id }, winEvent);
        }
    }
}
