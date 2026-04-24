using System.Net;
using System.Net.Mail;

namespace BurnupApi.Services;

public class EmailService(IConfiguration config, ILogger<EmailService> logger)
{
    private bool IsConfigured => !string.IsNullOrWhiteSpace(config["Smtp:Host"]);

    public async Task<string?> SendPasswordResetAsync(string toEmail, string resetLink)
    {
        if (!IsConfigured)
        {
            // Dev mode: log the link and return it so the caller can surface it to the user
            logger.LogWarning(
                "[DEV] SMTP not configured. Password reset link for {Email}: {Link}",
                toEmail, resetLink);
            return resetLink;
        }

        using var msg = new MailMessage();
        msg.From    = new MailAddress(config["Smtp:From"] ?? "noreply@burnup.app");
        msg.To.Add(toEmail);
        msg.Subject = "Reset your Burnup password";
        msg.Body    = $"Click the link below to reset your password:\n\n{resetLink}\n\nThis link expires in 1 hour.";

        using var client = new SmtpClient(config["Smtp:Host"]);
        client.Port        = int.TryParse(config["Smtp:Port"], out var p) ? p : 587;
        client.EnableSsl   = true;
        client.Credentials = new NetworkCredential(config["Smtp:User"], config["Smtp:Pass"]);
        await client.SendMailAsync(msg);
        return null; // link was emailed, don't expose in response
    }
}
