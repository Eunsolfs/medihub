CREATE TABLE `app_setting` (
	`key` text PRIMARY KEY,
	`value` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `archive_job` (
	`id` text PRIMARY KEY,
	`organization_id` text NOT NULL,
	`requested_by` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`before_at` integer NOT NULL,
	`chunk_bytes` integer NOT NULL,
	`chunks` text DEFAULT '[]' NOT NULL,
	`chunk_count` integer DEFAULT 0 NOT NULL,
	`asset_count` integer DEFAULT 0 NOT NULL,
	`byte_size` integer DEFAULT 0 NOT NULL,
	`storage_target_id` text NOT NULL,
	`storage_prefix` text NOT NULL,
	`delete_source` integer DEFAULT false NOT NULL,
	`error` text,
	`completed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_archive_job_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_archive_job_requested_by_user_id_fk` FOREIGN KEY (`requested_by`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `asset` ADD `archived_at` integer;--> statement-breakpoint
ALTER TABLE `asset` ADD `archive_id` text;--> statement-breakpoint
ALTER TABLE `organization` ADD `quota_bytes` integer;--> statement-breakpoint
CREATE INDEX `archive_job_organization_idx` ON `archive_job` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `archive_job_status_idx` ON `archive_job` (`status`);