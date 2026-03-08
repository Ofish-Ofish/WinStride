using YamlDotNet.Serialization;

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
    [YamlMember(Alias = "global")]
    public GlobalSettings Global { get; set; } = new GlobalSettings();

    [YamlMember(Alias = "logs")]
    public Dictionary<string, LogConfig> Logs { get; set; } = new Dictionary<string, LogConfig>();
}

public class GlobalSettings
{
    [YamlMember(Alias = "baseUrl")]
    public string? BaseUrl { get; set; } = null;

    [YamlMember(Alias = "CertSubject")]
    public string? CertSubject { get; set; }

    [YamlMember(Alias = "batchSize")]
    public int BatchSize { get; set; } = 100;

    [YamlMember(Alias = "heartbeatInterval")]
    public int HeartbeatInterval { get; set; } = 60;

    [YamlMember(Alias = "maxLogSizeMb")]
    public int MaxLogSizeMb { get; set; } = 5;

    [YamlMember(Alias = "recoverdelayMs")]
    public int recoverdelayMs { get; set; } = 30000;
}