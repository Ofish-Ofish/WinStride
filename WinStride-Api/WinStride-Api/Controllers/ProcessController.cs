using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OData.Query;
using Microsoft.AspNetCore.OData.Routing.Controllers;
using Microsoft.EntityFrameworkCore;
using WinStride_Api.Models;
using WinStrideApi.Data;

namespace WinStrideApi.Controllers
{
    [Authorize]
    public class ProcessController : ODataController
    {
        private readonly ApplicationDbContext _context;

        public ProcessController(ApplicationDbContext context)
        {
            _context = context;
        }

        [EnableQuery]
        [HttpGet("odata/WinProcesses")]
        public IQueryable<WinProcess> Get()
        {
            return _context.WinProcesses;
        }

        [HttpPost("api/processes/sync")]
        public async Task<IActionResult> Sync([FromBody] List<WinProcess> incomingProcesses)
        {
            if (incomingProcesses == null || incomingProcesses.Count == 0)
            {
                return BadRequest("No process data received.");
            }

            try
            {
                string machineName = incomingProcesses.First().MachineName;
                DateTime syncTime = DateTime.UtcNow;
                Guid batchId = Guid.NewGuid();

                var existing = await _context.WinProcesses
                    .Where(p => p.MachineName == machineName)
                    .ToListAsync();

                _context.WinProcesses.RemoveRange(existing);

                foreach (var process in incomingProcesses)
                {
                    process.Id = 0;
                    process.TimeSynced = syncTime;
                    process.BatchId = batchId;
                }

                _context.WinProcesses.AddRange(incomingProcesses);
                await _context.SaveChangesAsync();

                return Ok(new
                {
                    status = "Success",
                    machine = machineName,
                    count = incomingProcesses.Count,
                    batchId = batchId
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Internal Server Error: {ex.Message}");
            }
        }
    }
}
