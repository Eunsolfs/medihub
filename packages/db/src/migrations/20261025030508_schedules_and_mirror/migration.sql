CREATE TABLE `archive_schedule` (
	`id` text PRIMARY KEY,
	`organization_id` text NOT NULL,
	`created_by` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`frequency` text DEFAULT 'monthly' NOT NULL,
	`hour` integer DEFAULT 3 NOT NULL,
	`weekday` integer DEFAULT 1 NOT NULL,
	`day_of_month` integer DEFAULT 1 NOT NULL,
	`before_days` integer DEFAULT 730 NOT NULL,
	`chunk_bytes` integer DEFAULT 209715200 NOT NULL,
	`target_id` text NOT NULL,
	`delete_source` integer DEFAULT true NOT NULL,
	`last_run_at` integer,
	`next_run_at` integer,
	`last_job_id` text,
	`last_error` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_archive_schedule_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_archive_schedule_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `mirror_job` (
	`id` text PRIMARY KEY,
	`organization_id` text,
	`requested_by` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`include_assets` integer DEFAULT false NOT NULL,
	`target_id` text NOT NULL,
	`storage_prefix` text NOT NULL,
	`db_key` text,
	`manifest_key` text,
	`asset_count` integer DEFAULT 0 NOT NULL,
	`byte_size` integer DEFAULT 0 NOT NULL,
	`error` text,
	`completed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_mirror_job_organization_id_organization_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_mirror_job_requested_by_user_id_fk` FOREIGN KEY (`requested_by`) REFERENCES `user`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX `archive_schedule_org_idx` ON `archive_schedule` (`organization_id`,`enabled`);--> statement-breakpoint
CREATE INDEX `archive_schedule_next_idx` ON `archive_schedule` (`enabled`,`next_run_at`);--> statement-breakpoint
CREATE INDEX `mirror_job_created_idx` ON `mirror_job` (`created_at`);