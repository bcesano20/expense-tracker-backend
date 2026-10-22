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
  AMOUNT_MORE_0: 'El monto debe ser mayor a 0',
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
  UNSUPORTED_UPDATE_OPERATION: 'No se puede cambiar el método de pago de este gasto',
  UNSUPORTED_UPDATE_CREDIT_CARD:
    'No se puede cambiar el método de pago de un gasto con tarjeta de crédito',
  DELETE_EXPENSE_CREATE_AGAIN: 'Para cambiar de tarjeta elimina el gasto y créalo de nuevo',
  CARD_NOT_FOUND: 'Tarjeta no encontrada o no pertenece a esta cuenta',
  CREDIT_CARD_NOT_UPDATAED:
    'No se puede cambiar a tarjeta de crédito desde otro método de pago. Por favor elimine este gasto y vuelva a crearlo como uno de crédito',
  CARD_CANCELLED: 'La tarjeta está cancelada y no se pueden registrar nuevos gastos con ella',
  CARD_CANCEL_SUCCESS: 'Tarjeta cancelada correctamente',
  TOO_MANY_ATTEMPTS: 'Demasiados intentos. Intenta nuevamente en 15 minutos',
};

module.exports = { ERROR_MESSAGES };
