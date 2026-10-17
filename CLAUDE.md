## Project Overview

**Expense Tracker Backend** - REST API for personal expense management. Express + Node.js backend with PostgreSQL and Prisma ORM. Deployed on Railway.

Stack:
- **Runtime:** Node.js (LTS, CI runs on 20)
- **Framework:** Express 5.x (CommonJS modules)
- **Database:** PostgreSQL with Prisma ORM 5.x
- **Authentication:** JWT (jsonwebtoken + bcryptjs)
- **Security:** CORS restricted to `FRONTEND_URL`, rate limiting with `express-rate-limit`
- **Tooling:** ESLint + Prettier, GitHub Actions lint workflow
- **Environment:** Dotenv for config

Language: code, comments and identifiers in English; user-facing `message` strings in Spanish.

---

## Essential Commands

```bash
# Development (with hot reload, nodemon)
npm run dev

# Production
npm start

# DB Migrations
npm run prisma:migrate      # prisma migrate dev
npm run prisma:generate     # Regenerate Prisma Client
npx prisma studio           # View DB in GUI

# Code quality (the same checks CI runs on every PR to main)
npm run lint
npm run lint:fix
npm run format
npx prettier --check "src/**/*.js"
```

There is no test runner installed yet (no `npm test`). See the Testing section if you add one.

### Environment variables (`.env`, never committed)

| Variable | Notes |
|----------|-------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret used to sign/verify tokens |
| `PORT` | Defaults to `3001` |
| `NODE_ENV` | `development` / `production` |
| `FRONTEND_URL` | Only allowed CORS origin. Must be the full origin with scheme and **no trailing slash** (`http://localhost:3000`, `https://my-app.vercel.app`). It is compared as an exact string with the browser's `Origin` header, so `localhost:3000` or a trailing `/` never matches. Set the same variable in Railway. |

---

## Architecture and Structure

### Folder structure

```
src/
├── server.js                  # Entry point: CORS, JSON parsing, route mounting, error handler
├── controllers/               # Business logic (validations, DB operations)
│   ├── accountController.js
│   ├── authController.js
│   ├── budgetController.js
│   ├── cardController.js
│   ├── categoryController.js
│   ├── expenseController.js
│   ├── incomeController.js
│   ├── reportController.js
│   └── userController.js
├── routes/                    # Endpoint definitions (one file per resource, singular names)
│   ├── account.js  auth.js  budget.js  card.js  category.js
│   └── expense.js  income.js  report.js  user.js
├── middleware/
│   ├── authMiddleware.js      # JWT validation, sets req.user
│   └── rateLimiter.js         # authLimiter: 10 attempts / 15 min per IP
├── helpers/
│   ├── prisma.js              # Shared PrismaClient (single connection pool)
│   └── constants.js           # ERROR_MESSAGES (Spanish user-facing messages)
└── utils/
    └── billingCalculator.js   # calculateBillingMonth(expenseDate, cardCloseDay)
prisma/
├── schema.prisma
└── migrations/
```

The centralized error handler is currently an inline `app.use((err, req, res, next) => ...)` at the bottom of `server.js` (returns `500 SERVER_ERROR`). There is no separate `errorHandler.js`, `utils/jwt.js` or `utils/validators.js`.

### API surface

All routes are mounted under `/api` in `server.js`. Everything except `register`, `login` and `/api/test` requires `authMiddleware`.

| Prefix | Endpoints |
|--------|-----------|
| `/api/auth` | `POST /register`, `POST /login` (rate limited), `GET /profile` |
| `/api/users` | `GET /:id`, `PUT /:id`, `DELETE /:id` |
| `/api/accounts` | `POST /`, `GET /`, `GET /:id`, `PUT /:id`, `DELETE /:id` |
| `/api/cards` | `POST /`, `GET /account/:accountId`, `PUT /:id`, `PATCH /:id/cancel`, `DELETE /:id` |
| `/api/categories` | `POST /`, `GET /`, `PUT /:id` |
| `/api/expenses` | `POST /`, `GET /`, `GET /:id`, `PUT /:id`, `DELETE /:id` |
| `/api/incomes` | `POST /`, `GET /`, `GET /:id`, `PUT /:id`, `DELETE /:id` |
| `/api/budgets` | `POST /`, `GET /`, `GET /:id`, `PUT /:id`, `DELETE /:id` |
| `/api/reports` | `GET /monthly`, `/summary`, `/category`, `/cards`, `/comparison`, `/budget-status`, `/income-ratio` |
| `/api/test` | `GET` health check |

### Request flow pattern

**Request → CORS → JSON parser → (authLimiter) → authMiddleware → Route → Controller → Prisma → Response**

