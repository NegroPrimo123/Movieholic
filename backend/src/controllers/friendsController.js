const database = require('../config/database');

class FriendsController {
    
    // Отправить запрос в друзья
    async sendFriendRequest(req, res) {
        try {
            const userId = req.userId;
            const { username, userId: friendId } = req.body;
            
            if (!username && !friendId) {
                return res.status(400).json({
                    success: false,
                    error: 'Укажите username или userId пользователя'
                });
            }
            
            // Находим пользователя
            let friend;
            if (friendId) {
                const result = await database.pool.query(
                    'SELECT id, username, email, full_name FROM users WHERE id = $1 AND is_active = true',
                    [friendId]
                );
                friend = result.rows[0];
            } else {
                const result = await database.pool.query(
                    'SELECT id, username, email, full_name FROM users WHERE username = $1 AND is_active = true',
                    [username]
                );
                friend = result.rows[0];
            }
            
            if (!friend) {
                return res.status(404).json({
                    success: false,
                    error: 'Пользователь не найден'
                });
            }
            
            if (friend.id === userId) {
                return res.status(400).json({
                    success: false,
                    error: 'Нельзя добавить себя в друзья'
                });
            }
            
            // Проверяем существующую дружбу
            const existingFriendship = await database.pool.query(
                `SELECT * FROM user_friends 
                 WHERE (user_id = $1 AND friend_id = $2) 
                    OR (user_id = $2 AND friend_id = $1)`,
                [userId, friend.id]
            );
            
            if (existingFriendship.rows.length > 0) {
                const friendship = existingFriendship.rows[0];
                
                if (friendship.status === 'accepted') {
                    return res.status(400).json({
                        success: false,
                        error: 'Вы уже друзья с этим пользователем'
                    });
                } else if (friendship.status === 'pending') {
                    return res.status(400).json({
                        success: false,
                        error: 'Запрос уже отправлен'
                    });
                } else if (friendship.status === 'blocked') {
                    return res.status(403).json({
                        success: false,
                        error: 'Нельзя отправить запрос этому пользователю'
                    });
                }
            }
            
            // Создаем запрос
            const result = await database.pool.query(
                `INSERT INTO user_friends (user_id, friend_id, status) 
                 VALUES ($1, $2, 'pending')
                 RETURNING id, user_id, friend_id, status, requested_at`,
                [userId, friend.id]
            );
            
            res.json({
                success: true,
                message: 'Запрос в друзья отправлен',
                request: result.rows[0],
                friend: {
                    id: friend.id,
                    username: friend.username,
                    email: friend.email,
                    full_name: friend.full_name
                }
            });
            
        } catch (error) {
            console.error('❌ Ошибка отправки запроса в друзья:', error);
            res.status(500).json({
                success: false,
                error: 'Ошибка отправки запроса в друзья'
            });
        }
    }
    
    // Принять запрос в друзья
    async acceptFriendRequest(req, res) {
        try {
            const userId = req.userId;
            const { requestId } = req.body;
            
            // Находим запрос
            const result = await database.pool.query(
                `UPDATE user_friends 
                 SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP 
                 WHERE id = $1 AND friend_id = $2 AND status = 'pending'
                 RETURNING *`,
                [requestId, userId]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Запрос не найден или уже обработан'
                });
            }
            
