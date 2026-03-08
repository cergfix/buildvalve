import winston from "winston";

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

export const logger = winston.createLogger({
  level: "info",
  format: jsonFormat,
  transports: [
    new winston.transports.Console({ format: jsonFormat }),
  ],
});

// Stream adapter for Morgan HTTP access logging
export const morganStream = {
  write: (message: string) => {
    logger.info({ type: "access", message: message.trim() });
  },
};
