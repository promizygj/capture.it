process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://qa:qa@localhost:5440/qa_platform_test';
process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret';
process.env.STORAGE_DIR = './storage-test';
process.env.REDIS_URL ??= 'redis://localhost:6390';
