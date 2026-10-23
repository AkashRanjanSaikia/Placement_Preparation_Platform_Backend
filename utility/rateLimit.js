const buckets = new Map();

/**
 * @param {string} key
 * @param {{ windowMs: number, max: number }} options
 * @returns {boolean} true if allowed, false if over limit
 */
export function consumeRateLimit(key, { windowMs, max }) {
  const now = Date.now();
  let entry = buckets.get(key);
  if (!entry || now - entry.windowStart >= windowMs) {
    entry = { windowStart: now, count: 0 };
    buckets.set(key, entry);
  }
  entry.count += 1;
  return entry.count <= max;
}

export function rateLimitMiddleware({ windowMs, max, keyGenerator, message }) {
  const defaultMessage =
    message ?? "Too many requests. Please wait a moment and try again.";

  return (req, res, next) => {
    const key = keyGenerator(req);
    if (!key) {
      return next();
    }
    if (!consumeRateLimit(key, { windowMs, max })) {
      return res.status(429).json({
        success: false,
        message: defaultMessage,
      });
    }
    next();
  };
}
