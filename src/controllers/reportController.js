const { ERROR_MESSAGES } = require('../helpers/constants');

const prisma = require('../helpers/prisma');
const { ZERO, sumField } = require('../utils/money');

// ============================================
// FULL MONTHLY REPORT
// ============================================
exports.getMonthlyReport = async (req, res, next) => {
  try {
    const { accountId, month, year } = req.query;
    const userId = req.user.id;

    // Validate required params
    if (!accountId || !month || !year) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'accountId, mes y año son requeridos',
      });
    }

    const monthNum = parseInt(month);
    const yearNum = parseInt(year);

    // Validate month range
    if (monthNum < 1 || monthNum > 12) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_MONTH',
        message: 'El mes debe estar entre 1 y 12',
      });
    }

    // Validate account ownership
    const account = await prisma.account.findUnique({
      where: { id: parseInt(accountId) },
    });

    if (!account || account.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'No tienes permiso para ver los reportes de esta cuenta',
      });
    }

    // 1. GET ALL EXPENSES FOR THE MONTH
    const expenses = await prisma.expense.findMany({
      where: {
        accountId: parseInt(accountId),
        billingMonth: monthNum,
        billingYear: yearNum,
      },
      include: {
        category: true,
        card: {
          include: { card: true },
        },
        installments: true,
      },
    });

    // 2. CALCULATE GRAND TOTAL
    const totalSpent = sumField(expenses, 'amount').toNumber();

    // 3. GROUP BY CATEGORY
    const expensesByCategory = {};
    expenses.forEach((exp) => {
      const categoryName = exp.category?.name ?? 'Sin categoría';
      if (!expensesByCategory[categoryName]) {
        expensesByCategory[categoryName] = { total: ZERO, color: exp.category?.color ?? null };
      }
      expensesByCategory[categoryName].total = expensesByCategory[categoryName].total.plus(
        exp.amount
      );
    });

    // 4. GROUP BY PAYMENT METHOD
    const expensesByPaymentMethod = {};
    expenses.forEach((exp) => {
      const method = exp.paymentMethod;
      if (!expensesByPaymentMethod[method]) {
        expensesByPaymentMethod[method] = { total: ZERO, count: 0 };
      }
      expensesByPaymentMethod[method].total = expensesByPaymentMethod[method].total.plus(
        exp.amount
      );
      expensesByPaymentMethod[method].count += 1;
    });

    // 5. GET INSTALLMENTS DUE THIS MONTH (if any)
    const installmentsDue = await prisma.installment.findMany({
      where: {
        paymentMonth: monthNum,
        paymentYear: yearNum,
        expense: {
          accountId: parseInt(accountId),
        },
      },
      include: {
        card: true,
        expense: true,
      },
    });

    // 6. GROUP INSTALLMENTS BY CARD
    const installmentsByCard = {};
    installmentsDue.forEach((installment) => {
      const cardId = installment.card.id;
      if (!installmentsByCard[cardId]) {
        installmentsByCard[cardId] = {
          cardId: installment.card.id,
          cardName: installment.card.name,
          cardBank: installment.card.bank,
          cardType: installment.card.type,
          totalDue: ZERO,
          installments: [],
        };
      }
      installmentsByCard[cardId].totalDue = installmentsByCard[cardId].totalDue.plus(
        installment.installmentAmount
      );
      installmentsByCard[cardId].installments.push({
        id: installment.id,
        expenseDescription: installment.expense.description,
        expenseAmount: installment.expense.amount,
        installmentProgress: `${installment.installmentNumber}/${installment.totalInstallments}`,
        amount: installment.installmentAmount,
      });
    });

    // 7. TOTAL CARD PAYMENTS BY CARD TYPE (credit vs debit)
    const totalCardPaymentsByType = Object.values(installmentsByCard).reduce((acc, card) => {
      acc[card.cardType] = (acc[card.cardType] ?? ZERO).plus(card.totalDue);
      return acc;
    }, {});

    // 8. RESPOND WITH FULL REPORT
    res.status(200).json({
      success: true,
      data: {
        period: {
          month: monthNum,
          year: yearNum,
          reportDate: new Date().toISOString(),
        },
        summary: {
          totalSpent,
          expenseCount: expenses.length,
          categoryCount: Object.keys(expensesByCategory).length,
          cardCount: Object.keys(installmentsByCard).length,
        },
        expensesByCategory: Object.entries(expensesByCategory).map(([category, data]) => ({
          category,
          color: data.color,
          total: data.total.toNumber(),
          percentage: (data.total.toNumber() / totalSpent) * 100,
        })),
        expensesByPaymentMethod: Object.entries(expensesByPaymentMethod).map(([method, data]) => ({
          method,
          total: data.total.toNumber(),
          count: data.count,
        })),
        expenseDetails: expenses.map((exp) => ({
          id: exp.id,
          description: exp.description,
          amount: exp.amount,
          date: exp.date,
          category: exp.category
            ? { id: exp.category.id, name: exp.category.name, color: exp.category.color }
            : null,
          paymentMethod: exp.paymentMethod,
          card: exp.card ? exp.card.card.name : null,
        })),
        cardsToPay: Object.values(installmentsByCard),
        totalCardPayments: sumField(Object.values(installmentsByCard), 'totalDue').toNumber(),
        totalCardPaymentsByType: Object.entries(totalCardPaymentsByType).reduce(
          (acc, [type, total]) => {
            acc[type] = total.toNumber();
            return acc;
          },
          {}
        ),
      },
      message: `Reporte de ${monthNum}/${yearNum} generado`,
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// QUICK SUMMARY (for dashboard)
// ============================================
exports.getQuickSummary = async (req, res, next) => {
  try {
    const { accountId } = req.query;
    const userId = req.user.id;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'accountId es requerido',
      });
    }

    // Validate account ownership
    const account = await prisma.account.findUnique({
      where: { id: parseInt(accountId) },
    });

    if (!account || account.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'No tienes permiso',
      });
    }

    // Current month and year
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const currentMonthExpenses = await prisma.expense.findMany({
      where: {
        accountId: parseInt(accountId),
        billingMonth: currentMonth,
        billingYear: currentYear,
      },
    });

    const currentMonthTotal = sumField(currentMonthExpenses, 'amount').toNumber();

    // Installments due this month
    const currentMonthInstallments = await prisma.installment.findMany({
      where: {
        paymentMonth: currentMonth,
        paymentYear: currentYear,
        expense: {
          accountId: parseInt(accountId),
        },
      },
    });

    const currentMonthInstallmentsTotal = sumField(
      currentMonthInstallments,
      'installmentAmount'
    ).toNumber();

    // Daily average
    const daysElapsed = now.getDate();
    const dailyAverage = currentMonthTotal / daysElapsed;

    // Monthly projection (if trend continues)
    const monthlyProjection = dailyAverage * 30;

    res.status(200).json({
      success: true,
      data: {
        month: currentMonth,
        year: currentYear,
        currentMonthExpensesTotal: currentMonthTotal,
        currentMonthExpenseCount: currentMonthExpenses.length,
        currentMonthInstallmentsTotal: currentMonthInstallmentsTotal,
        currentMonthInstallmentCount: currentMonthInstallments.length,
        dailyAverageExpense: dailyAverage,
        monthlyProjection: monthlyProjection,
      },
      message: 'Resumen rápido del mes actual',
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// CATEGORY ANALYSIS (last N months)
// ============================================
exports.getCategoryAnalysis = async (req, res, next) => {
  try {
    const { accountId, months = 3 } = req.query;
    const userId = req.user.id;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'accountId es requerido',
      });
    }

    // Validate account ownership
    const account = await prisma.account.findUnique({
      where: { id: parseInt(accountId) },
    });

    if (!account || account.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'No tienes permiso',
      });
    }

    const monthCount = parseInt(months);
    const now = new Date();

    const expenses = await prisma.expense.findMany({
      where: {
        accountId: parseInt(accountId),
        date: {
          gte: new Date(now.getFullYear(), now.getMonth() - monthCount, 1),
        },
      },
      include: { category: true },
    });

    // Group by category and sum amounts
    const categories = {};
    expenses.forEach((exp) => {
      const categoryKey = exp.category?.name ?? 'Sin categoría';
      if (!categories[categoryKey]) {
        categories[categoryKey] = {
          category: categoryKey,
          color: exp.category?.color ?? null,
          months: {},
          periodTotal: ZERO,
        };
      }

      const monthKey = `${exp.billingMonth}/${exp.billingYear}`;
      const group = categories[categoryKey];
      group.months[monthKey] = (group.months[monthKey] ?? ZERO).plus(exp.amount);
      group.periodTotal = group.periodTotal.plus(exp.amount);
    });

    // Sort by total descending and format response
    const analysis = Object.values(categories)
      .sort((a, b) => b.periodTotal.comparedTo(a.periodTotal))
      .map((cat) => ({
        ...cat,
        periodTotal: cat.periodTotal.toNumber(),
        monthlyAverage: cat.periodTotal.toNumber() / monthCount,
        months: Object.entries(cat.months).reduce((acc, [month, total]) => {
          acc[month] = total.toNumber();
          return acc;
        }, {}),
      }));

    res.status(200).json({
      success: true,
      data: {
        period: `Last ${monthCount} months`,
        totalSpent: sumField(analysis, 'periodTotal').toNumber(),
        categories: analysis,
      },
      message: 'Análisis por categoría generado',
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// CARD DETAILS (how much to pay)
// ============================================
exports.getCardDetails = async (req, res, next) => {
  try {
    const { accountId, month, year } = req.query;
    const userId = req.user.id;

    if (!accountId || !month || !year) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'accountId, mes y anio son requeridos',
      });
    }

    // Validate account ownership
    const account = await prisma.account.findUnique({
      where: { id: parseInt(accountId) },
    });

    if (!account || account.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'No tienes permiso',
      });
    }

    const monthNum = parseInt(month);
    const yearNum = parseInt(year);

    const cards = await prisma.card.findMany({
      where: { accountId: parseInt(accountId), type: 'credit' },
    });

    // Get installments due per card
    const cardDetails = await Promise.all(
      cards.map(async (card) => {
        const installments = await prisma.installment.findMany({
          where: {
            cardId: card.id,
            paymentMonth: monthNum,
            paymentYear: yearNum,
          },
          include: {
            expense: true,
          },
        });

        const totalDue = sumField(installments, 'installmentAmount').toNumber();

        return {
          cardId: card.id,
          name: card.name,
          bank: card.bank,
          type: card.type,
          network: card.network,
          currentBalance: card.balance,
          totalDue: totalDue,
          installmentCount: installments.length,
          installmentDetails: installments.map((installment) => ({
            id: installment.id,
            expenseDescription: installment.expense.description,
            installmentProgress: `${installment.installmentNumber}/${installment.totalInstallments}`,
            amount: installment.installmentAmount,
          })),
        };
      })
    );

    // Filter cards with installments due
    const cardsWithInstallments = cardDetails.filter((card) => card.installmentCount > 0);

    const grandTotal = sumField(cardsWithInstallments, 'totalDue').toNumber();

    res.status(200).json({
      success: true,
      data: {
        period: `${monthNum}/${yearNum}`,
        totalDue: grandTotal,
        cards: cardsWithInstallments,
        cardsWithInstallmentsCount: cardsWithInstallments.length,
      },
      message: 'Detalles de tarjetas generados',
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// CATEGORY BUDGET STATUS
// ============================================
exports.getCategoryBudgetStatus = async (req, res, next) => {
  try {
    const { accountId, categoryId, month, year } = req.query;
    const userId = req.user.id;

    if (!accountId || !categoryId || !month || !year) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'accountId, categoryId, mes y año son requeridos',
      });
    }

    const monthNum = parseInt(month);
    const yearNum = parseInt(year);

    if (monthNum < 1 || monthNum > 12) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_MONTH',
        message: ERROR_MESSAGES.INVALID_MONTH,
      });
    }

    // Validate account ownership
    const account = await prisma.account.findUnique({
      where: { id: parseInt(accountId) },
    });

    if (!account || account.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: ERROR_MESSAGES.REPORTS_ACCOUNT_PERMISSION,
      });
    }

    // Run budget lookup and expense aggregation in parallel
    const [budget, expenses] = await Promise.all([
      prisma.budget.findUnique({
        where: {
          accountId_categoryId_month_year: {
            accountId: parseInt(accountId),
            categoryId: parseInt(categoryId),
            month: monthNum,
            year: yearNum,
          },
        },
        include: { category: true },
      }),
      prisma.expense.findMany({
        where: {
          accountId: parseInt(accountId),
          categoryId: parseInt(categoryId),
          billingMonth: monthNum,
          billingYear: yearNum,
        },
        include: { category: true },
      }),
    ]);

    const totalSpent = sumField(expenses, 'amount').toNumber();

    let status;
    let budgetSummary;

    if (!budget) {
      status = 'NO_BUDGET';
      budgetSummary = null;
    } else if (budget.amount !== null) {
      // Fixed budget
      status = budget.amount.lt(totalSpent) ? 'OVER_BUDGET' : 'UNDER_BUDGET';
      budgetSummary = {
        type: 'fixed',
        budgetAmount: budget.amount.toNumber(),
        remaining: budget.amount.minus(totalSpent).toNumber(),
        usagePercentage: (totalSpent / budget.amount.toNumber()) * 100,
      };
    } else {
      // Range budget
      if (budget.maxAmount.lt(totalSpent)) {
        status = 'OVER_BUDGET';
      } else if (budget.minAmount.gt(totalSpent)) {
        status = 'UNDER_BUDGET';
      } else {
        status = 'WITHIN_RANGE';
      }
      budgetSummary = {
        type: 'range',
        minAmount: budget.minAmount.toNumber(),
        maxAmount: budget.maxAmount.toNumber(),
        remainingToMax: budget.maxAmount.minus(totalSpent).toNumber(),
        usagePercentage: (totalSpent / budget.maxAmount.toNumber()) * 100,
      };
    }

    res.status(200).json({
      success: true,
      data: {
        period: { month: monthNum, year: yearNum },
        category: budget?.category ?? expenses[0]?.category ?? null,
        totalSpent: totalSpent,
        expenseCount: expenses.length,
        budget: budgetSummary,
        status,
      },
      message: 'Estado del presupuesto por categoría generado',
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// INCOME VS EXPENSES RATIO
// ============================================
exports.getIncomeVsExpenses = async (req, res, next) => {
  try {
    const { accountId, month, year } = req.query;
    const userId = req.user.id;

    if (!accountId || !month || !year) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'accountId, mes y año son requeridos',
      });
    }

    const monthNum = parseInt(month);
    const yearNum = parseInt(year);

    if (monthNum < 1 || monthNum > 12) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_MONTH',
        message: ERROR_MESSAGES.INVALID_MONTH,
      });
    }

    // Validate account ownership
    const account = await prisma.account.findUnique({
      where: { id: parseInt(accountId) },
    });

    if (!account || account.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: ERROR_MESSAGES.REPORTS_ACCOUNT_PERMISSION,
      });
    }

    // Fetch incomes and expenses in parallel
    const [incomes, expenses] = await Promise.all([
      prisma.income.findMany({
        where: {
          accountId: parseInt(accountId),
          date: {
            gte: new Date(yearNum, monthNum - 1, 1),
            lt: new Date(yearNum, monthNum, 1),
          },
        },
      }),
      prisma.expense.findMany({
        where: {
          accountId: parseInt(accountId),
          billingMonth: monthNum,
          billingYear: yearNum,
        },
      }),
    ]);

    const incomeDecimal = sumField(incomes, 'amount');
    const expensesDecimal = sumField(expenses, 'amount');
    const totalIncome = incomeDecimal.toNumber();
    const totalExpenses = expensesDecimal.toNumber();
    const balance = incomeDecimal.minus(expensesDecimal).toNumber();
    const expensePercentage = totalIncome === 0 ? null : (totalExpenses / totalIncome) * 100;

    let status;
    if (totalIncome === 0) {
      status = 'NO_INCOME';
    } else if (totalExpenses > totalIncome) {
      status = 'DEFICIT';
    } else if (totalExpenses === totalIncome) {
      status = 'BALANCED';
    } else {
      status = 'SURPLUS';
    }

    res.status(200).json({
      success: true,
      data: {
        period: { month: monthNum, year: yearNum },
        totalIncome: totalIncome,
        totalExpenses: totalExpenses,
        balance: balance,
        expensePercentage,
        incomeCount: incomes.length,
        expenseCount: expenses.length,
        status,
      },
      message: 'Relación ingresos/gastos generada',
    });
  } catch (error) {
    next(error);
  }
};

