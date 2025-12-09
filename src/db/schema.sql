-- Voyaj Database Schema

-- Trips table
CREATE TABLE IF NOT EXISTS trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code TEXT UNIQUE NOT NULL,
  group_chat_id TEXT,
  destination TEXT,
  start_date DATE,
  end_date DATE,
  stage TEXT NOT NULL DEFAULT 'created',
  stage_entered_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  nudge_count INTEGER DEFAULT 0,
  last_nudge_at TIMESTAMP,
  all_flights_booked BOOLEAN DEFAULT FALSE,
  notes JSONB DEFAULT '[]'::jsonb -- Store unstructured ideas/notes for later reference
);

CREATE INDEX IF NOT EXISTS idx_trips_group_chat ON trips(group_chat_id);
CREATE INDEX IF NOT EXISTS idx_trips_stage ON trips(stage);
CREATE INDEX IF NOT EXISTS idx_trips_invite_code ON trips(invite_code);

-- Members table
CREATE TABLE IF NOT EXISTS members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  name TEXT,
  device_token TEXT,
  platform TEXT,
  joined_at TIMESTAMP DEFAULT NOW(),
  
  -- Constraint: One phone in one active trip at a time (free tier)
  CONSTRAINT unique_active_member UNIQUE(phone_number)
);

CREATE INDEX IF NOT EXISTS idx_members_phone ON members(phone_number);
CREATE INDEX IF NOT EXISTS idx_members_trip ON members(trip_id);

-- Votes table
CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  poll_type TEXT NOT NULL, -- 'destination', 'dates', 'activity'
  member_id UUID REFERENCES members(id) ON DELETE CASCADE,
  choice TEXT NOT NULL,
  voted_at TIMESTAMP DEFAULT NOW(),
  
  -- One vote per member per poll
  UNIQUE(trip_id, poll_type, member_id)
);

CREATE INDEX IF NOT EXISTS idx_votes_trip_poll ON votes(trip_id, poll_type);
CREATE INDEX IF NOT EXISTS idx_votes_member ON votes(member_id);

-- Flights table
CREATE TABLE IF NOT EXISTS flights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  member_id UUID REFERENCES members(id) ON DELETE CASCADE,
  airline TEXT,
  flight_number TEXT,
  departure_time TIMESTAMP,
  arrival_time TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- One flight per member per trip
  UNIQUE(trip_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_flights_trip ON flights(trip_id);
CREATE INDEX IF NOT EXISTS idx_flights_member ON flights(member_id);

-- Messages table (for context/debugging)
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  from_phone TEXT NOT NULL,
  body TEXT NOT NULL,
  group_chat_id TEXT,
  source TEXT, -- 'sms', 'ios_app', 'web'
  received_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_trip ON messages(trip_id);
CREATE INDEX IF NOT EXISTS idx_messages_received ON messages(received_at DESC);

-- Destination suggestions table
CREATE TABLE IF NOT EXISTS destination_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  member_id UUID REFERENCES members(id) ON DELETE CASCADE,
  destination TEXT NOT NULL,
  suggested_at TIMESTAMP DEFAULT NOW(),
  
  -- One suggestion per member per trip
  UNIQUE(trip_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_destination_suggestions_trip ON destination_suggestions(trip_id);

-- Date availability table
CREATE TABLE IF NOT EXISTS date_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  member_id UUID REFERENCES members(id) ON DELETE CASCADE,
  start_date DATE,
  end_date DATE,
  is_flexible BOOLEAN DEFAULT FALSE,
  submitted_at TIMESTAMP DEFAULT NOW(),
  
  -- One submission per member per trip
  UNIQUE(trip_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_date_availability_trip ON date_availability(trip_id);

-- Error logs table
CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID,
  error_message TEXT NOT NULL,
  stack_trace TEXT,
  context JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_trip ON error_logs(trip_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at DESC);




