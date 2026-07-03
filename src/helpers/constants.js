const ERROR_MESSAGES = {
  FIELD_REQUIRED: 'Este campo es requerido',
  REGISTER_REQUIRED_FIELDS: 'Nombre, apellido, email y contraseña son requeridos',
  LOGIN_REQUIRED_FIELDS: 'Email y contraseña requeridos',
  WEAK_PASSWORD: 'La contraseña debe tener al menos 6 caracteres',
  EMAIL_EXISTS: 'El email ya está registrado',
  INVALID_PASSWORD: 'La contraseña es incorrecta.',
  USER_NOT_FOUND: 'Usuario no encontrado',
  INCOME_CREATION: 'La cuenta, descripción, monto, fuente y fecha son requeridos',
  AMOUNT_MORE_0: 'El monto debe ser mayor a 0',
  INCOME_ACCOUNT_PERMISSION: 'No tienes permiso para operar sobre ingresos en esta cuenta',
  ACCOUNT_ID_REQUIRED: 'AccountId es requerido',
  INCOME_NOT_FOUND: 'Ingreso no encontrado',
};

module.exports = { ERROR_MESSAGES };
