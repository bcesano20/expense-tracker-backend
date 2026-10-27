const ERROR_MESSAGES = {
  FIELD_REQUIRED: 'Este campo es requerido',
  REGISTER_REQUIRED_FIELDS: 'Nombre, apellido, email y contraseña son requeridos',
  LOGIN_REQUIRED_FIELDS: 'Email y contraseña requeridos',
  WEAK_PASSWORD: 'La contraseña debe tener al menos 6 caracteres',
  EMAIL_EXISTS: 'El email ya está registrado',
  INVALID_PASSWORD: 'La contraseña es incorrecta.',
  USER_NOT_FOUND: 'Usuario no encontrado',
  INVALID_MONTH: 'El mes es invalido',
  CATEGORY_NOT_FOUND: 'Categoria no encontrada',
  INCOME_CREATION: 'La cuenta, descripción, monto, fuente y fecha son requeridos',
  INVALID_AMOUNT_OR_ZERO:
    'El monto debe ser un número mayor o igual a 0, con hasta 2 decimales y un máximo de 9999999999.99',
  INVALID_AMOUNT:
    'El monto debe ser un número mayor a 0, con hasta 2 decimales y un máximo de 9999999999.99',
  INCOME_ACCOUNT_PERMISSION: 'No tienes permiso para operar sobre ingresos en esta cuenta',
  ACCOUNT_ID_REQUIRED: 'AccountId es requerido',
  INCOME_NOT_FOUND: 'Ingreso no encontrado',
  BUDGET_CREATION: 'La cuenta, categoría, mes y año son requeridos',
  BUDGET_AMOUNT: 'Debes definir un monto fijo o un rango (mínimo y máximo)',
  BUDGET_AMOUNT_LIMIT: 'No puedes definir un monto fijo y un rango al mismo tiempo',
  BUDGET_RANGE_NOT_EXISTS: 'El rango requiere tanto el mínimo como el máximo',
  BUDGET_MAX_LESS_MIN: 'El monto mínimo debe ser menor al monto máximo',
  BUDGET_ACCOUNT_PERMISSION: 'No tienes permiso para operar sobre presupuestos en esta cuenta',
  BUDGET_CATEGORY_PERIOD_ALREADY_EXISTS:
    'Ya existe un presupuesto para esta categoría en el período indicado',
  BUDGET_NOT_FOUND: 'Presupuesto no encontrado',
  REPORTS_ACCOUNT_PERMISSION: 'No tienes permisos para ver ni operar reportes en esta cuenta',
  INVALID_PAYMENT_METHOD: 'El medio de pago es inválido',
  CARD_REQUIRED_FOR_PAYMENT_METHOD: 'Debes indicar la tarjeta para pagar con débito o crédito',
  CARD_NOT_ALLOWED_FOR_PAYMENT_METHOD:
    'No se puede indicar una tarjeta con efectivo, transferencia u otro medio de pago',
  PAYMENT_METHOD_CARD_MISMATCH: 'El medio de pago no coincide con el tipo de la tarjeta',
  UNSUPORTED_UPDATE_CREDIT_CARD:
    'No se puede cambiar el método de pago de un gasto con tarjeta de crédito',
  CARD_NOT_FOUND: 'Tarjeta no encontrada o no pertenece a esta cuenta',
  CREDIT_CARD_NOT_UPDATAED:
    'No se puede cambiar a tarjeta de crédito desde otro método de pago. Por favor elimine este gasto y vuelva a crearlo como uno de crédito',
  CARD_CANCELLED: 'La tarjeta está cancelada y no se pueden registrar nuevos gastos con ella',
  CARD_CANCELLED_BALANCE: 'No se puede modificar el saldo de una tarjeta cancelada',
  CARD_CANCEL_SUCCESS: 'Tarjeta cancelada correctamente',
  INSUFFICIENT_FUNDS: 'Saldo insuficiente en la billetera',
  INSUFFICIENT_CARD_FUNDS: 'Saldo insuficiente en la tarjeta',
  CREDIT_EXPENSE_LIMITED_EDIT:
    'Los gastos con tarjeta de crédito solo permiten editar descripción, categoría y notas. Para cambiar monto, fecha o tarjeta elimina el gasto y créalo de nuevo',
  INVALID_YEAR: 'El año es inválido',
  MONTH_CLOSED:
    'Este mes está cerrado: no se pueden crear, editar ni eliminar gastos ni ingresos de ese mes',
  MONTH_ALREADY_CLOSED: 'Este mes ya está cerrado',
  MONTH_NOT_ENDED: 'Solo se pueden cerrar meses anteriores al mes actual',
  MONTH_BEFORE_WALLET: 'No se puede cerrar un mes anterior al mes en que se activó la billetera',
  PREVIOUS_MONTH_OPEN: 'Debes cerrar primero el mes anterior',
  INSTALLMENTS_UNPAID: 'Hay cuotas de este mes sin pagar. Págalas antes de cerrar el mes',
  MONTH_CLOSING_ACCOUNT_PERMISSION:
    'No tienes permiso para operar sobre los cierres de mes de esta cuenta',
  INSTALLMENTS_ACCOUNT_PERMISSION: 'No tienes permiso para operar sobre las cuotas de esta cuenta',
  NO_INSTALLMENTS_DUE: 'No hay cuotas vencidas para pagar',
  INSTALLMENTS_CHANGED: 'Las cuotas a pagar cambiaron. Actualiza la lista y confirma de nuevo',
  WALLET_ACCOUNT_PERMISSION: 'No tienes permiso para operar sobre la billetera de esta cuenta',
  WALLET_ALREADY_EXISTS: 'La cuenta ya tiene una billetera',
  WALLET_NOT_FOUND: 'La cuenta no tiene una billetera',
  TOO_MANY_ATTEMPTS: 'Demasiados intentos. Intenta nuevamente en 15 minutos',
};

module.exports = { ERROR_MESSAGES };
