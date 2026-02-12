using System;
using System.Diagnostics;
using System.Security.Principal;

class Agent
{
    static void Main()
    {
        string logName = "Security";

        if (!EventLog.Exists(logName))
        {
            Console.WriteLine($"Error: The log '{logName}' does not exist on this system.");
            return;
        }

        EventLog eventLog = new EventLog(logName);

        if (eventLog.Entries.Count > 0)
        {
            EventLogEntry lastEntry = eventLog.Entries[^1];

            Console.WriteLine($"--- Most Recent {logName} Log ---");
            Console.WriteLine($"Time:    {lastEntry.TimeGenerated}");
            Console.WriteLine($"Source:  {lastEntry.Source}");
            Console.WriteLine($"Type:    {lastEntry.EntryType}");
            Console.WriteLine($"Message: {lastEntry.Message}");
        }
        else
        {
            Console.WriteLine($"The {logName} log is empty.");
        }
    }

    static bool IsRunningAsAdmin()
    {
        using (WindowsIdentity identity = WindowsIdentity.GetCurrent())
        {
            WindowsPrincipal principal = new WindowsPrincipal(identity);
            return principal.IsInRole(WindowsBuiltInRole.Administrator);
        }
    }
}