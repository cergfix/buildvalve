import winston from "winston";
import path from "node:path";
import fs from "node:fs";

// Ensure logs directory exists
const logDir = path.resolve(process.cwd(), "logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

export const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: process.env.NODE_ENV === "production"
        ? winston.format.combine(winston.format.timestamp(), winston.format.json())
        : winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
    new winston.transports.File({ filename: path.join(logDir, "error.log"), level: "error" }),
    new winston.transports.File({ filename: path.join(logDir, "audit.log") }),
  ],
});

// Stream adapter for Morgan HTTP access logging
export const morganStream = {
  write: (message: string) => {
    logger.info(message.trim(), { type: "access" });
  },
};
