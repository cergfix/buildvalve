import winston from "winston";

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

const filterOutErrors = winston.format((info) => {
  return info.level === "error" ? false : info;
});

export const logger = winston.createLogger({
  level: "info",
  format: jsonFormat,
  transports: [
    // info + warn → stdout (exclude errors)
    new winston.transports.Console({
      format: winston.format.combine(filterOutErrors(), jsonFormat),
    }),
    // error → stderr
    new winston.transports.Console({
      level: "error",
      format: jsonFormat,
      stderrLevels: ["error"],
    }),
  ],
});

// Stream adapter for Morgan HTTP access logging
export const morganStream = {
  write: (message: string) => {
    logger.info({ type: "access", message: message.trim() });
  },
};
