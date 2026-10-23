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
│   ├── installmentController.js
│   ├── reportController.js
│   ├── userController.js
│   └── walletController.js
├── routes/                    # Endpoint definitions (one file per resource, singular names)
│   ├── account.js  auth.js  budget.js  card.js  category.js
│   └── expense.js  income.js  installment.js  report.js  user.js  wallet.js
├── middleware/
│   ├── authMiddleware.js      # JWT validation, sets req.user
│   ├── timeZoneMiddleware.js  # reads the X-Timezone header, sets req.timeZone (global)
│   └── rateLimiter.js         # authLimiter: 10 attempts / 15 min per IP
├── helpers/
│   ├── prisma.js              # Shared PrismaClient (single connection pool); Decimal.toJSON -> number
│   ├── constants.js           # ERROR_MESSAGES (Spanish user-facing messages)
│   ├── wallet.js              # takeFromWallet / putIntoWallet / changeWallet, InsufficientFundsError
│   └── expenseEffect.js       # applyExpenseEffect / revertExpenseEffect (where an expense's money comes from)
└── utils/
    ├── billingCalculator.js   # calculateBillingMonth(expenseDate, cardCloseDay)
    ├── money.js               # parseAmount, splitAmount, sumField, ZERO (Decimal helpers)
    ├── paymentMethod.js       # CARD_METHODS / NON_CARD_METHODS, normalizePaymentMethod (enum check)
    └── timeZone.js            # resolveTimeZone (validates, falls back), getCurrentMonth(timeZone)
prisma/
├── schema.prisma
└── migrations/
```

The centralized error handler is currently an inline `app.use((err, req, res, next) => ...)` at the bottom of `server.js`. It maps `InsufficientFundsError` to a `400` (`INSUFFICIENT_FUNDS` / `INSUFFICIENT_CARD_FUNDS`) and answers every other error with `500 SERVER_ERROR`. There is no separate `errorHandler.js`, `utils/jwt.js` or `utils/validators.js`.

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
| `/api/wallets` | `GET /account/:accountId` (with the calculated total), `POST /account/:accountId` (activate with initial balance), `PUT /account/:accountId` (set the new total value) |
| `/api/installments` | `GET /due?accountId=` (preview of what would be paid), `POST /pay` with `{ accountId, expectedTotal }` (pay every overdue installment) |
| `/api/reports` | `GET /monthly`, `/summary`, `/category`, `/cards`, `/comparison`, `/budget-status`, `/income-ratio` |
| `/api/test` | `GET` health check |

### Request flow pattern

**Request → CORS → JSON parser → timeZoneMiddleware → (authLimiter) → authMiddleware → Route → Controller → Prisma → Response**

**Time zone:** the server clock is UTC, so "the current month" depends on the user. The frontend sends the browser's IANA zone in an `X-Timezone` header on every request (`Intl.DateTimeFormat().resolvedOptions().timeZone`) and `timeZoneMiddleware` exposes it as `req.timeZone`. A missing or unknown value falls back to `America/Argentina/Buenos_Aires` (the production users) and never fails the request. Use `getCurrentMonth(req.timeZone)` from `src/utils/timeZone.js`, never `new Date().getMonth()`, for anything that depends on the current month. The one exception is SQL migrations, which have no browser and use Buenos Aires time. CORS needs no extra config: the `cors` package reflects the preflight's requested headers.

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
  - `Account` → many `Card`, `Expense`, `Income`, `Budget`; optional one-to-one `Wallet`
  - `Wallet` → `accountId` unique, `balance Decimal(12,2)` (default 0, never negative: DB `CHECK`). See the Wallet section
  - `Installment` → `isPayed`, `paidAt`, `walletApplied` (see the Installment expenses and Wallet sections)
  - `Card` → many `ExpenseCard`, many `Installment`. Has `type` (`credit` | `debit`), `closeDay` (credit only), `balance` (debit only), `isActive` / `cancelledAt` (soft cancel)
  - `Expense` → belongs to a `Category`; optional one-to-one `ExpenseCard` (link to the card used); many `Installment`. `paymentMethod` is the `PaymentMethod` enum: `CASH`, `TRANSFER`, `DEBIT`, `CREDIT`, `OTHER`. Has `walletApplied`.
  - `Budget` → per account + category + month + year (unique together); either a fixed `amount` or a `minAmount`/`maxAmount` range
  - `Income` → belongs to an `Account` (`source`: salary, sales, investment, other). Has `walletApplied`.
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
  error: "INVALID_AMOUNT",
  message: ERROR_MESSAGES.INVALID_AMOUNT
});
```

