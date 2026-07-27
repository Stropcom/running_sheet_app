CREATE TABLE `person_detections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`attachmentId` int NOT NULL,
	`entityLinkId` int NOT NULL,
	`bboxX0` double NOT NULL,
	`bboxY0` double NOT NULL,
	`bboxX1` double NOT NULL,
	`bboxY1` double NOT NULL,
	`landmarks` text NOT NULL,
	`embedding` text NOT NULL,
	`detectionConfidence` double NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `person_detections_id` PRIMARY KEY(`id`)
);
