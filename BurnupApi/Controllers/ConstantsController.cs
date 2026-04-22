using Microsoft.AspNetCore.Mvc;

namespace BurnupApi.Controllers;

[ApiController]
[Route("api/constants")]
public class ConstantsController : ControllerBase
{
    [HttpGet("card-types")]
    public IActionResult GetCardTypes() =>
        Ok(new[] { "feature", "bug", "no-code", "tiny" });

    [HttpGet("scopes")]
    public IActionResult GetScopes() =>
        Ok(new[] { "mvp", "mlp", "other" });

    [HttpGet("estimation-units")]
    public IActionResult GetEstimationUnits() =>
        Ok(new[] { "days", "points" });
}
