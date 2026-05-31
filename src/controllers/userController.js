const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// GET THE USER BY THE ID
exports.getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const authUserId = req.user.id;

    // Check permissions
    if (parseInt(id) !== authUserId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'No tienes permiso para acceder a este usuario',
      });
    }

    // Find the user and include the amounts
    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      include: { accounts: true },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Usuario no encontrado',
      });
    }

    // Not get the password
    delete user.password;

    res.status(200).json({
      success: true,
      data: user,
      message: 'Usuario obtenido',
    });
  } catch (error) {
    next(error);
  }
};

// UPDATE USER
exports.updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const authUserId = req.user.id;
    const { name, lastName, email, currentPassword, newPassword } = req.body;

    if (parseInt(id) !== authUserId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'No tienes permiso para modificar este usuario',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Usuario no encontrado',
      });
    }

    if (email && email !== user.email) {
      const existingEmail = await prisma.user.findUnique({
        where: { email },
      });

      if (existingEmail) {
        return res.status(400).json({
          success: false,
          error: 'EMAIL_EXISTS',
          message: 'El email ya está registrado',
        });
      }
    }

    const updateData = {};
    if (name) updateData.name = name;
    if (lastName) updateData.lastName = lastName;
    if (email) updateData.email = email;

    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_PASSWORD',
          message: 'Contraseña actual requerida para cambiar contraseña',
        });
      }

      const isValidPassword = await bcrypt.compare(currentPassword, user.password);

      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          error: 'INVALID_PASSWORD',
          message: 'Contraseña actual incorrecta',
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          error: 'WEAK_PASSWORD',
          message: 'La nueva contraseña debe tener al menos 6 caracteres',
        });
      }

      updateData.password = await bcrypt.hash(newPassword, 10);
    }

    const updatedUser = await prisma.user.update({
      where: { id: parseInt(id) },
      data: updateData,
    });

    delete updatedUser.password;

    res.status(200).json({
      success: true,
      data: updatedUser,
      message: 'Usuario actualizado correctamente',
    });
  } catch (error) {
    next(error);
  }
};

// DELETE THE USER
exports.deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const authUserId = req.user.id;

    if (parseInt(id) !== authUserId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'No tienes permiso para eliminar este usuario',
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Usuario no encontrado',
      });
    }

    // accounts are removed via cascade delete in DB
    await prisma.user.delete({
      where: { id: parseInt(id) },
    });

    res.status(200).json({
      success: true,
      message: 'Usuario eliminado correctamente',
    });
  } catch (error) {
    next(error);
  }
};
