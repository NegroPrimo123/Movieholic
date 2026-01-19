const express = require('express');
const router = express.Router();
const friendsController = require('../controllers/friendsController');
const authMiddleware = require('../middleware/authMiddleware');

/**
 * @swagger
 * tags:
 *   name: Friends
 *   description: Управление друзьями и совместными просмотрами
 */

/**
 * @swagger
 * /api/friends/search:
 *   get:
 *     summary: Поиск пользователей
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Поисковый запрос (username, email, имя)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Количество результатов
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Смещение
 *     responses:
 *       200:
 *         description: Список найденных пользователей
 */
router.get('/search', authMiddleware.authenticate, friendsController.searchUsers);

/**
 * @swagger
 * /api/friends/requests:
 *   get:
 *     summary: Получить входящие запросы в друзья
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список входящих запросов
 */
router.get('/requests', authMiddleware.authenticate, friendsController.getPendingRequests);

/**
 * @swagger
 * /api/friends:
 *   get:
 *     summary: Получить список друзей
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [accepted, pending, rejected]
 *           default: accepted
 *         description: Статус дружбы
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Количество друзей
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Смещение
 *     responses:
 *       200:
 *         description: Список друзей
 */
router.get('/', authMiddleware.authenticate, friendsController.getFriends);

/**
 * @swagger
 * /api/friends/send:
 *   post:
 *     summary: Отправить запрос в друзья
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 description: Username пользователя
 *               userId:
 *                 type: integer
 *                 description: ID пользователя
 *     responses:
 *       200:
 *         description: Запрос отправлен
 */
router.post('/send', authMiddleware.authenticate, friendsController.sendFriendRequest);

/**
 * @swagger
 * /api/friends/accept:
 *   post:
 *     summary: Принять запрос в друзья
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               requestId:
 *                 type: integer
 *                 description: ID запроса
 *     responses:
 *       200:
 *         description: Запрос принят
 */
router.post('/accept', authMiddleware.authenticate, friendsController.acceptFriendRequest);

/**
 * @swagger
 * /api/friends/reject:
 *   post:
 *     summary: Отклонить запрос в друзья
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               requestId:
 *                 type: integer
 *                 description: ID запроса
 *     responses:
 *       200:
 *         description: Запрос отклонен
 */
router.post('/reject', authMiddleware.authenticate, friendsController.rejectFriendRequest);

/**
 * @swagger
 * /api/friends/{friendId}:
 *   delete:
 *     summary: Удалить из друзей
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: friendId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID друга
 *     responses:
 *       200:
 *         description: Друг удален
 */
router.delete('/:friendId', authMiddleware.authenticate, friendsController.removeFriend);

/**
 * @swagger
 * /api/friends/{friendId}/movies:
 *   get:
 *     summary: Получить просмотры друга
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: friendId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID друга
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Количество фильмов
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Смещение
 *     responses:
 *       200:
 *         description: Список просмотренных фильмов друга
 */
router.get('/:friendId/movies', authMiddleware.authenticate, friendsController.getFriendMovies);

/**
 * @swagger
 * /api/friends/movies/share:
 *   post:
 *     summary: Добавить совместный просмотр
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - friendId
 *               - movieId
 *               - movieTitle
 *             properties:
 *               friendId:
 *                 type: integer
 *               movieId:
 *                 type: integer
 *               movieTitle:
 *                 type: string
 *               moviePoster:
 *                 type: string
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 10
 *               comment:
 *                 type: string
 *     responses:
 *       200:
 *         description: Просмотр добавлен
 */
router.post('/movies/share', authMiddleware.authenticate, friendsController.addSharedMovie);

/**
 * @swagger
 * /api/friends/recommendations:
 *   get:
 *     summary: Получить рекомендации от друзей
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Количество рекомендаций
 *     responses:
 *       200:
 *         description: Рекомендации на основе просмотров друзей
 */
router.get('/recommendations', authMiddleware.authenticate, friendsController.getFriendRecommendations);

module.exports = router;