```javascript
// routes/expense.js
router.post('/', authMiddleware, expenseController.createExpense);

// controllers/expenseController.js
exports.createExpense = async (req, res, next) => {
  try {
    // 1. Validate input
    // 2. Check the account belongs to req.user.id
    // 3. Calculate billing month / installments
    // 4. Save to DB inside prisma.$transaction
    // 5. Respond
  } catch (error) {
    next(error); // Error middleware
  }
};
```

`app.set('trust proxy', 1)` is set in `server.js` because Railway sits behind one reverse proxy. Without it `req.ip` would be the proxy's IP and every user would share one rate-limit counter. If another proxy (e.g. Cloudflare) is ever added in front, this number must change.

### Database (Prisma)

- **Location:** `prisma/schema.prisma` (migrations in `prisma/migrations/`)
- **Always import the shared client:** `const prisma = require('../helpers/prisma');`. Never call `new PrismaClient()` in a controller.
- **Models and relations:**
  - `User` → many `Account`, many `Category` (categories are per user)
  - `Account` → many `Card`, `Expense`, `Income`, `Budget`
  - `Card` → many `ExpenseCard`, many `Installment`. Has `type` (`credit` | `debit`), `closeDay` (credit only), `balance` (debit only), `isActive` / `cancelledAt` (soft cancel)
  - `Expense` → belongs to a `Category`; optional one-to-one `ExpenseCard` (link to the card used); many `Installment`
  - `Budget` → per account + category + month + year (unique together); either a fixed `amount` or a `minAmount`/`maxAmount` range
  - `Income` → belongs to an `Account` (`source`: salary, sales, investment, other)
- Deleting a `User`, `Account`, `Card` or `Expense` cascades to its children.
- **Critical rule:** `billingMonth`/`billingYear` on an expense are calculated from `date` vs the card's `closeDay`.

---

## Code Conventions

### Variable and function names

```javascript
// Controllers: verb + noun, exported as exports.<name>
exports.createExpense = async (req, res, next) => {}
exports.getBudgetById = async (req, res, next) => {}

// Variables: camelCase
const userId = req.user.id;
const installmentAmount = expense.amount / totalInstallments;

// Constants: UPPER_SNAKE_CASE
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_MAX_ATTEMPTS = 10;

// Booleans: is/has/can prefix
const isActive = card.isActive;
const hasPermission = account.userId === req.user.id;
```

### Formatting

Prettier is enforced in CI (`.prettierrc`): semicolons, single quotes, 2 spaces, trailing commas `es5`, print width 100. Run `npm run format` and `npm run lint` before pushing.

### Response structure

**Success (200, 201):**
```javascript
res.status(201).json({
  success: true,
  data: { id: 1, description: "Supermercado", amount: 50.00 },
  message: "Gasto creado exitosamente"
});
```
(`/api/auth/register` and `/login` also return the JWT as a top-level `token` field next to `data`.)

**Error (400, 401, 403, 404, 429, 500):**
```javascript
res.status(400).json({
  success: false,
  error: "VALIDATION_ERROR",
  message: ERROR_MESSAGES.AMOUNT_MORE_0
});
```

Error codes used so far include `VALIDATION_ERROR`, `INVALID_AMOUNT`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_CREDENTIALS`, `NO_TOKEN`, `INVALID_TOKEN`, `CARD_NOT_FOUND`, `CARD_CANCELLED`, `TOO_MANY_REQUESTS` and `SERVER_ERROR`.

### Error messages

User-facing messages live in `src/helpers/constants.js` as `ERROR_MESSAGES` (Spanish). Add new messages there and reference them (`ERROR_MESSAGES.CARD_CANCELLED`) instead of inlining strings. Some older controllers still have inline strings; migrate them when you touch that code.

### Error handling

```javascript
// ✅ CORRECT: Catch and pass to middleware
try {
  const expense = await prisma.expense.create({ data });
  res.status(201).json({ success: true, data: expense, message: '...' });
} catch (error) {
  next(error); // Error middleware handles it
}

