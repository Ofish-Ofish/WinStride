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

        // GET: api/<EventController>
        [HttpGet]
        public async Task<ActionResult<IEnumerable<WinEvent>>> GetWinEvents(
            [FromQuery] int? id,
            [FromQuery] int? eventId,
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
            if (eventId.HasValue)
            {
                query = query.Where(e => e.EventId == eventId);
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

            return await query.ToListAsync();
        }

        // PUT api/<EventController>/5
        [HttpPut("{id}")]
        public void Put(int id, [FromBody] string value)
        {
        }

        // DELETE api/<EventController>/5
        [HttpDelete("{id}")]
        public void Delete(int id)
        {
        }
    }
}
