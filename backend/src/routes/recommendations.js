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
    version: '1.0.0',
    documentation: 'Посетите /api-docs для полной документации',
    endpoints: [
      {
        method: 'POST',
        path: '/recommend',
        description: 'Получить рекомендации фильмов по сценарию'
      },
      {
        method: 'GET',
        path: '/options',
        description: 'Получить допустимые значения параметров'
      },
      {
        method: 'GET',
        path: '/history',
        description: 'Получить историю запросов (реальную из БД)'
      },
      {
        method: 'GET',
        path: '/stats',
        description: 'Получить статистику работы сервиса (реальную из БД)'
      },
      {
        method: 'GET',
        path: '/db-test',
        description: 'Проверить подключение к базе данных'
      }
    ],
    note: 'Для истории укажите заголовок X-User-ID для идентификации пользователя'
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
 *     summary: Получить историю запросов рекомендаций (реальные данные из БД)
 *     tags: [History]
 *     parameters:
 *       - in: header
 *         name: X-User-ID
 *         schema:
 *           type: string
 *         description: Идентификатор пользователя (опционально)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Количество записей
 *     responses:
 *       200:
 *         description: Успешный ответ с историей
 *       500:
 *         description: Ошибка базы данных
 */
router.get('/history', (req, res) => {
  recommendationsController.getHistory(req, res);
});

/**
 * @swagger
 * /api/recommendations/stats:
 *   get:
 *     summary: Получить статистику работы сервиса (реальные данные из БД)
 *     tags: [Statistics]
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *         description: За какой период считать статистику (в днях)
 *     responses:
 *       200:
 *         description: Успешный ответ со статистикой
 */
router.get('/stats', (req, res) => {
  recommendationsController.getStats(req, res);
});

/**
 * @swagger
 * /api/recommendations/db-test:
 *   get:
 *     summary: Проверить подключение к базе данных
 *     tags: [Statistics]
 *     responses:
 *       200:
 *         description: Результат проверки подключения
 */
router.get('/db-test', (req, res) => {
  recommendationsController.testDatabase(req, res);
});

module.exports = router;