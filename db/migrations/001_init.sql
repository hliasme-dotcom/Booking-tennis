-- Πλατφόρμα last-minute κρατήσεων γηπέδων: αρχικό σχήμα
CREATE TABLE clubs (
  id          serial PRIMARY KEY,
  name        text NOT NULL,
  area        text NOT NULL,
  address     text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE courts (
  id       serial PRIMARY KEY,
  club_id  int NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name     text NOT NULL,
  indoor   boolean NOT NULL DEFAULT false,
  surface  text NOT NULL DEFAULT 'hard'
);

CREATE TABLE users (
  id             serial PRIMARY KEY,
  email          text NOT NULL UNIQUE,
  name           text NOT NULL,
  phone          text NOT NULL DEFAULT '',
  password_hash  text NOT NULL,
  role           text NOT NULL DEFAULT 'player' CHECK (role IN ('player','admin')),
  atrp           numeric(3,1) CHECK (atrp IS NULL OR (atrp >= 1 AND atrp <= 7 AND atrp * 2 = round(atrp * 2))),
  available      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Ώρες που ο παίκτης δηλώνει ότι μπορεί να παίξει (ώρα Ελλάδας)
CREATE TABLE availability (
  id         serial PRIMARY KEY,
  user_id    int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday    int NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0 = Κυριακή
  start_min  int NOT NULL CHECK (start_min BETWEEN 0 AND 1440),
  end_min    int NOT NULL CHECK (end_min BETWEEN 0 AND 1440),
  CHECK (end_min > start_min)
);
CREATE INDEX availability_user ON availability(user_id);

CREATE TABLE sessions (
  token_hash  text PRIMARY KEY,
  user_id     int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL
);

-- Ένα κενό slot που δίνει ένα κλαμπ, προσφερόμενο σε 2 παίκτες
CREATE TABLE offers (
  id                       serial PRIMARY KEY,
  club_id                  int NOT NULL REFERENCES clubs(id),
  court_id                 int REFERENCES courts(id),
  starts_at                timestamptz NOT NULL,
  duration_min             int NOT NULL DEFAULT 75 CHECK (duration_min > 0),
  court_cost_cents         int NOT NULL CHECK (court_cost_cents >= 0), -- τι πληρώνουμε στο κλαμπ
  price_per_player_cents   int NOT NULL CHECK (price_per_player_cents > 0), -- τι πληρώνει κάθε παίκτης
  expires_at               timestamptz NOT NULL,
  status                   text NOT NULL DEFAULT 'open' CHECK (status IN ('open','confirmed','expired','cancelled')),
  level                    numeric(3,1), -- ATRP του πρώτου παίκτη, ορίζει το εύρος ±0,5
  note                     text NOT NULL DEFAULT '',
  created_by               int REFERENCES users(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  confirmed_at             timestamptz,
  CHECK (expires_at <= starts_at)
);
CREATE INDEX offers_status_start ON offers(status, starts_at);

CREATE TABLE offer_players (
  offer_id     int NOT NULL REFERENCES offers(id),
  user_id      int NOT NULL REFERENCES users(id),
  paid_cents   int NOT NULL,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (offer_id, user_id)
);

-- Κάθε κίνηση πορτοφολιού. Υπόλοιπο = άθροισμα. Δεν σβήνεται ποτέ τίποτα.
CREATE TABLE wallet_tx (
  id            serial PRIMARY KEY,
  user_id       int NOT NULL REFERENCES users(id),
  amount_cents  int NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('topup','charge','refund','adjust')),
  offer_id      int REFERENCES offers(id),
  note          text NOT NULL DEFAULT '',
  created_by    int REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wallet_tx_user ON wallet_tx(user_id);
