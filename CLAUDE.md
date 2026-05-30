
---

## Project Overview

**Expense Tracker Backend** - REST API for personal expense management. Express + Node.js backend with PostgreSQL and Prisma ORM.

Stack:
- **Runtime:** Node.js (LTS)
- **Framework:** Express 4.x
- **Database:** PostgreSQL with Prisma ORM
- **Authentication:** JWT (jsonwebtoken + bcryptjs)
- **Environment:** Dotenv for config

---

## Essential Commands

```bash
# Development (with hot reload)
npm run dev

# Production
npm start

# DB Migrations
npm run prisma:migrate      # Create/run migrations
npx prisma studio          # View DB in GUI
npx prisma generate        # Regenerate Prisma Client

# Testing (when you add tests)
npm test
npm run test:watch
```

---

## Architecture and Structure

### Folder structure

```
src/
├── server.js              # Entry point, Express configuration
├── controllers/           # Business logic (validations, DB operations)
│   ├── authController.js
│   ├── expensesController.js
│   ├── reportsController.js
│   └── usersController.js
├── routes/                # Endpoint definitions
│   ├── auth.js
│   ├── users.js
│   ├── accounts.js
│   ├── cards.js
│   └── expenses.js
├── middleware/            # Middleware functions
│   ├── authMiddleware.js  # JWT validation
│   └── errorHandler.js    # Centralized error handling
└── utils/                 # Helper functions
    ├── jwt.js             # Create/validate tokens
    └── validators.js      # Reusable validators
```

### Request flow pattern

**Request → Middleware → Route → Controller → Prisma → Response**

```javascript
// routes/expenses.js
router.post('/', authMiddleware, expensesController.create);

// controllers/expensesController.js
const create = async (req, res) => {
  try {
    // 1. Validate input
    // 2. Calculate billing month
    // 3. Save to DB
    // 4. Respond
  } catch (error) {
    // Pass to error middleware
  }
};
```

### Database (Prisma)

- **Location:** `prisma/schema.prisma`
- **Key relations:**
  - `User` → many `Account`
  - `Account` → many `Expense`, many `Card`
  - `Expense` → can have `Installment` (if installment-based)
  - `Card` → many `Installment`
- **Critical rule:** `billingMonth` is calculated based on `date` vs `closeDay`

---

## Code Conventions

### Variable and function names

```javascript
// Controllers: verb + noun
const createExpense = async (req, res) => {}
const getExpenseByMonth = async (month, year) => {}

// Variables: camelCase
const userId = req.user.id;
const installmentAmount = expense.amount / totalInstallments;

// Constants: UPPER_SNAKE_CASE
const TOKEN_EXPIRATION_DAYS = 7;
const PAYMENT_METHOD_TYPES = ['cash', 'card', 'transfer', 'other'];

// Booleans: is/has/can prefix
const isActive = user.status === 'active';
const hasPermission = req.user.id === accountId;
```

### Response structure

**Success (200, 201):**
```javascript
res.status(201).json({
  success: true,
  data: { id: 1, description: "Supermercado", amount: 50.00 },
  message: "Gasto creado exitosamente"
});
```

**Error (400, 401, 404, 500):**
```javascript
res.status(400).json({
  success: false,
  error: "VALIDATION_ERROR",
  message: "Amount must be greater than 0",
  details: { field: 'amount', value: -10 }
});
```

### Error handling

```javascript
// ✅ CORRECT: Catch and pass to middleware
try {
  const expense = await prisma.expense.create({ data });
  res.status(201).json(expense);
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
// ✅ CORRECT
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token inválido' });
  }
};
```

---

## Critical Business Rules

### Billing month calculation for card expenses

```javascript
// If the card closes on the 25th and expense is on the 26th → next month
function facturationMonthCalculate(expenseDate, closeDate) {
  const day = expenseDate.getDate();
  const month = expenseDate.getMonth() + 1;
  const year = expenseDate.getFullYear();

  if (day > closeDate) {
    // Expense after closing date → next month
    return { month: month === 12 ? 1 : month + 1, year: month === 12 ? year + 1 : year };
  }
  return { month, year };
}
```

### Installment expenses

- If `totalInstallments > 1` → create an `Installment` record for each installment
- Each `Installment` has a different `paymentMonth` (current month, month+1, month+2, etc.)
- Monthly report should only show the installment due THAT month
- `installmentAmount = totalAmount / totalInstallments`

---

## Security and Validation

### Input validation (in controller)

