CREATE TABLE `content_audience` (
	`id` text PRIMARY KEY,
	`content_type` text NOT NULL,
	`content_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT "content_audience_target_distinct" CHECK(length("target_id") > 0)
);
--> statement-breakpoint
CREATE INDEX `content_audience_content_idx` ON `content_audience` (`content_type`,`content_id`);--> statement-breakpoint
CREATE INDEX `content_audience_target_idx` ON `content_audience` (`target_type`,`target_id`);