# Expense Tracker Backend

REST API for personal expense management. Allows users to register, categorize, and analyze expenses with support for credit and debit cards, installments, and detailed reports.

## Goal

Provide a robust and scalable backend solution for users to record and visualize their expenses intuitively. The app automatically calculates billing dates, manages credit card installments, and generates detailed monthly reports.

## Features

### Authentication & Users
- User registration with encrypted password
- Login with JWT (JSON Web Tokens)
- Profile management (update info, change password)
- Tokens with expiration (7 days)

### Accounts
- Create multiple accounts per user
- Associate currencies to accounts
- View all personal accounts

### Cards
- Manage credit and debit cards
- Credit cards: configure closing day
- Debit cards: track available balance
- Support multiple networks (Visa, Mastercard, Amex, Discover)

### Expenses
- Register expenses by cash, transfer, card, or other method
- Credit card expenses: automatic billing month calculation
- Installment expenses: automatically create N installments distributed across months
- Debit card expenses: automatically deduct from balance
- Filter by category, month, year
- Sort by date or amount
- Full CRUD (create, read, update, delete)

### Reports
- **Full monthly report:** Total spent, expenses by category, by payment method, card details
- **Quick summary:** Current month total, installments due, daily average, monthly projection
- **Category analysis:** Spending per category over the last N months
- **Card details:** How much to pay per card this month
- **Month comparison:** Current month vs previous month spending

## Tech Stack

- **Runtime:** Node.js (v18+)
- **Framework:** Express.js 4.x
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Authentication:** JWT + bcryptjs
- **Validation:** Manual (input validation in controllers)
- **CORS:** Enabled for frontend communication

## Prerequisites

### Windows
- [Node.js LTS](https://nodejs.org/) (v18 or higher)
- [PostgreSQL](https://www.postgresql.org/download/windows/) (v13 or higher)
- Git (optional, to clone the repo)
- A code editor (VSCode recommended)

### macOS
- [Homebrew](https://brew.sh/) (package manager)
- [Node.js LTS](https://nodejs.org/) (v18 or higher)
- PostgreSQL (installable via Homebrew)
- Git (included with Xcode Command Line Tools)
- A code editor (VSCode recommended)

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/bcesano20/expense-tracker-backend.git
cd expense-tracker-backend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create the PostgreSQL database

#### On Windows

Open **pgAdmin** (installed with PostgreSQL) or use the command prompt:

```bash
# Open the PostgreSQL console
psql -U postgres

# Inside the PostgreSQL console:
CREATE DATABASE expense_tracker;
\q
```

#### On macOS

```bash
# If PostgreSQL is installed via Homebrew
psql postgres

# Or directly:
createdb expense_tracker
```

### 4. Configure environment variables

Create a `.env` file at the root of the project:

```bash
# Database
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/expense_tracker"

# JWT
JWT_SECRET="your_super_secret_key_here_123456789"

# Server
PORT=3001
NODE_ENV=development
```

**⚠️ Important:** Replace `your_password` with your PostgreSQL password.

### 5. Run Prisma migrations

```bash
npm run prisma:migrate
```

When asked for the migration name, type: `init`

This automatically creates all tables in the database.

### 6. Verify everything works

```bash
npm run dev
```

You should see:

```
Server running on http://localhost:3001
```

Open in browser: `http://localhost:3001/api/test`

If you see `{"message":"Backend funcionando ✅"}`, you're good to go!

## Project Structure

```
expense-tracker-backend/
├── src/
│   ├── controllers/          # Business logic
│   │   ├── authController.js
│   │   ├── userController.js
│   │   ├── accountController.js
│   │   ├── cardController.js
│   │   ├── expenseController.js
│   │   └── reportController.js
│   ├── routes/               # Endpoint definitions
│   │   ├── auth.js
│   │   ├── user.js
│   │   ├── account.js
│   │   ├── card.js
│   │   ├── expense.js
│   │   └── report.js
│   ├── middleware/            # Middleware functions
│   │   └── authMiddleware.js
│   ├── utils/                 # Helper functions
│   │   └── billingCalculator.js
│   └── server.js              # Entry point
├── prisma/
│   └── schema.prisma          # Database schema
├── .env                       # Environment variables (not tracked in git)
├── .gitignore
├── package.json
├── CLAUDE.md                  # Development guide
├── LICENSE
└── README.md
```

## API Endpoints

### Authentication

```
POST   /api/auth/register      - Register a new user
POST   /api/auth/login         - Log in
GET    /api/auth/profile       - Get profile (requires token)
```

### Users

```
GET    /api/users/:id          - Get user by ID
PUT    /api/users/:id          - Update user
DELETE /api/users/:id          - Delete user
```

### Accounts

```
POST   /api/accounts           - Create account
GET    /api/accounts           - Get all my accounts
GET    /api/accounts/:id       - Get account by ID
PUT    /api/accounts/:id       - Update account
DELETE /api/accounts/:id       - Delete account
```

### Cards

```
POST   /api/cards              - Create card
GET    /api/cards/account/:id  - Get cards for an account
PUT    /api/cards/:id          - Update card
DELETE /api/cards/:id          - Delete card
```

### Expenses

```
POST   /api/expenses           - Create expense
GET    /api/expenses           - Get expenses (with filters)
GET    /api/expenses/:id       - Get expense by ID
PUT    /api/expenses/:id       - Update expense
DELETE /api/expenses/:id       - Delete expense
```

### Reports

```
GET    /api/reports/monthly    - Full monthly report
GET    /api/reports/summary    - Quick summary for current month
GET    /api/reports/categories - Category analysis
GET    /api/reports/cards      - How much to pay per card
GET    /api/reports/comparison - Current vs previous month
```

## Testing the API

### Option 1: Postman

1. Download [Postman](https://www.postman.com/)
2. Import the endpoints and test them
3. Example: `GET http://localhost:3001/api/test`

### Option 2: Thunder Client (VSCode extension)

1. Install the Thunder Client extension in VSCode
2. Create requests directly inside VSCode
3. Faster than Postman

### Option 3: cURL (terminal)

```bash
# Basic test
curl http://localhost:3001/api/test

# Register
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Bruno","lastName":"Cesano","email":"bruno@test.com","password":"password123"}'

# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"bruno@test.com","password":"password123"}'
```

## Available Scripts

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start

# Create/run migrations
npm run prisma:migrate

# View database in GUI
npx prisma studio

# Regenerate Prisma Client
npm run prisma:generate
```

## Security

- Passwords encrypted with bcryptjs (10 rounds)
- JWT tokens with 7-day expiration
- Permission validation on every endpoint (users only access their own data)
- Input validation in all controllers
- CORS configured
- Sensitive variables in `.env` (not in code)

## Error Handling

All errors respond with a uniform structure:

```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Descripción del error"
}
```

## Additional Documentation

- `CLAUDE.md`: Development guide and code conventions
- `prisma/schema.prisma`: Database schema
- Comments in controllers explaining the logic

## License

MIT License - Free to use for personal and commercial projects.

## Author

Bruno Cesano  
Email: brunocesano20@gmail.com  
GitHub: [@bcesano20](https://github.com/bcesano20)

---
