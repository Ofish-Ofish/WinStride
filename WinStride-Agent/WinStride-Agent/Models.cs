public class ODataResponse<T>
{
    [System.Text.Json.Serialization.JsonPropertyName("value")]
    public List<T>? Value { get; set; }
}
public class Heartbeat
{
    public int Id { get; set; }
    public string MachineName { get; set; } = string.Empty;
    public bool IsAlive { get; set; }
    public DateTime LastSeen { get; set; }
}