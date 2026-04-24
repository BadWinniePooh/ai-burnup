using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using BurnupApi.Models;
using Microsoft.IdentityModel.Tokens;

namespace BurnupApi.Services;

public class JwtService(IConfiguration config)
{
    public string GenerateToken(User user)
    {
        var secret = config["Jwt:Secret"]
            ?? throw new InvalidOperationException("Jwt:Secret is not configured.");
        var key    = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        var creds  = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var expiry = int.TryParse(config["Jwt:ExpiryHours"], out var h) ? h : 24;

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub,   user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim(ClaimTypes.Role,               user.Role),
            new Claim(JwtRegisteredClaimNames.Jti,   Guid.NewGuid().ToString()),
        };

        var token = new JwtSecurityToken(
            issuer:             config["Jwt:Issuer"]   ?? "BurnupApi",
            audience:           config["Jwt:Audience"] ?? "BurnupApp",
            claims:             claims,
            expires:            DateTime.UtcNow.AddHours(expiry),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
