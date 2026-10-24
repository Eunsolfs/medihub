CREATE TABLE `account` (
	`access_token` text,
	`access_token_expires_at` integer,
	`account_id` text NOT NULL,
	`id` text PRIMARY KEY,
	`id_token` text,
	`password` text,
	`provider_id` text NOT NULL,
	`refresh_token` text,
	`refresh_token_expires_at` integer,
	`scope` text,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_account_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `session` (
	`expires_at` integer NOT NULL,
	`id` text PRIMARY KEY,
	`ip_address` text,
	`token` text NOT NULL UNIQUE,
	`user_agent` text,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_session_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `user` (
	`email` text NOT NULL UNIQUE,
	`email_verified` integer DEFAULT false NOT NULL,
	`id` text PRIMARY KEY,
	`image` text,
	`name` text NOT NULL,
	`role` text DEFAULT 'individual' NOT NULL,
	`organization_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`title` text,
	`phone` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_user_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`expires_at` integer NOT NULL,
	`id` text PRIMARY KEY,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `asset` (
	`id` text PRIMARY KEY,
	`organization_id` text NOT NULL,
	`kind` text NOT NULL,
	`mime_type` text NOT NULL,
	`original_name` text NOT NULL,
	`byte_size` integer NOT NULL,
	`checksum` text NOT NULL,
	`storage_target_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`width` integer,
	`height` integer,
	`duration_ms` integer,
	`captured_at` integer,
	`stage` text,
	`body_part` text,
	`description` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`visibility` text DEFAULT 'org' NOT NULL,
	`patient_id` text,
	`admission_id` text,
	`collection_id` text,
	`session_id` text,
	`post_id` text,
	`owner_id` text NOT NULL,
	`timeline_order` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_asset_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_asset_patient_id_patient_id_fk` FOREIGN KEY (`patient_id`) REFERENCES `patient`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_asset_admission_id_admission_id_fk` FOREIGN KEY (`admission_id`) REFERENCES `admission`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_asset_collection_id_collection_id_fk` FOREIGN KEY (`collection_id`) REFERENCES `collection`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_asset_session_id_learning_session_id_fk` FOREIGN KEY (`session_id`) REFERENCES `learning_session`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_asset_post_id_post_id_fk` FOREIGN KEY (`post_id`) REFERENCES `post`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_asset_owner_id_user_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT "asset_byte_size_positive" CHECK("byte_size" > 0)
);
--> statement-breakpoint
CREATE TABLE `collection` (
	`id` text PRIMARY KEY,
	`organization_id` text NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`description` text,
	`visibility` text DEFAULT 'org' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_collection_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_collection_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT "collection_name_length" CHECK(length(trim("name")) between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE `post` (
	`id` text PRIMARY KEY,
	`organization_id` text NOT NULL,
	`author_id` text NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`excerpt` text,
	`content` text DEFAULT '' NOT NULL,
	`cover_asset_id` text,
	`visibility` text DEFAULT 'org' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` integer,
	`tags` text DEFAULT '[]' NOT NULL,
	`view_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_post_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_post_author_id_user_id_fk` FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `post_media` (
	`id` text PRIMARY KEY,
	`post_id` text NOT NULL,
	`kind` text DEFAULT 'video' NOT NULL,
	`provider` text DEFAULT 'asset' NOT NULL,
	`asset_id` text,
	`url` text,
	`title` text,
	`duration_seconds` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_post_media_post_id_post_id_fk` FOREIGN KEY (`post_id`) REFERENCES `post`(`id`) ON DELETE CASCADE,
	CONSTRAINT "post_media_source" CHECK(("provider" = 'asset' and "asset_id" is not null)
        or ("provider" in ('bilibili', 'external') and "url" is not null))
);
--> statement-breakpoint
CREATE TABLE `learning_session` (
	`id` text PRIMARY KEY,
	`organization_id` text NOT NULL,
	`title` text NOT NULL,
	`kind` text DEFAULT 'lecture' NOT NULL,
	`held_at` integer NOT NULL,
	`location` text,
	`speaker` text,
	`description` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_learning_session_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_learning_session_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT "learning_session_title_length" CHECK(length(trim("title")) between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE `organization` (
	`id` text PRIMARY KEY,
	`code` text NOT NULL,
	`kind` text DEFAULT 'department' NOT NULL,
	`description` text,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `admission` (
	`id` text PRIMARY KEY,
	`organization_id` text NOT NULL,
	`patient_id` text NOT NULL,
	`kind` text DEFAULT 'inpatient' NOT NULL,
	`admission_no` text,
	`admitted_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`discharged_at` integer,
	`department` text,
	`attending_doctor` text,
	`diagnosis` text,
	`chief_complaint` text,
	`treatment` text,
	`notes` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_admission_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_admission_patient_id_patient_id_fk` FOREIGN KEY (`patient_id`) REFERENCES `patient`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_admission_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT "admission_discharge_order" CHECK("discharged_at" is null or "discharged_at" >= "admitted_at")
);
--> statement-breakpoint
CREATE TABLE `patient` (
	`id` text PRIMARY KEY,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`gender` text DEFAULT 'unknown' NOT NULL,
	`birth_date` integer,
	`medical_record_no` text,
	`id_card_no` text,
	`phone` text,
	`summary` text,
	`notes` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_patient_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_patient_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT "patient_name_length" CHECK(length(trim("name")) between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY,
	`organization_id` text,
	`actor_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`detail` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_audit_log_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_audit_log_actor_id_user_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `export_job` (
	`id` text PRIMARY KEY,
	`organization_id` text NOT NULL,
	`requested_by` text NOT NULL,
	`kind` text NOT NULL,
	`params` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`file_name` text,
	`storage_target_id` text,
	`storage_key` text,
	`byte_size` integer,
	`asset_count` integer,
	`error` text,
	`completed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_export_job_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_export_job_requested_by_user_id_fk` FOREIGN KEY (`requested_by`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `storage_target` (
	`id` text PRIMARY KEY,
	`organization_id` text,
	`name` text NOT NULL,
	`driver` text NOT NULL,
	`config` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_storage_target_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_storage_target_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE SET NULL,
	CONSTRAINT "storage_target_config_present" CHECK(length("config") > 0)
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_organization_idx` ON `user` (`organization_id`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE INDEX `asset_organization_idx` ON `asset` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `asset_patient_idx` ON `asset` (`patient_id`,`captured_at`);--> statement-breakpoint
CREATE INDEX `asset_admission_idx` ON `asset` (`admission_id`,`captured_at`);--> statement-breakpoint
CREATE INDEX `asset_collection_idx` ON `asset` (`collection_id`);--> statement-breakpoint
CREATE INDEX `asset_session_idx` ON `asset` (`session_id`);--> statement-breakpoint
CREATE INDEX `asset_post_idx` ON `asset` (`post_id`);--> statement-breakpoint
CREATE INDEX `asset_checksum_idx` ON `asset` (`organization_id`,`checksum`);--> statement-breakpoint
CREATE INDEX `collection_organization_idx` ON `collection` (`organization_id`,`parent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `post_slug_unique` ON `post` (`slug`);--> statement-breakpoint
CREATE INDEX `post_organization_idx` ON `post` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `post_author_idx` ON `post` (`author_id`);--> statement-breakpoint
CREATE INDEX `post_media_post_idx` ON `post_media` (`post_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `learning_session_organization_idx` ON `learning_session` (`organization_id`,`held_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_code_unique` ON `organization` (`code`);--> statement-breakpoint
CREATE INDEX `admission_patient_idx` ON `admission` (`patient_id`,`admitted_at`);--> statement-breakpoint
CREATE INDEX `admission_organization_idx` ON `admission` (`organization_id`,`admitted_at`);--> statement-breakpoint
CREATE INDEX `patient_organization_idx` ON `patient` (`organization_id`);--> statement-breakpoint
CREATE INDEX `patient_organization_name_idx` ON `patient` (`organization_id`,`name`);--> statement-breakpoint
CREATE INDEX `patient_medical_record_no_idx` ON `patient` (`organization_id`,`medical_record_no`);--> statement-breakpoint
CREATE INDEX `audit_log_organization_idx` ON `audit_log` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_log_actor_idx` ON `audit_log` (`actor_id`);--> statement-breakpoint
CREATE INDEX `export_job_organization_idx` ON `export_job` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `export_job_requester_idx` ON `export_job` (`requested_by`);--> statement-breakpoint
CREATE INDEX `storage_target_organization_idx` ON `storage_target` (`organization_id`);