```javascript
// ✅ CORRECT
if (!req.body.description || req.body.description.trim() === '') {
  return res.status(400).json({ error: 'Descripción requerida' });
}

if (req.body.amount <= 0) {
  return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
}

// ✅ Use Prisma for relation validation
const account = await prisma.account.findUnique({ where: { id: accountId } });
if (!account) return res.status(404).json({ error: 'Cuenta no encontrada' });

// ✅ Check permissions (user owns the account)
if (account.userId !== req.user.id) {
  return res.status(403).json({ error: 'No tienes permiso' });
}
```

### Passwords and JWT

```javascript
// ✅ Hash password before saving
const hashedPassword = await bcrypt.hash(password, 10);
await prisma.user.create({ data: { email, password: hashedPassword } });

// ✅ Compare password
const valida = await bcrypt.compare(passwordEntered, userSaved.password);

// ✅ Create JWT with expiration
const token = jwt.sign(
  { id: user.id, email: user.email },
  process.env.JWT_SECRET,
  { expiresIn: '7d' }
);
```

---

## New Endpoint Checklist

When adding a new route, make sure to:

- [ ] **Validate input** in controller (type, values, required fields)
- [ ] **Validate permissions** (user owns the resource)
- [ ] **Handle errors** with try/catch → next(error)
- [ ] **Respond with uniform structure** (success, data, message)
- [ ] **Use camelCase** in JSON responses
- [ ] **Use authMiddleware** if authentication is required
- [ ] **Document business rules** if any (e.g.: billing month logic)
- [ ] **Test edge cases** (negative values, null, non-owner user)

---

## Recommended Endpoint Pattern

```javascript
// routes/expenses.js
router.post('/', authMiddleware, expensesController.createExpense);

// controllers/expensesController.js
exports.createExpense = async (req, res, next) => {
  try {
    // 1. Extract data
    const { description, amount, date, categoryId, accountId, paymentMethod } = req.body;
    const userId = req.user.id;

    // 2. Validate input
    if (!description || amount <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'INVALID_INPUT',
        message: 'Descripción y monto requeridos' 
      });
    }

    // 3. Validate permissions (user owns the account)
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account || account.userId !== userId) {
      return res.status(403).json({ 
        success: false, 
        error: 'FORBIDDEN',
        message: 'No tienes acceso a esta cuenta' 
      });
    }

    // 4. Apply business logic
    const { month, year } = paymentMethod === 'card' 
      ? facturationMonthCalculate(new Date(date), 25) // TODO: get real closing day
      : { month: new Date(date).getMonth() + 1, year: new Date(date).getFullYear() };

    // 5. Save to DB
    const expense = await prisma.expense.create({
      data: {
        description,
        amount: parseFloat(amount),
        date: new Date(date),
        categoryId,
        accountId,
        paymentMethod,
        billingMonth: month,
        billingYear: year
      }
    });

    // 6. Respond
    res.status(201).json({
      success: true,
      data: expense,
      message: 'Gasto creado exitosamente'
    });

  } catch (error) {
    next(error); // Error middleware
  }
};
```

---

## Testing (when you add tests)

```javascript
// tests/expense.test.js
describe('POST /api/expenses', () => {
  it('should create a valid expense', async () => {
    const res = await request(app)
      .post('/api/expense')
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

## Common Mistakes to Avoid

```javascript
// ❌ Don't query without null check
const expense = await prisma.expense.findUnique({ where: { id: id } });
// If null, the next line will crash

// ✅ Do this instead
const expense = await prisma.expense.findUnique({ where: { id } });
if (!expense) return res.status(404).json({ error: 'No encontrado' });

// ❌ Don't store plain text passwords
await prisma.user.create({ data: { password } });

// ❌ Don't trust the client to validate permissions
// Frontend says "I'm admin" → Backend must verify

// ❌ Don't hardcode secrets
const JWT_SECRET = "abc123"; // ❌
const JWT_SECRET = process.env.JWT_SECRET; // ✅
```

---

## Quick References

- **Prisma Docs:** https://www.prisma.io/docs/
- **Express Docs:** https://expressjs.com/
- **JWT:** https://jwt.io/
- **bcryptjs:** https://github.com/dcodeIO/bcrypt.js

---

## Common Next Steps

1. **Add a new route:** Create `routes/new.js`, add controller, register in `server.js`
2. **Change DB schema:** Edit `prisma/schema.prisma` → `npm run prisma:migrate`
3. **Deploy to production:** Railway requires `DATABASE_URL` in env vars
4. **Debug a query:** Use `npx prisma studio` to view data in real time
