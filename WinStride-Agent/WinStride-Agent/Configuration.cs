public class LogConfig
{
    public bool Enabled { get; set; } = true;
    public string MinLevel { get; set; } = "Verbose";
    public List<int> IncludeIds { get; set; } = new List<int>();
    public List<int> ExcludeIds { get; set; } = new List<int>();
    public int? MaxBacklogDays { get; set; } = null;
}

public class AppConfig
{
    public GlobalSettings Global { get; set; } = new GlobalSettings();
    public Dictionary<string, LogConfig> Logs { get; set; } = new Dictionary<string, LogConfig>();
}

public class GlobalSettings
{
    public string? BaseUrl { get; set; } = null;
    public int BatchSize { get; set; } = 100;
    public int HeartbeatInterval { get; set; } = 60;

    public int MaxLogSizeMb { get; set; } = 5;

    public int recoverdelayMs { get; set; } = 30000;
}