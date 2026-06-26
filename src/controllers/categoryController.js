const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// CREATE CATEGORY
exports.createCategory = async (req, res, next) => {
  try {
    const { name, color } = req.body;
    const userId = req.user.id;

    if (!name || !color) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'El nombre y color de la categoria son requeridos',
      });
    }

    const category = await prisma.category.create({
      data: {
        name,
        color,
        userId,
      },
    });

    res.status(201).json({
      success: true,
      data: category,
      message: 'Categoria creada exitosamente',
    });
  } catch (error) {
    next(error);
  }
};

// GET ALL CATEGORIES
exports.getCategories = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const categories = await prisma.category.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });

    res.status(200).json({
      success: true,
      data: categories,
      message: 'Categorías obtenidas exitosamente',
    });
  } catch (error) {
    next(error);
  }
};

// UPDATE CATEGORY
exports.updateCategory = async (req, res, next) => {
  try {
    const categoryId = parseInt(req.params.id);
    const { name, color } = req.body;
    const userId = req.user.id;

    const category = await prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Categoría no encontrada',
      });
    }

    if (category.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'No tienes permiso para modificar esta categoría',
      });
    }

    const updatedCategory = await prisma.category.update({
      where: { id: categoryId },
      data: {
        ...(name && { name }),
        ...(color && { color }),
      },
    });

    res.status(200).json({
      success: true,
      data: updatedCategory,
      message: 'Categoría actualizada exitosamente',
    });
  } catch (error) {
    next(error);
  }
};