// ❌ INCORRECT: res.send called twice
try {
  // ...
  res.json(data);
} catch (error) {
  res.status(500).send(error); // ERROR: Response already sent
}
```

### Auth middleware

```javascript
// src/middleware/authMiddleware.js (current implementation)
const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'NO_TOKEN',
        message: 'Token requerido. Formato: Bearer <token>',
      });
    }

    const token = authHeader.split(' ')[1];
    req.user = jwt.verify(token, process.env.JWT_SECRET); // { id, email, iat, exp }
    next();
  } catch {
    return res.status(401).json({
      success: false,
      error: 'INVALID_TOKEN',
      message: 'Token inválido o expirado',
    });
  }
};
```

### Rate limiting

`src/middleware/rateLimiter.js` exports `authLimiter` (10 requests per 15 minutes per IP, answers `429 TOO_MANY_REQUESTS` in the standard response shape, with `RateLimit` / `Retry-After` headers). It is applied only to `POST /register` and `POST /login`, not to the whole `/api/auth` prefix, because `GET /profile` is called on every page load and would lock out normal users. Counters are in memory: they reset on restart and are not shared between instances (use a shared store such as Redis if the app is ever scaled horizontally).

---

## Critical Business Rules

### Billing month calculation for card expenses

Implemented in `src/utils/billingCalculator.js`:

```javascript
// If the card closes on the 25th and expense is on the 26th → next month
calculateBillingMonth(new Date(date), card.closeDay);
// → { billingMonth: 1-12, billingYear: 2026 }
```

- **Credit card:** `day > closeDay` → billed next month (December rolls to January of the next year), otherwise the same month.
- **Debit card:** billed the same month as the expense date; the expense amount is decremented from `card.balance`.
- **Cash / transfer / other:** billed the same month as the expense date.

### Installment expenses

Every expense paid with a card gets `Installment` rows (`totalInstallments` defaults to 1):

- Credit card, `totalInstallments > 1` → one `Installment` per installment, `paymentMonth = billingMonth + i` (the first payment is the month AFTER the billing month; roll the year when the month exceeds 12). The expense's `paymentMethod` becomes `card-installments-<n>`.
- Credit card, single payment → one `Installment` with `paymentMonth = billingMonth + 1`.
- Debit card → one `Installment` in the billing month itself.
- `installmentAmount = totalAmount / totalInstallments`
- Reports show expenses by `billingMonth` and installments by `paymentMonth`, so the monthly report only shows the installment due THAT month.
- Changing the payment method to or from credit-card installments is not supported on update; the user must delete the expense and create it again (`UNSUPORTED_UPDATE_*` messages).

### Atomic writes

Any operation that writes more than one table (expense + `ExpenseCard` + `Installment` + card balance) must run inside `prisma.$transaction(async (tx) => { ... })` and use `tx` for every query inside it, so an error rolls everything back.

### Cancelled cards

`PATCH /api/cards/:id/cancel` sets `isActive = false` and `cancelledAt`. History is kept, but new expenses with a cancelled card are rejected with `CARD_CANCELLED`.

---

## Security and Validation

### Input validation (in controller)

```javascript
// ✅ CORRECT
if (!accountId || !description || !amount || !date || !categoryId || !paymentMethod) {
  return res.status(400).json({
    success: false,
    error: 'VALIDATION_ERROR',
    message: 'La cuenta, descripcion, monto, fecha, categoria y medio de pago son requeridos',
  });
}

if (amount <= 0) {
  return res.status(400).json({
    success: false,
    error: 'INVALID_AMOUNT',
    message: ERROR_MESSAGES.AMOUNT_MORE_0,
  });
}

// ✅ Use Prisma for relation validation + check ownership (ids from req.body/query are strings)
const account = await prisma.account.findUnique({ where: { id: parseInt(accountId) } });
if (!account || account.userId !== req.user.id) {
  return res.status(403).json({ success: false, error: 'FORBIDDEN', message: '...' });
}
```

### Passwords and JWT

```javascript
// ✅ Hash password before saving
const hashedPassword = await bcrypt.hash(password, 10);

// ✅ Compare password
const isValidPassword = await bcrypt.compare(password, user.password);

// ✅ Create JWT with expiration (payload is { id, email })
const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, {
  expiresIn: '7d',
});
```

### CORS

`app.use(cors({ origin: process.env.FRONTEND_URL }))`. Only the configured frontend origin gets an `Access-Control-Allow-Origin` header. If `FRONTEND_URL` is missing, the browser blocks every cross-origin request (it fails closed). Do not go back to `cors()` with no options.

---

## New Endpoint Checklist

When adding a new route, make sure to:

- [ ] **Validate input** in controller (type, values, required fields; `parseInt` ids coming from the client)
- [ ] **Validate permissions** (user owns the resource, usually through `account.userId`)
- [ ] **Handle errors** with try/catch → next(error)
- [ ] **Respond with uniform structure** (success, data, message / error, message)
- [ ] **Add new messages to `ERROR_MESSAGES`** instead of inlining strings
- [ ] **Use camelCase** in JSON responses
- [ ] **Use authMiddleware** if authentication is required
- [ ] **Use `prisma.$transaction`** when writing to more than one table
- [ ] **Add a rate limiter** if the route is public and sensitive (login-like)
- [ ] **Document business rules** if any (e.g.: billing month logic)
- [ ] **Register the route** in `server.js` and update the API surface table above
- [ ] **Run `npm run lint` and `npx prettier --check "src/**/*.js"`**
- [ ] **Test edge cases** (negative values, null, non-owner user)

---

## Recommended Endpoint Pattern

```javascript
// routes/expense.js
router.post('/', authMiddleware, expenseController.createExpense);

