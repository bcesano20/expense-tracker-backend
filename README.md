# SpendWise Backend

REST API for personal finance management. Users can register expenses by payment method (cash, transfer, credit/debit card), manage installment plans, track incomes, set budgets per category, and generate monthly reports.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (v18+) |
| Framework | Express.js 5.x |
| Database | PostgreSQL |
| ORM | Prisma 5.x |
| Auth | JWT + bcryptjs |
| Linting | ESLint 10 + Prettier |
| CI | GitHub Actions |

## Running locally

### 1. Clone and install

```bash
git clone https://github.com/bcesano20/expense-tracker-backend.git
cd expense-tracker-backend
npm install
```

### 2. Configure environment variables

Create a `.env` file at the project root:

```bash
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/spendwise"
JWT_SECRET="your_secret_key"
PORT=3001
NODE_ENV=development
```

### 3. Set up the database

```bash
# Create the database (run once in psql)
CREATE DATABASE spendwise;

# Run migrations
npm run prisma:migrate
```

### 4. Start the server

```bash
npm run dev
```

Server runs at `http://localhost:3001`. Verify with:

```bash
curl http://localhost:3001/api/test
```

## GitHub Actions

CI runs automatically on every push and pull request to `main`. To check the status:

1. Go to the repository on GitHub
2. Click the **Actions** tab
3. Select the **CI** workflow

The pipeline runs:
- **ESLint** — code quality check
- **Prettier** — format check
- **Prisma generate** — schema validation

A green check on a commit means all three passed.

## Project Structure

```
expense-tracker-backend/
├── .github/
│   └── workflows/
│       └── ci.yml                # GitHub Actions CI pipeline
├── prisma/
│   ├── schema.prisma             # Database schema
│   └── migrations/               # Migration history
├── src/
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── userController.js
│   │   ├── accountController.js
│   │   ├── cardController.js
│   │   ├── categoryController.js
│   │   ├── expenseController.js
│   │   ├── incomeController.js
│   │   ├── budgetController.js
│   │   └── reportController.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── user.js
│   │   ├── account.js
│   │   ├── card.js
│   │   ├── category.js
│   │   ├── expense.js
│   │   ├── income.js
│   │   ├── budget.js
│   │   └── report.js
│   ├── middleware/
│   │   └── authMiddleware.js
│   ├── helpers/
│   │   └── constants.js          # Shared error messages
│   ├── utils/
│   │   └── billingCalculator.js  # Credit card billing month logic
│   └── server.js
├── .env                          # Not tracked in git
├── .gitignore
├── eslint.config.js
├── package.json
├── CLAUDE.md                     # Development guide
└── README.md
```

## API Endpoints

All endpoints require a `Bearer` token in the `Authorization` header except `/api/auth/register` and `/api/auth/login`.

### Auth
```
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/profile
```

### Users
```
GET    /api/users/:id
PUT    /api/users/:id
DELETE /api/users/:id
```

### Accounts
```
POST   /api/accounts
GET    /api/accounts
GET    /api/accounts/:id
PUT    /api/accounts/:id
DELETE /api/accounts/:id
```

### Cards
```
POST   /api/cards
GET    /api/cards/account/:id
PUT    /api/cards/:id
DELETE /api/cards/:id
```

### Categories
```
POST   /api/categories
GET    /api/categories
PUT    /api/categories/:id
```

### Expenses
```
POST   /api/expenses
GET    /api/expenses           ?accountId&month&year&category&orderBy&page&limit
GET    /api/expenses/:id
PUT    /api/expenses/:id
DELETE /api/expenses/:id
```

### Incomes
```
POST   /api/incomes
GET    /api/incomes            ?accountId&month&year&source&orderBy&page&limit
GET    /api/incomes/:id
PUT    /api/incomes/:id
DELETE /api/incomes/:id
```

### Budgets
```
POST   /api/budgets
GET    /api/budgets            ?accountId&month&year&categoryId
GET    /api/budgets/:id
PUT    /api/budgets/:id
DELETE /api/budgets/:id
```

### Reports
```
GET    /api/reports/monthly       ?accountId&month&year
GET    /api/reports/summary       ?accountId
GET    /api/reports/category      ?accountId&months
GET    /api/reports/cards         ?accountId&month&year
GET    /api/reports/comparison    ?accountId&month&year
GET    /api/reports/budget-status ?accountId&categoryId&month&year
GET    /api/reports/income-ratio  ?accountId&month&year
```

## Available Scripts

```bash
npm run dev              # Start with hot reload
npm start                # Start in production
npm run prisma:migrate   # Create and run migrations
npm run prisma:generate  # Regenerate Prisma client
npm run lint             # Run ESLint
npm run lint:fix         # Auto-fix lint issues
npm run format           # Format with Prettier
npx prisma studio        # Open DB GUI
npx prisma db seed       # Seed the database
```

## License

MIT — Bruno Cesano · [brunocesano20@gmail.com](mailto:brunocesano20@gmail.com) · [@bcesano20](https://github.com/bcesano20)
