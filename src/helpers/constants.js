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
  UNSUPORTED_UPDATE_OPERATION_CARD:
    'No se puede cambiar el método de pago de o hacia cuotas con tarjeta de crédito',
  UNSUPORTED_UPDATE_OPERATION: 'No se puede cambiar el método de pago de este gasto',
  UNSUPORTED_UPDATE_CREDIT_CARD:
    'No se puede cambiar el método de pago de un gasto con tarjeta de crédito',
  DELETE_EXPENSE_CREATE_AGAIN: 'Para cambiar de tarjeta elimina el gasto y créalo de nuevo',
  CARD_NOT_FOUND: 'Tarjeta no encontrada o no pertenece a esta cuenta',
  CREDIT_CARD_NOT_UPDATAED: 'No se puede cambiar a tarjeta de crédito desde otro método de pago',
};

module.exports = { ERROR_MESSAGES };
