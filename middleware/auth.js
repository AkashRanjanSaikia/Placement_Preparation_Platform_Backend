import jwt from "jsonwebtoken";
import User from "../models/user.js";

function getBearerToken(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }
  return header.slice(7).trim();
}

export async function requireAuth(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({
        success: false,
        message: "Authentication is not configured on the server",
      });
    }

    let payload;
    try {
      payload = jwt.verify(token, secret);
    } catch {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    const userId = payload?.sub;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }

    const user = await User.findById(userId).select("_id name email");
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    req.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
    };
    next();
  } catch (err) {
    next(err);
  }
}

export async function optionalAuth(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      req.user = null;
      return next();
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      req.user = null;
      return next();
    }

    try {
      const payload = jwt.verify(token, secret);
      const userId = payload?.sub;
      if (!userId) {
        req.user = null;
        return next();
      }

      const user = await User.findById(userId).select("_id name email");
      req.user = user
        ? {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
          }
        : null;
    } catch {
      req.user = null;
    }

    next();
  } catch (err) {
    next(err);
  }
}
