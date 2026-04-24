namespace BurnupApi.Models;

public class Invite
{
    public int      Id                { get; set; }
    public string   Token             { get; set; } = string.Empty;
    public string?  Email             { get; set; } // if set, only this address may redeem it
    public DateTime ExpiresAt         { get; set; }
    public bool     Used              { get; set; }
    public int      CreatedByUserId   { get; set; }
}
