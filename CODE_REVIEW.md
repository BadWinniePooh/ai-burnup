# Code Review — Burnup PM Tool

**Reviewed:** 2026-05-11  
**Scope:** Full codebase — `BurnupApi/` (C# backend) and `project/src/` (React frontend)  
**Reviewer:** Claude (AI-assisted)  
**Focus areas:** Security · Testability · Clean Code · Architecture

---

## Table of Contents

1. [Security](#security)
2. [Testability](#testability)
3. [Clean Code](#clean-code)
4. [Architecture & Design](#architecture--design)
5. [Infrastructure & Operations](#infrastructure--operations)
6. [Summary Table](#summary-table)

---

## Severity Legend

| Symbol | Severity | Meaning |
|--------|----------|---------|
| 🔴 | **Critical** | Exploitable vulnerability or data-loss risk; fix before next deployment |
| 🟠 | **High** | Significant functional or security risk; fix in the next sprint |
| 🟡 | **Medium** | Quality or maintainability debt; schedule for near-term cleanup |
| 🔵 | **Low** | Minor polish or best-practice deviation; address when convenient |

---

## Security

---

### S-01 — Over-Permissive CORS Policy
**Severity:** 🔴 Critical  
**File:** `BurnupApi/Program.cs:55–56`

```csharp
o.AddDefaultPolicy(p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
```

Any origin on the internet may send cross-origin requests to this API. Combined with the JWT stored in `localStorage` (see S-05), a malicious site can trick an authenticated user's browser into making requests that appear legitimate. CORS should be restricted to the known frontend origin(s) via an environment variable, e.g. `AllowOrigins(config["AllowedOrigins"])`.

---

### S-02 — No Rate Limiting on Authentication Endpoints
**Severity:** 🔴 Critical  
**File:** `BurnupApi/Controllers/AuthController.cs:14–92`

`Login`, `Register`, `ForgotPassword`, and `ResetPassword` have no rate-limiting middleware. An attacker can make unlimited attempts to:
- Brute-force user passwords (Login)
- Exhaust reset tokens (ForgotPassword)
- Enumerate registered email addresses (Register returns 409 on duplicate)

ASP.NET Core 8 ships `Microsoft.AspNetCore.RateLimiting` out of the box. A fixed-window or sliding-window limiter keyed by IP (or email) should be applied to all auth endpoints.

---

### S-03 — Public Sharing Tokens Generated with `Guid.NewGuid()`
**Severity:** 🟠 High  
**File:** `BurnupApi/Data/DataStore.cs:297`

```csharp
project.PublicToken = Guid.NewGuid().ToString("N");
```

`Guid.NewGuid()` on .NET uses the OS random-number generator and is cryptographically random in practice, but it is explicitly documented as *not* a security primitive. The same pattern is used for invite tokens (`DataStore.cs:108`) and password-reset tokens (`DataStore.cs:84`). All security-sensitive tokens should be generated with `RandomNumberGenerator.GetHexString(32)` (available since .NET 8) or `Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))`.

---

### S-04 — No Timing-Safe Token Comparison
**Severity:** 🟠 High  
**File:** `BurnupApi/Data/DataStore.cs:93–94`

```csharp
db.ResetTokens.FirstOrDefaultAsync(t =>
    t.Token == token && !t.Used && t.ExpiresAt > DateTime.UtcNow);
```

Token lookup delegates comparison to the database, which uses string equality and is therefore susceptible to timing-based side-channels if the token is ever compared in application code. Additionally, there is no attempt limit on `ResetPassword` calls; an attacker can make thousands of guesses against unexpired tokens without being throttled (compounded by S-02).

---

### S-05 — JWT Stored in `localStorage` (XSS Attack Surface)
**Severity:** 🟠 High  
**File:** `project/src/api.jsx:7`, `project/src/auth.jsx:72,126,239`

```javascript
function getToken() { return localStorage.getItem('burnup.token'); }
// ...
localStorage.setItem('burnup.token', data.token);
```

Any JavaScript that executes in the page context — including injected scripts from a CDN compromise or a stored-XSS vulnerability — can read the token from `localStorage` and exfiltrate it. The preferred mitigation is to use `HttpOnly` cookies (not accessible from JavaScript) for token storage, combined with a `SameSite=Strict` or `SameSite=Lax` cookie policy.

---

### S-06 — Password Reset Link Returned in API Response (Dev Mode Leak)
**Severity:** 🟠 High  
**File:** `BurnupApi/Controllers/AuthController.cs:65–69`, `BurnupApi/Services/EmailService.cs:13–18`

```csharp
if (devLink is not null)
    return Ok(new { resetLink = devLink, dev = true });
```

When SMTP is not configured the raw reset link is returned in the HTTP response body and also logged at `LogWarning`. If this behaviour is accidentally left enabled in a production deployment (e.g. someone removes the SMTP variables), password reset links are trivially interceptable via browser DevTools, proxies, or log aggregators. The `dev` flag should additionally require `ASPNETCORE_ENVIRONMENT=Development`; in any other environment the endpoint must always return 204 with no body.

---

### S-07 — Database Credentials Hardcoded in `docker-compose.yml`
**Severity:** 🟠 High  
**File:** `docker-compose.yml:7–9`

```yaml
POSTGRES_PASSWORD: burnup
```

The Postgres password (`burnup`) is committed to version control. The connection string in the `backend` service also embeds this value directly:

```yaml
ConnectionStrings__DefaultConnection=Host=db;...;Password=burnup
```

These should be moved to the `.env` file and referenced as `${POSTGRES_PASSWORD}` in the compose file, matching the pattern already used for `Jwt__Secret`.

---

### S-08 — Invite Validation Does Not Prevent Token Reuse Across Emails
**Severity:** 🟡 Medium  
**File:** `BurnupApi/Controllers/AuthController.cs:40–46`

An invite token that was issued without an email restriction (`invite.Email is null`) can be used by any number of people until it is consumed. A single invite link shared accidentally (e.g. posted in a public Slack channel) allows unlimited registrations until an admin notices and the token expires after 7 days. Consider adding a maximum-use count or explicitly requiring that generic invites are single-use (which they are, but this is easy to miss in the logic).

---

### S-09 — No Input Validation on Numeric Snapshot Fields
**Severity:** 🟡 Medium  
**File:** `BurnupApi/Controllers/ProjectsController.cs:111–135`

```csharp
ScopeCount = r.ScopeCount,
DoneCount  = r.DoneCount,
ScopeDays  = Math.Round(r.ScopeDays, 1),
DoneDays   = Math.Round(r.DoneDays,  1),
```

`ScopeCount`, `DoneCount`, `ScopeDays`, and `DoneDays` are stored without range checks. Negative counts, `DoneCount > ScopeCount`, or astronomical values could corrupt the burnup chart rendering. A validation step should reject nonsensical values before persistence.

---

### S-10 — No Content-Security-Policy Headers
**Severity:** 🟡 Medium  
**File:** `BurnupApi/Program.cs` (no CSP middleware present)

The application does not set `Content-Security-Policy` response headers. This means a stored-XSS payload or CDN-supply-chain compromise can execute arbitrary scripts. Given that the frontend loads three CDN scripts (`unpkg.com`, `cdn.jsdelivr.net`), a strict CSP that whitelists those specific origins with SRI hashes would meaningfully reduce the blast radius of a CDN compromise.

---

### S-11 — Weak Minimum Password Length
**Severity:** 🔵 Low  
**File:** `BurnupApi/Controllers/AuthController.cs:74`

```csharp
if (req.NewPassword.Length < 8)
    return BadRequest("Password must be at least 8 characters.");
```

The 8-character minimum is enforced only on password *reset*, not on initial registration. The `Register` endpoint (`AuthController.cs:24–52`) accepts passwords of any length. Even within the reset path, 8 characters is below NIST SP 800-63B's recommended minimum of 8 for memorised secrets and far below common guidance of 12–16. Both `Register` and `ResetPassword` should share the same validation logic.

---

### S-12 — Email Enumeration via Register Response
**Severity:** 🔵 Low  
**File:** `BurnupApi/Controllers/AuthController.cs:27–28`

```csharp
if (await store.GetUserByEmailAsync(normalizedEmail) is not null)
    return Conflict("An account with that email already exists.");
```

Returning HTTP 409 with a specific message allows an attacker to enumerate which email addresses are registered. `ForgotPassword` correctly prevents this (always returns 204), but `Register` does not. Consider returning a generic 200/204 and sending a "you already have an account" email to the address, or at minimum not disclosing the reason in the error body.

---

## Testability

---

### T-01 — No Interfaces on Injectable Services
**Severity:** 🟠 High  
**Files:** `BurnupApi/Services/JwtService.cs`, `BurnupApi/Services/EmailService.cs`, `BurnupApi/Services/BurnupService.cs`, `BurnupApi/Data/DataStore.cs`

None of the services that are injected into controllers are backed by an interface. Every controller constructor references the concrete type directly:

```csharp
// AuthController.cs:12
public class AuthController(DataStore store, JwtService jwt, EmailService email, IConfiguration config)
```

Without interfaces, unit tests cannot substitute in-memory fakes or mocks. The entire test suite would need a real PostgreSQL database, a real SMTP server, and real JWT key material. Introducing `IDataStore`, `IJwtService`, `IEmailService`, and `IBurnupService` is the prerequisite for any meaningful unit testing of the controller layer.

---

### T-02 — `PasswordHasher<User>` Statically Instantiated in `DataStore`
**Severity:** 🟡 Medium  
**File:** `BurnupApi/Data/DataStore.cs:10`

```csharp
private static readonly PasswordHasher<User> Hasher = new();
```

`DataStore` constructs its own `PasswordHasher`. This cannot be replaced with a test double, making it impossible to test password-related flows without running the real bcrypt algorithm. Password verification should be extracted to a dedicated `IPasswordService` and injected.

---

### T-03 — `DomainService` and `WorkdayCalculator` Are Fully Static
**Severity:** 🟡 Medium  
**Files:** `BurnupApi/Services/DomainService.cs:5`, `BurnupApi/Services/WorkdayCalculator.cs`

All methods are `static`. Callers cannot inject alternative implementations. If the holiday calendar or status-derivation logic needs to vary by configuration (e.g. different locale, configurable work week), there is no seam to do so. The static nature also means tests cannot stub `WorkdayCalculator.CountWorkdays` to return deterministic values independent of the current date.

---

### T-04 — `DataStore` Is a God Class with 20+ Responsibilities
**Severity:** 🟡 Medium  
**File:** `BurnupApi/Data/DataStore.cs` (415 lines)

`DataStore` manages users, password hashing, password reset tokens, invites, app configuration, projects, project sharing, public tokens, cards, and daily snapshots — all in one class. Even with interfaces (T-01), a class this large is difficult to test in isolation because setting up all dependencies for a single test requires understanding the entire class. Splitting into focused repositories (e.g. `IUserRepository`, `IProjectRepository`, `ISnapshotRepository`) would make each piece independently testable.

---

### T-05 — Frontend Components Have No Isolation Boundary
**Severity:** 🟡 Medium  
**Files:** `project/src/auth.jsx`, `project/src/admin.jsx`, `project/src/cards.jsx`

Every React component calls `window.api.*` directly. There is no dependency-injection pattern and no way to provide a mock API to components during testing. A simple improvement is to accept an `api` prop (defaulting to `window.api`) so tests can inject a stub without patching globals.

---

### T-06 — Global `window.*` Namespace Used as Module System
**Severity:** 🟡 Medium  
**Files:** `project/src/api.jsx:36`, `project/src/app.jsx:1130`, `project/src/dashboard.jsx:565`, all other source files

Every module exports by assigning to `window`:
```javascript
window.api = { ... };
window.Dashboard = Dashboard;
window.CardsView = CardsView;
```

This makes the load order and presence of modules invisible to the language tooling. Tests must run all scripts in sequence to reconstruct the shared namespace, and a missing script silently produces `undefined` instead of a clear error.

---

### T-07 — `localStorage` Accessed Directly in Components
**Severity:** 🔵 Low  
**File:** `project/src/app.jsx:88–95,117–119`

```javascript
const [projectId, setProjectId] = React.useState(() =>
    localStorage.getItem('burnup.projectId') || null);
// ...
React.useEffect(() => { localStorage.setItem('burnup.projectId', projectId); }, [projectId]);
```

Direct `localStorage` calls in component bodies mean tests that run in a jsdom environment share storage state across test cases and cannot isolate persistence behaviour. Abstracting to a `useLocalStorage` hook or a storage service makes this injectable.

---

### T-08 — `SnapshotWorker` Swallows Failures with No Observable State
**Severity:** 🔵 Low  
**File:** `BurnupApi/Services/SnapshotWorker.cs:38–42`

```csharp
catch (Exception ex)
{
    logger.LogError(ex, "Daily snapshot failed.");
}
```

When a snapshot run fails, the error is logged but there is no metric, health-check flag, or persistent record. A test that exercises the failure path has no way to observe that something went wrong other than inspecting the logger. Exposing a `LastRunStatus` property or emitting a structured event would make failure observable.

---

## Clean Code

---

### C-01 — Role Names Are Magic Strings Scattered Across the Codebase
**Severity:** 🟠 High  
**Files:** `BurnupApi/Controllers/ProjectsController.cs:169–170`, `BurnupApi/Controllers/SharesController.cs:24`, `BurnupApi/Data/DataStore.cs:170,199,200`, `BurnupApi/Models/ProjectShare.cs:8`, `BurnupApi/Models/User.cs:8`

Role strings `"owner"`, `"admin"`, `"editor"`, `"viewer"`, `"user"` appear as raw string literals in at least 12 locations. A typo (`"edtior"`) would silently grant no access with no compiler warning. These should be centralised in a static class or enum:

```csharp
public static class Roles
{
    public const string Admin  = "admin";
    public const string User   = "user";
    public const string Owner  = "owner";
    public const string Editor = "editor";
    public const string Viewer = "viewer";
}
```

---

### C-02 — Card Type and Scope Values Are Magic Strings in Multiple Files
**Severity:** 🟡 Medium  
**Files:** `BurnupApi/Controllers/CardsController.cs:16–18`, `BurnupApi/Data/SeedData.cs:9`, `project/src/data.jsx:3–4`, `project/src/dashboard.jsx:449,456`

```csharp
// CardsController.cs
private static readonly string[] ValidTypes  = ["feature", "bug", "no-code", "tiny"];
private static readonly string[] ValidScopes = ["mvp", "mlp", "other"];
```

The same lists are independently defined in the backend and the frontend. A change to the valid types (e.g. adding `"chore"`) requires coordinated edits in at least four files. The backend should serve these as constants via the existing `/api/constants` endpoint (which already exists as `ConstantsController`), and the frontend should consume them rather than maintaining its own copy.

---

### C-03 — Date Format String `"yyyy-MM-dd"` Repeated Without a Constant
**Severity:** 🔵 Low  
**Files:** `BurnupApi/Controllers/ProjectsController.cs:155`, `BurnupApi/Controllers/PublicController.cs:25`, `BurnupApi/Controllers/CardsController.cs:141–146`, `BurnupApi/Data/SeedData.cs:110`

The format string `"yyyy-MM-dd"` appears at least eight times across controllers and data classes. A single `DateFormats.Iso` constant would eliminate the repetition and ensure consistency if the wire format ever changes.

---

### C-04 — `ValidateCard` Returns `true` on Error (Inverted Convention)
**Severity:** 🟡 Medium  
**File:** `BurnupApi/Controllers/CardsController.cs:152–192`

```csharp
private static bool ValidateCard(..., out string? error, ...)
{
    // ...
    { error = "Type must be one of: ..."; return true; }  // true = has error
    // ...
    error = null;
    return false; // false = valid
}
```

The method returns `true` when validation *fails* and `false` when it *succeeds*. This is the opposite of what most readers expect from a method named `ValidateCard`. The call site reads `if (ValidateCard(...)) return BadRequest(error)` — a reader unfamiliar with the convention must re-read the method to understand the polarity. Rename to `TryParseCard` returning `bool` for success, or return a `ValidationResult` type.

---

### C-05 — Token Expiration Durations Hardcoded as Magic Numbers
**Severity:** 🔵 Low  
**File:** `BurnupApi/Data/DataStore.cs:85,110`

```csharp
ExpiresAt = DateTime.UtcNow.AddHours(1),   // reset token
ExpiresAt = DateTime.UtcNow.AddDays(7),    // invite
```

These values are hardcoded and not configurable. A site operator who wants 15-minute reset tokens or 30-day invites must recompile. Named constants in a configuration class (`TokenExpiry.PasswordReset`, `TokenExpiry.Invite`) would at minimum make them visible and easily changeable.

---

### C-06 — `ClaimTypes.NameIdentifier` Parsed with Silent Fallback to `0`
**Severity:** 🟡 Medium  
**Files:** `BurnupApi/Controllers/AuthController.cs:97,103`, `BurnupApi/Controllers/ProjectsController.cs:16`, `BurnupApi/Controllers/CardsController.cs:21`, `BurnupApi/Controllers/SharesController.cs:11`, `BurnupApi/Controllers/AdminController.cs:13`

```csharp
private int CurrentUserId =>
    int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "0");
```

If the claim is somehow absent (malformed token, mis-configured middleware), `CurrentUserId` silently becomes `0`. A user with ID 0 does not exist, but downstream code may behave unexpectedly before the eventual `null` return from a database lookup. This pattern is repeated in five controllers. A shared base class or extension method that throws `InvalidOperationException` on a missing claim would make the failure loud and centralised.

---

### C-07 — `bool` Parameter `isSysAdmin` Without Named Argument at Call Sites
**Severity:** 🔵 Low  
**File:** `BurnupApi/Data/DataStore.cs` — method signatures; `BurnupApi/Controllers/ProjectsController.cs:22`, etc.

```csharp
store.GetProjectsWithRolesAsync(CurrentUserId, IsSysAdmin)
store.GetProjectForUserAsync(id, CurrentUserId, IsSysAdmin)
```

Boolean parameters at the end of a parameter list are a classic code smell. A reader of the call site cannot tell what `true` or `false` means without navigating to the declaration. Replacing the `bool` with an enum (`AccessLevel.SysAdmin`, `AccessLevel.Standard`) or using a method suffix (`GetProjectsForAdminAsync`) eliminates the ambiguity.

---

### C-08 — Inline SQL for Schema Migration Is Fragile
**Severity:** 🟠 High  
**File:** `BurnupApi/Program.cs:74–153`

```csharp
await db.Database.ExecuteSqlRawAsync(@"
    CREATE TABLE IF NOT EXISTS daily_snapshots (
        ""Id"" integer GENERATED BY DEFAULT AS IDENTITY,
        ...
    )");
```

Eighty lines of `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN IF NOT EXISTS` SQL run at startup replace a proper migration system. This approach:
- Does not track which DDL has been applied — every startup re-runs all statements
- Cannot handle column renames or type changes (only additive changes work safely)
- Makes it impossible to roll back a bad schema change
- Intermixes infrastructure code with application startup code

EF Core Migrations (`dotnet ef migrations add`) or a tool like Flyway/Liquibase should manage schema evolution instead.

---

### C-09 — `Card.Uid` Combines Project ID and a Counter Without Validation
**Severity:** 🟡 Medium  
**File:** `BurnupApi/Controllers/CardsController.cs:58`

```csharp
var uid = $"{req.ProjectId}:{Guid.NewGuid():N}";
```

`Uid` is a composite string built from the project ID plus a GUID. Code that parses the UID to extract the project ID (as the frontend does in `cards.jsx` to derive `displayId`) creates an implicit coupling to this format. If the format changes, callers break silently. The `ProjectId` field already exists on `Card`, so `Uid` should be an opaque string that carries no embedded meaning.

---

### C-10 — Password Minimum Length Validation Not Shared Between Endpoints
**Severity:** 🟡 Medium  
**File:** `BurnupApi/Controllers/AuthController.cs:74` vs. `AuthController.cs:24`

```csharp
// ResetPassword — has validation:
if (req.NewPassword.Length < 8)
    return BadRequest("Password must be at least 8 characters.");

// Register — no equivalent check
var user = await store.CreateUserAsync(normalizedEmail, req.Password);
```

Password validation exists only on the reset path. A user who registers directly can set a blank password. The minimum-length check (and any future complexity rules) should live in a shared validator applied to both endpoints.

---

### C-11 — Frontend Error Handling Silently Discards Context
**Severity:** 🔵 Low  
**File:** `project/src/cards.jsx:83–85`

```javascript
.catch(() => {
  // Silently revert isn't ideal, but keep it simple for now
});
```

Several `catch` blocks in the frontend discard errors entirely. A user whose API call fails receives no feedback and the UI state diverges silently from the server. A minimal improvement is to surface the error via a toast or the existing error state pattern used elsewhere in the app.

---

### C-12 — `DatabaseSeeder` Not Called Consistently
**Severity:** 🔵 Low  
**File:** `BurnupApi/Program.cs:155–158`

```csharp
var seeder = new DatabaseSeeder(db, ...);
await seeder.SeedAsync();
```

`DatabaseSeeder` is instantiated inside the startup retry loop, meaning the seeder is re-constructed on every retry. While `SeedAsync` is idempotent, the repeated construction is wasteful and the intent is unclear. More importantly, there is no test that verifies `SeedAsync` is called — a refactoring that moves the startup code could easily omit it.

---

## Architecture & Design

---

### A-01 — Authorization Logic Duplicated Across Controllers
**Severity:** 🟠 High  
**Files:** `BurnupApi/Controllers/ProjectsController.cs:168–170`, `BurnupApi/Controllers/CardsController.cs` (CanEdit), `BurnupApi/Controllers/SharesController.cs:24`

```csharp
// ProjectsController.cs
private static bool CanEdit(string role)   => role is "owner" or "admin" or "editor";
private static bool CanDelete(string role) => role is "owner" or "admin";

// SharesController.cs — inline version of the same check
if (role is not ("owner" or "admin")) return Forbid();
```

The same role hierarchy is expressed independently in three controllers. A fourth endpoint added later might get it wrong. ASP.NET Core's `IAuthorizationHandler` / policy-based authorization system should own this logic centrally:

```csharp
// One place:
options.AddPolicy("CanEditProject", policy =>
    policy.Requirements.Add(new ProjectRoleRequirement(ProjectRole.Editor)));
```

---

### A-02 — Burnup Calculation Exists in Two Languages
**Severity:** 🟠 High  
**Files:** `BurnupApi/Services/BurnupService.cs`, `project/src/dashboard.jsx:5–30`

The algorithm that determines whether a card contributes to "scope" and "done" on a given day is implemented in both C# (`DomainService.ComputeDayTotals`) and JavaScript (the `computeCustomSeries` function in `dashboard.jsx`). The two implementations will inevitably diverge as requirements change. The frontend's custom-chart feature already diverges: it filters by type/scope and re-derives the series client-side, but uses a simplified date comparison (`c.createdDate <= d`) that does not account for actual lead time. Either the frontend should always fetch filtered series from the backend, or the divergence must be explicitly documented and tested.

---

### A-03 — `DataStore` Has Too Many Responsibilities
**Severity:** 🟡 Medium  
**File:** `BurnupApi/Data/DataStore.cs` (415 lines, 9 distinct domain areas)

`DataStore` handles: user management, password hashing, password reset, invitation management, app configuration, project CRUD, project sharing, public tokens, card CRUD, and snapshot management. This is a textbook God Object. Changes to any one domain area require understanding the whole class. The class should be split into focused repositories — at minimum `UserRepository`, `ProjectRepository`, `CardRepository`, and `SnapshotRepository`.

---

### A-04 — Domain Models Are Anemic
**Severity:** 🟡 Medium  
**Files:** `BurnupApi/Models/Card.cs`, `BurnupApi/Models/Project.cs`, `BurnupApi/Models/User.cs`

All models are plain data containers with no behaviour or validation. Business rules — "a card is 'done' when `EndDate` is set", "a project is 'public' when `PublicToken` is non-null", "a user is 'active' when `IsActive` is true" — live in service classes, controllers, and the frontend. This leads to the same rule being re-expressed in multiple places. Encapsulating these invariants in the model itself (e.g. `card.IsCompleted`, `project.IsPublic`) removes duplication and makes invalid states harder to represent.

---

### A-05 — Holiday Calendar Is Hardcoded to German Holidays
**Severity:** 🟡 Medium  
**File:** `BurnupApi/Services/WorkdayCalculator.cs`

The workday calculator includes a hardcoded list of German public holidays (including regional ones like Corpus Christi that only apply in some German states). Teams in other countries get incorrect burnup calculations. The holiday set should be configurable — either via an `IHolidayProvider` interface with locale-specific implementations, or by allowing administrators to declare non-working days in the app's configuration.

---

### A-06 — No Transaction Scope on Multi-Step Delete Operations
**Severity:** 🟡 Medium  
**File:** `BurnupApi/Data/DataStore.cs:45–70` (`DeleteUserAsync`)

```csharp
db.ProjectShares.RemoveRange(await db.ProjectShares.Where(...).ToListAsync());
// ... more removals ...
db.Projects.RemoveRange(projects);
db.Users.Remove(user);
await db.SaveChangesAsync();
```

`DeleteUserAsync` assembles all removals and calls `SaveChangesAsync` once, which is correct within a single EF Core `DbContext` (all changes are committed atomically). However, `DeleteProjectAsync` and `DeleteUserAsync` contain separate `SaveChangesAsync` calls in older code paths. Any exception between calls leaves the database in a partial state. Each multi-step operation should be wrapped in an explicit `IDbContextTransaction` so the entire operation is atomic.

---

### A-07 — `BurnupService` Registered as Singleton but Depends on Request Data
**Severity:** 🔵 Low  
**File:** `BurnupApi/Program.cs:26`

```csharp
builder.Services.AddSingleton<BurnupService>();
```

`BurnupService` itself holds no state, so singleton lifetime is not harmful today. However, if a future change injects a scoped dependency (e.g. `DataStore`) into `BurnupService`, the DI container will throw at runtime with a scope-lifetime mismatch error. Registering it as `AddScoped` is safer and has no meaningful performance difference.

---

### A-08 — No Swagger Security Scheme Configured
**Severity:** 🔵 Low  
**File:** `BurnupApi/Program.cs:18`

```csharp
builder.Services.AddSwaggerGen(c =>
    c.SwaggerDoc("v1", new() { Title = "Burnup PM API", Version = "v1" }));
```

Swagger is enabled but there is no `AddSecurityDefinition` for JWT Bearer. The generated Swagger UI has no "Authorize" button, making it impossible to test authenticated endpoints interactively. Add:

```csharp
c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme { ... });
c.AddSecurityRequirement(new OpenApiSecurityRequirement { ... });
```

---

## Infrastructure & Operations

---

### I-01 — No Automated Tests Exist
**Severity:** 🔴 Critical  
**Files:** entire repository

There are no test projects, no test files, and no CI pipeline. Every change is deployed without automated verification. A bug introduced in `DataStore` or a controller can reach production undetected. The tight coupling described in the Testability section is both a symptom and a consequence of this — tests were never written because the code was never designed to be tested.

A minimal starting point: integration tests using `WebApplicationFactory<Program>` with a real (Docker-spun) Postgres instance for the API, and component tests using a mock `window.api` for the frontend's critical paths.

---

### I-02 — No CI/CD Pipeline
**Severity:** 🟠 High  
**Files:** `.github/` (absent)

There are no GitHub Actions workflows for build, test, or lint. A pull request receives no automated feedback and can be merged with compilation errors. A basic pipeline should run `dotnet build` and `dotnet test` on every push.

---

### I-03 — No Data Retention Policy for Expired Tokens and Invites
**Severity:** 🔵 Low  
**File:** `BurnupApi/Data/DataStore.cs`

Expired password-reset tokens and used/expired invites accumulate in the database indefinitely. The `CreateResetTokenAsync` method invalidates *active* tokens for a user when a new one is created, but spent tokens are never deleted. Over time this creates unbounded table growth and makes queries on these tables slower. A periodic cleanup job (or a `DeleteOlderThan` call at the top of `CreateResetTokenAsync`) should purge records older than e.g. 30 days.

---

### I-04 — No Pagination on Admin List Endpoints
**Severity:** 🔵 Low  
**File:** `BurnupApi/Controllers/AdminController.cs:20–24`

```csharp
var users = await store.GetAllUsersAsync();
return Ok(users.Select(...));
```

`GetUsers` returns every user in the database in a single response. At small scale this is harmless, but it becomes a performance issue as the user count grows and a potential DoS vector (an attacker triggering large response generation). Add `skip`/`take` query parameters or `page`/`pageSize` with a sensible maximum.

---

### I-05 — `AppUrl` Defaults to `localhost` in Password Reset Emails
**Severity:** 🔵 Low  
**File:** `BurnupApi/Controllers/AuthController.cs:62–63`

```csharp
var appUrl    = config["AppUrl"] ?? "http://localhost:5500";
var resetLink = $"{appUrl}/#/reset-password?token={token.Token}";
```

If `AppUrl` is not set in the environment, reset emails contain `http://localhost:5500` as the link — completely useless for a production user. The application should refuse to start (or at least log an error) if `AppUrl` is not configured, rather than silently falling back to a development value.

---

## Summary Table

| ID | Name | Severity | Category |
|----|------|----------|----------|
| S-01 | Over-Permissive CORS Policy | 🔴 Critical | Security |
| S-02 | No Rate Limiting on Auth Endpoints | 🔴 Critical | Security |
| S-03 | Security Tokens Generated with `Guid.NewGuid()` | 🟠 High | Security |
| S-04 | No Timing-Safe Token Comparison | 🟠 High | Security |
| S-05 | JWT in `localStorage` | 🟠 High | Security |
| S-06 | Reset Link Returned in API Response | 🟠 High | Security |
| S-07 | DB Credentials Hardcoded in Compose | 🟠 High | Security |
| S-08 | Generic Invite Tokens Are Open-Ended | 🟡 Medium | Security |
| S-09 | No Validation on Snapshot Numeric Fields | 🟡 Medium | Security |
| S-10 | No Content-Security-Policy Headers | 🟡 Medium | Security |
| S-11 | Password Length Not Enforced at Registration | 🔵 Low | Security |
| S-12 | Email Enumeration via Register Response | 🔵 Low | Security |
| T-01 | No Interfaces on Injectable Services | 🟠 High | Testability |
| T-02 | `PasswordHasher` Statically Instantiated | 🟡 Medium | Testability |
| T-03 | `DomainService` / `WorkdayCalculator` Are Static | 🟡 Medium | Testability |
| T-04 | `DataStore` Is a God Class | 🟡 Medium | Testability |
| T-05 | Frontend Components Not Isolated from API | 🟡 Medium | Testability |
| T-06 | `window.*` Used as Module System | 🟡 Medium | Testability |
| T-07 | `localStorage` Accessed Directly in Components | 🔵 Low | Testability |
| T-08 | `SnapshotWorker` Fails Silently | 🔵 Low | Testability |
| C-01 | Role Names Are Magic Strings | 🟠 High | Clean Code |
| C-02 | Card Types and Scopes Duplicated in Backend and Frontend | 🟡 Medium | Clean Code |
| C-03 | Date Format String `"yyyy-MM-dd"` Repeated | 🔵 Low | Clean Code |
| C-04 | `ValidateCard` Has Inverted Return Convention | 🟡 Medium | Clean Code |
| C-05 | Token Expiry Durations Are Magic Numbers | 🔵 Low | Clean Code |
| C-06 | `CurrentUserId` Silently Falls Back to `0` | 🟡 Medium | Clean Code |
| C-07 | Boolean `isSysAdmin` Parameter Is Unclear at Call Sites | 🔵 Low | Clean Code |
| C-08 | Schema Migration via Inline Raw SQL | 🟠 High | Clean Code |
| C-09 | `Card.Uid` Embeds Meaning in an Opaque Key | 🟡 Medium | Clean Code |
| C-10 | Password Validation Not Shared Between Endpoints | 🟡 Medium | Clean Code |
| C-11 | Frontend Silently Discards API Errors | 🔵 Low | Clean Code |
| C-12 | `DatabaseSeeder` Construction Inside Retry Loop | 🔵 Low | Clean Code |
| A-01 | Authorization Logic Duplicated Across Controllers | 🟠 High | Architecture |
| A-02 | Burnup Algorithm Exists in Two Languages | 🟠 High | Architecture |
| A-03 | `DataStore` Has Too Many Responsibilities | 🟡 Medium | Architecture |
| A-04 | Domain Models Are Anemic | 🟡 Medium | Architecture |
| A-05 | Holiday Calendar Hardcoded to German Holidays | 🟡 Medium | Architecture |
| A-06 | No Transaction Scope on Multi-Step Deletes | 🟡 Medium | Architecture |
| A-07 | `BurnupService` Registered as Singleton | 🔵 Low | Architecture |
| A-08 | No Swagger Security Scheme | 🔵 Low | Architecture |
| I-01 | No Automated Tests | 🔴 Critical | Infrastructure |
| I-02 | No CI/CD Pipeline | 🟠 High | Infrastructure |
| I-03 | No Data Retention for Expired Tokens | 🔵 Low | Infrastructure |
| I-04 | No Pagination on Admin List Endpoints | 🔵 Low | Infrastructure |
| I-05 | `AppUrl` Defaults to `localhost` in Emails | 🔵 Low | Infrastructure |

---

*45 findings total: 3 Critical · 12 High · 16 Medium · 14 Low*
