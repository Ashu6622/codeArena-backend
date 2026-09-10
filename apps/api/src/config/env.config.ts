export const envConfig = () => ({
  nodeEnv: process.env.NODE_ENV,
  port: Number(process.env.PORT),
  database: {
    url: process.env.DATABASE_URL,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
  },
  execution: {
    timeoutMs: Number(process.env.EXECUTION_TIMEOUT_MS),
    memoryLimitMb: Number(process.env.EXECUTION_MEMORY_LIMIT_MB),
    cpuLimit: Number(process.env.EXECUTION_CPU_LIMIT),
    pidsLimit: Number(process.env.EXECUTION_PIDS_LIMIT),
    maxOutputBytes: Number(process.env.EXECUTION_MAX_OUTPUT_BYTES),
  },
});
