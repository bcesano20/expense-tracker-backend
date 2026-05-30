const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  try {
    // get the token from the header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'NO_TOKEN',
        message: 'Token requerido. Formato: Bearer <token>',
      });
    }

    const token = authHeader.split(' ')[1];

    // check the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // save the user in the request
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'INVALID_TOKEN',
      message: 'Token inválido o expirado',
    });
  }
};

module.exports = authMiddleware;
