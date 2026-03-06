using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OData.Query;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace WinStride_API.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class WinProcessesController : ControllerBase
    {
        private readonly ApplicationDbContext _context;

        public WinProcessesController(ApplicationDbContext context)
        {
            _context = context;
        }


        [HttpGet]
        [EnableQuery]
        public IQueryable<WinProcess> Get()
        {
            return _context.WinProcesses;
        }

        [HttpPost]
        public async Task<IActionResult> Post([FromBody] List<WinProcess> incomingProcesses)
        {
            if (incomingProcesses == null || incomingProcesses.Count == 0)
            {
                return BadRequest("No process data received.");
            }

            string machineName = incomingProcesses[0].MachineName;

            using (var transaction = await _context.Database.BeginTransactionAsync())
            {
                try
                {
                    IQueryable<WinProcess> existing = _context.WinProcesses
                        .Where(p => p.MachineName == machineName);

                    _context.WinProcesses.RemoveRange(existing);

                    await _context.SaveChangesAsync();

                    _context.WinProcesses.AddRange(incomingProcesses);
                    await _context.SaveChangesAsync();

                    await transaction.CommitAsync();

                    return Ok(new
                    {
                        Message = "Mirror successful",
                        Count = incomingProcesses.Count,
                        Machine = machineName
                    });
                }
                catch (Exception ex)
                {
                    await transaction.RollbackAsync();
                    return StatusCode(500, $"Database Sync Error: {ex.Message}");
                }
            }
        }

        /// <summary>
        /// Optional: Manual cleanup for a specific machine
        /// </summary>
        [HttpDelete("{machineName}")]
        public async Task<IActionResult> Delete(string machineName)
        {
            IQueryable<WinProcess> records = _context.WinProcesses
                .Where(p => p.MachineName == machineName);

            if (!records.Any()) return NotFound();

            _context.WinProcesses.RemoveRange(records);
            await _context.SaveChangesAsync();
            return NoContent();
        }
    }
}