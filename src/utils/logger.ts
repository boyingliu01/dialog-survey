import pino from "pino";

const isDevelopment = process.env.NODE_ENV !== "production";

// Create logger with pretty print in development, JSON in production
const logger = isDevelopment
  ? pino({
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          timestampKey: "time",
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      },
      level: process.env.LOG_LEVEL || "debug",
    })
  : pino({
      level: process.env.LOG_LEVEL || "info",
    });

export default logger;
