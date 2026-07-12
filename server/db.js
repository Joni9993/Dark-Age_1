const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function initSchema() {
    // Auto-migrate: if old email-based schema detected, wipe and recreate cleanly.
    // Safe on fresh installs (no-op when email column doesn't exist).
    await pool.query(`
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'profiles' AND column_name = 'email'
            ) THEN
                DROP TABLE IF EXISTS push_subscriptions, friendships, game_players,
                                     games, otp_tokens, profiles CASCADE;
            END IF;
        END $$;
    `);

    await pool.query(`
        CREATE EXTENSION IF NOT EXISTS citext;

        CREATE TABLE IF NOT EXISTS profiles (
            id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            username      CITEXT      UNIQUE NOT NULL,
            password_hash TEXT        NOT NULL,
            created_at    TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS games (
            id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            name         TEXT        NOT NULL,
            host_id      UUID        REFERENCES profiles(id),
            status       TEXT        NOT NULL DEFAULT 'lobby'
                             CHECK (status IN ('lobby','active','finished')),
            max_players  INT         NOT NULL DEFAULT 2,
            map_radius   INT         NOT NULL DEFAULT 7,
            team_mode    TEXT        NOT NULL DEFAULT 'ffa'
                             CHECK (team_mode IN ('ffa','diplomacy','teams2','teams3')),
            seed         INT,
            round        INT         DEFAULT 1,
            current_slot INT         DEFAULT 0,
            state_blob   TEXT,
            invite_token UUID        UNIQUE DEFAULT gen_random_uuid(),
            created_at   TIMESTAMPTZ DEFAULT NOW(),
            updated_at   TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS game_players (
            game_id    UUID    REFERENCES games(id) ON DELETE CASCADE,
            slot       INT     NOT NULL,
            profile_id UUID    REFERENCES profiles(id),
            eliminated BOOLEAN DEFAULT FALSE,
            left_game  BOOLEAN DEFAULT FALSE,
            joined_at  TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (game_id, slot),
            UNIQUE (game_id, profile_id)
        );

        ALTER TABLE game_players ADD COLUMN IF NOT EXISTS left_game BOOLEAN DEFAULT FALSE;
        ALTER TABLE games ADD COLUMN IF NOT EXISTS team_mode TEXT NOT NULL DEFAULT 'ffa';

        CREATE TABLE IF NOT EXISTS friendships (
            requester_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
            addressee_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
            status       TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','accepted')),
            created_at   TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (requester_id, addressee_id),
            CHECK (requester_id <> addressee_id)
        );

        CREATE TABLE IF NOT EXISTS push_subscriptions (
            id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
            endpoint   TEXT UNIQUE NOT NULL,
            p256dh     TEXT NOT NULL,
            auth       TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    `);
    console.log('DB schema ready.');
}

module.exports = { pool, initSchema };