// ============================================
// PREVIOUS MONTH COMPARISON
// ============================================
exports.getMonthComparison = async (req, res, next) => {
  try {
    const { accountId, month, year } = req.query;
    const userId = req.user.id;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'accountId es requerido',
      });
    }

    // Validate account ownership
    const account = await prisma.account.findUnique({
      where: { id: parseInt(accountId) },
    });

    if (!account || account.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'No tienes permiso',
      });
    }

    // Use provided month/year or fall back to current date
    const now = new Date();
    const currentMonth = month ? parseInt(month) : now.getMonth() + 1;
    const currentYear = year ? parseInt(year) : now.getFullYear();

    // Calculate previous month (handles January → December rollover)
    let previousMonth = currentMonth - 1;
    let previousYear = currentYear;
    if (previousMonth === 0) {
      previousMonth = 12;
      previousYear = currentYear - 1;
    }

    // Current month expenses
    const currentMonthExpenses = await prisma.expense.findMany({
      where: {
        accountId: parseInt(accountId),
        billingMonth: currentMonth,
        billingYear: currentYear,
      },
    });

    const currentDecimal = sumField(currentMonthExpenses, 'amount');
    const currentTotal = currentDecimal.toNumber();

    // Previous month expenses
    const previousMonthExpenses = await prisma.expense.findMany({
      where: {
        accountId: parseInt(accountId),
        billingMonth: previousMonth,
        billingYear: previousYear,
      },
    });

    const previousDecimal = sumField(previousMonthExpenses, 'amount');
    const previousTotal = previousDecimal.toNumber();

    // Calculate difference
    const difference = currentDecimal.minus(previousDecimal).toNumber();
    const changePercentage = previousTotal === 0 ? 0 : (difference / previousTotal) * 100;

    res.status(200).json({
      success: true,
      data: {
        currentMonth: {
          month: currentMonth,
          year: currentYear,
          total: currentTotal,
          count: currentMonthExpenses.length,
        },
        previousMonth: {
          month: previousMonth,
          year: previousYear,
          total: previousTotal,
          count: previousMonthExpenses.length,
        },
        comparison: {
          difference: difference,
          changePercentage: changePercentage,
          trend: difference > 0 ? 'INCREASE' : difference < 0 ? 'DECREASE' : 'EQUAL',
        },
      },
      message: 'Comparativa de meses generada',
    });
  } catch (error) {
    next(error);
  }
};
