using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OData.Query;
using Microsoft.AspNetCore.OData.Routing.Controllers;
using Microsoft.EntityFrameworkCore;
using WinStrideApi.Data;
using WinStrideApi.Models;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace WinStrideApi.Controllers
{
    public class AutorunsController : ODataController
    {
        private readonly ApplicationDbContext _context;

        public AutorunsController(ApplicationDbContext context)
        {
            _context = context;
        }

        [EnableQuery]
        [HttpGet("odata/WinAutoruns")]
        public IQueryable<AutorunView> Get()
        {
            return _context.AutorunViews;
        }

        [HttpPost("api/autoruns/sync")]
        public async Task<IActionResult> Sync([FromBody] List<AutorunView> incomingAutoruns)
        {
            if (incomingAutoruns == null || incomingAutoruns.Count == 0)
            {
                return BadRequest("No autorun data received.");
            }

            try
            {
                string machineName = incomingAutoruns.First().MachineName;
                DateTimeOffset syncTime = DateTimeOffset.UtcNow;
                Guid batchId = Guid.NewGuid();

                List<AutorunView> existingEntries = await _context.AutorunViews
                    .Where(a => a.MachineName == machineName)
                    .ToListAsync();

                List<AutorunView> toRemove = existingEntries
                    .Where(ex => !incomingAutoruns.Any(inc => 
                        inc.EntryLocation == ex.EntryLocation && 
                        inc.Entry == ex.Entry))
                    .ToList();

                List<AutorunView> toAdd = new List<AutorunView>();

                foreach (AutorunView incoming in incomingAutoruns)
                {
                    incoming.TimeSynced = syncTime;
                    incoming.BatchId = batchId;

                    AutorunView? existing = existingEntries.FirstOrDefault(ex => 
                        ex.EntryLocation == incoming.EntryLocation && 
                        ex.Entry == incoming.Entry);

                    if (existing == null)
                    {
                        toAdd.Add(incoming);
                    }
                    else
                    {
                        if (existing.Sha256 != incoming.Sha256 || existing.ImagePath != incoming.ImagePath)
                        {
                            _context.AutorunViews.Remove(existing);
                            toAdd.Add(incoming);
                        }
                    }
                }

                if (toRemove.Count > 0)
                {
                    _context.AutorunViews.RemoveRange(toRemove);
                }

                if (toAdd.Count > 0)
                {
                    _context.AutorunViews.AddRange(toAdd);
                }

                await _context.SaveChangesAsync();

                return Ok(new 
                { 
                    status = "Success",
                    machine = machineName,
                    added = toAdd.Count, 
                    removed = toRemove.Count, 
                    currentBatchId = batchId 
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, $"Internal Server Error: {ex.Message}");
            }
        }
    }
}