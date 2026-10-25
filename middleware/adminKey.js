export function requireAdminKey(req, res, next) {
  const configured = process.env.ADMIN_PASSCODE;
  if (!configured) {
    return res.status(500).json({
      success: false,
      message: "Admin access is not configured on the server",
    });
  }

  const provided =
    req.headers["x-admin-key"] ??
    req.headers["x-admin-passcode"] ??
    req.body?.adminPasscode;

  if (!provided || String(provided) !== String(configured)) {
    return res.status(403).json({
      success: false,
      message: "Invalid admin credentials",
    });
  }

  next();
}