// controllers/expenseController.js
const { ERROR_MESSAGES } = require('../helpers/constants');
const { calculateBillingMonth } = require('../utils/billingCalculator');
const prisma = require('../helpers/prisma');

exports.createExpense = async (req, res, next) => {
  try {
    // 1. Extract data
    const { accountId, description, amount, date, categoryId, paymentMethod, cardId } = req.body;
    const userId = req.user.id;

    // 2. Validate input
    if (!accountId || !description || !amount || !date || !categoryId || !paymentMethod) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'La cuenta, descripcion, monto, fecha, categoria y medio de pago son requeridos',
      });
    }

    // 3. Validate permissions (user owns the account)
    const account = await prisma.account.findUnique({ where: { id: parseInt(accountId) } });
    if (!account || account.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'No tienes permiso para agregar gastos a esta cuenta',
      });
    }

    // 4. Apply business logic (credit card → use the real card.closeDay)
    const card = await prisma.card.findUnique({ where: { id: parseInt(cardId) } });
    const { billingMonth, billingYear } = calculateBillingMonth(new Date(date), card.closeDay);

    // 5. Save to DB atomically
    const expense = await prisma.$transaction(async (tx) => {
      const created = await tx.expense.create({
        data: {
          accountId: parseInt(accountId),
          description: description.trim(),
          amount: parseFloat(amount),
          date: new Date(date),
          categoryId: parseInt(categoryId),
          paymentMethod,
          billingMonth,
          billingYear,
        },
      });
      // ...ExpenseCard / Installment rows with tx.*
      return created;
    });

    // 6. Respond
    res.status(201).json({
      success: true,
      data: expense,
      message: 'Gasto creado exitosamente',
    });
  } catch (error) {
    next(error); // Error middleware
  }
};
```

(Simplified. See `expenseController.js` for the complete card/installment/debit-balance logic, including the null checks on `card`.)

---

## Testing (when you add tests)

No test framework is installed yet. If you add one (Jest + Supertest are the natural choice), also add `test` and `test:watch` scripts to `package.json`. Note `server.js` already does `module.exports = app` and calls `app.listen`, so tests will need `app` exported without listening (or a separate `app.js`).

```javascript
// tests/expense.test.js
describe('POST /api/expenses', () => {
  it('should create a valid expense', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'Test', amount: 50, date: new Date() });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('should reject negative amount', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'Test', amount: -50 });

    expect(res.status).toBe(400);
  });
});
```

---

## CI and Workflow

- `.github/workflows/lint.yml` runs on pushes and PRs to `main`: `npm install`, `npm run lint`, `npx prettier --check "src/**/*.js"`, `npx prisma generate`. A PR with lint or format errors will fail.
- Work happens on short-lived branches (`feature/*`, `fix/*`, `internal-qa/*`) merged into `main` through pull requests.
- Deployed on Railway; environment variables (including `FRONTEND_URL`) are configured there, not in the repo.

---

## Common Mistakes to Avoid

```javascript
// ❌ Don't query without null check
const expense = await prisma.expense.findUnique({ where: { id: id } });
// If null, the next line will crash

// ✅ Do this instead
const expense = await prisma.expense.findUnique({ where: { id } });
if (!expense) return res.status(404).json({ success: false, error: 'NOT_FOUND', message: '...' });

// ❌ Don't create a new PrismaClient per file
const prisma = new PrismaClient();
// ✅ Use the shared one
const prisma = require('../helpers/prisma');

// ❌ Don't use the global prisma inside a $transaction callback
await prisma.$transaction(async (tx) => { await prisma.card.update(...) }); // not rolled back
// ✅ Use tx
await prisma.$transaction(async (tx) => { await tx.card.update(...) });

// ❌ Don't store plain text passwords
await prisma.user.create({ data: { password } });

// ❌ Don't trust the client to validate permissions
// Frontend says "I'm admin" → Backend must verify

// ❌ Don't hardcode secrets or the frontend URL
const JWT_SECRET = "abc123"; // ❌
const JWT_SECRET = process.env.JWT_SECRET; // ✅

// ❌ Don't set FRONTEND_URL without the scheme or with a trailing slash
FRONTEND_URL=localhost:3000          // ❌ never matches the Origin header
FRONTEND_URL=http://localhost:3000/  // ❌ trailing slash
FRONTEND_URL=http://localhost:3000   // ✅
```

---

@.claude/node-express-teaching.md
