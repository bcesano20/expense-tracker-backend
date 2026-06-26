const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { ERROR_MESSAGES } = require('../helpers/constants');

const prisma = new PrismaClient();

// REGISTER
exports.register = async (req, res, next) => {
  try {
    const { name, lastName, email, password } = req.body;

    // Input validation
    if (!name || !lastName || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: ERROR_MESSAGES.REGISTER_REQUIRED_FIELDS,
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'WEAK_PASSWORD',
        message: ERROR_MESSAGES.WEAK_PASSWORD,
      });
    }

    // email existant validation
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'EMAIL_EXISTS',
        message: ERROR_MESSAGES.EMAIL_EXISTS,
      });
    }

    // password encryptation
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create User
    const user = await prisma.user.create({
      data: {
        name,
        lastName,
        email,
        password: hashedPassword,
        status: 'active',
      },
    });

    // Create JWT
    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });

    res.status(201).json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        lastName: user.lastName,
        email: user.email,
      },
      token,
      message: 'Registro exitoso',
    });
  } catch (error) {
    next(error);
  }
};

// LOGIN
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: ERROR_MESSAGES.LOGIN_REQUIRED_FIELDS,
      });
    }

    // Check user existant
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: ERROR_MESSAGES.USER_NOT_FOUND,
      });
    }

    // Validate the encrypted password
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: ERROR_MESSAGES.INVALID_PASSWORD,
      });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });

    res.status(200).json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        lastName: user.lastName,
        email: user.email,
      },
      token,
      message: 'Login exitoso',
    });
  } catch (error) {
    next(error);
  }
};

// Get User Profile
exports.getProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { accounts: true },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: ERROR_MESSAGES.USER_NOT_FOUND,
      });
    }

    res.status(200).json({
      success: true,
      data: user,
      message: 'Perfil obtenido',
    });
  } catch (error) {
    next(error);
  }
};
