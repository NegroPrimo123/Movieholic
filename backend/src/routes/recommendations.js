const express = require('express');
const router = express.Router();
const recommendationsController = require('../controllers/recommendations');

/**
 * @swagger
 * /api/recommendations:
 *   get:
 *     summary: Получить информацию о доступных эндпоинтах
 *     tags: [Recommendations]
 *     responses:
 *       200:
 *         description: Информация о доступных эндпоинтах
 */
router.get('/', (req, res) => {
  res.json({
    message: '🎬 API рекомендаций фильмов',
    documentation: 'Посетите /api-docs для полной документации',
    endpoints: [
      {
        method: 'POST',
        path: '/recommend',
        description: 'Получить рекомендации фильмов'
      },
      {
        method: 'GET',
        path: '/options',
        description: 'Получить допустимые значения параметров'
      },
      {
        method: 'GET',
        path: '/history',
        description: 'Получить историю запросов'
      },
      {
        method: 'GET',
        path: '/stats',
        description: 'Получить статистику работы сервиса'
      }
    ]
  });
});

/**
 * @swagger
 * /api/recommendations/options:
 *   get:
 *     summary: Получить допустимые значения для всех параметров
 *     tags: [Recommendations]
 *     responses:
 *       200:
 *         description: Успешный ответ с допустимыми значениями
 */
router.get('/options', (req, res) => {
  recommendationsController.getValidOptions(req, res);
});

/**
 * @swagger
 * /api/recommendations/recommend:
 *   post:
 *     summary: Получить рекомендации фильмов по сценарию просмотра
 *     tags: [Recommendations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RecommendationRequest'
 *     responses:
 *       200:
 *         description: Успешный ответ с рекомендациями
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 recommendations:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Movie'
 *       400:
 *         description: Ошибка валидации
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/recommend', (req, res) => {
  recommendationsController.getRecommendations(req, res);
});

/**
 * @swagger
 * /api/recommendations/history:
 *   get:
 *     summary: Получить историю запросов рекомендаций
 *     tags: [History]
 *     responses:
 *       200:
 *         description: Успешный ответ с историей
 */
router.get('/history', (req, res) => {
  recommendationsController.getHistory(req, res);
});

/**
 * @swagger
 * /api/recommendations/stats:
 *   get:
 *     summary: Получить статистику работы сервиса
 *     tags: [Statistics]
 *     responses:
 *       200:
 *         description: Успешный ответ со статистикой
 */
router.get('/stats', (req, res) => {
  recommendationsController.getStats(req, res);
});

module.exports = router;