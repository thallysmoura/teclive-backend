--
-- PostgreSQL database dump
--

\restrict dBwbjeEzsAPWjNfbWoaNH5WYCfWqP1UimqIPrdbD0h5pDD2HM5jgkGa7UvYpQJ3

-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: Role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Role" AS ENUM (
    'ADMIN',
    'USER'
);


--
-- Name: UserStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."UserStatus" AS ENUM (
    'ACTIVE',
    'PENDING'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Name: access_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.access_logs (
    id text NOT NULL,
    "userId" text,
    "userName" character varying(100) NOT NULL,
    "userEmail" character varying(254) NOT NULL,
    device character varying(16) NOT NULL,
    "userAgent" character varying(512),
    ip character varying(64),
    "locationStatus" character varying(20) DEFAULT 'not_requested'::character varying NOT NULL,
    latitude double precision,
    longitude double precision,
    accuracy double precision,
    city character varying(160),
    region character varying(160),
    country character varying(2),
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "avatarUrl" text,
    status character varying(16) DEFAULT 'VALID'::character varying NOT NULL,
    CONSTRAINT access_logs_location_check CHECK ((((("locationStatus")::text = 'shared'::text) AND (latitude IS NOT NULL) AND (longitude IS NOT NULL) AND ((latitude >= ('-90'::integer)::double precision) AND (latitude <= (90)::double precision)) AND ((longitude >= ('-180'::integer)::double precision) AND (longitude <= (180)::double precision))) OR ((("locationStatus")::text = ANY ((ARRAY['not_requested'::character varying, 'denied'::character varying, 'unavailable'::character varying])::text[])) AND (latitude IS NULL) AND (longitude IS NULL) AND (accuracy IS NULL)))),
    CONSTRAINT access_logs_status_check CHECK (((status)::text = ANY ((ARRAY['VALID'::character varying, 'INVALID'::character varying])::text[])))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id text NOT NULL,
    "userId" text NOT NULL,
    title character varying(160) NOT NULL,
    message text NOT NULL,
    data jsonb,
    "readAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id text NOT NULL,
    "userId" text NOT NULL,
    "tokenHash" text NOT NULL,
    remember boolean DEFAULT false NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "revokedAt" timestamp(3) without time zone,
    "replacedBy" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: sidebar_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sidebar_items (
    key text NOT NULL,
    label character varying(80) NOT NULL,
    href text,
    section character varying(16) DEFAULT 'main'::character varying NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "embedUrl" text,
    "parentKey" text,
    "createdById" text
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id text NOT NULL,
    email text NOT NULL,
    "passwordHash" text NOT NULL,
    name text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    permissions text[] DEFAULT ARRAY[]::text[],
    role public."Role" DEFAULT 'USER'::public."Role" NOT NULL,
    status public."UserStatus" DEFAULT 'ACTIVE'::public."UserStatus" NOT NULL,
    "avatarUrl" text,
    "lastDevice" text,
    "lastLoginAt" timestamp(3) without time zone,
    "lastSeenAt" timestamp(3) without time zone
);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: access_logs access_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_logs
    ADD CONSTRAINT access_logs_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: sidebar_items sidebar_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sidebar_items
    ADD CONSTRAINT sidebar_items_pkey PRIMARY KEY (key);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: access_logs_createdAt_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "access_logs_createdAt_id_idx" ON public.access_logs USING btree ("createdAt" DESC, id);


--
-- Name: access_logs_userId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "access_logs_userId_createdAt_idx" ON public.access_logs USING btree ("userId", "createdAt" DESC);


--
-- Name: notifications_userId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notifications_userId_createdAt_idx" ON public.notifications USING btree ("userId", "createdAt" DESC);


--
-- Name: notifications_userId_readAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notifications_userId_readAt_idx" ON public.notifications USING btree ("userId", "readAt");


--
-- Name: refresh_tokens_tokenHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON public.refresh_tokens USING btree ("tokenHash");


--
-- Name: refresh_tokens_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "refresh_tokens_userId_idx" ON public.refresh_tokens USING btree ("userId");


--
-- Name: sidebar_items_createdById_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sidebar_items_createdById_idx" ON public.sidebar_items USING btree ("createdById");


--
-- Name: sidebar_items_href_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX sidebar_items_href_key ON public.sidebar_items USING btree (href);


--
-- Name: sidebar_items_parentKey_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sidebar_items_parentKey_idx" ON public.sidebar_items USING btree ("parentKey");


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
-- Name: access_logs access_logs_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.access_logs
    ADD CONSTRAINT "access_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: notifications notifications_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: sidebar_items sidebar_items_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sidebar_items
    ADD CONSTRAINT "sidebar_items_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: sidebar_items sidebar_items_parentKey_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sidebar_items
    ADD CONSTRAINT "sidebar_items_parentKey_fkey" FOREIGN KEY ("parentKey") REFERENCES public.sidebar_items(key) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict dBwbjeEzsAPWjNfbWoaNH5WYCfWqP1UimqIPrdbD0h5pDD2HM5jgkGa7UvYpQJ3
