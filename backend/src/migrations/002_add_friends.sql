-- Таблица друзей
CREATE TABLE IF NOT EXISTS user_friends (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'rejected', 'blocked'
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP WITH TIME ZONE,
    
    UNIQUE(user_id, friend_id),
    CONSTRAINT check_not_self_friend CHECK (user_id != friend_id),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'accepted', 'rejected', 'blocked'))
);

-- Таблица для совместных просмотров
CREATE TABLE IF NOT EXISTS shared_movie_views (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    movie_id INTEGER NOT NULL,
    movie_title VARCHAR(255) NOT NULL,
    movie_poster TEXT,
    watched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    rating INTEGER CHECK (rating >= 1 AND rating <= 10),
    comment TEXT,
    
    UNIQUE(user_id, friend_id, movie_id)
);

-- Индексы для оптимизации
CREATE INDEX IF NOT EXISTS idx_friends_user_id ON user_friends(user_id);
CREATE INDEX IF NOT EXISTS idx_friends_friend_id ON user_friends(friend_id);
CREATE INDEX IF NOT EXISTS idx_friends_status ON user_friends(status);
CREATE INDEX IF NOT EXISTS idx_friends_user_friend ON user_friends(user_id, friend_id);
CREATE INDEX IF NOT EXISTS idx_shared_views_user_id ON shared_movie_views(user_id);
CREATE INDEX IF NOT EXISTS idx_shared_views_friend_id ON shared_movie_views(friend_id);
CREATE INDEX IF NOT EXISTS idx_shared_views_movie_id ON shared_movie_views(movie_id);

-- Представление для удобного получения списка друзей
CREATE OR REPLACE VIEW vw_user_friends AS
SELECT 
    uf.id as friendship_id,
    uf.user_id,
    uf.friend_id,
    uf.status,
    uf.requested_at,
    uf.accepted_at,
    u.username as friend_username,
    u.email as friend_email,
    u.full_name as friend_full_name,
    u.avatar_url as friend_avatar
FROM user_friends uf
JOIN users u ON uf.friend_id = u.id
WHERE uf.status = 'accepted';

-- Представление для получения взаимных друзей
CREATE OR REPLACE VIEW vw_mutual_friends AS
SELECT 
    f1.user_id as user_id,
    f1.friend_id as mutual_friend_id,
    u.username as mutual_friend_username,
    u.full_name as mutual_friend_name,
    u.avatar_url as mutual_friend_avatar
FROM user_friends f1
JOIN user_friends f2 ON f1.friend_id = f2.friend_id AND f2.user_id = f1.user_id
JOIN users u ON f1.friend_id = u.id
WHERE f1.status = 'accepted' 
  AND f2.status = 'accepted'
  AND f1.user_id != f1.friend_id;

-- Функция для получения общих просмотров
CREATE OR REPLACE FUNCTION get_common_movies(user1_id INTEGER, user2_id INTEGER)
RETURNS TABLE(
    movie_id INTEGER,
    movie_title VARCHAR,
    movie_poster TEXT,
    user1_watched_at TIMESTAMP WITH TIME ZONE,
    user2_watched_at TIMESTAMP WITH TIME ZONE,
    user1_rating INTEGER,
    user2_rating INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        smv1.movie_id,
        smv1.movie_title,
        smv1.movie_poster,
        smv1.watched_at as user1_watched_at,
        smv2.watched_at as user2_watched_at,
        smv1.rating as user1_rating,
        smv2.rating as user2_rating
    FROM shared_movie_views smv1
    JOIN shared_movie_views smv2 ON smv1.movie_id = smv2.movie_id
    WHERE smv1.user_id = user1_id 
      AND smv2.user_id = user2_id
      AND smv1.friend_id = user2_id
      AND smv2.friend_id = user1_id
    ORDER BY GREATEST(smv1.watched_at, smv2.watched_at) DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE user_friends IS 'Система друзей пользователей';
COMMENT ON TABLE shared_movie_views IS 'История совместных просмотров фильмов';