Error codes used so far include `VALIDATION_ERROR`, `INVALID_AMOUNT`, `INVALID_PAYMENT_METHOD`, `INSUFFICIENT_FUNDS` (wallet), `INSUFFICIENT_CARD_FUNDS`, `INSTALLMENTS_CHANGED`, `NO_INSTALLMENTS_DUE`, `UNSUPPORTED_OPERATION`, `CONFLICT`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_CREDENTIALS`, `NO_TOKEN`, `INVALID_TOKEN`, `CARD_NOT_FOUND`, `CARD_CANCELLED`, `TOO_MANY_REQUESTS` and `SERVER_ERROR`.

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
- **Debit card:** billed the same month as the expense date; the expense amount is decremented from `card.balance` (and blocked if the card is short, but only on accounts with a wallet; see the Wallet section).
- **Cash / transfer / other:** billed the same month as the expense date.

### Installment expenses

Every expense paid with a card gets `Installment` rows (`totalInstallments` defaults to 1):

- Credit card, `totalInstallments > 1` → one `Installment` per installment, `paymentMonth = billingMonth + i` (the first payment is the month AFTER the billing month; roll the year when the month exceeds 12). The expense's `paymentMethod` is `CREDIT`; the installment count lives only in `Installment.totalInstallments`.
- Credit card, single payment → one `Installment` with `paymentMonth = billingMonth + 1`.
- Debit card → one `Installment` in the billing month itself, **born paid** (`isPayed = true`, `paidAt = now`, `walletApplied = false`) because the card balance was already charged.
- `installmentAmount = totalAmount / totalInstallments`
- Reports show expenses by `billingMonth` and installments by `paymentMonth`, so the monthly report only shows the installment due THAT month. Installment items in the monthly and cards reports carry `isPayed`.
- **Paying installments** (`installmentController`): a manual, irreversible action. The overdue installments are the unpaid ones whose payment month is **before** the current month in `req.timeZone` (an installment of the current month is paid next month). `GET /api/installments/due` previews `{ count, total, month, year, timeZone }`. `POST /api/installments/pay` takes the `expectedTotal` the user confirmed: if it no longer matches, or the installments were already paid, it answers `409 INSTALLMENTS_CHANGED`; with nothing overdue, `400 NO_INSTALLMENTS_DUE`. In one transaction it marks them (`updateMany` filtered by `isPayed: false`, which is what stops a double click, and it runs BEFORE the wallet is touched), sets `paidAt`, and on an account with a wallet takes the whole total (`takeFromWallet`), setting `walletApplied = true`. If the wallet is short nothing is paid. On an account without a wallet it only marks them (`walletApplied = false`). There is no way to un-pay: a mistaken payment is corrected by editing the wallet by hand.
- Installments that existed before the payment feature were backfilled by the migration: debit ones and credit ones from months before the migration month are paid, with `paidAt = null` and `walletApplied = false`.
- Changing the payment method to or from `CREDIT` is not supported on update; the user must delete the expense and create it again (`UNSUPORTED_UPDATE_CREDIT_CARD` / `CREDIT_CARD_NOT_UPDATAED`).
- A `CREDIT` expense only allows editing description, category and notes. Changing its amount, date or card is rejected (`400 UNSUPPORTED_OPERATION`, `CREDIT_EXPENSE_LIMITED_EDIT`); sending the stored values again is accepted. Cash, transfer, other and debit expenses can change amount and date, and their `billingMonth`/`billingYear` (and the debit installment) follow the date.

### Payment method (`PaymentMethod` enum)

- `DEBIT` and `CREDIT` require a `cardId` whose `type` matches; `CASH`, `TRANSFER` and `OTHER` must not send one. The card type, not the client, decides debit vs credit, and a mismatch is rejected (`PAYMENT_METHOD_CARD_MISMATCH`). Invalid values return `400 INVALID_PAYMENT_METHOD`.
- Import the enum from `@prisma/client` and the groupings from `src/utils/paymentMethod.js`. Never compare against string literals like `'card'`.
- The API only accepts the enum values (uppercase). The old lowercase values (`cash`, `card`, `card-installments-<n>`, ...) are rejected with `400 INVALID_PAYMENT_METHOD`.

### Money amounts

- Every amount column is `Decimal(12, 2)`. Validate request amounts with `parseAmount(value, { allowZero })` from `src/utils/money.js`: it returns an exact `Prisma.Decimal`, or `null` for anything that is not a number, is negative (or 0 unless `allowZero`), has more than 2 decimals or exceeds `9999999999.99`. Answer `null` with `400 INVALID_AMOUNT` (`ERROR_MESSAGES.INVALID_AMOUNT`, or `INVALID_AMOUNT_OR_ZERO` where 0 is valid, e.g. a card or wallet balance). Never use `parseFloat` on money.
- Never compare `Decimal`s with `<`, `>=` or `==`: JavaScript compares them as strings (`Decimal(9) >= Decimal(10)` is `true`). Use `.gt() .gte() .lt() .lte() .equals()`.
- `src/helpers/prisma.js` overrides `Decimal.toJSON`, so responses carry amounts as plain numbers.

### Atomic writes

Any operation that writes more than one table (expense + `ExpenseCard` + `Installment` + card balance + wallet) must run inside `prisma.$transaction(async (tx) => { ... })` and use `tx` for every query inside it, so an error rolls everything back. A blocked operation (`InsufficientFundsError`) rolls back everything in the same request, including the description or any other field sent with it.

### Wallet (optional per account)

An account may have one `Wallet`: its free money, outside the debit cards. It is activated, read and edited through `/api/wallets/account/:accountId` (the `PUT` sets a new total value; it is a correction, not an income). The total balance (`walletBalance + balance of the ACTIVE debit cards`) is calculated on read and never stored.

**An account without a wallet works exactly as before.** Every rule below applies only once the wallet is activated, and no existing record is touched retroactively.

- **Helpers (`src/helpers/wallet.js`):** `takeFromWallet(tx, accountId, amount)`, `putIntoWallet(tx, accountId, amount)` and `changeWallet(tx, accountId, delta)` (positive puts money in, negative takes it out). Always pass the transaction client `tx`. They return `{ applied }`; `applied: false` means the account has no wallet and nothing was touched. `takeFromWallet` is a single conditional `UPDATE ... WHERE balance >= amount`. Never read the balance and then write it: two requests could both pass the check. If the money is not there it throws `InsufficientFundsError`, which the error handler turns into `400 INSUFFICIENT_FUNDS` ("Faltan <amount>").
- **`walletApplied` (on `Expense` and `Income`):** set from the helper's `applied` when the effect is applied. Only what was really applied is reverted. Records created before the wallet existed stay `false` and never move the wallet, not even when edited or deleted. For a `DEBIT` expense it means "the account had a wallet when it was applied".
- **Incomes:** create puts the amount in; editing the amount moves only the difference; delete takes the amount out. Lowering or deleting an income is blocked when the wallet no longer holds that money.
- **Expenses** (money logic in `src/helpers/expenseEffect.js`): `CASH`, `TRANSFER` and `OTHER` take the amount from the wallet; delete puts it back. `DEBIT` takes it from the card balance, and is blocked (`INSUFFICIENT_CARD_FUNDS`) if the card is short, but only on accounts with a wallet. `CREDIT` does not move the wallet when it is bought (paying its installments does); deleting a credit expense gives back only the installments that were paid through the wallet (`isPayed` and `walletApplied`), never unpaid ones or ones paid on an account without a wallet. An edit that changes the method, amount or card is done as revert-then-apply in one transaction, so only the real difference has to be available.
- **Debit refunds:** an active card gets its money back. If the card was cancelled or deleted, the refund goes to the wallet (when the expense was tracked). A `DEBIT` expense whose card is cancelled or gone cannot change amount or card until the user picks an active card or another method; editing description, category or notes is always allowed.
- **Debit cards:** creating one with a balance takes that balance from the wallet; editing the balance moves the difference (loading takes from the wallet, lowering gives back); cancelling gives the whole balance back and sets it to 0; deleting an active card gives back its remaining balance (the expenses stay, without a card link). A cancelled card's balance cannot be edited (`CARD_CANCELLED_BALANCE`).
- **Installment payments** move the wallet too (see the Installment expenses section). `Installment.walletApplied` follows the same rule as the other `walletApplied` fields: only what was really applied is reverted.
- **Not implemented yet (last phase of the design):** `MonthClosing` and the lock on closed months. Until then every month counts as open, so deleting a credit expense refunds all of its paid installments.

### Cancelled cards

`PATCH /api/cards/:id/cancel` sets `isActive = false` and `cancelledAt`. History is kept, but new expenses with a cancelled card are rejected with `CARD_CANCELLED`. On an account with a wallet, a debit card's remaining balance goes back to the wallet and the card is left at 0.

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

const parsedAmount = parseAmount(amount); // exact Prisma.Decimal, or null (never parseFloat)
if (!parsedAmount) {
  return res.status(400).json({
    success: false,
    error: 'INVALID_AMOUNT',
    message: ERROR_MESSAGES.INVALID_AMOUNT,
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
- [ ] **Validate amounts with `parseAmount`** (never `parseFloat`) and compare `Decimal`s with their methods
- [ ] **Use the wallet helpers inside the transaction** if the route moves money, and store `walletApplied` from their result (see the Wallet section)
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
const { parseAmount } = require('../utils/money');
const { applyExpenseEffect } = require('../helpers/expenseEffect');
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

    const parsedAmount = parseAmount(amount); // exact Prisma.Decimal, or null
    if (!parsedAmount) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_AMOUNT',
        message: ERROR_MESSAGES.INVALID_AMOUNT,
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
      // Take the money from the wallet / debit card first; throws if it is short
      const { walletApplied } = await applyExpenseEffect(tx, {
        accountId: account.id,
        method: paymentMethod,
        amount: parsedAmount,
        cardId: cardId ? parseInt(cardId) : null,
      });

      const created = await tx.expense.create({
        data: {
          accountId: account.id,
          description: description.trim(),
          amount: parsedAmount,
          date: new Date(date),
          categoryId: parseInt(categoryId),
          paymentMethod,
          billingMonth,
          billingYear,
          walletApplied,
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

(Simplified. See `expenseController.js` for the complete card/installment logic, including the null checks on `card`, and the update flow that reverts the old effect before applying the new one.)

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