            res.json({
                success: true,
                message: 'Запрос в друзья принят',
                friendship: result.rows[0]
            });
            
        } catch (error) {
            console.error('❌ Ошибка принятия запроса в друзья:', error);
            res.status(500).json({
                success: false,
                error: 'Ошибка принятия запроса в друзья'
            });
        }
    }
    
    // Отклонить запрос в друзья
    async rejectFriendRequest(req, res) {
        try {
            const userId = req.userId;
            const { requestId } = req.body;
            
            const result = await database.pool.query(
                `UPDATE user_friends 
                 SET status = 'rejected'
                 WHERE id = $1 AND friend_id = $2 AND status = 'pending'
                 RETURNING *`,
                [requestId, userId]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Запрос не найден или уже обработан'
                });
            }
            
            res.json({
                success: true,
                message: 'Запрос в друзья отклонен',
                friendship: result.rows[0]
            });
            
        } catch (error) {
            console.error('❌ Ошибка отклонения запроса в друзья:', error);
            res.status(500).json({
                success: false,
                error: 'Ошибка отклонения запроса в друзья'
            });
        }
    }
    
    // Удалить из друзей
    async removeFriend(req, res) {
        try {
            const userId = req.userId;
            const { friendId } = req.params;
            
            const result = await database.pool.query(
                `DELETE FROM user_friends 
                 WHERE (user_id = $1 AND friend_id = $2) 
                    OR (user_id = $2 AND friend_id = $1)
                 RETURNING *`,
                [userId, friendId]
            );
            
            if (result.rowCount === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Друг не найден'
                });
            }
            
            // Удаляем совместные просмотры
            await database.pool.query(
                `DELETE FROM shared_movie_views 
                 WHERE (user_id = $1 AND friend_id = $2) 
                    OR (user_id = $2 AND friend_id = $1)`,
                [userId, friendId]
            );
            
            res.json({
                success: true,
                message: 'Друг удален',
                removed: result.rowCount
            });
            
        } catch (error) {
            console.error('❌ Ошибка удаления друга:', error);
            res.status(500).json({
                success: false,
                error: 'Ошибка удаления друга'
            });
        }
    }
    
    // Получить список друзей
    async getFriends(req, res) {
        try {
            const userId = req.userId;
            const { status = 'accepted', limit = 50, offset = 0 } = req.query;
            
            // Получаем друзей
            const friendsQuery = `
                SELECT 
                    uf.id as friendship_id,
                    uf.status,
                    uf.requested_at,
                    uf.accepted_at,
                    u.id as friend_id,
                    u.username,
                    u.email,
                    u.full_name,
                    u.avatar_url,
                    u.last_login,
                    COALESCE(mv.common_movies, 0) as common_movies_count
                FROM user_friends uf
                JOIN users u ON (
                    (uf.user_id = $1 AND uf.friend_id = u.id) OR
                    (uf.friend_id = $1 AND uf.user_id = u.id)
                )
                LEFT JOIN (
                    SELECT user_id, friend_id, COUNT(*) as common_movies
                    FROM shared_movie_views
                    WHERE (user_id = $1 OR friend_id = $1)
                    GROUP BY user_id, friend_id
                ) mv ON (
                    (mv.user_id = $1 AND mv.friend_id = u.id) OR
                    (mv.friend_id = $1 AND mv.user_id = u.id)
                )
                WHERE (uf.user_id = $1 OR uf.friend_id = $1)
                  AND uf.status = $2
                ORDER BY uf.accepted_at DESC NULLS LAST, uf.requested_at DESC
                LIMIT $3 OFFSET $4
            `;
            
            const friendsResult = await database.pool.query(
                friendsQuery,
                [userId, status, limit, offset]
            );
            
            // Получаем общее количество
            const countResult = await database.pool.query(
                `SELECT COUNT(*) as total 
                 FROM user_friends 
                 WHERE (user_id = $1 OR friend_id = $1) AND status = $2`,
                [userId, status]
            );
            
            res.json({
                success: true,
                friends: friendsResult.rows,
                total: parseInt(countResult.rows[0].total),
                limit: parseInt(limit),
                offset: parseInt(offset)
            });
            
        } catch (error) {
            console.error('❌ Ошибка получения списка друзей:', error);
            res.status(500).json({
                success: false,
                error: 'Ошибка получения списка друзей'
            });
        }
    }
    
    // Получить входящие запросы
    async getPendingRequests(req, res) {
        try {
            const userId = req.userId;
            
            const result = await database.pool.query(
                `SELECT 
                    uf.id as request_id,
                    uf.requested_at,
                    u.id as user_id,
                    u.username,
                    u.email,
                    u.full_name,
                    u.avatar_url
                FROM user_friends uf
                JOIN users u ON uf.user_id = u.id
                WHERE uf.friend_id = $1 AND uf.status = 'pending'
                ORDER BY uf.requested_at DESC`,
                [userId]
            );
            
            res.json({
                success: true,
                requests: result.rows,
                total: result.rowCount
            });
            
        } catch (error) {
            console.error('❌ Ошибка получения запросов в друзья:', error);
            res.status(500).json({
                success: false,
                error: 'Ошибка получения запросов в друзья'
            });
        }
    }
    
    // Получить просмотры друга
    async getFriendMovies(req, res) {
        try {
            const userId = req.userId;
            const { friendId } = req.params;
            const { limit = 20, offset = 0 } = req.query;
            
            // Проверяем дружбу
            const friendshipCheck = await database.pool.query(
                `SELECT * FROM user_friends 
                 WHERE ((user_id = $1 AND friend_id = $2) 
                    OR (user_id = $2 AND friend_id = $1))
                   AND status = 'accepted'`,
                [userId, friendId]
            );
            
            if (friendshipCheck.rows.length === 0) {
                return res.status(403).json({
                    success: false,
                    error: 'Вы не друзья с этим пользователем'
                });
            }
            
            // Получаем совместные просмотры
            const moviesQuery = `
                SELECT 
                    smv.movie_id,
                    smv.movie_title,
                    smv.movie_poster,
                    smv.watched_at,
                    smv.rating,
                    smv.comment,
                    CASE 
                        WHEN smv.user_id = $1 THEN 'я'
                        ELSE 'друг'
                    END as watched_by,
                    u.username as friend_username,
                    u.avatar_url as friend_avatar
                FROM shared_movie_views smv
                JOIN users u ON smv.friend_id = u.id
                WHERE (smv.user_id = $1 AND smv.friend_id = $2)
                   OR (smv.user_id = $2 AND smv.friend_id = $1)
                ORDER BY smv.watched_at DESC
                LIMIT $3 OFFSET $4
            `;
            
            const moviesResult = await database.pool.query(
                moviesQuery,
                [userId, friendId, limit, offset]
            );
            
            // Получаем статистику друга
            const statsQuery = `
                SELECT 
                    COUNT(DISTINCT movie_id) as total_watched,
                    AVG(rating) as avg_rating,
                    MIN(watched_at) as first_watch,
                    MAX(watched_at) as last_watch
                FROM shared_movie_views
                WHERE user_id = $1
            `;
            
            const statsResult = await database.pool.query(statsQuery, [friendId]);
            
            // Получаем информацию о друге
            const friendInfo = await database.pool.query(
                `SELECT id, username, email, full_name, avatar_url, last_login 
                 FROM users WHERE id = $1`,
                [friendId]
            );
            
            res.json({
                success: true,
                friend: friendInfo.rows[0],
                movies: moviesResult.rows,
                stats: statsResult.rows[0],
                total: moviesResult.rowCount,
                limit: parseInt(limit),
                offset: parseInt(offset)
            });
            
        } catch (error) {
            console.error('❌ Ошибка получения просмотров друга:', error);
            res.status(500).json({
                success: false,
                error: 'Ошибка получения просмотров друга'
            });
        }
    }
    
    // Добавить совместный просмотр
    async addSharedMovie(req, res) {
        try {
            const userId = req.userId;
            const { friendId, movieId, movieTitle, moviePoster, rating, comment } = req.body;
            
            // Проверяем дружбу
            const friendshipCheck = await database.pool.query(
                `SELECT * FROM user_friends 
                 WHERE ((user_id = $1 AND friend_id = $2) 
                    OR (user_id = $2 AND friend_id = $1))
                   AND status = 'accepted'`,
                [userId, friendId]
            );
            
            if (friendshipCheck.rows.length === 0) {
                return res.status(403).json({
                    success: false,
                    error: 'Вы не друзья с этим пользователем'
                });
            }
            
            // Добавляем просмотр
            const result = await database.pool.query(
                `INSERT INTO shared_movie_views 
                 (user_id, friend_id, movie_id, movie_title, movie_poster, rating, comment)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 ON CONFLICT (user_id, friend_id, movie_id) DO UPDATE SET
                    watched_at = CURRENT_TIMESTAMP,
                    rating = EXCLUDED.rating,
                    comment = EXCLUDED.comment
                 RETURNING *`,
                [userId, friendId, movieId, movieTitle, moviePoster, rating, comment]
            );
            
            res.json({
                success: true,
                message: 'Просмотр добавлен',
                movie: result.rows[0]
            });
            
        } catch (error) {
            console.error('❌ Ошибка добавления совместного просмотра:', error);
            res.status(500).json({
                success: false,
                error: 'Ошибка добавления совместного просмотра'
            });
        }
    }
    
    // Поиск пользователей
    async searchUsers(req, res) {
        try {
            const userId = req.userId;
            const { query, limit = 20, offset = 0 } = req.query;
            
            if (!query || query.trim().length < 2) {
                return res.status(400).json({
                    success: false,
                    error: 'Введите минимум 2 символа для поиска'
                });
            }
            
            const searchQuery = `
                SELECT 
                    u.id,
                    u.username,
                    u.email,
                    u.full_name,
                    u.avatar_url,
                    u.last_login,
                    u.created_at,
                    CASE 
                        WHEN f1.status IS NOT NULL THEN f1.status
                        WHEN f2.status IS NOT NULL THEN f2.status
                        ELSE 'not_friends'
                    END as friendship_status,
                    COALESCE(mv.common_movies, 0) as common_movies
                FROM users u
                LEFT JOIN user_friends f1 ON f1.user_id = $1 AND f1.friend_id = u.id
                LEFT JOIN user_friends f2 ON f2.user_id = u.id AND f2.friend_id = $1
                LEFT JOIN (
                    SELECT user_id, friend_id, COUNT(*) as common_movies
                    FROM shared_movie_views
                    WHERE (user_id = $1 OR friend_id = $1)
                    GROUP BY user_id, friend_id
                ) mv ON (
                    (mv.user_id = $1 AND mv.friend_id = u.id) OR
                    (mv.friend_id = $1 AND mv.user_id = u.id)
                )
                WHERE u.is_active = true 
                  AND u.id != $1
                  AND (
                    LOWER(u.username) LIKE LOWER($2) OR
                    LOWER(u.email) LIKE LOWER($2) OR
                    LOWER(u.full_name) LIKE LOWER($2)
                  )
                ORDER BY 
                    CASE 
                        WHEN friendship_status = 'accepted' THEN 1
                        WHEN friendship_status = 'pending' THEN 2
                        ELSE 3
                    END,
                    u.username
                LIMIT $3 OFFSET $4
            `;
            
            const searchPattern = `%${query.trim()}%`;
            const result = await database.pool.query(
                searchQuery,
                [userId, searchPattern, limit, offset]
            );
            
            res.json({
                success: true,
                users: result.rows,
                total: result.rowCount,
                limit: parseInt(limit),
                offset: parseInt(offset)
            });
            
        } catch (error) {
            console.error('❌ Ошибка поиска пользователей:', error);
            res.status(500).json({
                success: false,
                error: 'Ошибка поиска пользователей'
            });
        }
    }
    
    // Получить рекомендации на основе друзей
    async getFriendRecommendations(req, res) {
        try {
            const userId = req.userId;
            const { limit = 10 } = req.query;
            
            // Получаем фильмы, которые смотрели друзья, но не пользователь
            const recommendationsQuery = `
                SELECT 
                    smv.movie_id,
                    smv.movie_title,
                    smv.movie_poster,
                    COUNT(DISTINCT smv.friend_id) as friend_watch_count,
                    AVG(smv.rating) as avg_friend_rating,
                    ARRAY_AGG(DISTINCT u.username) as friend_usernames,
                    ARRAY_AGG(DISTINCT u.avatar_url) as friend_avatars
                FROM shared_movie_views smv
                JOIN user_friends uf ON (
                    (uf.user_id = $1 AND uf.friend_id = smv.user_id) OR
                    (uf.friend_id = $1 AND uf.user_id = smv.user_id)
                )
                JOIN users u ON smv.user_id = u.id
                WHERE uf.status = 'accepted'
                  AND smv.movie_id NOT IN (
                    SELECT movie_id 
                    FROM shared_movie_views 
                    WHERE user_id = $1
                  )
                GROUP BY smv.movie_id, smv.movie_title, smv.movie_poster
                HAVING COUNT(DISTINCT smv.friend_id) >= 1
                ORDER BY friend_watch_count DESC, avg_friend_rating DESC
                LIMIT $2
            `;
            
            const result = await database.pool.query(recommendationsQuery, [userId, limit]);
            
            res.json({
                success: true,
                recommendations: result.rows,
                total: result.rowCount,
                message: 'Фильмы, которые смотрели ваши друзья'
            });
            
        } catch (error) {
            console.error('❌ Ошибка получения рекомендаций от друзей:', error);
            res.status(500).json({
                success: false,
                error: 'Ошибка получения рекомендаций от друзей'
            });
        }
    }
}

module.exports = new FriendsController();