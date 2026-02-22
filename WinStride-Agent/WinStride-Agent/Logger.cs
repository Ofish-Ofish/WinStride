public static class Logger
{
    private static readonly string _logFile = DetermineLogPath();
    private static readonly object _lock = new object();
    public static int MaxLogSizeMb { get; set; }
    public static void WriteLine(string message)
    {
        string logLine = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} {message}";
        
        if (Environment.UserInteractive)
        {
            Console.WriteLine(logLine);
        }

        lock (_lock)
        {
            try
            {
                using (var stream = new FileStream(_logFile, FileMode.Append, FileAccess.Write, FileShare.ReadWrite))
                using (var writer = new StreamWriter(stream))
                {
                    writer.AutoFlush = true;
                    writer.WriteLine(logLine);
                }

                if (MaxLogSizeMb > 0) ManageLogSize();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[CRITICAL] Logger failed: {ex.Message}");
            }
        }
    }

    private static void ManageLogSize()
    {
        try
        {
            var fileInfo = new System.IO.FileInfo(_logFile);
            if (!fileInfo.Exists) return;

            long maxByteSize = MaxLogSizeMb * 1024L * 1024L;

            if (fileInfo.Length > maxByteSize)
            {
                var allLines = System.IO.File.ReadAllLines(_logFile);
                if (allLines.Length > 10) 
                {
                    var newLines = allLines.Skip(allLines.Length / 2);
                    System.IO.File.WriteAllLines(_logFile, newLines);
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[Internal Logger Error] Size management failed: {ex.Message}");
        }
    }

    private static string DetermineLogPath()
    {
        string appDir = AppDomain.CurrentDomain.BaseDirectory;

        bool isDevelopment = appDir.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}");

        if (isDevelopment)
        {
            return Path.Combine(GetSourcePath(), "agent_logs.txt");
        }

        return Path.Combine(appDir, "agent_logs.txt");
    }
    private static string GetSourcePath([System.Runtime.CompilerServices.CallerFilePath] string path = "")
        => Path.GetDirectoryName(path) ?? string.Empty;
}