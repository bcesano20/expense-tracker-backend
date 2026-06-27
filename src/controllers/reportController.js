const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

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
    const totalSpent = expenses.reduce((sum, exp) => sum + exp.amount, 0);

    // 3. GROUP BY CATEGORY
    const expensesByCategory = {};
    expenses.forEach((exp) => {
      const categoryName = exp.category?.name ?? 'Sin categoría';
      if (!expensesByCategory[categoryName]) {
        expensesByCategory[categoryName] = 0;
      }
      expensesByCategory[categoryName] += exp.amount;
    });

    // 4. GROUP BY PAYMENT METHOD
    const expensesByPaymentMethod = {};
    expenses.forEach((exp) => {
      const method = exp.paymentMethod;
      if (!expensesByPaymentMethod[method]) {
        expensesByPaymentMethod[method] = { total: 0, count: 0 };
      }
      expensesByPaymentMethod[method].total += exp.amount;
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
          totalDue: 0,
          installments: [],
        };
      }
      installmentsByCard[cardId].totalDue += installment.installmentAmount;
      installmentsByCard[cardId].installments.push({
        id: installment.id,
        expenseDescription: installment.expense.description,
        expenseAmount: installment.expense.amount,
        installmentProgress: `${installment.installmentNumber}/${installment.totalInstallments}`,
        amount: installment.installmentAmount,
      });
    });

    // 7. RESPOND WITH FULL REPORT
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
        expensesByCategory: Object.entries(expensesByCategory).map(([category, total]) => ({
          category,
          total: parseFloat(total.toFixed(2)),
          percentage: parseFloat(((total / totalSpent) * 100).toFixed(2)),
        })),
        expensesByPaymentMethod: Object.entries(expensesByPaymentMethod).map(([method, data]) => ({
          method,
          total: parseFloat(data.total.toFixed(2)),
          count: data.count,
        })),
        expenseDetails: expenses.map((exp) => ({
          id: exp.id,
          description: exp.description,
          amount: exp.amount,
          date: exp.date,
          category: exp.category ? { id: exp.category.id, name: exp.category.name, color: exp.category.color } : null,
          paymentMethod: exp.paymentMethod,
          card: exp.card ? exp.card.card.name : null,
        })),
        cardsToPay: Object.values(installmentsByCard),
        totalCardPayments: Object.values(installmentsByCard).reduce(
          (sum, card) => sum + card.totalDue,
          0
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

    const currentMonthTotal = currentMonthExpenses.reduce((sum, exp) => sum + exp.amount, 0);

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

    const currentMonthInstallmentsTotal = currentMonthInstallments.reduce(
      (sum, installment) => sum + installment.installmentAmount,
      0
    );

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
        currentMonthExpensesTotal: parseFloat(currentMonthTotal.toFixed(2)),
        currentMonthExpenseCount: currentMonthExpenses.length,
        currentMonthInstallmentsTotal: parseFloat(currentMonthInstallmentsTotal.toFixed(2)),
        currentMonthInstallmentCount: currentMonthInstallments.length,
        dailyAverageExpense: parseFloat(dailyAverage.toFixed(2)),
        monthlyProjection: parseFloat(monthlyProjection.toFixed(2)),
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
          periodTotal: 0,
        };
      }

      const monthKey = `${exp.billingMonth}/${exp.billingYear}`;
      if (!categories[categoryKey].months[monthKey]) {
        categories[categoryKey].months[monthKey] = 0;
      }

      categories[categoryKey].months[monthKey] += exp.amount;
      categories[categoryKey].periodTotal += exp.amount;
    });

    // Sort by total descending and format response
    const analysis = Object.values(categories)
      .sort((a, b) => b.periodTotal - a.periodTotal)
      .map((cat) => ({
        ...cat,
        monthlyAverage: parseFloat((cat.periodTotal / monthCount).toFixed(2)),
        months: Object.entries(cat.months).reduce((acc, [month, total]) => {
          acc[month] = parseFloat(total.toFixed(2));
          return acc;
        }, {}),
      }));

    res.status(200).json({
      success: true,
      data: {
        period: `Last ${monthCount} months`,
        totalSpent: parseFloat(analysis.reduce((sum, cat) => sum + cat.periodTotal, 0).toFixed(2)),
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
      where: { accountId: parseInt(accountId) },
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

        const totalDue = installments.reduce(
          (sum, installment) => sum + installment.installmentAmount,
          0
        );

        return {
          cardId: card.id,
          name: card.name,
          bank: card.bank,
          type: card.type,
          network: card.network,
          currentBalance: card.balance,
          totalDue: parseFloat(totalDue.toFixed(2)),
          installmentCount: installments.length,
          installmentDetails: installments.map((installment) => ({
            id: installment.id,
            expenseDescription: installment.expense.description,
            installmentProgress: `${installment.installmentNumber}/${installment.totalInstallments}`,
            amount: parseFloat(installment.installmentAmount.toFixed(2)),
          })),
        };
      })
    );

    // Filter cards with installments due
    const cardsWithInstallments = cardDetails.filter((card) => card.installmentCount > 0);

    const grandTotal = cardsWithInstallments.reduce((sum, card) => sum + card.totalDue, 0);

    res.status(200).json({
      success: true,
      data: {
        period: `${monthNum}/${yearNum}`,
        totalDue: parseFloat(grandTotal.toFixed(2)),
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

    const currentTotal = currentMonthExpenses.reduce((sum, exp) => sum + exp.amount, 0);

    // Previous month expenses
    const previousMonthExpenses = await prisma.expense.findMany({
      where: {
        accountId: parseInt(accountId),
        billingMonth: previousMonth,
        billingYear: previousYear,
      },
    });

    const previousTotal = previousMonthExpenses.reduce((sum, exp) => sum + exp.amount, 0);

    // Calculate difference
    const difference = currentTotal - previousTotal;
    const changePercentage = previousTotal === 0 ? 0 : (difference / previousTotal) * 100;

    res.status(200).json({
      success: true,
      data: {
        currentMonth: {
          month: currentMonth,
          year: currentYear,
          total: parseFloat(currentTotal.toFixed(2)),
          count: currentMonthExpenses.length,
        },
        previousMonth: {
          month: previousMonth,
          year: previousYear,
          total: parseFloat(previousTotal.toFixed(2)),
          count: previousMonthExpenses.length,
        },
        comparison: {
          difference: parseFloat(difference.toFixed(2)),
          changePercentage: parseFloat(changePercentage.toFixed(2)),
          trend: difference > 0 ? 'INCREASE' : difference < 0 ? 'DECREASE' : 'EQUAL',
        },
      },
      message: 'Comparativa de meses generada',
    });
  } catch (error) {
    next(error);
  }
};
